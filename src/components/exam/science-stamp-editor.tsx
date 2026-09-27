"use client"

import React, { useState } from "react"
import { SCIENCE_STAMPS, SCIENCE_STAMP_GROUPS, type PlacedScienceStamp } from "@/lib/science-stamps"

export function ScienceStampLayer({ stamps, page, editable, pendingSymbolId, onPlace, onChange, onSelect, selectedId }: {
  stamps: PlacedScienceStamp[]
  page: number
  editable?: boolean
  pendingSymbolId?: string | null
  onPlace?: (page: number, x: number, y: number) => void
  onChange?: (stamp: PlacedScienceStamp) => void
  onSelect?: (id: string) => void
  selectedId?: string | null
}) {
  const byId = new Map(SCIENCE_STAMPS.map(symbol => [symbol.id, symbol]))
  return <div
    className={`absolute inset-0 z-20 overflow-hidden rounded-[inherit] ${pendingSymbolId ? "pointer-events-auto cursor-crosshair" : "pointer-events-none"}`}
    aria-hidden={!editable}
    title={pendingSymbolId ? "اضغط هنا لوضع الرمز" : undefined}
    onPointerDown={event => {
      if (!pendingSymbolId || !onPlace || event.target !== event.currentTarget) return
      event.preventDefault()
      const rect = event.currentTarget.getBoundingClientRect()
      const x = Math.max(2, Math.min(98, ((event.clientX - rect.left) / rect.width) * 100))
      const y = Math.max(2, Math.min(98, ((event.clientY - rect.top) / rect.height) * 100))
      onPlace(page, x, y)
    }}
  >
    {stamps.filter(stamp => stamp.page === page).map(stamp => {
      const symbol = byId.get(stamp.symbolId) || (stamp.glyph ? { id: stamp.symbolId, glyph: stamp.glyph, name: "رمز مخصص", group: "custom" } : undefined)
      if (!symbol) return null
      return <button
        key={stamp.id}
        type="button"
        title={editable ? `${symbol.name} — اسحب لتحريك الرمز` : symbol.name}
        className={`absolute -translate-x-1/2 -translate-y-1/2 select-none touch-none leading-none bg-transparent border-0 p-1 ${editable ? "pointer-events-auto cursor-move" : "pointer-events-none"} ${selectedId === stamp.id ? "outline-2 outline-dashed outline-indigo-500 rounded" : ""}`}
        style={{ left: `${stamp.x}%`, top: `${stamp.y}%`, fontSize: stamp.size, opacity: stamp.opacity, filter: "drop-shadow(0 3px 2px rgba(15,23,42,.28)) drop-shadow(0 1px 0 rgba(255,255,255,.8))", textShadow: "0 2px 2px rgba(15,23,42,.2)", transform: `translate(-50%,-50%) rotate(${stamp.rotation}deg)` }}
        onPointerDown={event => {
          if (!editable || !onChange) return
          event.preventDefault()
          onSelect?.(stamp.id)
          const target = event.currentTarget
          const pageEl = target.closest(".exam-page") as HTMLElement | null
          if (!pageEl) return
          target.setPointerCapture(event.pointerId)
          const move = (moveEvent: PointerEvent) => {
            const rect = pageEl.getBoundingClientRect()
            const x = Math.max(2, Math.min(98, ((moveEvent.clientX - rect.left) / rect.width) * 100))
            const y = Math.max(2, Math.min(98, ((moveEvent.clientY - rect.top) / rect.height) * 100))
            onChange({ ...stamp, x, y })
          }
          const end = () => {
            target.removeEventListener("pointermove", move)
            target.removeEventListener("pointerup", end)
            target.removeEventListener("pointercancel", end)
          }
          target.addEventListener("pointermove", move)
          target.addEventListener("pointerup", end)
          target.addEventListener("pointercancel", end)
        }}
      >{symbol.glyph}</button>
    })}
  </div>
}

export function ScienceStampPicker({ group, onGroup, onAdd, customSymbols = [], onCustomSymbols }: {
  group: string
  onGroup: (group: string) => void
  onAdd: (symbolId: string, glyph?: string) => void
  customSymbols?: string[]
  onCustomSymbols?: (symbols: string[]) => void
}) {
  const [query, setQuery] = useState("")
  const [customOpen, setCustomOpen] = useState(false)
  const [customText, setCustomText] = useState("")
  const visible = SCIENCE_STAMPS.filter(symbol => symbol.group === group && (!query || symbol.name.includes(query)))
  return <div className="space-y-2 rounded-xl border border-indigo-200 bg-white p-2 dark:border-indigo-900 dark:bg-gray-950">
    <div className="flex gap-1.5 overflow-x-auto pb-1 snap-x">
      {SCIENCE_STAMP_GROUPS.map(item => <button key={item.id} type="button" onClick={() => onGroup(item.id)} className={`shrink-0 snap-start rounded-full border px-3 py-1.5 text-xs font-bold ${group === item.id ? "bg-indigo-600 text-white border-indigo-600" : "bg-white dark:bg-gray-900 border-gray-300"}`}>{item.name}</button>)}
      <button type="button" onClick={() => setCustomOpen(value => !value)} className="shrink-0 rounded-full border border-dashed border-indigo-500 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 dark:bg-indigo-950">＋ رموز أخرى</button>
    </div>
    {customOpen && <div className="space-y-2 rounded-lg border border-indigo-200 bg-indigo-50 p-2 dark:bg-indigo-950/30">
      <label className="block text-xs font-bold">الصق الرموز أو النصوص القصيرة — كل رمز أو نص في سطر منفصل</label>
      <textarea value={customText} onChange={event => setCustomText(event.target.value)} placeholder={"🧿\nH₂O\nE=mc²\n★"} className="min-h-28 w-full rounded-lg border bg-white p-3 text-base dark:bg-gray-900" maxLength={1000} />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setCustomOpen(false)} className="rounded-lg border bg-white px-3 py-2 text-xs dark:bg-gray-900">إغلاق</button>
        <button type="button" onClick={() => {
          const additions = customText.split(/\n+/).map(value => value.trim()).filter(value => value && value.length <= 12)
          onCustomSymbols?.([...new Set([...customSymbols, ...additions])].slice(0, 50))
          setCustomText("")
          setCustomOpen(false)
        }} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white">حفظ في رموزي</button>
      </div>
    </div>}
    <input value={query} onChange={e => setQuery(e.target.value)} placeholder="ابحث عن رمز…" className="w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm" />
    <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
      {visible.map(symbol => <button key={symbol.id} type="button" onClick={() => onAdd(symbol.id)} title={symbol.name} className="min-h-11 rounded-lg border border-gray-200 bg-gray-50 text-2xl hover:border-indigo-500 hover:bg-indigo-50 active:scale-95 dark:bg-gray-900">{symbol.glyph}<span className="block truncate px-0.5 text-[8px] text-gray-500">{symbol.name}</span></button>)}
    </div>
    {customSymbols.length > 0 && <div><p className="mb-1 text-xs font-bold">رموزي</p><div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">{customSymbols.map((glyph, index) => <button key={`${glyph}-${index}`} type="button" onClick={() => onAdd(`custom-${index}`, glyph)} className="min-h-11 overflow-hidden rounded-lg border border-indigo-200 bg-indigo-50 px-1 text-xl active:scale-95 dark:bg-indigo-950">{glyph}</button>)}</div></div>}
  </div>
}
