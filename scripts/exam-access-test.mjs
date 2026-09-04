/**
 * اختبار حي لصفحة الاختبار الإلكتروني — node scripts/exam-access-test.mjs
 *
 * يصوّر الصفحة الحقيقية (src/app/exam/[id]/page.tsx) داخل jsdom بلا متصفح
 * ويتحقق من وضعي فتح الاختبار كما يراهما الطالب فعلياً:
 *   1) «للأعضاء فقط» + زائر        → بوابة تسجيل دخول (لا نموذج بيانات إطلاقاً)
 *   2) «للأعضاء فقط» + طالب مسجَّل  → هويته (اسم/صف/مجموعة) تلقائية ويبدأ بضغطة
 *   3) «مفتوح للجميع» + زائر       → اسم وهاتف إجباريان، الصف ثابت من الاختبار،
 *                                     والمجموعة من قائمة مجموعات صفه المتاحة فقط
 *   4) زائر يبدأ ويُسلّم            → محاولة محفوظة باسمه وهاتفه ومجموعته (بلا حساب)
 *   5) «مفتوح للجميع» + عضو مسجَّل → لا يُطلب منه شيء: هويته تلقائية كالأعضاء
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs"
import { resolve, join, dirname, relative, extname } from "node:path"
import { pathToFileURL } from "node:url"
import ts from "typescript"
import { JSDOM } from "jsdom"

// ------------------------------------------------------------
// بيئة jsdom + بوليفيلات Radix/React
// ------------------------------------------------------------
const dom = new JSDOM("<!DOCTYPE html><html dir='rtl'><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
})
const { window } = dom

const defineGlobal = (name, value) => {
  try { globalThis[name] = value } catch { /* خاصية للقراءة فقط (navigator في Node 22) */ }
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}
defineGlobal("window", window)
defineGlobal("document", window.document)
defineGlobal("navigator", window.navigator)
defineGlobal("location", window.location)
defineGlobal("localStorage", window.localStorage)
defineGlobal("sessionStorage", window.sessionStorage)
globalThis.HTMLElement = window.HTMLElement
globalThis.HTMLInputElement = window.HTMLInputElement
globalThis.Element = window.Element
globalThis.Node = window.Node
globalThis.Event = window.Event
globalThis.MouseEvent = window.MouseEvent
globalThis.KeyboardEvent = window.KeyboardEvent
globalThis.getComputedStyle = window.getComputedStyle.bind(window)
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0)
globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
window.requestAnimationFrame = globalThis.requestAnimationFrame
window.cancelAnimationFrame = globalThis.cancelAnimationFrame
window.matchMedia = window.matchMedia || ((query) => ({
  matches: false, media: query, onchange: null,
  addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false,
}))
globalThis.matchMedia = window.matchMedia
class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver = ResizeObserverStub
window.ResizeObserver = ResizeObserverStub
for (const m of ["scrollIntoView", "hasPointerCapture", "setPointerCapture", "releasePointerCapture"]) {
  if (!window.HTMLElement.prototype[m]) window.HTMLElement.prototype[m] = () => {}
}
// كل ما توفّره jsdom من أنواع DOM (HTMLFormElement وغيرها) تحتاجه Radix/React
for (const key of Object.getOwnPropertyNames(window)) {
  if (key in globalThis) continue
  try { globalThis[key] = window[key] } catch { /* خاصية للقراءة فقط */ }
}
// أحداث jsdom يجب أن تحل محل أنواع Node الأصلية (وإلا رفضها dispatchEvent في Radix)
for (const key of ["Event", "CustomEvent", "UIEvent", "MouseEvent", "KeyboardEvent", "FocusEvent", "InputEvent", "PointerEvent"]) {
  if (typeof window[key] === "function") defineGlobal(key, window[key])
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

// ------------------------------------------------------------
// تجميع شجرة الوحدات الحقيقية للصفحة (TSX → ESM) مع بدائل next/*
// ------------------------------------------------------------
const ROOT = process.cwd()
const TMP = resolve(ROOT, ".tmp-exam-access")
rmSync(TMP, { recursive: true, force: true })
mkdirSync(TMP, { recursive: true })

const EXTS = [".tsx", ".ts", ".jsx", ".js", ".mjs"]
const STUBS = {
  "next/navigation": `export const useParams = () => globalThis.__routeParams || {}
export const usePathname = () => globalThis.__routePath || "/"
export const useSearchParams = () => new URLSearchParams(globalThis.__routeQuery || "")
export const useRouter = () => ({ push(){}, replace(){}, back(){}, refresh(){}, prefetch(){} })
`,
  "next/link": `import React from "react"
export default function Link({ href, children, ...rest }) {
  return React.createElement("a", { href: typeof href === "string" ? href : href?.pathname || "/", ...rest }, children)
}
`,
}

const stubPath = (name) => {
  const file = join(TMP, "stubs", name.replace(/[\/@]/g, "_") + ".mjs")
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, STUBS[name], "utf8")
  return file
}

