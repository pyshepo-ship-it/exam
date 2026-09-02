import type { Exam, ExamAttemptAnswer } from "./data-storage"
import { gradeExam, type GradeResult } from "./exam-grade"

type AnswerSpec = {
  choiceId?: string
  text?: string
  isTrue?: boolean
}

/** إخفاء مفاتيح التصحيح عن واجهة الطالب — الاختبار الإلكتروني */
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

function computeExamHash(examId: string, createdAt: string, specJson: string): string {
  const seed = `exam-salt:${examId}:${createdAt}:${specJson}`
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

function encodeOpaque(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ""
  bytes.forEach(b => { bin += String.fromCharCode(b) })
  return btoa(bin).split("").reverse().join("")
}

function decodeOpaque(token: string): string {
  try {
    const bin = atob(token.split("").reverse().join(""))
    const bytes = Uint8Array.from(bin, ch => ch.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  } catch {
    return "{}"
  }
}

/** يغلف مفتاح التصحيح بختم رقمي حتى لا يظهر بجانب الخيارات ولا يمكن التلاعب به */
export function sealExamForStudent(exam: Exam): { view: Exam; token: string } {
  const spec = collectAnswerSpec(exam)
  const specJson = JSON.stringify(spec)
  const sig = computeExamHash(exam.id, exam.createdAt, specJson)
  const payload = JSON.stringify({
    eid: exam.id,
    ca: exam.createdAt,
    spec,
    sig,
  })
  return {
    view: stripExamAnswers(exam),
    token: encodeOpaque(payload),
  }
}

/**
 * فك ختم مفتاح التصحيح بعد انتهاء الاختبار (وضع atEnd) أو عند تفويض الإظهار
 * أثناء الاختبار (وضع afterEach — بقرار صريح من المعلم). يعيد spec بالمعرفات.
 */
export function decodeSealForReview(token: string, examId: string): Record<string, { choiceId?: string; text?: string; isTrue?: boolean }> {
  try {
    const bin = atob(token.split("").reverse().join(""))
    const bytes = Uint8Array.from(bin, ch => ch.charCodeAt(0))
    const envelope = JSON.parse(new TextDecoder().decode(bytes))
    if (!envelope || envelope.eid !== examId || !envelope.sig) return {}
    const specJson = JSON.stringify(envelope.spec)
    if (computeExamHash(envelope.eid, envelope.ca, specJson) !== envelope.sig) return {}
    return envelope.spec || {}
  } catch {
    return {}
  }
}

export function gradeSealedExam(
  view: Exam,
  token: string,
  answers: Record<string, ExamAttemptAnswer>
): GradeResult {
  let spec: Record<string, AnswerSpec> = {}
  try {
    const raw = decodeOpaque(token)
    const envelope = JSON.parse(raw)
    if (envelope && typeof envelope === "object" && envelope.eid && envelope.sig) {
      const specJson = JSON.stringify(envelope.spec)
      const expectedSig = computeExamHash(envelope.eid, envelope.ca, specJson)
      if (envelope.eid === view.id && envelope.sig === expectedSig) {
        spec = envelope.spec as Record<string, AnswerSpec>
      }
    } else if (envelope && typeof envelope === "object" && !envelope.eid) {
      spec = envelope as Record<string, AnswerSpec>
    }
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
