-- ===========================================
-- AI 동화책 서비스 Supabase 스키마
-- https://supabase.com/dashboard 에서 SQL Editor에서 실행
-- ===========================================

-- 1. profiles 테이블 (auth.users와 1:1 연결)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  credits INTEGER DEFAULT 0,          -- 레거시(사전구매 크레딧 팩) — 2026-07-13부로 "만들기 클릭 시
                                       -- 즉시결제" 방식으로 전환되어 신규 로직에서는 더 이상 사용 안 함
  is_premium BOOLEAN DEFAULT false,
  subscription_status TEXT DEFAULT 'free',
  polar_customer_id TEXT,
  polar_subscription_id TEXT,
  phone_number_hash TEXT UNIQUE,      -- SHA-256(전화번호) — 무료 티어 중복 수령 방지용 dedup 키
  phone_verified BOOLEAN DEFAULT false,
  free_trial_used_at TIMESTAMPTZ,     -- 5페이지 무료 티어 사용 시각(NULL=미사용). 당일 전환
                                       -- 할인 판정에 날짜가 필요해 boolean이 아닌 타임스탬프로 기록
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. books 테이블 (동화책)
CREATE TABLE IF NOT EXISTS books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  category TEXT,
  theme TEXT,
  age_group TEXT DEFAULT 'preschool', -- 'toddler'(0~5) | 'preschool'(5~7) | 'elementary'(8~13)
  content JSONB,                      -- { style_guide, pages: [{text, image_url, image_prompt, speech_bubble}] }
  cover_image_url TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'generating', 'completed', 'failed')),
  page_count INTEGER DEFAULT 24,
  is_photo_based BOOLEAN DEFAULT false,
  character_photo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. payments 테이블 (결제 내역)
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  polar_payment_id TEXT UNIQUE,
  amount INTEGER,
  currency TEXT DEFAULT 'KRW',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  product_type TEXT CHECK (product_type IN ('subscription', 'credits')),
  product_id TEXT,
  credits_purchased INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. subscriptions 테이블 (구독)
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  polar_subscription_id TEXT UNIQUE,
  plan TEXT CHECK (plan IN ('monthly', 'yearly')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'past_due', 'paused')),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. physical_orders 테이블 (실물 책 인쇄·배송 주문 — SweetBook Book Print API 연동)
CREATE TABLE IF NOT EXISTS physical_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  book_id UUID REFERENCES books(id) ON DELETE CASCADE NOT NULL,
  status TEXT DEFAULT 'pending_payment' CHECK (status IN (
    'pending_payment',   -- Polar 체크아웃 생성됨, 결제 대기
    'paid',               -- Polar 결제 완료, SweetBook 연동 대기
    'processing',         -- 인쇄용 PDF 생성 + SweetBook 업로드 중
    'submitted',          -- SweetBook 주문 생성 완료 (PAID/PDF_READY)
    'confirmed',          -- 제작확정 (CONFIRMED)
    'in_production',      -- 제작중
    'production_complete',-- 전체제작완료
    'shipped',             -- 발송완료
    'delivered',           -- 배송완료
    'cancelled',            -- 취소
    'failed'                -- SweetBook 연동 실패 (내부 오류)
  )),
  recipient_name TEXT,
  recipient_phone TEXT,
  postal_code TEXT,
  address1 TEXT,
  address2 TEXT,
  shipping_memo TEXT,
  polar_checkout_id TEXT,
  polar_payment_id TEXT,
  amount INTEGER,
  currency TEXT DEFAULT 'KRW',
  sweetbook_book_uid TEXT,
  sweetbook_order_uid TEXT,
  tracking_carrier TEXT,
  tracking_number TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 6. image_generation_jobs 테이블 (OpenAI Responses API 비동기 이미지 생성 작업 상관관계 추적)