const resolveLocal = (fromFile, spec) => {
  const base = spec.startsWith("@/")
    ? resolve(ROOT, "src", spec.slice(2))
    : resolve(dirname(fromFile), spec)
  if (existsSync(base) && !extname(base)) {
    for (const e of EXTS) if (existsSync(base + e)) return base + e
    for (const e of EXTS) if (existsSync(join(base, "index" + e))) return join(base, "index" + e)
    return null
  }
  if (existsSync(base)) return base
  for (const e of EXTS) if (existsSync(base + e)) return base + e
  return null
}

const outPathOf = (srcFile) =>
  join(TMP, relative(ROOT, srcFile).replace(/\.(tsx|ts|jsx|js)$/, "") + ".mjs")

const ENTRY_EXAM = resolve(ROOT, "src/app/exam/[id]/page.tsx")
const ENTRY_HOME = resolve(ROOT, "src/app/page.tsx")
const ENTRY_DASHBOARD = resolve(ROOT, "src/app/dashboard/exams/page.tsx")

const built = new Map()
const queue = [ENTRY_EXAM, ENTRY_HOME, ENTRY_DASHBOARD]

while (queue.length) {
  const file = queue.shift()
  if (built.has(file)) continue
  const src = readFileSync(file, "utf8")
  const out = outPathOf(file)
  built.set(file, out)

  let code = src
  const specs = new Set()
  for (const m of src.matchAll(/(?:from|import)\s*["']([^"']+)["']/g)) specs.add(m[1])

  // خارطة «المُحدِّد → المسار الجديد» (لا استبدال نصي عام حتى لا يتشابه
  // ./schedule مع ./schedule-print)
  const map = new Map()
  for (const spec of specs) {
    let target = null
    if (STUBS[spec]) {
      target = stubPath(spec)
    } else if (spec.startsWith("@/") || spec.startsWith(".")) {
      const local = resolveLocal(file, spec)
      if (!local) continue
      if (!built.has(local)) queue.push(local)
      target = outPathOf(local)
    } else {
      continue // حزمة خارجية (react / radix / lucide …) — تُترك كما هي
    }
    let rel = relative(dirname(out), target).replace(/\\/g, "/")
    if (!rel.startsWith(".")) rel = "./" + rel
    map.set(spec, rel)
  }
  code = code.replace(/(["'])([^"'\n]+)\1/g, (m, q, spec) =>
    map.has(spec) ? q + map.get(spec) + q : m)

  const js = ts.transpileModule(code, {
    // اسم الملف الأصلي يحدد هل يُسمح بـ JSX (.tsx) أم لا (.ts) — وإلا التُهم <T> كوسم
    fileName: file,
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, js, "utf8")
}

const React = (await import("react")).default
const { act } = await import("react")
const { createRoot } = await import("react-dom/client")
const Page = (await import(pathToFileURL(built.get(ENTRY_EXAM)).href)).default
const HomePage = (await import(pathToFileURL(built.get(ENTRY_HOME)).href)).default
const DashboardExams = (await import(pathToFileURL(built.get(ENTRY_DASHBOARD)).href)).default
// مخزن ذاكرة الجلسة (المكان الوحيد المؤقت للبيانات — لا تخزين محلي)
const MEM = (await import(
  pathToFileURL(built.get(resolve(ROOT, "src/lib/memory-store.ts"))).href
))

// ------------------------------------------------------------
// أدوات الاختبار
// ------------------------------------------------------------
let pass = 0, fail = 0
const fails = []
const eq = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ✅ " + name) }
  else { fail++; fails.push(name + (extra ? ` — ${extra}` : "")); console.log("  ❌ " + name + (extra ? ` — ${extra}` : "")) }
}
const section = (t) => console.log(`\n${"=".repeat(56)}\n${t}\n${"=".repeat(56)}`)

// التغذية كما تفعل pullAllData من Supabase: في ذاكرة الجلسة فقط.
// الجلسة تُكتب كوكي (لا نسخة محلية). ولا يُكتب أي بيان في localStorage.
const SESSION_COOKIE = "studentPortalSession"
const setSessionCookie = (session) => {
  if (!session) {
    document.cookie = `${SESSION_COOKIE}=; path=/; max-age=0`
    return
  }
  const b64 = Buffer.from(JSON.stringify(session), "utf8").toString("base64")
  document.cookie = `${SESSION_COOKIE}=${encodeURIComponent(b64)}; path=/; max-age=2592000`
}
const seed = (data) => {
  MEM.clearStore()
  window.localStorage.clear()
  const { studentPortalSession, ...rows } = data
  for (const [k, v] of Object.entries(rows)) MEM.writeRows(k, v)
  setSessionCookie(studentPortalSession || null)
}
const readKey = (k) => MEM.readRows(k)
/** كل مفاتيح localStorage الحالية (للتحقق من صفر تخزين محلي) */
const localKeys = () => Object.keys(window.localStorage)

const nowIso = new Date().toISOString()
const mcq = (id) => ({
  id: `q-${id}`, questionType: 1, questionNumber: 1, orderNumber: 1,
  headerText: "اختر الإجابة الصحيحة",
  subQuestions: [{
    id: `sq-${id}`, orderNumber: 1, questionText: "أي مما يلي كائن حي؟", marks: 2,
    choices: [
      { id: `c-${id}-1`, choiceKey: "أ", choiceText: "الحجر", isCorrect: false },
      { id: `c-${id}-2`, choiceKey: "ب", choiceText: "النبات", isCorrect: true },
    ],
  }],
})
const baseExam = (over) => ({
  id: "ex-1", gradeId: "g-1", title: "اختبار الوحدة الأولى", academicYear: "2026-2027",
  duration: 30, totalMarks: 2, questions: [mcq("1")],
  allowOnline: true, availabilityMode: "always", answerVisibility: "never",
  createdAt: nowIso, updatedAt: nowIso, ...over,
})

const grade1 = {
  id: "g-1", name: "الصف الأول الثانوي", academicYear: "2026-2027", createdAt: nowIso,
  groups: [
    { id: "gr-1", name: "مجموعة السبت", days: ["السبت"], startTime: "16:00", endTime: "18:00", monthlyFee: 300, studentsCount: 0 },
    { id: "gr-2", name: "مجموعة الأحد", days: ["الأحد"], startTime: "18:00", endTime: "20:00", monthlyFee: 300, studentsCount: 0 },
  ],
}
// صف بلا مجموعات (اختبار عام مفتوح للجميع — يبدأ الزائر بلا مجموعة)
const gradeNoGroups = {
  id: "g-9", name: "الصف التمهيدي", academicYear: "2026-2027", createdAt: nowIso, groups: [],
}
const student = {
  id: "st-1", name: "سارة أحمد محمود", phone: "01000000001", email: "sara@test.com",
  gradeId: "g-1", groupId: "gr-1", status: "active", createdAt: nowIso, updatedAt: nowIso,
}
const session = {
  email: "sara@test.com", studentId: "st-1", name: "سارة أحمد محمود",
  iat: Date.now(), exp: Date.now() + 3600_000,
}

const text = (root) => (root.textContent || "").replace(/\s+/g, " ")
const byText = (root, needle, tag = "button") =>
  [...root.querySelectorAll(tag)].find(el => (el.textContent || "").includes(needle))
const inputByLabel = (root, label) => {
  const labels = [...root.querySelectorAll("label")]
  const l = labels.find(x => (x.textContent || "").includes(label))
  if (!l) return null
  const holder = l.parentElement
  return holder?.querySelector("input") || null
}

const mount = async (examId, Component = Page) => {
  globalThis.__routeParams = { id: examId }
  const container = window.document.createElement("div")
  window.document.body.appendChild(container)
  let root
  await act(async () => {
    root = createRoot(container)
    root.render(React.createElement(Component))
    await new Promise(r => setTimeout(r, 60))
  })
  const unmount = async () => {
    await act(async () => { root.unmount() })
    container.remove()
  }
  return { container, unmount }
}

const flush = async () => { await act(async () => { await new Promise(r => setTimeout(r, 20)) }) }

const click = async (el) => {
  await act(async () => {
    el.dispatchEvent(new window.MouseEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 }))
    el.dispatchEvent(new window.MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }))
    el.dispatchEvent(new window.MouseEvent("pointerup", { bubbles: true, cancelable: true, button: 0 }))
    el.dispatchEvent(new window.MouseEvent("mouseup", { bubbles: true, cancelable: true, button: 0 }))
    el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }))
    await new Promise(r => setTimeout(r, 30))
  })
}

