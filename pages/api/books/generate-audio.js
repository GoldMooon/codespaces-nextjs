import { createServerSupabase } from '../../../lib/supabase'
import { createOpenAI } from '../../../lib/openai'
import { ensurePageAudio } from '../../../lib/audioJobs'

// TTS 합성은 짧은 페이지 텍스트 하나 기준 몇 초 안에 끝나는 동기 호출이라
// 이미지 생성처럼 background/웹훅 구조가 필요 없다. (대부분의 경우 check-images.js가
// 이미지 대기 중에 선제적으로 미리 만들어두므로, 여기 도달할 때는 이미 캐시돼 있어 즉시 반환됨)
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

    const { bookId, pageIndex } = req.body
    if (!bookId || pageIndex === undefined) {
      return res.status(400).json({ error: 'bookId and pageIndex are required' })
    }

    const { data: book, error: bookError } = await supabase
      .from('books')
      .select('content')
      .eq('id', bookId)
      .eq('user_id', user.id)
      .single()

    if (bookError || !book) return res.status(404).json({ error: 'Book not found' })

    const page = book.content?.pages?.[pageIndex]
    if (!page) return res.status(400).json({ error: 'Invalid pageIndex' })

    const openai = createOpenAI()
    const audioUrl = await ensurePageAudio(supabase, openai, bookId, pageIndex, page)
    if (!audioUrl) return res.status(400).json({ error: 'This page has no text to narrate' })

    return res.status(200).json({ audioUrl })
  } catch (error) {
    console.error('generate-audio error:', error)
    return res.status(500).json({ error: '음성 생성에 실패했습니다.', details: error.message })
  }
}
