import React, { useState } from 'react';
import { Lock, Unlock, Key, Hash, User, Sparkles, AlertCircle, ArrowRight, ShieldCheck } from 'lucide-react';

interface JoinRoomModalProps {
  initialUsername: string;
  initialColor: string;
  onCreateRoom: (roomId: string, username: string, color: string, passcode?: string, language?: string) => Promise<{ success: boolean; error?: string }>;
  onJoinRoom: (roomId: string, username: string, color: string, passcode?: string) => Promise<{ success: boolean; error?: string }>;
}

const PRESET_COLORS = [
  '#3b82f6', // Blue
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#ec4899', // Pink
  '#8b5cf6', // Purple
  '#06b6d4', // Cyan
  '#f97316', // Orange
  '#14b8a6', // Teal
];

export const JoinRoomModal: React.FC<JoinRoomModalProps> = ({
  initialUsername,
  initialColor,
  onCreateRoom,
  onJoinRoom,
}) => {
  const [tab, setTab] = useState<'create' | 'join'>('create');
  const [roomId, setRoomId] = useState('');
  const [username, setUsername] = useState(initialUsername);
  const [color, setColor] = useState(initialColor);
  const [passcode, setPasscode] = useState('');
  const [language, setLanguage] = useState('javascript');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const generateRandomRoomId = () => {
    const adjectives = ['swift', 'hyper', 'cyber', 'quantum', 'nexus', 'sonic', 'stellar', 'matrix'];
    const nouns = ['pad', 'node', 'core', 'room', 'space', 'hub', 'mesh', 'orbit'];
    const num = Math.floor(100 + Math.random() * 900);
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    setRoomId(`${adj}-${noun}-${num}`);
    setErrorMsg(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomId.trim()) {
      setErrorMsg('Please specify a valid Room ID.');
      return;
    }
    if (!username.trim()) {
      setErrorMsg('Please enter your collaborator username.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      if (tab === 'create') {
        const res = await onCreateRoom(roomId.trim(), username.trim(), color, passcode.trim() || undefined, language);
        if (!res.success) {
          setErrorMsg(res.error || 'Failed to create room.');
        }
      } else {
        const res = await onJoinRoom(roomId.trim(), username.trim(), color, passcode.trim() || undefined);
        if (!res.success) {
          setErrorMsg(res.error || 'Failed to join room.');
        }
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickSandbox = () => {
    const demoId = `sandbox-${Math.floor(1000 + Math.random() * 9000)}`;
    setRoomId(demoId);
    setPasscode('');
    setTab('create');
    onCreateRoom(demoId, username || 'Lead_Architect', color, undefined, 'javascript');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Brand Banner */}
        <div className="bg-gradient-to-r from-indigo-900/60 via-slate-900 to-slate-900 px-6 pt-6 pb-4 border-b border-slate-800/80">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20 text-white font-black text-lg">
                S
              </div>
              <div>
                <h1 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  SyncPad Workspace
                </h1>
                <p className="text-xs text-slate-400">
                  Real-time collaborative code pad
                </p>
              </div>
            </div>

            <button
              onClick={handleQuickSandbox}
              type="button"
              className="px-2.5 py-1 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer"
            >
              <Sparkles className="w-3 h-3 text-indigo-400" />
              <span>Instant Room</span>
            </button>
          </div>

          {/* Mode Switch Tabs */}
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-950/80 rounded-xl mt-5 border border-slate-800/80">
            <button
              type="button"
              onClick={() => {
                setTab('create');
                setErrorMsg(null);
              }}
              className={`py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                tab === 'create'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Create New Room
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('join');
                setErrorMsg(null);
              }}
              className={`py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                tab === 'join'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Join Existing Room
            </button>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Room ID Input */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="roomId-input" className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                <Hash className="w-3.5 h-3.5 text-indigo-400" />
                <span>Room Identifier</span>
              </label>
              {tab === 'create' && (
                <button
                  type="button"
                  onClick={generateRandomRoomId}
                  className="text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer"
                >
                  Generate Random
                </button>
              )}
            </div>
            <input
              id="roomId-input"
              type="text"
              placeholder="e.g. dev-sprint-7"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
              required
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
            />
          </div>

          {/* Passcode (Optional) */}
          <div>
            <label htmlFor="passcode-input" className="text-xs font-medium text-slate-300 flex items-center justify-between mb-1.5">
              <span className="flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-amber-400" />
                <span>Passcode Access {tab === 'create' ? '(Optional)' : ''}</span>
              </span>
              <span className="text-[10px] text-slate-500">
                {tab === 'create' ? 'Leave blank for open access' : 'Required if room is locked'}
              </span>
            </label>
            <div className="relative">
              <input
                id="passcode-input"
                type="password"
                placeholder={tab === 'create' ? 'Set secret passcode (optional)' : 'Enter room passcode'}
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                className="w-full pl-3 pr-8 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
              />
              <div className="absolute right-2.5 top-2.5 text-slate-500">
                {passcode ? <Lock className="w-4 h-4 text-amber-400" /> : <Unlock className="w-4 h-4 text-slate-600" />}
              </div>
            </div>
          </div>

          {/* Collaborator Profile: Username & Color */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label htmlFor="username-input" className="text-xs font-medium text-slate-300 flex items-center gap-1.5 mb-1.5">
                <User className="w-3.5 h-3.5 text-indigo-400" />
                <span>Your Name</span>
              </label>
              <input
                id="username-input"
                type="text"
                placeholder="Architect"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1.5">
                Avatar Color
              </label>
              <div className="flex items-center gap-1.5 flex-wrap pt-1">
                {PRESET_COLORS.slice(0, 6).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    style={{ backgroundColor: c }}
                    className={`w-5 h-5 rounded-full transition-transform cursor-pointer ${
                      color === c ? 'scale-125 ring-2 ring-white shadow-sm' : 'opacity-70 hover:opacity-100'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Initial Language (for create) */}
          {tab === 'create' && (
            <div>
              <label htmlFor="initial-language-select" className="text-xs font-medium text-slate-300 block mb-1.5">
                Default Workspace Language
              </label>
              <select
                id="initial-language-select"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value="typescript">TypeScript</option>
                <option value="javascript">JavaScript</option>
                <option value="python">Python</option>
                <option value="html">HTML</option>
                <option value="css">CSS</option>
                <option value="json">JSON</option>
              </select>
            </div>
          )}

          {/* Submit Action */}
          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-medium text-sm shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
          >
            <span>{loading ? 'Connecting...' : tab === 'create' ? 'Create & Launch Room' : 'Join Room'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          {/* Resilience Guarantee Note */}
          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 font-mono">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              Per-connection rate limiting (5 req/s)
            </span>
            <span>Host Failover Enabled</span>
          </div>
        </form>
      </div>
    </div>
  );
};
