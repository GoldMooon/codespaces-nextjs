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

      if (error || !data) {
        setError('동화책을 찾을 수 없습니다.')
      } else {
        setBook(data)
      }
      setLoading(false)
    }

    fetchBook()
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
    return (
      <>
        <Head>
          <title>생성 중 | AI 동화책</title>
        </Head>
        <Header />
        <div className={styles.loading}>
          <h2>📖 동화책을 만들고 있어요</h2>
          <p>잠시만 기다려주세요...</p>
          <LoadingSpinner />
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