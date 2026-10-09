import Prism from 'prismjs';

// Basic fallbacks for Prism languages
export function highlightCode(code: string, language: string = 'typescript'): string {
  try {
    const langKey = language.toLowerCase();
    const grammar = Prism.languages[langKey] || Prism.languages.javascript || Prism.languages.clike;
    if (grammar) {
      return Prism.highlight(code, grammar, langKey);
    }
  } catch {
    // fallback if prism grammar error
  }
  return escapeHtml(code);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
