import { createServerSupabase } from '../../../lib/supabase'
import { sendSms } from '../../../lib/solapi'
import { generateOtpCode, hashOtpCode, hashPhoneNumber, otpExpiryDate } from '../../../lib/otp'

const PHONE_REGEX = /^01[0-9]-?\d{3,4}-?\d{4}$/

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

    const { phone } = req.body
    if (!phone || !PHONE_REGEX.test(phone)) {
      return res.status(400).json({ error: '올바른 휴대폰 번호를 입력해주세요.' })
    }

    // 이미 다른 계정이 이 번호로 무료 체험을 받았는지 미리 확인 (사용자 경험을 위해
    // 문자를 보내기 전에 먼저 걸러낸다 — 최종 확정은 verify-otp에서 UNIQUE 제약으로도 한 번 더 막음)
    const phoneHash = hashPhoneNumber(phone)
    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('phone_number_hash', phoneHash)
      .neq('id', user.id)
      .maybeSingle()

    if (existing) {
      return res.status(400).json({ error: '이미 다른 계정에서 사용된 휴대폰 번호입니다.' })
    }

    const code = generateOtpCode()

    await supabase.from('otp_verifications').insert({
      user_id: user.id,
      phone,
      code_hash: hashOtpCode(code),
      expires_at: otpExpiryDate().toISOString(),
    })

    await sendSms(phone, `[AI 동화책] 인증번호는 ${code}입니다. 5분 이내에 입력해주세요.`)

    return res.status(200).json({ success: true })
  } catch (error) {
    console.error('send-otp error:', error)
    return res.status(500).json({ error: '인증번호 발송에 실패했습니다.', details: error.message })
  }
}
