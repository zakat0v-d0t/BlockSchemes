#!/usr/bin/env bash
# run.sh - Скрипт запуска веб-приложения GOST Flowchart Studio

cd "$(dirname "$0")"

PORT=8000
HOST="127.0.0.1"
URL="http://${HOST}:${PORT}"

echo "=========================================================="
echo "  🚀 Запуск GOST Flowchart Studio (ГОСТ 19.701-90)"
echo "  🌐 URL: ${URL}"
echo "=========================================================="

# Открываем браузер в фоновом режиме, если доступен xdg-open
if command -v xdg-open > /dev/null; then
  (sleep 1.2 && xdg-open "${URL}") &
fi

exec uv run uvicorn backend.app:app --host "${HOST}" --port "${PORT}" --reload
