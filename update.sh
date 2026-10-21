#!/usr/bin/env bash
# update.sh - Обновление библиотек из сети и скачивание свежих wheels в vendor/

cd "$(dirname "$0")"

echo "Обновление библиотек проекта..."
if command -v uv > /dev/null; then
  uv pip install "fastapi>=0.158.2" "uvicorn>=0.54.0" "python-multipart>=0.0.32"
elif [ -f .venv/bin/pip ]; then
  .venv/bin/pip install "fastapi>=0.158.2" "uvicorn>=0.54.0" "python-multipart>=0.0.32"
else
  python3 -m pip install "fastapi>=0.158.2" "uvicorn>=0.54.0" "python-multipart>=0.0.32"
fi

echo "Обновление локальных wheels в vendor/wheels..."
mkdir -p vendor/wheels
python3 -m pip download -d vendor/wheels --no-deps "fastapi>=0.158.2" "uvicorn>=0.54.0" "python-multipart>=0.0.32" 2>/dev/null || true

echo "Обновление завершено успешно!"
