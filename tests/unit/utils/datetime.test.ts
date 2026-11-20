import { describe, expect, it } from 'vitest';
import { inclusiveDays, isValidDateString } from '@/lib/datetime';

describe('date utilities', () => {
  it('counts leave days inclusively and validates calendar dates', () => {
    expect(inclusiveDays(new Date('2026-03-10T00:00:00Z'), new Date('2026-03-12T00:00:00Z'))).toBe(3);
    expect(isValidDateString('2026-02-28')).toBe(true);
    expect(isValidDateString('2026-02-30')).toBe(false);
  });
});
