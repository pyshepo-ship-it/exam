const queuePush = () => Promise.resolve();
const pushSetting = () => Promise.resolve();
const exportToPDF = async () => true;
const printElement = () => { };
// مفاتيح التخزين المحلية (مرآة لقاعدة Supabase)
const STORAGE_KEYS = {
    GRADES: "grades",
    STUDENTS: "students",
    DUES: "dues",
    PAYMENTS: "payments",
    EXAMS: "exams",
    SESSIONS: "sessions",
    ATTENDANCE: "attendance",
    EXAM_ATTEMPTS: "examAttempts",
    ANNOUNCEMENTS: "announcements",
    HONOREES: "honorees",
    SHARED_FILES: "sharedFiles",
    IMPORTANT_LINKS: "importantLinks",
    CURRENT_ACADEMIC_YEAR: "currentAcademicYear",
    YEAR_ARCHIVES: "yearArchives",
    // بوابة الطلاب
    MANUAL_GRADES: "manualGrades",
    REGISTRATION_REQUESTS: "registrationRequests",
    GROUP_TRANSFER_REQUESTS: "groupTransferRequests",
    STUDENT_HISTORY: "studentHistory",
    STUDENT_ACCOUNTS: "studentAccounts",
    INQUIRIES: "inquiries",
};
import { attendanceDayId } from "./weekdays.mjs";
import { pushGrades, pushStudents, pushDues, pushPayments, pushExams, pushSessions, pushAttendance, pushAnnouncements, pushHonorees, pushSharedFiles, pushImportantLinks, pushYearArchives, pushExamAttempts, pushManualGrades, pushRegistrationRequests, pushGroupTransferRequests, pushStudentHistory, pushStudentAccounts, pushInquiries, } from "./supabase/sync.mjs";
/**
 * ترتيب الصفوف حسب المرحلة الدراسية المستخرجة من الاسم العربي
 * (الأول، الثاني... العاشر) — ما لا يحمل اسماً ترتيبياً يبقى في آخر القائمة
 * بنفس ترتيبه النسبي. الترتيب ثابت (stable) ولا يعيد خلط المتساوين.
 */
