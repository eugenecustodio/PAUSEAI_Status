import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export type SecretFinding = {
  file: string;
  line: number;
  rule: 'provider_key' | 'github_token' | 'jwt' | 'private_key' | 'credential_assignment';
};

const root = process.cwd();
const ignoredDirectories = new Set(['.git', '.astro', 'node_modules', 'playwright-report', 'test-results', 'coverage']);
const textExtensions = new Set([
  '.astro',
  '.css',
  '.html',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.svg',
  '.ts',
  '.tsx',
  '.txt',
  '.xml',
  '.yaml',
  '.yml',
]);
const credentialNames = [
  'PAUSE_SUPABASE_URL',
  'PAUSE_SUPABASE_ANON_KEY',
  'PAUSE_HEALTH_EMAIL',
  'PAUSE_HEALTH_PASSWORD',
  'QWEN_API_KEY',
  'DASHSCOPE_API_KEY',
] as const;
const credentialNameSuffix =
  /(?:API_KEY|ANON_KEY|ACCESS_KEY|SECRET_KEY|PRIVATE_KEY|TOKEN|PASSWORD|PASSCODE|CREDENTIALS?)$/;
const providerKeyPattern =
  /\b(?:AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|SG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}|sb_(?:publishable|secret)_[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9][A-Za-z0-9._-]{19,}|xox[baprs]-[A-Za-z0-9-]{20,})\b/;
const githubTokenPattern = /\b(?:gh[oprsu]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/;

export function scanText(file: string, contents: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  const lines = contents.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    if (providerKeyPattern.test(line)) findings.push({ file, line: index + 1, rule: 'provider_key' });
    if (githubTokenPattern.test(line)) findings.push({ file, line: index + 1, rule: 'github_token' });
    if (/\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/.test(line)) {
      findings.push({ file, line: index + 1, rule: 'jwt' });
    }
    if (/-----BEGIN (?:DSA |EC |OPENSSH |PGP |RSA )?PRIVATE KEY-----/.test(line)) {
      findings.push({ file, line: index + 1, rule: 'private_key' });
    }
    const assignment = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*[:=]\s*(.*?)\s*$/);
    if (
      assignment &&
      (credentialNames.includes(assignment[1] as (typeof credentialNames)[number]) ||
        credentialNameSuffix.test(assignment[1])) &&
      !isObviousPlaceholder(assignment[2] ?? '')
    ) {
      findings.push({ file, line: index + 1, rule: 'credential_assignment' });
    }
  }
  return findings;
}

export function isObviousPlaceholder(value: string): boolean {
  const normalized = value.trim().replace(/^['"]|['"]$/g, '').toLowerCase();
  return (
    normalized.length === 0 ||
    normalized.startsWith('${') ||
    normalized.startsWith('process.env.') ||
    normalized.includes('your-') ||
    normalized.includes('your_') ||
    normalized.includes('changeme') ||
    normalized.includes('dummy') ||
    normalized.includes('fake') ||
    normalized.includes('not-a-real') ||
    normalized.includes('redacted') ||
    normalized.includes('replace-me') ||
    normalized.includes('replace_with') ||
    normalized.includes('placeholder') ||
    normalized.includes('sample') ||
    normalized.includes('test-only') ||
    normalized.startsWith('<set-') ||
    /^<[^>]+>$/.test(normalized) ||
    /^(?:x{4,}|\*{4,}|\.{3,})$/.test(normalized) ||
    normalized.endsWith('.invalid') ||
    normalized === 'false'
  );
}

async function main(): Promise<void> {
  const findings: SecretFinding[] = [];
  for (const path of await collectTextFiles(root)) {
    findings.push(...scanText(relative(root, path), await readFile(path, 'utf8')));
  }

  if (findings.length > 0) {
    const locations = findings.map((finding) => `${finding.file}:${finding.line} (${finding.rule})`).sort();
    process.stderr.write(`Potential credential material found at: ${locations.join(', ')}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write('No high-confidence credential material found in source or built output.\n');
  }
}

async function collectTextFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      paths.push(...(await collectTextFiles(path)));
      continue;
    }
    if (!entry.isFile()) continue;
    const details = await stat(path);
    if (details.size > 2_000_000) continue;
    const extension = extname(entry.name).toLowerCase();
    if (textExtensions.has(extension) || entry.name === '.env.example' || entry.name === '.gitignore') paths.push(path);
  }
  return paths;
}

const isEntryPoint = process.argv[1] ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href : false;
if (isEntryPoint) await main();
