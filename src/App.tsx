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
import { videoProcessingService } from './services/videoProcessing';
import { hockeyProcessingService } from './services/hockeyProcessing';
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
  const [useRealData, setUseRealData] = useState<boolean>(false);
  const [realMatchData, setRealMatchData] = useState<MatchData | null>(null);
  const [isProcessingVideo, setIsProcessingVideo] = useState<boolean>(false);
  const [processingError, setProcessingError] = useState<string | null>(null);
  
  const matchData: MatchData = useMemo(() => {
    if (useRealData && realMatchData) {
      return realMatchData;
    }
    return SAMPLE_MATCHES[currentSport];
  }, [currentSport, useRealData, realMatchData]);

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

  // Custom Video Upload & Available Videos
  const [customVideoUrl, setCustomVideoUrl] = useState<string | null>(null);
  const [availableVideos, setAvailableVideos] = useState<Array<{ filename: string; path: string; size: number }>>([]);

  // Modals & Panels
  const [isReportModalOpen, setIsReportModalOpen] = useState<boolean>(false);
  const [isAIChatOpen, setIsAIChatOpen] = useState<boolean>(false);
  const [reportData, setReportData] = useState<AIReportData | null>(null);
  const [isLoadingReport, setIsLoadingReport] = useState<boolean>(false);

  // Load available videos on mount
  useEffect(() => {
    videoProcessingService.listVideos()
      .then((res) => {
        if (res.videos) setAvailableVideos(res.videos);
      })
      .catch((err) => console.warn('Could not list videos:', err));
  }, []);

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
    if (useRealData && !isCalibrating) {
      return rawFrame;
    }

    const matrix = computeHomography(homographyAnchors, [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ]);

    // Recalculate pitch coordinates dynamically based on manual homography calibration
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
  }, [matchData, currentFrameIndex, homographyAnchors, useRealData, isCalibrating]);

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

  // Playback Loop (for synthetic demo mode without video element)
  useEffect(() => {
    if (!isPlaying || customVideoUrl) return;

    const fps = matchData.fps || 25;
    const intervalMs = Math.max(16, Math.round(1000 / (fps * playbackSpeed)));
    const timer = setInterval(() => {
      setCurrentFrameIndex((prev) => (prev + 1) % matchData.frames.length);
    }, intervalMs);

    return () => clearInterval(timer);
  }, [isPlaying, playbackSpeed, matchData.frames.length, matchData.fps, customVideoUrl]);

  // Keyboard Shortcuts (Space, Left/Right Arrows, Esc)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
      // Server returns { success, source, analysis } — handle all shapes for robustness
      const report = (data as any).analysis || (data as any).report || (data as any).data || null;
      if (report && report.tacticalSummary) {
        setReportData(report as AIReportData);
      } else if (report) {
        setReportData(report as AIReportData);
      } else {
        console.warn('Tactical report response missing analysis/report field:', data);
      }
    } catch (err) {
      console.error('Failed to generate tactical report:', err);
    } finally {
      setIsLoadingReport(false);
    }
  }, [currentSport, matchData, compactnessA, compactnessB]);

  // Handle Preset Video Selection - FOOTBALL (UNCHANGED - DO NOT MODIFY)
  const handleSelectPresetVideo = async (filename: string) => {
    setProcessingError(null);
    try {
      setIsProcessingVideo(true);
      const matchDataResponse = await videoProcessingService.processUploadedVideo(filename, false);
      
      const convertedMatchData: MatchData = {
        id: matchDataResponse.id || 'real-match',
        name: matchDataResponse.name || `Real Match: ${filename}`,
        sport: 'football',
        description: matchDataResponse.description || 'YOLOv8 Computer Vision Tracking',
        teamA: matchDataResponse.teamA,
        teamB: matchDataResponse.teamB,
        durationSec: matchDataResponse.durationSec || Math.round(matchDataResponse.frames.length / 24),
        fps: matchDataResponse.fps || 24,
        frames: matchDataResponse.frames,
        passingNetworkA: matchDataResponse.passingNetworkA,
        passingNetworkB: matchDataResponse.passingNetworkB,
        baseMetrics: matchDataResponse.baseMetrics,
        dimension: matchDataResponse.dimension,
        videoPlaceholderTheme: 'grass'
      };

      setRealMatchData(convertedMatchData);
      setUseRealData(true);
      setCustomVideoUrl(`/videos/${filename}`);
      setCurrentFrameIndex(0);
      setIsPlaying(true);
    } catch (err: any) {
      console.error('Error processing preset video:', err);
      setProcessingError(err.message || 'Failed to process video with YOLO pipeline');
    } finally {
      setIsProcessingVideo(false);
    }
  };

  // Handle Video Upload - FOOTBALL (UNCHANGED - DO NOT MODIFY)
  const handleVideoUpload = async (file: File) => {
    setProcessingError(null);
    try {
      setIsProcessingVideo(true);
      const uploadResponse = await videoProcessingService.uploadVideo(file);
      const matchDataResponse = await videoProcessingService.processUploadedVideo(uploadResponse.filename, false);
      
      const convertedMatchData: MatchData = {
        id: matchDataResponse.id || 'real-match',
        name: `Real Match: ${file.name}`,
        sport: 'football',
        description: 'Real video processing with YOLOv8',
        teamA: matchDataResponse.teamA,
        teamB: matchDataResponse.teamB,
        durationSec: matchDataResponse.durationSec || Math.round(matchDataResponse.frames.length / 24),
        fps: matchDataResponse.fps || 24,
        frames: matchDataResponse.frames,
        passingNetworkA: matchDataResponse.passingNetworkA,
        passingNetworkB: matchDataResponse.passingNetworkB,
        baseMetrics: matchDataResponse.baseMetrics,
        dimension: matchDataResponse.dimension,
        videoPlaceholderTheme: 'grass'
      };
      
      setRealMatchData(convertedMatchData);
      setUseRealData(true);
      setCustomVideoUrl(uploadResponse.public_url || URL.createObjectURL(file));
      setCurrentFrameIndex(0);
      setIsPlaying(true);
      
      // Refresh available videos
      videoProcessingService.listVideos().then((res) => {
        if (res.videos) setAvailableVideos(res.videos);
      });
    } catch (error: any) {
      console.error('Error processing video:', error);
      setProcessingError(error.message || 'Failed to process video. Please ensure the Python backend is running.');
    } finally {
      setIsProcessingVideo(false);
    }
  };

  // ========== HOCKEY HANDLERS - NEW SEPARATE APIS (DO NOT AFFECT FOOTBALL) ==========
  const handleHockeySelectPresetVideo = async (filename: string) => {
    setProcessingError(null);
    try {
      setIsProcessingVideo(true);
      const matchDataResponse = await hockeyProcessingService.processUploadedVideo(filename, false);
      
      const convertedMatchData: MatchData = {
        id: matchDataResponse.id || 'hockey-real-match',
        name: matchDataResponse.name || `Hockey Match: ${filename}`,
        sport: 'hockey',
        description: matchDataResponse.description || 'Hockey YOLOv8 7-Class Rink Tracking',
        teamA: matchDataResponse.teamA,
        teamB: matchDataResponse.teamB,
        durationSec: matchDataResponse.durationSec || Math.round(matchDataResponse.frames.length / 24),
        fps: matchDataResponse.fps || 24,
        frames: matchDataResponse.frames,
        passingNetworkA: matchDataResponse.passingNetworkA,
        passingNetworkB: matchDataResponse.passingNetworkB,
        baseMetrics: matchDataResponse.baseMetrics,
        dimension: matchDataResponse.dimension,
        videoPlaceholderTheme: 'ice'
      };

      setRealMatchData(convertedMatchData);
      setUseRealData(true);
      setCurrentSport('hockey');
      setCustomVideoUrl(`/videos/${filename}`);
      setCurrentFrameIndex(0);
      setIsPlaying(true);
    } catch (err: any) {
      console.error('Error processing hockey preset video:', err);
      setProcessingError(err.message || 'Failed to process hockey video with 7-class pipeline. Ensure hockey backend (port 8001) is running.');
    } finally {
      setIsProcessingVideo(false);
    }
  };

  const handleHockeyVideoUpload = async (file: File) => {
    setProcessingError(null);
    try {
      setIsProcessingVideo(true);
      const uploadResponse = await hockeyProcessingService.uploadVideo(file);
      const matchDataResponse = await hockeyProcessingService.processUploadedVideo(uploadResponse.filename, false);
      
      const convertedMatchData: MatchData = {
        id: matchDataResponse.id || 'hockey-real-match',
        name: `Hockey Match: ${file.name}`,
        sport: 'hockey',
        description: 'Hockey real video processing with 7-class YOLO',
        teamA: matchDataResponse.teamA,
        teamB: matchDataResponse.teamB,
        durationSec: matchDataResponse.durationSec || Math.round(matchDataResponse.frames.length / 24),
        fps: matchDataResponse.fps || 24,
        frames: matchDataResponse.frames,
        passingNetworkA: matchDataResponse.passingNetworkA,
        passingNetworkB: matchDataResponse.passingNetworkB,
        baseMetrics: matchDataResponse.baseMetrics,
        dimension: matchDataResponse.dimension,
        videoPlaceholderTheme: 'ice'
      };
      
      setRealMatchData(convertedMatchData);
      setUseRealData(true);
      setCurrentSport('hockey');
      setCustomVideoUrl(uploadResponse.public_url || URL.createObjectURL(file));
      setCurrentFrameIndex(0);
      setIsPlaying(true);
      
      hockeyProcessingService.listVideos().then((res) => {
        if (res.videos) setAvailableVideos(res.videos as any);
      });
    } catch (error: any) {
      console.error('Error processing hockey video:', error);
      setProcessingError(error.message || 'Failed to process hockey video. Please ensure hockey backend is running on port 8001.');
    } finally {
      setIsProcessingVideo(false);
    }
  };

  // Unified wrapper - routes to correct sport API without touching football logic
  const handleSelectPresetVideoUnified = async (filename: string) => {
    if (currentSport === 'hockey') {
      return handleHockeySelectPresetVideo(filename);
    }
    return handleSelectPresetVideo(filename);
  };

  const handleVideoUploadUnified = async (file: File) => {
    if (currentSport === 'hockey') {
      return handleHockeyVideoUpload(file);
    }
    return handleVideoUpload(file);
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
    <div className="min-h-screen bg-black text-white flex flex-col font-sans selection:bg-blue-600 selection:text-white">
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
        onVideoUpload={handleVideoUploadUnified}
        onSelectPresetVideo={handleSelectPresetVideoUnified}
        availableVideos={availableVideos}
        useRealData={useRealData}
        onToggleRealData={() => setUseRealData(!useRealData)}
        isProcessingVideo={isProcessingVideo}
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
        <div className="p-4 bg-black border border-blue-700 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-blue-600/20 border border-blue-500 flex items-center justify-center text-blue-300">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">
                {useRealData ? 'Real YOLO Video Processing Active' : 'Computer Vision Top-Down Transformation Pipeline Active'}
              </h4>
              <p className="text-xs text-zinc-400">
                {useRealData 
                  ? 'Processing real video data with YOLO object detection and tracking.'
                  : 'Direct Linear Transform (DLT) maps broadcast feeds into calibrated pitch meters with Voronoi pitch dominance and automated formation clustering.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setUseRealData(!useRealData);
                if (!useRealData && !realMatchData) {
                  setProcessingError('Upload a video first to use real data processing');
                }
              }}
              className={`px-3 py-1.5 text-xs font-semibold border transition-colors ${
                useRealData 
                  ? 'bg-blue-600 hover:bg-blue-500 text-white border-blue-500' 
                  : 'bg-black hover:bg-zinc-950 text-white border-zinc-700'
              }`}
            >
              {useRealData ? 'Using Real Data' : 'Use Sample Data'}
            </button>
            <button
              onClick={() => setIsCalibrating(!isCalibrating)}
              className="px-3 py-1.5 bg-black hover:bg-zinc-950 text-xs font-semibold text-white border border-zinc-700 transition-colors"
            >
              {isCalibrating ? 'Exit Calibration' : 'Recalibrate Homography'}
            </button>
            <button
              onClick={() => {
                setIsReportModalOpen(true);
                if (!reportData) generateTacticalReport();
              }}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white border border-blue-500 transition-all"
            >
              Export AI Scouting Report
            </button>
          </div>
        </div>

        {/* Processing Status Banner */}
        {isProcessingVideo && (
          <div className="p-4 bg-black border border-blue-700 flex items-center gap-3">
            <div className="h-8 w-8 bg-blue-600/20 border border-blue-500 flex items-center justify-center text-blue-300">
              <Activity className="h-4 w-4 animate-spin" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">
                Processing Video with YOLO...
              </h4>
              <p className="text-xs text-zinc-400">
                Extracting player positions, tracking objects, and generating tactical insights. This may take a few minutes.
              </p>
            </div>
          </div>
        )}

        {/* Error Banner */}
        {processingError && (
          <div className="p-4 bg-black border border-blue-700 flex items-center gap-3">
            <div className="h-8 w-8 bg-blue-600/20 border border-blue-500 flex items-center justify-center text-blue-300">
              <HelpCircle className="h-4 w-4" />
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-bold text-white">
                Processing Error
              </h4>
              <p className="text-xs text-zinc-400">
                {processingError}
              </p>
            </div>
            <button
              onClick={() => setProcessingError(null)}
              className="px-3 py-1.5 bg-black hover:bg-zinc-950 text-xs font-semibold text-white border border-zinc-700 transition-colors"
            >
              Dismiss
            </button>
          </div>
        )}
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
