import React from 'react';
import { TacticalMetrics, SportType, TeamConfig } from '../types';
import { 
  ShieldCheck, 
  Target, 
  Activity, 
  Compass, 
  TrendingUp, 
  Zap, 
  Grid, 
  Layers,
  ArrowRight,
  Maximize2
} from 'lucide-react';

interface TacticalMetricsPanelProps {
  metrics: TacticalMetrics;
  teamA: TeamConfig;
  teamB: TeamConfig;
  sport: SportType;
  pitchControlA: number;
  pitchControlB: number;
  detectedFormationA: string;
  detectedFormationB: string;
  phase: string;
}

export const TacticalMetricsPanel: React.FC<TacticalMetricsPanelProps> = ({
  metrics,
  teamA,
  teamB,
  sport,
  pitchControlA,
  pitchControlB,
  detectedFormationA,
  detectedFormationB,
  phase,
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
      {/* CARD 1: Automated Formation & Tactical Phase */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 shadow-lg flex flex-col justify-between backdrop-blur-md">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-emerald-400" />
            <span>Formation Detection</span>
          </span>
          <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 uppercase">
            {phase.replace('_', ' ')}
          </span>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between p-2 rounded-xl bg-slate-950/70 border border-slate-800/80">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: teamA.primaryColor }} />
              <span className="text-xs font-bold text-white truncate max-w-[100px]">{teamA.name}</span>
            </div>
            <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
              {detectedFormationA}
            </span>
          </div>

          <div className="flex items-center justify-between p-2 rounded-xl bg-slate-950/70 border border-slate-800/80">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: teamB.primaryColor }} />
              <span className="text-xs font-bold text-white truncate max-w-[100px]">{teamB.name}</span>
            </div>
            <span className="text-xs font-mono font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/30">
              {detectedFormationB}
            </span>
          </div>
        </div>

        <div className="mt-2 text-[10px] text-slate-500 flex items-center gap-1">
          <Activity className="h-3 w-3 text-emerald-400" />
          <span>Real-time dynamic shape clustering active</span>
        </div>
      </div>

      {/* CARD 2: Voronoi Pitch Control & Space Dominance */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 shadow-lg flex flex-col justify-between backdrop-blur-md">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Grid className="h-3.5 w-3.5 text-cyan-400" />
            <span>Spatial Pitch Control</span>
          </span>
          <span className="text-[10px] font-mono text-cyan-400 font-bold">Voronoi Area</span>
        </div>

        <div className="my-auto space-y-2">
          <div className="flex justify-between text-xs font-bold font-mono">
            <span className="text-emerald-400">{teamA.shortName} {pitchControlA}%</span>
            <span className="text-rose-400">{pitchControlB}% {teamB.shortName}</span>
          </div>

          {/* Dual bar */}
          <div className="h-3 w-full bg-slate-950 rounded-full overflow-hidden flex border border-slate-800 p-0.5">
            <div
              className="h-full rounded-l-full transition-all duration-500"
              style={{ width: `${pitchControlA}%`, backgroundColor: teamA.primaryColor }}
            />
            <div
              className="h-full rounded-r-full transition-all duration-500"
              style={{ width: `${pitchControlB}%`, backgroundColor: teamB.primaryColor }}
            />
          </div>

          <div className="flex justify-between text-[11px] text-slate-400">
            <span>Possession: <strong className="text-white">{metrics.possessionA}%</strong></span>
            <span>Possession: <strong className="text-white">{metrics.possessionB}%</strong></span>
          </div>
        </div>

        <div className="mt-2 text-[10px] text-slate-500">
          Evaluates high-probability passing receipt zones
        </div>
      </div>

      {/* CARD 3: Defensive Line Compactness & Convex Hull */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 shadow-lg flex flex-col justify-between backdrop-blur-md">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-amber-400" />
            <span>Team Compactness</span>
          </span>
          <span className="text-[10px] font-mono text-amber-400 font-bold">Hull Area</span>
        </div>

        <div className="grid grid-cols-2 gap-2 my-auto">
          <div className="p-2 rounded-xl bg-slate-950/70 border border-slate-800/80">
            <div className="text-[10px] font-bold text-slate-400 truncate mb-1">{teamA.shortName} Block</div>
            <div className="text-sm font-mono font-bold text-white">
              {metrics.compactnessA.convexHullAreaSqM} <span className="text-[10px] text-slate-500">m²</span>
            </div>
            <div className="text-[10px] text-slate-400 flex justify-between mt-1">
              <span>Depth: <strong className="text-slate-200">{metrics.compactnessA.lineDepthMeters}m</strong></span>
              <span>Width: <strong className="text-slate-200">{metrics.compactnessA.teamWidthMeters}m</strong></span>
            </div>
          </div>

          <div className="p-2 rounded-xl bg-slate-950/70 border border-slate-800/80">
            <div className="text-[10px] font-bold text-slate-400 truncate mb-1">{teamB.shortName} Block</div>
            <div className="text-sm font-mono font-bold text-white">
              {metrics.compactnessB.convexHullAreaSqM} <span className="text-[10px] text-slate-500">m²</span>
            </div>
            <div className="text-[10px] text-slate-400 flex justify-between mt-1">
              <span>Depth: <strong className="text-slate-200">{metrics.compactnessB.lineDepthMeters}m</strong></span>
              <span>Width: <strong className="text-slate-200">{metrics.compactnessB.teamWidthMeters}m</strong></span>
            </div>
          </div>
        </div>

        <div className="mt-2 text-[10px] text-slate-500">
          Lower convex area = tighter defensive compression
        </div>
      </div>

      {/* CARD 4: Pressing Intensity (PPDA) & Expected Threat (xT) */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 shadow-lg flex flex-col justify-between backdrop-blur-md">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-purple-400" />
            <span>PPDA & Threat Index</span>
          </span>
          <span className="text-[10px] font-mono text-purple-400 font-bold">Press / xT</span>
        </div>

        <div className="grid grid-cols-2 gap-2 my-auto">
          <div className="p-2 rounded-xl bg-slate-950/70 border border-slate-800/80">
            <span className="text-[10px] text-slate-400 block">{teamA.shortName} PPDA</span>
            <span className="text-base font-mono font-bold text-purple-300">{metrics.ppdaTeamA}</span>
            <span className="text-[9px] text-emerald-400 block font-semibold mt-0.5">
              {metrics.ppdaTeamA < 9 ? 'High Aggression' : 'Mid Block'}
            </span>
          </div>

          <div className="p-2 rounded-xl bg-slate-950/70 border border-slate-800/80">
            <span className="text-[10px] text-slate-400 block">{teamA.shortName} xThreat</span>
            <span className="text-base font-mono font-bold text-amber-300">+{metrics.expectedThreatTeamA.toFixed(2)}</span>
            <span className="text-[9px] text-cyan-400 block font-semibold mt-0.5">
              Targeting Zone 14
            </span>
          </div>
        </div>

        <div className="mt-2 text-[10px] text-slate-500 flex justify-between">
          <span>{teamB.shortName} PPDA: <strong>{metrics.ppdaTeamB}</strong></span>
          <span>{teamB.shortName} xT: <strong>+{metrics.expectedThreatTeamB.toFixed(2)}</strong></span>
        </div>
      </div>
    </div>
  );
};
