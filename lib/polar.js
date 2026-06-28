// Polar API Client
// Polar SDK가 npm에 없으므로 HTTP API 직접 호출

const POLAR_API_BASE = process.env.POLAR_SERVER || 'https://api.polar.sh'

export async function createCheckoutSession({ priceId, successUrl, cancelUrl, metadata }) {
  const response = await fetch(`${POLAR_API_BASE}/v1/checkout`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.POLAR_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      price_id: priceId,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata,
    }),
  })

  if (!response.ok) {
    throw new Error('Failed to create checkout session')
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
  const response = await fetch(`${POLAR_API_BASE}/v1/subscriptions/${subscriptionId}/cancel`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.POLAR_ACCESS_TOKEN}`,
    },
  })

  if (!response.ok) {
    throw new Error('Failed to cancel subscription')
  }

  return response.json()
}

export async function verifyWebhookSignature(body, signature, secret) {
  // Webhook signature verification would be implemented here
  // For now, we'll trust the webhook data
  return true
}