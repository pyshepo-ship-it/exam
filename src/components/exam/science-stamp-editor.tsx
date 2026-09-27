"use client"

import React, { useState } from "react"
import { SCIENCE_STAMPS, SCIENCE_STAMP_GROUPS, type PlacedScienceStamp } from "@/lib/science-stamps"

export function ScienceStampLayer({ stamps, page, editable, onChange, onSelect, selectedId }: {
  stamps: PlacedScienceStamp[]
  page: number
  editable?: boolean
  onChange?: (stamp: PlacedScienceStamp) => void
  onSelect?: (id: string) => void
  selectedId?: string | null
}) {
  const byId = new Map(SCIENCE_STAMPS.map(symbol => [symbol.id, symbol]))
  return <div className="absolute inset-0 z-20 pointer-events-none overflow-hidden rounded-[inherit]" aria-hidden={!editable}>
    {stamps.filter(stamp => stamp.page === page).map(stamp => {
      const symbol = byId.get(stamp.symbolId)
      if (!symbol) return null
      return <button
        key={stamp.id}
        type="button"
        title={editable ? `${symbol.name} — اسحب لتحريك الرمز` : symbol.name}
        className={`absolute -translate-x-1/2 -translate-y-1/2 select-none touch-none leading-none bg-transparent border-0 p-1 ${editable ? "pointer-events-auto cursor-move" : "pointer-events-none"} ${selectedId === stamp.id ? "outline-2 outline-dashed outline-indigo-500 rounded" : ""}`}
        style={{ left: `${stamp.x}%`, top: `${stamp.y}%`, fontSize: stamp.size, opacity: stamp.opacity, transform: `translate(-50%,-50%) rotate(${stamp.rotation}deg)` }}
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

export function ScienceStampPicker({ group, onGroup, onAdd }: {
  group: string
  onGroup: (group: string) => void
  onAdd: (symbolId: string) => void
}) {
  const [query, setQuery] = useState("")
  const visible = SCIENCE_STAMPS.filter(symbol => symbol.group === group && (!query || symbol.name.includes(query)))
  return <div className="space-y-2 rounded-xl border border-indigo-200 bg-white p-2 dark:border-indigo-900 dark:bg-gray-950">
    <div className="flex gap-1.5 overflow-x-auto pb-1 snap-x">
      {SCIENCE_STAMP_GROUPS.map(item => <button key={item.id} type="button" onClick={() => onGroup(item.id)} className={`shrink-0 snap-start rounded-full border px-3 py-1.5 text-xs font-bold ${group === item.id ? "bg-indigo-600 text-white border-indigo-600" : "bg-white dark:bg-gray-900 border-gray-300"}`}>{item.name}</button>)}
    </div>
    <input value={query} onChange={e => setQuery(e.target.value)} placeholder="ابحث عن رمز…" className="w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm" />
    <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
      {visible.map(symbol => <button key={symbol.id} type="button" onClick={() => onAdd(symbol.id)} title={symbol.name} className="min-h-11 rounded-lg border border-gray-200 bg-gray-50 text-2xl hover:border-indigo-500 hover:bg-indigo-50 active:scale-95 dark:bg-gray-900">{symbol.glyph}<span className="block truncate px-0.5 text-[8px] text-gray-500">{symbol.name}</span></button>)}
    </div>
  </div>
}