--    background:true로 시작한 responses.create() 호출의 response_id를 어느 책의 표지/몇 번째
--    페이지 작업인지와 연결해준다 — 웹훅(response.completed 등) 수신 시, 그리고 웹훅이
--    아직 도착하지 않았을 때의 폴백 폴링(check-images.js) 시 둘 다 이 테이블로 조회한다.
CREATE TABLE IF NOT EXISTS image_generation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id TEXT UNIQUE NOT NULL,
  book_id UUID REFERENCES books(id) ON DELETE CASCADE NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('cover', 'page')),
  page_index INTEGER,              -- kind='page'일 때 content.pages 배열의 인덱스, cover면 NULL
  status TEXT DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'failed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_image_generation_jobs_book_id ON image_generation_jobs(book_id);

-- 7. pending_book_orders 테이블 ("만들기" 클릭 시 즉시결제 방식의 1회 결제 주문)
--    physical_orders와 같은 패턴: 결제가 책 생성보다 먼저 일어나므로 book_id는 결제 완료
--    전까지 NULL이다. payments 테이블의 product_type CHECK('subscription','credits')와
--    맞지 않아 physical_orders처럼 독립 테이블로 분리(결제 웹훅에서 payments에는 기록 안 함).
CREATE TABLE IF NOT EXISTS pending_book_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  book_id UUID REFERENCES books(id) ON DELETE SET NULL, -- 생성 완료 후 채워짐
  tier TEXT NOT NULL CHECK (tier IN ('free', 'tier_24_30', 'tier_31_40', 'tier_41_50')),
  params JSONB NOT NULL,     -- 책 생성에 필요한 입력값 스냅샷 (title/category/theme/ageGroup/
                              -- characterNames/characterPhotoUrl/pageCount)
  amount INTEGER NOT NULL DEFAULT 0,     -- 무료 티어면 0
  discount_applied BOOLEAN DEFAULT false, -- 당일 전환 할인 적용 여부
  status TEXT DEFAULT 'pending_payment' CHECK (status IN (
    'pending_payment',  -- Polar 체크아웃 생성됨(무료 티어는 이 상태를 건너뛰고 바로 paid)
    'paid',              -- 결제 완료, 책 생성 대기
    'created',           -- 책 생성 완료
    'failed'             -- 결제 후 생성 실패
  )),
  polar_checkout_id TEXT,
  polar_payment_id TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pending_book_orders_user_id ON pending_book_orders(user_id);

-- 8. otp_verifications 테이블 (Solapi SMS 본인인증 — 무료 티어 중복 수령 방지)
CREATE TABLE IF NOT EXISTS otp_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  phone TEXT NOT NULL,           -- 인증 진행 중에만 평문 보관, 검증 성공 시 profiles에는 해시만 저장
  code_hash TEXT NOT NULL,       -- SHA-256(6자리 코드) — 평문 코드는 저장하지 않음
  attempts INTEGER DEFAULT 0,    -- 무차별 대입 방지(5회 초과 시 만료 처리)
  verified_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_otp_verifications_user_id ON otp_verifications(user_id);

-- 페이지 이미지 URL을 원자적으로 갱신하는 함수. 여러 이미지 생성 작업이 거의 동시에 끝나면서
-- (배경 모드 특성상 흔함) 애플리케이션 코드에서 content JSONB를 읽고-수정하고-쓰는 방식으로
-- 처리하면 경쟁 상태에서 서로의 갱신을 덮어쓸 수 있다 — DB 함수 안에서 단일 UPDATE 문으로
-- jsonb_set을 실행해 이 문제를 원천 차단한다.
CREATE OR REPLACE FUNCTION set_page_image(p_book_id UUID, p_page_index INT, p_url TEXT)
RETURNS void AS $$
BEGIN
  UPDATE books
  SET content = jsonb_set(content, ARRAY['pages', p_page_index::text, 'image_url'], to_jsonb(p_url), false)
  WHERE id = p_book_id;
END;
$$ LANGUAGE plpgsql;

