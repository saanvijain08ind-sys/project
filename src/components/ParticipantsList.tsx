import React from 'react';
import { Participant } from '../types.ts';
import { Crown, User, Bot, Wifi, Clock, Activity } from 'lucide-react';

interface ParticipantsListProps {
  participants: Participant[];
  currentUserId: string;
  isHost: boolean;
  onAddSimulatedPeer: () => void;
  onSimulateHostDisconnect?: () => void;
}

export const ParticipantsList: React.FC<ParticipantsListProps> = ({
  participants,
  currentUserId,
  isHost,
  onAddSimulatedPeer,
  onSimulateHostDisconnect,
}) => {
  const formatTime = (ts: number) => {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return `${diff}s ago`;
    return `${Math.floor(diff / 60)}m ago`;
  };

  // Sort: Host first, then by joined timestamp
  const sortedParticipants = [...participants].sort((a, b) => {
    if (a.isHost) return -1;
    if (b.isHost) return 1;
    return a.joinedAt - b.joinedAt;
  });

  return (
    <div className="flex flex-col h-full bg-slate-950 border border-slate-800/80 rounded-xl overflow-hidden shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900/90 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-indigo-400" />
          <h2 className="text-xs font-semibold text-slate-200 tracking-wide uppercase">
            Active Participants ({participants.length})
          </h2>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-mono">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>Live P2P Sync</span>
        </div>
      </div>

      {/* Participants List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {sortedParticipants.map((p) => {
          const isMe = p.userId === currentUserId;

          return (
            <div
              key={p.userId}
              className={`p-2.5 rounded-lg border transition-all ${
                isMe
                  ? 'bg-slate-900/80 border-indigo-500/30 ring-1 ring-indigo-500/20'
                  : 'bg-slate-900/40 border-slate-800/80 hover:bg-slate-900/70'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  {/* Colored Avatar */}
                  <div
                    style={{ backgroundColor: p.color }}
                    className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs text-slate-950 shadow-sm shrink-0"
                  >
                    {p.username.charAt(0).toUpperCase()}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-slate-200 truncate">
                        {p.username}
                      </span>
                      {isMe && (
                        <span className="px-1.5 py-0.2 rounded text-[10px] bg-slate-800 text-indigo-300 font-mono">
                          You
                        </span>
                      )}
                      {p.isHost && (
                        <span className="flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[10px] bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30">
                          <Crown className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />
                          Host
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                      <span className="flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5 text-slate-500" />
                        {formatTime(p.joinedAt)}
                      </span>

                      {p.cursor && (
                        <span className="font-mono text-slate-500">
                          Ln {p.cursor.line}, Col {p.cursor.ch}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Live Activity Badge */}
                <div>
                  {p.isTyping ? (
                    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 animate-pulse font-medium">
                      <Activity className="w-2.5 h-2.5" />
                      typing
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[10px] text-slate-500">
                      <Wifi className="w-2.5 h-2.5 text-emerald-500" />
                      idle
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Collaborator Simulation / Failover Testing Controls */}
      <div className="p-3 bg-slate-900/60 border-t border-slate-800/80 space-y-2">
        <div className="text-[11px] text-slate-400 font-medium flex items-center justify-between">
          <span>Multi-User Testing Tools</span>
          <span className="text-[10px] text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded">Real Socket.IO</span>
        </div>

        <button
          onClick={onAddSimulatedPeer}
          className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700/80 transition-colors cursor-pointer"
        >
          <Bot className="w-3.5 h-3.5 text-indigo-400" />
          <span>Simulate Peer Collaborator</span>
        </button>

        {isHost && onSimulateHostDisconnect && participants.length > 1 && (
          <button
            onClick={onSimulateHostDisconnect}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs font-medium border border-amber-500/30 transition-colors cursor-pointer"
          >
            <Crown className="w-3.5 h-3.5 text-amber-400" />
            <span>Test Host Failover (Step Down)</span>
          </button>
        )}
      </div>
    </div>
  );
};
