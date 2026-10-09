import React, { useState } from 'react';
import { Copy, Check, Play, Users, LogOut } from 'lucide-react';

interface NavbarProps {
  roomId: string;
  hasPasscode: boolean;
  language: string;
  onLanguageChange: (lang: string) => void;
  onRunCode: () => void;
  isRunning: boolean;
  participantCount: number;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  isConnected: boolean;
  onLeaveRoom: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  roomId,
  language,
  onLanguageChange,
  onRunCode,
  isRunning,
  participantCount,
  isSidebarOpen,
  onToggleSidebar,
  isConnected,
  onLeaveRoom,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopyLink = () => {
    const url = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <header className="h-12 bg-zinc-950 border-b border-zinc-800/80 px-4 flex items-center justify-between select-none shrink-0">
      {/* Left: Brand + Room ID */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-white text-zinc-950 flex items-center justify-center font-bold text-xs">
            S
          </div>
          <span className="font-semibold text-sm text-zinc-100 tracking-tight">
            SyncPad
          </span>
        </div>

        <span className="text-zinc-700">/</span>

        {/* Room ID Badge with 1-click Copy */}
        <button
          onClick={handleCopyLink}
          title="Click to copy invite link"
          className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-mono text-zinc-300 hover:text-white bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 transition-colors cursor-pointer group"
        >
          <span>{roomId}</span>
          {copied ? (
            <Check className="w-3 h-3 text-emerald-400" />
          ) : (
            <Copy className="w-3 h-3 text-zinc-500 group-hover:text-zinc-300 transition-colors" />
          )}
        </button>
      </div>

      {/* Center: Language Selector + Clean Run Button */}
      <div className="flex items-center gap-2">
        <select
          value={language}
          onChange={(e) => onLanguageChange(e.target.value)}
          aria-label="Language Mode"
          className="bg-zinc-900 hover:bg-zinc-850 text-zinc-300 border border-zinc-800 rounded-md px-2.5 py-1 text-xs focus:outline-none focus:border-zinc-700 cursor-pointer font-medium transition-colors"
        >
          <option value="javascript">JavaScript</option>
          <option value="typescript">TypeScript</option>
          <option value="python">Python</option>
          <option value="html">HTML</option>
          <option value="css">CSS</option>
          <option value="json">JSON</option>
        </select>

        <button
          onClick={onRunCode}
          disabled={isRunning}
          className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-zinc-100 hover:bg-white text-zinc-950 font-medium text-xs transition-colors cursor-pointer disabled:opacity-50 shadow-sm"
        >
          <Play className="w-3 h-3 fill-current" />
          <span>{isRunning ? 'Running' : 'Run'}</span>
        </button>
      </div>

      {/* Right: Participant Count Toggle + Connection + Leave */}
      <div className="flex items-center gap-2">
        {/* Toggle Right Sidebar Button */}
        <button
          onClick={onToggleSidebar}
          title={isSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors cursor-pointer ${
            isSidebarOpen
              ? 'bg-zinc-850 text-zinc-100 border-zinc-700'
              : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border-zinc-800'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>{participantCount}</span>
        </button>

        {/* Subtle Connection Status Dot */}
        <div
          title={isConnected ? 'Connected to workspace' : 'Reconnecting...'}
          className="flex items-center gap-1 px-1.5 py-1"
        >
          <span
            className={`w-2 h-2 rounded-full ${
              isConnected ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'
            }`}
          />
        </div>

        {/* Leave Room Button */}
        <button
          onClick={onLeaveRoom}
          title="Leave Room"
          className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 transition-colors cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};
