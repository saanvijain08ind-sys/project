import { useState, useEffect, useRef, useCallback } from 'react';
import { socket, getPersistentUserId, getStoredUsername, getStoredColor } from './socket.ts';
import { RoomData, Participant, AuditLogEntry, RateLimitAlert } from './types.ts';
import { Navbar } from './components/Navbar.tsx';
import { CodeEditor } from './components/CodeEditor.tsx';
import { ParticipantsList } from './components/ParticipantsList.tsx';
import { AuditLogView } from './components/AuditLogView.tsx';
import { JoinRoomModal } from './components/JoinRoomModal.tsx';
import { ArchitectureDocsModal } from './components/ArchitectureDocsModal.tsx';
import { Users, ShieldCheck, Crown } from 'lucide-react';

export default function App() {
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [roomData, setRoomData] = useState<RoomData | null>(null);
  const [rateLimitAlert, setRateLimitAlert] = useState<RateLimitAlert | null>(null);
  const [isDocsOpen, setIsDocsOpen] = useState(false);
  const [activeSideTab, setActiveSideTab] = useState<'participants' | 'audit'>('participants');
  const [hostPromoNotice, setHostPromoNotice] = useState<string | null>(null);

  // Rate Limiting monitoring velocity (local update count per second)
  const [currentUpdateRate, setCurrentUpdateRate] = useState(0);
  const recentUpdatesRef = useRef<number[]>([]);

  const userId = useRef(getPersistentUserId()).current;
  const username = useRef(getStoredUsername()).current;
  const color = useRef(getStoredColor()).current;

  // Track velocity meter
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const valid = recentUpdatesRef.current.filter((t) => t > now - 1000);
      recentUpdatesRef.current = valid;
      setCurrentUpdateRate(valid.length);
    }, 250);
    return () => clearInterval(interval);
  }, []);

  // Setup Socket event listeners
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
        const updatedParticipants = prev.participants.map((p) => {
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
        return { ...prev, participants: updatedParticipants };
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
        // Avoid duplicate user records
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
        const filtered = prev.participants.filter((p) => p.socketId !== payload.socketId && p.userId !== payload.userId);
        const newLogs = payload.auditLog ? [payload.auditLog, ...prev.auditLogs] : prev.auditLogs;
        return {
          ...prev,
          participants: filtered,
          auditLogs: newLogs,
        };
      });
    }

    // Host Failover Notification to the promoted client
    function onHostPromoted(payload: { isHost: boolean; reason: string }) {
      setHostPromoNotice(payload.reason);
      setRoomData((prev) => {
        if (!prev) return null;
        const updatedParticipants = prev.participants.map((p) => {
          if (p.userId === userId) {
            return { ...p, isHost: true };
          }
          return p;
        });
        return {
          ...prev,
          isHost: true,
          participants: updatedParticipants,
        };
      });
      setTimeout(() => setHostPromoNotice(null), 6000);
    }

    // Room-wide broadcast of host migration
    function onRoomHostChanged(payload: {
      newHostSocketId: string;
      newHostUserId: string;
      newHostName: string;
      auditLog?: AuditLogEntry;
    }) {
      setRoomData((prev) => {
        if (!prev) return null;
        const updatedParticipants = prev.participants.map((p) => ({
          ...p,
          isHost: p.userId === payload.newHostUserId,
        }));
        const newLogs = payload.auditLog ? [payload.auditLog, ...prev.auditLogs] : prev.auditLogs;
        return {
          ...prev,
          hostSocketId: payload.newHostSocketId,
          hostUserId: payload.newHostUserId,
          isHost: payload.newHostUserId === userId,
          participants: updatedParticipants,
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
      setRateLimitAlert({
        ...payload,
        timestamp: Date.now(),
      });
      setTimeout(() => setRateLimitAlert(null), 4000);
    }

    function onAuditNewEntry(payload: AuditLogEntry) {
      setRoomData((prev) => {
        if (!prev) return null;
        // Prepend new entry
        return {
          ...prev,
          auditLogs: [payload, ...prev.auditLogs.slice(0, 99)],
        };
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

  // Handle Room Creation
  const handleCreateRoom = useCallback(
    (
      roomId: string,
      rUsername: string,
      rColor: string,
      passcode?: string,
      language: string = 'javascript'
    ): Promise<{ success: boolean; error?: string }> => {
      return new Promise((resolve) => {
        socket.emit(
          'room:create',
          {
            roomId,
            userId,
            username: rUsername,
            color: rColor,
            passcode,
            language,
          },
          (res: { success: boolean; error?: string; room?: RoomData }) => {
            if (res.success && res.room) {
              setRoomData(res.room);
              resolve({ success: true });
            } else {
              resolve({ success: false, error: res.error || 'Room creation failed' });
            }
          }
        );
      });
    },
    [userId]
  );

  // Handle Room Joining
  const handleJoinRoom = useCallback(
    (
      roomId: string,
      rUsername: string,
      rColor: string,
      passcode?: string
    ): Promise<{ success: boolean; error?: string }> => {
      return new Promise((resolve) => {
        socket.emit(
          'room:join',
          {
            roomId,
            userId,
            username: rUsername,
            color: rColor,
            passcode,
          },
          (res: { success: boolean; error?: string; room?: RoomData }) => {
            if (res.success && res.room) {
              setRoomData(res.room);
              resolve({ success: true });
            } else {
              resolve({ success: false, error: res.error || 'Failed to join room' });
            }
          }
        );
      });
    },
    [userId]
  );

  // Leave Room
  const handleLeaveRoom = () => {
    socket.disconnect();
    socket.connect();
    setRoomData(null);
  };

  // Code Mutation Handler
  const handleCodeChange = (newCode: string) => {
    if (!roomData) return;

    // Record local hit for rate monitor
    const now = Date.now();
    recentUpdatesRef.current.push(now);

    // Optimistic local update
    setRoomData((prev) => (prev ? { ...prev, code: newCode } : null));

    // Emit mutation to server
    socket.emit('code:update', {
      roomId: roomData.roomId,
      code: newCode,
      version: roomData.version,
    });
  };

  // Cursor Update Handler
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

  // Typing Update Handler
  const handleTypingChange = (isTyping: boolean) => {
    if (!roomData) return;
    socket.emit('typing:status', {
      roomId: roomData.roomId,
      isTyping,
    });
  };

  // Language Change Handler
  const handleLanguageChange = (language: string) => {
    if (!roomData) return;
    setRoomData((prev) => (prev ? { ...prev, language } : null));
    socket.emit('language:change', {
      roomId: roomData.roomId,
      language,
    });
  };

  // Rate Limiting Flood Test:
  // Deliberately blast > 5 mutations in <1 second to test the server's rate limiter
  const handleTriggerFloodTest = () => {
    if (!roomData) return;
    for (let i = 1; i <= 9; i++) {
      setTimeout(() => {
        recentUpdatesRef.current.push(Date.now());
        socket.emit('code:update', {
          roomId: roomData.roomId,
          code: roomData.code + `\n// Flood packet #${i} (${Date.now()})`,
          version: roomData.version,
        });
      }, i * 40);
    }
  };

  // Simulate Peer Collaborator for solo testing
  const handleAddSimulatedPeer = () => {
    if (!roomData) return;
    const botNames = ['Sarah_Core', 'Alex_Frontend', 'Elena_Systems', 'Marcus_Dev'];
    const chosenName = botNames[Math.floor(Math.random() * botNames.length)];
    const fakeUserId = 'sim_' + Math.random().toString(36).substring(2, 7);
    const fakeSocketId = 'sock_' + Math.random().toString(36).substring(2, 7);
    const fakeColor = '#f59e0b';

    const simParticipant: Participant = {
      socketId: fakeSocketId,
      userId: fakeUserId,
      username: chosenName,
      color: fakeColor,
      isHost: false,
      joinedAt: Date.now(),
      cursor: { line: 4, ch: 18 },
      isTyping: true,
      lastActiveAt: Date.now(),
    };

    const newAuditLog: AuditLogEntry = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      type: 'USER_JOINED',
      actorName: chosenName,
      actorColor: fakeColor,
      message: `${chosenName} (Simulated Collaborator) joined session`,
    };

    setRoomData((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        participants: [...prev.participants, simParticipant],
        auditLogs: [newAuditLog, ...prev.auditLogs],
      };
    });

    // Simulate collaborator typing and line movements
    let step = 0;
    const simInterval = setInterval(() => {
      step++;
      setRoomData((prev) => {
        if (!prev) return null;
        const exists = prev.participants.some((p) => p.userId === fakeUserId);
        if (!exists) {
          clearInterval(simInterval);
          return prev;
        }

        const lines = prev.code.split('\n');
        const targetLine = Math.min(lines.length, (step % 6) + 2);
        const updated = prev.participants.map((p) => {
          if (p.userId === fakeUserId) {
            return {
              ...p,
              cursor: { line: targetLine, ch: (step * 3) % 25 + 1 },
              isTyping: step % 2 === 0,
            };
          }
          return p;
        });

        return { ...prev, participants: updated };
      });

      if (step > 15) {
        clearInterval(simInterval);
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

  // Simulate Host Failover (Current Host steps down to test migration to oldest member)
  const handleSimulateHostDisconnect = () => {
    if (!roomData || !roomData.isHost || roomData.participants.length <= 1) return;

    // Find the oldest remaining member
    const others = roomData.participants.filter((p) => p.userId !== userId);
    const oldest = others.sort((a, b) => a.joinedAt - b.joinedAt)[0];

    const auditEntry: AuditLogEntry = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      type: 'HOST_TRANSFERRED',
      actorName: oldest.username,
      actorColor: oldest.color,
      message: `Host failover: ${oldest.username} promoted to host (oldest active member).`,
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
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* If not in a room, display the Create/Join Room modal */}
      {!roomData ? (
        <JoinRoomModal
          initialUsername={username}
          initialColor={color}
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
        />
      ) : (
        <>
          {/* Top Navbar */}
          <Navbar
            roomId={roomData.roomId}
            hasPasscode={roomData.hasPasscode}
            isHost={roomData.isHost}
            isConnected={isConnected}
            onLeaveRoom={handleLeaveRoom}
            onOpenDocs={() => setIsDocsOpen(true)}
            currentUpdateRate={currentUpdateRate}
          />

          {/* Host Failover Celebration Banner */}
          {hostPromoNotice && (
            <div className="bg-gradient-to-r from-amber-500/20 via-indigo-500/20 to-purple-500/20 border-b border-amber-500/30 px-4 py-2 flex items-center justify-between text-amber-200 text-xs animate-in slide-in-from-top duration-300">
              <div className="flex items-center gap-2">
                <Crown className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="font-semibold">Host Administrative Status Transferred:</span>
                <span>{hostPromoNotice}</span>
              </div>
              <span className="bg-amber-400 text-slate-950 px-2 py-0.5 rounded font-bold text-[10px]">
                You are now Host
              </span>
            </div>
          )}

          {/* Main Synchronized Workspace (Split-Screen Layout) */}
          <main className="flex-1 flex overflow-hidden p-3 gap-3">
            {/* Left Panel: High-Performance Code Editor */}
            <section className="flex-1 min-w-0 h-full flex flex-col">
              <CodeEditor
                code={roomData.code}
                language={roomData.language}
                version={roomData.version}
                participants={roomData.participants}
                currentUserId={userId}
                onCodeChange={handleCodeChange}
                onCursorChange={handleCursorChange}
                onTypingChange={handleTypingChange}
                rateLimitAlert={rateLimitAlert}
                onTriggerFloodTest={handleTriggerFloodTest}
                isHost={roomData.isHost}
                onLanguageChange={handleLanguageChange}
              />
            </section>

            {/* Right Panel: Split Workspace Sidebar (Active Participants & Audit Log) */}
            <aside className="w-80 lg:w-96 shrink-0 h-full flex flex-col">
              {/* Tab Selector */}
              <div className="grid grid-cols-2 gap-1 p-1 bg-slate-900 border border-slate-800 rounded-xl mb-2">
                <button
                  onClick={() => setActiveSideTab('participants')}
                  className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    activeSideTab === 'participants'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Participants ({roomData.participants.length})</span>
                </button>
                <button
                  onClick={() => setActiveSideTab('audit')}
                  className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    activeSideTab === 'audit'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Audit Trail ({roomData.auditLogs.length})</span>
                </button>
              </div>

              {/* Sidebar View Container */}
              <div className="flex-1 min-h-0">
                {activeSideTab === 'participants' ? (
                  <ParticipantsList
                    participants={roomData.participants}
                    currentUserId={userId}
                    isHost={roomData.isHost}
                    onAddSimulatedPeer={handleAddSimulatedPeer}
                    onSimulateHostDisconnect={handleSimulateHostDisconnect}
                  />
                ) : (
                  <AuditLogView logs={roomData.auditLogs} />
                )}
              </div>
            </aside>
          </main>
        </>
      )}

      {/* Architecture Documentation & Event Schema Modal */}
      <ArchitectureDocsModal
        isOpen={isDocsOpen}
        onClose={() => setIsDocsOpen(false)}
      />
    </div>
  );
}
