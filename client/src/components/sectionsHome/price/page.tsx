import styles from "./page.module.css";

function PricesPage() {
  return (
    <section className={styles.prices}>
      <h1>¿Quieres saber nuestros precios?</h1>
      <div className={styles.cardPrices}>
        <div className={styles.cardContent}>
          <h2>FREE</h2>
          <p>Contexto</p>
        </div>
        <div className={styles.cardContent}>
          <h2>NORMAL</h2>
          <p>Contexto</p>
        </div>
        <div className={styles.cardContent}>
          <h2>PREMIUM</h2>
          <p>Contexto</p>
        </div>
      </div>
    </section>
  );
}

export default PricesPage;
