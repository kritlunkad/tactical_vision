/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  SportType, 
  MatchData, 
  FrameData, 
  Point2D, 
  DrawingAnnotation, 
  AIReportData 
} from './types';
import { SAMPLE_MATCHES } from './data/sampleMatches';
import { 
  computeHomography, 
  applyHomography, 
  computeVoronoiPitchControl, 
  computeTeamCompactness 
} from './services/cvPipeline';
import { Header } from './components/Header';
import { BroadcastView } from './components/BroadcastView';
import { PitchRadar2D } from './components/PitchRadar2D';
import { TacticalMetricsPanel } from './components/TacticalMetricsPanel';
import { PassingNetworkView } from './components/PassingNetworkView';
import { TelestratorToolbar, TelestratorTool } from './components/TelestratorToolbar';
import { CoachingDossierModal } from './components/CoachingDossierModal';
import { AICoachChat } from './components/AICoachChat';
import { 
  Activity, 
  Layers, 
  Maximize2, 
  HelpCircle, 
  Sparkles, 
  CheckCircle2, 
  Sliders,
  Share2
} from 'lucide-react';

export default function App() {
  // Current active Sport & Match
  const [currentSport, setCurrentSport] = useState<SportType>('football');
  const matchData: MatchData = useMemo(() => SAMPLE_MATCHES[currentSport], [currentSport]);

  // Frame Timeline & Playback
  const [currentFrameIndex, setCurrentFrameIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);

  // Calibration 4-Point Homography State
  const [isCalibrating, setIsCalibrating] = useState<boolean>(false);
  const [homographyAnchors, setHomographyAnchors] = useState<Point2D[]>(
    () => matchData.frames[0]?.homographyCalibration || [
      { x: 12, y: 22 },
      { x: 88, y: 22 },
      { x: 96, y: 88 },
      { x: 4, y: 88 },
    ]
  );

  // Telestrator Annotations
  const [telestratorTool, setTelestratorTool] = useState<TelestratorTool>('select');
  const [telestratorColor, setTelestratorColor] = useState<string>('#fbbf24');
  const [annotations, setAnnotations] = useState<DrawingAnnotation[]>([]);
  const [showDrawings, setShowDrawings] = useState<boolean>(true);

  // Selected Player
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);

  // Custom Video Upload
  const [customVideoUrl, setCustomVideoUrl] = useState<string | null>(null);

  // Modals & Panels
  const [isReportModalOpen, setIsReportModalOpen] = useState<boolean>(false);
  const [isAIChatOpen, setIsAIChatOpen] = useState<boolean>(false);
  const [reportData, setReportData] = useState<AIReportData | null>(null);
  const [isLoadingReport, setIsLoadingReport] = useState<boolean>(false);

  // Update anchors when sport changes
  useEffect(() => {
    if (matchData.frames[0]?.homographyCalibration) {
      setHomographyAnchors(matchData.frames[0].homographyCalibration);
    }
    setCurrentFrameIndex(0);
    setAnnotations([]);
    setSelectedEntityId(null);
    setReportData(null);
  }, [matchData]);

  // Current Frame with Real-time Homography transformation applied
  const currentFrame: FrameData = useMemo(() => {
    const rawFrame = matchData.frames[currentFrameIndex] || matchData.frames[0];
    const matrix = computeHomography(homographyAnchors, [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ]);

    // Recalculate pitch coordinates dynamically based on homography
    const updatedEntities = rawFrame.entities.map((e) => {
      const transformed = applyHomography(matrix, e.screenPos);
      return {
        ...e,
        pitchPos: transformed,
      };
    });

    return {
      ...rawFrame,
      entities: updatedEntities,
    };
  }, [matchData, currentFrameIndex, homographyAnchors]);

  // Dynamic Voronoi Pitch Control
  const voronoiResult = useMemo(() => {
    return computeVoronoiPitchControl(currentFrame.entities);
  }, [currentFrame.entities]);

  // Dynamic Compactness
  const compactnessA = useMemo(() => {
    return computeTeamCompactness(
      currentFrame.entities,
      'teamA',
      matchData.dimension.lengthMeters,
      matchData.dimension.widthMeters
    );
  }, [currentFrame.entities, matchData]);

  const compactnessB = useMemo(() => {
    return computeTeamCompactness(
      currentFrame.entities,
      'teamB',
      matchData.dimension.lengthMeters,
      matchData.dimension.widthMeters
    );
  }, [currentFrame.entities, matchData]);

  // Playback Loop
  useEffect(() => {
    if (!isPlaying) return;

    const intervalMs = Math.round(400 / playbackSpeed);
    const timer = setInterval(() => {
      setCurrentFrameIndex((prev) => (prev + 1) % matchData.frames.length);
    }, intervalMs);

    return () => clearInterval(timer);
  }, [isPlaying, playbackSpeed, matchData.frames.length]);

  // Keyboard Shortcuts (Space, Left/Right Arrows, Esc)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Avoid triggering when typing in inputs
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying((prev) => !prev);
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        setCurrentFrameIndex((prev) => Math.max(0, prev - 1));
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        setCurrentFrameIndex((prev) => Math.min(matchData.frames.length - 1, prev + 1));
      } else if (e.key === 'c' || e.key === 'C') {
        setIsCalibrating((prev) => !prev);
      } else if (e.key === 'Escape') {
        setIsCalibrating(false);
        setIsReportModalOpen(false);
        setIsAIChatOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [matchData.frames.length]);

  // Fetch / Generate AI Tactical Report
  const generateTacticalReport = useCallback(async () => {
    setIsLoadingReport(true);
    try {
      const response = await fetch('/api/gemini/analyze-tactics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sport: currentSport,
          metrics: {
            ...matchData.baseMetrics,
            compactnessA,
            compactnessB,
          },
          passingNetworkA: matchData.passingNetworkA,
          passingNetworkB: matchData.passingNetworkB,
          teamA: matchData.teamA,
          teamB: matchData.teamB,
        }),
      });

      const data = await response.json();
      if (data.report) {
        setReportData(data.report);
      }
    } catch (err) {
      console.error('Failed to generate tactical report:', err);
    } finally {
      setIsLoadingReport(false);
    }
  }, [currentSport, matchData, compactnessA, compactnessB]);

  // Handle Video Upload
  const handleVideoUpload = (file: File) => {
    const url = URL.createObjectURL(file);
    setCustomVideoUrl(url);
    setIsPlaying(true);
  };

  // Telestrator Handlers
  const handleAddAnnotation = (anno: DrawingAnnotation) => {
    setAnnotations((prev) => [...prev, anno]);
  };

  const handleUndoAnnotation = () => {
    setAnnotations((prev) => prev.slice(0, -1));
  };

  const handleClearAnnotations = () => {
    setAnnotations([]);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-slate-950">
      {/* 1. Global Navigation Header */}
      <Header
        currentSport={currentSport}
        onSelectSport={(s) => setCurrentSport(s)}
        matchName={matchData.name}
        isCalibrating={isCalibrating}
        onToggleCalibration={() => setIsCalibrating(!isCalibrating)}
        onOpenReportModal={() => {
          setIsReportModalOpen(true);
          if (!reportData) {
            generateTacticalReport();
          }
        }}
        onToggleAIChat={() => setIsAIChatOpen(!isAIChatOpen)}
        isAIChatOpen={isAIChatOpen}
        onVideoUpload={handleVideoUpload}
        isLiveAnalyzing={isPlaying}
      />

      {/* 2. Main Analytics Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 lg:p-6 space-y-6">
        {/* Telestrator Drawing Palette */}
        <TelestratorToolbar
          currentTool={telestratorTool}
          onSelectTool={setTelestratorTool}
          currentColor={telestratorColor}
          onSelectColor={setTelestratorColor}
          annotationsCount={annotations.length}
          onUndo={handleUndoAnnotation}
          onClear={handleClearAnnotations}
          showDrawings={showDrawings}
          onToggleShowDrawings={() => setShowDrawings(!showDrawings)}
        />

        {/* Dual Synchronized Split: 2D Broadcast Perspective Feed vs 2D Top-Down Radar */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Left: 2D Broadcast View */}
          <div className="space-y-2">
            <BroadcastView
              currentFrame={currentFrame}
              allFrames={matchData.frames}
              currentFrameIndex={currentFrameIndex}
              onSeekFrame={setCurrentFrameIndex}
              isPlaying={isPlaying}
              onTogglePlay={() => setIsPlaying(!isPlaying)}
              playbackSpeed={playbackSpeed}
              onChangeSpeed={setPlaybackSpeed}
              sport={currentSport}
              teamAColor={matchData.teamA.primaryColor}
              teamBColor={matchData.teamB.primaryColor}
              isCalibrating={isCalibrating}
              homographyAnchors={homographyAnchors}
              onUpdateAnchors={setHomographyAnchors}
              telestratorTool={telestratorTool}
              telestratorColor={telestratorColor}
              annotations={annotations}
              onAddAnnotation={handleAddAnnotation}
              showDrawings={showDrawings}
              selectedEntityId={selectedEntityId}
              onSelectEntity={setSelectedEntityId}
              customVideoUrl={customVideoUrl}
            />
          </div>

          {/* Right: 2D Top-Down Tactical Pitch Radar */}
          <div className="space-y-2">
            <PitchRadar2D
              currentFrame={currentFrame}
              allFrames={matchData.frames}
              sport={currentSport}
              dimension={matchData.dimension}
              teamAName={matchData.teamA.name}
              teamBName={matchData.teamB.name}
              teamAColor={matchData.teamA.primaryColor}
              teamBColor={matchData.teamB.primaryColor}
              passingNetworkA={matchData.passingNetworkA}
              passingNetworkB={matchData.passingNetworkB}
              selectedEntityId={selectedEntityId}
              onSelectEntity={setSelectedEntityId}
            />
          </div>
        </div>

        {/* 3. Live Automated Tactical Metrics Telemetry Cards */}
        <TacticalMetricsPanel
          metrics={{
            ...matchData.baseMetrics,
            compactnessA,
            compactnessB,
          }}
          teamA={matchData.teamA}
          teamB={matchData.teamB}
          sport={currentSport}
          pitchControlA={voronoiResult.pitchControlA}
          pitchControlB={voronoiResult.pitchControlB}
          detectedFormationA={matchData.baseMetrics.detectedFormationA}
          detectedFormationB={matchData.baseMetrics.detectedFormationB}
          phase={currentFrame.phase}
        />

        {/* 4. Passing Network & Key Playmaker Graph Breakdown */}
        <PassingNetworkView
          networkA={matchData.passingNetworkA}
          networkB={matchData.passingNetworkB}
          teamA={matchData.teamA}
          teamB={matchData.teamB}
        />

        {/* 5. Coach Quick Guidance Banner */}
        <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-slate-950 border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">
                Computer Vision Top-Down Transformation Pipeline Active
              </h4>
              <p className="text-xs text-slate-400">
                Direct Linear Transform (DLT) maps broadcast feeds into calibrated pitch meters with Voronoi pitch dominance and automated formation clustering.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsCalibrating(!isCalibrating)}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition-colors"
            >
              {isCalibrating ? 'Exit Calibration' : 'Recalibrate Homography'}
            </button>
            <button
              onClick={() => {
                setIsReportModalOpen(true);
                if (!reportData) generateTacticalReport();
              }}
              className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white shadow-md shadow-emerald-900/30 transition-all"
            >
              Export AI Scouting Report
            </button>
          </div>
        </div>
      </main>

      {/* 6. AI Coaching Dossier Modal */}
      <CoachingDossierModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        reportData={reportData}
        isLoading={isLoadingReport}
        onGenerateReport={generateTacticalReport}
        teamA={matchData.teamA}
        teamB={matchData.teamB}
        sport={currentSport}
        metrics={{
          ...matchData.baseMetrics,
          compactnessA,
          compactnessB,
        }}
        pitchControlA={voronoiResult.pitchControlA}
      />

      {/* 7. AI Tactical Coach Slide-over Panel */}
      <AICoachChat
        isOpen={isAIChatOpen}
        onClose={() => setIsAIChatOpen(false)}
        sport={currentSport}
        teamA={matchData.teamA}
        teamB={matchData.teamB}
        metrics={{
          ...matchData.baseMetrics,
          compactnessA,
          compactnessB,
        }}
        pitchControlA={voronoiResult.pitchControlA}
      />
    </div>
  );
}
