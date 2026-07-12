// SweetBook 인쇄용 PDF 생성 — 화면용 lib/pdf-generator.js와 별도 경로.
// SQUAREBOOK_HC(고화질 스퀘어북 하드커버) 규격에 정확히 맞춰 표지 1장(펼침면) + 내지 N장을 생성한다.
// 치수는 항상 SweetBook 사이즈 계산 API(getCalculatedSize)에서 그대로 받아 쓴다 — 하드코딩 금지
// (페이지 수에 따라 책등/표지 너비가 달라지고, ±1mm 톨러런스 검증을 확실히 통과시키기 위함).
import { PDFDocument, rgb, degrees, pushGraphicsState, popGraphicsState, rectangle, clip, endPath } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import fs from 'fs'
import path from 'path'
import { splitIntoBreathUnits } from './textFormat'
import { wrapText } from './pdf-generator'
import { getCalculatedSize, SQUAREBOOK_HC } from './sweetbook'

const MM_TO_PT = 72 / 25.4
const mm = (v) => v * MM_TO_PT

// 트림 라인(재단선) 안쪽 안전 여백 — 도련(3mm) + 여유를 더해 텍스트/중요 요소가
// 재단 시 잘리지 않도록 함. 배경 이미지는 안전 여백 없이 캔버스 전체(도련 포함)를 채운다.
const SAFE_MARGIN_MM = 10

export function isEligibleForPrint(book) {
  const pageCount = book?.content?.pages?.length || 0
  return pageCount >= 24 && pageCount <= 130 && pageCount % 2 === 0
}

async function loadFonts(pdfDoc) {
  pdfDoc.registerFontkit(fontkit)
  const regularBytes = fs.readFileSync(path.join(process.cwd(), 'public/fonts/Pretendard-Regular.ttf'))
  const boldBytes = fs.readFileSync(path.join(process.cwd(), 'public/fonts/Pretendard-Bold.ttf'))
  // subset:true는 한글 글리프 누락 버그가 있어(화면 렌더링 육안 확인으로 발견) 사용하지 않는다.
  const regular = await pdfDoc.embedFont(regularBytes)
  const bold = await pdfDoc.embedFont(boldBytes)
  return { regular, bold }
}

async function embedImageFromUrl(pdfDoc, imageUrl) {
  const response = await fetch(imageUrl)
  const imageBytes = await response.arrayBuffer()
  return imageUrl.includes('png') ? pdfDoc.embedPng(imageBytes) : pdfDoc.embedJpg(imageBytes)
}

// 이미지를 대상 사각형에 object-cover(가장자리까지 꽉 채우고 남는 부분은 중앙 기준 크롭)로 그린다.
function drawImageCover(page, image, { x, y, width, height }) {
  const scale = Math.max(width / image.width, height / image.height)
  const drawWidth = image.width * scale
  const drawHeight = image.height * scale
  const drawX = x + (width - drawWidth) / 2
  const drawY = y + (height - drawHeight) / 2

  page.pushOperators(pushGraphicsState(), rectangle(x, y, width, height), clip(), endPath())
  page.drawImage(image, { x: drawX, y: drawY, width: drawWidth, height: drawHeight })
  page.pushOperators(popGraphicsState())
}

// 텍스트를 호흡 단위로 줄바꿈해 반환 (폭 초과 시 추가로 폭 기준 줄바꿈)
function buildLines(text, maxWidth, fontSize, font) {
  return splitIntoBreathUnits(text || '').flatMap((unit) =>
    font.widthOfTextAtSize(unit, fontSize) > maxWidth ? wrapText(unit, maxWidth, fontSize, font) : [unit]
  )
}

// 이미지 위에 얹는 반투명 캡션 바 + 중앙 정렬 텍스트. offsetX는 다중 패널(표지 펼침면) 배치용.
function drawCaption(page, { text, font, panelWidthPt, marginPt, bottomPt, offsetX = 0 }) {
  const fontSize = 15
  const lineHeight = fontSize * 1.7
  const maxTextWidth = panelWidthPt - marginPt * 2
  const lines = buildLines(text, maxTextWidth, fontSize, font)
  if (lines.length === 0) return

  const padding = 14
  const barHeight = lines.length * lineHeight + padding * 2

  page.drawRectangle({
    x: offsetX,
    y: bottomPt,
    width: panelWidthPt,
    height: barHeight,
    color: rgb(0, 0, 0),
    opacity: 0.45,
  })

  lines.forEach((line, index) => {
    const lineWidth = font.widthOfTextAtSize(line, fontSize)
    const lineY = bottomPt + barHeight - padding - fontSize - index * lineHeight
    page.drawText(line, {
      x: offsetX + (panelWidthPt - lineWidth) / 2,
      y: lineY,
      size: fontSize,
      font,
      color: rgb(1, 1, 1),
    })
  })
}

