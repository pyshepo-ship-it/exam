// ============================================================
// توليد وطباعة الجدول الأسبوعي كملف PDF (A4)
//
//  • وضع "teacher": النسخة التفصيلية الخاصة بالمدرس — تتضمن كل بيانات
//    كل مجموعة (الأيام، الوقت، السعر، عدد الطلاب، أسماء الطلاب،
//    أرقام الهواتف، الحالة، الأرصدة) + جدول ملخص عام.
//
//  • وضع "student": نسخة الطلاب — المواعيد فقط (الصف، المجموعة،
//    الأيام، الوقت) بدون أي أسعار أو أسماء طلاب أو أرقام هواتف.
//
// الصفحات تُقسَّم تلقائياً بمقارنة الارتفاع الفعلي لكل كتلة
// (قياس حقيقي في المتصفح) حتى لا يُقطع أي محتوى بين الصفحات.
// ============================================================

import { Grade, Student, getStudents, getStoredAcademicYear, getDues, getPayments } from "./data-storage"
import { getTeacherName, getTeacherSignatureLine } from "./branding"
import { formatTime12 } from "./utils"
import { exportToPDF, printElement } from "./pdf-utils"

const PAGE_W = 794 // A4 عند 96dpi
const PAGE_H = 1123
const PAD_X = 40
const PAD_Y = 34
/** ميزانية ارتفاع المحتوى داخل الصفحة (مع ترك مساحة للتذييل) */
const CONTENT_BUDGET = PAGE_H - PAD_Y * 2 - 46

const FONT = "'Cairo','Segoe UI',Tahoma,Arial,sans-serif"

export interface SchedulePrintOptions {
  mode: "teacher" | "student"
  grades: Grade[]
  /** تُستخدم في النسخة التفصيلية فقط — إن لم تُمرَّر تُجلب من التخزين */
  students?: Student[]
  teacherName?: string
  signatureLine?: string
  academicYear?: string
}

// ------------------------------------------------------------
// أدوات مساعدة
// ------------------------------------------------------------

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

const AR_DAYS_ORDER = ["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"]

function sortDays(days: string[]): string[] {
  return [...days].sort((a, b) => AR_DAYS_ORDER.indexOf(a) - AR_DAYS_ORDER.indexOf(b))
}

function daysLabel(days: string[]): string {
  return sortDays(days).join("، ")
}

function timeRange(start: string, end: string): string {
  if (!start || !end) return "—"
  return `${formatTime12(start)} - ${formatTime12(end)}`
}

function money(n: number): string {
  return `${Number(n || 0).toLocaleString("ar-EG")} ج.م`
}

/** حساب رصيد كل طالب مرة واحدة (بدل إعادة قراءة التخزين لكل طالب) */
function buildBalanceMap(students: Student[]): Map<string, number> {
  const balances = new Map<string, number>()
  if (typeof window === "undefined") return balances
  const dues = getDues()
  const payments = getPayments()
  for (const s of students) balances.set(s.id, 0)
  for (const d of dues) {
    balances.set(d.studentId, (balances.get(d.studentId) || 0) + d.amount)
  }
  for (const p of payments) {
    balances.set(p.studentId, (balances.get(p.studentId) || 0) - p.amount)
  }
  return balances
}

function balanceLabel(balance: number): { text: string; color: string } {
  if (balance > 0) return { text: `مستحق ${money(balance)}`, color: "#b91c1c" }
  if (balance < 0) return { text: `دفع زائد ${money(Math.abs(balance))}`, color: "#047857" }
  return { text: "مسدد", color: "#374151" }
}

const AR_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
]

function todayLabel(): string {
  const now = new Date()
  return `${AR_MONTHS[now.getMonth()]} ${now.getDate()}، ${now.getFullYear()}`
}

// ------------------------------------------------------------
// كتل HTML (كل كتلة تُقاس ثم تُوزَّع على الصفحات)
// ------------------------------------------------------------

