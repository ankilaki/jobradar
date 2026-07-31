import type { JobFilter } from '@jobradar/shared';
import { useEffect, useRef, useState } from 'react';

export type SortMode = 'newest' | 'relevant';

export type FeedFilters = JobFilter & {
  sort: SortMode;
  hideApplied: boolean;
};

const KEYWORD_DEBOUNCE_MS = 300;

type JobFiltersProps = {
  value: FeedFilters;
  onChange: (next: FeedFilters) => void;
  cities: string[];
  states: string[];
  countries: string[];
};

export function JobFilters({
  value,
  onChange,
  cities,
  states,
  countries,
}: JobFiltersProps) {
  const [keywordDraft, setKeywordDraft] = useState(value.keyword ?? '');
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    setKeywordDraft(value.keyword ?? '');
  }, [value.keyword]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const next = keywordDraft || undefined;
      if ((valueRef.current.keyword ?? '') === (next ?? '')) return;
      onChange({ ...valueRef.current, keyword: next });
    }, KEYWORD_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [keywordDraft, onChange]);

  function patch(partial: Partial<FeedFilters>) {
    onChange({ ...value, ...partial });
  }

  return (
    <section className="border border-rule-faint bg-paper-2 px-3 py-4 sm:px-4">
      <div className="mb-4 font-mono text-[10px] uppercase tracking-widest text-ink-muted">
        Layers
      </div>

      <div className="flex flex-col gap-4">
        <label className="block">
          <span className="font-mono text-[10px] text-ink-muted">Keyword</span>
          <input
            value={keywordDraft}
            onChange={(e) => setKeywordDraft(e.target.value)}
            placeholder="title or description"
            className="mt-0.5 w-full border-0 border-b border-rule bg-transparent px-0 py-1.5 text-sm outline-none focus:border-signal"
          />
        </label>

        <label className="block">
          <span className="font-mono text-[10px] text-ink-muted">City</span>
          <select
            value={value.city ?? ''}
            onChange={(e) => patch({ city: e.target.value || undefined })}
            className="mt-0.5 w-full border-0 border-b border-rule bg-transparent px-0 py-1.5 text-sm outline-none focus:border-signal"
          >
            <option value="">Any</option>
            {cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="font-mono text-[10px] text-ink-muted">State</span>
          <select
            value={value.state ?? ''}
            onChange={(e) => patch({ state: e.target.value || undefined })}
            className="mt-0.5 w-full border-0 border-b border-rule bg-transparent px-0 py-1.5 text-sm outline-none focus:border-signal"
          >
            <option value="">Any</option>
            {states.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="font-mono text-[10px] text-ink-muted">Country</span>
          <select
            value={value.country ?? ''}
            onChange={(e) => patch({ country: e.target.value || undefined })}
            className="mt-0.5 w-full border-0 border-b border-rule bg-transparent px-0 py-1.5 text-sm outline-none focus:border-signal"
          >
            <option value="">Any</option>
            {countries.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="font-mono text-[10px] text-ink-muted">Sort</span>
          <select
            value={value.sort}
            onChange={(e) =>
              patch({ sort: e.target.value as FeedFilters['sort'] })
            }
            className="mt-0.5 w-full border-0 border-b border-rule bg-transparent px-0 py-1.5 text-sm outline-none focus:border-signal"
          >
            <option value="newest">Newest</option>
            <option value="relevant">Most Relevant</option>
          </select>
        </label>

        <div className="flex flex-col gap-2 border-t border-rule-faint pt-4">
          <Toggle
            label="Remote only"
            on={Boolean(value.remoteOnly)}
            onToggle={() =>
              patch({ remoteOnly: !value.remoteOnly || undefined })
            }
          />
          <Toggle
            label="Hide applied"
            on={value.hideApplied}
            onToggle={() => patch({ hideApplied: !value.hideApplied })}
          />
        </div>
      </div>
    </section>
  );
}

function Toggle({
  label,
  on,
  onToggle,
}: {
  label: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-fit text-left font-mono text-xs ${
        on ? 'border-b border-signal text-ink' : 'text-ink-muted'
      }`}
      aria-pressed={on}
    >
      {on ? '✓ ' : ''}
      {label}
    </button>
  );
}