async function buildCoverPdf(book, size) {
  const pdfDoc = await PDFDocument.create()
  const { regular, bold } = await loadFonts(pdfDoc)

  const widthPt = mm(size.coverWidthMm)
  const heightPt = mm(size.coverHeightMm)
  const spinePt = mm(size.spineWidthMm)
  const panelWidthPt = (widthPt - spinePt) / 2 // 앞표지·뒤표지 폭 (동일)

  const page = pdfDoc.addPage([widthPt, heightPt])

  // 배경 (뒤표지+책등+앞표지 전체)
  page.drawRectangle({ x: 0, y: 0, width: widthPt, height: heightPt, color: rgb(0.97, 0.95, 0.91) })

  // 앞표지 = 오른쪽 패널
  const frontX = widthPt - panelWidthPt
  if (book.cover_image_url) {
    try {
      const image = await embedImageFromUrl(pdfDoc, book.cover_image_url)
      drawImageCover(page, image, { x: frontX, y: 0, width: panelWidthPt, height: heightPt })
    } catch (error) {
      console.error('Failed to embed print cover image:', error)
    }
  }

  // 제목 (앞표지 하단 캡션 바)
  drawCaption(page, {
    text: book.title,
    font: bold,
    panelWidthPt,
    marginPt: mm(SAFE_MARGIN_MM),
    bottomPt: mm(SAFE_MARGIN_MM),
    offsetX: frontX,
  })

  // 책등 — 두께가 충분할 때만 세로 제목 표기
  if (size.spineWidthMm >= 8) {
    const spineFontSize = 11
    const label = book.title.length > 14 ? `${book.title.slice(0, 14)}…` : book.title
    const textWidth = bold.widthOfTextAtSize(label, spineFontSize)
    page.drawText(label, {
      x: panelWidthPt + spinePt / 2 + spineFontSize / 2 - 2,
      y: (heightPt - textWidth) / 2,
      size: spineFontSize,
      font: bold,
      color: rgb(0.25, 0.2, 0.15),
      rotate: degrees(90),
    })
  }

  // 뒤표지 마크
  const markSize = 12
  const mark = 'Made with AI 동화책'
  const markWidth = regular.widthOfTextAtSize(mark, markSize)
  page.drawText(mark, {
    x: (panelWidthPt - markWidth) / 2,
    y: mm(SAFE_MARGIN_MM),
    size: markSize,
    font: regular,
    color: rgb(0.55, 0.5, 0.45),
  })

  return pdfDoc.save()
}

async function buildContentsPdf(book, size) {
  const pdfDoc = await PDFDocument.create()
  const { regular } = await loadFonts(pdfDoc)

  const widthPt = mm(size.innerWidthMm)
  const heightPt = mm(size.innerHeightMm)
  const pages = book.content?.pages || []

  for (const pageData of pages) {
    const page = pdfDoc.addPage([widthPt, heightPt])
    page.drawRectangle({ x: 0, y: 0, width: widthPt, height: heightPt, color: rgb(1, 1, 1) })

    if (pageData.image_url) {
      try {
        const image = await embedImageFromUrl(pdfDoc, pageData.image_url)
        drawImageCover(page, image, { x: 0, y: 0, width: widthPt, height: heightPt })
      } catch (error) {
        console.error('Failed to embed print interior image:', error)
      }
    }

    // 그림 안에 본문이 이미 렌더링된 책(text_in_image)은 캡션 바를 겹쳐 그리지 않는다 —
    // 이 플래그가 없는 기존 책만 하위호환으로 캡션 오버레이를 사용한다.
    if (!book.content?.text_in_image) {
      drawCaption(page, {
        text: pageData.text,
        font: regular,
        panelWidthPt: widthPt,
        marginPt: mm(SAFE_MARGIN_MM),
        bottomPt: mm(SAFE_MARGIN_MM),
      })
    }
  }

  return pdfDoc.save()
}

// 책 데이터로부터 SweetBook 업로드용 표지 PDF + 내지 PDF를 생성한다.
// 반환: { coverPdfBytes, contentsPdfBytes, pageCount, size }
export async function generatePrintPdfs(book) {
  const pages = book.content?.pages || []
  const pageCount = pages.length

  if (!isEligibleForPrint(book)) {
    throw new Error(`실물 인쇄 조건을 만족하지 않습니다 (페이지 수: ${pageCount}, 24~130 짝수 필요)`)
  }

  const size = await getCalculatedSize(SQUAREBOOK_HC, pageCount)

  const coverPdfBytes = await buildCoverPdf(book, size)
  const contentsPdfBytes = await buildContentsPdf(book, size)

  return { coverPdfBytes, contentsPdfBytes, pageCount, size }
}
