import { generateSpeech, buildNarrationScript } from './openai'
import { uploadAudioToStorage } from './storage'

/**
 * 페이지 하나의 내레이션 오디오를 준비한다 — 이미 있으면 그대로 반환(중복 생성 방지),
 * 없으면 합성·업로드·DB 반영까지 한 번에 처리한다.
 * pages/api/books/generate-audio.js(사용자가 재생 버튼을 눌렀을 때, 아직 없으면 그 자리에서
 * 생성)와 pages/api/books/check-images.js(이미지 생성 대기 중에 미리 만들어두는 선제 생성)
 * 양쪽에서 공용으로 쓴다.
 * @returns {Promise<string|null>} 오디오 URL (읽어줄 텍스트가 없으면 null)
 */
export async function ensurePageAudio(supabase, openai, bookId, pageIndex, page) {
  if (page.audio_url) return page.audio_url

  const script = buildNarrationScript(page)
  if (!script) return null

  const audioBuffer = await generateSpeech(openai, script)
  const url = await uploadAudioToStorage(supabase, bookId, `page-${pageIndex + 1}`, audioBuffer)

  const { error } = await supabase.rpc('set_page_audio', {
    p_book_id: bookId,
    p_page_index: pageIndex,
    p_url: url,
  })
  if (error) throw error

  return url
}
