import { readFile } from 'node:fs/promises';

import { parseHealthHistory, parseHealthSnapshot } from '../../src/lib/health.ts';
import { CURRENT_STATUS_PATH, STATUS_HISTORY_PATH } from './io.ts';

const currentRaw = await readFile(CURRENT_STATUS_PATH, 'utf8');
const historyRaw = await readFile(STATUS_HISTORY_PATH, 'utf8');
const current = parseHealthSnapshot(JSON.parse(currentRaw));
parseHealthHistory(JSON.parse(historyRaw), new Date(current.generatedAt));

const combined = `${currentRaw}\n${historyRaw}`;
const forbiddenPatterns = [
  /@[a-z0-9.-]+\.[a-z]{2,}/i,
  /eyJ[a-zA-Z0-9_-]{12,}\.[a-zA-Z0-9_-]{12,}\.[a-zA-Z0-9_-]{12,}/,
  /(?:access|refresh|service[_ -]?role|anon)[_ -]?token/i,
  /(?:password|authorization|api[_ -]?key|supabase[_ -]?url)/i,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
];

if (forbiddenPatterns.some((pattern) => pattern.test(combined))) {
  throw new Error('public_health_data_contains_forbidden_value');
}

process.stdout.write('Public health data passed strict schema and redaction validation.\n');
