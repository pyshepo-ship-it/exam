import type { ExamTemplateId, Question, SubQuestion } from "./data-storage"

export const ARABIC_ORDINALS = [
  "الأول", "الثاني", "الثالث", "الرابع", "الخامس",
  "السادس", "السابع", "الثامن", "التاسع", "العاشر",
  "الحادي عشر", "الثاني عشر",
]

export const DOTS_LINE = "................................................................"

export const MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
]

/** أنواع الأسئلة كما تظهر في الورقة الامتحانية المصرية للعلوم والمواد التعليمية */
export const QUESTION_TYPES = [
  {
    id: 1 as const,
    label: "اختر الإجابة الصحيحة",
    short: "اختر",
    desc: "جمل فرعية، لكل منها 4 خيارات (أ، ب، ج، د) مع مسافات واسعة",
    color: "from-indigo-500 to-blue-600",
    badge: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200",
    border: "border-indigo-300 dark:border-indigo-800",
    accent: "#4f46e5",
    paperMark: "اختر",
  },
  {
    id: 2 as const,
    label: "أكمل",
    short: "أكمل",
    desc: "جمل مقسومة لجزأين والفراغ في المنتصف أو في النهاية",
    color: "from-teal-500 to-cyan-600",
    badge: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200",
    border: "border-teal-300 dark:border-teal-800",
    accent: "#0d9488",
    paperMark: "أكمل",
  },
  {
    id: 3 as const,
    label: "صح أو خطأ",
    short: "√ / ×",
    desc: "جمل يضع الطالب أمامها (√) أو (×)",
    color: "from-emerald-500 to-green-600",
    badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
    border: "border-emerald-300 dark:border-emerald-800",
    accent: "#059669",
    paperMark: "√ ×",
  },
  {
    id: 4 as const,
    label: "علل / بم تفسر / اذكر أهمية",
    short: "علل",
    desc: "جمل مع أسطر نقاط مريحة لكتابة الإجابة (افتراضياً سطر واحد)",
    color: "from-amber-500 to-orange-600",
    badge: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
    border: "border-amber-300 dark:border-amber-800",
    accent: "#d97706",
    paperMark: "علل",
  },
  {
    id: 5 as const,
    label: "صوب ما تحته خط",
    short: "صوّب",
    desc: "تحديد الكلمات بالضغط المباشر وسطر للإجابة الصحيحة",
    color: "from-rose-500 to-pink-600",
    badge: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
    border: "border-rose-300 dark:border-rose-800",
    accent: "#e11d48",
    paperMark: "صوّب",
  },
  {
    id: 6 as const,
    label: "المصطلح العلمي",
    short: "مصطلح",
    desc: "اكتب المصطلح العلمي الدال على العبارة مع سطر للإجابة",
    color: "from-cyan-500 to-blue-600",
    badge: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200",
    border: "border-cyan-300 dark:border-cyan-800",
    accent: "#0284c7",
    paperMark: "مصطلح",
  },
  {
    id: 7 as const,
    label: "ما المقصود بـ / التعريفات",
    short: "تعريف",
    desc: "ما المقصود أو اكتب تعريف كل مما يأتي مع أسطر نقاط",
    color: "from-violet-500 to-purple-600",
    badge: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
    border: "border-violet-300 dark:border-violet-800",
    accent: "#7c3aed",
    paperMark: "تعريف",
  },
  {
    id: 8 as const,
    label: "سؤال حر / مخصص",
    short: "سؤال حر",
    desc: "اكتب رأس السؤال بحرية (مثل: قارن بين / ماذا يحدث عند / أجب عن الآتي)",
    color: "from-fuchsia-500 to-pink-600",
    badge: "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-950 dark:text-fuchsia-200",
    border: "border-fuchsia-300 dark:border-fuchsia-800",
    accent: "#c026d3",
    paperMark: "سؤال حر",
  },
]

export const QUESTION_BUTTONS: {
  type: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
  label: string
  reasoningType?: "علل" | "بم تفسر" | "اذكر أهمية"
}[] = [
  { type: 1, label: "اختر الإجابة الصحيحة" },
  { type: 2, label: "أكمل العبارات" },
  { type: 3, label: "صح أو خطأ" },
  { type: 4, label: "علل لما يأتي", reasoningType: "علل" },
  { type: 4, label: "بم تفسر", reasoningType: "بم تفسر" },
  { type: 4, label: "اذكر أهمية", reasoningType: "اذكر أهمية" },
  { type: 6, label: "المصطلح العلمي" },
  { type: 7, label: "ما المقصود بـ (التعريف)" },
  { type: 5, label: "صوب ما تحته خط" },
  { type: 8, label: "سؤال حر (عنوان مخصص)" },
]

