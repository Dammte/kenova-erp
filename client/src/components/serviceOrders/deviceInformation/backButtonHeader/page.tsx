import styles from '../page.module.css';

export default function BackButtonHeader({ title, onBack }) {
  return (
    <div className={styles.sectionHeader}>
      <button 
        onClick={onBack} 
        className={styles.backButton}
      >
        ← Volver
      </button>
      <h2 className={styles.sectionTitle}>{title}</h2>
    </div>
  );
}