import { useState } from 'react'
import { useRouter } from 'next/router'
import { supabase, isSupabaseConfigured } from '../../lib/supabase'
import styles from '../../styles/auth.module.css'
import Button from '../ui/Button'
import Input from '../ui/Input'

export default function SignupForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!isSupabaseConfigured()) {
      setError('서버가 설정되지 않았습니다. 환경 변수를 확인해주세요.')
      return
    }

    setError('')
    setLoading(true)

    if (password.length < 6) {
      setError('비밀번호는 6자 이상이어야 합니다.')
      setLoading(false)
      return
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName }
      }
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      alert('회원가입이 완료되었습니다! 이메일을 확인하여 인증을 완료해주세요.')
      router.push('/login')
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <h2 className={styles.title}>회원가입</h2>
      <p className={styles.subtitle}>첫 번째 동화책을 만들어보세요! 🎉</p>

      {error && <div className={styles.error}>{error}</div>}

      <Input
        label="이름"
        type="text"
        placeholder="홍길동"
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        required
      />

      <Input
        label="이메일"
        type="email"
        placeholder="your@email.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />

      <Input
        label="비밀번호"
        type="password"
        placeholder="6자 이상"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />

      <Button type="submit" fullWidth loading={loading}>
        회원가입
      </Button>

      <p className={styles.switchText}>
        이미 계정이 있으신가요? <a href="/login">로그인</a>
      </p>
    </form>
  )
}