#!/usr/bin/env bash
# update.sh - Обновление библиотек из сети и скачивание свежих wheels в vendor/

cd "$(dirname "$0")"

echo "Обновление библиотек проекта..."
if command -v uv > /dev/null; then
  uv pip install -U fastapi uvicorn python-multipart
else
  .venv/bin/pip install -U fastapi uvicorn python-multipart
fi

echo "Обновление локальных wheels в vendor/wheels..."
mkdir -p vendor/wheels
python3 -m pip download -d vendor/wheels fastapi uvicorn python-multipart 2>/dev/null || true

echo "Обновление завершено успешно!"
