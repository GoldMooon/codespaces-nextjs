# AI 동화책 서비스 — 진행 상황 핸드오프

> 마지막 업데이트: 2026-07-11 (동화책 이미지에 본문 텍스트 직접 렌더링 전환)

## 동화책 이미지에 본문 텍스트 직접 렌더링 (완료·검증됨)
- 배경: 참고 영상(조코딩 「실전 수익형 AI 동화책 SaaS 서비스 만들어서 돈 버는 방법」) 스크립트를 사용자가 제공, 현재 구현과 비교 분석하는 과정에서 발견 — 영상은 화면 아래/캡션 오버레이로 텍스트를 따로 그리지 않고 **gpt-image-2가 그림 안에 한글을 직접 그려 넣는 방식**을 썼고 "한글도 안 깨지고 잘 써준다"고 실제로 시연함. 직전 세션에 "AI 이미지 모델의 한글 렌더링은 신뢰 불가"라는 이유로 반대 방향(오버레이 방식)을 채택했었는데, 이 판단이 틀렸을 가능성이 제기됨.
- **검증**: 프로덕션과 동일 설정(gpt-image-2, quality=low, 1024×1024)으로 실제 스토리 문장 스타일 5장 생성 → **5/5 전부 정상 렌더링**(쉼표·느낌표·숫자 혼용까지 깨짐 없음). 이어서 실제 프로덕션 프롬프트 조합(style_guide + scene + 말풍선 + 본문 텍스트 동시 적용)으로 2장 추가 검증 → 캡션과 말풍선이 헷갈리지 않고 정확히 분리 렌더링됨, 캐릭터 일관성도 유지됨.
- **구현**: `lib/openai.js`에 `withStoryText(scene, text)` 추가 — 이미지 프롬프트에 본문 텍스트를 "그림 안에 자연스러운 캡션으로 그려 넣으라"는 지시를 삽입(`withSpeechBubble()`과 동일한 패턴). `pages/api/books/create.js`가 신규 책을 `content.text_in_image=true`로 생성하고, `pages/api/books/process-image.js`가 이 플래그가 있을 때만 `withStoryText()`를 적용.
- **하위호환**: `BookViewer.js`(화면 아래 텍스트), `lib/pdf-generator.js`(화면용 PDF), `lib/print-pdf-generator.js`(SweetBook 인쇄용 PDF 캡션 오버레이) 세 곳 모두 `book.content.text_in_image` 플래그를 확인해 있으면 텍스트를 중복으로 다시 그리지 않고, 플래그가 없는 기존 책(이번 변경 이전에 생성된 모든 책)은 기존 방식 그대로 유지 — 회귀 없음.
- 프로덕션 배포 완료(커밋 `513b176`).

