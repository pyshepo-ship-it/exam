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
  partitionExamQuestions,
  getTemplate,
  getTemplateFont,
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
  /** وضع الضغط: يقلّل المسافات وأسطر النقاط ليتسع الامتحان في صفحتين دون تشويه */
  compact?: boolean
  /** أقصى عدد صفحات (2 = صفحتان فقط، 1 = صفحة واحدة قدر الإمكان) */
  maxPages?: number
}

/** لوحة ألوان كل قالب — تُستخدم للحدود والخلفيات برمجياً */
interface TemplatePalette {
  bg: string
  color: string
  border: string
  radius: number
  headerBg: string
  headerColor: string
  accent: string
}

const PALETTES: Record<ExamTemplateId, TemplatePalette> = {
  classic: {
    bg: "#ffffff",
    color: "#111111",
    border: "3px double #1e3a5f",
    radius: 6,
    headerBg: "#ffffff",
    headerColor: "#1e3a5f",
    accent: "#1e3a5f",
  },
  lab: {
    bg: "#f7fffe",
    color: "#134e4a",
    border: "2.5px solid #0f766e",
    radius: 12,
    headerBg: "linear-gradient(to left, #f0fdfa, #ecfeff)",
    headerColor: "#0f766e",
    accent: "#0f766e",
  },
  life: {
    bg: "#f7fff9",
    color: "#14532d",
    border: "2.5px solid #166534",
    radius: 12,
    headerBg: "linear-gradient(to left, #f0fdf4, #ecfdf5)",
    headerColor: "#166534",
    accent: "#166534",
  },
  cosmos: {
    bg: "#fafafe",
    color: "#1e1b4b",
    border: "2.5px solid #c5a059",
    radius: 12,
    headerBg: "#1e1b4b",
    headerColor: "#fde68a",
    accent: "#c5a059",
  },
  explorer: {
    bg: "#fffefb",
    color: "#1e1b4b",
    border: "2.5px solid #6366f1",
    radius: 14,
    headerBg: "linear-gradient(to left, #eef2ff, #fef3c7, #ecfdf5)",
    headerColor: "#1e1b4b",
    accent: "#6366f1",
  },
  royal: {
    bg: "#fbf8ef",
    color: "#132a4a",
    border: "2.5px solid #b8860b",
    radius: 16,
    headerBg: "linear-gradient(135deg, #132a4a 0%, #233a5e 60%, #b8860b 130%)",
    headerColor: "#f8f4e8",
    accent: "#b8860b",
  },
  parchment: {
    bg: "#fdf7ea",
    color: "#5a4326",
    border: "1.5px solid #c9a24b",
    radius: 10,
    headerBg: "linear-gradient(135deg, #fbf1dd 0%, #f3e2c0 100%)",
    headerColor: "#5a4326",
    accent: "#b98a3c",
  },
  wedding: {
    bg: "#f2faf6",
    color: "#0b5d43",
    border: "2.5px solid #0b5d43",
    radius: 18,
    headerBg: "linear-gradient(135deg, #0b5d43 0%, #14805f 60%, #d4af37 130%)",
    headerColor: "#f0faf5",
    accent: "#d4af37",
  },
  modern: {
    bg: "#ffffff",
    color: "#1f2937",
    border: "1px solid #1f2937",
    radius: 8,
    headerBg: "#f3f4f6",
    headerColor: "#111827",
    accent: "#1f2937",
  },
}

function palette(template: ExamTemplateId): TemplatePalette {
  return PALETTES[template] || PALETTES.classic
}

function TypeSeal({ question }: { question: Question }) {
  const meta = getQuestionTypeMeta(question.questionType)
  return (
    <span
      className="inline-flex items-center justify-center min-w-[2.2rem] h-5 px-1.5 rounded text-[10px] font-black text-white shadow-xs shrink-0 whitespace-nowrap"
      style={{ background: meta.accent }}
    >
      {meta.paperMark}
    </span>
  )
}

function CompleteLine({ sq }: { sq: SubQuestion }) {
  const { before, after, atEnd } = renderCompleteParts(sq)
  const blank = (
    <span className="inline-block min-w-[6rem] sm:min-w-[8rem] border-b-2 border-dotted border-current mx-1 align-baseline">
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
          <span className={w.underlined ? "underline decoration-2 underline-offset-4 font-bold" : undefined}>
            {w.word}
          </span>
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </>
  )
}