const type = async (el, value) => {
  const proto = el instanceof window.HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value)
    el.dispatchEvent(new window.Event("input", { bubbles: true }))
    await new Promise(r => setTimeout(r, 10))
  })
}

// ------------------------------------------------------------
section("1) اختبار للأعضاء فقط + زائر → بوابة تسجيل الدخول (لا يُطلب منه أي بيانات)")

seed({ grades: [grade1], exams: [baseExam({ accessMode: "members" })] })
{
  const { container, unmount } = await mount("ex-1")
  const t = text(container)
  eq("تظهر بوابة «للمسجلين فقط»", t.includes("الاختبار متاح للطلاب المسجلين فقط"), t.slice(0, 120))
  eq("زر تسجيل الدخول يرجع للاختبار نفسه", !!container.querySelector('a[href="/student/login?next=%2Fexam%2Fex-1"]'))
  eq("لا يوجد نموذج بيانات للزائر (لا حقل هاتف)", !inputByLabel(container, "رقم الهاتف"))
  eq("شارة الوضع: للأعضاء المسجلين فقط", t.includes("للأعضاء المسجلين فقط"))
  await unmount()
}

// ------------------------------------------------------------
section("2) اختبار للأعضاء فقط + طالب مسجَّل → هويته تلقائية ويجيب فقط")

