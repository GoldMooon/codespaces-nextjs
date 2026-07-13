import { STORY_GENERATION_PROMPT, TEXT_MODEL, AGE_GROUPS, getAgeGroupGuidance, getCharacterInstruction, describeCharacterFromPhoto, COVER_IMAGE_PROMPT, buildImagePrompt, withSpeechBubble, withStoryText, startImageGeneration } from './openai'

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

/**
 * 동화책 텍스트를 생성하고 표지+전체 페이지 이미지 작업을 백그라운드로 시작한다.
 * pages/api/books/create.js(구독자/무료 티어의 즉시 생성)와
 * pages/api/payment/book-order/process.js(1회 결제 후 생성) 양쪽에서 공용으로 쓰는
 * 핵심 로직 — 결제 여부 판단(게이팅)은 호출하는 쪽 책임이고 이 함수는 "생성"만 담당한다.
 *
 * @param {Object} supabase - 서버 Supabase 클라이언트
 * @param {OpenAI} openai
 * @param {Object} params - { userId, title, category, theme, ageGroup, characterNames, characterPhotoUrl, pageCount }
 * @returns {Promise<Object>} 생성된 books 행
 */
export async function createBookAndStartImages(supabase, openai, params) {
  const { userId, title, category, theme, characterNames = '', pageCount = 24, characterPhotoUrl } = params
  const isPhotoBased = Boolean(characterPhotoUrl)
  const validAgeGroupIds = AGE_GROUPS.map((g) => g.id)
  const ageGroup = validAgeGroupIds.includes(params.ageGroup) ? params.ageGroup : 'preschool'

  const { data: book, error: bookError } = await supabase
    .from('books')
    .insert({
      user_id: userId,
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
    throw new Error('Failed to create book record')
  }

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

  // 텍스트(이미지 없는 페이지)를 먼저 저장 — 뷰어에서 글은 바로 읽을 수 있도록
  // style_guide도 함께 저장해 모든 삽화가 같은 화풍·등장인물로 그려지게 한다.
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

  // 표지 + 모든 페이지의 이미지 생성을 Responses API 백그라운드 모드로 "시작"만 시킨다.
  // 실제 생성 완료는 웹훅(/api/openai/webhook)이 비동기로 처리하고, 웹훅이 아직
  // 등록/도착하지 않은 경우를 대비해 클라이언트가 /api/books/check-images로도 폴백
  // 확인한다. high 화질(장당 최대 ~207초)도 이 방식이면 Vercel 함수 시간 제약과 무관.
  await startAllImageJobs(openai, supabase, book.id, { styleGuide, pages, title, category, textInImage })

  return book
}
