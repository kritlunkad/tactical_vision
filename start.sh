#!/bin/bash

# ==============================================================================
# Tactical Vision AI - Full Stack Server Startup Script
# Kills existing servers on ports 8000 & 3000, starts Python Backend & Node UI
# ==============================================================================

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

echo "============================================================"
echo "  ⚽ Tactical Vision AI - Automated Formation & CV Analyzer"
echo "============================================================"

# 1. Kill existing servers on port 8000 (Python) and port 3000 (Node)
echo "Stopping any existing processes on ports 8000 & 3000..."
lsof -ti:8000,3000 | xargs kill -9 2>/dev/null || true
sleep 1

# 2. Ensure directories exist
mkdir -p "$PROJECT_DIR/input_videos" "$PROJECT_DIR/output_videos" "$PROJECT_DIR/public/videos"

# Copy sample video if needed
if [ -f "$PROJECT_DIR/Archive 2/input_videos/08fd33_4.mp4" ]; then
    if [ ! -f "$PROJECT_DIR/input_videos/08fd33_4.mp4" ]; then
        cp "$PROJECT_DIR/Archive 2/input_videos/08fd33_4.mp4" "$PROJECT_DIR/input_videos/"
    fi
    if [ ! -f "$PROJECT_DIR/public/videos/08fd33_4.mp4" ]; then
        cp "$PROJECT_DIR/Archive 2/input_videos/08fd33_4.mp4" "$PROJECT_DIR/public/videos/"
    fi
fi

# 3. Start Python Backend
echo "Starting Python CV Backend (FastAPI + YOLOv8 + ByteTrack)..."
if [ -f "$PROJECT_DIR/venv/bin/python" ]; then
    "$PROJECT_DIR/venv/bin/python" "$PROJECT_DIR/backend/api_service.py" &
    PYTHON_PID=$!
else
    python3 "$PROJECT_DIR/backend/api_service.py" &
    PYTHON_PID=$!
fi

# 4. Wait for Python Backend to be healthy
echo "Waiting for Python Backend to initialize on port 8000..."
for i in {1..15}; do
    if curl -s http://localhost:8000/api/health > /dev/null 2>&1; then
        echo "✅ Python Backend is healthy and ready on http://localhost:8000"
        break
    fi
    sleep 1
done

# 5. Start Node.js Frontend Server
echo "Starting Frontend UI Server on port 3000..."
npm run dev &
NODE_PID=$!

echo ""
echo "============================================================"
echo "  🚀 All Services are Live!"
echo "  🖥️  Web UI:         http://localhost:3000"
echo "  🧠 Python CV API:   http://localhost:8000"
echo "  📹 Real Videos:     $PROJECT_DIR/input_videos"
echo "============================================================"
echo "Press Ctrl+C to stop both servers"
echo ""

# Handle clean shutdown on Ctrl+C or kill
cleanup() {
    echo ""
    echo "Shutting down servers..."
    kill "$PYTHON_PID" "$NODE_PID" 2>/dev/null || true
    lsof -ti:8000,3000 | xargs kill -9 2>/dev/null || true
    echo "Done."
    exit 0
}

trap cleanup INT TERM

# Wait for both processes
wait