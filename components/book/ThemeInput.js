import styles from '../../styles/components/ThemeInput.module.css'
import Input, { Textarea } from '../ui/Input'
import { FREE_TIER_MAX_PAGES, ONE_TIME_TIERS, getOneTimeTier, SAME_DAY_DISCOUNT, applyDiscount } from '../../lib/pricingTiers'

const PAID_MIN = ONE_TIME_TIERS[0].min
const PAID_MAX = ONE_TIME_TIERS[ONE_TIME_TIERS.length - 1].max

export default function ThemeInput({
  title, setTitle, theme, setTheme, characterNames, setCharacterNames,
  pageCount, setPageCount, freeEligible, isPremium, sameDayDiscountEligible,
}) {
  const isFreeMode = pageCount === FREE_TIER_MAX_PAGES
  const tier = getOneTimeTier(pageCount)

  const priceLabel = (() => {
    if (isPremium) return '구독 중 — 추가 결제 없이 생성돼요'
    if (isFreeMode) return freeEligible ? '무료 체험' : '무료 체험은 이미 사용하셨어요'
    if (!tier) return ''
    if (sameDayDiscountEligible) {
      const discounted = applyDiscount(tier.price, SAME_DAY_DISCOUNT.oneTime)
      return `₩${discounted.toLocaleString()} (오늘 전환 3% 할인 적용)`
    }
    return `₩${tier.price.toLocaleString()}`
  })()

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

      <Input
        label="등장인물 이름 (선택사항)"
        placeholder="예: 토리, 폭시 (쉼표로 구분, 비워두면 AI가 어울리는 이름을 지어드려요)"
        value={characterNames}
        onChange={(e) => setCharacterNames(e.target.value)}
      />

      {!isPremium && (
        <div className={styles.modeToggle}>
          <button
            type="button"
            className={`${styles.modeButton} ${isFreeMode ? styles.modeButtonActive : ''}`}
            disabled={!freeEligible}
            onClick={() => setPageCount(FREE_TIER_MAX_PAGES)}
          >
            🎁 무료로 체험하기 (5페이지)
          </button>
          <button
            type="button"
            className={`${styles.modeButton} ${!isFreeMode ? styles.modeButtonActive : ''}`}
            onClick={() => setPageCount(PAID_MIN)}
          >
            📖 정식 제작 (24~50페이지)
          </button>
        </div>
      )}

      {(!isFreeMode || isPremium) && (
        <div className={styles.sliderContainer}>
          <label className={styles.label}>
            페이지 수: <strong>{pageCount}장</strong>
          </label>
          <input
            type="range"
            min={PAID_MIN}
            max={PAID_MAX}
            step="2"
            value={pageCount}
            onChange={(e) => setPageCount(parseInt(e.target.value))}
            className={styles.slider}
          />
          <div className={styles.sliderLabels}>
            <span>{PAID_MIN}장</span>
            <span>{PAID_MAX}장</span>
          </div>
        </div>
      )}

      {priceLabel && <p className={styles.priceHint}>{priceLabel}</p>}
    </div>
  )
}
