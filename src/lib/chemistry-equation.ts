const SUBSCRIPT: Record<string, string> = { "0":"₀", "1":"₁", "2":"₂", "3":"₃", "4":"₄", "5":"₅", "6":"₆", "7":"₇", "8":"₈", "9":"₉" }
const FROM_SUBSCRIPT: Record<string, string> = Object.fromEntries(Object.entries(SUBSCRIPT).map(([key, value]) => [value, key]))

/** اقتراح تنسيق فقط؛ لا يغيّر كتابة المعلم إلا بعد موافقته. */
export function suggestChemicalTypography(value: string): string {
  return value.replace(/([A-Za-z)\]])(\d+)/g, (_match, prefix: string, digits: string) =>
    prefix + digits.split("").map(char => SUBSCRIPT[char] || char).join("")
  )
}

type AtomCounts = Record<string, number>

function merge(target: AtomCounts, source: AtomCounts, multiplier = 1) {
  for (const [symbol, count] of Object.entries(source)) target[symbol] = (target[symbol] || 0) + count * multiplier
}

function parseFormula(raw: string): AtomCounts | null {
  const formula = raw
    .replace(/\((?:s|l|g|aq)\)/gi, "")
    .replace(/[↑↓]/g, "")
    .replace(/[₀-₉]/g, char => FROM_SUBSCRIPT[char] || char)
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻+\-]/g, "")
    .trim()
  const coefficientMatch = formula.match(/^(\d+)\s*(.*)$/)
  const coefficient = coefficientMatch ? Number(coefficientMatch[1]) : 1
  const body = coefficientMatch ? coefficientMatch[2] : formula
  if (!body || /[^A-Za-z0-9()[\]]/.test(body)) return null
  let index = 0
  const parseGroup = (closing?: string): AtomCounts | null => {
    const result: AtomCounts = {}
    while (index < body.length) {
      const char = body[index]
      if (closing && char === closing) { index++; return result }
      if (char === "(" || char === "[") {
        index++
        const inner = parseGroup(char === "(" ? ")" : "]")
        if (!inner) return null
        const numberMatch = body.slice(index).match(/^\d+/)?.[0]
        const number = numberMatch || "1"
        index += numberMatch?.length || 0
        merge(result, inner, Number(number))
        continue
      }
      const element = body.slice(index).match(/^[A-Z][a-z]?/)
      if (!element) return null
      index += element[0].length
      const numberMatch = body.slice(index).match(/^\d+/)?.[0]
      const number = numberMatch || "1"
      index += numberMatch?.length || 0
      result[element[0]] = (result[element[0]] || 0) + Number(number)
    }
    return closing ? null : result
  }
  const parsed = parseGroup()
  if (!parsed) return null
  return Object.fromEntries(Object.entries(parsed).map(([symbol, count]) => [symbol, count * coefficient]))
}

export type BalanceResult =
  | { status: "balanced"; message: string }
  | { status: "unbalanced"; message: string; left: AtomCounts; right: AtomCounts }
  | { status: "unknown"; message: string }

/** فحص إرشادي لا يحفظ ولا يصحح المعادلة تلقائياً. */
export function checkEquationBalance(equation: string): BalanceResult {
  const arrow = equation.includes("⇌") ? "⇌" : equation.includes("⟶") ? "⟶" : equation.includes("→") ? "→" : null
  if (!arrow) return { status: "unknown", message: "أضف سهم التفاعل أولاً حتى يمكن فحص الطرفين." }
  const [leftRaw, rightRaw, ...extra] = equation.split(arrow)
  if (!leftRaw || !rightRaw || extra.length) return { status: "unknown", message: "تعذر قراءة طرفي المعادلة؛ يمكنك تركها كما كتبتها." }
  const parseSide = (side: string): AtomCounts | null => {
    const total: AtomCounts = {}
    for (const formula of side.split(/\s+\+\s+/)) {
      const parsed = parseFormula(formula)
      if (!parsed) return null
      merge(total, parsed)
    }
    return total
  }
  const left = parseSide(leftRaw)
  const right = parseSide(rightRaw)
  if (!left || !right) return { status: "unknown", message: "الفحص الإرشادي لا يفهم هذه الصيغة بالكامل؛ لن يتم تغييرها." }
  const symbols = new Set([...Object.keys(left), ...Object.keys(right)])
  const balanced = [...symbols].every(symbol => (left[symbol] || 0) === (right[symbol] || 0))
  return balanced
    ? { status: "balanced", message: "تبدو أعداد الذرات متساوية في طرفي المعادلة." }
    : { status: "unbalanced", message: "تبدو المعادلة غير موزونة. اتركها كما هي إذا كان المطلوب من الطالب موازنتها أو تصحيحها.", left, right }
}
