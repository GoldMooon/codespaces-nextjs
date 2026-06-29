import { createServerSupabase } from '../../../lib/supabase'
import { createOpenAI, COVER_IMAGE_PROMPT, generateImage } from '../../../lib/openai'
import { uploadImageToStorage } from '../../../lib/storage'

// 이미지 1장만 생성하므로 단일 요청은 ~50-60초. 함수 한도 안에서 안전하게 끝난다.
export const config = {
  maxDuration: 120,
}

/**
 * 동화책의 "다음 미완성 이미지 1장"을 생성한다.
 * 표지 → 페이지 순으로 하나씩 처리하며, 프론트가 완료될 때까지 반복 호출한다.
 * 응답: { status: 'generating'|'completed'|'failed', remaining: number }
 */
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

    // 본인 책만 조회
    const { data: book, error: bookError } = await supabase
      .from('books')
      .select('*')
      .eq('id', bookId)
      .eq('user_id', user.id)
      .single()

    if (bookError || !book) return res.status(404).json({ error: 'Book not found' })

    if (book.status === 'completed') {
      return res.status(200).json({ status: 'completed', remaining: 0 })
    }

    const openai = createOpenAI()
    const pages = book.content?.pages || []

    // 1) 표지가 아직 없으면 표지부터 생성
    if (!book.cover_image_url) {
      const coverPrompt = COVER_IMAGE_PROMPT
        .replace('{title}', book.title)
        .replace('{category}', book.category || '일반')
      try {
        const b64 = await generateImage(openai, coverPrompt, { size: '1024x1024', quality: 'low' })
        const url = await uploadImageToStorage(supabase, book.id, 'cover', b64)
        await supabase.from('books').update({ cover_image_url: url }).eq('id', book.id)
      } catch (e) {
        console.error('Cover generation failed:', e.message)
        // 표지는 실패해도 본문 진행 — 빈 문자열로 표시해 무한 재시도 방지
        await supabase.from('books').update({ cover_image_url: '' }).eq('id', book.id)
      }
      const remaining = pages.filter((p) => !p.image_url).length
      return res.status(200).json({ status: 'generating', remaining: remaining + 1 })
    }

    // 2) 이미지가 없는 다음 페이지들을 한 번에 BATCH장씩 병렬 생성
    //    (low 화질 ~20초 × 병렬이라 호출당 ~25-30초로 함수 한도 안에서 안전)
    const BATCH = 3
    const todo = []
    for (let i = 0; i < pages.length && todo.length < BATCH; i++) {
      if (pages[i].image_url === null || pages[i].image_url === undefined) todo.push(i)
    }

    if (todo.length === 0) {
      // 모든 이미지 완료 → 완료 처리
      await supabase.from('books').update({ status: 'completed' }).eq('id', book.id)
      return res.status(200).json({ status: 'completed', remaining: 0 })
    }

    await Promise.all(
      todo.map(async (idx) => {
        const page = pages[idx]
        try {
          const b64 = await generateImage(openai, page.image_prompt, { size: '1024x1024', quality: 'low' })
          const url = await uploadImageToStorage(supabase, book.id, `page-${page.page}`, b64)
          pages[idx] = { ...page, image_url: url }
        } catch (e) {
          console.error(`Page ${page.page} generation failed:`, e.message)
          // 실패한 페이지는 빈 문자열로 표시해 다음으로 진행 (null이 아니므로 재시도 안 함)
          pages[idx] = { ...page, image_url: '' }
        }
      })
    )

    const remaining = pages.filter((p) => p.image_url === null || p.image_url === undefined).length
    const allDone = remaining === 0

    await supabase
      .from('books')
      .update({
        content: { pages },
        ...(allDone ? { status: 'completed' } : {}),
      })
      .eq('id', book.id)

    return res.status(200).json({
      status: allDone ? 'completed' : 'generating',
      remaining,
    })

  } catch (error) {
    console.error('process-image error:', error)
    return res.status(500).json({ error: 'Failed to process image', details: error.message })
  }
}
