// lib/bookCreation.js 생성 파이프라인 단위테스트 — mock 기반이라 외부 API 호출/비용 없음.
// 실행: npm run test:book (프로젝트 루트에서)
import { createBookRecord, generateBookContent, generateBookContentSafely } from '../lib/bookCreation.js'

let failures = 0
function assert(cond, label) {
  if (cond) { console.log(`  ✅ ${label}`) } else { failures += 1; console.error(`  ❌ ${label}`) }
}

// ---------- Mock Supabase ----------
function makeMockSupabase() {
  const state = { books: {}, jobs: [], jobInsertBatches: [], rpcCalls: [], updates: [] }
  const chain = (table) => {
    const ctx = { table, op: null, payload: null, filters: {} }
    const self = {
      insert(payload) { ctx.op = 'insert'; ctx.payload = payload; return self },
      update(payload) { ctx.op = 'update'; ctx.payload = payload; return self },
      select() { return self },
      eq(col, val) { ctx.filters[col] = val; return self },
      single() {
        if (ctx.table === 'books' && ctx.op === 'insert') {
          const book = { id: 'book-1', ...ctx.payload }
          state.books['book-1'] = book
          return Promise.resolve({ data: book, error: null })
        }
        return Promise.resolve({ data: null, error: null })
      },
      then(resolve, reject) {
        // await된 시점에 실행되는 non-single 연산 (update, jobs insert)
        if (ctx.table === 'image_generation_jobs' && ctx.op === 'insert') {
          const rows = Array.isArray(ctx.payload) ? ctx.payload : [ctx.payload]
          state.jobs.push(...rows)
          state.jobInsertBatches.push(rows.length)
        }
        if (ctx.op === 'update') {
          state.updates.push({ table: ctx.table, payload: ctx.payload, filters: { ...ctx.filters } })
          if (ctx.table === 'books' && state.books[ctx.filters.id]) {
            Object.assign(state.books[ctx.filters.id], ctx.payload)
          }
        }
        return Promise.resolve({ data: null, error: null }).then(resolve, reject)
      },
    }
    return self
  }
  return { state, from: (table) => chain(table), rpc: (fn, args) => { state.rpcCalls.push({ fn, args }); return Promise.resolve({ error: null }) } }
}

// ---------- Mock OpenAI ----------
function makeMockOpenAI({ failPlan = {} } = {}) {
  // failPlan: { [promptSubstring]: 실패시킬횟수(-1이면 영구 실패) }
  const counters = {}
  let jobSeq = 0
  const stats = { textCalls: 0, imageStartAttempts: 0, lastTextParams: null }
  const pages = Array.from({ length: 24 }, (_, i) => ({
    page: i + 1,
    text: `페이지 ${i + 1}의 이야기예요.`,
    image_prompt: `scene ${i + 1}`,
    speech_bubble: i % 3 === 0 ? '우와!' : '',
    narration_lead_in: i % 2 === 0 ? '그때,' : '',
  }))
  return {
    stats,
    chat: {
      completions: {
        create(params) {
          stats.textCalls += 1
          stats.lastTextParams = params
          return Promise.resolve({ choices: [{ message: { content: JSON.stringify({ style_guide: 'warm watercolor style', pages }) } }] })
        },
      },
    },
    responses: {
      create(params) {
        stats.imageStartAttempts += 1
        for (const [substr, plan] of Object.entries(failPlan)) {
          if (params.input.includes(substr)) {
            counters[substr] = (counters[substr] || 0) + 1
            if (plan === -1 || counters[substr] <= plan) {
              const err = new Error('Rate limit reached')
              err.status = 429
              return Promise.reject(err)
            }
          }
        }
        jobSeq += 1
        return Promise.resolve({ id: `resp_${jobSeq}`, status: 'queued' })
      },
    },
  }
}

