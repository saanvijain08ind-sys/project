import React from 'react';
import { Bot, Zap, Crown, BookOpen, X } from 'lucide-react';

interface DevToolsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onAddSimulatedPeer: () => void;
  onTriggerFloodTest: () => void;
  onSimulateHostDisconnect?: () => void;
  isHost: boolean;
  participantCount: number;
  currentUpdateRate: number;
  onOpenDocs: () => void;
}

export const DevToolsDrawer: React.FC<DevToolsDrawerProps> = ({
  isOpen,
  onClose,
  onAddSimulatedPeer,
  onTriggerFloodTest,
  onSimulateHostDisconnect,
  isHost,
  participantCount,
  currentUpdateRate,
  onOpenDocs,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed bottom-4 right-4 z-40 w-80 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl p-4 text-xs animate-in fade-in slide-in-from-bottom-2">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
        <div className="flex items-center gap-1.5 font-medium text-zinc-200">
          <span>Dev & Testing Tools</span>
        </div>
        <button
          onClick={onClose}
          className="text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <p className="text-zinc-400 mt-2.5 mb-3 leading-relaxed">
        Test multi-peer synchronization, socket rate limiting, and host failover directly in this session.
      </p>

      {/* Action Buttons */}
      <div className="space-y-2">
        <button
          onClick={onAddSimulatedPeer}
          className="w-full py-2 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-750 text-zinc-200 font-medium flex items-center gap-2 transition-colors cursor-pointer"
        >
          <Bot className="w-3.5 h-3.5 text-zinc-400" />
          <span>Simulate Peer Collaborator</span>
        </button>

        <button
          onClick={onTriggerFloodTest}
          className="w-full py-2 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-750 text-zinc-200 font-medium flex items-center gap-2 transition-colors cursor-pointer"
        >
          <Zap className="w-3.5 h-3.5 text-amber-400" />
          <span>Test Rate Limiter (Flood 10x)</span>
        </button>

        {isHost && onSimulateHostDisconnect && participantCount > 1 && (
          <button
            onClick={onSimulateHostDisconnect}
            className="w-full py-2 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-750 text-zinc-200 font-medium flex items-center gap-2 transition-colors cursor-pointer"
          >
            <Crown className="w-3.5 h-3.5 text-amber-400" />
            <span>Test Host Failover (Step Down)</span>
          </button>
        )}

        <button
          onClick={() => {
            onClose();
            onOpenDocs();
          }}
          className="w-full py-2 px-3 rounded-lg bg-zinc-850 hover:bg-zinc-800 text-zinc-300 font-medium flex items-center gap-2 transition-colors cursor-pointer"
        >
          <BookOpen className="w-3.5 h-3.5 text-zinc-400" />
          <span>Socket.IO Schema & Architecture</span>
        </button>
      </div>

      {/* Velocity Monitor */}
      <div className="mt-3.5 pt-3 border-t border-zinc-800 flex items-center justify-between text-zinc-500 font-mono text-[11px]">
        <span>Socket velocity:</span>
        <span
          className={
            currentUpdateRate > 5
              ? 'text-rose-400 font-bold'
              : currentUpdateRate >= 4
              ? 'text-amber-400'
              : 'text-zinc-400'
          }
        >
          {currentUpdateRate} / 5 req/s
        </span>
      </div>
    </div>
  );
};
