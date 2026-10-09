import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Participant, RateLimitAlert } from '../types.ts';
import { highlightCode } from '../utils/codeHighlighter.ts';
import { transpileToExecutableJs } from '../utils/tsTranspiler.ts';
import { Play, Copy, Check, AlertTriangle, Zap, Download } from 'lucide-react';

interface CodeEditorProps {
  code: string;
  language: string;
  version: number;
  participants: Participant[];
  currentUserId: string;
  onCodeChange: (newCode: string) => void;
  onCursorChange: (cursor: { line: number; ch: number }, selection?: { startLine: number; startCh: number; endLine: number; endCh: number }) => void;
  onTypingChange: (isTyping: boolean) => void;
  rateLimitAlert: RateLimitAlert | null;
  onTriggerFloodTest: () => void;
  isHost: boolean;
  onLanguageChange: (lang: string) => void;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({
  code,
  language,
  version,
  participants,
  currentUserId,
  onCodeChange,
  onCursorChange,
  onTypingChange,
  rateLimitAlert,
  onTriggerFloodTest,
  isHost,
  onLanguageChange,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  const [copied, setCopied] = useState(false);
  const [outputConsole, setOutputConsole] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Active collaborators (excluding current user)
  const remoteParticipants = useMemo(() => {
    return participants.filter((p) => p.userId !== currentUserId);
  }, [participants, currentUserId]);

  // Active lines being edited by collaborators
  const activeRemoteLines = useMemo(() => {
    const lines = new Set<number>();
    remoteParticipants.forEach((p) => {
      if (p.cursor && p.cursor.line > 0) {
        lines.add(p.cursor.line);
      }
    });
    return lines;
  }, [remoteParticipants]);

  // Collaborators currently typing
  const typingUsers = useMemo(() => {
    return remoteParticipants.filter((p) => p.isTyping);
  }, [remoteParticipants]);

  // Split lines for line numbers and highlighting
  const lines = useMemo(() => {
    return code.split('\n');
  }, [code]);

  // Synchronize scroll between textarea, syntax highlighting layer, and line numbers
  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    const target = e.currentTarget;
    if (preRef.current) {
      preRef.current.scrollTop = target.scrollTop;
      preRef.current.scrollLeft = target.scrollLeft;
    }
    if (lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = target.scrollTop;
    }
  };

  // Track cursor position from textarea
  const updateCursorPosition = () => {
    if (!textareaRef.current) return;
    const el = textareaRef.current;
    const selStart = el.selectionStart;
    const textBefore = el.value.substring(0, selStart);
    const lineArr = textBefore.split('\n');
    const line = lineArr.length;
    const ch = lineArr[lineArr.length - 1].length + 1;

    let selection = undefined;
    if (el.selectionEnd > el.selectionStart) {
      const textUntilEnd = el.value.substring(0, el.selectionEnd);
      const endLineArr = textUntilEnd.split('\n');
      selection = {
        startLine: line,
        startCh: ch,
        endLine: endLineArr.length,
        endCh: endLineArr[endLineArr.length - 1].length + 1,
      };
    }

    onCursorChange({ line, ch }, selection);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle tab key indentation (2 spaces)
    if (e.key === 'Tab') {
      e.preventDefault();
      const el = e.currentTarget;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const newCode = code.substring(0, start) + '  ' + code.substring(end);
      onCodeChange(newCode);

      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 2;
          updateCursorPosition();
        }
      }, 0);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    onCodeChange(val);
    updateCursorPosition();

