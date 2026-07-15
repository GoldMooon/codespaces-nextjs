import OpenAI from 'openai'

// Server-side client factory only - 클라이언트는 서버 사이드에서만 생성
export function createOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not set')
  }
  return new OpenAI({ apiKey })
}

// 모델/화질을 코드 수정 없이 .env.local에서 바꿀 수 있도록 환경변수로 노출
// (예: 텍스트 품질을 올리려면 OPENAI_TEXT_MODEL=gpt-4o, 이미지 속도/비용을 조절하려면
//  OPENAI_IMAGE_QUALITY=medium|high 등으로 변경)
export const TEXT_MODEL = process.env.OPENAI_TEXT_MODEL || 'gpt-4o-mini'
// 스토리 생성 완성 토큰 상한 — 모델마다 허용 최대치가 달라(gpt-4o-mini는 16,384) 하드코딩하면
// 모델 전환 시 400 invalid_value로 생성이 전부 실패한다(2026-07-15 프리뷰에서 32000으로 실측).
// 기본값은 gpt-4o-mini 한도 안에서 최대한 크게 잡고, 더 큰 한도를 지원하는 모델(gpt-5.5 등)을
// 쓸 때는 OPENAI_TEXT_MAX_COMPLETION_TOKENS 환경변수로 올린다. 추론 모델은 reasoning 토큰도
// 이 예산을 함께 쓰므로 가능한 한 크게 주는 게 좋다.
export const TEXT_MAX_COMPLETION_TOKENS = parseInt(process.env.OPENAI_TEXT_MAX_COMPLETION_TOKENS, 10) || 16000
export const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2'
export const IMAGE_QUALITY = process.env.OPENAI_IMAGE_QUALITY || 'low'
export const TTS_MODEL = process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts'
// coral: 따뜻하고 표현력 있는 톤이라 shimmer보다 "어린이집 선생님" 느낌에 더 가까움(2026-07-13 변경)
export const TTS_VOICE = process.env.OPENAI_TTS_VOICE || 'coral'

// 독자 연령대 — 각 값에 맞춰 어휘/문장 길이/줄거리 복잡도를 조절한다
export const AGE_GROUPS = [
  { id: 'toddler', name: '영유아 (0~5세)', emoji: '🍼', description: '아주 쉬운 단어, 짧고 반복적인 문장' },
  { id: 'preschool', name: '유치원생 (5~7세)', emoji: '🎒', description: '쉬운 어휘, 간단한 줄거리' },
  { id: 'elementary', name: '초등학생 (8~13세)', emoji: '📚', description: '풍부한 어휘, 완결된 이야기 구조' },
]

// 연령대별 문체 가이드 — STORY_GENERATION_PROMPT의 {ageGroupGuidance}에 삽입된다
const AGE_GROUP_GUIDANCE = {
  toddler: `- 독자: 영유아(0~5세). 한 페이지당 1~2개의 아주 짧은 문장(5~8단어 내외)만 사용.
- 쉬운 낱말만 사용하고 추상적인 개념·어려운 어휘는 피할 것.
- "폴짝폴짝", "두근두근" 같은 의성어·의태어를 적극적으로 활용해 리듬감을 줄 것.
- 줄거리는 아주 단순하게: 갈등이나 긴장감보다는 반복되는 즐거운 상황 위주로 구성.`,
  preschool: `- 독자: 유치원생(5~7세). 한 페이지당 2~3개의 짧고 명확한 문장.
- 쉬운 일상 어휘 위주로 쓰되, 약간의 새로운 낱말은 문맥으로 뜻을 유추할 수 있게 자연스럽게 녹여낼 것.
- 간단한 인과관계(이래서 저랬다)가 드러나는 줄거리로 구성하고, 의성어·의태어도 적절히 사용.
- 우정, 용기, 배려 같은 교훈을 설교조가 아니라 이야기 속 행동으로 자연스럽게 보여줄 것.`,
  elementary: `- 독자: 초등학생(8~13세). 한 페이지당 2~4개의 문장, 풍부한 어휘와 구체적인 묘사 사용 가능.
- 기승전결이 뚜렷한 완결된 서사 구조로 구성하고, 등장인물의 감정 변화나 성장이 드러나게 할 것.
- 약간의 긴장감·갈등 요소를 넣어도 좋으나 아이들에게 적합한 수위를 유지할 것.
- 상황에 맞는 자연스러운 대화체를 활용해 생동감을 줄 것.`,
}

