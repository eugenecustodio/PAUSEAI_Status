import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const evidenceLink = z
  .object({
    label: z.string().trim().min(1).max(80),
    url: z.url().refine((url) => url.startsWith('https://'), {
      message: 'Public evidence links must use HTTPS.',
    }),
  })
  .strict();

const updates = defineCollection({
  loader: glob({
    base: './src/content/updates',
    pattern: '**/*.{md,mdx}',
  }),
  schema: z
    .object({
      title: z.string().trim().min(1).max(100),
      date: z.coerce.date(),
      category: z.enum(['milestone', 'backend', 'privacy', 'release']),
      status: z.enum(['complete', 'in_progress', 'pending']),
      summary: z.string().trim().min(1).max(240),
      authorLabel: z.string().trim().min(1).max(60),
      evidenceLinks: z.array(evidenceLink).max(6).optional(),
    })
    .strict(),
});

export const collections = { updates };
