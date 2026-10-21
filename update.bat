@echo off
setlocal

cd /d "%~dp0"

echo Obnovlenie bibliotek proekta...
where uv >nul 2>nul
if %errorlevel% equ 0 (
    uv pip install -U fastapi uvicorn python-multipart
) else (
    call .venv\Scripts\pip.exe install -U fastapi uvicorn python-multipart
)

echo Obnovlenie lokalnykh wheels v vendor\wheels...
if not exist "vendor\wheels" mkdir "vendor\wheels"
pip download -d vendor\wheels fastapi uvicorn python-multipart

echo Obnovlenie zaversheno!
pause
