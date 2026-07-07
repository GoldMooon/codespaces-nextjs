import { AGE_GROUPS } from '../../lib/openai'
import styles from '../../styles/components/CategorySelect.module.css'

export default function AgeGroupSelect({ value, onChange }) {
  return (
    <div className={styles.container}>
      <label className={styles.label}>독자 연령대 선택</label>
      <div className={styles.grid}>
        {AGE_GROUPS.map((group) => (
          <button
            key={group.id}
            type="button"
            className={`${styles.card} ${value === group.id ? styles.selected : ''}`}
            onClick={() => onChange(group.id)}
          >
            <span className={styles.emoji}>{group.emoji}</span>
            <span className={styles.name}>{group.name}</span>
            <span className={styles.description}>{group.description}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
