import type { Exam, ExamAttemptAnswer } from "./data-storage"
import { gradeExam, type GradeResult } from "./exam-grade"

type AnswerSpec = {
  choiceId?: string
  text?: string
  isTrue?: boolean
}

/** إخفاء مفاتيح التصحيح عن واجهة الطالب — الاختبار الإلكتروني ما زال تجريبياً */
export function stripExamAnswers(exam: Exam): Exam {
  return {
    ...exam,
    questions: (exam.questions || []).map(q => ({
      ...q,
      subQuestions: (q.subQuestions || []).map(sq => ({
        ...sq,
        correctAnswer: undefined,
        isTrue: undefined,
        choices: sq.choices?.map(c => ({ ...c, isCorrect: false })),
        corrections: sq.corrections?.map(c => ({ ...c, correctAnswer: "" })),
      })),
    })),
  }
}

function collectAnswerSpec(exam: Exam): Record<string, AnswerSpec> {
  const spec: Record<string, AnswerSpec> = {}
  for (const q of exam.questions || []) {
    for (const sq of q.subQuestions || []) {
      if (q.questionType === 1) {
        spec[sq.id] = { choiceId: sq.choices?.find(c => c.isCorrect)?.id }
      } else if (q.questionType === 2) {
        spec[sq.id] = { text: sq.correctAnswer }
      } else if (q.questionType === 3) {
        spec[sq.id] = { isTrue: sq.isTrue }
      } else if (q.questionType === 5) {
        spec[sq.id] = { text: sq.corrections?.[0]?.correctAnswer }
      } else if (q.questionType === 6 || q.questionType === 7 || q.questionType === 8) {
        spec[sq.id] = { text: sq.correctAnswer }
      }
    }
  }
  return spec
}

function applyAnswerSpec(exam: Exam, spec: Record<string, AnswerSpec>): Exam {
  return {
    ...exam,
    questions: (exam.questions || []).map(q => ({
      ...q,
      subQuestions: (q.subQuestions || []).map(sq => {
        const s = spec[sq.id]
        if (!s) return sq
        if (q.questionType === 1) {
          return {
            ...sq,
            choices: sq.choices?.map(c => ({ ...c, isCorrect: c.id === s.choiceId })),
          }
        }
        if (q.questionType === 2) return { ...sq, correctAnswer: s.text }
        if (q.questionType === 3) return { ...sq, isTrue: s.isTrue }
        if (q.questionType === 5) {
          return {
            ...sq,
            corrections: sq.corrections?.map(c => ({ ...c, correctAnswer: s.text || "" })),
          }
        }
        if (q.questionType === 6 || q.questionType === 7 || q.questionType === 8) {
          return { ...sq, correctAnswer: s.text }
        }
        return sq
      }),
    })),
  }
}

function encodeOpaque(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ""
  bytes.forEach(b => { bin += String.fromCharCode(b) })
  return btoa(bin).split("").reverse().join("")
}

function decodeOpaque(token: string): string {
  const bin = atob(token.split("").reverse().join(""))
  const bytes = Uint8Array.from(bin, ch => ch.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

/** يغلف مفتاح التصحيح حتى لا يظهر بجانب الخيارات في واجهة الطالب */
export function sealExamForStudent(exam: Exam): { view: Exam; token: string } {
  const spec = collectAnswerSpec(exam)
  return {
    view: stripExamAnswers(exam),
    token: encodeOpaque(JSON.stringify(spec)),
  }
}

export function gradeSealedExam(
  view: Exam,
  token: string,
  answers: Record<string, ExamAttemptAnswer>
): GradeResult {
  let spec: Record<string, AnswerSpec> = {}
  try {
    spec = JSON.parse(decodeOpaque(token)) as Record<string, AnswerSpec>
  } catch {
    spec = {}
  }
  return gradeExam(applyAnswerSpec(view, spec), answers)
}

/** بيانات القائمة العامة — بلا أسئلة حتى لا تُعرض الإجابات في الصفحة الرئيسية */
export function toPublicExamCard(exam: Exam): Exam {
  return {
    ...exam,
    questions: [],
  }
}
