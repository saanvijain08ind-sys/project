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
  type:
    | 'ROOM_CREATED'
    | 'USER_JOINED'
    | 'USER_LEFT'
    | 'HOST_TRANSFERRED'
    | 'CODE_MUTATION'
    | 'RATE_LIMIT_WARNING'
    | 'PASSCODE_CHANGED'
    | 'LANGUAGE_CHANGED';
  actorName: string;
  actorColor: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface RoomData {
  roomId: string;
  hasPasscode: boolean;
  hostSocketId: string;
  hostUserId: string;
  code: string;
  language: string;
  version: number;
  participants: Participant[];
  auditLogs: AuditLogEntry[];
  isHost: boolean;
  currentUser: Participant;
}

export interface RateLimitAlert {
  limit: number;
  currentCount: number;
  retryAfterMs: number;
  message: string;
  timestamp: number;
}
