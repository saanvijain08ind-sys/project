import React, { useState } from 'react';
import { X, BookOpen, Layers, Table, Server, Shield, Check, Copy } from 'lucide-react';

interface ArchitectureDocsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ArchitectureDocsModal: React.FC<ArchitectureDocsModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'schema' | 'filestructure' | 'backend'>('schema');
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  if (!isOpen) return null;

  const copyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(id);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  const schemaData = [
    {
      name: 'room:create',
      direction: 'Client -> Server',
      payload: '{ roomId: string, userId: string, username: string, color: string, passcode?: string, language?: string }',
      description: 'Creates a virtual workspace. Allocates room state, registers caller as initial host, and initializes version 1.',
    },
    {
      name: 'room:join',
      direction: 'Client -> Server',
      payload: '{ roomId: string, userId: string, username: string, color: string, passcode?: string }',
      description: 'Validates passcode (if enabled), admits participant, reconciles previous userId sessions without duplicating participants.',
    },
    {
      name: 'room:joined',
      direction: 'Server -> Client',
      payload: '{ roomId, code, version, language, participants: Participant[], auditLogs: AuditLogEntry[], isHost: boolean }',
      description: 'Full authoritative state initialization sent to newly joined or reconnected client.',
    },
    {
      name: 'room:participant_joined',
      direction: 'Server -> Client',
      payload: '{ participant: Participant, isReconnection: boolean, auditLog: AuditLogEntry }',
      description: 'Broadcast to room peers when a new user enters or reconnects.',
    },
    {
      name: 'code:update',
      direction: 'Client -> Server',
      payload: '{ roomId: string, code: string, version?: number, delta?: object }',
      description: 'Submits code mutation. Intercepted by Sliding Window Rate Limiter (>5 updates/sec dropped). Increments room version.',
    },
    {
      name: 'code:sync',
      direction: 'Server -> Client',
      payload: '{ code: string, version: number, actorSocketId: string, actorName: string, actorColor: string }',
      description: 'Broadcasts confirmed code mutation to other peers in room.',
    },
    {
      name: 'cursor:move',
      direction: 'Client -> Server',
      payload: '{ roomId: string, cursor: { line: number, ch: number }, selection?: object }',
      description: 'Transmits real-time cursor line/column coordinates and selection range.',
    },
    {
      name: 'cursor:sync',
      direction: 'Server -> Client',
      payload: '{ socketId: string, userId: string, username: string, color: string, cursor: object, selection?: object }',
      description: 'Broadcasts collaborator cursor position and selection highlight to peers.',
    },
    {
      name: 'typing:status',
      direction: 'Client -> Server',
      payload: '{ roomId: string, isTyping: boolean }',
      description: 'Notifies when participant starts or stops typing (debounced).',
    },
    {
      name: 'typing:sync',
      direction: 'Server -> Client',
      payload: '{ socketId: string, username: string, color: string, isTyping: boolean }',
      description: 'Broadcasts live typing badges to room peers.',
    },
    {
      name: 'rate_limit_exceeded',
      direction: 'Server -> Client',
      payload: '{ limit: number, currentCount: number, retryAfterMs: number, message: string }',
      description: 'Emitted directly to offending client when rate limit is exceeded (>5 updates/sec).',
    },
    {
      name: 'host:promoted',
      direction: 'Server -> Client',
      payload: '{ isHost: true, reason: string }',
      description: 'Direct notification to the oldest remaining member when the host abruptly disconnects.',
    },
    {
      name: 'room:host_changed',
      direction: 'Server -> Client',
      payload: '{ newHostSocketId: string, newHostUserId: string, newHostName: string, auditLog: AuditLogEntry }',
      description: 'Room-wide broadcast announcing new administrative host failover.',
    },
    {
      name: 'room:participant_left',
      direction: 'Server -> Client',
      payload: '{ socketId: string, userId: string, username: string, auditLog: AuditLogEntry }',
      description: 'Broadcast when a participant disconnects or leaves.',
    },
    {
      name: 'audit:new_entry',
      direction: 'Server -> Client',
      payload: 'AuditLogEntry',
      description: 'Broadcasts new tamper-evident audit log event (mutations, joins, failovers, rate limits).',
    },
  ];

  const fileTree = `syncpad/
├── package.json                   # Dependencies, build & tsx scripts
├── tsconfig.json                  # Strict TypeScript configuration
├── vite.config.ts                 # React + Tailwind CSS plugins
├── server.ts                      # Express + HTTP Server + Socket.IO entry point
├── server/
│   ├── types.ts                   # Core interfaces: RoomState, Participant, AuditLogEntry
│   ├── rateLimiter.ts             # Strict Sliding Window Rate Limiter (>5 updates/sec)
│   ├── rooms.ts                   # In-memory Room State Store & Host Failover logic
│   └── socketHandlers.ts          # Socket.IO connection orchestration & event routers
├── src/
│   ├── main.tsx                   # React root entry
│   ├── App.tsx                    # Main state manager & Socket.IO listener orchestration
│   ├── socket.ts                  # Persistent userId & client Socket singleton
│   ├── types.ts                   # Frontend component interfaces & state types
│   ├── index.css                  # Tailored Dark IDE theme & Prism syntax styling
│   ├── utils/
│   │   └── codeHighlighter.ts     # PrismJS language tokenizer & HTML escaper
│   └── components/
│       ├── Navbar.tsx             # Room header, connectivity status, host badges
│       ├── CodeEditor.tsx         # Code editor with remote cursors, active line & typing badges
│       ├── ParticipantsList.tsx   # Active members, host crown, simulation controls
│       ├── AuditLogView.tsx       # Searchable & filterable activity audit timeline
│       ├── JoinRoomModal.tsx      # Passcode validation, room creator & join flow
│       └── ArchitectureDocsModal.tsx # Interactive specs, event schema & documentation
`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="w-full max-w-4xl max-h-[90vh] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900/90 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <BookOpen className="w-5 h-5 text-indigo-400" />
            <div>
              <h2 className="text-sm font-bold text-slate-100">
                Principal System Architecture & Socket.IO Schema
              </h2>
              <p className="text-xs text-slate-400">
                Production design for real-time collaborative workspace with rate limiting & failover
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 px-6 pt-3 border-b border-slate-800 bg-slate-950/50">
          <button
            onClick={() => setActiveTab('schema')}
            className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'schema'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Table className="w-3.5 h-3.5" />
            <span>Socket.IO Event Schema</span>
          </button>
          <button
            onClick={() => setActiveTab('filestructure')}
            className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'filestructure'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Monorepo Directory Structure</span>
          </button>
          <button
            onClick={() => setActiveTab('backend')}
            className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'backend'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span>Failover & Rate Limiting Engine</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'schema' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  Total Events: {schemaData.length} &middot; Directional Protocol Specification
                </span>
                <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                  RFC Compliant WebSocket Payloads
                </span>
              </div>

              <div className="border border-slate-800 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-950 text-slate-300 border-b border-slate-800 font-mono">
                    <tr>
                      <th className="py-2.5 px-3">Event Name</th>
                      <th className="py-2.5 px-3">Direction</th>
                      <th className="py-2.5 px-3">Payload Structure</th>
                      <th className="py-2.5 px-3">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {schemaData.map((ev) => (
                      <tr key={ev.name} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-2.5 px-3 font-mono text-indigo-300 font-semibold whitespace-nowrap">
                          {ev.name}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium ${
                              ev.direction.includes('Client -> Server')
                                ? 'bg-sky-500/20 text-sky-300'
                                : 'bg-emerald-500/20 text-emerald-300'
                            }`}
                          >
                            {ev.direction}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-slate-400 max-w-xs break-all">
                          {ev.payload}
                        </td>
                        <td className="py-2.5 px-3 text-slate-300 text-xs">
                          {ev.description}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'filestructure' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  Recommended Monorepo & Client/Server Layout
                </span>
                <button
                  onClick={() => copyText(fileTree, 'tree')}
                  className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 cursor-pointer"
                >
                  {copiedSection === 'tree' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedSection === 'tree' ? 'Copied!' : 'Copy Tree'}</span>
                </button>
              </div>

              <pre className="p-4 bg-slate-950 border border-slate-800 rounded-xl font-mono text-xs text-slate-300 overflow-x-auto leading-5">
                {fileTree}
              </pre>
            </div>
          )}

          {activeTab === 'backend' && (
            <div className="space-y-4 text-xs text-slate-300 leading-relaxed">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                  <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm">
                    <Shield className="w-4 h-4" />
                    <span>Sliding Window Rate Limiter</span>
                  </div>
                  <p className="text-slate-400">
                    Guarantees no socket flooding. Maintains an in-memory timestamp array per socket connection. On each mutation event, timestamps older than 1000ms are pruned. If counts exceed 5 within the window, the packet is rejected and a <code className="text-indigo-300">rate_limit_exceeded</code> event is emitted.
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-slate-400">
                    <li>Strict per-connection threshold: 5 updates/sec</li>
                    <li>Auto-cleanup worker clears dead sockets every 60s</li>
                    <li>Tamper-proof audit logging of rate-limit warnings</li>
                  </ul>
                </div>

                <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                  <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
                    <Server className="w-4 h-4" />
                    <span>Dynamic Host Failover</span>
                  </div>
                  <p className="text-slate-400">
                    When the room creator (host) closes the tab or drops connection, the room state machine immediately executes the failover algorithm:
                  </p>
                  <ol className="list-decimal list-inside space-y-1 text-slate-400">
                    <li>Identifies departed socket was <code className="text-amber-300">hostSocketId</code>.</li>
                    <li>Sorts active members by <code className="text-indigo-300">joinedAt ASC</code> (oldest member).</li>
                    <li>Promotes candidate to administrative host.</li>
                    <li>Emits <code className="text-indigo-300">host:promoted</code> and <code className="text-indigo-300">room:host_changed</code>.</li>
                  </ol>
                </div>
              </div>

              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-indigo-400 font-semibold text-sm">
                  <span>Reconnection Resilience & Session Continuity</span>
                </div>
                <p className="text-slate-400">
                  Clients persist a lightweight <code className="text-indigo-300">userId</code> in sessionStorage. If network connectivity drops or the client switches networks, the client reconnects with the same userId. The server identifies the re-entrant participant, swaps out the dead socket ID for the new one, reclaims their administrative or participant role, and avoids spawning duplicate user entities.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between text-xs text-slate-500">
          <span>SyncPad &middot; Principal Architecture Reference</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors cursor-pointer"
          >
            Close Viewer
          </button>
        </div>
      </div>
    </div>
  );
};
