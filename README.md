# SyncPad - Real-Time Collaborative Code Workspace & Pad

> A high-performance, resilient real-time collaborative coding environment built with **Node.js, Express, Socket.IO, React (Vite), and Tailwind CSS**. Features live character synchronization, remote cursor overlays, active line highlights, per-connection sliding-window rate limiting, SHA-256 passcode access control, and automatic dynamic host failover.

---

## 1. Project Overview & System Architecture

SyncPad delivers a synchronized split-screen developer workspace with server-authoritative state management. Every character insertion/deletion, cursor translation, and typing status is validated, rate-limited, and broadcast in real time across connected participants.

### High-Level Architecture Flow

```
                      +-------------------------------------------------+
                      |              Client A (Host / Creator)          |
                      |  - CodeEditor (PrismJS + Carets + Line Highlights)|
                      |  - Participant List (Roles, Host Crown, Ping)   |
                      |  - Audit Log Ledger (Tamper-Proof Timestamps)   |
                      +-----------------------+-------------------------+
                                              |
                          WebSocket: code:update, cursor:move, typing:status
                                              |
                                              v
+---------------------------------------------------------------------------------------+
|                               SyncPad Server (Node.js + Express)                      |
|                                                                                       |
|   +-------------------------------------------------------------------------------+   |
|   |                  Sliding Window Rate Limiter Middleware                       |   |
|   |  - Tracks per-socket event frequency over sliding 1000ms window               |   |
|   |  - Threshold: Max 5 updates/sec. Excess events dropped + rate_limit_exceeded   |   |
|   +---------------------------------------+---------------------------------------+   |
|                                           | (Passed within threshold)                 |
|                                           v                                           |
|   +-------------------------------------------------------------------------------+   |
|   |                       Authoritative Room Manager Store                        |   |
|   |  - Map<RoomID, RoomState> (Document string, Version counter, Hash passcode)   |   |
|   |  - Map<SocketID, Participant> (userId, username, color, joinedAt, cursor)      |   |
|   |  - Dynamic Failover Engine: Promotes oldest member (joinedAt ASC) on drop     |   |
|   |  - Audit Log Journal (Append-only ring buffer of 100 event records)           |   |
|   +---------------------------------------+---------------------------------------+   |
+-------------------------------------------+-------------------------------------------+
                                            |
                         WebSocket Broadcast: code:sync, cursor:sync, typing:sync
                                            |
                                            v
                      +-------------------------------------------------+
                      |             Client B (Collaborator Peer)        |
                      |  - Reconciles doc version & remote carets       |
                      |  - Persistent userId prevents duplicate slots   |
                      +-------------------------------------------------+
```

---

## 2. Core Features Breakdown

### 1. Synchronized Split-Screen Workspace
- **High-Fidelity Code Editor**: Syntax highlighting across multiple languages (TypeScript, JavaScript, Python, HTML, CSS, JSON) with synchronized line numbers and line heights.
- **Collaborator Carets & Badges**: Remote participant cursors are rendered with dedicated user colors, blinking vertical bars, and floating username tags.
- **Active Line Highlighting**: Softly tints lines currently being edited by remote collaborators.
- **Live Typing Indicators**: Debounced broadcast displaying live typing indicators (`"Sarah is typing..."`).
- **Interactive Audit Log**: Searchable, tamper-evident ledger logging room creation, member joins/leaves, code mutations, passcode events, and rate-limiting alerts.

### 2. Access Control & Room Management
- **Custom Virtual Rooms**: Clean alphanumeric Room IDs with real-time availability checks.
- **Cryptographic Passcode Protection**: Optional secret passcodes secured via **SHA-256 hashing**. Passcodes are evaluated before admitting sockets into the room namespace.
- **Public Fallback**: Rooms initialized without a passcode allow immediate open collaboration.

### 3. Strict Per-Connection Rate Limiting (> 5 Updates/Sec)
- **Sliding-Window Counter**: Evaluates timestamp occurrences within a trailing 1000ms window per socket.
- **Spam Flooding Mitigation**: Updates exceeding 5 updates/second are instantly **dropped**, triggering an explicit `rate_limit_exceeded` notification with `retryAfterMs` backoff feedback.
- **Auditing**: Rate violations are automatically recorded to the room's activity ledger.
- **Built-in Test Trigger**: Includes a dedicated "Test Rate Limiter (Flood 10x)" button to test and verify throttling behavior on demand.

