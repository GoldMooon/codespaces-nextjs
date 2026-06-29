import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
import { supabase, isSupabaseConfigured } from '../../lib/supabase'
import Header from '../../components/ui/Header'
import Footer from '../../components/ui/Footer'
import BookViewer from '../../components/book/BookViewer'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import styles from '../../styles/book.module.css'

export default function BookPage() {
  const router = useRouter()
  const { id } = router.query

  const [book, setBook] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id) return

    let cancelled = false
    let processing = false

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
          if (!cancelled && fresh) setBook(fresh)
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
            보통 1분 정도 걸려요. 이 페이지는 완료되면 자동으로 새로고침됩니다.
          </p>
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