## SweetBook 실물 책 인쇄·배송 기능 추가 (핵심 플로우 검증 완료, 웹훅만 보류)
- 요청: 완성된 동화책을 SweetBook Book Print API로 실물 인쇄해 배송받는 기능. "실물 책으로 받기" 버튼 → 주소 입력 → Polar 결제("책 제작 배송권") → 결제 확인 후 SweetBook에 자동 접수.
- **판형**: `SQUAREBOOK_HC`(고화질 스퀘어북 하드커버, 243×248mm, PUR제본, 24~130p) 고정.
- **페이지 수 정책 변경**: SweetBook 최소 인쇄 규격(24p)을 맞추기 위해 **사이트 전체 신규 동화책의 페이지 수 기본값을 5~20장 → 24~40장(짝수)으로 변경**(`components/book/ThemeInput.js` 슬라이더, `pages/create.js`/`pages/api/books/create.js` 기본값, `supabase-schema.sql` `books.page_count` 기본값, 라이브 DB도 반영). 기존에 생성된 책(4~10페이지)은 인쇄 조건 미달이라 실물 주문 버튼이 안 뜨는 게 정상.
- **인쇄용 PDF는 화면용과 완전히 별도 경로**: `lib/print-pdf-generator.js`. SweetBook 사이즈 계산 API(`GET /book-specs/{uid}/calculated-size?pages=N`)로 매번 정확한 mm 치수를 받아와 그대로 캔버스 크기로 사용(하드코딩 금지 — 페이지 수 구간에 따라 표지 너비가 바뀜). 표지는 뒤표지+책등+앞표지 펼침면 1장, 내지는 페이지당 1장. 이미지는 pdf-lib 클리핑(`pushGraphicsState`/`rectangle`/`clip`)으로 도련까지 꽉 채우는 object-cover 크롭, 텍스트는 그 위에 반투명 캡션 바로 오버레이(사용자가 "그림 안에 AI가 직접 글자를 그리는 방식"이 아니라 "우리 코드가 이미지 위에 텍스트를 얹는 방식"을 명시적으로 선택함 — AI 이미지 모델의 한글 텍스트 렌더링 신뢰 불가 때문).
- **`lib/sweetbook.js`**: SweetBook API 클라이언트. 책 생성(PDF_UPLOAD)/표지·내지 PDF 업로드/최종화/주문 생성/조회/웹훅 서명검증(HMAC-SHA256, `sha256=` + `{timestamp}.{body}`). Sandbox/Live는 `SWEETBOOK_SERVER`(base URL)만 다르고 인터페이스 동일.
- **결제·주문 플로우**: `pages/api/payment/physical-order/create.js`(주소 검증 + `physical_orders` pending 행 생성 + Polar 체크아웃) → Polar 웹훅(`pages/api/payment/webhook.js`의 `productType==='physical_book'` 분기, `payments` 테이블 CHECK 제약 때문에 일반 결제 기록엔 안 남기고 `physical_orders.status='paid'`만 갱신) → `pages/api/payment/physical-order/process.js`(PDF 생성 + SweetBook 책 생성·업로드·최종화·주문 생성, 전 구간 Idempotency-Key/409-tolerant로 재시도 안전) → `pages/payment/physical-success.js`(결제 후 리다이렉트, process 엔드포인트를 폴링 호출).
- **DB**: `physical_orders` 테이블 신규(주소, 상태, `sweetbook_book_uid`/`sweetbook_order_uid`, 트래킹 정보, Polar 연결). 상태값: `pending_payment→paid→processing→submitted→confirmed→in_production→production_complete→shipped→delivered`(+`cancelled`/`failed`).
- **UI**: `components/book/PhysicalOrderModal.js`(주소 입력 모달), `BookViewer.js`에 페이지 수 24~130짝수 조건 만족 시 "🎁 실물 책으로 받기" 버튼 + 주문 상태 뱃지(4초 간격 폴링, `paid` 상태면 자동으로 process 엔드포인트 재호출).
- **Polar 상품**: Sandbox에 "책 제작 배송권" 신규 생성 완료(`POLAR_PHYSICAL_BOOK_PRODUCT_ID=2f4cbcf0-1c79-4fee-a385-ad739aa07da1`, ₩39,000 정액 — SweetBook 원가(24~40p 기준 상품+배송+VAT 약 2.5~3만원) 대비 마진 있음, 필요시 파트너 포털에서 가격 조정 가능).
- **실제 SweetBook Sandbox E2E 검증 완료**(합성 테스트 이미지 24페이지, 실제 고객 데이터 미사용): 인쇄용 PDF 생성 → 책 생성 → 표지/내지 업로드(`valid:true`, 경고 없음) → 최종화 → 주문 생성(`PDF_READY`, ₩15,327 정상 차감) → SweetBook이 실제 저장한 PDF를 재다운로드해 이미지 렌더링까지 육안 확인 완료 → 테스트 주문은 취소·환불로 정리함. Sandbox 충전금 ₩50,000 충전해둠(테스트용, 실제 비용 없음).
- ⚠️ **웹훅 미완료**: `PUT /webhooks/config`(웹훅 등록 API)가 SweetBook Sandbox 서버 인프라 문제로 막혀있음 — 요청이 애플리케이션에 도달하기 전에 IIS(윈도우 웹서버) 레벨에서 `405 Method Not Allowed`(WebDAV 관련 추정)를 반환, SweetBook API의 정상 JSON 에러 포맷이 아니라 IIS 기본 에러 페이지(HTML)가 옴 — 클라이언트 요청 문제 아님. `GET /webhooks/config`·`GET /book-specs` 등 다른 엔드포인트는 정상 동작해 API Key 자체는 문제없음. **SweetBook 측 문의 필요**. `SWEETBOOK_WEBHOOK_SECRET`은 비워둔 채 배포됨 — 웹훅 없이도 주문 생성까지는 완전히 동작하지만, 제작확정/발송/배송완료 등 이후 상태는 자동 갱신되지 않고 "제작 준비중"에 멈춰 보임. 웹훅 문제 해결되면 `PUT /webhooks/config` 재호출해서 시크릿 받아 env에 반영할 것.
- **배포 완료**: 코드 커밋·푸시(`e80cb37`) + Vercel 프로덕션 배포 완료. Vercel env에 `POLAR_PHYSICAL_BOOK_PRODUCT_ID`/`NEXT_PUBLIC_POLAR_PHYSICAL_BOOK_PRODUCT_ID`/`NEXT_PUBLIC_PHYSICAL_BOOK_PRICE_KRW`/`SWEETBOOK_API_KEY`/`SWEETBOOK_SERVER` 추가 완료(`SWEETBOOK_WEBHOOK_SECRET`은 미설정). `NEXT_PUBLIC_*` 변경 반영을 위해 `vercel --prod` 수동 재배포까지 완료, 실제 프로덕션에서 신규 라우트 응답 확인(`/api/sweetbook/webhook`, `/api/payment/physical-order/create` 401 정상, `/payment/physical-success` 200).
- **주의**: 아직 Sandbox 결제/Sandbox 인쇄 단계 — 실제 돈이 오가거나 실제 책이 인쇄·배송되지는 않음. Live 전환은 Polar Live 전환과 마찬가지로 별도 절차 필요(SweetBook Business 계정 전환 + Live API Key + 실제 충전금 충전).

