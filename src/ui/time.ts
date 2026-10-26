// "4h 12m" style text for a length of time.
export function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.ceil(ms / 60_000));
  const d = Math.floor(totalMinutes / 1440);
  const h = Math.floor((totalMinutes % 1440) / 60);
  const m = totalMinutes % 60;
  if (d > 0) return `${d}d ${h}h`;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// A time of day, like "14:05".
export function formatClock(at: number): string {
  const d = new Date(at);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// When something happened, for the Messages page: "Today 14:05",
// "Yesterday 9:30" or a date like "12 Oct".
export function formatWhen(at: number, now: number, today: (t: string) => string, yesterday: (t: string) => string): string {
  const d = new Date(at);
  const time = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  const day = (t: number) => new Date(t).toDateString();
  if (day(at) === day(now)) return today(time);
  if (day(at) === day(now - 86_400_000)) return yesterday(time);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

// A time that may be days away, like "14:05" today or "Sat 14:05".
export function formatDayClock(at: number, now: number): string {
  if (new Date(at).toDateString() === new Date(now).toDateString()) return formatClock(at);
  return `${new Date(at).toLocaleDateString(undefined, { weekday: 'short' })} ${formatClock(at)}`;
}
