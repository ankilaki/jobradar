import type { Job } from './types';

export function formatSalary(job: Job): string {
  const s = job.salary;
  if (!s) return 'Not listed';
  if (s.min != null && s.max != null) {
    return `${fmtMoney(s.min)} – ${fmtMoney(s.max)}`;
  }
  if (s.raw) return s.raw;
  if (s.min != null) return fmtMoney(s.min);
  return 'Not listed';
}

function fmtMoney(n: number): string {
  if (n >= 1000) return `$${Math.round(n / 1000)}K`;
  return `$${n}`;
}

export function formatLocation(job: Job): string {
  const loc = job.location;
  const cities = loc.allCities?.length
    ? loc.allCities
    : loc.city
      ? [loc.city]
      : [];

  if (cities.length > 1) {
    const shown = cities.slice(0, 3).join(' · ');
    const more = cities.length > 3 ? ` +${cities.length - 3}` : '';
    return loc.isRemote ? `Remote · ${shown}${more}` : `${shown}${more}`;
  }

  if (loc.isRemote && !cities.length) {
    return loc.country ? `Remote · ${loc.country}` : 'Remote';
  }
  if (loc.city && loc.state) return `${loc.city}, ${loc.state}`;
  if (loc.city && loc.country) return `${loc.city}, ${loc.country}`;
  if (loc.city) return loc.city;
  if (loc.isRemote && loc.country) return `Remote · ${loc.country}`;
  if (loc.country) return loc.country;
  return loc.raw || 'Unknown';
}

export function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
