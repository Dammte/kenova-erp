import { EntityManager } from 'typeorm';

export interface StoreCredit {
  storeId: string;
  storeName: string;
  /** Euros, as text with two decimals. */
  balance: string;
}

/**
 * Saldo a favor: money of a client kept by a store instead of being handed
 * back. It is not stored anywhere else: a refund paid "to credit" adds to it
 * and a charge paid "with credit" takes from it, so it always matches the
 * payments. Each store only spends what it holds. Returns the stores where
 * the balance is not zero, or only `storeId` when given.
 */
export function creditByStore(
  m: EntityManager,
  clientId: string,
  storeId: string | null,
): Promise<StoreCredit[]> {
  return m.query(
    `SELECT s.id AS "storeId", s.name AS "storeName",
            sum(CASE p.kind WHEN 'refund' THEN p.amount ELSE -p.amount END)::numeric(12,2)::text AS balance
       FROM order_payments p
       JOIN service_orders o ON o.id = p."orderId"
       JOIN stores s ON s.id = p."storeId"
      WHERE p.method = 'credit' AND o."clientId" = $1
        AND ($2::uuid IS NULL OR p."storeId" = $2)
      GROUP BY s.id, s.name
     HAVING sum(CASE p.kind WHEN 'refund' THEN p.amount ELSE -p.amount END) <> 0
      ORDER BY s.name`,
    [clientId, storeId],
  );
}
