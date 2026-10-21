#!/usr/bin/env bash
# run.sh - Автономный запуск GOST Flowchart Studio (работает с uv или с обычным Python без uv/pip)

cd "$(dirname "$0")"

# 1. Поиск интерпретатора (uv -> python3 -> python)
if command -v uv > /dev/null 2>&1; then
  RUNNER="uv run python"
elif command -v python3 > /dev/null 2>&1; then
  RUNNER="python3"
elif command -v python > /dev/null 2>&1; then
  RUNNER="python"
else
  echo "Ошибка: Python 3 не найден в системе. Установите Python 3."
  exit 1
fi

# 2. Выбор свободного случайного порта
PORT=$(${RUNNER} -c "import socket; s=socket.socket(); s.bind(('', 0)); print(s.getsockname()[1]); s.close()")
if [ -z "${PORT}" ]; then
  PORT=8000
fi

HOST="127.0.0.1"
URL="http://${HOST}:${PORT}"

echo "=========================================================="
echo "  Запуск GOST Flowchart Studio"
echo "  URL: ${URL}"
echo "=========================================================="

# 3. Открытие в браузере
if command -v xdg-open > /dev/null 2>&1; then
  (sleep 1.2 && xdg-open "${URL}") &
elif command -v open > /dev/null 2>&1; then
  (sleep 1.2 && open "${URL}") &
fi

# 4. Запуск сервера с завендоренными пакетами
exec ${RUNNER} backend/app.py --host "${HOST}" --port "${PORT}"
