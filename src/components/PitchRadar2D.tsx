import React, { useRef, useEffect, useState, useMemo } from 'react';
import { 
  DetectedEntity, 
  FrameData, 
  PassingNetworkData, 
  SportDimension, 
  SportType, 
  Point2D 
} from '../types';
import { 
  computeVoronoiPitchControl, 
  computeTeamCompactness, 
  computeSpatialHeatmapGrid, 
  XT_PITCH_GRID 
} from '../services/cvPipeline';
import { 
  Radar, 
  Grid, 
  Flame, 
  GitBranch, 
  BoxSelect, 
  Target, 
  User, 
  TrendingUp, 
  Zap,
  ShieldAlert
} from 'lucide-react';

export type RadarViewMode = 'radar' | 'voronoi' | 'passing' | 'heatmap' | 'hull' | 'xt';

interface PitchRadar2DProps {
  currentFrame: FrameData;
  allFrames: FrameData[];
  sport: SportType;
  dimension: SportDimension;
  teamAName: string;
  teamBName: string;
  teamAColor: string;
  teamBColor: string;
  passingNetworkA: PassingNetworkData;
  passingNetworkB: PassingNetworkData;
  selectedEntityId: string | null;
  onSelectEntity: (id: string | null) => void;
}

export const PitchRadar2D: React.FC<PitchRadar2DProps> = ({
  currentFrame,
  allFrames,
  sport,
  dimension,
  teamAName,
  teamBName,
  teamAColor,
  teamBColor,
  passingNetworkA,
  passingNetworkB,
  selectedEntityId,
  onSelectEntity,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [viewMode, setViewMode] = useState<RadarViewMode>('radar');
  const [heatmapTarget, setHeatmapTarget] = useState<'all' | 'teamA' | 'teamB' | 'selected'>('all');

  // Compute Voronoi pitch control
  const voronoiResult = useMemo(() => {
    return computeVoronoiPitchControl(currentFrame.entities);
  }, [currentFrame.entities]);

  // Compute Defensive Compactness
  const compactnessA = useMemo(() => {
    return computeTeamCompactness(currentFrame.entities, 'teamA', dimension.lengthMeters, dimension.widthMeters);
  }, [currentFrame.entities, dimension]);

  const compactnessB = useMemo(() => {
    return computeTeamCompactness(currentFrame.entities, 'teamB', dimension.lengthMeters, dimension.widthMeters);
  }, [currentFrame.entities, dimension]);

  // Compute Continuous Heatmap points
  const heatmapData = useMemo(() => {
    const pts: Point2D[] = [];
    allFrames.forEach((f) => {
      f.entities.forEach((e) => {
        if (heatmapTarget === 'all') {
          pts.push(e.pitchPos);
        } else if (heatmapTarget === 'teamA' && e.team === 'teamA') {
          pts.push(e.pitchPos);
        } else if (heatmapTarget === 'teamB' && e.team === 'teamB') {
          pts.push(e.pitchPos);
        } else if (heatmapTarget === 'selected' && e.id === selectedEntityId) {
          pts.push(e.pitchPos);
        }
      });
    });
    return computeSpatialHeatmapGrid(pts, 50, 35, 7.0);
  }, [allFrames, heatmapTarget, selectedEntityId]);

  // Selected player info
  const selectedEntity = useMemo(() => {
    return currentFrame.entities.find((e) => e.id === selectedEntityId) || null;
  }, [currentFrame.entities, selectedEntityId]);

  // Render 2D Top-Down Pitch Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    // 1. Draw Sport Pitch Ground (Grass / Ice / Mat)
    drawPitchBackground(ctx, width, height, sport, dimension);

    // 2. Draw Active View Mode Layer
    if (viewMode === 'voronoi') {
      drawVoronoiLayer(ctx, width, height, voronoiResult.cells, teamAColor, teamBColor);
    } else if (viewMode === 'heatmap') {
      drawHeatmapLayer(ctx, width, height, heatmapData.grid);
    } else if (viewMode === 'hull') {
      drawHullLayer(ctx, width, height, compactnessA.hullPoints, compactnessB.hullPoints, teamAColor, teamBColor);
    } else if (viewMode === 'xt') {
      drawXTLayer(ctx, width, height);
    } else if (viewMode === 'passing') {
      drawPassingNetworkLayer(ctx, width, height, passingNetworkA, teamAColor, passingNetworkB, teamBColor);
    }

    // 3. Draw Pitch Geometry Markings (Lines, Circles, Penalty Boxes, Baulk lines)
    drawPitchMarkings(ctx, width, height, sport);

    // 4. Draw 2D Player Radar Markers (if not in pure heatmap mode or passing mode)
    if (viewMode !== 'heatmap') {
      drawRadarPlayers(
        ctx,
        width,
        height,
        currentFrame.entities,
        teamAColor,
        teamBColor,
        selectedEntityId
      );
    }

    // 5. Draw Ball / Puck in 2D
    if (currentFrame.ballPos) {
      drawRadarBall(ctx, width, height, currentFrame.ballPos, sport);
    }
  }, [
    currentFrame,
    sport,
    dimension,
    viewMode,
    voronoiResult,
    compactnessA,
    compactnessB,
    heatmapData,
    passingNetworkA,
    passingNetworkB,
    teamAColor,
    teamBColor,
    selectedEntityId
  ]);

  // Handle canvas click to select player
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    const clicked = currentFrame.entities.find((ent) => {
      const dist = Math.hypot(ent.pitchPos.x - x, ent.pitchPos.y - y);
      return dist < 5;
    });

    onSelectEntity(clicked ? clicked.id : null);
  };

  return (
    <div className="flex flex-col bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
      {/* 2D View Mode Selector Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-slate-950/90 border-b border-slate-800/80">
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold">
            <Radar className="h-3.5 w-3.5" />
            <span>2D TOP-DOWN RADAR</span>
          </div>
        </div>

        {/* View Mode Buttons */}
        <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
          {[
            { id: 'radar', label: 'Radar', icon: <Radar className="h-3 w-3" /> },
            { id: 'voronoi', label: 'Pitch Control', icon: <Grid className="h-3 w-3" /> },
            { id: 'passing', label: 'Pass Network', icon: <GitBranch className="h-3 w-3" /> },
            { id: 'heatmap', label: 'Heatmap', icon: <Flame className="h-3 w-3" /> },
            { id: 'hull', label: 'Compactness', icon: <BoxSelect className="h-3 w-3" /> },
            { id: 'xt', label: 'xThreat (xT)', icon: <Target className="h-3 w-3" /> },
          ].map((tab) => {
            const active = viewMode === tab.id;
            return (
              <button
                key={tab.id}
                id={`radar-view-${tab.id}`}
                onClick={() => setViewMode(tab.id as RadarViewMode)}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-all ${
                  active
                    ? 'bg-slate-800 text-white font-semibold border border-slate-700 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.icon}
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Heatmap Target Sub-filter if in Heatmap mode */}
      {viewMode === 'heatmap' && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-slate-950/60 border-b border-slate-800/60 text-xs">
          <span className="text-slate-400 font-medium">Density Source:</span>
          {(['all', 'teamA', 'teamB', 'selected'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setHeatmapTarget(t)}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all ${
                heatmapTarget === t
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {t === 'all' ? 'All Tracking' : t === 'teamA' ? teamAName : t === 'teamB' ? teamBName : 'Selected Player'}
            </button>
          ))}
        </div>
      )}

      {/* 2D Canvas Container */}
      <div className="relative w-full aspect-[16/10] bg-slate-950 overflow-hidden flex items-center justify-center">
        <canvas
          ref={canvasRef}
          width={1000}
          height={650}
          onClick={handleCanvasClick}
          className="w-full h-full object-contain cursor-pointer"
        />

        {/* Selected Player HUD Card */}
        {selectedEntity && (
          <div className="absolute top-3 right-3 bg-slate-950/95 border border-slate-800 rounded-xl p-3 shadow-2xl backdrop-blur-md min-w-[200px] text-xs">
            <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2 mb-2">
              <div className="flex items-center gap-2">
                <div 
                  className="h-6 w-6 rounded-full flex items-center justify-center font-bold text-white text-[11px]"
                  style={{ backgroundColor: selectedEntity.team === 'teamA' ? teamAColor : teamBColor }}
                >
                  {selectedEntity.jerseyNumber || '#'}
                </div>
                <div>
                  <div className="font-bold text-white">{selectedEntity.name}</div>
                  <div className="text-[10px] text-slate-400 capitalize">{selectedEntity.role}</div>
                </div>
              </div>
              <button
                onClick={() => onSelectEntity(null)}
                className="text-slate-500 hover:text-slate-300 font-bold px-1"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div>
                <span className="text-slate-500 block">Speed:</span>
                <span className="font-mono font-bold text-emerald-400">{selectedEntity.speedKmh} km/h</span>
              </div>
              <div>
                <span className="text-slate-500 block">Distance:</span>
                <span className="font-mono font-bold text-cyan-400">{selectedEntity.distanceCoveredMeters} m</span>
              </div>
              <div>
                <span className="text-slate-500 block">Pitch Coord:</span>
                <span className="font-mono text-slate-300">
                  ({Math.round(selectedEntity.pitchPos.x)}, {Math.round(selectedEntity.pitchPos.y)})
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Possession:</span>
                <span className="font-mono font-bold text-amber-400">
                  {selectedEntity.hasPossession ? 'Active Ball' : 'Off-ball'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Live Spatial Pitch Control Legend Bar (when in Voronoi view) */}
        {viewMode === 'voronoi' && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-slate-950/90 border border-slate-800 px-4 py-1.5 rounded-full backdrop-blur-md flex items-center gap-4 text-xs font-mono shadow-xl">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: teamAColor }} />
              <span className="text-white font-bold">{teamAName}:</span>
              <span className="text-emerald-400 font-bold">{voronoiResult.pitchControlA}%</span>
            </div>
            <span className="text-slate-600">vs</span>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: teamBColor }} />
              <span className="text-white font-bold">{teamBName}:</span>
              <span className="text-rose-400 font-bold">{voronoiResult.pitchControlB}%</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// =======================================================
// 2D CANVAS DRAWING FUNCTIONS
// =======================================================

function drawPitchBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  sport: SportType,
  dimension: SportDimension
) {
  if (sport === 'football') {
    // 2D Grass Pattern
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, '#0d281a');
    grad.addColorStop(0.5, '#123825');
    grad.addColorStop(1, '#0d281a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Mown strip lines
    ctx.fillStyle = 'rgba(255, 255, 255, 0.025)';
    const strips = 12;
    for (let i = 0; i < strips; i++) {
      if (i % 2 === 0) {
        ctx.fillRect((i / strips) * w, 0, w / strips, h);
      }
    }
  } else if (sport === 'hockey') {
    // Ice Surface
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#0a1d33');
    grad.addColorStop(0.5, '#0f2c4d');
    grad.addColorStop(1, '#071626');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  } else {
    // Kabaddi Mat
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#381402');
    grad.addColorStop(0.5, '#4a1b03');
    grad.addColorStop(1, '#2a0e01');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }
}

function drawPitchMarkings(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  sport: SportType
) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.lineWidth = 2;

  if (sport === 'football') {
    // Outer touchlines
    ctx.strokeRect(w * 0.04, h * 0.06, w * 0.92, h * 0.88);

    // Halfway line
    ctx.beginPath();
    ctx.moveTo(w * 0.5, h * 0.06);
    ctx.lineTo(w * 0.5, h * 0.94);
    ctx.stroke();

    // Center Circle & Center Spot
    ctx.beginPath();
    ctx.arc(w * 0.5, h * 0.5, h * 0.18, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.beginPath();
    ctx.arc(w * 0.5, h * 0.5, 3, 0, Math.PI * 2);
    ctx.fill();

    // Left Penalty Box & 6-Yard Box
    ctx.strokeRect(w * 0.04, h * 0.22, w * 0.16, h * 0.56);
    ctx.strokeRect(w * 0.04, h * 0.36, w * 0.06, h * 0.28);

    // Right Penalty Box & 6-Yard Box
    ctx.strokeRect(w * 0.80, h * 0.22, w * 0.16, h * 0.56);
    ctx.strokeRect(w * 0.90, h * 0.36, w * 0.06, h * 0.28);

    // Goal posts
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(w * 0.025, h * 0.42, w * 0.015, h * 0.16);
    ctx.fillRect(w * 0.96, h * 0.42, w * 0.015, h * 0.16);
  } else if (sport === 'hockey') {
    // Rounded Rink Board
    ctx.beginPath();
    ctx.roundRect(w * 0.04, h * 0.06, w * 0.92, h * 0.88, 30);
    ctx.stroke();

    // Red Center line
    ctx.strokeStyle = '#ef4444';
    ctx.beginPath();
    ctx.moveTo(w * 0.5, h * 0.06);
    ctx.lineTo(w * 0.5, h * 0.94);
    ctx.stroke();

    // Blue Lines
    ctx.strokeStyle = '#3b82f6';
    ctx.beginPath();
    ctx.moveTo(w * 0.33, h * 0.06);
    ctx.lineTo(w * 0.33, h * 0.94);
    ctx.moveTo(w * 0.67, h * 0.06);
    ctx.lineTo(w * 0.67, h * 0.94);
    ctx.stroke();

    // Face-off circles
    ctx.strokeStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(w * 0.20, h * 0.30, h * 0.12, 0, Math.PI * 2);
    ctx.arc(w * 0.20, h * 0.70, h * 0.12, 0, Math.PI * 2);
    ctx.arc(w * 0.80, h * 0.30, h * 0.12, 0, Math.PI * 2);
    ctx.arc(w * 0.80, h * 0.70, h * 0.12, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    // Kabaddi Court
    ctx.strokeRect(w * 0.08, h * 0.10, w * 0.84, h * 0.80);

    // Lobbies
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(w * 0.08, h * 0.10, w * 0.84, h * 0.12);
    ctx.fillRect(w * 0.08, h * 0.78, w * 0.84, h * 0.12);

    // Mid-line
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(w * 0.5, h * 0.10);
    ctx.lineTo(w * 0.5, h * 0.90);
    ctx.stroke();

    // Baulk lines
    ctx.strokeStyle = '#f87171';
    ctx.beginPath();
    ctx.moveTo(w * 0.70, h * 0.22);
    ctx.lineTo(w * 0.70, h * 0.78);
    ctx.moveTo(w * 0.30, h * 0.22);
    ctx.lineTo(w * 0.30, h * 0.78);
    ctx.stroke();

    // Bonus lines
    ctx.strokeStyle = '#34d399';
    ctx.beginPath();
    ctx.moveTo(w * 0.80, h * 0.22);
    ctx.lineTo(w * 0.80, h * 0.78);
    ctx.moveTo(w * 0.20, h * 0.22);
    ctx.lineTo(w * 0.20, h * 0.78);
    ctx.stroke();
  }
  ctx.restore();
}

function drawVoronoiLayer(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  cells: any[],
  teamAColor: string,
  teamBColor: string
) {
  ctx.save();
  cells.forEach((cell) => {
    if (!cell.polygon || cell.polygon.length === 0) return;
    const color = cell.team === 'teamA' ? teamAColor : teamBColor;

    ctx.beginPath();
    ctx.moveTo((cell.polygon[0][0] / 100) * w, (cell.polygon[0][1] / 100) * h);
    for (let i = 1; i < cell.polygon.length; i++) {
      ctx.lineTo((cell.polygon[i][0] / 100) * w, (cell.polygon[i][1] / 100) * h);
    }
    ctx.closePath();

    ctx.fillStyle = `${color}26`; // 15% opacity
    ctx.fill();
    ctx.strokeStyle = `${color}66`; // 40% opacity
    ctx.lineWidth = 1.2;
    ctx.stroke();
  });
  ctx.restore();
}

function drawHeatmapLayer(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  grid: number[][]
) {
  if (!grid || grid.length === 0) return;
  const rows = grid.length;
  const cols = grid[0].length;
  const cellW = w / cols;
  const cellH = h / rows;

  ctx.save();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const val = grid[r][c];
      if (val < 0.05) continue;

      let rCol = 0;
      let gCol = 0;
      let bCol = 0;

      // Color mapping: Cyan -> Lime -> Yellow -> Red
      if (val < 0.3) {
        const t = val / 0.3;
        rCol = 14;
        gCol = Math.round(165 * t);
        bCol = 233;
      } else if (val < 0.6) {
        const t = (val - 0.3) / 0.3;
        rCol = Math.round(16 + 230 * t);
        gCol = 185;
        bCol = Math.round(129 * (1 - t));
      } else {
        const t = (val - 0.6) / 0.4;
        rCol = 239;
        gCol = Math.round(180 * (1 - t));
        bCol = 68;
      }

      ctx.fillStyle = `rgba(${rCol}, ${gCol}, ${bCol}, ${val * 0.75})`;
      ctx.fillRect(c * cellW, r * cellH, cellW + 1, cellH + 1);
    }
  }
  ctx.restore();
}

function drawHullLayer(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  hullA: Point2D[],
  hullB: Point2D[],
  teamAColor: string,
  teamBColor: string
) {
  const drawHull = (pts: Point2D[], color: string, label: string) => {
    if (pts.length < 3) return;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo((pts[0].x / 100) * w, (pts[0].y / 100) * h);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo((pts[i].x / 100) * w, (pts[i].y / 100) * h);
    }
    ctx.closePath();
    ctx.fillStyle = `${color}2a`;
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.restore();
  };

  drawHull(hullA, teamAColor, 'Team A Compactness');
  drawHull(hullB, teamBColor, 'Team B Compactness');
}

function drawXTLayer(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number
) {
  const rows = XT_PITCH_GRID.length;
  const cols = XT_PITCH_GRID[0].length;
  const cellW = w / cols;
  const cellH = h / rows;

  ctx.save();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const threat = XT_PITCH_GRID[r][c];
      const intensity = threat / 0.94; // normalized

      // Red color gradient for threat
      ctx.fillStyle = `rgba(239, 68, 68, ${intensity * 0.6})`;
      ctx.fillRect(c * cellW, r * cellH, cellW, cellH);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.strokeRect(c * cellW, r * cellH, cellW, cellH);

      // Label xT value
      if (cellW > 30) {
        ctx.fillStyle = intensity > 0.4 ? '#ffffff' : 'rgba(255, 255, 255, 0.4)';
        ctx.font = '8px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`+${threat.toFixed(2)}`, (c + 0.5) * cellW, (r + 0.5) * cellH);
      }
    }
  }
  ctx.restore();
}

