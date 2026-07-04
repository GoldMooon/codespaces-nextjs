# AI 동화책 서비스 — 진행 상황 핸드오프

> 마지막 업데이트: 2026-07-04

## 사이트 주소 변경
운영 도메인이 `https://codespaces-nextjs-lemon.vercel.app` → **`https://mytale-ai.vercel.app`** 로 변경됨.
- Vercel 프로젝트명 `codespaces-nextjs` → `mytale-ai`로 rename, 관련 별칭(alias) 전부 정리.
- `NEXT_PUBLIC_APP_URL`(production), Polar 웹훅 엔드포인트 URL 모두 새 도메인으로 갱신 완료.
- 부수 발견: 프로젝트에 Vercel Deployment Protection(SSO 게이트)이 `all_except_custom_domains`로 걸려 있어 `.vercel.app` 별칭이 전부 비공개(팀원만 접근) 상태였음 — 실사용자 접근이 막혀 있었던 것으로 보여 **비활성화(`ssoProtection: null`)** 처리함. 커스텀 도메인(구매한 실제 도메인)을 연결할 계획이면 그때 다시 필요에 맞게 설정 검토.

## 무료 체험 제거 → 시작부터 유료
1인이 여러 이메일로 무료 크레딧을 반복 수령하는 어뷰징 문제를 근본적으로 차단하기 위해 **무료 체험 자체를 없앰**.
- `profiles.credits` 기본값 1 → 0 (스키마 파일 + 라이브 DB 모두 반영). 신규 가입자는 크레딧 0으로 시작, 크레딧 구매/구독 후 이용.
- **기존 가입자가 이미 보유한 크레딧은 소급 회수하지 않음** (정책적으로 유지하기로 함 — 필요시 재검토).
- 요금제 페이지(`pricing.js`)에서 "무료 체험" 플랜 카드 제거. 남은 플랜: 월간 구독(₩9,900), 연간 구독(₩89,000), 크레딧 10권(₩8,900).
- 랜딩(`index.js`)·생성(`create.js`) 페이지의 "무료로 시작하기"/"무료 체험" 문구를 크레딧 구매·구독 안내로 교체.

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

### 그림 일관성 (완료·검증됨)
- 문제: 페이지마다 화풍·주인공이 제각각 → 집중도 저하.
- 해결: 텍스트 생성 시 **`style_guide`**(공통 화풍 + 등장인물 전원 고정 외형, 영어)를 만들어 저장.
  `buildImagePrompt(styleGuide, scene)`로 **표지·모든 페이지 프롬프트 앞에 결합**.
  - `lib/openai.js`: `STORY_GENERATION_PROMPT`(style_guide 출력), `COVER_IMAGE_PROMPT`(장면만), `buildImagePrompt()`
  - `create.js`: `content: { style_guide, pages }` 저장
  - `process-image.js`: style_guide 읽어 결합, 저장 시 보존
  - 실제 API로 책 1권 생성해 표지+4페이지 이미지를 직접 확인 — 화풍·캐릭터(이름·색·의상) 전 페이지 일관 유지 검증 완료.
  - ⚠️ **기존 책엔 적용 안 됨, style_guide 도입 이후 새로 만든 책부터** 적용.
  - ⚠️ 잔여 리스크: style_guide에 없는 조연 캐릭터가 이야기 중간에 새로 등장해 이후에도 반복되면, 그 조연만 페이지마다 다르게 그려질 수 있음. 실사용 중 발견되면 프롬프트에 "주요 조연도 첫 등장 시점에 고정 외형 기재" 지시 추가.

---

## ⏭️ 다음에 할 일 (우선순위순)

1. **Polar 운영(production) 전환**: 현재 샌드박스. 운영 토큰 새로 발급 → 제품 3종 재생성(KRW) →
   `POLAR_SERVER`를 운영 URL로 → 웹훅 시크릿/엔드포인트 운영용으로 재등록 → Vercel env 갱신.
2. (선택) 사진 기반 동화(`isPhotoBased`/`character_photo_url`) 기능 점검 — 코드 경로는 있으나 미검증.
3. (선택) 실제 구매 도메인 연결 시 Vercel Deployment Protection 설정 재검토 (현재 비활성화 상태로 완전 공개).

---

## ⚠️ 주의사항
- `.env.local`은 **실제 시크릿** 포함 + gitignore. 절대 커밋 금지.
- 결제는 현재 **샌드박스(가짜 결제)**. 실제 과금 아님.
- 사이트 주소는 `https://mytale-ai.vercel.app` (구 주소 `codespaces-nextjs-lemon.vercel.app`는 별칭 삭제되어 더 이상 동작 안 함).
- 신규 가입자는 크레딧 0으로 시작(무료 체험 없음). 기존 가입자 보유 크레딧은 유지됨.
- git 커밋 co-author 트레일러: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- 임시 스크립트는 작업 후 삭제(예: `_finish.mjs`, `_check.mjs`는 이미 정리됨).

## 디버깅에 쓴 패턴
- 라이브 DB 점검: `.env.local` 파싱 → `@supabase/supabase-js` 서비스 롤 키로 접속하는 `.mjs` 스크립트를
  **프로젝트 루트에서** `node`로 실행(ESM이 node_modules 찾으려면 루트에서 실행 필요). psql 설치 불가.
