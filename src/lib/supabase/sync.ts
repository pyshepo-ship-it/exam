// ============================================================
// محرك المزامنة مع Supabase — السحابة هي المكان الوحيد لتسجيل البيانات
// ============================================================
// لا يوجد أي تخزين محلي للبيانات على الجهاز (لا localStorage ولا sessionStorage):
//   • الجلب: كل صفحة تجلب بياناتها من Supabase تلقائياً عند فتحها
//   • الحفظ: كل حفظ يُرفع إلى Supabase، ثم تُحدَّث ذاكرة الجلسة للعرض الفوري
//   • ذاكرة الجلسة (memory-store) متغيّرات داخل التبويب تُمسح عند تحديث الصفحة
// ============================================================

import { createClient, isSupabaseConfigured } from "./client";
import {
  readRows as storeRows,
  writeRows as setStore,
  readSetting as storeSetting,
  writeSetting as setStoreSetting,
  notifyStoreUpdate,
  purgeLegacyLocalStorage,
} from "../memory-store";
import { STORAGE_KEYS } from "../storage-keys";

// ---------- أنواع بنيوية (للتجنب الاستيراد الدائري) ----------
interface GroupShape {
  id: string;
  name: string;
  days: string[];
  startTime: string;
  endTime: string;
  monthlyFee: number;
  studentsCount: number;
}
interface GradeShape {
  id: string;
  name: string;
  academicYear: string;
  groups: GroupShape[];
  createdAt: string;
}
interface YearArchiveShape {
  academicYear: string;
  closedAt: string;
  stats: Record<string, number>;
  data: Record<string, unknown>;
}

function getSupabase() {
  if (typeof window === "undefined") return null;
  if (!isSupabaseConfigured()) return null;
  try {
    return createClient();
  } catch {
    return null;
  }
}

// معرفات الصفوف الموجودة حالياً في Supabase (لكشف الحذف)
let remoteIds: Record<string, Set<string>> = {};
let warnedOnce = false;
let lastWarned = "";

const DB_TABLES = [
  "grades",
  "groups",
  "students",
  "dues",
  "payments",
  "exams",
  "sessions",
  "attendance",
  "announcements",
  "honorees",
  "shared_files",
  "important_links",
  "year_archives",
  "manual_grades",
  "registration_requests",
  "group_transfer_requests",
  "student_history",
  "student_accounts",
  "inquiries",
] as const;

function nil<T>(v: T | null | undefined): T | undefined {
  return v === null || v === undefined ? undefined : v
};

// ============================================================
// الخرائط: Local <-> Supabase
// ============================================================

export const toGradeRow = (g: GradeShape) => ({
  id: g.id,
  // أعمدة NOT NULL — قيم بديلة تمنع رفض السجل بالكامل
  name: g.name || "صف بدون اسم",
  academic_year: g.academicYear || "",
  created_at: g.createdAt || new Date().toISOString(),
});

export const toGroupRows = (g: GradeShape) =>
  g.groups.map((gr: GroupShape) => ({
    id: gr.id,
    grade_id: g.id,
    name: gr.name || "مجموعة",
    days: gr.days || [],
    start_time: gr.startTime || "",
    end_time: gr.endTime || "",
    monthly_fee: gr.monthlyFee ?? 0,
    students_count: gr.studentsCount ?? 0,
  }));

export const fromGradeRow = (row: any, groups: any[]): GradeShape => ({
  id: row.id,
  name: row.name,
  academicYear: row.academic_year,
  createdAt: row.created_at,
  groups: groups
    .filter((gr) => gr.grade_id === row.id)
    .map((gr) => ({
      id: gr.id,
      name: gr.name,
      days: gr.days || [],
      startTime: gr.start_time,
      endTime: gr.end_time,
      monthlyFee: Number(gr.monthly_fee),
      studentsCount: gr.students_count ?? 0,
    })),
});

export const toStudentRow = (s: any) => ({
  id: s.id,
  name: s.name || "طالب بدون اسم",
  phone: s.phone || null,
  email: s.email || null,
  grade_id: s.gradeId || null,
  group_id: s.groupId || null,
  status: s.status,
  notes: s.notes || null,
  created_at: s.createdAt || new Date().toISOString(),
  updated_at: s.updatedAt || s.createdAt || new Date().toISOString(),
  inquiry_blocked: s.inquiryBlocked === true,
});

export const fromStudentRow = (row: any) => ({
  id: row.id,
  name: row.name,
  phone: nil(row.phone),
  email: nil(row.email),
  gradeId: row.grade_id,
  groupId: row.group_id,
  status: row.status,
  notes: nil(row.notes),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  inquiryBlocked: row.inquiry_blocked === true || undefined,
});

const toDueRow = (d: any) => ({
  id: d.id,
  student_id: d.studentId,
  group_id: d.groupId || null,
  month: d.month ?? new Date().getMonth() + 1,
  year: d.year ?? new Date().getFullYear(),
  amount: d.amount ?? 0,
  status: d.status || "pending",
  created_at: d.createdAt || new Date().toISOString(),
});

const fromDueRow = (row: any) => ({
  id: row.id,
  studentId: row.student_id,
  groupId: row.group_id || undefined,
  month: row.month,
  year: row.year,
  amount: Number(row.amount),
  status: row.status,
  createdAt: row.created_at,
});

const toPaymentRow = (p: any) => ({
  id: p.id,
  student_id: p.studentId,
  due_id: p.dueId || null,
  amount: p.amount ?? 0,
  payment_date: p.paymentDate || new Date().toISOString().slice(0, 10),
  month: p.month ?? new Date().getMonth() + 1,
  year: p.year ?? new Date().getFullYear(),
  notes: p.notes || null,
  created_at: p.createdAt || new Date().toISOString(),
});

const fromPaymentRow = (row: any) => ({
  id: row.id,
  studentId: row.student_id,
  dueId: nil(row.due_id),
  amount: Number(row.amount),
  paymentDate: row.payment_date,
  month: row.month,
  year: row.year,
  notes: nil(row.notes),
  createdAt: row.created_at,
});

/**
 * النوع الصريح يحسم المسار. أما السجل القديم، فـ allowOnline=true هو الدليل
 * الوحيد المتاح على أنه أونلاين؛ ونبقي القديم غير المنشور بلا نوع حتى لا
 * نحوّله تلقائياً إلى أوف لاين قبل أن يختار المعلم مساره.
 */
const persistedExamDeliveryMode = (exam: any): "online" | "offline" | undefined => {
  if (exam.deliveryMode === "online") return "online"
  if (exam.deliveryMode === "offline") return "offline"
  return exam.allowOnline ? "online" : undefined
}

