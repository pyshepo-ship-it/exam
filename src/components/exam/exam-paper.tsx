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
    <span className="inline-block min-w-[5rem] sm:min-w-[6rem] border-b border-dotted border-current mx-1 align-baseline">
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
          <span className={w.underlined ? "underline decoration-2 underline-offset-3 font-bold" : undefined}>
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
    <div className="exam-sub text-[13px] sm:text-[14px] leading-relaxed">
      {question.questionType === 1 && (
        <div>
          <p className="font-medium text-right">
            <span className="font-bold">{index + 1} – </span>
            {sq.questionText}
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-0.5 pr-4 mt-0.5 text-xs sm:text-[13px]">
            {sq.choices?.map(choice => (
              <span key={choice.id} className="text-gray-800 dark:text-gray-200">
                {choice.choiceKey}{") "}{choice.choiceText}
              </span>
            ))}
          </div>
        </div>
      )}
      {question.questionType === 2 && (
        <p className="font-medium text-right">
          <span className="font-bold">{index + 1} – </span>
          <CompleteLine sq={sq} />
        </p>
      )}
      {question.questionType === 3 && (
        <div className="flex items-center justify-between gap-3 w-full py-0.5 flex-nowrap">
          <p className="min-w-0 flex-1 text-right text-[13px] sm:text-[14px] leading-snug break-words">
            <span className="font-bold">{index + 1} – </span>
            {sq.questionText}
          </p>
          <span className="shrink-0 whitespace-nowrap inline-flex items-center justify-center min-w-[3.4rem] h-6 px-1.5 text-xs font-bold border border-current/80 rounded tracking-widest text-center self-center">
            (&nbsp;&nbsp;&nbsp;&nbsp;)
          </span>
        </div>
      )}
      {question.questionType === 4 && (
        <div>
          <p className="font-medium text-right">
            <span className="font-bold">{index + 1} – </span>
            {sq.questionText}
          </p>
          {Array.from({ length: sq.answerLines || 2 }).map((_, li) => (
            <p key={li} className="pr-4 tracking-wider opacity-60 text-xs leading-5">
              {DOTS_LINE}
            </p>
          ))}
        </div>
      )}
      {question.questionType === 5 && (
        <div>
          <p className="font-medium text-right">
            <span className="font-bold">{index + 1} – </span>
            <CorrectionLine sq={sq} />
          </p>
          <p className="pr-4 tracking-wider opacity-60 text-xs leading-5">{DOTS_LINE}</p>
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
      className="relative z-10 flex items-center justify-between gap-2.5 px-3 py-1.5 w-full flex-nowrap"
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
              borderBottom: `1.5px solid ${template === "explorer" ? meta.accent : "currentColor"}`,
            }
          : undefined
      }
    >
      <div className="flex items-center gap-2 min-w-0 flex-1 flex-nowrap">
        <TypeSeal question={question} />
        <h3 className="font-extrabold text-sm sm:text-[14px] m-0 leading-tight min-w-0 break-words">
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
      className="exam-q relative mb-3 overflow-hidden w-full box-border"
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
            : `1.5px solid ${meta.accent}`,
        borderRadius: template === "classic" ? 0 : 8,
        background: "#fff",
      }}
    >
      {showDecorations && <QuestionOrnaments gradeName={gradeName} index={index} />}
      {headerEl}
      <div className="relative z-10 px-3 py-2 space-y-2">
        {question.subQuestions.map((sq, si) => (
          <React.Fragment key={sq.id}>
            {si > 0 && (
              <div
                className="h-px my-0.5"
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
  
  // الصف والشهر والعام الدراسي فقط
  const subtitle = [
    gradeName,
    month ? `شهر ${month}` : null,
    `العام الدراسي ${exam.academicYear}`,
  ]
    .filter(Boolean)
    .join("  •  ")

  if (template === "classic") {
    return (
      <header className="text-center border-2 border-double border-[#1e3a5f] p-2.5 sm:p-3 mb-3 rounded-lg w-full box-border">
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
      <header className="relative overflow-hidden rounded-xl border-2 border-teal-700 bg-gradient-to-l from-teal-50 to-cyan-50 p-2.5 sm:p-3 mb-3 text-center w-full box-border">
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
      <header className="relative overflow-hidden rounded-xl border-2 border-green-700 bg-gradient-to-l from-green-50 to-emerald-50 p-2.5 sm:p-3 mb-3 text-center w-full box-border">
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
      <header className="relative overflow-hidden rounded-xl border-2 border-[#c5a059] bg-[#1e1b4b] text-[#fde68a] p-2.5 sm:p-3 mb-3 text-center w-full box-border">
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

  // explorer
  return (
    <header className="relative overflow-hidden rounded-xl border-2 border-indigo-400 bg-gradient-to-l from-indigo-50 via-amber-50 to-emerald-50 p-2.5 sm:p-3 mb-3 text-center w-full box-border">
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

function PageTwoMiniBanner({
  exam,
  gradeName,
  template,
}: {
  exam: Exam
  gradeName: string
  template: ExamTemplateId
}) {
  return (
    <div
      className="relative z-10 flex items-center justify-between px-3 py-1.5 mb-2.5 rounded-lg border border-current/20 text-xs font-bold w-full box-border"
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
            : "#4f46e510",
      }}
    >
      <span className="truncate min-w-0">تابع: {exam.title}</span>
      <span className="opacity-80 shrink-0 px-2">{gradeName}</span>
      <span className="text-[11px] px-2 py-0.5 rounded bg-white/80 dark:bg-gray-900/80 border border-current/15 shrink-0 whitespace-nowrap">
        الصفحة ٢ من ٢
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

  const shellBase: React.CSSProperties =
    template === "classic"
      ? { background: "#fff", color: "#111", border: "4px double #1e3a5f", padding: "16px 18px" }
      : template === "lab"
      ? { background: "#f7fffe", color: "#134e4a", border: "2.5px solid #0f766e", padding: "16px 18px", borderRadius: 12 }
      : template === "life"
      ? { background: "#f7fff9", color: "#14532d", border: "2.5px solid #166534", padding: "16px 18px", borderRadius: 12 }
      : template === "cosmos"
      ? { background: "#fafafe", color: "#1e1b4b", border: "2.5px solid #c5a059", padding: "16px 18px", borderRadius: 12 }
      : { background: "#fffefb", color: "#1e1b4b", border: "2.5px solid #6366f1", padding: "16px 18px", borderRadius: 14 }

  // تقسيم الأسئلة بدقة على صفحتين دون قسمة أي سؤال
  const { page1Questions, page2Questions, isSinglePage } = partitionExamQuestions(exam.questions)

  // الامتحان في صفحة واحدة
  if (isSinglePage || page2Questions.length === 0) {
    return (
      <div className="w-full max-w-full mx-auto" dir="rtl" lang="ar">
        <article
          className="exam-paper exam-page exam-page-single relative font-arabic print:shadow-none flex flex-col justify-between w-full max-w-full box-border mx-auto"
          dir="rtl"
          lang="ar"
          style={{ ...shellBase, width: "100%", maxWidth: "100%", boxSizing: "border-box" }}
        >
          {decorations && <PaperCornerOrnaments gradeName={gradeName} />}
          <div className="relative z-10 flex-1 w-full">
            <PaperHeader
              exam={exam}
              gradeName={gradeName}
              template={template}
              teacherName={teacher}
              schoolName={school}
              totalMarks={totalMarks}
            />

            <div className="space-y-1 w-full">
              {page1Questions.map(({ question, globalIndex }) => (
                <QuestionBlock
                  key={question.id}
                  question={question}
                  index={globalIndex}
                  template={template}
                  gradeName={gradeName}
                  showDecorations={decorations}
                />
              ))}
            </div>

            {exam.questions.length === 0 && (
              <p className="text-center text-sm opacity-60 py-8">لم تُضف أسئلة بعد</p>
            )}
          </div>

          <footer className="relative z-10 mt-auto pt-3 text-center border-t border-dashed border-current/25 w-full">
            <p className="text-[11px] opacity-70 mb-0.5 font-medium">انتهت الأسئلة</p>
            <p className="text-sm sm:text-base font-semibold text-gray-800 dark:text-gray-200">{sigLine}</p>
            <p className="text-base sm:text-lg font-extrabold mt-0.5 text-indigo-700 dark:text-indigo-300">{teacher}</p>
          </footer>
        </article>
      </div>
    )
  }

  // الامتحان مقسم على صفحتين A4 بالضبط
  return (
    <div className="w-full max-w-full mx-auto space-y-6 print:space-y-0" dir="rtl" lang="ar">
      {/* الصفحة الأولى */}
      <article
        className="exam-paper exam-page exam-page-1 relative font-arabic print:shadow-none flex flex-col justify-between w-full max-w-full box-border mx-auto"
        dir="rtl"
        lang="ar"
        style={{ ...shellBase, width: "100%", maxWidth: "100%", boxSizing: "border-box" }}
      >
        {decorations && <PaperCornerOrnaments gradeName={gradeName} />}
        <div className="relative z-10 flex-1 w-full">
          <PaperHeader
            exam={exam}
            gradeName={gradeName}
            template={template}
            teacherName={teacher}
            schoolName={school}
            totalMarks={totalMarks}
          />

          <div className="space-y-1 w-full">
            {page1Questions.map(({ question, globalIndex }) => (
              <QuestionBlock
                key={question.id}
                question={question}
                index={globalIndex}
                template={template}
                gradeName={gradeName}
                showDecorations={decorations}
              />
            ))}
          </div>
        </div>

        <div className="relative z-10 mt-auto pt-2 text-center text-xs font-bold opacity-75 border-t border-dashed border-current/20 flex items-center justify-between w-full">
          <span className="text-[11px] whitespace-nowrap">الصفحة ١ من ٢</span>
          <span className="text-[11px] font-semibold whitespace-nowrap">بقية الأسئلة في الصفحة التالية ⟵</span>
        </div>
      </article>

      {/* الصفحة الثانية */}
      <article
        className="exam-paper exam-page exam-page-2 relative font-arabic print:shadow-none flex flex-col justify-between w-full max-w-full box-border mx-auto"
        dir="rtl"
        lang="ar"
        style={{ ...shellBase, width: "100%", maxWidth: "100%", boxSizing: "border-box" }}
      >
        {decorations && <PaperCornerOrnaments gradeName={gradeName} />}
        <div className="relative z-10 flex-1 w-full">
          <PageTwoMiniBanner exam={exam} gradeName={gradeName} template={template} />

          <div className="space-y-1 w-full">
            {page2Questions.map(({ question, globalIndex }) => (
              <QuestionBlock
                key={question.id}
                question={question}
                index={globalIndex}
                template={template}
                gradeName={gradeName}
                showDecorations={decorations}
              />
            ))}
          </div>
        </div>

        <footer className="relative z-10 mt-auto pt-2.5 text-center border-t border-dashed border-current/25 w-full">
          <p className="text-[11px] opacity-70 mb-0.5 font-medium">انتهت الأسئلة</p>
          <p className="text-sm sm:text-base font-semibold text-gray-800 dark:text-gray-200">{sigLine}</p>
          <p className="text-base sm:text-lg font-extrabold mt-0.5 text-indigo-700 dark:text-indigo-300">{teacher}</p>
        </footer>
      </article>
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
