import type { ReactNode } from "react";
import styles from "./AuthLayout.module.css";

export { styles as authStyles };

interface Props {
  title: string;
  /** One line under the title saying what the screen is for. */
  lead?: string;
  children: ReactNode;
}

/** Design 3.7: the Kenova brand over one card, for every access screen. */
export function AuthLayout({ title, lead, children }: Props) {
  return (
    <main className={styles.page}>
      <div className={styles.column}>
        <div className={styles.brand}>Kenova</div>
        <AuthCard title={title} lead={lead}>
          {children}
        </AuthCard>
      </div>
    </main>
  );
}

/** The card alone, for an access screen shown inside the app. */
export function AuthCard({ title, lead, children, className }: Props & { className?: string }) {
  return (
    <section className={[styles.card, className].filter(Boolean).join(" ")}>
      <h1 className={styles.title}>{title}</h1>
      {lead && <p className={styles.lead}>{lead}</p>}
      {children}
    </section>
  );
}
