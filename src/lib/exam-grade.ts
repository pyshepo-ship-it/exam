import {
  type Exam,
  type ExamAttemptAnswer,
  type ExamAttemptAnswerReview,
  type SubQuestion,
} from "./data-storage"

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
  // لا نغيّر طريقة تصحيح الاختبارات القديمة غير المصنفة؛ وجود النمط الصريح
  // فقط هو ما يجعل السؤال المقالي يدوياً حتماً حتى لو احتوى نموذج إجابة.
  const isOnline = exam.deliveryMode === "online" || (!exam.deliveryMode && exam.allowOnline === true)
  const onlineMode = isOnline && (
    exam.onlineExamMode === "objective" || exam.onlineExamMode === "essay" || exam.onlineExamMode === "mixed"
  ) ? exam.onlineExamMode : undefined

  for (const question of exam.questions || []) {
    for (const sq of question.subQuestions || []) {
      const marks = marksOf(sq)
      const ans = answers[sq.id] || {}
      let auto = false
      let correct = false

      const manualEssay = onlineMode && (
        question.questionType === 4 || question.questionType === 8 ||
        (onlineMode === "essay" && question.questionType !== 1 && question.questionType !== 3)
      )
      if (manualEssay) {
        // يضاف إلى المجموع اليدوي في الكتلة الموحدة أدناه.
      } else if (question.questionType === 1) {
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

export interface AttemptReviewItem extends GradedItem {
  review?: ExamAttemptAnswerReview
  /** الدرجة الفعلية بعد أي تدخل يدوي في هذا السؤال */
  effectiveAwarded: number
  /** لا تصبح النتيجة النهائية جاهزة قبل مراجعة هذا العنصر */
  pendingManualReview: boolean
}

export interface AttemptReviewSummary {
  autoScore: number
  autoTotal: number
  manualScore: number
  manualTotal: number
  score: number
  totalMarks: number
  pendingManualCount: number
  reviewedManualCount: number
  status: "pending_review" | "partially_reviewed" | "reviewed"
  details: AttemptReviewItem[]
}

function clampMarks(value: number, maximum: number): number {
  return Math.round(Math.min(maximum, Math.max(0, value)) * 100) / 100
}

/** الدرجة المقترحة عند الضغط على أزرار صحيح / نصف حل / خطأ. */
export function marksForReviewVerdict(
  verdict: NonNullable<ExamAttemptAnswerReview["verdict"]>,
  maximum: number
): number {
  if (verdict === "correct") return maximum
  if (verdict === "half") return Math.round((maximum / 2) * 100) / 100
  if (verdict === "incorrect") return 0
  return 0
}

/**
 * يجمع نتيجة التصحيح الآلي مع مراجعة المعلم لكل إجابة. هذا هو المصدر الوحيد
 * للدرجة النهائية في الاختبارات المقالية والمختلطة؛ تعديل الدرجة الكلية يبقى
 * طبقة استثنائية منفصلة للتوافق مع المحاولات القديمة.
 */
export function summarizeAttemptReview(
  exam: Exam,
  answers: Record<string, ExamAttemptAnswer>
): AttemptReviewSummary {
  const automatic = gradeExam(exam, answers)
  let autoScore = 0
  let autoTotal = 0
  let manualScore = 0
  let manualTotal = 0
  let pendingManualCount = 0
  let reviewedManualCount = 0

  const details: AttemptReviewItem[] = automatic.details.map(detail => {
    const review = answers[detail.subQuestionId]?.review
    const hasManualAward = typeof review?.awardedMarks === "number" && Number.isFinite(review.awardedMarks)
    const awarded = hasManualAward
      ? clampMarks(review!.awardedMarks!, detail.marks)
      : detail.awarded
    const pendingManualReview = !detail.auto && !hasManualAward

    if (detail.auto) {
      autoTotal += detail.marks
      autoScore += awarded
    } else {
      manualTotal += detail.marks
      if (hasManualAward) {
        manualScore += awarded
        reviewedManualCount += 1
      } else {
        pendingManualCount += 1
      }
    }

    return { ...detail, review, effectiveAwarded: awarded, pendingManualReview }
  })

  const status = pendingManualCount > 0
    ? reviewedManualCount > 0 ? "partially_reviewed" : "pending_review"
    : "reviewed"

  return {
    autoScore,
    autoTotal,
    manualScore,
    manualTotal,
    score: Math.round((autoScore + manualScore) * 100) / 100,
    totalMarks: Math.round((autoTotal + manualTotal) * 100) / 100,
    pendingManualCount,
    reviewedManualCount,
    status,
    details,
  }
}

export function shouldPromoteToHonor(exam: Exam, result: GradeResult): boolean {
  if (!exam.autoHonorBoard) return false
  if (result.autoTotal <= 0) return false
  const min = exam.honorMinPercent ?? 100
  return result.percent + 1e-9 >= min
}
