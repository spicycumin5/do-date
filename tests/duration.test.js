import { describe, it, expect } from 'vitest';
import { parseDuration, parseQuick, fmt, DEFAULT_MINUTES } from '../src/lib/duration.js';

describe('parseDuration', () => {
  it.each([
    ['30m', 30], ['1h', 60], ['1h30', 90], ['1h 30m', 90], ['1.5h', 90], ['90', 90],
    ['1:30', 90], ['2 hours', 120], ['45 minutes', 45], ['1 hour 15 min', 75], ['+ 20m', 20], ['2hrs', 120],
  ])('%s -> %i', (input, minutes) => {
    expect(parseDuration(input)).toBe(minutes);
  });

  it.each(['', 'abc', '0m', '0', 'h', 'soon'])('rejects %j', input => {
    expect(parseDuration(input)).toBeNull();
  });
});

describe('parseQuick', () => {
  it('splits a trailing time off the name', () => {
    expect(parseQuick('record vocals 30m')).toEqual({ name: 'record vocals', minutes: 30, explicit: true });
    expect(parseQuick('mix instruments + 1 hour')).toEqual({ name: 'mix instruments', minutes: 60, explicit: true });
    expect(parseQuick('demo 1h30')).toEqual({ name: 'demo', minutes: 90, explicit: true });
  });

  it('keeps numbers that are part of the name', () => {
    expect(parseQuick('track 2 mix 2h')).toEqual({ name: 'track 2 mix', minutes: 120, explicit: true });
  });

  it('falls back to the default time when none is given', () => {
    expect(parseQuick('write chorus')).toEqual({ name: 'write chorus', minutes: DEFAULT_MINUTES, explicit: false });
  });
});

describe('fmt', () => {
  it.each([[0, '0m'], [45, '45m'], [60, '1h'], [90, '1h 30m'], [149.6, '2h 30m']])('%d -> %s', (min, out) => {
    expect(fmt(min)).toBe(out);
  });
});
