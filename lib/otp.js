import crypto from 'crypto'

const CODE_TTL_MS = 5 * 60 * 1000 // 5분
const MAX_ATTEMPTS = 5

export function generateOtpCode() {
  return String(crypto.randomInt(100000, 1000000)) // 6자리
}

export function hashOtpCode(code) {
  return crypto.createHash('sha256').update(code).digest('hex')
}

/** 전화번호를 정규화(하이픈 제거)한 뒤 해시 — profiles.phone_number_hash의 dedup 키로 사용 */
export function hashPhoneNumber(phone) {
  const normalized = phone.replace(/-/g, '')
  return crypto.createHash('sha256').update(normalized).digest('hex')
}

export function otpExpiryDate() {
  return new Date(Date.now() + CODE_TTL_MS)
}

export const OTP_MAX_ATTEMPTS = MAX_ATTEMPTS
