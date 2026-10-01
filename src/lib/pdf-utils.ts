import jsPDF from "jspdf"
import { toPng } from "html-to-image"
import { APP_FONTS_URL } from "./exam-templates"

const getImageDimensions = (dataUrl: string): Promise<{ width: number; height: number }> => {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height })
    img.onerror = reject
    img.src = dataUrl
  })
}

// ورقة الامتحان معروضة داخل نافذة متجاوبة؛ لذلك يكون عرضها على iPhone نحو
// 320px فقط. رسم ذلك العرض ثم تمديده إلى A4 يجعل النص ضبابياً، كما أن التفاف
// السطور يزيد الارتفاع فتُضغط الصورة رأسياً. نرسم نسخة خارج الشاشة بعرض الورقة
// الحقيقي دائماً، بصرف النظر عن عرض الجهاز الذي بدأ منه التنزيل.
const CSS_PX_PER_MM = 96 / 25.4
const EXAM_PAPER_EXPORT_WIDTH = Math.round(190 * CSS_PX_PER_MM) // 190mm تقريباً عند 96dpi
const EXAM_PAPER_EXPORT_MIN_HEIGHT = Math.round(270 * CSS_PX_PER_MM) // ارتفاع المعاينة القياسي للصفحة

const nextPaint = () => new Promise<void>(resolve => {
  requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
})

/** طبّق قيم breakpoint ‏sm المستخدمة في ورقة الامتحان حتى يتطابق iPhone مع اللابتوب. */
const applyDesktopExamStyles = (root: HTMLElement) => {
  const nodes = [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))]
  for (const node of nodes) {
    const classes = node.classList
    if (classes.contains("sm:min-w-[6rem]")) node.style.minWidth = "6rem"
    if (classes.contains("sm:min-w-[8rem]")) node.style.minWidth = "8rem"
    if (classes.contains("sm:min-w-[10rem]")) node.style.minWidth = "10rem"
    if (classes.contains("sm:gap-x-12")) node.style.columnGap = "3rem"
    if (classes.contains("sm:p-3")) node.style.padding = "0.75rem"

    if (classes.contains("sm:text-[14px]")) {
      node.style.fontSize = "14px"
      node.style.lineHeight = "20px"
    }
    if (classes.contains("sm:text-[14.5px]")) node.style.fontSize = "14.5px"
    if (classes.contains("sm:text-[15px]")) node.style.fontSize = "15px"
    if (classes.contains("sm:text-sm")) {
      node.style.fontSize = "0.875rem"
      node.style.lineHeight = "1.25rem"
    }
    if (classes.contains("sm:text-base")) {
      node.style.fontSize = "1rem"
      node.style.lineHeight = "1.5rem"
    }
    if (classes.contains("sm:text-lg")) {
      node.style.fontSize = "1.125rem"
      node.style.lineHeight = "1.75rem"
    }
    if (classes.contains("sm:text-xl")) {
      node.style.fontSize = "1.25rem"
      node.style.lineHeight = "1.75rem"
    }
  }
}

