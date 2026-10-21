import { describe, it, expect } from 'vitest';
import { findWords } from './match';

describe('findWords', () => {
  it('finds whole-word occurrences with their offsets', () => {
    expect(findWords('Chase and Chase Bank', 'Chase', true)).toEqual([
      { index: 0, end: 5 },
      { index: 10, end: 15 },
    ]);
  });
  it('never matches inside a longer word', () => {
    expect(findWords('Thanks for your purchase', 'chase')).toEqual([]);
    expect(findWords('AppleCare', 'Apple', true)).toEqual([]);
  });
  it('matches a name ending in punctuation before a space, where \\b would fail', () => {
    expect(findWords('Call the I.R.S. today', 'I.R.S.')).toEqual([{ index: 9, end: 15 }]);
  });
  it('is case-insensitive by default and exact when asked', () => {
    expect(findWords('call MICROSOFT support', 'Microsoft')).toHaveLength(1);
    expect(findWords('ups and downs', 'UPS', true)).toEqual([]);
  });
});
