import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { trackEvent } from '../lib/analytics'
import Header from '../components/ui/Header'
import Footer from '../components/ui/Footer'
import Button from '../components/ui/Button'
import styles from '../styles/pricing.module.css'

const PLANS = [
  {
    id: 'monthly',
    name: '월간 구독',
    price: '₩295,000',
    period: '/월',
    description: '매달 새로운 동화책을 마음껏 만들어보세요',
    features: [
      '매달 동화책 최대 30권 (또는 총 960페이지 중 먼저 도달하는 조건)',
      '24~50페이지, 클릭 한 번으로 바로 생성 — 결제 없이',
      '텍스트 + 고화질 이미지 생성',
      'PDF 다운로드',
      '사진 기반 동화책',
      '우선 지원',
    ],
    notIncluded: [],
    priceId: process.env.NEXT_PUBLIC_POLAR_MONTHLY_PRODUCT_ID,
    buttonText: '월간 구독하기',
    variant: 'primary',
    popular: true,
  },
]

export default function PricingPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)

  useEffect(() => {
    const checkAuth = async () => {
      if (!isSupabaseConfigured()) {
        setLoading(false)
        return
      }

      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)

      if (user) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single()
        setProfile(profileData)
      }
      setLoading(false)
    }

    checkAuth()
  }, [])

  const handleSubscribe = async (priceId, productType) => {
    if (!user) {
      router.push('/login')
      return
    }

    setProcessing(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()

      const response = await fetch('/api/payment/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ priceId, productType })
      })

      const data = await response.json()

      if (data.checkoutUrl) {
        trackEvent('begin_checkout', { product_type: productType })
        window.location.href = data.checkoutUrl
      } else {
        alert('결제 세션 생성에 실패했습니다. Polar 제품 ID를 확인해주세요.')
      }
    } catch (error) {
      console.error('Payment error:', error)
      alert('결제 처리 중 오류가 발생했습니다.')
    }

    setProcessing(false)
  }

  return (
    <>
      <Head>
        <title>요금제 | AI 동화책</title>
        <meta name="description" content="AI 동화책 요금제를 확인하세요" />
      </Head>

      <Header />

      <main className={styles.main}>
        <div className={styles.container}>
          <h1 className={styles.title}>요금제 선택</h1>
          <p className={styles.subtitle}>
            당신의 창의력을 펼쳐보세요! 🎨
          </p>

          {profile?.is_premium ? (
            <div className={styles.premiumBadge}>
              ✅ 프리미엄 회원으로 활동 중입니다!
            </div>
          ) : (
            <div className={styles.creditsInfo}>
              {user ? (
                <p>구독 없이도 "동화책 만들기"에서 바로 결제하고 만들 수 있어요. 첫 5페이지는 무료 체험도 가능해요!</p>
              ) : (
                <p>구독하거나, 만들 때 바로 결제하고 나만의 동화책을 만들어보세요! <a href="/login">로그인</a></p>
              )}
            </div>
          )}

          {/* Subscription Plans */}
          <div className={styles.plans}>
            {PLANS.map((plan) => (
              <div
                key={plan.id}
                className={`${styles.plan} ${plan.popular ? styles.popular : ''}`}
              >
                {plan.popular && <span className={styles.popularBadge}>인기</span>}
                <h3 className={styles.planName}>{plan.name}</h3>
                <div className={styles.price}>
                  <span className={styles.amount}>{plan.price}</span>
                  <span className={styles.period}>{plan.period}</span>
                </div>
                <p className={styles.description}>{plan.description}</p>

                <ul className={styles.features}>
                  {plan.features.map((feature, i) => (
                    <li key={i} className={styles.feature}>
                      ✅ {feature}
                    </li>
                  ))}
                  {plan.notIncluded.map((feature, i) => (
                    <li key={i} className={`${styles.feature} ${styles.notIncluded}`}>
                      ❌ {feature}
                    </li>
                  ))}
                </ul>

                <Button
                  variant={plan.variant}
                  fullWidth
                  disabled={processing || profile?.is_premium}
                  loading={processing}
                  onClick={() => handleSubscribe(plan.priceId, 'subscription')}
                >
                  {plan.buttonText}
                </Button>
              </div>
            ))}
          </div>

          {/* One-time purchase info */}
          <h2 className={styles.sectionTitle}>구독 없이 1권만 만들고 싶다면</h2>
          <p className={styles.sectionSubtitle}>
            "동화책 만들기"에서 원하는 페이지 수(24~50p)를 고르고 만들기를 누르면, 그 자리에서 결제 후 바로 제작이 시작돼요.
            24~30p ₩10,340 · 31~40p ₩13,640 · 41~50p ₩16,930
          </p>

          {/* FAQ */}
          <div className={styles.faq}>
            <h2 className={styles.sectionTitle}>자주 묻는 질문</h2>

            <div className={styles.faqItem}>
              <h4>결제는 어떻게 되나요?</h4>
              <p>Polar를 통해 안전하게 결제됩니다. 월간 구독 또는 만들 때마다 1회 결제가 가능합니다.</p>
            </div>

            <div className={styles.faqItem}>
              <h4>구독은 언제 취소할 수 있나요?</h4>
              <p>언제든지 대시보드에서 구독을 취소할 수 있습니다. 취소해도 현재 기간 종료까지는 서비스를 이용할 수 있습니다.</p>
            </div>

            <div className={styles.faqItem}>
              <h4>PDF 파일은 어디서 볼 수 있나요?</h4>
              <p>동화책 뷰어 페이지에서 PDF를 다운로드할 수 있습니다.</p>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </>
  )
}