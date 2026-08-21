/**
 * LIN Pure TypeScript In-Memory Runtime.
 */
import * as fs from 'fs';
import * as path from 'path';

export interface LinFunction {
  name: string;
  params: string[];
}

export interface LinInMemoryAst {
  protocol: string;
  header: string;
  source_file: string;
  functions: LinFunction[];
  in_memory: boolean;
  compiled_at: number;
}

export interface LinEvalResult {
  ok: boolean;
  status: string;
  target: string;
  disk_writes: number;
  ast: LinInMemoryAst;
}

export function runLinInMemoryTs(sourcePath: string, target: string = 'ts_native'): LinEvalResult {
  const absPath = path.resolve(process.cwd(), sourcePath);
  const rawSource = fs.readFileSync(absPath, 'utf8');

  const lines = rawSource.split('\n');
  let header = '';
  const functions: LinFunction[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith('@LIN:') || line.startsWith('@RULEL:')) {
      header = line;
    } else if (line.startsWith('!')) {
      const openParen = line.indexOf('(');
      const closeParen = line.indexOf(')');
      const openBrace = line.indexOf('{');
      if (openParen > 1 && closeParen > openParen && openBrace > closeParen) {
        const fnName = line.substring(1, openParen).trim();
        const paramsStr = line.substring(openParen + 1, closeParen).trim();
        const params = paramsStr.length > 0 ? paramsStr.split(',') : [];
        functions.push({ name: fnName, params });
      }
    }
  }

  return {
    ok: true,
    status: 'EVALUATED_IN_MEMORY_TYPESCRIPT',
    target,
    disk_writes: 0,
    ast: {
      protocol: 'LIN_IR/1.0',
      header,
      source_file: path.basename(sourcePath),
      functions,
      in_memory: true,
      compiled_at: Date.now()
    }
  };
}
