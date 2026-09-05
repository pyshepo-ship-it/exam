// ============================================================
// تقارير الطالب — تُبنى من كل مصادر البيانات:
//  الدرجات اليدوية + الاختبارات الإلكترونية + المدفوعات والاستحقاقات
//  + الحضور + لوحة الشرف + سجل النشاط (النقل/الحساب)
//
// أنواع التقارير (كل واحد منفصل):
//  comprehensive — شامل يضم كل شيء
//  grades        — تقرير الدرجات (يدوي + إلكتروني)
//  payments      — تقرير المدفوعات والأرصدة
//  attendance    — تقرير الحضور والغياب
//  history       — تقرير السجل (النقل/المكافآت/الحساب)
//
// وضعا الطباعة:
//  teacher — نسخة المعلم (كل التفاصيل المالية)
//  student — نسخة تُرسل لولي الأمر (تُخفى الملاحظات الإدارية الداخلية)
// ============================================================

import {
  Student,
  ManualGrade,
  ExamAttempt,
  Due,
  Payment,
  Attendance,
  Honoree,
  StudentHistoryEvent,
  getStudents,
  getGrades,
  getManualGrades,
  getExamAttempts,
  getDues,
  getPayments,
  getAttendanceForGroup,
  getHonorees,
  getStudentHistory,
  getSessions,
  getStoredAcademicYear,
} from "./data-storage"
import { getTeacherName, getTeacherSignatureLine } from "./branding"
import { DUE_CYCLE_LABELS, dueCycle, duePeriodKey, duePeriodLabel } from "./billing"
import { formatTime12 } from "./utils"
import { paginateBlocks } from "./schedule-print"
import { attemptNeedsResultRelease, effectiveAttemptScore } from "./portal-content"

export type StudentReportType = "comprehensive" | "grades" | "payments" | "attendance" | "history"

export const STUDENT_REPORT_LABELS: Record<StudentReportType, string> = {
  comprehensive: "التقرير الشامل (كل شيء)",
  grades: "تقرير الدرجات",
  payments: "تقرير المدفوعات",
  attendance: "تقرير الحضور والغياب",
  history: "تقرير السجل والنشاط",
}

export interface StudentReport {
  student: Student
  gradeName: string
  groupName: string
  groupDays: string[]
  groupTime: string
  academicYear: string
  manualGrades: ManualGrade[]
  examAttempts: (ExamAttempt & { examTitle: string })[]
  dues: Due[]
  payments: Payment[]
  balance: number
  totalDue: number
  totalPaid: number
  attendance: { total: number; present: number; absent: number; rate: number; recent: { date: string; status: string }[]; allDays: { date: string; status: string }[] }
  honors: Honoree[]
  history: StudentHistoryEvent[]
  collectedAt: string
}

/** جمع كل بيانات طالب من كل المصادر */
export function collectStudentReport(studentId: string): StudentReport | null {
  const student = getStudents().find(s => s.id === studentId)
  if (!student) return null

  const grades = getGrades()
  const grade = grades.find(g => g.id === student.gradeId)
  const group = grade?.groups.find(g => g.id === student.groupId)

  const manualGrades = getManualGrades()
    .filter(m => m.studentId === studentId)
    .sort((a, b) => (a.year - b.year) || (a.month - b.month))

  const examAttempts = getExamAttempts()
    .filter(a => a.studentId === studentId || (a.studentName === student.name && a.groupId === student.groupId))
    .map(a => ({
      ...a,
      examTitle: a.examId || "اختبار إلكتروني",
    }))
    .sort((a, b) => (a.submittedAt || "").localeCompare(b.submittedAt || ""))

  const dues = getDues().filter(d => d.studentId === studentId)
  const payments = getPayments().filter(p => p.studentId === studentId)
  const totalDue = dues.reduce((s, d) => s + d.amount, 0)
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0)

  const attendanceRows = student.groupId ? getAttendanceForGroup(student.groupId) : []
  const myAtt = attendanceRows
    .filter(a => a.studentId === studentId)
    .sort((a, b) => (attendanceDayKey(a)).localeCompare(attendanceDayKey(b)))
  const present = myAtt.filter(a => a.status === "present" || a.status === "late" || a.status === "excused").length
  const absent = myAtt.filter(a => a.status === "absent").length
  const total = myAtt.length

  const honors = getHonorees().filter(h => h.studentId === studentId || (h.studentName === student.name && h.groupId === student.groupId))
  const history = getStudentHistory()
    .filter(h => h.studentId === studentId)
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""))

  return {
    student,
    gradeName: grade?.name || "غير محدد",
    groupName: group?.name || "غير محدد",
    groupDays: group?.days || [],
    groupTime: group ? `${formatTime12(group.startTime)} - ${formatTime12(group.endTime)}` : "—",
    academicYear: getStoredAcademicYear(),
    manualGrades,
    examAttempts,
    dues,
    payments,
    balance: totalDue - totalPaid,
    totalDue,
    totalPaid,
    attendance: {
      total,
      present,
      absent,
      rate: total > 0 ? Math.round((present / total) * 100) : 0,
      recent: myAtt.slice(-12).reverse().map(a => ({ date: attendanceDayKey(a), status: attendanceLabel(a.status) })),
      allDays: myAtt.map(a => ({ date: attendanceDayKey(a), status: attendanceLabel(a.status) })),
    },
    honors,
    history,
    collectedAt: new Date().toISOString(),
  }
}

