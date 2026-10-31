import { averageCost, matchLine, similarity, words } from './invoice-match';

const PARTS = [
  { id: 'p1', sku: 'BAT-IP13', name: 'Batería iPhone 13', model: 'iPhone 13' },
  { id: 'p2', sku: 'BAT-IP12', name: 'Batería iPhone 12', model: 'iPhone 12' },
  {
    id: 'p3',
    sku: 'BAT-SGA54',
    name: 'Batería Galaxy A54',
    model: 'Galaxy A54',
  },
  { id: 'p4', sku: 'ADH-UNIV-01', name: 'Adhesivo de pantalla', model: null },
];

describe('invoice matching', () => {
  it('reads supplier abbreviations as the same words', () => {
    expect(words('BAT IP13 3240MAH')).toEqual([
      'bateria',
      'iphone',
      '13',
      '3240mah',
    ]);
    expect(words('Batería iPhone 13')).toEqual(['bateria', 'iphone', '13']);
  });

  it('scores alike names high and other model numbers low', () => {
    expect(
      similarity('BATERIA IPHONE 13 3240MAH', 'Batería iPhone 13'),
    ).toBeGreaterThan(0.8);
    expect(
      similarity('BATERIA IPHONE 13 3240MAH', 'Batería iPhone 12'),
    ).toBeLessThan(0.5);
    expect(similarity('FLEX BOTON HOME IPAD 9', 'Batería Galaxy A54')).toBe(0);
  });

  it('matches only what is certain and asks about the rest', () => {
    const remembered = new Map([['rn-5541', 'p3']]);
    expect(
      matchLine({ description: 'X', ref: 'RN-5541' }, PARTS, remembered),
    ).toMatchObject({
      kind: 'match',
      part: { id: 'p3' },
      reason: 'ref',
    });
    expect(
      matchLine({ description: 'Bateria', ref: 'bat-ip12' }, PARTS, new Map()),
    ).toMatchObject({
      kind: 'match',
      reason: 'sku',
    });
    expect(
      matchLine({ description: 'BATERIA IPHONE 13' }, PARTS, new Map()),
    ).toMatchObject({
      kind: 'match',
      part: { id: 'p1' },
      reason: 'name',
    });
    expect(
      matchLine({ description: 'BAT SAMSUNG A54 EB-BA546' }, PARTS, new Map()),
    ).toMatchObject({
      kind: 'similar',
      part: { id: 'p3' },
    });
    expect(
      matchLine({ description: 'FLEX BOTON HOME IPAD 9' }, PARTS, new Map()),
    ).toEqual({ kind: 'new' });
  });

  it('averages the cost by units, and a part without stock takes the new cost', () => {
    expect(averageCost(2, '18.5', 5, '20')).toBe('19.5714');
    expect(averageCost(0, '18.5', 5, '20')).toBe('20.0000');
    expect(averageCost(-1, '18.5', 1, '20')).toBe('20.0000');
    expect(averageCost(3, null, 1, '7.4')).toBe('7.4000');
  });
});