export const toExamRow = (e: any) => ({
  id: e.id,
  grade_id: e.gradeId || null,
  group_id: e.groupId || null,
  title: e.title || "اختبار",
  month: e.month ?? null,
  unit: e.unit || null,
  // academic_year عمود NOT NULL — نضمن وجود قيمة دائماً
  academic_year: e.academicYear || "",
  duration: e.duration ?? null,
  total_marks: e.totalMarks ?? null,
  // نغلّف الأسئلة مع إعدادات القالب داخل JSONB حتى لا نحتاج عموداً جديداً
  questions: {
    _v: 4,
    items: e.questions || [],
    templateId: e.templateId || "classic",
    showDecorations: e.showDecorations !== false,
    teacherName: e.teacherName || "",
    schoolName: e.schoolName || "",
    // نوع الاختبار مستقل عن حالة النشر: أونلاين يمكن أن يبقى مسودة قبل إتاحته للطلاب.
    deliveryMode: persistedExamDeliveryMode(e),
    onlineExamMode: e.onlineExamMode === "objective" || e.onlineExamMode === "essay" || e.onlineExamMode === "mixed"
      ? e.onlineExamMode
      : undefined,
    allowOnline: persistedExamDeliveryMode(e) === "online" && !!e.allowOnline,
    // من يفتحه: الأعضاء المسجلون فقط (افتراضي) أو أي زائر بلا تسجيل
    accessMode: e.accessMode === "public" ? "public" : "members",
    autoHonorBoard: !!e.autoHonorBoard,
    honorMinPercent: e.honorMinPercent ?? 100,
    availabilityMode: e.availabilityMode || "always",
    availableFrom: e.availableFrom || null,
    availableUntil: e.availableUntil || null,
    targetGroupIds: Array.isArray(e.targetGroupIds) ? e.targetGroupIds : [],
    answerVisibility: e.answerVisibility || "never",
    maxAttempts: e.maxAttempts && e.maxAttempts > 0 ? e.maxAttempts : null,
    reviewOpen: !!e.reviewOpen,
  },
  // created_at / updated_at أعمدة NOT NULL أيضاً
  created_at: e.createdAt || new Date().toISOString(),
  updated_at: e.updatedAt || e.createdAt || new Date().toISOString(),
});
export const fromExamRow = (row: any) => {
  const q = row.questions
  const wrapped = q && typeof q === "object" && !Array.isArray(q) && Array.isArray(q.items)
  const deliveryMode = wrapped ? persistedExamDeliveryMode(q) : undefined
  return {
    id: row.id,
    gradeId: row.grade_id,
    groupId: nil(row.group_id),
    title: row.title,
    month: row.month ?? undefined,
    unit: nil(row.unit),
    academicYear: row.academic_year,
    duration: row.duration ?? undefined,
    totalMarks: row.total_marks ?? undefined,
    questions: wrapped ? q.items : (Array.isArray(q) ? q : []),
    templateId: wrapped ? (q.templateId || "classic") : "classic",
    showDecorations: wrapped ? q.showDecorations !== false : true,
    teacherName: wrapped ? (q.teacherName || undefined) : undefined,
    schoolName: wrapped ? (q.schoolName || undefined) : undefined,
    // توافق رجعي: المنشور القديم يُستنتج كأونلاين، أما غير المنشور فنتركه
    // بلا نوع صريح كي يستطيع المعلم اختيار مساره لاحقاً.
    deliveryMode,
    onlineExamMode: wrapped && (q.onlineExamMode === "objective" || q.onlineExamMode === "essay" || q.onlineExamMode === "mixed")
      ? q.onlineExamMode
      : undefined,
    allowOnline: deliveryMode === "online" && !!q.allowOnline,
    accessMode: wrapped && q.accessMode === "public" ? ("public" as const) : ("members" as const),
    autoHonorBoard: wrapped ? !!q.autoHonorBoard : false,
    honorMinPercent: wrapped ? (q.honorMinPercent ?? 100) : 100,
    availabilityMode: wrapped ? (q.availabilityMode || "always") : "always",
    availableFrom: wrapped && q.availableFrom ? q.availableFrom : undefined,
    availableUntil: wrapped && q.availableUntil ? q.availableUntil : undefined,
    targetGroupIds: wrapped && Array.isArray(q.targetGroupIds) ? q.targetGroupIds : [],
    answerVisibility: wrapped ? (q.answerVisibility || "never") : "never",
    reviewOpen: wrapped ? !!q.reviewOpen : false,
    maxAttempts: wrapped && q.maxAttempts && q.maxAttempts > 0 ? q.maxAttempts : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
};

const toSessionRow = (s: any) => ({
  id: s.id,
  group_id: s.groupId,
  session_date: s.sessionDate || new Date().toISOString().slice(0, 10),
  start_time: s.startTime || "",
  end_time: s.endTime || "",
  notes: s.notes || null,
  created_at: s.createdAt || new Date().toISOString(),
});

const fromSessionRow = (row: any) => ({
  id: row.id,
  groupId: row.group_id,
  sessionDate: row.session_date,
  startTime: row.start_time,
  endTime: row.end_time,
  notes: nil(row.notes),
  createdAt: row.created_at,
});

const toAttendanceRow = (a: any) => ({
  id: a.id,
  session_id: a.sessionId,
  student_id: a.studentId,
  status: a.status || "absent",
  late_minutes: a.lateMinutes ?? null,
  notes: a.notes || null,
  created_at: a.createdAt || new Date().toISOString(),
});

const fromAttendanceRow = (row: any) => {
  const sessionId: string = row.session_id || ""
  const dayMatch = /^att-(.+)-(\d{4}-\d{2}-\d{2})$/.exec(sessionId)
  return {
    id: row.id,
    sessionId,
    studentId: row.student_id,
    groupId: dayMatch ? dayMatch[1] : undefined,
    date: dayMatch ? dayMatch[2] : undefined,
    status: row.status,
    lateMinutes: nil(row.late_minutes),
    notes: nil(row.notes),
    createdAt: row.created_at,
  }
};

const toAnnouncementRow = (a: any) => ({
  id: a.id,
  title: a.title,
  body: a.body,
  pinned: !!a.pinned,
  // الصفوف المستهدفة — null = إعلان عام للجميع
  target_grade_ids: Array.isArray(a.targetGradeIds) && a.targetGradeIds.length > 0 ? a.targetGradeIds : null,
  created_at: a.createdAt,
});

const fromAnnouncementRow = (row: any) => ({
  id: row.id,
  title: row.title,
  body: row.body,
  pinned: row.pinned,
  targetGradeIds: Array.isArray(row.target_grade_ids) ? row.target_grade_ids : [],
  createdAt: row.created_at,
});

export const toHonoreeRow = (h: any) => ({
  id: h.id,
  student_id: h.studentId || null,
  student_name: h.studentName,
  group_id: h.groupId,
  reason: h.reason,
  month: h.month,
  year: h.year,
  created_at: h.createdAt,
});

export const fromHonoreeRow = (row: any) => ({
  id: row.id,
  studentId: nil(row.student_id),
  studentName: row.student_name,
  groupId: row.group_id,
  reason: row.reason,
  month: row.month,
  year: row.year,
  createdAt: row.created_at,
});

export const toSharedFileRow = (f: any) => ({
  id: f.id,
  name: f.name,
  description: f.description || null,
  source: f.source,
  data_url: f.dataUrl || null,
  url: f.url || null,
  added_at: f.addedAt,
});

export const fromSharedFileRow = (row: any) => ({
  id: row.id,
  name: row.name,
  description: nil(row.description),
  source: row.source,
  dataUrl: nil(row.data_url),
  url: nil(row.url),
  addedAt: row.added_at,
});

const toLinkRow = (l: any) => ({
  id: l.id,
  title: l.title,
  url: l.url,
  added_at: l.addedAt,
});

const fromLinkRow = (row: any) => ({
  id: row.id,
  title: row.title,
  url: row.url,
  addedAt: row.added_at,
});

// ---------- خرائط بوابة الطلاب ----------

export const toManualGradeRow = (m: any) => ({
  id: m.id,
  student_id: m.studentId,
  grade_id: m.gradeId || null,
  group_id: m.groupId || null,
  title: m.title || "تقييم",
  score: m.score ?? 0,
  max_score: m.maxScore ?? 0,
  month: m.month ?? new Date().getMonth() + 1,
  year: m.year ?? new Date().getFullYear(),
  notes: m.notes || null,
  created_at: m.createdAt || new Date().toISOString(),
});

export const fromManualGradeRow = (row: any) => ({
  id: row.id,
  studentId: row.student_id,
  gradeId: row.grade_id || "",
  groupId: row.group_id || "",
  title: row.title,
  score: Number(row.score),
  maxScore: Number(row.max_score),
  month: row.month,
  year: row.year,
  notes: nil(row.notes),
  createdAt: row.created_at,
});

export const toRegistrationRequestRow = (r: any) => ({
  id: r.id,
  name: r.name,
  phone: r.phone,
  guardian_phone: r.guardianPhone || null,
  email: r.email,
  password_hash: r.passwordHash || "",
  grade_id: r.gradeId,
  group_id: r.groupId,
  status: r.status || "pending",
  review_note: r.reviewNote || null,
  linked_student_id: r.linkedStudentId || null,
  created_at: r.createdAt || new Date().toISOString(),
  reviewed_at: r.reviewedAt || null,
});

export const fromRegistrationRequestRow = (row: any) => ({
  id: row.id,
  name: row.name,
  phone: row.phone || "",
  email: row.email,
  passwordHash: row.password_hash || "",
  gradeId: row.grade_id,
  groupId: row.group_id,
  status: row.status || "pending",
  reviewNote: nil(row.review_note),
  linkedStudentId: nil(row.linked_student_id),
  createdAt: row.created_at,
  reviewedAt: nil(row.reviewed_at),
});

export const toGroupTransferRequestRow = (t: any) => ({
  id: t.id,
  student_id: t.studentId,
  student_name: t.studentName || "",
  from_group_id: t.fromGroupId,
  to_grade_id: t.toGradeId,
  to_group_id: t.toGroupId,
  status: t.status || "pending",
  review_note: t.reviewNote || null,
  created_at: t.createdAt || new Date().toISOString(),
  reviewed_at: t.reviewedAt || null,
});

export const fromGroupTransferRequestRow = (row: any) => ({
  id: row.id,
  studentId: row.student_id,
  studentName: row.student_name || "",
  fromGroupId: row.from_group_id,
  toGradeId: row.to_grade_id,
  toGroupId: row.to_group_id,
  status: row.status || "pending",
  reviewNote: nil(row.review_note),
  createdAt: row.created_at,
  reviewedAt: nil(row.reviewed_at),
});

export const toStudentHistoryRow = (h: any) => ({
  id: h.id,
  student_id: h.studentId,
  type: h.type,
  title: h.title,
  detail: h.detail || null,
  date: h.date,
  created_at: h.createdAt || new Date().toISOString(),
});

export const fromStudentHistoryRow = (row: any) => ({
  id: row.id,
  studentId: row.student_id,
  type: row.type,
  title: row.title,
  detail: nil(row.detail),
  date: row.date,
  createdAt: row.created_at,
});

export const toStudentAccountRow = (a: any) => ({
  id: a.id || a.email,
  email: a.email,
  student_id: a.studentId,
  active: a.active !== false,
  created_at: a.createdAt || new Date().toISOString(),
  password_hash: a.passwordHash || null,
});

export const fromStudentAccountRow = (row: any) => ({
  id: row.id || row.email,
  email: row.email,
  studentId: row.student_id,
  active: row.active !== false,
  createdAt: row.created_at,
  passwordHash: row.password_hash || undefined,
});

export const toArchiveRow = (a: YearArchiveShape) => ({
  id: a.academicYear,
  academic_year: a.academicYear,
  closed_at: a.closedAt,
  stats: a.stats || {},
  data: a.data || {},
});

export const fromArchiveRow = (row: any): YearArchiveShape => ({
  academicYear: row.academic_year,
  closedAt: row.closed_at,
  stats: row.stats || {},
  data: row.data || {},
});

// ============================================================
// أدوات عامة
// ============================================================

// القراءة من ذاكرة الجلسة (لا من الجهاز) — البيانات وصلت من Supabase
const memoryRows = <T,>(key: string): T[] => storeRows<T>(key)

// الكتابة في ذاكرة الجلسة فقط — الحفظ الدائم يحدث في Supabase
const setMemory = (key: string, rows: unknown[]) => setStore(key, rows)

function warnSyncError(err: unknown) {
  const e = err as any
  console.warn("Supabase sync error:", {
    table: e?.table,
    code: e?.code,
    message: e?.message,
    details: e?.details,
    hint: e?.hint,
  })
  // تفسير عربي مباشر لأكثر الأخطاء شيوعاً — يظهر في Console تحت التفاصيل
  const msg = String(e?.message || "")
  const code = String(e?.code || "")
  if (code === "42501" || msg.includes("row-level security")) {
    console.warn("⚠️ سبب الفشل المحتمل: جلسة المدرس منتهية أو سياسات ناقصة — سجّل الدخول من جديد وتأكد من تنفيذ 010_repair_align.sql")
  } else if (code === "PGRST204" || msg.includes("Could not find the")) {
    console.warn("⚠️ سبب الفشل المحتمل: عمود ناقص في جدول قاعدة البيانات — نفّذ supabase/migrations/010_repair_align.sql ثم أعد المحاولة")
  } else if (code === "42P01") {
    console.warn("⚠️ سبب الفشل المحتمل: جدول غير موجود في قاعدة البيانات — نفّذ supabase/migrations/010_repair_align.sql")
  } else if (code === "23503") {
    console.warn("⚠️ سبب الفشل المحتمل: السجل مرتبط بصف ناقص (مثلاً مجموعة محذوفة) — ستُنظف تلقائياً في المزامنة القادمة")
  }
  const table = (err as any)?.table ? ` [جدول: ${(err as any).table}]` : "";
  const message = `تعذر الحفظ في قاعدة البيانات${table}: ${explainSupabaseError(err)}`;
  if (lastWarned === message) return;
  lastWarned = message;
  warnedOnce = true;
  // رسائل الاتصال تظهر في صفحة الإعدادات فقط عبر SyncStatus
}

/** تنفيذ حفظ فوري (يُستخدم مع await) */
async function pushRows(dbTable: string, remoteRows: any[]): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;

  const newIds = new Set(remoteRows.map((r) => r.id as string));

  if (remoteRows.length > 0) {
    const { error } = await sb.from(dbTable).upsert(remoteRows, { onConflict: "id" });
    if (error) throw Object.assign(error, { table: dbTable });
  }

  const prevIds = remoteIds[dbTable];
  if (prevIds) {
    const toDelete = [...prevIds].filter((id) => !newIds.has(id));
    if (toDelete.length > 0) {
      const { error } = await sb.from(dbTable).delete().in("id", toDelete);
      if (error) throw Object.assign(error, { table: dbTable });
    }
  }

  remoteIds[dbTable] = newIds;
}

// ------------------------------------------------------------
// طابور تسلسلي: يمنع تسابق عمليات الحفظ
//
// المشكلة التي يحلها: كانت كل عملية حفظ تنطلق فوراً وبالتوازي، فقد
// يصل حفظ الطلاب إلى الخادم قبل حفظ الصفوف التي ينتمون إليها، فيرفضه
// Postgres بخطأ 409 (انتهاك مفتاح أجنبي). التسلسل يضمن الترتيب الصحيح.
// ------------------------------------------------------------
let pushChain: Promise<unknown> = Promise.resolve();

/** هل الخطأ ناتج عن مفتاح أجنبي مفقود؟ (409) */
function isForeignKeyError(err: any): boolean {
  return (
    err?.code === "23503" ||
    /foreign key|violates foreign key constraint/i.test(err?.message || "")
  );
}

/**
 * هل الخطأ «عمود غير موجود» (42703) لعمود بعينه؟
 * يُستخدم للتراجع الآمن عندما تكون قاعدة البيانات لم تُرحَّل بعد
 * (مثلاً عمود phone في exam_attempts المُضاف في 013) — فلا تضيع محاولة الطالب.
 */
function isMissingColumnError(err: any, column: string): boolean {
  if (err?.code !== "42703") return false;
  const msg = String(err?.message || "");
  return msg.includes(column) || /column .* does not exist/i.test(msg);
}

/**
 * رفع كل بيانات ذاكرة الجلسة إلى Supabase بالترتيب الصحيح للتبعيات:
 * الصفوف والمجموعات ← الطلاب ← الاستحقاقات ← المدفوعات ← الحصص ← الحضور
 */
