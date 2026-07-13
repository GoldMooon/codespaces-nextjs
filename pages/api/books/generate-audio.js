import { createServerSupabase } from '../../../lib/supabase'
import { createOpenAI, generateSpeech } from '../../../lib/openai'
import { uploadAudioToStorage } from '../../../lib/storage'

// TTS 합성은 짧은 페이지 텍스트 하나 기준 몇 초 안에 끝나는 동기 호출이라
// 이미지 생성처럼 background/웹훅 구조가 필요 없다.
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

    // 이미 합성된 오디오가 있으면 재사용(중복 생성 방지)
    if (page.audio_url) {
      return res.status(200).json({ audioUrl: page.audio_url })
    }

    const text = (page.text || '').trim()
    if (!text) return res.status(400).json({ error: 'This page has no text to narrate' })

    const openai = createOpenAI()
    const audioBuffer = await generateSpeech(openai, text)
    const audioUrl = await uploadAudioToStorage(supabase, bookId, `page-${pageIndex + 1}`, audioBuffer)

    const { error: rpcError } = await supabase.rpc('set_page_audio', {
      p_book_id: bookId,
      p_page_index: pageIndex,
      p_url: audioUrl,
    })
    if (rpcError) throw rpcError

    return res.status(200).json({ audioUrl })
  } catch (error) {
    console.error('generate-audio error:', error)
    return res.status(500).json({ error: '음성 생성에 실패했습니다.', details: error.message })
  }
}