### 4. Dynamic Host Failover
- **Creator Host Privilege**: The initial room creator is granted administrative Host status (`👑`).
- **Oldest-Member Migration**: If the active host abruptly disconnects (closes tab, network cut), administrative status automatically migrates to the member with the earliest `joinedAt` timestamp.
- **State Notifications**: The newly promoted host receives a direct `host:promoted` event, and the entire room receives `room:host_changed`.
- **Memory Reclaim**: When all participants exit, an eviction timer cleans up room memory.

### 5. Resilience & Zero-Loss Session Reconnection
- **Persistent Client Identification**: Sockets store a persistent `userId` in `sessionStorage`.
- **Deduplication**: When a client reconnects after a network blip, the server reclaims their existing participant slot rather than spawning duplicate users.

---

## 3. Real-Time Socket.IO Event Specification

| Event Name | Direction | Payload Schema | Operational Description |
| :--- | :--- | :--- | :--- |
| `room:create` | Client &rarr; Server | `{ roomId: string, userId: string, username: string, color: string, passcode?: string, language?: string }` | Requests room creation. Creates state, hashes passcode if supplied, marks creator as host. |
| `room:join` | Client &rarr; Server | `{ roomId: string, userId: string, username: string, color: string, passcode?: string }` | Requests room admission. Validates SHA-256 passcode hash. Reclaims slot if `userId` exists. |
| `room:participant_joined` | Server &rarr; Client | `{ participant: Participant, isReconnection: boolean, auditLog: AuditLogEntry }` | Broadcast to room members announcing a new or reconnected peer. |
| `room:participant_left` | Server &rarr; Client | `{ socketId: string, userId: string, username: string, auditLog: AuditLogEntry }` | Broadcast when a socket disconnects. Purges participant from active roster. |
| `code:update` | Client &rarr; Server | `{ roomId: string, code: string, version?: number, delta?: object }` | Code change mutation. **Enforces sliding-window rate limit** (>5/sec dropped). Increments room doc version. |
| `code:sync` | Server &rarr; Client | `{ code: string, version: number, actorSocketId: string, actorName: string, actorColor: string }` | Broadcasts new code buffer and incremented version to all room peers. |
| `cursor:move` | Client &rarr; Server | `{ roomId: string, cursor: { line: number, ch: number }, selection?: object }` | Emits current caret line, column coordinates, and optional selection span. |
| `cursor:sync` | Server &rarr; Client | `{ socketId: string, userId: string, username: string, color: string, cursor: object, selection?: object }` | Broadcasts collaborator cursor position for overlay caret rendering. |
| `typing:status` | Client &rarr; Server | `{ roomId: string, isTyping: boolean }` | Emits active typing state change (debounced locally). |
| `typing:sync` | Server &rarr; Client | `{ socketId: string, username: string, color: string, isTyping: boolean }` | Broadcasts live typing badge indicator to peers. |
| `rate_limit_exceeded` | Server &rarr; Client | `{ limit: number, currentCount: number, retryAfterMs: number, message: string }` | Sent directly to caller when mutation velocity exceeds 5 updates/sec. |
| `host:promoted` | Server &rarr; Client | `{ isHost: true, reason: string }` | Direct push notification to the oldest active member upon host failover. |
| `room:host_changed` | Server &rarr; Client | `{ newHostSocketId: string, newHostUserId: string, newHostName: string, auditLog: AuditLogEntry }` | Room broadcast announcing the new administrative host. |
| `language:change` | Client &rarr; Server | `{ roomId: string, language: string }` | Requests change to workspace syntax highlighting language mode. |
| `language:sync` | Server &rarr; Client | `{ language: string, actorSocketId: string }` | Broadcasts updated programming language across all clients. |
| `audit:new_entry` | Server &rarr; Client | `AuditLogEntry` | Streams new tamper-evident audit record to room participants. |