/**
 * ageGroup id에 해당하는 문체 가이드를 반환한다. 알 수 없는 값이면 preschool로 폴백.
 * @param {string} ageGroup - AGE_GROUPS의 id 중 하나
 */
export function getAgeGroupGuidance(ageGroup) {
  return AGE_GROUP_GUIDANCE[ageGroup] || AGE_GROUP_GUIDANCE.preschool
}

/**
 * 사용자가 지정한 등장인물 이름 + (있다면) 업로드한 사진 기반 주인공 정보를
 * 프롬프트에 삽입할 지시문으로 변환한다.
 * 사진이 있으면 그 인물이 항상 주인공이 되고, 지정된 이름 중 첫 번째가 그 주인공의 이름이 된다.
 * @param {Object} params
 * @param {string} params.characterNames - 쉼표로 구분된 이름 목록 (예: "토리, 폭시"), 빈 문자열 가능
 * @param {string} params.photoDescription - describeCharacterFromPhoto()가 반환한 영어 외형 묘사, 빈 문자열 가능
 */
export function getCharacterInstruction({ characterNames, photoDescription } = {}) {
  const names = (characterNames || '')
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean)

  if (photoDescription) {
    const protagonistName = names[0]
    const lines = [
      `- 이 동화의 주인공은 사용자가 업로드한 실제 사진 속 인물을 바탕으로 합니다. style_guide의 MAIN CHARACTER 외형 묘사에 다음 특징을 반드시 반영하세요(사진 그대로가 아니라 아래 화풍으로 귀엽게 재해석): ${photoDescription}`,
      protagonistName
        ? `- 이 주인공의 이름은 정확히 "${protagonistName}"로 하세요.`
        : '- 이 주인공에게 이야기와 어울리는 이름을 자유롭게 지어주세요.',
      '- 이 주인공은 이야기 전체에서 가장 비중 있게 등장해야 하며, 모든 페이지에서 style_guide에 기재한 외형을 동일하게 유지하세요.',
    ]
    if (names.length > 1) {
      lines.push(`- 추가로 다음 이름의 조연도 등장시키세요: ${names.slice(1).join(', ')}. 이 조연들도 style_guide에 고정 외형을 기재하고 이름 그대로 사용하세요.`)
    }
    return lines.join('\n')
  }

  if (names.length === 0) {
    return '- 사용자가 지정한 이름이 없습니다. 이야기와 어울리는 이름을 자유롭게 지어주세요.'
  }

  return `- 사용자가 다음 이름을 지정했습니다: ${names.join(', ')}.
- 등장 비중이 큰 주인공부터 순서대로 이 이름들을 배정해 style_guide와 모든 페이지(text, image_prompt, speech_bubble)에서 정확히 이 이름 그대로 사용하세요(다른 이름으로 바꾸거나 변형하지 말 것).
- 지정된 이름보다 등장인물이 더 필요하면, 나머지 조연은 자유롭게 이름을 지어도 됩니다.`
}

/**
 * 장면 묘사(scene) 뒤에 말풍선 대사 렌더링 지시를 덧붙인다.
 * 대사가 비어있으면 원본 scene을 그대로 반환한다.
 * @param {string} scene - 영어 장면 묘사
 * @param {string} speechBubble - 한국어 말풍선 대사 (빈 문자열 가능)
 */
export function withSpeechBubble(scene, speechBubble) {
  const line = (speechBubble || '').trim()
  if (!line) return scene
  return `${scene} Include a simple, clearly legible hand-drawn comic-style speech bubble in the scene containing this exact Korean text: "${line}". Render the Korean text accurately and legibly inside the bubble.`
}

