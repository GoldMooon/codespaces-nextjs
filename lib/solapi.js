// Solapi SMS 클라이언트 — 무료 5페이지 체험 티어의 중복 수령을 막기 위한 휴대폰 본인인증용.
// https://solapi.com/developers/api/start (HMAC-SHA256 인증)
import crypto from 'crypto'

const SOLAPI_BASE = 'https://api.solapi.com'

function buildAuthHeader() {
  const apiKey = process.env.SOLAPI_API_KEY
  const apiSecret = process.env.SOLAPI_API_SECRET
  if (!apiKey || !apiSecret) {
    throw new Error('SOLAPI_API_KEY/SOLAPI_API_SECRET이 설정되지 않았습니다.')
  }

  const date = new Date().toISOString()
  const salt = crypto.randomBytes(16).toString('hex')
  const signature = crypto.createHmac('sha256', apiSecret).update(date + salt).digest('hex')

  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`
}

/**
 * SMS 문자 발송
 * @param {string} to - 수신 번호 (하이픈 없이, 예: 01012345678)
 * @param {string} text - 메시지 본문 (SMS 90byte 이내 권장 — 한글은 2byte/자)
 */
export async function sendSms(to, text) {
  const from = process.env.SOLAPI_SENDER_NUMBER
  if (!from) {
    throw new Error('SOLAPI_SENDER_NUMBER가 설정되지 않았습니다 (Solapi 콘솔에서 발신번호 등록 필요).')
  }

  const response = await fetch(`${SOLAPI_BASE}/messages/v4/send`, {
    method: 'POST',
    headers: {
      Authorization: buildAuthHeader(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: { to: to.replace(/-/g, ''), from: from.replace(/-/g, ''), text },
    }),
  })

  const body = await response.json()
  if (!response.ok) {
    throw new Error(`Solapi 발송 실패 (${response.status}): ${body.errorMessage || JSON.stringify(body)}`)
  }
  return body
}