-- 페이지 오디오(TTS 내레이션) URL을 원자적으로 갱신하는 함수. set_page_image와 동일한 이유
-- (JSONB 배열 읽고-수정-쓰기 경쟁 상태 방지)로 별도 함수를 둠.
CREATE OR REPLACE FUNCTION set_page_audio(p_book_id UUID, p_page_index INT, p_url TEXT)
RETURNS void AS $$
BEGIN
  UPDATE books
  SET content = jsonb_set(content, ARRAY['pages', p_page_index::text, 'audio_url'], to_jsonb(p_url), true)
  WHERE id = p_book_id;
END;
$$ LANGUAGE plpgsql;

-- ===========================================
-- Row Level Security (RLS) 정책
-- ===========================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE books ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE physical_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE image_generation_jobs ENABLE ROW LEVEL SECURITY;
-- image_generation_jobs: 순수 서버 내부 상관관계 테이블 — service role(RLS 우회)로만 접근,
-- 사용자용 정책 없음(기본 거부)
ALTER TABLE pending_book_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE otp_verifications ENABLE ROW LEVEL SECURITY;
-- otp_verifications: 순수 서버 내부 테이블 — service role로만 접근, 사용자용 정책 없음(기본 거부)

-- profiles: 본인만 접근
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- books: 본인만 접근
DROP POLICY IF EXISTS "Users can view own books" ON books;
CREATE POLICY "Users can view own books" ON books FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own books" ON books;
CREATE POLICY "Users can insert own books" ON books FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own books" ON books;
CREATE POLICY "Users can update own books" ON books FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own books" ON books;
CREATE POLICY "Users can delete own books" ON books FOR DELETE USING (auth.uid() = user_id);

-- payments: 본인만 접근
DROP POLICY IF EXISTS "Users can view own payments" ON payments;
CREATE POLICY "Users can view own payments" ON payments FOR SELECT USING (auth.uid() = user_id);

-- subscriptions: 본인만 접근
DROP POLICY IF EXISTS "Users can view own subscription" ON subscriptions;
CREATE POLICY "Users can view own subscription" ON subscriptions FOR SELECT USING (auth.uid() = user_id);

-- physical_orders: 본인만 접근 (생성/상태 갱신은 서버가 service role 키로 처리 — RLS 우회)
DROP POLICY IF EXISTS "Users can view own physical orders" ON physical_orders;
CREATE POLICY "Users can view own physical orders" ON physical_orders FOR SELECT USING (auth.uid() = user_id);

-- pending_book_orders: 본인만 접근 (생성/상태 갱신은 서버가 service role 키로 처리 — RLS 우회)
DROP POLICY IF EXISTS "Users can view own book orders" ON pending_book_orders;
CREATE POLICY "Users can view own book orders" ON pending_book_orders FOR SELECT USING (auth.uid() = user_id);

-- ===========================================
-- 자동 업데이트 트리거
-- ===========================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_books_updated_at ON books;
CREATE TRIGGER update_books_updated_at BEFORE UPDATE ON books
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_physical_orders_updated_at ON physical_orders;
CREATE TRIGGER update_physical_orders_updated_at BEFORE UPDATE ON physical_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_pending_book_orders_updated_at ON pending_book_orders;
CREATE TRIGGER update_pending_book_orders_updated_at BEFORE UPDATE ON pending_book_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_image_generation_jobs_updated_at ON image_generation_jobs;
CREATE TRIGGER update_image_generation_jobs_updated_at BEFORE UPDATE ON image_generation_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ===========================================
-- 프로필 자동 생성 트리거 (회원가입 시)
-- ===========================================

-- 주의: SET search_path = public 필수.
-- GoTrue(Auth 서비스)가 트리거를 실행할 때 search_path에 public이 없어
-- profiles 테이블을 찾지 못하면 회원가입이 "Database error" 500으로 실패한다.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ===========================================
-- Storage 버킷 (사진 업로드용)
-- ===========================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('character-photos', 'character-photos', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone can view character photos" ON storage.objects
  FOR SELECT USING (bucket_id = 'character-photos');

CREATE POLICY "Authenticated users can upload character photos" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'character-photos' AND auth.role() = 'authenticated');

CREATE POLICY "Users can delete own character photos" ON storage.objects
  FOR DELETE USING (bucket_id = 'character-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
