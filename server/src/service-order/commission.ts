import { CommissionType } from '../stores/entities/store.entity';
import { toCents } from './payment-status';

export interface CommissionSnapshot {
  commissionType: CommissionType | null;
  commissionValue: string | null;
  commissionAmount: string | null;
}

export const NO_COMMISSION: CommissionSnapshot = {
  commissionType: null,
  commissionValue: null,
  commissionAmount: null,
};

/**
 * What a partner store earns for an order when it is delivered: a percentage
 * of what the customer paid, or a fixed amount per device. A warranty claim
 * earns nothing. The workshop, or a store without a commission, gets none.
 */
export function commissionFor(
  store: {
    isMain: boolean;
    commissionType: CommissionType | null;
    commissionValue: string | null;
  },
  order: { amountPaid?: number | string | null; warrantyOfId?: string | null },
): CommissionSnapshot {
  if (store.isMain || !store.commissionType || store.commissionValue === null) {
    return NO_COMMISSION;
  }
  let cents = 0;
  if (!order.warrantyOfId) {
    cents =
      store.commissionType === CommissionType.PERCENT
        ? Math.round(
            (toCents(order.amountPaid) * Number(store.commissionValue)) / 100,
          )
        : toCents(store.commissionValue);
  }
  return {
    commissionType: store.commissionType,
    commissionValue: store.commissionValue,
    commissionAmount: (cents / 100).toFixed(2),
  };
}
