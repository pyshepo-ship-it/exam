import type { Exam, ExamAttemptAnswer, SubQuestion } from "./data-storage"

export interface GradedItem {
  subQuestionId: string
  questionType: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
  auto: boolean
  correct: boolean
  marks: number
  awarded: number
}

export interface GradeResult {
  score: number
  autoTotal: number
  manualTotal: number
  percent: number
  details: GradedItem[]
}

export function normalizeAnswer(value: string): string {
  return (value || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[ًٌٍَُِّْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .toLowerCase()
}

function marksOf(sq: SubQuestion): number {
  return sq.marks > 0 ? sq.marks : 1
}

function textsMatch(a?: string, b?: string): boolean {
  if (!a || !b) return false
  return normalizeAnswer(a) === normalizeAnswer(b)
}

/** تصحيح تلقائي للأسئلة الموضوعية. المقال (نوع 4) يُستبعد من المجموع الآلي. */
export function gradeExam(
  exam: Exam,
  answers: Record<string, ExamAttemptAnswer>
): GradeResult {
  let score = 0
  let autoTotal = 0
  let manualTotal = 0
  const details: GradedItem[] = []

  for (const question of exam.questions || []) {
    for (const sq of question.subQuestions || []) {
      const marks = marksOf(sq)
      const ans = answers[sq.id] || {}
      let auto = false
      let correct = false

      if (question.questionType === 1) {
        auto = true
        const expected = sq.choices?.find(c => c.isCorrect)
        correct = Boolean(expected && ans.choiceId && expected.id === ans.choiceId)
      } else if (question.questionType === 2) {
        if (sq.correctAnswer && sq.correctAnswer.trim()) {
          auto = true
          correct = textsMatch(ans.text, sq.correctAnswer)
        }
      } else if (question.questionType === 3) {
        if (typeof sq.isTrue === "boolean") {
          auto = true
          correct = ans.isTrue === sq.isTrue
        }
      } else if (question.questionType === 5) {
        const expected = sq.corrections?.[0]?.correctAnswer
        if (expected && expected.trim()) {
          auto = true
          correct = textsMatch(ans.text, expected)
        }
      } else if (question.questionType === 6 || question.questionType === 7 || question.questionType === 8) {
        if (sq.correctAnswer && sq.correctAnswer.trim()) {
          auto = true
          correct = textsMatch(ans.text, sq.correctAnswer)
        }
      }

      if (auto) {
        autoTotal += marks
        const awarded = correct ? marks : 0
        score += awarded
        details.push({
          subQuestionId: sq.id,
          questionType: question.questionType,
          auto: true,
          correct,
          marks,
          awarded,
        })
      } else {
        manualTotal += marks
        details.push({
          subQuestionId: sq.id,
          questionType: question.questionType,
          auto: false,
          correct: false,
          marks,
          awarded: 0,
        })
      }
    }
  }

  return {
    score,
    autoTotal,
    manualTotal,
    percent: autoTotal > 0 ? (score / autoTotal) * 100 : 0,
    details,
  }
}

export function shouldPromoteToHonor(exam: Exam, result: GradeResult): boolean {
  if (!exam.autoHonorBoard) return false
  if (result.autoTotal <= 0) return false
  const min = exam.honorMinPercent ?? 100
  return result.percent + 1e-9 >= min
}
