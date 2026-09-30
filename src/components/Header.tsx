import React from 'react';
import { SportType } from '../types';
import { 
  Activity, 
  Trophy, 
  Upload, 
  Sparkles, 
  FileText, 
  Settings2,
  Video,
  Layers,
  ChevronDown
} from 'lucide-react';

interface HeaderProps {
  currentSport: SportType;
  onSelectSport: (sport: SportType) => void;
  matchName: string;
  isCalibrating: boolean;
  onToggleCalibration: () => void;
  onOpenReportModal: () => void;
  onToggleAIChat: () => void;
  isAIChatOpen: boolean;
  onVideoUpload: (file: File) => void;
  onSelectPresetVideo: (videoFilename: string) => void;
  availableVideos: Array<{ filename: string; path: string; size: number }>;
  useRealData: boolean;
  onToggleRealData: () => void;
  isProcessingVideo: boolean;
  isLiveAnalyzing: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  currentSport,
  onSelectSport,
  matchName,
  isCalibrating,
  onToggleCalibration,
  onOpenReportModal,
  onToggleAIChat,
  isAIChatOpen,
  onVideoUpload,
  onSelectPresetVideo,
  availableVideos,
  useRealData,
  onToggleRealData,
  isProcessingVideo,
  isLiveAnalyzing,
}) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [isVideoMenuOpen, setIsVideoMenuOpen] = React.useState(false);

  const sportsList: { id: SportType; label: string; icon: string; tag: string }[] = [
    { id: 'football', label: 'Football (Soccer)', icon: '⚽', tag: '11v11 Pitch' },
    { id: 'hockey', label: 'Field / Ice Hockey', icon: '🏑', tag: 'Power Play / Rink' },
  ];

  return (
    <header className="bg-black border-b border-blue-900 sticky top-0 z-40 px-4 lg:px-6 py-3">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Left: Branding & Match Title */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
          <div className="flex items-center gap-2.5">
            <div className="h-10 w-10 bg-blue-600 flex items-center justify-center border border-blue-400">
              <Activity className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold tracking-tight text-white">
                  Broadcast-to-Tactics
                </span>
              </div>
              <p className="text-xs text-zinc-400 truncate max-w-[280px] sm:max-w-md">
                {matchName}
              </p>
            </div>
          </div>
        </div>

        {/* Center: Sport Selector Pills */}
        <div className="flex items-center bg-black p-1 border border-zinc-800">
          {sportsList.map((s) => {
            const active = currentSport === s.id && !useRealData;
            return (
              <button
                key={s.id}
                id={`sport-select-${s.id}`}
                onClick={() => {
                  if (useRealData) onToggleRealData();
                  onSelectSport(s.id);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  active
                    ? 'bg-blue-600 text-white border border-blue-500 font-semibold'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-950'
                }`}
              >
                <span>{s.icon}</span>
                <span className="hidden sm:inline">{s.label}</span>
                <span className="sm:hidden">{s.id.toUpperCase()}</span>
              </button>
            );
          })}
        </div>

        {/* Right: Actions & Tools */}
        <div className="flex items-center gap-2 w-full md:w-auto justify-end relative">
          {/* Real Video Dropdown / Action */}
          <div className="relative">
            <button
              id="video-menu-btn"
              onClick={() => setIsVideoMenuOpen(!isVideoMenuOpen)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all shadow-sm ${
                useRealData 
                  ? 'bg-blue-600/25 border-blue-500 text-blue-200 ring-1 ring-blue-500/40' 
                  : 'bg-black hover:bg-zinc-950 border-zinc-700 text-white'
              }`}
            >
              <Video className="h-3.5 w-3.5 text-blue-300" />
              <span>{isProcessingVideo ? 'Processing...' : useRealData ? 'Real Video Active' : 'Real Match Feeds'}</span>
              <ChevronDown className="h-3 w-3 opacity-60" />
            </button>

            {isVideoMenuOpen && (
              <div className="absolute right-0 mt-2 w-72 bg-black border border-blue-900 p-2 z-50 space-y-2">
                <div className="px-2 py-1 border-b border-zinc-800">
                  <p className="text-xs font-bold text-white">Broadcast Video Feeds</p>
                  <p className="text-[11px] text-zinc-400">Extract real 2D tactical tracking with YOLO</p>
                </div>

                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {availableVideos.length > 0 ? (
                    availableVideos.map((v) => (
                      <button
                        key={v.filename}
                        onClick={() => {
                          onSelectPresetVideo(v.filename);
                          setIsVideoMenuOpen(false);
                        }}
                        className="w-full text-left px-2.5 py-2 text-xs hover:bg-zinc-950 text-zinc-300 hover:text-white flex items-center justify-between transition-colors border border-transparent hover:border-blue-900"
                      >
                        <div className="truncate">
                          <p className="font-semibold truncate">{v.filename}</p>
                          <p className="text-[10px] text-zinc-400">{(v.size / (1024 * 1024)).toFixed(1)} MB</p>
                        </div>
                        <span className="text-[10px] bg-blue-600/20 text-blue-200 px-2 py-0.5 border border-blue-700">
                          Analyze
                        </span>
                      </button>
                    ))
                  ) : (
                    <p className="text-xs text-zinc-400 p-2 text-center">No video files found in input_videos</p>
                  )}
                </div>

                <div className="pt-2 border-t border-zinc-800 flex flex-col gap-1.5">
                  <button
                    onClick={() => {
                      fileInputRef.current?.click();
                      setIsVideoMenuOpen(false);
                    }}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold border border-blue-500 transition-colors"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    <span>Upload Custom MP4 Video</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Upload Broadcast Video Hidden Input */}
          <input
            type="file"
            ref={fileInputRef}
            accept="video/*"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                onVideoUpload(e.target.files[0]);
              }
            }}
          />

          {/* Homography Calibration Toggle */}
          <button
            id="toggle-homography-calibration-btn"
            onClick={onToggleCalibration}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all shadow-sm ${
              isCalibrating
                ? 'bg-blue-600/25 border-blue-500 text-blue-200 ring-2 ring-blue-500/20'
                : 'bg-black hover:bg-zinc-950 border-zinc-700 text-zinc-300'
            }`}
            title="Calibrate 4-Point Homography Matrix"
          >
            <Settings2 className="h-3.5 w-3.5 text-blue-300" />
            <span className="hidden sm:inline">
              {isCalibrating ? 'Calibrating Grid' : 'Calibrate 2D'}
            </span>
          </button>

          {/* AI Coaching Dossier Modal */}
          <button
            id="open-coaching-dossier-btn"
            onClick={onOpenReportModal}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold border border-blue-500 transition-all active:scale-95"
          >
            <FileText className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Coaching Report</span>
          </button>

          {/* AI Tactical Coach Slide-over */}
          <button
            id="toggle-ai-coach-chat-btn"
            onClick={onToggleAIChat}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all shadow-sm ${
              isAIChatOpen
                ? 'bg-blue-600/25 border-blue-500 text-blue-200 ring-2 ring-blue-500/20'
                : 'bg-black hover:bg-zinc-950 border-zinc-700 text-blue-300'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5 text-blue-300 animate-pulse" />
            <span className="hidden sm:inline">AI Tactical Coach</span>
          </button>
        </div>
      </div>
    </header>
  );
};
