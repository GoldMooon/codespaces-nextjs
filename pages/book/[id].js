import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
import { supabase, isSupabaseConfigured } from '../../lib/supabase'
import { trackEvent } from '../../lib/analytics'
import Header from '../../components/ui/Header'
import Footer from '../../components/ui/Footer'
import BookViewer from '../../components/book/BookViewer'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import Button from '../../components/ui/Button'
import styles from '../../styles/book.module.css'

// 다른 탭으로 이동해도 완성/실패 시 알려주기 위한 브라우저 알림
function notifyBookDone(bookData) {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return
  if (Notification.permission !== 'granted') return

  const isFailed = bookData.status === 'failed'
  const notification = new Notification(
    isFailed ? '😢 동화책 생성에 실패했어요' : '🎨 동화책이 완성됐어요!',
    { body: bookData.title, icon: '/favicon.ico' }
  )
  notification.onclick = () => {
    window.focus()
    notification.close()
  }
}

export default function BookPage() {
  const router = useRouter()
  const { id } = router.query

  const [book, setBook] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notifPermission, setNotifPermission] = useState('unsupported')

  // 생성 중이었던 책이 완료/실패로 바뀌는 "전환 순간"에만 알림을 1회 보낸다
  const wasGeneratingRef = useRef(false)
  const notifiedRef = useRef(false)

  useEffect(() => {
    if (typeof Notification !== 'undefined') {
      setNotifPermission(Notification.permission)
    }
  }, [])

  const requestNotificationPermission = async () => {
    if (typeof Notification === 'undefined') return
    const permission = await Notification.requestPermission()
    setNotifPermission(permission)
  }

  useEffect(() => {
    if (!id) return

    let cancelled = false
    let processing = false

    // 생성 중 -> 완료/실패로 바뀌는 순간을 감지해 알림을 보낸다
    const checkAndNotify = (bookData) => {
      if (!bookData) return
      if (bookData.status === 'generating') {
        wasGeneratingRef.current = true
        return
      }
      if (wasGeneratingRef.current && !notifiedRef.current) {
        notifiedRef.current = true
        notifyBookDone(bookData)
        trackEvent(bookData.status === 'failed' ? 'book_create_failed' : 'book_create_complete', {
          category: bookData.category,
          page_count: bookData.content?.pages?.length || bookData.page_count || 0,
        })
      }
    }

    // 이미지 1장 생성을 트리거하는 엔드포인트 호출
    const triggerImage = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return null
        const res = await fetch('/api/books/process-image', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ bookId: id }),
        })
        return res.ok ? await res.json() : null
      } catch (e) {
        console.error('process-image error:', e)
        return null
      }
    }

    const fetchBook = async () => {
      if (!isSupabaseConfigured()) {
        router.push('/login')
        return
      }

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const { data, error } = await supabase
        .from('books')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .single()

      if (cancelled) return

      if (error || !data) {
        setError('동화책을 찾을 수 없습니다.')
        setLoading(false)
        return
      }

      setBook(data)
      setLoading(false)
      checkAndNotify(data)

      // 이미지 생성이 진행 중이면 다음 이미지 1장을 생성하고 반복
      if (data.status === 'generating' && !processing) {
        processing = true
        const result = await triggerImage()
        processing = false
        if (cancelled) return
        // 완료/실패면 멈추고, 아니면 곧바로 다음 장 진행
        if (!result || result.status === 'completed') {
          // 최종 상태 반영을 위해 한 번 더 조회
          const { data: fresh } = await supabase.from('books').select('*').eq('id', id).single()
          if (!cancelled && fresh) {
            setBook(fresh)
            checkAndNotify(fresh)
          }
        } else {
          setTimeout(fetchBook, 500)
        }
      }
    }

    fetchBook()

    return () => {
      cancelled = true
    }
  }, [id, router])

  if (loading) {
    return (
      <>
        <Head>
          <title>동화책 | AI 동화책</title>
        </Head>
        <Header />
        <div className={styles.loading}>
          <LoadingSpinner text="동화책을 불러오는 중..." />
        </div>
        <Footer />
      </>
    )
  }

  if (error || !book) {
    return (
      <>
        <Head>
          <title>오류 | AI 동화책</title>
        </Head>
        <Header />
        <div className={styles.error}>
          <h2>😢 {error || '동화책을 찾을 수 없습니다.'}</h2>
          <Link href="/books">
            <button>내 동화책으로 돌아가기</button>
          </Link>
        </div>
        <Footer />
      </>
    )
  }

  if (book.status === 'generating') {
    const pageCount = book.content?.pages?.length || book.page_count || 0
    return (
      <>
        <Head>
          <title>생성 중 | AI 동화책</title>
        </Head>
        <Header />
        <div className={styles.loading}>
          <h2>🎨 그림을 그리고 있어요</h2>
          <p>이야기는 완성됐어요! 이제 {pageCount > 0 ? `${pageCount}장의 ` : ''}그림을 그리는 중이에요.</p>
          <p style={{ color: '#888', fontSize: '0.9rem' }}>
            {pageCount >= 10
              ? '10페이지 이상은 그림 생성에 최소 5분 이상 소요될 수 있어요.'
              : '페이지 수가 많을수록 오래 걸려요. 보통 몇 분 정도 소요돼요.'}
            {' '}이 탭을 열어둔 채 다른 탭이나 창을 사용하셔도 계속 진행됩니다.
          </p>

          {notifPermission === 'default' && (
            <Button variant="outline" size="small" onClick={requestNotificationPermission}>
              🔔 완료되면 알림 받기
            </Button>
          )}
          {notifPermission === 'granted' && (
            <p style={{ color: '#888', fontSize: '0.85rem' }}>🔔 완성되면 알림을 보내드릴게요.</p>
          )}
          {notifPermission === 'denied' && (
            <p style={{ color: '#888', fontSize: '0.85rem' }}>
              브라우저 알림이 꺼져있어요. 이 탭을 열어두시면 완성 시 자동으로 표시됩니다.
            </p>
          )}

          <LoadingSpinner />
        </div>
        <Footer />
      </>
    )
  }

  if (book.status === 'failed') {
    return (
      <>
        <Head>
          <title>생성 실패 | AI 동화책</title>
        </Head>
        <Header />
        <div className={styles.error}>
          <h2>😢 그림 생성에 실패했어요</h2>
          <p>이야기는 저장되어 있어요. 다시 시도해 주세요.</p>
          <Link href="/books">
            <button>내 동화책으로 돌아가기</button>
          </Link>
        </div>
        <Footer />
      </>
    )
  }

  return (
    <>
      <Head>
        <title>{book.title} | AI 동화책</title>
      </Head>

      <Header />

      <main className={styles.main}>
        <Link href="/books" className={styles.backLink}>
          ← 내 동화책으로
        </Link>
        <BookViewer book={book} />
      </main>

      <Footer />
    </>
  )
}