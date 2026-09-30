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

    // 2. Draw Active View Mode Layer - with rink clipping for hockey so overlays stay inside boards
    const drawOverlayClipped = (drawFn: () => void) => {
      if (sport === 'hockey') {
        // Clip to rink interior so Voronoi/Heatmap/Hull/xT don't spill onto dark arena
        const rinkX = width * 0.04 + 4;
        const rinkY = height * 0.06 + 4;
        const rinkW = width * 0.92 - 8;
        const rinkH = height * 0.88 - 8;
        const r = Math.min(rinkW, rinkH) * 0.08 - 4;
        ctx.save();
        ctx.beginPath();
        // @ts-ignore
        if (ctx.roundRect) ctx.roundRect(rinkX, rinkY, rinkW, rinkH, Math.max(0, r));
        else ctx.rect(rinkX, rinkY, rinkW, rinkH);
        ctx.clip();
        drawFn();
        ctx.restore();
      } else {
        drawFn();
      }
    };

    if (viewMode === 'voronoi') {
      drawOverlayClipped(() => drawVoronoiLayer(ctx, width, height, voronoiResult.cells, teamAColor, teamBColor));
    } else if (viewMode === 'heatmap') {
      drawOverlayClipped(() => drawHeatmapLayer(ctx, width, height, heatmapData.grid));
    } else if (viewMode === 'hull') {
      drawOverlayClipped(() => drawHullLayer(ctx, width, height, compactnessA.hullPoints, compactnessB.hullPoints, teamAColor, teamBColor));
    } else if (viewMode === 'xt') {
      drawOverlayClipped(() => drawXTLayer(ctx, width, height));
    } else if (viewMode === 'passing') {
      // Passing network should stay visible over lines, clip slightly but keep nodes visible
      drawOverlayClipped(() => drawPassingNetworkLayer(ctx, width, height, passingNetworkA, teamAColor, passingNetworkB, teamBColor));
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
        selectedEntityId,
        sport
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
    // === HOCKEY RINK - PROFESSIONAL ICE SURFACE (DO NOT TOUCH FOOTBALL) ===
    // 1. Arena exterior (dark)
    const arenaGrad = ctx.createLinearGradient(0, 0, w, h);
    arenaGrad.addColorStop(0, '#020a18');
    arenaGrad.addColorStop(0.5, '#0a1d33');
    arenaGrad.addColorStop(1, '#020a18');
    ctx.fillStyle = arenaGrad;
    ctx.fillRect(0, 0, w, h);

    // 2. Rink boards outer shadow / wall
    const rinkX = w * 0.04;
    const rinkY = h * 0.06;
    const rinkW = w * 0.92;
    const rinkH = h * 0.88;
    const boardRadius = Math.min(rinkW, rinkH) * 0.08; // NHL 28ft radius scaled

    ctx.save();
    // Board shadow
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    // @ts-ignore - roundRect may need fallback
    if (ctx.roundRect) {
      ctx.roundRect(rinkX, rinkY, rinkW, rinkH, boardRadius);
    } else {
      ctx.rect(rinkX, rinkY, rinkW, rinkH);
    }
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.restore();

    // 3. Ice surface inside boards
    const iceInset = 4;
    const iceX = rinkX + iceInset;
    const iceY = rinkY + iceInset;
    const iceW = rinkW - iceInset * 2;
    const iceH = rinkH - iceInset * 2;
    const iceRadius = Math.max(0, boardRadius - iceInset);

    // Ice base gradient - light ice blue
    const iceGrad = ctx.createLinearGradient(iceX, iceY, iceX + iceW, iceY + iceH);
    iceGrad.addColorStop(0, '#e8f4fc');
    iceGrad.addColorStop(0.18, '#f1f8fe');
    iceGrad.addColorStop(0.5, '#e6f0fa');
    iceGrad.addColorStop(0.82, '#f1f8fe');
    iceGrad.addColorStop(1, '#dbeaf7');
    ctx.fillStyle = iceGrad;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(iceX, iceY, iceW, iceH, iceRadius);
    } else {
      ctx.rect(iceX, iceY, iceW, iceH);
    }
    ctx.fill();

    // 4. Ice texture - subtle horizontal skate marks / reflection
    ctx.save();
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(iceX, iceY, iceW, iceH, iceRadius);
    } else {
      ctx.rect(iceX, iceY, iceW, iceH);
    }
    ctx.clip();

    // Subtle glossy reflection stripe
    const sheenGrad = ctx.createLinearGradient(iceX, iceY, iceX, iceY + iceH);
    sheenGrad.addColorStop(0, 'rgba(255,255,255,0.18)');
    sheenGrad.addColorStop(0.12, 'rgba(255,255,255,0.06)');
    sheenGrad.addColorStop(0.5, 'rgba(255,255,255,0)');
    sheenGrad.addColorStop(0.9, 'rgba(14,165,233,0.04)');
    ctx.fillStyle = sheenGrad;
    ctx.fillRect(iceX, iceY, iceW, iceH * 0.6);

    // Very subtle ice texture lines (like resurfacer)
    ctx.strokeStyle = 'rgba(148,163,184,0.07)';
    ctx.lineWidth = 0.6;
    for (let i = 0; i < 6; i++) {
      const y = iceY + (iceH * (0.15 + i * 0.12));
      ctx.beginPath();
      ctx.moveTo(iceX + iceW * 0.05, y);
      ctx.lineTo(iceX + iceW * 0.95, y);
      ctx.stroke();
    }
    ctx.restore();

    // 5. Boards inner highlight line
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(iceX, iceY, iceW, iceH, iceRadius);
    } else {
      ctx.rect(iceX, iceY, iceW, iceH);
    }
    ctx.stroke();

    // Boards thick outer line
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(rinkX, rinkY, rinkW, rinkH, boardRadius);
    } else {
      ctx.rect(rinkX, rinkY, rinkW, rinkH);
    }
    ctx.stroke();
  } else {
    ctx.fillStyle = '#0f172a';
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
    // ===== HOCKEY RINK MARKINGS - NHL SPEC TOP-DOWN (DO NOT TOUCH FOOTBALL) =====
    const rinkX = w * 0.04;
    const rinkY = h * 0.06;
    const rinkW = w * 0.92;
    const rinkH = h * 0.88;
    const iceInset = 4;
    const iceX = rinkX + iceInset;
    const iceY = rinkY + iceInset;
    const iceW = rinkW - iceInset * 2;
    const iceH = rinkH - iceInset * 2;

    // Helper: get rink coords helper
    const rx = (pct: number) => iceX + iceW * pct;
    const ry = (pct: number) => iceY + iceH * pct;

    // --- 1. Red Center Line (thick) ---
    ctx.save();
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = Math.max(3, w * 0.004);
    ctx.beginPath();
    ctx.moveTo(rx(0.5), iceY);
    ctx.lineTo(rx(0.5), iceY + iceH);
    ctx.stroke();
    // Thin white outlines on center line
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(rx(0.5) - 2, iceY);
    ctx.lineTo(rx(0.5) - 2, iceY + iceH);
    ctx.moveTo(rx(0.5) + 2, iceY);
    ctx.lineTo(rx(0.5) + 2, iceY + iceH);
    ctx.stroke();
    ctx.restore();

    // --- 2. Blue Lines (thick, NHL 12") ---
    ctx.save();
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = Math.max(4, w * 0.006);
    const blue1X = rx(0.325); // 75ft from boards = 32.5% from left
    const blue2X = rx(0.675);
    ctx.beginPath();
    ctx.moveTo(blue1X, iceY);
    ctx.lineTo(blue1X, iceY + iceH);
    ctx.moveTo(blue2X, iceY);
    ctx.lineTo(blue2X, iceY + iceH);
    ctx.stroke();
    // White outline
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(blue1X - 3, iceY);
    ctx.lineTo(blue1X - 3, iceY + iceH);
    ctx.moveTo(blue1X + 3, iceY);
    ctx.lineTo(blue1X + 3, iceY + iceH);
    ctx.moveTo(blue2X - 3, iceY);
    ctx.lineTo(blue2X - 3, iceY + iceH);
    ctx.moveTo(blue2X + 3, iceY);
    ctx.lineTo(blue2X + 3, iceY + iceH);
    ctx.stroke();
    ctx.restore();

    // --- 3. Goal Lines (red, thin, 2" - 11ft from boards) ---
    ctx.save();
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 1.8;
    const goalLx = rx(0.055); // 11ft / 200ft = 0.055 from edge
    const goalRx = rx(0.945);
    ctx.beginPath();
    ctx.moveTo(goalLx, iceY);
    ctx.lineTo(goalLx, iceY + iceH);
    ctx.moveTo(goalRx, iceY);
    ctx.lineTo(goalRx, iceY + iceH);
    ctx.stroke();
    ctx.restore();

    // --- 4. Goal Crease (blue, semi-circles at each goal) ---
    ctx.save();
    // Crease fill light blue
    ctx.fillStyle = 'rgba(37, 99, 235, 0.18)';
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 1.5;
    const creaseRadius = iceH * 0.075; // 6ft radius scaled
    const creaseW = iceW * 0.018; // 4ft deep
    // Left crease (home) - semi circle to right
    ctx.beginPath();
    ctx.arc(goalLx, ry(0.5), creaseRadius, -Math.PI * 0.5, Math.PI * 0.5, false);
    ctx.lineTo(goalLx - creaseW * 0.3, ry(0.5) + creaseRadius);
    ctx.lineTo(goalLx - creaseW * 0.3, ry(0.5) - creaseRadius);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Right crease
    ctx.beginPath();
    ctx.arc(goalRx, ry(0.5), creaseRadius, Math.PI * 0.5, -Math.PI * 0.5, false);
    ctx.lineTo(goalRx + creaseW * 0.3, ry(0.5) - creaseRadius);
    ctx.lineTo(goalRx + creaseW * 0.3, ry(0.5) + creaseRadius);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Goal nets (small rectangles behind goal line)
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1;
    const netW = iceW * 0.015;
    const netH = iceH * 0.09;
    // Left net
    ctx.fillRect(goalLx - netW - 1, ry(0.5) - netH / 2, netW, netH);
    ctx.strokeRect(goalLx - netW - 1, ry(0.5) - netH / 2, netW, netH);
    // net mesh lines
    ctx.strokeStyle = 'rgba(148,163,184,0.4)';
    ctx.lineWidth = 0.5;
    for (let i = 1; i < 3; i++) {
      const y = ry(0.5) - netH / 2 + (netH * i) / 3;
      ctx.beginPath();
      ctx.moveTo(goalLx - netW - 1, y);
      ctx.lineTo(goalLx - 1, y);
      ctx.stroke();
    }
    // Right net
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1;
    ctx.fillRect(goalRx + 1, ry(0.5) - netH / 2, netW, netH);
    ctx.strokeRect(goalRx + 1, ry(0.5) - netH / 2, netW, netH);
    ctx.strokeStyle = 'rgba(148,163,184,0.4)';
    ctx.lineWidth = 0.5;
    for (let i = 1; i < 3; i++) {
      const y = ry(0.5) - netH / 2 + (netH * i) / 3;
      ctx.beginPath();
      ctx.moveTo(goalRx + 1, y);
      ctx.lineTo(goalRx + netW + 1, y);
      ctx.stroke();
    }
    ctx.restore();

    // --- 5. Trapezoid behind net (NHL) ---
    ctx.save();
    ctx.strokeStyle = 'rgba(220,38,38,0.85)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    const trapGoalW = iceH * 0.13; // 22ft at goal line (11ft each side)
    const trapBoardW = iceH * 0.165; // 28ft at boards (14ft each side)
    // Left trapezoid
    ctx.beginPath();
    ctx.moveTo(goalLx, ry(0.5) - trapGoalW / 2);
    ctx.lineTo(iceX, ry(0.5) - trapBoardW / 2);
    ctx.moveTo(goalLx, ry(0.5) + trapGoalW / 2);
    ctx.lineTo(iceX, ry(0.5) + trapBoardW / 2);
    // Right trapezoid
    ctx.moveTo(goalRx, ry(0.5) - trapGoalW / 2);
    ctx.lineTo(iceX + iceW, ry(0.5) - trapBoardW / 2);
    ctx.moveTo(goalRx, ry(0.5) + trapGoalW / 2);
    ctx.lineTo(iceX + iceW, ry(0.5) + trapBoardW / 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // --- 6. Center Ice Circle (15ft radius) + Center Dot + Logo shadow ---
    ctx.save();
    const centerRadius = Math.min(iceW, iceH) * 0.095; // 15ft
    // Thin blue outer
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(rx(0.5), ry(0.5), centerRadius, 0, Math.PI * 2);
    ctx.stroke();
    // Inner red thin
    ctx.strokeStyle = 'rgba(220,38,38,0.9)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(rx(0.5), ry(0.5), centerRadius - 3, 0, Math.PI * 2);
    ctx.stroke();
    // Center dot (12" diameter - 6")
    ctx.fillStyle = '#2563eb';
    ctx.beginPath();
    ctx.arc(rx(0.5), ry(0.5), Math.max(3.5, iceW * 0.006), 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    // Center line dot vertical small
    ctx.fillStyle = 'rgba(220,38,38,0.15)';
    ctx.beginPath();
    ctx.arc(rx(0.5), ry(0.5), centerRadius + 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // --- 7. Faceoff Dots and Circles (9 dots, 8 circles) ---
    const faceoffRadius = Math.min(iceW, iceH) * 0.078; // 15ft
    const dotRadius = Math.max(3, iceW * 0.0065);
    // Positions normalized to ice (0-1)
    // End zone: 44ft from goal line (0.22 from edge), 22ft from side (0.31,0.69)
    // Neutral: 5ft beyond blue (approx)
    const faceoffSpots = [
      // End zone Left
      { x: 0.21, y: 0.31, hasCircle: true },
      { x: 0.21, y: 0.69, hasCircle: true },
      // End zone Right
      { x: 0.79, y: 0.31, hasCircle: true },
      { x: 0.79, y: 0.69, hasCircle: true },
      // Neutral Left
      { x: 0.38, y: 0.31, hasCircle: false },
      { x: 0.38, y: 0.69, hasCircle: false },
      // Neutral Right
      { x: 0.62, y: 0.31, hasCircle: false },
      { x: 0.62, y: 0.69, hasCircle: false },
      // Center
      { x: 0.5, y: 0.5, hasCircle: false, isCenter: true },
    ];

    // Draw circles first (only end zones have full circles)
    ctx.save();
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 1.4;
    faceoffSpots.forEach((spot) => {
      if (!spot.hasCircle) return;
      ctx.beginPath();
      ctx.arc(rx(spot.x), ry(spot.y), faceoffRadius, 0, Math.PI * 2);
      ctx.stroke();

      // Hash marks - 4 L-shaped per circle (NHL spec: 2ft lines, 4 per circle)
      // Top/Bottom/Left/Right hash pairs
      const hashLen = faceoffRadius * 0.28;
      const gap = faceoffRadius * 0.15;
      const cx = rx(spot.x);
      const cy = ry(spot.y);

      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth = 1.2;
      // Helper to draw L hash
      const drawHashL = (x: number, y: number, dirX: number, dirY: number) => {
        // dir indicates quadrant
        // Horizontal part
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + dirX * hashLen, y);
        ctx.stroke();
        // Vertical part
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + dirY * hashLen);
        ctx.stroke();
      };

      // 4 hashes around circle cardinal gaps
      // Top-left hash (above circle, left side)
      // Positions: just outside circle at N/E/S/W with offset
      // Simplified: 4 clusters at NE,NW,SE,SW
      const r = faceoffRadius;
      // Top side 2 hashes
      drawHashL(cx - r * 0.55, cy - r - gap * 0.5, -hashLen * 0.3, -hashLen * 0.6);
      drawHashL(cx + r * 0.55, cy - r - gap * 0.5, hashLen * 0.3, -hashLen * 0.6);
      // Bottom side
      drawHashL(cx - r * 0.55, cy + r + gap * 0.5, -hashLen * 0.3, hashLen * 0.6);
      drawHashL(cx + r * 0.55, cy + r + gap * 0.5, hashLen * 0.3, hashLen * 0.6);
    });
    ctx.restore();

    // Draw all dots (9)
    faceoffSpots.forEach((spot) => {
      if (spot.isCenter) return; // already drawn
      ctx.save();
      ctx.fillStyle = '#dc2626';
      ctx.beginPath();
      ctx.arc(rx(spot.x), ry(spot.y), dotRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.arc(rx(spot.x), ry(spot.y), dotRadius + 0.6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    });

    // --- 8. Neutral zone faceoff hash marks (small red L near blue lines) ---
    ctx.save();
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 1;
    // Small marks at blue lines for neutral dots reference
    [blue1X, blue2X].forEach((bx) => {
      [ry(0.31), ry(0.69)].forEach((by) => {
        // Tiny dot already, add subtle cross hint
        ctx.fillStyle = 'rgba(220,38,38,0.12)';
        ctx.beginPath();
        ctx.arc(bx, by, dotRadius * 1.8, 0, Math.PI * 2);
        ctx.fill();
      });
    });
    ctx.restore();

    // --- 9. Faceoff hash marks in neutral zone (vertical small lines on ice) ---
    // Already covered, add subtle zone shading
    ctx.save();
    // Neutral zone slightly darker ice tint
    ctx.fillStyle = 'rgba(37,99,235,0.03)';
    ctx.fillRect(blue1X, iceY, blue2X - blue1X, iceH);
    // Defensive zones slightly shaded
    ctx.fillStyle = 'rgba(220,38,38,0.02)';
    ctx.fillRect(iceX, iceY, goalLx - iceX, iceH);
    ctx.fillRect(goalRx, iceY, iceX + iceW - goalRx, iceH);
    ctx.restore();

    // --- 10. Boards advertising stripe (subtle) ---
    ctx.save();
    ctx.strokeStyle = 'rgba(14,165,233,0.18)';
    ctx.lineWidth = 0.8;
    ctx.setLineDash([8, 6]);
    const adY = iceY + iceH * 0.92;
    ctx.beginPath();
    ctx.moveTo(iceX + iceW * 0.05, adY);
    ctx.lineTo(iceX + iceW * 0.95, adY);
    ctx.stroke();
    ctx.setLineDash([]);
    // Add text hint "ICE" watermark
    ctx.fillStyle = 'rgba(148,163,184,0.08)';
    ctx.font = `bold ${Math.max(10, iceH * 0.09)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Watermark only if space
    ctx.fillText('ICE HOCKEY', rx(0.5), ry(0.5) + iceH * 0.38);
    ctx.restore();
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
  selectedEntityId: string | null,
  sport?: SportType
) {
  // FOOTBALL PATH UNCHANGED - hockey enhancement only when sport==='hockey'
  entities.forEach((ent) => {
    const isSelected = ent.id === selectedEntityId;
    const color = ent.team === 'teamA' ? teamAColor : ent.team === 'teamB' ? teamBColor : '#94a3b8';
    const px = (ent.pitchPos.x / 100) * w;
    const py = (ent.pitchPos.y / 100) * h;

    ctx.save();

    // 1. Velocity trajectory vector (clean small arrow) - SAME FOR BOTH SPORTS
    if (ent.speedKmh > 4 && ent.velocity) {
      const vx = Math.max(-18, Math.min(18, ent.velocity.x * 10));
      const vy = Math.max(-18, Math.min(18, ent.velocity.y * 10));
      if (Math.hypot(vx, vy) > 2) {
        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + vx, py + vy);
        ctx.stroke();
      }
    }

    // 2. Possession aura or selected ring - SAME
    if (ent.hasPossession || isSelected) {
      ctx.beginPath();
      ctx.arc(px, py, 14, 0, Math.PI * 2);
      ctx.fillStyle = ent.hasPossession ? 'rgba(251, 191, 36, 0.35)' : 'rgba(34, 211, 238, 0.35)';
      ctx.fill();
      ctx.strokeStyle = ent.hasPossession ? '#fbbf24' : '#22d3ee';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // 3. Player Marker - STRICT HOCKEY ONLY ENHANCEMENT (football untouched)
    const isGoalie = ent.role === 'goalkeeper';
    const isHockeyGoalie = sport === 'hockey' && isGoalie;
    const baseRadius = isSelected ? 9 : 7.5;
    const radius = isHockeyGoalie ? baseRadius + 1.5 : baseRadius;

    // For hockey goalie ONLY, draw subtle rectangular pad hint behind circle - football goalie stays circle
    if (isHockeyGoalie) {
      ctx.fillStyle = `${color}22`;
      ctx.fillRect(px - radius - 1, py - radius * 0.7, radius * 2 + 2, radius * 1.4);
      ctx.strokeStyle = `${color}66`;
      ctx.lineWidth = 1;
      ctx.strokeRect(px - radius - 1, py - radius * 0.7, radius * 2 + 2, radius * 1.4);
    }

    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 4. Jersey Number inside circle - SAME
    if (ent.jerseyNumber) {
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${isHockeyGoalie ? '7' : '8'}px sans-serif`;
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
  if (sport === 'hockey') {
    // === HOCKEY PUCK - PROFESSIONAL (DO NOT TOUCH FOOTBALL) ===
    // Puck shadow on ice
    ctx.beginPath();
    ctx.ellipse(bx, by + 3, 5.5, 2.2, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.22)';
    ctx.fill();

    // Puck body - black vulcanized rubber with subtle gradient
    const puckRadius = 4.2;
    const grad = ctx.createRadialGradient(bx - 1, by - 1, 1, bx, by, puckRadius);
    grad.addColorStop(0, '#334155');
    grad.addColorStop(0.55, '#0f172a');
    grad.addColorStop(1, '#020617');
    ctx.beginPath();
    ctx.arc(bx, by, puckRadius, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // Puck edge highlight
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.lineWidth = 0.9;
    ctx.stroke();

    // Inner white ring like puck edge stripe
    ctx.strokeStyle = 'rgba(148,163,184,0.9)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.arc(bx, by, puckRadius - 1.1, 0, Math.PI * 2);
    ctx.stroke();

    // Motion trail for fast puck
    // Glow removed for puck - instead subtle ice reflection
    ctx.beginPath();
    ctx.arc(bx, by, 7.5, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(14,165,233,0.22)';
    ctx.lineWidth = 0.9;
    ctx.setLineDash([2, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
  } else {
    // === FOOTBALL BALL - UNCHANGED ===
    ctx.beginPath();
    ctx.arc(bx, by, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Glow ring
    ctx.beginPath();
    ctx.arc(bx, by, 7, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
}
