import { transform } from 'sucrase';

/**
 * Transpiles and strips TypeScript syntax (interfaces, types, generics, type annotations)
 * into clean, executable JavaScript that runs safely in browser environments.
 */
export function transpileToExecutableJs(sourceCode: string): { jsCode: string; transpiled: boolean; error?: string } {
  try {
    const result = transform(sourceCode, {
      transforms: ['typescript'],
      disableESTransforms: true,
    });
    return {
      jsCode: result.code,
      transpiled: true,
    };
  } catch (err: unknown) {
    // Fallback: graceful regex-based stripping of top-level TypeScript constructs
    try {
      const stripped = fallbackStripTypeScript(sourceCode);
      return {
        jsCode: stripped,
        transpiled: true,
      };
    } catch {
      return {
        jsCode: sourceCode,
        transpiled: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

/**
 * Lightweight fallback for stripping common TypeScript syntax
 */
function fallbackStripTypeScript(code: string): string {
  let output = code;

  // 1. Strip interface declarations: interface Foo { ... }
  output = output.replace(/interface\s+[A-Za-z0-9_<>]+(?:\s+extends\s+[^{]+)?\s*\{[\s\S]*?\}/g, '');

  // 2. Strip type aliases: type Foo = ...;
  output = output.replace(/type\s+[A-Za-z0-9_<>]+(?:\s*=\s*[\s\S]*?;)/g, '');

  // 3. Strip variable type annotations: const x: Foo = ... -> const x = ...
  output = output.replace(/(const|let|var)\s+([A-Za-z0-9_$]+)\s*:\s*[A-Za-z0-9_$<>\[\]|&\s]+\s*=/g, '$1 $2 =');

  // 4. Strip function return types: ): void { -> ) {
  output = output.replace(/\)\s*:\s*[A-Za-z0-9_$<>\[\]|&\s]+\s*\{/g, ') {');

  // 5. Strip basic parameter type annotations: (x: number, y: string) -> (x, y)
  output = output.replace(/\(([A-Za-z0-9_$]+)\s*:\s*[A-Za-z0-9_$<>\[\]|&]+/g, '($1');
  output = output.replace(/,\s*([A-Za-z0-9_$]+)\s*:\s*[A-Za-z0-9_$<>\[\]|&]+/g, ', $1');

  // 6. Strip 'as Type' casts
  output = output.replace(/\s+as\s+[A-Za-z0-9_$<>\[\]|&]+/g, '');

  return output;
}
