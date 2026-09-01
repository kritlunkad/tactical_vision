import React, { useRef, useEffect, useState } from 'react';
import { 
  FrameData, 
  DetectedEntity, 
  Point2D, 
  DrawingAnnotation, 
  SportType 
} from '../types';
import { TelestratorTool } from './TelestratorToolbar';
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Maximize2, 
  Layers, 
  Sparkles,
  Crosshair,
  Volume2,
  VolumeX,
  Gauge
} from 'lucide-react';

interface BroadcastViewProps {
  currentFrame: FrameData;
  allFrames: FrameData[];
  currentFrameIndex: number;
  onSeekFrame: (index: number) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  playbackSpeed: number;
  onChangeSpeed: (speed: number) => void;
  sport: SportType;
  teamAColor: string;
  teamBColor: string;
  isCalibrating: boolean;
  homographyAnchors: Point2D[];
  onUpdateAnchors: (anchors: Point2D[]) => void;
  telestratorTool: TelestratorTool;
  telestratorColor: string;
  annotations: DrawingAnnotation[];
  onAddAnnotation: (annotation: DrawingAnnotation) => void;
  showDrawings: boolean;
  selectedEntityId: string | null;
  onSelectEntity: (id: string | null) => void;
  customVideoUrl: string | null;
}

