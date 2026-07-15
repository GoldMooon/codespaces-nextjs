import { waitUntil } from '@vercel/functions'
import { createServerSupabase } from '../../../../lib/supabase'
import { createOpenAI } from '../../../../lib/openai'
import { createBookRecord, generateBookContentSafely } from '../../../../lib/bookCreation'

// books 행만 만들고 즉시 응답한다. 텍스트 생성은 waitUntil()로 응답 이후 백그라운드에서
// 계속 실행 — 24~50페이지를 추론 모델로 동기 생성하던 기존 방식은 120초 타임아웃으로
// 실제 프로덕션에서 실패했음(2026-07-15). maxDuration은 백그라운드 작업까지 포함한 상한.
export const config = {
  maxDuration: 300,
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
    const book = await createBookRecord(supabase, order.params)

    await supabase
      .from('pending_book_orders')
      .update({ status: 'created', book_id: book.id })
      .eq('id', bookOrderId)

    waitUntil(generateBookContentSafely(supabase, openai, book, order.params, async (error) => {
      // 결제는 이미 끝난 주문이므로 실패 사유를 남겨 CS/재시도 판단에 쓴다
      // (status는 'failed'로 되돌리지 않음 — book_id가 이미 연결돼 있고, 뷰어의
      // failed 화면이 사용자에게 실패를 안내한다)
      await supabase
        .from('pending_book_orders')
        .update({ error_message: error.message })
        .eq('id', bookOrderId)
    }))

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
