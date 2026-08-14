/**
 * ALWAYS_INSTALL_MISSING for LIN multi-emit (js/ts/py/go/rust).
 * SKIP only after honest install+retry fail. Never logs secrets.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WIN = process.platform === 'win32';

function whichEnvPath() {
  const extra = [];
  const home = os.homedir();
  extra.push(path.join(home, '.cargo', 'bin'));
  extra.push(path.join(home, 'go', 'bin'));
  extra.push(path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python312'));
  extra.push(path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python312', 'Scripts'));
  extra.push(path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Go', 'bin'));
  extra.push(path.join(process.env['ProgramFiles(x86)'] || '', 'Go', 'bin'));
  extra.push(path.join(process.env.APPDATA || '', 'npm'));
  const cur = process.env.PATH || '';
  const add = extra.filter((p) => p && fs.existsSync(p) && !cur.toLowerCase().includes(p.toLowerCase()));
  if (add.length) process.env.PATH = `${add.join(path.delimiter)}${path.delimiter}${cur}`;
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    encoding: 'utf8',
    shell: WIN,
    timeout: opts.timeout || 180_000,
    env: process.env,
    cwd: opts.cwd || ROOT,
  });
  const out = `${r.stdout || ''}${r.stderr || ''}`.slice(0, 800);
  return { status: r.status, out, error: r.error ? String(r.error.message || r.error) : '' };
}

export function hasCmd(cmd, versionArgs) {
  whichEnvPath();
  const attempts = versionArgs ? [versionArgs] : [['--version'], ['version'], ['-v']];
  for (const args of attempts) {
    const r = spawnSync(cmd, args, {
      encoding: 'utf8', shell: true, timeout: 20_000, env: process.env,
    });
    if (r.status !== 0) continue;
    const text = `${r.stdout || ''}${r.stderr || ''}`;
    if (/not recognized|n.o . reconhecido|command not found|is not recognized/i.test(text)) continue;
    if (/\d/.test(text)) return true;
  }
  return false;
}

function hasTsc() {
  if (hasCmd('tsc')) return true;
  const local = path.join(ROOT, 'node_modules', '.bin', WIN ? 'tsc.cmd' : 'tsc');
  return fs.existsSync(local);
}

function hasPython() {
  return hasCmd('python') || hasCmd('py') || hasCmd('python3');
}

function hasGo() {
  return hasCmd('go') || hasCmd('go', ['version']);
}

function hasRust() {
  return hasCmd('rustc') && hasCmd('cargo');
}

function hasNode() {
  return hasCmd('node');
}

function wingetInstall(id) {
  if (!hasCmd('winget')) return { ok: false, cmd: `winget install ${id}`, detail: 'winget_absent' };
  const r = run('winget', [
    'install', '-e', '--id', id,
    '--accept-package-agreements', '--accept-source-agreements',
    '--disable-interactivity',
  ], { timeout: 420_000 });
  return {
    ok: r.status === 0 || /already installed|successfully installed/i.test(r.out),
    cmd: `winget install -e --id ${id} --accept-package-agreements --accept-source-agreements --disable-interactivity`,
    detail: r.out || r.error || `exit=${r.status}`,
  };
}

function chocoInstall(pkg) {
  if (!hasCmd('choco')) return { ok: false, cmd: `choco install ${pkg}`, detail: 'choco_absent' };
  const r = run('choco', ['install', pkg, '-y', '--no-progress'], { timeout: 420_000 });
  return {
    ok: r.status === 0,
    cmd: `choco install ${pkg} -y --no-progress`,
    detail: r.out || r.error || `exit=${r.status}`,
  };
}

function installRustup() {
  const tries = [];
  if (WIN) {
    const w = wingetInstall('Rustlang.Rustup');
    tries.push(w);
    if (w.ok) {
      whichEnvPath();
      const init = path.join(os.homedir(), '.cargo', 'bin', 'rustup.exe');
      if (fs.existsSync(init) || hasCmd('rustup')) {
        run('rustup', ['toolchain', 'install', 'stable'], { timeout: 420_000 });
        run('rustup', ['default', 'stable'], { timeout: 60_000 });
      }
      whichEnvPath();
      if (hasRust()) return { ok: true, tries };
    }
    const ch = chocoInstall('rustup.install');
    tries.push(ch);
    whichEnvPath();
    if (hasRust() || hasCmd('rustup')) {
      run('rustup', ['toolchain', 'install', 'stable'], { timeout: 420_000 });
      whichEnvPath();
      if (hasRust()) return { ok: true, tries };
    }
  }
  const rustupInitUrl = WIN
    ? 'https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe'
    : 'https://sh.rustup.rs';
  const tmp = path.join(os.tmpdir(), WIN ? 'rustup-init.exe' : 'rustup-init.sh');
  const dl = WIN
    ? run('powershell', [
      '-NoProfile', '-NonInteractive', '-Command',
      `Invoke-WebRequest -Uri '${rustupInitUrl}' -OutFile '${tmp}'`,
    ], { timeout: 180_000 })
    : run('curl', ['-sSfL', rustupInitUrl, '-o', tmp], { timeout: 180_000 });
  tries.push({ ok: dl.status === 0, cmd: `download rustup-init → ${tmp}`, detail: (dl.out || dl.error).slice(0, 200) });
  if (dl.status === 0 && fs.existsSync(tmp)) {
    const inst = WIN
      ? run(tmp, ['-y', '--default-toolchain', 'stable'], { timeout: 420_000 })
      : run('sh', [tmp, '-y'], { timeout: 420_000 });
    tries.push({
      ok: inst.status === 0,
      cmd: WIN ? `${tmp} -y --default-toolchain stable` : `sh ${tmp} -y`,
      detail: (inst.out || inst.error).slice(0, 400),
    });
    whichEnvPath();
    if (hasRust()) return { ok: true, tries };
  }
  return { ok: false, tries };
}

function installPython() {
  if (WIN) {
    let r = wingetInstall('Python.Python.3.12');
    whichEnvPath();
    if (hasPython()) return { ok: true, tries: [r] };
    r = chocoInstall('python');
    whichEnvPath();
    return { ok: hasPython(), tries: [r] };
  }
  const r = run('apt-get', ['install', '-y', 'python3'], { timeout: 180_000 });
  return { ok: hasPython(), tries: [{ ok: r.status === 0, cmd: 'apt-get install -y python3', detail: r.out }] };
}

function installGo() {
  if (WIN) {
    let r = wingetInstall('GoLang.Go');
    whichEnvPath();
    if (hasGo()) return { ok: true, tries: [r] };
    r = chocoInstall('golang');
    whichEnvPath();
    return { ok: hasGo(), tries: [r] };
  }
  const r = run('apt-get', ['install', '-y', 'golang-go'], { timeout: 180_000 });
  return { ok: hasGo(), tries: [{ ok: r.status === 0, cmd: 'apt-get install -y golang-go', detail: r.out }] };
}

function installNode() {
  if (WIN) {
    let r = wingetInstall('OpenJS.NodeJS.LTS');
    whichEnvPath();
    if (hasNode()) return { ok: true, tries: [r] };
    r = chocoInstall('nodejs-lts');
    whichEnvPath();
    return { ok: hasNode(), tries: [r] };
  }
  return { ok: hasNode(), tries: [{ ok: false, cmd: 'install node LTS', detail: 'non-windows_manual' }] };
}

function installTypescript() {
  const local = run('npm', ['install', '--save-dev', 'typescript', '--no-fund', '--no-audit'], { timeout: 180_000 });
  const tries = [{
    ok: local.status === 0,
    cmd: 'npm install --save-dev typescript (lia)',
    detail: (local.out || local.error).slice(0, 300),
  }];
  if (hasTsc()) return { ok: true, tries };
  const g = run('npm', ['install', '-g', 'typescript', '--no-fund', '--no-audit'], { timeout: 180_000 });
  tries.push({
    ok: g.status === 0,
    cmd: 'npm install -g typescript',
    detail: (g.out || g.error).slice(0, 300),
  });
  whichEnvPath();
  return { ok: hasTsc(), tries };
}

const CHECKERS = {
  node: hasNode,
  tsc: hasTsc,
  python: hasPython,
  go: hasGo,
  rustc: hasRust,
};

const INSTALLERS = {
  node: installNode,
  tsc: installTypescript,
  python: installPython,
  go: installGo,
  rustc: installRustup,
};

/**
 * @returns {{ present: string[], installed: string[], failed: object[], skip_ok: boolean }}
 */
