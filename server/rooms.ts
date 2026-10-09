import crypto from 'crypto';
import { RoomState, Participant, AuditLogEntry } from './types.ts';

/**
 * Hash utility for passcodes using SHA-256 with salt
 */
function hashPasscode(passcode: string): string {
  return crypto.createHash('sha256').update(passcode.trim()).digest('hex');
}

export class RoomManager {
  private rooms: Map<string, RoomState> = new Map();
  // Map of userId -> roomId for tracking session restoration
  private userToRoom: Map<string, string> = new Map();

  /**
   * Default starter code templates
   */
  public static getDefaultCode(language: string = 'typescript'): string {
    switch (language) {
      case 'javascript':
        return `// SyncPad Real-Time Collaborative Workspace
// Welcome! Type below to collaborate in real-time.

function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

console.log("Fibonacci sequence test:");
for (let i = 0; i < 10; i++) {
  console.log(\`fib(\${i}) = \${fibonacci(i)}\`);
}
`;
      case 'python':
        return `# SyncPad Real-Time Collaborative Workspace
# Connected to multi-user session

def quicksort(arr):
    if len(arr) <= 1:
        return arr
    pivot = arr[len(arr) // 2]
    left = [x for x in arr if x < pivot]
    middle = [x for x in arr if x == pivot]
    right = [x for x in arr if x > pivot]
    return quicksort(left) + middle + quicksort(right)

numbers = [38, 27, 43, 3, 9, 82, 10]
print(f"Sorted: {quicksort(numbers)}")
`;
      default:
        return `/**
 * SyncPad - Collaborative Real-Time Code Pad
 * Multi-user synchronized editor with cursor awareness & rate limiting.
 */

interface CollaborativeSession {
  readonly roomId: string;
  activeUsers: number;
  rateLimitPerSec: number;
}

const session: CollaborativeSession = {
  roomId: "workspace-alpha",
  activeUsers: 1,
  rateLimitPerSec: 5,
};

function logWorkspaceStatus(info: CollaborativeSession): void {
  console.log(\`[SyncPad] Session \${info.roomId} initialized with \${info.activeUsers} collaborator(s).\`);
}

logWorkspaceStatus(session);
`;
    }
  }

