"use client"

import React, { useEffect, useState } from "react"
import type { Exam, Question, SubQuestion, ExamTemplateId } from "@/lib/data-storage"
import {
  ARABIC_ORDINALS,
  DOTS_LINE,
  MONTHS,
  EXAM_TEMPLATES,
  getQuestionHeader,
  getQuestionMarks,
  getExamTotalMarks,
  getQuestionTypeMeta,
  renderCompleteParts,
  getUnderlinedWords,
} from "@/lib/exam-templates"
import { PaperCornerOrnaments, QuestionOrnaments } from "./science-ornaments"
import {
  DEFAULT_TEACHER_NAME,
  DEFAULT_TEACHER_SIGNATURE_LINE,
  TEACHER_NAME,
  TEACHER_SIGNATURE_LINE,
  getTeacherName,
  getTeacherSignatureLine,
} from "@/lib/branding"

interface ExamPaperProps {
  exam: Exam
  gradeName: string
  groupName?: string
  /** يُستخدم عند المعاينة قبل الحفظ */
  templateId?: ExamTemplateId
  showDecorations?: boolean
  teacherName?: string
  schoolName?: string
}

function TypeSeal({ question }: { question: Question }) {
  const meta = getQuestionTypeMeta(question.questionType)
  return (
    <span
      className="inline-flex items-center justify-center min-w-[2.4rem] h-6 px-2 rounded-md text-[11px] font-extrabold text-white shadow-xs shrink-0"
      style={{ background: meta.accent }}
    >
      {meta.paperMark}
    </span>
  )
}

function CompleteLine({ sq }: { sq: SubQuestion }) {
  const { before, after, atEnd } = renderCompleteParts(sq)
  const blank = (
    <span className="inline-block min-w-[6rem] border-b border-dotted border-current mx-1 align-baseline">
      {"\u00a0"}
    </span>
  )
  if (atEnd) {
    return (
      <>
        {before} {after} {blank}
      </>
    )
  }
  return (
    <>
      {before} {blank} {after}
    </>
  )
}