function drawPassingNetworkLayer(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  netA: PassingNetworkData,
  colorA: string,
  netB: PassingNetworkData,
  colorB: string
) {
  const drawNet = (net: PassingNetworkData, color: string) => {
    // Draw Edges
    net.edges.forEach((edge) => {
      const fromNode = net.nodes.find((n) => n.id === edge.fromId);
      const toNode = net.nodes.find((n) => n.id === edge.toId);
      if (!fromNode || !toNode) return;

      const p1x = (fromNode.avgPitchPos.x / 100) * w;
      const p1y = (fromNode.avgPitchPos.y / 100) * h;
      const p2x = (toNode.avgPitchPos.x / 100) * w;
      const p2y = (toNode.avgPitchPos.y / 100) * h;

      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1.5, Math.min(6, edge.count / 4));
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.moveTo(p1x, p1y);
      ctx.lineTo(p2x, p2y);
      ctx.stroke();

      // Draw arrow head
      const angle = Math.atan2(p2y - p1y, p2x - p1x);
      const headLen = 10;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(p2x, p2y);
      ctx.lineTo(p2x - headLen * Math.cos(angle - Math.PI / 6), p2y - headLen * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(p2x - headLen * Math.cos(angle + Math.PI / 6), p2y - headLen * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    });

    // Draw Nodes
    net.nodes.forEach((node) => {
      const nx = (node.avgPitchPos.x / 100) * w;
      const ny = (node.avgPitchPos.y / 100) * h;
      const radius = 9 + (node.centrality || 0.5) * 10;

      ctx.save();
      ctx.beginPath();
      ctx.arc(nx, ny, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${node.jerseyNumber}`, nx, ny);
      ctx.restore();
    });
  };

  drawNet(netA, colorA);
  drawNet(netB, colorB);
}

function drawRadarPlayers(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  entities: DetectedEntity[],
  teamAColor: string,
  teamBColor: string,
  selectedEntityId: string | null
) {
  entities.forEach((ent) => {
    const isSelected = ent.id === selectedEntityId;
    const color = ent.team === 'teamA' ? teamAColor : ent.team === 'teamB' ? teamBColor : '#94a3b8';
    const px = (ent.pitchPos.x / 100) * w;
    const py = (ent.pitchPos.y / 100) * h;

    ctx.save();

    // 1. Velocity trajectory vector
    if (ent.speedKmh > 5) {
      const vx = ent.velocity.x * 12;
      const vy = ent.velocity.y * 12;
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + vx, py + vy);
      ctx.stroke();
    }

    // 2. Possession aura or selected ring
    if (ent.hasPossession || isSelected) {
      ctx.beginPath();
      ctx.arc(px, py, 14, 0, Math.PI * 2);
      ctx.fillStyle = ent.hasPossession ? 'rgba(251, 191, 36, 0.35)' : 'rgba(34, 211, 238, 0.35)';
      ctx.fill();
      ctx.strokeStyle = ent.hasPossession ? '#fbbf24' : '#22d3ee';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // 3. Player Circle Marker
    ctx.beginPath();
    ctx.arc(px, py, isSelected ? 9 : 7.5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 4. Jersey Number inside circle
    if (ent.jerseyNumber) {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 8px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${ent.jerseyNumber}`, px, py);
    }

    ctx.restore();
  });
}

function drawRadarBall(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  ballPos: Point2D,
  sport: SportType
) {
  const bx = (ballPos.x / 100) * w;
  const by = (ballPos.y / 100) * h;

  ctx.save();
  ctx.beginPath();
  ctx.arc(bx, by, sport === 'hockey' ? 3.5 : 4.5, 0, Math.PI * 2);
  ctx.fillStyle = sport === 'hockey' ? '#0f172a' : '#ffffff';
  ctx.fill();
  ctx.strokeStyle = sport === 'hockey' ? '#94a3b8' : '#000000';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Glow ring
  ctx.beginPath();
  ctx.arc(bx, by, 7, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}
