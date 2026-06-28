import styles from '../../styles/components/LoadingSpinner.module.css'

export default function LoadingSpinner({ size = 'medium', text = '' }) {
  return (
    <div className={styles.wrapper}>
      <div className={`${styles.spinner} ${styles[size]}`} />
      {text && <p className={styles.text}>{text}</p>}
    </div>
  )
}

export function LoadingOverlay({ text = '로딩 중...' }) {
  return (
    <div className={styles.overlay}>
      <div className={styles.overlayContent}>
        <div className={styles.spinnerLarge} />
        <p className={styles.overlayText}>{text}</p>
      </div>
    </div>
  )
}
