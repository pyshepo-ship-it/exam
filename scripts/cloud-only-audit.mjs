#!/usr/bin/env node
/**
 * ============================================================
 * 🔒 فحص «السحابية الخالصة» — صفر تخزين محلي للبيانات
 * ============================================================
 * السياسة المعتمدة من المالك (نهائية):
 *   كل بيانات الموقع (الطلاب، الصفوف، المجموعات، الجداول، الاختبارات،
 *   النتائج، الدفعات، الاستفسارات، طلبات التسجيل/النقل، الإعدادات، السنة
 *   الدراسية، الهوية/التوقيع، الإعلانات، الملفات المشتركة) تُسجَّل في
 *   Supabase فقط، وتُجلب منه تلقائياً. الطالب وصاحب الموقع يفتحان الموقع
 *   من أي جهاز وأي مكان في العالم فيجدان بياناتهم محدَّثة.
 *
 * المسموح أن يبقى على الجهاز (وليس بيانات إطلاقاً):
 *   1) كوكي جلسة دخول الطالب (SameSite=Lax) — لا يحتوي كلمة مرور.
 *   2) كوكي قدرات نتائج الاختبار العشوائية (SameSite=Lax) — معرف جلسة وسر
 *      عشوائي فقط، بلا إجابات أو أسماء أو درجات؛ يستخدمه RPC مقيد للجلسة نفسها.
 *   3) مظهر الموقع (ليلي/نهاري) عبر next-themes.
 *   4) عدّاد حماية الإغراق (يمنع تكرار طلبات التسجيل من نفس الجهاز) —
 *      عدّاد رقمي فقط، بلا أسماء ولا أرقام هواتف.
 *
 * هذا الفحص يفشل الالتزام إذا ظهر أي تخزين محلي للبيانات من جديد.
 * ============================================================
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"

const ROOT = join(process.cwd(), "src")
const EXT = new Set([".ts", ".tsx"])

const files = []
let full = ""
const walk = dir => {
  for (const name of readdirSync(dir)) {
    full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) walk(full)
    else if (EXT.has(name.slice(name.lastIndexOf(".")))) {
      files.push({ rel: relative(ROOT, full).split("\\").join("/"), full })
    }
  }
}
walk(ROOT)

/** محتوى الملف بعد إسقاط أسطر التعليقات (حتى لا تُحسب التعليقات أكواداً) */
const codeOf = f =>
  readFileSync(f.full, "utf8")
    .split("\n")
    .map(line => {
      const t = line.trim()
      if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return ""
      return line
    })
    .join("\n")

const CODE = new Map(files.map(f => [f.rel, codeOf(f)]))
const RAW = new Map(files.map(f => [f.rel, readFileSync(f.full, "utf8")]))

/** يجمع كل الأسطر المطابقة لنمط عبر كل الملفات (كود فقط) */
const hits = re => {
  const out = []
  for (const f of files) {
    const lines = CODE.get(f.rel).split("\n")
    lines.forEach((line, i) => {
      if (re.test(line)) out.push({ file: f.rel, line: i + 1, snippet: line.trim().slice(0, 130) })
    })
  }
  return out
}

const results = []
const check = (title, pass, detail = "") => {
  results.push({ title, pass, detail })
}