async function main() {
const params = { userId: 'user-1', title: '테스트 책', category: 'animals', theme: '아기의 첫 생일', ageGroup: 'toddler', characterNames: '', pageCount: 24 }

// ========== 테스트 1: 정상 경로 ==========
console.log('\n[1] 정상 경로 — 24페이지 책 생성')
{
  const supabase = makeMockSupabase()
  const openai = makeMockOpenAI()
  const book = await createBookRecord(supabase, params)
  assert(book.id === 'book-1' && book.status === 'generating', 'createBookRecord가 generating 상태의 행을 즉시 반환')
  await generateBookContent(supabase, openai, book, params)
  assert(openai.stats.lastTextParams.max_completion_tokens === 16000, `max_completion_tokens 기본값 16000 적용 (실제: ${openai.stats.lastTextParams.max_completion_tokens})`)
  const contentUpdate = supabase.state.updates.find((u) => u.table === 'books' && u.payload.content)
  assert(contentUpdate && contentUpdate.payload.content.pages.length === 24, 'content에 24페이지 저장')
  assert(supabase.state.jobs.length === 25, `이미지 작업 25개(표지+24페이지) 기록 (실제: ${supabase.state.jobs.length})`)
  assert(supabase.state.jobInsertBatches.length === 4, `작업 행이 청크별로 나눠 기록됨 — 웹훅 선착 경쟁 완화 (배치: ${JSON.stringify(supabase.state.jobInsertBatches)})`)
  assert(supabase.state.rpcCalls.length === 0, '실패(빈 이미지) 처리 없음')
}

// ========== 테스트 2: 일시 오류(429) 재시도 ==========
console.log('\n[2] 429 일시 오류 — 2번 실패 후 3번째 성공하는 페이지')
{
  const supabase = makeMockSupabase()
  const openai = makeMockOpenAI({ failPlan: { 'scene 5': 2 } }) // scene 5만 2회 429 후 성공
  const book = await createBookRecord(supabase, params)
  const t0 = Date.now()
  await generateBookContent(supabase, openai, book, params)
  const elapsed = Date.now() - t0
  assert(supabase.state.jobs.length === 25, `재시도로 결국 25개 전부 시작됨 (실제: ${supabase.state.jobs.length})`)
  assert(supabase.state.rpcCalls.length === 0, '영구 실패("") 처리된 페이지 없음')
  assert(elapsed >= 6000, `백오프 대기 적용됨 (2s+4s, 실제 ${elapsed}ms)`)
}

// ========== 테스트 3: 영구 실패 ==========
console.log('\n[3] 영구 429 — 재시도 소진 후 해당 페이지만 빈 이미지 처리')
{
  const supabase = makeMockSupabase()
  const openai = makeMockOpenAI({ failPlan: { 'scene 7': -1 } })
  const book = await createBookRecord(supabase, params)
  await generateBookContent(supabase, openai, book, params)
  assert(supabase.state.jobs.length === 24, `나머지 24개는 정상 시작 (실제: ${supabase.state.jobs.length})`)
  const failed = supabase.state.rpcCalls.filter((c) => c.fn === 'set_page_image' && c.args.p_url === '')
  assert(failed.length === 1 && failed[0].args.p_page_index === 6, '실패 페이지(7번, index 6)만 정확히 빈 이미지 처리')
}

// ========== 테스트 4: 텍스트 생성 실패 시 안전망 ==========
console.log('\n[4] 텍스트 생성 실패 — generateBookContentSafely 안전망')
{
  const supabase = makeMockSupabase()
  const openai = makeMockOpenAI()
  openai.chat.completions.create = () => { const e = new Error('max_tokens is too large'); e.status = 400; return Promise.reject(e) }
  const book = await createBookRecord(supabase, params)
  let onFailureCalled = false
  await generateBookContentSafely(supabase, openai, book, params, async () => { onFailureCalled = true })
  const failUpdate = supabase.state.updates.find((u) => u.table === 'books' && u.payload.status === 'failed')
  assert(!!failUpdate, '책이 failed로 표시됨 (뷰어 실패 화면 연동)')
  assert(onFailureCalled, 'onFailure 후처리(무료체험 반환 등) 호출됨')
}

console.log(failures === 0 ? '\n🎉 전체 테스트 통과' : `\n💥 실패 ${failures}건`)
process.exit(failures === 0 ? 0 : 1)
}
main()
