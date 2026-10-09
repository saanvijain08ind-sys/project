import { Server, Socket } from 'socket.io';
import { RoomManager } from './rooms.ts';
import { SlidingWindowRateLimiter } from './rateLimiter.ts';

export function setupSocketHandlers(
  io: Server,
  roomManager: RoomManager,
  rateLimiter: SlidingWindowRateLimiter
): void {
  io.on('connection', (socket: Socket) => {
    // Track last rate warning time to avoid spamming the audit log
    let lastWarningLoggedAt = 0;

    /**
     * Helper to serialize room participants for client consumption
     */
    const serializeParticipants = (room: ReturnType<typeof roomManager.getRoom>) => {
      if (!room) return [];
      return Array.from(room.participants.values());
    };

    /**
     * EVENT: room:create
     * Creates a new room with caller as initial host
     */
    socket.on(
      'room:create',
      (
        payload: {
          roomId: string;
          userId: string;
          username: string;
          color: string;
          passcode?: string;
          language?: string;
        },
        callback?: (response: { success: boolean; error?: string; room?: unknown }) => void
      ) => {
        try {
          const { roomId, userId, username, color, passcode, language } = payload;
          if (!roomId || !roomId.trim()) {
            return callback?.({ success: false, error: 'Room ID cannot be empty.' });
          }

          const cleanRoomId = roomId.trim().toLowerCase();
          const cleanUsername = username?.trim() || 'Anonymous';
          const cleanColor = color || '#3b82f6';

          const { room, participant } = roomManager.createRoom(
            cleanRoomId,
            socket.id,
            userId,
            cleanUsername,
            cleanColor,
            passcode,
            language || 'javascript'
          );

          socket.join(cleanRoomId);

          const roomData = {
            roomId: room.roomId,
            hasPasscode: room.hasPasscode,
            hostSocketId: room.hostSocketId,
            hostUserId: room.hostUserId,
            code: room.code,
            language: room.language,
            version: room.version,
            participants: serializeParticipants(room),
            auditLogs: room.auditLogs,
            isHost: true,
            currentUser: participant,
          };

          callback?.({ success: true, room: roomData });

          // Broadcast global room count update if needed
          io.emit('rooms:updated', roomManager.getActiveRoomsList());
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : 'Failed to create room';
          callback?.({ success: false, error: errorMsg });
        }
      }
    );

    /**
     * EVENT: room:join
     * Joins an existing room or handles session reconnection
     */
    socket.on(
      'room:join',
      (
        payload: {
          roomId: string;
          userId: string;
          username: string;
          color: string;
          passcode?: string;
        },
        callback?: (response: { success: boolean; error?: string; room?: unknown }) => void
      ) => {
        try {
          const { roomId, userId, username, color, passcode } = payload;
          if (!roomId) {
            return callback?.({ success: false, error: 'Room ID required.' });
          }

          const cleanRoomId = roomId.trim().toLowerCase();
          const cleanUsername = username?.trim() || 'Anonymous';
          const cleanColor = color || '#10b981';

          const { room, participant, isReconnection } = roomManager.joinRoom(
            cleanRoomId,
            socket.id,
            userId,
            cleanUsername,
            cleanColor,
            passcode
          );

          socket.join(cleanRoomId);

          const roomData = {
            roomId: room.roomId,
            hasPasscode: room.hasPasscode,
            hostSocketId: room.hostSocketId,
            hostUserId: room.hostUserId,
            code: room.code,
            language: room.language,
            version: room.version,
            participants: serializeParticipants(room),
            auditLogs: room.auditLogs,
            isHost: participant.isHost,
            currentUser: participant,
          };

          callback?.({ success: true, room: roomData });

          // Notify other participants in the room
          socket.to(cleanRoomId).emit('room:participant_joined', {
            participant,
            isReconnection,
            auditLog: room.auditLogs[0],
          });

          // Refresh rooms list
          io.emit('rooms:updated', roomManager.getActiveRoomsList());
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : 'Failed to join room';
          callback?.({ success: false, error: errorMsg });
        }
      }
    );

    /**
     * EVENT: code:update
     * Updates code with strict per-connection rate limiting (>5 updates/second throttled or dropped)
     */
    socket.on(
      'code:update',
      (payload: {
        roomId: string;
        code: string;
        version?: number;
      }) => {
        const { roomId, code } = payload;
        if (!roomId || typeof code !== 'string') return;

        // Apply strict sliding window rate limiting
        const rateCheck = rateLimiter.check(socket.id);

        if (!rateCheck.allowed) {
          // Packet throttled / dropped
          socket.emit('rate_limit_exceeded', {
            limit: rateCheck.limit,
            currentCount: rateCheck.currentCount,
            retryAfterMs: rateCheck.retryAfterMs,
            message: `Update rate limit exceeded (> ${rateCheck.limit} updates/sec). Change dropped.`,
          });

          // Log warning to audit log at most once per 3 seconds to avoid audit flooding
          const now = Date.now();
          if (now - lastWarningLoggedAt > 3000) {
            lastWarningLoggedAt = now;
            const room = roomManager.getRoom(roomId);
            const user = room?.participants.get(socket.id);
            if (room && user) {
              const auditEntry = roomManager.addAuditLog(room, {
                type: 'RATE_LIMIT_WARNING',
                actorName: user.username,
                actorColor: user.color,
                message: `Rate limiter tripped for ${user.username} (${rateCheck.currentCount} updates/sec)`,
              });
              io.to(roomId).emit('audit:new_entry', auditEntry);
            }
          }
          return;
        }

        try {
          const { room, actor, version } = roomManager.updateCode(roomId, socket.id, code);

          // Broadcast authoritative code update to other clients in room
          socket.to(roomId).emit('code:sync', {
            code,
            version,
            actorSocketId: socket.id,
            actorName: actor.username,
            actorColor: actor.color,
          });

          // If a new audit log was added, broadcast it
          const latestLog = room.auditLogs[0];
          if (latestLog && latestLog.type === 'CODE_MUTATION') {
            io.to(roomId).emit('audit:new_entry', latestLog);
          }
        } catch {
          // Ignore invalid room mutation attempts
        }
      }
    );

    /**
     * EVENT: cursor:move
     * Broadcasts cursor position and selection range
     */
    socket.on(
      'cursor:move',
      (payload: {
        roomId: string;
        cursor: { line: number; ch: number };
        selection?: { startLine: number; startCh: number; endLine: number; endCh: number };
      }) => {
        const { roomId, cursor, selection } = payload;
        if (!roomId || !cursor) return;

        const updated = roomManager.updateCursor(roomId, socket.id, cursor, selection);
        if (updated) {
          socket.to(roomId).emit('cursor:sync', {
            socketId: socket.id,
            userId: updated.userId,
            username: updated.username,
            color: updated.color,
            cursor,
            selection,
          });
        }
      }
    );

    /**
     * EVENT: typing:status
     * Broadcasts live typing badges
     */
    socket.on(
      'typing:status',
      (payload: {
        roomId: string;
        isTyping: boolean;
      }) => {
        const { roomId, isTyping } = payload;
        if (!roomId) return;

        const updated = roomManager.updateTyping(roomId, socket.id, Boolean(isTyping));
        if (updated) {
          socket.to(roomId).emit('typing:sync', {
            socketId: socket.id,
            username: updated.username,
            color: updated.color,
            isTyping: Boolean(isTyping),
          });
        }
      }
    );

    /**
     * EVENT: language:change
     * Changes syntax highlighting / language mode
     */
    socket.on(
      'language:change',
      (payload: { roomId: string; language: string }) => {
        const { roomId, language } = payload;
        if (!roomId || !language) return;

        try {
          const room = roomManager.updateLanguage(roomId, socket.id, language);
          io.to(roomId).emit('language:sync', {
            language,
            actorSocketId: socket.id,
          });
          if (room.auditLogs[0]) {
            io.to(roomId).emit('audit:new_entry', room.auditLogs[0]);
          }
        } catch {
          // ignore
        }
      }
    );

    /**
     * EVENT: disconnect
     * Automatic Host Failover logic and participant cleanup
     */
    socket.on('disconnect', () => {
      // Clean up rate limiter memory
      rateLimiter.reset(socket.id);

      const { room, departedParticipant, newHost } = roomManager.handleDisconnect(socket.id);

      if (room && departedParticipant) {
        // Inform room members that participant left
        socket.to(room.roomId).emit('room:participant_left', {
          socketId: socket.id,
          userId: departedParticipant.userId,
          username: departedParticipant.username,
          auditLog: room.auditLogs[0],
        });

        // If host failover occurred, notify room and promote new host
        if (newHost) {
          // Notify the newly promoted host directly
          io.to(newHost.socketId).emit('host:promoted', {
            isHost: true,
            reason: `Administrative status transferred: previous host (${departedParticipant.username}) disconnected.`,
          });

          // Broadcast host change to everyone in the room
          io.to(room.roomId).emit('room:host_changed', {
            newHostSocketId: newHost.socketId,
            newHostUserId: newHost.userId,
            newHostName: newHost.username,
            auditLog: room.auditLogs[0],
          });
        }

        // Send latest audit log
        if (room.auditLogs[0]) {
          io.to(room.roomId).emit('audit:new_entry', room.auditLogs[0]);
        }

        // Update global room counts
        io.emit('rooms:updated', roomManager.getActiveRoomsList());
      }
    });
  });
}
