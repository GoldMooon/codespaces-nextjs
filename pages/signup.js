import Head from 'next/head'
import Header from '../components/ui/Header'
import SignupForm from '../components/auth/SignupForm'
import Footer from '../components/ui/Footer'
import styles from '../styles/home.module.css'

export default function SignupPage() {
  return (
    <>
      <Head>
        <title>회원가입 | AI 동화책</title>
        <meta name="description" content="AI 동화책에 회원가입하세요" />
      </Head>

      <Header />

      <main className={styles.main}>
        <SignupForm />
      </main>

      <Footer />
    </>
  )
}