export interface Block {
  html: string
}

function pageHeaderBlock(mode: "teacher" | "student", opts: SchedulePrintOptions): Block {
  const isTeacher = mode === "teacher"
  const accent = isTeacher ? "#4f46e5" : "#059669"
  const badge = isTeacher
    ? `<span style="display:inline-block;background:#eef2ff;color:#4338ca;border:1px solid #c7d2fe;border-radius:999px;padding:4px 14px;font-size:12px;font-weight:700;">نسخة تفصيلية خاصة بالمدرس — تتضمن الأسعار والأسماء والأرصدة</span>`
    : `<span style="display:inline-block;background:#ecfdf5;color:#047857;border:1px solid #a7f3d0;border-radius:999px;padding:4px 14px;font-size:12px;font-weight:700;">جدول مواعيد الطلاب</span>`

  return {
    html: `
      <div style="margin-bottom:18px;">
        <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:4px solid ${accent};padding-bottom:14px;">
          <div>
            <div style="font-size:26px;font-weight:800;color:#111827;">
              ${isTeacher ? "الجدول الأسبوعي التفصيلي للمجموعات" : "جدول المواعيد الأسبوعي"}
            </div>
            <div style="font-size:13px;color:#6b7280;margin-top:6px;">
              العام الدراسي ${esc(opts.academicYear || getStoredAcademicYear())} — أُنشئ في ${todayLabel()}
            </div>
          </div>
          <div style="text-align:center;">
            <div style="width:56px;height:56px;border-radius:16px;background:${accent};color:#ffffff;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:800;margin:0 auto;">
              ${esc((opts.teacherName || getTeacherName()).replace(/^(أ\.|أ\/)\s*/, ""))}
            </div>
            <div style="font-size:13px;font-weight:800;color:#111827;margin-top:6px;">${esc(opts.teacherName || getTeacherName())}</div>
          </div>
        </div>
        <div style="margin-top:10px;">${badge}</div>
      </div>
    `,
  }
}

/**
 * جدول الملخص العام — لكل المجموعات في كل الصفوف (نسخة المدرس).
 * يُقسَّم على دفعات صفوف حتى لا يتجاوز أي كتلة ارتفاع صفحة A4.
 */
function summaryTableBlocks(grades: Grade[]): Block[] {
  const rows: string[] = []
  let totalMonthly = 0
  let totalStudents = 0

  for (const grade of grades) {
    for (const g of grade.groups) {
      const count = g.studentsCount || 0
      totalMonthly += (g.monthlyFee || 0) * count
      totalStudents += count
      rows.push(`
        <tr>
          <td style="${TD}text-align:right;">${esc(grade.name)}</td>
          <td style="${TD}text-align:right;font-weight:700;">${esc(g.name)}</td>
          <td style="${TD}">${esc(daysLabel(g.days))}</td>
          <td style="${TD}white-space:nowrap;">${esc(timeRange(g.startTime, g.endTime))}</td>
          <td style="${TD}white-space:nowrap;">${esc(money(g.monthlyFee))}</td>
          <td style="${TD}">${count}</td>
          <td style="${TD}white-space:nowrap;font-weight:700;">${esc(money((g.monthlyFee || 0) * count))}</td>
        </tr>
      `)
    }
  }

  if (rows.length === 0) return []

  const totalsRow = `
    <tr style="background:#eef2ff;font-weight:800;">
      <td style="${TD}" colspan="5">الإجمالي العام</td>
      <td style="${TD}">${totalStudents}</td>
      <td style="${TD}">${esc(money(totalMonthly))}</td>
    </tr>
  `

  // دفعات من 16 صفاً — رأس الجدول يتكرر في كل دفعة، والإجمالي في الأخيرة
  const CHUNK = 16
  const chunks: string[][] = []
  for (let i = 0; i < rows.length; i += CHUNK) {
    chunks.push(rows.slice(i, i + CHUNK))
  }

  return chunks.map((rowsChunk, ci) => ({
    html: `
      <div style="margin-bottom:16px;">
        ${ci === 0 ? `<div style="font-size:17px;font-weight:800;color:#111827;margin-bottom:8px;">📋 ملخص جميع المجموعات</div>` : ""}
        <table style="${TABLE}">${SUMMARY_HEAD}${rowsChunk.join("")}${ci === chunks.length - 1 ? totalsRow : ""}</table>
      </div>
    `,
  }))
}