/**
 * 장면 묘사(scene) 뒤에 그 페이지의 동화 본문(text)을 그림 안에 직접 그려 넣으라는 지시를 덧붙인다.
 * gpt-image-2가 한글을 정확하게 렌더링하는 것을 실측 확인(2026-07-11, 5/5 성공)한 뒤 채택한 방식 —
 * 화면 뷰어/PDF에서 이미지 아래에 별도로 텍스트를 다시 그리지 않고, 그림 자체가 완결된 동화책 페이지가 된다.
 * @param {string} scene - 영어 장면 묘사
 * @param {string} text - 그 페이지의 한국어 동화 본문
 */
export function withStoryText(scene, text) {
  const line = (text || '').trim()
  if (!line) return scene
  return `${scene} Also render the following Korean storybook text directly inside the illustration itself, as a natural integrated caption (like a real printed children's picture book page) placed in a clear open area of the composition (sky, ground, wall, or other blank space) — not as a separate bar or box, exactly as given, in a warm, rounded, clearly legible hand-lettered style that matches the illustration's mood: "${line}"`
}

// 동화책 텍스트 생성 프롬프트
export const STORY_GENERATION_PROMPT = `당신은 동화책 작가이자 일러스트 아트 디렉터입니다. 다음 정보를 바탕으로 동화책을 작성하고, 모든 삽화가 동일한 그림체와 동일한 등장인물로 그려지도록 일관된 아트 가이드를 만들어주세요.

제목: {title}
카테고리: {category}
주제/내용: {theme}
페이지 수: {pageCount}페이지

★ 독자 연령대에 맞춘 문체 (반드시 지킬 것):
{ageGroupGuidance}

요구사항:
1. 위 연령대 가이드에 맞는 길이·어휘 수준으로 각 페이지 텍스트를 작성
2. 마지막 페이지는 행복한 결말로 마무리
3. 아이들이 즐겁게 읽을 수 있는 따뜻한 톤

★ 이야기의 자연스러운 연결 (매우 중요 — 페이지들이 뚝뚝 끊긴 장면 나열이 아니라 하나의 이야기로 읽혀야 함):
- 등장인물의 이름·성격·말투를 처음 등장부터 끝까지 일관되게 유지하세요. 한번 이름을 붙였으면 이후 모든 페이지에서 같은 이름으로 지칭할 것.
- 각 페이지는 바로 앞 페이지에서 일어난 일(행동·감정·장소 이동)을 직접 이어받아 시작하세요. "그리고 나서", "그러자" 같은 인과관계가 독자에게 느껴지도록 사건을 순차적으로 쌓아올릴 것 — 서로 무관한 에피소드를 나열하지 마세요.
- 이야기 초반에 등장한 소품·약속·궁금증(예: "저 언덕 너머엔 뭐가 있을까?")이 있다면 후반 페이지에서 자연스럽게 회수하거나 답을 줄 것.
- 등장인물이 여러 명이면, 조연도 처음 등장한 순간부터 style_guide에 고정 외형으로 기재하고 이후 페이지에서도 같은 이름·외형으로 계속 등장시킬 것(중간에 이름 없이 사라지듯 처리하지 말 것).
- 각 페이지의 image_prompt(장면 묘사)도 바로 이전 페이지의 장소·시간대·분위기에서 자연스럽게 이어지도록 작성하세요(갑자기 다른 장소/시간대로 설명 없이 점프하지 말 것).

★ 등장인물:
{characterInstruction}

★ 이미지 일관성 (매우 중요 — 모든 그림이 같은 그림체와 같은 주인공으로 보여야 함):
- "style_guide" 필드를 반드시 영어로 작성하세요. 여기에는 (a) 모든 페이지에 공통 적용할 화풍과 (b) 등장인물 전원의 고정된 외형을 매우 구체적으로 적습니다.
  · 화풍 예시: "Soft watercolor children's picture book illustration, warm pastel palette, gentle rounded outlines, cozy storybook lighting, same consistent art style on every page."
  · 등장인물 예시: 이름·종/나이·털·눈 색·의상·소품 등 고정 특징을 명시 — "MAIN CHARACTER Tori: a small round white rabbit with long floppy ears, big sky-blue eyes, wearing a red knitted scarf and a tiny brown backpack." 조연도 모두 동일하게 고정.
- 각 페이지의 "image_prompt"에는 그 장면(배경·행동·구도)만 영어로 묘사하세요. 등장인물은 style_guide에서 정한 이름과 외형을 그대로 사용해 동일 인물임이 드러나게 하고, 새로운 외형 묘사나 다른 화풍을 절대 추가하지 마세요.
- image_prompt에 화풍 설명을 반복하지 마세요. style_guide가 모든 image_prompt 앞에 자동으로 결합됩니다.

★ 말풍선 (생생함을 위해 각 페이지 그림에 삽입):
- "speech_bubble" 필드에 그 페이지에서 캐릭터가 실제로 말할 법한 아주 짧은 한국어 대사 한 줄(4~10자 내외, 느낌표/물음표 활용 가능)을 작성하세요. 예: "빨리 와!", "저게 뭐지?", "우리 해냈어!"
- 대사는 반드시 그 페이지의 text(본문) 내용 및 image_prompt(장면)와 자연스럽게 맞아떨어져야 합니다.
- 정말 대사가 어울리지 않는 조용한 장면(예: 표지, 풍경 묘사 페이지)이라면 빈 문자열 ""로 남겨도 됩니다.

★ 내레이션 말머리 (음성으로 읽어줄 때만 쓰이는 짧은 도입구, 화면에는 표시되지 않음):
- "narration_lead_in" 필드에 유치원 선생님이 그림책을 읽어주기 직전에 자연스럽게 덧붙이는 아주 짧은 한마디(半문장 이내)를 한국어로 작성하세요.
- 뒤에 바로 그 페이지의 text가 이어져 읽히므로, "narration_lead_in + text"를 이어 읽었을 때 자연스러운 한 흐름의 문장이 되어야 합니다. "OO가 말했어요," 처럼 뒤에 실제 대사(따옴표 인용)가 나올 것 같은 표현은 쓰지 마세요 — text는 대사가 아니라 서술문이라 어색해집니다.
- 대신 "그때,", "잠시 후,", "그러던 어느 날,", "폴짝 뛰어나가며," 처럼 장면 전환이나 동작을 살짝 살려주는 도입구만 붙이세요. 감정을 담고 싶으면 "신나서 콧노래를 부르며," 처럼 부사구로 자연스럽게.
- 정말 필요 없는 페이지(이미 자연스럽게 시작하는 문장)는 빈 문자열로 남겨도 됩니다.
- text 본문에 없는 아주 작은 분위기 묘사를 살짝 더하는 건 괜찮지만(즉, 살짝 창작·각색 허용), 새로운 사건이나 설정을 지어내지는 마세요 — 어디까지나 "읽어주는 톤"을 살리는 용도입니다.

다음 JSON 형식으로 작성:
{
  "style_guide": "영어로 작성한 공통 화풍 + 등장인물 전원의 고정 외형 묘사",
  "pages": [
    {
      "page": 1,
      "text": "이 페이지의 한국어 동화 텍스트",
      "image_prompt": "이 페이지 장면만 영어로 (등장인물은 style_guide에서 정의한 이름·외형 그대로 사용)",
      "speech_bubble": "캐릭터의 짧은 한국어 대사 한 줄 (또는 빈 문자열)",
      "narration_lead_in": "음성 낭독 전용 짧은 도입구 (또는 빈 문자열)"
    }
  ]
}

동화 텍스트(text)와 speech_bubble, narration_lead_in은 한국어로, style_guide와 image_prompt는 반드시 영어로 작성하세요.`

