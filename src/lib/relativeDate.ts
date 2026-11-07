/** "today", "yesterday", "3 days ago", "Oct 24", "Oct 24, 2025" (no time). */
export function relativeDate(ts: number, now = Date.now()): string {
  const d = new Date(ts);
  const startOf = (t: number) => {
    const x = new Date(t);
    x.setHours(0, 0, 0, 0);
    return x.getTime();
  };
  const days = Math.round((startOf(now) - startOf(ts)) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return d.toLocaleDateString('en', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

export const fullDate = (ts: number) => new Date(ts).toLocaleString();