function attendanceDayKey(a: Attendance): string {
  if (a.date) return a.date
  const m = /^att-.+-(\d{4}-\d{2}-\d{2})$/.exec(a.sessionId)
  if (m) return m[1]
  const session = getSessions().find(s => s.id === a.sessionId)
  return session?.sessionDate || a.sessionId
}

function attendanceLabel(status: string): string {
  switch (status) {
    case "present": return "حاضر"
    case "absent": return "غائب"
    case "late": return "متأخر"
    case "excused": return "بعذر"
    default: return status
  }
}

const AR_MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"]

function money(n: number): string {
  return `${Number(n || 0).toLocaleString("ar-EG")} ج.م`
}

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function dateLabel(iso: string): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return `${AR_MONTHS[d.getMonth()]} ${d.getDate()}، ${d.getFullYear()}`
}

// ------------------------------------------------------------
// بناء HTML التقرير — يعيد استخدام مُقسِّم الصفحات من schedule-print
// ------------------------------------------------------------

const FONT = "'Cairo','Segoe UI',Tahoma,Arial,sans-serif"
const ACCENT = "#4f46e5"

const TABLE = `width:100%;border-collapse:collapse;font-size:12.5px;color:#1f2937;`
const TH = `padding:8px;border:1px solid #c7d2fe;font-size:12.5px;font-weight:800;background:#4f46e5;color:#ffffff;`
const TD = `padding:7px 8px;border:1px solid #e5e7eb;`

interface Block { html: string }

function headerBlock(report: StudentReport, type: StudentReportType, mode: "teacher" | "student"): Block {
  const studentModeNote =
    mode === "student"
      ? `<span style="display:inline-block;white-space:nowrap;background:#ecfdf5;color:#047857;border:1px solid #a7f3d0;border-radius:999px;padding:4px 14px;font-size:12px;font-weight:700;margin-right:6px;">نسخة ولي الأمر</span>`
      : ""
  return {
    html: `
      <div style="margin-bottom:16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:4px solid ${ACCENT};padding-bottom:12px;">
          <div>
            <div style="font-size:24px;font-weight:800;color:#111827;">${esc(STUDENT_REPORT_LABELS[type])}</div>
            <div style="font-size:13px;color:#6b7280;margin-top:6px;">
              العام الدراسي ${esc(report.academicYear)} — أُنشئ في ${dateLabel(report.collectedAt)}
            </div>
          </div>
          <div style="text-align:left;">
            <div style="font-size:15px;font-weight:800;color:#111827;">${esc(getTeacherName())}</div>
          </div>
        </div>
        <div style="margin-top:6px;margin-bottom:10px;line-height:2.4;">
          <span style="display:inline-block;white-space:nowrap;background:#eef2ff;color:#4338ca;border:1px solid #c7d2fe;border-radius:999px;padding:4px 14px;font-size:13px;font-weight:800;">👤 ${esc(report.student.name)}</span>
          <span style="display:inline-block;white-space:nowrap;background:#f5f3ff;color:#6d28d9;border:1px solid #ddd6fe;border-radius:999px;padding:4px 14px;font-size:12px;font-weight:700;">📘 ${esc(report.gradeName)}</span>
          <span style="display:inline-block;white-space:nowrap;background:#ecfdf5;color:#047857;border:1px solid #a7f3d0;border-radius:999px;padding:4px 14px;font-size:12px;font-weight:700;">👥 ${esc(report.groupName)} — ${esc(report.groupTime)}</span>
          ${studentModeNote}
        </div>
      </div>
    `,
  }
}

