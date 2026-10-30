import { fold, likeTerms } from './text-search';

describe('fold', () => {
  it('lowercases and drops Spanish accents', () => {
    expect(fold('José Peña Ñandú Çé')).toBe('jose pena nandu ce');
    expect(fold('ÁÉÍÓÚÜ')).toBe('aeiouu');
  });
});

describe('likeTerms', () => {
  it('needs a minimum length', () => {
    expect(likeTerms(' j ')).toBeNull();
    expect(likeTerms('iph', 3)).toEqual({ term: '%iph%', numeric: null });
    expect(likeTerms('ip', 3)).toBeNull();
  });

  it('only treats digits and separators as a phone or IMEI', () => {
    expect(likeTerms('612 34-5')?.numeric).toBe('%612345%');
    expect(likeTerms('iPhone 13')?.numeric).toBeNull();
  });

  it('escapes LIKE wildcards', () => {
    expect(likeTerms('50%_x')?.term).toBe('%50\\%\\_x%');
  });
});
