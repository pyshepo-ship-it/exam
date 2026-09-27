"use client"

import React, { useEffect, useRef, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { PERIODIC_ELEMENTS } from "@/lib/periodic-elements"
import { checkEquationBalance, suggestChemicalTypography, type BalanceResult } from "@/lib/chemistry-equation"

const GROUPS = [
  { name: "العناصر الأكثر استخدامًا", tokens: ["H","O","N","C","Na","Cl","Ca","K","Mg","Fe","Al","Zn","Cu","Ag","S","P","F","Br","I","Si"] },
  { name: "أيونات ومجموعات شائعة", tokens: ["OH⁻","SO₄²⁻","SO₃²⁻","NO₃⁻","NO₂⁻","CO₃²⁻","HCO₃⁻","PO₄³⁻","NH₄⁺","MnO₄⁻","Cr₂O₇²⁻","CN⁻"] },
  { name: "الأرقام السفلية", tokens: ["₀","₁","₂","₃","₄","₅","₆","₇","₈","₉"] },
  { name: "الشحنات العلوية", tokens: ["⁰","¹","²","³","⁴","⁵","⁶","⁷","⁸","⁹","⁺","⁻","²⁺","²⁻","³⁺","³⁻"] },
  { name: "التفاعل والحالات", tokens: [" + "," ⟶ "," ⇌ "," ↑"," ↓","(s)","(l)","(g)","(aq)","Δ","hν","cat.","·","(",")","[","]"] },
  { name: "فراغات الطالب", tokens: ["……","________","[……]"," ? "] },
]
const TEMPLATES = ["…… + …… ⟶ ……","…… ⟶ …… + ……","A + BC ⟶ AC + B","AB + CD ⟶ AD + CB","…… + O₂ ⟶ CO₂ + H₂O","فلز + حمض ⟶ ملح + H₂↑"]

export function EquationDisplay({ equation, aboveArrow }: { equation?: string; aboveArrow?: string }) {
  if (!equation) return null
  const arrow = equation.includes("⇌") ? "⇌" : equation.includes("⟶") ? "⟶" : ""
  if (!arrow || !aboveArrow) return <span dir="ltr" className="inline-block whitespace-pre-wrap font-bold tracking-wide">{equation}</span>
  const [before, ...after] = equation.split(arrow)
  return <span dir="ltr" className="inline-flex max-w-full items-end justify-center font-bold tracking-wide">
    <span className="whitespace-pre-wrap">{before}</span>
    <span className="relative inline-flex min-w-24 justify-center pt-2.5 px-1">
      <span className="absolute top-0 left-1/2 -translate-x-1/2 whitespace-nowrap text-[.68em] leading-none font-semibold">{aboveArrow}</span>
      <span className="inline-block origin-center scale-x-[2.25] leading-none">{arrow}</span>
    </span>
    <span className="whitespace-pre-wrap">{after.join(arrow)}</span>
  </span>
}

export function EquationEditor({ open, initialEquation, initialAboveArrow, onClose, onSave }: {
  open: boolean
  initialEquation?: string
  initialAboveArrow?: string
  onClose: () => void
  onSave: (equation: string, aboveArrow: string) => void
}) {
  const [equation, setEquation] = useState("")
  const [aboveArrow, setAboveArrow] = useState("")
  const [elementSearch, setElementSearch] = useState("")
  const [showAllElements, setShowAllElements] = useState(false)
  const [formatSuggestion, setFormatSuggestion] = useState<string | null>(null)
  const [balanceResult, setBalanceResult] = useState<BalanceResult | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { if (open) { setEquation(initialEquation || ""); setAboveArrow(initialAboveArrow || ""); setFormatSuggestion(null); setBalanceResult(null) } }, [open, initialEquation, initialAboveArrow])
  const insert = (token: string) => {
    const input = inputRef.current
    const start = input?.selectionStart ?? equation.length
    const end = input?.selectionEnd ?? start
    const next = equation.slice(0, start) + token + equation.slice(end)
    setEquation(next)
    requestAnimationFrame(() => { input?.focus(); input?.setSelectionRange(start + token.length, start + token.length) })
  }
  return <Dialog open={open} onOpenChange={value => { if (!value) onClose() }}>
    <DialogContent
      overlayClassName="!z-[100]"
      className="!z-[101] !fixed !inset-x-2 !bottom-2 !top-auto !left-auto !w-auto !max-w-none !translate-x-0 !translate-y-0 max-h-[92dvh] overflow-y-auto rounded-2xl p-4 sm:!inset-auto sm:!left-1/2 sm:!top-1/2 sm:!bottom-auto sm:!w-[96vw] sm:!max-w-2xl sm:!-translate-x-1/2 sm:!-translate-y-1/2"
      dir="rtl"
    >
      <DialogHeader><DialogTitle>⚗️ محرر المعادلات العلمية</DialogTitle></DialogHeader>
      <p className="text-xs text-gray-500">لن يُمسح نص السؤال. اكتب أو اختر الرموز، وحدد ما يظهر فوق السهم مثل الحرارة أو العامل الحفاز.</p>
      <textarea ref={inputRef} dir="ltr" value={equation} onChange={event => { setEquation(event.target.value); setFormatSuggestion(null); setBalanceResult(null) }} placeholder="NaCl + H₂O ⟶ NaOH + H₂↑" className="min-h-20 w-full rounded-xl border p-3 text-left text-lg font-bold" />
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => {
          const suggestion = suggestChemicalTypography(equation)
          setFormatSuggestion(suggestion !== equation ? suggestion : null)
        }} className="rounded-lg border border-violet-300 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-700 dark:bg-violet-950/30 dark:text-violet-300">✨ اقتراح تنسيق الأرقام</button>
        <button type="button" onClick={() => setBalanceResult(checkEquationBalance(equation))} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">⚖️ فحص التوازن اختياريًا</button>
      </div>
      {formatSuggestion && <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-xs dark:bg-violet-950/30">
        <p className="font-bold">اقتراح فقط — لن نغيّر المعادلة دون موافقتك:</p>
        <p dir="ltr" className="my-2 text-left text-base font-bold">{formatSuggestion}</p>
        <div className="flex gap-2"><button type="button" onClick={() => { setEquation(formatSuggestion); setFormatSuggestion(null) }} className="rounded-lg bg-violet-600 px-3 py-1.5 font-bold text-white">تطبيق الاقتراح</button><button type="button" onClick={() => setFormatSuggestion(null)} className="rounded-lg border px-3 py-1.5">اتركها كما كتبتها</button></div>
      </div>}
      {balanceResult && <div className={`rounded-xl border p-3 text-xs ${balanceResult.status === "balanced" ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200" : balanceResult.status === "unbalanced" ? "border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200" : "border-gray-300 bg-gray-50 dark:bg-gray-900"}`}>
        <p className="font-bold">{balanceResult.message}</p>
        <p className="mt-1 opacity-80">هذا فحص إرشادي فقط، ولن يصحح أو يمنع حفظ المعادلة.</p>
        <button type="button" onClick={() => setBalanceResult(null)} className="mt-2 rounded-lg border bg-white px-3 py-1.5 font-bold text-gray-700 dark:bg-gray-900 dark:text-gray-200">حسنًا، اترك المعادلة كما هي</button>
      </div>}
      <div className="rounded-xl border bg-gray-50 p-3 text-center text-lg dark:bg-gray-900"><EquationDisplay equation={equation} aboveArrow={aboveArrow} /></div>
      <label className="block text-xs font-bold">العلامة أو الشرط فوق السهم
        <input value={aboveArrow} onChange={event => setAboveArrow(event.target.value)} placeholder="مثال: Δ أو حرارة أو MnO₂" dir="ltr" className="mt-1 w-full rounded-lg border bg-transparent px-3 py-2 text-left" maxLength={30} />
      </label>
      <div className="flex flex-wrap gap-1.5">{["Δ","حرارة","ضوء","MnO₂","Pt","Ni","ضغط","تحليل كهربائي"].map(token => <button key={token} type="button" onClick={() => setAboveArrow(token)} className="rounded-lg border px-2.5 py-1.5 text-xs font-bold">{token}</button>)}</div>
      <div className="rounded-xl border border-indigo-200 p-2 dark:border-indigo-900">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-bold">الجدول الدوري الكامل — 118 عنصرًا</p>
            <p className="text-[10px] text-gray-500">اضغط على العنصر لإدراجه عند موضع المؤشر</p>
          </div>
          <button type="button" onClick={() => setShowAllElements(value => !value)} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white">{showAllElements ? "إخفاء الجدول" : "عرض كل العناصر"}</button>
        </div>
        {showAllElements && <>
          <input value={elementSearch} onChange={event => setElementSearch(event.target.value)} placeholder="ابحث بالرمز أو الاسم العربي أو العدد الذري…" className="mb-2 w-full rounded-lg border bg-transparent px-3 py-2 text-sm" />
          <div className="grid max-h-64 grid-cols-4 gap-1.5 overflow-y-auto p-1 sm:grid-cols-7 md:grid-cols-10" dir="ltr">
            {PERIODIC_ELEMENTS.filter(element => {
              const query = elementSearch.trim().toLocaleLowerCase("ar")
              return !query || element.symbol.toLowerCase().includes(query) || element.nameAr.includes(query) || String(element.atomicNumber) === query
            }).map(element => <button key={element.atomicNumber} type="button" onClick={() => insert(element.symbol)} title={`${element.nameAr} — العدد الذري ${element.atomicNumber}`} className="relative min-h-14 rounded-lg border border-indigo-200 bg-indigo-50 px-1 pt-2 text-center hover:border-indigo-500 active:scale-95 dark:bg-indigo-950/40">
              <span className="absolute left-1 top-0.5 text-[8px] text-gray-500">{element.atomicNumber}</span>
              <b className="block text-base leading-none">{element.symbol}</b>
              <span className="mt-1 block truncate text-[8px] text-gray-600 dark:text-gray-300" dir="rtl">{element.nameAr}</span>
            </button>)}
          </div>
        </>}
      </div>
      {GROUPS.map(group => <div key={group.name}><p className="mb-1 text-xs font-bold">{group.name}</p><div className="flex flex-wrap gap-1.5" dir="ltr">{group.tokens.map(token => <button key={token} type="button" onClick={() => insert(token)} className="min-h-10 min-w-10 rounded-lg border bg-white px-2 text-base font-bold active:scale-95 dark:bg-gray-900">{token}</button>)}</div></div>)}
      <div><p className="mb-1 text-xs font-bold">قوالب جاهزة</p><div className="grid gap-1.5">{TEMPLATES.map(template => <button key={template} type="button" onClick={() => setEquation(template)} dir="ltr" className="rounded-lg border bg-white px-3 py-2 text-left text-sm dark:bg-gray-900">{template}</button>)}</div></div>
      <div className="sticky bottom-0 flex gap-2 border-t bg-white pt-3 dark:bg-gray-950">
        <Button variant="outline" onClick={onClose} className="flex-1">إلغاء</Button>
        <Button variant="outline" onClick={() => { setEquation(""); setAboveArrow("") }}>مسح المعادلة</Button>
        <Button onClick={() => { onSave(equation.trim(), aboveArrow.trim()); onClose() }} className="flex-1 bg-indigo-600">حفظ المعادلة</Button>
      </div>
    </DialogContent>
  </Dialog>
}
