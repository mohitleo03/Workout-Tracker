/** Normalise any date-ish input to a YYYY-MM-DD string in local terms. */
export function toDayKey(input) {
  const d = input ? new Date(input) : new Date();
  if (Number.isNaN(d.getTime())) throw new Error('Invalid date');
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Start of the UTC day for a day key or date. */
export function dayStart(input) {
  const key = toDayKey(input);
  return new Date(`${key}T00:00:00.000Z`);
}

export function addDays(date, n) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}
