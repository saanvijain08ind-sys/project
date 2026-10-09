import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Participant } from '../types.ts';
import { highlightCode } from '../utils/codeHighlighter.ts';
import { Copy, Check, Download, Terminal, X } from 'lucide-react';

interface CodeEditorProps {
  code: string;
  language: string;
  participants: Participant[];
  currentUserId: string;
  onCodeChange: (newCode: string) => void;
  onCursorChange: (cursor: { line: number; ch: number }, selection?: { startLine: number; startCh: number; endLine: number; endCh: number }) => void;
  onTypingChange: (isTyping: boolean) => void;
  outputConsole: string | null;
  onClearConsole: () => void;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({
  code,
  language,
  participants,
  currentUserId,
  onCodeChange,
  onCursorChange,
  onTypingChange,
  outputConsole,
  onClearConsole,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  const [copied, setCopied] = useState(false);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Active remote collaborators
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

  const lines = useMemo(() => {
    return code.split('\n');
  }, [code]);

  // Synchronize scrolling
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
      // ignore
    }
  };

  const handleDownload = () => {
    const ext = language === 'typescript' ? 'ts' : language === 'python' ? 'py' : 'js';
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `workspace.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    return () => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    };
  }, []);

  const filename = language === 'typescript' ? 'index.ts' : language === 'python' ? 'main.py' : 'index.js';

  return (
    <div className="flex flex-col h-full bg-zinc-950 overflow-hidden relative font-mono text-sm">
      {/* Quiet File Header Tab */}
      <div className="h-9 px-4 bg-zinc-900/60 border-b border-zinc-800/60 flex items-center justify-between text-xs select-none">
        <div className="flex items-center gap-2 text-zinc-400">
          <span className="text-zinc-200 font-medium">{filename}</span>
          <span className="text-zinc-600 font-sans">·</span>
          <span className="text-zinc-500 font-sans text-[11px]">{lines.length} lines</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleCopy}
            title="Copy source code"
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/80 transition-colors cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={handleDownload}
            title="Download file"
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/80 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Code Editing Canvas Area */}
      <div className="relative flex-1 flex overflow-hidden">
        {/* Line Numbers Gutter */}
        <div
          ref={lineNumbersRef}
          className="w-11 bg-zinc-950 py-3 select-none text-right pr-3 text-zinc-600 text-xs overflow-hidden shrink-0 font-mono"
        >
          {lines.map((_, idx) => {
            const lineNum = idx + 1;
            const isLineActive = activeRemoteLines.has(lineNum);
            return (
              <div
                key={lineNum}
                className={`h-6 leading-6 transition-colors ${
                  isLineActive ? 'text-zinc-300 font-semibold' : ''
                }`}
              >
                {lineNum}
              </div>
            );
          })}
        </div>

        {/* Code Canvas Container */}
        <div className="relative flex-1 h-full overflow-hidden">
          {/* Active Line Highlights Layer */}
          <div className="absolute inset-0 pointer-events-none py-3 px-3">
            {remoteParticipants.map((p) => {
              if (!p.cursor || p.cursor.line < 1) return null;
              const topPx = (p.cursor.line - 1) * 24 + 12;
              return (
                <div
                  key={`line-hl-${p.userId}`}
                  style={{
                    top: `${topPx}px`,
                    backgroundColor: `${p.color}0a`,
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
            className="absolute inset-0 m-0 py-3 px-3 overflow-hidden pointer-events-none whitespace-pre font-mono text-sm leading-6 text-zinc-300"
            dangerouslySetInnerHTML={{ __html: highlightCode(code, language) + '\n' }}
          />

          {/* Remote Cursor Badges Layer */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden py-3 px-3">
            {remoteParticipants.map((p) => {
              if (!p.cursor) return null;
              const top = (p.cursor.line - 1) * 24 + 12;
              const left = Math.max(0, (p.cursor.ch - 1) * 8.43) + 12;

              return (
                <div
                  key={`cursor-${p.userId}`}
                  style={{
                    transform: `translate(${left}px, ${top}px)`,
                    borderColor: p.color,
                  }}
                  className="absolute top-0 left-0 transition-transform duration-100 ease-out z-20"
                >
                  <div
                    style={{ backgroundColor: p.color }}
                    className="w-0.5 h-5 animate-cursor-blink"
                  />
                  <div
                    style={{ backgroundColor: p.color }}
                    className="absolute -top-4 left-0 px-1 py-0.5 rounded text-[9px] font-sans font-medium text-zinc-950 whitespace-nowrap shadow-sm select-none pointer-events-none"
                  >
                    {p.username}
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
            className="absolute inset-0 w-full h-full py-3 px-3 bg-transparent text-transparent caret-zinc-200 font-mono text-sm leading-6 resize-none focus:outline-none whitespace-pre overflow-auto z-10 selection:bg-zinc-800 selection:text-transparent"
          />
        </div>
      </div>

      {/* Discreet Live Typing Indicator Bar */}
      {typingUsers.length > 0 && (
        <div className="absolute bottom-2 left-14 z-20 px-2 py-1 rounded bg-zinc-900/90 border border-zinc-800 text-[11px] font-sans text-zinc-300 shadow-md flex items-center gap-2 animate-in fade-in">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>
            {typingUsers.map((u) => u.username).join(', ')}{' '}
            {typingUsers.length === 1 ? 'is typing' : 'are typing'}...
          </span>
        </div>
      )}

      {/* Terminal Drawer (when run) */}
      {outputConsole !== null && (
        <div className="border-t border-zinc-800 bg-zinc-950 p-3 max-h-48 overflow-y-auto font-mono text-xs text-zinc-200 z-30 animate-in slide-in-from-bottom-2">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-850 text-zinc-400">
            <div className="flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-zinc-400" />
              <span className="text-xs font-sans font-medium text-zinc-300">Terminal Output</span>
            </div>
            <button
              onClick={onClearConsole}
              className="p-1 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
              title="Close terminal"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <pre className="whitespace-pre-wrap font-mono text-zinc-300 leading-relaxed">
            {outputConsole}
          </pre>
        </div>
      )}
    </div>
  );
};
