import type { Job } from './types';
import { toMillis } from './types';

export function relevanceScore(job: Job, keyword: string): number {
  const k = keyword.toLowerCase();
  let score = 0;
  const title = job.title.toLowerCase();
  if (title === k) score += 100;
  else if (title.startsWith(k)) score += 60;
  else if (title.includes(k)) score += 35;
  if (job.descriptionPlain.toLowerCase().includes(k)) score += 10;
  const hoursOld = (Date.now() - toMillis(job.firstSeenAt)) / 3.6e6;
  score += Math.max(0, 20 - hoursOld / 6);
  return score;
}
