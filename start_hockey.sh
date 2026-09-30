#!/bin/bash
# ==============================================================================
# Hockey Backend Startup - SEPARATE FROM FOOTBALL
# Football runs on 8000, Hockey on 8001
# ==============================================================================

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

echo "============================================================"
echo "  🏒 Hockey AI - 7-Class Rink Analyzer (Separate Backend)"
echo "============================================================"

# Kill existing hockey backend
echo "Stopping existing hockey backend on port 8001..."
lsof -ti:8001 | xargs kill -9 2>/dev/null || true
sleep 1

mkdir -p "$PROJECT_DIR/input_videos" "$PROJECT_DIR/output_videos" "$PROJECT_DIR/public/videos" "$PROJECT_DIR/backend/cache_hockey"

# Verify hockey model exists
if [ ! -f "$PROJECT_DIR/HockeyAI_model_weight.pt" ]; then
    echo "❌ Hockey model not found at $PROJECT_DIR/HockeyAI_model_weight.pt"
    exit 1
fi
echo "✅ Hockey model found: $(du -h "$PROJECT_DIR/HockeyAI_model_weight.pt" | cut -f1)"

echo "Starting Hockey CV Backend (FastAPI + YOLOv8 7-Class) on port 8001..."
if [ -f "$PROJECT_DIR/venv/bin/python" ]; then
    "$PROJECT_DIR/venv/bin/python" "$PROJECT_DIR/backend/hockey_api_service.py" &
    HOCKEY_PID=$!
else
    python3 "$PROJECT_DIR/backend/hockey_api_service.py" &
    HOCKEY_PID=$!
fi

echo "Waiting for Hockey Backend to be healthy..."
for i in {1..15}; do
    if curl -s http://localhost:8001/api/hockey/health > /dev/null 2>&1; then
        echo "✅ Hockey Backend healthy on http://localhost:8001"
        break
    fi
    if [ $i -eq 15 ]; then
        echo "⚠️  Hockey backend not responding after 15s - check logs"
    fi
    sleep 1
done

echo ""
echo "============================================================"
echo "  🚀 Hockey Backend Live!"
echo "  🏒 Hockey API:   http://localhost:8001/api/hockey/health"
echo "  📹 Upload:       POST http://localhost:8001/api/hockey/upload-video"
echo "  🧠 Process:      POST http://localhost:8001/api/hockey/process-video"
echo "============================================================"
echo "Football backend still runs separately on http://localhost:8000"
echo "Run ./start.sh for football + frontend"
echo ""

wait $HOCKEY_PID
