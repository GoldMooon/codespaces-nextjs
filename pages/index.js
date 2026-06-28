import Head from 'next/head'
import Link from 'next/link'
import Header from '../components/ui/Header'
import Footer from '../components/ui/Footer'
import Button from '../components/ui/Button'
import styles from '../styles/home.module.css'

export default function Home() {
  return (
    <>
      <Head>
        <title>AI 동화책 | AI-powered Children's Book Generator</title>
        <meta name="description" content="AI가 동화책을 만들어드려요. 텍스트와 그림이 있는 나만의 동화책을 PDF로 다운로드하세요." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <Header />

      <main className={styles.main}>
        {/* Hero Section */}
        <section className={styles.hero}>
          <div className={styles.heroContent}>
            <h1 className={styles.heroTitle}>
              📖 AI가 동화책을<br /> 만들어드려요
            </h1>
            <p className={styles.heroSubtitle}>
              주제만 말하면 AI가 글을 쓰고 그림을 그려요.<br />
              나만의 특별한 동화책을 PDF로 다운로드하세요.
            </p>
            <div className={styles.heroActions}>
              <Link href="/create">
                <Button size="large">✨ 무료로 시작하기</Button>
              </Link>
              <Link href="/pricing">
                <Button variant="outline" size="large">요금제 보기</Button>
              </Link>
            </div>
            <p className={styles.heroHint}>첫 번째 동화책은 무료로 만들어드려요! 🎉</p>
          </div>
          <div className={styles.heroImage}>
            <div className={styles.heroBook}>
              <span className={styles.bookEmoji}>📚</span>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className={styles.features}>
          <h2 className={styles.sectionTitle}>어떻게 작동하나요?</h2>

          <div className={styles.featureGrid}>
            <div className={styles.featureCard}>
              <span className={styles.featureIcon}>✍️</span>
              <h3>주제 입력</h3>
              <p>만들고 싶은 동화책 주제를 말해주세요. 동물 이야기, 모험, 판타지 등 다양한 카테고리에서 선택할 수 있어요.</p>
            </div>

            <div className={styles.featureCard}>
              <span className={styles.featureIcon}>🤖</span>
              <h3>AI가 생성</h3>
              <p>OpenAI GPT-4가 동화책 텍스트를 쓰고, DALL-E가 각 페이지에 맞는 그림을 그려요.</p>
            </div>

            <div className={styles.featureCard}>
              <span className={styles.featureIcon}>📸</span>
              <h3>나만의 동화</h3>
              <p>사진을 업로드하면 그 인물이 동화책 주인공이 돼요! 특별한 추억을 동화책으로 만들어보세요.</p>
            </div>

            <div className={styles.featureCard}>
              <span className={styles.featureIcon}>📥</span>
              <h3>PDF 다운로드</h3>
              <p>완성된 동화책을 PDF로 다운로드할 수 있어요. 인쇄하거나 친구들에게 선물하세요.</p>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className={styles.cta}>
          <h2>지금 바로 첫 동화책을 만들어보세요!</h2>
          <p>첫 번째 동화책은 무료로 만들어드려요.</p>
          <Link href="/signup">
            <Button size="large">🚀 무료로 시작하기</Button>
          </Link>
        </section>

        {/* How It Works */}
        <section className={styles.howItWorks}>
          <h2 className={styles.sectionTitle}>동화책 만들기 과정</h2>

          <div className={styles.steps}>
            <div className={styles.step}>
              <span className={styles.stepNumber}>1</span>
              <div className={styles.stepContent}>
                <h3>카테고리 선택</h3>
                <p>동물, 판타지, 모험 등 다양한 카테고리 중 선택하거나 자유롭게 입력하세요.</p>
              </div>
            </div>

            <div className={styles.step}>
              <span className={styles.stepNumber}>2</span>
              <div className={styles.stepContent}>
                <h3>주제 입력</h3>
                <p>어떤 이야기를 만들어드릴지 설명해주세요. 예: "용감한 고양이가 위험에 빠진 친구를 구하는 이야기"</p>
              </div>
            </div>

            <div className={styles.step}>
              <span className={styles.stepNumber}>3</span>
              <div className={styles.stepContent}>
                <h3>AI가创作</h3>
                <p>잠시만 기다려주세요. AI가 동화책 텍스트와 그림을 생성합니다.</p>
              </div>
            </div>

            <div className={styles.step}>
              <span className={styles.stepNumber}>4</span>
              <div className={styles.stepContent}>
                <h3>완성 & 다운로드</h3>
                <p>동화책을 미리보기로 확인하고, 마음에 들면 PDF로 다운로드하세요!</p>
              </div>
            </div>
          </div>
        </section>

        {/* Photo-based Section */}
        <section className={styles.photoSection}>
          <div className={styles.photoContent}>
            <h2>📸 사진으로 나만의 동화책 만들기</h2>
            <p>
              아이 사진, 반려동물 사진, 또는 특별한 인물의 사진을 업로드하면<br />
              그들이 동화책 주인공이 됩니다!
            </p>
            <Link href="/my/photos">
              <Button variant="outline" size="large">📸 사진으로 만들기</Button>
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </>
  )
}
