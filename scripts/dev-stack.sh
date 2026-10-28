#!/usr/bin/env bash
set -euo pipefail

PORT=8080 pnpm --filter @workspace/api-server run dev &
api_pid=$!
PORT=21351 pnpm --filter @workspace/vlsi-optimizer run dev &
web_pid=$!

cleanup() {
  stop_tree() {
    local parent="$1"
    local child
    for child in $(pgrep -P "$parent" 2>/dev/null || true); do
      stop_tree "$child"
    done
    kill -TERM "$parent" 2>/dev/null || true
  }
  stop_tree "$api_pid"
  stop_tree "$web_pid"
  wait "$api_pid" "$web_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM
wait -n "$api_pid" "$web_pid"
