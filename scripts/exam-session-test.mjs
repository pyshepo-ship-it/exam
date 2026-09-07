/** Regression tests for server-timed exams and shared-device result privacy.
 * Real page + sync.ts in jsdom; only Supabase transport and device fingerprint APIs are replaced.
 * No production data, credentials, browser data stores, or network calls.
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
const TMP = resolve(ROOT, ".tmp-exam-session")
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

const built = new Map()
const queue = [ENTRY_EXAM]

while (queue.length) {
  const file = queue.shift()
  if (built.has(file)) continue
  const sourceOverrides = {
    [resolve(ROOT, "src/lib/supabase/client.ts")]: `export const isSupabaseConfigured = () => !!globalThis.__examCloud
export const createClient = () => globalThis.__examCloud`,
    [resolve(ROOT, "src/lib/device-identity.ts")]: `export const getDeviceCard = () => "a".repeat(32)
export const getDeviceFingerprint = async () => "b".repeat(64)
export const getCachedFingerprint = () => "b".repeat(64)
export const getDeviceIdentity = async () => ({ card: "a".repeat(32), fingerprint: "b".repeat(64) })
export const isValidDeviceCard = () => true
export const isValidFingerprint = () => true`,
  }
  const src = sourceOverrides[file] || readFileSync(file, "utf8")
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
// مخزن ذاكرة الجلسة (المكان الوحيد المؤقت للبيانات — لا تخزين محلي)
const MEM = (await import(
  pathToFileURL(built.get(resolve(ROOT, "src/lib/memory-store.ts"))).href
))

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
const student = {
  id: "st-1", name: "سارة أحمد محمود", phone: "01000000001", email: "sara@test.com",
  gradeId: "g-1", groupId: "gr-1", status: "active", createdAt: nowIso, updatedAt: nowIso,
}
const session = {
  email: "sara@test.com", studentId: "st-1", name: "سارة أحمد محمود",
  iat: Date.now(), exp: Date.now() + 3600_000, token: "test-secure-portal-token",
}

const text = (root) => (root.textContent || "").replace(/\s+/g, " ")
const byText = (root, needle, tag = "button") =>
  [...root.querySelectorAll(tag)].find(el => (el.textContent || "").includes(needle))
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
  const rerender = async (id) => {
    globalThis.__routeParams = { id }
    await act(async () => { root.render(React.createElement(Component)); await new Promise(r => setTimeout(r, 20)) })
  }
  return { container, unmount, rerender }
}

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


const SYNC = await import(pathToFileURL(built.get(resolve(ROOT, "src/lib/supabase/sync.ts"))).href)
const CAPS = await import(pathToFileURL(built.get(resolve(ROOT, "src/lib/online-exam-result-session.ts"))).href)
const realNow = Date.now.bind(Date)
let wallOffset = 0
Date.now = () => realNow() + wallOffset
const realPerformanceNow = performance.now.bind(performance)
let monotonic = 0
Object.defineProperty(performance, "now", { configurable: true, value: () => monotonic })
const intervalCallbacks = new Map()
let intervalId = 0
window.setInterval = (callback, delay) => {
  const id = ++intervalId
  intervalCallbacks.set(id, { callback, delay })
  return id
}
window.clearInterval = id => intervalCallbacks.delete(id)
const fireInterval = async delay => {
  await act(async () => {
    for (const timer of [...intervalCallbacks.values()]) if (timer.delay === delay) timer.callback()
    await new Promise(r => setTimeout(r, 10))
  })
}
const dispatch = async (target, event) => {
  await act(async () => { target.dispatchEvent(new window.Event(event)); await new Promise(r => setTimeout(r, 10)) })
}
const serverBase = realNow()
let serverElapsed = 0
let rpcCalls = []
let serverSession
let savedAnswers = {}
let serverAttempt
let failSubmit = false
const resultRows = new Map()

function cloudFor(exam, { submitFails = false } = {}) {
  rpcCalls = []
  savedAnswers = {}
  serverAttempt = undefined
  failSubmit = submitFails
  serverElapsed = 0
  monotonic = 0
  serverSession = undefined
  const dbRows = {
    grades: [{ id: grade1.id, name: grade1.name }],
    groups: grade1.groups.map(group => ({ id: group.id, grade_id: grade1.id, name: group.name })),
  }
  const response = data => ({ data, error: null })
  globalThis.__examCloud = {
    from(table) {
      const query = {
        select: () => query, eq: () => query, order: () => query, limit: () => query,
        in: () => query, is: () => query,
        then: (yes, no) => Promise.resolve(response(dbRows[table] || [])).then(yes, no),
      }
      return query
    },
    async rpc(name, args) {
      rpcCalls.push({ name, args })
      const now = new Date(serverBase + serverElapsed).toISOString()
      const timing = () => ({ ...serverSession, serverNow: now })
      if (name === "get_public_online_exams") return response([{ ...SYNC.toExamRow(exam), server_now: now }])
      if (name === "start_online_exam_session") {
        serverSession = {
          id: args.p_session_id, secret: "s".repeat(64), attemptId: args.p_attempt_id,
          startedAt: now, expiresAt: new Date(serverBase + serverElapsed + (exam.duration || 60) * 60000).toISOString(),
        }
        return response(timing())
      }
      if (name === "get_online_exam_result") {
        return response({ state: "submitted", attempt: resultRows.get(args.p_session_id), feedback: {} })
      }
      if (name === "get_online_exam_answer_feedback") return response({ answers: {} })
      if (name === "save_online_exam_progress") {
        const expired = serverBase + serverElapsed >= Date.parse(serverSession.expiresAt)
        if (!expired && !serverAttempt) savedAnswers = args.p_answers
        return response({ ...timing(), state: serverAttempt ? "submitted" : expired ? "expired" : "saved" })
      }
      if (name === "get_online_exam_session_status") {
        return response({ ...timing(), state: serverAttempt ? "submitted" : serverBase + serverElapsed >= Date.parse(serverSession.expiresAt) ? "expired" : "in_progress" })
      }
      if (name === "submit_online_exam_session") {
        if (failSubmit) return { data: null, error: { message: "network unavailable" } }
        const timedOut = serverBase + serverElapsed >= Date.parse(serverSession.expiresAt)
        if (args.p_only_if_expired && !timedOut && !serverAttempt) return response({ ...timing(), state: "in_progress" })
        serverAttempt ||= {
          id: serverSession.attemptId, examId: exam.id, studentId: "st-1", studentName: student.name,
          groupId: "gr-1", gradeId: "g-1", answers: timedOut ? savedAnswers : args.p_answers,
          score: 2, totalMarks: 2, autoScore: 2, autoTotal: 2, manualTotal: 0,
          startedAt: serverSession.startedAt, submittedAt: now, durationSeconds: serverElapsed / 1000,
          timedOut,
        }
        return response({ state: "submitted", attempt: serverAttempt, timedOut })
      }
      throw new Error(`Unexpected RPC: ${name}`)
    },
  }
}
const seedMember = (exam = baseExam({ accessMode: "members" })) => {
  CAPS.clearRememberedOnlineExamResultSessions()
  seed({ exams: [exam], grades: [grade1], students: [student], studentPortalSession: { ...session, exp: realNow() + 86400000 } })
  cloudFor(exam)
  return exam
}

section("Server timer regressions")
{
  seedMember()
  wallOffset = 3600000
  const { container, unmount } = await mount("ex-1")
  await click(byText(container, "بدء الاختبار"))
  eq("A device clock one hour ahead does not immediately submit the exam", text(container).includes("السؤال 1 من 1") && !serverAttempt)
  await unmount()
  wallOffset = 0
}
{
  seedMember()
  wallOffset = -3600000
  const { container, unmount } = await mount("ex-1")
  await click(byText(container, "بدء الاختبار"))
  eq("A device clock one hour behind does not add an hour to the countdown", !text(container).includes("90:00") && !text(container).includes("89:59"))
  await unmount()
  wallOffset = 0
}
{
  seedMember()
  failSubmit = true
  const { container, unmount } = await mount("ex-1")
  await click(byText(container, "بدء الاختبار"))
  await click(byText(container, "النبات"))
  await click(byText(container, "إنهاء الاختبار وإظهار النتيجة"))
  eq("A failed manual submission keeps the student in the exam, not a false result screen", text(container).includes("السؤال 1 من 1") && !text(container).includes("انتهى الاختبار"))
  await unmount()
}

section("Shared-device result regressions")
{
  const exam = seedMember()
  setSessionCookie(null)
  const id = "remembered-session-foreign"
  resultRows.set(id, {
    id: "previous-attempt", exam_id: exam.id, student_id: "st-other", student_name: "طالب آخر",
    group_id: "gr-1", grade_id: "g-1", answers: {}, score: 2, total_marks: 2,
    submitted_at: nowIso, manual_override: {},
  })
  CAPS.rememberOnlineExamResultSession({ id, secret: "x".repeat(64) })
  const { container, unmount } = await mount(exam.id)
  eq("A logged-out visitor cannot see another account's remembered result", !text(container).includes("عرض النتيجة والإجابات"))
  await unmount()
}

section("Monotonic countdown, expiry confirmation, and mobile lifecycle")
{
  seedMember()
  const { container, unmount } = await mount("ex-1")
  await click(byText(container, "بدء الاختبار"))
  wallOffset = 3600000
  monotonic += 1000; serverElapsed += 1000
  await fireInterval(1000)
  eq("Moving the device clock forward mid-exam does not submit", !serverAttempt && text(container).includes("29:59"))
  wallOffset = -3600000
  monotonic += 1000; serverElapsed += 1000
  await fireInterval(1000)
  eq("Moving the device clock backward does not extend the countdown", !serverAttempt && text(container).includes("29:58"))
  wallOffset = 0
  await dispatch(window, "pagehide")
  eq("Hiding the page saves progress but does not end an unexpired exam", !serverAttempt && rpcCalls.some(c => c.name === "save_online_exam_progress"))
  await unmount()
}
{
  seedMember()
  const { container, unmount } = await mount("ex-1")
  await click(byText(container, "بدء الاختبار"))
  monotonic += 1800000; serverElapsed = 1785000
  await fireInterval(1000)
  eq("A locally expired estimate asks for server-conditional submission", rpcCalls.some(c => c.name === "submit_online_exam_session" && c.args.p_only_if_expired === true))
  eq("Server in_progress keeps the exam open and corrects the countdown", !serverAttempt && text(container).includes("00:15") && text(container).includes("السؤال 1 من 1"))
  eq("No attempt/result is cached for a rejected early timeout", readKey("examAttempts").length === 0)
  await unmount()
}
{
  seedMember()
  const { container, unmount } = await mount("ex-1")
  await click(byText(container, "بدء الاختبار"))
  await click(byText(container, "النبات"))
  await dispatch(window, "pagehide")
  await click(byText(container, "الحجر"))
  // Some mobile browsers freeze performance.now during sleep. The server does not.
  monotonic += 1000; serverElapsed = 1801000
  await dispatch(window, "pageshow")
  eq("Resuming after true server expiry submits even when the monotonic clock paused", serverAttempt?.timedOut === true && text(container).includes("تم تسليم الاختبار تلقائياً"))
  eq("Late local edits cannot replace the last server-accepted answers", serverAttempt?.answers["sq-1"]?.choiceId === "c-1-2" && readKey("examAttempts")[0]?.answers["sq-1"]?.choiceId === "c-1-2")
  eq("Simultaneous resume/status/save callbacks submit only once", rpcCalls.filter(c => c.name === "submit_online_exam_session").length === 1)
  await unmount()
}
{
  seedMember()
  const { container, unmount } = await mount("ex-1")
  await click(byText(container, "بدء الاختبار"))
  failSubmit = true
  monotonic += 1801000; serverElapsed = 1801000
  await fireInterval(1000)
  eq("A failed automatic submission leaves the sheet visible, without claiming success", !serverAttempt && text(container).includes("السؤال 1 من 1") && !text(container).includes("تم تسليم الاختبار تلقائياً"))
  const tries = rpcCalls.filter(c => c.name === "submit_online_exam_session").length
  await fireInterval(1000)
  eq("Failed timeout retries are throttled, not one RPC every timer tick", rpcCalls.filter(c => c.name === "submit_online_exam_session").length === tries)
  failSubmit = false
  monotonic += 5000; serverElapsed += 5000
  await fireInterval(1000)
  eq("Timeout submission recovers automatically when the network returns", serverAttempt?.timedOut === true && readKey("examAttempts").length === 1)
  await unmount()
}
{
  seedMember()
  const { container, unmount } = await mount("ex-1")
  await click(byText(container, "بدء الاختبار"))
  failSubmit = true
  await click(byText(container, "النبات"))
  await click(byText(container, "إنهاء الاختبار وإظهار النتيجة"))
  await click(byText(container, "الحجر"))
  failSubmit = false
  await click(byText(container, "إعادة محاولة التسليم"))
  const submits = rpcCalls.filter(c => c.name === "submit_online_exam_session")
  eq("A manual retry remains manual, not a falsely labelled timeout", submits.length === 2 && submits.every(c => c.args.p_only_if_expired === false) && !serverAttempt?.timedOut)
  eq("A manual retry includes edits made after the failed request", serverAttempt?.answers["sq-1"]?.choiceId === "c-1-1" && text(container).includes("انتهى الاختبار"))
  await unmount()
}
{
  seedMember()
  const original = globalThis.__examCloud.rpc
  globalThis.__examCloud.rpc = (name, args) => {
    if (name === "start_online_exam_session") throw new Error("connection reset")
    return original(name, args)
  }
  const { container, unmount } = await mount("ex-1")
  await click(byText(container, "بدء الاختبار"))
  eq("Thrown start/network errors do not strand the start button", !byText(container, "بدء الاختبار").disabled && !text(container).includes("السؤال 1 من 1"))
  await unmount()
}
{
  seedMember()
  const original = globalThis.__examCloud.rpc
  globalThis.__examCloud.rpc = async (name, args) => {
    const response = await original(name, args)
    if (name === "start_online_exam_session") response.data.serverNow = "invalid timestamp"
    return response
  }
  const { container, unmount } = await mount("ex-1")
  await click(byText(container, "بدء الاختبار"))
  eq("Malformed or missing server time fails safely instead of a zero-duration exam", !text(container).includes("السؤال 1 من 1") && text(container).includes("غير صالحة"))
  await unmount()
}
{
  seedMember()
  const { container, unmount } = await mount("ex-1")
  await click(byText(container, "بدء الاختبار"))
  const original = globalThis.__examCloud.rpc
  globalThis.__examCloud.rpc = (name, args) => {
    if (name === "get_online_exam_session_status" || name === "save_online_exam_progress") throw new Error("offline")
    return original(name, args)
  }
  await dispatch(window, "online")
  eq("A failed status/progress request is not interpreted as expiry", !serverAttempt && text(container).includes("السؤال 1 من 1") && text(container).includes("تعذر"))
  await unmount()
}
{
  seedMember()
  const { container, unmount } = await mount("ex-1")
  await click(byText(container, "بدء الاختبار"))
  const finish = byText(container, "إنهاء الاختبار وإظهار النتيجة")
  await act(async () => { finish.click(); finish.click() })
  eq("A double click cannot submit two attempts", rpcCalls.filter(c => c.name === "submit_online_exam_session").length === 1 && readKey("examAttempts").length === 1)
  await unmount()
}

section("Progress ordering and stale async response protection")
{
  seedMember()
  const { container, unmount } = await mount("ex-1")
  await click(byText(container, "بدء الاختبار"))
  const original = globalThis.__examCloud.rpc
  const snapshots = []
  let releaseFirst
  globalThis.__examCloud.rpc = async (name, args) => {
    if (name === "save_online_exam_progress") {
      snapshots.push(args.p_answers)
      if (snapshots.length === 1) await new Promise(resolve => { releaseFirst = resolve })
    }
    return original(name, args)
  }
  await click(byText(container, "النبات"))
  await dispatch(window, "pagehide")
  await click(byText(container, "الحجر"))
  await dispatch(window, "pagehide")
  eq("Slow progress saves are serialized, never overlapping stale snapshots", snapshots.length === 1)
  await act(async () => { releaseFirst(); await new Promise(r => setTimeout(r, 10)) })
  eq("The queued save uses the latest answers, not an old debounce snapshot", snapshots.length === 2 && snapshots[1]["sq-1"]?.choiceId === "c-1-1" && savedAnswers["sq-1"]?.choiceId === "c-1-1")
  await unmount()
}
{
  seedMember()
  const { container, unmount } = await mount("ex-1")
  await click(byText(container, "بدء الاختبار"))
  const original = globalThis.__examCloud.rpc
  let releaseStatus
  globalThis.__examCloud.rpc = async (name, args) => {
    const response = await original(name, args)
    if (name === "get_online_exam_session_status") await new Promise(resolve => { releaseStatus = resolve })
    return response
  }
  monotonic += 1000; serverElapsed = 1000
  await dispatch(window, "focus")
  monotonic += 4000; serverElapsed = 5000
  await dispatch(window, "pagehide")
  await act(async () => { releaseStatus(); await new Promise(r => setTimeout(r, 10)) })
  eq("An older status response cannot roll back a newer server clock sample", text(container).includes("29:55"))
  await unmount()
}
{
  seedMember()
  const { container, unmount } = await mount("ex-1")
  await click(byText(container, "بدء الاختبار"))
  await click(byText(container, "النبات"))
  await fireInterval(15000)
  eq("A heartbeat saves answers even if a typing debounce has not fired", savedAnswers["sq-1"]?.choiceId === "c-1-2")
  const callsBeforeUnmount = rpcCalls.length
  await unmount()
  await fireInterval(1000)
  await fireInterval(15000)
  await new Promise(resolve => setTimeout(resolve, 500))
  eq("Unmount cancels the countdown, heartbeat, and pending debounced save", rpcCalls.length === callsBeforeUnmount && intervalCallbacks.size === 0)
}

{
  const essay = { id: "essay-question", questionType: 4, questionNumber: 1, orderNumber: 1,
    headerText: "أجب", subQuestions: [{ id: "essay-answer", questionText: "اشرح إجابتك", marks: 3, answerLines: 3 }] }
  seedMember(baseExam({ accessMode: "members", onlineExamMode: "essay", questions: [essay], totalMarks: 3 }))
  const { container, unmount } = await mount("ex-1")
  await click(byText(container, "بدء الاختبار"))
  const input = container.querySelector("textarea")
  await type(input, "بدأت الإجابة")
  await type(input, "بدأت الإجابة وأواصل الكتابة")
  await type(input, "بدأت الإجابة وأواصل الكتابة دون توقف")
  await fireInterval(15000)
  eq("Continuous essay typing is saved by the heartbeat without waiting for a typing pause", savedAnswers["essay-answer"]?.text === "بدأت الإجابة وأواصل الكتابة دون توقف")
  await unmount()
}

section("Remembered-result visibility matrix, including closed exams")
const rawAttempt = (id, studentId, examId = "ex-1") => ({
  id, exam_id: examId, student_id: studentId, student_name: id, group_id: "gr-1", grade_id: "g-1",
  answers: {}, score: 2, total_marks: 2, submitted_at: nowIso, manual_override: {},
})
function rememberResult(id, row) {
  resultRows.set(id, row)
  CAPS.rememberOnlineExamResultSession({ id, secret: "r".repeat(64) })
}
for (const closed of [false, true]) {
  for (const mode of ["members", "public"]) {
    for (const viewerId of [null, "st-1", "st-other"]) {
      const exam = seedMember(baseExam({ accessMode: mode, reviewOpen: closed }))
      const token = viewerId ? "token-for-" + viewerId : undefined
      if (viewerId) {
        MEM.writeRows("students", [student, { ...student, id: "st-other" }])
        setSessionCookie({ ...session, studentId: viewerId, token, exp: realNow() + 86400000 })
      } else setSessionCookie(null)
      rememberResult("remembered-owner-session", rawAttempt("owner-result", "st-1"))
      rememberResult("remembered-other-session", rawAttempt("other-result", "st-other"))
      rememberResult("remembered-guest-session", rawAttempt("guest-result", null))
      rememberResult("remembered-different-exam", rawAttempt("wrong-exam-result", viewerId, "different-exam"))
      const { container, unmount } = await mount(exam.id)
      const visible = [...container.querySelectorAll("button")].filter(b => b.textContent.includes("عرض النتيجة والإجابات")).length
      const expected = (viewerId ? 1 : 0) + (mode === "public" ? 1 : 0)
      eq(`${closed ? "Closed" : "Open"} ${mode} exam, viewer=${viewerId || "guest"}: only permitted results`, visible === expected, `expected ${expected}, got ${visible}`)
      eq("Restoration passes the current portal token and consumes no attempt", rpcCalls.filter(c => c.name === "get_online_exam_result").every(c => c.args.p_student_token === (token || null)) && !rpcCalls.some(c => c.name === "start_online_exam_session" || c.name === "submit_online_exam_session"))
      await unmount()
    }
  }
}
{
  seedMember()
  rememberResult("remembered-racing-session", rawAttempt("racing-result", "st-1"))
  const original = globalThis.__examCloud.rpc
  let releaseResult
  globalThis.__examCloud.rpc = async (name, args) => {
    const response = await original(name, args)
    if (name === "get_online_exam_result") await new Promise(resolve => { releaseResult = resolve })
    return response
  }
  const { container, unmount } = await mount("ex-1")
  setSessionCookie(null)
  await act(async () => { releaseResult(); await new Promise(r => setTimeout(r, 10)) })
  eq("Logging out while restoration is pending discards the entire stale response", !text(container).includes("عرض النتيجة والإجابات"))
  await unmount()
}
{
  seedMember()
  rememberResult("remembered-logout-session", rawAttempt("logout-result", "st-1"))
  const { container, unmount } = await mount("ex-1")
  eq("Owner can initially see their remembered result", text(container).includes("عرض النتيجة والإجابات"))
  setSessionCookie(null)
  await dispatch(window, "focus")
  eq("Returning after logout in another tab removes the old account's result", !text(container).includes("عرض النتيجة والإجابات"))
  await unmount()
}
{
  seedMember()
  const { container, unmount, rerender } = await mount("ex-1")
  await click(byText(container, "بدء الاختبار"))
  await click(byText(container, "النبات"))
  cloudFor(baseExam({ id: "ex-new", accessMode: "members" }))
  await rerender("ex-new")
  eq("Changing exam routes resets the old timer/answers instead of closing the new exam", text(container).includes("تأكيد بدء الاختبار") && !text(container).includes("السؤال 1 من 1"))
  await fireInterval(1000)
  eq("No old-session submission fires after changing routes", !rpcCalls.some(c => c.name === "submit_online_exam_session"))
  await unmount()
}

section("Scheduled entry also follows the server, not the phone clock")
{
  const OriginalDate = Date
  // Unlike Date.now alone, this also exercises the default new Date() availability gate.
  globalThis.Date = class extends OriginalDate {
    constructor(...args) { if (args.length) super(...args); else super(realNow() + wallOffset) }
  }
  try {
    for (const offset of [7200000, -7200000]) {
      const exam = baseExam({ accessMode: "members", availabilityMode: "scheduled",
        availableFrom: new Date(serverBase - 60000).toISOString(), availableUntil: new Date(serverBase + 60000).toISOString() })
      seedMember(exam)
      wallOffset = offset
      const { container, unmount } = await mount(exam.id)
      eq(`A scheduled exam open on the server is not falsely closed by a ${offset / 3600000}h device skew`, text(container).includes("تأكيد بدء الاختبار"))
      const start = byText(container, "بدء الاختبار")
      if (start) {
        await click(start)
        serverElapsed = 120000; monotonic += 120000
        await fireInterval(15000)
        eq("Closing the entry window does not cut a running exam's full duration", !serverAttempt && text(container).includes("28:00"))
      }
      await unmount()
    }
    const exam = baseExam({ accessMode: "members", availabilityMode: "scheduled",
      availableFrom: new Date(serverBase + 3600000).toISOString(), availableUntil: new Date(serverBase + 7200000).toISOString() })
    seedMember(exam)
    wallOffset = 5400000
    const { container, unmount } = await mount(exam.id)
    eq("A future server window stays closed even if the phone thinks it is already open", text(container).includes("سيُفتح الاختبار") && !rpcCalls.some(c => c.name === "start_online_exam_session"))
    await unmount()
  } finally { wallOffset = 0; globalThis.Date = OriginalDate }
}

section("Clock math and duration contract")
const CLOCK = await import(pathToFileURL(built.get(resolve(ROOT, "src/lib/online-exam-clock.ts"))).href)
for (const [duration, expected] of [[undefined, 60], [null, 60], [0, 60], [-5, 60], [NaN, 60], [Infinity, 60], [1, 1], [30, 30], [2000, 1440]]) {
  eq(`Duration ${String(duration)} normalizes to ${expected} minutes`, CLOCK.onlineExamDurationMinutes(duration) === expected)
}
{
  const sample = { startedAt: "2026-09-07T12:00:00Z", expiresAt: "2026-09-07T12:30:00Z", serverNow: "2026-09-07T12:01:00Z" }
  const clock = CLOCK.clockFromServer(sample, 5000, 7000)
  eq("Network round-trip adjustment uses only elapsed monotonic time", CLOCK.remainingExamSeconds(clock, 7000) === 1739)
  eq("A timezone-offset timestamp represents the same server instant", CLOCK.clockFromServer({ ...sample, serverNow: "2026-09-07T15:01:00+03:00" }, 5000, 7000).deadline === clock.deadline)
  eq("Suspended interval callbacks do not extend the monotonic deadline", CLOCK.remainingExamSeconds(clock, 7000 + 1800000) === 0)
  eq("Invalid timestamps are rejected, never treated as expiry", CLOCK.clockFromServer({ ...sample, expiresAt: "invalid" }, 0, 0) === null)
  eq("Reversed server deadlines are rejected", CLOCK.clockFromServer({ ...sample, expiresAt: sample.startedAt }, 0, 0) === null)
  eq("A response from before the session start is rejected", CLOCK.clockFromServer({ ...sample, serverNow: "2026-09-07T11:59:59Z" }, 0, 0) === null)
  eq("Excessive transport delay clamps the estimate but does not invent negative time", CLOCK.remainingExamSeconds(CLOCK.clockFromServer(sample, 0, 7200000), 7200000) === 0)
  eq("Cloud serialization also prevents a new zero-minute online exam", SYNC.toExamRow(baseExam({ duration: 0 })).duration === 60)
  eq("Offline/printed exam duration is not changed", SYNC.toExamRow(baseExam({ deliveryMode: "offline", allowOnline: false, duration: 0 })).duration === 0)
}

section("Timeout metadata survives teacher read/edit/save, without inventing missing flags")
{
  seedMember()
  const cases = [
    { name: "true", value: true, expected: true },
    { name: "false", value: false, expected: false },
    { name: "missing", value: undefined, expected: undefined },
    { name: "null", value: null, expected: undefined },
    { name: "invalid string", value: "false", expected: undefined },
  ]
  const attempts = []
  for (const test of cases) {
    const id = `timeout-metadata-${test.name}`
    const row = { ...rawAttempt(id, "st-1"), manual_override: {
      autoScore: 2, autoTotal: 2, manualScore: 0, manualTotal: 3,
      ...(test.value !== undefined ? { timedOut: test.value } : {}),
    } }
    resultRows.set(id, row)
    const restored = await SYNC.getOnlineExamTimerResult({ id, secret: "test-only-secret" }, "test-token")
    eq(`Reading ${test.name} timeout metadata preserves its known/unknown state`, restored.ok && restored.attempt.timedOut === test.expected)
    // Model a teacher changing a grade and saving the row again.
    attempts.push({ ...restored.attempt, manualScore: 3 })
  }
  let persisted = []
  globalThis.__examCloud.from = table => {
    if (table !== "exam_attempts") throw new Error(`Unexpected table write: ${table}`)
    return {
      upsert: async rows => { persisted = JSON.parse(JSON.stringify(rows)); return { error: null } },
      delete: () => ({ in: async () => ({ error: null }) }),
    }
  }
  await SYNC.pushExamAttempts(attempts)
  cases.forEach((test, index) => {
    eq(`Teacher save does not erase or fabricate a ${test.name} timeout flag`,
      persisted[index]?.manual_override?.timedOut === test.expected && persisted[index]?.manual_override?.manualScore === 3)
  })
}

globalThis.__examCloud = undefined
Date.now = realNow
Object.defineProperty(performance, "now", { configurable: true, value: realPerformanceNow })
CAPS.clearRememberedOnlineExamResultSessions()
console.log(`\nExam session regressions: ${pass} passed, ${fail} failed`)
rmSync(TMP, { recursive: true, force: true })
dom.window.close()
if (fail) process.exitCode = 1
