import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';
import './UpdateFilter.css';

export interface UpdateCard {
  title: string;
  date: string;
  category: string;
  status: string;
  summary: string;
  authorLabel: string;
  href: string;
}

interface Props {
  updates: UpdateCard[];
}

export default function UpdateFilter({ updates }: Props) {
  const categories = useMemo(
    () => ['All', ...Array.from(new Set(updates.map((update) => update.category)))],
    [updates],
  );
  const [category, setCategory] = useState('All');
  const visible =
    category === 'All' ? updates : updates.filter((update) => update.category === category);

  return (
    <div className="updates-browser">
      <div className="filter-row" aria-label="Filter updates by category">
        {categories.map((item) => (
          <button
            className="filter-chip"
            data-active={category === item}
            key={item}
            type="button"
            aria-pressed={category === item}
            onClick={() => setCategory(item)}
          >
            {humanize(item)}
          </button>
        ))}
      </div>

      <div className="updates-grid" aria-live="polite">
        <AnimatePresence mode="popLayout" initial={false}>
          {visible.map((update) => (
            <motion.article
              layout
              className="update-card"
              key={update.href}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22 }}
            >
              <div className="update-meta">
                <span className="update-category">{humanize(update.category)}</span>
                <span className="update-status" data-status={update.status}>{humanize(update.status)}</span>
              </div>
              <p className="update-date">
                <time dateTime={update.date}>
                  {new Intl.DateTimeFormat('en', {
                    dateStyle: 'long',
                    timeZone: 'UTC',
                  }).format(new Date(update.date))}
                </time>
              </p>
              <h2>{update.title}</h2>
              <p>{update.summary}</p>
              <div className="update-card-footer">
                <span>{update.authorLabel}</span>
                <a href={update.href} aria-label={`Read ${update.title}`}>
                  Read update <span aria-hidden="true">↗</span>
                </a>
              </div>
            </motion.article>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function humanize(value: string): string {
  if (value === 'All') return value;
  return value
    .replaceAll('_', ' ')
    .replace(/^./, (character) => character.toUpperCase());
}
