# AI 동화책 서비스 — 진행 상황 핸드오프

> 마지막 업데이트: 2026-06-29

## 한 줄 요약
서비스는 완성·배포된 상태이고, 외부 서비스 연동(Supabase/OpenAI/Polar)과 런타임 버그를 거의 다 잡았다.
현재 **Polar는 샌드박스(테스트 결제)** 모드. 운영 전환만 남아 있다.

---

## ✅ 완료된 것

### 인프라 / 연동
- **Supabase**: 스키마 배포 완료. `handle_new_user` 트리거에 `SET search_path = public` 추가로
  회원가입 500 에러("Database error saving new user") 해결. Storage 버킷 `book-images` 사용 중.
- **OpenAI**: 텍스트 `gpt-4o-mini`(json_object), 이미지 `gpt-image-2`(Images API `images.generate`, b64_json).
  화질 `low`(~20초/장) + 3장 병렬로 생성. (Responses API 아님 — 조직 인증 403 때문에 Images API로 전환)
- **Polar(샌드박스)**: `POLAR_SERVER=https://sandbox-api.polar.sh`. 제품 3종 생성(KRW), 체크아웃 검증 완료.
  웹훅 서명 검증 `standardwebhooks`로 실제 구현·테스트 완료. 웹훅 엔드포인트 등록 완료.
- **Vercel**: 환경변수 14종 production+preview 동기화 완료.

### 동화책 생성 (타임아웃 → 해결)
- 문제: 이미지 11장 순차 생성 = ~9분 > Vercel 함수 한도 → 무한 로딩.
- 해결: `create.js`는 **텍스트만** 동기 생성(즉시 응답) → `book/[id].js`가 폴링하며
  `process-image.js`를 반복 호출 → **표지 먼저, 그다음 페이지 3장씩 병렬**(`low` 화질).
  실패한 이미지는 `''`(빈 문자열)로 표시해 무한 재시도 방지.

### 그림 일관성 (최근 작업 — 커밋됨, 배포 중)
- 문제: 페이지마다 화풍·주인공이 제각각 → 집중도 저하.
- 해결: 텍스트 생성 시 **`style_guide`**(공통 화풍 + 등장인물 전원 고정 외형, 영어)를 만들어 저장.
  `buildImagePrompt(styleGuide, scene)`로 **표지·모든 페이지 프롬프트 앞에 결합**.
  - `lib/openai.js`: `STORY_GENERATION_PROMPT`(style_guide 출력), `COVER_IMAGE_PROMPT`(장면만), `buildImagePrompt()`
  - `create.js`: `content: { style_guide, pages }` 저장
  - `process-image.js`: style_guide 읽어 결합, 저장 시 보존
  - ⚠️ **기존 책엔 적용 안 됨, 새로 만드는 책부터** 적용.

---

## ⏭️ 다음에 할 일 (우선순위순)

1. **그림 일관성 실제 확인**: 배포 완료 후 동화책 새로 1권 만들어 화풍·주인공 일관성 눈으로 검증.
   부족하면 `STORY_GENERATION_PROMPT`의 style_guide 지시를 더 강화하거나, 이미지 화질을
   `medium`으로 올리는 것(속도 trade-off) 검토.
2. **Polar 운영(production) 전환**: 현재 샌드박스. 운영 토큰 새로 발급 → 제품 3종 재생성(KRW) →
   `POLAR_SERVER`를 운영 URL로 → 웹훅 시크릿/엔드포인트 운영용으로 재등록 → Vercel env 갱신.
3. (선택) 사진 기반 동화(`isPhotoBased`/`character_photo_url`) 기능 점검 — 코드 경로는 있으나 미검증.

---

## ⚠️ 주의사항
- `.env.local`은 **실제 시크릿** 포함 + gitignore. 절대 커밋 금지.
- 결제는 현재 **샌드박스(가짜 결제)**. 실제 과금 아님.
- git 커밋 co-author 트레일러: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- 임시 스크립트는 작업 후 삭제(예: `_finish.mjs`, `_check.mjs`는 이미 정리됨).

## 디버깅에 쓴 패턴
- 라이브 DB 점검: `.env.local` 파싱 → `@supabase/supabase-js` 서비스 롤 키로 접속하는 `.mjs` 스크립트를
  **프로젝트 루트에서** `node`로 실행(ESM이 node_modules 찾으려면 루트에서 실행 필요). psql 설치 불가.