const TABLE = `width:100%;border-collapse:collapse;font-size:12.5px;color:#1f2937;`
const TH = `padding:8px 8px;border:1px solid #c7d2fe;font-size:12.5px;font-weight:800;background:#4f46e5;color:#ffffff;`
const TD = `padding:7px 8px;border:1px solid #e5e7eb;`

/** رأس جدول الملخص (يتكرر في كل دفعة) */
const SUMMARY_HEAD = `
  <tr style="background:#4f46e5;color:#ffffff;">
    <th style="${TH}text-align:right;">الصف</th>
    <th style="${TH}text-align:right;">المجموعة</th>
    <th style="${TH}">الأيام</th>
    <th style="${TH}">الوقت</th>
    <th style="${TH}">السعر الشهري</th>
    <th style="${TH}">عدد الطلاب</th>
    <th style="${TH}">الإجمالي الشهري</th>
  </tr>
`

/** بطاقة مجموعة تفصيلية (نسخة المدرس) — معرّفة على دفعات طلاب */
function groupDetailBlocks(
  grade: Grade,
  group: Grade["groups"][number],
  students: Student[],
  balances: Map<string, number>
): Block[] {
  const groupStudents = students.filter(
    s => s.groupId === group.id && grade.groups.some(g => g.id === s.groupId)
  )
  const activeCount = groupStudents.filter(s => s.status === "active").length
  const expected = (group.monthlyFee || 0) * groupStudents.filter(s => s.status !== "inactive").length

  const meta = `
    <div style="border:2px solid #c7d2fe;border-radius:14px;overflow:hidden;margin-bottom:14px;page-break-inside:avoid;">
      <div style="background:linear-gradient(90deg,#4f46e5,#6366f1);color:#ffffff;padding:10px 14px;display:flex;align-items:center;justify-content:space-between;">
        <div style="font-size:15px;font-weight:800;">
          ${esc(grade.name)} — ${esc(group.name)}
        </div>
        <div style="font-size:12.5px;font-weight:700;">${esc(timeRange(group.startTime, group.endTime))}</div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;padding:10px 14px;background:#f8fafc;font-size:12px;">
        <span style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:999px;padding:3px 10px;font-weight:700;color:#4338ca;">📅 ${esc(daysLabel(group.days))}</span>
        <span style="background:#fefce8;border:1px solid #fde68a;border-radius:999px;padding:3px 10px;font-weight:700;color:#a16207;">💰 السعر الشهري: ${esc(money(group.monthlyFee))}</span>
        <span style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:999px;padding:3px 10px;font-weight:700;color:#047857;">👥 ${groupStudents.length} طالب (${activeCount} نشط)</span>
        <span style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:999px;padding:3px 10px;font-weight:700;color:#6d28d9;">📊 المتوقع شهرياً: ${esc(money(expected))}</span>
      </div>
    </div>
  `

  if (groupStudents.length === 0) {
    return [
      {
        html: meta + `<div style="color:#9ca3af;font-size:12px;margin:-6px 0 14px;padding:0 4px;">لا يوجد طلاب مسجلون في هذه المجموعة بعد.</div>`,
      },
    ]
  }

  // تقسيم جدول الطلاب على دفعات حتى لا تتجاوز الكتلة ارتفاع الصفحة
  const CHUNK = 14
  const chunks: Student[][] = []
  for (let i = 0; i < groupStudents.length; i += CHUNK) {
    chunks.push(groupStudents.slice(i, i + CHUNK))
  }

  const studentsTable = (rows: Student[], startIndex: number, withHead: boolean) => `
    <table style="${TABLE}margin-bottom:14px;">
      ${withHead ? `
      <tr style="background:#6366f1;color:#ffffff;">
        <th style="${TH}width:34px;">#</th>
        <th style="${TH}text-align:right;">اسم الطالب</th>
        <th style="${TH}">رقم الهاتف</th>
        <th style="${TH}">الحالة</th>
        <th style="${TH}">الرصيد المالي</th>
      </tr>` : ""}
      ${rows.map((s, i) => {
        const bal = balanceLabel(balances.get(s.id) || 0)
        const status = s.status === "active"
          ? `<span style="color:#047857;font-weight:700;">نشط</span>`
          : `<span style="color:#b45309;font-weight:700;">موقوف</span>`
        return `
        <tr style="background:${(startIndex + i) % 2 === 0 ? "#ffffff" : "#f8fafc"};">
          <td style="${TD}text-align:center;">${startIndex + i + 1}</td>
          <td style="${TD}text-align:right;font-weight:700;">${esc(s.name)}</td>
          <td style="${TD}text-align:center;direction:ltr;">${esc(s.phone || "—")}</td>
          <td style="${TD}text-align:center;">${status}</td>
          <td style="${TD}text-align:center;color:${bal.color};font-weight:700;white-space:nowrap;">${esc(bal.text)}</td>
        </tr>`
      }).join("")}
    </table>
  `

  return chunks.map((rows, ci) => ({
    html: (ci === 0 ? meta : "") + studentsTable(rows, ci * CHUNK, ci === 0),
  }))
}

