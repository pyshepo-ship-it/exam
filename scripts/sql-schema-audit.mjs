/**
 * مدقّق مخطط SQL — node scripts/sql-schema-audit.mjs
 *
 * لماذا هذا الملف؟ لأن أخطاء SQL لا تظهر إلا في قاعدة بيانات حقيقية وبعد
 * فوات الأوان: دالة SECURITY DEFINER تُترجم عند أول نداء لا عند إنشائها،
 * فعمود مكتوب بالخطأ (أو نوع مختلف) يظهر فجأةً كفشل في ميزة كاملة.
 *
 * ماذا يفحص (دون الحاجة لقاعدة بيانات):
 *   ١) كل عمود مستخدم داخل دوال SQL (`alias.column`) يجب أن يكون موجوداً
 *      في الجدول الذي يشير إليه الاسم المستعار (محسوب من FROM / JOIN).
 *   ٢) أعمدة INSERT وUPDATE يجب أن تكون موجودة في الجدول.
 *   ٣) عمود TEXT لا يُقارن بـ now() (خطأ «operator does not exist»).
 *   ٤) أعمدة الجداول تُجمع من كل الترحيلات: CREATE TABLE + ALTER TABLE
 *      ADD COLUMN، بالترتيب، تماماً كما تبنى القاعدة فعلياً.
 *
 * الأسماء المستعارة غير المعروفة (جداول مشتقة، دوال، متغيرات %ROWTYPE)
 * تُتجاهل بدل إصدار إنذار كاذب.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

const MIGRATIONS_DIR = "supabase/migrations"
const files = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort()
const sources = files.map((f) => ({ file: f, sql: readFileSync(join(MIGRATIONS_DIR, f), "utf8") }))

// ملفات SQL تُشغَّل يدويًا (إعداد كامل أو إصلاحات) — نفس أصناف الأعطال واردة فيها،
// فلا يقتصر التدقيق على مجلد الترحيلات.
const allSqlSources = [...sources]
for (const dir of ["supabase", "supabase/patches"]) {
  if (!existsSync(dir)) continue
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql"))) {
    allSqlSources.push({ file: `${dir}/${f}`, sql: readFileSync(`${dir}/${f}`, "utf8") })
  }
}

let pass = 0
const failures = []
const check = (name, ok, detail = "") => {
  if (ok) {
    pass++
    console.log(`  ✅ ${name}`)
  } else {
    failures.push(`${name}${detail ? " — " + detail : ""}`)
    console.log(`  ❌ ${name}${detail ? " — " + detail : ""}`)
  }
}
const section = (t) => {
  console.log("\n\x1b[1;36m" + "=".repeat(56) + "\x1b[0m")
  console.log("\x1b[1;33m" + t + "\x1b[0m")
  console.log("\x1b[1;36m" + "=".repeat(56) + "\x1b[0m")
}

// ============================================================
// 1) بناء المخطط من كل الترحيلات بالترتيب
// ============================================================
/** table -> Map(column -> type.upper()) */
const schema = new Map()
const tableOf = (t) => {
  if (!schema.has(t)) schema.set(t, new Map())
  return schema.get(t)
}

const CREATE_RE = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-z_][a-z0-9_]*)\s*\(([\s\S]*?)\n\);/gi
const ALTER_RE = /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:public\.)?([a-z_][a-z0-9_]*)\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_][a-z0-9_]*)\s+([a-z]+)/gi

for (const { sql } of sources) {
  for (const m of sql.matchAll(CREATE_RE)) {
    const cols = tableOf(m[1])
    for (const raw of m[2].split("\n")) {
      const line = raw.trim().replace(/,$/, "")
      if (!line || line.startsWith("--")) continue
      if (/^(PRIMARY|UNIQUE|FOREIGN|CONSTRAINT|CHECK)/i.test(line)) continue
      const parts = line.split(/\s+/)
      if (parts.length < 2) continue
      cols.set(parts[0], String(parts[1]).toUpperCase())
    }
  }
  for (const m of sql.matchAll(ALTER_RE)) {
    tableOf(m[1]).set(m[2], String(m[3]).toUpperCase())
  }
}

section("1) أعمدة مستخدمة في دوال SQL مقابل المخطط الحقيقي")

/** دوال SQL: الاسم + المتن (بين $$ ... $$) */
const FN_RE = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?([a-z_][a-z0-9_]*)\s*\(([\s\S]*?)\)\s*RETURNS[\s\S]*?\$\$([\s\S]*?)\$\$/gi
/**
 * كتل DO المضمّنة تُترجم هي الأخرى عند أول نداء — لا وقت الإنشاء.
 * كانت الثقب الحقيقي: «column "submitted_at" does not exist» في 022 مرّ من
 * البوابة لأن فحص الأعمدة كان يقتصر على CREATE FUNCTION.
 */
const DO_RE = /\bDO\s*(\$(?:[A-Za-z_0-9]*)?\$)([\s\S]*?)\1/gi

const allBodies = []
for (const { file, sql } of allSqlSources) {
  for (const m of sql.matchAll(FN_RE)) {
    allBodies.push({ file, label: `الدالة ${m[1]}`, body: m[3] })
  }
  for (const m of sql.matchAll(DO_RE)) {
    allBodies.push({ file, label: "كتلة DO مضمّنة", body: m[2] })
  }
}

