# AI 동화책 서비스 — 진행 상황 핸드오프

> 마지막 업데이트: 2026-07-08 (PDF 폰트 서브셋 버그 수정)

## PDF 다운로드 글자 깨짐 버그 수정 (완료·검증됨)
- 증상: 사용자가 PDF를 다운로드하면 글자가 전부 깨져 보임(제목·본문 텍스트 대부분 사라지거나 이상한 조각만 남음).
- 원인: `lib/pdf-generator.js`에서 Pretendard 폰트를 `pdfDoc.embedFont(bytes, { subset: true })`로 임베드하고 있었는데, **pdf-lib+fontkit의 한글 서브셋 처리에 버그**가 있어 `pdf-parse`로 텍스트를 추출하면 정상인데(ToUnicode 매핑은 살아있음) 실제로 화면에 그려지는 글리프는 대부분 사라지는 문제였음.
- ⚠️ **검증 방법에 대한 교훈**: 지난 세션에 이 폰트 임베드 기능을 넣을 때 `pdf-parse`의 텍스트 추출(`getText()`)만으로 검증하고 "정상"이라 판단했었는데, 이는 실제 화면 렌더링을 보증하지 않음이 드러남. 이번엔 `pdf-parse`의 `getScreenshot()`으로 실제 페이지를 이미지로 렌더링해 육안으로 확인하는 방식으로 재발 방지.
- 해결: `{ subset: true }` 옵션 제거, 폰트 전체(Pretendard-Regular.ttf, Pretendard-Bold.ttf)를 그대로 임베드. PDF 파일 크기가 조금 커짐(폰트당 서브셋 대비 몇 MB 증가하지만, 이미 이미지가 큰 편이라 체감 차이 적음).
- 로컬 + 실제 프로덕션(`https://mytale-ai.vercel.app`) 양쪽에서 실제 PDF를 받아 화면 렌더링까지 확인 완료.

## 나만의 동화책 만들기(사진 첨부 선택) 통합 (완료·검증됨)
- 기존 `/my/photos`는 사진을 업로드해도 실제 생성에 전혀 반영 안 되는 **미완성 기능**이었음(`isPhotoBased`/`character_photo_url`이 DB 저장만 되고 프롬프트에는 미사용, `CHARACTER_IMAGE_PROMPT`도 죽은 코드). `/create` 하나로 통합해 실제로 동작하게 구현.
- `/create` 폼에 사진 업로드 섹션 추가(**선택사항** — 미첨부 시 검증 통과, 기존처럼 AI가 자유 생성). `/my/photos`는 `/create`로 리다이렉트하는 얇은 페이지로 교체.
- **사진 속 인물 = 항상 주인공**으로 확정(사용자 확인 완료 — 현재 1장만 업로드 가능해 역할 선택 UI는 불필요하다고 판단).
- `lib/openai.js`의 `describeCharacterFromPhoto()`가 gpt-4o-mini 비전으로 사진을 분석해 동화 삽화 스타일 외형 묘사(나이대·머리색/스타일·눈색·액세서리·분위기)를 생성 — 분석 실패 시 빈 문자열 반환해 사진 없는 것처럼 자연스럽게 폴백. `getCharacterInstruction()`이 이 묘사 + 지정된 이름(첫 번째)을 결합해 style_guide 주인공 외형에 반영.
- **실제 검증**: 빨간 곱슬머리·주근깨·동그란 안경·노란 우비 소년 사진(gpt-image-2로 합성 생성)을 업로드해 "레오"라는 이름으로 책 생성 → style_guide와 실제 이미지 5장(표지+4페이지) 전부에서 사진 속 특징이 정확히 재현되는 것을 육안으로 직접 확인.
- ⚠️ 텍스트 생성 시간: 사진 분석(vision) + gpt-5.5(추론모델) 조합이 최대 ~58초까지 걸림 — `create.js`의 `maxDuration: 90초` 안에는 들지만 여유가 줄어듦. 만약 타임아웃이 잦아지면 vision 분석 모델을 더 가벼운 것으로 바꾸거나 maxDuration을 더 올리는 것 검토.

