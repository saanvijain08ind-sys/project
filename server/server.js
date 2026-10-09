/**
 * ============================================================================
 * SyncPad - Real-Time Collaborative Workspace Server
 * ============================================================================
 * Tech Stack: Node.js (ESM), Express, Socket.IO, Crypto
 *
 * Core Capabilities:
 *  1. Authoritative In-Memory Room Session Store with Version Tracking
 *  2. SHA-256 Passcode Protection & Cryptographic Access Control
 *  3. Sliding Window Rate Limiting (> 5 updates/second dropped with feedback)
 *  4. Automatic Host Failover to the Oldest Remaining Active Peer
 *  5. Reconnection Resilience & Client Session Re-identification
 *  6. Memory Cleanup on Empty Room State
 * ============================================================================
 */

import express from 'express';
import http from 'http';
import crypto from 'crypto';
import { Server } from 'socket.io';

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || '*';

// Initialize Socket.IO with CORS tolerances
const io = new Server(server, {
  cors: {
    origin: CLIENT_ORIGIN,
    methods: ['GET', 'POST'],
  },
  pingTimeout: 20000,
  pingInterval: 10000,
});

app.use(express.json());

// ----------------------------------------------------------------------------
// 1. Sliding Window Rate Limiter (> 5 updates/second per connection)
// ----------------------------------------------------------------------------
export class SlidingWindowRateLimiter {
  constructor(maxRequests = 5, windowMs = 1000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.hits = new Map(); // socketId -> timestamp[]

    // Periodic sweep every 60s to prune dead connection entries
    setInterval(() => this.cleanup(), 60000).unref();
  }

  check(socketId) {
    const now = Date.now();
    const timestamps = this.hits.get(socketId) || [];
    const windowStart = now - this.windowMs;
    const validTimestamps = timestamps.filter((t) => t > windowStart);

    if (validTimestamps.length >= this.maxRequests) {
      const oldestInWindow = validTimestamps[0];
      const retryAfterMs = Math.max(0, oldestInWindow + this.windowMs - now);
      this.hits.set(socketId, validTimestamps);
      return {
        allowed: false,
        currentCount: validTimestamps.length,
        limit: this.maxRequests,
        retryAfterMs,
      };
    }

    validTimestamps.push(now);
    this.hits.set(socketId, validTimestamps);
    return {
      allowed: true,
      currentCount: validTimestamps.length,
      limit: this.maxRequests,
      retryAfterMs: 0,
    };
  }

  reset(socketId) {
    this.hits.delete(socketId);
  }

  cleanup() {
    const cutoff = Date.now() - this.windowMs;
    for (const [socketId, timestamps] of this.hits.entries()) {
      const active = timestamps.filter((t) => t > cutoff);
      if (active.length === 0) {
        this.hits.delete(socketId);
      } else {
        this.hits.set(socketId, active);
      }
    }
  }
}

// ----------------------------------------------------------------------------
// 2. Authoritative In-Memory Room Management State
// ----------------------------------------------------------------------------
function hashPasscode(passcode) {
  return crypto.createHash('sha256').update(passcode.trim()).digest('hex');
}

export class RoomManager {
  constructor() {
    this.rooms = new Map(); // roomId -> RoomState
    this.userToRoom = new Map(); // userId -> roomId
    this.emptyRoomTimeouts = new Map(); // roomId -> NodeJS.Timeout
  }

