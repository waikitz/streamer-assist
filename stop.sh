#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$DIR/.server.pid"
NGROK_PID_FILE="$DIR/.ngrok.pid"

# ── 停止 ngrok ───────────────────────────────────────────
if [ -f "$NGROK_PID_FILE" ]; then
  NGROK_PID=$(cat "$NGROK_PID_FILE")
  if kill -0 "$NGROK_PID" 2>/dev/null; then
    kill "$NGROK_PID" 2>/dev/null || true
    echo "🌐 ngrok 已停止（PID $NGROK_PID）"
  else
    echo "ℹ️  ngrok 进程 $NGROK_PID 已不存在"
  fi
  rm -f "$NGROK_PID_FILE"
else
  echo "ℹ️  没有找到 ngrok PID 文件"
fi

# ── 停止 Next.js ─────────────────────────────────────────
if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  if kill -0 "$PID" 2>/dev/null; then
    kill -- -"$(ps -o pgid= -p "$PID" | tr -d ' ')" 2>/dev/null || kill "$PID"
    echo "🛑 Next.js 已停止（PID $PID）"
  else
    echo "ℹ️  Next.js 进程 $PID 已不存在"
  fi
  rm -f "$PID_FILE"
else
  echo "ℹ️  没有找到 Next.js PID 文件"
fi
