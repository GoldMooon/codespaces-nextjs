import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { supabase, isSupabaseConfigured } from '../../lib/supabase'
import Header from '../../components/ui/Header'
import Footer from '../../components/ui/Footer'
import Button from '../../components/ui/Button'
import PhotoUploader from '../../components/photo/PhotoUploader'
import CategorySelect from '../../components/book/CategorySelect'
import ThemeInput from '../../components/book/ThemeInput'
import GenerationProgress from '../../components/book/GenerationProgress'
import styles from '../../styles/create.module.css'

export default function PhotoCreatePage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  // Form state
  const [photoFile, setPhotoFile] = useState(null)
  const [photoUrl, setPhotoUrl] = useState('')
  const [category, setCategory] = useState('')
  const [title, setTitle] = useState('')
  const [theme, setTheme] = useState('')
  const [pageCount, setPageCount] = useState(10)

  // Generation state
  const [generating, setGenerating] = useState(false)
  const [currentStep, setCurrentStep] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const checkAuth = async () => {
      if (!isSupabaseConfigured()) {
        router.push('/login')
        return
      }

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      setUser(user)

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      setProfile(profileData)
      setLoading(false)
    }

    checkAuth()
  }, [router])

  const handlePhotoSelect = async (file) => {
    setPhotoFile(file)

    // Upload to Supabase Storage
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const fileName = `${user.id}/${Date.now()}-${file.name}`
    const { data, error } = await supabase.storage
      .from('character-photos')
      .upload(fileName, file)

    if (error) {
      console.error('Upload error:', error)
      setError('사진 업로드에 실패했습니다.')
      return
    }

    const { data: { publicUrl } } = supabase.storage
      .from('character-photos')
      .getPublicUrl(fileName)

    setPhotoUrl(publicUrl)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!photoUrl) {
      setError('사진을 업로드해주세요.')
      return
    }

    if (!category) {
      setError('카테고리를 선택해주세요.')
      return
    }

    if (!title.trim() || !theme.trim()) {
      setError('제목과 내용을 입력해주세요.')
      return
    }

    setError('')
    setGenerating(true)
    setCurrentStep('text')

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
        return
      }

      setCurrentStep('text')
      const response = await fetch('/api/books/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          title: title.trim(),
          category,
          theme: theme.trim(),
          pageCount,
          isPhotoBased: true,
          characterPhotoUrl: photoUrl,
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || '동화책 생성에 실패했습니다.')
      }

      setCurrentStep('complete')
      setTimeout(() => {
        router.push(`/book/${data.book.id}`)
      }, 2000)

    } catch (err) {
      console.error('Error:', err)
      setError(err.message)
      setGenerating(false)
      setCurrentStep('')
    }
  }

  if (loading) {
    return (
      <div className={styles.loading}>
        <p>로딩 중...</p>
      </div>
    )
  }

  return (
    <>
      <Head>
        <title>나만의 동화책 만들기 | AI 동화책</title>
      </Head>

      <Header />

      <main className={styles.main}>
        <div className={styles.container}>
          <h1 className={styles.pageTitle}>📸 나만의 동화책 만들기</h1>
          <p className={styles.pageSubtitle}>
            사진을 업로드하면 주인공이 그 동화책에 등장해요!
          </p>

          {generating ? (
            <div className={styles.generationContainer}>
              <GenerationProgress currentStep={currentStep} />
              {error && (
                <div className={styles.error}>
                  <p>{error}</p>
                  <Button onClick={() => {
                    setGenerating(false)
                    setError('')
                  }}>다시 시도</Button>
                </div>
              )}
            </div>
          ) : (
            <form className={styles.form} onSubmit={handleSubmit}>
              {/* 사진 업로드 */}
              <div className={styles.section}>
                <label className={styles.label}>주인공/등장인물 사진</label>
                <PhotoUploader onFileSelect={handlePhotoSelect} />
                {photoUrl && (
                  <p className={styles.successText}>
                    ✅ 사진이 업로드되었습니다!
                  </p>
                )}
              </div>

              {/* 카테고리 */}
              <div className={styles.section}>
                <CategorySelect value={category} onChange={setCategory} />
              </div>

              {/* 테마 입력 */}
              <div className={styles.section}>
                <ThemeInput
                  title={title}
                  setTitle={setTitle}
                  theme={theme}
                  setTheme={setTheme}
                  pageCount={pageCount}
                  setPageCount={setPageCount}
                />
              </div>

              {error && <div className={styles.error}>{error}</div>}

              <div className={styles.actions}>
                <Button
                  type="submit"
                  size="large"
                  disabled={profile?.credits < 1 && !profile?.is_premium}
                >
                  📸 나만의 동화책 만들기
                </Button>
              </div>
            </form>
          )}
        </div>
      </main>

      <Footer />
    </>
  )
}