"use client"

import React from "react"
import {
  Microscope,
  FlaskConical,
  Atom,
  Leaf,
  Sun,
  Orbit,
  Magnet,
  Droplets,
  Zap,
  Sparkles,
  Thermometer,
  Brain,
  Bug,
  type LucideIcon,
} from "lucide-react"
import {
  type OrnamentKind,
  ORNAMENT_COLORS,
  getOrnamentsForGrade,
} from "@/lib/exam-templates"

const ICONS: Record<OrnamentKind, LucideIcon> = {
  microscope: Microscope,
  flask: FlaskConical,
  testTube: FlaskConical,
  atom: Atom,
  dna: Atom,
  leaf: Leaf,
  sun: Sun,
  planet: Orbit,
  magnet: Magnet,
  droplet: Droplets,
  zap: Zap,
  flower: Sparkles,
  thermometer: Thermometer,
  brain: Brain,
  bug: Bug,
}

export function ScienceIcon({
  kind,
  className,
  color,
  size = 22,
}: {
  kind: OrnamentKind
  className?: string
  color?: string
  size?: number
}) {
  const Icon = ICONS[kind] || Microscope
  return (
    <Icon
      className={className}
      size={size}
      style={{ color: color || ORNAMENT_COLORS[kind] }}
      strokeWidth={1.75}
    />
  )
}

/**
 * زخارف علمية ملوّنة حول كتلة السؤال — تتغير حسب الصف
 * (ميكروسكوب / دورق / ذرة / نبات / شمس ...)
 */
export function QuestionOrnaments({
  gradeName,
  index = 0,
}: {
  gradeName: string
  index?: number
}) {
  const set = getOrnamentsForGrade(gradeName)
  const a = set[index % set.length]
  const b = set[(index + 2) % set.length]
  const c = set[(index + 4) % set.length]

  return (
    <div className="exam-ornaments pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <ScienceIcon
        kind={a}
        size={28}
        className="absolute top-2 left-3 opacity-40"
      />
      <ScienceIcon
        kind={b}
        size={22}
        className="absolute bottom-2 right-3 opacity-35"
      />
      <ScienceIcon
        kind={c}
        size={18}
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-10"
      />
    </div>
  )
}

/** إطار زخرفي لصفحة الامتحان (زوايا) */
export function PaperCornerOrnaments({ gradeName }: { gradeName: string }) {
  const set = getOrnamentsForGrade(gradeName)
  return (
    <div className="exam-ornaments pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <ScienceIcon kind={set[0]} size={36} className="absolute top-3 right-3 opacity-50" />
      <ScienceIcon kind={set[1]} size={32} className="absolute top-3 left-3 opacity-45" />
      <ScienceIcon kind={set[2]} size={30} className="absolute bottom-3 right-4 opacity-40" />
      <ScienceIcon kind={set[3]} size={28} className="absolute bottom-3 left-4 opacity-40" />
    </div>
  )
}
