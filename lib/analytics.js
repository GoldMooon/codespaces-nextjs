// GA4 클라이언트 유틸 — 순수 브라우저 전용, 서버 코드에서는 import하지 않는다.
// window.gtag가 없으면(로컬 개발, 측정 ID 미설정, 광고 차단 등) 조용히 무시해
// 애널리틱스 실패가 실제 기능에 영향을 주지 않게 한다.
export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID

export function pageview(url) {
  if (typeof window === 'undefined' || !window.gtag || !GA_MEASUREMENT_ID) return
  // 최초 로드 이후의 클라이언트 라우팅(SPA)에서는 'config' 재호출이 page_view를
  // 다시 전송하지 않는다(실측 확인 — Playwright로 네트워크 요청까지 검증) —
  // 반드시 명시적 'page_view' 이벤트로 보내야 함.
  window.gtag('event', 'page_view', {
    page_path: url,
    page_location: window.location.href,
    page_title: document.title,
  })
}

// 퍼널(가입→생성→결제) 이벤트는 GA4 권장 이벤트명을 그대로 사용해
// 표준 리포트(전환·퍼널 탐색)에서 바로 잡히도록 한다.
export function trackEvent(action, params = {}) {
  if (typeof window === 'undefined' || !window.gtag) return
  window.gtag('event', action, params)
}