async function pushAllOrdered(): Promise<void> {
  await pushGrades(memoryRows<GradeShape>(STORAGE_KEYS.GRADES));
  await pushStudents(memoryRows(STORAGE_KEYS.STUDENTS) as any[]);
  await pushDues(memoryRows(STORAGE_KEYS.DUES) as any[]);
  await pushPayments(memoryRows(STORAGE_KEYS.PAYMENTS) as any[]);
  await pushExams(memoryRows(STORAGE_KEYS.EXAMS) as any[]);
  await pushExamAttempts(memoryRows(STORAGE_KEYS.EXAM_ATTEMPTS) as any[]);
  await pushSessions(memoryRows(STORAGE_KEYS.SESSIONS) as any[]);
  await pushAttendance(memoryRows(STORAGE_KEYS.ATTENDANCE) as any[]);
  // جداول بوابة الطلاب (بعد الطلاب لأن student_accounts مرتبط بهم)
  await pushManualGrades(memoryRows(STORAGE_KEYS.MANUAL_GRADES) as any[]);
  await pushRegistrationRequests(memoryRows(STORAGE_KEYS.REGISTRATION_REQUESTS) as any[]);
  await pushGroupTransferRequests(memoryRows(STORAGE_KEYS.GROUP_TRANSFER_REQUESTS) as any[]);
  await pushStudentHistory(memoryRows(STORAGE_KEYS.STUDENT_HISTORY) as any[]);
  await pushStudentAccounts(memoryRows(STORAGE_KEYS.STUDENT_ACCOUNTS) as any[]);
  await pushInquiries(memoryRows(STORAGE_KEYS.INQUIRIES) as any[]);
}

/** جدولة مزامنة فورية (متسلسلة — مع إعادة محاولة ذكية عند خطأ التبعيات) */
export function queuePush(fn: () => Promise<void>) {
  if (!isSupabaseConfigured() || typeof window === "undefined") return;

  const task = pushChain.then(async () => {
    try {
      await fn();
    } catch (err) {
      // 409: الأب غير موجود بعد في قاعدة البيانات.
      // نرفع كل البيانات بالترتيب الصحيح ثم نعيد المحاولة مرة واحدة.
      if (isForeignKeyError(err)) {
        await pushAllOrdered();
        await fn();
      } else {
        throw err;
      }
    }
  });

  // نُبقي السلسلة حية حتى لو فشلت مهمة (حتى لا تتوقف المزامنة اللاحقة)
  pushChain = task.catch(() => {});

  trackPush(task);
}

// ============================================================
// الدفع (الرفع) — يُستدعى تلقائياً من دوال الحفظ في data-storage
// ============================================================

export function pushGrades(grades: GradeShape[]) {
  return (async () => {
    const gradeRows = grades.map(toGradeRow);
    const groupRows = grades.flatMap(toGroupRows);
    await pushRows("grades", gradeRows);
    await pushRows("groups", groupRows);
  })();
}

export function pushStudents(rows: any[]) {
  // تنظيف المراجع المعلّقة: إن كان الصف/المجموعة محذوفاً من البيانات الحالية
  // نُفرّغ الحقل بدل إرسال مرجع غير موجود (يسبب خطأ 409).
  // مهم: القائمة الفارغة تعني «لم تُحمَّل بعد» وليست «محذوفة» — لذلك لا نُفرّغ
  // أي مرجع إلا إذا كانت قائمة الصفوف محمّلة فعلاً، حتى لا تُفقد بيانات صحيحة
  // (صف/مجموعة الطالب) عند محاولة رفع قبل وصول الصفوف من السحابة.
  const grades = memoryRows<GradeShape>(STORAGE_KEYS.GRADES);
  const gradesLoaded = grades.length > 0;
  const gradeIds = new Set(grades.map((g) => g.id));
  const groupIds = new Set(grades.flatMap((g) => g.groups.map((gr) => gr.id)));

  const cleaned = rows.map((s) => {
    const row = toStudentRow(s);
    if (gradesLoaded && row.grade_id && !gradeIds.has(row.grade_id)) row.grade_id = null;
    if (gradesLoaded && row.group_id && !groupIds.has(row.group_id)) row.group_id = null;
    return row;
  });
  return pushRows("students", cleaned);
}
export function pushDues(rows: any[]) {
  const students = memoryRows<any>(STORAGE_KEYS.STUDENTS);
  const grades = memoryRows<GradeShape>(STORAGE_KEYS.GRADES);
  // لا نُصفّر / لا نُسقط بناءً على قائمة غير محمّلة (فقد تُفقد بيانات صحيحة)
  const studentsLoaded = students.length > 0;
  const gradesLoaded = grades.length > 0;
  const studentIds = new Set(students.map((s) => s.id));
  const groupIds = new Set(grades.flatMap((g) => g.groups.map((gr) => gr.id)));

  const cleaned = rows
    .filter((d) => !studentsLoaded || studentIds.has(d.studentId)) // student_id NOT NULL
    .map((d) => {
      const row = toDueRow(d);
      if (gradesLoaded && row.group_id && !groupIds.has(row.group_id)) row.group_id = null;
      return row;
    });
  return pushRows("dues", cleaned);
}
export function pushPayments(rows: any[]) {
  const students = memoryRows<any>(STORAGE_KEYS.STUDENTS);
  const dues = memoryRows<any>(STORAGE_KEYS.DUES);
  const studentsLoaded = students.length > 0;
  const duesLoaded = dues.length > 0;
  const studentIds = new Set(students.map((s) => s.id));
  const dueIds = new Set(dues.map((d) => d.id));

  const cleaned = rows
    .filter((p) => !studentsLoaded || studentIds.has(p.studentId)) // student_id NOT NULL
    .map((p) => {
      const row = toPaymentRow(p);
      if (duesLoaded && row.due_id && !dueIds.has(row.due_id)) row.due_id = null;
      return row;
    });
  return pushRows("payments", cleaned);
}
export function pushExams(rows: any[]) {
  const grades = memoryRows<GradeShape>(STORAGE_KEYS.GRADES);
  const gradesLoaded = grades.length > 0;
  const gradeIds = new Set(grades.map((g) => g.id));
  const groupIds = new Set(grades.flatMap((g) => g.groups.map((gr) => gr.id)));

  const cleaned = rows.map((e) => {
    const row = toExamRow(e);
    if (gradesLoaded && row.grade_id && !gradeIds.has(row.grade_id)) row.grade_id = null;
    if (gradesLoaded && row.group_id && !groupIds.has(row.group_id)) row.group_id = null;
    return row;
  });
  return pushRows("exams", cleaned);
}
export function pushSessions(rows: any[]) {
  const grades = memoryRows<GradeShape>(STORAGE_KEYS.GRADES);
  const gradesLoaded = grades.length > 0;
  const groupIds = new Set(grades.flatMap((g) => g.groups.map((gr) => gr.id)));
  // group_id NOT NULL — نتجاهل الحصص التي فُقدت مجموعتها.
  // إن لم تكن الصفوف محمّلة بعد لا نُسقط أي حصة (قد تكون مراجعها صحيحة).
  const cleaned = (gradesLoaded ? rows.filter((s) => groupIds.has(s.groupId)) : rows).map(toSessionRow);
  return pushRows("sessions", cleaned);
}
export function pushAttendance(rows: any[]) {
  const sessions = memoryRows<any>(STORAGE_KEYS.SESSIONS);
  const students = memoryRows<any>(STORAGE_KEYS.STUDENTS);
  const sessionsLoaded = sessions.length > 0;
  const studentsLoaded = students.length > 0;
  const sessionIds = new Set(sessions.map((s) => s.id));
  const studentIds = new Set(students.map((s) => s.id));
  const cleaned = rows
    .filter((a) => (!sessionsLoaded || sessionIds.has(a.sessionId)) && (!studentsLoaded || studentIds.has(a.studentId)))
    .map(toAttendanceRow);
  return pushRows("attendance", cleaned);
}
export function pushAnnouncements(rows: any[]) {
  return pushRows("announcements", rows.map(toAnnouncementRow));
}
export function pushHonorees(rows: any[]) {
  return pushRows("honorees", rows.map(toHonoreeRow));
}
export function pushSharedFiles(rows: any[]) {
  return pushRows("shared_files", rows.map(toSharedFileRow));
}
export function pushImportantLinks(rows: any[]) {
  return pushRows("important_links", rows.map(toLinkRow));
}
export function pushYearArchives(rows: YearArchiveShape[]) {
  return pushRows("year_archives", rows.map(toArchiveRow));
}

export function pushManualGrades(rows: any[]) {
  const students = memoryRows<any>(STORAGE_KEYS.STUDENTS);
  const studentsLoaded = students.length > 0;
  const studentIds = new Set(students.map((s) => s.id));
  return pushRows("manual_grades", rows.filter((m) => !studentsLoaded || studentIds.has(m.studentId)).map(toManualGradeRow));
}
export function pushRegistrationRequests(rows: any[]) {
  return pushRows("registration_requests", rows.map(toRegistrationRequestRow));
}
export function pushGroupTransferRequests(rows: any[]) {
  return pushRows("group_transfer_requests", rows.map(toGroupTransferRequestRow));
}
export function pushStudentHistory(rows: any[]) {
  const students = memoryRows<any>(STORAGE_KEYS.STUDENTS);
  const studentsLoaded = students.length > 0;
  const studentIds = new Set(students.map((s) => s.id));
  return pushRows("student_history", rows.filter((h) => !studentsLoaded || studentIds.has(h.studentId)).map(toStudentHistoryRow));
}
export function pushStudentAccounts(rows: any[]) {
  return pushRows("student_accounts", rows.map(toStudentAccountRow));
}

// ============================================================
// الاستفسارات — سؤال واحد من الطالب ورد المعلم عليه
// ============================================================
export const toInquiryRow = (t: any) => ({
  id: t.id,
  student_id: t.studentId,
  student_name: t.studentName || "",
  grade_id: t.gradeId || null,
  group_id: t.groupId || null,
  messages: Array.isArray(t.messages) ? t.messages : [],
  status: t.status || "open",
  created_at: t.createdAt || new Date().toISOString(),
  updated_at: t.updatedAt || t.createdAt || new Date().toISOString(),
});

export const fromInquiryRow = (row: any) => ({
  id: row.id,
  studentId: row.student_id,
  studentName: row.student_name,
  gradeId: nil(row.grade_id),
  groupId: nil(row.group_id),
  messages: Array.isArray(row.messages) ? row.messages : [],
  status: row.status || "open",
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export function pushInquiries(rows: any[]) {
  return pushRows("inquiries", rows.map(toInquiryRow));
}

/** جلب أحدث طلب تسجيل ببريد معين — لمصالحة الحالة على جهاز الطالب بعد الموافقة من جهاز آخر */
export async function fetchRegistrationRequestByEmail(email: string): Promise<any | null> {
  const sb = getSupabase()
  if (!sb) return null
  try {
    const { data, error } = await sb
      .from("registration_requests")
      .select("*")
      .eq("email", (email || "").trim().toLowerCase())
    if (error || !data || data.length === 0) return null
    const rows = (data as any[])
      .map(fromRegistrationRequestRow)
      .sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""))
    return rows[rows.length - 1]
  } catch (e) {
    console.warn("fetchRegistrationRequestByEmail:", e)
    return null
  }
}

/** الطالب يجلب استفساراته الخاصة من Supabase (بدون تخزين محلي — القراءة فقط) */
export async function fetchStudentInquiries(studentId: string): Promise<any[]> {
  const sb = getSupabase()
  if (!sb) return memoryRows<any>(STORAGE_KEYS.INQUIRIES)
  try {
    const { data, error } = await sb.from("inquiries").select("*").eq("student_id", studentId)
    if (error) {
      console.warn("fetchStudentInquiries:", error)
      return memoryRows<any>(STORAGE_KEYS.INQUIRIES)
    }
    return (data as any[] || []).map(fromInquiryRow)
  } catch (e) {
    console.warn("fetchStudentInquiries:", e)
    return memoryRows<any>(STORAGE_KEYS.INQUIRIES)
  }
}

