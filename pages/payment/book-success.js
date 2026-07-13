import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { supabase } from '../../lib/supabase'
import Header from '../../components/ui/Header'
import Footer from '../../components/ui/Footer'
import Button from '../../components/ui/Button'

export default function BookOrderSuccess() {
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

      try {
        const response = await fetch('/api/payment/book-order/process', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ bookOrderId: orderId }),
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
        if (data.bookId) setBookId(data.bookId)
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
        <title>결제 완료 | AI 동화책</title>
      </Head>
      <Header />
      <main style={{ maxWidth: 560, margin: '80px auto', padding: '0 20px', textAlign: 'center' }}>
        {error ? (
          <>
            <h1>⚠️ 문제가 발생했습니다</h1>
            <p style={{ color: '#64748b' }}>{error}</p>
          </>
        ) : status === 'created' ? (
          <>
            <h1>🎉 결제가 완료됐어요!</h1>
            <p style={{ color: '#64748b' }}>이제 이야기를 쓰고 그림을 그리기 시작했어요. 잠시 후 완성됩니다.</p>
          </>
        ) : (
          <>
            <h1>결제 확인 중...</h1>
            <p style={{ color: '#64748b' }}>결제를 확인하고 있어요. 잠시만 기다려주세요.</p>
          </>
        )}

        {bookId && (
          <Button variant="primary" onClick={() => router.push(`/book/${bookId}`)} style={{ marginTop: 24 }}>
            동화책 보러 가기
          </Button>
        )}
      </main>
      <Footer />
    </>
  )
}
