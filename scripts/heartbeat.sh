#!/bin/bash
# Heartbeat — writes to .heartbeat every 5 minutes to trigger the watcher
# Run: nohup bash scripts/heartbeat.sh &

HEARTBEAT_FILE="/home/ckl/Agent/agent-overflow/app/.heartbeat"

while true; do
  echo "HEARTBEAT $(date -Iseconds) — Continue building Agent Overflow. Resume from TODO.md. Deploy after changes." > "$HEARTBEAT_FILE"
  sleep 300  # 5 minutes
done
