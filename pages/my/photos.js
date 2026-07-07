import { useEffect } from 'react'
import { useRouter } from 'next/router'

// 사진 기반 동화책 만들기는 /create로 통합됨(사진 첨부는 선택사항).
// 기존 링크/북마크가 깨지지 않도록 리다이렉트만 남겨둔다.
export default function PhotoCreateRedirect() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/create')
  }, [router])

  return null
}
