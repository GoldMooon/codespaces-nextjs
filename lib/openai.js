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
export const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2'
export const IMAGE_QUALITY = process.env.OPENAI_IMAGE_QUALITY || 'low'

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
 * 사용자가 지정한 등장인물 이름을 프롬프트에 삽입할 지시문으로 변환한다.
 * 비어있으면 AI가 자유롭게 이름을 짓도록 안내하는 기본 문구를 반환한다.
 * @param {string} characterNames - 쉼표로 구분된 이름 목록 (예: "토리, 폭시"), 빈 문자열 가능
 */
export function getCharacterNamesInstruction(characterNames) {
  const names = (characterNames || '')
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean)

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

★ 등장인물 이름:
{characterNamesInstruction}

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

다음 JSON 형식으로 작성:
{
  "style_guide": "영어로 작성한 공통 화풍 + 등장인물 전원의 고정 외형 묘사",
  "pages": [
    {
      "page": 1,
      "text": "이 페이지의 한국어 동화 텍스트",
      "image_prompt": "이 페이지 장면만 영어로 (등장인물은 style_guide에서 정의한 이름·외형 그대로 사용)",
      "speech_bubble": "캐릭터의 짧은 한국어 대사 한 줄 (또는 빈 문자열)"
    }
  ]
}

동화 텍스트(text)와 speech_bubble은 한국어로, style_guide와 image_prompt는 반드시 영어로 작성하세요.`

// 캐릭터 이미지 생성 프롬프트 (사진 기반)
export const CHARACTER_IMAGE_PROMPT = `Transform this photo into an adorable fairy tale illustration style.
The character should appear in a children's storybook illustration with:
- Soft, warm watercolor-style art
- Bright and cheerful colors
- Storybook aesthetic suitable for children
- Magical and whimsical atmosphere
- Keep the character's recognizable features

Style: Children's picture book illustration, soft watercolor, warm lighting, dreamy atmosphere`

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
