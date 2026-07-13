import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import Input from '../ui/Input'
import Button from '../ui/Button'
import styles from '../../styles/components/PhoneVerification.module.css'

// 무료 5페이지 체험의 중복 수령을 막기 위한 휴대폰 SMS 본인인증. 인증 성공 시 onVerified()를 호출한다.
export default function PhoneVerification({ onVerified }) {
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState('phone') // 'phone' | 'code'
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const authHeader = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }
  }

  const sendCode = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: await authHeader(),
        body: JSON.stringify({ phone }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '인증번호 발송에 실패했습니다.')
      setStep('code')
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  const verifyCode = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: await authHeader(),
        body: JSON.stringify({ phone, code }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '인증에 실패했습니다.')
      onVerified?.()
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  return (
    <div className={styles.box}>
      <p className={styles.title}>📱 무료 체험을 위한 휴대폰 인증</p>
      <p className={styles.hint}>한 번 가입해도 여러 이메일로 무료 체험을 반복하지 못하도록, 휴대폰 번호 하나당 무료 체험은 1회만 제공돼요.</p>

      {error && <div className={styles.error}>{error}</div>}

      {step === 'phone' ? (
        <form onSubmit={sendCode} className={styles.form}>
          <Input
            type="tel"
            placeholder="01012345678"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
          <Button type="submit" size="small" loading={loading}>인증번호 받기</Button>
        </form>
      ) : (
        <form onSubmit={verifyCode} className={styles.form}>
          <Input
            type="text"
            placeholder="인증번호 6자리"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          />
          <Button type="submit" size="small" loading={loading}>확인</Button>
          <button type="button" className={styles.resend} onClick={() => setStep('phone')}>
            번호 다시 입력
          </button>
        </form>
      )}
    </div>
  )
}
