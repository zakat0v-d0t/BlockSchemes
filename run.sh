#!/usr/bin/env bash
# run.sh - Автоматический запуск GOST Flowchart Studio без необходимости ручной установки зависимостей

cd "$(dirname "$0")"

# 1. Проверка и автоматическая настройка виртуального окружения
if [ ! -d ".venv" ]; then
  echo "Настройка локального окружения..."
  if command -v uv > /dev/null; then
    uv venv .venv
    # Установка из локальной папки vendor/wheels (оффлайн, без интернета)
    uv pip install --no-index --find-links=vendor/wheels fastapi uvicorn python-multipart 2>/dev/null || uv pip install fastapi uvicorn python-multipart
  else
    python3 -m venv .venv
    .venv/bin/pip install --no-index --find-links=vendor/wheels fastapi uvicorn python-multipart 2>/dev/null || .venv/bin/pip install fastapi uvicorn python-multipart
  fi
fi

# 2. Выбор свободного случайного порта
if command -v uv > /dev/null; then
  PORT=$(uv run python -c "import socket; s=socket.socket(); s.bind(('', 0)); print(s.getsockname()[1]); s.close()")
else
  PORT=$(.venv/bin/python -c "import socket; s=socket.socket(); s.bind(('', 0)); print(s.getsockname()[1]); s.close()")
fi

HOST="127.0.0.1"
URL="http://${HOST}:${PORT}"

echo "=========================================================="
echo "  Запуск GOST Flowchart Studio"
echo "  URL: ${URL}"
echo "=========================================================="

# 3. Открытие в браузере
if command -v xdg-open > /dev/null; then
  (sleep 1.2 && xdg-open "${URL}") &
elif command -v open > /dev/null; then
  (sleep 1.2 && open "${URL}") &
fi

# 4. Запуск сервера
if command -v uv > /dev/null; then
  exec uv run uvicorn backend.app:app --host "${HOST}" --port "${PORT}"
else
  exec .venv/bin/uvicorn backend.app:app --host "${HOST}" --port "${PORT}"
fi
