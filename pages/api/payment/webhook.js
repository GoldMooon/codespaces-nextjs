import { createServerSupabase } from '../../../lib/supabase'
import { validateWebhookEvent } from '../../../lib/polar'

// Standard Webhooks 서명 검증을 위해 raw body가 필요 → bodyParser 비활성화
export const config = {
  api: {
    bodyParser: false,
  },
}

// raw body 읽기 헬퍼
async function getRawBody(req) {
  const chunks = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  let event
  try {
    const rawBody = await getRawBody(req)
    // 서명 검증 (실패 시 throw) → 검증된 페이로드 반환
    event = validateWebhookEvent(rawBody, req.headers, process.env.POLAR_WEBHOOK_SECRET)
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message)
    return res.status(403).json({ error: 'Invalid signature' })
  }

  try {
    const supabase = createServerSupabase()
    const eventType = event.type
    const data = event.data || {}
    const metadata = data.metadata || {}
    const userId = metadata.userId
    const productType = metadata.productType

    switch (eventType) {
      // 주문 결제 완료 (구독 첫 결제 + 갱신 + 크레딧 1회성 결제 모두 여기로 들어옴)
      case 'order.paid': {
        if (!userId) break

        if (productType === 'physical_book') {
          // 실물 책 주문은 payments 테이블(subscription/credits 전용 CHECK 제약)이 아니라
          // physical_orders 자체가 결제 기록을 겸한다. SweetBook 연동(PDF 생성·업로드·주문 생성)은
          // 무거운 작업이라 여기서 동기로 하지 않고, 결제 완료 페이지에서 별도 엔드포인트
          // (/api/payment/physical-order/process)를 호출해 처리한다.
          const physicalOrderId = metadata.physicalOrderId
          if (physicalOrderId) {
            await supabase
              .from('physical_orders')
              .update({ status: 'paid', polar_payment_id: data.id })
              .eq('id', physicalOrderId)
              .eq('status', 'pending_payment')
          }
          break
        }

        if (productType === 'credits') {
          // 크레딧 추가
          const creditsToAdd = parseInt(metadata.credits, 10) || 10
          const { data: profile } = await supabase
            .from('profiles')
            .select('credits')
            .eq('id', userId)
            .single()

          await supabase
            .from('profiles')
            .update({ credits: (profile?.credits || 0) + creditsToAdd })
            .eq('id', userId)
        }

        // 결제 내역 기록
        await supabase
          .from('payments')
          .upsert({
            user_id: userId,
            polar_payment_id: data.id,
            amount: data.amount ?? data.total_amount,
            currency: data.currency || 'usd',
            status: 'completed',
            product_type: productType || null,
            product_id: data.product_id,
          }, { onConflict: 'polar_payment_id' })
        break
      }

      // 구독 활성화 (생성 + 활성 + 취소 철회)
      case 'subscription.created':
      case 'subscription.active':
      case 'subscription.uncanceled': {
        if (!userId) break

        await supabase
          .from('profiles')
          .update({
            is_premium: true,
            subscription_status: 'active',
            polar_subscription_id: data.id,
          })
          .eq('id', userId)

        await supabase
          .from('subscriptions')
          .upsert({
            user_id: userId,
            polar_subscription_id: data.id,
            plan: data.recurring_interval === 'year' ? 'yearly' : 'monthly',
            status: 'active',
            current_period_start: data.current_period_start || new Date().toISOString(),
            current_period_end: data.current_period_end || null,
            cancel_at_period_end: false,
          }, { onConflict: 'user_id' })
        break
      }

      // 구독 취소 (기간 종료 시점에 취소 예약)
      case 'subscription.canceled': {
        if (!userId) break

        await supabase
          .from('profiles')
          .update({ subscription_status: 'cancelled' })
          .eq('id', userId)

        await supabase
          .from('subscriptions')
          .update({ status: 'cancelled', cancel_at_period_end: true })
          .eq('user_id', userId)
        break
      }

      // 구독 권한 회수 (즉시 만료 — 프리미엄 해제)
      case 'subscription.revoked': {
        if (!userId) break

        await supabase
          .from('profiles')
          .update({ is_premium: false, subscription_status: 'expired' })
          .eq('id', userId)

        await supabase
          .from('subscriptions')
          .update({ status: 'cancelled' })
          .eq('user_id', userId)
        break
      }

      default:
        // 처리하지 않는 이벤트는 무시 (200 반환)
        break
    }

    return res.status(200).json({ received: true })

  } catch (error) {
    console.error('Webhook processing error:', error)
    return res.status(500).json({ error: 'Webhook processing failed' })
  }
}