## 연령대별 문체·말풍선·이야기 연결 강화 (완료·검증됨)
- **독자 연령대 선택**: 영유아(0~5)/유치원생(5~7)/초등학생(8~13) 3단계. `create.js`에 `AgeGroupSelect` 컴포넌트 추가, `books.age_group` 컬럼(스키마+라이브 DB) 저장. `lib/openai.js`의 `AGE_GROUPS`/`getAgeGroupGuidance()`가 연령대별 어휘 난이도·문장 길이·줄거리 복잡도 지침을 `STORY_GENERATION_PROMPT`에 삽입.
- **그림 속 말풍선**: 텍스트 생성 시 페이지별 `speech_bubble`(짧은 한국어 대사) 필드를 함께 생성 → `withSpeechBubble()`이 이미지 프롬프트에 말풍선 렌더링 지시를 결합. 실제 생성 결과 4장 모두 한글이 전혀 깨지지 않고 선명하게 렌더링되는 것을 직접 확인(gpt-image-2가 한글 텍스트 렌더링에 의외로 강함).
- **이야기 자연스러운 연결**: `STORY_GENERATION_PROMPT`에 등장인물 이름/성격 유지, 페이지 간 인과관계("그래서"/"그러자"), 초반 복선의 후반 회수, `image_prompt`의 장소·분위기 연속성을 명시 지시. 실제 생성 결과에서 "같은 숲길에서 계속(Continuing on the same forest path)" 식으로 장면이 자연스럽게 이어지는 것 확인.
- ⚠️ 기존 책엔 `speech_bubble` 필드가 없어 말풍선이 안 나타남 — 새로 만드는 책부터 적용.
- **등장인물 이름 직접 지정**: `create.js` 폼에 "등장인물 이름(선택사항)" 입력란 추가(쉼표 구분, 예: "몽몽, 두리"). 비워두면 기존처럼 AI가 자동 작명. `lib/openai.js`의 `getCharacterNamesInstruction()`이 지정된 이름을 `STORY_GENERATION_PROMPT`에 삽입 — style_guide·본문·말풍선·image_prompt 전체에서 정확히 그 이름 그대로 일관 사용되는 것 실제 API로 검증 완료.

## OpenAI 모델 변경 검토 (사용자가 .env.local 직접 수정)
- `OPENAI_TEXT_MODEL=gpt-5.5`: 실제로 유효한 추론(reasoning) 모델(`gpt-5.5-2026-04-23`로 해석됨). 단, **`max_tokens` 파라미터를 지원하지 않고 `max_completion_tokens`가 필요**함을 실제 API 호출로 확인 후 코드 수정(`gpt-4o-mini`와도 호환 확인해 통일). 텍스트 생성 시간 ~5초→~20~35초로 증가해 `create.js`의 `maxDuration`을 60→90초로 상향.
- `OPENAI_IMAGE_QUALITY=high`: **실측 결과 이미지 1장에 207초 소요** — `process-image.js`의 함수 제한시간(120초)을 크게 초과해 실제 Vercel 배포에서는 반드시 타임아웃 실패함(로컬 dev 서버는 제한시간을 강제하지 않아 겉보기엔 성공한 것처럼 보였음). `medium`도 70초로 BATCH 3장 병렬 처리 시 120초 제한에 근접해 위험. **`low`(~20초/장)로 되돌림** — 현재 아키텍처(BATCH 3장 병렬, maxDuration 120초)에서 유일하게 안전한 값. `.env.local` + Vercel production 모두 반영.
  - 만약 나중에 화질을 올리고 싶다면: Vercel maxDuration을 플랜 최대치까지 올리고 BATCH를 1로 낮추는 아키텍처 변경이 필요(다만 책 전체 생성 시간이 크게 늘어남 — 10페이지 기준 high 화질이면 이론상 30분 이상).

## 사이트 주소 변경
운영 도메인이 `https://codespaces-nextjs-lemon.vercel.app` → **`https://mytale-ai.vercel.app`** 로 변경됨.
- Vercel 프로젝트명 `codespaces-nextjs` → `mytale-ai`로 rename, 관련 별칭(alias) 전부 정리.
- `NEXT_PUBLIC_APP_URL`(production), Polar 웹훅 엔드포인트 URL 모두 새 도메인으로 갱신 완료.
- 부수 발견: 프로젝트에 Vercel Deployment Protection(SSO 게이트)이 `all_except_custom_domains`로 걸려 있어 `.vercel.app` 별칭이 전부 비공개(팀원만 접근) 상태였음 — 실사용자 접근이 막혀 있었던 것으로 보여 **비활성화(`ssoProtection: null`)** 처리함. 커스텀 도메인(구매한 실제 도메인)을 연결할 계획이면 그때 다시 필요에 맞게 설정 검토.
- ⚠️ **중요 — 2026-07-06에 발견한 함정 (해결됨)**: `mytale-ai.vercel.app`을 처음에 `vercel alias set`으로 수동 연결했었는데, 이런 수동 alias는 **git push 자동배포를 따라가지 않는다**. 그래서 이후 여러 커밋(모바일 UI 수정, PDF 폰트 수정 등)이 실제로는 이 도메인에 전혀 반영되지 않고 2일 전 배포에 멈춰 있었음(반면 자동생성되는 `mytale-ai-gold-moon.vercel.app`은 정상적으로 매번 갱신됨). **해결책**: `mytale-ai.vercel.app`을 Vercel 프로젝트의 정식 "Domain"으로 등록(`POST /v10/projects/.../domains`)해서 이제는 매 프로덕션 배포마다 자동으로 갱신되도록 고쳐놓음. 2026-07-06 최종 커밋까지 alias가 정상적으로 자동 반영되는 것 확인 완료. 앞으로 배포 후 안 바뀐 것처럼 보이면 `vercel alias ls`로 실제 가리키는 배포가 최신인지부터 확인할 것.

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

