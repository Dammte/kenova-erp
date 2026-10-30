import { isValidCif } from './cif';

describe('isValidCif', () => {
  it.each(['B09123456', 'b09123456', 'A58818501', 'Q2826000H', 'P0800000B'])(
    'accepts %s',
    (cif) => expect(isValidCif(cif)).toBe(true),
  );

  it.each(['B09123457', 'B0912345', '12345678Z', 'I09123456', ''])(
    'rejects %s',
    (cif) => expect(isValidCif(cif)).toBe(false),
  );
});
