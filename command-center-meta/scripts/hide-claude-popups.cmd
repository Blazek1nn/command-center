@echo off
REM Daemon global que esconde pop-ups de console do claude.exe e descendentes.
REM Roda invisivel em background. Para parar: Get-Process python | Stop-Process
REM ou matar via Task Manager (procura "python.exe" rodando win_console_hider).

cd /d "C:\cc\command-center-backend"
start "" /B "C:\Users\USER\.local\bin\uv.exe" run python -m command_center.win_console_hider
echo Daemon de hide-popups iniciado em background.
echo Para parar: Task Manager -^> python.exe rodando "win_console_hider".
