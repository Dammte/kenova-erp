import { stockFill, stockLabel, type StockStatus } from "./inventory";
import styles from "./Inventory.module.css";

/** The stock with a bar and a word, so «bajo» never depends on colour alone. */
export function StockBadge({ part }: { part: { stock: number; minimalStock: number; status: StockStatus } }) {
  return (
    <span className={`${styles.badge} ${styles[part.status]}`}>
      <strong>{part.stock}</strong>
      <span className={styles.bar} aria-hidden>
        <span style={{ width: `${stockFill(part.stock, part.minimalStock)}%` }} />
      </span>
      <span className={styles.badgeText}>{stockLabel(part)}</span>
    </span>
  );
}
