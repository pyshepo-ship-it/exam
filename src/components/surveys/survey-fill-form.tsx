"use client"

import React from "react"
import type { Survey, SurveyAnswer, SurveyQuestion } from "@/lib/data-storage"
import { emptyAnswer, isAnswered, questionTypeLabel, YES, NO } from "@/lib/surveys"

/**
 * نموذج الإجابة على استبيان — يُستخدم في حساب الطالب وفي لوحة الإعلانات العامة.
 * لا يحفظ شيئًا محليًا: الإجابات حالة في الذاكرة حتى يضغط الطالب "إرسال"
 * فتُدرج في Supabase أولًا (submitSurveyResponse) ثم تُعرض.
 */
export interface SurveyFillFormProps {
  survey: Survey
  answers: Record<string, SurveyAnswer>
  onChange: (answers: Record<string, SurveyAnswer>) => void
  disabled?: boolean
}

export function SurveyFillForm({ survey, answers, onChange, disabled }: SurveyFillFormProps) {
  const setAnswer = (qid: string, value: SurveyAnswer) => {
    onChange({ ...answers, [qid]: value })
  }

  const toggleChoice = (q: SurveyQuestion, option: string) => {
    const current = answers[q.id]?.choice || []
    if (q.type === "multi") {
      const next = current.includes(option) ? current.filter(c => c !== option) : [...current, option]
      setAnswer(q.id, { choice: next })
      return
    }
    // اختيار واحد / نعم-لا
    setAnswer(q.id, { choice: current.includes(option) && q.type !== "yesno" ? [] : [option] })
  }

  return (
    <div className="space-y-4">
      {survey.questions.map((q, qi) => {
        const a = answers[q.id] || emptyAnswer(q)
        const options = q.type === "yesno" ? [YES, NO] : q.options || []
        const max = q.maxRating || 5
        const missing = q.required && !isAnswered(a)

        return (
          <div
            key={q.id}
            className={`rounded-xl border p-3 bg-white dark:bg-gray-900 ${
              missing ? "border-rose-300 dark:border-rose-800" : "border-gray-200 dark:border-gray-700"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-bold text-gray-800 dark:text-gray-100">
                <span className="text-indigo-600 dark:text-indigo-400">{qi + 1}. </span>
                {q.title}
                {q.required && <span className="text-rose-500"> *</span>}
              </p>
              <span className="shrink-0 text-[10px] text-gray-400">{questionTypeLabel(q.type)}</span>
            </div>

            <div className="mt-2.5">
              {(q.type === "single" || q.type === "multi" || q.type === "yesno") && (
                <div className="flex flex-wrap gap-2">
                  {options.length === 0 ? (
                    <p className="text-xs text-amber-600">لا توجد خيارات لهذا السؤال</p>
                  ) : (
                    options.map(opt => {
                      const active = (a.choice || []).includes(opt)
                      return (
                        <button
                          key={opt}
                          type="button"
                          disabled={disabled}
                          onClick={() => toggleChoice(q, opt)}
                          className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all border disabled:opacity-50 ${
                            active
                              ? "bg-indigo-600 text-white border-indigo-600 shadow"
                              : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-indigo-300"
                          }`}
                        >
                          {active ? "✓ " : ""}
                          {opt}
                        </button>
                      )
                    })
                  )}
                </div>
              )}

              {q.type === "rating" && (
                <div className="flex items-center gap-2">
                  {Array.from({ length: max }, (_, i) => i + 1).map(v => {
                    const active = a.rating === v
                    return (
                      <button
                        key={v}
                        type="button"
                        disabled={disabled}
                        onClick={() => setAnswer(q.id, { rating: v })}
                        className={`h-9 w-9 rounded-lg text-sm font-bold transition-all border disabled:opacity-50 ${
                          active
                            ? "bg-amber-500 text-white border-amber-500 shadow"
                            : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-amber-400"
                        }`}
                      >
                        {v}
                      </button>
                    )
                  })}
                  {typeof a.rating === "number" && a.rating > 0 && (
                    <span className="text-xs font-bold text-amber-600">{a.rating} من {max}</span>
                  )}
                </div>
              )}

              {q.type === "text" && (
                <textarea
                  rows={3}
                  disabled={disabled}
                  placeholder={q.placeholder || "اكتب إجابتك هنا..."}
                  value={typeof a.text === "string" ? a.text : ""}
                  onChange={e => setAnswer(q.id, { text: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-60"
                />
              )}
            </div>
          </div>
        )
      })}

      {survey.questions.length === 0 && (
        <p className="text-center text-sm text-gray-500 py-6">لا توجد أسئلة في هذا الاستبيان</p>
      )}
    </div>
  )
}
