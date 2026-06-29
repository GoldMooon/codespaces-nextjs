import { createServerSupabase } from '../../../lib/supabase'
import { createCheckoutSession } from '../../../lib/polar'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
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

    const { priceId, productType } = req.body
    // priceId는 Polar 제품 ID(UUID)로 사용
    const productId = priceId

    if (!productId) {
      return res.status(400).json({ error: 'Product ID is required' })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    // Create Polar checkout session
    const session = await createCheckoutSession({
      productId,
      successUrl: `${appUrl}/payment/success?checkout_id={CHECKOUT_ID}`,
      customerEmail: user.email,
      metadata: {
        userId: user.id,
        productType: productType || '',
      },
    })

    return res.status(200).json({
      checkoutUrl: session.url,
      sessionId: session.id,
    })

  } catch (error) {
    console.error('Payment error:', error)
    return res.status(500).json({ error: 'Failed to create payment session' })
  }
}