seed({ grades: [grade1], students: [student], exams: [baseExam({ accessMode: "members" })], studentPortalSession: session })
{
  const { container, unmount } = await mount("ex-1")
  const t = text(container)
  eq("بطاقة تأكيد بلا أي حقول إدخال", t.includes("تأكيد بدء الاختبار") && container.querySelectorAll("input").length === 0, `inputs=${container.querySelectorAll("input").length}`)
  eq("اسم الطالب ظاهر تلقائياً من حسابه", t.includes("سارة أحمد محمود"))
  eq("صفه ومجموعته ظاهران تلقائياً", t.includes("الصف الأول الثانوي") && t.includes("مجموعة السبت"))
  eq("شارة «مسجل الدخول» ظاهرة", t.includes("مسجل الدخول"))

  await click(byText(container, "بدء الاختبار"))
  eq("بدأ الاختبار بضغطة واحدة (بلا إدخال)", text(container).includes("السؤال 1 من 1"))

  // يجيب عن السؤال الوحيد ثم يُسلّم
  await click(byText(container, "النبات"))
  await click(byText(container, "إنهاء الاختبار وإظهار النتيجة"))
  const attempts = readKey("examAttempts")
  eq("النتيجة ظهرت", text(container).includes("انتهى الاختبار"))
  eq("محاولة العضو مربوطة بحسابه (studentId)", attempts.length === 1 && attempts[0].studentId === "st-1", JSON.stringify(attempts[0] || {}))
  eq("محاولة العضو بلا رقم هاتف (بياناته من حسابه)", attempts.length === 1 && !attempts[0].phone)
  eq("درجته محفوظة من مفتاح التصحيح المختوم", attempts.length === 1 && attempts[0].score === 2 && attempts[0].totalMarks === 2)
  await unmount()
}

// ------------------------------------------------------------
section("3) مفتوح للجميع + زائر → الاسم والهاتف إجباريان والصف ثابت والمجموعة من صفه")

