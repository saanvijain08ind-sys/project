import React, { useState } from 'react';
import { Lock, Shuffle, ArrowRight } from 'lucide-react';

interface JoinRoomModalProps {
  initialUsername: string;
  initialColor: string;
  onJoinOrCreate: (
    roomId: string,
    username: string,
    color: string,
    passcode?: string
  ) => Promise<{ success: boolean; error?: string }>;
}

const PRESET_COLORS = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ec4899', // pink
  '#8b5cf6', // purple
  '#06b6d4', // cyan
];

export const JoinRoomModal: React.FC<JoinRoomModalProps> = ({
  initialUsername,
  initialColor,
  onJoinOrCreate,
}) => {
  const [roomId, setRoomId] = useState('dev-room');
  const [username, setUsername] = useState(initialUsername || 'Developer');
  const [color, setColor] = useState(initialColor || '#3b82f6');
  const [passcode, setPasscode] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const generateRandomRoom = () => {
    const slug = Math.random().toString(36).substring(2, 7);
    setRoomId(`room-${slug}`);
    setErrorMsg(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanRoom = roomId.trim().toLowerCase();
    const cleanName = username.trim();

    if (!cleanRoom) {
      setErrorMsg('Please specify a room ID');
      return;
    }
    if (!cleanName) {
      setErrorMsg('Please enter your name');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await onJoinOrCreate(
        cleanRoom,
        cleanName,
        color,
        passcode.trim() || undefined
      );
      if (!res.success) {
        setErrorMsg(res.error || 'Failed to enter workspace');
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-8 h-8 rounded-lg bg-white text-zinc-950 flex items-center justify-center font-bold text-sm shadow-sm">
            S
          </div>
          <div>
            <h1 className="text-base font-semibold text-zinc-100 tracking-tight">
              SyncPad
            </h1>
            <p className="text-xs text-zinc-400">
              Real-time collaborative code editor
            </p>
          </div>
        </div>

        {errorMsg && (
          <div className="mb-4 p-2.5 rounded-md bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Username */}
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              Your Name
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. Alex"
              required
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-600 transition-colors"
            />
          </div>

          {/* Room ID with inline generate button */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-zinc-300">
                Room ID
              </label>
              <button
                type="button"
                onClick={generateRandomRoom}
                className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Shuffle className="w-3 h-3" />
                <span>Random</span>
              </button>
            </div>
            <input
              type="text"
              value={roomId}
              onChange={(e) =>
                setRoomId(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))
              }
              placeholder="e.g. team-sprint"
              required
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm font-mono text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-600 transition-colors"
            />
          </div>

          {/* Passcode (Optional) */}
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              Passcode <span className="text-zinc-500 font-normal">(Optional)</span>
            </label>
            <div className="relative">
              <input
                type="password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="Leave blank for public room"
                className="w-full pl-3 pr-8 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm font-mono text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-600 transition-colors"
              />
              <Lock className="w-3.5 h-3.5 text-zinc-500 absolute right-3 top-3" />
            </div>
          </div>

          {/* Avatar Color Picker */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-2">
              Cursor Color
            </label>
            <div className="flex items-center gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  style={{ backgroundColor: c }}
                  className={`w-5 h-5 rounded-full transition-transform cursor-pointer ${
                    color === c ? 'ring-2 ring-white scale-110' : 'opacity-70 hover:opacity-100'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-2.5 px-4 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 font-medium text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50 shadow-sm"
          >
            <span>{loading ? 'Entering...' : 'Join Workspace'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
