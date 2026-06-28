import { createServerSupabase } from '../../../lib/supabase'
import { createOpenAI, STORY_GENERATION_PROMPT, COVER_IMAGE_PROMPT, generateImage } from '../../../lib/openai'

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
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: textPrompt }],
      response_format: { type: 'json_object' },
      max_tokens: 4000,
    })

    const storyContent = JSON.parse(textResponse.choices[0].message.content)
    console.log('Story generated:', storyContent.pages?.length, 'pages')

    // 6. 표지 이미지 생성 (gpt-image-2) 및 Storage 업로드
    const coverPrompt = COVER_IMAGE_PROMPT
      .replace('{title}', title)
      .replace('{category}', category || '일반')

    let coverImageUrl = null
    try {
      const coverBase64 = await generateImage(openai, coverPrompt, {
        size: '1024x1024',
        quality: 'medium',
      })
      coverImageUrl = await uploadImageToStorage(supabase, book.id, 'cover', coverBase64)
      console.log('Cover image uploaded:', coverImageUrl)
    } catch (error) {
      console.error('Cover image generation failed:', error)
    }

    // 7. 각 페이지 이미지 생성 (gpt-image-2)
    const pages = storyContent.pages || []
    const pagesWithImages = []

    for (const page of pages) {
      try {
        const pageBase64 = await generateImage(openai, page.image_prompt, {
          size: '1024x1024',
          quality: 'medium',
        })
        const imageUrl = await uploadImageToStorage(supabase, book.id, `page-${page.page}`, pageBase64)

        pagesWithImages.push({
          ...page,
          image_url: imageUrl,
        })
        console.log(`Page ${page.page} image generated`)
      } catch (error) {
        console.error('Failed to generate image for page', page.page, error)
        pagesWithImages.push({
          ...page,
          image_url: null,
        })
      }
    }

    console.log('All page images generated')

    // 8. 데이터 업데이트
    const { error: updateError } = await supabase
      .from('books')
      .update({
        content: { pages: pagesWithImages },
        cover_image_url: coverImageUrl,
        status: 'completed',
      })
      .eq('id', book.id)

    if (updateError) {
      console.error('Failed to update book:', updateError)
    }

    // 9. 크레딧 차감 (프리미엄이 아닌 경우)
    if (!profile.is_premium) {
      await supabase
        .from('profiles')
        .update({ credits: profile.credits - 1 })
        .eq('id', user.id)
    }

    // 10. 결과 반환
    return res.status(200).json({
      success: true,
      book: {
        id: book.id,
        title,
        category,
        status: 'completed',
        cover_image_url: coverImageUrl,
        content: { pages: pagesWithImages },
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

/**
 * base64 이미지를 Supabase Storage에 업로드
 * @param {Object} supabase - Supabase 클라이언트
 * @param {string} bookId - 동화책 ID
 * @param {string} imageName - 이미지 이름
 * @param {string} base64Data - base64 인코딩된 이미지
 * @returns {Promise<string>} 공개 URL
 */
async function uploadImageToStorage(supabase, bookId, imageName, base64Data) {
  const bucketName = 'book-images'

  // 버킷이 없으면 생성
  const { data: bucketExists } = await supabase.storage.getBucket(bucketName)
  if (!bucketExists) {
    await supabase.storage.createBucket(bucketName, {
      public: true,
      fileSizeLimit: 10485760, // 10MB
      allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
    })
  }

  // 버퍼로 변환
  const imageBuffer = Buffer.from(base64Data, 'base64')

  // 파일 경로
  const filePath = `${bookId}/${imageName}-${Date.now()}.png`

  // 업로드
  const { data, error } = await supabase.storage
    .from(bucketName)
    .upload(filePath, imageBuffer, {
      contentType: 'image/png',
      upsert: true,
    })

  if (error) {
    console.error('Storage upload error:', error)
    throw error
  }

  // 공개 URL 반환
  const { data: { publicUrl } } = supabase.storage
    .from(bucketName)
    .getPublicUrl(data.path)

  return publicUrl
}