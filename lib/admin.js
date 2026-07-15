// 결제/구독 게이팅을 완전히 우회하는 운영자 계정 화이트리스트. 콤마 구분 ADMIN_EMAILS
// 환경변수로 추가 확장 가능(기본값은 이 계정 하나).
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'zshadowz@naver.com')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean)

export function isAdminEmail(email) {
  return !!email && ADMIN_EMAILS.includes(email.toLowerCase())
}
