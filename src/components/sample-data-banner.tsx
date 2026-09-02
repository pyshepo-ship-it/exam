"use client"

import React, { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { AlertTriangle, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import toast from "react-hot-toast"
import { getSampleGrades, removeSampleGrades } from "@/lib/data-storage"

/**
 * تنبيه يظهر عند وجود بيانات تجريبية (صفوف ومجموعات افتراضية)
 * تم إضافتها تلقائياً في نسخ سابقة من النظام.
 */
export default function SampleDataBanner({ onRemoved }: { onRemoved?: () => void }) {
  const [sampleCount, setSampleCount] = useState(0)
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    const samples = getSampleGrades()
    if (samples.length > 0 && localStorage.getItem("sampleBannerDismissed") !== "1") {
      setSampleCount(samples.length)
    } else {
      setSampleCount(0)
    }
  }, [])

  if (hidden || sampleCount === 0) return null

  const handleRemove = () => {
    const result = removeSampleGrades()
    if (result.removedGrades > 0) {
      toast.success(
        `تمت إزالة ${result.removedGrades} صف تجريبي (مع مجموعاته). يمكنك الآن البدء بصفوفك الحقيقية.`
      )
      setHidden(true)
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
          بيانات تجريبية (افتراضية) موجودة في جهازك
        </h3>
        <p className="text-sm text-amber-800 dark:text-amber-200 leading-relaxed">
          هذه الصفوف والمجموعات (مثل "الصف الرابع الابتدائي" و"مجموعة 1") أُضيفت تلقائياً في نسخ
          سابقة من النظام وهي السبب في ظهور مجموعات افتراضية إجبارياً. مجموعاتك الحقيقية التي سجلتها
          موجودة كما هي ولا تتأثر. يمكنك إزالتها الآن للبدء بصفوفك فقط.
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button
          onClick={handleRemove}
          className="bg-amber-600 hover:bg-amber-700 text-white"
        >
          <Trash2 className="w-4 h-4" />
          <span>إزالة البيانات التجريبية</span>
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