/** الطالب يرسل استفساراً جديداً — الإدراج في Supabase أولاً ثم تحديث ذاكرة الجلسة */
export async function submitInquiryThread(thread: any): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase()
  if (!sb) {
    // بلا Supabase (تطوير/معاينة): ذاكرة الجلسة فقط — لا يُكتب شيء على الجهاز
    setStore(STORAGE_KEYS.INQUIRIES, [...storeRows<any>(STORAGE_KEYS.INQUIRIES), thread])
    return { ok: true }
  }
  const { error } = await sb.from("inquiries").insert(toInquiryRow(thread))
  if (error) {
    console.warn("submitInquiryThread:", error)
    return { ok: false, error: explainSupabaseError(error) }
  }
  // بعد نجاح السحابة فقط نُحدِّث الذاكرة (فإن فشل الإرسال لا يرى الطالب استفساراً وهمياً)
  setStore(STORAGE_KEYS.INQUIRIES, [...storeRows<any>(STORAGE_KEYS.INQUIRIES), thread])
  return { ok: true }
}
const toAttemptRow = (a: any) => {
  // نستخدم العمود JSONB الموجود manual_override لحفظ بيانات المراجعة الجديدة
  // أيضاً؛ وبذلك تتوافق القاعدة المنشورة القديمة من دون انتظار عمود SQL جديد.
  const reviewMeta = {
    ...(a.manualOverride ? {
      score: a.manualOverride.score,
      reason: a.manualOverride.reason || null,
      at: a.manualOverride.at,
    } : {}),
    ...(typeof a.autoScore === "number" ? { autoScore: a.autoScore } : {}),
    ...(typeof a.autoTotal === "number" ? { autoTotal: a.autoTotal } : {}),
    ...(typeof a.manualScore === "number" ? { manualScore: a.manualScore } : {}),
    ...(typeof a.manualTotal === "number" ? { manualTotal: a.manualTotal } : {}),
    ...(a.gradingStatus ? { gradingStatus: a.gradingStatus } : {}),
    ...(a.resultReleasedAt ? { resultReleasedAt: a.resultReleasedAt } : {}),
    ...(a.reviewedAt ? { reviewedAt: a.reviewedAt } : {}),
    ...(a.timedOut === true ? { timedOut: true } : {}),
  }
  return {
    id: a.id,
    exam_id: a.examId,
    student_id: a.studentId || null,
    student_name: a.studentName || "",
    // هاتف الزائر في الاختبارات المفتوحة للجميع (عمود اختياري — يُتجاهل إن لم تُرحَّل القاعدة بعد)
    phone: a.phone || null,
    group_id: a.groupId || "",
    grade_id: a.gradeId || "",
    answers: a.answers || {},
    score: a.score ?? 0,
    total_marks: a.totalMarks ?? 0,
    started_at: a.startedAt || new Date().toISOString(),
    submitted_at: a.submittedAt || new Date().toISOString(),
    duration_seconds: a.durationSeconds ?? 0,
    manual_override: Object.keys(reviewMeta).length > 0 ? reviewMeta : null,
  }
};

const fromAttemptRow = (row: any) => {
  const reviewMeta = row.manual_override && typeof row.manual_override === "object"
    ? row.manual_override
    : null
  return {
    id: row.id,
    examId: row.exam_id,
    studentId: nil(row.student_id),
    studentName: row.student_name,
    phone: nil(row.phone),
    groupId: row.group_id,
    gradeId: row.grade_id,
    answers: row.answers || {},
    score: Number(row.score) || 0,
    totalMarks: Number(row.total_marks) || 0,
    autoScore: typeof reviewMeta?.autoScore === "number" ? reviewMeta.autoScore : undefined,
    autoTotal: typeof reviewMeta?.autoTotal === "number" ? reviewMeta.autoTotal : undefined,
    manualScore: typeof reviewMeta?.manualScore === "number" ? reviewMeta.manualScore : undefined,
    manualTotal: typeof reviewMeta?.manualTotal === "number" ? reviewMeta.manualTotal : undefined,
    gradingStatus: reviewMeta?.gradingStatus === "submitted" || reviewMeta?.gradingStatus === "pending_review" ||
      reviewMeta?.gradingStatus === "partially_reviewed" || reviewMeta?.gradingStatus === "reviewed" ||
      reviewMeta?.gradingStatus === "released"
      ? reviewMeta.gradingStatus
      : undefined,
    resultReleasedAt: typeof reviewMeta?.resultReleasedAt === "string" ? reviewMeta.resultReleasedAt : undefined,
    reviewedAt: typeof reviewMeta?.reviewedAt === "string" ? reviewMeta.reviewedAt : undefined,
    timedOut: reviewMeta?.timedOut === true || undefined,
    startedAt: row.started_at,
    submittedAt: row.submitted_at,
    durationSeconds: Number(row.duration_seconds) || 0,
    manualOverride: reviewMeta && typeof reviewMeta.score === "number"
      ? { score: Number(reviewMeta.score) || 0, reason: reviewMeta.reason || undefined, at: reviewMeta.at || "" }
      : undefined,
  }
};

export function pushExamAttempts(rows: any[]) {
  return (async () => {
    try {
      await pushRows("exam_attempts", rows.map(toAttemptRow));
    } catch (err: any) {
      // الجدول قد لا يكون مُنشأ بعد — لا نكسر باقي المزامنة
      if (err?.code === "42P01" || /does not exist/i.test(err?.message || "")) return;
      // عمود phone لم يُضف بعد (013) — نرفع المحاولات بدونه ولا نوقف المزامنة
      if (isMissingColumnError(err, "phone")) {
        await pushRows("exam_attempts", rows.map((r) => {
          const row = toAttemptRow(r);
          delete row.phone;
          return row;
        }));
        return;
      }
      throw err;
    }
  })();
}

export function pushSetting(key: string, value: string) {
  return (async () => {
    const sb = getSupabase();
    if (!sb) return;
    const { error } = await sb.from("app_settings").upsert(
      { key, value },
      { onConflict: "key" }
    );
    if (error) throw error;
  })();
}

// ============================================================
// السحب (التحميل) — عند فتح لوحة التحكم
// ============================================================

export async function pullAllData(): Promise<{ ok: boolean; migrated: boolean }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, migrated: false };

  try {
    const [
      gradesRes,
      groupsRes,
      studentsRes,
      duesRes,
      paymentsRes,
      examsRes,
      sessionsRes,
      attendanceRes,
      announcementsRes,
      honoreesRes,
      filesRes,
      linksRes,
      archivesRes,
      settingsRes,
      manualGradesRes,
      regRequestsRes,
      transferReqRes,
      studentHistoryRes,
      studentAccountsRes,
      inquiriesRes,
    ] = await Promise.all([
      sb.from("grades").select("*"),
      sb.from("groups").select("*"),
      sb.from("students").select("*"),
      sb.from("dues").select("*"),
      sb.from("payments").select("*"),
      sb.from("exams").select("*"),
      sb.from("sessions").select("*"),
      sb.from("attendance").select("*"),
      sb.from("announcements").select("*"),
      sb.from("honorees").select("*"),
      sb.from("shared_files").select("*"),
      sb.from("important_links").select("*"),
      sb.from("year_archives").select("*"),
      sb.from("app_settings").select("key,value"),
      sb.from("manual_grades").select("*"),
      sb.from("registration_requests").select("*"),
      sb.from("group_transfer_requests").select("*"),
      sb.from("student_history").select("*"),
      sb.from("student_accounts").select("*"),
      sb.from("inquiries").select("*"),
    ]);

    const all = [
      gradesRes,
      groupsRes,
      studentsRes,
      duesRes,
      paymentsRes,
      examsRes,
      sessionsRes,
      attendanceRes,
      announcementsRes,
      honoreesRes,
      filesRes,
      linksRes,
      archivesRes,
      settingsRes,
    ];
    // جداول بوابة الطلاب قد لا تكون مُنشأة بعد في مخططات قديمة — نتعامل معها بمرونة
    const portalRes = [manualGradesRes, regRequestsRes, transferReqRes, studentHistoryRes, studentAccountsRes, inquiriesRes];
    for (const res of all) {
      if (res.error) throw res.error;
    }

    let migrated = false;

    // الصفوف والمجموعات
    const localGrades = memoryRows<GradeShape>(STORAGE_KEYS.GRADES);
    if ((groupsRes.data as any[]).length === 0 && (gradesRes.data as any[]).length === 0) {
      if (localGrades.length > 0) {
        migrated = true;
        queuePush(() => pushGrades(localGrades));
      }
    } else {
      const grades = (gradesRes.data as any[]).map((g) => fromGradeRow(g, groupsRes.data as any[]));
      setMemory(STORAGE_KEYS.GRADES, grades);
    }
    remoteIds["grades"] = new Set((gradesRes.data as any[]).map((r) => r.id));
    remoteIds["groups"] = new Set((groupsRes.data as any[]).map((r) => r.id));

    // جداول بسيطة
    const simpleTables: {
      key: string;
      db: string;
      rows: any[];
      fromRow: (r: any) => any;
      push: (rows: any[]) => Promise<void>;
      local: unknown[];
    }[] = [
      { key: STORAGE_KEYS.STUDENTS, db: "students", rows: studentsRes.data as any[], fromRow: fromStudentRow, push: pushStudents, local: memoryRows(STORAGE_KEYS.STUDENTS) },
      { key: STORAGE_KEYS.DUES, db: "dues", rows: duesRes.data as any[], fromRow: fromDueRow, push: pushDues, local: memoryRows(STORAGE_KEYS.DUES) },
      { key: STORAGE_KEYS.PAYMENTS, db: "payments", rows: paymentsRes.data as any[], fromRow: fromPaymentRow, push: pushPayments, local: memoryRows(STORAGE_KEYS.PAYMENTS) },
      { key: STORAGE_KEYS.EXAMS, db: "exams", rows: examsRes.data as any[], fromRow: fromExamRow, push: pushExams, local: memoryRows(STORAGE_KEYS.EXAMS) },
      { key: STORAGE_KEYS.SESSIONS, db: "sessions", rows: sessionsRes.data as any[], fromRow: fromSessionRow, push: pushSessions, local: memoryRows(STORAGE_KEYS.SESSIONS) },
      { key: STORAGE_KEYS.ATTENDANCE, db: "attendance", rows: attendanceRes.data as any[], fromRow: fromAttendanceRow, push: pushAttendance, local: memoryRows(STORAGE_KEYS.ATTENDANCE) },
      { key: STORAGE_KEYS.ANNOUNCEMENTS, db: "announcements", rows: announcementsRes.data as any[], fromRow: fromAnnouncementRow, push: pushAnnouncements, local: memoryRows(STORAGE_KEYS.ANNOUNCEMENTS) },
      { key: STORAGE_KEYS.HONOREES, db: "honorees", rows: honoreesRes.data as any[], fromRow: fromHonoreeRow, push: pushHonorees, local: memoryRows(STORAGE_KEYS.HONOREES) },
      { key: STORAGE_KEYS.SHARED_FILES, db: "shared_files", rows: filesRes.data as any[], fromRow: fromSharedFileRow, push: pushSharedFiles, local: memoryRows(STORAGE_KEYS.SHARED_FILES) },
      { key: STORAGE_KEYS.IMPORTANT_LINKS, db: "important_links", rows: linksRes.data as any[], fromRow: fromLinkRow, push: pushImportantLinks, local: memoryRows(STORAGE_KEYS.IMPORTANT_LINKS) },
    ];

    for (const t of simpleTables) {
      if (t.rows.length === 0 && t.local.length > 0) {
        migrated = true;
        queuePush(() => t.push(t.local as any[]));
      } else if (t.rows.length > 0) {
        setMemory(t.key, t.rows.map(t.fromRow));
      }
      remoteIds[t.db] = new Set(t.rows.map((r) => r.id as string));
    }

    // جداول بوابة الطلاب (مع مرونة إن لم يكن الجدول موجوداً بعد)
    const portalTables: { key: string; res: any; fromRow: (r: any) => any }[] = [
      { key: STORAGE_KEYS.MANUAL_GRADES, res: manualGradesRes, fromRow: fromManualGradeRow },
      { key: STORAGE_KEYS.REGISTRATION_REQUESTS, res: regRequestsRes, fromRow: fromRegistrationRequestRow },
      { key: STORAGE_KEYS.GROUP_TRANSFER_REQUESTS, res: transferReqRes, fromRow: fromGroupTransferRequestRow },
      { key: STORAGE_KEYS.STUDENT_HISTORY, res: studentHistoryRes, fromRow: fromStudentHistoryRow },
      { key: STORAGE_KEYS.STUDENT_ACCOUNTS, res: studentAccountsRes, fromRow: fromStudentAccountRow },
      { key: STORAGE_KEYS.INQUIRIES, res: inquiriesRes, fromRow: fromInquiryRow },
    ];
    for (const t of portalTables) {
      if (t.res.error) continue; // الجدول غير موجود بعد — سيُنشأ بتشغيل ترحيل 008
      const rows = (t.res.data as any[]) || [];
      if (rows.length === 0) continue;
      setMemory(t.key, rows.map(t.fromRow));
    }
    for (const [t, db] of [
      [manualGradesRes, "manual_grades"],
      [regRequestsRes, "registration_requests"],
      [transferReqRes, "group_transfer_requests"],
      [studentHistoryRes, "student_history"],
      [studentAccountsRes, "student_accounts"],
    ] as [any, string][]) {
      if (!t.error && Array.isArray(t.data)) {
        remoteIds[db] = new Set((t.data as any[]).map((r) => r.id as string));
      }
    }

    // الأرشيف
    const localArchives = memoryRows<YearArchiveShape>(STORAGE_KEYS.YEAR_ARCHIVES);
    if ((archivesRes.data as any[]).length === 0 && localArchives.length > 0) {
      migrated = true;
      queuePush(() => pushYearArchives(localArchives));
    } else if ((archivesRes.data as any[]).length > 0) {
      setMemory(STORAGE_KEYS.YEAR_ARCHIVES, (archivesRes.data as any[]).map(fromArchiveRow));
    }
    remoteIds["year_archives"] = new Set((archivesRes.data as any[]).map((r) => r.id));

    // الإعدادات (السنة الدراسية + إعدادات الموقع مثل رقم الواتساب)
    const settingsRows = (settingsRes.data as any[]) || [];
    const yearSetting = settingsRows.find((s) => s.key === "currentAcademicYear");
    if (yearSetting) {
      setStoreSetting(STORAGE_KEYS.CURRENT_ACADEMIC_YEAR, yearSetting.value);
    }
    // باقي الإعدادات تُحفظ في ذاكرة الجلسة بنفس مفتاحها (وأصلها app_settings في السحابة)
    for (const s of settingsRows) {
      if (s.key !== "currentAcademicYear") {
        setStoreSetting(s.key, s.value);
      }
    }

    // محاولات الاختبار اختيارية (الجدول يُضاف في ترحيل 006)
    try {
      const attemptsRes = await sb.from("exam_attempts").select("*")
      if (!attemptsRes.error) {
        const localAttempts = memoryRows(STORAGE_KEYS.EXAM_ATTEMPTS)
        if ((attemptsRes.data as any[]).length === 0 && localAttempts.length > 0) {
          migrated = true
          queuePush(() => pushExamAttempts(localAttempts as any[]))
        } else if ((attemptsRes.data as any[]).length > 0) {
          setMemory(STORAGE_KEYS.EXAM_ATTEMPTS, (attemptsRes.data as any[]).map(fromAttemptRow))
        }
        remoteIds["exam_attempts"] = new Set((attemptsRes.data as any[]).map((r) => r.id))
      }
    } catch {
      /* الجدول غير موجود بعد */
    }

    // بيانات السحابة الآن في ذاكرة الجلسة: نبلّغ الصفحات لتُحدِّث عرضها،
    // ونمسح أي أثر قديم في المتصفح (لا تخزين محلي للبيانات إطلاقاً)
    purgeLegacyLocalStorage();
    notifyStoreUpdate();

    return { ok: true, migrated };
  } catch (err) {
    console.warn("Supabase pull failed:", err);
    return { ok: false, migrated: false };
  }
}

