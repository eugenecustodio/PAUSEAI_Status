import type { CollectionEntry } from 'astro:content';
import { describe, expect, it } from 'vitest';
import { humanizeUpdateValue, sortUpdates } from './updates';

function entry(id: string, date: string): CollectionEntry<'updates'> {
  return {
    id,
    data: { date: new Date(`${date}T00:00:00.000Z`) },
  } as CollectionEntry<'updates'>;
}

describe('update presentation helpers', () => {
  it('turns stored status values into human-readable labels', () => {
    expect(humanizeUpdateValue('in_progress')).toBe('In progress');
    expect(humanizeUpdateValue('complete')).toBe('Complete');
  });

  it('sorts newest first and uses the ID for a deterministic same-date order', () => {
    const sorted = sortUpdates([
      entry('zeta', '2026-07-10'),
      entry('bravo', '2026-07-11'),
      entry('alpha', '2026-07-11'),
    ]);

    expect(sorted.map(({ id }) => id)).toEqual(['alpha', 'bravo', 'zeta']);
  });
});
