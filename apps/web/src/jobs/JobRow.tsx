import { useState } from 'react';
import DOMPurify from 'dompurify';
import { CompanyMark } from './CompanyMark';
import type { Job } from './types';
import { toMillis } from './types';
import { formatLocation, formatSalary, relativeTime } from './format';

const FRESH_MS = 2 * 60 * 60 * 1000;

type JobRowProps = {
  job: Job;
  applied?: boolean;
  onToggleApplied?: () => void;
  isNew?: boolean;
  /** Feed uses cards; Applied keeps the compact log row. */
  variant?: 'row' | 'card';
  /** Ordered logo URL candidates for this job's company. */
  logoCandidates?: string[];
};

export function JobRow({
  job,
  applied,
  onToggleApplied,
  isNew,
  variant = 'row',
  logoCandidates,
}: JobRowProps) {
  if (variant === 'card') {
    return (
      <JobCard
        job={job}
        applied={applied}
        onToggleApplied={onToggleApplied}
        isNew={isNew}
        logoCandidates={logoCandidates}
      />
    );
  }

  return (
    <JobLogRow
      job={job}
      applied={applied}
      onToggleApplied={onToggleApplied}
      isNew={isNew}
      logoCandidates={logoCandidates}
    />
  );
}

function JobCard({
  job,
  applied,
  onToggleApplied,
  isNew,
  logoCandidates,
}: Omit<JobRowProps, 'variant'>) {
  const [expanded, setExpanded] = useState(false);
  const firstSeen = toMillis(job.firstSeenAt);
  const fresh = isNew ?? Date.now() - firstSeen < FRESH_MS;
  const excerpt =
    job.descriptionPlain.length > 160
      ? `${job.descriptionPlain.slice(0, 160).trim()}…`
      : job.descriptionPlain;
  const safeHtml = DOMPurify.sanitize(job.descriptionHtml ?? '');

  return (
    <article
      className={`motion-row-draw flex h-full flex-col border border-rule-faint bg-paper-2 ${
        applied ? 'opacity-70' : ''
      } ${fresh ? 'border-l-2 border-l-signal' : ''}`}
    >
      <div className="flex items-start justify-between gap-2 border-b border-rule-faint px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <CompanyMark
            key={job.companyId}
            name={job.companyName}
            candidates={logoCandidates}
            size={28}
            className="border border-rule-faint"
          />
          <time className="font-mono text-[10px] text-ink-muted">
            {relativeTime(firstSeen)}
          </time>
        </div>
        {fresh ? (
          <span
            className="inline-block h-2 w-2 rotate-45 bg-signal motion-ping-in"
            title="New signal"
          />
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-3 py-3">
        <h2
          className={`text-[15px] font-semibold leading-snug ${
            applied ? 'line-through decoration-rule' : ''
          }`}
        >
          {job.title}
        </h2>
        {applied ? (
          <span className="mt-1 font-mono text-[10px] uppercase tracking-wide text-ink-muted">
            Filed
          </span>
        ) : null}

        <p className="mt-2 text-sm text-ink-muted">
          <span className="text-ink">{job.companyName}</span>
          <span className="mx-1.5 text-rule">·</span>
          {formatLocation(job)}
        </p>

        <p className="mt-1 font-mono text-[11px] text-ink-muted">
          {formatSalary(job)}
          {[job.department, job.employmentType, job.location.workplaceType]
            .filter(Boolean)
            .map((x) => ` · ${x}`)
            .join('')}
        </p>

        <p className="mt-3 flex-1 text-sm leading-relaxed text-ink-muted">
          {excerpt}
        </p>

        {safeHtml ? (
          <button
            type="button"
            className="mt-2 self-start font-mono text-[11px] text-sea underline-offset-2 hover:underline"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? 'Collapse' : 'Expand'}
          </button>
        ) : null}
        {expanded ? (
          <div
            className="prose-job mt-2 max-h-48 overflow-y-auto text-sm text-ink [&_a]:text-sea [&_ul]:list-disc [&_ul]:pl-5"
            dangerouslySetInnerHTML={{ __html: safeHtml }}
          />
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-rule-faint pt-3">
          <a
            href={job.applyUrl}
            target="_blank"
            rel="noreferrer"
            className="apply-link font-medium text-sea"
          >
            Apply
          </a>
          {onToggleApplied ? (
            <button
              type="button"
              onClick={onToggleApplied}
              className="font-mono text-xs text-ink-muted underline-offset-2 hover:text-ink hover:underline"
            >
              {applied ? 'Mark not applied' : 'Mark applied'}
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function JobLogRow({
  job,
  applied,
  onToggleApplied,
  isNew,
  logoCandidates,
}: Omit<JobRowProps, 'variant'>) {
  const [expanded, setExpanded] = useState(false);
  const firstSeen = toMillis(job.firstSeenAt);
  const fresh = isNew ?? Date.now() - firstSeen < FRESH_MS;
  const excerpt =
    job.descriptionPlain.length > 220
      ? `${job.descriptionPlain.slice(0, 220).trim()}…`
      : job.descriptionPlain;
  const safeHtml = DOMPurify.sanitize(job.descriptionHtml ?? '');

  return (
    <article
      className={`motion-row-draw flex border-b border-rule-faint ${
        applied ? 'opacity-70' : ''
      }`}
    >
      <div className="flex w-14 shrink-0 flex-col items-end border-r border-rule py-3 pr-2 sm:w-16">
        {fresh ? (
          <span
            className="mb-1 inline-block h-2 w-2 rotate-45 bg-signal motion-ping-in"
            title="New signal"
          />
        ) : (
          <span className="mb-1 h-2 w-2" />
        )}
        <time className="font-mono text-[10px] leading-tight text-ink-muted sm:text-[11px]">
          {relativeTime(firstSeen)}
        </time>
      </div>

      <div className="min-w-0 flex-1 py-3 pl-3 sm:pl-4">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <CompanyMark
            key={job.companyId}
            name={job.companyName}
            candidates={logoCandidates}
            size={22}
            className="border border-rule-faint"
          />
          <h2
            className={`text-[17px] font-semibold leading-snug ${
              applied ? 'line-through decoration-rule' : ''
            }`}
          >
            {job.title}
          </h2>
          {applied ? (
            <span className="font-mono text-[10px] uppercase tracking-wide text-ink-muted">
              Filed
            </span>
          ) : null}
        </div>

        <p className="mt-1 text-sm text-ink-muted">
          <span className="text-ink">{job.companyName}</span>
          <span className="mx-1.5 text-rule">·</span>
          {formatLocation(job)}
          <span className="mx-1.5 text-rule">·</span>
          <span className="font-mono text-xs">{formatSalary(job)}</span>
        </p>

        <p className="mt-1 font-mono text-[11px] text-ink-muted">
          {[job.department, job.employmentType, job.location.workplaceType]
            .filter(Boolean)
            .join(' · ')}
          {job.department || job.employmentType || job.location.workplaceType
            ? ' · '
            : ''}
          Found by JobRadar {relativeTime(firstSeen)}
        </p>

        <p className="mt-2 text-sm text-ink-muted">{excerpt}</p>
        {safeHtml ? (
          <button
            type="button"
            className="mt-1 font-mono text-[11px] text-sea underline-offset-2 hover:underline"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? 'Collapse description' : 'Expand description'}
          </button>
        ) : null}
        {expanded ? (
          <div
            className="prose-job mt-2 max-w-none text-sm text-ink [&_a]:text-sea [&_ul]:list-disc [&_ul]:pl-5"
            dangerouslySetInnerHTML={{ __html: safeHtml }}
          />
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-4">
          <a
            href={job.applyUrl}
            target="_blank"
            rel="noreferrer"
            className="apply-link font-medium text-sea"
          >
            Apply
          </a>
          {onToggleApplied ? (
            <button
              type="button"
              onClick={onToggleApplied}
              className="font-mono text-xs text-ink-muted underline-offset-2 hover:text-ink hover:underline"
            >
              {applied ? 'Mark not applied' : 'Mark applied'}
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
