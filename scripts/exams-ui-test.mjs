/**
 * اختبار حي لقسم الاختبارات في لوحة المعلم — node scripts/exams-ui-test.mjs
 *
 * يصوّر الصفحة الحقيقية (src/app/dashboard/exams/page.tsx) داخل jsdom بلا متصفح
 * (البنية التحتية نفسها المستعملة في exam-access-test.mjs) ويتحقق من سلوك
 * لا تغطيه اختبارات المنطق وحدها:
 *   1) الفلاتر وطريقتا العرض (كروت/قائمة)
 *   2) مراجعة المعلم: الإجابة الخاطئة بالأحمر، وإلغاء التعديل اليدوي القديم
 *   3) إطلاق النتيجة يُرشّح المتفوق للوحة الشرف (المقال/المختلط)
 *   4) حالة المحاولة الموضوعية: «النتيجة ظاهرة للطالب»
 *   5) محرر اختبار محفوظ كـ«عام» يفتح على «عام — كل الصفوف»
 *   6) الحفظ التلقائي يُخفي اختباراً منشوراً صار ناقصاً — مع تنبيه مرة واحدة
 *   7) تصحيح «أكمل» متعدد المفردات
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs"
import { resolve, join, dirname, relative, extname } from "node:path"
import { pathToFileURL } from "node:url"
import ts from "typescript"
import { JSDOM } from "jsdom"

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
const TMP = resolve(ROOT, ".tmp-exams-ui")
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

// react-hot-toast بديل يسجّل الرسائل: نتحقق بها من تنبيهات الحفظ التلقائي
STUBS["react-hot-toast"] = `// القراءة من globalThis عند كل نداء: الاختبار يصفّر السجل بين السيناريوهات
const push = (message, opts) => {
  const list = (globalThis.__toasts ||= [])
  list.push({ message: String(message && message.message ? message.message : message), ...(opts || {}) })
  return "t" + list.length
}
push.success = (m, o) => push(m, { ...(o || {}), type: "success" })
push.error = (m, o) => push(m, { ...(o || {}), type: "error" })
push.dismiss = () => {}
export default push
`

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

const ENTRY_DASHBOARD = resolve(ROOT, "src/app/dashboard/exams/page.tsx")

const built = new Map()
const queue = [ENTRY_DASHBOARD]

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
const importBuilt = (absPath) => import(pathToFileURL(built.get(absPath)).href)
const DashboardExams = (await importBuilt(ENTRY_DASHBOARD)).default
// الوحدات الحقيقية نفسها التي تستعملها الصفحة
const store = await importBuilt(resolve(ROOT, "src/lib/data-storage.ts"))
const gradeLib = await importBuilt(resolve(ROOT, "src/lib/exam-grade.ts"))
const portal = await importBuilt(resolve(ROOT, "src/lib/portal-content.ts"))
const MEM = await importBuilt(resolve(ROOT, "src/lib/memory-store.ts"))


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

/** التغذية كما تفعل pullAllData من Supabase: في ذاكرة الجلسة فقط */
const seed = (data) => {
  MEM.clearStore()
  window.localStorage.clear()
  globalThis.__toasts = []
  for (const [k, v] of Object.entries(data)) MEM.writeRows(k, v)
}
const toasts = () => globalThis.__toasts || []

// الحوارات تُرسم في Portal على body، فالقراءة من body لا من حاوية الصفحة وحدها
const text = (root = window.document.body) => (root.textContent || "").replace(/\s+/g, " ")
const byText = (needle, tag = "button", root = window.document.body) =>
  [...root.querySelectorAll(tag)].find(el => (el.textContent || "").includes(needle))
const allByText = (needle, tag = "button", root = window.document.body) =>
  [...root.querySelectorAll(tag)].filter(el => (el.textContent || "").trim() === needle)
const leafOf = (needle) => [...window.document.body.querySelectorAll("*")]
  .find(el => el.children.length === 0 && (el.textContent || "").trim() === needle)