// 업로드된 사진을 동화 캐릭터 외형 묘사로 바꾸기 위한 비전 분석 프롬프트
const PHOTO_CHARACTER_DESCRIPTION_PROMPT = `이 사진 속 인물을 아동용 동화책 삽화 캐릭터로 표현하기 위한 외형 묘사를 영어로 작성해주세요.

다음 특징을 구체적으로 담아주세요:
- 대략적인 나이대(정확한 숫자 대신 아동/청소년/성인 등)
- 머리 색·스타일, 눈 색, 피부톤
- 안경·헤어핀 등 특징적인 액세서리나 즐겨 입을 법한 옷 스타일/색상
- 밝고 사랑스러운 표정·분위기

주의사항:
- 사진 그대로가 아니라 부드러운 수채화 동화책 삽화 스타일로 재해석된다는 전제로 묘사하세요.
- 인물을 특정할 수 있는 정밀한 얼굴 생김새 묘사는 필요 없습니다. 그림체로 귀엽게 표현할 수 있는 특징 위주로만 3~5문장, 반드시 영어로 작성하세요.`

/**
 * 업로드된 사진을 분석해 동화책 삽화 스타일에 맞는 영어 외형 묘사를 생성한다.
 * 비전 분석은 텍스트 생성 모델(TEXT_MODEL) 설정과 무관하게 비전이 검증된 gpt-4o-mini로 고정한다.
 * @param {OpenAI} client - OpenAI 클라이언트
 * @param {string} photoUrl - 공개적으로 접근 가능한 사진 URL
 * @returns {Promise<string>} 영어 외형 묘사. 분석 실패 시 빈 문자열
 */
