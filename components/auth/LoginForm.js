import { useState } from 'react'
import { useRouter } from 'next/router'
import { supabase, isSupabaseConfigured } from '../../lib/supabase'
import styles from '../../styles/auth.module.css'
import Button from '../ui/Button'
import Input from '../ui/Input'

export default function LoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/books')
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <h2 className={styles.title}>로그인</h2>

      {error && <div className={styles.error}>{error}</div>}

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
        placeholder="••••••••"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />

      <Button type="submit" fullWidth loading={loading}>
        로그인
      </Button>

      <p className={styles.switchText}>
        계정이 없으신가요? <a href="/signup">회원가입</a>
      </p>
    </form>
  )
}