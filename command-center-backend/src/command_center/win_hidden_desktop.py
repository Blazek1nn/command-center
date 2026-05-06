"""
Spawning de processos em desktop invisível (Windows).

Por que: Python `subprocess.STARTUPINFO` não expõe `lpDesktop`. Para que
claude.exe e TODOS os seus descendentes (cmd.exe, conhost.exe, etc.) rodem
fora da view do usuário, precisamos chamar Win32 `CreateProcessW` direto
com `STARTUPINFOW.lpDesktop` apontando pra um desktop oculto.

API pública:
- `ensure_hidden_desktop()` — cria (idempotente) um desktop chamado "ClaudeCenterHidden"
- `popen_on_hidden_desktop(args, ...)` — substituto compatível com `subprocess.Popen`
  (atributos: `.stdout`, `.stderr`, `.poll()`, `.wait()`, `.kill()`, `.returncode`).
  Stdout/stderr são `TextIOWrapper` lendo de pipes nomeados — itera linha-a-linha.

Em plataformas não-Windows, levanta NotImplementedError.
"""
from __future__ import annotations

import ctypes
import ctypes.wintypes as wt
import io
import os
import subprocess
import sys
import threading
from typing import IO


# ── Win32 constants ──────────────────────────────────────────────────────────

GENERIC_ALL = 0x10000000
STARTF_USESTDHANDLES = 0x00000100
STARTF_USESHOWWINDOW = 0x00000001
SW_HIDE = 0
HANDLE_FLAG_INHERIT = 0x00000001
CREATE_NO_WINDOW = 0x08000000
CREATE_UNICODE_ENVIRONMENT = 0x00000400
INFINITE = 0xFFFFFFFF
WAIT_TIMEOUT = 0x00000102
STILL_ACTIVE = 0x00000103
PIPE_BUF_SIZE = 64 * 1024


# ── Structs ──────────────────────────────────────────────────────────────────


class STARTUPINFOW(ctypes.Structure):
    _fields_ = [
        ("cb", wt.DWORD),
        ("lpReserved", wt.LPWSTR),
        ("lpDesktop", wt.LPWSTR),
        ("lpTitle", wt.LPWSTR),
        ("dwX", wt.DWORD),
        ("dwY", wt.DWORD),
        ("dwXSize", wt.DWORD),
        ("dwYSize", wt.DWORD),
        ("dwXCountChars", wt.DWORD),
        ("dwYCountChars", wt.DWORD),
        ("dwFillAttribute", wt.DWORD),
        ("dwFlags", wt.DWORD),
        ("wShowWindow", wt.WORD),
        ("cbReserved2", wt.WORD),
        ("lpReserved2", ctypes.POINTER(wt.BYTE)),
        ("hStdInput", wt.HANDLE),
        ("hStdOutput", wt.HANDLE),
        ("hStdError", wt.HANDLE),
    ]


class PROCESS_INFORMATION(ctypes.Structure):
    _fields_ = [
        ("hProcess", wt.HANDLE),
        ("hThread", wt.HANDLE),
        ("dwProcessId", wt.DWORD),
        ("dwThreadId", wt.DWORD),
    ]


class SECURITY_ATTRIBUTES(ctypes.Structure):
    _fields_ = [
        ("nLength", wt.DWORD),
        ("lpSecurityDescriptor", ctypes.c_void_p),
        ("bInheritHandle", wt.BOOL),
    ]


# ── Win32 imports ────────────────────────────────────────────────────────────

if sys.platform == "win32":
    USER32 = ctypes.windll.user32
    KERNEL32 = ctypes.windll.kernel32

    USER32.CreateDesktopW.argtypes = [
        wt.LPCWSTR, wt.LPCWSTR, ctypes.c_void_p, wt.DWORD, wt.DWORD, ctypes.c_void_p
    ]
    USER32.CreateDesktopW.restype = wt.HANDLE

    KERNEL32.CreatePipe.argtypes = [
        ctypes.POINTER(wt.HANDLE), ctypes.POINTER(wt.HANDLE),
        ctypes.POINTER(SECURITY_ATTRIBUTES), wt.DWORD,
    ]
    KERNEL32.CreatePipe.restype = wt.BOOL

    KERNEL32.SetHandleInformation.argtypes = [wt.HANDLE, wt.DWORD, wt.DWORD]
    KERNEL32.SetHandleInformation.restype = wt.BOOL

    KERNEL32.CreateProcessW.argtypes = [
        wt.LPCWSTR, wt.LPWSTR, ctypes.c_void_p, ctypes.c_void_p,
        wt.BOOL, wt.DWORD, ctypes.c_void_p, wt.LPCWSTR,
        ctypes.POINTER(STARTUPINFOW), ctypes.POINTER(PROCESS_INFORMATION),
    ]
    KERNEL32.CreateProcessW.restype = wt.BOOL

    KERNEL32.CloseHandle.argtypes = [wt.HANDLE]
    KERNEL32.CloseHandle.restype = wt.BOOL

    KERNEL32.WaitForSingleObject.argtypes = [wt.HANDLE, wt.DWORD]
    KERNEL32.WaitForSingleObject.restype = wt.DWORD

    KERNEL32.GetExitCodeProcess.argtypes = [wt.HANDLE, ctypes.POINTER(wt.DWORD)]
    KERNEL32.GetExitCodeProcess.restype = wt.BOOL

    KERNEL32.TerminateProcess.argtypes = [wt.HANDLE, wt.UINT]
    KERNEL32.TerminateProcess.restype = wt.BOOL


