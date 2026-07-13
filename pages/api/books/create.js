import { createServerSupabase } from '../../../lib/supabase'
import { createOpenAI, STORY_GENERATION_PROMPT, TEXT_MODEL, AGE_GROUPS, getAgeGroupGuidance, getCharacterInstruction, describeCharacterFromPhoto, moderateContent, COVER_IMAGE_PROMPT, buildImagePrompt, withSpeechBubble, withStoryText, startImageGeneration } from '../../../lib/openai'

// 텍스트는 동기 생성하고, 이미지는 Responses API의 background 모드로 전부 "시작"만 시킨 뒤
// (완료는 웹훅/폴백폴링이 비동기로 처리) 응답한다. 텍스트 생성(추론 모델, 최대 ~58초 실측)
// + 최대 51개(50페이지+표지) 이미지 작업 시작(각 ~2초, 청크 병렬)까지 감안해 넉넉히 잡음.
export const config = {
  maxDuration: 120,
}

// 이미지 생성 "시작" 요청을 한 번에 몇 개까지 동시에 보낼지 — OpenAI 요청 한도 보호용.
// 실제 이미지 생성 자체는 OpenAI 쪽 백그라운드에서 처리되므로 이 값은 응답 속도와 무관.
const JOB_START_CONCURRENCY = 8