const renderToPng = async (element: HTMLElement, pixelRatio: number): Promise<string> => {
  let target = element
  let wrapper: HTMLDivElement | null = null
  let forcedWidth: number | undefined
  let forcedHeight: number | undefined

  if (element.classList.contains("exam-paper")) {
    wrapper = document.createElement("div")
    wrapper.setAttribute("aria-hidden", "true")
    wrapper.style.cssText = [
      "position:fixed",
      "top:0",
      "left:-30000px",
      `width:${EXAM_PAPER_EXPORT_WIDTH}px`,
      "overflow:hidden",
      "background:#fff",
      "pointer-events:none",
    ].join(";")

    const clone = element.cloneNode(true) as HTMLElement
    clone.style.width = `${EXAM_PAPER_EXPORT_WIDTH}px`
    clone.style.minWidth = `${EXAM_PAPER_EXPORT_WIDTH}px`
    clone.style.maxWidth = `${EXAM_PAPER_EXPORT_WIDTH}px`
    clone.style.minHeight = `${EXAM_PAPER_EXPORT_MIN_HEIGHT}px`
    clone.style.margin = "0"
    clone.style.boxSizing = "border-box"
    clone.style.transform = "none"
    applyDesktopExamStyles(clone)
    wrapper.appendChild(clone)
    document.body.appendChild(wrapper)
    target = clone

    // امنح المتصفح فرصة لإعادة توزيع السطور وفق عرض A4 قبل أخذ الصورة.
    await nextPaint()

    forcedWidth = EXAM_PAPER_EXPORT_WIDTH
    forcedHeight = Math.ceil(Math.max(
      clone.getBoundingClientRect().height,
      clone.offsetHeight,
      clone.scrollHeight,
      EXAM_PAPER_EXPORT_MIN_HEIGHT
    ))
    clone.style.minHeight = `${forcedHeight}px`
    clone.style.height = `${forcedHeight}px`
    wrapper.style.height = `${forcedHeight}px`
    await nextPaint()
  }

  try {
    return await toPng(target, {
      quality: 0.98,
      pixelRatio,
      backgroundColor: "#ffffff",
      skipAutoScale: true,
      ...(forcedWidth ? { width: forcedWidth } : {}),
      ...(forcedHeight ? { height: forcedHeight } : {}),
    })
  } finally {
    wrapper?.remove()
  }
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

  const { orientation = "portrait", margin = 6, scale = 2 } = options || {}
  const pixelRatio = Math.max(1, Math.min(scale, 3))

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
      // تصدير صفحات الامتحان بمقياس واحد ثابت. سابقاً كان كل صفحة تُلائم
      // ارتفاعها منفردة؛ فإذا كانت الصفحة الأولى أطول قليلاً (بسبب الترويسة)
      // صغرت عرضاً عن الصفحة الثانية. نرسم كل الصفحات أولاً ثم نستخدم نفس
      // معامل التصغير للجميع حتى يتطابق عرض الصفحة الأولى والثانية في PDF.
      const renderedPages = [] as { dataUrl: string; dims: { width: number; height: number } }[]
      for (const pageEl of Array.from(pages)) {
        const dataUrl = await renderToPng(pageEl, pixelRatio)
        renderedPages.push({ dataUrl, dims: await getImageDimensions(dataUrl) })
      }

      const referenceWidth = Math.max(...renderedPages.map(page => page.dims.width))
      const maxHeightAtReferenceWidth = Math.max(
        ...renderedPages.map(page => page.dims.height * (referenceWidth / page.dims.width))
      )
      const commonWidth = Math.min(usableWidth, usableHeight * (referenceWidth / maxHeightAtReferenceWidth))
      const x = margin + (usableWidth - commonWidth) / 2

      renderedPages.forEach((page, i) => {
        if (i > 0) {
          pdf.addPage()
        }
        const height = page.dims.height * (commonWidth / page.dims.width)
        pdf.addImage(page.dataUrl, "PNG", x, margin, commonWidth, height)
      })
    } else {
      const imgData = await renderToPng(element, pixelRatio)

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
      <link href="${APP_FONTS_URL}" rel="stylesheet">
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

  const doPrint = () => {
    try {
      printIframe?.contentWindow?.focus()
      printIframe?.contentWindow?.print()
    } catch {
      window.print()
    }
  }

  // ننتظر تحميل خط الورقة الموحّد (Noto Kufi Arabic) فعلياً قبل الطباعة،
  // وإلا خرجت الورقة بخط بديل غير واضح. حد أدنى 350ms وحد أقصى 2.5s
  // حتى لا تتعطّل الطباعة إن تعذّر تحميل الخط (انترنت بطيء/محجوب).
  let printed = false
  const printOnce = () => {
    if (printed) return
    printed = true
    doPrint()
  }
  try {
    // نحسب التخطيط مرة ليبدأ المتصفح جلب الخط فعلاً قبل فحص جاهزيته
    void doc.body?.offsetHeight
  } catch {
    /* تجاهل */
  }
  const minWait = new Promise(resolve => setTimeout(resolve, 350))
  const fontsReady = (doc as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready
  const capped = new Promise(resolve => setTimeout(resolve, 2500))
  const ready = fontsReady && typeof fontsReady.then === "function" ? fontsReady : Promise.resolve()
  void Promise.race([
    Promise.all([minWait, ready.catch(() => undefined)]),
    capped,
  ]).then(printOnce)
}
