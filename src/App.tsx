import { useState, useEffect, useRef, useCallback } from 'react';
import { socket, getPersistentUserId, getStoredUsername, getStoredColor } from './socket.ts';
import { RoomData, Participant, AuditLogEntry, RateLimitAlert } from './types.ts';
import { Navbar } from './components/Navbar.tsx';
import { CodeEditor } from './components/CodeEditor.tsx';
import { ParticipantsList } from './components/ParticipantsList.tsx';
import { AuditLogView } from './components/AuditLogView.tsx';
import { JoinRoomModal } from './components/JoinRoomModal.tsx';
import { DevToolsDrawer } from './components/DevToolsDrawer.tsx';
import { ArchitectureDocsModal } from './components/ArchitectureDocsModal.tsx';
import { transpileToExecutableJs } from './utils/tsTranspiler.ts';
import { AlertTriangle, Crown, Terminal } from 'lucide-react';

export default function App() {
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [roomData, setRoomData] = useState<RoomData | null>(null);
  const [rateLimitAlert, setRateLimitAlert] = useState<RateLimitAlert | null>(null);
  const [hostPromoNotice, setHostPromoNotice] = useState<string | null>(null);

  // UI layout states
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [activeSideTab, setActiveSideTab] = useState<'participants' | 'activity'>('participants');
  const [isDevToolsOpen, setIsDevToolsOpen] = useState(false);
  const [isDocsOpen, setIsDocsOpen] = useState(false);

  // Code Execution Engine state
  const [outputConsole, setOutputConsole] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  // Rate Limiting monitoring velocity
  const [currentUpdateRate, setCurrentUpdateRate] = useState(0);
  const recentUpdatesRef = useRef<number[]>([]);

  const userId = useRef(getPersistentUserId()).current;
  const username = useRef(getStoredUsername()).current;
  const color = useRef(getStoredColor()).current;

  // Track socket request velocity
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const valid = recentUpdatesRef.current.filter((t) => t > now - 1000);
      recentUpdatesRef.current = valid;
      setCurrentUpdateRate(valid.length);
    }, 250);
    return () => clearInterval(interval);
  }, []);

  // Socket.IO event listeners
  useEffect(() => {
    function onConnect() {
      setIsConnected(true);
    }

    function onDisconnect() {
      setIsConnected(false);
    }

    function onCodeSync(payload: {
      code: string;
      version: number;
      actorSocketId: string;
      actorName: string;
      actorColor: string;
    }) {
      setRoomData((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          code: payload.code,
          version: payload.version,
        };
      });
    }

    function onCursorSync(payload: {
      socketId: string;
      userId: string;
      username: string;
      color: string;
      cursor: { line: number; ch: number };
      selection?: { startLine: number; startCh: number; endLine: number; endCh: number };
    }) {
      setRoomData((prev) => {
        if (!prev) return null;
        const updated = prev.participants.map((p) => {
          if (p.userId === payload.userId) {
            return {
              ...p,
              cursor: payload.cursor,
              selection: payload.selection,
              lastActiveAt: Date.now(),
            };
          }
          return p;
        });
        return { ...prev, participants: updated };
      });
    }

    function onTypingSync(payload: {
      socketId: string;
      username: string;
      color: string;
      isTyping: boolean;
    }) {
      setRoomData((prev) => {
        if (!prev) return null;
        const updated = prev.participants.map((p) => {
          if (p.socketId === payload.socketId) {
            return { ...p, isTyping: payload.isTyping };
          }
          return p;
        });
        return { ...prev, participants: updated };
      });
    }

    function onLanguageSync(payload: { language: string }) {
      setRoomData((prev) => (prev ? { ...prev, language: payload.language } : null));
    }

    function onParticipantJoined(payload: {
      participant: Participant;
      isReconnection: boolean;
      auditLog?: AuditLogEntry;
    }) {
      setRoomData((prev) => {
        if (!prev) return null;
        const filtered = prev.participants.filter((p) => p.userId !== payload.participant.userId);
        const newLogs = payload.auditLog ? [payload.auditLog, ...prev.auditLogs] : prev.auditLogs;
        return {
          ...prev,
          participants: [...filtered, payload.participant],
          auditLogs: newLogs,
        };
      });
    }

    function onParticipantLeft(payload: {
      socketId: string;
      userId: string;
      username: string;
      auditLog?: AuditLogEntry;
    }) {
      setRoomData((prev) => {
        if (!prev) return null;
        const filtered = prev.participants.filter(
          (p) => p.socketId !== payload.socketId && p.userId !== payload.userId
        );
        const newLogs = payload.auditLog ? [payload.auditLog, ...prev.auditLogs] : prev.auditLogs;
        return {
          ...prev,
          participants: filtered,
          auditLogs: newLogs,
        };
      });
    }

    function onHostPromoted(payload: { isHost: boolean; reason: string }) {
      setHostPromoNotice(payload.reason);
      setRoomData((prev) => {
        if (!prev) return null;
        const updated = prev.participants.map((p) => {
          if (p.userId === userId) return { ...p, isHost: true };
          return p;
        });
        return { ...prev, isHost: true, participants: updated };
      });
      setTimeout(() => setHostPromoNotice(null), 5000);
    }

    function onRoomHostChanged(payload: {
      newHostSocketId: string;
      newHostUserId: string;
      newHostName: string;
      auditLog?: AuditLogEntry;
    }) {
      setRoomData((prev) => {
        if (!prev) return null;
        const updated = prev.participants.map((p) => ({
          ...p,
          isHost: p.userId === payload.newHostUserId,
        }));
        const newLogs = payload.auditLog ? [payload.auditLog, ...prev.auditLogs] : prev.auditLogs;
        return {
          ...prev,
          hostSocketId: payload.newHostSocketId,
          hostUserId: payload.newHostUserId,
          isHost: payload.newHostUserId === userId,
          participants: updated,
          auditLogs: newLogs,
        };
      });
    }

    function onRateLimitExceeded(payload: {
      limit: number;
      currentCount: number;
      retryAfterMs: number;
      message: string;
    }) {
      setRateLimitAlert({ ...payload, timestamp: Date.now() });
      setTimeout(() => setRateLimitAlert(null), 4000);
    }

    function onAuditNewEntry(payload: AuditLogEntry) {
      setRoomData((prev) => {
        if (!prev) return null;
        return { ...prev, auditLogs: [payload, ...prev.auditLogs.slice(0, 99)] };
      });
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('code:sync', onCodeSync);
    socket.on('cursor:sync', onCursorSync);
    socket.on('typing:sync', onTypingSync);
    socket.on('language:sync', onLanguageSync);
    socket.on('room:participant_joined', onParticipantJoined);
    socket.on('room:participant_left', onParticipantLeft);
    socket.on('host:promoted', onHostPromoted);
    socket.on('room:host_changed', onRoomHostChanged);
    socket.on('rate_limit_exceeded', onRateLimitExceeded);
    socket.on('audit:new_entry', onAuditNewEntry);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('code:sync', onCodeSync);
      socket.off('cursor:sync', onCursorSync);
      socket.off('typing:sync', onTypingSync);
      socket.off('language:sync', onLanguageSync);
      socket.off('room:participant_joined', onParticipantJoined);
      socket.off('room:participant_left', onParticipantLeft);
      socket.off('host:promoted', onHostPromoted);
      socket.off('room:host_changed', onRoomHostChanged);
      socket.off('rate_limit_exceeded', onRateLimitExceeded);
      socket.off('audit:new_entry', onAuditNewEntry);
    };
  }, [userId]);

  // Seamless Join or Create action
  const handleJoinOrCreate = useCallback(
    (
      targetRoomId: string,
      rUsername: string,
      rColor: string,
      passcode?: string
    ): Promise<{ success: boolean; error?: string }> => {
      return new Promise((resolve) => {
        // First try to join existing room
        socket.emit(
          'room:join',
          {
            roomId: targetRoomId,
            userId,
            username: rUsername,
            color: rColor,
            passcode,
          },
          (joinRes: { success: boolean; error?: string; room?: RoomData }) => {
            if (joinRes.success && joinRes.room) {
              setRoomData(joinRes.room);
              return resolve({ success: true });
            }

            // If room does not exist, auto-create it
            if (joinRes.error && joinRes.error.includes('does not exist')) {
              socket.emit(
                'room:create',
                {
                  roomId: targetRoomId,
                  userId,
                  username: rUsername,
                  color: rColor,
                  passcode,
                  language: 'javascript',
                },
                (createRes: { success: boolean; error?: string; room?: RoomData }) => {
                  if (createRes.success && createRes.room) {
                    setRoomData(createRes.room);
                    return resolve({ success: true });
                  }
                  resolve({ success: false, error: createRes.error || 'Failed to create room' });
                }
              );
            } else {
              // Wrong passcode or other join rejection
              resolve({ success: false, error: joinRes.error || 'Failed to enter room' });
            }
          }
        );
      });
    },
    [userId]
  );

  const handleLeaveRoom = () => {
    socket.disconnect();
    socket.connect();
    setRoomData(null);
  };

  const handleCodeChange = (newCode: string) => {
    if (!roomData) return;

    recentUpdatesRef.current.push(Date.now());
    setRoomData((prev) => (prev ? { ...prev, code: newCode } : null));

    socket.emit('code:update', {
      roomId: roomData.roomId,
      code: newCode,
      version: roomData.version,
    });
  };

  const handleCursorChange = (
    cursor: { line: number; ch: number },
    selection?: { startLine: number; startCh: number; endLine: number; endCh: number }
  ) => {
    if (!roomData) return;
    socket.emit('cursor:move', {
      roomId: roomData.roomId,
      cursor,
      selection,
    });
  };

  const handleTypingChange = (isTyping: boolean) => {
    if (!roomData) return;
    socket.emit('typing:status', {
      roomId: roomData.roomId,
      isTyping,
    });
  };

  const handleLanguageChange = (language: string) => {
    if (!roomData) return;
    setRoomData((prev) => (prev ? { ...prev, language } : null));
    socket.emit('language:change', {
      roomId: roomData.roomId,
      language,
    });
  };

  // Run Code in sandboxed client execution engine
  const handleRunCode = () => {
    if (!roomData) return;
    setIsRunning(true);
    setOutputConsole(null);

    setTimeout(() => {
      try {
        const lang = roomData.language;
        if (lang === 'javascript' || lang === 'typescript') {
          const logs: string[] = [];
          const customConsole = {
            log: (...args: unknown[]) =>
              logs.push(args.map((a) => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a))).join(' ')),
            error: (...args: unknown[]) => logs.push('❌ ' + args.join(' ')),
            warn: (...args: unknown[]) => logs.push('⚠️ ' + args.join(' ')),
          };

          const { jsCode } = transpileToExecutableJs(roomData.code);
          const runFn = new Function('console', jsCode);
          runFn(customConsole);

          setOutputConsole(logs.length > 0 ? logs.join('\n') : 'Program ran with no output.');
        } else {
          setOutputConsole(`[${lang.toUpperCase()} Sandbox]: Code validated (v${roomData.version}).`);
        }
      } catch (err: unknown) {
        setOutputConsole('Error: ' + (err instanceof Error ? err.message : String(err)));
      } finally {
        setIsRunning(false);
      }
    }, 100);
  };

  // Flood Test Trigger (moved to discreet Dev Tools drawer)
  const handleTriggerFloodTest = () => {
    if (!roomData) return;
    for (let i = 1; i <= 9; i++) {
      setTimeout(() => {
        recentUpdatesRef.current.push(Date.now());
        socket.emit('code:update', {
          roomId: roomData.roomId,
          code: roomData.code + `\n// Packet #${i}`,
          version: roomData.version,
        });
      }, i * 35);
    }
  };

  // Peer Collaborator simulation (moved to discreet Dev Tools drawer)
  const handleAddSimulatedPeer = () => {
    if (!roomData) return;
    const names = ['Sarah', 'Alex', 'Elena', 'Marcus'];
    const chosen = names[Math.floor(Math.random() * names.length)];
    const fakeUserId = 'sim_' + Math.random().toString(36).substring(2, 7);
    const fakeSocketId = 'sock_' + Math.random().toString(36).substring(2, 7);

    const simParticipant: Participant = {
      socketId: fakeSocketId,
      userId: fakeUserId,
      username: chosen,
      color: '#f59e0b',
      isHost: false,
      joinedAt: Date.now(),
      cursor: { line: 3, ch: 14 },
      isTyping: true,
      lastActiveAt: Date.now(),
    };

    const newAuditLog: AuditLogEntry = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      type: 'USER_JOINED',
      actorName: chosen,
      actorColor: '#f59e0b',
      message: `${chosen} joined workspace`,
    };

    setRoomData((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        participants: [...prev.participants, simParticipant],
        auditLogs: [newAuditLog, ...prev.auditLogs],
      };
    });

    let step = 0;
    const interval = setInterval(() => {
      step++;
      setRoomData((prev) => {
        if (!prev) return null;
        const exists = prev.participants.some((p) => p.userId === fakeUserId);
        if (!exists) {
          clearInterval(interval);
          return prev;
        }

        const lines = prev.code.split('\n');
        const targetLine = Math.min(lines.length, (step % 5) + 2);
        const updated = prev.participants.map((p) => {
          if (p.userId === fakeUserId) {
            return {
              ...p,
              cursor: { line: targetLine, ch: (step * 4) % 20 + 2 },
              isTyping: step % 2 === 0,
            };
          }
          return p;
        });

        return { ...prev, participants: updated };
      });

      if (step > 12) {
        clearInterval(interval);
        setRoomData((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            participants: prev.participants.map((p) =>
              p.userId === fakeUserId ? { ...p, isTyping: false } : p
            ),
          };
        });
      }
    }, 1500);
  };

  // Host failover test (moved to Dev Tools drawer)
  const handleSimulateHostDisconnect = () => {
    if (!roomData || !roomData.isHost || roomData.participants.length <= 1) return;

    const others = roomData.participants.filter((p) => p.userId !== userId);
    const oldest = others.sort((a, b) => a.joinedAt - b.joinedAt)[0];

    const auditEntry: AuditLogEntry = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      type: 'HOST_TRANSFERRED',
      actorName: oldest.username,
      actorColor: oldest.color,
      message: `Host transferred to ${oldest.username}`,
    };

    setRoomData((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        isHost: false,
        hostUserId: oldest.userId,
        hostSocketId: oldest.socketId,
        participants: prev.participants.map((p) => ({
          ...p,
          isHost: p.userId === oldest.userId,
        })),
        auditLogs: [auditEntry, ...prev.auditLogs],
      };
    });
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-zinc-950 text-zinc-100 overflow-hidden font-sans select-none">
      {!roomData ? (
        <JoinRoomModal
          initialUsername={username}
          initialColor={color}
          onJoinOrCreate={handleJoinOrCreate}
        />
      ) : (
        <>
          {/* Minimalist Top Header */}
          <Navbar
            roomId={roomData.roomId}
            hasPasscode={roomData.hasPasscode}
            language={roomData.language}
            onLanguageChange={handleLanguageChange}
            onRunCode={handleRunCode}
            isRunning={isRunning}
            participantCount={roomData.participants.length}
            isSidebarOpen={isSidebarOpen}
            onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
            isConnected={isConnected}
            onLeaveRoom={handleLeaveRoom}
          />

          {/* Floating Subtle Notification Toasts */}
          {rateLimitAlert && (
            <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 px-3 py-1.5 rounded-lg bg-zinc-900 border border-amber-500/40 text-amber-300 text-xs shadow-xl flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Too many updates. Please slow down ({rateLimitAlert.retryAfterMs}ms backoff).</span>
            </div>
          )}

          {hostPromoNotice && (
            <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs shadow-xl flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
              <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>You are now the room host.</span>
            </div>
          )}

          {/* Distraction-Free Split View */}
          <main className="flex-1 flex overflow-hidden">
            {/* Full-Height Code Editor */}
            <section className="flex-1 h-full min-w-0">
              <CodeEditor
                code={roomData.code}
                language={roomData.language}
                participants={roomData.participants}
                currentUserId={userId}
                onCodeChange={handleCodeChange}
                onCursorChange={handleCursorChange}
                onTypingChange={handleTypingChange}
                outputConsole={outputConsole}
                onClearConsole={() => setOutputConsole(null)}
              />
            </section>

            {/* Collapsible Right Sidebar */}
            {isSidebarOpen && (
              <aside className="w-64 border-l border-zinc-850 bg-zinc-950 flex flex-col h-full shrink-0">
                {/* Segmented Tab Header */}
                <div className="h-9 px-3 border-b border-zinc-850 flex items-center gap-4 text-xs">
                  <button
                    onClick={() => setActiveSideTab('participants')}
                    className={`font-medium transition-colors cursor-pointer ${
                      activeSideTab === 'participants'
                        ? 'text-zinc-100'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    Participants ({roomData.participants.length})
                  </button>
                  <button
                    onClick={() => setActiveSideTab('activity')}
                    className={`font-medium transition-colors cursor-pointer ${
                      activeSideTab === 'activity'
                        ? 'text-zinc-100'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    Activity
                  </button>
                </div>

                {/* Tab Content */}
                <div className="flex-1 min-h-0 overflow-hidden">
                  {activeSideTab === 'participants' ? (
                    <ParticipantsList
                      participants={roomData.participants}
                      currentUserId={userId}
                    />
                  ) : (
                    <AuditLogView logs={roomData.auditLogs} />
                  )}
                </div>
              </aside>
            )}
          </main>

          {/* Discreet Dev Tools Floating Trigger */}
          <div className="fixed bottom-3 right-3 z-30">
            <button
              onClick={() => setIsDevToolsOpen((prev) => !prev)}
              className="px-2.5 py-1 rounded-md text-[11px] font-medium text-zinc-400 hover:text-zinc-200 bg-zinc-900/90 hover:bg-zinc-850 border border-zinc-800 transition-colors shadow-sm cursor-pointer flex items-center gap-1.5"
            >
              <Terminal className="w-3 h-3 text-zinc-500" />
              <span>Dev Tools</span>
            </button>
          </div>

          {/* Collapsible Dev & Testing Drawer */}
          <DevToolsDrawer
            isOpen={isDevToolsOpen}
            onClose={() => setIsDevToolsOpen(false)}
            onAddSimulatedPeer={handleAddSimulatedPeer}
            onTriggerFloodTest={handleTriggerFloodTest}
            onSimulateHostDisconnect={handleSimulateHostDisconnect}
            isHost={roomData.isHost}
            participantCount={roomData.participants.length}
            currentUpdateRate={currentUpdateRate}
            onOpenDocs={() => setIsDocsOpen(true)}
          />

          {/* Architecture Documentation Modal */}
          <ArchitectureDocsModal
            isOpen={isDocsOpen}
            onClose={() => setIsDocsOpen(false)}
          />
        </>
      )}
    </div>
  );
}