  static getDefaultCode(language = 'javascript') {
    if (language === 'python') {
      return `# SyncPad Real-Time Collaborative Workspace\n\ndef main():\n    print("Welcome to real-time synchronized editing!")\n\nmain()\n`;
    }
    return `// SyncPad - Real-Time Collaborative Workspace\n// Clean, executable JavaScript starter template\n\nfunction runWorkspaceDiagnostics() {\n  console.log("🚀 SyncPad Real-Time Workspace Initialized");\n\n  const session = {\n    protocol: "WebSocket (Socket.IO)",\n    rateLimit: "5 updates/second",\n    failover: "Oldest Active Member",\n    status: "Synchronized",\n  };\n\n  console.log("Session Specifications:");\n  for (const [key, value] of Object.entries(session)) {\n    console.log(\`  • \${key}: \${value}\`);\n  }\n\n  function fibonacci(n) {\n    if (n <= 1) return n;\n    return fibonacci(n - 1) + fibonacci(n - 2);\n  }\n\n  const terms = Array.from({ length: 8 }, (_, i) => fibonacci(i));\n  console.log(\`\\nFibonacci Series (first 8): [\${terms.join(', ')}]\`);\n  console.log("✅ All systems operational. Ready to collaborate!");\n}\n\nrunWorkspaceDiagnostics();\n`;
  }

  createRoom(roomId, hostSocketId, hostUserId, hostName, hostColor, passcode, language = 'javascript') {
    if (this.rooms.has(roomId)) {
      throw new Error(`Room '${roomId}' already exists.`);
    }

    // Clear any pending cleanup timeout if room ID was recently abandoned
    if (this.emptyRoomTimeouts.has(roomId)) {
      clearTimeout(this.emptyRoomTimeouts.get(roomId));
      this.emptyRoomTimeouts.delete(roomId);
    }

    const hasPasscode = Boolean(passcode && passcode.trim().length > 0);
    const passcodeHash = hasPasscode ? hashPasscode(passcode) : null;

    const hostParticipant = {
      socketId: hostSocketId,
      userId: hostUserId,
      username: hostName,
      color: hostColor,
      isHost: true,
      joinedAt: Date.now(),
      cursor: { line: 1, ch: 1 },
      isTyping: false,
      lastActiveAt: Date.now(),
    };

    const participants = new Map();
    participants.set(hostSocketId, hostParticipant);

    const room = {
      roomId,
      hasPasscode,
      passcodeHash,
      hostSocketId,
      hostUserId,
      code: RoomManager.getDefaultCode(language),
      language,
      version: 1,
      createdAt: Date.now(),
      participants,
      auditLogs: [],
    };

    this.addAuditLog(room, {
      type: 'ROOM_CREATED',
      actorName: hostName,
      actorColor: hostColor,
      message: `Room created by ${hostName} (${hasPasscode ? 'Passcode Protected' : 'Public Access'})`,
    });

    this.rooms.set(roomId, room);
    this.userToRoom.set(hostUserId, roomId);

    return { room, participant: hostParticipant };
  }

  verifyPasscode(roomId, passcode) {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    if (!room.hasPasscode) return true;
    if (!passcode) return false;
    return room.passcodeHash === hashPasscode(passcode);
  }

  joinRoom(roomId, socketId, userId, username, color, passcode) {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error(`Room '${roomId}' does not exist.`);
    }

    if (room.hasPasscode && !this.verifyPasscode(roomId, passcode)) {
      throw new Error('Invalid room passcode. Access denied.');
    }

    // Cancel empty-room cleanup timeout if active
    if (this.emptyRoomTimeouts.has(roomId)) {
      clearTimeout(this.emptyRoomTimeouts.get(roomId));
      this.emptyRoomTimeouts.delete(roomId);
    }

    // Resilience: Reconnection reconciliation without duplicate participant slots
    let existingSocketId = null;
    let existingParticipant = null;

    for (const [sId, p] of room.participants.entries()) {
      if (p.userId === userId) {
        existingSocketId = sId;
        existingParticipant = p;
        break;
      }
    }

