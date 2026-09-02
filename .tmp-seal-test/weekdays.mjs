/** أيام الأسبوع كما تُحفظ في المجموعات */
const ARABIC_WEEKDAYS = [
    "السبت",
    "الأحد",
    "الاثنين",
    "الثلاثاء",
    "الأربعاء",
    "الخميس",
    "الجمعة",
];
/** Date.getDay(): 0 = الأحد … 6 = السبت */
const JS_DAY_TO_AR = {
    0: "الأحد",
    1: "الاثنين",
    2: "الثلاثاء",
    3: "الأربعاء",
    4: "الخميس",
    5: "الجمعة",
    6: "السبت",
};
function arabicWeekday(date = new Date()) {
    const d = typeof date === "string" ? new Date(date + (date.length === 10 ? "T12:00:00" : "")) : date;
    return JS_DAY_TO_AR[d.getDay()] || "";
}
function toISODate(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}
function isGroupDay(days, date = new Date()) {
    const name = arabicWeekday(date);
    return days.includes(name);
}
/** معرّف ثابت لسجل حضور يوم/مجموعة (بدون حاجة لإنشاء حصة يدوياً) */
function attendanceDayId(groupId, isoDate) {
    return `att-${groupId}-${isoDate}`;
}
