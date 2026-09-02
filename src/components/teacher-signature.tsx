"use client"

import { useEffect, useState } from "react"
import {
  DEFAULT_TEACHER_NAME,
  DEFAULT_TEACHER_SIGNATURE_LINE,
  TEACHER_NAME,
  TEACHER_SIGNATURE_LINE,
  getTeacherName,
  getTeacherSignatureLine,
} from "@/lib/branding"

export function TeacherSignature({
  compact = false,
  className = "",
}: {
  compact?: boolean
  className?: string
}) {
  const [line, setLine] = useState(DEFAULT_TEACHER_SIGNATURE_LINE)
  const [name, setName] = useState(DEFAULT_TEACHER_NAME)

  useEffect(() => {
    setLine(getTeacherSignatureLine())
    setName(getTeacherName())
  }, [])

  if (compact) {
    return (
      <p className={`text-center text-sm text-gray-500 dark:text-gray-400 ${className}`}>
        {line || TEACHER_SIGNATURE_LINE}{" "}
        <span className="font-bold text-indigo-700 dark:text-indigo-300">
          {name || TEACHER_NAME}
        </span>
      </p>
    )
  }

  return (
    <div className={`mt-10 pt-6 border-t border-dashed border-indigo-200 dark:border-indigo-900 text-center ${className}`}>
      <p className="text-base md:text-lg font-semibold text-gray-700 dark:text-gray-200">
        {line || TEACHER_SIGNATURE_LINE}
      </p>
      <p className="mt-1 text-lg md:text-xl font-extrabold text-indigo-700 dark:text-indigo-300">
        {name || TEACHER_NAME}
      </p>
    </div>
  )
}
