import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import Header from '../components/ui/Header'
import Footer from '../components/ui/Footer'
import Button from '../components/ui/Button'
import styles from '../styles/books.module.css'

export default function BooksPage() {
  const router = useRouter()
  const [books, setBooks] = useState([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState(null)

  useEffect(() => {
    const fetchBooks = async () => {
      if (!isSupabaseConfigured()) {
        setLoading(false)
        return
      }

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const { data } = await supabase
        .from('books')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      setBooks(data || [])
      setLoading(false)
    }

    fetchBooks()
  }, [router])

  const handleDelete = async (bookId) => {
    if (!confirm('정말 삭제하시겠습니까?')) return

    setDeletingId(bookId)

    const { data: { session } } = await supabase.auth.getSession()
    const response = await fetch(`/api/books/${bookId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${session.access_token}` }
    })

    if (response.ok) {
      setBooks(books.filter(b => b.id !== bookId))
    }

    setDeletingId(null)
  }

  const getStatusBadge = (status) => {
    const badges = {
      draft: { text: '초안', className: styles.statusDraft },
      generating: { text: '생성 중', className: styles.statusGenerating },
      completed: { text: '완료', className: styles.statusCompleted },
      failed: { text: '실패', className: styles.statusFailed },
    }
    const badge = badges[status] || badges.draft
    return <span className={`${styles.statusBadge} ${badge.className}`}>{badge.text}</span>
  }

  return (
    <>
      <Head>
        <title>내 동화책 | AI 동화책</title>
      </Head>

      <Header />

      <main className={styles.main}>
        <div className={styles.container}>
          <div className={styles.header}>
            <div>
              <h1 className={styles.pageTitle}>📚 내 동화책</h1>
              <p className={styles.pageSubtitle}>내가 만든 동화책들을 확인해보세요</p>
            </div>
            <Link href="/create">
              <Button>✨ 새 동화책 만들기</Button>
            </Link>
          </div>

          {loading ? (
            <div className={styles.loading}>
              <p>로딩 중...</p>
            </div>
          ) : books.length === 0 ? (
            <div className={styles.empty}>
              <p className={styles.emptyEmoji}>📖</p>
              <h2>아직 동화책이 없어요</h2>
              <p>첫 번째 동화책을 만들어보세요!</p>
              <Link href="/create">
                <Button size="large">✨ 동화책 만들기</Button>
              </Link>
            </div>
          ) : (
            <div className={styles.grid}>
              {books.map((book) => (
                <div key={book.id} className={styles.card}>
                  <div
                    className={styles.cardImage}
                    style={{
                      backgroundImage: book.cover_image_url
                        ? `url(${book.cover_image_url})`
                        : 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)'
                    }}
                  >
                    {getStatusBadge(book.status)}
                  </div>
                  <div className={styles.cardContent}>
                    <h3 className={styles.cardTitle}>{book.title}</h3>
                    <p className={styles.cardMeta}>
                      {book.category && `${book.category} • `}
                      {book.page_count}페이지
                    </p>
                    <p className={styles.cardDate}>
                      {new Date(book.created_at).toLocaleDateString('ko-KR')}
                    </p>
                    <div className={styles.cardActions}>
                      {book.status === 'completed' && (
                        <Link href={`/book/${book.id}`}>
                          <Button size="small" variant="primary">📖 읽기</Button>
                        </Link>
                      )}
                      <Button
                        size="small"
                        variant="ghost"
                        loading={deletingId === book.id}
                        onClick={() => handleDelete(book.id)}
                      >
                        🗑️
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <Footer />
    </>
  )
}