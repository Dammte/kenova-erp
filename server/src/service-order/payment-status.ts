import { PaymentStatus } from './entities/service-order.entity';

/** Payment status is always derived from the amounts, never taken from the request. */
export function derivePayment(totalPrice: number, amountPaid: number) {
  const paymentStatus =
    totalPrice > 0 && amountPaid >= totalPrice
      ? PaymentStatus.PAID
      : amountPaid > 0
        ? PaymentStatus.PAID_PARTIAL
        : PaymentStatus.PENDING;
  return {
    balance: Number((totalPrice - amountPaid).toFixed(2)),
    paymentStatus,
  };
}

/** Euros (number or decimal string) to whole cents, so sums never drift. */
export function toCents(value: number | string | null | undefined): number {
  return Math.round(Number(value ?? 0) * 100);
}
