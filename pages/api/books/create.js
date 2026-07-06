import { createServerSupabase } from '../../../lib/supabase'
import { createOpenAI, STORY_GENERATION_PROMPT, TEXT_MODEL } from '../../../lib/openai'

// 텍스트 생성만 동기 처리(~5초)하고 이미지는 별도 엔드포인트(process-image)가
// 1장씩 처리하므로 이 함수는 짧게 끝난다.
export const config = {
  maxDuration: 60,
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // 1. 인증 확인
    const authHeader = req.headers.authorization
    if (!authHeader) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const token = authHeader.replace('Bearer ', '')
    const supabase = createServerSupabase()

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid token' })
    }

    // 2. 사용자 프로필 및 크레딧 확인
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('credits, is_premium')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return res.status(400).json({ error: 'Profile not found' })
    }

    // 크레딧 또는 프리미엄 확인
    if (!profile.is_premium && profile.credits < 1) {
      return res.status(403).json({ error: 'Insufficient credits' })
    }

    // 3. 요청 데이터 파싱
    const { title, category, theme, pageCount = 10, isPhotoBased = false, characterPhotoUrl } = req.body

    if (!title || !theme) {
      return res.status(400).json({ error: 'Title and theme are required' })
    }

    // 4. 동화책 레코드 생성 (draft 상태)
    const { data: book, error: bookError } = await supabase
      .from('books')
      .insert({
        user_id: user.id,
        title,
        category,
        theme,
        page_count: pageCount,
        status: 'generating',
        is_photo_based: isPhotoBased,
        character_photo_url: characterPhotoUrl,
      })
      .select()
      .single()

    if (bookError || !book) {
      return res.status(500).json({ error: 'Failed to create book record' })
    }

    // 5. OpenAI로 텍스트 생성
    const openai = createOpenAI()
    const textPrompt = STORY_GENERATION_PROMPT
      .replace('{title}', title)
      .replace('{category}', category || '일반')
      .replace('{theme}', theme)
      .replace('{pageCount}', pageCount)

    const textResponse = await openai.chat.completions.create({
      model: TEXT_MODEL,
      messages: [{ role: 'user', content: textPrompt }],
      response_format: { type: 'json_object' },
      max_tokens: 4000,
    })

    const storyContent = JSON.parse(textResponse.choices[0].message.content)
    const pages = storyContent.pages || []
    const styleGuide = storyContent.style_guide || ''
    console.log('Story generated:', pages.length, 'pages')

    // 6. 텍스트(이미지 없는 페이지)를 먼저 저장 — 뷰어에서 글은 바로 읽을 수 있도록
    //    style_guide도 함께 저장해 모든 삽화가 같은 화풍·등장인물로 그려지게 한다.
    await supabase
      .from('books')
      .update({
        content: {
          style_guide: styleGuide,
          pages: pages.map((p) => ({ ...p, image_url: null })),
        },
      })
      .eq('id', book.id)

    // 7. 크레딧 차감 (프리미엄이 아닌 경우) — 텍스트 생성 성공 시점에 차감
    if (!profile.is_premium) {
      await supabase
        .from('profiles')
        .update({ credits: profile.credits - 1 })
        .eq('id', user.id)
    }

    // 8. 즉시 응답 — 이미지는 /api/books/process-image가 1장씩 생성하고
    //    /book/[id]가 완료될 때까지 폴링하며 트리거한다.
    return res.status(200).json({
      success: true,
      book: {
        id: book.id,
        title,
        category,
        status: 'generating',
      },
    })

  } catch (error) {
    console.error('Book creation error:', error)
    return res.status(500).json({
      error: 'Failed to create book',
      details: error.message
    })
  }
}