/**
 * قسم صف كامل — نسخة الطلاب (المواعيد فقط).
 * يُقسَّم على دفعات عند كثرة المجموعات حتى لا يتجاوز ارتفاع صفحة A4.
 */
function studentGradeBlocks(grade: Grade): Block[] {
  if (grade.groups.length === 0) return []
  const rows = grade.groups
    .map(g => `
      <tr>
        <td style="${STD}text-align:right;font-weight:700;color:#111827;">${esc(g.name)}</td>
        <td style="${STD}text-align:center;font-weight:700;color:#1d4ed8;">${esc(daysLabel(g.days))}</td>
        <td style="${STD}text-align:center;white-space:nowrap;">${esc(timeRange(g.startTime, g.endTime))}</td>
      </tr>
    `)

  const CHUNK = 16
  const chunks: string[][] = []
  for (let i = 0; i < rows.length; i += CHUNK) {
    chunks.push(rows.slice(i, i + CHUNK))
  }

  return chunks.map((rowsChunk, ci) => ({
    html: `
      <div style="border:2px solid #a7f3d0;border-radius:14px;overflow:hidden;margin-bottom:16px;">
        <div style="background:linear-gradient(90deg,#059669,#10b981);color:#ffffff;padding:9px 14px;font-size:15px;font-weight:800;">
          📘 ${esc(grade.name)}${ci > 0 ? ` — تكملة (${ci + 1})` : ""}
        </div>
        <table style="${STABLE}">${GRADE_HEAD}${rowsChunk.join("")}</table>
      </div>
    `,
  }))
}

const STABLE = `width:100%;border-collapse:collapse;font-size:14px;color:#1f2937;`
const STH = `padding:9px 10px;border:1px solid #a7f3d0;font-weight:800;`
const STD = `padding:9px 10px;border:1px solid #e5e7eb;`

/** رأس جدول الصف للطلاب (يتكرر في كل دفعة) */
const GRADE_HEAD = `
  <tr style="background:#ecfdf5;color:#065f46;">
    <th style="${STH}text-align:right;">المجموعة</th>
    <th style="${STH}">أيام الحصة</th>
    <th style="${STH}">الوقت</th>
  </tr>
`