// ────────────────────────────────────────────────────────────
// 1) لا sessionStorage إطلاقاً
// ────────────────────────────────────────────────────────────
{
  const h = hits(/sessionStorage\s*(\.|\[)/)
  const bad = h.filter(x => !/sessionStorage\.removeItem/.test(x.snippet))
  check("لا تخزين في sessionStorage (المسموح: مسح الآثار القديمة فقط)", bad.length === 0,
    bad.map(x => `${x.file}:${x.line} ${x.snippet}`).join(" | ") || "كل النقاط المتبقية removeItem لتنظيف الإصدارات القديمة")
}

// ────────────────────────────────────────────────────────────
// 2) لا IndexedDB إطلاقاً
// ────────────────────────────────────────────────────────────
{
  const h = hits(/indexedDB|window\.webkitStorageInfo|navigator\.storage/)
  check("لا استخدام لـ IndexedDB / تخزين المتصفح الدائم", h.length === 0,
    h.map(x => `${x.file}:${x.line}`).join("، "))
}

// ────────────────────────────────────────────────────────────
// 3) كتابات localStorage: نقطة واحدة مصرح بها (عدّاد الإغراق)
// ────────────────────────────────────────────────────────────
const LS_WRITE_ALLOW = [
  {
    file: "lib/student-accounts.ts",
    has: "localStorage.setItem(RATE_LIMITS_KEY",
    why: "عدّاد حماية الإغراق — رقمي فقط، لا أسماء ولا هواتف ولا بيانات",
  },
  {
    file: "lib/survey-device.ts",
    has: "localStorage.setItem(name, value)",
    why: "بطاقة استبيان عشوائية (32 حرفًا) تمنع الرد المكرر بلا رقم هاتف — لا بيانات ولا إجابات",
  },
]
{
  const h = hits(/localStorage\.setItem/)
  const bad = h.filter(x => !LS_WRITE_ALLOW.some(a => a.file === x.file && x.snippet.includes(a.has)))
  check("كتابات localStorage = المصرح به فقط (عدّاد الحماية + بطاقة الاستبيان)",
    bad.length === 0 && h.length === LS_WRITE_ALLOW.length,
    bad.map(x => `${x.file}:${x.line} ${x.snippet}`).join(" | ") || LS_WRITE_ALLOW.map(a => a.why).join(" | "))
}

// ────────────────────────────────────────────────────────────
// 4) قراءات localStorage: نقطة واحدة مصرح بها (عدّاد الإغراق)
// ────────────────────────────────────────────────────────────
const LS_READ_ALLOW = [
  { file: "lib/student-accounts.ts", has: "localStorage.getItem(RATE_LIMITS_KEY", why: "قراءة عدّاد الحماية" },
  { file: "lib/memory-store.ts", has: "window.localStorage?.getItem(", why: "إنقاذ لمرة واحدة: نقل أي كاش قديم إلى الذاكرة ثم مسح المتصفح نهائياً" },
  { file: "lib/survey-device.ts", has: "localStorage.getItem(name)", why: "قراءة بطاقة الاستبيان العشوائية" },
]
{
  const h = hits(/localStorage\??\.getItem/)
  const bad = h.filter(x => !LS_READ_ALLOW.some(a => a.file === x.file && x.snippet.includes(a.has)))
  check("قراءات localStorage: عدّاد الحماية + إنقاذ قديم + بطاقة الاستبيان", bad.length === 0 && h.length === 4,
    bad.map(x => `${x.file}:${x.line} ${x.snippet}`).join(" | ") || LS_READ_ALLOW.map(a => a.why).join(" | "))
}

// ────────────────────────────────────────────────────────────
// 5) المسح (removeItem/clear) في ملفات التنظيف المصرح بها فقط
// ────────────────────────────────────────────────────────────
const LS_WIPE_ALLOW = new Set([
  "lib/memory-store.ts",        // مسح كل الآثار القديمة + الأعلام البصرية القديمة
  "lib/student-accounts.ts",    // مسح كوكي/نسخة الجلسة القديمة عند الخروج
])
{
  const h = hits(/localStorage\.(removeItem|clear)\(/)
  const bad = h.filter(x => !LS_WIPE_ALLOW.has(x.file))
  check("مسح التخزين القديم محصور في ملفات التنظيف", bad.length === 0 && h.length > 0,
    bad.map(x => `${x.file}:${x.line} ${x.snippet}`).join(" | ") || `${h.length} نقطة مسح (تنظيف آثار الإصدارات القديمة)`)
}

// ────────────────────────────────────────────────────────────
// 6) الكوكيز: جلسة الطالب + قدرة نتيجة اختبار عشوائية فقط (بلا بيانات)
// ────────────────────────────────────────────────────────────
const COOKIE_ALLOW = [
  { file: "lib/student-accounts.ts", has: "document.cookie = `${PORTAL_SESSION_COOKIE}=${encodeURIComponent(b64)}" },
  { file: "lib/student-accounts.ts", has: "document.cookie = `${PORTAL_SESSION_COOKIE}=; path=/; max-age=0" },
  { file: "lib/online-exam-result-session.ts", has: "document.cookie = `${COOKIE_NAME}=${encodeURIComponent(encode(" },
  { file: "lib/online-exam-result-session.ts", has: "document.cookie = `${COOKIE_NAME}=; path=/; max-age=0" },
  { file: "lib/survey-device.ts", has: "document.cookie = `${name}=${encodeURIComponent(value)}" },
]
{
  const h = hits(/document\.cookie\s*=\s*[^=]/)
  const bad = h.filter(x => !COOKIE_ALLOW.some(a => a.file === x.file && x.snippet.includes(a.has)))
  check("الكوكيز = جلسة طالب + قدرة نتيجة + بطاقة استبيان عشوائية (بلا بيانات)", bad.length === 0 && h.length === COOKIE_ALLOW.length,
    bad.map(x => `${x.file}:${x.line} ${x.snippet}`).join(" | ") || "لا تحتوي الكوكيز على كلمة مرور أو إجابات أو أسماء أو درجات")
}

// ────────────────────────────────────────────────────────────
// 6-ب) بطاقة الاستبيان: رقم عشوائي فقط — لا اسم ولا هاتف ولا إجابات
// ────────────────────────────────────────────────────────────
{
  const dev = CODE.get("lib/survey-device.ts") || ""
  const clean =
    dev.length > 0 &&
    !/\bname\b\s*[:=]\s*(input|guest|student)/i.test(dev) &&
    !/phone|answers|token|password|إجاب/i.test(dev.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")) &&
    /getRandomValues|Math\.random/.test(dev)
  check("بطاقة الاستبيان المحلية عشوائية بلا أي بيانات شخصية", clean,
    dev.length === 0 ? "lib/survey-device.ts غير موجود" : "راجع محتوى البطاقة")
}

// ────────────────────────────────────────────────────────────
// 7) ملفات البيانات لا تذكر التخزين المحلي في الكود إطلاقاً
// ────────────────────────────────────────────────────────────
const DATA_FILES_FORBIDDEN = [
  "lib/data-storage.ts", "lib/supabase/sync.ts", "lib/branding.ts",
  "lib/portal-content.ts", "lib/inquiries.ts", "lib/storage-keys.ts",
  "lib/student-report.ts", "lib/exam-grading.ts", "lib/exam-availability.ts",
]
{
  const bad = []
  for (const rel of DATA_FILES_FORBIDDEN) {
    if (!CODE.has(rel)) continue
    const lines = CODE.get(rel).split("\n")
    lines.forEach((line, i) => {
      if (/localStorage|sessionStorage/.test(line)) {
        const t = line.trim()
        if (t.startsWith("window.localStorage.removeItem")) return // تنظيف آثار قديمة فقط
        bad.push(`${rel}:${i + 1} ${t.slice(0, 90)}`)
      }
    })
  }
  check("ملفات البيانات/المزامنة لا تستخدم التخزين المحلي", bad.length === 0, bad.join(" | "))
}

// ────────────────────────────────────────────────────────────
// 8) صفحات ولوحات التحكم لا تستخدم التخزين المحلي
// ────────────────────────────────────────────────────────────
{
  const bad = hits(/localStorage|sessionStorage/).filter(x =>
    x.file.startsWith("app/") || x.file.startsWith("components/"))
  check("كل الصفحات والمكوّنات خالية من التخزين المحلي", bad.length === 0,
    bad.map(x => `${x.file}:${x.line}`).join("، "))
}

// ────────────────────────────────────────────────────────────
// 9) أسماء التخزين المحلي القديمة اختفت
// ────────────────────────────────────────────────────────────
{
  const h = hits(/\b(getFromStorage|saveToStorage)\b/)
  check("لا وجود لدوال التخزين المحلي القديمة (getFromStorage/saveToStorage)", h.length === 0,
    h.map(x => `${x.file}:${x.line}`).join("، "))
}

// ────────────────────────────────────────────────────────────
// 10) ذاكرة الجلسة هي المخزن المؤقت الوحيد
// ────────────────────────────────────────────────────────────
{
  const mem = RAW.get("lib/memory-store.ts") || ""
  const ok = /export function readRows/.test(mem) &&
    /export function writeRows/.test(mem) &&
    /export function readSetting/.test(mem) &&
    /export function writeSetting/.test(mem) &&
    /export function purgeLegacyLocalStorage/.test(mem) &&
    /adoptLegacyIntoMemory\(\)\s*\n\s*purgeLegacyLocalStorage\(\)/.test(mem)
  check("memory-store: ذاكرة جلسة + مسح الآثار القديمة عند أول تشغيل", ok,
    "readRows/writeRows/readSetting/writeSetting/purgeLegacyLocalStorage + adopt-then-wipe")
}

// ────────────────────────────────────────────────────────────
// 11) data-storage يكتب في ذاكرة الجلسة ويصطف للدفع إلى Supabase
// ────────────────────────────────────────────────────────────
{
  const ds = RAW.get("lib/data-storage.ts") || ""
  const importsMem = /from "\.\/memory-store"/.test(ds)
  const pushes = (ds.match(/queuePush\(/g) || []).length
  check("data-storage: قراءة/كتابة من ذاكرة الجلسة + queuePush لكل حفظ",
    importsMem && pushes >= 10, `عدد استدعاءات queuePush = ${pushes}`)
}

// ────────────────────────────────────────────────────────────
// 12) الجلب التلقائي من Supabase موجود ويُستخدم في اللوحة
// ────────────────────────────────────────────────────────────
{
  const sync = RAW.get("lib/supabase/sync.ts") || ""
  const layout = RAW.get("app/dashboard/layout.tsx") || ""
  const ok = /export async function pullAllData/.test(sync) &&
    /purgeLegacyLocalStorage\(\)/.test(sync) &&
    /notifyStoreUpdate\(\)/.test(sync) &&
    /pullAllData\(\)/.test(layout)
  check("pullAllData: سحب كامل من Supabase + مسح الآثار + تحديث الواجهة", ok,
    "يُستدعى عند فتح لوحة التحكم وبعد كل تغيير في الحالة")
}

// ────────────────────────────────────────────────────────────
// 13) كل جدول بيانات له مسار سحب من السحابة
// ────────────────────────────────────────────────────────────
{
  const sync = RAW.get("lib/supabase/sync.ts") || ""
  const keys = RAW.get("lib/storage-keys.ts") || ""
  const entries = [...keys.matchAll(/^\s*([A-Z_]+):\s*"([A-Za-z_]+)"/gm)].map(m => [m[1], m[2]])
  const snake = v => v.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase()
  const missing = entries
    .filter(([k, v]) => !sync.includes(`STORAGE_KEYS.${k}`) && !sync.includes(`"${snake(v)}"`))
    .map(([k]) => k)
  check("كل مفاتيح البيانات مغطاة في المزامنة السحابية (سحب + رفع)",
    missing.length === 0 && entries.length >= 19,
    missing.length ? `ناقص: ${missing.join("، ")}` : `${entries.length} مفتاحاً: سحب في pullAllData وفهرس دفع لكل جدول`)
}

// ────────────────────────────────────────────────────────────
// 14) جلسة الطالب تُقرأ من الكوكي فقط (لا نسخة محلية)
// ────────────────────────────────────────────────────────────
{
  const sa = RAW.get("lib/student-accounts.ts") || ""
  const readsCookieOnly = !/localStorage\.getItem\(PORTAL_SESSION_KEY/.test(sa) &&
    /const session = readSessionCookie\(\)/.test(sa)
  const usesSecureLogin = /await studentLogin\(/.test(sa) &&
    !/خطة احتياطية[^]*قراءة anon/.test(sa) &&
    /!session\.token/.test(sa)
  check("بوابة الطالب: جلسة بالكوكي فقط + دخول RPC آمن بتوكين إلزامي",
    readsCookieOnly && usesSecureLogin, "لا تُنشأ جلسة ناقصة ولا تُقرأ حسابات الطلاب خاماً عبر anon")
}

// ────────────────────────────────────────────────────────────
// 15) الخروج يمسح ذاكرة الجلسة تماماً
// ────────────────────────────────────────────────────────────
{
  const sa = RAW.get("lib/student-accounts.ts") || ""
  const layout = RAW.get("app/dashboard/layout.tsx") || ""
  check("الخروج: مسح كوكي الجلسة + تفريغ ذاكرة الجلسة",
    /clearStore\(\)/.test(sa) && /clearStore\(\)/.test(layout), "لا يبقى أي أثر للبيانات بعد الخروج")
}

// ────────────────────────────────────────────────────────────
// 16) الإعدادات والسنة الدراسية سحابية
// ────────────────────────────────────────────────────────────
{
  const ds = RAW.get("lib/data-storage.ts") || ""
  const sync = RAW.get("lib/supabase/sync.ts") || ""
  const ok = /writeSetting\(STORAGE_KEYS\.CURRENT_ACADEMIC_YEAR/.test(ds) &&
    /setStoreSetting\(s\.key, s\.value\)/.test(sync) &&
    /pushSetting\(/.test(ds)
  check("الإعدادات والسنة الدراسية: تُحفظ في Supabase وتُسحب منه", ok,
    "settings + currentAcademicYear عبر pushSetting/pullAllData")
}

// ────────────────────────────────────────────────────────────
// 17) الهوية/التوقيع سحابية
// ────────────────────────────────────────────────────────────
{
  const br = RAW.get("lib/branding.ts") || ""
  check("اسم المعلم وسطر التوقيع: إعدادات سحابية (memory-store + pushSetting)",
    /from "\.\/memory-store"/.test(br) && /pushSetting/.test(br), "")
}

// ────────────────────────────────────────────────────────────
// 18) الاستفسارات وطلبات التسجيل/النقل سحابية أولاً
// ────────────────────────────────────────────────────────────
{
  const sync = RAW.get("lib/supabase/sync.ts") || ""
  const ok = /from\("inquiries"\)\.insert/.test(sync) &&
    /from\("registration_requests"\)\.insert/.test(sync) &&
    /from\("group_transfer_requests"\)\.insert/.test(sync)
  check("الاستفسارات/التسجيل/النقل: الكتابة في Supabase أولاً ثم ذاكرة الجلسة", ok,
    "لا يُضاف سجل إلى الذاكرة قبل نجاح الإدراج السحابي")
}

// ────────────────────────────────────────────────────────────
// 19) الاختبارات والنتائج تُحسم في سحابة RPC الآمنة
// ────────────────────────────────────────────────────────────
{
  const sync = RAW.get("lib/supabase/sync.ts") || ""
  const takeExam = RAW.get("app/exam/[id]/page.tsx") || ""
  const ok = /export async function startOnlineExamTimerSession/.test(sync) &&
    /export async function submitOnlineExamTimerSession/.test(sync) &&
    /export async function getOnlineExamTimerResult/.test(sync) &&
    /activeTimerSession \? \{ sync: false \}/.test(takeExam) &&
    !/export async function submitPublicAttempt/.test(sync)
  check("محاولات الاختبارات العامة تمر عبر جلسة RPC خادمية", ok,
    "لا إدراج anon مباشر؛ التسليم والنتيجة مقيدان بسر جلسة الاختبار")
}

// ────────────────────────────────────────────────────────────
// 20) لا كتابة ملفات/قرص من جانب العميل
// ────────────────────────────────────────────────────────────
{
  const h = hits(/require\("fs"\)|from "fs"|writeFileSync|createWriteStream/)
  check("لا حفظ على القرص من كود المتصفح", h.length === 0,
    h.map(x => `${x.file}:${x.line}`).join("، "))
}

// ────────────────────────────────────────────────────────────
// 21) التنظيف في pushStudents/… لا يُفرّغ المراجع عندما لا تكون
//     الصفوف/المجموعات محمّلة بعد (صفحة تُحفظ قبل وصول grades من السحابة)
// ────────────────────────────────────────────────────────────
{
  const sync = RAW.get("lib/supabase/sync.ts") || ""
  const hasGuard = /const gradesLoaded = grades\.length > 0/.test(sync) &&
    /if \(gradesLoaded && row\.grade_id && !gradeIds\.has\(row\.grade_id\)\) row\.grade_id = null/.test(sync) &&
    /if \(gradesLoaded && row\.group_id && !groupIds\.has\(row\.group_id\)\) row\.group_id = null/.test(sync)
  check("رفع الطلاب لا يُصفّر صف/مجموعة عند غياب قائمة الصفوف (حماية من فقد البيانات)",
    hasGuard, "لا نُفرّغ مرجعاً إلا إذا كانت الصفوف محمّلة وغياب المرجع مؤكداً")
}

// ────────────────────────────────────────────────────────────
// التقرير
// ────────────────────────────────────────────────────────────
console.log("\n🔒 فحص السحابية الخالصة — صفر تخزين محلي للبيانات")
console.log("=".repeat(60))
console.log(`ملفات مفحوصة: ${files.length}`)

const failed = results.filter(r => !r.pass)
for (const r of results) {
  console.log(`${r.pass ? "✅" : "❌"} ${r.title}`)
  if (r.detail) console.log(`   ${r.detail}`)
}

console.log("\n" + "=".repeat(60))
console.log(`النتيجة: ${results.length - failed.length}/${results.length}`)

if (failed.length > 0) {
  console.log("\n❌ فشل الفحص — السياسة: كل البيانات في Supabase فقط، ولا تخزين محلي إطلاقاً.")
  console.log("   المسموح على الجهاز: كوكي الجلسة، المظهر (ليلي/نهاري)، عدّاد حماية الإغراق.")
  console.log("   أصلح النقاط أعلاه قبل الالتزام (لا تُضعف هذا الفحص).\n")
  process.exit(1)
}

console.log("\n✅ السحابة (Supabase) هي مكان التسجيل الوحيد لكل بيانات الموقع")
console.log("✅ الجلب تلقائي من Supabase: الطالب وصاحب الموقع يجدان بياناتهم محدَّثة من أي جهاز وأي مكان\n")
