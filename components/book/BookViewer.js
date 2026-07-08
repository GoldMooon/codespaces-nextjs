import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { splitIntoBreathUnits } from '../../lib/textFormat'
import { AmbientPlayer } from '../../lib/bgm'
import styles from '../../styles/components/BookViewer.module.css'
import Button from '../ui/Button'
import BgmToggle from './BgmToggle'

// 배경음악 기능 스위치. 이야기 생성과는 무관한 순수 읽기 화면 기능이지만,
// 문제가 생기면 이 값을 false로 바꾸거나(.env.local에 NEXT_PUBLIC_ENABLE_BGM=false)
// 아래 <BgmToggle> 사용부만 주석 처리하면 다른 기능에 영향 없이 바로 끌 수 있다.
const BGM_ENABLED = process.env.NEXT_PUBLIC_ENABLE_BGM !== 'false'

export default function BookViewer({ book }) {
  const [currentPage, setCurrentPage] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [downloading, setDownloading] = useState(false)
  const [bgmPlaying, setBgmPlaying] = useState(false)
  const bgmPlayerRef = useRef(null)

  const pages = book.content?.pages || []
  const totalPages = pages.length

  // BGM 재생 상태는 여기(BookViewer)에 둬서, 표지 ↔ 본문 페이지를 넘나들며
  // <BgmToggle>이 다시 그려져도 음악 자체는 끊기지 않는다.
  useEffect(() => {
    if (!BGM_ENABLED) return
    bgmPlayerRef.current = new AmbientPlayer()
    return () => {
      bgmPlayerRef.current?.stop()
    }
  }, [])

  const toggleBgm = () => {
    if (!bgmPlayerRef.current) return
    if (bgmPlaying) {
      bgmPlayerRef.current.stop()
      setBgmPlaying(false)
    } else {
      bgmPlayerRef.current.start(book.category)
      setBgmPlaying(true)
    }
  }

  const goToPrev = () => {
    if (currentPage > 0) {
      setCurrentPage(currentPage - 1)
    }
  }

  const goToNext = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowLeft') goToPrev()
    if (e.key === 'ArrowRight') goToNext()
  }

  const handleDownload = async () => {
    setDownloading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        alert('로그인이 필요합니다.')
        return
      }

      const response = await fetch(`/api/books/pdf/${book.id}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })

      if (!response.ok) {
        const message = response.headers.get('content-type')?.includes('application/json')
          ? (await response.json()).error
          : `HTTP ${response.status}`
        throw new Error(message || 'PDF 생성에 실패했습니다.')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${book.title}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error('Download failed:', error)
      alert(`PDF 다운로드에 실패했습니다: ${error.message}`)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className={styles.container} tabIndex={0} onKeyDown={handleKeyDown}>
      {/* 표지 */}
      {currentPage === 0 && (
        <div className={styles.cover} style={{ transform: `scale(${zoom})` }}>
          <div className={`${styles.imageFrame} ${styles.imageFrameCover}`}>
            {book.cover_image_url && (
              <img
                src={book.cover_image_url}
                alt={book.title}
                className={styles.coverImage}
              />
            )}
            {BGM_ENABLED && (
              <div className={styles.bgmCorner}>
                <BgmToggle playing={bgmPlaying} onToggle={toggleBgm} />
              </div>
            )}
          </div>
          <h1 className={styles.coverTitle}>{book.title}</h1>
          {book.category && (
            <p className={styles.coverCategory}>{book.category}</p>
          )}
          <p className={styles.coverHint}>← → 키를 눌러 페이지를 넘기세요</p>
        </div>
      )}

      {/* 본문 페이지 */}
      {currentPage > 0 && pages[currentPage - 1] && (
        <div className={styles.page} style={{ transform: `scale(${zoom})` }}>
          <div className={`${styles.imageFrame} ${styles.imageFramePage}`}>
            {pages[currentPage - 1].image_url && (
              <img
                src={pages[currentPage - 1].image_url}
                alt={`Page ${currentPage}`}
                className={styles.pageImage}
              />
            )}
            {BGM_ENABLED && (
              <div className={styles.bgmCorner}>
                <BgmToggle playing={bgmPlaying} onToggle={toggleBgm} />
              </div>
            )}
          </div>
          <p className={styles.pageText}>
            {splitIntoBreathUnits(pages[currentPage - 1].text).map((line, i) => (
              <span key={i} className={styles.breathLine}>{line}</span>
            ))}
          </p>
        </div>
      )}

      {/* 네비게이션 */}
      <div className={styles.nav}>
        <Button
          variant="ghost"
          onClick={goToPrev}
          disabled={currentPage === 0}
        >
          ◀ 이전
        </Button>

        <div className={styles.pageIndicator}>
          {currentPage === 0 ? '표지' : `${currentPage} / ${totalPages}`}
        </div>

        <Button
          variant="ghost"
          onClick={goToNext}
          disabled={currentPage === totalPages}
        >
          다음 ▶
        </Button>
      </div>

      {/* 컨트롤 */}
      <div className={styles.controls}>
        <div className={styles.zoom}>
          <Button variant="ghost" size="small" onClick={() => setZoom(z => Math.max(0.5, z - 0.1))}>
            -
          </Button>
          <span>{Math.round(zoom * 100)}%</span>
          <Button variant="ghost" size="small" onClick={() => setZoom(z => Math.min(2, z + 0.1))}>
            +
          </Button>
        </div>

        <Button
          variant="primary"
          size="small"
          onClick={handleDownload}
          loading={downloading}
          disabled={downloading}
        >
          📥 PDF 다운로드
        </Button>
      </div>

      {/* 슬라이드 미리보기 */}
      <div className={styles.thumbnails}>
        <button
          className={`${styles.thumbnail} ${currentPage === 0 ? styles.active : ''}`}
          onClick={() => setCurrentPage(0)}
        >
          표지
        </button>
        {pages.map((_, index) => (
          <button
            key={index}
            className={`${styles.thumbnail} ${currentPage === index + 1 ? styles.active : ''}`}
            onClick={() => setCurrentPage(index + 1)}
          >
            {index + 1}
          </button>
        ))}
      </div>
    </div>
  )
}