// ============================================================
// الصفحة الرئيسية العامة (بدون تسجيل دخول)
// ============================================================

export interface PublicData {
  announcements: ReturnType<typeof fromAnnouncementRow>[];
  honorees: ReturnType<typeof fromHonoreeRow>[];
  files: ReturnType<typeof fromSharedFileRow>[];
  links: ReturnType<typeof fromLinkRow>[];
  grades: { id: string; name: string }[];
  /** حقول الجدول الآمنة فقط: بدون أسعار أو أعداد طلاب */
  groups: { id: string; gradeId: string; name: string; days: string[]; startTime: string; endTime: string }[];
  settings: Record<string, string>;
  /** false = Supabase متصل لكن ترحيل API الآمن للاختبارات غير موجود/فشل. */
  examsAvailable: boolean;
  exams: ReturnType<typeof fromExamRow>[];
}

// ============================================================
// جلسة الاختبار ذات ساعة الخادم (Migration 015)
// ============================================================
// لا تحمل هذه الدوال مفتاح التصحيح إلى الخادم من العميل. الخادم يحدد بداية
// الجلسة ونهايتها، ولا يقبل حفظ إجابات جديدة بعد expiresAt.

export interface OnlineExamSessionInput {
  sessionId: string;
  attemptId: string;
  examId: string;
  studentId?: string;
  studentName: string;
  phone?: string;
  gradeId: string;
  groupId: string;
}

export interface OnlineExamTimerSession {
  id: string;
  secret: string;
  attemptId: string;
  startedAt: string;
  expiresAt: string;
}

export interface OnlineExamTimerStartResult {
  /** false تعني بيئة معاينة بلا Supabase؛ لا نعاملها كخطأ ترحيل. */
  configured: boolean;
  session?: OnlineExamTimerSession;
  error?: string;
}

/** يبدأ المؤقت من PostgreSQL. في موقع مهيأ لا نسمح بالبدء إن لم يُشغّل ترحيل 015. */
export async function startOnlineExamTimerSession(input: OnlineExamSessionInput): Promise<OnlineExamTimerStartResult> {
  const sb = getSupabase();
  if (!sb) {
    return isSupabaseConfigured()
      ? { configured: true, error: "تعذر الاتصال بخدمة جلسات الاختبار" }
      : { configured: false };
  }
  const { data, error } = await sb.rpc("start_online_exam_session", {
    p_session_id: input.sessionId,
    p_attempt_id: input.attemptId,
    p_exam_id: input.examId,
    p_student_id: input.studentId || null,
    p_student_name: input.studentName,
    p_phone: input.phone || null,
    p_grade_id: input.gradeId,
    p_group_id: input.groupId,
  });
  if (error || !data || typeof data !== "object") {
    console.warn("startOnlineExamTimerSession:", error);
    return { configured: true, error: error?.message || "تعذر بدء جلسة الاختبار الآمنة" };
  }
  const row = data as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.secret !== "string" ||
      typeof row.attemptId !== "string" || typeof row.startedAt !== "string" ||
      typeof row.expiresAt !== "string") {
    return { configured: true, error: "استجابة جلسة الاختبار غير صالحة" };
  }
  return {
    configured: true,
    session: {
      id: row.id,
      secret: row.secret,
      attemptId: row.attemptId,
      startedAt: row.startedAt,
      expiresAt: row.expiresAt,
    },
  };
}

/** يحفظ آخر إجابات الطالب في جلسة الخادم. */
export async function saveOnlineExamTimerProgress(
  session: Pick<OnlineExamTimerSession, "id" | "secret">,
  answers: Record<string, unknown>
): Promise<{ ok: boolean; state?: "saved" | "expired" | "submitted"; error?: string }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: "Supabase غير متصل" };
  const { data, error } = await sb.rpc("save_online_exam_progress", {
    p_session_id: session.id,
    p_session_secret: session.secret,
    p_answers: answers,
  });
  if (error || !data || typeof data !== "object") {
    console.warn("saveOnlineExamTimerProgress:", error);
    return { ok: false, error: error?.message || "تعذر حفظ تقدم الاختبار" };
  }
  const state = (data as Record<string, unknown>).state;
  if (state !== "saved" && state !== "expired" && state !== "submitted") {
    return { ok: false, error: "استجابة حفظ التقدم غير صالحة" };
  }
  return { ok: state === "saved", state };
}

export interface OnlineExamAnswerFeedback {
  choiceId?: string;
  text?: string;
  isTrue?: boolean;
}

/** مفاتيح مسموح بإظهارها لجلسة الطالب فقط بحسب إعداد afterEach / atEnd. */
export async function getOnlineExamAnswerFeedback(
  session: Pick<OnlineExamTimerSession, "id" | "secret">
): Promise<{ ok: boolean; answers?: Record<string, OnlineExamAnswerFeedback>; error?: string }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: "Supabase غير متصل" };
  const { data, error } = await sb.rpc("get_online_exam_answer_feedback", {
    p_session_id: session.id,
    p_session_secret: session.secret,
  });
  if (error || !data || typeof data !== "object") {
    console.warn("getOnlineExamAnswerFeedback:", error);
    return { ok: false, error: error?.message || "تعذر جلب تغذية الإجابة الراجعة" };
  }
  const answers = (data as Record<string, unknown>).answers;
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    return { ok: false, error: "استجابة تغذية الإجابة غير صالحة" };
  }
  return { ok: true, answers: answers as Record<string, OnlineExamAnswerFeedback> };
}

/** نسخة محاولة آمنة مع مفاتيح موضوعية أصدرها الخادم لهذه الجلسة فقط. */
export type OnlineExamTimerResultAttempt = ReturnType<typeof fromAttemptRow> & {
  answerFeedback?: Record<string, OnlineExamAnswerFeedback>
}

/**
 * يستعيد محاولة واحدة بالسر العشوائي الذي أصدره الخادم عند البدء. الدالة لا
 * تقرأ exam_attempts مباشرة؛ التعليقات ودرجات المقال لا تصل قبل الإطلاق.
 */
export async function getOnlineExamTimerResult(
  session: Pick<OnlineExamTimerSession, "id" | "secret">
): Promise<{
  ok: boolean
  state?: "in_progress" | "submitted"
  attempt?: OnlineExamTimerResultAttempt
  feedback?: Record<string, OnlineExamAnswerFeedback>
  error?: string
}> {
  const sb = getSupabase()
  if (!sb) return { ok: false, error: "Supabase غير متصل" }
  const { data, error } = await sb.rpc("get_online_exam_result", {
    p_session_id: session.id,
    p_session_secret: session.secret,
  })
  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    console.warn("getOnlineExamTimerResult:", error)
    return { ok: false, error: error?.message || "تعذر استعادة نتيجة الاختبار" }
  }
  const row = data as Record<string, unknown>
  if (row.state === "in_progress") return { ok: true, state: "in_progress" }
  if (row.state !== "submitted" || !row.attempt || typeof row.attempt !== "object" || Array.isArray(row.attempt)) {
    return { ok: false, error: "استجابة نتيجة الاختبار غير صالحة" }
  }
  const rawFeedback = row.feedback
  const feedback = rawFeedback && typeof rawFeedback === "object" && !Array.isArray(rawFeedback)
    ? rawFeedback as Record<string, OnlineExamAnswerFeedback>
    : {}
  return {
    ok: true,
    state: "submitted",
    attempt: {
      ...fromAttemptRow(row.attempt),
      answerFeedback: feedback,
    },
    feedback,
  }
}

/** يسلم الجلسة المعتمدة؛ يرجع المحاولة التي حسب الخادم جزأها الموضوعي. */
export async function submitOnlineExamTimerSession(
  session: Pick<OnlineExamTimerSession, "id" | "secret">,
  answers: Record<string, unknown>
): Promise<{ ok: boolean; attempt?: any; timedOut?: boolean; error?: string }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: "Supabase غير متصل" };
  const { data, error } = await sb.rpc("submit_online_exam_session", {
    p_session_id: session.id,
    p_session_secret: session.secret,
    p_answers: answers,
  });
  if (error || !data || typeof data !== "object") {
    console.warn("submitOnlineExamTimerSession:", error);
    return { ok: false, error: error?.message || "تعذر تسليم الاختبار إلى الخادم" };
  }
  const row = data as Record<string, any>;
  const attempt = row.attempt;
  if (row.state !== "submitted" || !attempt || typeof attempt !== "object" || typeof attempt.id !== "string") {
    return { ok: false, error: "لم يؤكد الخادم تسليم الاختبار" };
  }
  return { ok: true, attempt, timedOut: row.timedOut === true || attempt.timedOut === true };
}

