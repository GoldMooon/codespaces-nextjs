import { createServerSupabase } from '../../../lib/supabase'
import { createOpenAI } from '../../../lib/openai'
import { processImageJob } from '../../../lib/imageJobs'

// HMAC 서명 검증을 위해 raw body가 필요 → bodyParser 비활성화 (SweetBook 웹훅과 동일 패턴)
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const rawBody = await getRawBody(req)
  const openai = createOpenAI()

  let event
  try {
    // client.webhooks.unwrap()이 서명 검증(webhook-signature/webhook-timestamp/webhook-id
    // 헤더 + OPENAI_WEBHOOK_SECRET) 과 JSON 파싱을 한 번에 처리한다.
    event = await openai.webhooks.unwrap(rawBody, req.headers)
  } catch (err) {
    console.error('OpenAI webhook signature verification failed:', err.message)
    return res.status(401).json({ error: 'Invalid signature' })
  }

  // 이미지 생성 관련 이벤트만 처리 — 다른 이벤트(batch.*, fine_tuning.* 등)는 조용히 무시
  if (!['response.completed', 'response.failed', 'response.incomplete', 'response.cancelled'].includes(event.type)) {
    return res.status(200).json({ received: true })
  }

  try {
    const supabase = createServerSupabase()
    const responseId = event.data?.id
    if (!responseId) {
      return res.status(200).json({ received: true })
    }

    const { data: job } = await supabase
      .from('image_generation_jobs')
      .select('*')
      .eq('response_id', responseId)
      .single()

    if (!job) {
      // 우리가 추적하지 않는 response id (예: 다른 용도의 웹훅) — 조용히 무시
      return res.status(200).json({ received: true })
    }

    await processImageJob(supabase, openai, job)
    return res.status(200).json({ received: true })
  } catch (error) {
    console.error('OpenAI webhook processing error:', error)
    return res.status(500).json({ error: 'Webhook processing failed' })
  }
}
