import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

// تصدير عنصر HTML كـ PDF
export const exportToPDF = async (
  elementId: string,
  filename: string,
  options?: {
    orientation?: 'portrait' | 'landscape'
    scale?: number
    margin?: number
  }
) => {
  const element = document.getElementById(elementId)
  if (!element) {
    throw new Error('Element not found')
  }

  const { orientation = 'portrait', scale = 2, margin = 6 } = options || {}

  try {
    try {
      await (document as unknown as { fonts?: { ready: Promise<unknown> } }).fonts?.ready
    } catch {
      /* تجاهل */
    }

    const pdf = new jsPDF({
      orientation,
      unit: 'mm',
      format: 'a4',
    })

    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const usableWidth = pageWidth - margin * 2
    const usableHeight = pageHeight - margin * 2

    const pages = element.querySelectorAll<HTMLElement>('.exam-page')

    if (pages.length > 0) {
      // تصدير الصفحات المحددة (صفحة 1 وصفحة 2) بدون أي تجاوز أو صفحة ثالثة
      for (let i = 0; i < pages.length; i++) {
        if (i > 0) {
          pdf.addPage()
        }
        const pageEl = pages[i]
        const canvas = await html2canvas(pageEl, {
          scale,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
          windowWidth: Math.max(pageEl.scrollWidth, 794),
          onclone: (doc) => {
            doc.documentElement.setAttribute('dir', 'rtl')
            doc.documentElement.setAttribute('lang', 'ar')
            const cloned = doc.getElementById(elementId) as HTMLElement | null
            if (cloned) {
              cloned.style.fontFamily = "'Cairo', 'Tajawal', Tahoma, Arial, sans-serif"
              cloned.style.direction = 'rtl'
              cloned.style.textAlign = 'right'
            }
          },
        } as Parameters<typeof html2canvas>[1])

        const imgData = canvas.toDataURL('image/png')
        const imgHeightMm = (canvas.height * usableWidth) / canvas.width
        const renderHeight = Math.min(imgHeightMm, usableHeight)
        pdf.addImage(imgData, 'PNG', margin, margin, usableWidth, renderHeight)
      }
    } else {
      const canvas = await html2canvas(element, {
        scale,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        windowWidth: Math.max(element.scrollWidth, 794),
        onclone: (doc) => {
          doc.documentElement.setAttribute('dir', 'rtl')
          doc.documentElement.setAttribute('lang', 'ar')
          const cloned = doc.getElementById(elementId) as HTMLElement | null
          if (cloned) {
            cloned.style.fontFamily = "'Cairo', 'Tajawal', Tahoma, Arial, sans-serif"
            cloned.style.direction = 'rtl'
            cloned.style.textAlign = 'right'
          }
        },
      } as Parameters<typeof html2canvas>[1])

      const imgData = canvas.toDataURL('image/png')
      const imgHeightMm = (canvas.height * usableWidth) / canvas.width

      if (imgHeightMm <= usableHeight) {
        pdf.addImage(imgData, 'PNG', margin, margin, usableWidth, imgHeightMm)
      } else {
        let heightLeft = imgHeightMm
        let position = margin
        pdf.addImage(imgData, 'PNG', margin, position, usableWidth, imgHeightMm)
        heightLeft -= usableHeight
        while (heightLeft > 0) {
          position = margin - (imgHeightMm - heightLeft)
          pdf.addPage()
          pdf.addImage(imgData, 'PNG', margin, position, usableWidth, imgHeightMm)
          heightLeft -= usableHeight
        }
      }
    }

    pdf.save(`${filename}.pdf`)
    return true
  } catch (error) {
    console.error('Error exporting PDF:', error)
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
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  })

  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 15

  // العنوان
  pdf.setFontSize(18)
  pdf.text(title, pageWidth / 2, margin + 5, { align: 'center' })

  // التاريخ
  pdf.setFontSize(10)
  pdf.text(
    `التاريخ: ${new Date().toLocaleDateString('ar-EG')}`,
    pageWidth - margin,
    margin + 12,
    { align: 'right' }
  )

  // رؤوس الجدول
  const startY = margin + 20
  const colWidth = (pageWidth - margin * 2) / headers.length
  
  pdf.setFillColor(99, 102, 241) // indigo-500
  pdf.rect(margin, startY, pageWidth - margin * 2, 10, 'F')
  
  pdf.setTextColor(255, 255, 255)
  pdf.setFontSize(11)
  headers.forEach((header, index) => {
    pdf.text(
      header,
      margin + colWidth * (headers.length - index - 0.5),
      startY + 7,
      { align: 'center' }
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
      pdf.rect(margin, currentY - 3, pageWidth - margin * 2, rowHeight, 'F')
    }

    row.forEach((cell, cellIndex) => {
      pdf.text(
        cell,
        margin + colWidth * (headers.length - cellIndex - 0.5),
        currentY + 2,
        { align: 'center' }
      )
    })

    currentY += rowHeight
  })

  // Footer
  pdf.setFontSize(8)
  pdf.setTextColor(156, 163, 175)
  pdf.text(
    'نظام إدارة الدروس الخصوصية',
    pageWidth / 2,
    pageHeight - 5,
    { align: 'center' }
  )

  pdf.save(`${filename}.pdf`)
}

/** طباعة A4 من الصفحة الحالية مع الإبقاء على خطوط العربية وتنسيقات Tailwind */
export const printA4 = () => {
  const cleanup = () => {
    document.body.classList.remove('printing-exam')
    window.removeEventListener('afterprint', cleanup)
  }
  document.body.classList.add('printing-exam')
  window.addEventListener('afterprint', cleanup)
  window.print()
  window.setTimeout(cleanup, 1500)
}

// طباعة عنصر مباشرة
export const printElement = (elementId: string) => {
  const element = document.getElementById(elementId)
  if (!element) {
    throw new Error('Element not found')
  }

  const printWindow = window.open('', '', 'width=800,height=600')
  if (!printWindow) return

  printWindow.document.write(`
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <title>طباعة</title>
      <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet">
      <style>
        * {
          font-family: 'Cairo', sans-serif;
          box-sizing: border-box;
        }
        body {
          margin: 0;
          padding: 20px;
          direction: rtl;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin: 20px 0;
        }
        th, td {
          border: 1px solid #e5e7eb;
          padding: 8px 12px;
          text-align: right;
        }
        th {
          background: #6366f1;
          color: white;
        }
        .header {
          text-align: center;
          margin-bottom: 30px;
        }
        .header h1 {
          color: #1f2937;
          margin: 0;
        }
        .footer {
          text-align: center;
          margin-top: 30px;
          color: #6b7280;
          font-size: 12px;
        }
        @media print {
          body { padding: 0; }
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      ${element.innerHTML}
    </body>
    </html>
  `)

  printWindow.document.close()
  setTimeout(() => {
    printWindow.print()
    printWindow.close()
  }, 500)
}