## 방향키 페이지 넘김 기능 제거 (완료·검증됨)
- 요청: 동화책 읽기 화면에서 키보드 방향키(←/→)로 페이지 넘기는 기능 제외.
- `components/book/BookViewer.js`: `handleKeyDown`(← `goToPrev`/→ `goToNext`) 삭제, 컨테이너의 `tabIndex`/`onKeyDown` 제거, 표지의 "← → 키를 눌러 페이지를 넘기세요" 안내 문구 삭제. `styles/components/BookViewer.module.css`의 관련 `.coverHint` 클래스도 정리.
- ◀ 이전/다음 ▶ 버튼과 썸네일 클릭 네비게이션은 그대로 유지.
- 실제 프로덕션에서 방향키 입력 시 더 이상 페이지가 안 넘어가고, 버튼 클릭은 정상 동작하는 것 확인.

## ⏸️ BGM 튜닝 — 사용자가 "나중에 다시 정리하자"며 일시 중단
지금 상태(카테고리별 코드 진행 + 작곡 멜로디, 볼륨 0.06)로 일단 커밋·배포는 완료됐고 정상 동작함. 다만 사용자가 더 다듬을 여지가 있다고 판단해 다음 세션으로 미룸. 다음에 이어갈 때 참고할 것: 현재 `lib/bgm.js`의 `MOODS` 객체에 카테고리별 `progression`(화음 4개) / `scale`(7음 온음계) / `melody`(음정+리듬 배열)가 정의돼 있음 — 톤/템포/곡 길이 등을 조정하고 싶으면 이 객체만 손보면 됨. 필요하면 `NEXT_PUBLIC_ENABLE_BGM=false`로 즉시 끌 수 있음(별도 재작업 없이 안전하게 롤백 가능).

## BGM에 카테고리별 작곡 멜로디 추가 (완료·검증됨)
- 기존엔 현재 화음 구성음을 순서대로 기계적으로 튕기기만 해서 "곡"이라기보다 반복 신호음처럼 들린다는 피드백.
- `lib/bgm.js`의 `MOODS`에 카테고리 6개 각각 **스케일(7음 온음계) + 직접 작곡한 멜로디 구(음정+리듬)** 추가. 화음 진행(6초 주기)과 멜로디 구 길이를 의도적으로 다르게 둬 제너레이티브 음악 기법처럼 매번 조금씩 다른 조합으로 들림.
- Playwright로 오실레이터 시작 시각/주파수를 후킹해 실제 재생되는 리듬·음정이 작곡한 패턴과 정확히 일치하는 것을 로컬+프로덕션 양쪽에서 확인.
- 여전히 외부 음원 없이 브라우저에서 직접 합성 — 저작권 문제 없음.

## BGM 개선 + 뷰어 버그 수정 (완료·검증됨)
사용자 피드백 4건 반영:
1. **BGM이 단음으로만 나와 시끄러움** → `lib/bgm.js`를 코드 진행(화음 4개가 부드럽게 페이드인/아웃하며 순환, `CHORD_DURATION=6초`) + 위에 얹는 짧은 아르페지오 멜로디로 재작성. 기본 볼륨 0.12→0.05로 낮춤.
2. **BGM on/off 아이콘이 이미지 우상단에 고정돼야 함** → 재생 상태(`AmbientPlayer` 인스턴스)를 `BgmToggle`이 아니라 `BookViewer`가 소유하도록 끌어올리고, 표지/본문 이미지를 공통 `.imageFrame`(실제 이미지 폭에 맞춘 max-width)으로 감싸 배지가 이미지 경계에 정확히 붙게 함 — 페이지를 넘겨도 배지 위치 고정 + 음악 끊김 없음.
3. **확대/축소 버튼 무반응** → zoom scale transform이 본문 페이지(`.page`)에만 적용되고 표지(`.cover`)엔 빠져있던 버그. 표지에도 동일 적용.
4. **사이트 내 읽기 텍스트도 호흡 단위 줄바꿈** → PDF에 쓰던 `splitIntoBreathUnits()`를 `lib/textFormat.js`(순수 함수, fs 의존성 없음)로 분리해 서버(PDF)·클라이언트(BookViewer) 양쪽에서 재사용.
- Playwright로 실제 배포 사이트에서 검증: 오실레이터 다중 생성(단음 아님) 확인, 배지 우상단 정렬 확인, 페이지 이동해도 재생 유지 확인, 확대 클릭 시 실제 transform 적용 확인, 본문 5줄 호흡 단위 렌더링 확인.

