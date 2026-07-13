import { createServerSupabase } from '../../../../lib/supabase'
import { createOpenAI } from '../../../../lib/openai'
import { createBookAndStartImages } from '../../../../lib/bookCreation'

// 텍스트 생성(최대 ~58초 실측) + 이미지 작업 시작(최대 51개, 청크 병렬)까지 감안.
export const config = {
  maxDuration: 120,
}

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

    const { bookOrderId } = req.body
    if (!bookOrderId) {
      return res.status(400).json({ error: 'bookOrderId is required' })
    }

    const { data: order, error: orderError } = await supabase
      .from('pending_book_orders')
      .select('*')
      .eq('id', bookOrderId)
      .eq('user_id', user.id)
      .single()

    if (orderError || !order) {
      return res.status(404).json({ error: '주문을 찾을 수 없습니다.' })
    }

    if (order.status === 'pending_payment') {
      return res.status(400).json({ error: '결제가 아직 완료되지 않았습니다.' })
    }

    if (order.status === 'created') {
      return res.status(200).json({ status: 'created', bookId: order.book_id })
    }

    if (order.status === 'failed' && order.book_id) {
      // 이전 시도가 생성 도중 실패했지만 book 행은 이미 만들어졌을 수 있음 — 중복 생성 방지
      return res.status(200).json({ status: 'created', bookId: order.book_id })
    }

    const openai = createOpenAI()
    const book = await createBookAndStartImages(supabase, openai, order.params)

    await supabase
      .from('pending_book_orders')
      .update({ status: 'created', book_id: book.id })
      .eq('id', bookOrderId)

    return res.status(200).json({ status: 'created', bookId: book.id })

  } catch (error) {
    console.error('Book order processing error:', error)
    try {
      const { bookOrderId } = req.body || {}
      if (bookOrderId) {
        const supabase = createServerSupabase()
        await supabase
          .from('pending_book_orders')
          .update({ status: 'failed', error_message: error.message })
          .eq('id', bookOrderId)
      }
    } catch (updateErr) {
      console.error('Failed to record book order failure:', updateErr)
    }
    return res.status(500).json({ error: '동화책 생성 요청 처리에 실패했습니다.', detail: error.message })
  }
}
