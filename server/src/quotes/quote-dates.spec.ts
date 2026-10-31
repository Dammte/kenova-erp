import { addDays, todayInSpain } from './quote-dates';

describe('quote dates', () => {
  it('takes the day in Spain, not in UTC', () => {
    // 23:30 UTC on 31 October is already 1 November in Madrid (CET, +1).
    expect(todayInSpain(new Date('2026-10-31T23:30:00Z'))).toBe('2026-11-01');
    expect(todayInSpain(new Date('2026-10-31T10:00:00Z'))).toBe('2026-10-31');
  });

  it('adds days across months and years', () => {
    expect(addDays('2026-10-28', 30)).toBe('2026-11-27');
    expect(addDays('2026-12-15', 30)).toBe('2027-01-14');
  });
});
