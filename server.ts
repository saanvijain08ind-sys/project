import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import { RoomManager } from './server/rooms.ts';
import { SlidingWindowRateLimiter } from './server/rateLimiter.ts';
import { setupSocketHandlers } from './server/socketHandlers.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

// Socket.io initialization with CORS tolerance
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingTimeout: 20000,
  pingInterval: 10000,
});

// In-memory state and rate-limiting instance
const roomManager = new RoomManager();
const rateLimiter = new SlidingWindowRateLimiter(5, 1000); // 5 updates/second max

// Register all event listeners, rate limiting, and failover hooks
setupSocketHandlers(io, roomManager, rateLimiter);

// Middleware
app.use(express.json());

// REST APIs
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'online',
    version: '1.0.0',
    timestamp: Date.now(),
  });
});

app.get('/api/rooms', (_req, res) => {
  res.json(roomManager.getActiveRoomsList());
});

app.post('/api/rooms/verify-passcode', (req, res) => {
  const { roomId, passcode } = req.body;
  if (!roomId) {
    return res.status(400).json({ error: 'Room ID required' });
  }
  const valid = roomManager.verifyPasscode(roomId, passcode);
  res.json({ valid });
});

const isProd = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT) || 3000;

if (!isProd) {
  // Vite dev middleware
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
} else {
  // Production static file serving
  const distPath = path.join(__dirname, 'dist');
  app.use(express.static(distPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[SyncPad Server] Real-Time Collaborative Workspace running on port ${PORT}`);
});