export async function submitPublicHonoree(h: any): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb.from("honorees").insert(toHonoreeRow(h));
  if (error && error.code !== "23505") {
    console.warn("submitPublicHonoree:", error);
  }
}

/** جلب صف طالب واحد بالمعرف — مسار دخول الطالب من جهازه (لا يحمل قائمة الطلاب) */
export async function fetchStudentById(studentId: string): Promise<any | null> {
  const sb = getSupabase()
  if (!sb || !studentId) return null
  const { data, error } = await sb.from("students").select("*").eq("id", studentId).maybeSingle()
  if (error || !data) return null
  return fromStudentRow(data)
}

/**
 * حساب بوابة الطالب من السحابة بالبريد — يتيح الدخول من أي جهاز في العالم
 * دون أي نسخة محلية (كلمة المرور الحالية وحالة التفعيل من Supabase مباشرة).
 */
export async function fetchStudentAccountByEmail(email: string): Promise<any | null> {
  const sb = getSupabase();
  const mail = (email || "").trim().toLowerCase();
  if (!sb || !mail) return null;
  // المعرف في الجدول هو البريد نفسه — ونبحث أيضاً في عمود email احتياطاً
  const byId = await sb.from("student_accounts").select("*").eq("id", mail).limit(1);
  const row = (!byId.error && byId.data && byId.data[0])
    ? byId.data[0]
    : null;
  if (row) return fromStudentAccountRow(row);
  const byMail = await sb.from("student_accounts").select("*").ilike("email", mail).limit(1);
  if (byMail.error || !byMail.data || !byMail.data[0]) return null;
  return fromStudentAccountRow(byMail.data[0]);
}

export async function fetchPublicData(): Promise<PublicData | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const [ann, hon, files, links, grades, groups, settings, exams] = await Promise.all([
    sb.from("announcements").select("*"),
    sb.from("honorees").select("*"),
    sb.from("shared_files").select("*"),
    sb.from("important_links").select("*"),
    sb.from("grades").select("id,name"),
    // حقول الجدول الآمنة فقط (أيام + أوقات) — لا أسعار ولا أعداد طلاب
    sb.from("groups").select("id,grade_id,name,days,start_time,end_time"),
    sb.from("app_settings").select("key,value"),
    // Migration 015: RPC تُنقّي مفاتيح الإجابات داخل PostgreSQL قبل الشبكة.
    sb.rpc("get_public_online_exams"),
  ]);

  if (ann.error || hon.error || files.error || links.error || grades.error || groups.error || settings.error) {
    console.warn("Public data fetch failed:", ann.error || hon.error || files.error || links.error);
    return null;
  }

  const settingsMap: Record<string, string> = {};
  for (const s of (settings.data as any[]) || []) {
    settingsMap[s.key] = s.value;
  }

  return {
    announcements: (ann.data as any[]).map(fromAnnouncementRow),
    honorees: (hon.data as any[]).map(fromHonoreeRow),
    files: (files.data as any[]).map(fromSharedFileRow),
    links: (links.data as any[]).map(fromLinkRow),
    grades: (grades.data as any[]).map((g) => ({ id: g.id, name: g.name })),
    groups: (groups.data as any[]).map((g) => ({
      id: g.id,
      gradeId: g.grade_id,
      name: g.name,
      days: Array.isArray(g.days) ? g.days : [],
      startTime: g.start_time || "",
      endTime: g.end_time || "",
    })),
    settings: settingsMap,
    examsAvailable: !exams.error && Array.isArray(exams.data),
    exams: exams.error || !Array.isArray(exams.data) ? [] : (exams.data as any[])
      .map(fromExamRow)
      .filter((e: any) => e.deliveryMode === "online" && e.allowOnline),
  };
}

// ============================================================
// بوابة الطلاب — إدخال عام (بدون تسجيل دخول) وقراءة بيانات الطالب
// ============================================================

/** إرسال طلب تسجيل جديد من بوابة الطالب (يعمل مع وبدون Supabase) */
export async function submitRegistrationRequest(request: any): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase()
  if (!sb) {
    // بلا Supabase (تطوير/معاينة): ذاكرة الجلسة فقط — لا يُسجَّل أي شيء على الجهاز
    setStore(STORAGE_KEYS.REGISTRATION_REQUESTS, [...storeRows<any>(STORAGE_KEYS.REGISTRATION_REQUESTS), request])
    return { ok: true }
  }
  // الموقع المنشور: الطلب يذهب إلى Supabase مباشرة — لا تخزين محلي للبيانات على جهاز الطالب
  const { error } = await sb.from("registration_requests").insert(toRegistrationRequestRow(request))
  if (error) {
    console.warn("submitRegistrationRequest:", error)
    return { ok: false, error: explainSupabaseError(error) }
  }
  // بعد نجاح السحابة فقط نُحدِّث ذاكرة الجلسة للعرض الفوري (الأصل في Supabase)
  setStore(STORAGE_KEYS.REGISTRATION_REQUESTS, [...storeRows<any>(STORAGE_KEYS.REGISTRATION_REQUESTS), request])
  return { ok: true }
}

/** إرسال طلب انضمام لمجموعة أخرى من بوابة الطالب */
export async function submitGroupTransferRequest(request: any): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase()
  if (!sb) {
    // بلا Supabase (تطوير/معاينة): ذاكرة الجلسة فقط — لا يُسجَّل أي شيء على الجهاز
    setStore(STORAGE_KEYS.GROUP_TRANSFER_REQUESTS, [...storeRows<any>(STORAGE_KEYS.GROUP_TRANSFER_REQUESTS), request])
    return { ok: true }
  }
  // سحابي خالص: الطلب يذهب لقاعدة البيانات مباشرة — لا نسخة على جهاز الطالب
  const { error } = await sb.from("group_transfer_requests").insert(toGroupTransferRequestRow(request))
  if (error) {
    console.warn("submitGroupTransferRequest:", error)
    return { ok: false, error: explainSupabaseError(error) }
  }
  // بعد نجاح السحابة فقط نُحدِّث ذاكرة الجلسة للعرض الفوري (الأصل في Supabase)
  setStore(STORAGE_KEYS.GROUP_TRANSFER_REQUESTS, [...storeRows<any>(STORAGE_KEYS.GROUP_TRANSFER_REQUESTS), request])
  return { ok: true }
}

export interface StudentPortalData {
  student: any
  gradeName: string
  groupName: string
  groupStartTime: string
  groupEndTime: string
  groupDays: string[]
  manualGrades: any[]
  examAttempts: any[]
  dues: any[]
  payments: any[]
  attendance: any[]
  honorees: any[]
  /** كل متفوقي صفه — للوحة الشرف داخل البوابة */
  gradeHonorees: any[]
  history: any[]
  transferRequests: any[]
  /** إعلانات صفه فقط */
  announcements: any[]
  /** اختبارات صفه/مجموعته فقط */
  exams: any[]
  /** مجموعات صفه (لطلب النقل) */
  gradeGroups: { id: string; name: string; days: string[]; startTime: string; endTime: string }[]
}

/**
 * جلب كل بيانات طالب مسجَّل الدخول للبوابة (قراءة عامة — بياناته فقط تُعرض).
 * تعتمد على سياسات القراءة العامة الموجودة في المخطط.
 */
export async function fetchStudentPortalData(studentId: string): Promise<StudentPortalData | null> {
  const sb = getSupabase()
  if (!sb) return null

  try {
    const [studentsRes, groupsRes, gradesRes, manualRes, duesRes, paymentsRes, attRes, honRes, histRes, transferRes, annRes, examsRes] =
      await Promise.all([
        sb.from("students").select("*"),
        sb.from("groups").select("id,grade_id,name,days,start_time,end_time"),
        sb.from("grades").select("id,name"),
        sb.from("manual_grades").select("*"),
        sb.from("dues").select("*"),
        sb.from("payments").select("*"),
        sb.from("attendance").select("*"),
        sb.from("honorees").select("*"),
        sb.from("student_history").select("*"),
        sb.from("group_transfer_requests").select("*"),
        sb.from("announcements").select("*"),
        // لا نقرأ exams الخام من بوابة الطالب؛ RPC 015 ينقّي المفاتيح أولاً.
        sb.rpc("get_public_online_exams"),
      ])

    if (studentsRes.error) return null
    const student = (studentsRes.data as any[]).find((s) => s.id === studentId)
    if (!student) return null

    const group = (groupsRes.data as any[] || []).find((g) => g.id === student.group_id)
    const grade = (gradesRes.data as any[] || []).find((g) => g.id === student.grade_id)

    const manual = manualRes.error ? [] : (manualRes.data as any[] || [])
    const dues = duesRes.error ? [] : (duesRes.data as any[] || [])
    const payments = paymentsRes.error ? [] : (paymentsRes.data as any[] || [])
    const att = attRes.error ? [] : (attRes.data as any[] || [])
    const hon = honRes.error ? [] : (honRes.data as any[] || [])
    const hist = histRes.error ? [] : (histRes.data as any[] || [])
    const transfers = transferRes.error ? [] : (transferRes.data as any[] || [])
    const anns = annRes.error ? [] : (annRes.data as any[] || [])
    const examRows = examsRes.error || !Array.isArray(examsRes.data) ? [] : examsRes.data as any[]

    // مجموعات صفه (لطلب النقل + جدول مواعيده)
    const gradeGroupsAll = (groupsRes.data as any[] || []).filter((g) => g.grade_id === student.grade_id)
    const gradeGroupIds = new Set(gradeGroupsAll.map((g) => g.id))

    return {
      student: fromStudentRow(student),
      gradeName: grade?.name || "",
      groupName: group?.name || "",
      groupStartTime: group?.start_time || "",
      groupEndTime: group?.end_time || "",
      groupDays: Array.isArray(group?.days) ? group.days : [],
      manualGrades: manual.filter((m) => m.student_id === studentId).map(fromManualGradeRow),
      // تعاد محاولات الاختبار من RPC get_online_exam_result بسر الجلسة في
      // صفحة الطالب؛ لا نقرأ جدول exam_attempts الخام من بوابة anon.
      examAttempts: [],
      dues: dues.filter((d) => d.student_id === studentId).map(fromDueRow),
      payments: payments.filter((p) => p.student_id === studentId).map(fromPaymentRow),
      attendance: att.filter((a) => a.student_id === studentId).map(fromAttendanceRow),
      honorees: hon.filter((h) => h.student_id === studentId).map(fromHonoreeRow),
      // لوحة شرف صفه: متفوقو مجموعات صفه فقط
      gradeHonorees: hon.filter((h) => gradeGroupIds.has(h.group_id)).map(fromHonoreeRow),
      history: hist.filter((h) => h.student_id === studentId).map(fromStudentHistoryRow),
      transferRequests: transfers.filter((t) => t.student_id === studentId).map(fromGroupTransferRequestRow),
      // إعلانات صفه فقط (المستهدف فارغ = عام)
      announcements: anns
        .map(fromAnnouncementRow)
        .filter((a: any) => {
          const targets = a.targetGradeIds || []
          return targets.length === 0 || targets.includes(student.grade_id)
        }),
      // اختبارات صفه/مجموعته فقط
      exams: examRows
        .map(fromExamRow)
        .filter((e: any) => e.deliveryMode === "online" && !!e.allowOnline && (!e.gradeId || e.gradeId === student.grade_id))
        .filter((e: any) => {
          const targets = e.targetGroupIds || []
          return targets.length === 0 || targets.includes(student.group_id)
        }),
      gradeGroups: gradeGroupsAll.map((g) => ({
        id: g.id,
        name: g.name,
        days: Array.isArray(g.days) ? g.days : [],
        startTime: g.start_time || "",
        endTime: g.end_time || "",
      })),
    }
  } catch (e) {
    console.warn("fetchStudentPortalData:", e)
    return null
  }
}

