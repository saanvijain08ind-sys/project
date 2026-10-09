import React, { useState, useMemo } from 'react';
import { AuditLogEntry } from '../types.ts';
import { ShieldCheck, Search, Filter, AlertTriangle, ArrowRightLeft, UserCheck, UserMinus, FileCode, Clock } from 'lucide-react';

interface AuditLogViewProps {
  logs: AuditLogEntry[];
}

export const AuditLogView: React.FC<AuditLogViewProps> = ({ logs }) => {
  const [filterType, setFilterType] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const matchesFilter = filterType === 'ALL' || log.type === filterType;
      const matchesSearch =
        !searchQuery ||
        log.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.actorName.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesFilter && matchesSearch;
    });
  }, [logs, filterType, searchQuery]);

  const getLogIcon = (type: AuditLogEntry['type']) => {
    switch (type) {
      case 'ROOM_CREATED':
      case 'USER_JOINED':
        return <UserCheck className="w-3.5 h-3.5 text-emerald-400" />;
      case 'USER_LEFT':
        return <UserMinus className="w-3.5 h-3.5 text-rose-400" />;
      case 'HOST_TRANSFERRED':
        return <ArrowRightLeft className="w-3.5 h-3.5 text-amber-400" />;
      case 'RATE_LIMIT_WARNING':
        return <AlertTriangle className="w-3.5 h-3.5 text-amber-500 animate-pulse" />;
      case 'CODE_MUTATION':
        return <FileCode className="w-3.5 h-3.5 text-indigo-400" />;
      default:
        return <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  const formatTimestamp = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 border border-slate-800/80 rounded-xl overflow-hidden shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900/90 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <h2 className="text-xs font-semibold text-slate-200 tracking-wide uppercase">
            Activity Audit Log
          </h2>
        </div>
        <span className="text-[11px] font-mono text-slate-400">
          {logs.length} Event{logs.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Filter / Search Bar */}
      <div className="p-2.5 bg-slate-900/40 border-b border-slate-800/80 flex flex-col gap-2">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
          <input
            type="text"
            placeholder="Search audit trail..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Filter Badges */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px]">
          <Filter className="w-3 h-3 text-slate-500 shrink-0" />
          {[
            { id: 'ALL', label: 'All' },
            { id: 'CODE_MUTATION', label: 'Mutations' },
            { id: 'HOST_TRANSFERRED', label: 'Failovers' },
            { id: 'USER_JOINED', label: 'Joins' },
            { id: 'RATE_LIMIT_WARNING', label: 'Warnings' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterType(tab.id)}
              className={`px-2 py-0.5 rounded whitespace-nowrap transition-colors cursor-pointer ${
                filterType === tab.id
                  ? 'bg-indigo-600 text-white font-medium'
                  : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Audit Log Entries List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {filteredLogs.length === 0 ? (
          <div className="text-center py-8 text-xs text-slate-500">
            No events match current filter.
          </div>
        ) : (
          filteredLogs.map((log) => (
            <div
              key={log.id}
              className={`p-2.5 rounded-lg border text-xs transition-colors ${
                log.type === 'RATE_LIMIT_WARNING'
                  ? 'bg-amber-500/10 border-amber-500/30'
                  : log.type === 'HOST_TRANSFERRED'
                  ? 'bg-indigo-950/40 border-indigo-500/30'
                  : 'bg-slate-900/40 border-slate-800/80'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <div className="mt-0.5 shrink-0">{getLogIcon(log.type)}</div>
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        style={{ color: log.actorColor }}
                        className="font-semibold text-slate-200"
                      >
                        {log.actorName}
                      </span>
                      <span className="text-slate-400">{log.message}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 text-[10px] text-slate-500 shrink-0 font-mono">
                  <Clock className="w-2.5 h-2.5" />
                  <span>{formatTimestamp(log.timestamp)}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer Info */}
      <div className="px-3 py-2 bg-slate-900/60 border-t border-slate-800/80 text-[10px] text-slate-500 font-mono flex items-center justify-between">
        <span>Tamper-evident in-memory ledger</span>
        <span>Max buffer: 100 entries</span>
      </div>
    </div>
  );
};
