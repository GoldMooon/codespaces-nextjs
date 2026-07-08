// 순수 텍스트 가공 유틸 — fs 등 Node 전용 의존성이 없어 서버(lib/pdf-generator.js)와
// 클라이언트(components/book/BookViewer.js) 양쪽에서 안전하게 import할 수 있다.

// 텍스트를 쉼표·마침표·느낌표·물음표 뒤에서 끊어 "호흡 단위" 구절 배열로 만든다.
// 예: "비가 톡톡 내리자, 레오는 밖으로 폴짝 나갔어요." → ["비가 톡톡 내리자,", "레오는 밖으로 폴짝 나갔어요."]
export function splitIntoBreathUnits(text) {
  const matches = (text || '').match(/[^,.!?]*[,.!?]+|[^,.!?]+$/g) || []
  return matches.map((s) => s.trim()).filter(Boolean)
}
