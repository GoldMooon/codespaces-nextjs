/**
 * base64 이미지를 Supabase Storage(book-images 버킷)에 업로드하고 공개 URL을 반환한다.
 * @param {Object} supabase - 서버 Supabase 클라이언트
 * @param {string} bookId - 동화책 ID
 * @param {string} imageName - 이미지 이름 (예: 'cover', 'page-1')
 * @param {string} base64Data - base64 인코딩된 이미지 (raw)
 * @returns {Promise<string>} 공개 URL
 */
export async function uploadImageToStorage(supabase, bookId, imageName, base64Data) {
  const bucketName = 'book-images'

  // 버킷이 없으면 생성 (운영 DB에는 이미 존재 — 방어적)
  const { data: bucketExists } = await supabase.storage.getBucket(bucketName)
  if (!bucketExists) {
    await supabase.storage.createBucket(bucketName, {
      public: true,
      fileSizeLimit: 10485760, // 10MB
      allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
    })
  }

  const imageBuffer = Buffer.from(base64Data, 'base64')
  const filePath = `${bookId}/${imageName}-${Date.now()}.png`

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

  const { data: { publicUrl } } = supabase.storage
    .from(bucketName)
    .getPublicUrl(data.path)

  return publicUrl
}

/**
 * TTS로 합성한 mp3를 Supabase Storage(book-audio 버킷)에 업로드하고 공개 URL을 반환한다.
 * @param {Object} supabase - 서버 Supabase 클라이언트
 * @param {string} bookId - 동화책 ID
 * @param {string} audioName - 오디오 파일 이름 (예: 'page-1')
 * @param {Buffer} audioBuffer - mp3 바이트
 * @returns {Promise<string>} 공개 URL
 */
export async function uploadAudioToStorage(supabase, bookId, audioName, audioBuffer) {
  const bucketName = 'book-audio'

  const { data: bucketExists } = await supabase.storage.getBucket(bucketName)
  if (!bucketExists) {
    await supabase.storage.createBucket(bucketName, {
      public: true,
      fileSizeLimit: 10485760, // 10MB
      allowedMimeTypes: ['audio/mpeg'],
    })
  }

  const filePath = `${bookId}/${audioName}-${Date.now()}.mp3`

  const { data, error } = await supabase.storage
    .from(bucketName)
    .upload(filePath, audioBuffer, {
      contentType: 'audio/mpeg',
      upsert: true,
    })

  if (error) {
    console.error('Audio storage upload error:', error)
    throw error
  }

  const { data: { publicUrl } } = supabase.storage
    .from(bucketName)
    .getPublicUrl(data.path)

  return publicUrl
}