seed({ grades: [grade1], exams: [baseExam({ id: "ex-pub", accessMode: "public", targetGroupIds: ["gr-2"] })] })
{
  const { container, unmount } = await mount("ex-pub")
  const t = text(container)
  eq("تظهر بوابة «مفتوح للجميع — بدون تسجيل»", t.includes("اختبار مفتوح للجميع"), t.slice(0, 140))
  eq("شارة الوضع: مفتوح للجميع", t.includes("مفتوح للجميع — بدون تسجيل"))
  eq("حقل الاسم موجود", !!inputByLabel(container, "الاسم الكامل"))
  eq("حقل رقم الهاتف موجود", !!inputByLabel(container, "رقم الهاتف"))
  eq("الصف ثابت ومعروض (لا قائمة اختيار للصف)", t.includes("الصف الأول الثانوي") && t.includes("محدد مسبقاً من المعلم"))
  eq("قائمة المجموعة موجودة", t.includes("المجموعة *"))
  eq("لا تُطلب منه أي بيانات أخرى (لا بريد ولا كلمة مرور)", !inputByLabel(container, "البريد") && !inputByLabel(container, "كلمة المرور"))

  // بدء بلا بيانات → مرفوض
  await click(byText(container, "بدء الاختبار"))
  eq("بلا اسم → يُمنع البدء برسالة واضحة", text(container).includes("اكتب اسمك كاملاً بالحروف"))

  // اسم سليم وهاتف غير سليم
  await type(inputByLabel(container, "الاسم الكامل"), "محمد علي حسن")
  await type(inputByLabel(container, "رقم الهاتف"), "010abc")
  await click(byText(container, "بدء الاختبار"))
  eq("هاتف بحروف → يُمنع البدء", text(container).includes("رقم الهاتف غير صحيح"))

  // بيانات سليمة بلا مجموعة → يُطلب اختيار المجموعة من قائمته
  await type(inputByLabel(container, "رقم الهاتف"), "٠١٠١٢٣٤٥٦٧٨")
  await click(byText(container, "بدء الاختبار"))
  eq("بلا مجموعة → يُمنع البدء حتى يختار مجموعته", text(container).includes("اختر مجموعتك من القائمة للبدء"))

  // القائمة تعرض مجموعات صفه المستهدفة فقط
  const trigger = [...container.querySelectorAll("[role='combobox'], button")].find(el =>
    (el.textContent || "").includes("اختر مجموعتك"))
  eq("قائمة المجموعات مفتوحة للاختيار", !!trigger)
  let opened = false
  if (trigger) {
    await click(trigger)
    await flush()
    const items = [...window.document.querySelectorAll("[role='option']")].map(el => (el.textContent || "").trim())
    if (items.length > 0) {
      opened = true
      eq("القائمة تعرض المجموعة المستهدفة لصفه فقط", items.some(i => i.includes("مجموعة الأحد")) && !items.some(i => i.includes("مجموعة السبت")), items.join(" | "))
      const wanted = [...window.document.querySelectorAll("[role='option']")].find(el => (el.textContent || "").includes("مجموعة الأحد"))
      await click(wanted)
      await flush()
      await click(byText(container, "بدء الاختبار"))
      eq("بعد اختيار المجموعة يبدأ الاختبار", text(container).includes("السؤال 1 من 1"), text(container).slice(0, 120))
    }
  }
  if (!opened) console.log("  ℹ️  قائمة Radix لم تُفتح في jsdom — المسار الكامل للزائر مُختبر في الحالة 4")
  await unmount()
}

// ------------------------------------------------------------
section("4) مفتوح للجميع + زائر → مسار كامل: بيانات ثم إجابة ثم حفظ المحاولة")

seed({ grades: [gradeNoGroups], exams: [baseExam({ id: "ex-open", gradeId: "g-9", accessMode: "public" })] })
{
  const { container, unmount } = await mount("ex-open")
  await type(inputByLabel(container, "الاسم الكامل"), "زائر بلا حساب")
  await type(inputByLabel(container, "رقم الهاتف"), "01099887766")
  await click(byText(container, "بدء الاختبار"))
  eq("صف بلا مجموعات → يبدأ بعد الاسم والهاتف", text(container).includes("السؤال 1 من 1"), text(container).slice(0, 140))

  await click(byText(container, "النبات"))
  await click(byText(container, "إنهاء الاختبار وإظهار النتيجة"))
  const attempts = readKey("examAttempts")
  eq("انتهى الاختبار وظهرت النتيجة", text(container).includes("انتهى الاختبار"))
  eq("محاولة الزائر محفوظة باسمه", attempts.length === 1 && attempts[0].studentName === "زائر بلا حساب", JSON.stringify(attempts[0] || {}))
  eq("محاولة الزائر محفوظة برقم هاتفه", attempts.length === 1 && attempts[0].phone === "01099887766")
  eq("محاولة الزائر مرتبطة بصف الاختبار", attempts.length === 1 && attempts[0].gradeId === "g-9")
  eq("محاولة الزائر بلا studentId (ليس عضواً)", attempts.length === 1 && !attempts[0].studentId)
  eq("درجته صُححت من المفتاح المختوم", attempts.length === 1 && attempts[0].score === 2)
  await unmount()
}

// ------------------------------------------------------------
section("5) حد المحاولات يسري على الزائر في الاختبار المفتوح للجميع")

seed({
  grades: [gradeNoGroups],
  exams: [baseExam({ id: "ex-limit", gradeId: "g-9", accessMode: "public", maxAttempts: 1 })],
  examAttempts: [{
    id: "old-1", examId: "ex-limit", studentName: "زائر بلا حساب", phone: "01099887766",
    groupId: "", gradeId: "g-9", answers: {}, score: 1, totalMarks: 2,
    startedAt: nowIso, submittedAt: nowIso, durationSeconds: 60,
  }],
})
{
  const { container, unmount } = await mount("ex-limit")
  await type(inputByLabel(container, "الاسم الكامل"), "زائر بلا حساب")
  await type(inputByLabel(container, "رقم الهاتف"), "01099887766")
  await click(byText(container, "بدء الاختبار"))
  eq("زائر استنفد محاولته → يُمنع من البدء", text(container).includes("استُنفدت محاولاتك"), text(container).slice(0, 140))
  await unmount()
}