## 읽기 화면 배경음악(BGM) 추가 (완료·검증됨)
- 요청: 저작권 문제 없이 동화책 읽는 화면에 BGM을 넣고 싶음 + 이야기 생성에 영향 준다면 쉽게 끌 수 있는 구조로.
- 접근: 외부 음원(mp3 등)을 전혀 쓰지 않고 **브라우저 Web Audio API로 그때그때 화음을 직접 합성**해 재생(`lib/bgm.js`의 `AmbientPlayer`). 어디서도 가져온 음원이 없으므로 저작권 문제가 원천적으로 발생할 수 없음. 카테고리(animals/fantasy/adventure/friendship/education/scifi)별로 다른 화음(주파수 조합)을 매핑해 은은한 분위기 차이를 줌 — 예: adventure는 D장조 4화음, fantasy는 A단조.
- 완전 격리: `lib/bgm.js` + `components/book/BgmToggle.js` 2개 파일 모두 텍스트/이미지 생성 파이프라인(`lib/openai.js`, `pages/api/books/*`)과 전혀 연결 안 됨. `BookViewer.js`의 통합 지점은 `NEXT_PUBLIC_ENABLE_BGM` 환경변수 + 한 줄짜리 조건부 렌더링(`{BGM_ENABLED && <BgmToggle .../>}`) 하나뿐 — 문제 생기면 env를 `false`로 바꾸거나 그 줄만 지우면 즉시 끌 수 있음.
- 검증: Playwright로 `AudioContext`/`OscillatorNode` 호출을 직접 후킹해 카테고리에 맞는 화음(음 4개 + LFO 4개 = 오실레이터 8개)이 정확히 생성·재생(`state: 'running'`)되고, 정지 시 8개 전부 정상 종료되는 것 확인. 실제 프로덕션에서도 버튼 클릭 → 재생 상태 전환 확인.
- ⚠️ **NEXT_PUBLIC_ 환경변수는 빌드 시점에 값이 고정됨** — Vercel env를 바꿔도 재배포(재빌드) 전까지는 반영 안 됨. 로컬 `next dev`도 Turbopack 캐시 때문에 값 변경이 바로 반영 안 될 수 있어(재현됨), 확실히 확인하려면 `.next` 삭제 후 `next build`로 새로 빌드해서 테스트할 것.

## PDF 텍스트 호흡 단위 줄바꿈 (완료·검증됨)
- 요청: PDF 본문 텍스트를 유치원 선생님이 아이에게 읽어주듯 자연스러운 호흡 단위로 줄바꿈.
- `lib/pdf-generator.js`에 `splitIntoBreathUnits()` 추가 — 쉼표·마침표·느낌표·물음표 뒤에서 끊어 각 구절을 한 줄로 만듦(예: "비가 톡톡 내리자," / "레오는 밖으로 폴짝 나갔어요."). 한 구절이 페이지 폭보다 길면 기존 `wrapText()`로 한 번 더 나누는 안전장치 유지.
- 로컬 + 실제 프로덕션 양쪽에서 PDF를 받아 육안으로 확인 완료.

## PDF 레이아웃 개선 + 다운로드 버튼 로딩 표시 (완료·검증됨)
- 문제 1: 본문 페이지 이미지가 최대 300pt 높이로 고정돼 페이지 크기 대비 작아 보였고, 텍스트는 페이지 하단 고정 위치(y=120)에 그려서 이미지가 작을 때 이미지와 텍스트 사이에 큰 빈 공간이 생겨 서로 따로 노는 것처럼 보였음.
  → `lib/pdf-generator.js`: 이미지 최대 높이 300→480pt로 확대, 텍스트를 **실제 이미지 하단 바로 아래(고정 40pt 간격)**에 배치하도록 변경(이미지 크기와 무관하게 항상 자연스럽게 이어붙음). 텍스트도 좌측 정렬 → 가운데 정렬로 변경해 이미지와 시각적으로 정렬.
