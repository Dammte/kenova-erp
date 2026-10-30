import { fold } from './search.service';

describe('fold', () => {
  it('lowercases and drops Spanish accents', () => {
    expect(fold('José Peña Ñandú Çé')).toBe('jose pena nandu ce');
    expect(fold('ÁÉÍÓÚÜ')).toBe('aeiouu');
  });
});
