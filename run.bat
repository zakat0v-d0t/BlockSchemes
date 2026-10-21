@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0"

REM 1. Поиск интерпретатора (uv -> py -> python)
set "RUNNER="
where uv >nul 2>nul
if %errorlevel% equ 0 (
    set "RUNNER=uv run python"
) else (
    where py >nul 2>nul
    if !errorlevel! equ 0 (
        set "RUNNER=py -3"
    ) else (
        where python >nul 2>nul
        if !errorlevel! equ 0 (
            set "RUNNER=python"
        )
    )
)

if "%RUNNER%"=="" (
    echo [OSHIBKA] Python ne nayden! Ustanovite Python 3 s sayta python.org
    pause
    exit /b 1
)

REM 2. Генерация свободного случайного порта
set "PORT="
for /f "tokens=*" %%p in ('%RUNNER% -c "import socket; s=socket.socket(); s.bind(('', 0)); print(s.getsockname()[1]); s.close()"') do (
    set "PORT=%%p"
)

if "%PORT%"=="" set "PORT=8000"

set "URL=http://127.0.0.1:%PORT%"

echo ==========================================================
echo   Zapusk GOST Flowchart Studio
echo   URL: %URL%
echo ==========================================================

REM 3. Открытие в браузере
start "" "%URL%"

REM 4. Запуск сервера с завендоренными библиотеками
%RUNNER% backend\app.py --host 127.0.0.1 --port %PORT%

pause