const RESULTS_BUTTON_TITLE = "نتائج الطلاب وتعديل الدرجات يدوياً"
/** محرر الاختبار شاشة كاملة (section ثابت) وليس حوار Radix */
const editorRoot = () => window.document.querySelector("section.fixed.inset-0")
/** يصعد من عنوان البطاقة إلى أول نطاق يحتوي الزر المطلوب */
const scopeOfCard = (title, selector) => {
  let el = leafOf(title)
  while (el && el !== window.document.body) {
    const found = el.querySelector(selector)
    if (found) return found
    el = el.parentElement
  }
  return null
}

/** زر تحرير الاختبار داخل بطاقته (أيقونة قلم) */
const editButtonOf = (title) => {
  let el = leafOf(title)
  while (el && el !== window.document.body) {
    const btn = [...el.querySelectorAll("button")]
      .find(b => b.querySelector('svg[class*="lucide-pen"], svg[class*="lucide-edit"]'))
    if (btn) return btn
    el = el.parentElement
  }
  return null
}

const mountPage = async () => {
  const container = window.document.createElement("div")
  window.document.body.appendChild(container)
  let root
  await act(async () => {
    root = createRoot(container)
    root.render(React.createElement(DashboardExams))
    await new Promise(r => setTimeout(r, 90))
  })
  const unmount = async () => {
    await act(async () => { root.unmount() })
    for (const el of [...window.document.body.children]) el.remove()
  }
  return { container, unmount }
}
const flush = async (ms = 25) => { await act(async () => { await new Promise(r => setTimeout(r, ms)) }) }
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
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(el, value)
    el.dispatchEvent(new window.Event("input", { bubbles: true }))
    await new Promise(r => setTimeout(r, 10))
  })
}

// ------------------------------------------------------------
// بيانات الاختبار
// ------------------------------------------------------------
const nowIso = new Date().toISOString()
const grade = {
  id: "g-1", name: "الصف الأول الثانوي", academicYear: "2026-2027", createdAt: nowIso,
  groups: [{ id: "gr-1", name: "مجموعة السبت", days: ["السبت"], startTime: "16:00", endTime: "18:00", monthlyFee: 300, studentsCount: 0 }],
}
const mcq = (id, correctId, marks = 2) => ({
  id: `q-${id}`, questionType: 1, questionNumber: 1, orderNumber: 1, headerText: "اختر الإجابة الصحيحة",
  subQuestions: [{
    id: `sq-${id}`, orderNumber: 1, questionText: "أي مما يلي غاز في الهواء؟", marks,
    choices: [
      { id: `${id}-c1`, choiceKey: "أ", choiceText: "الأكسجين", isCorrect: correctId === `${id}-c1` },
      { id: `${id}-c2`, choiceKey: "ب", choiceText: "الهيدروجين", isCorrect: correctId === `${id}-c2` },
    ],
  }],
})
const essay = (id, marks = 8) => ({
  id: `q-${id}`, questionType: 8, questionNumber: 2, orderNumber: 2, headerText: "اشرح",
  subQuestions: [{ id: `sq-${id}`, orderNumber: 1, questionText: "اشرح عملية البناء الضوئي", marks, correctAnswer: "" }],
})
const baseExam = (over) => ({
  gradeId: "g-1", groupId: "gr-1", academicYear: "2026-2027", month: 9, duration: 60,
  deliveryMode: "online", onlineExamMode: "objective", allowOnline: true, accessMode: "members",
  availabilityMode: "always", answerVisibility: "never", autoHonorBoard: false, maxAttempts: 1,
  createdAt: nowIso, updatedAt: nowIso, ...over,
})
const mixedExam = baseExam({
  id: "ex-mixed", title: "اختبار الوحدة الأولى (مختلط)", onlineExamMode: "mixed", totalMarks: 10,
  autoHonorBoard: true, honorMinPercent: 80, questions: [mcq("m", "m-c1"), essay("e")],
})
const objExam = baseExam({
  id: "ex-obj", title: "اختبار موضوعي سريع", totalMarks: 2, questions: [mcq("o", "o-c1")],
})
const generalExam = baseExam({
  id: "ex-general", title: "اختبار عام لكل الصفوف", gradeId: "", groupId: "",
  accessMode: "public", totalMarks: 2, questions: [mcq("g", "g-c1")],
})
const mixedAttempt = {
  id: "at-1", examId: "ex-mixed", studentId: "st-1", studentName: "سارة أحمد", gradeId: "g-1", groupId: "gr-1",
  answers: { "sq-m": { choiceId: "m-c2" }, "sq-e": { text: "البناء الضوئي يحول الضوء إلى طاقة كيميائية" } },
  score: 0, totalMarks: 10, autoScore: 0, autoTotal: 2, manualScore: 0, manualTotal: 8,
  gradingStatus: "pending_manual", submittedAt: nowIso, percent: 0,
  manualOverride: { score: 1, totalMarks: 10, reason: "تعديل قديم قبل المراجعة", at: nowIso },
}
const objAttempt = {
  id: "at-2", examId: "ex-obj", studentId: "st-2", studentName: "محمد سامي", gradeId: "g-1", groupId: "gr-1",
  answers: { "sq-o": { choiceId: "o-c1" } },
  score: 2, totalMarks: 2, autoScore: 2, autoTotal: 2, manualScore: 0, manualTotal: 0,
  gradingStatus: "graded", submittedAt: nowIso, percent: 100,
}

