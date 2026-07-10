import { createFallbackSnapshot, updateHealthHistory } from '../../src/lib/health.ts';
import { readPreviousHistory, writePublicHealthData } from './io.ts';

const configuredTime = process.env.PAUSE_FALLBACK_TIME;
const now = configuredTime && Number.isFinite(Date.parse(configuredTime)) ? new Date(configuredTime) : new Date();
const snapshot = createFallbackSnapshot(now);
const history = updateHealthHistory(await readPreviousHistory(now), snapshot, now);
await writePublicHealthData(snapshot, history);
process.stdout.write('A sanitized unknown health snapshot was generated.\n');
