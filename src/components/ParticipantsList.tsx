import React from 'react';
import { Participant } from '../types.ts';
import { Crown } from 'lucide-react';

interface ParticipantsListProps {
  participants: Participant[];
  currentUserId: string;
}

export const ParticipantsList: React.FC<ParticipantsListProps> = ({
  participants,
  currentUserId,
}) => {
  const sorted = [...participants].sort((a, b) => {
    if (a.isHost) return -1;
    if (b.isHost) return 1;
    return a.joinedAt - b.joinedAt;
  });

  return (
    <div className="flex flex-col h-full overflow-y-auto divide-y divide-zinc-850 text-xs">
      {sorted.map((p) => {
        const isMe = p.userId === currentUserId;

        return (
          <div
            key={p.userId}
            className="px-3 py-2.5 flex items-center justify-between hover:bg-zinc-900/50 transition-colors"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {/* Subtle User Dot */}
              <div
                style={{ backgroundColor: p.color }}
                className="w-2.5 h-2.5 rounded-full shrink-0"
              />

              <div className="min-w-0 flex items-center gap-1.5">
                <span className="font-medium text-zinc-200 truncate">
                  {p.username}
                </span>

                {isMe && (
                  <span className="text-[10px] text-zinc-500 font-sans">
                    (you)
                  </span>
                )}

                {p.isHost && (
                  <span title="Room Host">
                    <Crown className="w-3 h-3 text-amber-400 fill-amber-400 shrink-0 ml-0.5" />
                  </span>
                )}
              </div>
            </div>

            {/* Typing status indicator */}
            {p.isTyping && (
              <span className="text-[11px] text-zinc-400 italic">
                typing...
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};
