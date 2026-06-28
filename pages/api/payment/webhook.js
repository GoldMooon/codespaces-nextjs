import { createServerSupabase } from '../../../lib/supabase'
import { verifyWebhookSignature } from '../../../lib/polar'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const signature = req.headers['polar-signature']
    const body = req.body

    // Verify webhook signature
    const isValid = await verifyWebhookSignature(
      body,
      signature,
      process.env.POLAR_WEBHOOK_SECRET
    )

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid signature' })
    }

    const supabase = createServerSupabase()
    const eventType = body.event?.type

    switch (eventType) {
      case 'payment.created':
      case 'payment.completed': {
        const paymentData = body.event?.data
        const userId = paymentData?.metadata?.userId
        const productType = paymentData?.metadata?.productType

        if (userId) {
          if (productType === 'subscription') {
            // Update user to premium
            await supabase
              .from('profiles')
              .update({ is_premium: true, subscription_status: 'active' })
              .eq('id', userId)

            // Record subscription
            await supabase
              .from('subscriptions')
              .upsert({
                user_id: userId,
                polar_subscription_id: paymentData.id,
                plan: paymentData.price?. recurring_interval === 'month' ? 'monthly' : 'yearly',
                status: 'active',
                current_period_start: new Date().toISOString(),
                current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
              }, {
                onConflict: 'user_id',
              })
          } else if (productType === 'credits') {
            // Add credits
            const creditsToAdd = paymentData.metadata?.credits || 10
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

          // Record payment
          await supabase
            .from('payments')
            .insert({
              user_id: userId,
              polar_payment_id: paymentData.id,
              amount: paymentData.amount,
              currency: paymentData.currency,
              status: 'completed',
              product_type: productType,
              product_id: paymentData.price_id,
            })
        }
        break
      }

      case 'subscription.cancelled': {
        const subscriptionData = body.event?.data
        const userId = subscriptionData?.metadata?.userId

        if (userId) {
          await supabase
            .from('profiles')
            .update({ subscription_status: 'cancelled' })
            .eq('id', userId)

          await supabase
            .from('subscriptions')
            .update({
              status: 'cancelled',
              cancel_at_period_end: true,
            })
            .eq('user_id', userId)
        }
        break
      }
    }

    return res.status(200).json({ received: true })

  } catch (error) {
    console.error('Webhook error:', error)
    return res.status(500).json({ error: 'Webhook processing failed' })
  }
}