export async function describeCharacterFromPhoto(client, photoUrl) {
  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: PHOTO_CHARACTER_DESCRIPTION_PROMPT },
            { type: 'image_url', image_url: { url: photoUrl } },
          ],
        },
      ],
      max_completion_tokens: 300,
    })
    return response.choices[0]?.message?.content?.trim() || ''
  } catch (error) {
    console.error('Photo character description failed:', error.message)
    return ''
  }
}

// 표지 장면 묘사 (style_guide가 앞에 결합되므로 화풍은 적지 않음)
export const COVER_IMAGE_PROMPT = `Book cover illustration for a children's storybook titled "{title}" (category: {category}). Show the main character(s) front and center in an inviting, eye-catching cover composition. Leave some open space at the top for a title.`

/**
 * 모든 삽화에 공통 화풍/등장인물(style_guide)을 장면 묘사 앞에 결합한다.
 * 이렇게 해야 표지와 모든 페이지가 같은 그림체·같은 주인공으로 그려진다.
 * @param {string} styleGuide - 책 단위 고정 화풍 + 등장인물 외형 (영어)
 * @param {string} scene - 해당 장면 묘사 (영어)
 * @returns {string} 최종 이미지 프롬프트
 */
export function buildImagePrompt(styleGuide, scene) {
  const guide = (styleGuide || '').trim()
  if (!guide) return scene
  return `${guide}

SCENE TO ILLUSTRATE (use the exact same art style and the exact same character appearances described above — do not change their design): ${scene}`
}

/**
 * 사용자 입력(제목·테마·등장인물 이름)이 부적절한 내용을 담고 있는지 검사한다.
 * OpenAI Moderation API(무료, omni-moderation-latest)를 사용 — 아동 대상 서비스이므로
 * 이야기 생성 전에 입력값 단계에서 먼저 걸러낸다.
 * @param {OpenAI} client - OpenAI 클라이언트
 * @param {string} text - 검사할 텍스트 (제목+테마+이름을 합쳐서 전달)
 * @returns {Promise<{flagged: boolean, categories: string[]}>} 검사 실패(API 에러) 시에도
 *   flagged:false로 폴백해 서비스 자체가 막히지 않게 한다 — 모더레이션은 부가 안전장치이지
 *   핵심 생성 플로우의 단일 장애점이 되어서는 안 됨.
 */
export async function moderateContent(client, text) {
  try {
    const response = await client.moderations.create({
      model: 'omni-moderation-latest',
      input: text,
    })
    const result = response.results?.[0]
    if (!result?.flagged) return { flagged: false, categories: [] }

    const categories = Object.entries(result.categories || {})
      .filter(([, isFlagged]) => isFlagged)
      .map(([category]) => category)
    return { flagged: true, categories }
  } catch (error) {
    console.error('Moderation check failed:', error.message)
    return { flagged: false, categories: [] }
  }
}