export function ensureToolchains(opts = {}) {
  const quiet = !!opts.quiet;
  whichEnvPath();
  const present = [];
  const installed = [];
  const failed = [];
  for (const name of ['node', 'tsc', 'python', 'go', 'rustc']) {
    if (CHECKERS[name]()) {
      present.push(name);
      continue;
    }
    if (!quiet) console.error(`[ensure_toolchains] missing ${name} — installing`);
    let last = INSTALLERS[name]();
    whichEnvPath();
    if (CHECKERS[name]()) {
      installed.push(name);
      present.push(name);
      continue;
    }
    if (!quiet) console.error(`[ensure_toolchains] retry ${name}`);
    last = INSTALLERS[name]();
    whichEnvPath();
    if (CHECKERS[name]()) {
      installed.push(name);
      present.push(name);
      continue;
    }
    const cmds = (last.tries || []).map((t) => t.cmd).join(' | ');
    const detail = (last.tries || []).map((t) => t.detail).join(' ;; ').slice(0, 600);
    failed.push({
      tool: name,
      observed: 'INSTALL_FAILED_AFTER_RETRY',
      need_admin_maybe: /access|denied|administrator|elevation|HRESULT/i.test(detail),
      cmd_for_user: cmds || name,
      detail,
    });
    if (!quiet) {
      console.error(`[ensure_toolchains] OBSERVED fail ${name}: ${cmds}`);
    }
  }
  return {
    present,
    installed,
    failed,
    skip_ok: failed.length === 0,
    policy: 'ALWAYS_INSTALL_MISSING',
    skip_only_if: 'install_failed_after_retry',
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = ensureToolchains();
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.failed.length ? 2 : 0);
}
