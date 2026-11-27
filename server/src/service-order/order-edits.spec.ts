import { describeEdits } from './order-edits';
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
