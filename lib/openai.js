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

// 동화책 텍스트 생성 프롬프트
export const STORY_GENERATION_PROMPT = `당신은 동화책 작가이자 일러스트 아트 디렉터입니다. 다음 정보를 바탕으로 동화책을 작성하고, 모든 삽화가 동일한 그림체와 동일한 등장인물로 그려지도록 일관된 아트 가이드를 만들어주세요.

제목: {title}
카테고리: {category}
주제/내용: {theme}
페이지 수: {pageCount}페이지

요구사항:
1. 각 페이지는 2-4문장의 짧은 동화 텍스트로 구성
2. 이야기의 흐름이 자연스러워야 함
3. 마지막 페이지는 행복한 결말로 마무리
4. 아이들이 즐겁게 읽을 수 있는 따뜻한 톤

★ 이미지 일관성 (매우 중요 — 모든 그림이 같은 그림체와 같은 주인공으로 보여야 함):
- "style_guide" 필드를 반드시 영어로 작성하세요. 여기에는 (a) 모든 페이지에 공통 적용할 화풍과 (b) 등장인물 전원의 고정된 외형을 매우 구체적으로 적습니다.
  · 화풍 예시: "Soft watercolor children's picture book illustration, warm pastel palette, gentle rounded outlines, cozy storybook lighting, same consistent art style on every page."
  · 등장인물 예시: 이름·종/나이·털·눈 색·의상·소품 등 고정 특징을 명시 — "MAIN CHARACTER Tori: a small round white rabbit with long floppy ears, big sky-blue eyes, wearing a red knitted scarf and a tiny brown backpack." 조연도 모두 동일하게 고정.
- 각 페이지의 "image_prompt"에는 그 장면(배경·행동·구도)만 영어로 묘사하세요. 등장인물은 style_guide에서 정한 이름과 외형을 그대로 사용해 동일 인물임이 드러나게 하고, 새로운 외형 묘사나 다른 화풍을 절대 추가하지 마세요.
- image_prompt에 화풍 설명을 반복하지 마세요. style_guide가 모든 image_prompt 앞에 자동으로 결합됩니다.

다음 JSON 형식으로 작성:
{
  "style_guide": "영어로 작성한 공통 화풍 + 등장인물 전원의 고정 외형 묘사",
  "pages": [
    {
      "page": 1,
      "text": "이 페이지의 한국어 동화 텍스트",
      "image_prompt": "이 페이지 장면만 영어로 (등장인물은 style_guide에서 정의한 이름·외형 그대로 사용)"
    }
  ]
}

동화 텍스트(text)는 한국어로, style_guide와 image_prompt는 반드시 영어로 작성하세요.`

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