  /**
   * Creates or gets a virtual room.
   */
  public createRoom(
    roomId: string,
    hostSocketId: string,
    hostUserId: string,
    hostName: string,
    hostColor: string,
    passcode?: string,
    language: string = 'typescript'
  ): { room: RoomState; participant: Participant } {
    const existing = this.rooms.get(roomId);
    if (existing) {
      throw new Error(`Room '${roomId}' already exists.`);
    }

    const hasPasscode = Boolean(passcode && passcode.trim().length > 0);
    const passcodeHash = hasPasscode ? hashPasscode(passcode!) : undefined;

    const hostParticipant: Participant = {
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

    const participants = new Map<string, Participant>();
    participants.set(hostSocketId, hostParticipant);

    const room: RoomState = {
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

    // Initial audit log
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

  /**
   * Verifies if a room exists and whether a given passcode is valid.
   */
  public verifyPasscode(roomId: string, passcode?: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    if (!room.hasPasscode) return true;
    if (!passcode) return false;
    return room.passcodeHash === hashPasscode(passcode);
  }

  /**
   * Joins an existing room or reconnects an existing userId.
   */
  public joinRoom(
    roomId: string,
    socketId: string,
    userId: string,
    username: string,
    color: string,
    passcode?: string
  ): { room: RoomState; participant: Participant; isReconnection: boolean } {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error(`Room '${roomId}' does not exist.`);
    }

    if (room.hasPasscode && !this.verifyPasscode(roomId, passcode)) {
      throw new Error('Invalid room passcode. Access denied.');
    }

    // Check for existing participant with same userId (graceful reconnection handling)
    let existingSocketId: string | null = null;
    let existingParticipant: Participant | null = null;

    for (const [sId, p] of room.participants.entries()) {
      if (p.userId === userId) {
        existingSocketId = sId;
        existingParticipant = p;
        break;
      }
    }

    if (existingParticipant && existingSocketId) {
      // Reconnection: update socket ID without duplicate user creation
      room.participants.delete(existingSocketId);

      const isHost = room.hostSocketId === existingSocketId || room.hostUserId === userId;
      const reconnectedParticipant: Participant = {
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

    // Fresh user join
    const isFirstParticipant = room.participants.size === 0;
    const participant: Participant = {
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

  /**
   * Handles user disconnection and executes automatic host failover.
   * If the departing user is host, the oldest remaining member is promoted.
   */
  public handleDisconnect(socketId: string): {
    room: RoomState | null;
    departedParticipant: Participant | null;
    newHost: Participant | null;
  } {
    let targetRoom: RoomState | null = null;

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

    // If no participants left, keep room in memory for up to 10 minutes or cleanup if wanted
    if (targetRoom.participants.size === 0) {
      // Room empty
      return { room: targetRoom, departedParticipant: departed, newHost: null };
    }

    let newHost: Participant | null = null;

    // Check if departed participant was host
    const wasHost = targetRoom.hostSocketId === socketId;

    if (wasHost) {
      // Failover Rule: administrative status automatically migrates to the oldest remaining member (joinedAt ascending)
      const remaining = Array.from(targetRoom.participants.values()).sort(
        (a, b) => a.joinedAt - b.joinedAt
      );

      if (remaining.length > 0) {
        newHost = remaining[0];
        newHost.isHost = true;
        targetRoom.hostSocketId = newHost.socketId;
        targetRoom.hostUserId = newHost.userId;

        // Log failover audit event
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
        message: `${departed.username} left the workspace`,
      });
    }

    return {
      room: targetRoom,
      departedParticipant: departed,
      newHost,
    };
  }

  /**
   * Applies code mutation to room with version tracking.
   */
  public updateCode(
    roomId: string,
    socketId: string,
    newCode: string
  ): { room: RoomState; actor: Participant; version: number } {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error(`Room '${roomId}' not found.`);
    }

    const actor = room.participants.get(socketId);
    if (!actor) {
      throw new Error('Unauthorized: Participant not registered in room.');
    }

    const oldLen = room.code.length;
    const newLen = newCode.length;
    const deltaChars = newLen - oldLen;

    room.code = newCode;
    room.version += 1;
    actor.lastActiveAt = Date.now();

    // Periodic audit logging for meaningful changes (batch or summary)
    if (Math.abs(deltaChars) > 0) {
      this.addAuditLog(room, {
        type: 'CODE_MUTATION',
        actorName: actor.username,
        actorColor: actor.color,
        message: `${actor.username} modified code (${deltaChars > 0 ? '+' : ''}${deltaChars} chars, v${room.version})`,
      });
    }

    return { room, actor, version: room.version };
  }

  /**
   * Updates language mode
   */
  public updateLanguage(roomId: string, socketId: string, language: string): RoomState {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error(`Room '${roomId}' not found.`);

    const actor = room.participants.get(socketId);
    if (!actor) throw new Error('Unauthorized');

    room.language = language;
    this.addAuditLog(room, {
      type: 'LANGUAGE_CHANGED',
      actorName: actor.username,
      actorColor: actor.color,
      message: `${actor.username} changed language mode to ${language.toUpperCase()}`,
    });

    return room;
  }

  /**
   * Updates cursor and selection coordinates for a participant.
   */
  public updateCursor(
    roomId: string,
    socketId: string,
    cursor: { line: number; ch: number },
    selection?: { startLine: number; startCh: number; endLine: number; endCh: number }
  ): Participant | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    const participant = room.participants.get(socketId);
    if (!participant) return null;

    participant.cursor = cursor;
    participant.selection = selection;
    participant.lastActiveAt = Date.now();
    return participant;
  }

  /**
   * Updates live typing badge status.
   */
  public updateTyping(roomId: string, socketId: string, isTyping: boolean): Participant | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    const participant = room.participants.get(socketId);
    if (!participant) return null;

    participant.isTyping = isTyping;
    participant.lastActiveAt = Date.now();
    return participant;
  }

  /**
   * Adds an entry to the room audit log (capped at 100 entries).
   */
  public addAuditLog(
    room: RoomState,
    entry: Omit<AuditLogEntry, 'id' | 'timestamp'>
  ): AuditLogEntry {
    const fullEntry: AuditLogEntry = {
      ...entry,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    };

    room.auditLogs.unshift(fullEntry);
    if (room.auditLogs.length > 100) {
      room.auditLogs.pop();
    }

    return fullEntry;
  }

  public getRoom(roomId: string): RoomState | undefined {
    return this.rooms.get(roomId);
  }

  public getRoomBySocket(socketId: string): RoomState | undefined {
    for (const room of this.rooms.values()) {
      if (room.participants.has(socketId)) {
        return room;
      }
    }
    return undefined;
  }

  public roomExists(roomId: string): boolean {
    return this.rooms.has(roomId);
  }

  public getActiveRoomsList(): Array<{
    roomId: string;
    hasPasscode: boolean;
    userCount: number;
    language: string;
    createdAt: number;
  }> {
    return Array.from(this.rooms.values()).map((r) => ({
      roomId: r.roomId,
      hasPasscode: r.hasPasscode,
      userCount: r.participants.size,
      language: r.language,
      createdAt: r.createdAt,
    }));
  }
}
