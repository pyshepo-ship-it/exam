"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { Printer, FileDown, Loader2, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import toast from "react-hot-toast"
import { downloadHtmlAsPDF, printHtml } from "@/lib/schedule-print"

interface HtmlPrintDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** يبني صفحات A4 (يُستدعى عند الفتح فقط) */
  build: (() => { html: string; pageCount: number }) | null
  /** اسم ملف PDF بدون امتداد */
  filename: string
  title: string
  description?: string
  accentClass?: string
}

/**
 * حوار معاينة وطباعة عام لأي صفحات A4 مولدة (تقارير الطلاب، الجدول...).
 * HTML المعاينة يُولَّد محلياً بالكامل ويُحقن عبر DOM بعد تنقيته في المصدر.
 */
export function HtmlPrintDialog({ open, onOpenChange, build, filename, title, description, accentClass }: HtmlPrintDialogProps) {
  const [exporting, setExporting] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)
  const [wasOpen, setWasOpen] = useState(false)
  const [html, setHtml] = useState("")
  const [pageCount, setPageCount] = useState(0)

  // بناء المعاينة عند كل فتح (اشتقاق أثناء العرض — بدون تأثيرات)
  if (open && !wasOpen) {
    setWasOpen(true)
    try {
      const built = build?.()
      setHtml(built?.html || "")
      setPageCount(built?.pageCount || 0)
    } catch (e) {
      console.error(e)
      setHtml("")
      setPageCount(0)
    }
  } else if (!open && wasOpen) {
    setWasOpen(false)
  }

  // حقن HTML المعاينة عبر DOM مباشرة (المحتوى مولَّد محلياً ومُنقَّى)
  useEffect(() => {
    if (previewRef.current) {
      previewRef.current.innerHTML = html
    }
  }, [html])

  const handleDownload = async () => {
    if (!html) return
    setExporting(true)
    try {
      await downloadHtmlAsPDF(`report-print-mount-${Date.now()}`, html, filename)
      toast.success(`تم تصدير الملف: ${filename}.pdf`)
    } catch (e) {
      console.error(e)
      toast.error("تعذر تصدير ملف PDF — حاول مرة أخرى")
    }
    setExporting(false)
  }

  const handlePrint = () => {
    if (!html) return
    try {
      printHtml(html, `report-print-mount-print-${Date.now()}`)
    } catch (e) {
      console.error(e)
      toast.error("تعذر فتح نافذة الطباعة")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Printer className={`w-6 h-6 ${accentClass || "text-indigo-600"}`} />
            {title}
          </DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto bg-gray-100 dark:bg-gray-950 rounded-xl p-4 border border-gray-200 dark:border-gray-800">
          {pageCount === 0 ? (
            <div className="text-center py-16">
              <AlertTriangle className="w-12 h-12 mx-auto mb-3 text-amber-400" />
              <p className="text-gray-500 dark:text-gray-400 font-semibold">لا توجد بيانات لعرضها في التقرير</p>
            </div>
          ) : (
            <>
              <style>{`
                .report-preview { zoom: 0.55; }
                .report-preview > div + div { margin-top: 18px; }
              `}</style>
              <div className="flex justify-center">
                <div ref={previewRef} className="report-preview" />
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إغلاق
          </Button>
          <Button
            onClick={handlePrint}
            disabled={pageCount === 0}
            className="bg-gradient-to-r from-gray-700 to-gray-900 hover:from-gray-800 hover:to-black text-white"
          >
            <Printer className="w-4 h-4" />
            <span>طباعة مباشرة</span>
          </Button>
          <Button
            onClick={handleDownload}
            disabled={pageCount === 0 || exporting}
            className={`text-white ${accentClass === "text-emerald-600" ? "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700" : "bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"}`}
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
            <span>{exporting ? "جاري التصدير..." : "تحميل PDF"}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