function sectionTitle(text: string): string {
  return `<div style="font-size:16px;font-weight:800;color:#111827;margin-bottom:8px;">${esc(text)}</div>`
}

function gradesBlocks(report: StudentReport): Block[] {
  const rows: string[] = []
  let weightedScore = 0
  let weightedMax = 0

  for (const m of report.manualGrades) {
    const pct = m.maxScore > 0 ? Math.round((m.score / m.maxScore) * 100) : 0
    weightedScore += m.score
    weightedMax += m.maxScore
    rows.push(`
      <tr>
        <td style="${TD}">${esc(dateLabel(`${m.year}-${String(m.month).padStart(2, "0")}-01`))}</td>
        <td style="${TD}text-align:right;font-weight:700;">${esc(m.title)}</td>
        <td style="${TD}">تقييم يدوي</td>
        <td style="${TD}white-space:nowrap;font-weight:800;">${m.score} / ${m.maxScore}</td>
        <td style="${TD}font-weight:800;color:${pct >= 85 ? "#047857" : pct >= 50 ? "#a16207" : "#b91c1c"};">${pct}%</td>
      </tr>
    `)
  }
  for (const a of report.examAttempts) {
    const pendingRelease = attemptNeedsResultRelease(a)
    if (pendingRelease) {
      // لا تُطبع درجة جزئية أو تعليقات المقال في تقرير الطالب قبل قرار الإطلاق.
      rows.push(`
        <tr>
          <td style="${TD}">${esc(dateLabel(a.submittedAt))}</td>
          <td style="${TD}text-align:right;font-weight:700;">اختبار إلكتروني</td>
          <td style="${TD}">اختبار إلكتروني</td>
          <td colspan="2" style="${TD}font-weight:800;color:#a16207;">قيد مراجعة المعلم — تُعلن النتيجة بعد الإطلاق</td>
        </tr>
      `)
      continue
    }
    const finalScore = effectiveAttemptScore(a)
    const pct = a.totalMarks > 0 ? Math.round((finalScore / a.totalMarks) * 100) : 0
    weightedScore += finalScore
    weightedMax += a.totalMarks
    rows.push(`
      <tr>
        <td style="${TD}">${esc(dateLabel(a.submittedAt))}</td>
        <td style="${TD}text-align:right;font-weight:700;">اختبار إلكتروني${a.manualOverride ? " <span style=\"background:#f3e8ff;color:#7e22ce;border-radius:999px;padding:1px 8px;font-size:10.5px;font-weight:800;\">درجة معدلة يدوياً</span>" : ""}</td>
        <td style="${TD}">اختبار إلكتروني</td>
        <td style="${TD}white-space:nowrap;font-weight:800;">${finalScore} / ${a.totalMarks}${a.manualOverride ? ` <span style=\"color:#9ca3af;font-size:10.5px;font-weight:600;\">(الآلي: ${a.score})</span>` : ""}</td>
        <td style="${TD}font-weight:800;color:${pct >= 85 ? "#047857" : pct >= 50 ? "#a16207" : "#b91c1c"};">${pct}%</td>
      </tr>
    `)
  }

  if (rows.length === 0) return [{ html: `<div style="color:#9ca3af;font-size:12.5px;margin-bottom:14px;">لا توجد درجات مسجلة بعد لهذا الطالب.</div>` }]

  const avg = weightedMax > 0 ? Math.round((weightedScore / weightedMax) * 100) : 0
  const chunks: string[][] = []
  const CHUNK = 16
  for (let i = 0; i < rows.length; i += CHUNK) chunks.push(rows.slice(i, i + CHUNK))

  return chunks.map((chunk, ci) => ({
    html: `
      ${ci === 0 ? sectionTitle("📝 الدرجات والتقييمات") + `
      <div style="margin-top:6px;margin-bottom:10px;line-height:2.4;">
        <span style="display:inline-block;white-space:nowrap;margin-left:6px;background:#eef2ff;border:1px solid #c7d2fe;border-radius:999px;padding:4px 12px;font-size:12px;font-weight:800;color:#4338ca;">المجموع: ${weightedScore} / ${weightedMax}</span>
        <span style="display:inline-block;white-space:nowrap;margin-left:6px;background:${avg >= 85 ? "#ecfdf5" : "#fefce8"};border:1px solid ${avg >= 85 ? "#a7f3d0" : "#fde68a"};border-radius:999px;padding:4px 12px;font-size:12px;font-weight:800;color:${avg >= 85 ? "#047857" : "#a16207"};">النسبة العامة: ${avg}%</span>
      </div>` : ""}
      <table style="${TABLE}margin-bottom:14px;">
        <tr style="background:#6366f1;color:#ffffff;">
          <th style="${TH}">التاريخ</th>
          <th style="${TH}text-align:right;">البند</th>
          <th style="${TH}">المصدر</th>
          <th style="${TH}">الدرجة</th>
          <th style="${TH}">النسبة</th>
        </tr>
        ${chunk.join("")}
      </table>
    `,
  }))
}

function paymentsBlocks(report: StudentReport): Block[] {
  const payRows = report.payments
    .slice()
    .sort((a, b) => (a.paymentDate || "").localeCompare(b.paymentDate || ""))
    .map(p => `
      <tr>
        <td style="${TD}">${esc(dateLabel(p.paymentDate))}</td>
        <td style="${TD}">${p.month}/${p.year}</td>
        <td style="${TD}white-space:nowrap;font-weight:800;color:#047857;">${esc(money(p.amount))}</td>
        <td style="${TD}">${esc(p.notes || "—")}</td>
      </tr>
    `)

  const summary = `
    <div style="margin-top:6px;margin-bottom:10px;line-height:2.4;">
      <span style="display:inline-block;white-space:nowrap;margin-left:6px;background:#fefce8;border:1px solid #fde68a;border-radius:999px;padding:4px 12px;font-size:12px;font-weight:800;color:#a16207;">إجمالي الاستحقاقات: ${esc(money(report.totalDue))}</span>
      <span style="display:inline-block;white-space:nowrap;margin-left:6px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:999px;padding:4px 12px;font-size:12px;font-weight:800;color:#047857;">إجمالي المدفوع: ${esc(money(report.totalPaid))}</span>
      <span style="display:inline-block;white-space:nowrap;margin-left:6px;background:${report.balance > 0 ? "#fef2f2" : "#ecfdf5"};border:1px solid ${report.balance > 0 ? "#fecaca" : "#a7f3d0"};border-radius:999px;padding:4px 12px;font-size:12px;font-weight:800;color:${report.balance > 0 ? "#b91c1c" : "#047857"};">الرصيد المتبقي: ${esc(money(report.balance))}</span>
    </div>
  `

  // كشف المطابقة لكل فترة استحقاق (شهر / أسبوع / حصص / مبلغ مخصص):
  // استحقاق + مدفوع + متبقٍ + تاريخ آخر تحصيل — يوضح لولي الأمر.
  // الدفعات المرتبطة باستحقاق تُحسب على فترتها، وغير المرتبطة تُجمع في شهرها.
  interface PeriodRow {
    key: string
    label: string
    cycle: string
    amount: number
    paid: number
    lastDate?: string
    sort: string
  }
  const periodRows = new Map<string, PeriodRow>()
  const ensureRow = (key: string, label: string, cycle: string, sort: string): PeriodRow => {
    const found = periodRows.get(key)
    if (found) return found
    const row: PeriodRow = { key, label, cycle, amount: 0, paid: 0, sort }
    periodRows.set(key, row)
    return row
  }
  const keyOfDue = (d: Due) => (dueCycle(d) === "monthly" ? `m-${d.year}-${d.month}` : `p-${duePeriodKey(d)}`)
  const sortOfDue = (d: Due) => d.dueDate || `${d.year}-${String(d.month).padStart(2, "0")}`

  report.dues.forEach(d => {
    const cycle = dueCycle(d)
    const label = cycle === "monthly" ? `${d.month}/${d.year}` : duePeriodLabel(d)
    ensureRow(keyOfDue(d), label, DUE_CYCLE_LABELS[cycle], sortOfDue(d)).amount += d.amount
  })

  report.payments.forEach(p => {
    const linked = p.dueId ? report.dues.find(d => d.id === p.dueId) : undefined
    if (linked) {
      const row = ensureRow(
        keyOfDue(linked),
        dueCycle(linked) === "monthly" ? `${linked.month}/${linked.year}` : duePeriodLabel(linked),
        DUE_CYCLE_LABELS[dueCycle(linked)],
        sortOfDue(linked)
      )
      row.paid += p.amount
      if (!row.lastDate || p.paymentDate > row.lastDate) row.lastDate = p.paymentDate
      return
    }
    const row = ensureRow(`m-${p.year}-${p.month}`, `${p.month}/${p.year}`, DUE_CYCLE_LABELS.monthly,
      p.paymentDate || `${p.year}-${String(p.month).padStart(2, "0")}`)
    row.paid += p.amount
    if (!row.lastDate || p.paymentDate > row.lastDate) row.lastDate = p.paymentDate
  })

  const monthlyRows = [...periodRows.values()]
    .sort((a, b) => (a.sort < b.sort ? -1 : a.sort > b.sort ? 1 : 0))
    .map(row => {
      const remaining = Math.round((row.amount - row.paid) * 100) / 100
      const status =
        remaining <= 0 && row.amount > 0
          ? `<span style="color:#047857;font-weight:800;">مسدد بالكامل ✓</span>`
          : row.paid > 0
          ? `<span style="color:#a16207;font-weight:800;">جزئي — متبقي ${esc(money(remaining))}</span>`
          : row.amount > 0
          ? `<span style="color:#b91c1c;font-weight:800;">غير مدفوع</span>`
          : `<span style="color:#047857;font-weight:800;">دفعة حرة</span>`
      return `
      <tr>
        <td style="${TD}">${esc(row.label)}${row.cycle !== DUE_CYCLE_LABELS.monthly ? ` <span style="color:#6b7280;font-size:10.5px;">(${esc(row.cycle)})</span>` : ""}</td>
        <td style="${TD}white-space:nowrap;">${esc(money(row.amount))}</td>
        <td style="${TD}white-space:nowrap;font-weight:800;color:#047857;">${esc(money(row.paid))}</td>
        <td style="${TD}">${status}</td>
        <td style="${TD}">${row.lastDate ? esc(dateLabel(row.lastDate)) : "—"}</td>
      </tr>`
    })

  const duesTable = monthlyRows.length
    ? `
      <table style="${TABLE}margin-bottom:14px;">
        <tr style="background:#047857;color:#ffffff;">
          <th style="${TH}">الفترة</th>
          <th style="${TH}">الاستحقاق</th>
          <th style="${TH}">المدفوع</th>
          <th style="${TH}">الحالة</th>
          <th style="${TH}">آخر تحصيل</th>
        </tr>
        ${monthlyRows.join("")}
      </table>`
    : ""

  const blocks: Block[] = []
  if (duesTable || payRows.length > 0) {
    blocks.push({ html: sectionTitle("💰 كشف الحساب (حسب فترات الاستحقاق)") + summary + (duesTable || `<div style="color:#9ca3af;font-size:12.5px;">لا توجد مستحقات مسجلة.</div>`) })
  }

  const payChunks: string[][] = []
  const CHUNK = 16
  for (let i = 0; i < payRows.length; i += CHUNK) payChunks.push(payRows.slice(i, i + CHUNK))

  if (payChunks.length === 0) {
    if (!duesTable) return [{ html: summary + `<div style="color:#9ca3af;font-size:12.5px;">لا توجد دفعات مسجلة بعد.</div>` }]
    return blocks
  }

  return [
    ...blocks,
    ...payChunks.map((chunk, ci) => ({
      html: `
      ${ci === 0 ? sectionTitle("🧾 سجل الدفعات") : ""}
      <table style="${TABLE}margin-bottom:14px;">
        <tr style="background:#6366f1;color:#ffffff;">
          <th style="${TH}">تاريخ الدفع</th>
          <th style="${TH}">عن شهر</th>
          <th style="${TH}">المبلغ</th>
          <th style="${TH}">ملاحظات</th>
        </tr>
        ${chunk.join("")}
      </table>
    `,
    })),
  ]
}

function attendanceBlocks(report: StudentReport): Block[] {
  const rows = report.attendance.recent
    .map(a => `
      <tr>
        <td style="${TD}">${esc(dateLabel(a.date))}</td>
        <td style="${TD}font-weight:800;color:${a.status === "غائب" ? "#b91c1c" : "#047857"};">${esc(a.status)}</td>
      </tr>
    `)
    .join("")

  return [
    {
      html: `
        ${sectionTitle("📅 الحضور والغياب")}
        <div style="margin-top:6px;margin-bottom:10px;line-height:2.4;">
          <span style="display:inline-block;white-space:nowrap;margin-left:6px;background:#eef2ff;border:1px solid #c7d2fe;border-radius:999px;padding:4px 12px;font-size:12px;font-weight:800;color:#4338ca;">إجمالي الأيام: ${report.attendance.total}</span>
          <span style="display:inline-block;white-space:nowrap;margin-left:6px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:999px;padding:4px 12px;font-size:12px;font-weight:800;color:#047857;">حضور: ${report.attendance.present}</span>
          <span style="display:inline-block;white-space:nowrap;margin-left:6px;background:#fef2f2;border:1px solid #fecaca;border-radius:999px;padding:4px 12px;font-size:12px;font-weight:800;color:#b91c1c;">غياب: ${report.attendance.absent}</span>
          <span style="display:inline-block;white-space:nowrap;margin-left:6px;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:999px;padding:4px 12px;font-size:12px;font-weight:800;color:#6d28d9;">نسبة الحضور: ${report.attendance.rate}%</span>
        </div>
        ${rows ? `<table style="${TABLE}margin-bottom:14px;">
          <tr style="background:#6366f1;color:#ffffff;">
            <th style="${TH}">التاريخ</th>
            <th style="${TH}">الحالة</th>
          </tr>
          ${rows}
        </table>` : `<div style="color:#9ca3af;font-size:12.5px;">لا توجد سجلات حضور بعد.</div>`}
      `,
    },
  ]
}

function historyBlocks(report: StudentReport): Block[] {
  const rows = report.history
    .map(h => `
      <tr>
        <td style="${TD}white-space:nowrap;">${esc(dateLabel(h.date))}</td>
        <td style="${TD}text-align:right;font-weight:700;">${esc(h.title)}</td>
        <td style="${TD}">${esc(h.detail || "—")}</td>
      </tr>
    `)
  // التكريم سطر واحد واضح: السبب + الشهر — بدون تفاصيل مدة الظهور
  const honorRows = report.honors
    .map(h => `
      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:8px 14px;font-size:13px;font-weight:800;color:#a16207;margin-bottom:6px;">
        🏆 ${esc(h.reason)} — شهر ${esc(AR_MONTHS[(h.month || 1) - 1] || "")} ${h.year}
      </div>
    `)

  return [
    {
      html: `
        ${sectionTitle("🧾 السجل والنشاط")}
        ${honorRows.length ? `<div style="margin-bottom:12px;">${honorRows.join("")}</div>` : ""}
        ${rows.length ? `<table style="${TABLE}margin-bottom:14px;">
          <tr style="background:#6366f1;color:#ffffff;">
            <th style="${TH}">التاريخ</th>
            <th style="${TH}text-align:right;">الحدث</th>
            <th style="${TH}text-align:right;">التفاصيل</th>
          </tr>
          ${rows.join("")}
        </table>` : `<div style="color:#9ca3af;font-size:12.5px;">لا توجد أحداث مسجلة بعد.</div>`}
      `,
    },
  ]
}

function comprehensiveBlocks(report: StudentReport): Block[] {
  const avgPct = (() => {
    let s = 0, m = 0
    for (const g of report.manualGrades) { s += g.score; m += g.maxScore }
    // لا تدخل محاولات المقال غير المعلنة في النسبة المطبوعة للطالب.
    for (const a of report.examAttempts) {
      if (attemptNeedsResultRelease(a)) continue
      s += effectiveAttemptScore(a)
      m += a.totalMarks
    }
    return m > 0 ? Math.round((s / m) * 100) : null
  })()

  const cards = `
    <div style="margin-top:6px;margin-bottom:10px;line-height:2.4;">
      <span style="display:inline-block;white-space:nowrap;margin-left:6px;background:#eef2ff;border:1px solid #c7d2fe;border-radius:12px;padding:8px 14px;font-size:12px;font-weight:800;color:#4338ca;">📚 عدد التقييمات: ${report.manualGrades.length + report.examAttempts.length}</span>
      ${avgPct !== null ? `<span style="display:inline-block;white-space:nowrap;margin-left:6px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:12px;padding:8px 14px;font-size:12px;font-weight:800;color:#047857;">📈 النسبة العامة: ${avgPct}%</span>` : ""}
      <span style="display:inline-block;white-space:nowrap;margin-left:6px;background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:8px 14px;font-size:12px;font-weight:800;color:#b91c1c;">💼 الرصيد: ${esc(money(report.balance))}</span>
      <span style="display:inline-block;white-space:nowrap;margin-left:6px;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:12px;padding:8px 14px;font-size:12px;font-weight:800;color:#6d28d9;">📅 نسبة الحضور: ${report.attendance.rate}%</span>
      <span style="display:inline-block;white-space:nowrap;margin-left:6px;background:#fefce8;border:1px solid #fde68a;border-radius:12px;padding:8px 14px;font-size:12px;font-weight:800;color:#a16207;">🏆 مرات التكريم: ${report.honors.length}</span>
    </div>
  `

  return [
    { html: sectionTitle("🌟 ملخص الطالب") + cards },
    ...gradesBlocks(report),
    ...paymentsBlocks(report),
    ...attendanceBlocks(report),
    ...historyBlocks(report),
  ]
}

/**
 * بناء التقرير نفسه من بيانات بوابة الطالب القادمة من Supabase مباشرة
 * (صفحة الطالب) بدل المرآة المحلية (صفحة المعلم).
 */
export function reportFromPortalData(d: {
  student: Student
  gradeName: string
  groupName: string
  groupStartTime: string
  groupEndTime: string
  groupDays: string[]
  manualGrades: ManualGrade[]
  examAttempts: ExamAttempt[]
  dues: Due[]
  payments: Payment[]
  attendance: Attendance[]
  honorees: Honoree[]
  history: StudentHistoryEvent[]
}): StudentReport {
  const student = d.student
  const totalDue = d.dues.reduce((s, x) => s + x.amount, 0)
  const totalPaid = d.payments.reduce((s, x) => s + x.amount, 0)

  const myAtt = [...d.attendance]
    .filter(a => a.studentId === student.id)
    .sort((a, b) => attendanceDayKey(a).localeCompare(attendanceDayKey(b)))
  const present = myAtt.filter(a => a.status !== "absent").length
  const absent = myAtt.filter(a => a.status === "absent").length
  const total = myAtt.length

  return {
    student,
    gradeName: d.gradeName || "غير محدد",
    groupName: d.groupName || "غير محدد",
    groupDays: d.groupDays || [],
    groupTime:
      d.groupStartTime && d.groupEndTime
        ? `${formatTime12(d.groupStartTime)} - ${formatTime12(d.groupEndTime)}`
        : "—",
    academicYear: getStoredAcademicYear(),
    manualGrades: [...d.manualGrades].sort((a, b) => (a.year - b.year) || (a.month - b.month)),
    examAttempts: [...d.examAttempts]
      .map(a => ({ ...a, examTitle: a.examId || "اختبار إلكتروني" }))
      .sort((a, b) => (a.submittedAt || "").localeCompare(b.submittedAt || "")),
    dues: d.dues,
    payments: [...d.payments].sort((a, b) => (a.paymentDate || "").localeCompare(b.paymentDate || "")),
    balance: totalDue - totalPaid,
    totalDue,
    totalPaid,
    attendance: {
      total,
      present,
      absent,
      rate: total > 0 ? Math.round((present / total) * 100) : 0,
      recent: myAtt.slice(-12).reverse().map(a => ({ date: attendanceDayKey(a), status: attendanceLabel(a.status) })),
      allDays: myAtt.map(a => ({ date: attendanceDayKey(a), status: attendanceLabel(a.status) })),
    },
    honors: d.honorees,
    history: [...d.history].sort((a, b) => (a.date || "").localeCompare(b.date || "")),
    collectedAt: new Date().toISOString(),
  }
}

/**
 * بناء صفحات تقرير الطالب (HTML جاهز للعرض والطباعة وPDF).
 * واجهة مطابقة لـ buildSchedulePagesHtml لسهولة الاستخدام بنفس الحوار.
 */
/**
 * تصفية التقرير على شهر محدد (شهري) — أو كل الشهور (العام كاملاً / سنوي).
 * تعيد الحسابات المالية وإحصاءات الحضور على الفترة المختارة فقط.
 */
export function filterReportByMonth(report: StudentReport, month: number | null): StudentReport {
  if (!month) return report
  const inMonth = (iso: string): boolean => {
    const d = new Date(iso)
    return !isNaN(d.getTime()) && d.getMonth() + 1 === month
  }
  const manualGrades = report.manualGrades.filter(m => m.month === month)
  const examAttempts = report.examAttempts.filter(a => inMonth(a.submittedAt))
  const dues = report.dues.filter(d => d.month === month)
  const payments = report.payments.filter(p => p.month === month)
  const honors = report.honors.filter(h => h.month === month)
  const allDays = (report.attendance.allDays || []).filter(a => {
    const mm = parseInt((a.date || "").slice(5, 7), 10)
    return mm === month
  })
  const present = allDays.filter(a => a.status !== "غائب").length
  const absent = allDays.filter(a => a.status === "غائب").length
  const total = allDays.length
  const totalDue = dues.reduce((s, d) => s + d.amount, 0)
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0)
  return {
    ...report,
    manualGrades,
    examAttempts,
    dues,
    payments,
    honors,
    totalDue,
    totalPaid,
    balance: totalDue - totalPaid,
    attendance: {
      total,
      present,
      absent,
      rate: total > 0 ? Math.round((present / total) * 100) : 0,
      recent: allDays.slice(-12).reverse(),
      allDays,
    },
  }
}

export function buildStudentReportPagesHtml(opts: {
  report: StudentReport
  type: StudentReportType
  mode?: "teacher" | "student"
  /** شهر محدد (1-12) — أُترك فارغاً = العام كاملاً */
  month?: number | null
}): { html: string; pageCount: number } {
  const { type } = opts
  const mode = opts.mode || "teacher"
  const report = filterReportByMonth(opts.report, opts.month ?? null)

  const blocks: Block[] = [headerBlock(report, type, mode)]
  switch (type) {
    case "grades": blocks.push(...gradesBlocks(report)); break
    case "payments": blocks.push(...paymentsBlocks(report)); break
    case "attendance": blocks.push(...attendanceBlocks(report)); break
    case "history": blocks.push(...historyBlocks(report)); break
    default: blocks.push(...comprehensiveBlocks(report))
  }

  const decorate = (content: string, pi: number, total: number) => `
    <div class="exam-page" style="width:794px;min-height:1123px;background:#ffffff;direction:rtl;box-sizing:border-box;padding:34px 40px;font-family:${FONT};color:#1f2937;display:flex;flex-direction:column;">
      <div style="flex:0 0 auto;">${pi === 0 ? "" : `<div style="height:8px;"></div>`}</div>
      <div style="flex:1 1 auto;">${content}</div>
      <div style="flex:0 0 auto;border-top:2px solid ${ACCENT};margin-top:14px;padding-top:8px;display:flex;align-items:center;justify-content:space-between;font-size:11.5px;color:#6b7280;">
        <div>
          ${esc(getTeacherSignatureLine())}
          <span style="color:${ACCENT};font-weight:800;margin-right:6px;">${esc(getTeacherName())}</span>
        </div>
        <div>صفحة ${pi + 1} من ${total} — ${esc(STUDENT_REPORT_LABELS[type])} — ${esc(report.student.name)}</div>
      </div>
    </div>
  `

  const pages = paginateBlocks(blocks, decorate)
  return { html: pages.join(""), pageCount: pages.length }
}