function SubQuestionBody({
  question,
  sq,
  index,
  compact,
}: {
  question: Question
  sq: SubQuestion
  index: number
  compact?: boolean
}) {
  // وضع الضغط: نُقلّل سطور النقاط المفتوحة دون إزالتها كلياً حتى لا يُشوَّه السؤال
  const answerLines = compact
    ? Math.min(Math.max(sq.answerLines ?? 1, 1), 2)
    : (sq.answerLines ?? 1)

  return (
    <div className={`exam-sub ${compact ? "text-[13.5px]" : "text-[14px] sm:text-[15px]"} leading-relaxed ${compact ? "py-0.5" : "py-1"}`}>
      {/* 1. اختيار من متعدد مع مسافات مريحة وواضحة بين الخيارات */}
      {question.questionType === 1 && (
        <div className={compact ? "space-y-1" : "space-y-2"}>
          <p className="font-medium text-right leading-relaxed">
            <span className="font-bold text-gray-900 dark:text-gray-100">{index + 1} – </span>
            {sq.questionText}
          </p>
          <div className={`flex flex-wrap items-center gap-x-8 sm:gap-x-12 gap-y-2 pr-4 pt-0.5 text-xs sm:text-[14px] ${compact ? "gap-y-1" : ""}`}>
            {sq.choices?.map(choice => (
              <span key={choice.id} className="text-gray-800 dark:text-gray-200 inline-flex items-center">
                <span className="font-bold text-gray-600 dark:text-gray-400 ml-1">{choice.choiceKey}{")"}</span>
                <span>{choice.choiceText}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 2. أكمل العبارات الآتية */}
      {question.questionType === 2 && (
        <p className="font-medium text-right leading-loose">
          <span className="font-bold text-gray-900 dark:text-gray-100">{index + 1} – </span>
          <CompleteLine sq={sq} />
        </p>
      )}

      {/* 3. صح أو خطأ */}
      {question.questionType === 3 && (
        <div className="flex items-center justify-between gap-4 w-full py-0.5 flex-nowrap">
          <p className={`min-w-0 flex-1 text-right ${compact ? "text-[13.5px]" : "text-[14px] sm:text-[15px]"} leading-relaxed break-words font-medium`}>
            <span className="font-bold text-gray-900 dark:text-gray-100">{index + 1} – </span>
            {sq.questionText}
          </p>
          <span className="shrink-0 whitespace-nowrap inline-flex items-center justify-center min-w-[3.6rem] h-6 px-1.5 text-xs font-bold border border-current/80 rounded tracking-widest text-center self-center">
            (&nbsp;&nbsp;&nbsp;&nbsp;)
          </span>
        </div>
      )}

      {/* 4 و 6 و 7 و 8: علل / المصطلح العلمي / ما المقصود / سؤال حر (افتراضياً سطر نقاط واحد مريح، وقابل للزيادة) */}
      {(question.questionType === 4 || question.questionType === 6 || question.questionType === 7 || question.questionType === 8) && (
        <div className={compact ? "space-y-1" : "space-y-1.5"}>
          <p className="font-medium text-right leading-relaxed">
            <span className="font-bold text-gray-900 dark:text-gray-100">{index + 1} – </span>
            {sq.questionText}
          </p>
          {Array.from({ length: answerLines }).map((_, li) => (
            <p key={li} className={`pr-4 tracking-wider opacity-60 ${compact ? "text-xs leading-7" : "text-xs sm:text-sm leading-8"} select-none`}>
              {DOTS_LINE}
            </p>
          ))}
        </div>
      )}

      {/* 5. صحح ما تحته خط */}
      {question.questionType === 5 && (
        <div className={compact ? "space-y-1" : "space-y-1.5"}>
          <p className="font-medium text-right leading-relaxed">
            <span className="font-bold text-gray-900 dark:text-gray-100">{index + 1} – </span>
            <CorrectionLine sq={sq} />
          </p>
          <p className={`pr-4 tracking-wider opacity-60 ${compact ? "text-xs leading-7" : "text-xs sm:text-sm leading-8"} select-none`}>{DOTS_LINE}</p>
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
  compact,
}: {
  question: Question
  index: number
  template: ExamTemplateId
  gradeName: string
  showDecorations: boolean
  compact?: boolean
}) {
  const header = getQuestionHeader(question)
  const marks = getQuestionMarks(question)
  const ordinal = ARABIC_ORDINALS[index] || String(index + 1)
  const meta = getQuestionTypeMeta(question.questionType)
  const pal = palette(template)
  const tpl = getTemplate(template)
  const colorful = tpl.decorative

  const headerEl = (
    <div
      className="relative z-10 flex items-center justify-between gap-2.5 px-3.5 py-1.5 w-full flex-nowrap"
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
                  : "linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.02))",
              borderBottom: `1.5px solid ${template === "explorer" ? meta.accent : pal.accent}`,
            }
          : undefined
      }
    >
      <div className="flex items-center gap-2 min-w-0 flex-1 flex-nowrap">
        <TypeSeal question={question} />
        <h3 className="font-extrabold text-sm sm:text-[14.5px] m-0 leading-tight min-w-0 break-words">
          السؤال {ordinal}: {header}
        </h3>
      </div>
      <span className="relative z-10 shrink-0 whitespace-nowrap text-xs font-bold px-2.5 py-0.5 rounded bg-white/95 dark:bg-gray-900/95 shadow-2xs border border-current/25 tracking-normal">
        ({marks} درجة)
      </span>
    </div>
  )

  return (
    <section
      className={`exam-q relative overflow-hidden w-full box-border rounded-lg ${compact ? "!my-1" : ""}`}
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
            : template === "modern"
            ? "1px solid #1f2937"
            : `1.5px solid ${pal.accent}`,
        background: "#fff",
        boxShadow:
          template === "royal" || template === "wedding"
            ? `0 0 0 3px #fff, 0 0 0 4px ${pal.accent}55`
            : undefined,
      }}
    >
      {showDecorations && <QuestionOrnaments gradeName={gradeName} index={index} />}
      {headerEl}
      <div className={`relative z-10 px-4 ${compact ? "py-2 space-y-2" : "py-3 space-y-3"}`}>
        {question.subQuestions.map((sq, si) => (
          <React.Fragment key={sq.id}>
            {si > 0 && (
              <div
                className="h-px my-1.5"
                style={{
                  background:
                    template === "classic"
                      ? "repeating-linear-gradient(90deg, #1e3a5f33 0 6px, transparent 6px 12px)"
                      : `${meta.accent}33`,
                }}
              />
            )}
            <SubQuestionBody question={question} sq={sq} index={si} compact={compact} />
          </React.Fragment>
        ))}
      </div>
    </section>
  )
}

function StudentFields() {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mt-2 pt-1.5 border-t border-dashed border-current/25">
      <p className="font-semibold text-right">
        اسم الطالب: <span className="inline-block min-w-[8rem] sm:min-w-[10rem] border-b border-dotted border-current" />
      </p>
      <p className="font-semibold text-right">
        الفصل: <span className="inline-block min-w-[5rem] sm:min-w-[6rem] border-b border-dotted border-current" />
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
  const pal = palette(template)

  const subtitle = [
    gradeName,
    month ? `شهر ${month}` : null,
    `العام الدراسي ${exam.academicYear}`,
  ]
    .filter(Boolean)
    .join("  •  ")

  if (template === "classic") {
    return (
      <header className="text-center border-2 border-double border-[#1e3a5f] p-2.5 sm:p-3 mb-2 rounded-lg w-full box-border">
        {schoolName && <p className="text-[11px] text-[#1e3a5f] font-bold mb-0.5">{schoolName}</p>}
        <h1 className="text-lg sm:text-xl font-black text-[#1e3a5f] my-0.5">{exam.title}</h1>
        <p className="text-xs sm:text-sm font-semibold text-gray-800">{subtitle}</p>
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-0.5 text-[11px] mt-1 font-semibold text-[#1e3a5f]">
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
      <header className="relative overflow-hidden rounded-xl border-2 border-teal-700 bg-gradient-to-l from-teal-50 to-cyan-50 p-2.5 sm:p-3 mb-2 text-center w-full box-border">
        {schoolName && <p className="text-[11px] text-teal-700 font-bold mb-0.5">{schoolName}</p>}
        <h1 className="text-lg sm:text-xl font-black text-teal-900 my-0.5">{exam.title}</h1>
        <p className="text-xs sm:text-sm font-semibold text-teal-800">{subtitle}</p>
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-0.5 text-[11px] mt-1 font-semibold text-teal-800">
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
      <header className="relative overflow-hidden rounded-xl border-2 border-green-700 bg-gradient-to-l from-green-50 to-emerald-50 p-2.5 sm:p-3 mb-2 text-center w-full box-border">
        {schoolName && <p className="text-[11px] text-green-700 font-bold mb-0.5">{schoolName}</p>}
        <h1 className="text-lg sm:text-xl font-black text-green-900 my-0.5">{exam.title}</h1>
        <p className="text-xs sm:text-sm font-semibold text-green-800">{subtitle}</p>
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-0.5 text-[11px] mt-1 font-semibold text-green-800">
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
      <header className="relative overflow-hidden rounded-xl border-2 border-[#c5a059] bg-[#1e1b4b] text-[#fde68a] p-2.5 sm:p-3 mb-2 text-center w-full box-border">
        {schoolName && <p className="text-[11px] opacity-90 font-bold mb-0.5">{schoolName}</p>}
        <h1 className="text-lg sm:text-xl font-black my-0.5 text-white">{exam.title}</h1>
        <p className="text-xs sm:text-sm font-semibold text-[#fde68a]">{subtitle}</p>
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-0.5 text-[11px] mt-1 font-semibold">
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

  if (template === "explorer") {
    return (
      <header className="relative overflow-hidden rounded-xl border-2 border-indigo-400 bg-gradient-to-l from-indigo-50 via-amber-50 to-emerald-50 p-2.5 sm:p-3 mb-2 text-center w-full box-border">
        {schoolName && <p className="text-[11px] text-indigo-700 font-bold mb-0.5">{schoolName}</p>}
        <h1 className="text-lg sm:text-xl font-black text-indigo-950 my-0.5">{exam.title}</h1>
        <p className="text-xs sm:text-sm font-semibold text-indigo-800">{subtitle}</p>
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-0.5 text-[11px] mt-1 font-semibold text-indigo-800">
          {exam.duration ? <span>الزمن: {exam.duration} دقيقة</span> : null}
          <span>{totalMarks} درجة</span>
          {teacherName && <span>إعداد: {teacherName}</span>}
        </div>
        <StudentFields />
      </header>
    )
  }

  // القوالب الجديدة الأنيقة (royal / parchment / wedding / modern)
  const crown = template === "royal"
  const light = template === "modern" || template === "parchment"
  return (
    <header
      className="relative overflow-hidden rounded-xl border-2 mb-2 text-center w-full box-border p-2.5 sm:p-3"
      style={{
        background: pal.headerBg,
        color: pal.headerColor,
        borderColor: pal.accent,
      }}
    >
      {showOrnamentDots(template) && (
        <>
          <span className="pointer-events-none absolute top-1.5 right-3 text-[10px]" style={{ opacity: 0.6 }}>❖</span>
          <span className="pointer-events-none absolute top-1.5 left-3 text-[10px]" style={{ opacity: 0.6 }}>❖</span>
        </>
      )}
      {schoolName && <p className="text-[11px] font-bold mb-0.5" style={{ color: pal.headerColor, opacity: 0.85 }}>{schoolName}</p>}
      <h1 className="text-lg sm:text-xl font-black my-0.5" style={{ color: pal.headerColor }}>{exam.title}</h1>
      <p className="text-xs sm:text-sm font-semibold" style={{ color: pal.headerColor, opacity: 0.92 }}>{subtitle}</p>
      <div
        className="flex flex-wrap justify-center gap-x-4 gap-y-0.5 text-[11px] mt-1 font-semibold"
        style={{ color: pal.headerColor, opacity: 0.92 }}
      >
        {exam.duration ? <span>الزمن: {exam.duration} دقيقة</span> : null}
        <span>{totalMarks} درجة</span>
        {teacherName && <span>إعداد: {teacherName}</span>}
      </div>
      <div style={{ color: light ? pal.color : "#f0faf5" }}>
        <StudentFields />
      </div>
      {crown && (
        <span className="pointer-events-none absolute -bottom-2 left-1/2 -translate-x-1/2 text-[16px]" style={{ color: pal.accent, opacity: 0.75 }}>✦</span>
      )}
    </header>
  )
}

function showOrnamentDots(template: ExamTemplateId): boolean {
  return template === "royal" || template === "wedding" || template === "parchment"
}

function PageContinuationMiniBanner({
  exam,
  gradeName,
  template,
  pageNumber,
  totalPages,
}: {
  exam: Exam
  gradeName: string
  template: ExamTemplateId
  pageNumber: number
  totalPages: number
}) {
  const pal = palette(template)
  return (
    <div
      className="relative z-10 flex items-center justify-between px-3 py-1.5 mb-2 rounded-lg border border-current/20 text-xs font-bold w-full box-border"
      style={{
        background:
          template === "classic"
            ? "#1e3a5f0d"
            : template === "lab"
            ? "#0f766e10"
            : template === "life"
            ? "#16653410"
            : template === "cosmos"
            ? "#1e1b4b10"
            : template === "modern"
            ? "#f3f4f6"
            : `${pal.accent}12`,
      }}
    >
      <span className="truncate min-w-0">تابع: {exam.title}</span>
      <span className="opacity-80 shrink-0 px-2">{gradeName}</span>
      <span className="text-[11px] px-2 py-0.5 rounded bg-white/80 dark:bg-gray-900/80 border border-current/15 shrink-0 whitespace-nowrap">
        الصفحة {pageNumber} من {totalPages}
      </span>
    </div>
  )
}

export function ExamPaper({
  exam,
  gradeName,
  templateId,
  showDecorations,
  teacherName,
  schoolName,
  compact,
  maxPages,
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
  const pal = palette(template)
  const fontFamily = getTemplateFont(template)

  const shellBase: React.CSSProperties =
    template === "classic"
      ? { background: "#fff", color: "#111", border: "4px double #1e3a5f", padding: "16px 18px" }
      : template === "lab"
      ? { background: "#f7fffe", color: "#134e4a", border: "2.5px solid #0f766e", padding: "16px 18px", borderRadius: 12 }
      : template === "life"
      ? { background: "#f7fff9", color: "#14532d", border: "2.5px solid #166534", padding: "16px 18px", borderRadius: 12 }
      : template === "cosmos"
      ? { background: "#fafafe", color: "#1e1b4b", border: "2.5px solid #c5a059", padding: "16px 18px", borderRadius: 12 }
      : template === "modern"
      ? { background: "#ffffff", color: "#1f2937", border: "1px solid #1f2937", padding: "14px 16px", borderRadius: 8 }
      : template === "parchment"
      ? { background: "#fdf7ea", color: "#5a4326", border: `1.5px solid ${pal.accent}`, padding: `${compact ? "12px" : "16px"} 18px`, borderRadius: 10, boxShadow: `inset 0 0 40px rgba(201,162,75,0.18)` }
      : { background: pal.bg, color: pal.color, border: `2.5px solid ${pal.accent}`, padding: `${compact ? "12px" : "16px"} 18px`, borderRadius: pal.radius, boxShadow: template === "royal" || template === "wedding" ? `0 0 0 3px #fff, 0 0 0 4px ${pal.accent}44` : undefined }

  // التقسيم: وضع الضغط يفرض صفحتين (أو حسب maxPages) بحشو أضيق
  const partition = partitionExamQuestions(exam.questions, {
    maxPages: maxPages ?? (compact ? 2 : undefined),
    compact,
  })

  return (
    <div className="w-full max-w-full mx-auto space-y-6 print:space-y-0" dir="rtl" lang="ar" style={{ fontFamily }}>
      {partition.pages.map((page) => (
        <article
          key={page.pageNumber}
          className={`exam-paper exam-page exam-page-${page.pageNumber} ${
            page.totalPages === 1
              ? "exam-page-single"
              : page.isLastPage
              ? "exam-page-last"
              : "exam-page-middle"
          } relative font-arabic print:shadow-none flex flex-col justify-between w-full max-w-full box-border mx-auto ${compact ? "min-h-[250mm]" : "min-h-[270mm]"}`}
          dir="rtl"
          lang="ar"
          style={{ ...shellBase, fontFamily, width: "100%", maxWidth: "100%", boxSizing: "border-box" }}
        >
          {decorations && <PaperCornerOrnaments gradeName={gradeName} />}

          <div className="relative z-10 flex flex-col justify-between flex-1 w-full">
            {page.isFirstPage ? (
              <PaperHeader
                exam={exam}
                gradeName={gradeName}
                template={template}
                teacherName={teacher}
                schoolName={school}
                totalMarks={totalMarks}
              />
            ) : (
              <PageContinuationMiniBanner
                exam={exam}
                gradeName={gradeName}
                template={template}
                pageNumber={page.pageNumber}
                totalPages={page.totalPages}
              />
            )}

            <div className={`flex-1 flex flex-col w-full my-2 ${compact ? "justify-between gap-2" : "justify-around gap-3.5"}`}>
              {page.questions.map(({ question, globalIndex }) => (
                <QuestionBlock
                  key={question.id}
                  question={question}
                  index={globalIndex}
                  template={template}
                  gradeName={gradeName}
                  showDecorations={decorations}
                  compact={compact}
                />
              ))}
            </div>

            {exam.questions.length === 0 && (
              <p className="text-center text-sm opacity-60 py-8">لم تُضف أسئلة بعد</p>
            )}

            {page.isLastPage ? (
              <footer className="relative z-10 mt-auto pt-3 text-center border-t border-dashed border-current/25 w-full">
                <p className="text-[11px] opacity-70 mb-0.5 font-medium">انتهت الأسئلة</p>
                <p className="text-sm sm:text-base font-semibold text-gray-800 dark:text-gray-200">{sigLine}</p>
                <p className="text-base sm:text-lg font-extrabold mt-0.5 text-indigo-700 dark:text-indigo-300">{teacher}</p>
              </footer>
            ) : (
              <div className="relative z-10 mt-auto pt-2 text-center text-xs font-bold opacity-75 border-t border-dashed border-current/20 flex items-center justify-between w-full">
                <span className="text-[11px] whitespace-nowrap">الصفحة {page.pageNumber} من {page.totalPages}</span>
                <span className="text-[11px] font-semibold whitespace-nowrap">بقية الأسئلة في الصفحة التالية ⟵</span>
              </div>
            )}
          </div>
        </article>
      ))}
    </div>
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
                    : t.id === "royal"
                    ? "linear-gradient(90deg,#132a4a,#b8860b)"
                    : t.id === "parchment"
                    ? "linear-gradient(90deg,#7c5a2e,#f2c879)"
                    : t.id === "wedding"
                    ? "linear-gradient(90deg,#0b5d43,#d4af37)"
                    : t.id === "modern"
                    ? "linear-gradient(90deg,#1f2937,#ffffff)"
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

/** مبدّل قالب مضغوط للمعاينة الحيوية — يُغيّر القالب لتراه قبل الطباعة/التصدير */
export function TemplateSwitcher({
  value,
  onChange,
}: {
  value: ExamTemplateId
  onChange: (id: ExamTemplateId) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {EXAM_TEMPLATES.map(t => {
        const selected = value === t.id
        return (
          <button
            key={t.id}
            type="button"
            title={t.tagline}
            onClick={() => onChange(t.id)}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-bold transition-all ${
              selected
                ? "border-indigo-500 bg-indigo-600 text-white shadow-sm"
                : "border-gray-300 bg-white text-gray-700 hover:border-indigo-400 dark:bg-gray-900 dark:text-gray-200 dark:border-gray-700"
            }`}
          >
            <span
              className="h-3.5 w-3.5 rounded-full shrink-0"
              style={{ background: `linear-gradient(135deg, ${t.swatch[0]}, ${t.swatch[1]})` }}
            />
            {t.name}
          </button>
        )
      })}
    </div>
  )
}
