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

/** أنواع الأسئلة كما تظهر في الورقة الامتحانية المصرية للعلوم */
export const QUESTION_TYPES = [
  {
    id: 1 as const,
    label: "اختر الإجابة الصحيحة",
    short: "اختر",
    desc: "جمل فرعية، لكل منها 4 خيارات (أ، ب، ج، د) مع تحديد الإجابة الصحيحة",
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
    desc: "جمل مع سطر أو سطرين من النقاط لكتابة الإجابة",
    color: "from-amber-500 to-orange-600",
    badge: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
    border: "border-amber-300 dark:border-amber-800",
    accent: "#d97706",
    paperMark: "علل",
  },
  {
    id: 5 as const,
    label: "صحح ما تحته خط",
    short: "صحّح",
    desc: "جمل مع تحديد عدد الكلمات تحتها خط وخط النقاط للإجابة",
    color: "from-rose-500 to-pink-600",
    badge: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
    border: "border-rose-300 dark:border-rose-800",
    accent: "#e11d48",
    paperMark: "صحّح",
  },
]

export const QUESTION_BUTTONS: {
  type: 1 | 2 | 3 | 4 | 5
  label: string
  reasoningType?: "علل" | "بم تفسر" | "اذكر أهمية"
}[] = [
  { type: 1, label: "اختر الإجابة الصحيحة" },
  { type: 2, label: "أكمل" },
  { type: 3, label: "صح أو خطأ" },
  { type: 4, label: "علل لما يأتي", reasoningType: "علل" },
  { type: 4, label: "بم تفسر", reasoningType: "بم تفسر" },
  { type: 4, label: "اذكر أهمية", reasoningType: "اذكر أهمية" },
  { type: 5, label: "صحح ما تحته خط" },
]

export function getQuestionTypeMeta(type: 1 | 2 | 3 | 4 | 5) {
  return QUESTION_TYPES.find(t => t.id === type) || QUESTION_TYPES[0]
}

export const getQuestionHeader = (q: Question): string => {
  if (q.headerText && q.headerText.trim()) return q.headerText
  switch (q.questionType) {
    case 1: return "اختر الإجابة الصحيحة مما بين القوسين"
    case 2: return "أكمل العبارات الآتية"
    case 3: return "ضع علامة (√) أو (×)"
    case 4:
      if (q.reasoningType === "بم تفسر") return "بم تفسر:"
      if (q.reasoningType === "اذكر أهمية") return "اذكر أهمية:"
      return "علل لما يأتي:"
    case 5: return "صحح ما تحته خط"
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
  const n = (gradeName || "").replace(/أ/g, "ا").replace(/ى/g, "ي")
  if (/ثان/.test(n)) return "sec1"
  if (/اعداد|إعداد/.test(n)) return "prep"
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
  // الرابع: أجسام حية، شمس، ماء، نبات — منهج الاكتشاف
  g4: ["sun", "leaf", "flower", "droplet", "bug", "planet"],
  // الخامس: ميكروسكوب بسيط، مغناطيس، حرارة
  g5: ["microscope", "leaf", "magnet", "thermometer", "sun", "droplet"],
  // السادس: خلية، طاقة، أدوات معمل
  g6: ["microscope", "flask", "magnet", "zap", "thermometer", "leaf"],
  // إعدادي: ذرة، دورق، دائرة، حمض وقاعدة
  prep: ["flask", "atom", "microscope", "testTube", "zap", "magnet"],
  // أولى ثانوي: DNA، ذرة، معمل
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
  /** معاينة البطاقة */
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
  const start = corr && corr.wordPosition > 0 ? corr.wordPosition - 1 : 0
  const count = corr?.wordCount && corr.wordCount > 0 ? corr.wordCount : 1
  return words.map((word, i) => ({
    word,
    underlined: i >= start && i < start + count,
  }))
}
