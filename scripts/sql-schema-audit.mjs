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

// ------------------------------------------------------------
// ١-ب) متغيرات INTO غير المعلنة + تطابق أعداد أعمدة INSERT/VALUES
//      (هذا النوع لا يظهر إلا عند أول نداء فعلي للدالة في Supabase)
// ------------------------------------------------------------
const FN_BODY_RE =
  /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?([a-z_][a-z0-9_]*)\s*\([\s\S]*?\)\s*RETURNS[\s\S]*?\$\$([\s\S]*?)\$\$/gi
const varProblems = []
const arityProblems = []

for (const { file, sql } of sources) {
  for (const m of sql.matchAll(FN_BODY_RE)) {
    const fn = m[1]
    const body = m[2]
    const declBlock = /\bDECLARE\b([\s\S]*?)\bBEGIN\b/i.exec(body)
    // كل سطر في DECLARE يبدأ بمعرّف: ذلك المعرّف معلن (يشمل var table%ROWTYPE)
    const declared = new Set(
      (declBlock ? declBlock[1] : "")
        // فاصلة منقوطة أولًا: سطر واحد قد يعلن عدة متغيرات (v_a jsonb; v_b jsonb;)
        .split(";")
        .map((seg) => seg.replace(/--[^\n]*/g, "").trim())
        .map((seg) => /^([a-z_][a-z0-9_]*)\s+\S/i.exec(seg))
        .filter(Boolean)
        .map((x) => x[1].toLowerCase())
    )
    // SELECT ... INTO v_a, v_b — (INSERT INTO table مُستثنى: ليس متغيرات)
    for (const im of body.matchAll(/(?<!INSERT\s)\bINTO\s+([a-z_][a-z0-9_]*(?:\s*,\s*[a-z_][a-z0-9_]*)*)/gi)) {
      for (const raw of im[1].split(",")) {
        const v = raw.trim().toLowerCase()
        if (!v) continue
        if (!declared.has(v)) varProblems.push(`${file}: ${fn} — المتغير «${v}» في INTO غير معلن في DECLARE`)
      }
    }
    // INSERT INTO t (a,b,c) VALUES (x,y) → تطابق العدد
    for (const im of body.matchAll(/INSERT\s+INTO\s+([a-z_][a-z0-9_]*)\s*\(([^)]*)\)\s*\n?\s*VALUES\s*\(([^)]*)\)/gi)) {
      const cols = im[2].split(",").map((x) => x.trim()).filter(Boolean)
      const vals = im[3].split(",").map((x) => x.trim()).filter(Boolean)
      if (cols.length !== vals.length) {
        arityProblems.push(`${file}: ${fn} — INSERT INTO ${im[1]}: ${cols.length} عمود مقابل ${vals.length} قيمة`)
      }
    }
  }
}

check("كل متغير في جمل INTO معلن في كتلة DECLARE", varProblems.length === 0, varProblems.join(" | "))
check("أعمدة INSERT وقيمها متساوية العدد في دوال SQL", arityProblems.length === 0, arityProblems.join(" | "))

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

for (const { file, sql } of sources) {
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
check("022: رقم الهاتف مطلوب للزائر (بمفتاح موحّد) قبل أي تفريع للـ anonymous", phoneReq)
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

section("3) توافق مزامنة الواجهة مع المخطط")

// أعمدة NOT NULL بلا قيمة افتراضية في الجداول الجديدة يجب أن يرسلها المزامن
const syncSrc = readFileSync("src/lib/supabase/sync.ts", "utf8")

section("3-ب) مسار الحفظ المحلي يطابق قواعد الخادم")

const localPath = syncSrc.slice(syncSrc.indexOf("export async function submitSurveyResponse"))
check("البصمة المحلية تُبنى من رقم الزائر (guestPhone) لا حقل غير موجود",
  /localIdentityKey\(\{\s*token:\s*input\.token,\s*phone:\s*input\.guestPhone\s*\}\)/.test(localPath))
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
