@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0"

for /f "tokens=*" %%p in ('uv run python -c "import socket; s=socket.socket(); s.bind(('', 0)); print(s.getsockname()[1]); s.close()"') do (
    set PORT=%%p
)

if "%PORT%"=="" set PORT=8000

set URL=http://127.0.0.1:%PORT%

echo ==========================================================
echo   Zapusk GOST Flowchart Studio
echo   URL: %URL%
echo ==========================================================

start "" "%URL%"

uv run uvicorn backend.app:app --host 127.0.0.1 --port %PORT%
pause