function studentNoteBlock(): Block {
  return {
    html: `
      <div style="border:1px dashed #059669;background:#ecfdf5;border-radius:12px;padding:12px 16px;font-size:13px;color:#065f46;font-weight:700;margin-bottom:16px;">
        ⏰ يرجى الالتزام بالمواعيد والحضور قبل بداية الحصة بعشر دقائق. لأي استفسار عن موعد مجموعتكم تواصلوا مع المعلم.
      </div>
    `,
  }
}

// ------------------------------------------------------------
// تقسيم الكتل على صفحات A4 بقياس حقيقي للارتفاع
// ------------------------------------------------------------

/**
 * مُقسِّم الصفحات العام (يُستخدم أيضاً من تقارير الطلاب):
 * يقيس ارتفاع كل كتلة فعلياً في المتصفح ثم يوزعها على صفحات A4،
 * ويمرر محتوى كل صفحة إلى decorate لبناء صفحة كاملة برأسها وتذييلها.
 */
export function paginateBlocks(
  blocks: Block[],
  decorate: (content: string, pageIndex: number, pageCount: number) => string
): string[] {
  if (blocks.length === 0) blocks = [{ html: `<div style="padding:40px;text-align:center;color:#9ca3af;font-size:15px;">لا توجد مجموعات بعد — أضف صفوفاً ومجموعات أولاً.</div>` }]

  // مساحة القياس خارج الشاشة
  const measurer = document.createElement("div")
  measurer.style.cssText = `position:fixed;top:0;left:-30000px;width:${PAGE_W}px;visibility:hidden;direction:rtl;font-family:${FONT};`
  document.body.appendChild(measurer)

  const heights: number[] = []
  for (const b of blocks) {
    measurer.innerHTML = b.html
    // الكتلة قد تحتوي أكثر من عنصر جذر (بطاقة + جدول) — نجمع ارتفاعاتها كلها
    let total = 0
    measurer.querySelectorAll(":scope > *").forEach(el => {
      total += el.getBoundingClientRect().height
    })
    heights.push(total)
  }
  measurer.remove()

  const pagesContent: string[][] = []
  let current: string[] = []
  let used = 0

  for (let i = 0; i < blocks.length; i++) {
    const h = heights[i]
    const mustBreak = used + h > CONTENT_BUDGET && current.length > 0
    if (mustBreak) {
      pagesContent.push(current)
      current = []
      used = 0
    }
    current.push(blocks[i].html)
    used += h
  }
  if (current.length > 0) pagesContent.push(current)

  return pagesContent.map((content, pi) => decorate(content.join(""), pi, pagesContent.length))
}

function paginate(blocks: Block[], mode: "teacher" | "student", opts: SchedulePrintOptions): string[] {
  const accent = mode === "teacher" ? "#4f46e5" : "#059669"
  return paginateBlocks(blocks, (content, pi, total) => `
    <div class="exam-page" style="width:${PAGE_W}px;min-height:${PAGE_H}px;background:#ffffff;direction:rtl;box-sizing:border-box;padding:${PAD_Y}px ${PAD_X}px;font-family:${FONT};color:#1f2937;display:flex;flex-direction:column;">
      <div style="flex:0 0 auto;">${pi === 0 ? pageHeaderBlock(mode, opts).html : `<div style="height:8px;"></div>`}</div>
      <div style="flex:1 1 auto;">${content}</div>
      <div style="flex:0 0 auto;border-top:2px solid ${accent};margin-top:14px;padding-top:8px;display:flex;align-items:center;justify-content:space-between;font-size:11.5px;color:#6b7280;">
        <div>${esc(opts.academicYear || getStoredAcademicYear())}</div>
        <div>صفحة ${pi + 1} من ${total} — ${mode === "teacher" ? "نسخة المدرس التفصيلية" : "جدول الطلاب"}</div>
      </div>
    </div>
  `)
}

