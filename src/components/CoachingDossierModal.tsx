import React, { useState } from 'react';
import { AIReportData, TacticalMetrics, TeamConfig, SportType } from '../types';
import { 
  FileText, 
  Sparkles, 
  Printer, 
  CheckCircle, 
  AlertTriangle, 
  Zap, 
  Compass, 
  Dumbbell, 
  X, 
  RefreshCw,
  Award,
  Shield,
  Layers
} from 'lucide-react';

interface CoachingDossierModalProps {
  isOpen: boolean;
  onClose: () => void;
  reportData: AIReportData | null;
  isLoading: boolean;
  onGenerateReport: () => void;
  teamA: TeamConfig;
  teamB: TeamConfig;
  sport: SportType;
  metrics: TacticalMetrics;
  pitchControlA: number;
}

export const CoachingDossierModal: React.FC<CoachingDossierModalProps> = ({
  isOpen,
  onClose,
  reportData,
  isLoading,
  onGenerateReport,
  teamA,
  teamB,
  sport,
  metrics,
  pitchControlA,
}) => {
  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col text-slate-100 print:bg-white print:text-black print:border-none print:shadow-none">
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between sticky top-0 bg-slate-900/95 backdrop-blur-md z-10 print:static print:bg-white">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white print:text-black">
                  Tactical Coaching Dossier & Match Report
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  AI CV Powered
                </span>
              </div>
              <p className="text-xs text-slate-400 print:text-slate-600">
                {sport.toUpperCase()} | {teamA.name} ({metrics.detectedFormationA}) vs {teamB.name} ({metrics.detectedFormationB})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 print:hidden">
            <button
              id="refresh-ai-report-btn"
              onClick={onGenerateReport}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>{isLoading ? 'Analyzing...' : 'Re-Generate with AI'}</span>
            </button>

            <button
              id="print-coaching-report-btn"
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition-colors"
            >
              <Printer className="h-3.5 w-3.5 text-slate-400" />
              <span>Print / PDF</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6">
          {isLoading ? (
            <div className="py-16 text-center space-y-3">
              <div className="h-12 w-12 rounded-full border-4 border-emerald-500/20 border-t-emerald-500 animate-spin mx-auto" />
              <p className="text-sm font-semibold text-slate-200">
                Gemini Vision is synthesizing computer vision tracking telemetry...
              </p>
              <p className="text-xs text-slate-500">
                Evaluating Voronoi space occupation, pressing triggers, and defensive compactness
              </p>
            </div>
          ) : reportData ? (
            <>
              {/* Telemetry Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-2xl bg-slate-950/70 border border-slate-800 print:bg-slate-100 print:border-slate-300">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Pitch Dominance</span>
                  <span className="text-lg font-mono font-bold text-emerald-400 print:text-emerald-700">
                    {teamA.shortName} {pitchControlA}%
                  </span>
                </div>
                <div className="p-3 rounded-2xl bg-slate-950/70 border border-slate-800 print:bg-slate-100 print:border-slate-300">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Pressing (PPDA)</span>
                  <span className="text-lg font-mono font-bold text-purple-400 print:text-purple-700">
                    {metrics.ppdaTeamA}
                  </span>
                </div>
                <div className="p-3 rounded-2xl bg-slate-950/70 border border-slate-800 print:bg-slate-100 print:border-slate-300">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Defensive Area</span>
                  <span className="text-lg font-mono font-bold text-cyan-400 print:text-cyan-700">
                    {metrics.compactnessA.convexHullAreaSqM} m²
                  </span>
                </div>
                <div className="p-3 rounded-2xl bg-slate-950/70 border border-slate-800 print:bg-slate-100 print:border-slate-300">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Threat Level</span>
                  <span className="text-lg font-mono font-bold text-amber-400 print:text-amber-700">
                    +{metrics.expectedThreatTeamA.toFixed(2)} xT
                  </span>
                </div>
              </div>

              {/* 1. Tactical Narrative Overview */}
              <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 print:bg-slate-50 print:border-slate-300">
                <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4" />
                  <span>Executive Tactical Analysis</span>
                </h3>
                <p className="text-sm text-slate-200 leading-relaxed print:text-slate-800">
                  {reportData.tacticalSummary}
                </p>
              </div>

              {/* 2. Strengths & Tactical Vulnerabilities */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Structural Strengths */}
                <div className="p-4 rounded-2xl bg-slate-950/60 border border-emerald-900/30 print:bg-emerald-50 print:border-emerald-200">
                  <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <CheckCircle className="h-4 w-4 text-emerald-400" />
                    <span>Structural Strengths</span>
                  </h4>
                  <ul className="space-y-2">
                    {reportData.structuralStrengths.map((str, idx) => (
                      <li key={idx} className="text-xs text-slate-300 flex items-start gap-2 print:text-slate-800">
                        <span className="text-emerald-400 font-bold">•</span>
                        <span>{str}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Tactical Vulnerabilities */}
                <div className="p-4 rounded-2xl bg-slate-950/60 border border-rose-900/30 print:bg-rose-50 print:border-rose-200">
                  <h4 className="text-xs font-bold text-rose-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4 text-rose-400" />
                    <span>Tactical Vulnerabilities & Risk Areas</span>
                  </h4>
                  <ul className="space-y-2">
                    {reportData.tacticalVulnerabilities.map((vul, idx) => (
                      <li key={idx} className="text-xs text-slate-300 flex items-start gap-2 print:text-slate-800">
                        <span className="text-rose-400 font-bold">•</span>
                        <span>{vul}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* 3. Actionable Coaching Directives (Half-Time Talk) */}
              <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 print:bg-slate-50 print:border-slate-300">
                <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Zap className="h-4 w-4 text-cyan-400" />
                  <span>Actionable Coaching Directives (Team Adjustments)</span>
                </h4>
                <div className="space-y-2">
                  {reportData.coachingDirectives.map((dir, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-start gap-2.5 text-xs text-slate-200 print:bg-white print:border-slate-200 print:text-slate-800"
                    >
                      <span className="h-5 w-5 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold text-[10px] shrink-0">
                        {idx + 1}
                      </span>
                      <span>{dir}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 4. Opponent Counter-Strategy */}
              <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 print:bg-slate-50 print:border-slate-300">
                <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <Compass className="h-4 w-4 text-amber-400" />
                  <span>Opponent Counter-Strategy</span>
                </h4>
                <p className="text-xs text-slate-300 leading-relaxed print:text-slate-800">
                  {reportData.counterStrategy}
                </p>
              </div>

              {/* 5. Recommended Training Drill */}
              {reportData.recommendedDrill && (
                <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-950/30 to-slate-950 border border-emerald-500/30 print:bg-slate-100 print:border-slate-300">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-emerald-500/20 mb-3">
                    <div className="flex items-center gap-2">
                      <Dumbbell className="h-4 w-4 text-emerald-400" />
                      <h4 className="text-sm font-bold text-white print:text-black">
                        {reportData.recommendedDrill.title}
                      </h4>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] font-mono">
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                        ⏱ {reportData.recommendedDrill.duration}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                        ⚡ {reportData.recommendedDrill.intensity}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div>
                      <strong className="text-emerald-400 block mb-0.5">Objective:</strong>
                      <p className="text-slate-300 print:text-slate-800">{reportData.recommendedDrill.objective}</p>
                    </div>
                    <div>
                      <strong className="text-cyan-400 block mb-0.5">Setup & Instructions:</strong>
                      <p className="text-slate-300 print:text-slate-800 leading-relaxed">{reportData.recommendedDrill.instructions}</p>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="py-12 text-center">
              <button
                onClick={onGenerateReport}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold shadow-lg shadow-emerald-900/40 transition-all active:scale-95"
              >
                Generate Tactical AI Report
              </button>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-500 print:hidden">
          <span>Broadcast-to-Tactics Computer Vision Engine</span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition-colors"
          >
            Close Dossier
          </button>
        </div>
      </div>
    </div>
  );
};