// ------------------------------------------------------------
// أدوات تقسيم آمنة: لا يقتطعها زوج أقواس داخلي ولا نص مُقتبس.
// (الاعتماد على [^)]* كان يفشل مع NULLIF(trim(x), '') فيسقط عدّ خاطئ للأعمدة)
// ------------------------------------------------------------
function skipQuoted(text, i) {
  // يعيد الفهرس بعد نهاية النص المُقتبس_started at i (text[i] === "'")
  let j = i + 1
  while (j < text.length) {
    if (text[j] === "'") {
      if (text[j + 1] === "'") j += 2
      else return j + 1
    } else j++
  }
  return j
}
function splitTopLevel(text, sep) {
  const parts = []
  let buf = ""
  let depth = 0
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === "'") {
      const end = skipQuoted(text, i)
      buf += text.slice(i, end)
      i = end - 1
      continue
    }
    if (c === "-" && text[i + 1] === "-") {
      const nl = text.indexOf("\n", i)
      const stop = nl === -1 ? text.length : nl
      buf += text.slice(i, stop)
      i = stop - 1
      continue
    }
    if (c === "(" || c === "[") depth++
    else if (c === ")" || c === "]") depth--
    if (c === sep && depth === 0) {
      parts.push(buf)
      buf = ""
      continue
    }
    buf += c
  }
  if (buf.trim()) parts.push(buf)
  return parts.filter((p) => p.trim())
}
/** group = محتوى الأقواس المفتوحة عند fromIndex، أو null إن لم تُغلق */
function parenGroup(text, fromIndex) {
  let depth = 0
  let i = fromIndex
  while (i < text.length) {
    const c = text[i]
    if (c === "'") {
      i = skipQuoted(text, i)
      continue
    }
    if (c === "(") depth++
    else if (c === ")") {
      depth--
      if (depth === 0) return { inner: text.slice(fromIndex + 1, i), end: i }
    }
    i++
  }
  return null
}
function stripComments(text) {
  // يزيل التعليقات مع احترام النصوص المُقتبسة — فالفاصلة المنقوطة أو علامة
  // التنصيص داخل تعليق (مثل don't) كانت تُفسد تقسيم العبارات والأقواس.
  let out = ""
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === "'") {
      const end = skipQuoted(text, i)
      out += text.slice(i, end)
      i = end - 1
      continue
    }
    if (c === "-" && text[i + 1] === "-") {
      const nl = text.indexOf("\n", i)
      i = nl === -1 ? text.length : nl - 1
      out += " "
      continue
    }
    if (c === "/" && text[i + 1] === "*") {
      const close = text.indexOf("*/", i + 2)
      i = close === -1 ? text.length : close + 1
      out += " "
      continue
    }
    out += c
  }
  return out
}
const stripComment = stripComments

/**
 * خريطة الأسماء المستعارة لعبارة واحدة. تُبنى من regex جديد في كل نداء:
 * exec على نمط /g يُحرّك lastIndex ويبتلع أول مطابقة لو أُعيد استعمال نفس الكائن.
 */
function aliasMapOf(statement) {
  const map = new Map()
  const fromRe = /\b(?:FROM|JOIN|UPDATE|DELETE\s+FROM)\s+([a-z_][a-z0-9_]*)\s*(?:(?:AS\s+)?([a-z_][a-z0-9_]*))?/gi
  for (const fm of statement.matchAll(fromRe)) {
    const table = fm[1]
    let alias = fm[2]
    if (!alias || /^(WHERE|ON|LEFT|RIGHT|INNER|CROSS|GROUP|ORDER|LIMIT|SET|USING|AND|OR|RETURNING|VALUES|SELECT|DO)$/i.test(alias)) {
      alias = table
    }
    // اسم مستعمل لجدول آخر في نفس العبارة = غير حاسم → نتجاوزه بدل إنذار كاذب
    if (map.has(alias) && map.get(alias) !== table) map.set(alias, null)
    else map.set(alias, table)
  }
  return map
}

/** أقرب عمود صحيح (اقتراح في رسالة الفشل) — مسافة تحرير ≤ 3 */
function closest(word, candidates) {
  let best = ""
  let bestD = 4
  for (const c of candidates) {
    let d = Math.abs(c.length - word.length)
    if (d > 3) continue
    for (let i = 0; i < Math.max(c.length, word.length); i++) {
      if (c[i] !== word[i]) d++
      if (d > 3) break
    }
    if (d < bestD) { bestD = d; best = c }
  }
  return best || "(اسم مختلف تمامًا)"
}

const allBodies2 = allBodies
const problems = []
const typeProblems = []
const varProblems = []
const arityProblems = []
const bareProblems = []
let doBodiesScanned = 0

