import { createServerSupabase } from '../../../lib/supabase'
import { hashOtpCode, hashPhoneNumber, OTP_MAX_ATTEMPTS } from '../../../lib/otp'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const authHeader = req.headers.authorization
    if (!authHeader) return res.status(401).json({ error: 'Unauthorized' })

    const token = authHeader.replace('Bearer ', '')
    const supabase = createServerSupabase()
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) return res.status(401).json({ error: 'Invalid token' })

    const { phone, code } = req.body
    if (!phone || !code) {
      return res.status(400).json({ error: '휴대폰 번호와 인증번호를 입력해주세요.' })
    }

    const { data: verification } = await supabase
      .from('otp_verifications')
      .select('*')
      .eq('user_id', user.id)
      .eq('phone', phone)
      .is('verified_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!verification) {
      return res.status(400).json({ error: '인증 요청을 찾을 수 없습니다. 인증번호를 다시 받아주세요.' })
    }

    if (new Date(verification.expires_at) < new Date()) {
      return res.status(400).json({ error: '인증번호가 만료되었습니다. 다시 받아주세요.' })
    }

    if (verification.attempts >= OTP_MAX_ATTEMPTS) {
      return res.status(400).json({ error: '시도 횟수를 초과했습니다. 인증번호를 다시 받아주세요.' })
    }

    if (hashOtpCode(code) !== verification.code_hash) {
      await supabase
        .from('otp_verifications')
        .update({ attempts: verification.attempts + 1 })
        .eq('id', verification.id)
      return res.status(400).json({ error: '인증번호가 일치하지 않습니다.' })
    }

    await supabase
      .from('otp_verifications')
      .update({ verified_at: new Date().toISOString() })
      .eq('id', verification.id)

    const phoneHash = hashPhoneNumber(phone)
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ phone_number_hash: phoneHash, phone_verified: true })
      .eq('id', user.id)

    if (updateError) {
      // UNIQUE 제약 위반 = 인증 도중 다른 계정이 먼저 같은 번호를 선점한 경쟁 상황
      if (updateError.code === '23505') {
        return res.status(400).json({ error: '이미 다른 계정에서 사용된 휴대폰 번호입니다.' })
      }
      throw updateError
    }

    return res.status(200).json({ success: true })
  } catch (error) {
    console.error('verify-otp error:', error)
    return res.status(500).json({ error: '인증 확인에 실패했습니다.', details: error.message })
  }
}
