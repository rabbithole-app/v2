#!/usr/bin/env node
// Regenerate TypeScript/JS declarations + init_args binaries for our Motoko
// canisters. Replaces `dfx generate` + manual `didc encode` runs.
//
// For each canister:
//   1. `moc --idl` produces a .did text file
//   2. `icp-bindgen --actor-disabled` emits classic Candid bindings
//      (.did.js + .did.d.ts) into libs/declarations/src/<outDir>/
//   3. If init-args/<name>.did or init-args/<name>.<env>.did exists, `didc
//      encode` produces the matching .bin using the freshly generated .did
//      for type context. icp-cli text-encoding cannot resolve partial variant
//      label sets correctly, so init args with variants MUST be pre-encoded.

import { execFileSync, execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = resolve(__dirname, '..');
const MONOREPO_ROOT = resolve(BACKEND_DIR, '..', '..');
const DECLARATIONS_SRC = resolve(MONOREPO_ROOT, 'libs', 'declarations', 'src');

// Canisters we build ourselves via Motoko. `encrypted-storage` is not in any
// deploy environment, but its wasm is needed for tests + mock-server, and its
// bindings are consumed by both backend tests and the frontend.
//
// `initArgsType`: when set, re-encodes init-args/<name>.did and
// init-args/<name>.<env>.did text forms into matching .bin files using
// `didc encode` against the fresh .did. This keeps icp.yaml's default args
// and deploy scripts' environment-specific args in sync with InitArgs.
const CANISTERS = [
  { name: 'rabbithole-backend', mainFile: 'src/main.mo', outDir: 'backend', initArgsType: 'InitArgs' },
  { name: 'encrypted-storage', mainFile: 'src/EncryptedStorageCanister.mo', outDir: 'encrypted-storage' },
];

const INIT_ARGS_DIR = resolve(BACKEND_DIR, 'init-args');

function encodePrebuiltInitArgs({ defs, input, output, type }) {
  if (!existsSync(defs) || !existsSync(input)) return;
  sh(`didc encode --format hex --defs "${defs}" --types '(${type})' "$(cat "${input}")" > "${output}"`, { stdio: 'inherit' });
  console.log(`[generate-declarations] wrote ${output}`);
}

async function initArgTextPaths(name) {
  const entries = await fs.readdir(INIT_ARGS_DIR);
  return entries
    .filter(entry => entry === `${name}.did` || (entry.startsWith(`${name}.`) && entry.endsWith('.did')))
    .sort()
    .map(entry => join(INIT_ARGS_DIR, entry));
}

async function generate({ name, mainFile, outDir, initArgsType }) {
  console.log(`\n[generate-declarations] ${name}`);

  // 1. moc --idl → .did
  const tmpDir = await fs.mkdtemp(join(os.tmpdir(), `icp-bindgen-${name}-`));
  const didPath = join(tmpDir, `${name}.did`);
  const mocBin = sh('mops toolchain bin moc');
  // `mops sources` emits one --package flag per line; join into a single arg list.
  const sources = sh('mops sources').replace(/\s+/g, ' ').trim();
  sh(`"${mocBin}" --idl ${sources} -o "${didPath}" "${mainFile}"`, { stdio: 'inherit' });

  // 2. icp-bindgen → .did.js + .did.d.ts  (in <tmpDir>/declarations/)
  sh(`../../node_modules/.bin/icp-bindgen --did-file "${didPath}" --out-dir "${tmpDir}" --actor-disabled`, { stdio: 'inherit' });

  // 3. Move generated files into libs/declarations/src/<outDir>/
  const target = resolve(DECLARATIONS_SRC, outDir);
  await fs.mkdir(target, { recursive: true });
  for (const ext of ['js', 'd.ts']) {
    const src = join(tmpDir, 'declarations', `${name}.did.${ext}`);
    const dst = join(target, `${name}.did.${ext}`);
    execFileSync('rm', ['-f', dst], { cwd: BACKEND_DIR, stdio: 'inherit' });
    execFileSync('cp', ['-f', src, dst], { cwd: BACKEND_DIR, stdio: 'inherit' });
    console.log(`[generate-declarations] wrote ${dst}`);
  }

  // 4. Encode init args if a text form exists.
  if (initArgsType) {
    for (const textPath of await initArgTextPaths(name)) {
      const text = await fs.readFile(textPath, 'utf8');
      const binPath = textPath.replace(/\.did$/, '.bin');
      const tmpText = join(tmpDir, 'args.did');
      await fs.writeFile(tmpText, text);
      // didc writes hex to stdout; pipe to file.
      sh(`didc encode --format hex --defs "${didPath}" --types '(${initArgsType})' "$(cat "${tmpText}")" > "${binPath}"`, { stdio: 'inherit' });
      console.log(`[generate-declarations] wrote ${binPath}`);
    }
  }

  await fs.rm(tmpDir, { recursive: true, force: true });
}

async function main() {
  for (const canister of CANISTERS) {
    await generate(canister);
  }
  encodePrebuiltInitArgs({
    defs: join(INIT_ARGS_DIR, 'internet_identity.did'),
    input: join(INIT_ARGS_DIR, 'internet_identity_backend.did'),
    output: join(INIT_ARGS_DIR, 'internet_identity_backend.hex'),
    type: 'opt InternetIdentityInit',
  });
  console.log('\n[generate-declarations] done');
}

function sh(cmd, opts = {}) {
  const out = execSync(cmd, { cwd: BACKEND_DIR, stdio: ['ignore', 'pipe', 'inherit'], ...opts });
  return out ? out.toString().trim() : '';
}

main().catch(err => {
  console.error('[generate-declarations] FAILED:', err.message);
  process.exit(1);
});
