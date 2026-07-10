import { createFallbackSnapshot, updateHealthHistory } from '../../src/lib/health.ts';
import { readPreviousHistory, readPreviousSnapshot, writePublicHealthData } from './io.ts';
import { readProbeEnvironment, runHealthProbe } from './probe.ts';

async function main(): Promise<void> {
  const now = new Date();
  const [previousSnapshot, previousHistory] = await Promise.all([
    readPreviousSnapshot(),
    readPreviousHistory(now),
  ]);

  let snapshot;
  try {
    snapshot = await runHealthProbe(readProbeEnvironment(), previousSnapshot, { now: () => now });
  } catch {
    snapshot = createFallbackSnapshot(now);
  }

  const history = updateHealthHistory(previousHistory, snapshot, now);
  await writePublicHealthData(snapshot, history);
  process.stdout.write(`Public health data generated with status: ${snapshot.overallStatus}.\n`);
}

await main();
