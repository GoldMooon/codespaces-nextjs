import { PDFDocument, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import fs from 'fs'
import path from 'path'

export async function generateBookPDF(book) {
  const pdfDoc = await PDFDocument.create()

  // pdf-lib의 StandardFonts(Helvetica 등)는 WinAnsi 인코딩만 지원해 한글을 그리면
  // "WinAnsi cannot encode" 에러로 PDF 생성이 통째로 실패한다.
  // 한글을 지원하는 Pretendard 폰트를 fontkit으로 직접 임베드한다.
  // 주의: { subset: true }로 임베드하면 pdf-lib+fontkit의 한글 서브셋 처리 버그로
  // 텍스트 추출(복사)은 정상이지만 실제 화면에 그려지는 글리프가 대부분 사라지는
  // 현상이 있었다(육안 확인으로 발견). subset 없이 폰트 전체를 임베드해 회피한다.
  pdfDoc.registerFontkit(fontkit)
  const regularFontBytes = fs.readFileSync(path.join(process.cwd(), 'public/fonts/Pretendard-Regular.ttf'))
  const boldFontBytes = fs.readFileSync(path.join(process.cwd(), 'public/fonts/Pretendard-Bold.ttf'))
  const timesRoman = await pdfDoc.embedFont(boldFontBytes)
  const helvetica = await pdfDoc.embedFont(regularFontBytes)

  // Page dimensions (A4)
  const pageWidth = 595.28
  const pageHeight = 841.89

  // === 표지 페이지 ===
  const coverPage = pdfDoc.addPage([pageWidth, pageHeight])

  // 표지 배경 (밝은 색상)
  coverPage.drawRectangle({
    x: 0,
    y: 0,
    width: pageWidth,
    height: pageHeight,
    color: rgb(0.98, 0.97, 0.95),
  })

  // 표지 이미지 (있는 경우)
  if (book.cover_image_url) {
    try {
      const imageUrl = book.cover_image_url
      const response = await fetch(imageUrl)
      const imageBytes = await response.arrayBuffer()

      let image
      if (imageUrl.includes('png')) {
        image = await pdfDoc.embedPng(imageBytes)
      } else {
        image = await pdfDoc.embedJpg(imageBytes)
      }

      const imageDims = image.scale(0.5)
      const imageX = (pageWidth - imageDims.width) / 2
      const imageY = pageHeight - imageDims.height - 150

      coverPage.drawImage(image, {
        x: imageX,
        y: imageY,
        width: imageDims.width,
        height: imageDims.height,
      })
    } catch (error) {
      console.error('Failed to embed cover image:', error)
    }
  }

  // 제목
  const titleSize = 36
  const titleWidth = timesRoman.widthOfTextAtSize(book.title, titleSize)
  coverPage.drawText(book.title, {
    x: (pageWidth - titleWidth) / 2,
    y: pageHeight - 120,
    size: titleSize,
    font: timesRoman,
    color: rgb(0.15, 0.15, 0.25),
  })

  // 카테고리
  if (book.category) {
    const categorySize = 16
    const categoryWidth = helvetica.widthOfTextAtSize(book.category, categorySize)
    coverPage.drawText(book.category, {
      x: (pageWidth - categoryWidth) / 2,
      y: pageHeight - 80,
      size: categorySize,
      font: helvetica,
      color: rgb(0.5, 0.5, 0.6),
    })
  }

  // AI Fairy Tale 마크
  const markSize = 14
  const markWidth = helvetica.widthOfTextAtSize('Made with AI Fairy Tale', markSize)
  coverPage.drawText('Made with AI Fairy Tale', {
    x: (pageWidth - markWidth) / 2,
    y: 50,
    size: markSize,
    font: helvetica,
    color: rgb(0.6, 0.6, 0.7),
  })

  // === 본문 페이지 ===
  const pages = book.content?.pages || []

  for (const pageData of pages) {
    const page = pdfDoc.addPage([pageWidth, pageHeight])

    // 페이지 배경
    page.drawRectangle({
      x: 0,
      y: 0,
      width: pageWidth,
      height: pageHeight,
      color: rgb(1, 1, 1),
    })

    // 이미지 영역 (상단, 가운데 정렬) — 페이지 폭/높이를 최대한 활용해 크게 표시하고,
    // 실제 이미지 하단 위치를 기억해뒀다가 텍스트를 그 바로 아래 고정 간격으로 배치한다
    // (이전엔 이미지 크기와 무관하게 텍스트를 페이지 하단 고정 위치에 그려서 그림이 작을
    // 때 둘 사이에 큰 빈 공간이 생기고 서로 따로 노는 것처럼 보였다).
    const marginX = 50
    const imageTopY = pageHeight - 50
    let imageBottomY = null

    if (pageData.image_url) {
      try {
        const response = await fetch(pageData.image_url)
        const imageBytes = await response.arrayBuffer()

        let image
        if (pageData.image_url.includes('png')) {
          image = await pdfDoc.embedPng(imageBytes)
        } else {
          image = await pdfDoc.embedJpg(imageBytes)
        }

        const maxWidth = pageWidth - marginX * 2
        const maxHeight = 480
        const scale = Math.min(maxWidth / image.width, maxHeight / image.height)
        const imageDims = image.scale(scale)

        const imageX = (pageWidth - imageDims.width) / 2
        const imageY = imageTopY - imageDims.height

        page.drawImage(image, {
          x: imageX,
          y: imageY,
          width: imageDims.width,
          height: imageDims.height,
        })
        imageBottomY = imageY
      } catch (error) {
        console.error('Failed to embed page image:', error)
        // 이미지 실패 시 플레이스홀더
        const placeholderHeight = 380
        page.drawRectangle({
          x: marginX,
          y: imageTopY - placeholderHeight,
          width: pageWidth - marginX * 2,
          height: placeholderHeight,
          borderColor: rgb(0.9, 0.9, 0.9),
          borderWidth: 1,
        })
        page.drawText('[이미지]', {
          x: (pageWidth - 60) / 2,
          y: imageTopY - placeholderHeight / 2,
          size: 16,
          font: helvetica,
          color: rgb(0.8, 0.8, 0.8),
        })
        imageBottomY = imageTopY - placeholderHeight
      }
    }

    // 텍스트 영역 — 이미지 바로 아래(없으면 페이지 상단 근처)부터 가운데 정렬로 배치
    const textGap = 40
    const textTopY = imageBottomY !== null ? imageBottomY - textGap : pageHeight - 100
    const maxTextWidth = pageWidth - marginX * 2 - 40
    const fontSize = 14
    const lineHeight = fontSize * 1.8

    // 텍스트를 호흡 단위(쉼표·마침표·느낌표·물음표)로 줄바꿈 — 유치원 선생님이
    // 아이에게 읽어주듯 자연스럽게 끊어 읽을 수 있도록. 한 구절이 페이지 폭보다
    // 길면 폭 기준 줄바꿈으로 한 번 더 나눈다(안전장치).
    const lines = splitIntoBreathUnits(pageData.text || '').flatMap((unit) =>
      helvetica.widthOfTextAtSize(unit, fontSize) > maxTextWidth
        ? wrapText(unit, maxTextWidth, fontSize, helvetica)
        : [unit]
    )

    lines.forEach((line, index) => {
      const lineY = textTopY - index * lineHeight
      const lineWidth = helvetica.widthOfTextAtSize(line, fontSize)
      page.drawText(line, {
        x: (pageWidth - lineWidth) / 2,
        y: lineY,
        size: fontSize,
        font: helvetica,
        color: rgb(0.2, 0.2, 0.25),
      })
    })

    // 페이지 번호
    const pageNum = pageData.page
    const pageNumWidth = helvetica.widthOfTextAtSize(`${pageNum}`, 10)
    page.drawText(`${pageNum}`, {
      x: (pageWidth - pageNumWidth) / 2,
      y: 30,
      size: 10,
      font: helvetica,
      color: rgb(0.6, 0.6, 0.6),
    })
  }

  return await pdfDoc.save()
}

// 텍스트를 쉼표·마침표·느낌표·물음표 뒤에서 끊어 "호흡 단위" 구절 배열로 만든다.
// 예: "비가 톡톡 내리자, 레오는 밖으로 폴짝 나갔어요." → ["비가 톡톡 내리자,", "레오는 밖으로 폴짝 나갔어요."]
function splitIntoBreathUnits(text) {
  const matches = text.match(/[^,.!?]*[,.!?]+|[^,.!?]+$/g) || []
  return matches.map((s) => s.trim()).filter(Boolean)
}

// 긴 텍스트를 줄 단위로 래핑
function wrapText(text, maxWidth, fontSize, font) {
  const words = text.split(' ')
  const lines = []
  let currentLine = ''

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word
    const testWidth = font.widthOfTextAtSize(testLine, fontSize)

    if (testWidth > maxWidth && currentLine) {
      lines.push(currentLine)
      currentLine = word
    } else {
      currentLine = testLine
    }
  }

  if (currentLine) {
    lines.push(currentLine)
  }

  return lines
}

// PDF 버퍼를 Base64로 변환
export function pdfToBase64(pdfBytes) {
  const buffer = Buffer.from(pdfBytes)
  return buffer.toString('base64')
}
