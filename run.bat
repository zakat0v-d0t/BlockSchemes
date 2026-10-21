@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0"

REM 1. Проверка и автоматическая настройка локального окружения без интернета
if not exist ".venv" (
    echo Nastroyka lokalnogo okruzheniya...
    where uv >nul 2>nul
    if %errorlevel% equ 0 (
        uv venv .venv
        uv pip install --no-index --find-links=vendor\wheels fastapi uvicorn python-multipart >nul 2>nul
        if %errorlevel% neq 0 uv pip install fastapi uvicorn python-multipart
    ) else (
        python -m venv .venv
        call .venv\Scripts\pip.exe install --no-index --find-links=vendor\wheels fastapi uvicorn python-multipart >nul 2>nul
        if %errorlevel% neq 0 call .venv\Scripts\pip.exe install fastapi uvicorn python-multipart
    )
)

REM 2. Генерация случайного свободного порта
set PORT=
where uv >nul 2>nul
if %errorlevel% equ 0 (
    for /f "tokens=*" %%p in ('uv run python -c "import socket; s=socket.socket(); s.bind(('', 0)); print(s.getsockname()[1]); s.close()"') do set PORT=%%p
) else (
    for /f "tokens=*" %%p in ('.venv\Scripts\python.exe -c "import socket; s=socket.socket(); s.bind(('', 0)); print(s.getsockname()[1]); s.close()"') do set PORT=%%p
)

if "%PORT%"=="" set PORT=8000

set URL=http://127.0.0.1:%PORT%

echo ==========================================================
echo   Zapusk GOST Flowchart Studio
echo   URL: %URL%
echo ==========================================================

REM 3. Открытие в браузере
start "" "%URL%"

REM 4. Запуск сервера
where uv >nul 2>nul
if %errorlevel% equ 0 (
    uv run uvicorn backend.app:app --host 127.0.0.1 --port %PORT%
) else (
    .venv\Scripts\uvicorn.exe backend.app:app --host 127.0.0.1 --port %PORT%
)

pause
