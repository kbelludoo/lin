/**
 * Peripheral: extract simple py/go/rs fns → JS-shaped {name,params,body}
 * for LIN rewrite. Not nucleus. Skip anything not a single return expr.
 */
export function extractNativeFns(text, lang) {
  const L = String(lang || '').toLowerCase();
  if (L === 'python') return extractPy(text);
  if (L === 'go') return extractGo(text);
  if (L === 'rust') return extractRs(text);
  return [];
}

function extractPy(text) {
  const out = [];
  const re = /^def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*:\s*\n([ \t]+)return\s+([^\n]+)/gm;
  let m;
  while ((m = re.exec(text))) {
    const name = m[1];
    if (name.startsWith('_')) continue;
    const params = m[2].split(',').map((p) => p.trim().split('=')[0].split(':')[0].trim()).filter((p) => p && p !== 'self');
    const expr = m[4].trim().replace(/\s+#.*$/, '');
    if (/lambda|await|yield|raise|None|True|False/.test(expr) && /None|True|False/.test(expr)) {
      /* map None/True/False below */
    }
    if (/lambda|await|yield|raise/.test(expr)) continue;
    const js = expr.replace(/\bNone\b/g, 'null').replace(/\bTrue\b/g, 'true').replace(/\bFalse\b/g, 'false');
    out.push({ name, params, body: `return ${js};` });
  }
  return out;
}

function extractGo(text) {
  const out = [];
  const re = /func\s+([A-Z][A-Za-z0-9_]*)\s*\(([^)]*)\)[^{]*\{\s*return\s+([^;}]+)[;]?\s*\}/g;
  let m;
  while ((m = re.exec(text))) {
    const params = m[2].split(',').map((p) => {
      const t = p.trim().split(/\s+/);
      return t[0] || '';
    }).filter(Boolean);
    if (params.some((p) => /[^A-Za-z0-9_]/.test(p))) continue;
    out.push({ name: m[1], params, body: `return ${m[3].trim()};` });
  }
  return out;
}

function extractRs(text) {
  const out = [];
  const re = /fn\s+([a-z][A-Za-z0-9_]*)\s*\(([^)]*)\)[^{]*\{\s*([^}]+)\s*\}/g;
  let m;
  while ((m = re.exec(text))) {
    const params = m[2].split(',').map((p) => p.trim().split(':')[0].trim()).filter((p) => p && p !== 'self' && p !== '&self');
    let expr = m[3].trim();
    if (/let |mut |unsafe|macro|await/.test(expr)) continue;
    if (expr.startsWith('return ')) expr = expr.replace(/^return\s+/, '').replace(/;$/, '');
    out.push({ name: m[1], params, body: `return ${expr};` });
  }
  return out;
}
