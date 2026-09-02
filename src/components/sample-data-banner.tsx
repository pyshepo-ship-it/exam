"use client"

import React, { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { AlertTriangle, Trash2, X, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import toast from "react-hot-toast"
import {
  getSampleGrades,
  removeSampleGrades,
  restoreSampleGrades,
  hasSampleBackup,
  type Grade,
} from "@/lib/data-storage"

/**
 * تنبيه يظهر فقط عند وجود بيانات تجريبية حقيقية من النسخ القديمة
 * (معرّف ثابت + اسم تجريبي + لا توجد أي بيانات مرتبطة).
 *
 * لا يحذف أي صف أنشأه المستخدم مهما كان اسمه، ويطلب تأكيداً صريحاً،
 * ويتيح التراجع بعد الإزالة.
 */
export default function SampleDataBanner({ onRemoved }: { onRemoved?: () => void }) {
  const [samples, setSamples] = useState<Grade[]>([])
  const [hidden, setHidden] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [canUndo, setCanUndo] = useState(false)

  useEffect(() => {
    if (localStorage.getItem("sampleBannerDismissed") === "1") {
      setSamples([])
      return
    }
    setSamples(getSampleGrades())
  }, [])

  // شريط التراجع بعد الإزالة
  if (canUndo) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6 rounded-2xl border border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-950/40 p-4 flex items-center gap-3"
      >
        <p className="flex-1 text-sm text-green-900 dark:text-green-100">
          تمت إزالة البيانات التجريبية. إذا كان هذا عن طريق الخطأ يمكنك التراجع فوراً.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const n = restoreSampleGrades()
            if (n > 0) {
              toast.success(`تمت استعادة ${n} صف`)
              onRemoved?.()
            } else {
              toast.error("لا توجد نسخة للاستعادة")
            }
            setCanUndo(false)
            setHidden(true)
          }}
          className="border-green-600 text-green-700 dark:text-green-300"
        >
          <Undo2 className="w-4 h-4" />
          <span>تراجع واستعادة</span>
        </Button>
        <Button variant="ghost" size="icon" onClick={() => setCanUndo(false)}>
          <X className="w-5 h-5" />
        </Button>
      </motion.div>
    )
  }

  if (hidden || samples.length === 0) return null

  const handleRemove = () => {
    // تأكيد إجباري قبل أي حذف
    if (!confirming) {
      setConfirming(true)
      return
    }

    const result = removeSampleGrades()
    if (result.removedGrades > 0) {
      toast.success(`تمت إزالة ${result.removedGrades} صف تجريبي فارغ. لم يُحذف أي طالب.`)
      setHidden(true)
      setCanUndo(hasSampleBackup())
      onRemoved?.()
    } else {
      toast.error("لا توجد بيانات تجريبية للإزالة")
      setHidden(true)
    }
  }

  const handleDismiss = () => {
    localStorage.setItem("sampleBannerDismissed", "1")
    setHidden(true)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-6 rounded-2xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-5 flex flex-col md:flex-row md:items-center gap-4"
    >
      <div className="w-12 h-12 rounded-xl bg-amber-500 flex items-center justify-center shrink-0 shadow-lg">
        <AlertTriangle className="w-6 h-6 text-white" />
      </div>
      <div className="flex-1">
        <h3 className="font-bold text-amber-900 dark:text-amber-100 mb-1">
          بيانات تجريبية قديمة موجودة في جهازك
        </h3>
        <p className="text-sm text-amber-800 dark:text-amber-200 leading-relaxed">
          الصفوف التالية أُضيفت تلقائياً في نسخ سابقة، وهي فارغة تماماً (لا طلاب ولا اختبارات ولا
          حصص). صفوفك ومجموعاتك الحقيقية لا تتأثر إطلاقاً.
        </p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {samples.map((g) => (
            <li
              key={g.id}
              className="text-xs font-semibold bg-amber-200/70 dark:bg-amber-900/60 text-amber-900 dark:text-amber-100 px-2.5 py-1 rounded-full"
            >
              {g.name} ({g.groups.length} مجموعة)
            </li>
          ))}
        </ul>
        {confirming && (
          <p className="mt-3 text-sm font-bold text-red-700 dark:text-red-400">
            هل أنت متأكد؟ اضغط «تأكيد الإزالة» مرة أخرى للحذف — يمكنك التراجع بعدها.
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button
          onClick={handleRemove}
          className={
            confirming
              ? "bg-red-600 hover:bg-red-700 text-white"
              : "bg-amber-600 hover:bg-amber-700 text-white"
          }
        >
          <Trash2 className="w-4 h-4" />
          <span>{confirming ? "تأكيد الإزالة" : "إزالة البيانات التجريبية"}</span>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleDismiss}
          className="text-amber-700 hover:text-amber-900 dark:text-amber-300"
          title="تجاهل"
        >
          <X className="w-5 h-5" />
        </Button>
      </div>
    </motion.div>
  )
}