    if (existingParticipant && existingSocketId) {
      room.participants.delete(existingSocketId);
      const isHost = room.hostSocketId === existingSocketId || room.hostUserId === userId;

      const reconnectedParticipant = {
        ...existingParticipant,
        socketId,
        username: username || existingParticipant.username,
        color: color || existingParticipant.color,
        isHost,
        lastActiveAt: Date.now(),
      };

      if (isHost) {
        room.hostSocketId = socketId;
      }

      room.participants.set(socketId, reconnectedParticipant);
      this.userToRoom.set(userId, roomId);

      this.addAuditLog(room, {
        type: 'USER_JOINED',
        actorName: reconnectedParticipant.username,
        actorColor: reconnectedParticipant.color,
        message: `${reconnectedParticipant.username} reconnected to session`,
      });

      return { room, participant: reconnectedParticipant, isReconnection: true };
    }

    // Fresh join
    const isFirstParticipant = room.participants.size === 0;
    const participant = {
      socketId,
      userId,
      username,
      color,
      isHost: isFirstParticipant,
      joinedAt: Date.now(),
      cursor: { line: 1, ch: 1 },
      isTyping: false,
      lastActiveAt: Date.now(),
    };

    if (isFirstParticipant) {
      room.hostSocketId = socketId;
      room.hostUserId = userId;
    }

    room.participants.set(socketId, participant);
    this.userToRoom.set(userId, roomId);

    this.addAuditLog(room, {
      type: 'USER_JOINED',
      actorName: username,
      actorColor: color,
      message: `${username} joined workspace`,
    });

    return { room, participant, isReconnection: false };
  }

  updateCode(roomId, socketId, newCode) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error(`Room '${roomId}' not found.`);

    const actor = room.participants.get(socketId);
    if (!actor) throw new Error('Unauthorized');

    const deltaChars = newCode.length - room.code.length;
    room.code = newCode;
    room.version += 1;
    actor.lastActiveAt = Date.now();

    if (Math.abs(deltaChars) > 0) {
      this.addAuditLog(room, {
        type: 'CODE_MUTATION',
        actorName: actor.username,
        actorColor: actor.color,
        message: `${actor.username} updated code (${deltaChars > 0 ? '+' : ''}${deltaChars} chars, v${room.version})`,
      });
    }

    return { room, actor, version: room.version };
  }

  updateCursor(roomId, socketId, cursor, selection) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    const participant = room.participants.get(socketId);
    if (!participant) return null;

    participant.cursor = cursor;
    participant.selection = selection;
    participant.lastActiveAt = Date.now();
    return participant;
  }

  updateTyping(roomId, socketId, isTyping) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    const participant = room.participants.get(socketId);
    if (!participant) return null;

    participant.isTyping = Boolean(isTyping);
    participant.lastActiveAt = Date.now();
    return participant;
  }

  /**
   * Automatic Host Failover on Abrupt Disconnection:
   * Migrates administrative role to oldest remaining member (sorted by joinedAt ASC).
   * Initiates room purge countdown if room becomes empty.
   */
  handleDisconnect(socketId) {
    let targetRoom = null;
    for (const room of this.rooms.values()) {
      if (room.participants.has(socketId)) {
        targetRoom = room;
        break;
      }
    }

    if (!targetRoom) {
      return { room: null, departedParticipant: null, newHost: null };
    }

    const departed = targetRoom.participants.get(socketId) || null;
    targetRoom.participants.delete(socketId);

    if (departed) {
      this.userToRoom.delete(departed.userId);
    }

    // If room is empty, schedule cleanup after 5 minutes to release server memory
    if (targetRoom.participants.size === 0) {
      const roomId = targetRoom.roomId;
      const timeout = setTimeout(() => {
        if (targetRoom.participants.size === 0) {
          this.rooms.delete(roomId);
          this.emptyRoomTimeouts.delete(roomId);
          console.log(`[SyncPad] Evicted empty room '${roomId}' from memory.`);
        }
      }, 5 * 60 * 1000);

      this.emptyRoomTimeouts.set(roomId, timeout);
      return { room: targetRoom, departedParticipant: departed, newHost: null };
    }

    let newHost = null;
    const wasHost = targetRoom.hostSocketId === socketId;

    if (wasHost) {
      // Sort remaining members by joinedAt ASC (oldest member gets host status)
      const remaining = Array.from(targetRoom.participants.values()).sort(
        (a, b) => a.joinedAt - b.joinedAt
      );

      if (remaining.length > 0) {
        newHost = remaining[0];
        newHost.isHost = true;
        targetRoom.hostSocketId = newHost.socketId;
        targetRoom.hostUserId = newHost.userId;

        this.addAuditLog(targetRoom, {
          type: 'HOST_TRANSFERRED',
          actorName: newHost.username,
          actorColor: newHost.color,
          message: `Host failover: ${newHost.username} promoted to host (oldest active member).`,
        });
      }
    }

    if (departed) {
      this.addAuditLog(targetRoom, {
        type: 'USER_LEFT',
        actorName: departed.username,
        actorColor: departed.color,
        message: `${departed.username} disconnected from workspace`,
      });
    }

    return { room: targetRoom, departedParticipant: departed, newHost };
  }

  addAuditLog(room, entry) {
    const full = {
      ...entry,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    };
    room.auditLogs.unshift(full);
    if (room.auditLogs.length > 100) {
      room.auditLogs.pop();
    }
    return full;
  }

  getRoom(roomId) {
    return this.rooms.get(roomId);
  }
}

