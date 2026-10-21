#!/usr/bin/env bash
# run.sh - Запуск GOST Flowchart Studio со случайным свободным портом

cd "$(dirname "$0")"

# Поиск свободного случайного порта через системный сокет
PORT=$(uv run python -c "import socket; s=socket.socket(); s.bind(('', 0)); print(s.getsockname()[1]); s.close()")
HOST="127.0.0.1"
URL="http://${HOST}:${PORT}"

echo "=========================================================="
echo "  Запуск GOST Flowchart Studio"
echo "  URL: ${URL}"
echo "=========================================================="

# Открытие браузера
if command -v xdg-open > /dev/null; then
  (sleep 1.2 && xdg-open "${URL}") &
elif command -v open > /dev/null; then
  (sleep 1.2 && open "${URL}") &
fi

exec uv run uvicorn backend.app:app --host "${HOST}" --port "${PORT}"
