import { CommissionType } from '../stores/entities/store.entity';
import { commissionFor, NO_COMMISSION } from './commission';

const store = (type: CommissionType | null, value: string | null) => ({
  isMain: false,
  commissionType: type,
  commissionValue: value,
});

describe('commissionFor', () => {
  it('takes the percentage of what the customer paid', () => {
    expect(
      commissionFor(store(CommissionType.PERCENT, '15.00'), {
        amountPaid: '129.00',
      }),
    ).toEqual({
      commissionType: 'percent',
      commissionValue: '15.00',
      commissionAmount: '19.35',
    });
  });

  it('rounds to the cent', () => {
    expect(
      commissionFor(store(CommissionType.PERCENT, '12.50'), {
        amountPaid: 59.99,
      }).commissionAmount,
    ).toBe('7.50');
  });

  it('pays a fixed amount per device, whatever was charged', () => {
    expect(
      commissionFor(store(CommissionType.FIXED, '8.00'), { amountPaid: 0 })
        .commissionAmount,
    ).toBe('8.00');
  });

  it('a warranty claim earns nothing', () => {
    expect(
      commissionFor(store(CommissionType.FIXED, '8.00'), {
        amountPaid: 0,
        warrantyOfId: 'x',
      }).commissionAmount,
    ).toBe('0.00');
  });

  it('the workshop and stores without commission get none', () => {
    expect(
      commissionFor(
        { ...store(CommissionType.PERCENT, '15.00'), isMain: true },
        { amountPaid: 100 },
      ),
    ).toEqual(NO_COMMISSION);
    expect(commissionFor(store(null, null), { amountPaid: 100 })).toEqual(
      NO_COMMISSION,
    );
  });
});
