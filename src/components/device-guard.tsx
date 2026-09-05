"use client"

/**
 * حارس الجهاز — يعمل في كل صفحة عامة:
 *  1) نبضة زيارة تسجّل الجهاز في السحابة (وتربطه بحساب الطالب إن كان داخلاً)،
 *     فيستطيع المعلم لاحقاً معرفة أن مشاركة مجهولة صادرة من جهاز طالب بعينه.
 *  2) إن كان الجهاز محظوراً تُستبدل الصفحة كلها بشاشة «تم إيقاف هذا الجهاز».
 *
 * لا يمنع لوحة المعلم إطلاقاً (مسارات /dashboard و /login خارج الحارس).
 */

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { ShieldAlert } from "lucide-react"
import { touchDevice } from "@/lib/supabase/sync"
import { getPortalSession } from "@/lib/student-accounts"

export function DeviceGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/"
  const [banned, setBanned] = useState(false)

  const teacherArea = pathname.startsWith("/dashboard") || pathname.startsWith("/login") || pathname.startsWith("/reset-password")

  useEffect(() => {
    if (teacherArea) return
    let alive = true
    const kind = pathname.startsWith("/exam")
      ? "exam_open"
      : pathname.startsWith("/surveys") || pathname.startsWith("/survey")
      ? "survey_open"
      : "visit"
    const token = getPortalSession()?.token || undefined
    void touchDevice(kind as "visit" | "exam_open" | "survey_open", pathname, token).then(result => {
      if (alive && result.banned) setBanned(true)
    })
    return () => { alive = false }
  }, [pathname, teacherArea])

  if (banned && !teacherArea) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-6 font-arabic" dir="rtl">
        <div className="max-w-md text-center space-y-4">
          <ShieldAlert className="mx-auto h-16 w-16 text-red-500" />
          <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white">تم إيقاف هذا الجهاز</h1>
          <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
            أوقف المعلم استخدام هذا الجهاز على الموقع بسبب مخالفة.
            راجع المعلم مباشرةً لرفع الإيقاف.
          </p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