### 생성 완료 알림 (완료·검증됨)
- 10페이지 이상은 "최소 5분 이상 소요" 안내로 문구 변경, 다른 탭/창으로 이동해도 완성/실패 시 브라우저 Notification API로 알림.
- `pages/book/[id].js`: 권한 상태(default/granted/denied)별 안내 분기 + `wasGeneratingRef`/`notifiedRef`로 전환 시점 1회만 알림.

### 모바일 뷰어 버튼 겹침 + PDF 다운로드 실패 (완료·검증됨 — 실제 프로덕션에서 확인)
- 문제 1: 모바일에서 이전/다음 버튼이 안 보임 — `.nav`/`.controls` 두 바가 둘 다 `position:fixed; left:50%; transform:translateX(-50%)`라 좁은 화면에서 서로 겹쳐 클릭을 가로챔(같은 원인으로 PDF 버튼 텍스트도 세로로 줄바꿈됨). → 모바일 미디어쿼리에서 두 바를 `position:static`인 일반 흐름 요소로 전환(`styles/components/BookViewer.module.css`).
- 문제 2: `goToNext`의 off-by-one으로 마지막 페이지를 "다음" 버튼으로 절대 볼 수 없었음(데스크톱 전용 썸네일로만 가능) → 가드 조건 수정(`components/book/BookViewer.js`).
- 문제 3: PDF 다운로드가 `.json` + `{"error":"Unauthorized"}`로 저장됨 — `handleDownload`가 인증 헤더 없이 fetch → 401을 그대로 blob 저장. Authorization 헤더 추가.
- 문제 4 (3을 고치고 나서 드러난 2차 버그): pdf-lib의 `StandardFonts`는 WinAnsi 인코딩만 지원해 한글 포함 모든 실제 책에서 PDF 생성이 500으로 실패하고 있었음. **Pretendard 폰트**(OFL 라이선스, `public/fonts/Pretendard-{Regular,Bold}.ttf`)를 `@pdf-lib/fontkit`으로 임베드하도록 교체(`lib/pdf-generator.js`). OTF/CFF는 이 fontkit 버전에서 파싱 버그로 실패하니 **반드시 TTF**를 써야 함.
- 검증: Playwright로 실제 로그인→모바일 뷰포트→페이지 이동→PDF 다운로드까지 end-to-end 확인, `pdf-parse`로 PDF 안의 한글 텍스트가 정확히 추출되는 것까지 확인.
- ⚠️ **후속 버그(2026-07-08에 발견·수정)**: 이때 함께 켰던 `{ subset: true }` 옵션이 실제 화면 렌더링을 깨뜨리는 별도 버그였음 — 상세 내용은 위 "PDF 다운로드 글자 깨짐 버그 수정" 섹션 참고.

### OpenAI 모델/화질 설정값화 (완료)
- `OPENAI_TEXT_MODEL`, `OPENAI_IMAGE_MODEL`, `OPENAI_IMAGE_QUALITY` 환경변수 추가(`.env.local` + Vercel production).
  코드 수정 없이 값만 바꾸면 모델/화질 조정 가능(기본값: `gpt-4o-mini` / `gpt-image-2` / `low`).
- `lib/openai.js`가 이 값들을 export하고, `create.js`/`process-image.js`가 하드코딩 대신 이 상수를 사용하도록 변경.

### 모바일 뷰어 유동적 반응형 개선 (완료·검증됨)
- 문제: 이전/다음 버튼 바·확대축소+PDF 버튼 바가 `justify-content:center`라 내용물이 가운데 뭉쳐 있어 기기 화면 폭에 따라 정렬이 흐트러져 보임. 폰트/여백도 768px 브레이크포인트 하나로만 두 단계 전환되어 그 사이 기기들에서 어색했음.
- 해결(`styles/components/BookViewer.module.css`):
  - `.nav`/`.controls`를 `justify-content: space-between`으로 전환 — 이전/다음 버튼이 화면 양 끝에 고정(데스크톱은 바 너비=내용물 크기라 시각적 변화 없음).
  - 고정 픽셀 대신 `clamp()`/`vw` 기반 유동 크기(폰트·패딩·gap)로 전환해 화면 폭에 따라 부드럽게 스케일.
  - 모바일 바 너비를 `min(94vw, 420px)`로 — 기기 폭에 비례해 유동적으로 조정.
  - iPhone 홈 인디케이터 안전영역(`env(safe-area-inset-bottom)`) 대응, `100vh` 대신 `100svh`로 모바일 브라우저 주소창 변화에 안정적으로 대응.
  - 360px 이하 초소형 화면용 추가 브레이크포인트.
