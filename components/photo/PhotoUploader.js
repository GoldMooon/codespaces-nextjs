import { useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import styles from '../../styles/components/PhotoUploader.module.css'

export default function PhotoUploader({ onFileSelect, accept = 'image/*', maxFiles = 1 }) {
  const onDrop = useCallback((acceptedFiles) => {
    if (acceptedFiles.length > 0) {
      onFileSelect(acceptedFiles[0])
    }
  }, [onFileSelect])

  const { getRootProps, getInputProps, isDragActive, acceptedFiles } = useDropzone({
    onDrop,
    accept,
    maxFiles,
    maxSize: 10 * 1024 * 1024, // 10MB
  })

  const preview = acceptedFiles[0] ? URL.createObjectURL(acceptedFiles[0]) : null

  return (
    <div
      {...getRootProps()}
      className={`${styles.dropzone} ${isDragActive ? styles.active : ''}`}
    >
      <input {...getInputProps()} />

      {preview ? (
        <div className={styles.preview}>
          <img src={preview} alt="Preview" className={styles.image} />
          <p className={styles.hint}>클릭하여 다른 사진 선택</p>
        </div>
      ) : (
        <div className={styles.placeholder}>
          <p className={styles.icon}>📷</p>
          <p className={styles.title}>
            {isDragActive ? '여기에 놓으세요!' : '사진을 드래그하거나 클릭하여 선택'}
          </p>
          <p className={styles.subtitle}>
            JPG, PNG 파일 (최대 10MB)
          </p>
        </div>
      )}
    </div>
  )
}
