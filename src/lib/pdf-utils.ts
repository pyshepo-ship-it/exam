import jsPDF from "jspdf"
import { toPng } from "html-to-image"

const getImageDimensions = (dataUrl: string): Promise<{ width: number; height: number }> => {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height })
    img.onerror = reject
    img.src = dataUrl
  })
}

// تصدير عنصر HTML كـ PDF — يدعم ألوان Tailwind v4 (oklab / oklch) والخطوط العربية بدون أخطاء
export const exportToPDF = async (
  elementId: string,
  filename: string,
  options?: {
    orientation?: "portrait" | "landscape"
    scale?: number
    margin?: number
  }
) => {
  const element = document.getElementById(elementId)
  if (!element) {
    throw new Error("Element not found")
  }

  const { orientation = "portrait", margin = 6 } = options || {}

  try {
    try {
      await (document as unknown as { fonts?: { ready: Promise<unknown> } }).fonts?.ready
    } catch {
      /* تجاهل */
    }

    const pdf = new jsPDF({
      orientation,
      unit: "mm",
      format: "a4",
    })

    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const usableWidth = pageWidth - margin * 2
    const usableHeight = pageHeight - margin * 2

    const pages = element.querySelectorAll<HTMLElement>(".exam-page")

    if (pages.length > 0) {
      // تصدير الصفحات المحددة (صفحة 1 وصفحة 2) بدون أي تجاوز أو صفحة ثالثة
      for (let i = 0; i < pages.length; i++) {
        if (i > 0) {
          pdf.addPage()
        }
        const pageEl = pages[i]

        const imgData = await toPng(pageEl, {
          quality: 0.98,
          pixelRatio: 2,
          backgroundColor: "#ffffff",
          skipAutoScale: true,
        })

        const dims = await getImageDimensions(imgData)
        const imgHeightMm = (dims.height * usableWidth) / dims.width
        const renderHeight = Math.min(imgHeightMm, usableHeight)
        pdf.addImage(imgData, "PNG", margin, margin, usableWidth, renderHeight)
      }
    } else {
      const imgData = await toPng(element, {
        quality: 0.98,
        pixelRatio: 2,
        backgroundColor: "#ffffff",
        skipAutoScale: true,
      })

      const dims = await getImageDimensions(imgData)
      const imgHeightMm = (dims.height * usableWidth) / dims.width

      if (imgHeightMm <= usableHeight) {
        pdf.addImage(imgData, "PNG", margin, margin, usableWidth, imgHeightMm)
      } else {
        let heightLeft = imgHeightMm
        let position = margin
        pdf.addImage(imgData, "PNG", margin, position, usableWidth, imgHeightMm)
        heightLeft -= usableHeight
        while (heightLeft > 0) {
          position = margin - (imgHeightMm - heightLeft)
          pdf.addPage()
          pdf.addImage(imgData, "PNG", margin, position, usableWidth, imgHeightMm)
          heightLeft -= usableHeight
        }
      }
    }

    pdf.save(`${filename}.pdf`)
    return true
  } catch (error) {
    console.error("Error exporting PDF:", error)
    throw error
  }
}

