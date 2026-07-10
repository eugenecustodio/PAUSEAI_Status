import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import {
  parseHealthHistory,
  parseHealthSnapshot,
  stringifyPublicHistory,
  stringifyPublicSnapshot,
  type HealthHistory,
  type HealthSnapshot,
} from '../../src/lib/health.ts';

export const STATUS_DIRECTORY = resolve(process.cwd(), 'public/status');
export const CURRENT_STATUS_PATH = resolve(STATUS_DIRECTORY, 'current.json');
export const STATUS_HISTORY_PATH = resolve(STATUS_DIRECTORY, 'history.json');

export async function readPreviousSnapshot(): Promise<HealthSnapshot | null> {
  try {
    return parseHealthSnapshot(JSON.parse(await readFile(CURRENT_STATUS_PATH, 'utf8')));
  } catch {
    return null;
  }
}

export async function readPreviousHistory(now: Date): Promise<HealthHistory | null> {
  try {
    return parseHealthHistory(JSON.parse(await readFile(STATUS_HISTORY_PATH, 'utf8')), now);
  } catch {
    return null;
  }
}

export async function writePublicHealthData(snapshot: HealthSnapshot, history: HealthHistory): Promise<void> {
  await mkdir(STATUS_DIRECTORY, { recursive: true });
  await Promise.all([
    writeAtomic(CURRENT_STATUS_PATH, stringifyPublicSnapshot(snapshot)),
    writeAtomic(STATUS_HISTORY_PATH, stringifyPublicHistory(history)),
  ]);
}

async function writeAtomic(path: string, contents: string): Promise<void> {
  const temporaryPath = `${path}.tmp`;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(temporaryPath, contents, { encoding: 'utf8', mode: 0o644 });
  await rename(temporaryPath, path);
}
