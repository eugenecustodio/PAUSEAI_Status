import type { CollectionEntry } from 'astro:content';

type UpdateEntry = CollectionEntry<'updates'>;

const LABELS: Record<string, string> = {
  backend: 'Backend',
  complete: 'Complete',
  in_progress: 'In progress',
  milestone: 'Milestone',
  pending: 'Pending',
  privacy: 'Privacy',
  release: 'Release',
};

/** Newest first, with a stable ID tie-break for entries published on the same day. */
export function sortUpdates(entries: UpdateEntry[]): UpdateEntry[] {
  return [...entries].sort((a, b) => {
    const dateDifference = b.data.date.valueOf() - a.data.date.valueOf();
    return dateDifference || a.id.localeCompare(b.id, 'en');
  });
}

export function humanizeUpdateValue(value: string): string {
  return (
    LABELS[value] ??
    value.replaceAll('_', ' ').replace(/^./, (character) => character.toUpperCase())
  );
}

export function formatUpdateDate(date: Date): string {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(date);
}