// تصدير بيانات كجدول PDF
export const exportTableToPDF = async (
  title: string,
  headers: string[],
  rows: string[][],
  filename: string
) => {
  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  })

  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 15

  // العنوان
  pdf.setFontSize(18)
  pdf.text(title, pageWidth / 2, margin + 5, { align: "center" })

  // التاريخ
  pdf.setFontSize(10)
  pdf.text(
    `التاريخ: ${new Date().toLocaleDateString("ar-EG")}`,
    pageWidth - margin,
    margin + 12,
    { align: "right" }
  )

  // رؤوس الجدول
  const startY = margin + 20
  const colWidth = (pageWidth - margin * 2) / headers.length
  
  pdf.setFillColor(99, 102, 241) // indigo-500
  pdf.rect(margin, startY, pageWidth - margin * 2, 10, "F")
  
  pdf.setTextColor(255, 255, 255)
  pdf.setFontSize(11)
  headers.forEach((header, index) => {
    pdf.text(
      header,
      margin + colWidth * (headers.length - index - 0.5),
      startY + 7,
      { align: "center" }
    )
  })

  // الصفوف
  pdf.setTextColor(0, 0, 0)
  pdf.setFontSize(10)
  
  let currentY = startY + 15
  const rowHeight = 8

  rows.forEach((row, rowIndex) => {
    if (currentY + rowHeight > pageHeight - margin) {
      pdf.addPage()
      currentY = margin
    }

    // تلوين الصفوف بالتناوب
    if (rowIndex % 2 === 0) {
      pdf.setFillColor(243, 244, 246) // gray-100
      pdf.rect(margin, currentY - 3, pageWidth - margin * 2, rowHeight, "F")
    }

    row.forEach((cell, cellIndex) => {
      pdf.text(
        cell,
        margin + colWidth * (headers.length - cellIndex - 0.5),
        currentY + 2,
        { align: "center" }
      )
    })

    currentY += rowHeight
  })

  // Footer
  pdf.setFontSize(8)
  pdf.setTextColor(156, 163, 175)
  pdf.text(
    "أ/ ضحى العربي",
    pageWidth / 2,
    pageHeight - 5,
    { align: "center" }
  )

  pdf.save(`${filename}.pdf`)
}

// طباعة عنصر مباشرة بشكل نظيف ومستقل بدون تأثر بحجم النوافذ المنبثقة
export const printElement = (elementId: string) => {
  const element = document.getElementById(elementId)
  if (!element) {
    throw new Error("Element not found")
  }

  // جمع كافة التنسيقات والخطوط من الصفحة الحالية
  let stylesHtml = ""
  document.querySelectorAll('style, link[rel="stylesheet"]').forEach(el => {
    stylesHtml += el.outerHTML
  })

  // إنشاء iframe مخفي للطباعة النظيفة
  let printIframe = document.getElementById("exam-print-iframe") as HTMLIFrameElement | null
  if (printIframe) {
    printIframe.remove()
  }

  printIframe = document.createElement("iframe")
  printIframe.id = "exam-print-iframe"
  printIframe.style.position = "fixed"
  printIframe.style.right = "0"
  printIframe.style.bottom = "0"
  printIframe.style.width = "0"
  printIframe.style.height = "0"
  printIframe.style.border = "0"
  printIframe.style.visibility = "hidden"
  document.body.appendChild(printIframe)

  const doc = printIframe.contentWindow?.document
  if (!doc) {
    window.print()
    return
  }

  doc.open()
  doc.write(`
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <title>طباعة ورقة الاختبار</title>
      <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet">
      ${stylesHtml}
      <style>
        @page {
          size: A4 portrait;
          margin: 6mm 6mm 6mm 6mm;
        }
        * {
          box-sizing: border-box !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          background: #ffffff !important;
          font-family: 'Cairo', 'Segoe UI', Tahoma, Arial, sans-serif !important;
          direction: rtl !important;
          text-align: right !important;
          width: 100% !important;
        }
        .exam-page {
          width: 100% !important;
          max-width: 190mm !important;
          margin: 0 auto !important;
          min-height: 275mm !important;
          box-sizing: border-box !important;
          page-break-inside: avoid !important;
          break-inside: avoid !important;
          display: flex !important;
          flex-direction: column !important;
          justify-content: space-between !important;
        }
        .exam-page:not(:last-child),
        .exam-page-1:not(:last-child),
        .exam-page-middle {
          page-break-after: always !important;
          break-after: page !important;
        }
        .exam-page:last-child,
        .exam-page-last,
        .exam-page-single {
          page-break-after: avoid !important;
          break-after: avoid !important;
        }
        .exam-q {
          page-break-inside: avoid !important;
          break-inside: avoid !important;
        }
      </style>
    </head>
    <body>
      ${element.outerHTML}
    </body>
    </html>
  `)
  doc.close()

  setTimeout(() => {
    try {
      printIframe?.contentWindow?.focus()
      printIframe?.contentWindow?.print()
    } catch {
      window.print()
    }
  }, 350)
}

/** طباعة A4 من الصفحة الحالية */
export const printA4 = () => {
  printElement("exam-preview-content")
}
