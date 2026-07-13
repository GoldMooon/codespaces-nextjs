import { createServerSupabase } from '../../../lib/supabase'
import { createOpenAI, AGE_GROUPS, moderateContent } from '../../../lib/openai'
import { createBookAndStartImages } from '../../../lib/bookCreation'
import { createCheckoutSession } from '../../../lib/polar'
import { checkSubscriptionCap } from '../../../lib/subscriptionCap'
import { getOneTimeTier, FREE_TIER_MAX_PAGES, SAME_DAY_DISCOUNT, applyDiscount } from '../../../lib/pricingTiers'

// 텍스트는 동기 생성하고, 이미지는 Responses API의 background 모드로 전부 "시작"만 시킨 뒤
// (완료는 웹훅/폴백폴링이 비동기로 처리) 응답한다. 텍스트 생성(추론 모델, 최대 ~58초 실측)
// + 최대 51개(50페이지+표지) 이미지 작업 시작(각 ~2초, 청크 병렬)까지 감안해 넉넉히 잡음.
export const config = {
  maxDuration: 120,
}

function wasUsedToday(timestamp) {
  if (!timestamp) return false
  const used = new Date(timestamp)
  const now = new Date()
  return used.toDateString() === now.toDateString()
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // 1. 인증 확인
    const authHeader = req.headers.authorization
    if (!authHeader) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const token = authHeader.replace('Bearer ', '')
    const supabase = createServerSupabase()

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid token' })
    }

    // 2. 프로필 조회 — "만들기 클릭 시 즉시결제" 방식(2026-07-13 전환): 사전구매 크레딧 대신
    //    구독 여부/무료체험 자격/1회 결제 필요 여부를 여기서 판단한다.
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_premium, free_trial_used_at, phone_verified')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return res.status(400).json({ error: 'Profile not found' })
    }

    // 3. 요청 데이터 파싱 (사진은 선택사항 — characterPhotoUrl 존재 여부로 사진 기반 여부를 판단)
    const { title, category, theme, characterNames = '', pageCount = 24, characterPhotoUrl } = req.body
    const validAgeGroupIds = AGE_GROUPS.map((g) => g.id)
    const ageGroup = validAgeGroupIds.includes(req.body.ageGroup) ? req.body.ageGroup : 'preschool'

    if (!title || !theme) {
      return res.status(400).json({ error: 'Title and theme are required' })
    }

    // 3.5. 콘텐츠 안전 필터 — 아동 대상 서비스이므로 결제·생성 전에 입력값부터 검사
    const openai = createOpenAI()
    const moderationInput = [title, theme, characterNames].filter(Boolean).join('\n')
    const moderation = await moderateContent(openai, moderationInput)
    if (moderation.flagged) {
      return res.status(400).json({ error: '입력하신 내용에 부적절한 표현이 포함되어 있어 동화책을 만들 수 없습니다. 내용을 수정해주세요.' })
    }

    const bookParams = { userId: user.id, title, category, theme, ageGroup, characterNames, characterPhotoUrl, pageCount }

    // 4. 구독자 — 월 30권+960페이지 이중 캡 내에서는 결제 없이 바로 생성
    if (profile.is_premium) {
      const capCheck = await checkSubscriptionCap(supabase, user.id)
      if (capCheck.exceeded) {
        return res.status(403).json({ error: capCheck.message })
      }

      const book = await createBookAndStartImages(supabase, openai, bookParams)
      return res.status(200).json({
        success: true,
        book: { id: book.id, title, category, status: 'generating' },
      })
    }

    // 5. 무료 5페이지 체험 — 최초 1회, 휴대폰 본인인증 완료자만
    if (pageCount <= FREE_TIER_MAX_PAGES) {
      if (profile.free_trial_used_at) {
        return res.status(403).json({ error: '무료 체험은 이미 사용하셨습니다. 결제 후 이용해주세요.' })
      }
      if (!profile.phone_verified) {
        return res.status(403).json({
          error: '무료 체험을 위해 휴대폰 본인인증이 필요합니다.',
          requiresVerification: true,
        })
      }

      const book = await createBookAndStartImages(supabase, openai, bookParams)
      await supabase.from('profiles').update({ free_trial_used_at: new Date().toISOString() }).eq('id', user.id)

      return res.status(200).json({
        success: true,
        book: { id: book.id, title, category, status: 'generating' },
      })
    }

    // 6. 그 외(24~50페이지, 비구독자) — 1회 결제 필요. 결제 완료는 웹훅이 처리하고
    //    실제 생성은 /api/payment/book-order/process가 담당한다(physical_orders와 동일 패턴).
    const tier = getOneTimeTier(pageCount)
    if (!tier) {
      return res.status(400).json({ error: '페이지 수는 5페이지(무료 체험) 또는 24~50페이지(유료)만 가능합니다.' })
    }

    const sameDayDiscount = wasUsedToday(profile.free_trial_used_at)
    const amount = sameDayDiscount ? applyDiscount(tier.price, SAME_DAY_DISCOUNT.oneTime) : tier.price

    const { data: order, error: orderError } = await supabase
      .from('pending_book_orders')
      .insert({
        user_id: user.id,
        tier: tier.id,
        params: bookParams,
        amount,
        discount_applied: sameDayDiscount,
        status: 'pending_payment',
      })
      .select()
      .single()

    if (orderError || !order) {
      console.error('pending_book_orders insert error:', orderError)
      return res.status(500).json({ error: '주문 생성에 실패했습니다.' })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const productId = process.env[`POLAR_BOOK_ORDER_${tier.id.toUpperCase()}_PRODUCT_ID`]
    if (!productId) {
      console.error(`Missing Polar product id for tier ${tier.id}`)
      return res.status(500).json({ error: '결제 상품 설정이 누락되었습니다.' })
    }

    const session = await createCheckoutSession({
      productId,
      successUrl: `${appUrl}/payment/book-success?checkout_id={CHECKOUT_ID}&orderId=${order.id}`,
      customerEmail: user.email,
      amount: sameDayDiscount ? amount : undefined,
      metadata: {
        userId: user.id,
        productType: 'book_order',
        bookOrderId: order.id,
      },
    })

    await supabase
      .from('pending_book_orders')
      .update({ polar_checkout_id: session.id })
      .eq('id', order.id)

    return res.status(200).json({
      checkoutUrl: session.url,
      bookOrderId: order.id,
    })

  } catch (error) {
    console.error('Book creation error:', error)
    return res.status(500).json({
      error: 'Failed to create book',
      details: error.message
    })
  }
}
