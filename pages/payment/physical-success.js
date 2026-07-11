import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { supabase } from '../../lib/supabase'
import Header from '../../components/ui/Header'
import Footer from '../../components/ui/Footer'
import Button from '../../components/ui/Button'

const STATUS_MESSAGE = {
  submitted: '🎉 인쇄소 접수가 완료되었습니다! 제작·배송 진행 상황은 동화책 페이지에서 확인할 수 있어요.',
  confirmed: '🎉 제작이 확정되었습니다!',
  in_production: '🎉 제작이 진행 중입니다!',
}

export default function PhysicalOrderSuccess() {
  const router = useRouter()
  const { orderId } = router.query
  const [status, setStatus] = useState('pending')
  const [error, setError] = useState('')
  const [bookId, setBookId] = useState(null)

  useEffect(() => {
    if (!orderId) return
    let cancelled = false
    let attempts = 0

    const tick = async () => {
      attempts += 1
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        if (!cancelled) setError('로그인이 필요합니다.')
        return
      }

      const { data: orderRow } = await supabase
        .from('physical_orders')
        .select('book_id')
        .eq('id', orderId)
        .maybeSingle()
      if (orderRow?.book_id && !cancelled) setBookId(orderRow.book_id)

      try {
        const response = await fetch('/api/payment/physical-order/process', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ physicalOrderId: orderId }),
        })
        const data = await response.json()

        if (cancelled) return

        if (!response.ok) {
          // 결제 웹훅이 아직 도착 전일 수 있음 — 잠시 후 재시도
          if (data.error?.includes('결제가 아직') && attempts < 15) {
            setTimeout(tick, 2000)
            return
          }
          setError(data.error || '처리에 실패했습니다.')
          return
        }

        setStatus(data.status)
      } catch (err) {
        if (!cancelled) setError(err.message)
      }
    }

    tick()
    return () => { cancelled = true }
  }, [orderId])

  return (
    <>
      <Head>
        <title>실물 책 주문 완료 | AI 동화책</title>
      </Head>
      <Header />
      <main style={{ maxWidth: 560, margin: '80px auto', padding: '0 20px', textAlign: 'center' }}>
        {error ? (
          <>
            <h1>⚠️ 문제가 발생했습니다</h1>
            <p style={{ color: '#64748b' }}>{error}</p>
          </>
        ) : STATUS_MESSAGE[status] ? (
          <>
            <h1>주문이 접수되었습니다!</h1>
            <p style={{ color: '#64748b' }}>{STATUS_MESSAGE[status]}</p>
          </>
        ) : (
          <>
            <h1>결제 확인 중...</h1>
            <p style={{ color: '#64748b' }}>실물 책 제작 요청을 처리하고 있어요. 잠시만 기다려주세요.</p>
          </>
        )}

        {bookId && (
          <Button variant="primary" onClick={() => router.push(`/book/${bookId}`)} style={{ marginTop: 24 }}>
            동화책으로 돌아가기
          </Button>
        )}
      </main>
      <Footer />
    </>
  )
}