// 카테고리 목록
export const CATEGORIES = [
  { id: 'animals', name: '🦁 동물 이야기', emoji: '🦁', description: '귀여운 동물들의 모험' },
  { id: 'fantasy', name: '🧚 판타지', emoji: '🧚', description: '마법과 신비로운 세계' },
  { id: 'adventure', name: '🚀 모험', emoji: '🚀', description: '스릴 넘치는 모험 이야기' },
  { id: 'friendship', name: '💝 사랑/우정', emoji: '💝', description: '친구와 사랑에 관한 이야기' },
  { id: 'education', name: '📚 교육', emoji: '📚', description: '배우며 즐기는 이야기' },
  { id: 'scifi', name: '🚀 공상과학', emoji: '🚀', description: '미래와 기술에 대한 상상' },
]

// ===========================================
// 이미지 생성 유틸리티 (gpt-image-2 모델)
// ===========================================

/**
 * Images API를 사용하여 이미지 생성 (gpt-image-2)
 * @param {OpenAI} client - OpenAI 클라이언트
 * @param {string} prompt - 이미지 프롬프트
 * @param {Object} options - 옵션
 * @returns {Promise<string>} base64 인코딩된 이미지 (data 없이 raw base64)
 */
export async function generateImage(client, prompt, options = {}) {
  const {
    model = IMAGE_MODEL,
    size = '1024x1024',
    quality = IMAGE_QUALITY,
  } = options

  try {
    const response = await client.images.generate({
      model,
      prompt,
      size,
      quality,
    })

    const b64 = response.data?.[0]?.b64_json
    if (!b64) {
      throw new Error('No image generated')
    }

    // base64 이미지 데이터 반환
    return b64
  } catch (error) {
    console.error('Image generation error:', error)
    throw error
  }
}

/**
 * 여러 이미지를 동시에 생성
 * @param {OpenAI} client - OpenAI 클라이언트
 * @param {string[]} prompts - 프롬프트 배열
 * @param {Object} options - 옵션
 * @returns {Promise<string[]>} base64 이미지 배열
 */
export async function generateImages(client, prompts, options = {}) {
  const results = await Promise.all(
    prompts.map((prompt) => generateImage(client, prompt, options))
  )
  return results
}

// ===========================================
// 비동기(백그라운드) 이미지 생성 — Responses API + 웹훅
// ===========================================
// high 화질은 장당 ~207초가 걸려(2026-07-11 실측) generateImage()의 동기 호출로는
// Vercel 함수 제한시간(120초)을 넘어 반드시 타임아웃 실패한다. Responses API의
// background:true 모드는 작업을 OpenAI 쪽에서 비동기로 처리하고 즉시 응답하므로
// (2026-07-13 실측: ~2초) 시간 제약과 무관해진다. 완료 통지는 웹훅
// (pages/api/openai/webhook.js)으로 받고, 웹훅이 아직 안 왔을 때를 대비해
// pages/api/books/check-images.js가 retrieveImageResult()로 폴백 폴링한다.

// 이미지 생성 tool을 호출시키는 "구동" 모델. 실제 이미지 품질/크기는 tools[0]에서 지정되고
// 이 모델은 그 tool 호출을 트리거하는 역할만 함. gpt-5.5로 실제 동작 검증됨(2026-07-13) —
// 다른 모델(예: gpt-4o-mini)은 background+image_generation 조합에서 미검증이라 바꾸지 말 것.
const IMAGE_JOB_DRIVER_MODEL = 'gpt-5.5'

/**
 * 이미지 생성 작업을 비동기로 시작하고 즉시 반환한다 (결과를 기다리지 않음).
 * @param {OpenAI} client
 * @param {string} prompt - 이미지 프롬프트 (buildImagePrompt 등으로 조립된 최종 프롬프트)
 * @param {Object} options - { model, size, quality } — generateImage()와 동일한 옵션
 * @returns {Promise<{id: string, status: string}>} OpenAI Response id (image_generation_jobs.response_id로 저장)
 */
