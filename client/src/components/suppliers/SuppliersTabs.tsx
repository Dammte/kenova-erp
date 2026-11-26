import Link from "next/link";
import styles from "./Suppliers.module.css";

/**
 * Design R3 3.6: one «Proveedores» section with two tabs. «Pedidos» first
 * (daily use: what was bought and what is still to arrive), then the
 * suppliers' directory with their data and web connection.
 */
export function SuppliersTabs({
  current,
  pending,
  suppliers,
}: {
  current: "pedidos" | "directorio";
  /** Orders waiting to be received, when known. */
  pending?: number;
  /** Suppliers in the directory, when known. */
  suppliers?: number;
}) {
  const tab = (key: typeof current, href: string, label: string, count?: number) => (
    <Link href={href} className={styles.tab} aria-current={current === key ? "page" : undefined}>
      {label}
      {count !== undefined && count > 0 && <span className={styles.tabCount}>{count}</span>}
    </Link>
  );
  return (
    <nav className={styles.tabs} aria-label="Proveedores">
      {tab("pedidos", "/proveedores/pedidos", "Pedidos", pending)}
      {tab("directorio", "/proveedores", "Proveedores", suppliers)}
    </nav>
  );
}