/** بناء صفحات الجدول كاملة (HTML جاهز للعرض/الطباعة/PDF) */
export function buildSchedulePagesHtml(opts: SchedulePrintOptions): { html: string; pageCount: number } {
  const grades = opts.grades || []
  const students = opts.students ?? (typeof window !== "undefined" ? getStudents() : [])

  const blocks: Block[] = []
  if (opts.mode === "teacher") {
    const balances = buildBalanceMap(students)
    blocks.push(...summaryTableBlocks(grades))
    for (const grade of grades) {
      for (const group of grade.groups) {
        blocks.push(...groupDetailBlocks(grade, group, students, balances))
      }
    }
  } else {
    for (const grade of grades) {
      blocks.push(...studentGradeBlocks(grade))
    }
    // ملاحظة الختام تظهر فقط عند وجود أقسام فعلية — أما الجدول الفارغ فيعرض رسالة "لا توجد مجموعات"
    if (blocks.length > 0) blocks.push(studentNoteBlock())
  }

  const pages = paginate(blocks, opts.mode, opts)
  return { html: pages.join(""), pageCount: pages.length }
}

// ------------------------------------------------------------
// التصدير: PDF + طباعة مباشرة
// ------------------------------------------------------------

/**
 * تركيب الحاوية خارج الشاشة للمعاينة/التصدير.
 * التنسيق المخفي يوضع على غلاف خارجي حتى لا يدخل في outerHTML
 * الخاص بالحاوية نفسها عند إرسالها لنافذة الطباعة (وإلا تطبع فارغة).
 */
function mountOffscreen(id: string, html: string): HTMLElement {
  document.getElementById(`wrap-${id}`)?.remove()
  const wrapper = document.createElement("div")
  wrapper.id = `wrap-${id}`
  wrapper.style.cssText = `position:fixed;top:0;left:-30000px;width:${PAGE_W}px;overflow:hidden;`
  const holder = document.createElement("div")
  holder.id = id
  holder.innerHTML = html
  wrapper.appendChild(holder)
  document.body.appendChild(wrapper)
  return holder
}

const MOUNT_PREFIX = "schedule-print-mount"

/** تحميل أي HTML صفحات (A4) كملف PDF — تُستخدم أيضاً من تقارير الطلاب */
export async function downloadHtmlAsPDF(mountId: string, html: string, filename: string): Promise<string> {
  mountOffscreen(mountId, html)
  try {
    // انتظر تحميل الخط قبل الرسم
    try { await (document as unknown as { fonts?: { ready: Promise<unknown> } }).fonts?.ready } catch { /* تجاهل */ }
    await exportToPDF(mountId, filename, { orientation: "portrait" })
    return `${filename}.pdf`
  } finally {
    document.getElementById(`wrap-${mountId}`)?.remove()
  }
}

/** طباعة أي HTML صفحات (A4) مباشرة من المتصفح */
export function printHtml(html: string, mountId: string): void {
  mountOffscreen(mountId, html)
  try {
    printElement(mountId)
  } finally {
    setTimeout(() => document.getElementById(`wrap-${mountId}`)?.remove(), 1500)
  }
}

/** تحميل الجدول كملف PDF */
export async function downloadSchedulePDF(opts: SchedulePrintOptions): Promise<string> {
  const mountId = `${MOUNT_PREFIX}-${opts.mode}`
  const { html, pageCount } = buildSchedulePagesHtml(opts)
  const year = opts.academicYear || getStoredAcademicYear()
  const filename =
    opts.mode === "teacher"
      ? `الجدول-التفصيلي-خاص-بالمدرس-${year}`
      : `جدول-المواعيد-للطلاب-${year}`
  await downloadHtmlAsPDF(mountId, html, filename)
  return `${filename}.pdf (صفحات: ${pageCount})`
}

/** طباعة الجدول مباشرة من المتصفح */
export function printSchedule(opts: SchedulePrintOptions): void {
  const mountId = `${MOUNT_PREFIX}-${opts.mode}-print`
  const { html } = buildSchedulePagesHtml(opts)
  printHtml(html, mountId)
}
