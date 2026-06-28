import styles from '../../styles/components/GenerationProgress.module.css'
import LoadingSpinner from '../ui/LoadingSpinner'

const STEPS = [
  { id: 'text', label: '동화책 텍스트 작성 중' },
  { id: 'cover', label: '표지 이미지 생성 중' },
  { id: 'pages', label: '페이지 이미지 생성 중' },
  { id: 'complete', label: '완료!' },
]

export default function GenerationProgress({ currentStep }) {
  const currentIndex = STEPS.findIndex(s => s.id === currentStep)

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>동화책을 만들고 있어요 ✨</h3>

      <div className={styles.steps}>
        {STEPS.map((step, index) => (
          <div
            key={step.id}
            className={`${styles.step} ${
              index < currentIndex ? styles.completed :
              index === currentIndex ? styles.active :
              ''
            }`}
          >
            <div className={styles.stepIcon}>
              {index < currentIndex ? '✓' :
               index === currentIndex ? <LoadingSpinner size="small" /> :
               index + 1}
            </div>
            <span className={styles.stepLabel}>{step.label}</span>
          </div>
        ))}
      </div>

      <p className={styles.hint}>
        {currentStep === 'text' && 'AI가 동화책 내용을 작성하고 있어요...'}
        {currentStep === 'cover' && '표지 이미지를 그려보고 있어요...'}
        {currentStep === 'pages' && '각 페이지에 그림을 그려보고 있어요...'}
        {currentStep === 'complete' && '동화책이 완성되었어요! 🎉'}
      </p>
    </div>
  )
}