import { retrieveImageResult } from './openai'
import { uploadImageToStorage } from './storage'

/**
 * image_generation_jobs 한 건을 완료 처리한다 — OpenAI 결과를 가져와 Storage에 업로드하고
 * books 행(cover_image_url 또는 content.pages[i].image_url)을 갱신한 뒤, 모든 이미지가
 * 다 채워졌으면 책 상태를 'completed'로 바꾼다.
 * pages/api/openai/webhook.js(웹훅 수신)와 pages/api/books/check-images.js(폴백 폴링)
 * 양쪽에서 공용으로 사용 — 두 경로 모두 이 함수 하나로 수렴시켜 로직 중복을 없앤다.
 *
 * 페이지 이미지는 DB 함수 set_page_image()로 원자적으로 갱신한다 — background 모드 특성상
 * 여러 작업이 거의 동시에 끝나므로, 애플리케이션에서 content를 읽고-수정하고-쓰면 서로의
 * 갱신을 덮어쓸 수 있다(경쟁 상태). 표지는 단일 컬럼이라 일반 update로도 원자적이다.
 *
 * @param {Object} supabase - 서버 Supabase 클라이언트 (service role)
 * @param {OpenAI} openai - OpenAI 클라이언트
 * @param {Object} job - image_generation_jobs 행 { id, response_id, book_id, kind, page_index, status }
 * @returns {Promise<'completed'|'failed'|'skipped'>} 처리 결과
 */
export async function processImageJob(supabase, openai, job) {
  if (job.status !== 'in_progress') {
    return 'skipped' // 이미 처리된 작업(웹훅과 폴백 폴링이 동시에 도착하는 경쟁 상황 방지)
  }

  const result = await retrieveImageResult(openai, job.response_id)
  if (result.status === 'in_progress') {
    return 'skipped'
  }

  if (result.status === 'failed') {
    const where = job.kind === 'cover' ? 'cover' : `page ${job.page_index}`
    console.error(`Image generation failed (book ${job.book_id}, ${where}, ${job.response_id}): ${result.reason}`)
    await applyImageOutcome(supabase, job, '')
    await markJobStatus(supabase, job.id, 'failed')
    return 'failed'
  }

  try {
    const imageName = job.kind === 'cover' ? 'cover' : `page-${job.page_index + 1}`
    const url = await uploadImageToStorage(supabase, job.book_id, imageName, result.base64)
    await applyImageOutcome(supabase, job, url)
    await markJobStatus(supabase, job.id, 'completed')
    return 'completed'
  } catch (e) {
    console.error(`Image upload failed for job ${job.id}:`, e.message)
    await applyImageOutcome(supabase, job, '')
    await markJobStatus(supabase, job.id, 'failed')
    return 'failed'
  }
}

// 두 작업이 정확히 같은 타이밍에 이 함수를 통과해도 markJobStatus의 이전 상태 체크(위)와
// job.status 필터(위)가 이중 처리를 막아준다 — 여기서는 결과만 반영.
async function applyImageOutcome(supabase, job, url) {
  if (job.kind === 'cover') {
    await supabase.from('books').update({ cover_image_url: url }).eq('id', job.book_id)
  } else {
    const { error } = await supabase.rpc('set_page_image', {
      p_book_id: job.book_id,
      p_page_index: job.page_index,
      p_url: url,
    })
    if (error) throw error
  }

  const { data: book } = await supabase
    .from('books')
    .select('cover_image_url, content')
    .eq('id', job.book_id)
    .single()

  if (book && isBookFullyGenerated(book)) {
    await supabase.from('books').update({ status: 'completed' }).eq('id', job.book_id)
  }
}

async function markJobStatus(supabase, jobId, status) {
  await supabase.from('image_generation_jobs').update({ status }).eq('id', jobId)
}

function isBookFullyGenerated(book) {
  if (book.cover_image_url === null || book.cover_image_url === undefined) return false
  const pages = book.content?.pages || []
  if (pages.length === 0) return false
  return pages.every((p) => p.image_url !== null && p.image_url !== undefined)
}
