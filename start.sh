#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$DIR/.server.pid"
LOG_FILE="$DIR/.server.log"
NGROK_PID_FILE="$DIR/.ngrok.pid"
NGROK_LOG_FILE="$DIR/.ngrok.log"
NGROK_API_PORT=4041

NGROK_BIN="$(which ngrok 2>/dev/null || echo "")"
NGROK_SYS_CONFIG="$HOME/Library/Application Support/ngrok/ngrok.yml"
NGROK_APP_CONFIG="$DIR/ngrok-app.yml"

# ── Next.js ──────────────────────────────────────────────
if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE")
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo "⚠️  Next.js 已在运行中（PID $OLD_PID）"
  else
    rm -f "$PID_FILE"
  fi
fi

if [ ! -f "$PID_FILE" ]; then
  cd "$DIR"
  nohup npm run dev > "$LOG_FILE" 2>&1 &
  echo $! > "$PID_FILE"
  echo "🚀 Next.js 已启动（PID $(cat "$PID_FILE")）"
  echo "   本地地址：http://localhost:3000"
fi

# ── ngrok ────────────────────────────────────────────────
if [ -z "$NGROK_BIN" ]; then
  echo "⚠️  未找到 ngrok，跳过 tunnel 启动"
  echo "   停止：./stop.sh"
  exit 0
fi

if [ -f "$NGROK_PID_FILE" ]; then
  OLD_NGROK=$(cat "$NGROK_PID_FILE")
  if kill -0 "$OLD_NGROK" 2>/dev/null; then
    echo "⚠️  ngrok 已在运行中（PID $OLD_NGROK）"
    echo "   停止所有服务：./stop.sh"
    exit 0
  else
    rm -f "$NGROK_PID_FILE"
  fi
fi

# 构建 ngrok 命令参数，合并系统配置（authtoken）与项目配置（web_addr）
NGROK_ARGS=("http" "3000")
if [ -f "$NGROK_SYS_CONFIG" ]; then
  NGROK_ARGS+=("--config" "$NGROK_SYS_CONFIG")
fi
if [ -f "$NGROK_APP_CONFIG" ]; then
  NGROK_ARGS+=("--config" "$NGROK_APP_CONFIG")
fi
NGROK_ARGS+=("--log" "$NGROK_LOG_FILE" "--log-level" "info")

echo "🌐 正在启动 ngrok tunnel..."
"$NGROK_BIN" "${NGROK_ARGS[@]}" &
echo $! > "$NGROK_PID_FILE"

# 等待 ngrok 就绪（最多 12 秒）
for i in $(seq 1 12); do
  sleep 1
  PUBLIC_URL=$(curl -s "http://localhost:${NGROK_API_PORT}/api/tunnels" 2>/dev/null \
    | grep -o '"public_url":"https:[^"]*"' \
    | head -1 \
    | sed 's/"public_url":"//;s/"//') || true
  if [ -n "$PUBLIC_URL" ]; then
    echo "✅ ngrok tunnel 就绪"
    echo "   公网地址：$PUBLIC_URL"
    break
  fi
done

if [ -z "${PUBLIC_URL:-}" ]; then
  echo "⚠️  ngrok 启动超时，请查看日志：$NGROK_LOG_FILE"
fi

echo "   停止所有服务：./stop.sh"
