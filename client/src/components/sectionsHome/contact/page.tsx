import styles from "./page.module.css";

function ContactPage() {
  return (
    <section className={styles.contact}>
      <h1>¿Quieres contactarnos?</h1>
      <div className={styles.contactContent}>
        <div className={styles.contactMedia}>
          <h2>¡Contáctanos por estos medios!</h2>
          <p>Medios</p>
        </div>
        <div className={styles.contactMap}>Aquí irá el mapa del lugar.</div>
      </div>
    </section>
  );
}

export default ContactPage;
