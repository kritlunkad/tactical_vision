import React, { useState } from 'react';
import { PassingNetworkData, TeamConfig } from '../types';
import { GitBranch, Activity, Compass, TrendingUp, CheckCircle2, ArrowRight } from 'lucide-react';

interface PassingNetworkViewProps {
  networkA: PassingNetworkData;
  networkB: PassingNetworkData;
  teamA: TeamConfig;
  teamB: TeamConfig;
}

export const PassingNetworkView: React.FC<PassingNetworkViewProps> = ({
  networkA,
  networkB,
  teamA,
  teamB,
}) => {
  const [activeTeamTab, setActiveTeamTab] = useState<'teamA' | 'teamB'>('teamA');

  const net = activeTeamTab === 'teamA' ? networkA : networkB;
  const currentTeam = activeTeamTab === 'teamA' ? teamA : teamB;

  // Sorted nodes by centrality / touches
  const sortedNodes = [...net.nodes].sort((a, b) => b.touches - a.touches);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl backdrop-blur-md">
      {/* Header & Team Switcher */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <GitBranch className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              Passing Network & Spatial Channels
            </h3>
            <p className="text-xs text-slate-400">
              Graph connectivity, key distribution hubs, and progression directness
            </p>
          </div>
        </div>

        {/* Team Switcher Tabs */}
        <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveTeamTab('teamA')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
              activeTeamTab === 'teamA'
                ? 'bg-slate-800 text-white shadow-sm border border-slate-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: teamA.primaryColor }} />
            <span>{teamA.name}</span>
          </button>
          <button
            onClick={() => setActiveTeamTab('teamB')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
              activeTeamTab === 'teamB'
                ? 'bg-slate-800 text-white shadow-sm border border-slate-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: teamB.primaryColor }} />
            <span>{teamB.name}</span>
          </button>
        </div>
      </div>

      {/* Network High-level Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 my-4">
        <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Pass Accuracy</span>
          <span className="text-lg font-mono font-bold text-emerald-400">{net.passAccuracy}%</span>
          <span className="text-[10px] text-slate-500 block">Circulation stability</span>
        </div>

        <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Dominant Channel</span>
          <span className="text-sm font-bold text-amber-300 truncate block mt-0.5">{net.dominantChannnel}</span>
          <span className="text-[10px] text-slate-500 block">Primary progression flank</span>
        </div>

        <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Directness Index</span>
          <span className="text-lg font-mono font-bold text-cyan-400">{net.directnessIndex}/100</span>
          <span className="text-[10px] text-slate-500 block">
            {net.directnessIndex > 60 ? 'Direct / Vertical' : 'Positional / Patient'}
          </span>
        </div>

        <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Key Playmaker Hub</span>
          <span className="text-sm font-bold text-purple-300 truncate block mt-0.5">
            {sortedNodes[0]?.name || 'N/A'} (#{sortedNodes[0]?.jerseyNumber})
          </span>
          <span className="text-[10px] text-slate-500 block">Highest graph centrality</span>
        </div>
      </div>

      {/* Top Passing Combinations & Nodes Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Top Pass Combinations */}
        <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80">
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5 text-emerald-400" />
            <span>Top Passing Combinations</span>
          </h4>

          {net.edges.length === 0 ? (
            <p className="text-xs text-slate-500 py-3 text-center">Solo attacking phase, no passing matrix available.</p>
          ) : (
            <div className="space-y-2">
              {net.edges.slice(0, 5).map((edge, idx) => {
                const fromNode = net.nodes.find((n) => n.id === edge.fromId);
                const toNode = net.nodes.find((n) => n.id === edge.toId);
                return (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2 rounded-lg bg-slate-900/80 border border-slate-800 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-slate-500">#{idx + 1}</span>
                      <span className="font-semibold text-white">
                        {fromNode?.name.split(' ')[0]} (#{fromNode?.jerseyNumber})
                      </span>
                      <ArrowRight className="h-3 w-3 text-slate-500" />
                      <span className="font-semibold text-white">
                        {toNode?.name.split(' ')[0]} (#{toNode?.jerseyNumber})
                      </span>
                    </div>

                    <div className="flex items-center gap-3 font-mono">
                      <span className="text-emerald-400 font-bold">{edge.count} passes</span>
                      <span className="text-slate-400">{edge.avgDistanceMeters}m</span>
                      <span className="text-amber-400 text-[11px] font-semibold">+{edge.xThreatGained.toFixed(2)} xT</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Player Graph Involvement Hubs */}
        <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80">
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
            <Compass className="h-3.5 w-3.5 text-cyan-400" />
            <span>Player Involvements & Centrality</span>
          </h4>

          <div className="max-h-[220px] overflow-y-auto space-y-1.5 pr-1">
            {sortedNodes.map((node) => (
              <div
                key={node.id}
                className="flex items-center justify-between p-1.5 rounded-lg bg-slate-900/60 hover:bg-slate-900 border border-slate-800/60 text-xs transition-colors"
              >
                <div className="flex items-center gap-2">
                  <div
                    className="h-5 w-5 rounded-full flex items-center justify-center font-bold text-white text-[10px]"
                    style={{ backgroundColor: currentTeam.primaryColor }}
                  >
                    {node.jerseyNumber}
                  </div>
                  <span className="font-medium text-slate-200">{node.name}</span>
                  <span className="text-[10px] text-slate-500 capitalize">({node.role})</span>
                </div>

                <div className="flex items-center gap-3 font-mono text-[11px]">
                  <span className="text-slate-300">{node.touches} touches</span>
                  <div className="flex items-center gap-1">
                    <span className="text-slate-500">Centrality:</span>
                    <div className="w-12 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-cyan-400 rounded-full"
                        style={{ width: `${Math.round(node.centrality * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
