import styles from "../page.module.css";

export default function ProgressBar({ currentStep, steps }) {
  return (
    <div className={styles.progressWrapper}>
      <div className={styles.progressLabels}>
        {steps.map((step, index) => (
          <div
            key={index}
            className={`${styles.progressLabel} ${currentStep >= index ? styles.progressLabelActive : styles.progressLabelInactive}`}
          >
            {step}
          </div>
        ))}
      </div>
      <div className={styles.progressBar}>
        <div
          className={styles.progressIndicator}
          style={{ width: `${(currentStep / (steps.length - 1)) * 100}%` }}
        ></div>
      </div>
    </div>
  );
}
