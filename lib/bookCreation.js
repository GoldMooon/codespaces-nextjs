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
 * books 행만 빠르게 만들어 즉시 반환한다(status='generating', content는 아직 없음).
 * 무거운 텍스트 생성은 generateBookContent()가 응답 후 백그라운드(waitUntil)에서 수행 —
 * 24~50페이지를 추론 모델로 생성하면 120초를 훌쩍 넘겨 Vercel 함수가 타임아웃되는 문제
 * (2026-07-15 프로덕션 실측: "Task timed out after 120 seconds") 때문에 분리했다.
 *
 * @param {Object} params - { userId, title, category, theme, ageGroup, characterNames, characterPhotoUrl, pageCount }
 * @returns {Promise<Object>} 생성된 books 행
 */
export async function createBookRecord(supabase, params) {
  const { userId, title, category, theme, pageCount = 24, characterPhotoUrl } = params
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
  return book
}

/**
 * 동화책 텍스트를 생성하고 표지+전체 페이지 이미지 작업을 백그라운드로 시작한다.
 * createBookRecord()로 만든 books 행을 받아 내용을 채우는 무거운 후반부 —
 * API 응답 이후 waitUntil() 안에서 실행되므로 직접 호출하지 말고 실패 처리까지 묶은
 * generateBookContentSafely()를 사용할 것.
 */
export async function generateBookContent(supabase, openai, book, params) {
  const { title, category, theme, characterNames = '', pageCount = 24, characterPhotoUrl } = params

  // 사진이 업로드된 경우, 사진 속 인물을 동화 그림체에 맞는 외형 묘사로 변환해
  // 주인공(항상 사진 속 인물)의 style_guide에 반영한다. 분석 실패 시 빈 문자열이
  // 반환되어 사진 없이 생성한 것처럼 자연스럽게 폴백된다.
  const photoDescription = characterPhotoUrl
    ? await describeCharacterFromPhoto(openai, characterPhotoUrl)
    : ''

  const textPrompt = STORY_GENERATION_PROMPT
    .replace('{title}', title)
    .replace('{category}', category || '일반')
    .replace('{theme}', theme)
    .replace('{pageCount}', pageCount)
    .replace('{ageGroupGuidance}', getAgeGroupGuidance(book.age_group))
    .replace('{characterInstruction}', getCharacterInstruction({ characterNames, photoDescription }))

  const textResponse = await openai.chat.completions.create({
    model: TEXT_MODEL,
    messages: [{ role: 'user', content: textPrompt }],
    response_format: { type: 'json_object' },
    // max_tokens는 최신 추론 모델(gpt-5.x 등)에서 지원되지 않아 max_completion_tokens 사용.
    // 추론 모델은 응답 전에 내부적으로 reasoning_tokens를 소모하고, 50페이지 책은 본문+
    // image_prompt+말풍선+말머리만으로 1만 토큰을 넘길 수 있어 크게 잡음(부족하면 JSON이
    // 중간에 잘려 파싱 실패 → 책 전체가 failed 처리됨).
    max_completion_tokens: 32000,
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
}

/**
 * generateBookContent()를 실패 처리까지 묶어 실행한다 — waitUntil() 안에서 돌므로
 * 여기서 놓친 예외는 어디에도 잡히지 않는다(unhandled rejection). 실패 시 books 행을
 * 'failed'로 표시해 뷰어 폴링이 실패 화면을 띄우게 하고, 호출측이 넘긴 onFailure로
 * 엔드포인트별 후처리(무료체험 기회 반환, 주문 실패 표시 등)를 수행한다.
 */
export async function generateBookContentSafely(supabase, openai, book, params, onFailure) {
  try {
    await generateBookContent(supabase, openai, book, params)
  } catch (error) {
    console.error(`Book ${book.id} content generation failed:`, error)
    try {
      await supabase.from('books').update({ status: 'failed' }).eq('id', book.id)
      if (onFailure) await onFailure(error)
    } catch (cleanupError) {
      console.error(`Book ${book.id} failure cleanup also failed:`, cleanupError)
    }
  }
}