// ------------------------------------------------------------
section("1) تصحيح «أكمل» متعدد المفردات (بلا واجهة)")
{
  const fill = { id: "f", questions: [{ id: "q", questionType: 2, subQuestions: [
    { id: "s1", marks: 2, questionText: "أكمل", correctAnswer: "الصوديوم، الكلور" }] }] }
  eq("فاصلة في المفتاح و«و» في الإجابة تُحتسب صحيحة",
    gradeLib.gradeExam(fill, { s1: { text: "الصوديوم والكلور" } }).score === 2)
  eq("ترتيب مختلف للمفردات مقبول",
    gradeLib.gradeExam(fill, { s1: { text: "الكلور والصوديوم" } }).score === 2)
  const one = { id: "f2", questions: [{ id: "q", questionType: 2, subQuestions: [
    { id: "s1", marks: 2, questionText: "أكمل", correctAnswer: "القلب" }] }] }
  eq("إجابة أطول من مفتاح المفردة الواحدة تبقى خاطئة",
    gradeLib.gradeExam(one, { s1: { text: "ليس القلب" } }).score === 0)
  eq("ترقيم ومسافات زائدة لا تُبطل الإجابة",
    gradeLib.gradeExam(one, { s1: { text: " القلب. " } }).score === 2)
  eq("shouldPromoteToHonor تحترم الحد الأدنى",
    gradeLib.shouldPromoteToHonor({ autoHonorBoard: true, honorMinPercent: 80 }, { autoTotal: 10, percent: 79 }) === false
    && gradeLib.shouldPromoteToHonor({ autoHonorBoard: true, honorMinPercent: 80 }, { autoTotal: 10, percent: 80 }) === true)
}

// ------------------------------------------------------------
section("2) الفلاتر وطريقتا العرض في قائمة الاختبارات")
seed({ grades: [grade], exams: [mixedExam, objExam, generalExam], examAttempts: [], honorees: [] })
{
  const { unmount } = await mountPage()
  eq("مبدّل طريقة العرض موجود", !!window.document.querySelector('[aria-label="طريقة عرض الاختبارات"]'))
  eq("فلتر نوع الاختبار موجود", text().includes("نوع الاختبار"))
  const before = window.document.body.innerHTML
  await click(window.document.querySelector('[title="عرض قائمة"]'))
  eq("التبديل إلى قائمة يغيّر الرسم", window.document.body.innerHTML !== before)
  eq("زر القائمة صار مضغوطاً", window.document.querySelector('[title="عرض قائمة"]')?.getAttribute("aria-pressed") === "true")
  await click(window.document.querySelector('[title="عرض كروت"]'))
  eq("العودة إلى الكروت", window.document.querySelector('[title="عرض كروت"]')?.getAttribute("aria-pressed") === "true")
  await unmount()
}

