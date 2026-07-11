import { createServerSupabase } from '../../../../lib/supabase'
import { generatePrintPdfs } from '../../../../lib/print-pdf-generator'
import { createBook, uploadCoverPdf, uploadContentsPdf, finalizeBook, createOrder, SQUAREBOOK_HC } from '../../../../lib/sweetbook'

// PDF 생성(이미지 N장 다운로드+임베드) + SweetBook 다단계 호출(책 생성→표지/내지 업로드→최종화→주문 생성)이
// 순차로 이어져 수십 초가 걸릴 수 있어 넉넉히 잡음.
export const config = {
  maxDuration: 180,
}

const TERMINAL_STATUSES = ['submitted', 'confirmed', 'in_production', 'production_complete', 'shipped', 'delivered']

async function uploadTolerant(fn) {
  try {
    return await fn()
  } catch (err) {
    // 409 = 이미 등록되어 있음(재시도 시 정상 상황) — 실패로 취급하지 않고 계속 진행
    if (err.status === 409) return null
    throw err
  }
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

    const { physicalOrderId } = req.body
    if (!physicalOrderId) {
      return res.status(400).json({ error: 'physicalOrderId is required' })
    }

    const { data: order, error: orderError } = await supabase
      .from('physical_orders')
      .select('*, books(*)')
      .eq('id', physicalOrderId)
      .eq('user_id', user.id)
      .single()

    if (orderError || !order) {
      return res.status(404).json({ error: '주문을 찾을 수 없습니다.' })
    }

    if (order.status === 'pending_payment') {
      return res.status(400).json({ error: '결제가 아직 완료되지 않았습니다.' })
    }

    if (TERMINAL_STATUSES.includes(order.status)) {
      return res.status(200).json({ status: order.status, sweetbookOrderUid: order.sweetbook_order_uid })
    }

    const book = order.books
    if (!book) {
      return res.status(404).json({ error: '연결된 동화책을 찾을 수 없습니다.' })
    }

    await supabase.from('physical_orders').update({ status: 'processing', error_message: null }).eq('id', physicalOrderId)

    const { coverPdfBytes, contentsPdfBytes, pageCount } = await generatePrintPdfs(book)

    let sweetbookBookUid = order.sweetbook_book_uid
    if (!sweetbookBookUid) {
      const created = await createBook({
        title: book.title,
        bookSpecUid: SQUAREBOOK_HC,
        pageCount,
        externalRef: physicalOrderId,
        idempotencyKey: `book-${physicalOrderId}`,
      })
      sweetbookBookUid = created.bookUid
      await supabase.from('physical_orders').update({ sweetbook_book_uid: sweetbookBookUid }).eq('id', physicalOrderId)
    }

    await uploadTolerant(() => uploadCoverPdf(sweetbookBookUid, Buffer.from(coverPdfBytes)))
    await uploadTolerant(() => uploadContentsPdf(sweetbookBookUid, Buffer.from(contentsPdfBytes)))
    await finalizeBook(sweetbookBookUid)

    const orderResult = await createOrder({
      bookUid: sweetbookBookUid,
      quantity: 1,
      shipping: {
        recipientName: order.recipient_name,
        recipientPhone: order.recipient_phone,
        postalCode: order.postal_code,
        address1: order.address1,
        ...(order.address2 ? { address2: order.address2 } : {}),
        ...(order.shipping_memo ? { memo: order.shipping_memo } : {}),
      },
      externalRef: physicalOrderId,
      idempotencyKey: `order-${physicalOrderId}`,
    })

    await supabase
      .from('physical_orders')
      .update({ status: 'submitted', sweetbook_order_uid: orderResult.orderUid })
      .eq('id', physicalOrderId)

    return res.status(200).json({ status: 'submitted', sweetbookOrderUid: orderResult.orderUid })

  } catch (error) {
    console.error('Physical order processing error:', error)
    try {
      const { physicalOrderId } = req.body || {}
      if (physicalOrderId) {
        const supabase = createServerSupabase()
        await supabase
          .from('physical_orders')
          .update({ status: 'failed', error_message: error.message })
          .eq('id', physicalOrderId)
      }
    } catch (updateErr) {
      console.error('Failed to record physical order failure:', updateErr)
    }
    return res.status(500).json({ error: '실물 책 제작 요청 처리에 실패했습니다.', detail: error.message })
  }
}
