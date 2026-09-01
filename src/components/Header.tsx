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
  isLiveAnalyzing,
}) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const sportsList: { id: SportType; label: string; icon: string; tag: string }[] = [
    { id: 'football', label: 'Football (Soccer)', icon: '⚽', tag: '11v11 Pitch' },
    { id: 'hockey', label: 'Field / Ice Hockey', icon: '🏑', tag: 'Power Play / Rink' },
    { id: 'kabaddi', label: 'Kabaddi', icon: '🤼', tag: '7v7 Mat Court' },
  ];

  return (
    <header className="bg-slate-900/90 backdrop-blur-md border-b border-slate-800 sticky top-0 z-40 px-4 lg:px-6 py-3">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Left: Branding & Match Title */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
          <div className="flex items-center gap-2.5">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-emerald-500/20 ring-1 ring-white/20">
              <Activity className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-transparent">
                  Broadcast-to-Tactics
                </span>
                <span className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                  CV Radar
                </span>
              </div>
              <p className="text-xs text-slate-400 truncate max-w-[280px] sm:max-w-md">
                {matchName}
              </p>
            </div>
          </div>
        </div>

        {/* Center: Sport Selector Pills */}
        <div className="flex items-center bg-slate-950/80 p-1 rounded-xl border border-slate-800/80 shadow-inner">
          {sportsList.map((s) => {
            const active = currentSport === s.id;
            return (
              <button
                key={s.id}
                id={`sport-select-${s.id}`}
                onClick={() => onSelectSport(s.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  active
                    ? 'bg-slate-800 text-white shadow-sm border border-slate-700 font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
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
        <div className="flex items-center gap-2 w-full md:w-auto justify-end">
          {/* Upload Broadcast Video */}
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
          <button
            id="upload-broadcast-video-btn"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-xs text-slate-300 transition-colors shadow-sm"
            title="Upload standard 2D broadcast MP4 footage"
          >
            <Upload className="h-3.5 w-3.5 text-slate-400" />
            <span className="hidden lg:inline">Upload Feed</span>
          </button>

          {/* Homography Calibration Toggle */}
          <button
            id="toggle-homography-calibration-btn"
            onClick={onToggleCalibration}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all shadow-sm ${
              isCalibrating
                ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 ring-2 ring-amber-500/20'
                : 'bg-slate-800/80 hover:bg-slate-700/80 border-slate-700 text-slate-300'
            }`}
            title="Calibrate 4-Point Homography Matrix"
          >
            <Settings2 className="h-3.5 w-3.5 text-amber-400" />
            <span className="hidden sm:inline">
              {isCalibrating ? 'Calibrating Grid' : 'Calibrate 2D'}
            </span>
          </button>

          {/* AI Coaching Dossier Modal */}
          <button
            id="open-coaching-dossier-btn"
            onClick={onOpenReportModal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md shadow-emerald-900/30 transition-all active:scale-95"
          >
            <FileText className="h-3.5 w-3.5" />
            <span>Coaching Report</span>
          </button>

          {/* AI Tactical Coach Slide-over */}
          <button
            id="toggle-ai-coach-chat-btn"
            onClick={onToggleAIChat}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all shadow-sm ${
              isAIChatOpen
                ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300 ring-2 ring-cyan-500/20'
                : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-cyan-400'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5 text-cyan-400 animate-pulse" />
            <span className="hidden sm:inline">AI Tactical Coach</span>
          </button>
        </div>
      </div>
    </header>
  );
};
