import { createServerSupabase } from '../../../lib/supabase'
import { createOpenAI } from '../../../lib/openai'
import { processImageJob } from '../../../lib/imageJobs'
import { ensurePageAudio } from '../../../lib/audioJobs'

// 웹훅이 아직 등록/도착하지 않은 경우를 위한 폴백 폴링 엔드포인트. process-image.js와 달리
// 여기서는 이미지를 "생성"하지 않고 이미 시작된 백그라운드 작업(image_generation_jobs)의
// 완료 여부만 조회(retrieveImageResult, 즉시 반환)하므로 생성 시간(최대 ~207초/high화질)과
// 무관하게 항상 빠르게 끝난다. 화질 설정과 상관없이 안전.
//
// 이미지 생성을 기다리는 동안(보통 TTS보다 훨씬 오래 걸림) 여유가 있으므로, 클라이언트가
// 이 엔드포인트를 폴링하는 김에 앞쪽 페이지 내레이션도 몇 장씩 미리 합성해둔다. 그러면
// 사용자가 실제로 읽기 시작할 때쯤엔 이미 캐시돼 있어 재생 버튼을 눌러도 지연이 거의 없다.
const AUDIO_PREGEN_PER_POLL = 2

export const config = {
  maxDuration: 30,
}

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

    const { bookId } = req.body
    if (!bookId) return res.status(400).json({ error: 'bookId is required' })

    const { data: book, error: bookError } = await supabase
      .from('books')
      .select('id, status, content')
      .eq('id', bookId)
      .eq('user_id', user.id)
      .single()

    if (bookError || !book) return res.status(404).json({ error: 'Book not found' })

    if (book.status === 'completed' || book.status === 'failed') {
      return res.status(200).json({ status: book.status, remaining: 0 })
    }

    const { data: jobs } = await supabase
      .from('image_generation_jobs')
      .select('*')
      .eq('book_id', bookId)
      .eq('status', 'in_progress')

    const openai = createOpenAI()
    await Promise.all((jobs || []).map((job) => processImageJob(supabase, openai, job)))

    const pagesNeedingAudio = (book.content?.pages || [])
      .map((page, index) => ({ page, index }))
      .filter(({ page }) => !page.audio_url && (page.text || '').trim())
      .slice(0, AUDIO_PREGEN_PER_POLL)

    await Promise.all(
      pagesNeedingAudio.map(({ page, index }) =>
        ensurePageAudio(supabase, openai, bookId, index, page).catch((e) =>
          console.error(`Audio pregen failed for page ${index}:`, e.message)
        )
      )
    )

    const { data: refreshed } = await supabase
      .from('books')
      .select('status')
      .eq('id', bookId)
      .single()

    const { count: remaining } = await supabase
      .from('image_generation_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('book_id', bookId)
      .eq('status', 'in_progress')

    return res.status(200).json({ status: refreshed?.status || book.status, remaining: remaining || 0 })
  } catch (error) {
    console.error('check-images error:', error)
    return res.status(500).json({ error: 'Failed to check images', details: error.message })
  }
}