export async function startImageGeneration(client, prompt, options = {}) {
  const {
    model = IMAGE_MODEL,
    size = '1024x1024',
    quality = IMAGE_QUALITY,
  } = options

  const response = await client.responses.create({
    model: IMAGE_JOB_DRIVER_MODEL,
    input: prompt,
    tools: [{ type: 'image_generation', model, size, quality }],
    background: true,
  })

  return { id: response.id, status: response.status }
}

/**
 * 비동기 이미지 생성 작업의 현재 상태를 조회한다 (웹훅 수신 시, 또는 폴백 폴링 시 사용).
 * generateImage()와 달리 이 호출 자체는 생성 진행 상황과 무관하게 즉시 반환된다.
 * @param {OpenAI} client
 * @param {string} responseId - startImageGeneration()이 반환한 id
 * @returns {Promise<{status: 'in_progress'|'completed'|'failed', base64: string|null}>}
 */
export async function retrieveImageResult(client, responseId) {
  const response = await client.responses.retrieve(responseId)

  // 실패 시 reason을 함께 반환 — 사유를 로깅하지 않으면 "이미지가 그냥 비어 있음"만 보이고
  // 원인(정책 차단/토큰 초과/도구 미호출 등)을 알 수 없어 진단이 불가능하다(2026-07-15 교훈).
  if (response.status === 'failed' || response.status === 'incomplete' || response.status === 'cancelled') {
    const detail = response.error?.message || response.incomplete_details?.reason || 'no detail'
    return { status: 'failed', base64: null, reason: `response ${response.status}: ${detail}` }
  }
  if (response.status !== 'completed') {
    return { status: 'in_progress', base64: null }
  }

  const imageCall = (response.output || []).find((o) => o.type === 'image_generation_call')
  if (!imageCall) {
    const outputTypes = (response.output || []).map((o) => o.type).join(',') || 'empty'
    return { status: 'failed', base64: null, reason: `no image_generation_call in output (output: ${outputTypes})` }
  }
  if (imageCall.status !== 'completed' || !imageCall.result) {
    return { status: 'failed', base64: null, reason: `image_generation_call status=${imageCall.status}, result ${imageCall.result ? 'present' : 'empty'}` }
  }
  return { status: 'completed', base64: imageCall.result }
}

// ===========================================
// TTS 내레이션 (BGM 대체) — client.audio.speech.create
// ===========================================
// 짧은 페이지 텍스트(보통 몇 초~십수 초 분량) 하나를 합성하는 요청이라 일반적인 OpenAI
// 호출처럼 동기로 처리해도 충분히 빠름(이미지처럼 background 모드가 필요 없음).

/**
 * 동화책 한 페이지의 본문을 오디오(mp3)로 합성한다.
 * @param {OpenAI} client
 * @param {string} text - 읽어줄 한국어 본문
 * @returns {Promise<Buffer>} mp3 바이트
 */
export async function generateSpeech(client, text) {
  const response = await client.audio.speech.create({
    model: TTS_MODEL,
    voice: TTS_VOICE,
    input: text,
    response_format: 'mp3',
    // tts-1/tts-1-hd는 instructions 미지원이지만 gpt-4o-mini-tts(기본값)는 지원 —
    // 인자한 여성 목소리의 어린이집 선생님이 그림책을 읽어주는 톤을 구체적으로 지정.
    instructions: '20대~30대 여성 어린이집 선생님의 밝고 다정한 목소리로 읽어주세요. 아이들과 눈을 맞추며 그림책을 읽어주듯 부드럽고 또박또박, 대사가 나오는 부분은 감정을 살려 생동감 있게, 나머지는 따뜻하고 차분하게 읽어주세요.',
  })

  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

/**
 * 페이지 하나를 낭독할 최종 스크립트를 만든다 — 화면에는 안 보이는 narration_lead_in(있으면)을
 * 본문 앞에 자연스럽게 붙인다. narration_lead_in이 없는 기존 책(하위호환)은 본문만 읽는다.
 * @param {Object} page - { text, narration_lead_in }
 * @returns {string}
 */
export function buildNarrationScript(page) {
  const leadIn = (page.narration_lead_in || '').trim()
  const text = (page.text || '').trim()
  if (!leadIn) return text
  return `${leadIn} ${text}`
}
