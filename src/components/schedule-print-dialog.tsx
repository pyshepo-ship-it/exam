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
import { downloadSchedulePDF, printSchedule, buildSchedulePagesHtml, SchedulePrintOptions } from "@/lib/schedule-print"

interface SchedulePrintDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  options: SchedulePrintOptions | null
  title: string
  description: string
}

/**
 * معاينة صفحات الجدول (A4) مع التصدير إلى PDF والطباعة المباشرة.
 * النسخة التفصيلية (المدرس) والنسخة المبسطة (الطلاب) تستخدمان نفس الحوار.
 *
 * ملاحظة أمنية: HTML المعاينة يُولَّد محلياً بالكامل من بيانات المعلم
 * (داخل schedule-print.ts) عبر DOM API بعد تنقيته بـ esc() — لا يدخل
 * إليه أي محتوى من مصادر خارجية.
 */
export function SchedulePrintDialog({ open, onOpenChange, options, title, description }: SchedulePrintDialogProps) {
  const [exporting, setExporting] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)

  // بناء صفحات المعاينة عند الفتح (memo — بدون تأثيرات أو setState)
  const { html, pageCount } = useMemo(() => {
    if (!open || !options) return { html: "", pageCount: 0 }
    try {
      return buildSchedulePagesHtml(options)
    } catch (e) {
      console.error(e)
      return { html: "", pageCount: 0 }
    }
  }, [open, options])

  // حقن HTML المعاينة عبر DOM مباشرة (المحتوى مولَّد محلياً ومُنقَّى)
  useEffect(() => {
    if (previewRef.current) {
      previewRef.current.innerHTML = html
    }
  }, [html])

  const handleDownload = async () => {
    if (!options) return
    setExporting(true)
    try {
      const name = await downloadSchedulePDF(options)
      toast.success(`تم تصدير الملف: ${name}`)
    } catch (e) {
      console.error(e)
      toast.error("تعذر تصدير ملف PDF — حاول مرة أخرى")
    }
    setExporting(false)
  }

  const handlePrint = () => {
    if (!options) return
    try {
      printSchedule(options)
    } catch (e) {
      console.error(e)
      toast.error("تعذر فتح نافذة الطباعة")
    }
  }

  const isTeacher = options?.mode === "teacher"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Printer className={`w-6 h-6 ${isTeacher ? "text-indigo-600" : "text-emerald-600"}`} />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto bg-gray-100 dark:bg-gray-950 rounded-xl p-4 border border-gray-200 dark:border-gray-800">
          {pageCount === 0 ? (
            <div className="text-center py-16">
              <AlertTriangle className="w-12 h-12 mx-auto mb-3 text-amber-400" />
              <p className="text-gray-500 dark:text-gray-400 font-semibold">
                لا توجد مجموعات لعرضها — أضف صفوفاً ومجموعات أولاً
              </p>
            </div>
          ) : (
            <>
              {/* معاينة مصغرة للصفحات (الطباعة الفعلية بحجم A4 كامل) */}
              <style>{`
                .schedule-preview { zoom: 0.55; }
                .schedule-preview > div + div { margin-top: 18px; }
              `}</style>
              <div className="flex justify-center">
                <div ref={previewRef} className="schedule-preview" />
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
            className={`text-white ${
              isTeacher
                ? "bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
                : "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700"
            }`}
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
            <span>{exporting ? "جاري التصدير..." : "تحميل PDF"}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