// ------------------------------------------------------------
section("3) مراجعة المعلم: الإجابة الخاطئة بالأحمر + إلغاء التعديل اليدوي + لوحة الشرف")
seed({ grades: [grade], exams: [mixedExam, objExam, generalExam], examAttempts: [mixedAttempt, objAttempt], honorees: [] })
{
  const { unmount } = await mountPage()
  await click(scopeOfCard(mixedExam.title, `[title="${RESULTS_BUTTON_TITLE}"]`))
  await flush()
  eq("قائمة المحاولات مفتوحة", text().includes("سارة أحمد"))
  eq("قبل المراجعة يظهر رقم التعديل اليدوي القديم 1 / 10", text().includes("1 / 10"))

  await click(byText("مراجعة الإجابات"))
  await flush()
  eq("تنبيه التعديل اليدوي القديم ظاهر", text().includes("على هذه المحاولة تعديل درجة يدوي (1 / 10)"))
  const wrong = [...window.document.body.querySelectorAll("*")]
    .filter(el => el.children.length === 0 && (el.textContent || "").includes("إجابة خاطئة"))
  eq("الإجابة الخاطئة موسومة «إجابة خاطئة»", wrong.length > 0)
  eq("لونها أحمر فعلاً", wrong.some(el => /rose|red/.test(el.className)))
  eq("المقال موسوم «يحتاج تصحيحاً»", text().includes("يحتاج تصحيحاً"))

  const verdicts = allByText("صحيحة")
  eq("أزرار قرار التصحيح ظاهرة لكل إجابة", verdicts.length === 2, String(verdicts.length))
  await click(verdicts[verdicts.length - 1])
  await click(byText("حفظ وإطلاق النتيجة"))
  await flush(90)

  const saved = store.getExamAttempts().find(a => a.id === "at-1")
  eq("المحاولة أُطلقت للطالب", !!saved.resultReleasedAt)
  eq("الدرجة: آلي 0 + مقالي 8 من 10", saved.score === 0 && saved.manualScore === 8 && saved.totalMarks === 10,
    `${saved.score}+${saved.manualScore}/${saved.totalMarks}`)
  eq("التعديل اليدوي القديم أُلغي", saved.manualOverride === undefined, JSON.stringify(saved.manualOverride))
  eq("effectiveAttemptScore = 8 (رقم واحد للطالب والقائمة)", portal.effectiveAttemptScore(saved) === 8)
  const honoree = store.getHonorees().find(h => h.examId === "ex-mixed")
  eq("⭐ الاختبار المختلط يدخل لوحة الشرف عند الإطلاق", !!honoree, `عدد المكرمين ${store.getHonorees().length}`)
  eq("سجل التكريم باسم الطالبة ودرجتها",
    !!honoree && honoree.studentName === "سارة أحمد" && honoree.score === 8 && honoree.reason.includes("8/10"))
  eq("القائمة صارت تعرض 8 / 10 بدل 1 / 10", text().includes("8 / 10"))
  await unmount()
}

// ------------------------------------------------------------
section("4) حالة المحاولة الموضوعية: النتيجة ظاهرة بلا انتظار إطلاق")
seed({ grades: [grade], exams: [mixedExam, objExam, generalExam], examAttempts: [mixedAttempt, objAttempt], honorees: [] })
{
  eq("attemptNeedsResultRelease = false للموضوعي المصحح", portal.attemptNeedsResultRelease(objAttempt) === false)
  const { unmount } = await mountPage()
  await click(scopeOfCard(objExam.title, `[title="${RESULTS_BUTTON_TITLE}"]`))
  await flush()
  eq("الوسم «النتيجة ظاهرة للطالب»", text().includes("النتيجة ظاهرة للطالب"))
  eq("لا وسم «بانتظار الإطلاق»", !text().includes("بانتظار الإطلاق"))
  await unmount()
}

