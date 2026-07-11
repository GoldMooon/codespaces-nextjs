// SweetBook Book Print API 클라이언트
// 실물 책 인쇄·배송을 위한 SweetBook(https://sweetbook.com) 연동.
// Sandbox/Live는 SWEETBOOK_SERVER(base URL)와 SWEETBOOK_API_KEY로만 구분된다 — 인터페이스는 동일.
import crypto from 'crypto'

const SWEETBOOK_BASE = process.env.SWEETBOOK_SERVER || 'https://api-sandbox.sweetbook.com/v1'

export const SQUAREBOOK_HC = 'SQUAREBOOK_HC'

function authHeaders(extra = {}) {
  return {
    Authorization: `Bearer ${process.env.SWEETBOOK_API_KEY}`,
    ...extra,
  }
}

async function sbFetch(path, options = {}) {
  const response = await fetch(`${SWEETBOOK_BASE}${path}`, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers || {}) },
  })

  const contentType = response.headers.get('content-type') || ''
  const isJson = contentType.includes('application/json')
  const body = isJson ? await response.json() : await response.arrayBuffer()

  if (!response.ok) {
    const message = isJson ? (body.errors?.[0] || body.message || 'Unknown error') : `HTTP ${response.status}`
    const err = new Error(`SweetBook API error (${response.status}): ${message}`)
    err.status = response.status
    err.body = isJson ? body : null
    throw err
  }

  return body
}

// GET /book-specs/{bookSpecUid}/calculated-size?pages=N
// 표지/내지 PDF를 만들 정확한 mm 치수를 반환 (그대로 캔버스로 쓰면 ±1mm 톨러런스 검증을 통과함)
export async function getCalculatedSize(bookSpecUid, pages) {
  const body = await sbFetch(`/book-specs/${bookSpecUid}/calculated-size?pages=${pages}`)
  return body.data
}

// POST /books — 빈 책 생성 (draft). PDF_UPLOAD 방식 고정.
export async function createBook({ title, bookSpecUid, pageCount, externalRef, idempotencyKey }) {
  const body = await sbFetch('/books', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: JSON.stringify({
      title,
      bookSpecUid,
      creationType: 'PDF_UPLOAD',
      pageCount,
      ...(externalRef ? { externalRef } : {}),
    }),
  })
  return body.data
}

async function uploadPdf(bookUid, kind, pdfBytes, method) {
  const form = new FormData()
  form.append('file', new Blob([pdfBytes], { type: 'application/pdf' }), `${kind}.pdf`)
  const body = await sbFetch(`/books/${bookUid}/pdf-${kind}`, { method, body: form })
  return body.data
}

export async function uploadCoverPdf(bookUid, pdfBytes) {
  return uploadPdf(bookUid, 'cover', pdfBytes, 'POST')
}

export async function uploadContentsPdf(bookUid, pdfBytes) {
  return uploadPdf(bookUid, 'contents', pdfBytes, 'POST')
}

// POST /books/{bookUid}/finalization — draft → finalized (표지·내지 PDF 둘 다 업로드된 후 호출)
export async function finalizeBook(bookUid) {
  const body = await sbFetch(`/books/${bookUid}/finalization`, {
    method: 'POST',
    headers: { 'Content-Length': '0' },
  })
  return body.data
}

// POST /orders — FINALIZED 책 대상 주문 생성 (충전금 즉시 차감). 이중 차감 방지를 위해 idempotencyKey 필수.
export async function createOrder({ bookUid, quantity = 1, shipping, externalRef, idempotencyKey }) {
  const body = await sbFetch('/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({
      items: [{ bookUid, quantity }],
      shipping,
      ...(externalRef ? { externalRef } : {}),
    }),
  })
  return body.data
}

export async function getOrder(orderUid) {
  const body = await sbFetch(`/orders/${orderUid}`)
  return body.data
}

export async function getCredits() {
  const body = await sbFetch('/credits')
  return body.data
}

// 웹훅 서명 검증: expected = "sha256=" + HMAC-SHA256(secretKey, "{timestamp}.{rawBody}")
export function verifySweetbookWebhookSignature(rawBody, signature, timestamp, secretKey) {
  if (!signature || !timestamp || !secretKey) return false

  const signPayload = `${timestamp}.${rawBody}`
  const expectedHex = crypto.createHmac('sha256', secretKey).update(signPayload).digest('hex')
  const expected = `sha256=${expectedHex}`

  const sigBuf = Buffer.from(signature)
  const expBuf = Buffer.from(expected)
  if (sigBuf.length !== expBuf.length) return false
  return crypto.timingSafeEqual(sigBuf, expBuf)
}
