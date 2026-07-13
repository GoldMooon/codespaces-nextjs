import { SUBSCRIPTION } from './pricingTiers'

/**
 * 구독자의 이번 달 사용량이 이중 캡(30권 AND 960페이지, 먼저 도달하는 쪽)을 넘었는지 확인한다.
 * 캡을 30권만 두면 헤비유저가 매번 50페이지로 채울 때 월 원가가 치솟아 마진이 8%대로
 * 붕괴하는 문제가 있어(가격 검토 아티팩트 참고), 페이지 총량도 함께 제한한다.
 * @returns {Promise<{ exceeded: boolean, message?: string }>}
 */
export async function checkSubscriptionCap(supabase, userId) {
  const startOfMonth = new Date()
  startOfMonth.setUTCDate(1)
  startOfMonth.setUTCHours(0, 0, 0, 0)

  const { data: booksThisMonth } = await supabase
    .from('books')
    .select('page_count')
    .eq('user_id', userId)
    .gte('created_at', startOfMonth.toISOString())

  const bookCount = booksThisMonth?.length || 0
  const pageTotal = (booksThisMonth || []).reduce((sum, b) => sum + (b.page_count || 0), 0)

  if (bookCount >= SUBSCRIPTION.monthlyBookCap) {
    return { exceeded: true, message: `이번 달 생성 가능한 동화책 수(${SUBSCRIPTION.monthlyBookCap}권)를 모두 사용하셨습니다. 다음 달에 다시 이용해주세요.` }
  }
  if (pageTotal >= SUBSCRIPTION.monthlyPageCap) {
    return { exceeded: true, message: `이번 달 생성 가능한 총 페이지 수(${SUBSCRIPTION.monthlyPageCap}페이지)를 모두 사용하셨습니다. 다음 달에 다시 이용해주세요.` }
  }
  return { exceeded: false }
}
