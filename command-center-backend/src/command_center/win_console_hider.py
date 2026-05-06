"""
Suprime janelas CMD criadas por subprocessos do Claude (CLI ou Command Center).

Dois modos:

- **Embedded** (padrão): `start_console_hider()` chamado no startup do backend.
  Hides apenas janelas de descendentes do PID atual.

- **Daemon global**: rodar via `python -m command_center.win_console_hider`.
  Hides janelas de QUALQUER claude.exe (ou cmd.exe descendente) na máquina —
  pega pop-ups quando usuário usa Claude Code CLI, não só o Command Center.

Hook escuta tanto EVENT_OBJECT_CREATE quanto EVENT_OBJECT_SHOW para esconder
o mais cedo possível (reduz flash). Janelas terminais explicitamente abertas
(Git Bash, PowerShell, Terminal) NÃO são afetadas — só consoles de claude.exe
e descendentes.
"""
from __future__ import annotations

import argparse
import ctypes
import ctypes.wintypes as wt
import os
import sys
import threading

import structlog

log = structlog.get_logger(__name__)

# ── Windows API constants ────────────────────────────────────────────────────

TH32CS_SNAPPROCESS = 0x00000002
EVENT_OBJECT_CREATE = 0x8000
EVENT_OBJECT_SHOW = 0x8002
WINEVENT_OUTOFCONTEXT = 0x0000
OBJID_WINDOW = 0
SW_HIDE = 0
PROCESS_QUERY_LIMITED_INFORMATION = 0x1000


# ── PROCESSENTRY32W struct ───────────────────────────────────────────────────

class PROCESSENTRY32W(ctypes.Structure):
    _fields_ = [
        ("dwSize",              wt.DWORD),
        ("cntUsage",            wt.DWORD),
        ("th32ProcessID",       wt.DWORD),
        ("th32DefaultHeapID",   ctypes.c_size_t),
        ("th32ModuleID",        wt.DWORD),
        ("cntThreads",          wt.DWORD),
        ("th32ParentProcessID", wt.DWORD),
        ("pcPriClassBase",      ctypes.c_long),
        ("dwFlags",             wt.DWORD),
        ("szExeFile",           ctypes.c_wchar * 260),
    ]


# ── Process introspection ────────────────────────────────────────────────────

def _build_parent_map() -> dict[int, int]:
    """Snapshot all processes and return {pid: parent_pid}."""
    kernel32 = ctypes.windll.kernel32
    snap = kernel32.CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0)
    if snap == ctypes.c_void_p(-1).value:
        return {}
    entry = PROCESSENTRY32W()
    entry.dwSize = ctypes.sizeof(PROCESSENTRY32W)
    result: dict[int, int] = {}
    try:
        if kernel32.Process32FirstW(snap, ctypes.byref(entry)):
            while True:
                result[int(entry.th32ProcessID)] = int(entry.th32ParentProcessID)
                if not kernel32.Process32NextW(snap, ctypes.byref(entry)):
                    break
    finally:
        kernel32.CloseHandle(snap)
    return result


def _build_name_map() -> dict[int, str]:
    """Snapshot all processes and return {pid: lowercased exe basename}."""
    kernel32 = ctypes.windll.kernel32
    snap = kernel32.CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0)
    if snap == ctypes.c_void_p(-1).value:
        return {}
    entry = PROCESSENTRY32W()
    entry.dwSize = ctypes.sizeof(PROCESSENTRY32W)
    result: dict[int, str] = {}
    try:
        if kernel32.Process32FirstW(snap, ctypes.byref(entry)):
            while True:
                result[int(entry.th32ProcessID)] = entry.szExeFile.lower()
                if not kernel32.Process32NextW(snap, ctypes.byref(entry)):
                    break
    finally:
        kernel32.CloseHandle(snap)
    return result


def _is_descendant(pid: int, ancestor: int, parent_map: dict[int, int] | None = None) -> bool:
    """Return True if pid is a descendant of ancestor in the process tree."""
    if parent_map is None:
        parent_map = _build_parent_map()
    current = pid
    seen: set[int] = set()
    while current and current not in seen:
        if current == ancestor:
            return True
        seen.add(current)
        current = parent_map.get(current, 0)
    return False


# Process names that, if found ANYWHERE in the ancestor chain, mean we should
# hide the console window. Lowercase. claude.exe is the CLI binary; cmd.exe
# alone is NOT enough (user-opened cmd is fine), but cmd descended from claude
# IS hidden via the ancestor chain check.
_ANCESTOR_TRIGGERS = {
    "claude.exe",
    "uvicorn.exe",
}


