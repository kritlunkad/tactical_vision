# Tactical Vision AI - Real Video Integration

This document explains how to use the real YOLO video processing integration with the Tactical Vision AI UI.

## Overview

The system now supports both:
1. **Sample Data**: Pre-generated fake data for demonstration
2. **Real Video Processing**: Using YOLO object detection on actual sports videos

## Architecture

- **Frontend**: React + TypeScript + Vite (UI)
- **Node.js Server**: Express server that proxies requests to Python backend
- **Python Backend**: FastAPI service that processes videos using YOLO
- **YOLO Model**: Pre-trained model from Archive 2 for player/ball detection

## Setup Instructions

### 1. Python Environment Setup

```bash
# Create virtual environment
python3 -m venv venv

# Activate virtual environment
source venv/bin/activate  # On macOS/Linux
# venv\Scripts\activate  # On Windows

# Install Python dependencies
pip install -r backend/requirements.txt
```

### 2. Node.js Dependencies

```bash
# Install Node.js dependencies
npm install
```

### 3. Environment Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Update the `.env` file with:
```
PYTHON_BACKEND_URL=http://localhost:8000
GEMINI_API_KEY=your_gemini_api_key  # Optional
```

## Running the Application

### Option 1: Using the start script (Recommended)

```bash
chmod +x start.sh
./start.sh
```

This will start both the Python backend and Node.js frontend servers.

### Option 2: Manual startup

**Terminal 1 - Python Backend:**
```bash
source venv/bin/activate
cd backend
python api_service.py
```

**Terminal 2 - Node.js Frontend:**
```bash
npm run dev
```

## Using Real Video Processing

### 1. Start the servers

Make sure both Python backend (port 8000) and Node.js frontend (port 3000) are running.

### 2. Access the UI

Open your browser to `http://localhost:3000`

### 3. Switch to Real Data Mode

In the UI, you'll see a toggle button in the coaching banner:
- Click "Use Sample Data" to switch to real video processing
- The button will change to "Using Real Data"

### 4. Process a Video

Currently, the system can process videos from the Archive 2 directory:

1. The system automatically detects videos in:
   - `input_videos/` directory
   - `Archive 2/input_videos/` directory

2. For testing, you can use the existing video:
   - `Archive 2/input_videos/08fd33_4.mp4`

3. The video processing will:
   - Detect players and ball using YOLO
   - Track objects across frames
   - Assign teams based on jersey colors
   - Transform coordinates to top-down view
   - Calculate speed and distance metrics
   - Generate tactical data compatible with the UI

### 5. View Results

Once processed, the UI will display:
- Real player positions from the video
- Actual ball tracking
- Team assignments based on jersey colors
- Speed and distance metrics
- Real tactical formations

## API Endpoints

### Python Backend (Port 8000)

- `GET /api/health` - Health check
- `GET /api/videos` - List available videos
- `POST /api/upload-video` - Upload a video file
- `POST /api/process-video` - Process a video and extract tactical data

### Node.js Proxy (Port 3000)

- `GET /api/cv/health` - Python backend health check
- `GET /api/cv/videos` - List available videos
- `POST /api/cv/upload-video` - Upload video (proxied to Python)
- `POST /api/cv/process-video` - Process video (proxied to Python)

## Troubleshooting

### Python Backend Issues

**Import Errors:**
- Ensure Archive 2 directory structure is intact
- Check that Python paths are correctly set in `backend/api_service.py`

**Model Loading Issues:**
- Verify that `Archive 2/models/best.pt` exists
- Check that the model file is not corrupted

**CUDA/MPS Issues:**
- The system auto-detects MPS (Mac) or CUDA (NVIDIA)
- Falls back to CPU if GPU acceleration is unavailable

### Node.js Issues

**Port Conflicts:**
- Ensure port 3000 is not in use
- Kill existing processes: `lsof -ti:3000 | xargs kill`

**Python Backend Connection:**
- Verify Python backend is running on port 8000
- Check `PYTHON_BACKEND_URL` in `.env` file

### Video Processing Issues

**Processing Too Slow:**
- Reduce `batch_size` in the processing request
- Use `use_stubs: true` to cache results
- Process shorter video segments first

**Memory Issues:**
- Process videos in chunks
- Close other applications
- Use a machine with more RAM

## Video Requirements

For best results, use videos that:
- Are standard sports broadcast feeds (football, hockey, kabaddi)
- Have clear player visibility
- Show most of the playing field
- Are in MP4, AVI, MOV, or MKV format
- Have reasonable resolution (720p or higher recommended)

## Data Flow

1. **Video Upload** → User uploads video through UI
2. **Python Processing** → YOLO detects objects, tracks players
3. **Data Transformation** → Convert to UI-compatible format
4. **Frontend Display** → Show real tactical analysis
5. **AI Analysis** → Generate coaching insights using Gemini

## Performance Considerations

- **First Run**: Slower due to model loading and stub generation
- **Subsequent Runs**: Faster using cached stub files
- **GPU Acceleration**: Significantly faster processing time
- **Video Length**: Processing time scales with video duration

## Future Enhancements

- [ ] Real-time video streaming support
- [ ] Multiple video batch processing
- [ ] Custom model training interface
- [ ] Advanced tactical metrics
- [ ] Export processed data to various formats

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Verify all dependencies are installed
3. Ensure both servers are running
4. Check browser console for frontend errors
5. Check terminal logs for backend errors