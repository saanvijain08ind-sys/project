import React, { useState } from 'react';
import { Crown, Lock, Unlock, Copy, Check, BookOpen, LogOut, Share2, Radio } from 'lucide-react';

interface NavbarProps {
  roomId: string;
  hasPasscode: boolean;
  isHost: boolean;
  isConnected: boolean;
  onLeaveRoom: () => void;
  onOpenDocs: () => void;
  currentUpdateRate: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  roomId,
  hasPasscode,
  isHost,
  isConnected,
  onLeaveRoom,
  onOpenDocs,
  currentUpdateRate,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = () => {
    const url = window.location.href.split('?')[0] + `?room=${roomId}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <header className="h-14 bg-slate-900/90 border-b border-slate-800/80 px-4 flex items-center justify-between select-none backdrop-blur-md shrink-0">
      {/* Brand & Room Info */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center text-white font-black text-sm shadow-md shadow-indigo-600/30">
            S
          </div>
          <span className="font-bold text-sm text-slate-100 tracking-tight hidden sm:inline">
            SyncPad
          </span>
        </div>

        {/* Vertical divider */}
        <div className="h-4 w-px bg-slate-800 hidden sm:block"></div>

        {/* Room Badge */}
        <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
          <span className="text-[11px] text-slate-400 font-medium">Room:</span>
          <span className="font-mono text-xs text-indigo-300 font-semibold">{roomId}</span>
          <button
            onClick={handleCopyRoomId}
            title="Copy Room ID"
            className="text-slate-400 hover:text-slate-200 transition-colors p-0.5 cursor-pointer ml-0.5"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          </button>
        </div>

        {/* Lock status */}
        <div
          title={hasPasscode ? 'Passcode Protected' : 'Open Access Room'}
          className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border ${
            hasPasscode
              ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
              : 'bg-slate-800/60 text-slate-400 border-slate-700/50'
          }`}
        >
          {hasPasscode ? (
            <>
              <Lock className="w-3 h-3 text-amber-400" />
              <span className="hidden md:inline">Protected</span>
            </>
          ) : (
            <>
              <Unlock className="w-3 h-3 text-slate-500" />
              <span className="hidden md:inline">Public</span>
            </>
          )}
        </div>

        {/* Host Status Badge */}
        {isHost && (
          <div className="flex items-center gap-1 bg-amber-500/15 border border-amber-500/40 text-amber-300 px-2 py-0.5 rounded text-[11px] font-semibold">
            <Crown className="w-3 h-3 text-amber-400 fill-amber-400" />
            <span>Room Host</span>
          </div>
        )}
      </div>

      {/* Middle: Socket Rate Limiter Velocity Meter */}
      <div className="hidden lg:flex items-center gap-2 px-3 py-1 bg-slate-950/70 border border-slate-800/80 rounded-lg text-xs font-mono">
        <span className="text-slate-500">Rate Monitor:</span>
        <div className="flex items-center gap-1.5">
          <div className="w-16 h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              style={{ width: `${Math.min(100, (currentUpdateRate / 5) * 100)}%` }}
              className={`h-full transition-all duration-200 ${
                currentUpdateRate > 5
                  ? 'bg-rose-500'
                  : currentUpdateRate >= 4
                  ? 'bg-amber-500'
                  : 'bg-emerald-500'
              }`}
            />
          </div>
          <span
            className={`${
              currentUpdateRate > 5
                ? 'text-rose-400 font-bold'
                : currentUpdateRate >= 4
                ? 'text-amber-400'
                : 'text-emerald-400'
            }`}
          >
            {currentUpdateRate}/5 req/s
          </span>
        </div>
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-2">
        {/* Connection status indicator */}
        <div
          title={isConnected ? 'Real-Time WebSockets Connected' : 'Disconnected / Reconnecting'}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border ${
            isConnected
              ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
              : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
          }`}
        >
          <Radio className={`w-3 h-3 ${isConnected ? 'text-emerald-400 animate-pulse' : 'text-rose-400'}`} />
          <span className="hidden sm:inline">{isConnected ? 'Live Socket' : 'Reconnecting...'}</span>
        </div>

        {/* Architecture Specs Modal trigger */}
        <button
          onClick={onOpenDocs}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-600/15 hover:bg-indigo-600/25 text-indigo-300 border border-indigo-500/30 text-xs font-medium transition-colors cursor-pointer"
        >
          <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
          <span className="hidden md:inline">Schema & Specs</span>
        </button>

        {/* Share Button */}
        <button
          onClick={handleShare}
          title="Share Room Link"
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800 transition-colors cursor-pointer"
        >
          <Share2 className="w-3.5 h-3.5" />
        </button>

        {/* Leave Room Button */}
        <button
          onClick={onLeaveRoom}
          title="Leave Workspace"
          className="p-1.5 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 border border-slate-800 transition-colors cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};