// ============================================================
// أدوات إدارية
// ============================================================

/** حذف كل بيانات Supabase (تُستخدم مع "حذف جميع البيانات") */
export async function clearAllRemote(): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  for (const db of DB_TABLES) {
    const { error } = await sb.from(db).delete().neq("id", "__none__");
    if (error) throw error;
  }
  const attemptsClear = await sb.from("exam_attempts").delete().neq("id", "__none__");
  if (attemptsClear.error && attemptsClear.error.code !== "42P01") throw attemptsClear.error;
  const { error } = await sb.from("app_settings").delete().neq("key", "__none__");
  if (error) throw error;
  remoteIds = {};
}

/** دفع كل بيانات ذاكرة الجلسة إلى Supabase (يُستخدم بعد استيراد ملف JSON) */
export async function pushAllToCloud(): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  await clearAllRemote();
  const grades = memoryRows<GradeShape>(STORAGE_KEYS.GRADES);
  await pushGrades(grades);
  await pushStudents(memoryRows(STORAGE_KEYS.STUDENTS) as any[]);
  await pushDues(memoryRows(STORAGE_KEYS.DUES) as any[]);
  await pushPayments(memoryRows(STORAGE_KEYS.PAYMENTS) as any[]);
  await pushExams(memoryRows(STORAGE_KEYS.EXAMS) as any[]);
  await pushSessions(memoryRows(STORAGE_KEYS.SESSIONS) as any[]);
  await pushAttendance(memoryRows(STORAGE_KEYS.ATTENDANCE) as any[]);
  await pushAnnouncements(memoryRows(STORAGE_KEYS.ANNOUNCEMENTS) as any[]);
  await pushHonorees(memoryRows(STORAGE_KEYS.HONOREES) as any[]);
  await pushSharedFiles(memoryRows(STORAGE_KEYS.SHARED_FILES) as any[]);
  await pushImportantLinks(memoryRows(STORAGE_KEYS.IMPORTANT_LINKS) as any[]);
  await pushYearArchives(memoryRows<YearArchiveShape>(STORAGE_KEYS.YEAR_ARCHIVES));
  await pushExamAttempts(memoryRows(STORAGE_KEYS.EXAM_ATTEMPTS) as any[]);
  const year = storeSetting(STORAGE_KEYS.CURRENT_ACADEMIC_YEAR, "");
  if (year) await pushSetting("currentAcademicYear", year);
}

// ============================================================
// حالة المزامنة الحقيقية (للتأكد أن البيانات تُحفظ فعلاً في قاعدة البيانات)
// ============================================================

export type SyncState = "idle" | "saving" | "saved" | "error"

export interface SyncStatus {
  state: SyncState
  /** آخر وقت نجح فيه الحفظ في Supabase */
  lastSavedAt: string | null
  /** آخر رسالة خطأ (إن وُجدت) */
  lastError: string | null
  /** عدد عمليات الحفظ الجارية الآن */
  pending: number
}

const syncStatus: SyncStatus = {
  state: "idle",
  lastSavedAt: null,
  lastError: null,
  pending: 0,
}

type SyncListener = (s: SyncStatus) => void
const syncListeners = new Set<SyncListener>()

function emitSyncStatus() {
  for (const l of syncListeners) {
    try {
      l({ ...syncStatus })
    } catch {
      /* ignore */
    }
  }
}

export function getSyncStatus(): SyncStatus {
  return { ...syncStatus }
}

export function onSyncStatus(listener: SyncListener): () => void {
  syncListeners.add(listener)
  listener({ ...syncStatus })
  return () => syncListeners.delete(listener)
}

/** يُستدعى داخلياً من queuePush لتتبع كل عملية حفظ */
function trackPush(promise: Promise<void>) {
  syncStatus.pending += 1
  syncStatus.state = "saving"
  emitSyncStatus()
  promise
    .then(() => {
      syncStatus.pending = Math.max(0, syncStatus.pending - 1)
      syncStatus.lastSavedAt = new Date().toISOString()
      syncStatus.lastError = null
      if (syncStatus.pending === 0) syncStatus.state = "saved"
      emitSyncStatus()
    })
    .catch((err) => {
      syncStatus.pending = Math.max(0, syncStatus.pending - 1)
      syncStatus.lastError = err?.message || String(err)
      syncStatus.state = "error"
      emitSyncStatus()
      warnSyncError(err)
    })
}

export interface ConnectionCheck {
  ok: boolean
  /** هل نجحت القراءة من Supabase؟ */
  canRead: boolean
  /** هل نجحت الكتابة في Supabase؟ (اختبار فعلي) */
  canWrite: boolean
  /** زمن الاستجابة بالمللي ثانية */
  latencyMs: number
  /** عدد السجلات الفعلي داخل قاعدة البيانات لكل جدول */
  counts: Record<string, number>
  error?: string
}

/**
 * فحص حقيقي للاتصال: قراءة + كتابة فعلية في Supabase،
 * مع إحصاء عدد السجلات المخزنة فعلاً في كل جدول.
 */
export async function checkSupabaseConnection(): Promise<ConnectionCheck> {
  const started = Date.now()
  const result: ConnectionCheck = {
    ok: false,
    canRead: false,
    canWrite: false,
    latencyMs: 0,
    counts: {},
  }

  const sb = getSupabase()
  if (!sb) {
    result.error = "متغيرات Supabase غير مُعدّة في هذا الموقع"
    result.latencyMs = Date.now() - started
    return result
  }

  try {
    // 1) اختبار كتابة فعلي في جدول الإعدادات
    const stamp = new Date().toISOString()
    const { error: writeErr } = await sb
      .from("app_settings")
      .upsert({ key: "__connection_check__", value: stamp }, { onConflict: "key" })
    if (writeErr) throw writeErr

    // 2) اختبار قراءة للتأكد أن ما كُتب موجود فعلاً في قاعدة البيانات
    const { data: readBack, error: readErr } = await sb
      .from("app_settings")
      .select("value")
      .eq("key", "__connection_check__")
      .maybeSingle()
    if (readErr) throw readErr

    result.canWrite = readBack?.value === stamp
    result.canRead = true

    // 3) عدّ السجلات الحقيقية داخل قاعدة البيانات
    const counts = await Promise.all(
      DB_TABLES.map(async (t) => {
        const { count, error } = await sb.from(t).select("id", { count: "exact", head: true })
        return [t, error ? -1 : count ?? 0] as const
      })
    )
    for (const [t, c] of counts) result.counts[t] = c

    result.ok = result.canRead && result.canWrite
    if (result.ok) {
      syncStatus.lastError = null
      if (syncStatus.pending === 0 && syncStatus.state === "error") syncStatus.state = "idle"
      emitSyncStatus()
    }
  } catch (err: any) {
    result.error = explainSupabaseError(err)
  }

  result.latencyMs = Date.now() - started
  return result
}

/** ترجمة أخطاء Supabase الشائعة إلى رسالة عربية واضحة مع خطوة الإصلاح */
export function explainSupabaseError(err: any): string {
  const raw = [err?.message, err?.details, err?.hint]
    .filter(Boolean)
    .join(" | ") || String(err ?? "")
  const code = err?.code || ""

  if (code === "23503" || /violates foreign key constraint/i.test(raw)) {
    return (
      "سجل مرتبط غير موجود بعد في قاعدة البيانات (مثل طالب بلا صف). " +
      "تتم إعادة الرفع تلقائياً بالترتيب الصحيح — إن استمر الخطأ اضغط \"مزامنة الآن\"."
    )
  }
  if (code === "23505" || /duplicate key value/i.test(raw)) {
    return "سجل مكرر في قاعدة البيانات — سيُدمج تلقائياً في المحاولة التالية."
  }
  if (/invalid input syntax for type uuid/i.test(raw) || code === "22P02") {
    return (
      "مخطط قاعدة البيانات قديم: عمود id من نوع UUID بينما التطبيق يستخدم معرفات نصية. " +
      "الحل: شغّل ملف supabase/migrations/005_fix_id_types.sql في Supabase ← SQL Editor."
    )
  }
  if (/column .* does not exist/i.test(raw) || code === "42703") {
    return (
      "عمود مفقود في قاعدة البيانات (مخطط قديم). " +
      "الحل: شغّل ملف supabase/migrations/005_fix_id_types.sql في Supabase ← SQL Editor."
    )
  }
  if (/new row violates row-level security/i.test(raw)) {
    return (
      "سياسة الحماية (RLS) لا تسمح بهذا الإدراج — سياسة إدراج الزوار ناقصة على هذا الجدول. " +
      "الحل: شغّل supabase/migrations/012_anon_submit_fix.sql ثم أعد المحاولة."
    )
  }
  if (/permission denied/i.test(raw) || code === "42501") {
    return (
      "صلاحيات الجداول ناقصة للزوار/المدرس. " +
      "الحل: شغّل supabase/migrations/012_anon_submit_fix.sql (يشمل ويحل محل 004 القديم) ثم أعد المحاولة. " +
      "وإن استمر الخطأ: سجّل الخروج ثم الدخول من جديد."
    )
  }
  if (/does not exist/i.test(raw) || code === "42P01") {
    return (
      "أحد الجداول غير موجود في قاعدة البيانات. " +
      "الحل: شغّل ملف supabase/schema.sql في Supabase ← SQL Editor."
    )
  }
  if (/row-level security|violates row-level/i.test(raw)) {
    return (
      "سياسة الحماية (RLS) تمنع الكتابة. تأكد من تسجيل الدخول، ثم شغّل supabase/migrations/012_anon_submit_fix.sql."
    )
  }
  if (/JWT|not authenticated|invalid token|session/i.test(raw)) {
    return "انتهت جلسة الدخول. سجّل الخروج ثم سجّل الدخول مرة أخرى."
  }
  if (/fetch|network|Failed to fetch/i.test(raw)) {
    return "تعذّر الوصول إلى Supabase — تحقق من اتصال الإنترنت أو رابط المشروع."
  }
  return raw
}


// ============================================================
// تشخيص شامل: يحدد بالضبط أين ولماذا يفشل الحفظ
// ============================================================

export interface TableDiagnostic {
  table: string
  canRead: boolean
  canWrite: boolean
  error?: string
}

export interface Diagnostics {
  /** هل يوجد مستخدم مسجّل دخوله؟ (الكتابة تتطلب ذلك) */
  authenticated: boolean
  userEmail: string | null
  /** الدور الفعلي الذي تراه قاعدة البيانات: anon أو authenticated */
  role: string | null
  tables: TableDiagnostic[]
  /** الخلاصة والحل المقترح */
  summary: string
}

/**
 * يفحص كل جدول على حدة (قراءة ثم كتابة تجريبية داخل معاملة تُلغى)
 * ويحدد ما إذا كانت المشكلة في الجلسة أم في الصلاحيات.
 */
