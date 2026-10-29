// Parsing and formatting of human-written time estimates ("30m", "1h30", "1.5h", "2 hours").

const DUR = '\\d+(?:\\.\\d+)?\\s*h(?:ours?|rs?)?(?:\\s*\\d+\\s*(?:m(?:in(?:ute)?s?)?)?)?|\\d+\\s*m(?:in(?:ute)?s?)?|\\d+:\\d{2}';
const QUICK_RE = new RegExp('^(.*?)[\\s+]+(' + DUR + ')\\s*$', 'i');

export const DEFAULT_MINUTES = 30;

/** Returns whole minutes, or null if the text isn't a positive duration. A bare number means minutes. */
export function parseDuration(s) {
  s = String(s).trim().toLowerCase().replace(/^\+\s*/, '');
  if (!s) return null;
  let m;
  if ((m = s.match(/^(\d+):(\d{1,2})$/))) return +m[1] * 60 + +m[2] || null;
  if ((m = s.match(/^(\d+(?:\.\d+)?)$/))) return Math.round(+m[1]) || null;
  m = s.match(/^(?:(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?)?\s*(?:(\d+)\s*(?:m(?:in(?:ute)?s?)?)?)?$/);
  if (!m || (m[1] == null && m[2] == null)) return null;
  const total = Math.round((+m[1] || 0) * 60 + (+m[2] || 0));
  return total > 0 ? total : null;
}

/** Splits "record vocals + 30m" into a name and minutes. Without a time, falls back to DEFAULT_MINUTES. */
export function parseQuick(text) {
  text = text.trim();
  const m = text.match(QUICK_RE);
  if (m) {
    const minutes = parseDuration(m[2]);
    const name = m[1].replace(/[\s+,\-–—:]+$/, '').trim();
    if (minutes && name) return { name, minutes, explicit: true };
  }
  return { name: text, minutes: DEFAULT_MINUTES, explicit: false };
}

export function fmt(min) {
  min = Math.round(min);
  if (min <= 0) return '0m';
  const h = Math.floor(min / 60), m = min % 60;
  if (!h) return m + 'm';
  return m ? `${h}h ${m}m` : `${h}h`;
}
