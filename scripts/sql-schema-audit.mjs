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

import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

const MIGRATIONS_DIR = "supabase/migrations"
const files = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort()
const sources = files.map((f) => ({ file: f, sql: readFileSync(join(MIGRATIONS_DIR, f), "utf8") }))

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

const problems = []
const typeProblems = []

for (const { file, sql } of sources) {
  for (const m of sql.matchAll(FN_RE)) {
    const fnName = m[1]
    let body = m[3]
    // public. في المتن مجرد تأهيل للمخطط — نحذفه لتبسيط التحليل
    body = body.replace(/\bpublic\./g, "")

    // الأسماء المستعارة: FROM/JOIN table alias
    const aliasToTable = new Map()
    const fromRe = /\b(?:FROM|JOIN)\s+([a-z_][a-z0-9_]*)\s*(?:(?:AS\s+)?([a-z_][a-z0-9_]*))?/gi
    for (const fm of body.matchAll(fromRe)) {
      const table = fm[1]
      let alias = fm[2]
      if (!alias || /^(WHERE|ON|LEFT|RIGHT|INNER|CROSS|GROUP|ORDER|LIMIT|SET|USING|AND|OR|RETURNING)$/i.test(alias)) {
        alias = table
      }
      aliasToTable.set(alias, table)
    }
    // متغيرات %ROWTYPE — حقولها من الجدول لا من الاستعلام
    for (const rm of body.matchAll(/([a-z_][a-z0-9_]*)\s+(?:public\.)?([a-z_][a-z0-9_]*)%ROWTYPE/gi)) {
      aliasToTable.set(rm[1], rm[2])
    }

    // INSERT INTO table (cols)
    for (const im of body.matchAll(/INSERT\s+INTO\s+([a-z_][a-z0-9_]*)\s*\(([^)]*)\)/gi)) {
      const table = im[1]
      const cols = schema.get(table)
      if (!cols) continue
      for (const c of im[2].split(",").map((x) => x.trim()).filter(Boolean)) {
        if (!cols.has(c)) problems.push(`${file}: ${fnName} — INSERT INTO ${table} يستخدم عموداً غير موجود: ${c}`)
      }
    }

    // UPDATE table SET col = ...
    for (const um of body.matchAll(/UPDATE\s+([a-z_][a-z0-9_]*)\s+SET\s+([\s\S]*?)(?:WHERE|RETURNING|;|$)/gi)) {
      const table = um[1]
      const cols = schema.get(table)
      if (!cols) continue
      for (const am of um[2].matchAll(/(?:^|,|\n)\s*([a-z_][a-z0-9_]*)\s*=/gi)) {
        if (!cols.has(am[1])) problems.push(`${file}: ${fnName} — UPDATE ${table} يستخدم عموداً غير موجود: ${am[1]}`)
      }
    }

    // alias.column
    for (const cm of body.matchAll(/\b([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\b/g)) {
      const [, alias, col] = cm
      const table = aliasToTable.get(alias)
      if (!table) continue
      const cols = schema.get(table)
      if (!cols) continue // جدول مشتق أو دالة — لا نعرفه
      if (col === "*") continue
      if (!cols.has(col)) problems.push(`${file}: ${fnName} — ${alias}.${col}: العمود غير موجود في ${table}`)
    }

    // مقارنة عمود نصي بـ now() — خطأ «operator does not exist: text > timestamp»
    for (const tm of body.matchAll(/\b([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\s*(?:>=|<=|>|<)\s*now\(\)/gi)) {
      const table = aliasToTable.get(tm[1])
      if (!table) continue
      const cols = schema.get(table)
      if (!cols) continue
      const type = cols.get(tm[2])
      if (type && /^(TEXT|CHAR|VARCHAR|BPCHAR|CHARACTER)$/.test(type)) {
        typeProblems.push(
          `${file}: ${fnName} — ${tm[1]}.${tm[2]} من نوع ${type} يُقارن بـ now() ` +
            `(المقارنة الصحيحة: ${tm[2]} > to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))`
        )
      }
    }
  }
}

check(
  "كل الأعمدة المستخدمة داخل دوال SQL موجودة في مخطط قاعدة البيانات",
  problems.length === 0,
  problems.join(" | ")
)
check(
  "لا مقارنة بين عمود نصي و now() داخل دوال SQL",
  typeProblems.length === 0,
  typeProblems.join(" | ")
)

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

section("3) توافق مزامنة الواجهة مع المخطط")

// أعمدة NOT NULL بلا قيمة افتراضية في الجداول الجديدة يجب أن يرسلها المزامن
const syncSrc = readFileSync("src/lib/supabase/sync.ts", "utf8")
const mapperOf = {
  surveys: /const toSurveyRow[\s\S]*?\n\}\)/,
  survey_responses: /const toSurveyResponseRow[\s\S]*?\n\}\)/,
}

const REQUIRED = {
  surveys: ["id", "title", "audience", "published", "allow_guests", "anonymous"],
  survey_responses: ["id", "survey_id", "answers"],
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

console.log(`\n${"=".repeat(56)}`)
console.log(`\x1b[1mالنتيجة: ${pass} ناجح / ${failures.length} فاشل\x1b[0m`)
if (failures.length) {
  failures.forEach((f) => console.log("  • " + f))
  process.exit(1)
}
console.log("\x1b[32mمخطط SQL سليم ومتسق مع الكود ✅\x1b[0m")