export const BroadcastView: React.FC<BroadcastViewProps> = ({
  currentFrame,
  allFrames,
  currentFrameIndex,
  onSeekFrame,
  isPlaying,
  onTogglePlay,
  playbackSpeed,
  onChangeSpeed,
  sport,
  teamAColor,
  teamBColor,
  isCalibrating,
  homographyAnchors,
  onUpdateAnchors,
  telestratorTool,
  telestratorColor,
  annotations,
  onAddAnnotation,
  showDrawings,
  selectedEntityId,
  onSelectEntity,
  customVideoUrl,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Overlay layer visibility toggles
  const [showBBoxes, setShowBBoxes] = useState<boolean>(true);
  const [showLabels, setShowLabels] = useState<boolean>(true);
  const [showVectors, setShowVectors] = useState<boolean>(true);
  const [showHomographyGrid, setShowHomographyGrid] = useState<boolean>(true);

  // Active drawing interaction state
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [currentPoints, setCurrentPoints] = useState<Point2D[]>([]);
  const [draggingAnchorIndex, setDraggingAnchorIndex] = useState<number | null>(null);

  // Render Synthetic Broadcast Feed or Custom Video + Overlays on Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // If custom video is playing, video element sits behind canvas (transparent overlay)
    // If no custom video, draw synthetic high-definition sports broadcast frame
    if (!customVideoUrl) {
      drawSyntheticBroadcastScene(ctx, width, height, currentFrame, sport, teamAColor, teamBColor);
    }

    // 1. Draw Homography Calibration Trapezoid Grid
    if (showHomographyGrid || isCalibrating) {
      drawHomographyGridOverlay(ctx, width, height, homographyAnchors, isCalibrating);
    }

    // 2. Draw Computer Vision Detected Entities (YOLO Bounding Boxes, Player Rings, Vectors)
    drawDetectedEntities(
      ctx,
      width,
      height,
      currentFrame.entities,
      teamAColor,
      teamBColor,
      showBBoxes,
      showLabels,
      showVectors,
      selectedEntityId
    );

    // 3. Draw Ball or Puck
    if (currentFrame.ballPos) {
      drawBall(ctx, width, height, currentFrame.ballPos, sport);
    }

    // 4. Draw Coach Telestrator Annotations
    if (showDrawings) {
      annotations.forEach((anno) => {
        drawSingleAnnotation(ctx, width, height, anno);
      });

      // Active drawing preview
      if (isDrawing && currentPoints.length > 0) {
        drawSingleAnnotation(ctx, width, height, {
          id: 'temp',
          type: telestratorTool as any,
          color: telestratorColor,
          points: currentPoints,
          timestamp: Date.now()
        });
      }
    }
  }, [
    currentFrame,
    sport,
    teamAColor,
    teamBColor,
    showBBoxes,
    showLabels,
    showVectors,
    showHomographyGrid,
    isCalibrating,
    homographyAnchors,
    annotations,
    showDrawings,
    isDrawing,
    currentPoints,
    telestratorTool,
    telestratorColor,
    selectedEntityId,
    customVideoUrl
  ]);

  // Handle Canvas Mouse / Touch events for Telestrator & Homography Anchor Dragging
  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>): Point2D | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    return { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pt = getCanvasCoords(e);
    if (!pt) return;

    // Check if clicking near a homography anchor in calibration mode
    if (isCalibrating) {
      for (let i = 0; i < homographyAnchors.length; i++) {
        const anchor = homographyAnchors[i];
        const dist = Math.hypot(anchor.x - pt.x, anchor.y - pt.y);
        if (dist < 4) {
          setDraggingAnchorIndex(i);
          return;
        }
      }
    }

    // Check if clicking a player entity to select
    const clickedEntity = currentFrame.entities.find((ent) => {
      const dx = ent.screenPos.x - pt.x;
      const dy = ent.screenPos.y - pt.y;
      return Math.hypot(dx, dy) < 4;
    });

    if (clickedEntity && telestratorTool === 'select') {
      onSelectEntity(clickedEntity.id === selectedEntityId ? null : clickedEntity.id);
      return;
    }

    // Telestrator Drawing start
    if (telestratorTool !== 'select') {
      setIsDrawing(true);
      setCurrentPoints([pt]);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pt = getCanvasCoords(e);
    if (!pt) return;

    // Dragging homography anchor
    if (draggingAnchorIndex !== null && isCalibrating) {
      const updated = [...homographyAnchors];
      updated[draggingAnchorIndex] = pt;
      onUpdateAnchors(updated);
      return;
    }

    // Telestrator Drawing update
    if (isDrawing) {
      if (telestratorTool === 'freehand') {
        setCurrentPoints((prev) => [...prev, pt]);
      } else {
        // Line, Arrow, Circle, Spotlight, Zone: 2-point updates (start & current)
        setCurrentPoints((prev) => (prev.length > 0 ? [prev[0], pt] : [pt]));
      }
    }
  };

  const handleMouseUp = () => {
    if (draggingAnchorIndex !== null) {
      setDraggingAnchorIndex(null);
    }

    if (isDrawing && currentPoints.length > 0) {
      setIsDrawing(false);
      if (telestratorTool !== 'select') {
        onAddAnnotation({
          id: `anno-${Date.now()}`,
          type: telestratorTool as any,
          color: telestratorColor,
          points: currentPoints,
          timestamp: currentFrame.timestampSec,
        });
      }
      setCurrentPoints([]);
    }
  };

  return (
    <div className="flex flex-col bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
      {/* Broadcast Header & Layer Toggles */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-950/90 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-semibold">
            <span className="h-2 w-2 rounded-full bg-red-500 animate-ping mr-0.5" />
            <span>2D BROADCAST FEED</span>
          </div>
          {currentFrame.eventTag && (
            <span className="hidden md:inline text-xs font-medium text-amber-300 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded truncate max-w-xs">
              ⚡ {currentFrame.eventTag}
            </span>
          )}
        </div>

        {/* Layer Toggles */}
        <div className="flex items-center gap-1">
          <button
            id="toggle-bbox-btn"
            onClick={() => setShowBBoxes(!showBBoxes)}
            className={`px-2 py-1 rounded text-[11px] font-medium transition-all ${
              showBBoxes
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'text-slate-500 bg-slate-900 border border-slate-800'
            }`}
            title="Toggle YOLO Bounding Boxes"
          >
            YOLO BBox
          </button>
          <button
            id="toggle-labels-btn"
            onClick={() => setShowLabels(!showLabels)}
            className={`px-2 py-1 rounded text-[11px] font-medium transition-all ${
              showLabels
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-500 bg-slate-900 border border-slate-800'
            }`}
            title="Toggle Player Names & Jerseynumbers"
          >
            Tags
          </button>
          <button
            id="toggle-vectors-btn"
            onClick={() => setShowVectors(!showVectors)}
            className={`px-2 py-1 rounded text-[11px] font-medium transition-all ${
              showVectors
                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                : 'text-slate-500 bg-slate-900 border border-slate-800'
            }`}
            title="Toggle Velocity & Speed Vectors"
          >
            Vectors
          </button>
          <button
            id="toggle-homography-btn"
            onClick={() => setShowHomographyGrid(!showHomographyGrid)}
            className={`px-2 py-1 rounded text-[11px] font-medium transition-all ${
              showHomographyGrid
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'text-slate-500 bg-slate-900 border border-slate-800'
            }`}
            title="Toggle 4-Point Homography Perspective Grid"
          >
            Homography
          </button>
        </div>
      </div>

      {/* Main Broadcast Canvas Area */}
      <div 
        ref={containerRef} 
        className="relative w-full aspect-video bg-slate-950 overflow-hidden select-none cursor-crosshair group"
      >
        {/* If custom video uploaded */}
        {customVideoUrl && (
          <video
            ref={videoRef}
            src={customVideoUrl}
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
            muted
            playsInline
          />
        )}

        {/* The interactive overlay canvas */}
        <canvas
          ref={canvasRef}
          width={1280}
          height={720}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          className="absolute inset-0 w-full h-full object-contain"
        />

        {/* Calibration Banner if active */}
        {isCalibrating && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-amber-950/90 border border-amber-500/60 text-amber-200 px-3 py-1 rounded-full text-xs font-semibold shadow-lg backdrop-blur-md flex items-center gap-2 animate-bounce pointer-events-none">
            <Crosshair className="h-3.5 w-3.5 text-amber-400" />
            <span>Drag the 4 corner handles to calibrate pitch homography</span>
          </div>
        )}

        {/* Timestamp & Phase HUD Pill */}
        <div className="absolute bottom-3 left-3 bg-slate-950/85 border border-slate-800 text-white px-3 py-1.5 rounded-lg text-xs font-mono backdrop-blur-md flex items-center gap-2 pointer-events-none">
          <span className="font-bold text-emerald-400">{currentFrame.timeDisplay}</span>
          <span className="text-slate-600">|</span>
          <span className="text-slate-300 capitalize">{currentFrame.phase.replace('_', ' ')}</span>
        </div>
      </div>

      {/* Video Scrubber & Playback Controls */}
      <div className="p-3 bg-slate-950 border-t border-slate-800/80 flex flex-col gap-2">
        {/* Timeline Slider */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono text-slate-400 w-10 text-right">
            {currentFrame.timeDisplay}
          </span>
          <div className="relative flex-1 flex items-center">
            <input
              id="timeline-frame-slider"
              type="range"
              min={0}
              max={Math.max(0, allFrames.length - 1)}
              value={currentFrameIndex}
              onChange={(e) => onSeekFrame(Number(e.target.value))}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 hover:accent-emerald-400"
            />
            {/* Key Event Markers on Timeline */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-between px-1">
              {allFrames.map((f, idx) => f.eventTag ? (
                <div
                  key={idx}
                  style={{ left: `${(idx / (allFrames.length - 1)) * 100}%` }}
                  className="absolute w-2 h-2 rounded-full bg-amber-400 -translate-x-1 ring-2 ring-slate-950 shadow"
                  title={f.eventTag}
                />
              ) : null)}
            </div>
          </div>
          <span className="text-[11px] font-mono text-slate-400 w-10">
            {allFrames[allFrames.length - 1]?.timeDisplay || '00:00'}
          </span>
        </div>

        {/* Playback Buttons & Speed Selector */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Step Back (-0.4s) */}
            <button
              id="step-back-btn"
              onClick={() => onSeekFrame(Math.max(0, currentFrameIndex - 1))}
              className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors"
              title="Step backward 1 frame"
            >
              <SkipBack className="h-4 w-4" />
            </button>

            {/* Play / Pause Toggle */}
            <button
              id="play-pause-btn"
              onClick={onTogglePlay}
              className={`flex items-center justify-center h-8 w-8 rounded-full text-white font-bold transition-all shadow-md active:scale-95 ${
                isPlaying
                  ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-white shadow-emerald-500/20'
              }`}
              title="Play / Pause (Spacebar)"
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
            </button>

            {/* Step Forward (+0.4s) */}
            <button
              id="step-forward-btn"
              onClick={() => onSeekFrame(Math.min(allFrames.length - 1, currentFrameIndex + 1))}
              className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors"
              title="Step forward 1 frame"
            >
              <SkipForward className="h-4 w-4" />
            </button>
          </div>

          {/* Speed Presets */}
          <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-lg border border-slate-800">
            {[0.25, 0.5, 1.0, 2.0].map((s) => (
              <button
                key={s}
                id={`playback-speed-${s}x`}
                onClick={() => onChangeSpeed(s)}
                className={`px-2 py-0.5 rounded text-[11px] font-mono font-medium transition-all ${
                  playbackSpeed === s
                    ? 'bg-slate-800 text-white border border-slate-700 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// =======================================================
// CANVAS DRAWING HELPER FUNCTIONS
// =======================================================

function drawSyntheticBroadcastScene(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  frame: FrameData,
  sport: SportType,
  teamAColor: string,
  teamBColor: string
) {
  // 1. Background Field with Realistic Broadcast Stadium Camera Angle
  if (sport === 'football') {
    // Stadium grass with angled camera perspective
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#0a2318');
    grad.addColorStop(0.5, '#0f3827');
    grad.addColorStop(1, '#081d14');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Mown grass strips
    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
    for (let i = 0; i < 14; i++) {
      if (i % 2 === 0) {
        ctx.beginPath();
        const topX = (i / 14) * w;
        const botX = ((i - 1) / 14) * w * 1.2;
        ctx.moveTo(topX, 0);
        ctx.lineTo(topX + w / 14, 0);
        ctx.lineTo(botX + (w / 14) * 1.2, h);
        ctx.lineTo(botX, h);
        ctx.closePath();
        ctx.fill();
      }
    }

    // Perspective pitch white boundary lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(w * 0.12, h * 0.22);
    ctx.lineTo(w * 0.88, h * 0.22);
    ctx.lineTo(w * 0.96, h * 0.88);
    ctx.lineTo(w * 0.04, h * 0.88);
    ctx.closePath();
    ctx.stroke();

    // Center line in perspective
    ctx.beginPath();
    ctx.moveTo(w * 0.50, h * 0.22);
    ctx.lineTo(w * 0.50, h * 0.88);
    ctx.stroke();

    // Center circle in perspective ellipse
    ctx.beginPath();
    ctx.ellipse(w * 0.50, h * 0.55, w * 0.09, h * 0.12, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (sport === 'hockey') {
    // Ice rink
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#091c33');
    grad.addColorStop(0.5, '#0f2a4a');
    grad.addColorStop(1, '#081729');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Ice sheen
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.fillRect(w * 0.05, h * 0.15, w * 0.9, h * 0.7);

    // Red center line & Blue lines in perspective
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.6)'; // Red center
    ctx.beginPath();
    ctx.moveTo(w * 0.5, h * 0.18);
    ctx.lineTo(w * 0.5, h * 0.84);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(59, 130, 246, 0.6)'; // Blue lines
    ctx.beginPath();
    ctx.moveTo(w * 0.35, h * 0.18);
    ctx.lineTo(w * 0.32, h * 0.84);
    ctx.moveTo(w * 0.65, h * 0.18);
    ctx.lineTo(w * 0.68, h * 0.84);
    ctx.stroke();
  } else {
    // Kabaddi Mat
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#3f1702');
    grad.addColorStop(0.5, '#541f02');
    grad.addColorStop(1, '#2c0e00');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Court border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 4;
    ctx.strokeRect(w * 0.15, h * 0.20, w * 0.70, h * 0.62);

    // Mid-line & Baulk/Bonus lines
    ctx.strokeStyle = '#fbbf24'; // Mid-line gold
    ctx.beginPath();
    ctx.moveTo(w * 0.50, h * 0.20);
    ctx.lineTo(w * 0.50, h * 0.82);
    ctx.stroke();

    ctx.strokeStyle = '#f87171'; // Baulk line
    ctx.beginPath();
    ctx.moveTo(w * 0.70, h * 0.20);
    ctx.lineTo(w * 0.72, h * 0.82);
    ctx.stroke();

    ctx.strokeStyle = '#34d399'; // Bonus line
    ctx.beginPath();
    ctx.moveTo(w * 0.80, h * 0.20);
    ctx.lineTo(w * 0.82, h * 0.82);
    ctx.stroke();
  }
}

function drawHomographyGridOverlay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  anchors: Point2D[],
  isCalibrating: boolean
) {
  if (anchors.length < 4) return;

  const pts = anchors.map((a) => ({ x: (a.x / 100) * w, y: (a.y / 100) * h }));

  // Draw perspective warped grid lines
  ctx.save();
  ctx.strokeStyle = isCalibrating ? 'rgba(245, 158, 11, 0.8)' : 'rgba(245, 158, 11, 0.25)';
  ctx.lineWidth = isCalibrating ? 2 : 1;
  ctx.setLineDash(isCalibrating ? [4, 4] : [2, 2]);

  // Outer trapezoid
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  ctx.lineTo(pts[1].x, pts[1].y);
  ctx.lineTo(pts[2].x, pts[2].y);
  ctx.lineTo(pts[3].x, pts[3].y);
  ctx.closePath();
  ctx.stroke();

  // Internal perspective grid
  const divisions = 4;
  for (let i = 1; i < divisions; i++) {
    const t = i / divisions;
    // Horizontal lines
    const leftX = pts[0].x + (pts[3].x - pts[0].x) * t;
    const leftY = pts[0].y + (pts[3].y - pts[0].y) * t;
    const rightX = pts[1].x + (pts[2].x - pts[1].x) * t;
    const rightY = pts[1].y + (pts[2].y - pts[1].y) * t;

    ctx.beginPath();
    ctx.moveTo(leftX, leftY);
    ctx.lineTo(rightX, rightY);
    ctx.stroke();

    // Vertical lines
    const topX = pts[0].x + (pts[1].x - pts[0].x) * t;
    const topY = pts[0].y + (pts[1].y - pts[0].y) * t;
    const botX = pts[3].x + (pts[2].x - pts[3].x) * t;
    const botY = pts[3].y + (pts[2].y - pts[3].y) * t;

    ctx.beginPath();
    ctx.moveTo(topX, topY);
    ctx.lineTo(botX, botY);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Corner Anchor Handles
  if (isCalibrating) {
    pts.forEach((p, idx) => {
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#000000';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${idx + 1}`, p.x, p.y);
    });
  }
  ctx.restore();
}

function drawDetectedEntities(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  entities: DetectedEntity[],
  teamAColor: string,
  teamBColor: string,
  showBBoxes: boolean,
  showLabels: boolean,
  showVectors: boolean,
  selectedEntityId: string | null
) {
  entities.forEach((ent) => {
    const isSelected = ent.id === selectedEntityId;
    const color = ent.team === 'teamA' ? teamAColor : ent.team === 'teamB' ? teamBColor : '#e2e8f0';

    const bx = (ent.bbox.x / 100) * w;
    const by = (ent.bbox.y / 100) * h;
    const bw = (ent.bbox.w / 100) * w;
    const bh = (ent.bbox.h / 100) * h;
    const px = (ent.screenPos.x / 100) * w;
    const py = (ent.screenPos.y / 100) * h;

    // 1. Bounding Box
    if (showBBoxes) {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = isSelected ? 3 : 1.5;
      ctx.strokeRect(bx, by, bw, bh);

      // Corner accents
      const cornerLen = 5;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(bx, by + cornerLen);
      ctx.lineTo(bx, by);
      ctx.lineTo(bx + cornerLen, by);
      ctx.moveTo(bx + bw - cornerLen, by);
      ctx.lineTo(bx + bw, by);
      ctx.lineTo(bx + bw, by + cornerLen);
      ctx.stroke();
      ctx.restore();
    }

    // 2. Base Pitch Anchor Ring
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(px, py, bw * 0.8, bw * 0.35, 0, 0, Math.PI * 2);
    ctx.fillStyle = ent.hasPossession ? 'rgba(251, 191, 36, 0.4)' : `${color}33`;
    ctx.fill();
    ctx.strokeStyle = ent.hasPossession ? '#fbbf24' : color;
    ctx.lineWidth = ent.hasPossession || isSelected ? 2.5 : 1.2;
    ctx.stroke();

    // 3. Velocity direction arrow
    if (showVectors && ent.speedKmh > 5) {
      const vx = ent.velocity.x * 12;
      const vy = ent.velocity.y * 12;
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + vx, py + vy);
      ctx.stroke();
    }

    // 4. Label Badge
    if (showLabels) {
      const tagText = `${ent.jerseyNumber ? `#${ent.jerseyNumber} ` : ''}${ent.name.split(' ')[0]}`;
      ctx.font = 'bold 11px sans-serif';
      const textWidth = ctx.measureText(tagText).width;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(bx, by - 16, textWidth + 8, 14);

      ctx.fillStyle = color;
      ctx.fillRect(bx, by - 16, 3, 14);

      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(tagText, bx + 6, by - 9);
    }
    ctx.restore();
  });
}

function drawBall(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  ballPos: Point2D,
  sport: SportType
) {
  const bx = (ballPos.x / 100) * w;
  const by = (ballPos.y / 100) * h;

  ctx.save();
  // Ball shadow
  ctx.beginPath();
  ctx.ellipse(bx, by + 4, 6, 2.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.fill();

  // Ball / Puck
  ctx.beginPath();
  ctx.arc(bx, by, sport === 'hockey' ? 4 : 5, 0, Math.PI * 2);
  ctx.fillStyle = sport === 'hockey' ? '#0f172a' : '#ffffff';
  ctx.fill();
  ctx.strokeStyle = sport === 'hockey' ? '#94a3b8' : '#000000';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();
}

function drawSingleAnnotation(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  anno: DrawingAnnotation
) {
  if (anno.points.length === 0) return;
  const pts = anno.points.map((p) => ({ x: (p.x / 100) * w, y: (p.y / 100) * h }));

  ctx.save();
  ctx.strokeStyle = anno.color;
  ctx.fillStyle = anno.color;
  ctx.lineWidth = 3;

  if (anno.type === 'freehand') {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.stroke();
  } else if (anno.type === 'line' && pts.length >= 2) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    ctx.lineTo(pts[1].x, pts[1].y);
    ctx.stroke();
  } else if (anno.type === 'arrow' && pts.length >= 2) {
    const p1 = pts[0];
    const p2 = pts[1];
    const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const headLen = 14;

    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(p2.x, p2.y);
    ctx.lineTo(p2.x - headLen * Math.cos(angle - Math.PI / 6), p2.y - headLen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(p2.x - headLen * Math.cos(angle + Math.PI / 6), p2.y - headLen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
  } else if (anno.type === 'circle' && pts.length >= 2) {
    const p1 = pts[0];
    const p2 = pts[1];
    const radius = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    ctx.beginPath();
    ctx.arc(p1.x, p1.y, radius, 0, Math.PI * 2);
    ctx.stroke();
  } else if (anno.type === 'spotlight' && pts.length >= 2) {
    const p1 = pts[0];
    const p2 = pts[1];
    const radius = Math.hypot(p2.x - p1.x, p2.y - p1.y);

    const grad = ctx.createRadialGradient(p1.x, p1.y, 0, p1.x, p1.y, radius);
    grad.addColorStop(0, 'rgba(251, 191, 36, 0.4)');
    grad.addColorStop(1, 'rgba(251, 191, 36, 0.0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(p1.x, p1.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (anno.type === 'zone' && pts.length >= 2) {
    const p1 = pts[0];
    const p2 = pts[1];
    const rx = Math.min(p1.x, p2.x);
    const ry = Math.min(p1.y, p2.y);
    const rw = Math.abs(p2.x - p1.x);
    const rh = Math.abs(p2.y - p1.y);

    ctx.fillStyle = `${anno.color}33`;
    ctx.fillRect(rx, ry, rw, rh);
    ctx.strokeRect(rx, ry, rw, rh);
  }
  ctx.restore();
}
