import OpenAI from 'openai'

// Server-side client factory only - 클라이언트는 서버 사이드에서만 생성
export function createOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not set')
  }
  return new OpenAI({ apiKey })
}

// 동화책 텍스트 생성 프롬프트
export const STORY_GENERATION_PROMPT = `당신은 동화책 작가입니다. 다음 정보를 바탕으로 동화책을 작성해주세요.

제목: {title}
카테고리: {category}
주제/내용: {theme}
페이지 수: {pageCount}페이지

요구사항:
1. 각 페이지는 2-4문장의 짧은 동화 텍스트로 구성
2. 이야기의 흐름이 자연스러워야 함
3. 마지막 페이지는 행복한 결말로 마무리
4. 아이들이 즐겁게 읽을 수 있는 따뜻한 톤

각 페이지는 다음 JSON 형식으로 작성:
{
  "pages": [
    {
      "page": 1,
      "text": "이 페이지의 동화 텍스트",
      "image_prompt": "영어 이미지 프롬프트 - 동화 스타일, 밝고 귀여운 일러스트, 수채화 느낌"
    }
  ]
}

한국어로 동화책 텍스트를 작성하고, image_prompt는 반드시 영어로 작성해주세요.`

// 캐릭터 이미지 생성 프롬프트 (사진 기반)
export const CHARACTER_IMAGE_PROMPT = `Transform this photo into an adorable fairy tale illustration style.
The character should appear in a children's storybook illustration with:
- Soft, warm watercolor-style art
- Bright and cheerful colors
- Storybook aesthetic suitable for children
- Magical and whimsical atmosphere
- Keep the character's recognizable features

Style: Children's picture book illustration, soft watercolor, warm lighting, dreamy atmosphere`

// 표지 이미지 생성 프롬프트
export const COVER_IMAGE_PROMPT = `Create a beautiful book cover illustration for a children's fairy tale.
Title: {title}
Category: {category}

Style: High-quality children's book cover, vibrant colors, professional illustration, watercolor or digital art style, magical and inviting atmosphere suitable for ages 3-10.`

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
    model = 'gpt-image-2',
    size = '1024x1024',
    quality = 'medium',
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
