import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import Header from '../components/ui/Header'
import Footer from '../components/ui/Footer'
import Button from '../components/ui/Button'
import PhotoUploader from '../components/photo/PhotoUploader'
import CategorySelect from '../components/book/CategorySelect'
import AgeGroupSelect from '../components/book/AgeGroupSelect'
import ThemeInput from '../components/book/ThemeInput'
import GenerationProgress from '../components/book/GenerationProgress'
import styles from '../styles/create.module.css'

export default function CreatePage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  // Form state
  const [photoUrl, setPhotoUrl] = useState('')
  const [photoUploading, setPhotoUploading] = useState(false)
  const [category, setCategory] = useState('')
  const [ageGroup, setAgeGroup] = useState('preschool')
  const [title, setTitle] = useState('')
  const [theme, setTheme] = useState('')
  const [characterNames, setCharacterNames] = useState('')
  const [pageCount, setPageCount] = useState(10)

  // Generation state
  const [generating, setGenerating] = useState(false)
  const [currentStep, setCurrentStep] = useState('')
  const [error, setError] = useState('')
  const [createdBook, setCreatedBook] = useState(null)

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

      // Fetch profile
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
    setError('')
    setPhotoUploading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setPhotoUploading(false)
      return
    }

    const fileName = `${user.id}/${Date.now()}-${file.name}`
    const { error: uploadError } = await supabase.storage
      .from('character-photos')
      .upload(fileName, file)

    if (uploadError) {
      console.error('Upload error:', uploadError)
      setError('사진 업로드에 실패했습니다.')
      setPhotoUploading(false)
      return
    }

    const { data: { publicUrl } } = supabase.storage
      .from('character-photos')
      .getPublicUrl(fileName)

    setPhotoUrl(publicUrl)
    setPhotoUploading(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

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
      // Get session token
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
        return
      }

      // Call API to create book
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
          ageGroup,
          theme: theme.trim(),
          characterNames: characterNames.trim(),
          characterPhotoUrl: photoUrl || undefined,
          pageCount,
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || '동화책 생성에 실패했습니다.')
      }

      setCurrentStep('complete')
      setCreatedBook(data.book)

      // 텍스트 생성 완료 — 이미지는 백그라운드에서 계속 생성된다.
      // 책 페이지로 이동하면 거기서 완료까지 자동 폴링한다.
      router.push(`/book/${data.book.id}`)

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
            만들고 싶은 동화책을 설명해주세요. 사진을 올리면 그 인물이 주인공이 되고,
            올리지 않아도 AI가 어울리는 주인공을 만들어드려요!
          </p>

          {/* 크레딧 정보 */}
          {!profile?.is_premium && (
            <div className={styles.creditInfo}>
              <span>보유 크레딧: </span>
              <strong>{profile?.credits || 0}권</strong>
              {profile?.credits < 1 && (
                <Button
                  variant="outline"
                  size="small"
                  onClick={() => router.push('/pricing')}
                  style={{ marginLeft: '12px' }}
                >
                  크레딧 구매하기
                </Button>
              )}
            </div>
          )}

          {generating ? (
            <div className={styles.generationContainer}>
              <GenerationProgress currentStep={currentStep} />

              {error && (
                <div className={styles.error}>
                  <p>{error}</p>
                  <Button onClick={() => {
                    setGenerating(false)
                    setError('')
                  }}>
                    다시 시도
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <form className={styles.form} onSubmit={handleSubmit}>
              <div className={styles.section}>
                <label className={styles.label}>주인공 사진 (선택사항)</label>
                <PhotoUploader onFileSelect={handlePhotoSelect} />
                {photoUploading && <p className={styles.hint}>업로드 중...</p>}
                {photoUrl && !photoUploading && (
                  <p className={styles.successText}>
                    ✅ 사진이 업로드되었습니다! 이 사진 속 인물이 주인공이 돼요.
                  </p>
                )}
              </div>

              <div className={styles.section}>
                <CategorySelect value={category} onChange={setCategory} />
              </div>

              <div className={styles.section}>
                <AgeGroupSelect value={ageGroup} onChange={setAgeGroup} />
              </div>

              <div className={styles.section}>
                <ThemeInput
                  title={title}
                  setTitle={setTitle}
                  theme={theme}
                  setTheme={setTheme}
                  characterNames={characterNames}
                  setCharacterNames={setCharacterNames}
                  pageCount={pageCount}
                  setPageCount={setPageCount}
                />
              </div>

              {error && <div className={styles.error}>{error}</div>}

              <div className={styles.actions}>
                <Button
                  type="submit"
                  size="large"
                  disabled={(profile?.credits < 1 && !profile?.is_premium) || photoUploading}
                >
                  ✨ 동화책 만들기
                </Button>

                <p className={styles.hint}>
                  {profile?.is_premium
                    ? '프리미엄 회원: 무제한으로 즐기세요!'
                    : `보유 크레딧: ${profile?.credits || 0}회`}
                </p>
              </div>
            </form>
          )}
        </div>
      </main>

      <Footer />
    </>
  )
}