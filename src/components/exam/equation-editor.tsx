"use client"

import React, { useEffect, useRef, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

const GROUPS = [
  { name: "العناصر", tokens: ["H","O","N","C","Na","Cl","Ca","K","Mg","Fe","Al","Zn","Cu","Ag","S","P","F","Br","I","Si"] },
  { name: "الأرقام السفلية", tokens: ["₀","₁","₂","₃","₄","₅","₆","₇","₈","₉"] },
  { name: "الشحنات العلوية", tokens: ["⁰","¹","²","³","⁴","⁵","⁶","⁷","⁸","⁹","⁺","⁻","²⁺","²⁻","³⁺","³⁻"] },
  { name: "التفاعل والحالات", tokens: [" + "," ⟶ "," ⇌ "," ↑"," ↓","(s)","(l)","(g)","(aq)","Δ","hν","cat.","·","(",")","[","]"] },
  { name: "فراغات الطالب", tokens: ["……","________","[……]"," ? "] },
]
const TEMPLATES = ["…… + …… ⟶ ……","…… ⟶ …… + ……","A + BC ⟶ AC + B","AB + CD ⟶ AD + CB","…… + O₂ ⟶ CO₂ + H₂O","فلز + حمض ⟶ ملح + H₂↑"]

export function EquationDisplay({ equation, aboveArrow }: { equation?: string; aboveArrow?: string }) {
  if (!equation) return null
  const arrow = equation.includes("⇌") ? "⇌" : equation.includes("⟶") ? "⟶" : ""
  if (!arrow || !aboveArrow) return <span dir="ltr" className="inline-block font-bold tracking-wide">{equation}</span>
  const [before, ...after] = equation.split(arrow)
  return <span dir="ltr" className="inline-flex items-end justify-center gap-1 font-bold tracking-wide max-w-full">
    <span>{before}</span>
    <span className="relative inline-flex min-w-12 justify-center pt-4">
      <span className="absolute -top-1 left-1/2 -translate-x-1/2 whitespace-nowrap text-[.72em] font-semibold">{aboveArrow}</span>
      <span>{arrow}</span>
    </span>
    <span>{after.join(arrow)}</span>
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
  const inputRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { if (open) { setEquation(initialEquation || ""); setAboveArrow(initialAboveArrow || "") } }, [open, initialEquation, initialAboveArrow])
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
      <textarea ref={inputRef} dir="ltr" value={equation} onChange={event => setEquation(event.target.value)} placeholder="NaCl + H₂O ⟶ NaOH + H₂↑" className="min-h-20 w-full rounded-xl border p-3 text-left text-lg font-bold" />
      <div className="rounded-xl border bg-gray-50 p-3 text-center text-lg dark:bg-gray-900"><EquationDisplay equation={equation} aboveArrow={aboveArrow} /></div>
      <label className="block text-xs font-bold">العلامة أو الشرط فوق السهم
        <input value={aboveArrow} onChange={event => setAboveArrow(event.target.value)} placeholder="مثال: Δ أو حرارة أو MnO₂" dir="ltr" className="mt-1 w-full rounded-lg border bg-transparent px-3 py-2 text-left" maxLength={30} />
      </label>
      <div className="flex flex-wrap gap-1.5">{["Δ","حرارة","ضوء","MnO₂","Pt","Ni","ضغط","تحليل كهربائي"].map(token => <button key={token} type="button" onClick={() => setAboveArrow(token)} className="rounded-lg border px-2.5 py-1.5 text-xs font-bold">{token}</button>)}</div>
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
