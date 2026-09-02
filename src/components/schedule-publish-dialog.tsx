"use client"

import React, { useState } from "react"
import { Share2, Megaphone, Trash2, Globe, ShieldCheck, CalendarDays, Loader2, ExternalLink } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import toast from "react-hot-toast"
import { Grade } from "@/lib/data-storage"
import {
  buildPublicSchedule,
  isSchedulePublished,
  setSchedulePublished,
  hasScheduleAnnouncement,
  publishScheduleAnnouncement,
  removeScheduleAnnouncement,
} from "@/lib/schedule"
import { formatTime12 } from "@/lib/utils"

interface SchedulePublishDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  grades: Grade[]
  /** يُستدعى بعد أي تغيير في النشر لتحديث قوائم الصفحة الحالية */
  onChanged?: () => void
}

/**
 * حوار نشر جدول المجموعات للطلاب:
 *  1) إظهار الجدول في الصفحة الرئيسية (منطقة لوحة الشرف والإعلانات)
 *  2) نشر إعلان بالجدول في صفحة الإعلانات
 * النسخة المنشورة تعرض المواعيد فقط — بدون أسعار أو أسماء طلاب أو أرقام هواتف.
 */
export function SchedulePublishDialog({ open, onOpenChange, grades, onChanged }: SchedulePublishDialogProps) {
  const [homePublished, setHomePublished] = useState(false)
  const [announcementPublished, setAnnouncementPublished] = useState(false)
  const [busy, setBusy] = useState(false)
  const [wasOpen, setWasOpen] = useState(false)

  // تحديث الحالة عند كل فتح (اشتقاق أثناء العرض — بدون تأثيرات)
  if (open && !wasOpen) {
    setWasOpen(true)
    setHomePublished(isSchedulePublished())
    setAnnouncementPublished(hasScheduleAnnouncement())
  } else if (!open && wasOpen) {
    setWasOpen(false)
  }

  const schedule = buildPublicSchedule(grades)

  const toggleHomePublish = () => {
    setBusy(true)
    try {
      const next = !homePublished
      setSchedulePublished(next)
      setHomePublished(next)
      if (next) toast.success("تم نشر الجدول للطلاب — سيظهر في الصفحة الرئيسية (لوحة الشرف والإعلانات)")
      else toast.success("تم إلغاء نشر الجدول من الصفحة الرئيسية")
      onChanged?.()
    } catch {
      toast.error("تعذر حفظ حالة النشر")
    }
    setBusy(false)
  }

  const publishAnnouncement = () => {
    setBusy(true)
    try {
      publishScheduleAnnouncement(grades, true)
      setAnnouncementPublished(true)
      toast.success("تم نشر إعلان الجدول في صفحة الإعلانات — مثبت في الأعلى")
      onChanged?.()
    } catch {
      toast.error("تعذر نشر الإعلان")
    }
    setBusy(false)
  }

  const unpublishAnnouncement = () => {
    if (!confirm("هل تريد حذف إعلان الجدول من صفحة الإعلانات؟")) return
    setBusy(true)
    try {
      removeScheduleAnnouncement()
      setAnnouncementPublished(false)
      toast.success("تم حذف إعلان الجدول")
      onChanged?.()
    } catch {
      toast.error("تعذر حذف الإعلان")
    }
    setBusy(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Share2 className="w-6 h-6 text-indigo-600" />
            نشر جدول المجموعات للطلاب
          </DialogTitle>
          <DialogDescription>
            انشر جدول المواعيد ليتمكن الطلاب من معرفة مواعيد مجموعاتهم — النسخة المنشورة تعرض
            المواعيد فقط، بدون أسعار أو أسماء طلاب أو أرقام هواتف.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* 1) النشر في الصفحة الرئيسية */}
          <div className="rounded-xl border-2 border-indigo-200 dark:border-indigo-800 p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0 shadow-lg">
                  <Globe className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="font-bold text-gray-900 dark:text-white">
                    إظهار الجدول في الصفحة الرئيسية
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                    يظهر قسم «جدول المواعيد الأسبوعي» للطلاب في الصفحة الرئيسية، بين لوحة الشرف
                    والإعلانات، ويُحدَّث تلقائياً عند تعديل أي مجموعة.
                  </p>
                </div>
              </div>
              <Badge
                className={
                  homePublished
                    ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 shrink-0"
                    : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300 shrink-0"
                }
              >
                {homePublished ? "منشور ✓" : "غير منشور"}
              </Badge>
            </div>
            <Button
              onClick={toggleHomePublish}
              disabled={busy || schedule.length === 0}
              variant={homePublished ? "outline" : "default"}
              className={
                homePublished
                  ? "border-red-400 text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                  : "bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white"
              }
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : homePublished ? <Trash2 className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
              <span>{homePublished ? "إلغاء النشر من الصفحة الرئيسية" : "نشر الجدول في الصفحة الرئيسية"}</span>
            </Button>
          </div>

          {/* 2) النشر كإعلان */}
          <div className="rounded-xl border-2 border-amber-200 dark:border-amber-800 p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shrink-0 shadow-lg">
                  <Megaphone className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="font-bold text-gray-900 dark:text-white">
                    نشر إعلان بالجدول في صفحة الإعلانات
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                    يُضاف إعلان مثبّت بعنوان «جدول مواعيد المجموعات» يعرض مواعيد كل صف ومجموعاته.
                    عند أي تعديل على المجموعات أعد النشر ليُحدَّث الإعلان (بدون تكرار).
                  </p>
                </div>
              </div>
              <Badge
                className={
                  announcementPublished
                    ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 shrink-0"
                    : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300 shrink-0"
                }
              >
                {announcementPublished ? "منشور ✓" : "غير منشور"}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={publishAnnouncement}
                disabled={busy || schedule.length === 0}
                className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Megaphone className="w-4 h-4" />}
                <span>{announcementPublished ? "تحديث إعلان الجدول" : "نشر إعلان بالجدول"}</span>
              </Button>
              {announcementPublished && (
                <Button
                  onClick={unpublishAnnouncement}
                  disabled={busy}
                  variant="outline"
                  className="border-red-400 text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>حذف الإعلان</span>
                </Button>
              )}
            </div>
          </div>

          {/* معاينة ما سيراه الطلاب */}
          <div className="rounded-xl border border-dashed border-green-300 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20 p-4">
            <p className="font-bold text-green-800 dark:text-green-300 flex items-center gap-2 text-sm">
              <ShieldCheck className="w-4 h-4" />
              معاينة ما سيراه الطلاب (نسخة آمنة — مواعيد فقط)
            </p>
            {schedule.length === 0 ? (
              <p className="text-sm text-gray-500 mt-3">لا توجد مجموعات بعد — أضف صفوفاً ومجموعات أولاً.</p>
            ) : (
              <div className="mt-3 space-y-2 max-h-52 overflow-y-auto">
                {schedule.map(g => (
                  <div key={g.gradeId} className="bg-white dark:bg-gray-900 rounded-lg border border-green-200 dark:border-green-900 p-3">
                    <p className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-1.5">
                      <CalendarDays className="w-4 h-4 text-green-600" />
                      {g.gradeName}
                    </p>
                    <ul className="mt-1.5 space-y-1">
                      {g.groups.map(gr => (
                        <li key={gr.id} className="text-xs text-gray-600 dark:text-gray-300">
                          • <span className="font-semibold">{gr.name}</span>: {gr.days.join(" و")}
                          {gr.startTime && gr.endTime && (
                            <> — {formatTime12(gr.startTime)} إلى {formatTime12(gr.endTime)}</>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-3 leading-relaxed">
              🔒 لا تُنشر الأسعار الشهرية ولا أسماء الطلاب ولا أرقام الهواتف ولا الأرصدة المالية في
              أي نسخة موجهة للطلاب — سواء في الصفحة الرئيسية أو الإعلان أو ملف PDF المخصص للطلاب.
            </p>
          </div>
        </div>

        <DialogFooter className="items-center justify-between gap-2 sm:justify-between">
          <Link href="/" target="_blank" rel="noopener noreferrer" className="hidden sm:block">
            <Button variant="ghost" size="sm" className="text-indigo-600 hover:text-indigo-700">
              <ExternalLink className="w-4 h-4" />
              <span>عرض الصفحة الرئيسية</span>
            </Button>
          </Link>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إغلاق
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
