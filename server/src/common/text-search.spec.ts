import { everyWordSql, fold, likeTerms } from './text-search';

describe('fold', () => {
  it('lowercases and drops Spanish accents', () => {
    expect(fold('José Peña Ñandú Çé')).toBe('jose pena nandu ce');
    expect(fold('ÁÉÍÓÚÜ')).toBe('aeiouu');
  });
});

describe('likeTerms', () => {
  it('needs a minimum length', () => {
    expect(likeTerms(' j ')).toBeNull();
    expect(likeTerms('iph', 3)).toEqual({
      term: '%iph%',
      numeric: null,
      words: ['%iph%'],
    });
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

describe('every word, in any order', () => {
  it('folds, dedupes and caps the words', () => {
    expect(likeTerms('  Lucía   iPhone lucia ')?.words).toEqual([
      '%lucia%',
      '%iphone%',
    ]);
    expect(likeTerms('a b c d e f g')?.words).toHaveLength(5);
  });

  it('asks each word to be in one of the fields', () => {
    expect(everyWordSql(['n', 'm'], ['%a%', '%b%'])).toEqual({
      sql: '((n LIKE :word0 OR m LIKE :word0) AND (n LIKE :word1 OR m LIKE :word1))',
      params: { word0: '%a%', word1: '%b%' },
    });
  });
});
