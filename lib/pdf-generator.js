import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'

export async function generateBookPDF(book) {
  const pdfDoc = await PDFDocument.create()

  // Embed fonts
  const timesRoman = await pdfDoc.embedFont(StandardFonts.TimesRomanBold)
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica)

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

    // 이미지 영역 (상단)
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

        const maxWidth = pageWidth - 80
        const maxHeight = 300
        const scale = Math.min(maxWidth / image.width, maxHeight / image.height)
        const imageDims = image.scale(scale)

        const imageX = (pageWidth - imageDims.width) / 2
        const imageY = pageHeight - imageDims.height - 100

        page.drawImage(image, {
          x: imageX,
          y: imageY,
          width: imageDims.width,
          height: imageDims.height,
        })
      } catch (error) {
        console.error('Failed to embed page image:', error)
        // 이미지 실패 시 플레이스홀더
        page.drawRectangle({
          x: 40,
          y: pageHeight - 380,
          width: pageWidth - 80,
          height: 280,
          borderColor: rgb(0.9, 0.9, 0.9),
          borderWidth: 1,
        })
        page.drawText('[이미지]', {
          x: (pageWidth - 60) / 2,
          y: pageHeight - 240,
          size: 16,
          font: helvetica,
          color: rgb(0.8, 0.8, 0.8),
        })
      }
    }

    // 텍스트 영역 (하단)
    const textY = 120
    const maxWidth = pageWidth - 80
    const fontSize = 14
    const lineHeight = fontSize * 1.8

    // 텍스트를 줄 단위로 분리
    const lines = wrapText(pageData.text || '', maxWidth - 40, fontSize, helvetica)

    lines.forEach((line, index) => {
      const lineY = textY + (lines.length - 1 - index) * lineHeight
      page.drawText(line, {
        x: 50,
        y: lineY,
        size: fontSize,
        font: helvetica,
        color: rgb(0.2, 0.2, 0.25),
        maxWidth: maxWidth,
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