export async function runDiagnostics(): Promise<Diagnostics> {
  const sb = getSupabase()
  const out: Diagnostics = {
    authenticated: false,
    userEmail: null,
    role: null,
    tables: [],
    summary: "",
  }

  if (!sb) {
    out.summary = "متغيرات Supabase غير مُعدّة في هذا الموقع."
    return out
  }

  // 1) حالة الجلسة — الكتابة مسموحة فقط لدور authenticated
  const { data: sessionData } = await sb.auth.getSession()
  const session = sessionData?.session ?? null
  out.authenticated = Boolean(session)
  out.userEmail = session?.user?.email ?? null

  // الدور الفعلي مقروءاً من داخل التوكن
  if (session?.access_token) {
    try {
      const payload = JSON.parse(atob(session.access_token.split(".")[1]))
      out.role = payload?.role ?? null
    } catch {
      out.role = null
    }
  } else {
    out.role = "anon"
  }

  // 2) فحص كل جدول: قراءة + كتابة فعلية (تُحذف بعدها مباشرة)
  for (const t of DB_TABLES) {
    const diag: TableDiagnostic = { table: t, canRead: false, canWrite: false }

    const { error: readErr } = await sb.from(t).select("id").limit(1)
    if (readErr) {
      diag.error = explainSupabaseError(readErr)
    } else {
      diag.canRead = true

      // كتابة سجل اختباري بمعرّف فريد ثم حذفه فوراً
      const probeId = `__probe_${Date.now()}__`
      const { error: writeErr } = await sb.from(t).insert({ id: probeId } as any)

      if (!writeErr) {
        diag.canWrite = true
        await sb.from(t).delete().eq("id", probeId)
      } else if (/null value|not-null|violates foreign key|invalid input/i.test(writeErr.message || "")) {
        // الرفض بسبب قيود الأعمدة يعني أن الصلاحية نفسها سليمة
        diag.canWrite = true
      } else {
        diag.error = explainSupabaseError(writeErr)
      }
    }

    out.tables.push(diag)
  }

  // 3) الخلاصة
  const noWrite = out.tables.filter((t) => !t.canWrite)
  const noRead = out.tables.filter((t) => !t.canRead)

  if (!out.authenticated) {
    out.summary =
      "لا توجد جلسة دخول صالحة — لذلك تراك قاعدة البيانات كزائر (anon) والقراءة تنجح بينما الكتابة تُرفض. " +
      "الحل: سجّل الخروج ثم سجّل الدخول مرة أخرى من صفحة /login."
  } else if (out.role !== "authenticated") {
    out.summary =
      `جلستك موجودة لكن الدور المُرسل إلى قاعدة البيانات هو "${out.role}" وليس "authenticated". ` +
      "الحل: سجّل الخروج وسجّل الدخول من جديد لتحديث التوكن."
  } else if (noWrite.length === out.tables.length) {
    out.summary =
      "الكتابة مرفوضة في كل الجداول رغم تسجيل الدخول — الصلاحيات لم تُطبَّق. " +
      "الحل: شغّل supabase/migrations/004_fix_permissions.sql في SQL Editor ثم أعد الفحص."
  } else if (noWrite.length > 0) {
    out.summary =
      `الكتابة مرفوضة في الجداول التالية فقط: ${noWrite.map((t) => t.table).join("، ")}. ` +
      "شغّل supabase/migrations/004_fix_permissions.sql لمنح الصلاحيات الناقصة."
  } else if (noRead.length > 0) {
    out.summary = `تعذّرت القراءة من: ${noRead.map((t) => t.table).join("، ")}.`
  } else {
    out.summary = "كل شيء سليم — القراءة والكتابة تعملان في جميع الجداول."
  }

  return out
}


/**
 * رفع كل بيانات الجهاز إلى Supabase بالترتيب الصحيح للتبعيات.
 * يُستخدم من زر "رفع بياناتي الآن" لحل أخطاء 409 نهائياً.
 */
export async function forcePushAll(): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: "Supabase غير مُعدّ" };
  try {
    await pushAllOrdered();
    await pushAnnouncements(memoryRows(STORAGE_KEYS.ANNOUNCEMENTS) as any[]);
    await pushHonorees(memoryRows(STORAGE_KEYS.HONOREES) as any[]);
    await pushSharedFiles(memoryRows(STORAGE_KEYS.SHARED_FILES) as any[]);
    await pushImportantLinks(memoryRows(STORAGE_KEYS.IMPORTANT_LINKS) as any[]);
    await pushYearArchives(memoryRows<YearArchiveShape>(STORAGE_KEYS.YEAR_ARCHIVES));
    await pushExamAttempts(memoryRows(STORAGE_KEYS.EXAM_ATTEMPTS) as any[]);
    const year = storeSetting(STORAGE_KEYS.CURRENT_ACADEMIC_YEAR, "");
    if (year) await pushSetting("currentAcademicYear", year);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: explainSupabaseError(err) };
  }
}


// ============================================================
// تشخيص دقيق: يفحص كل جدول وكل سجل ويحدد سبب الفشل بالضبط
// ============================================================

export interface RowFailure {
  id: string
  label: string
  code?: string
  message: string
  /** الحقل/المرجع المسبب للمشكلة إن أمكن تحديده */
  cause?: string
}

export interface TableReport {
  table: string
  memoryCount: number
  remoteCount: number
  pushed: number
  failures: RowFailure[]
  error?: string
}

export interface SyncReport {
  authenticated: boolean
  userEmail: string | null
  role: string | null
  tables: TableReport[]
  summary: string[]
}

/**
 * يرفع كل جدول سجلاً سجلاً عند فشل الدفعة، ليحدد بدقة
 * أي سجل يفشل ولماذا (بدل رسالة 409 غامضة).
 */
export async function diagnoseSync(): Promise<SyncReport> {
  const report: SyncReport = {
    authenticated: false,
    userEmail: null,
    role: null,
    tables: [],
    summary: [],
  }

  const sb = getSupabase()
  if (!sb) {
    report.summary.push("Supabase غير مُعدّ في هذا الموقع.")
    return report
  }

  // 1) الجلسة والدور
  const { data: sessionData } = await sb.auth.getSession()
  const session = sessionData?.session ?? null
  report.authenticated = Boolean(session)
  report.userEmail = session?.user?.email ?? null
  if (session?.access_token) {
    try {
      report.role = JSON.parse(atob(session.access_token.split(".")[1]))?.role ?? null
    } catch {
      report.role = null
    }
  } else {
    report.role = "anon"
  }
  if (!report.authenticated) {
    report.summary.push("⚠️ لا توجد جلسة دخول — الكتابة سترفض. سجّل الدخول مجدداً.")
  }

  // 2) المراجع المتاحة في ذاكرة الجلسة (لكشف المراجع المعلّقة)
  const grades = memoryRows<GradeShape>(STORAGE_KEYS.GRADES)
  const gradeIds = new Set(grades.map((g) => g.id))
  const groupIds = new Set(grades.flatMap((g) => g.groups.map((gr) => gr.id)))
  const studentIds = new Set(memoryRows<any>(STORAGE_KEYS.STUDENTS).map((r) => r.id))
  const dueIds = new Set(memoryRows<any>(STORAGE_KEYS.DUES).map((r) => r.id))
  const sessionIds = new Set(memoryRows<any>(STORAGE_KEYS.SESSIONS).map((r) => r.id))

  // 3) تعريف الجداول بترتيب التبعيات
  const specs: {
    table: string
    key: string
    rows: () => any[]
    map: (r: any) => any
    label: (r: any) => string
    refs?: (r: any) => { field: string; value: any; pool: Set<string> }[]
  }[] = [
    {
      table: "grades", key: STORAGE_KEYS.GRADES,
      rows: () => grades, map: toGradeRow,
      label: (r) => r.name || r.id,
    },
    {
      table: "groups", key: STORAGE_KEYS.GRADES,
      rows: () => grades.flatMap((g) => g.groups.map((gr) => ({ ...gr, __grade: g }))),
      map: (gr) => toGroupRows(gr.__grade).find((x: any) => x.id === gr.id),
      label: (r) => r.name || r.id,
      refs: (r) => [{ field: "grade_id", value: r.__grade?.id, pool: gradeIds }],
    },
    {
      table: "students", key: STORAGE_KEYS.STUDENTS,
      rows: () => memoryRows<any>(STORAGE_KEYS.STUDENTS), map: toStudentRow,
      label: (r) => r.name || r.id,
      refs: (r) => [
        { field: "grade_id", value: r.gradeId, pool: gradeIds },
        { field: "group_id", value: r.groupId, pool: groupIds },
      ],
    },
    {
      table: "dues", key: STORAGE_KEYS.DUES,
      rows: () => memoryRows<any>(STORAGE_KEYS.DUES), map: (r) => toDueRow(r),
      label: (r) => `استحقاق ${r.month}/${r.year}`,
      refs: (r) => [
        { field: "student_id", value: r.studentId, pool: studentIds },
        { field: "group_id", value: r.groupId, pool: groupIds },
      ],
    },
    {
      table: "payments", key: STORAGE_KEYS.PAYMENTS,
      rows: () => memoryRows<any>(STORAGE_KEYS.PAYMENTS), map: (r) => toPaymentRow(r),
      label: (r) => `دفعة ${r.amount}`,
      refs: (r) => [
        { field: "student_id", value: r.studentId, pool: studentIds },
        { field: "due_id", value: r.dueId, pool: dueIds },
      ],
    },
    {
      table: "exams", key: STORAGE_KEYS.EXAMS,
      rows: () => memoryRows<any>(STORAGE_KEYS.EXAMS), map: toExamRow,
      label: (r) => r.title || r.id,
      refs: (r) => [
        { field: "grade_id", value: r.gradeId, pool: gradeIds },
        { field: "group_id", value: r.groupId, pool: groupIds },
      ],
    },
    {
      table: "sessions", key: STORAGE_KEYS.SESSIONS,
      rows: () => memoryRows<any>(STORAGE_KEYS.SESSIONS), map: (r) => toSessionRow(r),
      label: (r) => `حصة ${r.sessionDate}`,
      refs: (r) => [{ field: "group_id", value: r.groupId, pool: groupIds }],
    },
    {
      table: "attendance", key: STORAGE_KEYS.ATTENDANCE,
      rows: () => memoryRows<any>(STORAGE_KEYS.ATTENDANCE), map: (r) => toAttendanceRow(r),
      label: (r) => `حضور ${r.studentId}`,
      refs: (r) => [
        { field: "session_id", value: r.sessionId, pool: sessionIds },
        { field: "student_id", value: r.studentId, pool: studentIds },
      ],
    },
  ]

  for (const spec of specs) {
    const localList = spec.rows()
    const tr: TableReport = {
      table: spec.table,
      memoryCount: localList.length,
      remoteCount: 0,
      pushed: 0,
      failures: [],
    }

    // كشف المراجع المعلّقة في الذاكرة قبل حتى محاولة الرفع
    for (const r of localList) {
      for (const ref of spec.refs?.(r) ?? []) {
        if (ref.value && !ref.pool.has(ref.value)) {
          tr.failures.push({
            id: r.id,
            label: spec.label(r),
            code: "ORPHAN",
            message: `المرجع ${ref.field} يشير إلى سجل غير موجود (${ref.value})`,
            cause: ref.field,
          })
        }
      }
    }

    // محاولة رفع كل سجل على حدة لمعرفة الفاشل بالضبط
    for (const r of localList) {
      const row = spec.map(r)
      if (!row) continue
      const { error } = await sb.from(spec.table).upsert([row], { onConflict: "id" })
      if (error) {
        tr.failures.push({
          id: r.id,
          label: spec.label(r),
          code: error.code,
          message: [error.message, error.details, error.hint].filter(Boolean).join(" | "),
          cause: /Key \((\w+)\)/.exec(error.details || "")?.[1],
        })
      } else {
        tr.pushed++
      }
    }

    const { count } = await sb.from(spec.table).select("id", { count: "exact", head: true })
    tr.remoteCount = count ?? 0

    report.tables.push(tr)
  }

  // 4) الخلاصة
  for (const t of report.tables) {
    if (t.failures.length === 0 && t.memoryCount === t.remoteCount) continue
    if (t.failures.length > 0) {
      const f = t.failures[0]
      report.summary.push(
        `❌ ${t.table}: فشل ${t.failures.length} من ${t.memoryCount} — "${f.label}": ${f.message}`
      )
    } else if (t.memoryCount !== t.remoteCount) {
      report.summary.push(
        `⚠️ ${t.table}: ${t.memoryCount} في ذاكرة الجلسة مقابل ${t.remoteCount} في القاعدة.`
      )
    }
  }
  if (report.summary.length === 0) {
    report.summary.push("✅ كل الجداول متطابقة — كل البيانات محفوظة في قاعدة البيانات.")
  }

  return report
}