export function sortGradesByLevel(grades) {
    // أولاً المركبة (الحادي عشر...) ثم المفردة — لأن «الثاني» جزء من «الثاني عشر»
    const ORDINALS = [
        ["الحادي عشر", 11],
        ["الثاني عشر", 12],
        ["الاول", 1], ["الثاني", 2], ["الثالث", 3], ["الرابع", 4], ["الخامس", 5],
        ["السادس", 6], ["السابع", 7], ["الثامن", 8], ["التاسع", 9], ["العاشر", 10],
    ];
    const levelOf = (name) => {
        // طبّع الاسم: إزالة التطويل وتوحيد الهمزات والألف
        const n = (name || "").replace(/\u0640/g, "").replace(/[أإآ]/g, "ا");
        let ordinal = 0;
        for (const [word, value] of ORDINALS) {
            const w = word.replace(/[أإآ]/g, "ا");
            if (n.includes(w)) {
                ordinal = value;
                break;
            }
        }
        if (ordinal === 0)
            return 999;
        // المرحلة تحدد الإزاحة: الابتدائي 1-6، الإعدادي 7-9، الثانوي 10-12
        if (n.includes("الثانوي"))
            return 9 + ordinal;
        if (n.includes("الاعدادي"))
            return 6 + ordinal;
        return ordinal;
    };
    return grades
        .map((g, i) => ({ g, i, level: levelOf(g.name) }))
        .sort((a, b) => (a.level - b.level) || (a.i - b.i))
        .map(x => x.g);
}
// Helper functions
export const getFromStorage = (key) => {
    if (typeof window === 'undefined')
        return [];
    const data = localStorage.getItem(key);
    if (!data)
        return [];
    try {
        const parsed = JSON.parse(data);
        return Array.isArray(parsed) ? parsed : [];
    }
    catch {
        return [];
    }
};
export const saveToStorage = (key, data) => {
    if (typeof window === 'undefined')
        return;
    localStorage.setItem(key, JSON.stringify(data));
};
// Grades
export const getGrades = () => getFromStorage(STORAGE_KEYS.GRADES);
export const saveGrades = (grades) => {
    saveToStorage(STORAGE_KEYS.GRADES, grades);
    queuePush(() => pushGrades(grades));
};
// Students
export const getStudents = () => getFromStorage(STORAGE_KEYS.STUDENTS);
export const saveStudents = (students) => {
    saveToStorage(STORAGE_KEYS.STUDENTS, students);
    queuePush(() => pushStudents(students));
};
// Dues
export const getDues = () => getFromStorage(STORAGE_KEYS.DUES);
export const saveDues = (dues) => {
    saveToStorage(STORAGE_KEYS.DUES, dues);
    queuePush(() => pushDues(dues));
};
// Payments
export const getPayments = () => getFromStorage(STORAGE_KEYS.PAYMENTS);
export const savePayments = (payments) => {
    saveToStorage(STORAGE_KEYS.PAYMENTS, payments);
    queuePush(() => pushPayments(payments));
};
// Exams
export const getExams = () => getFromStorage(STORAGE_KEYS.EXAMS);
export const saveExams = (exams) => {
    saveToStorage(STORAGE_KEYS.EXAMS, exams);
    queuePush(() => pushExams(exams));
};
// Sessions
export const getSessions = () => getFromStorage(STORAGE_KEYS.SESSIONS);
export const saveSessions = (sessions) => {
    saveToStorage(STORAGE_KEYS.SESSIONS, sessions);
    queuePush(() => pushSessions(sessions));
};
// Attendance
export const getAttendance = () => getFromStorage(STORAGE_KEYS.ATTENDANCE);
export const saveAttendance = (attendance) => {
    saveToStorage(STORAGE_KEYS.ATTENDANCE, attendance);
    queuePush(() => pushAttendance(attendance));
};
export const getExamAttempts = () => getFromStorage(STORAGE_KEYS.EXAM_ATTEMPTS);
export const saveExamAttempts = (attempts, opts) => {
    saveToStorage(STORAGE_KEYS.EXAM_ATTEMPTS, attempts);
    if (opts?.sync === false)
        return;
    queuePush(() => pushExamAttempts(attempts));
};
// Announcements
export const getAnnouncements = () => getFromStorage(STORAGE_KEYS.ANNOUNCEMENTS);
export const saveAnnouncements = (items) => {
    saveToStorage(STORAGE_KEYS.ANNOUNCEMENTS, items);
    queuePush(() => pushAnnouncements(items));
};
// Honorees (لوحة الشرف)
export const getHonorees = () => getFromStorage(STORAGE_KEYS.HONOREES);
export const saveHonorees = (items) => {
    saveToStorage(STORAGE_KEYS.HONOREES, items);
    queuePush(() => pushHonorees(items));
};
// Shared files
export const getSharedFiles = () => getFromStorage(STORAGE_KEYS.SHARED_FILES);
export const saveSharedFiles = (items) => {
    saveToStorage(STORAGE_KEYS.SHARED_FILES, items);
    queuePush(() => pushSharedFiles(items));
};
// Important links
export const getImportantLinks = () => getFromStorage(STORAGE_KEYS.IMPORTANT_LINKS);
export const saveImportantLinks = (items) => {
    saveToStorage(STORAGE_KEYS.IMPORTANT_LINKS, items);
    queuePush(() => pushImportantLinks(items));
};
// الدرجات اليدوية
export const getManualGrades = () => getFromStorage(STORAGE_KEYS.MANUAL_GRADES);
export const saveManualGrades = (items) => {
    saveToStorage(STORAGE_KEYS.MANUAL_GRADES, items);
    queuePush(() => pushManualGrades(items));
};
// طلبات التسجيل
export const getRegistrationRequests = () => getFromStorage(STORAGE_KEYS.REGISTRATION_REQUESTS);
export const saveRegistrationRequests = (items) => {
    saveToStorage(STORAGE_KEYS.REGISTRATION_REQUESTS, items);
    queuePush(() => pushRegistrationRequests(items));
};
// طلبات نقل المجموعة
export const getGroupTransferRequests = () => getFromStorage(STORAGE_KEYS.GROUP_TRANSFER_REQUESTS);
export const saveGroupTransferRequests = (items) => {
    saveToStorage(STORAGE_KEYS.GROUP_TRANSFER_REQUESTS, items);
    queuePush(() => pushGroupTransferRequests(items));
};
// سجل نشاط الطلاب
export const getStudentHistory = () => getFromStorage(STORAGE_KEYS.STUDENT_HISTORY);
export const saveStudentHistory = (items) => {
    saveToStorage(STORAGE_KEYS.STUDENT_HISTORY, items);
    queuePush(() => pushStudentHistory(items));
};
/** إضافة حدث لسجل نشاط طالب (اختصار) */
export const addStudentHistoryEvent = (event) => {
    const full = {
        ...event,
        id: `h-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: new Date().toISOString(),
    };
    saveStudentHistory([...getStudentHistory(), full]);
    return full;
};
// حسابات بوابة الطلاب
export const getStudentAccounts = () => getFromStorage(STORAGE_KEYS.STUDENT_ACCOUNTS);
// ---------- الاستفسارات ----------
export const getInquiries = () => getFromStorage(STORAGE_KEYS.INQUIRIES);
export const saveInquiries = (items) => {
    saveToStorage(STORAGE_KEYS.INQUIRIES, items);
    queuePush(() => pushInquiries(items));
};
export const saveStudentAccounts = (items) => {
    saveToStorage(STORAGE_KEYS.STUDENT_ACCOUNTS, items);
    queuePush(() => pushStudentAccounts(items));
};
// ---- إدارة العام الدراسي ----
/**
 * السنة الدراسية الحالية محسوبة تلقائياً من التاريخ:
 * من سبتمبر حتى أغسطس تكون السنة الدراسية = (السنة الحالية) - (السنة التالية)
 * مثال: سبتمبر 2026 → 2026-2027
 */
export const getCurrentAcademicYear = (now = new Date()) => {
    const year = now.getFullYear();
    const month = now.getMonth() + 1; // 1-12
    return month >= 9 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
};
/** السنة التالية لأي سنة دراسية بصيغة 2026-2027 → 2027-2028 */
export const getNextAcademicYear = (academicYear) => {
    const startYear = parseInt(academicYear, 10);
    if (isNaN(startYear))
        return getCurrentAcademicYear();
    return `${startYear + 1}-${startYear + 2}`;
};
/** السنة الدراسية المخزنة في الجهاز (أو الحالية محسوباً تلقائياً إذا لم تُخزَّن) */
export const getStoredAcademicYear = () => {
    if (typeof window === 'undefined')
        return '2026-2027';
    const stored = localStorage.getItem(STORAGE_KEYS.CURRENT_ACADEMIC_YEAR);
    return stored && stored.trim() ? stored : getCurrentAcademicYear();
};
export const saveAcademicYear = (academicYear) => {
    if (typeof window === 'undefined')
        return;
    localStorage.setItem(STORAGE_KEYS.CURRENT_ACADEMIC_YEAR, academicYear);
    queuePush(() => pushSetting("currentAcademicYear", academicYear));
};
/** اقتراح السنة التي يجب فتحها بعد إغلاق سنة معينة */
export const suggestNextAcademicYear = (closedYear) => {
    const current = getCurrentAcademicYear();
    const next = getNextAcademicYear(closedYear);
    const parseStart = (y) => parseInt(y, 10) || 0;
    return parseStart(next) >= parseStart(current) ? next : current;
};
export const getYearArchives = () => getFromStorage(STORAGE_KEYS.YEAR_ARCHIVES);
export const saveYearArchives = (archives) => {
    saveToStorage(STORAGE_KEYS.YEAR_ARCHIVES, archives);
    queuePush(() => pushYearArchives(archives));
};
// إعدادات عامة (مفتاح/قيمة) — مثل رقم واتساب التواصل
export const getSetting = (key, fallback = "") => {
    if (typeof window === "undefined")
        return fallback;
    // ملاحظة: القيمة الفارغة "" مقصودة (مثلاً إغلاق التسجيل) — لا تُستبدل بالافتراضي
    const v = localStorage.getItem(key);
    return v === null ? fallback : v;
};
export const saveSetting = (key, value) => {
    if (typeof window === "undefined")
        return;
    localStorage.setItem(key, value);
    queuePush(() => pushSetting(key, value));
};
/**
 * إغلاق السنة الدراسية الحالية:
 * - أرشفة جميع بياناتها (الصفوف، المجموعات، الطلاب، التحصيل، الاختبارات، الحضور)
 * - تفريغ البيانات النشطة للبدء من جديد
 * (الإعلانات ولوحة الشرف والملفات والروابط لا تتأثر لأنها محتوى عام)
 */
export const closeAcademicYear = (academicYear) => {
    const data = {
        grades: getGrades(),
        students: getStudents(),
        dues: getDues(),
        payments: getPayments(),
        exams: getExams(),
        sessions: getSessions(),
        attendance: getAttendance(),
    };
    const archive = {
        academicYear,
        closedAt: new Date().toISOString(),
        stats: {
            grades: data.grades.length,
            groups: data.grades.reduce((sum, g) => sum + g.groups.length, 0),
            students: data.students.length,
            dues: data.dues.length,
            payments: data.payments.length,
            exams: data.exams.length,
            sessions: data.sessions.length,
            attendance: data.attendance.length,
        },
        data,
    };
    // إزالة أي أرشيف سابق بنفس السنة (للأمان) ثم إضافة الأرشيف الجديد
    const archives = getYearArchives().filter(a => a.academicYear !== academicYear);
    archives.push(archive);
    saveYearArchives(archives);
    // تفريغ البيانات النشطة
    saveGrades([]);
    saveStudents([]);
    saveDues([]);
    savePayments([]);
    saveExams([]);
    saveSessions([]);
    saveAttendance([]);
    return archive;
};
/** استعادة بيانات سنة مغلقة (تستبدل البيانات النشطة الحالية) */
export const restoreYearArchive = (academicYear) => {
    const archives = getYearArchives();
    const archive = archives.find(a => a.academicYear === academicYear);
    if (!archive)
        return false;
    saveGrades(archive.data.grades);
    saveStudents(archive.data.students);
    saveDues(archive.data.dues);
    savePayments(archive.data.payments);
    saveExams(archive.data.exams);
    saveSessions(archive.data.sessions);
    saveAttendance(archive.data.attendance);
    return true;
};
export const deleteYearArchive = (academicYear) => {
    const archives = getYearArchives().filter(a => a.academicYear !== academicYear);
    saveYearArchives(archives);
};
// ---- لوحة الشرف: helpers ----
/**
 * هل المكرَّم معروض حالياً في لوحة الشرف؟
 *  - إن حدد المعلم مدة بالأيام (الافتراضي عند الإضافة 30): يُعرض من لحظة الإضافة حتى انتهاء المدة.
 *  - السجلات القديمة (بدون مدة): تُعرض طوال الشهر والعام المحددين (السلوك السابق).
 */
export const isHonoreeActive = (honoree, now = new Date()) => {
    if (honoree.days && honoree.days > 0 && honoree.createdAt) {
        const end = new Date(honoree.createdAt).getTime() + honoree.days * 24 * 60 * 60 * 1000;
        return now.getTime() <= end;
    }
    return honoree.month === now.getMonth() + 1 && honoree.year === now.getFullYear();
};
/** كل المجموعات في جميع الصفوف مع اسم الصف */
export const getAllGroups = (grades) => grades.flatMap(g => g.groups.map(gr => ({ ...gr, gradeName: g.name, gradeId: g.id })));
/** مجموعات صف واحد فقط — للقوائم المنسدلة المتسلسلة (صف → مجموعة) */
export const getGroupsOfGrade = (grades, gradeId) => {
    if (!gradeId)
        return [];
    return grades.find(g => g.id === gradeId)?.groups || [];
};
/** معرّفات السجلات اليومية لمجموعة في تاريخ معيّن (الجديد + أي سجل قديم لنفس اليوم) */
export const getSessionIdsForGroupDay = (groupId, isoDate) => {
    const ids = new Set([attendanceDayId(groupId, isoDate)]);
    getSessions()
        .filter(s => s.groupId === groupId && s.sessionDate === isoDate)
        .forEach(s => ids.add(s.id));
    return ids;
};
function attendanceDayKey(row) {
    if (row.date)
        return row.date;
    const dayMatch = /^att-.+-(\d{4}-\d{2}-\d{2})$/.exec(row.sessionId);
    if (dayMatch)
        return dayMatch[1];
    const session = getSessions().find(s => s.id === row.sessionId);
    return session?.sessionDate || row.sessionId;
}
/**
 * حفظ حضور يوم كامل لمجموعة دون تسجيل حصة يدوياً.
 * يُنشأ سجل يومي داخلي ثابت (group+date) لربط الصفوف مع قاعدة البيانات.
 */
export const saveGroupDayAttendance = (groupId, isoDate, marks, groupTimes) => {
    const sessionId = attendanceDayId(groupId, isoDate);
    const sessions = getSessions();
    if (!sessions.some(s => s.id === sessionId)) {
        saveSessions([
            ...sessions,
            {
                id: sessionId,
                groupId,
                sessionDate: isoDate,
                startTime: groupTimes?.startTime || "",
                endTime: groupTimes?.endTime || "",
                notes: "حضور يومي",
                createdAt: new Date().toISOString(),
            },
        ]);
    }
    const sameDayIds = getSessionIdsForGroupDay(groupId, isoDate);
    const others = getAttendance().filter(a => !sameDayIds.has(a.sessionId) && !(a.groupId === groupId && a.date === isoDate));
    const now = new Date().toISOString();
    const records = marks.map(m => ({
        id: `${sessionId}-${m.studentId}`,
        sessionId,
        studentId: m.studentId,
        groupId,
        date: isoDate,
        status: m.present ? "present" : "absent",
        createdAt: now,
    }));
    saveAttendance([...others, ...records]);
    return records;
};
export const getGroupDayAttendance = (groupId, isoDate) => {
    const sessionIds = getSessionIdsForGroupDay(groupId, isoDate);
    const rows = getAttendance().filter(a => sessionIds.has(a.sessionId) || (a.groupId === groupId && a.date === isoDate));
    // إن وُجد أكثر من سجل لنفس الطالب في نفس اليوم نأخذ الأحدث
    const byStudent = new Map();
    for (const row of rows) {
        const prev = byStudent.get(row.studentId);
        if (!prev || (row.createdAt || "") >= (prev.createdAt || "")) {
            byStudent.set(row.studentId, row);
        }
    }
    return [...byStudent.values()];
};
/** تواريخ الحضور المسجَّلة لمجموعة (الأحدث أولاً) */
export const getGroupAttendanceDates = (groupId) => {
    const sessionDates = getSessions()
        .filter(s => s.groupId === groupId)
        .map(s => s.sessionDate);
    const attDates = getAttendance()
        .filter(a => a.groupId === groupId && a.date)
        .map(a => a.date);
    return [...new Set([...sessionDates, ...attDates].filter(Boolean))].sort((a, b) => (a < b ? 1 : -1));
};
export const getAttendanceForGroup = (groupId) => {
    const sessionIds = new Set(getSessions().filter(s => s.groupId === groupId).map(s => s.id));
    const rows = getAttendance().filter(a => a.groupId === groupId || sessionIds.has(a.sessionId) || a.sessionId.startsWith(`att-${groupId}-`));
    const byStudentDay = new Map();
    for (const row of rows) {
        const key = `${row.studentId}|${attendanceDayKey(row)}`;
        const prev = byStudentDay.get(key);
        if (!prev || (row.createdAt || "") >= (prev.createdAt || "")) {
            byStudentDay.set(key, row);
        }
    }
    return [...byStudentDay.values()];
};
/**
 * إضافة طالب متفوق تلقائياً إلى لوحة الشرف إن حقق نسبة الاختبار المطلوبة.
 * لا يكرر نفس الطالب لنفس الاختبار في نفس الشهر.
 */
export const maybeAutoHonor = (opts) => {
    const { exam, studentName, groupId, studentId, score, totalMarks } = opts;
    if (!exam.autoHonorBoard)
        return null;
    if (totalMarks <= 0)
        return null;
    const min = exam.honorMinPercent ?? 100;
    const percent = (score / totalMarks) * 100;
    if (percent + 1e-9 < min)
        return null;
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const honorees = getHonorees();
    const honorId = `auto-${exam.id}-${studentId || studentName}-${month}-${year}`;
    const already = honorees.some(h => {
        if (h.id === honorId)
            return true;
        if (h.month !== month || h.year !== year)
            return false;
        if (h.examId && h.examId === exam.id) {
            if (studentId && h.studentId === studentId)
                return true;
            return h.studentName === studentName && h.groupId === groupId;
        }
        return false;
    });
    if (already)
        return null;
    const honoree = {
        id: honorId,
        studentId,
        studentName,
        groupId,
        reason: `متفوق هذا الشهر — ${score}/${totalMarks} في ${exam.title}`,
        month,
        year,
        examId: exam.id,
        score,
        autoPromoted: true,
        createdAt: now.toISOString(),
    };
    const next = [...honorees, honoree];
    if (opts.sync === false) {
        saveToStorage(STORAGE_KEYS.HONOREES, next);
    }
    else {
        saveHonorees(next);
    }
    return honoree;
};
/** Helper: Calculate student balance */
export const getStudentBalance = (studentId) => {
    const dues = getDues().filter(d => d.studentId === studentId);
    const payments = getPayments().filter(p => p.studentId === studentId);
    const totalDues = dues.reduce((sum, d) => sum + d.amount, 0);
    const totalPayments = payments.reduce((sum, p) => sum + p.amount, 0);
    return {
        totalDues,
        totalPayments,
        balance: totalDues - totalPayments,
    };
};
/** Helper: Get student with grade and group names */
export const getStudentWithDetails = (student) => {
    const grades = getGrades();
    const grade = grades.find(g => g.id === student.gradeId);
    const group = grade?.groups.find(gr => gr.id === student.groupId);
    return {
        ...student,
        gradeName: grade?.name || 'غير محدد',
        groupName: group?.name || 'غير محدد',
    };
};
// ---- البيانات التجريبية (النسخة القديمة) ----
// أسماء الصفوف التجريبية التي كانت تُضاف تلقائياً في النسخ السابقة
const SAMPLE_GRADE_NAMES = ['الصف الرابع الابتدائي', 'الصف الخامس الابتدائي'];
/**
 * معرفات الصفوف التجريبية القديمة.
 *
 * ⚠️ مهم: البذرة القديمة كانت تستخدم معرفات ثابتة ('1' و '2').
 * الصفوف التي ينشئها المستخدم تستخدم Date.now() (13 رقماً)،
 * لذلك لا يمكن أبداً أن تتطابق مع هذه المعرفات.
 *
 * الاعتماد على الاسم وحده كان خطأً جسيماً: أي صف حقيقي يسميه
 * المستخدم "الصف الرابع الابتدائي" (وهو اسم شائع جداً!) كان
 * يُصنَّف تجريبياً ويُحذف. لذلك صار المعرّف شرطاً إلزامياً.
 */
const SAMPLE_GRADE_IDS = ['1', '2'];
/**
 * اكتشاف الصفوف التجريبية المتبقية من النسخ القديمة.
 *
 * الشروط (يجب أن تتحقق كلها معاً حتى لا يُحذف أي صف حقيقي):
 *  1. معرّف الصف من معرفات البذرة القديمة الثابتة ('1' أو '2')
 *  2. اسم الصف من الأسماء التجريبية
 *  3. لا يوجد أي طالب في أي مجموعة من مجموعاته
 *  4. لا توجد أي بيانات أخرى مرتبطة به (اختبارات/حصص/استحقاقات)
 */
export const getSampleGrades = () => {
    const grades = getGrades();
    const students = getStudents();
    const exams = getExams();
    const sessions = getSessions();
    const dues = getDues();
    return grades.filter(grade => {
        // 1) المعرّف الثابت للبذرة القديمة — شرط إلزامي
        if (!SAMPLE_GRADE_IDS.includes(String(grade.id)))
            return false;
        // 2) الاسم التجريبي
        if (!SAMPLE_GRADE_NAMES.includes(grade.name))
            return false;
        const groupIds = grade.groups.map(g => g.id);
        // 3) لا طلاب
        if (students.some(s => groupIds.includes(s.groupId) || s.gradeId === grade.id))
            return false;
        // 4) لا اختبارات / حصص / استحقاقات مرتبطة
        if (exams.some(e => e.gradeId === grade.id || (e.groupId && groupIds.includes(e.groupId))))
            return false;
        if (sessions.some(se => groupIds.includes(se.groupId)))
            return false;
        if (dues.some(d => d.groupId && groupIds.includes(d.groupId)))
            return false;
        return true;
    });
};
/**
 * إزالة البيانات التجريبية (الصفوف والمجموعات الافتراضية)
 * لا تلمس أي صف عليه طلاب
 */
/** مفتاح النسخة الاحتياطية قبل إزالة البيانات التجريبية (للتراجع) */
const SAMPLE_BACKUP_KEY = 'sampleGradesBackup';
/** هل توجد نسخة يمكن التراجع إليها؟ */
export const hasSampleBackup = () => {
    if (typeof window === 'undefined')
        return false;
    const raw = localStorage.getItem(SAMPLE_BACKUP_KEY);
    if (!raw)
        return false;
    try {
        return JSON.parse(raw).length > 0;
    }
    catch {
        return false;
    }
};
/** التراجع عن إزالة البيانات التجريبية (استعادة الصفوف المحذوفة) */
export const restoreSampleGrades = () => {
    if (typeof window === 'undefined')
        return 0;
    const raw = localStorage.getItem(SAMPLE_BACKUP_KEY);
    if (!raw)
        return 0;
    let backup = [];
    try {
        backup = JSON.parse(raw);
    }
    catch {
        return 0;
    }
    if (backup.length === 0)
        return 0;
    const current = getGrades();
    const currentIds = new Set(current.map(g => g.id));
    const restored = backup.filter(g => !currentIds.has(g.id));
    saveGrades([...current, ...restored]);
    localStorage.removeItem(SAMPLE_BACKUP_KEY);
    return restored.length;
};
export const removeSampleGrades = () => {
    const grades = getGrades();
    const sampleGrades = getSampleGrades();
    const sampleGradeIds = new Set(sampleGrades.map(g => g.id));
    // لا شيء لإزالته — لا نلمس أي بيانات
    if (sampleGradeIds.size === 0) {
        return { removedGrades: 0, removedStudents: 0 };
    }
    // نحفظ نسخة احتياطية تسمح بالتراجع الفوري
    if (typeof window !== 'undefined') {
        localStorage.setItem(SAMPLE_BACKUP_KEY, JSON.stringify(sampleGrades));
    }
    // getSampleGrades يضمن بالفعل عدم وجود أي طالب مرتبط،
    // لذلك لا نحذف أي طالب إطلاقاً هنا (حماية من فقدان البيانات).
    saveGrades(grades.filter(g => !sampleGradeIds.has(g.id)));
    if (typeof window !== 'undefined') {
        localStorage.removeItem('initialized');
        localStorage.removeItem('sampleBannerDismissed');
    }
    return { removedGrades: sampleGradeIds.size, removedStudents: 0 };
};