# ── Hidden desktop ───────────────────────────────────────────────────────────

_HIDDEN_DESKTOP_NAME = "ClaudeCenterHidden"
_HIDDEN_DESKTOP_HANDLE: wt.HANDLE | None = None
_DESKTOP_LOCK = threading.Lock()


def ensure_hidden_desktop() -> str:
    """Cria (idempotente) o desktop oculto. Retorna o nome para uso em lpDesktop.

    O handle é mantido vivo para que o desktop não seja destruído. Não há
    `CloseDesktop` chamado — o desktop é cleanup pelo OS no shutdown.
    """
    if sys.platform != "win32":
        raise NotImplementedError("Só Windows")
    global _HIDDEN_DESKTOP_HANDLE
    with _DESKTOP_LOCK:
        if _HIDDEN_DESKTOP_HANDLE is None:
            h = USER32.CreateDesktopW(
                _HIDDEN_DESKTOP_NAME, None, None, 0, GENERIC_ALL, None
            )
            if h:
                _HIDDEN_DESKTOP_HANDLE = h
    return _HIDDEN_DESKTOP_NAME


# ── Pipe helper ──────────────────────────────────────────────────────────────


def _create_pipe() -> tuple[wt.HANDLE, wt.HANDLE]:
    """Cria um pipe anônimo. Lado de leitura é não-herdável; lado de escrita é herdável."""
    sa = SECURITY_ATTRIBUTES()
    sa.nLength = ctypes.sizeof(SECURITY_ATTRIBUTES)
    sa.lpSecurityDescriptor = None
    sa.bInheritHandle = True
    rh = wt.HANDLE()
    wh = wt.HANDLE()
    if not KERNEL32.CreatePipe(ctypes.byref(rh), ctypes.byref(wh), ctypes.byref(sa), PIPE_BUF_SIZE):
        raise OSError("CreatePipe failed")
    # Lado de leitura não deve ser herdado pelo filho.
    KERNEL32.SetHandleInformation(rh, HANDLE_FLAG_INHERIT, 0)
    return rh, wh


def _msvcrt_open_osfhandle(handle: wt.HANDLE, flags: int = 0) -> int:
    """Converte HANDLE Win32 em fd C que `open` em Python pode ler/escrever."""
    import msvcrt
    # wt.HANDLE é c_void_p; precisa do .value (int) — int(c_void_p) retorna bytes.
    raw = handle.value if hasattr(handle, "value") else handle
    return msvcrt.open_osfhandle(raw or 0, flags)


# ── Quote args ───────────────────────────────────────────────────────────────


def _quote_arg(arg: str) -> str:
    """Quoting compatível com CommandLineToArgvW."""
    if arg and not any(c in arg for c in ' \t\n\v"'):
        return arg
    out = ['"']
    backslashes = 0
    for c in arg:
        if c == "\\":
            backslashes += 1
        elif c == '"':
            out.append("\\" * (backslashes * 2 + 1))
            backslashes = 0
            out.append('"')
        else:
            if backslashes:
                out.append("\\" * backslashes)
                backslashes = 0
            out.append(c)
    if backslashes:
        out.append("\\" * (backslashes * 2))
    out.append('"')
    return "".join(out)


def _build_cmdline(args: list[str]) -> str:
    return " ".join(_quote_arg(a) for a in args)


# ── Popen-like wrapper ───────────────────────────────────────────────────────


