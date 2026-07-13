// 가격 정책 (2026-07-13 확정, Polar 수수료 5%+$0.50/₩750, high 화질, ₩1,500/$1 기준 재계산)
// 근거는 가격 검토 아티팩트(pricing-ledger) 참고 — 여기는 실제 적용 값만 관리한다.

export const FREE_TIER_MAX_PAGES = 5

// 1회 결제 3단 구간가 — 각 구간 내 최댓값(가장 비싼 페이지 수) 원가 기준 51% 마진.
// 유료 구간은 24~50p(SweetBook 최소 인쇄 규격과 동일하게 맞춤). 무료 체험(5p)과 유료
// 구간(24p~) 사이(6~23p)는 상품으로 제공하지 않는다 — 사용자 스펙 그대로.
export const ONE_TIME_TIERS = [
  { id: 'tier_24_30', min: 24, max: 30, price: 10340, label: '24~30페이지' },
  { id: 'tier_31_40', min: 31, max: 40, price: 13640, label: '31~40페이지' },
  { id: 'tier_41_50', min: 41, max: 50, price: 16930, label: '41~50페이지' },
]

// 월 30권 구독 — 목표마진 49%, 평균 32p 가정. 헤비유저 마진 방어를 위해 30권과 960페이지
// 중 먼저 도달하는 쪽을 캡으로 적용한다(둘 중 하나만으로는 최대 사용자가 매번 50p로
// 채울 때 마진이 8%대까지 붕괴함 — 가격 검토 아티팩트 참고).
export const SUBSCRIPTION = {
  priceKrw: 295000,
  monthlyBookCap: 30,
  monthlyPageCap: 960,
}

// SweetBook 실물책 3단 구간가 — 목표마진 35%
export const PHYSICAL_TIERS = [
  { id: 'tier_24_30', min: 24, max: 30, price: 43800, label: '24~30페이지' },
  { id: 'tier_31_40', min: 31, max: 40, price: 48250, label: '31~40페이지' },
  { id: 'tier_41_50', min: 41, max: 50, price: 52700, label: '41~50페이지' },
]

// 무료 5p 체험 당일에 유료 전환 시 할인 (전환 유도)
export const SAME_DAY_DISCOUNT = {
  oneTime: 0.03,
  subscription: 0.10,
}

/**
 * 페이지 수로 1회 결제 구간을 찾는다. 무료 티어(5p 이하)는 null을 반환 —
 * 무료 자격 여부는 별도 로직(프로필의 free_trial_used/phone_verified)으로 판단해야 한다.
 */
export function getOneTimeTier(pageCount) {
  return ONE_TIME_TIERS.find((t) => pageCount >= t.min && pageCount <= t.max) || null
}

export function getPhysicalTier(pageCount) {
  return PHYSICAL_TIERS.find((t) => pageCount >= t.min && pageCount <= t.max) || null
}

/** 당일 전환 할인 적용가 (원 단위 반올림) */
export function applyDiscount(price, rate) {
  return Math.round(price * (1 - rate))
}
