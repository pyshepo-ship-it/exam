"use client"

import { useEffect, useState } from "react"
import { Cloud, CloudOff, Loader2, CheckCircle2 } from "lucide-react"
import { onSyncStatus, type SyncStatus } from "@/lib/supabase/sync"
import { isSupabaseConfigured } from "@/lib/supabase/client"

function formatTime(iso: string | null) {
  if (!iso) return ""
  try {
    return new Date(iso).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
  } catch {
    return ""
  }
}

/**
 * مؤشر دائم يوضح ما إذا كان آخر حفظ وصل فعلاً إلى قاعدة بيانات Supabase.
 */
export function SyncIndicator({ compact = false }: { compact?: boolean }) {
  const [status, setStatus] = useState<SyncStatus>({
    state: "idle",
    lastSavedAt: null,
    lastError: null,
    pending: 0,
  })
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    return onSyncStatus(setStatus)
  }, [])

  if (!mounted) return null

  if (!isSupabaseConfigured()) {
    return (
      <div
        title="لم يتم ضبط متغيرات Supabase — لا يُحفظ أي بيان على الجهاز أو في السحابة"
        className="flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400"
      >
        <CloudOff className="w-4 h-4" />
        {!compact && <span>غير متصل بـ Supabase — لا يوجد حفظ للبيانات</span>}
      </div>
    )
  }

  if (status.state === "saving") {
    return (
      <div className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400">
        <Loader2 className="w-4 h-4 animate-spin" />
        {!compact && <span>جاري الحفظ في قاعدة البيانات…</span>}
      </div>
    )
  }

  if (status.state === "error") {
    return (
      <div
        title={status.lastError || "خطأ في المزامنة"}
        className="flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400"
      >
        <CloudOff className="w-4 h-4" />
        {!compact && <span>فشل الحفظ في قاعدة البيانات</span>}
      </div>
    )
  }

  if (status.state === "saved") {
    return (
      <div className="flex items-center gap-1.5 text-xs font-medium text-green-600 dark:text-green-400">
        <CheckCircle2 className="w-4 h-4" />
        {!compact && <span>تم الحفظ في قاعدة البيانات {formatTime(status.lastSavedAt)}</span>}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
      <Cloud className="w-4 h-4" />
      {!compact && <span>متصل بقاعدة البيانات</span>}
    </div>
  )
}
