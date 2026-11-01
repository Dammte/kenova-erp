import type { ReactNode } from "react";
import styles from "./ErrorScreen.module.css";

export { styles as errorStyles };

interface Props {
  /** Short label above the title, e.g. «Página no encontrada». */
  eyebrow: string;
  title: string;
  lead: ReactNode;
  children?: ReactNode;
  actions: ReactNode;
}

/** Design 4: the frame shared by the 404 and «Algo ha fallado» screens. */
export function ErrorScreen({ eyebrow, title, lead, children, actions }: Props) {
  return (
    <div className={styles.screen}>
      <section className={styles.card} aria-labelledby="error-title">
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h1 id="error-title" className={styles.title}>
          {title}
        </h1>
        <p className={styles.lead}>{lead}</p>
        {children}
        <div className={styles.actions}>{actions}</div>
      </section>
    </div>
  );
}