class HiddenDesktopPopen:
    """Mimico parcial de `subprocess.Popen`. Suficiente pra uso em claude_runner.py.

    Atributos públicos:
    - `stdout`: TextIOWrapper iterável linha-a-linha
    - `stderr`: TextIOWrapper iterável linha-a-linha
    - `pid`
    - `returncode`: None enquanto rodando, int após terminar

    Métodos:
    - `poll()` -> int|None
    - `wait(timeout=None)` -> int (raises TimeoutExpired)
    - `kill()`
    """

    def __init__(
        self,
        args: list[str],
        cwd: str | None = None,
        env: dict[str, str] | None = None,
        encoding: str = "utf-8",
        errors: str = "replace",
    ) -> None:
        if sys.platform != "win32":
            raise NotImplementedError("Só Windows")

        desktop = ensure_hidden_desktop()
        # Cria pipes pra stdout e stderr. stdin → DEVNULL (NULL handle).
        out_r, out_w = _create_pipe()
        err_r, err_w = _create_pipe()

        si = STARTUPINFOW()
        si.cb = ctypes.sizeof(STARTUPINFOW)
        si.lpDesktop = desktop  # ⭐ a chave da história
        si.dwFlags = STARTF_USESTDHANDLES | STARTF_USESHOWWINDOW
        si.wShowWindow = SW_HIDE
        si.hStdInput = wt.HANDLE(0)  # NULL = DEVNULL para stdin
        si.hStdOutput = out_w
        si.hStdError = err_w

        pi = PROCESS_INFORMATION()
        cmdline = _build_cmdline(args)
        cmdline_buf = ctypes.create_unicode_buffer(cmdline)

        env_block: ctypes.Array[wt.WCHAR] | None = None
        if env is not None:
            # Bloco de env: "K1=V1\0K2=V2\0\0" em UTF-16
            block = "".join(f"{k}={v}\0" for k, v in env.items()) + "\0"
            env_block = ctypes.create_unicode_buffer(block)

        ok = KERNEL32.CreateProcessW(
            None,
            cmdline_buf,
            None,
            None,
            True,  # bInheritHandles — pipes precisam herdar
            CREATE_NO_WINDOW | CREATE_UNICODE_ENVIRONMENT,
            ctypes.cast(env_block, ctypes.c_void_p) if env_block else None,
            cwd,
            ctypes.byref(si),
            ctypes.byref(pi),
        )

        # Fecha os lados dos pipes que pertencem ao filho — independente de sucesso
        KERNEL32.CloseHandle(out_w)
        KERNEL32.CloseHandle(err_w)

        if not ok:
            KERNEL32.CloseHandle(out_r)
            KERNEL32.CloseHandle(err_r)
            err = ctypes.WinError()
            raise OSError(f"CreateProcessW failed: {err}")

        # Fecha thread handle, mantém process handle pra Wait/Terminate
        KERNEL32.CloseHandle(pi.hThread)

        self._h_process = pi.hProcess
        self.pid = int(pi.dwProcessId)

        out_fd = _msvcrt_open_osfhandle(out_r, os.O_RDONLY)
        err_fd = _msvcrt_open_osfhandle(err_r, os.O_RDONLY)
        self.stdout: IO[str] = io.TextIOWrapper(
            os.fdopen(out_fd, "rb", buffering=0),
            encoding=encoding,
            errors=errors,
            newline="",
            line_buffering=True,
        )
        self.stderr: IO[str] = io.TextIOWrapper(
            os.fdopen(err_fd, "rb", buffering=0),
            encoding=encoding,
            errors=errors,
            newline="",
            line_buffering=True,
        )
        self.returncode: int | None = None

    def poll(self) -> int | None:
        if self.returncode is not None:
            return self.returncode
        code = wt.DWORD(0)
        if not KERNEL32.GetExitCodeProcess(self._h_process, ctypes.byref(code)):
            return None
        if code.value == STILL_ACTIVE:
            return None
        self.returncode = int(code.value)
        return self.returncode

    def wait(self, timeout: float | None = None) -> int:
        ms = INFINITE if timeout is None else int(timeout * 1000)
        result = KERNEL32.WaitForSingleObject(self._h_process, ms)
        if result == WAIT_TIMEOUT:
            raise subprocess.TimeoutExpired(cmd="<hidden_desktop>", timeout=timeout)
        return self.poll() or 0

    def kill(self) -> None:
        KERNEL32.TerminateProcess(self._h_process, 1)


def popen_on_hidden_desktop(
    args: list[str],
    cwd: str | None = None,
    env: dict[str, str] | None = None,
    encoding: str = "utf-8",
    errors: str = "replace",
) -> HiddenDesktopPopen:
    """Spawning compatível com Popen no desktop oculto. Use só no Windows."""
    return HiddenDesktopPopen(args, cwd=cwd, env=env, encoding=encoding, errors=errors)
