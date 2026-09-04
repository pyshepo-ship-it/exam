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
  Rocket,
  Globe,
  Moon,
  Star,
  BookOpen,
  Pencil,
  GraduationCap,
  Lightbulb,
  Calculator,
  Ruler,
  Compass,
  Sprout,
  Wind,
  Cloud,
  Rainbow,
  Heart,
  Flame,
  Fish,
  Bird,
  type LucideIcon,
} from "lucide-react"
import {
  type OrnamentKind,
  type OrnamentDensity,
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
  rocket: Rocket,
  globe: Globe,
  moon: Moon,
  star: Star,
  book: BookOpen,
  pencil: Pencil,
  graduation: GraduationCap,
  lightbulb: Lightbulb,
  calc: Calculator,
  ruler: Ruler,
  compass: Compass,
  sprout: Sprout,
  wind: Wind,
  cloud: Cloud,
  rainbow: Rainbow,
  heart: Heart,
  flame: Flame,
  fish: Fish,
  bird: Bird,
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

interface OrnamentSlot {
  cls: string
  scale: number
}

const QUESTION_LAYOUT: Record<OrnamentDensity, OrnamentSlot[]> = {
  low: [
    { cls: "bottom-1 left-3", scale: 1 },
    { cls: "top-1 right-3", scale: 0.9 },
  ],
  medium: [
    { cls: "bottom-1.5 left-2.5", scale: 1 },
    { cls: "top-1 left-2.5", scale: 0.9 },
    { cls: "bottom-2 right-3", scale: 0.95 },
    { cls: "top-2 right-3", scale: 0.85 },
  ],
  high: [
    { cls: "bottom-1.5 left-2", scale: 1 },
    { cls: "top-1.5 left-2", scale: 0.9 },
    { cls: "bottom-1.5 right-2", scale: 0.95 },
    { cls: "top-1.5 right-2", scale: 0.9 },
    { cls: "bottom-1.5 left-1/2 -translate-x-1/2", scale: 0.8 },
    { cls: "top-1.5 left-1/2 -translate-x-1/2", scale: 0.8 },
  ],
}

const OPACITY: Record<OrnamentDensity, number> = {
  low: 0.18,
  medium: 0.24,
  high: 0.3,
}

/**
 * زخارف علمية ملوّنة حول كتلة السؤال — تتغير حسب الصف
 * - الحجم والكثافة قابلان للتحكم (size = الحجم المبدئي بالبكسل)
 * - تُوضع في الحواف والزوايا بعيداً عن رأس السؤال ودرجته ونص الإجابة
 *   (خلف المحتوى عبر z-10 و pointer-events-none) حتى لا تغطي أي كلام
 */
export function QuestionOrnaments({
  gradeName,
  index = 0,
  size = 24,
  density = "low",
}: {
  gradeName: string
  index?: number
  size?: number
  density?: OrnamentDensity
}) {
  const set = getOrnamentsForGrade(gradeName)
  if (set.length === 0) return null
  const layout = QUESTION_LAYOUT[density]
  const opacity = OPACITY[density]

  return (
    <div className="exam-ornaments pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {layout.map((slot, i) => {
        const kind = set[(index + i * 2) % set.length]
        return (
          <ScienceIcon
            key={i}
            kind={kind}
            size={Math.round(size * slot.scale)}
            className={`absolute ${slot.cls}`}
            color={ORNAMENT_COLORS[kind]}
          />
        )
      })}
    </div>
  )
}

const PAGE_LAYOUT: Record<OrnamentDensity, OrnamentSlot[]> = {
  low: [
    { cls: "top-2.5 right-2.5", scale: 1 },
    { cls: "top-2.5 left-2.5", scale: 1 },
  ],
  medium: [
    { cls: "top-3 right-3", scale: 1 },
    { cls: "top-3 left-3", scale: 1 },
    { cls: "bottom-3 right-3", scale: 1 },
    { cls: "bottom-3 left-3", scale: 1 },
  ],
  high: [
    { cls: "top-3 right-3", scale: 1 },
    { cls: "top-3 left-3", scale: 1 },
    { cls: "bottom-3 right-3", scale: 1 },
    { cls: "bottom-3 left-3", scale: 1 },
    { cls: "top-1/2 right-2 -translate-y-1/2", scale: 0.8 },
    { cls: "top-1/2 left-2 -translate-y-1/2", scale: 0.8 },
  ],
}

const PAGE_OPACITY: Record<OrnamentDensity, number> = {
  low: 0.3,
  medium: 0.4,
  high: 0.5,
}

/** إطار زخرفي لصفحة الامتحان (زوايا الصفحة) */
export function PaperCornerOrnaments({
  gradeName,
  size = 32,
  density = "medium",
}: {
  gradeName: string
  size?: number
  density?: OrnamentDensity
}) {
  const set = getOrnamentsForGrade(gradeName)
  if (set.length === 0) return null
  const layout = PAGE_LAYOUT[density]
  const opacity = PAGE_OPACITY[density]

  return (
    <div className="exam-ornaments pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {layout.map((slot, i) => {
        const kind = set[i % set.length]
        return (
          <ScienceIcon
            key={i}
            kind={kind}
            size={Math.round(size * slot.scale)}
            className={`absolute ${slot.cls}`}
          />
        )
      })}
    </div>
  )
}