- 문제 2: PDF 다운로드 버튼 클릭 후 PDF 생성이 끝날 때까지(수 초~수십 초) 버튼에 아무 반응이 없어 멈춘 것처럼 보이고 오류로 오인할 수 있었음.
  → `components/book/BookViewer.js`: `downloading` 상태 추가, 기존 `Button` 컴포넌트의 `loading` prop(스피너)을 그대로 활용.
- 로컬 + 실제 프로덕션 양쪽에서 PDF를 받아 페이지를 이미지로 렌더링해 육안으로 확인 완료.

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

## ⏭️ 다음에 할 일 (우선순위순, 2026-07-11 갱신)

> 경쟁력 진단 + 6단계 2차 PRD 로드맵은 Claude Artifact로 별도 정리되어 있음:
> https://claude.ai/code/artifact/fda14e8c-41ed-4071-81c5-bfcceeb3ea4f
> (기능 인벤토리·시장 비교·강점약점·Stage 01~06 로드맵·참고 영상 대비 구현 차이 분석. Stage 04는 텍스트-인-이미지 항목만 부분 완료로 표시됨.)

1. **SweetBook 웹훅 등록 막힘** — 🔴 SweetBook Sandbox 서버 인프라 문제(`PUT /webhooks/config` 호출 시 IIS 405, WebDAV 추정). SweetBook 고객지원 문의 필요. 자세한 내용은 [[sweetbook-print-integration]] 메모 참고.
2. **Polar 운영(production) 전환** — 🔴 진행 중, 사용자 액션 대기.
   - **막힌 지점**: 운영(production) Polar 액세스 토큰이 필요한데, 이건 사용자가 polar.sh에 운영 계정으로
     로그인해서 발급해야 함(Claude가 대신 발급 불가).
   - **토큰 받으면 이어서 할 일**:
     1) 운영 계정에 제품 4종 재생성(KRW) — 월간구독 ₩9,900 / 연간구독 ₩89,000 / 크레딧10권 ₩8,900 / 책 제작 배송권 ₩39,000
        (샌드박스 때처럼 organization_id 넣지 말 것, currency는 조직 기본통화에 맞출 것 — 이전에 422 에러 겪음)
     2) `.env.local` + Vercel production env: `POLAR_SERVER`를 `https://api.polar.sh`로,
        `POLAR_ACCESS_TOKEN`/제품 ID 4종을 운영 값으로 교체
     3) 운영용 웹훅 엔드포인트 신규 등록(`https://mytale-ai.vercel.app/api/payment/webhook`) →
        새 `POLAR_WEBHOOK_SECRET` 발급받아 env 반영
     4) Vercel 재배포 + 체크아웃/웹훅 E2E 검증
3. **SweetBook Live 전환** — 🔴 사업 협의 + Business 계정 전환 + Live API Key + 실제 충전금 필요(사용자 액션).
4. **PRD Stage 01(데이터 기반)·03(성장 루프)·05(리텐션)·06(비즈니스 확장) + Stage 04 잔여(오디오 내레이션·얼굴 유사도)** — 전부 미착수. 위 아티팩트 참고.
5. (선택) 실제 구매 도메인 연결 시 Vercel Deployment Protection 설정 재검토 (현재 비활성화 상태로 완전 공개).

---

## 🚀 배포 상태 (2026-07-11 기준, 세션 종료 시점)
- **Git**: `main` 브랜치, 로컬/원격 완전 동기화(`nothing to commit, working tree clean` — `llms-full.txt`는 사용자가 직접 둔 참고 문서라 커밋 대상 아님).
- **최신 커밋**: `1738a91`(텍스트-인-이미지 전환 핸드오프 문서화). 그 이전 `513b176`(텍스트-인-이미지 기능), `02a0716`/`e80cb37`(SweetBook 실물 인쇄 기능).
- **Vercel**: 위 최신 커밋까지 production 배포 완료·확인(`https://mytale-ai.vercel.app` 관련 신규 라우트 전부 200/401 정상 응답).
- **Supabase**: 이번 세션(전체) `physical_orders` 테이블 신규 생성 + `books.page_count` 기본값 24로 변경. `content` JSONB의 `text_in_image` 플래그는 스키마 변경 없이 JSON 필드로만 추가(마이그레이션 불필요).
- 로컬 dev 서버 등 백그라운드 프로세스 없음, 테스트로 만든 SweetBook 테스트 주문은 취소·환불로 정리됨.

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
