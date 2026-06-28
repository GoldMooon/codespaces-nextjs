import Head from 'next/head'
import Header from '../components/ui/Header'
import LoginForm from '../components/auth/LoginForm'
import Footer from '../components/ui/Footer'
import styles from '../styles/home.module.css'

export default function LoginPage() {
  return (
    <>
      <Head>
        <title>로그인 | AI 동화책</title>
        <meta name="description" content="AI 동화책에 로그인하세요" />
      </Head>

      <Header />

      <main className={styles.main}>
        <LoginForm />
      </main>

      <Footer />
    </>
  )
}
