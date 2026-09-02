#!/usr/bin/env node
/**
 * ============================================================
 * 🔒 فحص «السحابية الخالصة» — حارس التخزين المحلي
 * ============================================================
 * يفحص كل ملفات src عن أي كتابة محلية:
 *   localStorage.setItem / sessionStorage.setItem / document.cookie / indexedDB
 * كل نقطة يجب أن تكون في القائمة المصرح بها مع سبب موثق.
 * أي نقطة جديدة غير مصرح بها → فشل الفحص (يمنع الالتزام).
 *
 * السياسة المعتمدة من المالك:
 *   ✅ مسموح فقط: جلسة الدخول (كوكي)، كاش تسريع قراءة (السحابة هي المصدر)،
 *      شارات واجهة (جديد/إخفاء شريط)، حماية إغراق على الجهاز، وضع التطوير بلا Supabase.
 *   ❌ ممنوع: أي بيانات حقيقية تُكتب محلياً فقط أو قبل نجاح السحابة.
 * ============================================================
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"

const ROOT = join(process.cwd(), "src")
const EXT = new Set([".ts", ".tsx"])

// القائمة المصرح بها — file: اسم الملف النسبي، has: سطر مطابق جزئياً، why: السبب
const ALLOWLIST = [
  // ===== جلسة الدخول (مسموح صراحة من المالك: كوكيز/توكين الجلسة) =====
  { file: "lib/student-accounts.ts", has: 'document.cookie = `${PORTAL_SESSION_COOKIE}=', why: "جلسة دخول الطالب — كوكي آمن (مسموح صراحة)" },
  { file: "lib/student-accounts.ts", has: "document.cookie = `${PORTAL_SESSION_COOKIE}=; path=/; max-age=0", why: "تسجيل خروج — مسح كوكي الجلسة" },
  { file: "lib/student-accounts.ts", has: "localStorage.setItem(PORTAL_SESSION_KEY", why: "مرآة جلسة الدخول (نفس بيانات الكوكي)" },

  // ===== حماية الإغراق على الجهاز (ليست بيانات) =====
  { file: "lib/student-accounts.ts", has: "localStorage.setItem(RATE_LIMITS_KEY", why: "عدّاد حماية الإغراق على الجهاز — ليس بيانات" },

  // ===== كاش تسريع قراءة — السحابة دائماً هي المصدر =====
  { file: "lib/supabase/sync.ts", has: "localStorage.setItem(key, JSON.stringify(rows))", why: "setLocal — كاش قراءة بعد عمليات السحابة" },
  { file: "lib/supabase/sync.ts", has: 'localStorage.setItem(STORAGE_KEYS.INQUIRIES, JSON.stringify([...local, thread]))', why: "كاش بعد نجاح الإدراج السحابي / وضع التطوير فقط" },
  { file: "lib/supabase/sync.ts", has: 'localStorage.setItem(STORAGE_KEYS.CURRENT_ACADEMIC_YEAR, yearSetting.value)', why: "كاش إعدادات جاءت من السحابة" },
  { file: "lib/supabase/sync.ts", has: "localStorage.setItem(s.key, s.value)", why: "كاش إعدادات جاءت من السحابة" },
  { file: "lib/supabase/sync.ts", has: 'localStorage.setItem(STORAGE_KEYS.REGISTRATION_REQUESTS', why: "وضع التطوير فقط (بلا Supabase) — الموقع المنشور سحابي خالص" },
  { file: "lib/supabase/sync.ts", has: 'localStorage.setItem(STORAGE_KEYS.GROUP_TRANSFER_REQUESTS', why: "وضع التطوير فقط (بلا Supabase) — الموقع المنشور سحابي خالص" },
  { file: "lib/supabase/sync.ts", has: 'localStorage.setItem(STORAGE_KEYS.INQUIRIES, JSON.stringify(local))', why: "وضع التطوير فقط (بلا Supabase)" },
  { file: "lib/data-storage.ts", has: "localStorage.setItem(key, JSON.stringify(data))", why: "جهاز المعلم: كتابة-مزدوجة مع queuePush فوري للسحابة — كاش تسريع" },
  { file: "lib/data-storage.ts", has: "localStorage.setItem(STORAGE_KEYS.CURRENT_ACADEMIC_YEAR, academicYear)", why: "إعداد السنة — مزدوج مع pushSetting" },
  { file: "lib/data-storage.ts", has: "localStorage.setItem(key, value)", why: "saveSetting — مزدوجة مع pushSetting" },
  { file: "lib/data-storage.ts", has: "localStorage.setItem(SAMPLE_BACKUP_KEY", why: "نسخة احتياطية للبيانات التجريبية — إدارة عرض للمعلم" },
  { file: "lib/branding.ts", has: 'localStorage.setItem("teacherSignatureLine"', why: "كاش إعداد مُزامَن مع السحابة (pushSetting)" },
  { file: "lib/branding.ts", has: 'localStorage.setItem("teacherName"', why: "كاش إعداد مُزامَن مع السحابة (pushSetting)" },
  { file: "app/student/register/page.tsx", has: 'localStorage.setItem("grades"', why: "كاش عرض فقط لقائمة الصفوف — السحابة أولاً" },

  // ===== حالة واجهة (ليست بيانات) =====
  { file: "lib/portal-content.ts", has: "localStorage.setItem(ANNOUNCEMENTS_SEEN_KEY", why: "شارة «جديد» للإعلانات — حالة واجهة" },
  { file: "components/sample-data-banner.tsx", has: 'localStorage.setItem("sampleBannerDismissed"', why: "إخفاء شريط البيانات التجريبية — حالة واجهة" },
]

const findings = []
const walk = dir => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) walk(full)
    else if (EXT.has(name.slice(name.lastIndexOf(".")))) findings.push({ file: relative(ROOT, full).split("\\").join("/"), full })
  }
}
walk(ROOT)

const WRITE_RE = /localStorage\.setItem|sessionStorage\.setItem|document\.cookie\s*=\s*[^=]|indexedDB\.open/
const violations = []
let total = 0

for (const f of findings) {
  const lines = readFileSync(f.full, "utf8").split("\n")
  lines.forEach((line, i) => {
    if (!WRITE_RE.test(line)) return
    total++
    const match = ALLOWLIST.find(a => a.file === f.file && line.includes(a.has))
    if (!match) {
      violations.push({ file: f.file, line: i + 1, snippet: line.trim().slice(0, 120) })
    }
  })
}

console.log("\n🔒 فحص السحابية الخالصة — حارس التخزين المحلي")
console.log("=".repeat(56))
console.log(`نقاط الكتابة المحلية المكتشفة: ${total}`)
console.log(`مصرَّح بها في القائمة: ${total - violations.length}`)

if (violations.length > 0) {
  console.log(`\n❌ نقاط كتابة محلية غير مصرح بها (${violations.length}):`)
  for (const v of violations) {
    console.log(`\n  📄 ${v.file}:${v.line}`)
    console.log(`     ${v.snippet}`)
  }
  console.log("\nالسياسة: لا بيانات تُكتب محلياً — السحابة (Supabase) هي المصدر الوحيد.")
  console.log("المسموح فقط: الجلسة، كاش القراءة بعد نجاح السحابة، حالة الواجهة، وضع التطوير.")
  console.log("إذا كانت نقطة مشروعة أضفها للقائمة المصرح بها في scripts/cloud-only-audit.mjs مع السبب.\n")
  process.exit(1)
}

console.log("\n✅ كل نقاط الكتابة المحلية مصرَّح بها — لا بيانات تُكتب محلياً بشكل نهائي")
console.log("✅ السحابة (Supabase) هي مصدر الحقيقة الوحيد\n")
