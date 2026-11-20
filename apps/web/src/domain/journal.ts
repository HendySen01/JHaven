const dayMs = 86_400_000;

export function wallTime(instant: string, zone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(instant));
  const part = (key: string) => parts.find((p) => p.type === key)?.value;
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}:${part('second')}`;
}
export function dateInZone(zone: string) {
  return wallTime(new Date().toISOString(), zone).slice(0, 10);
}
export function shiftDate(date: string, days: number) {
  return new Date(Date.parse(date) + days * dayMs).toISOString().slice(0, 10);
}
export function dayDistance(from: string, to: string) {
  return (Date.parse(to) - Date.parse(from)) / dayMs;
}
export function wallTimeCandidates(input: string, zone: string) {
  if (!input) return [];
  const value = input.length === 16 ? `${input}:00` : input;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(value)) return [];
  const raw = Date.parse(`${value}Z`);
  if (!Number.isFinite(raw)) return [];
  // 从实际时区规则采集前后的偏移，再反向比对。不存在的墙钟时间不会被自动平移。
  const offsets = new Set<number>();
  for (let hour = -48; hour <= 48; hour += 6) {
    const instant = raw + hour * 3600000;
    const local = wallTime(new Date(instant).toISOString(), zone);
    offsets.add(Date.parse(`${local}Z`) - instant);
  }
  return [...offsets]
    .map((offset) => new Date(raw - offset).toISOString().replace('.000Z', 'Z'))
    .filter((candidate) => wallTime(candidate, zone) === value)
    .sort();
}
export function journalHour(date: string, instant: string | null, zone: string) {
  if (!instant) return null;
  const local = wallTime(instant, zone);
  const [hours, minutes, seconds] = local.slice(11).split(':').map(Number);
  return dayDistance(date, local.slice(0, 10)) * 24 + hours! + minutes! / 60 + seconds! / 3600;
}

export function sleepMinutes(asleep: string | null, wake: string | null) {
  if (!asleep || !wake) return null;
  const minutes = (Date.parse(wake) - Date.parse(asleep)) / 60_000;
  return Number.isFinite(minutes) && minutes >= 0 ? Math.round(minutes) : null;
}

export function journalClock(date: string, instant: string | null, zone: string) {
  if (!instant) return '未记录';
  const local = wallTime(instant, zone);
  const offset = dayDistance(date, local.slice(0, 10));
  const prefix =
    offset === 0 ? '' : offset === 1 ? '次日 ' : offset === -1 ? '前日 ' : `${local.slice(5, 10)} `;
  return prefix + local.slice(11, 16);
}