for (const { file, label, body: rawBody } of allBodies2) {
  if (/كتلة DO/.test(label)) doBodiesScanned++
  // public. في المتن مجرد تأهيل للمخطط — نحذفه لتبسيط التحليل
  const body = rawBody.replace(/\bpublic\./g, "")
  // التعليقات تُزال قبل التقسيم: فاصلة منقوطة أو اقتباس داخل تعليق كان يزيح حدود العبارات
  const cleanBody = stripComments(body)
  const statements = splitTopLevel(cleanBody, ";")

  // متغيرات %ROWTYPE — حقولها من الجدول لا من الاستعلام (على مستوى المتن كله)
  const rowtype = new Map()
  for (const rm of cleanBody.matchAll(/([a-z_][a-z0-9_]*)\s+([a-z_][a-z0-9_]*)%ROWTYPE/gi)) {
    rowtype.set(rm[1], rm[2])
  }
  const declBlock = /\bDECLARE\b([\s\S]*?)\bBEGIN\b/i.exec(cleanBody)
  const declared = new Set(
    (declBlock ? declBlock[1] : "")
      .split(";")
      .map((seg) => stripComment(seg).trim())
      .map((seg) => /^([a-z_][a-z0-9_]*)\s+\S/i.exec(seg))
      .filter(Boolean)
      .map((x) => x[1].toLowerCase())
  )
  // أسماء تُنشأ في المتن (نوافذ، CTE، أعمدة مُولّدة): لا تُعدّ أعمدة جداول
  const localNames = new Set()
  for (const am of cleanBody.matchAll(/\bAS\s+([a-z_][a-z0-9_]*)\b/gi)) localNames.add(am[1].toLowerCase())
  for (const wm of cleanBody.matchAll(/\b([a-z_][a-z0-9_]*)\s+([a-z_][a-z0-9_]*)\s+(?:IN|OUT|INOUT)\b/gi)) {
    localNames.add(wm[1].toLowerCase())
  }
  const params = new Set(
    (/\(([\s\S]*?)\)\s*RETURNS/i.exec(body) || [])[1]
      ? String((/\(([\s\S]*?)\)\s*RETURNS/i.exec(body) || [])[1])
          .split(",")
          .map((x) => /^[\s]*([a-z_][a-z0-9_]*)/i.exec(stripComment(x).trim()))
          .filter(Boolean)
          .map((x) => x[1].toLowerCase())
      : []
  )
  for (const rawStatement of statements) {
    const st = stripComment(rawStatement)
    if (!st.trim()) continue
    const aliasToTable = aliasMapOf(st)
    for (const [k, v] of rowtype) if (!aliasToTable.has(k)) aliasToTable.set(k, v)
    const knownTable = (alias) => {
      const t = aliasToTable.get(alias)
      return t || rowtype.get(alias) || null
    }

    // INSERT INTO table (cols) — وجود الأعمدة + تطابق العدد مع كل صف VALUES
    for (const im of st.matchAll(/INSERT\s+INTO\s+([a-z_][a-z0-9_]*)\s*\(/gi)) {
      const table = im[1]
      const colsMeta = parenGroup(st, im.index + im[0].length - 1)
      if (!colsMeta) continue
      const cols = colsMeta.inner.split(",").map((x) => x.trim()).filter(Boolean)
      const schemaCols = schema.get(table)
      for (const c of cols) {
        if (schemaCols && !schemaCols.has(c)) {
          problems.push(`${file}: ${label} — INSERT INTO ${table} يستخدم عموداً غير موجود: ${c}`)
        }
      }
      // VALUES (...) [, (...)] — نفحص عدد القيم في كل صف على حدة
      const vkRe = /VALUES\s*\(/gi
      vkRe.lastIndex = colsMeta.end + 1
      const vm = vkRe.exec(st)
      if (!vm) continue // INSERT ... SELECT: عدد القيم ليس نصًّا ثابتًا
      let cursor = vm.index + vm[0].length - 1
      for (let guard = 0; guard < 200; guard++) {
        const g = parenGroup(st, cursor)
        if (!g) break
        const vals = splitTopLevel(g.inner, ",").filter((x) => x.trim())
        if (vals.length !== cols.length) {
          arityProblems.push(
            `${file}: ${label} — INSERT INTO ${table}: ${cols.length} عمود مقابل ${vals.length} قيمة`
          )
        }
        const nx = /^\s*,\s*\(/.exec(st.slice(g.end + 1))
        if (!nx) break
        cursor = g.end + 1 + nx[0].length - 1
      }
    }

    // UPDATE table SET col = ...
    for (const um of st.matchAll(/UPDATE\s+([a-z_][a-z0-9_]*)\s+SET\s+([\s\S]*?)(?:WHERE|RETURNING|$)/gi)) {
      const cols = schema.get(um[1])
      if (!cols) continue
      for (const am of um[2].matchAll(/(?:^|,|\n)\s*([a-z_][a-z0-9_]*)\s*=/gi)) {
        if (!cols.has(am[1])) {
          problems.push(`${file}: ${label} — UPDATE ${um[1]} يستخدم عموداً غير موجود: ${am[1]}`)
        }
      }
    }

    // alias.column
    for (const cm of st.matchAll(/\b([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\b/g)) {
      const [, alias, col] = cm
      if (alias === "new" || alias === "old") continue // محفّزات
      const table = knownTable(alias)
      if (!table) continue
      const cols = schema.get(table)
      if (!cols) continue // جدول مشتق أو دالة — لا نعرفه
      if (col === "*") continue
      if (!cols.has(col)) problems.push(`${file}: ${label} — ${alias}.${col}: العمود غير موجود في ${table}`)
    }

    // عمود مجرّد في ORDER BY داخل عبارة جدولها معروف: يغطي خطأ «column "x" does not exist»
    // الذي ظهر فعلًا في 022 (استُعمل submitted_at بدل created_at في كتلة DO).
    for (const om of st.matchAll(/\bORDER\s+BY\b([\s\S]*?)(?:LIMIT|OFFSET|FETCH|\)|$)/gi)) {
      const tables = [...new Set([...aliasToTable.values()].filter(Boolean))].filter((t) => schema.has(t))
      if (tables.length === 0) continue
      const available = new Set(tables.flatMap((t) => [...schema.get(t).keys()]))
      for (const item of splitTopLevel(om[1], ",")) {
        const tok = /^[\s]*([a-z_][a-z0-9_]*)/.exec(item)
        if (!tok) continue
        const name = tok[1].toLowerCase()
        if (/^(nulls|case|asc|desc)$/i.test(name)) continue
        if (/^[a-z_][a-z0-9_]*\s*\(/i.test(item.trim())) continue // استدعاء دالة لا عمود
        if (available.has(name) || declared.has(name) || localNames.has(name) || params.has(name)) continue
        if (aliasToTable.has(name)) continue // ترتيب مؤهّل باسم الجدول — يُفحص أعلاه
        bareProblems.push(
          `${file}: ${label} — ORDER BY «${name}» لا يوجد في ${tables.join("/")} (الأقرب: ${closest(name, available)})`
        )
      }
    }

    // مقارنة عمود نصي بـ now()
    for (const tm of st.matchAll(/\b([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\s*(?:>=|<=|>|<)\s*now\(\)/gi)) {
      const table = knownTable(tm[1])
      if (!table) continue
      const cols = schema.get(table)
      if (!cols) continue
      const type = cols.get(tm[2])
      if (type && /^(TEXT|CHAR|VARCHAR|BPCHAR|CHARACTER)$/.test(type)) {
        typeProblems.push(
          `${file}: ${label} — ${tm[1]}.${tm[2]} من نوع ${type} يُقارن بـ now() ` +
            `(المقارنة الصحيحة: ${tm[2]} > to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))`
        )
      }
    }

    // SELECT ... INTO متغيرات غير معلنة
    for (const im of st.matchAll(/(?<!INSERT\s)\bINTO\s+([a-z_][a-z0-9_]*(?:\s*,\s*[a-z_][a-z0-9_]*)*)/gi)) {
      for (const raw of im[1].split(",")) {
        const v = raw.trim().toLowerCase()
        if (!v) continue
        if (!declared.has(v)) varProblems.push(`${file}: ${label} — المتغير «${v}» في INTO غير معلن في DECLARE`)
      }
    }
  }
}

check(
  "كل الأعمدة المستخدمة داخل دوال SQL وكتل DO موجودة في مخطط قاعدة البيانات",
  problems.length === 0,
  problems.join(" | ")
)
check(
  "اسم عمود مجرّد في ORDER BY مطابق لعمود حقيقي من جداول العبارة",
  bareProblems.length === 0,
  bareProblems.join(" | ")
)
check(
  "لا مقارنة بين عمود نصي و now() داخل دوال SQL",
  typeProblems.length === 0,
  typeProblems.join(" | ")
)
check(
  `كتل DO المضمّنة مشمولة بالفحص (اكتُشفت ${doBodiesScanned}) — لا تُترك بلا تدقيق`,
  allSqlSources.some((s) => /\bDO\s*\$/i.test(s.sql)) ? doBodiesScanned > 0 : true
)
check("كل متغير في جمل INTO معلن في كتلة DECLARE", varProblems.length === 0, varProblems.join(" | "))
check("أعمدة INSERT وقيمها متساوية العدد (سِرد أقواس متوازن)", arityProblems.length === 0, arityProblems.join(" | "))

section("2) سلامة ترحيلات هذا الإصدار (019/020/021)")

const byName = (n) => sources.find((s) => s.file.endsWith(n))?.sql || ""

const sql019 = byName("019_registration_auto_approve_fix.sql")
check(
  "019: student_login يعتمد أعمدة موجودة فعلاً (طلبات/طلاب/حسابات/جلسات/سجل)",
  sql019.includes("public.registration_requests") &&
    !/\bsa\.phone\b|\bsa\.status\b/.test(sql019)
)

const sql020 = byName("020_billing_cycles.sql")
check(
  "020: قيم دورة الاستحقاق المحفوظة محصورة في monthly/weekly/session/custom",
  /CHECK\s*\(\s*cycle\s+IN\s*\('monthly',\s*'weekly',\s*'session',\s*'custom'\)/i.test(sql020)
)
check(
  "020: طريقة تسعير المجموعة محصورة في monthly/session",
  /CHECK\s*\(\s*pricing_mode\s+IN\s*\('monthly',\s*'session'\)/i.test(sql020)
)
check(
  "020: الاستحقاقات القديمة تُرحّل إلى مفتاح فترة شهري (يمنع التكرار)",
  /UPDATE\s+public\.dues[\s\S]*period_key\s*=\s*COALESCE\(period_key,[\s\S]*year\s*\|\|/i.test(sql020)
)

const sql021 = byName("021_surveys.sql")
check(
  "021: الزائر لا يملك أي سياسة قراءة على survey_responses (الردود عبر الدوال فقط)",
  /ENABLE\s+ROW\s+LEVEL\s+SECURITY/.test(sql021) &&
    !/CREATE\s+POLICY[\s\S]{0,200}survey_responses[\s\S]{0,200}TO\s+anon/i.test(sql021)
)
check(
  "021: أداة الاستهداف surveys_for_student ليست متاحة للزوار",
  /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.surveys_for_student\(text\)\s+FROM\s+anon/i.test(sql021)
)
check(
  "021: إرسال الرد يتحقق من أن الاستبيان موجّه للمُجيب",
  /surveys_for_student\(v_sid\)\s*x\s+WHERE\s+x\.id\s*=\s*p_survey_id/.test(sql021)
)
check(
  "021: الجلسة تُقارن بنص ISO كما في 016/017 (لا revoked_at ولا now())",
  /expires_at\s*>\s*to_char\(now\(\)[\s\S]*?\)/.test(sql021) && !/revoked_at/.test(sql021)
)
check(
  "021: لا اعتماد على عمود phone/status في student_accounts (غير موجود في المخطط)",
  !/\bsa\.phone\b|\bsa\.status\b/.test(sql021)
)
check(
  "021: الاستبيان المجهول لا يحفظ أي هوية",
  /IF\s+v_survey\.anonymous\s+IS\s+TRUE\s+THEN[\s\S]{0,400}v_sid\s*:=\s*NULL/.test(sql021)
)
check(
  "021: المهلة والنشر يُفرضان في الخادم قبل حفظ أي رد",
  /published\s+IS\s+NOT\s+TRUE/.test(sql021) && /deadline\s+IS\s+NOT\s+NULL\s+AND\s+v_survey\.deadline\s*<\s*now\(\)/.test(sql021)
)

section("2-ج) دوال SQL التي تحتاج pgcrypto (digest / gen_random_bytes)")

// خطأ واقعي حدث في التشغيل: «function digest(text, unknown) does not exist»
// لأن Supabase ينصب pgcrypto في مخطط extensions، فأي دالة تُثبّت search_path
// بـ public وحدها لا ترى digest وقت التنفيذ — والتفجير يحدث بعد الترحيل عند
// أول نداء (الـ SQL لا يُتحقق منه وقت الإنشاء).
const CRYPTO_FNS = ["digest", "gen_random_bytes", "hmac", "encrypt", "decrypt"]
const cryptoProblems = []

for (const { file, sql } of allSqlSources) {
  const fnRe = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([\w.]+)[\s\S]*?\n\s*AS\s*\$\$([\s\S]*?)\$\$/g
  let m
  while ((m = fnRe.exec(sql))) {
    const name = m[1]
    const header = m[0].slice(0, m[0].indexOf("AS $$"))
    const body = m[2]
    const used = CRYPTO_FNS.filter((f) => new RegExp("\\b" + f + "\\s*\\(").test(body))
    if (used.length === 0) continue
    const sp = /SET\s+search_path\s*=\s*([^\n;]*)/i.exec(header)
    const path = sp ? sp[1].trim() : ""
    if (!/\bextensions\b/.test(path)) {
      cryptoProblems.push(
        `${file}: ${name} — تستخدم ${used.join("/")} لكن search_path لا يشمل extensions (حاليًا: «${path || "غير محدد → مخطط الاتصال"}»)`
      )
    }
  }
}
check("كل دالة تستدعي pgcrypto تُضمّن extensions في search_path", cryptoProblems.length === 0, cryptoProblems.join(" | "))

// translate() يتجاهل الفائض بصمت: أطوال مختلفة = أرقام تُقرأ خطأً فتفلت من البصمة
const translateProblems = []
for (const { file, sql } of sources) {
  for (const t of sql.matchAll(/translate\(\s*[^,]+,\s*'([^']*)'\s*,\s*'([^']*)'\s*\)/g)) {
    if (t[1].length !== t[2].length) {
      translateProblems.push(`${file}: translate بأطوال مختلفة (${t[1].length} مقابل ${t[2].length})`)
    }
  }
}
check("خرائط translate موزونة (نفس الطول في المصدر والوجه)", translateProblems.length === 0, translateProblems.join(" | "))

check(
  "مفتاح الهاتف الموحد: آخر ١١ رقمًا بحد أدنى ١٠ (يشمل 2010… و+20)",
  /CASE WHEN length\(d\) >= 10 THEN right\(d, 11\) ELSE NULL END/.test(byName("022_survey_once_per_answer.sql"))
)

section("2-ب) ترحيل 022: ردّ واحد لكل مُجيب في كل نسخة")

const sql022 = byName("022_survey_once_per_answer.sql")
check(
  "022: version على surveys وsurvey_responses (افتراضي 1)",
  (sql022.match(/ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1/g) || []).length >= 2
)
check("022: ملح لكل استبيان يمنع توليد البصمات خارج الخادم", /response_salt TEXT NOT NULL DEFAULT ''/.test(sql022) && /gen_random_bytes\(16\)/.test(sql022))
check("022: القيد الفريد على (survey_id, version, identity_hash)", /CREATE UNIQUE INDEX IF NOT EXISTS uq_survey_response_identity[\s\S]*?ON public\.survey_responses \(survey_id, version, identity_hash\)/.test(sql022))
check("022: فهارس 021 المسموحة للتكرار أُلغيت", /DROP INDEX IF EXISTS public\.uq_survey_response_student/.test(sql022) && /DROP INDEX IF EXISTS public\.uq_survey_response_phone/.test(sql022))

// لو أعاد 021 إنشاء الفهارس القديمة عند تشغيله مرة ثانية (بعد 022) يعود
// التكرار ويُمنع الردّ على نسخة جديدة — فيبقى في 021 الحذف فقط بلا إنشاء.
const m021 = byName("021_surveys.sql")
const oldUniquenessBack = /CREATE UNIQUE INDEX (IF NOT EXISTS )?uq_survey_response_(student|phone)/.test(m021)
check(
  "021 لم يعد يُنشئ فهارس «ردّ واحد» القديمة (ملكية الحصرية لـ 022)",
  !oldUniquenessBack,
  oldUniquenessBack ? "021 أعاد إنشاء فهرس فريد قديم — سيطبَّق فوق قاعدة 022 ويكسر الردّ على نسخة جديدة" : ""
)
check("022: بصمة المُجيب تُحسب دائمًا قبل الحفظ (ولا مسار بلا بصمة)", /v_hash := public\.survey_response_hash\(v_survey\.response_salt, v_identity\)/.test(sql022) && /IF v_hash IS NULL THEN[\s\S]{0,200}نرفض|لا يمكن ضمان عدم التكرار/.test(sql022))
const phoneReq =
  /v_phone := public\.survey_phone_key\(p_guest_phone\);[\s\S]{0,600}?IF v_phone IS NULL THEN/.test(sql022) &&
  // الأرقام العربية-الهندية تُوحَّد قبل المقارنة، وإلافلت الطالب من البصمة بتغيير صيغة الكتابة
  /translate\(coalesce\(p_phone, ''\), '٠١٢٣٤٥٦٧٨٩/.test(sql022)
// ملاحظة: قاعدة «الرقم إلزامي» في 022 ألغاها 023 (بلا رقم إجباري). ما يهم هنا
// أن مسار 022 نفسه يوحّد الأرقام قبل أي مقارنة — والقاعدة السارية تُفحص في 2-هـ.
check("022: توحيد صيغة الرقم قبل أي مقارنة (إرث ما زال مستعملًا في وضع phone)", phoneReq)
check("022: رقم الطالب يُطابق بآخر ١١ رقمًا (المقارنة الحرفية كانت تفشل مع 2010…)",
  (sql022.match(/public\.survey_phone_key\(st\.phone\) = v_(?:key|phone)/g) || []).length >= 2)
check("022: الرد المخزَّن يحمل مفتاح الهاتف الموحد لا الصيغة الأصلية", /phone = COALESCE\(public\.survey_phone_key\(r\.phone\), r\.phone\)/.test(sql022))
check("022: تكرار الرد = تحديث لردّه هو (صف واحد فقط) أو رفض عند القفل", /IF v_existing IS NOT NULL THEN[\s\S]{0,900}UPDATE public\.survey_responses/.test(sql022) && /lock_after_submit IS TRUE/.test(sql022))
{
  // الترتيب جوهري: لو حُذفت الهوية قبل حساب البصمة لتعطّل منع التكرار في المجهول
  const iHash = sql022.indexOf("v_hash := public.survey_response_hash(")
  const iStrip = sql022.indexOf("v_sid   := NULL;")
  check("022: حذف الهويات يحدث بعد حساب البصمة (لا قبله)", iHash > -1 && iStrip > -1 && iStrip > iHash, `hash=${iHash} strip=${iStrip}`)
}
check("022: مشغّل يرفع النسخة عند تغيّر الأسئلة ولا يقبل التنزيل", /NEW\.questions IS DISTINCT FROM OLD\.questions[\s\S]{0,200}NEW\.version := OLD\.version \+ 1/.test(sql022) && /GREATEST\(coalesce\(NEW\.version, 1\), coalesce\(OLD\.version, 1\)\)/.test(sql022))
check("022: الملح لا يخرج لأي عميل (يُستبعد من حمولات القراءة)", (sql022.match(/- 'response_salt'/g) || []).length >= 2)
check("022: بصمة الرد لا تُرسل مع ردود الطالب", /to_jsonb\(r\) - 'identity_hash'/.test(sql022))
check("022: دالة البصمة داخلية بلا صلاحيات عامة", /REVOKE ALL ON FUNCTION public\.survey_response_hash\(TEXT, TEXT\) FROM PUBLIC/.test(sql022))
check("022: حماية إغراق للزوار (حد ردود في الساعة)", /identity_hash = v_hash[\s\S]{0,200}1 hour/.test(sql022))

section("2-د) دوال ممنوحة لـ anon: لا قراءة جدول محمي بلا SECURITY DEFINER")

// العطل الذي أوقف كل ردود الاستبيان (022): أُعيد إنشاء submit_survey_response
// بـ CREATE OR REPLACE بدون SECURITY DEFINER، وCREATE OR REPLACE لا يرث خاصية
// الدالة السابقة. الدالة صارت تعمل بدور المنادي (anon) وRLS يمنع anon من قراءة
// public.surveys ⇒ «الاستبيان غير موجود» لكل مُجيب، بلا أي خطأ في السجلات.
//
// القاعدة المفروضة هنا: كل دالة تُمنح لـ anon وتلمس جدولاً في المخطط يجب أن
// تكون SECURITY DEFINER في **آخر** تعريف لها عبر كل الترحيلات.

/** آخر تعريف لكل دالة عبر الترحيلات بالترتيب: name -> { file, header, body } */
const lastFunctionDef = new Map()
for (const { file, sql } of allSqlSources) {
  const fnRe = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?([a-z_][a-z0-9_]*)\s*\(([\s\S]*?)\)\s*\n\s*RETURNS[\s\S]*?\n\s*AS\s*(\$[a-z_]*\$)([\s\S]*?)\3/gi
  let m
  while ((m = fnRe.exec(sql))) {
    const name = m[1].toLowerCase()
    const header = m[0].slice(0, m[0].indexOf("AS " + m[3]))
    lastFunctionDef.set(name, { file, header, body: m[4] })
  }
}

/** أسماء الدوال الممنوحة لـ anon (من كل ملفات SQL) */
const anonGranted = new Set()
for (const { sql } of allSqlSources) {
  for (const g of sql.matchAll(
    /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+(?:public\.)?([a-z_][a-z0-9_]*)\s*\([^)]*\)\s+TO\s+([^;]+);/gi
  )) {
    if (/\banon\b/i.test(g[2])) anonGranted.add(g[1].toLowerCase())
  }
}

const definerProblems = []
for (const name of anonGranted) {
  const def = lastFunctionDef.get(name)
  if (!def) continue // دالة معرّفة خارج ملفات المشروع
  // هل تلمس جدولاً حقيقياً؟ (الدوال الحسابية البحتة لا تحتاج SECURITY DEFINER)
  const touched = [...def.body.matchAll(/\b(?:FROM|JOIN|UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s+public\.([a-z_][a-z0-9_]*)/gi)]
    .map((x) => x[1].toLowerCase())
    .filter((t) => schema.has(t))
  if (touched.length === 0) continue
  if (!/SECURITY\s+DEFINER/i.test(def.header)) {
    definerProblems.push(
      `${def.file}: ${name} تقرأ ${[...new Set(touched)].slice(0, 3).join("/")} وهي ممنوحة لـ anon بلا SECURITY DEFINER`
    )
  }
}
check(
  "كل دالة ممنوحة لـ anon وتلمس جدولاً محمياً معرّفة SECURITY DEFINER (آخر تعريف)",
  definerProblems.length === 0,
  definerProblems.join(" | ")
)

// نفس الفكرة من زاوية أخرى: أي دالة استبيان يجب ألا تفقد SECURITY DEFINER في
// أي ترحيل لاحق (حتى لو لم تُمنح لـ anon في نفس الملف).
const surveyRpcs = ["submit_survey_response", "get_public_surveys", "get_student_surveys", "surveys_for_student"]
const lostDefiner = surveyRpcs.filter((fn) => {
  const def = lastFunctionDef.get(fn)
  return def && !/SECURITY\s+DEFINER/i.test(def.header)
})
check(
  "دوال الاستبيان الأربع محتفظة بـ SECURITY DEFINER في آخر تعريف",
  lostDefiner.length === 0,
  lostDefiner.join(", ")
)

section("2-هـ) ترحيل 023: إصلاح «الاستبيان غير موجود» + هوية بلا رقم هاتف")

const sql023 = byName("023_survey_identity_fix.sql")
check(
  "023: submit_survey_response أُعيد تعريفها SECURITY DEFINER (أصل العطل)",
  /CREATE OR REPLACE FUNCTION public\.submit_survey_response\([\s\S]*?RETURNS jsonb\s*\nLANGUAGE plpgsql SECURITY DEFINER/.test(sql023)
)
check(
  "023: التوقيعان القديمان يُحذفان قبل إنشاء الجديدين (لا التباس في PostgREST)",
  /DROP FUNCTION IF EXISTS public\.submit_survey_response\(TEXT, TEXT, JSONB, TEXT, TEXT, TEXT, TEXT\);/.test(sql023) &&
    /DROP FUNCTION IF EXISTS public\.get_public_surveys\(TEXT\);/.test(sql023)
)
check(
  "023: فحص تثبيت يرفض الترحيل إن بقيت دالة استبيان بلا SECURITY DEFINER",
  /prosecdef IS FALSE/.test(sql023) && /RAISE EXCEPTION/.test(sql023.slice(sql023.indexOf("prosecdef IS FALSE")))
)
check(
  "023: طرق تعريف الزائر الأربع محصورة بقيد CHECK",
  /CHECK \(guest_identity IN \('device', 'strict', 'phone', 'open'\)\)/.test(sql023) &&
    /CHECK \(name_mode IN \('off', 'optional', 'required'\)\)/.test(sql023)
)
check(
  "023: الرقم مطلوب فقط في طريقة phone (لا رقم إجباري بعد الآن)",
  /IF v_mode = 'phone' AND v_phone IS NULL THEN/.test(sql023) &&
    !/IF v_phone IS NULL THEN\s*\n\s*RETURN jsonb_build_object\('ok', false, 'error',\s*\n?\s*'اكتب رقم هاتف صحيح \(11 رقمًا\) — يُستخدم/.test(sql023)
)
check(
  "023: ترتيب الهوية = حساب الطالب ← الرقم إن وُجد ← بطاقة الجهاز ← الشبكة",
  /WHEN v_phone IS NOT NULL THEN 'ph:'\s*\|\| v_phone[\s\S]{0,200}WHEN v_dev\s+IS NOT NULL THEN 'dev:' \|\| v_dev[\s\S]{0,200}WHEN v_fp\s+IS NOT NULL THEN 'net:' \|\| v_fp/.test(sql023)
)
check(
  "023: بطاقة الجهاز تُنظَّف قبل الاستعمال (طول وحروف مسموحة)",
  /survey_device_key/.test(sql023) && /length\(d\) BETWEEN 16 AND 128/.test(sql023)
)
check(
  "023: عنوان الشبكة لا يُخزَّن خامًا أبدًا (يُهشَّر بملح الاستبيان)",
  /v_net := public\.survey_response_hash\(v_survey\.response_salt, 'net:' \|\| v_fp\)/.test(sql023) &&
    !/net_ip|raw_ip|ip_address/i.test(sql023)
)
check(
  "023: أولوية cf-connecting-ip ثم x-real-ip ثم آخر عنصر في x-forwarded-for",
  /cf-connecting-ip[\s\S]{0,400}x-real-ip[\s\S]{0,400}x-forwarded-for/.test(sql023) &&
    /v_parts\[array_length\(v_parts, 1\)\]/.test(sql023)
)
check(
  "023: الوضع المشدَّد يمنع نافذة التخفي (مطابقة بصمة الشبكة)",
  /v_mode = 'strict' AND v_sid IS NULL AND v_net IS NOT NULL AND r\.net_hash = v_net/.test(sql023)
)
check(
  "023: الوضع الافتراضي يعلّم التكرار المُرجَّح ولا يمنعه",
  /duplicate_suspect/.test(sql023) && /v_mode IN \('device', 'phone'\)/.test(sql023)
)
check(
  "023: مُشغِّل يحمي أعمدة الخادم من upsert لوحة المعلم (البصمات لا تُمحى)",
  /CREATE TRIGGER trg_survey_response_protect[\s\S]{0,120}BEFORE UPDATE ON public\.survey_responses/.test(sql023) &&
    /NEW\.identity_hash\s*:= COALESCE\(NEW\.identity_hash, OLD\.identity_hash\)/.test(sql023)
)
check(
  "023: الاستبيان المجهول ما زال لا يحفظ أي هوية",
  /IF v_survey\.anonymous IS TRUE THEN[\s\S]{0,300}v_sid\s*:= NULL;[\s\S]{0,200}v_phone := NULL;/.test(sql023)
)

section("3) توافق مزامنة الواجهة مع المخطط")

// أعمدة NOT NULL بلا قيمة افتراضية في الجداول الجديدة يجب أن يرسلها المزامن
const syncSrc = readFileSync("src/lib/supabase/sync.ts", "utf8")

section("3-ب) مسار الحفظ المحلي يطابق قواعد الخادم")

const localPath = syncSrc.slice(syncSrc.indexOf("export async function submitSurveyResponse"))
check("البصمة المحلية تُبنى من الجلسة أو الرقم أو بطاقة المتصفح (نفس ترتيب الخادم)",
  /localIdentityKey\(\{\s*token:\s*input\.token,\s*phone:\s*input\.guestPhone,\s*deviceId\s*\}\)/.test(localPath))
check("بطاقة المتصفح تُرسل مع كل رد وكل قراءة عامة (p_device_id)",
  /p_device_id:\s*deviceId \|\| null/.test(syncSrc) && /p_device_id:\s*getSurveyDeviceId\(\) \|\| null/.test(syncSrc))
check("تراجع آمن لقاعدة لم تُرقَّ إلى 023 (توقيع RPC قديم لا يُضيع إجابة)",
  /isMissingRpcArgError/.test(syncSrc) && /PGRST202/.test(syncSrc))
check("المسار المحلي يحذف الهوية في الاستبيان المجهول (كما يفعل الخادم)",
  /localIdentityPayload\(input, survey\?\.anonymous === true\)/.test(localPath) &&
  /function localIdentityPayload[\s\S]{0,420}studentName: ""/.test(syncSrc))
check("الرقم المحفوظ محليًا موحَّد بآخر ١١ رقمًا", /phone: normalizeSurveyPhone\(input\.guestPhone/.test(syncSrc))
check("خطة الرد تُستبدل في الذاكرة ولا تُراكم صفوفًا", /exists \? prev\.map/.test(localPath))
const mapperOf = {
  surveys: /const toSurveyRow[\s\S]*?\n\}\)/,
  survey_responses: /const toSurveyResponseRow[\s\S]*?\n\}\)/,
}

const REQUIRED = {
  surveys: ["id", "title", "audience", "published", "allow_guests", "anonymous", "version"],
  survey_responses: ["id", "survey_id", "answers", "version"],
}

for (const [table, re] of Object.entries(mapperOf)) {
  const m = re.exec(syncSrc)
  if (!m) {
    check(`${table}: خريطة الرفع موجودة في sync.ts`, false, "لم تُعثر على دالة التحويل")
    continue
  }
  const keys = [...m[0].matchAll(/^\s{2}([a-z_]+)\s*:/gm)].map((x) => x[1])
  const unknown = keys.filter((k) => !(schema.get(table)?.has(k) ?? false))
  check(`${table}: كل حقول الخريطة موجودة في الجدول`, unknown.length === 0, unknown.join(", "))
  const missing = (REQUIRED[table] || []).filter((k) => !keys.includes(k))
  check(`${table}: الحقول الإلزامية مرسلة دائماً`, missing.length === 0, missing.join(", "))
}

// ملح الاستبيان سرّ داخلي: لا يُرسل ولا يُخزَّن في ذاكرة الجلسة
check("sync.ts لا يرسل response_salt إلى قاعدة البيانات إطلاقًا", !/response_salt:\s/.test(syncSrc))
check("toSurveyResponseRow لا يخلط identity_hash مع الحقول المرسلة", !/identity_hash:/.test(syncSrc))
// قارئَا الجداول يجب أن يمرّرا رقم النسخة (ولوافتراضياً ١) حتى تُقارن «أجبت» بالنسخة الصحيحة
const versionReaders = (syncSrc.match(/version:\s*Number\(row\.version\)\s*\|\|\s*1/g) || []).length
check("fromSurveyRow و fromSurveyResponseRow يمرّران version من الصف", versionReaders >= 2, `عدد المواضع = ${versionReaders}`)
const versionWriters = (syncSrc.match(/version:\s*Math\.max\(1,\s*Math\.round\(Number\([rv]\.version\)\s*\|\|\s*1\)\)/g) || []).length
check("خريطةَا الرفع ترسلان version ≥ 1 (بلا نسخة صفرية تكسر الفهرس الفريد)", versionWriters >= 2, `عدد المواضع = ${versionWriters}`)
check("مدخلات sendSurveys تحمل answeredKeys من الدالتين", (syncSrc.match(/answeredKeys/g) || []).length >= 3)

console.log(`\n${"=".repeat(56)}`)
console.log(`\x1b[1mالنتيجة: ${pass} ناجح / ${failures.length} فاشل\x1b[0m`)
if (failures.length) {
  failures.forEach((f) => console.log("  • " + f))
  process.exit(1)
}
console.log("\x1b[32mمخطط SQL سليم ومتسق مع الكود ✅\x1b[0m")
