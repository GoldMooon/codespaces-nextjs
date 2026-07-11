import { createServerSupabase } from '../../../lib/supabase'
import { verifySweetbookWebhookSignature } from '../../../lib/sweetbook'

// HMAC-SHA256 서명 검증을 위해 raw body가 필요 → bodyParser 비활성화 (Polar 웹훅과 동일 패턴)
export const config = {
  api: {
    bodyParser: false,
  },
}

async function getRawBody(req) {
  const chunks = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

// SweetBook 이벤트(snake_case data) → 우리 physical_orders.status 매핑
const EVENT_STATUS_MAP = {
  'order.created': 'submitted',
  'order.restored': 'submitted',
  'production.confirmed': 'confirmed',
  'production.started': 'in_production',
  'production.completed': 'production_complete',
  'shipping.departed': 'shipped',
  'shipping.delivered': 'delivered',
  'order.cancelled': 'cancelled',
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const rawBody = await getRawBody(req)
  const signature = req.headers['x-webhook-signature']
  const timestamp = req.headers['x-webhook-timestamp']
  const eventType = req.headers['x-webhook-event']

  const valid = verifySweetbookWebhookSignature(rawBody, signature, timestamp, process.env.SWEETBOOK_WEBHOOK_SECRET)
  if (!valid) {
    console.error('SweetBook webhook signature verification failed')
    return res.status(401).json({ error: 'Invalid signature' })
  }

  let payload
  try {
    payload = JSON.parse(rawBody)
  } catch (err) {
    return res.status(400).json({ error: 'Invalid JSON' })
  }

  try {
    const supabase = createServerSupabase()
    const data = payload.data || {}
    const orderUid = data.order_uid

    if (!orderUid) {
      // 주문과 무관한 이벤트(예: webhook.exhausted)는 조용히 무시
      return res.status(200).json({ received: true })
    }

    if (eventType === 'order.item_cancelled') {
      if (data.full_cancel) {
        await supabase.from('physical_orders').update({ status: 'cancelled' }).eq('sweetbook_order_uid', orderUid)
      }
      return res.status(200).json({ received: true })
    }

    const nextStatus = EVENT_STATUS_MAP[eventType]
    if (!nextStatus) {
      return res.status(200).json({ received: true })
    }

    const update = { status: nextStatus }
    if (eventType === 'shipping.departed') {
      if (data.tracking_number) update.tracking_number = data.tracking_number
      if (data.tracking_carrier) update.tracking_carrier = data.tracking_carrier
    }

    await supabase.from('physical_orders').update(update).eq('sweetbook_order_uid', orderUid)

    return res.status(200).json({ received: true })

  } catch (error) {
    console.error('SweetBook webhook processing error:', error)
    return res.status(500).json({ error: 'Webhook processing failed' })
  }
}