def _ancestor_has_trigger(
    pid: int,
    parent_map: dict[int, int],
    name_map: dict[int, str],
) -> bool:
    """True if pid or any ancestor is in _ANCESTOR_TRIGGERS."""
    current = pid
    seen: set[int] = set()
    while current and current not in seen:
        if name_map.get(current, "") in _ANCESTOR_TRIGGERS:
            return True
        seen.add(current)
        current = parent_map.get(current, 0)
    return False


# ── WinEvent hook ────────────────────────────────────────────────────────────

_WinEventProc = ctypes.WINFUNCTYPE(
    None,
    wt.HANDLE, wt.DWORD, wt.HWND, wt.LONG, wt.LONG, wt.DWORD, wt.DWORD,
)


def _make_handler(mode: str, our_pid: int):
    """Cria o callback do WinEvent. mode é 'embedded' (só descendentes) ou 'global'."""
    user32 = ctypes.windll.user32

    def _on_event(
        hook: wt.HANDLE,
        event: wt.DWORD,
        hwnd: wt.HWND,
        id_object: wt.LONG,
        id_child: wt.LONG,
        thread: wt.DWORD,
        time: wt.DWORD,
    ) -> None:
        if not hwnd or id_object != OBJID_WINDOW:
            return
        buf = ctypes.create_unicode_buffer(256)
        user32.GetClassNameW(hwnd, buf, 256)
        if buf.value != "ConsoleWindowClass":
            return
        pid = wt.DWORD(0)
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        target_pid = int(pid.value)
        if target_pid == 0:
            return
        # Build maps fresh — process tree changes constantly
        parent_map = _build_parent_map()
        if mode == "embedded":
            if _is_descendant(target_pid, our_pid, parent_map):
                user32.ShowWindow(hwnd, SW_HIDE)
        else:  # global
            name_map = _build_name_map()
            if _ancestor_has_trigger(target_pid, parent_map, name_map):
                user32.ShowWindow(hwnd, SW_HIDE)

    return _WinEventProc(_on_event)


def _run_message_loop(cb, label: str) -> None:
    """Inicia hook + bombeia mensagens. Bloqueia até GetMessageW retornar 0."""
    user32 = ctypes.windll.user32
    hook = user32.SetWinEventHook(
        EVENT_OBJECT_CREATE,
        EVENT_OBJECT_SHOW,
        None,
        cb,
        0, 0,
        WINEVENT_OUTOFCONTEXT,
    )
    if not hook:
        log.warning(f"win_console_hider.{label}.hook_failed")
        return
    log.info(f"win_console_hider.{label}.started", pid=os.getpid())
    msg = wt.MSG()
    while user32.GetMessageW(ctypes.byref(msg), None, 0, 0) > 0:
        user32.TranslateMessage(ctypes.byref(msg))
        user32.DispatchMessageW(ctypes.byref(msg))
    user32.UnhookWinEvent(hook)


# ── Public API ───────────────────────────────────────────────────────────────

def start_console_hider() -> None:
    """
    Modo embedded: thread daemon que esconde janelas CMD de filhos diretos.
    Sem efeito em plataformas não-Windows.
    """
    if os.name != "nt":
        return
    our_pid = os.getpid()
    cb = _make_handler("embedded", our_pid)
    # Mantém referência viva — ctypes GC pega callbacks fora de escopo
    _embedded_cb_ref.append(cb)
    t = threading.Thread(
        target=_run_message_loop,
        args=(cb, "embedded"),
        daemon=True,
        name="win-console-hider-embedded",
    )
    t.start()


def run_global_daemon() -> int:
    """Modo daemon global. Bloqueia. Use via `python -m command_center.win_console_hider`."""
    if os.name != "nt":
        print("[win_console_hider] Only Windows is supported.")
        return 1
    cb = _make_handler("global", os.getpid())
    print(f"[win_console_hider] Starting global daemon (pid={os.getpid()}). "
          f"Hiding ConsoleWindowClass windows whose ancestry contains: "
          f"{', '.join(sorted(_ANCESTOR_TRIGGERS))}")
    print("[win_console_hider] Press Ctrl+C to stop (or kill the process).")
    try:
        _run_message_loop(cb, "global")
    except KeyboardInterrupt:
        print("[win_console_hider] Stopping.")
    return 0


# Keep callback references alive for the embedded hook.
_embedded_cb_ref: list = []


def main() -> int:
    parser = argparse.ArgumentParser(
        prog="python -m command_center.win_console_hider",
        description="Esconde pop-ups de console window de claude.exe e descendentes.",
    )
    parser.add_argument(
        "--mode",
        choices=["global"],
        default="global",
        help="Modo de operação (apenas 'global' suportado via CLI).",
    )
    parser.parse_args()
    return run_global_daemon()


if __name__ == "__main__":
    sys.exit(main())