// ----------------------------------------------------------------------------
// 3. Socket Handler Orchestration
// ----------------------------------------------------------------------------
const roomManager = new RoomManager();
const rateLimiter = new SlidingWindowRateLimiter(5, 1000);

io.on('connection', (socket) => {
  let lastWarningLoggedAt = 0;

  // room:create
  socket.on('room:create', (payload, callback) => {
    try {
      const { roomId, userId, username, color, passcode, language } = payload;
      if (!roomId?.trim()) {
        return callback?.({ success: false, error: 'Room ID required' });
      }

      const { room, participant } = roomManager.createRoom(
        roomId.trim().toLowerCase(),
        socket.id,
        userId,
        username?.trim() || 'Anonymous',
        color || '#3b82f6',
        passcode,
        language || 'typescript'
      );

      socket.join(room.roomId);

      callback?.({
        success: true,
        room: {
          roomId: room.roomId,
          hasPasscode: room.hasPasscode,
          hostSocketId: room.hostSocketId,
          hostUserId: room.hostUserId,
          code: room.code,
          language: room.language,
          version: room.version,
          participants: Array.from(room.participants.values()),
          auditLogs: room.auditLogs,
          isHost: true,
          currentUser: participant,
        },
      });
    } catch (err) {
      callback?.({ success: false, error: err.message });
    }
  });

  // room:join
  socket.on('room:join', (payload, callback) => {
    try {
      const { roomId, userId, username, color, passcode } = payload;
      if (!roomId?.trim()) {
        return callback?.({ success: false, error: 'Room ID required' });
      }

      const { room, participant, isReconnection } = roomManager.joinRoom(
        roomId.trim().toLowerCase(),
        socket.id,
        userId,
        username?.trim() || 'Anonymous',
        color || '#10b981',
        passcode
      );

      socket.join(room.roomId);

      callback?.({
        success: true,
        room: {
          roomId: room.roomId,
          hasPasscode: room.hasPasscode,
          hostSocketId: room.hostSocketId,
          hostUserId: room.hostUserId,
          code: room.code,
          language: room.language,
          version: room.version,
          participants: Array.from(room.participants.values()),
          auditLogs: room.auditLogs,
          isHost: participant.isHost,
          currentUser: participant,
        },
      });

      // Broadcast join to peers
      socket.to(room.roomId).emit('room:participant_joined', {
        participant,
        isReconnection,
        auditLog: room.auditLogs[0],
      });
    } catch (err) {
      callback?.({ success: false, error: err.message });
    }
  });

  // code:update with strict >5 updates/second rate limit
  socket.on('code:update', (payload) => {
    const { roomId, code } = payload;
    if (!roomId || typeof code !== 'string') return;

    // Enforce sliding window rate limit
    const rateCheck = rateLimiter.check(socket.id);
    if (!rateCheck.allowed) {
      socket.emit('rate_limit_exceeded', {
        limit: rateCheck.limit,
        currentCount: rateCheck.currentCount,
        retryAfterMs: rateCheck.retryAfterMs,
        message: `Rate limit breached (> ${rateCheck.limit} updates/sec). Code change dropped.`,
      });

      const now = Date.now();
      if (now - lastWarningLoggedAt > 3000) {
        lastWarningLoggedAt = now;
        const room = roomManager.getRoom(roomId);
        const user = room?.participants.get(socket.id);
        if (room && user) {
          const entry = roomManager.addAuditLog(room, {
            type: 'RATE_LIMIT_WARNING',
            actorName: user.username,
            actorColor: user.color,
            message: `Rate limiter tripped for ${user.username} (${rateCheck.currentCount} updates/sec)`,
          });
          io.to(roomId).emit('audit:new_entry', entry);
        }
      }
      return;
    }

    try {
      const { actor, version } = roomManager.updateCode(roomId, socket.id, code);
      socket.to(roomId).emit('code:sync', {
        code,
        version,
        actorSocketId: socket.id,
        actorName: actor.username,
        actorColor: actor.color,
      });
    } catch {
      // drop invalid updates
    }
  });

  // cursor:move
  socket.on('cursor:move', (payload) => {
    const { roomId, cursor, selection } = payload;
    if (!roomId || !cursor) return;

    const user = roomManager.updateCursor(roomId, socket.id, cursor, selection);
    if (user) {
      socket.to(roomId).emit('cursor:sync', {
        socketId: socket.id,
        userId: user.userId,
        username: user.username,
        color: user.color,
        cursor,
        selection,
      });
    }
  });

  // typing:status
  socket.on('typing:status', (payload) => {
    const { roomId, isTyping } = payload;
    if (!roomId) return;

    const user = roomManager.updateTyping(roomId, socket.id, isTyping);
    if (user) {
      socket.to(roomId).emit('typing:sync', {
        socketId: socket.id,
        username: user.username,
        color: user.color,
        isTyping: Boolean(isTyping),
      });
    }
  });

  // disconnect: failover to oldest member
  socket.on('disconnect', () => {
    rateLimiter.reset(socket.id);
    const { room, departedParticipant, newHost } = roomManager.handleDisconnect(socket.id);

    if (room && departedParticipant) {
      socket.to(room.roomId).emit('room:participant_left', {
        socketId: socket.id,
        userId: departedParticipant.userId,
        username: departedParticipant.username,
        auditLog: room.auditLogs[0],
      });

      if (newHost) {
        // Direct notification to newly designated host
        io.to(newHost.socketId).emit('host:promoted', {
          isHost: true,
          reason: `Host status migrated: previous host (${departedParticipant.username}) disconnected.`,
        });

        // Broadcast host failover to all members in room
        io.to(room.roomId).emit('room:host_changed', {
          newHostSocketId: newHost.socketId,
          newHostUserId: newHost.userId,
          newHostName: newHost.username,
          auditLog: room.auditLogs[0],
        });
      }

      if (room.auditLogs[0]) {
        io.to(room.roomId).emit('audit:new_entry', room.auditLogs[0]);
      }
    }
  });
});

// REST Health & Verification Endpoints
app.get('/api/health', (_req, res) => {
  res.json({ status: 'online', uptime: process.uptime(), timestamp: Date.now() });
});

app.post('/api/rooms/verify-passcode', (req, res) => {
  const { roomId, passcode } = req.body;
  if (!roomId) return res.status(400).json({ error: 'Room ID required' });
  const valid = roomManager.verifyPasscode(roomId, passcode);
  res.json({ valid });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[SyncPad Server] Listening on http://0.0.0.0:${PORT}`);
});