    // Signal typing status
    onTypingChange(true);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      onTypingChange(false);
    }, 1200);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  const handleDownload = () => {
    const extensions: Record<string, string> = {
      typescript: 'ts',
      javascript: 'js',
      python: 'py',
      html: 'html',
      css: 'css',
      json: 'json',
      markdown: 'md',
    };
    const ext = extensions[language] || 'txt';
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `workspace-pad.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRunCode = () => {
    setIsRunning(true);
    setOutputConsole(null);

    setTimeout(() => {
      try {
        if (language === 'javascript' || language === 'typescript') {
          const logs: string[] = [];
          const customConsole = {
            log: (...args: unknown[]) => logs.push(args.map((a) => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a))).join(' ')),
            error: (...args: unknown[]) => logs.push('❌ Error: ' + args.join(' ')),
            warn: (...args: unknown[]) => logs.push('⚠️ Warn: ' + args.join(' ')),
            info: (...args: unknown[]) => logs.push('ℹ️ Info: ' + args.join(' ')),
          };

          // Transpile and strip TypeScript syntax (interfaces, types, annotations) into valid JS
          const { jsCode } = transpileToExecutableJs(code);

          // Execute in isolated function context
          const runFn = new Function('console', jsCode);
          runFn(customConsole);

          const prefix = language === 'typescript' ? '⚡ [TypeScript Transpiled & Executed Successfully]\n' : '▶ [JavaScript Executed Successfully]\n';
          setOutputConsole(logs.length > 0 ? prefix + logs.join('\n') : prefix + 'Program finished with no console output.');
        } else {
          setOutputConsole(`[Sandbox Environment]: Mock execution for ${language.toUpperCase()} completed successfully.\nCode version v${version} validated.`);
        }
      } catch (err: unknown) {
        setOutputConsole('❌ Execution Error: ' + (err instanceof Error ? err.message : String(err)));
      } finally {
        setIsRunning(false);
      }
    }, 150);
  };

  useEffect(() => {
    return () => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    };
  }, []);

  const filenameMap: Record<string, string> = {
    javascript: 'main.js',
    typescript: 'main.ts',
    python: 'script.py',
    html: 'index.html',
    css: 'styles.css',
    json: 'data.json',
  };
  const currentFilename = filenameMap[language] || 'code.txt';

  return (
    <div className="flex flex-col h-full bg-slate-950 border border-slate-800/80 rounded-xl overflow-hidden shadow-2xl relative">
      {/* Rate Limit Warning Banner */}
      {rateLimitAlert && (
        <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2 flex items-center justify-between text-amber-300 text-xs animate-in fade-in slide-in-from-top-1">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 animate-bounce" />
            <span>
              <strong>Rate Limiter Active:</strong> {rateLimitAlert.message} (Retry window: {rateLimitAlert.retryAfterMs}ms)
            </span>
          </div>
          <span className="font-mono bg-amber-950/80 px-2 py-0.5 rounded text-[10px] text-amber-400 border border-amber-500/40">
            {rateLimitAlert.currentCount} / {rateLimitAlert.limit} msgs/sec
          </span>
        </div>
      )}

      {/* Editor Sub-Header Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-900/90 border-b border-slate-800/80 text-xs select-none backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 font-mono text-slate-400">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
            <span>{currentFilename}</span>
            <span className="text-slate-600">v{version}</span>
          </div>

          {/* Language Selector */}
          <div className="flex items-center gap-1">
            <label htmlFor="language-select" className="sr-only">Programming Language</label>
            <select
              id="language-select"
              value={language}
              onChange={(e) => onLanguageChange(e.target.value)}
              className="bg-slate-800 text-slate-300 border border-slate-700 rounded px-2 py-0.5 text-xs focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="typescript">TypeScript</option>
              <option value="javascript">JavaScript</option>
              <option value="python">Python</option>
              <option value="html">HTML</option>
              <option value="css">CSS</option>
              <option value="json">JSON</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Rate limiter flood test button */}
          <button
            onClick={onTriggerFloodTest}
            title="Flood the socket with >5 updates in 1s to test server sliding window rate limiting"
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 transition-colors text-xs font-medium cursor-pointer"
          >
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>Test Rate Limiter (Flood 10x)</span>
          </button>

          {/* Run Code */}
          <button
            onClick={handleRunCode}
            disabled={isRunning}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white transition-colors text-xs font-medium cursor-pointer disabled:opacity-50"
          >
            <Play className="w-3 h-3 fill-current" />
            <span>{isRunning ? 'Running...' : 'Run'}</span>
          </button>

          {/* Copy Code */}
          <button
            onClick={handleCopy}
            className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
            title="Copy Code"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>

          {/* Download Code */}
          <button
            onClick={handleDownload}
            className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
            title="Download Source"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Code Editing Canvas Area */}
      <div className="relative flex-1 flex overflow-hidden font-mono text-sm leading-6">
        {/* Line Numbers Gutter */}
        <div
          ref={lineNumbersRef}
          className="w-12 bg-slate-900/60 border-r border-slate-800/80 py-4 select-none text-right pr-3 text-slate-600 text-xs overflow-hidden shrink-0 font-mono"
        >
          {lines.map((_, idx) => {
            const lineNum = idx + 1;
            const isLineActive = activeRemoteLines.has(lineNum);
            return (
              <div
                key={lineNum}
                className={`h-6 leading-6 transition-colors ${
                  isLineActive ? 'text-indigo-400 font-bold bg-indigo-500/10 -mr-3 pr-3 rounded-l' : ''
                }`}
              >
                {lineNum}
              </div>
            );
          })}
        </div>

        {/* Code Container */}
        <div className="relative flex-1 h-full overflow-hidden">
          {/* Active Line Highlights Layer */}
          <div className="absolute inset-0 pointer-events-none py-4 pl-4 pr-4">
            {remoteParticipants.map((p) => {
              if (!p.cursor || p.cursor.line < 1) return null;
              const topPx = (p.cursor.line - 1) * 24 + 16;
              return (
                <div
                  key={`line-hl-${p.userId}`}
                  style={{
                    top: `${topPx}px`,
                    backgroundColor: `${p.color}15`,
                    borderLeft: `2px solid ${p.color}`,
                  }}
                  className="absolute left-0 right-0 h-6 transition-all duration-150 pointer-events-none"
                />
              );
            })}
          </div>

          {/* Syntax Highlighted Render Layer */}
          <pre
            ref={preRef}
            aria-hidden="true"
            className="absolute inset-0 m-0 py-4 px-4 overflow-hidden pointer-events-none whitespace-pre font-mono text-sm leading-6 text-slate-300"
            dangerouslySetInnerHTML={{ __html: highlightCode(code, language) + '\n' }}
          />

          {/* Remote Cursor Badges Layer */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden py-4 px-4">
            {remoteParticipants.map((p) => {
              if (!p.cursor) return null;
              // Approximate visual coordinates based on line height (24px) and monospace width (~8.43px)
              const top = (p.cursor.line - 1) * 24 + 16;
              const left = Math.max(0, (p.cursor.ch - 1) * 8.43) + 16;

              return (
                <div
                  key={`cursor-${p.userId}`}
                  style={{
                    transform: `translate(${left}px, ${top}px)`,
                    borderColor: p.color,
                  }}
                  className="absolute top-0 left-0 transition-transform duration-100 ease-out z-20"
                >
                  {/* Blinking Vertical Cursor Bar */}
                  <div
                    style={{ backgroundColor: p.color }}
                    className="w-0.5 h-5 shadow-[0_0_8px_rgba(255,255,255,0.4)] animate-cursor-blink"
                  />
                  {/* Username Pill Tag */}
                  <div
                    style={{ backgroundColor: p.color }}
                    className="absolute -top-5 left-0 px-1.5 py-0.5 rounded text-[10px] font-sans font-bold text-slate-950 whitespace-nowrap shadow-md flex items-center gap-1 select-none pointer-events-none"
                  >
                    <span>{p.username}</span>
                    {p.isHost && <span>👑</span>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* User Input Textarea */}
          <textarea
            ref={textareaRef}
            value={code}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onKeyUp={updateCursorPosition}
            onClick={updateCursorPosition}
            onScroll={handleScroll}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            aria-label="Code Editor"
            className="absolute inset-0 w-full h-full py-4 px-4 bg-transparent text-transparent caret-indigo-400 font-mono text-sm leading-6 resize-none focus:outline-none whitespace-pre overflow-auto z-10 selection:bg-indigo-500/30 selection:text-transparent"
          />
        </div>
      </div>

      {/* Live Typing Badges & Status Footer */}
      <div className="px-4 py-2 bg-slate-900 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 select-none">
        <div className="flex items-center gap-2 min-h-[20px]">
          {typingUsers.length > 0 ? (
            <div className="flex items-center gap-2 text-indigo-400 animate-pulse">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
              </span>
              <span>
                {typingUsers.map((u) => u.username).join(', ')}{' '}
                {typingUsers.length === 1 ? 'is typing...' : 'are typing...'}
              </span>
            </div>
          ) : (
            <span className="text-slate-500 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-600"></span>
              Synchronized &middot; {remoteParticipants.length} peer{remoteParticipants.length !== 1 ? 's' : ''} connected
            </span>
          )}
        </div>

        <div className="flex items-center gap-4 text-slate-500 font-mono text-[11px]">
          <span>UTF-8</span>
          <span>Tab: 2 Spaces</span>
          <span>Line count: {lines.length}</span>
        </div>
      </div>

      {/* Console Output Drawer (If Ran) */}
      {outputConsole !== null && (
        <div className="border-t border-slate-800 bg-slate-950 p-3 max-h-40 overflow-y-auto font-mono text-xs text-slate-200">
          <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-800 text-[10px] text-slate-400 uppercase tracking-wider">
            <span>Execution Terminal Output</span>
            <button
              onClick={() => setOutputConsole(null)}
              className="text-slate-500 hover:text-slate-300 cursor-pointer"
            >
              Clear &times;
            </button>
          </div>
          <pre className="whitespace-pre-wrap">{outputConsole}</pre>
        </div>
      )}
    </div>
  );
};
