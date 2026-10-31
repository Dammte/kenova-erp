import { euroNumber, invoiceFileType, parseInvoice } from './invoice-reader';

describe('invoice reader', () => {
  it('tells the file type by its bytes', () => {
    expect(invoiceFileType(Buffer.from('%PDF-1.7 ...'))).toBe(
      'application/pdf',
    );
    expect(invoiceFileType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe(
      'image/jpeg',
    );
    expect(
      invoiceFileType(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]),
      ),
    ).toBe('image/png');
    expect(invoiceFileType(Buffer.from('<html>'))).toBeNull();
  });

  it('reads European and plain numbers', () => {
    expect(euroNumber('1.234,56')).toBe(1234.56);
    expect(euroNumber('18,50 €')).toBe(18.5);
    expect(euroNumber(7.4)).toBe(7.4);
    expect(euroNumber('diez')).toBeNaN();
  });

  it('keeps the head and the readable lines, and drops the rest', () => {
    const read = parseInvoice(
      '```json\n' +
        JSON.stringify({
          provider: ' MovilParts S.L. ',
          number: 'F-2026-1184',
          date: '2026-10-27',
          lines: [
            {
              description: 'BATERIA IPHONE 13  3240MAH',
              ref: 'MP-88213',
              quantity: 5,
              unitCost: '18,50',
            },
            {
              description: 'ADHESIVO UNIV',
              ref: null,
              quantity: '10',
              unitCost: 0.9,
            },
            { description: '', quantity: 1, unitCost: 1 },
            { description: 'Sin precio', quantity: 1, unitCost: 'gratis' },
            { description: 'Cero unidades', quantity: 0, unitCost: 1 },
          ],
        }) +
        '\n```',
    );
    expect(read).toEqual({
      provider: 'MovilParts S.L.',
      number: 'F-2026-1184',
      invoiceDate: '2026-10-27',
      lines: [
        {
          description: 'BATERIA IPHONE 13 3240MAH',
          ref: 'MP-88213',
          quantity: 5,
          unitCost: '18.5',
        },
        {
          description: 'ADHESIVO UNIV',
          ref: null,
          quantity: 10,
          unitCost: '0.9',
        },
      ],
    });
  });

  it('accepts a bare list of lines and refuses what is not JSON', () => {
    expect(
      parseInvoice('[{"name":"Pantalla","quantity":1,"unitPrice":72}]'),
    ).toEqual({
      provider: null,
      number: null,
      invoiceDate: null,
      lines: [
        { description: 'Pantalla', ref: null, quantity: 1, unitCost: '72' },
      ],
    });
    expect(parseInvoice('No puedo leer esto')).toBeNull();
    expect(parseInvoice('{"date":"27/10/2026","lines":[]}')).toMatchObject({
      invoiceDate: null,
      lines: [],
    });
  });
});