export function getQuestionTypeMeta(type: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8) {
  return QUESTION_TYPES.find(t => t.id === type) || QUESTION_TYPES[0]
}

export const getQuestionHeader = (q: Question): string => {
  // في السؤال المقالي الإلكتروني، الوسم اختياري ولا يخلق نوع سؤال جديداً.
  if (q.questionType === 8 && q.essayLabel?.trim()) {
    const instruction = q.headerText?.trim()
    return instruction ? `${q.essayLabel.trim()}: ${instruction}` : `${q.essayLabel.trim()}:`
  }
  if (q.headerText && q.headerText.trim()) return q.headerText.trim()
  switch (q.questionType) {
    case 1: return "اختر الإجابة الصحيحة مما بين القوسين"
    case 2: return "أكمل العبارات الآتية"
    case 3: return "ضع علامة (√) أو (×)"
    case 4:
      if (q.reasoningType === "بم تفسر") return "بم تفسر:"
      if (q.reasoningType === "اذكر أهمية") return "اذكر أهمية:"
      return "علل لما يأتي:"
    case 5: return "صوب ما تحته خط"
    case 6: return "اكتب المصطلح العلمي الدال على كل عبارة مما يأتي:"
    case 7: return "ما المقصود بكل مما يأتي:"
    case 8: return "أجب عن الأسئلة الآتية:"
    default: return ""
  }
}

export function getQuestionMarks(q: Question): number {
  return q.subQuestions.reduce((s, sq) => s + (sq.marks || 1), 0)
}

export function getExamTotalMarks(questions: Question[]): number {
  return questions.reduce((s, q) => s + getQuestionMarks(q), 0)
}

/** شريحة الصف لتحديد الزخارف العلمية المناسبة للمنهج المصري */
export type GradeBand = "g4" | "g5" | "g6" | "prep" | "sec1" | "other"