// ------------------------------------------------------------
section("5) محرر اختبار محفوظ كـ«عام» يفتح على «عام — كل الصفوف»")
seed({ grades: [grade], exams: [mixedExam, objExam, generalExam], examAttempts: [], honorees: [] })
{
  const { unmount } = await mountPage()
  const penBtn = editButtonOf(generalExam.title)
  eq("زر تحرير الاختبار العام موجود", !!penBtn)
  await click(penBtn)
  await flush(120)
  const editor = editorRoot()
  eq("المحرر مفتوح كشاشة كاملة", !!editor)
  const combos = [...(editor?.querySelectorAll('button[role="combobox"]') || [])].map(el => ({
    label: (el.textContent || "").trim(),
    disabled: el.hasAttribute("data-disabled") || el.getAttribute("aria-disabled") === "true",
  }))
  eq("قائمة الصف في المحرر على «عام — كل الصفوف»",
    combos.some(c => c.label.includes("عام — كل الصفوف")), JSON.stringify(combos))
  eq("لا تظهر «اختر الصف أولاً» داخل المحرر", !(editor?.textContent || "").includes("اختر الصف أولاً"))
  eq("اختيار المجموعة معطّل للاختبار العام", combos.some(c => c.disabled), JSON.stringify(combos))
  await unmount()
}

// ------------------------------------------------------------
section("6) الحفظ التلقائي يُخفي اختباراً منشوراً صار ناقصاً — مع تنبيه مرة واحدة")
seed({ grades: [grade], exams: [objExam], examAttempts: [], honorees: [] })
{
  const { unmount } = await mountPage()
  eq("الاختبار منشور قبل التحرير", store.getExams().find(e => e.id === "ex-obj").allowOnline === true)
  await click(editButtonOf(objExam.title))
  await flush(120)
  eq("المحرر مفتوح", !!editorRoot())
  // فتح بطاقة السؤال (مطوية افتراضياً) ثم تفريغ نص الخيار الأول
  const questionHeader = [...editorRoot().querySelectorAll(".cursor-pointer")]
    .find(el => (el.textContent || "").includes("السؤال"))
  eq("رأس بطاقة السؤال قابل للفتح", !!questionHeader)
  await click(questionHeader)
  await flush(60)
  const choiceInput = editorRoot().querySelector('input[placeholder="الخيار أ"]')
  eq("حقل نص الخيار ظاهر بعد فتح السؤال", !!choiceInput)
  await type(choiceInput, "")
  await flush(900) // مهلة الحفظ التلقائي 650ms

  const after = store.getExams().find(e => e.id === "ex-obj")
  eq("الحفظ التلقائي أخفى الاختبار عن الطلاب", after.allowOnline !== true, String(after.allowOnline))
  const warnings = toasts().filter(t => (t.message || "").includes("أُخفي الاختبار عن الطلاب مؤقتاً"))
  eq("ظهر تنبيه يشرح الإخفاء", warnings.length === 1, JSON.stringify(toasts().map(t => t.message)))
  // تعديل ثانٍ في الجلسة نفسها لا يكرر التنبيه
  const titleInput = [...editorRoot().querySelectorAll("input")]
    .find(el => (el.value || "").includes("اختبار موضوعي سريع"))
  if (titleInput) {
    await type(titleInput, "اختبار موضوعي سريع — نسخة معدلة")
    await flush(900)
  }
  eq("التنبيه لا يتكرر في جلسة التحرير نفسها",
    toasts().filter(t => (t.message || "").includes("أُخفي الاختبار عن الطلاب مؤقتاً")).length === 1,
    JSON.stringify(toasts().map(t => t.message)))
  await unmount()
}

// ------------------------------------------------------------
console.log(`\n${"=".repeat(56)}`)
console.log(`النتيجة: ${pass} ناجح / ${fail} فاشل`)
if (fail) {
  console.log("الإخفاقات:\n  • " + fails.join("\n  • "))
  rmSync(TMP, { recursive: true, force: true })
  process.exit(1)
}
rmSync(TMP, { recursive: true, force: true })
console.log("\x1b[32mكل اختبارات واجهة قسم الاختبارات نجحت ✅\x1b[0m")
