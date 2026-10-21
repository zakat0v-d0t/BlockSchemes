@echo off
setlocal

cd /d "%~dp0"

echo Obnovlenie bibliotek proekta...
where uv >nul 2>nul
if %errorlevel% equ 0 (
    uv pip install "fastapi>=0.158.2" "uvicorn>=0.54.0" "python-multipart>=0.0.32"
) else (
    if exist ".venv\Scripts\pip.exe" (
        call .venv\Scripts\pip.exe install "fastapi>=0.158.2" "uvicorn>=0.54.0" "python-multipart>=0.0.32"
    ) else (
        pip install "fastapi>=0.158.2" "uvicorn>=0.54.0" "python-multipart>=0.0.32"
    )
)

echo Obnovlenie lokalnykh wheels v vendor\wheels...
if not exist "vendor\wheels" mkdir "vendor\wheels"
pip download -d vendor\wheels --no-deps "fastapi>=0.158.2" "uvicorn>=0.54.0" "python-multipart>=0.0.32"

echo Obnovlenie zaversheno!
pause
