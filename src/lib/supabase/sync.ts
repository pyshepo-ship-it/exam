// ============================================================
// محرك المزامنة مع Supabase
// قاعدة Supabase هي المصدر الحقيقي للبيانات، والـ localStorage
// يعمل كمرآة محلية سريعة (وتعمل الصفحة الرئيسية العامة من Supabase مباشرة).
// ============================================================

import { createClient, isSupabaseConfigured } from "./client";
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
] as const;

function nil<T>(v: T | null | undefined): T | undefined {
  return v === null || v === undefined ? undefined : v
};

// ============================================================
// الخرائط: Local <-> Supabase
// ============================================================

export const toGradeRow = (g: GradeShape) => ({
  id: g.id,
  name: g.name,
  academic_year: g.academicYear,
  created_at: g.createdAt,
});

export const toGroupRows = (g: GradeShape) =>
  g.groups.map((gr: GroupShape) => ({
    id: gr.id,
    grade_id: g.id,
    name: gr.name,
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
  name: s.name,
  phone: s.phone || null,
  grade_id: s.gradeId || null,
  group_id: s.groupId || null,
  status: s.status,
  notes: s.notes || null,
  created_at: s.createdAt,
  updated_at: s.updatedAt,
});

export const fromStudentRow = (row: any) => ({
  id: row.id,
  name: row.name,
  phone: nil(row.phone),
  gradeId: row.grade_id,
  groupId: row.group_id,
  status: row.status,
  notes: nil(row.notes),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toDueRow = (d: any) => ({
  id: d.id,
  student_id: d.studentId,
  group_id: d.groupId || null,
  month: d.month,
  year: d.year,
  amount: d.amount,
  status: d.status,
  created_at: d.createdAt,
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
  amount: p.amount,
  payment_date: p.paymentDate,
  month: p.month,
  year: p.year,
  notes: p.notes || null,
  created_at: p.createdAt,
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

export const toExamRow = (e: any) => ({
  id: e.id,
  grade_id: e.gradeId || null,
  group_id: e.groupId || null,
  title: e.title,
  month: e.month ?? null,
  unit: e.unit || null,
  academic_year: e.academicYear,
  duration: e.duration ?? null,
  total_marks: e.totalMarks ?? null,
  questions: e.questions || [],
  created_at: e.createdAt,
  updated_at: e.updatedAt,
});

export const fromExamRow = (row: any) => ({
  id: row.id,
  gradeId: row.grade_id,
  groupId: nil(row.group_id),
  title: row.title,
  month: row.month ?? undefined,
  unit: nil(row.unit),
  academicYear: row.academic_year,
  duration: row.duration ?? undefined,
  totalMarks: row.total_marks ?? undefined,
  questions: row.questions || [],
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toSessionRow = (s: any) => ({
  id: s.id,
  group_id: s.groupId,
  session_date: s.sessionDate,
  start_time: s.startTime || "",
  end_time: s.endTime || "",
  notes: s.notes || null,
  created_at: s.createdAt,
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
  status: a.status,
  late_minutes: a.lateMinutes ?? null,
  notes: a.notes || null,
  created_at: a.createdAt,
});

const fromAttendanceRow = (row: any) => ({
  id: row.id,
  sessionId: row.session_id,
  studentId: row.student_id,
  status: row.status,
  lateMinutes: nil(row.late_minutes),
  notes: nil(row.notes),
  createdAt: row.created_at,
});

const toAnnouncementRow = (a: any) => ({
  id: a.id,
  title: a.title,
  body: a.body,
  pinned: !!a.pinned,
  created_at: a.createdAt,
});

const fromAnnouncementRow = (row: any) => ({
  id: row.id,
  title: row.title,
  body: row.body,
  pinned: row.pinned,
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

function localRows<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(key);
  try {
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

function setLocal(key: string, rows: unknown[]) {
  localStorage.setItem(key, JSON.stringify(rows));
}

function warnSyncError(err: unknown) {
  console.warn("Supabase sync error:", err);
  if (!warnedOnce) {
    warnedOnce = true;
    import("react-hot-toast")
      .then(({ toast }) =>
        toast.error(`تعذر الحفظ في قاعدة البيانات: ${explainSupabaseError(err)}`, { duration: 8000 })
      )
      .catch(() => {});
  }
}

/** تنفيذ حفظ فوري (يُستخدم مع await) */
async function pushRows(dbTable: string, remoteRows: any[]): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;

  const newIds = new Set(remoteRows.map((r) => r.id as string));

  if (remoteRows.length > 0) {
    const { error } = await sb.from(dbTable).upsert(remoteRows, { onConflict: "id" });
    if (error) throw error;
  }

  const prevIds = remoteIds[dbTable];
  if (prevIds) {
    const toDelete = [...prevIds].filter((id) => !newIds.has(id));
    if (toDelete.length > 0) {
      const { error } = await sb.from(dbTable).delete().in("id", toDelete);
      if (error) throw error;
    }
  }

  remoteIds[dbTable] = newIds;
}

/** جدولة مزامنة فورية (بدون انتظار — مع تنبيه عند الفشل) */
export function queuePush(fn: () => Promise<void>) {
  if (!isSupabaseConfigured() || typeof window === "undefined") return;
  trackPush(fn());
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
  return pushRows("students", rows.map(toStudentRow));
}
export function pushDues(rows: any[]) {
  return pushRows("dues", rows.map(toDueRow));
}
export function pushPayments(rows: any[]) {
  return pushRows("payments", rows.map(toPaymentRow));
}
export function pushExams(rows: any[]) {
  return pushRows("exams", rows.map(toExamRow));
}
export function pushSessions(rows: any[]) {
  return pushRows("sessions", rows.map(toSessionRow));
}
export function pushAttendance(rows: any[]) {
  return pushRows("attendance", rows.map(toAttendanceRow));
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
    for (const res of all) {
      if (res.error) throw res.error;
    }

    let migrated = false;

    // الصفوف والمجموعات
    const localGrades = localRows<GradeShape>(STORAGE_KEYS.GRADES);
    if ((groupsRes.data as any[]).length === 0 && (gradesRes.data as any[]).length === 0) {
      if (localGrades.length > 0) {
        migrated = true;
        queuePush(() => pushGrades(localGrades));
      }
    } else {
      const grades = (gradesRes.data as any[]).map((g) => fromGradeRow(g, groupsRes.data as any[]));
      setLocal(STORAGE_KEYS.GRADES, grades);
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
      { key: STORAGE_KEYS.STUDENTS, db: "students", rows: studentsRes.data as any[], fromRow: fromStudentRow, push: pushStudents, local: localRows(STORAGE_KEYS.STUDENTS) },
      { key: STORAGE_KEYS.DUES, db: "dues", rows: duesRes.data as any[], fromRow: fromDueRow, push: pushDues, local: localRows(STORAGE_KEYS.DUES) },
      { key: STORAGE_KEYS.PAYMENTS, db: "payments", rows: paymentsRes.data as any[], fromRow: fromPaymentRow, push: pushPayments, local: localRows(STORAGE_KEYS.PAYMENTS) },
      { key: STORAGE_KEYS.EXAMS, db: "exams", rows: examsRes.data as any[], fromRow: fromExamRow, push: pushExams, local: localRows(STORAGE_KEYS.EXAMS) },
      { key: STORAGE_KEYS.SESSIONS, db: "sessions", rows: sessionsRes.data as any[], fromRow: fromSessionRow, push: pushSessions, local: localRows(STORAGE_KEYS.SESSIONS) },
      { key: STORAGE_KEYS.ATTENDANCE, db: "attendance", rows: attendanceRes.data as any[], fromRow: fromAttendanceRow, push: pushAttendance, local: localRows(STORAGE_KEYS.ATTENDANCE) },
      { key: STORAGE_KEYS.ANNOUNCEMENTS, db: "announcements", rows: announcementsRes.data as any[], fromRow: fromAnnouncementRow, push: pushAnnouncements, local: localRows(STORAGE_KEYS.ANNOUNCEMENTS) },
      { key: STORAGE_KEYS.HONOREES, db: "honorees", rows: honoreesRes.data as any[], fromRow: fromHonoreeRow, push: pushHonorees, local: localRows(STORAGE_KEYS.HONOREES) },
      { key: STORAGE_KEYS.SHARED_FILES, db: "shared_files", rows: filesRes.data as any[], fromRow: fromSharedFileRow, push: pushSharedFiles, local: localRows(STORAGE_KEYS.SHARED_FILES) },
      { key: STORAGE_KEYS.IMPORTANT_LINKS, db: "important_links", rows: linksRes.data as any[], fromRow: fromLinkRow, push: pushImportantLinks, local: localRows(STORAGE_KEYS.IMPORTANT_LINKS) },
    ];

    for (const t of simpleTables) {
      if (t.rows.length === 0 && t.local.length > 0) {
        migrated = true;
        queuePush(() => t.push(t.local as any[]));
      } else if (t.rows.length > 0) {
        setLocal(t.key, t.rows.map(t.fromRow));
      }
      remoteIds[t.db] = new Set(t.rows.map((r) => r.id as string));
    }

    // الأرشيف
    const localArchives = localRows<YearArchiveShape>(STORAGE_KEYS.YEAR_ARCHIVES);
    if ((archivesRes.data as any[]).length === 0 && localArchives.length > 0) {
      migrated = true;
      queuePush(() => pushYearArchives(localArchives));
    } else if ((archivesRes.data as any[]).length > 0) {
      setLocal(STORAGE_KEYS.YEAR_ARCHIVES, (archivesRes.data as any[]).map(fromArchiveRow));
    }
    remoteIds["year_archives"] = new Set((archivesRes.data as any[]).map((r) => r.id));

    // الإعدادات (السنة الدراسية + إعدادات الموقع مثل رقم الواتساب)
    const settingsRows = (settingsRes.data as any[]) || [];
    const yearSetting = settingsRows.find((s) => s.key === "currentAcademicYear");
    if (yearSetting) {
      localStorage.setItem(STORAGE_KEYS.CURRENT_ACADEMIC_YEAR, yearSetting.value);
    } else {
      const localYear = localStorage.getItem(STORAGE_KEYS.CURRENT_ACADEMIC_YEAR);
      if (localYear) queuePush(() => pushSetting("currentAcademicYear", localYear));
    }
    // باقي الإعدادات تُحفظ محلياً بنفس مفتاحها
    for (const s of settingsRows) {
      if (s.key !== "currentAcademicYear") {
        localStorage.setItem(s.key, s.value);
      }
    }

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
  groups: { id: string; gradeId: string; name: string }[];
  settings: Record<string, string>;
}

export async function fetchPublicData(): Promise<PublicData | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const [ann, hon, files, links, grades, groups, settings] = await Promise.all([
    sb.from("announcements").select("*"),
    sb.from("honorees").select("*"),
    sb.from("shared_files").select("*"),
    sb.from("important_links").select("*"),
    sb.from("grades").select("id,name"),
    sb.from("groups").select("id,grade_id,name"),
    sb.from("app_settings").select("key,value"),
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
    groups: (groups.data as any[]).map((g) => ({ id: g.id, gradeId: g.grade_id, name: g.name })),
    settings: settingsMap,
  };
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
  const { error } = await sb.from("app_settings").delete().neq("key", "__none__");
  if (error) throw error;
  remoteIds = {};
}

/** دفع كل البيانات المحلية إلى Supabase (يُستخدم بعد الاستيراد) */
export async function syncAllFromLocal(): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  await clearAllRemote();
  const grades = localRows<GradeShape>(STORAGE_KEYS.GRADES);
  await pushGrades(grades);
  await pushStudents(localRows(STORAGE_KEYS.STUDENTS) as any[]);
  await pushDues(localRows(STORAGE_KEYS.DUES) as any[]);
  await pushPayments(localRows(STORAGE_KEYS.PAYMENTS) as any[]);
  await pushExams(localRows(STORAGE_KEYS.EXAMS) as any[]);
  await pushSessions(localRows(STORAGE_KEYS.SESSIONS) as any[]);
  await pushAttendance(localRows(STORAGE_KEYS.ATTENDANCE) as any[]);
  await pushAnnouncements(localRows(STORAGE_KEYS.ANNOUNCEMENTS) as any[]);
  await pushHonorees(localRows(STORAGE_KEYS.HONOREES) as any[]);
  await pushSharedFiles(localRows(STORAGE_KEYS.SHARED_FILES) as any[]);
  await pushImportantLinks(localRows(STORAGE_KEYS.IMPORTANT_LINKS) as any[]);
  await pushYearArchives(localRows<YearArchiveShape>(STORAGE_KEYS.YEAR_ARCHIVES));
  const year = localStorage.getItem(STORAGE_KEYS.CURRENT_ACADEMIC_YEAR);
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
  const raw = err?.message || String(err ?? "")
  const code = err?.code || ""

  if (/permission denied/i.test(raw) || code === "42501") {
    return (
      "صلاحيات قاعدة البيانات ناقصة (permission denied). " +
      "الحل: افتح Supabase ← SQL Editor وشغّل ملف supabase/migrations/004_fix_permissions.sql ثم أعد الفحص."
    )
  }
  if (/does not exist/i.test(raw) || code === "42P01") {
    return (
      "أحد الجداول غير موجود في قاعدة البيانات. " +
      "الحل: شغّل ملف supabase/schema.sql في Supabase ← SQL Editor."
    )
  }
  if (/row-level security|violates row-level/i.test(raw) || code === "42501") {
    return (
      "سياسة الحماية (RLS) تمنع الكتابة. تأكد من تسجيل الدخول، ثم شغّل supabase/schema.sql مجدداً."
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
