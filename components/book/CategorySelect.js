import { useState } from 'react'
import { CATEGORIES } from '../../lib/openai'
import styles from '../../styles/components/CategorySelect.module.css'

export default function CategorySelect({ value, onChange }) {
  return (
    <div className={styles.container}>
      <label className={styles.label}>카테고리 선택</label>
      <div className={styles.grid}>
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            className={`${styles.card} ${value === cat.id ? styles.selected : ''}`}
            onClick={() => onChange(cat.id)}
          >
            <span className={styles.emoji}>{cat.emoji}</span>
            <span className={styles.name}>{cat.name.replace(/^[^\s]+\s/, '')}</span>
            <span className={styles.description}>{cat.description}</span>
          </button>
        ))}
      </div>
    </div>
  )
}