async function startAllImageJobs(openai, supabase, bookId, { styleGuide, pages, title, category, textInImage }) {
  const jobInserts = []

  const coverScene = COVER_IMAGE_PROMPT.replace('{title}', title).replace('{category}', category || '일반')
  try {
    const job = await startImageGeneration(openai, buildImagePrompt(styleGuide, coverScene))
    jobInserts.push({ response_id: job.id, book_id: bookId, kind: 'cover', page_index: null })
  } catch (e) {
    console.error('Cover image job start failed:', e.message)
    await supabase.from('books').update({ cover_image_url: '' }).eq('id', bookId)
  }

  for (let i = 0; i < pages.length; i += JOB_START_CONCURRENCY) {
    const chunk = pages.slice(i, i + JOB_START_CONCURRENCY)
    await Promise.all(chunk.map(async (page, offset) => {
      const idx = i + offset
      try {
        let scene = textInImage ? withStoryText(page.image_prompt, page.text) : page.image_prompt
        scene = withSpeechBubble(scene, page.speech_bubble)
        const job = await startImageGeneration(openai, buildImagePrompt(styleGuide, scene))
        jobInserts.push({ response_id: job.id, book_id: bookId, kind: 'page', page_index: idx })
      } catch (e) {
        console.error(`Page ${idx} image job start failed:`, e.message)
        await supabase.rpc('set_page_image', { p_book_id: bookId, p_page_index: idx, p_url: '' })
      }
    }))
  }

  if (jobInserts.length > 0) {
    await supabase.from('image_generation_jobs').insert(jobInserts)
  }
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

    // 2.5. 구독자 월 30권 소프트 캡 — 마진 분석(Stage 01) 기준 가격 책정(₩39,000/월)이
    //      "월 30권 사용"을 전제로 하므로 프리미엄 전체에 캡을 적용한다. (연간 구독은
    //      상품에서 제외됐지만 is_premium 플래그만으로 판정하므로 과거 가입자가 있어도 안전)
    if (profile.is_premium) {
      const startOfMonth = new Date()
      startOfMonth.setUTCDate(1)
      startOfMonth.setUTCHours(0, 0, 0, 0)

      const { count } = await supabase
        .from('books')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('created_at', startOfMonth.toISOString())

      if ((count || 0) >= 30) {
        return res.status(403).json({ error: '이번 달 생성 가능한 동화책 수(30권)를 모두 사용하셨습니다. 다음 달에 다시 이용해주세요.' })
      }
    }

    // 3. 요청 데이터 파싱 (사진은 선택사항 — characterPhotoUrl 존재 여부로 사진 기반 여부를 판단)
    const { title, category, theme, characterNames = '', pageCount = 24, characterPhotoUrl } = req.body
    const isPhotoBased = Boolean(characterPhotoUrl)
    const validAgeGroupIds = AGE_GROUPS.map((g) => g.id)
    const ageGroup = validAgeGroupIds.includes(req.body.ageGroup) ? req.body.ageGroup : 'preschool'

    if (!title || !theme) {
      return res.status(400).json({ error: 'Title and theme are required' })
    }

    // 3.5. 콘텐츠 안전 필터 — 아동 대상 서비스이므로 크레딧 차감·생성 전에 입력값부터 검사
    const openai = createOpenAI()
    const moderationInput = [title, theme, characterNames].filter(Boolean).join('\n')
    const moderation = await moderateContent(openai, moderationInput)
    if (moderation.flagged) {
      return res.status(400).json({ error: '입력하신 내용에 부적절한 표현이 포함되어 있어 동화책을 만들 수 없습니다. 내용을 수정해주세요.' })
    }

    // 4. 동화책 레코드 생성 (draft 상태)
    const { data: book, error: bookError } = await supabase
      .from('books')
      .insert({
        user_id: user.id,
        title,
        category,
        theme,
        age_group: ageGroup,
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

    // 5. OpenAI로 텍스트 생성 (openai 클라이언트는 위 3.5에서 이미 생성됨)

    // 사진이 업로드된 경우, 사진 속 인물을 동화 그림체에 맞는 외형 묘사로 변환해
    // 주인공(항상 사진 속 인물)의 style_guide에 반영한다. 분석 실패 시 빈 문자열이
    // 반환되어 사진 없이 생성한 것처럼 자연스럽게 폴백된다.
    const photoDescription = isPhotoBased
      ? await describeCharacterFromPhoto(openai, characterPhotoUrl)
      : ''

    const textPrompt = STORY_GENERATION_PROMPT
      .replace('{title}', title)
      .replace('{category}', category || '일반')
      .replace('{theme}', theme)
      .replace('{pageCount}', pageCount)
      .replace('{ageGroupGuidance}', getAgeGroupGuidance(ageGroup))
      .replace('{characterInstruction}', getCharacterInstruction({ characterNames, photoDescription }))

    const textResponse = await openai.chat.completions.create({
      model: TEXT_MODEL,
      messages: [{ role: 'user', content: textPrompt }],
      response_format: { type: 'json_object' },
      // max_tokens는 최신 추론 모델(gpt-5.x 등)에서 지원되지 않아 max_completion_tokens 사용.
      // 추론 모델은 응답 전에 내부적으로 reasoning_tokens를 소모하므로 여유 있게 잡음.
      max_completion_tokens: 8000,
    })

    const storyContent = JSON.parse(textResponse.choices[0].message.content)
    const pages = storyContent.pages || []
    const styleGuide = storyContent.style_guide || ''
    console.log('Story generated:', pages.length, 'pages')

    // 6. 텍스트(이미지 없는 페이지)를 먼저 저장 — 뷰어에서 글은 바로 읽을 수 있도록
    //    style_guide도 함께 저장해 모든 삽화가 같은 화풍·등장인물로 그려지게 한다.
    const textInImage = true // 동화 본문을 그림 안에 직접 렌더링하는 방식(실측 검증됨)
    await supabase
      .from('books')
      .update({
        content: {
          style_guide: styleGuide,
          pages: pages.map((p) => ({ ...p, image_url: null })),
          // 뷰어/PDF에서 이미지 아래에 텍스트를 중복으로 그리지 않도록 하는 플래그. 이 필드가
          // 없는 기존 책들은 하위호환을 위해 계속 텍스트를 별도로 표시한다.
          text_in_image: textInImage,
        },
      })
      .eq('id', book.id)

    // 6.5. 표지 + 모든 페이지의 이미지 생성을 Responses API 백그라운드 모드로 "시작"만 시킨다.
    //      실제 생성 완료는 웹훅(/api/openai/webhook)이 비동기로 처리하고, 웹훅이 아직
    //      등록/도착하지 않은 경우를 대비해 클라이언트가 /api/books/check-images로도 폴백
    //      확인한다. high 화질(장당 최대 ~207초)도 이 방식이면 Vercel 함수 시간 제약과 무관.
    await startAllImageJobs(openai, supabase, book.id, { styleGuide, pages, title, category, textInImage })

    // 7. 크레딧 차감 (프리미엄이 아닌 경우) — 텍스트 생성 성공 시점에 차감
    if (!profile.is_premium) {
      await supabase
        .from('profiles')
        .update({ credits: profile.credits - 1 })
        .eq('id', user.id)
    }

    // 8. 즉시 응답 — 이미지 작업은 이미 전부 백그라운드로 시작됐고, 완료는 웹훅/폴백폴링이
    //    비동기로 처리한다. 클라이언트는 book 행 상태만 폴링하면 된다.
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