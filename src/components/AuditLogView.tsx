import React from 'react';
import { AuditLogEntry } from '../types.ts';

interface AuditLogViewProps {
  logs: AuditLogEntry[];
}

export const AuditLogView: React.FC<AuditLogViewProps> = ({ logs }) => {
  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto divide-y divide-zinc-850 text-xs">
      {logs.length === 0 ? (
        <div className="p-4 text-center text-zinc-500">
          No activity recorded yet
        </div>
      ) : (
        logs.map((log) => (
          <div
            key={log.id}
            className="px-3 py-2.5 flex items-start justify-between gap-2 hover:bg-zinc-900/50 transition-colors"
          >
            <div className="min-w-0 pr-1">
              <span className="text-zinc-300 font-medium">{log.actorName} </span>
              <span className="text-zinc-400">
                {log.type === 'USER_JOINED'
                  ? 'joined the room'
                  : log.type === 'USER_LEFT'
                  ? 'left the room'
                  : log.type === 'HOST_TRANSFERRED'
                  ? 'was promoted to host'
                  : log.type === 'RATE_LIMIT_WARNING'
                  ? 'tripped rate limit'
                  : log.type === 'LANGUAGE_CHANGED'
                  ? 'changed language'
                  : log.type === 'ROOM_CREATED'
                  ? 'created the room'
                  : 'edited code'}
              </span>
            </div>

            <span className="text-[10px] text-zinc-500 whitespace-nowrap pt-0.5">
              {formatTime(log.timestamp)}
            </span>
          </div>
        ))
      )}
    </div>
  );
};
