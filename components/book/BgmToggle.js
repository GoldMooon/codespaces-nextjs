import styles from '../../styles/components/BgmToggle.module.css'

// 순수 표시용 버튼 — 재생 상태와 토글 핸들러는 BookViewer가 들고 있다.
// (표지/본문 페이지를 넘나들 때 이 컴포넌트 자체는 다시 그려져도 음악은
// 끊기지 않아야 하므로, 실제 재생 상태를 부모에 둔다.)
export default function BgmToggle({ playing, onToggle }) {
  return (
    <button
      type="button"
      className={`${styles.badge} ${playing ? styles.active : ''}`}
      onClick={onToggle}
      aria-label={playing ? '배경음악 끄기' : '배경음악 켜기'}
      title={playing ? '배경음악 끄기' : '배경음악 켜기'}
    >
      {playing ? '🔊' : '🔈'}
    </button>
  )
}