---

## 4. Environment Setup & Execution

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher

### Dual-Run / Unified Execution Instructions

#### Option A: Unified Full-Stack Mode (Recommended)
This launches Express, Socket.IO, and the Vite dev server concurrently on a single port (`http://localhost:3000`):

```bash
# 1. Clone the repository
git clone https://github.com/your-username/syncpad.git
cd syncpad

# 2. Install dependencies
npm install

# 3. Launch unified server + client on port 3000
npm run dev
```

Open your browser at `http://localhost:3000`.

---

#### Option B: Decoupled Backend & Frontend Execution
If running the decoupled backend server (`server/server.js`) on port 4000 and the Vite frontend on port 3000:

```bash
# Terminal 1: Launch Backend Server (Port 4000)
PORT=4000 node server/server.js

# Terminal 2: Launch Vite Client (Port 3000)
npm run preview # or vite
```

---

## 5. Evaluator Verification Runbook

Follow these exact steps to verify every requirement:

### Test Case 1: Concurrent Multi-Peer Editing & Live Cursor Tracking
1. Open `http://localhost:3000` in Browser Window #1.
2. Click **Create New Room**, specify Room ID `eval-room-1`, enter username `Alice`, select an avatar color, leave passcode empty, and click **Create & Launch Room**.
   - *Verification*: Alice is marked as **Host** (`👑`) in the top navbar and participant sidebar.
3. Open an Incognito Window or second browser tab (Browser Window #2) at `http://localhost:3000`.
4. Select **Join Existing Room**, enter `eval-room-1`, enter username `Bob`, select a different avatar color, and click **Join Room**.
   - *Verification*: 
     - Window #1 immediately logs `Bob joined workspace` in the Audit Trail and displays Bob in the Active Participants list.
     - Move the cursor or type in Window #2: Window #1 displays Bob's colored cursor, active line highlight, and typing badge in real time.
     - Type in Window #1: Window #2 updates without keystroke loss or caret flickering.

### Test Case 2: Per-Connection Rate Limiting (> 5 Updates/Sec Throttling)
1. In Browser Window #1, locate the top editor toolbar.
2. Click the **"Test Rate Limiter (Flood 10x)"** button (or rapidly paste/type 10 times in under 1 second).
3. *Expected Verification*:
   - An amber/red **Rate Limiter Active** banner immediately appears at the top of the editor:
     `Rate limit exceeded (> 5 updates/sec). Change dropped. (Retry window: ~XXXms)`.
   - The top navbar **Rate Monitor** jumps to `10/5 req/s` with a red velocity indicator.
   - The Activity Audit Log records a `RATE_LIMIT_WARNING` audit event.
   - Excess packets are rejected by the server, preserving socket stability.

### Test Case 3: Dynamic Host Failover on Abrupt Disconnect
1. Ensure both **Alice** (Host, joined first) and **Bob** (joined second) are in `eval-room-1`.
2. Verify Alice has the `👑 Host` badge and Bob has the standard member role.
3. Abruptly close Browser Window #1 (Alice's tab).
4. Switch to Browser Window #2 (Bob):
   - *Expected Verification*:
     - Within ~1-2 seconds, a banner appears in Window #2:
       `👑 Host Administrative Status Transferred: Host failover: Bob promoted to host (oldest active member)`.
     - Bob's badge updates to `👑 Room Host`.
     - The Audit Log adds a `HOST_TRANSFERRED` entry.

### Test Case 4: Passcode Protection vs. Public Room Fallback
1. In a fresh tab, click **Create New Room**, specify Room ID `secure-pad`, set passcode to `secret123`, and click **Create & Launch Room**.
2. In a second window, try to join `secure-pad` with an incorrect passcode (`wrongpass`):
   - *Expected Verification*: Access is blocked with an alert: `Invalid room passcode. Access denied.`.
3. Enter the correct passcode `secret123`:
   - *Expected Verification*: Admission is granted and the workspace initializes.
4. Create a public room with no passcode:
   - *Expected Verification*: Any user joins immediately without a passcode prompt.

---

## 6. License
MIT License. Built for production-grade real-time collaboration.