export function detectGradeBand(gradeName: string): GradeBand {
  const n = (gradeName || "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
  if (/اعداد/.test(n)) return "prep"
  if (/ثانوي/.test(n)) return "sec1"
  if (/رابع/.test(n)) return "g4"
  if (/خامس/.test(n)) return "g5"
  if (/سادس/.test(n)) return "g6"
  return "other"
}

export type OrnamentKind =
  | "microscope"
  | "flask"
  | "testTube"
  | "atom"
  | "dna"
  | "leaf"
  | "sun"
  | "planet"
  | "magnet"
  | "droplet"
  | "zap"
  | "flower"
  | "thermometer"
  | "brain"
  | "bug"

const BAND_ORNAMENTS: Record<GradeBand, OrnamentKind[]> = {
  g4: ["sun", "leaf", "flower", "droplet", "bug", "planet"],
  g5: ["microscope", "leaf", "magnet", "thermometer", "sun", "droplet"],
  g6: ["microscope", "flask", "magnet", "zap", "thermometer", "leaf"],
  prep: ["flask", "atom", "microscope", "testTube", "zap", "magnet"],
  sec1: ["atom", "dna", "flask", "microscope", "testTube", "brain"],
  other: ["microscope", "flask", "atom", "leaf", "sun", "magnet"],
}

export function getOrnamentsForGrade(gradeName: string): OrnamentKind[] {
  return BAND_ORNAMENTS[detectGradeBand(gradeName)]
}

export const ORNAMENT_COLORS: Record<OrnamentKind, string> = {
  microscope: "#0d9488",
  flask: "#7c3aed",
  testTube: "#2563eb",
  atom: "#4f46e5",
  dna: "#db2777",
  leaf: "#16a34a",
  sun: "#f59e0b",
  planet: "#0284c7",
  magnet: "#dc2626",
  droplet: "#06b6d4",
  zap: "#eab308",
  flower: "#ec4899",
  thermometer: "#f97316",
  brain: "#8b5cf6",
  bug: "#65a30d",
}

export interface ExamTemplateDef {
  id: ExamTemplateId
  name: string
  tagline: string
  bestFor: string
  swatch: string[]
  previewClass: string
}

export const EXAM_TEMPLATES: ExamTemplateDef[] = [
  {
    id: "classic",
    name: "الوزاري الكلاسيكي",
    tagline: "ورقة رسمية بحدود مزدوجة وحقول الطالب",
    bestFor: "كل الصفوف — Closest to official Egyptian papers",
    swatch: ["#1e3a5f", "#c5a059", "#ffffff"],
    previewClass: "from-slate-800 to-navy-900",
  },
  {
    id: "lab",
    name: "المختبر العلمي",
    tagline: "دورق وميكروسكوب وإطار معملي",
    bestFor: "الإعدادي والأول الثانوي",
    swatch: ["#0f766e", "#14b8a6", "#ecfeff"],
    previewClass: "from-teal-700 to-cyan-600",
  },
  {
    id: "life",
    name: "عالم الحياة",
    tagline: "نبات وخلية وDNA بدرجات الأخضر",
    bestFor: "الرابع حتى الإعدادي (أحياء)",
    swatch: ["#166534", "#22c55e", "#f0fdf4"],
    previewClass: "from-green-800 to-emerald-500",
  },
  {
    id: "cosmos",
    name: "الطاقة والكون",
    tagline: "ذرة وكواكب بذهبي وكحلي",
    bestFor: "السادس والإعدادي والثانوي",
    swatch: ["#1e1b4b", "#c5a059", "#312e81"],
    previewClass: "from-indigo-950 to-violet-700",
  },
  {
    id: "explorer",
    name: "المستكشف الصغير",
    tagline: "ملوّن ومبهج مع شارة لكل نوع سؤال",
    bestFor: "الرابع والخامس والسادس الابتدائي",
    swatch: ["#4f46e5", "#f59e0b", "#10b981"],
    previewClass: "from-indigo-500 via-amber-400 to-emerald-500",
  },
]

export function getTemplate(id?: ExamTemplateId): ExamTemplateDef {
  return EXAM_TEMPLATES.find(t => t.id === id) || EXAM_TEMPLATES[0]
}

/** جملة «أكمل» للمعاينة والورقة */
export function renderCompleteParts(sq: SubQuestion): { before: string; after: string; atEnd: boolean } {
  const parts = sq.parts || []
  if (parts.length >= 2) {
    return {
      before: parts[0].partText || "",
      after: parts[1].partText || "",
      atEnd: parts[1].blankPosition === "after",
    }
  }
  return { before: sq.questionText || "", after: "", atEnd: true }
}

/** كلمات الجملة مع تحديد ما تحته خط */
export function getUnderlinedWords(sq: SubQuestion): { word: string; underlined: boolean }[] {
  const words = (sq.questionText || "").split(/\s+/).filter(Boolean)
  const corr = sq.corrections?.[0]
  const start = corr && corr.wordPosition > 0 ? corr.wordPosition - 1 : -1
  const count = corr?.wordCount && corr.wordCount > 0 ? corr.wordCount : 1
  return words.map((word, i) => ({
    word,
    underlined: start >= 0 && i >= start && i < start + count,
  }))
}

/** هيكل صفحة الامتحان الموزعة */
export interface ExamPagePartition {
  pageNumber: number
  totalPages: number
  isFirstPage: boolean
  isLastPage: boolean
  questions: { question: Question; globalIndex: number }[]
}

/**
 * تقسيم أسئلة الامتحان ديناميكياً على الصفحات
 * - يدعم صفحة واحدة، صفحتين، 3 صفحات أو أكثر تلقائياً بحسب عدد وحجم الأسئلة
 * - لا يتم شطر أي سؤال رئيسي بين صفحتين نهائياً
 * - يحزم الأسئلة بذكاء لملء كل صفحة بأكبر عدد ممكن من الأسئلة الكاملة
 */
export interface ExamPartition {
  pages: ExamPagePartition[]
  totalPages: number
  isSinglePage: boolean
  page1Questions: { question: Question; globalIndex: number }[]
  page2Questions: { question: Question; globalIndex: number }[]
}

export function partitionExamQuestions(questions: Question[]): ExamPartition {
  const n = questions.length
  if (n === 0) {
    return {
      pages: [],
      totalPages: 1,
      isSinglePage: true,
      page1Questions: [],
      page2Questions: [],
    }
  }

  // تقدير وزن/ارتفاع السؤال بوحدات تقريبية دقيقة
  const getQWeight = (q: Question): number => {
    const base = 48
    const subCount = q.subQuestions.length || 1
    let subWeight = 34
    if (q.questionType === 1) subWeight = 42 // MCQ مع خيارات ومسافات واسعة
    if (q.questionType === 4 || q.questionType === 6 || q.questionType === 7 || q.questionType === 8) {
      subWeight = 28 + (q.subQuestions[0]?.answerLines ?? 1) * 16 // أسئلة أسطر النقاط
    }
    if (q.questionType === 5) subWeight = 36 // تصحيح
    return base + subCount * subWeight
  }

  const weights = questions.map(getQWeight)
  const totalQuestionsWeight = weights.reduce((a, b) => a + b, 0)

  // سعة الصفحة الأولى (مع احتساب الترويسة الرئيسية وحقول الطالب)
  const PAGE1_MAX_CAPACITY = 600
  // سعة الصفحات التالية (مع الترويسة المصغرة فقط)
  const SUBSEQUENT_PAGE_MAX_CAPACITY = 680
  // أقصى وزن للامتحان المكون من صفحة واحدة فقط
  const SINGLE_PAGE_MAX_WEIGHT = 380

  if (n <= 2 && totalQuestionsWeight <= SINGLE_PAGE_MAX_WEIGHT) {
    const singleQuestions = questions.map((q, i) => ({ question: q, globalIndex: i }))
    const singlePage: ExamPagePartition = {
      pageNumber: 1,
      totalPages: 1,
      isFirstPage: true,
      isLastPage: true,
      questions: singleQuestions,
    }
    return {
      pages: [singlePage],
      totalPages: 1,
      isSinglePage: true,
      page1Questions: singleQuestions,
      page2Questions: [],
    }
  }

  // إذا كان الامتحان 3 أسئلة وتجاوز حد الصفحة الواحدة، نقسمه على صفحتين (2 في الأولى و1 في الثانية)
  if (n === 3 && totalQuestionsWeight > SINGLE_PAGE_MAX_WEIGHT) {
    const p1 = questions.slice(0, 2).map((q, i) => ({ question: q, globalIndex: i }))
    const p2 = questions.slice(2).map((q, i) => ({ question: q, globalIndex: 2 + i }))
    const pages: ExamPagePartition[] = [
      { pageNumber: 1, totalPages: 2, isFirstPage: true, isLastPage: false, questions: p1 },
      { pageNumber: 2, totalPages: 2, isFirstPage: false, isLastPage: true, questions: p2 },
    ]
    return {
      pages,
      totalPages: 2,
      isSinglePage: false,
      page1Questions: p1,
      page2Questions: p2,
    }
  }

  // توزيع ذكي ديناميكي على عدد الصفحات المناسب (صفحتين، 3 صفحات أو أكثر)
  const rawPages: { question: Question; globalIndex: number }[][] = []
  let currentPage: { question: Question; globalIndex: number }[] = []
  let currentCapacity = 0

  for (let i = 0; i < n; i++) {
    const q = questions[i]
    const w = weights[i]
    const maxCapacity = rawPages.length === 0 ? PAGE1_MAX_CAPACITY : SUBSEQUENT_PAGE_MAX_CAPACITY

    if (currentPage.length === 0) {
      currentPage.push({ question: q, globalIndex: i })
      currentCapacity = w
    } else if (currentCapacity + w <= maxCapacity) {
      currentPage.push({ question: q, globalIndex: i })
      currentCapacity += w
    } else {
      rawPages.push(currentPage)
      currentPage = [{ question: q, globalIndex: i }]
      currentCapacity = w
    }
  }

  if (currentPage.length > 0) {
    rawPages.push(currentPage)
  }

  const totalPages = rawPages.length
  const pages: ExamPagePartition[] = rawPages.map((pageQuestions, idx) => ({
    pageNumber: idx + 1,
    totalPages,
    isFirstPage: idx === 0,
    isLastPage: idx === totalPages - 1,
    questions: pageQuestions,
  }))

  const p1 = pages[0]?.questions || []
  const p2 = pages[1]?.questions || []

  return {
    pages,
    totalPages,
    isSinglePage: totalPages === 1,
    page1Questions: p1,
    page2Questions: p2,
  }
}
