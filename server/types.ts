/**
 * Shared types for SyncPad collaborative workspace
 */

export interface Participant {
  socketId: string;
  userId: string;
  username: string;
  color: string;
  isHost: boolean;
  joinedAt: number;
  cursor?: {
    line: number;
    ch: number;
  };
  selection?: {
    startLine: number;
    startCh: number;
    endLine: number;
    endCh: number;
  };
  isTyping: boolean;
  lastActiveAt: number;
}

export interface AuditLogEntry {
  id: string;
  timestamp: number;
  type: 'ROOM_CREATED' | 'USER_JOINED' | 'USER_LEFT' | 'HOST_TRANSFERRED' | 'CODE_MUTATION' | 'RATE_LIMIT_WARNING' | 'PASSCODE_CHANGED' | 'LANGUAGE_CHANGED';
  actorName: string;
  actorColor: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface RoomState {
  roomId: string;
  passcodeHash?: string;
  hasPasscode: boolean;
  hostSocketId: string;
  hostUserId: string;
  code: string;
  language: string;
  version: number;
  createdAt: number;
  participants: Map<string, Participant>; // keyed by socketId
  auditLogs: AuditLogEntry[];
}

export interface CodeUpdatePayload {
  roomId: string;
  version: number;
  code: string;
  delta?: {
    from: { line: number; ch: number };
    to: { line: number; ch: number };
    text: string[];
    removed?: string[];
  };
}

export interface CursorUpdatePayload {
  roomId: string;
  cursor: {
    line: number;
    ch: number;
  };
  selection?: {
    startLine: number;
    startCh: number;
    endLine: number;
    endCh: number;
  };
}

export interface TypingUpdatePayload {
  roomId: string;
  isTyping: boolean;
}
