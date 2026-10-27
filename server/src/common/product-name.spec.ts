import { normalizeProductName } from './product-name';

describe('normalizeProductName', () => {
  it('title-cases all-lowercase input', () => {
    expect(normalizeProductName('galaxy s23')).toBe('Galaxy S23');
    expect(normalizeProductName('redmi note-12')).toBe('Redmi Note-12');
  });

  it('keeps the casing the user typed', () => {
    expect(normalizeProductName('iPhone 13')).toBe('iPhone 13');
    expect(normalizeProductName('POCO F5')).toBe('POCO F5');
    expect(normalizeProductName('OnePlus')).toBe('OnePlus');
  });

  it('trims and collapses whitespace', () => {
    expect(normalizeProductName('  iPad   Air ')).toBe('iPad Air');
    expect(normalizeProductName(' xiaomi ')).toBe('Xiaomi');
  });
});
