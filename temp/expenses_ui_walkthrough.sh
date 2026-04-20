#!/usr/bin/env bash
set -euo pipefail
export DISPLAY=:1
CHROME_BIN="$(command -v google-chrome || command -v google-chrome-stable)"
if [ -z "${CHROME_BIN:-}" ]; then
  echo "Chrome not found" >&2
  exit 1
fi
"$CHROME_BIN" --new-window --disable-gpu --no-first-run --no-default-browser-check http://localhost:8080/login >/dev/null 2>&1 &
CHROME_PID=$!
sleep 5
WIN_ID=$(xdotool search --sync --onlyvisible --class "Google-chrome" | head -n 1)
xdotool windowactivate "$WIN_ID"
sleep 1
xdotool key ctrl+l
sleep 0.2
xdotool type --delay 1 "http://localhost:8080/login"
xdotool key Return
sleep 2
xdotool key Tab
sleep 0.2
xdotool type --delay 1 "admin@slimbooks.app"
xdotool key Tab
sleep 0.2
xdotool type --delay 1 "password"
xdotool key Return
sleep 4
xdotool key ctrl+l
sleep 0.2
xdotool type --delay 1 "http://localhost:8080/expenses"
xdotool key Return
sleep 4
xdotool key Ctrl+Shift+3
sleep 2
LATEST_FILE=$(ls -1t /home/ubuntu/*.png 2>/dev/null | head -n 1 || true)
if [ -n "$LATEST_FILE" ]; then
  cp "$LATEST_FILE" /opt/cursor/artifacts/expenses_buttons_order.png
fi
xdotool key Tab Tab Tab
sleep 0.2
xdotool key Return
sleep 2
xdotool key Ctrl+Shift+3
sleep 2
LATEST_FILE=$(ls -1t /home/ubuntu/*.png 2>/dev/null | head -n 1 || true)
if [ -n "$LATEST_FILE" ]; then
  cp "$LATEST_FILE" /opt/cursor/artifacts/expenses_export_modal.png
fi
xdotool key Tab
sleep 0.3
xdotool key Return
sleep 0.5
xdotool key Down
sleep 0.3
xdotool key Return
sleep 1
xdotool key Ctrl+Shift+3
sleep 2
LATEST_FILE=$(ls -1t /home/ubuntu/*.png 2>/dev/null | head -n 1 || true)
if [ -n "$LATEST_FILE" ]; then
  cp "$LATEST_FILE" /opt/cursor/artifacts/expenses_export_format_xlsx.png
fi
kill "$CHROME_PID" || true