// ------------------------------------------------------------
section("6) مفتوح للجميع + عضو مسجَّل من نفس الصف → هويته تلقائية بلا إدخال")

seed({ grades: [grade1], students: [student], exams: [baseExam({ accessMode: "public" })], studentPortalSession: session })
{
  const { container, unmount } = await mount("ex-1")
  const t = text(container)
  eq("العضو لا يرى نموذج الزائر", !inputByLabel(container, "رقم الهاتف"), t.slice(0, 120))
  eq("هوية العضو تلقائية في الاختبار المفتوح للجميع", t.includes("سارة أحمد محمود") && t.includes("مسجل الدخول"))
  await unmount()
}

// ------------------------------------------------------------
section("7) مفتوح للجميع + عضو من صف آخر → يدخل كزائر ببياناته")

const grade2 = {
  id: "g-2", name: "الصف الثاني الثانوي", academicYear: "2026-2027", createdAt: nowIso,
  groups: [{ id: "gr-9", name: "مجموعة الاثنين", days: ["الاثنين"], startTime: "17:00", endTime: "19:00", monthlyFee: 320, studentsCount: 0 }],
}
seed({
  grades: [grade1, grade2],
  students: [{ ...student, id: "st-2", name: "طالب من صف آخر", gradeId: "g-2", groupId: "gr-9" }],
  exams: [baseExam({ accessMode: "public" })],
  studentPortalSession: { ...session, studentId: "st-2", name: "طالب من صف آخر" },
})
{
  const { container, unmount } = await mount("ex-1")
  const t = text(container)
  eq("يرى نموذج الزائر (الاختبار ليس لصفه)", !!inputByLabel(container, "رقم الهاتف"), t.slice(0, 140))
  eq("رسالة توضيحية أنه يدخل كزائر", t.includes("لصفٍّ غير صفك"))
  eq("صف الاختبار ما زال ثابتاً له", t.includes("الصف الأول الثانوي") && t.includes("محدد مسبقاً من المعلم"))
  await unmount()
}

// ------------------------------------------------------------
section("8) الاختبار غير المنشور → لا يفتحه أحد (زواراً وأعضاء)")

seed({ grades: [grade1], exams: [baseExam({ accessMode: "public", allowOnline: false })] })
{
  const { container, unmount } = await mount("ex-1")
  const t = text(container)
  eq("غير منشور → لا يفتحه أحد ويُقال إنه غير منشور", t.includes("غير منشور للطلاب") || t.includes("الاختبار غير متاح"), t.slice(0, 140))
  eq("غير منشور → لا زر بدء ولا أسئلة", !byText(container, "بدء الاختبار") && !t.includes("السؤال 1 من"))
  await unmount()
}

// ------------------------------------------------------------
section("9) الصفحة الرئيسية (لوحة الإعلانات): تظهر الاختبارات المفتوحة للجميع فقط")

seed({
  grades: [grade1],
  announcements: [{ id: "an-1", title: "إعلان مهم", body: "محتوى الإعلان", pinned: true, createdAt: nowIso }],
  exams: [
    baseExam({ id: "ex-pub", accessMode: "public", title: "اختبار مفتوح للجميع" }),
    baseExam({ id: "ex-mem", accessMode: "members", title: "اختبار الأعضاء فقط" }),
    baseExam({ id: "ex-hidden", accessMode: "public", allowOnline: false, title: "اختبار غير منشور" }),
  ],
})
{
  const { container, unmount } = await mount("/", HomePage)
  const links = [...container.querySelectorAll("a")].map(a => a.getAttribute("href"))
  const t = text(container)
  eq("قسم الاختبارات المفتوحة ظاهر في اللوحة", t.includes("اختبارات مفتوحة الآن"))
  eq("الاختبار المفتوح للجميع يظهر برابطه", links.includes("/exam/ex-pub"), links.join(","))
  eq("شارة «بدون تسجيل» توضّح أنه بلا تسجيل دخول", t.includes("بدون تسجيل"))
  eq("اسم الصف يظهر للزائر", t.includes("الصف: الصف الأول الثانوي"))
  eq("اختبار الأعضاء لا يظهر للعامة", !links.includes("/exam/ex-mem"))
  eq("الاختبار غير المنشور لا يظهر", !links.includes("/exam/ex-hidden"))
  eq("الإعلانات ما زالت تظهر في اللوحة", t.includes("إعلان مهم"))
  await unmount()
}

// ------------------------------------------------------------
section("10) لوحة تحكم الاختبار (المعلم): اختيار «مفتوح للجميع» وحفظه")

