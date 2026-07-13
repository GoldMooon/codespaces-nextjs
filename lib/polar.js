// Polar API Client
// 공식 SDK 대신 HTTP API 직접 호출 (최신 규격: https://polar.sh/docs/api-reference)

import { Webhook } from 'standardwebhooks'

const POLAR_API_BASE = process.env.POLAR_SERVER || 'https://api.polar.sh'

/**
 * Checkout 세션 생성
 * 최신 규격: POST /v1/checkouts/ + products(배열)
 * @param {Object} params
 * @param {string} params.productId - Polar 제품 ID (UUID)
 * @param {string} params.successUrl - 결제 성공 후 리다이렉트 URL
 * @param {Object} params.metadata - 결제에 첨부할 메타데이터 (userId, productType 등)
 * @param {string} [params.customerEmail] - 고객 이메일 (선택)
 * @returns {Promise<{id: string, url: string}>}
 */
export async function createCheckoutSession({ productId, successUrl, metadata, customerEmail, amount }) {
  const response = await fetch(`${POLAR_API_BASE}/v1/checkouts/`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.POLAR_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      products: [productId],
      success_url: successUrl,
      metadata,
      ...(customerEmail ? { customer_email: customerEmail } : {}),
      // 당일 전환 할인 등 동적 가격이 필요할 때만 전달 — Polar 제품이 "고정가"로 설정돼 있으면
      // 이 값은 무시될 수 있음. 할인 적용이 확인 안 되면 해당 제품을 커스텀 가격으로
      // 바꾸거나 Polar Discounts API로 전환하는 것을 검토할 것(Task #16 후속 확인 필요).
      ...(amount !== undefined ? { amount } : {}),
    }),
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Failed to create checkout session (${response.status}): ${errText}`)
  }

  return response.json()
}

export async function getSubscription(subscriptionId) {
  const response = await fetch(`${POLAR_API_BASE}/v1/subscriptions/${subscriptionId}`, {
    headers: {
      'Authorization': `Bearer ${process.env.POLAR_ACCESS_TOKEN}`,
    },
  })

  if (!response.ok) {
    throw new Error('Failed to get subscription')
  }

  return response.json()
}

export async function cancelSubscription(subscriptionId) {
  // 최신 규격: PATCH /v1/subscriptions/{id} + cancel_at_period_end
  const response = await fetch(`${POLAR_API_BASE}/v1/subscriptions/${subscriptionId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${process.env.POLAR_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ cancel_at_period_end: true }),
  })

  if (!response.ok) {
    throw new Error('Failed to cancel subscription')
  }

  return response.json()
}

/**
 * 웹훅 서명 검증 (Standard Webhooks 스펙)
 * Polar 웹훅 시크릿은 평문이므로 base64 인코딩하여 사용한다.
 * @param {string} rawBody - 원본 요청 body 문자열 (파싱 전)
 * @param {Object} headers - 요청 헤더 (webhook-id, webhook-timestamp, webhook-signature)
 * @param {string} secret - POLAR_WEBHOOK_SECRET
 * @returns {Object} 파싱된 이벤트 페이로드 ({ type, data })
 * @throws 검증 실패 시 에러
 */
export function validateWebhookEvent(rawBody, headers, secret) {
  // Polar 시크릿은 평문 → base64 인코딩 필요
  const wh = new Webhook(Buffer.from(secret).toString('base64'))
  const webhookHeaders = {
    'webhook-id': headers['webhook-id'],
    'webhook-timestamp': headers['webhook-timestamp'],
    'webhook-signature': headers['webhook-signature'],
  }
  // 검증 성공 시 파싱된 객체 반환, 실패 시 throw
  return wh.verify(rawBody, webhookHeaders)
}
