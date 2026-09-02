"use client"

import { TEACHER_NAME, TEACHER_SIGNATURE_LINE } from "@/lib/branding"

export function TeacherSignature({
  compact = false,
  className = "",
}: {
  compact?: boolean
  className?: string
}) {
  if (compact) {
    return (
      <p className={`text-center text-sm text-gray-500 dark:text-gray-400 ${className}`}>
        {TEACHER_SIGNATURE_LINE}{" "}
        <span className="font-bold text-indigo-700 dark:text-indigo-300">{TEACHER_NAME}</span>
      </p>
    )
  }

  return (
    <div className={`mt-10 pt-6 border-t border-dashed border-indigo-200 dark:border-indigo-900 text-center ${className}`}>
      <p className="text-base md:text-lg font-semibold text-gray-700 dark:text-gray-200">
        {TEACHER_SIGNATURE_LINE}
      </p>
      <p className="mt-1 text-lg md:text-xl font-extrabold text-indigo-700 dark:text-indigo-300">
        {TEACHER_NAME}
      </p>
    </div>
  )
}
