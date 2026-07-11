import { createServerSupabase } from '../../../../lib/supabase'
import { createCheckoutSession } from '../../../../lib/polar'
import { isEligibleForPrint } from '../../../../lib/print-pdf-generator'

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

    const { bookId, recipientName, recipientPhone, postalCode, address1, address2, memo } = req.body

    if (!bookId || !recipientName || !recipientPhone || !postalCode || !address1) {
      return res.status(400).json({ error: '수령인/연락처/우편번호/주소를 모두 입력해주세요.' })
    }

    const { data: book, error: bookError } = await supabase
      .from('books')
      .select('*')
      .eq('id', bookId)
      .eq('user_id', user.id)
      .single()

    if (bookError || !book) {
      return res.status(404).json({ error: '동화책을 찾을 수 없습니다.' })
    }

    if (book.status !== 'completed') {
      return res.status(400).json({ error: '아직 생성이 완료되지 않은 동화책입니다.' })
    }

    if (!isEligibleForPrint(book)) {
      return res.status(400).json({ error: '이 동화책은 실물 인쇄 최소 페이지 수(24페이지) 조건을 만족하지 않습니다.' })
    }

    const { data: physicalOrder, error: insertError } = await supabase
      .from('physical_orders')
      .insert({
        user_id: user.id,
        book_id: bookId,
        status: 'pending_payment',
        recipient_name: recipientName,
        recipient_phone: recipientPhone,
        postal_code: postalCode,
        address1,
        address2: address2 || null,
        shipping_memo: memo || null,
        amount: parseInt(process.env.NEXT_PUBLIC_PHYSICAL_BOOK_PRICE_KRW || '39000', 10),
        currency: 'KRW',
      })
      .select()
      .single()

    if (insertError || !physicalOrder) {
      console.error('physical_orders insert error:', insertError)
      return res.status(500).json({ error: '주문 생성에 실패했습니다.' })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    const session = await createCheckoutSession({
      productId: process.env.POLAR_PHYSICAL_BOOK_PRODUCT_ID,
      successUrl: `${appUrl}/payment/physical-success?checkout_id={CHECKOUT_ID}&orderId=${physicalOrder.id}`,
      customerEmail: user.email,
      metadata: {
        userId: user.id,
        productType: 'physical_book',
        physicalOrderId: physicalOrder.id,
      },
    })

    await supabase
      .from('physical_orders')
      .update({ polar_checkout_id: session.id })
      .eq('id', physicalOrder.id)

    return res.status(200).json({
      checkoutUrl: session.url,
      physicalOrderId: physicalOrder.id,
    })

  } catch (error) {
    console.error('Physical order create error:', error)
    return res.status(500).json({ error: '주문 생성에 실패했습니다.' })
  }
}