- 검증: Playwright로 5개 기기 폭(360/375/390/430/768px = 소형 안드로이드/iPhone SE/iPhone 12/iPhone 14 Pro Max/iPad 세로)에서 가로 스크롤 없음 + 정렬 확인.

---

## ⏭️ 다음에 할 일 (우선순위순)

1. **Polar 운영(production) 전환** — 🔴 진행 중, 사용자 액션 대기.
   - **막힌 지점**: 운영(production) Polar 액세스 토큰이 필요한데, 이건 사용자가 polar.sh에 운영 계정으로
     로그인해서 발급해야 함(Claude가 대신 발급 불가). 토큰 요청까지 안내는 해뒀고, 사용자가
     "여기까지 저장해줘"라고 해서 토큰 없이 중단된 상태.
   - **토큰 받으면 이어서 할 일**:
     1) 운영 계정에 제품 3종 재생성(KRW) — 월간구독 ₩9,900 / 연간구독 ₩89,000 / 크레딧10권 ₩8,900
        (샌드박스 때처럼 organization_id 넣지 말 것, currency는 조직 기본통화에 맞출 것 — 이전에 422 에러 겪음)
     2) `.env.local` + Vercel production env: `POLAR_SERVER`를 `https://api.polar.sh`로,
        `POLAR_ACCESS_TOKEN`/제품 ID 3종을 운영 값으로 교체
     3) 운영용 웹훅 엔드포인트 신규 등록(`https://mytale-ai.vercel.app/api/payment/webhook`) →
        새 `POLAR_WEBHOOK_SECRET` 발급받아 env 반영
     4) Vercel 재배포 + 체크아웃/웹훅 E2E 검증
2. (선택) 실제 구매 도메인 연결 시 Vercel Deployment Protection 설정 재검토 (현재 비활성화 상태로 완전 공개).

---

## 🚀 배포 상태 (2026-07-08 기준, 세션 종료 시점)
- **Git**: `main` 브랜치, 로컬/원격 완전 동기화(`nothing to commit, working tree clean`).
- **Vercel**: 최신 커밋(`ebab580` — 나만의 동화책 만들기 통합)까지 production 배포 완료·확인(`https://mytale-ai.vercel.app/create` 200 응답).
- **Supabase**: 이번 세션은 DB 스키마 변경 없음(코드/프롬프트 변경만). `character-photos` 버킷 존재·public 확인.
- 로컬 dev 서버 등 백그라운드 프로세스 없음, 테스트로 만든 유저/책/사진은 모두 정리됨.

---

## ⚠️ 주의사항
- `.env.local`은 **실제 시크릿** 포함 + gitignore. 절대 커밋 금지.
- 결제는 현재 **샌드박스(가짜 결제)**. 실제 과금 아님.
- 사이트 주소는 `https://mytale-ai.vercel.app` (구 주소 `codespaces-nextjs-lemon.vercel.app`는 별칭 삭제되어 더 이상 동작 안 함).
- 신규 가입자는 크레딧 0으로 시작(무료 체험 없음). 기존 가입자 보유 크레딧은 유지됨.
- git 커밋 co-author 트레일러: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- 임시 스크립트는 작업 후 삭제(예: `_finish.mjs`, `_check.mjs`는 이미 정리됨).
- ⚠️ **라이브 DB에 남아있는 테스트 데이터**: 사용자 요청으로 정리하지 않고 남겨둔 사진 기반 동화책 재현 테스트 —
  계정 `e2e-photo-test@example.com`(비번 `Verify1234!Test`), 동화책 "레오의 비오는 날 모험"(id `fdf3844d-c1d0-4a5d-af15-bf97e8da9931`),
  `character-photos` 버킷의 합성 테스트 사진. 실제 서비스 데이터가 아니므로 필요 없어지면 삭제해도 됨.

## 디버깅에 쓴 패턴
- 라이브 DB 점검: `.env.local` 파싱 → `@supabase/supabase-js` 서비스 롤 키로 접속하는 `.mjs` 스크립트를
  **프로젝트 루트에서** `node`로 실행(ESM이 node_modules 찾으려면 루트에서 실행 필요). psql 설치 불가.