seed({ grades: [grade1], exams: [baseExam({ id: "ex-dash", allowOnline: false })] })
{
  const { container, unmount } = await mount("/dashboard/exams", DashboardExams)
  await flush()

  const settingsBtn = container.querySelector('button[title="لوحة تحكم الظهور والمحاولات"]')
  eq("زر لوحة تحكم الاختبار موجود بجانب كل اختبار", !!settingsBtn)
  if (settingsBtn) {
    await click(settingsBtn)
    await flush()
    const dialogText = text(window.document.body)
    eq("لوحة التحكم تفتح", dialogText.includes("لوحة تحكم الاختبار"), dialogText.slice(0, 100))

    // إظهار الاختبار للطلاب (Radix Switch)
    const showSwitch = window.document.querySelector('button[role="switch"]')
    eq("مفتاح «إظهار الاختبار للطلاب» موجود", !!showSwitch)
    if (showSwitch && showSwitch.getAttribute("aria-checked") !== "true") {
      await click(showSwitch)
      await flush()
    }

    const bodyText = text(window.document.body)
    eq("سؤال «من يستطيع فتح الاختبار؟» يظهر في اللوحة", bodyText.includes("من يستطيع فتح الاختبار؟"))
    eq("الخياران معروضان: للأعضاء فقط / مفتوح لأي أحد بدون تسجيل",
      bodyText.includes("للأعضاء المسجلين فقط") && bodyText.includes("مفتوح لأي أحد بدون تسجيل"))
    eq("الوضع الافتراضي للأعضاء (اختيار آمن)", bodyText.includes("لا يفتح الاختبار إلا طالب مسجَّل الدخول"))

    // اختيار «مفتوح للجميع»
    const publicOpt = [...window.document.querySelectorAll("button")].find(b =>
      (b.textContent || "").includes("مفتوح لأي أحد بدون تسجيل"))
    eq("زر وضع «مفتوح للجميع» قابل للضغط", !!publicOpt)
    if (publicOpt) {
      await click(publicOpt)
      await flush()
      eq("شرح الوضع المفتوح يظهر بعد اختياره", text(window.document.body).includes("الزوار يفتحون الاختبار من الصفحة الرئيسية"))
      eq("قسم رابط النشر يظهر للمعلم", text(window.document.body).includes("رابط الاختبار — انشره في أي مكان"))
      const linkInput = [...window.document.querySelectorAll("input")].find(i => (i.value || "").includes("/exam/ex-dash"))
      eq("رابط الاختبار المفتوح للجميع كامل وجاهز للنسخ", linkInput?.value === "http://localhost/exam/ex-dash", linkInput?.value || "غير موجود")
    }

    // حفظ اللوحة
    const saveBtn = [...window.document.querySelectorAll("button")].find(b =>
      (b.textContent || "").includes("حفظ لوحة التحكم"))
    eq("زر حفظ لوحة التحكم موجود", !!saveBtn)
    if (saveBtn) {
      await click(saveBtn)
      await flush()
      const saved = readKey("exams").find(e => e.id === "ex-dash")
      eq("الاختيار حُفظ: accessMode = public", saved?.accessMode === "public", JSON.stringify(saved?.accessMode))
      eq("الاختبار أصبح منشوراً للطلاب", saved?.allowOnline === true)
      const cardText = text(container)
      eq("بطاقة الاختبار تعرض «مفتوح للجميع — بدون تسجيل»", cardText.includes("مفتوح للجميع — بدون تسجيل"), cardText.slice(0, 160))
    }
  }
  await unmount()
}

// ------------------------------------------------------------
section("11) إنشاء اختبار: الاختيار الصريح بين ورقي وإلكتروني ثم أنماط الإلكتروني")

const openNewExam = async (expectedMode) => {
  seed({ grades: [grade1], exams: [] })
  const mounted = await mount("/dashboard/exams", DashboardExams)
  await flush()
  const createBtn = [...window.document.querySelectorAll("button")].find(b =>
    (b.textContent || "").includes("إنشاء أول اختبار"))
  eq(`زر إنشاء اختبار جديد ظاهر (${expectedMode})`, !!createBtn)
  if (!createBtn) return mounted
  await click(createBtn)
  await flush()
  const chooserText = text(window.document.body)
  eq("تظهر نافذة اختيار نوع الاختبار", chooserText.includes("اختر نوع الاختبار"))
  eq("خيار اختبار ورقي ظاهر", chooserText.includes("اختبار ورقي"))
  eq("خيار اختبار إلكتروني ظاهر", chooserText.includes("اختبار إلكتروني"))
  const choice = [...window.document.querySelectorAll("button")].find(b =>
    (b.textContent || "").includes(expectedMode === "online" ? "أداء إلكتروني ونتائج مباشرة" : "ورقة مطبوعة"))
  eq(`يمكن اختيار اختبار ${expectedMode === "online" ? "إلكتروني" : "ورقي"}`, !!choice)
  if (choice) {
    await click(choice)
    await flush()
  }
  if (expectedMode === "online") {
    const modeText = text(window.document.body)
    eq("تظهر أنماط الإلكتروني الثلاثة", modeText.includes("اختياري وصح وخطأ") && modeText.includes("اختبار مقالي") && modeText.includes("اختبار مختلط"))
    const objectiveMode = [...window.document.querySelectorAll("button")].find(b =>
      (b.textContent || "").includes("اختياري وصح وخطأ"))
    eq("يمكن اختيار نمط اختياري وصح وخطأ", !!objectiveMode)
    if (objectiveMode) {
      await click(objectiveMode)
      await flush()
    }
  }
  return mounted
}

