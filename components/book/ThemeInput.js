import styles from '../../styles/components/ThemeInput.module.css'
import Input, { Textarea } from '../ui/Input'

export default function ThemeInput({ title, setTitle, theme, setTheme, pageCount, setPageCount }) {
  return (
    <div className={styles.container}>
      <Input
        label="동화책 제목"
        placeholder="예: 곰돌이의 모험"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
      />

      <Textarea
        label="동화책 내용/주제"
        placeholder="어떤 이야기를 만들어드릴까요?&#10;예: 용감한 곰돌이가 숲에서 새로운 친구를 찾아 모험하는 이야기"
        value={theme}
        onChange={(e) => setTheme(e.target.value)}
        rows={4}
        required
      />

      <div className={styles.sliderContainer}>
        <label className={styles.label}>
          페이지 수: <strong>{pageCount}장</strong>
        </label>
        <input
          type="range"
          min="5"
          max="20"
          value={pageCount}
          onChange={(e) => setPageCount(parseInt(e.target.value))}
          className={styles.slider}
        />
        <div className={styles.sliderLabels}>
          <span>5장</span>
          <span>20장</span>
        </div>
      </div>
    </div>
  )
}