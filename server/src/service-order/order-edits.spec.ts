import { describeEdits, describeLineEdits } from './order-edits';
import { Priority } from './entities/service-order.entity';

describe('describeEdits', () => {
  it('names each changed field with its old and new value', () => {
    expect(
      describeEdits(
        { priority: Priority.MEDIUM, accessories: null, faultNotes: 'x' },
        { priority: Priority.URGENT, accessories: 'Funda', faultNotes: 'x' },
      ),
    ).toBe('Edición · Prioridad: Media → Urgente · Accesorios: vacío → Funda');
  });

  it('ignores the order of the faults, empty texts and fields not sent', () => {
    expect(
      describeEdits(
        { reportedFaults: ['battery', 'camera'], observations: null },
        { reportedFaults: ['camera', 'battery'], observations: '' },
      ),
    ).toBeNull();
    expect(describeEdits({ priority: Priority.HIGH }, {})).toBeNull();
  });

  it('shortens a long text', () => {
    const long = 'a'.repeat(80);
    expect(describeEdits({ faultNotes: null }, { faultNotes: long })).toBe(
      `Edición · Detalle de la avería: vacío → ${'a'.repeat(59)}…`,
    );
  });
});

describe('describeLineEdits', () => {
  const l = (description: string, cents: number, quantity = 1) => ({
    description,
    cents,
    quantity,
  });

  it('says what was added, removed or repriced, and the total', () => {
    expect(
      describeLineEdits(
        [l('Pantalla', 14900), l('Ajuste', -1000)],
        [l('Pantalla', 13900), l('Funda', 900, 2)],
        13900,
        15700,
      ),
    ).toBe(
      'Edición · Servicios: Pantalla 149,00 € → 139,00 € · + Funda × 2 · − Ajuste · Total: 139,00 € → 157,00 €',
    );
  });

  it('is null when nothing changed', () => {
    expect(
      describeLineEdits([l('Pantalla', 100)], [l('Pantalla', 100)], 100, 100),
    ).toBeNull();
  });
});
