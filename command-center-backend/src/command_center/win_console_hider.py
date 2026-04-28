"""
Suprime janelas CMD criadas por subprocessos do backend no Windows.

Usa SetWinEventHook para capturar eventos de criação de janela e esconde
qualquer ConsoleWindowClass pertencente a descendentes do nosso processo.
"""
from __future__ import annotations

import ctypes
import ctypes.wintypes as wt
import os
import threading

import structlog

log = structlog.get_logger(__name__)

# ── Windows API constants ────────────────────────────────────────────────────

TH32CS_SNAPPROCESS = 0x00000002
EVENT_OBJECT_SHOW   = 0x8002
WINEVENT_OUTOFCONTEXT = 0x0000
OBJID_WINDOW        = 0
SW_HIDE             = 0


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


# ── Process ancestry helpers ─────────────────────────────────────────────────

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


def _is_descendant(pid: int, ancestor: int) -> bool:
    """Return True if pid is a descendant of ancestor in the process tree."""
    parent_map = _build_parent_map()
    current = pid
    seen: set[int] = set()
    while current and current not in seen:
        if current == ancestor:
            return True
        seen.add(current)
        current = parent_map.get(current, 0)
    return False


# ── WinEvent hook ────────────────────────────────────────────────────────────

_WinEventProc = ctypes.WINFUNCTYPE(
    None,
    wt.HANDLE, wt.DWORD, wt.HWND, wt.LONG, wt.LONG, wt.DWORD, wt.DWORD,
)


def start_console_hider() -> None:
    """
    Inicia thread daemon que esconde janelas CMD de processos-filhos.
    Sem efeito em plataformas não-Windows.
    """
    if os.name != "nt":
        return

    our_pid = os.getpid()
    user32   = ctypes.windll.user32

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
        # Get PID owning this window
        pid = wt.DWORD(0)
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        if _is_descendant(int(pid.value), our_pid):
            user32.ShowWindow(hwnd, SW_HIDE)

    # Keep reference alive — ctypes will GC callbacks that go out of scope
    _cb = _WinEventProc(_on_event)

    def _run() -> None:
        hook = user32.SetWinEventHook(
            EVENT_OBJECT_SHOW, EVENT_OBJECT_SHOW,
            None,
            _cb,
            0, 0,
            WINEVENT_OUTOFCONTEXT,
        )
        if not hook:
            log.warning("win_console_hider.hook_failed")
            return
        log.info("win_console_hider.started", pid=our_pid)
        msg = wt.MSG()
        while user32.GetMessageW(ctypes.byref(msg), None, 0, 0) > 0:
            user32.TranslateMessage(ctypes.byref(msg))
            user32.DispatchMessageW(ctypes.byref(msg))
        user32.UnhookWinEvent(hook)

    t = threading.Thread(target=_run, daemon=True, name="win-console-hider")
    t.start()