function CorrectionLine({ sq }: { sq: SubQuestion }) {
  const words = getUnderlinedWords(sq)
  if (words.length === 0) return null
  return (
    <>
      {words.map((w, i) => (
        <span key={i}>
          <span className={w.underlined ? "underline decoration-2 underline-offset-4 font-semibold" : undefined}>
            {w.word}
          </span>
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </>
  )
}

function SubQuestionBody({ question, sq, index }: { question: Question; sq: SubQuestion; index: number }) {
  return (
    <div className="exam-sub leading-8 text-[14px] sm:text-[15px]">
      {question.questionType === 1 && (
        <div>
          <p>
            <span className="font-bold">{index + 1} – </span>
            {sq.questionText}
          </p>
          <div className="flex flex-wrap gap-x-8 gap-y-1 pr-6 mt-1">
            {sq.choices?.map(choice => (
              <span key={choice.id} className="text-gray-800 dark:text-gray-200">
                {choice.choiceKey}{") "}{choice.choiceText}
              </span>
            ))}
          </div>
        </div>
      )}
      {question.questionType === 2 && (
        <p>
          <span className="font-bold">{index + 1} – </span>
          <CompleteLine sq={sq} />
        </p>
      )}
      {question.questionType === 3 && (
        <div className="flex items-center justify-between gap-3 w-full py-0.5">
          <p className="min-w-0 flex-1 text-right text-[14px] sm:text-[15px] leading-relaxed break-words">
            <span className="font-bold">{index + 1} – </span>
            {sq.questionText}
          </p>
          <span className="shrink-0 inline-flex items-center justify-center min-w-[3.4rem] h-7 px-2 text-sm font-bold border border-current/80 rounded tracking-widest text-center">
            (&nbsp;&nbsp;&nbsp;&nbsp;)
          </span>
        </div>
      )}
      {question.questionType === 4 && (
        <div>
          <p>
            <span className="font-bold">{index + 1} – </span>
            {sq.questionText}
          </p>
          {Array.from({ length: sq.answerLines || 2 }).map((_, li) => (
            <p key={li} className="pr-6 tracking-wider opacity-65">
              {DOTS_LINE}
            </p>
          ))}
        </div>
      )}
      {question.questionType === 5 && (
        <div>
          <p>
            <span className="font-bold">{index + 1} – </span>
            <CorrectionLine sq={sq} />
          </p>
          <p className="pr-6 tracking-wider opacity-65">{DOTS_LINE}</p>
        </div>
      )}
    </div>
  )
}

function QuestionBlock({
  question,
  index,
  template,
  gradeName,
  showDecorations,
}: {
  question: Question
  index: number
  template: ExamTemplateId
  gradeName: string
  showDecorations: boolean
}) {
  const header = getQuestionHeader(question)
  const marks = getQuestionMarks(question)
  const ordinal = ARABIC_ORDINALS[index] || String(index + 1)
  const meta = getQuestionTypeMeta(question.questionType)
  const colorful = template === "explorer" || template === "lab" || template === "life" || template === "cosmos"

  const headerEl = (
    <div
      className="relative z-10 flex items-center justify-between gap-3 px-3.5 py-2"
      style={
        colorful
          ? {
              background:
                template === "explorer"
                  ? `${meta.accent}14`
                  : template === "lab"
                  ? "#0f766e12"
                  : template === "life"
                  ? "#16653412"
                  : "#1e1b4b12",
              borderBottom: `2px solid ${template === "explorer" ? meta.accent : "currentColor"}`,
            }
          : undefined
      }
    >
      <div className="flex items-center gap-2 flex-wrap min-w-0">
        <TypeSeal question={question} />
        <h3 className="font-extrabold text-[15px] m-0 leading-tight">
          السؤال {ordinal}: {header}
        </h3>
      </div>
      <span className="relative z-10 shrink-0 text-xs font-bold px-2 py-0.5 rounded bg-white/90 dark:bg-gray-900/90 shadow-2xs border border-current/25">
        ({marks} درجة)
      </span>
    </div>
  )

  return (
    <section
      className="exam-q relative mb-5 overflow-hidden"
      style={{
        border:
          template === "classic"
            ? "1.5px solid #1e3a5f"
            : template === "lab"
            ? "1.5px solid #0f766e"
            : template === "life"
            ? "1.5px solid #166534"
            : template === "cosmos"
            ? "1.5px solid #c5a059"
            : `2px solid ${meta.accent}`,
        borderRadius: template === "classic" ? 0 : 10,
        background: "#fff",
      }}
    >
      {showDecorations && <QuestionOrnaments gradeName={gradeName} index={index} />}
      {headerEl}
      <div className="relative z-10 px-4 py-3 space-y-3">
        {question.subQuestions.map((sq, si) => (
          <React.Fragment key={sq.id}>
            {si > 0 && (
              <div
                className="h-px my-1"
                style={{
                  background:
                    template === "classic"
                      ? "repeating-linear-gradient(90deg, #1e3a5f33 0 6px, transparent 6px 12px)"
                      : `${meta.accent}33`,
                }}
              />
            )}
            <SubQuestionBody question={question} sq={sq} index={si} />
          </React.Fragment>
        ))}
      </div>
    </section>
  )
}

function StudentFields() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm mt-3 pt-2 border-t border-dashed border-current/20">
      <p className="font-semibold text-right">
        اسم الطالب: <span className="inline-block min-w-[12rem] border-b border-dotted border-current" />
      </p>
      <p className="font-semibold text-right">
        الفصل: <span className="inline-block min-w-[8rem] border-b border-dotted border-current" />
      </p>
    </div>
  )
}

function PaperHeader({
  exam,
  gradeName,
  template,
  teacherName,
  schoolName,
  totalMarks,
}: {
  exam: Exam
  gradeName: string
  template: ExamTemplateId
  teacherName?: string
  schoolName?: string
  totalMarks: number
}) {
  const month = exam.month ? MONTHS[exam.month - 1] : ""
  
  // الصف والشهر والعام الدراسي فقط دون معلومات المجموعات
  const subtitle = [
    gradeName,
    month ? `شهر ${month}` : null,
    `العام الدراسي ${exam.academicYear}`,
  ]
    .filter(Boolean)
    .join("  •  ")

  if (template === "classic") {
    return (
      <header className="text-center border-[3px] border-double border-[#1e3a5f] p-4 mb-5">
        {schoolName && <p className="text-xs text-[#1e3a5f] font-bold mb-1">{schoolName}</p>}
        <h1 className="text-2xl font-black text-[#1e3a5f] my-1">{exam.title}</h1>
        <p className="text-sm font-semibold text-gray-800">{subtitle}</p>
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-1 text-xs mt-2 font-semibold text-[#1e3a5f]">
          {exam.duration ? <span>الزمن: {exam.duration} دقيقة</span> : null}
          <span>الدرجة الكلية: {totalMarks} درجة</span>
          {teacherName && <span>إعداد: {teacherName}</span>}
        </div>
        <StudentFields />
      </header>
    )
  }

  if (template === "lab") {
    return (
      <header className="relative overflow-hidden rounded-xl border-2 border-teal-700 bg-gradient-to-l from-teal-50 to-cyan-50 p-4 mb-5 text-center">
        {schoolName && <p className="text-xs text-teal-700 font-bold mb-1">{schoolName}</p>}
        <h1 className="text-2xl font-black text-teal-900 my-1">{exam.title}</h1>
        <p className="text-sm font-semibold text-teal-800">{subtitle}</p>
        <div className="flex flex-wrap justify-center gap-x-5 gap-y-1 text-xs mt-2 font-semibold text-teal-800">
          {exam.duration ? <span>الزمن: {exam.duration} دقيقة</span> : null}
          <span>{totalMarks} درجة</span>
          {teacherName && <span>إعداد: {teacherName}</span>}
        </div>
        <StudentFields />
      </header>
    )
  }

  if (template === "life") {
    return (
      <header className="relative overflow-hidden rounded-xl border-2 border-green-700 bg-gradient-to-l from-green-50 to-emerald-50 p-4 mb-5 text-center">
        {schoolName && <p className="text-xs text-green-700 font-bold mb-1">{schoolName}</p>}
        <h1 className="text-2xl font-black text-green-900 my-1">{exam.title}</h1>
        <p className="text-sm font-semibold text-green-800">{subtitle}</p>
        <div className="flex flex-wrap justify-center gap-x-5 gap-y-1 text-xs mt-2 font-semibold text-green-800">
          {exam.duration ? <span>الزمن: {exam.duration} دقيقة</span> : null}
          <span>{totalMarks} درجة</span>
          {teacherName && <span>إعداد: {teacherName}</span>}
        </div>
        <StudentFields />
      </header>
    )
  }

  if (template === "cosmos") {
    return (
      <header className="relative overflow-hidden rounded-xl border-2 border-[#c5a059] bg-[#1e1b4b] text-[#fde68a] p-4 mb-5 text-center">
        {schoolName && <p className="text-xs opacity-90 font-bold mb-1">{schoolName}</p>}
        <h1 className="text-2xl font-black my-1 text-white">{exam.title}</h1>
        <p className="text-sm font-semibold text-[#fde68a]">{subtitle}</p>
        <div className="flex flex-wrap justify-center gap-x-5 gap-y-1 text-xs mt-2 font-semibold">
          {exam.duration ? <span>الزمن: {exam.duration} دقيقة</span> : null}
          <span>{totalMarks} درجة</span>
          {teacherName && <span>إعداد: {teacherName}</span>}
        </div>
        <div className="text-[#fde68a]">
          <StudentFields />
        </div>
      </header>
    )
  }

  // explorer
  return (
    <header className="relative overflow-hidden rounded-2xl border-2 border-indigo-400 bg-gradient-to-l from-indigo-50 via-amber-50 to-emerald-50 p-4 mb-5 text-center">
      {schoolName && <p className="text-xs text-indigo-700 font-bold mb-1">{schoolName}</p>}
      <h1 className="text-2xl font-black text-indigo-950 my-1">{exam.title}</h1>
      <p className="text-sm font-semibold text-indigo-800">{subtitle}</p>
      <div className="flex flex-wrap justify-center gap-x-5 gap-y-1 text-xs mt-2 font-semibold text-indigo-800">
        {exam.duration ? <span>الزمن: {exam.duration} دقيقة</span> : null}
        <span>{totalMarks} درجة</span>
        {teacherName && <span>إعداد: {teacherName}</span>}
      </div>
      <StudentFields />
    </header>
  )
}

export function ExamPaper({
  exam,
  gradeName,
  templateId,
  showDecorations,
  teacherName,
  schoolName,
}: ExamPaperProps) {
  const template: ExamTemplateId = templateId || exam.templateId || "classic"
  const decorations = showDecorations ?? exam.showDecorations !== false
  const [signatureLine, setSignatureLine] = useState(DEFAULT_TEACHER_SIGNATURE_LINE)
  const [storedTeacher, setStoredTeacher] = useState(DEFAULT_TEACHER_NAME)

  useEffect(() => {
    setSignatureLine(getTeacherSignatureLine())
    setStoredTeacher(getTeacherName())
  }, [])

  const teacher = teacherName || exam.teacherName || storedTeacher || TEACHER_NAME
  const sigLine = signatureLine || TEACHER_SIGNATURE_LINE || DEFAULT_TEACHER_SIGNATURE_LINE
  const school = schoolName ?? exam.schoolName
  const totalMarks = exam.totalMarks || getExamTotalMarks(exam.questions)

  const shell: React.CSSProperties =
    template === "classic"
      ? { background: "#fff", color: "#111", border: "5px double #1e3a5f", padding: 22 }
      : template === "lab"
      ? { background: "#f7fffe", color: "#134e4a", border: "3.5px solid #0f766e", padding: 22, borderRadius: 16 }
      : template === "life"
      ? { background: "#f7fff9", color: "#14532d", border: "3.5px solid #166534", padding: 22, borderRadius: 16 }
      : template === "cosmos"
      ? { background: "#fafafe", color: "#1e1b4b", border: "3.5px solid #c5a059", padding: 22, borderRadius: 16 }
      : { background: "#fffefb", color: "#1e1b4b", border: "3.5px solid #6366f1", padding: 22, borderRadius: 18 }

  return (
    <article className="exam-paper relative font-arabic print:shadow-none" dir="rtl" lang="ar" style={shell}>
      {decorations && <PaperCornerOrnaments gradeName={gradeName} />}
      <div className="relative z-10">
        <PaperHeader
          exam={exam}
          gradeName={gradeName}
          template={template}
          teacherName={teacher}
          schoolName={school}
          totalMarks={totalMarks}
        />

        <div className="space-y-1">
          {exam.questions.map((question, qi) => (
            <QuestionBlock
              key={question.id}
              question={question}
              index={qi}
              template={template}
              gradeName={gradeName}
              showDecorations={decorations}
            />
          ))}
        </div>

        {exam.questions.length === 0 && (
          <p className="text-center text-sm opacity-60 py-8">لم تُضف أسئلة بعد</p>
        )}

        <footer className="mt-8 pt-4 text-center border-t border-dashed border-current/30">
          <p className="text-[11px] opacity-70 mb-2 font-medium">انتهت الأسئلة</p>
          <p className="text-base font-semibold text-gray-800 dark:text-gray-200">
            {sigLine}
          </p>
          <p className="text-lg font-extrabold mt-0.5 text-indigo-700 dark:text-indigo-300">
            {teacher}
          </p>
        </footer>
      </div>
    </article>
  )
}

/** بطاقة اختيار القالب في نموذج الإنشاء */
export function TemplatePicker({
  value,
  onChange,
}: {
  value: ExamTemplateId
  onChange: (id: ExamTemplateId) => void
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
      {EXAM_TEMPLATES.map(t => {
        const selected = value === t.id
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={`text-right rounded-xl border-2 p-3 transition-all ${
              selected
                ? "border-indigo-500 shadow-lg ring-2 ring-indigo-300 dark:ring-indigo-800"
                : "border-gray-200 dark:border-gray-700 hover:border-indigo-300"
            } bg-white dark:bg-gray-900`}
          >
            <div
              className={`h-10 rounded-lg mb-2 bg-gradient-to-l ${t.previewClass}`}
              style={{
                background:
                  t.id === "classic"
                    ? "linear-gradient(90deg,#1e3a5f,#c5a059)"
                    : t.id === "lab"
                    ? "linear-gradient(90deg,#0f766e,#22d3ee)"
                    : t.id === "life"
                    ? "linear-gradient(90deg,#166534,#4ade80)"
                    : t.id === "cosmos"
                    ? "linear-gradient(90deg,#1e1b4b,#c5a059)"
                    : "linear-gradient(90deg,#4f46e5,#f59e0b,#10b981)",
              }}
            />
            <p className="font-bold text-sm text-gray-900 dark:text-white">{t.name}</p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">{t.tagline}</p>
          </button>
        )
      })}
    </div>
  )
}
