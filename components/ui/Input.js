import { forwardRef } from 'react'
import styles from '../../styles/components/Input.module.css'

const Input = forwardRef(({
  label,
  error,
  type = 'text',
  placeholder,
  value,
  onChange,
  onBlur,
  disabled = false,
  required = false,
  className = '',
  ...props
}, ref) => {
  return (
    <div className={`${styles.wrapper} ${className}`}>
      {label && (
        <label className={styles.label}>
          {label}
          {required && <span className={styles.required}>*</span>}
        </label>
      )}
      <input
        ref={ref}
        type={type}
        className={`${styles.input} ${error ? styles.inputError : ''}`}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        disabled={disabled}
        required={required}
        {...props}
      />
      {error && <span className={styles.error}>{error}</span>}
    </div>
  )
})

Input.displayName = 'Input'

export default Input

export function Textarea({
  label,
  error,
  placeholder,
  value,
  onChange,
  onBlur,
  disabled = false,
  required = false,
  rows = 4,
  className = '',
  ...props
}) {
  return (
    <div className={`${styles.wrapper} ${className}`}>
      {label && (
        <label className={styles.label}>
          {label}
          {required && <span className={styles.required}>*</span>}
        </label>
      )}
      <textarea
        className={`${styles.input} ${styles.textarea} ${error ? styles.inputError : ''}`}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        disabled={disabled}
        required={required}
        rows={rows}
        {...props}
      />
      {error && <span className={styles.error}>{error}</span>}
    </div>
  )
}
