import React from 'react';
import { 
  Pencil, 
  ArrowUpRight, 
  Minus, 
  Circle, 
  SunMedium, 
  Square, 
  RotateCcw, 
  Trash2,
  Eye,
  EyeOff
} from 'lucide-react';
import { DrawingAnnotation } from '../types';

export type TelestratorTool = 'select' | 'freehand' | 'arrow' | 'line' | 'circle' | 'spotlight' | 'zone';

interface TelestratorToolbarProps {
  currentTool: TelestratorTool;
  onSelectTool: (tool: TelestratorTool) => void;
  currentColor: string;
  onSelectColor: (color: string) => void;
  annotationsCount: number;
  onUndo: () => void;
  onClear: () => void;
  showDrawings: boolean;
  onToggleShowDrawings: () => void;
}

export const TelestratorToolbar: React.FC<TelestratorToolbarProps> = ({
  currentTool,
  onSelectTool,
  currentColor,
  onSelectColor,
  annotationsCount,
  onUndo,
  onClear,
  showDrawings,
  onToggleShowDrawings,
}) => {
  const tools: { id: TelestratorTool; label: string; icon: React.ReactNode }[] = [
    { id: 'freehand', label: 'Pen', icon: <Pencil className="h-3.5 w-3.5" /> },
    { id: 'arrow', label: 'Tactical Arrow', icon: <ArrowUpRight className="h-3.5 w-3.5" /> },
    { id: 'line', label: 'Passing / Offside Line', icon: <Minus className="h-3.5 w-3.5" /> },
    { id: 'circle', label: 'Player Ring', icon: <Circle className="h-3.5 w-3.5" /> },
    { id: 'spotlight', label: 'Spotlight', icon: <SunMedium className="h-3.5 w-3.5" /> },
    { id: 'zone', label: 'Danger Zone', icon: <Square className="h-3.5 w-3.5" /> },
  ];

  const colors = [
    { name: 'Tactical Gold', hex: '#fbbf24' },
    { name: 'Neon Cyan', hex: '#22d3ee' },
    { name: 'Emerald', hex: '#34d399' },
    { name: 'Crimson', hex: '#f87171' },
    { name: 'Pure White', hex: '#ffffff' },
  ];

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-slate-900/95 border border-slate-800 rounded-xl shadow-lg backdrop-blur-md">
      {/* Tool buttons */}
      <div className="flex items-center gap-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1.5 px-1 hidden sm:inline">
          Telestrator:
        </span>
        {tools.map((t) => {
          const active = currentTool === t.id;
          return (
            <button
              key={t.id}
              id={`telestrator-tool-${t.id}`}
              onClick={() => onSelectTool(t.id)}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                active
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 border border-transparent'
              }`}
              title={t.label}
            >
              {t.icon}
              <span className="hidden md:inline">{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Color Picker & Undo / Clear */}
      <div className="flex items-center gap-2">
        {/* Colors */}
        <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-lg border border-slate-800">
          {colors.map((c) => (
            <button
              key={c.hex}
              id={`color-select-${c.hex.replace('#', '')}`}
              onClick={() => onSelectColor(c.hex)}
              className={`h-4 w-4 rounded-full transition-transform ${
                currentColor === c.hex
                  ? 'scale-125 ring-2 ring-white shadow-sm'
                  : 'opacity-70 hover:opacity-100 hover:scale-110'
              }`}
              style={{ backgroundColor: c.hex }}
              title={c.name}
            />
          ))}
        </div>

        {/* Visibility Toggle */}
        <button
          id="toggle-drawings-visibility-btn"
          onClick={onToggleShowDrawings}
          className={`p-1.5 rounded-lg text-xs border transition-colors ${
            showDrawings
              ? 'text-slate-300 bg-slate-800 border-slate-700'
              : 'text-slate-500 bg-slate-900 border-slate-800 line-through'
          }`}
          title={showDrawings ? 'Hide drawings' : 'Show drawings'}
        >
          {showDrawings ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        </button>

        {/* Undo */}
        <button
          id="undo-drawing-btn"
          onClick={onUndo}
          disabled={annotationsCount === 0}
          className="p-1.5 rounded-lg text-xs text-slate-300 bg-slate-800/80 hover:bg-slate-700/80 disabled:opacity-40 disabled:hover:bg-slate-800/80 border border-slate-700 transition-colors"
          title="Undo last annotation"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>

        {/* Clear */}
        <button
          id="clear-drawings-btn"
          onClick={onClear}
          disabled={annotationsCount === 0}
          className="p-1.5 rounded-lg text-xs text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 disabled:opacity-40 disabled:hover:bg-rose-500/10 border border-rose-500/20 transition-colors"
          title="Clear all drawings"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};
