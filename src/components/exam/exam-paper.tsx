"use client"

import React from "react"
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
import { PaperCornerOrnaments, QuestionOrnaments, ScienceIcon } from "./science-ornaments"
import { TEACHER_NAME, TEACHER_SIGNATURE_LINE } from "@/lib/branding"

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
      className="inline-flex items-center justify-center min-w-[2.4rem] h-7 px-2 rounded-md text-[11px] font-extrabold text-white shadow-sm"
      style={{ background: meta.accent }}
    >
      {meta.paperMark}
    </span>
  )
}

function CompleteLine({ sq }: { sq: SubQuestion }) {
  const { before, after, atEnd } = renderCompleteParts(sq)
  const blank = (
    <span className="inline-block min-w-[7rem] border-b border-dotted border-current mx-1 align-baseline">
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
    <div className="exam-sub leading-8">
      {question.questionType === 1 && (
        <div>
          <p>
            <span className="font-bold">{index + 1} – </span>
            {sq.questionText}
          </p>
          <div className="flex flex-wrap gap-x-8 gap-y-1 pr-7 mt-1">
            {sq.choices?.map(choice => (
              <span key={choice.id}>
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
        <p>
          <span className="font-bold">{index + 1} – </span>
          {sq.questionText}{" "}
          <span className="inline-block w-10 text-center border border-current mx-1">( &nbsp; )</span>
        </p>
      )}
      {question.questionType === 4 && (
        <div>
          <p>
            <span className="font-bold">{index + 1} – </span>
            {sq.questionText}
          </p>
          {Array.from({ length: sq.answerLines || 2 }).map((_, li) => (
            <p key={li} className="pr-7 tracking-wider opacity-70">
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
          <p className="pr-7 tracking-wider opacity-70">{DOTS_LINE}</p>
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
      className="flex items-center justify-between gap-3 flex-wrap px-3 py-2"
      style={
        colorful
          ? {
              background:
                template === "explorer"
                  ? `${meta.accent}18`
                  : template === "lab"
                  ? "#0f766e14"
                  : template === "life"
                  ? "#16653414"
                  : "#1e1b4b14",
              borderBottom: `2px solid ${template === "explorer" ? meta.accent : "currentColor"}`,
            }
          : undefined
      }
    >
      <div className="flex items-center gap-2 flex-wrap">
        <TypeSeal question={question} />
        <h3 className="font-extrabold text-[15px] m-0">
          السؤال {ordinal}: {header}
        </h3>
      </div>
      <span className="text-xs font-bold opacity-80">({marks} درجة)</span>
    </div>
  )

  return (
    <section
      className="exam-q relative mb-5 overflow-hidden"
      style={{
        border:
          template === "classic"
            ? "1px solid #1e3a5f"
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
      <div className="relative z-[1] px-4 py-3 space-y-3">
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
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm mt-3">
      <p>
        اسم الطالب: <span className="inline-block min-w-[12rem] border-b border-dotted border-current" />
      </p>
      <p>
        الفصل / المجموعة: <span className="inline-block min-w-[8rem] border-b border-dotted border-current" />
      </p>
    </div>
  )
}

function PaperHeader({
  exam,
  gradeName,
  groupName,
  template,
  teacherName,
  schoolName,
  totalMarks,
}: {
  exam: Exam
  gradeName: string
  groupName?: string
  template: ExamTemplateId
  teacherName?: string
  schoolName?: string
  totalMarks: number
}) {
  const month = exam.month ? MONTHS[exam.month - 1] : ""
  const subtitle = [
    gradeName,
    groupName && groupName !== "الكل" ? groupName : null,
    exam.unit ? `الوحدة ${exam.unit}` : null,
  ]
    .filter(Boolean)
    .join("  •  ")

  if (template === "classic") {
    return (
      <header className="text-center border-[3px] border-double border-[#1e3a5f] p-4 mb-5">
        <p className="text-[11px] tracking-widest text-[#1e3a5f] mb-1">جمهورية مصر العربية — مادة العلوم</p>
        {schoolName && <p className="text-xs text-[#1e3a5f]">{schoolName}</p>}
        <h1 className="text-xl font-black text-[#1e3a5f] my-1">{exam.title}</h1>
        <p className="text-sm">{subtitle}</p>
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-1 text-xs mt-2 font-semibold text-[#1e3a5f]">
          {month && <span>شهر {month}</span>}
          <span>العام الدراسي {exam.academicYear}</span>
          {exam.duration ? <span>الزمن: {exam.duration} دقيقة</span> : null}
          <span>الدرجة: {totalMarks}</span>
        </div>
        {teacherName && <p className="text-xs mt-1">إعداد: {teacherName}</p>}
        <StudentFields />
      </header>
    )
  }

  if (template === "lab") {
    return (
      <header className="relative overflow-hidden rounded-xl border-2 border-teal-700 bg-gradient-to-l from-teal-50 to-cyan-50 p-4 mb-5 text-center">
        <div className="flex items-center justify-center gap-2 text-teal-800 text-xs font-bold mb-1">
          <ScienceIcon kind="microscope" size={18} />
          مختبر العلوم
          <ScienceIcon kind="flask" size={18} />
        </div>
        {schoolName && <p className="text-xs text-teal-700">{schoolName}</p>}
        <h1 className="text-xl font-black text-teal-900 my-1">{exam.title}</h1>
        <p className="text-sm text-teal-800">{subtitle}</p>
        <div className="flex flex-wrap justify-center gap-x-5 gap-y-1 text-xs mt-2 font-semibold text-teal-800">
          {month && <span>شهر {month}</span>}
          <span>{exam.academicYear}</span>
          {exam.duration ? <span>{exam.duration} دقيقة</span> : null}
          <span>{totalMarks} درجة</span>
        </div>
        {teacherName && <p className="text-xs mt-1 text-teal-700">إعداد: {teacherName}</p>}
        <StudentFields />
      </header>
    )
  }

  if (template === "life") {
    return (
      <header className="relative overflow-hidden rounded-xl border-2 border-green-700 bg-gradient-to-l from-green-50 to-emerald-50 p-4 mb-5 text-center">
        <div className="flex items-center justify-center gap-2 text-green-800 text-xs font-bold mb-1">
          <ScienceIcon kind="leaf" size={18} />
          عالم الحياة
          <ScienceIcon kind="flower" size={18} />
        </div>
        {schoolName && <p className="text-xs text-green-700">{schoolName}</p>}
        <h1 className="text-xl font-black text-green-900 my-1">{exam.title}</h1>
        <p className="text-sm text-green-800">{subtitle}</p>
        <div className="flex flex-wrap justify-center gap-x-5 gap-y-1 text-xs mt-2 font-semibold text-green-800">
          {month && <span>شهر {month}</span>}
          <span>{exam.academicYear}</span>
          {exam.duration ? <span>{exam.duration} دقيقة</span> : null}
          <span>{totalMarks} درجة</span>
        </div>
        {teacherName && <p className="text-xs mt-1 text-green-700">إعداد: {teacherName}</p>}
        <StudentFields />
      </header>
    )
  }

  if (template === "cosmos") {
    return (
      <header className="relative overflow-hidden rounded-xl border-2 border-[#c5a059] bg-[#1e1b4b] text-[#fde68a] p-4 mb-5 text-center">
        <div className="flex items-center justify-center gap-2 text-xs font-bold mb-1">
          <ScienceIcon kind="atom" size={18} color="#fde68a" />
          الطاقة والكون
          <ScienceIcon kind="planet" size={18} color="#fde68a" />
        </div>
        {schoolName && <p className="text-xs opacity-90">{schoolName}</p>}
        <h1 className="text-xl font-black my-1 text-white">{exam.title}</h1>
        <p className="text-sm">{subtitle}</p>
        <div className="flex flex-wrap justify-center gap-x-5 gap-y-1 text-xs mt-2 font-semibold">
          {month && <span>شهر {month}</span>}
          <span>{exam.academicYear}</span>
          {exam.duration ? <span>{exam.duration} دقيقة</span> : null}
          <span>{totalMarks} درجة</span>
        </div>
        {teacherName && <p className="text-xs mt-1">إعداد: {teacherName}</p>}
        <div className="text-[#fde68a]">
          <StudentFields />
        </div>
      </header>
    )
  }

  // explorer
  return (
    <header className="relative overflow-hidden rounded-2xl border-2 border-indigo-400 bg-gradient-to-l from-indigo-50 via-amber-50 to-emerald-50 p-4 mb-5 text-center">
      <div className="flex items-center justify-center gap-2 text-indigo-800 text-xs font-bold mb-1">
        <ScienceIcon kind="sun" size={18} />
        مستكشف العلوم
        <ScienceIcon kind="microscope" size={18} />
      </div>
      {schoolName && <p className="text-xs text-indigo-700">{schoolName}</p>}
      <h1 className="text-xl font-black text-indigo-950 my-1">{exam.title}</h1>
      <p className="text-sm text-indigo-800">{subtitle}</p>
      <div className="flex flex-wrap justify-center gap-x-5 gap-y-1 text-xs mt-2 font-semibold text-indigo-800">
        {month && <span>شهر {month}</span>}
        <span>{exam.academicYear}</span>
        {exam.duration ? <span>{exam.duration} دقيقة</span> : null}
        <span>{totalMarks} درجة</span>
      </div>
      {teacherName && <p className="text-xs mt-1 text-indigo-700">إعداد: {teacherName}</p>}
      <StudentFields />
    </header>
  )
}

export function ExamPaper({
  exam,
  gradeName,
  groupName,
  templateId,
  showDecorations,
  teacherName,
  schoolName,
}: ExamPaperProps) {
  const template: ExamTemplateId = templateId || exam.templateId || "classic"
  const decorations = showDecorations ?? exam.showDecorations !== false
  const teacher = teacherName ?? exam.teacherName
  const school = schoolName ?? exam.schoolName
  const totalMarks = exam.totalMarks || getExamTotalMarks(exam.questions)

  const shell: React.CSSProperties =
    template === "classic"
      ? { background: "#fff", color: "#111", border: "6px double #1e3a5f", padding: 20 }
      : template === "lab"
      ? { background: "#f7fffe", color: "#134e4a", border: "4px solid #0f766e", padding: 20, borderRadius: 16 }
      : template === "life"
      ? { background: "#f7fff9", color: "#14532d", border: "4px solid #166534", padding: 20, borderRadius: 16 }
      : template === "cosmos"
      ? { background: "#fafafe", color: "#1e1b4b", border: "4px solid #c5a059", padding: 20, borderRadius: 16 }
      : { background: "#fffefb", color: "#1e1b4b", border: "4px solid #6366f1", padding: 20, borderRadius: 20 }

  return (
    <article className="exam-paper relative font-arabic print:shadow-none" dir="rtl" lang="ar" style={shell}>
      {decorations && <PaperCornerOrnaments gradeName={gradeName} />}
      <div className="relative z-[1]">
        <PaperHeader
          exam={exam}
          gradeName={gradeName}
          groupName={groupName}
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

        <footer className="mt-6 pt-4 text-center border-t border-dashed">
          <p className="text-[11px] opacity-70 mb-2">انتهت الأسئلة</p>
          <p className="text-sm font-semibold">مع تمناتي لكم بالتوفيق والنجاح</p>
          <p className="text-base font-extrabold mt-0.5">أ/ ضحى العربي</p>
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
