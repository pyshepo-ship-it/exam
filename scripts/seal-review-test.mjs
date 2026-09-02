import { readFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import ts from "typescript"
import { resolve, join } from "node:path"
import { JSDOM } from "jsdom"

const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", { url: "http://localhost/" })
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.Node = dom.window.Node
const store = new Map()
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k), clear: () => store.clear() }

const TMP = resolve(".tmp-seal-test")
rmSync(TMP, { recursive: true, force: true })
mkdirSync(TMP, { recursive: true })
const stubs = `const queuePush = () => Promise.resolve()
const pushSetting = () => Promise.resolve()
const exportToPDF = async () => true
const printElement = () => {}`
const storageKeys = readFileSync("src/lib/storage-keys.ts", "utf8").replace(/export /g, "")
const rewrite = s => s.replace(/from "\.\.\/storage-keys"/g, 'from "../storage-keys.mjs"').replace(/from "\.\/supabase\/sync"/g, 'from "./supabase/sync.mjs"').replace(/from "\.\/([\w-]+)"/g, 'from "./$1.mjs"')
const files = {}
files["storage-keys.mjs"] = `const STORAGE_KEYS = ${JSON.stringify(Object.fromEntries([...storageKeys.matchAll(/([A-Z_]+):\s*"([\w-]+)"/g)].map(m => [m[1], m[2]])))};\nexport { STORAGE_KEYS };\nconst STORAGE_KEYS_INTERNAL = STORAGE_KEYS;`
let ds = readFileSync("src/lib/data-storage.ts", "utf8")
for (const spec of ["supabase/sync", "storage-keys", "weekdays"]) ds = ds.replace(new RegExp(`import\\\\s*\\\\{[^}]*\\\\}\\\\s*from\\\\s*"\\\\./${spec}"`), "")
files["data-storage.mjs"] = stubs + "\n" + storageKeys + "\n" + rewrite(ds)
files["weekdays.mjs"] = readFileSync("src/lib/weekdays.ts", "utf8").replace(/export /g, "")
let ep = readFileSync("src/lib/exam-public.ts", "utf8")
// transpile عبر typescript يتكفل بأنواع TS
ep = ep.replace(/from "\.\/supabase\/sync"/g, 'from "./supabase/sync.mjs"')
files["exam-public.mjs"] = stubs + "\n" + rewrite(ep)
let eg = readFileSync("src/lib/exam-grade.ts", "utf8")
eg = eg.replace(/import type\s*\{[^}]*\}\s*from\s*"[^"]+"[;\n]?/g, "")
files["exam-grade.mjs"] = stubs + "\n" + rewrite(eg)
const mkdirSync2 = (d, o) => mkdirSync(d, o)
mkdirSync(join(TMP, "supabase"), { recursive: true })
writeFileSync(join(TMP, "supabase", "sync.mjs"), `export const queuePush = () => Promise.resolve()
export const pushSetting = () => Promise.resolve()
export const submitRegistrationRequest = async () => ({ ok: true })
export const submitGroupTransferRequest = async () => ({ ok: true })
export const submitInquiryThread = async () => ({ ok: true })
export const submitPublicAttempt = async () => ({ ok: true })
export const submitPublicHonoree = async () => ({ ok: true })
export const exportToPDF = async () => true
export const printElement = () => {}`)
const transpile = (s) => ts.transpileModule(s, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText
for (const [f, c] of Object.entries(files)) writeFileSync(join(TMP, f), transpile(c))

const EP = await import("file://" + join(TMP, "exam-public.mjs"))

const exam = {
  id: "ex-seal", gradeId: "g-1", groupId: "gr-1", title: "اختبار الختم", academicYear: "2025-2026",
  duration: 30, totalMarks: 10, allowOnline: true,
  questions: [
    { id: "q1", questionType: 1, questionNumber: 1, orderNumber: 1, headerText: "اختر",
      subQuestions: [{ id: "sq1", questionText: "عاصمة مصر؟", choices: [
        { id: "c1", choiceKey: "أ", choiceText: "القاهرة", isCorrect: true },
        { id: "c2", choiceKey: "ب", choiceText: "الإسكندرية", isCorrect: false }] }] },
    { id: "q2", questionType: 3, questionNumber: 2, orderNumber: 2, headerText: "صح وخطأ",
      subQuestions: [{ id: "sq2", questionText: "الشمس نجم", isTrue: true }] },
    { id: "q3", questionType: 2, questionNumber: 3, orderNumber: 3, headerText: "أكمل",
      subQuestions: [{ id: "sq3", questionText: "2+2 = ...", correctAnswer: "4" }] },
  ],
}

let pass = 0, fail = 0
const eq = (name, cond, extra = "") => { if (cond) { pass++; console.log("✅", name) } else { fail++; console.log("❌", name, extra) } }

const sealed = EP.sealExamForStudent(exam)
eq("الختم ينتج token ونسخة مجردة", !!sealed.token && sealed.view.questions.length === 3)
eq("النسخة المجردة بلا إجابات صحيحة", !JSON.stringify(sealed.view).includes('"isCorrect":true'))

const spec = EP.decodeSealForReview(sealed.token, "ex-seal")
eq("فك الختم يعطي مفتاح الاختيار الصحيح", spec.sq1?.choiceId === "c1", JSON.stringify(spec.sq1))
eq("فك الختم يعطي صح/خطأ", spec.sq2?.isTrue === true, JSON.stringify(spec.sq2))
eq("فك الختم يعطي نص الإجابة", (spec.sq3?.text || "") === "4", JSON.stringify(spec.sq3))

// tamper: token مع examId مختلف → فارغ
const tampered = EP.decodeSealForReview(sealed.token, "ex-other")
eq("فك ختم بمعرف مختلف → مرفوض (أمان)", Object.keys(tampered).length === 0)

// tamper: تعديل التوكن → مرفوض
const broken = EP.decodeSealForReview(sealed.token.slice(0, -4) + "AAAA", "ex-seal")
eq("توكن معدّل → مرفوض (أمان)", Object.keys(broken).length === 0)

// تصحيح النسخة المختومة يعمل
const res = EP.gradeSealedExam(sealed.view, sealed.token, { sq1: { choiceId: "c1" }, sq2: { isTrue: true }, sq3: { text: "4" } })
eq("تصحيح النسخة المختومة: 3/3", res.score === 3, `score=${res.score}`)

console.log(`\nالنتيجة: ${pass} ناجح / ${fail} فاشل`)
process.exit(fail ? 1 : 0)
