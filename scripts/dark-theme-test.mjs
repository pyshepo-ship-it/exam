/**
 * اختبار تباين الوضع الداكن — node scripts/dark-theme-test.mjs
 *
 * يتحقق رقمياً من القياسات التي تستند إليها قواعد «ترقية النصوص في الوضع
 * الداكن» في src/app/globals.css (تعليق كتلة .dark .text-gray-500):
 *
 *  1) الدرجات المصمَّمة للخلفية البيضاء تنزل تحت حد القراءة WCAG AA (4.5:1)
 *     على بطاقات gray-900 وخلفية #09090b، فتُبرّر الترقية إلى 400
 *     (بألوان لوحة Tailwind v4 الفعلية كما تُصدر في CSS البناء):
 *         gray-500   على بطاقات gray-900 = 3.67:1
 *         indigo-600 على خلفية #09090b   = 3.08:1
 *         purple-600 على خلفية #09090b   = 3.59:1
 *  2) نص #0a0a0a (primary-foreground الداكن) فوق تدرّج ينتهي بـ gray-900
 *     يكاد يختفي (1.12:1) مقابل 10.30:1 للنص الأبيض في الوضع الفاتح
 *     (على أقصى درجة التدرّج gray-700).
 *  3) البديلان المُطبَّقان في globals.css يتجاوزان الحد:
 *         gray-400 على gray-900 = 6.81:1   ✓
 *         أبيض على gray-900    = 17.74:1  ✓
 *  4) القواعد نفسها ما زالت موجودة في globals.css (@theme inline، ترقية
 *     نص الرمادي، تثبيت نص أزرار التدرّج أبيض، و*-foreground في .dark).
 */
import { readFileSync } from "node:fs"

const failures = []
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`)
  if (!ok) failures.push(label)
}

/* ---------- حساب التباين حسب WCAG 2.x ---------- */
const channel = (v) => {
  const s = v / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
const luminance = (hex) => {
  const n = parseInt(hex.replace("#", ""), 16)
  const r = channel((n >> 16) & 0xff)
  const g = channel((n >> 8) & 0xff)
  const b = channel(n & 0xff)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (fg, bg) => {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a)
  return (hi + 0.05) / (lo + 0.05)
}
const fmt = (v) => v.toFixed(2) + ":1"
const AA = 4.5

/* لوحة Tailwind v4 كما تُصدر فعلياً في CSS البناء (جرى التحقق منها في
   .next/static/chunks/*.css — لا تستخدم قيم v3 القديمة) */
const PAGE_BG_DARK = "#09090b" // خلفية الصفحة الداكنة (--background)
const GRAY_900 = "#101828" // بطاقات/خلفيات الوضع الداكن (مثل dark:bg-gray-900 في time-picker)
const GRAY_700 = "#364153" // أقصى درجة في تدرّج أزرار الوضع الفاتح
const GRAY_500 = "#6a7282"
const GRAY_400 = "#99a1af"
const INDIGO_600 = "#4f39f6"
const PURPLE_600 = "#9810fa"
const NEAR_BLACK = "#0a0a0a" // قيمة --primary-foreground الداكنة القديمة
const WHITE = "#ffffff"

/* ---------- 1) الأزواج المعيبة (مبررات الترقية) ---------- */
const brokenPairs = [
  { name: "text-gray-500 على بطاقات gray-900", fg: GRAY_500, bg: GRAY_900, documented: 3.67 },
  { name: "text-indigo-600 على خلفية الصفحة الداكنة", fg: INDIGO_600, bg: PAGE_BG_DARK, documented: 3.08 },
  { name: "text-purple-600 على خلفية الصفحة الداكنة", fg: PURPLE_600, bg: PAGE_BG_DARK, documented: 3.59 },
  { name: "#0a0a0a على تدرّج ينتهي بـ gray-900", fg: NEAR_BLACK, bg: GRAY_900, documented: 1.12 },
]
console.log("\n1) الأزواج تحت حد القراءة (مبررات الترقية في الوضع الداكن):")
for (const p of brokenPairs) {
  const r = contrast(p.fg, p.bg)
  check(r < AA, `${p.name} تحت ${AA}:1`, `${fmt(r)} (الموثّق ${p.documented}:1)`)
  check(Math.abs(r - p.documented) < 0.02, `قيمة ${p.name} تطابق الموثّق في تعليق globals.css`, `${fmt(r)} ≈ ${p.documented}:1`)
}

/* ---------- 2) مرجع الوضع الفاتح ---------- */
console.log("\n2) المرجع في الوضع الفاتح:")
{
  const r = contrast(WHITE, GRAY_700)
  check(Math.abs(r - 10.3) < 0.02, "أبيض على أقصى درجة التدرّج الفاتح = 10.30:1 تقريباً", fmt(r))
}

/* ---------- 3) البدائل المطبَّقة تتجاوز الحد ---------- */
console.log("\n3) البديلان المطبَّقان في globals.css:")
{
  const r1 = contrast(GRAY_400, GRAY_900)
  check(r1 >= AA, "gray-400 على gray-900 يتجاوز الحد", fmt(r1))
  const r2 = contrast(WHITE, GRAY_900)
  check(r2 >= AA, "أبيض مثبَّت على تدرّج الوضع الداكن يتجاوز الحد", fmt(r2))
}

/* ---------- 4) القواعد ما زالت موجودة في globals.css ---------- */
console.log("\n4) وجود القواعد في src/app/globals.css:")
const css = readFileSync("src/app/globals.css", "utf8")
check(css.includes("@theme inline"), "@theme inline (بدونه تبقى الدلالات ملتصقة بـ :root الفاتح)")
check(/--color-background:\s*var\(--background\)/.test(css), "الدلالات اللونية تشير إلى متغيرات السياق")
check(/:root\s*\{[^}]*--background:\s*#ffffff/s.test(css), ":root يعرّف القيم الفعلية للوضع الفاتح")
check(css.includes('.dark .text-gray-500:not([class*="dark:text-"]):not([class*="bg-"])'), "قاعدة ترقية نص الرمادي في الوضع الداكن")
check(css.includes(':is(button, a, [role="button"])[class*="bg-gradient-to-"]'), "قاعدة تثبيت نص أزرار التدرّج")
{
  const darkBlock = css.match(/\.dark\s*\{[\s\S]*?\}/)?.[0] ?? ""
  check(/--success-foreground:\s*#ffffff/.test(darkBlock), "--success-foreground معرَّف داخل .dark")
  check(/--warning-foreground:\s*#ffffff/.test(darkBlock), "--warning-foreground معرَّف داخل .dark")
}

console.log(failures.length === 0 ? "\n✅ كل فحوصات تباين الوضع الداكن ناجحة" : `\n❌ فشل ${failures.length} فحصاً`)
process.exit(failures.length === 0 ? 0 : 1)