{
  const { unmount } = await openNewExam("offline")
  const editorText = text(window.document.body)
  eq("محرر الورقي يوضح الطباعة وPDF", editorText.includes("ورقي") && editorText.includes("اطبعها أو حمّلها PDF"))
  eq("محرر الورقي لا يعرض إعدادات النشر", !editorText.includes("نشر الاختبار للطلاب على الموقع"))
  await unmount()
}
{
  const { unmount } = await openNewExam("online")
  const editorText = text(window.document.body)
  eq("محرر الإلكتروني يعرض إعدادات النشر", editorText.includes("اختبار إلكتروني") && editorText.includes("نشر الاختبار للطلاب على الموقع"))
  eq("محرر الإلكتروني يوضح أنه مسودة قبل النشر", editorText.includes("مسودة خاصة بك"))
  await unmount()
}

// ------------------------------------------------------------
section("صفر تخزين محلي — الاختبارات والنتائج في Supabase فقط")
{
  const DATA_KEYS = ["grades","students","exams","examAttempts","studentAccounts","announcements",
    "honorees","sessions","attendance","dues","payments","manualGrades","registrationRequests",
    "groupTransferRequests","studentHistory","inquiries","sharedFiles","importantLinks",
    "yearArchives","currentAcademicYear","studentPortalSession","teacherName"]
  const leaked = localKeys().filter((k) => DATA_KEYS.includes(k))
  eq("بعد كل سيناريوهات الاختبار: لا بيانات في التخزين المحلي للجهاز", leaked.length === 0, leaked.join("، ") || "لا شيء")
  eq("المسموح على الجهاز: عدّاد حماية الإغراق فقط",
    localKeys().every((k) => k === "studentRateLimits"), localKeys().join("، ") || "لا شيء")

  // حفظ نتيجة/محاولة لا يكتب على الجهاز
  seed({ grades: [grade1], students: [student], exams: [baseExam({ accessMode: "members" })], studentPortalSession: session })
  const before = localKeys().length
  MEM.writeRows("examAttempts", [...MEM.readRows("examAttempts"), { id: "att-local-check", examId: "ex-1", studentId: "st-1", studentName: "طالب", groupId: "gr-1", gradeId: "g-1", answers: {}, score: 5, totalMarks: 10, startedAt: nowIso, submittedAt: nowIso, durationSeconds: 60 }])
  eq("تسجيل محاولة في ذاكرة الجلسة لا يضيف أي مفتاح محلي", localKeys().length === before && readKey("examAttempts").length === 1)

  // كاش قديم يُمسح نهائياً
  window.localStorage.setItem("examAttempts", JSON.stringify([{ id: "legacy-att" }]))
  window.localStorage.setItem("grades", JSON.stringify([{ id: "legacy-g", name: "قديم", groups: [] }]))
  MEM.purgeLegacyLocalStorage()
  eq("أي كاش قديم من إصدار سابق يُمسح من الجهاز نهائياً",
    window.localStorage.getItem("examAttempts") === null && window.localStorage.getItem("grades") === null)
  eq("الجلسة تبقى كوكي فقط (لا نسخة محلية)",
    window.localStorage.getItem("studentPortalSession") === null && document.cookie.includes("studentPortalSession="))
}

// ------------------------------------------------------------
console.log(`\n${"=".repeat(56)}`)
console.log(`\x1b[1mالنتيجة: ${pass} ناجح / ${fail} فاشل\x1b[0m`)
if (fail) {
  fails.forEach(f => console.log("  • " + f))
  rmSync(TMP, { recursive: true, force: true })
  process.exit(1)
}
rmSync(TMP, { recursive: true, force: true })
console.log("\x1b[32mكل اختبارات فتح الاختبار (أعضاء / مفتوح للجميع) نجحت ✅\x1b[0m")
