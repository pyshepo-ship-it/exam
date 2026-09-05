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
  resolveOrnamentOpacity,
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

/**
 * أماكن زخارف السؤال — كلها في الحواف والزوايا الخارجية فقط،
 * بعيداً عن رأس السؤال ونص الإجابة وخطوط النقاط، حتى لا تغطي أي كلام.
 */
const QUESTION_LAYOUT: Record<OrnamentDensity, OrnamentSlot[]> = {
  low: [
    { cls: "bottom-0.5 left-1.5", scale: 0.85 },
    { cls: "bottom-0.5 right-1.5", scale: 0.8 },
  ],
  medium: [
    { cls: "bottom-0.5 left-1.5", scale: 0.9 },
    { cls: "bottom-0.5 right-1.5", scale: 0.85 },
    { cls: "top-1/2 -translate-y-1/2 left-0.5", scale: 0.7 },
    { cls: "top-1/2 -translate-y-1/2 right-0.5", scale: 0.7 },
  ],
  high: [
    { cls: "bottom-0.5 left-1.5", scale: 0.95 },
    { cls: "bottom-0.5 right-1.5", scale: 0.9 },
    { cls: "top-1/3 left-0.5", scale: 0.75 },
    { cls: "top-2/3 right-0.5", scale: 0.75 },
    { cls: "top-1/2 -translate-y-1/2 left-0.5", scale: 0.7 },
    { cls: "top-1/2 -translate-y-1/2 right-0.5", scale: 0.7 },
  ],
}

/**
 * زخارف علمية ملوّنة حول كتلة السؤال — تتغير حسب الصف
 * - شفافة دائماً (خلفية خفيفة) ولا تتقدم على النص أبداً (z-0 خلف المحتوى z-10)
 * - الحجم والكثافة والشفافية قابلة للتحكم من المحرر ومن المعاينة
 * - تُوضع في الحواف والزوايا فقط بعيداً عن رأس السؤال ودرجته ونص الإجابة
 */
export function QuestionOrnaments({
  gradeName,
  index = 0,
  size = 24,
  density = "low",
  opacity,
}: {
  gradeName: string
  index?: number
  size?: number
  density?: OrnamentDensity
  /** شفافية صريحة (0..1) — وإلا تُحسب من الكثافة */
  opacity?: number
}) {
  const set = getOrnamentsForGrade(gradeName)
  if (set.length === 0) return null
  const layout = QUESTION_LAYOUT[density]
  const effOpacity = resolveOrnamentOpacity(opacity, density, "question")

  return (
    <div
      className="exam-ornaments pointer-events-none absolute inset-0 overflow-hidden"
      style={{ opacity: effOpacity, zIndex: 0 }}
      aria-hidden
    >
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

/** زوايا الصفحة: أطراف الورقة فقط — لا تقترب من رأس الصفحة أو الأسئلة */
const PAGE_LAYOUT: Record<OrnamentDensity, OrnamentSlot[]> = {
  low: [
    { cls: "top-1.5 right-1.5", scale: 1 },
    { cls: "top-1.5 left-1.5", scale: 1 },
  ],
  medium: [
    { cls: "top-1.5 right-1.5", scale: 1 },
    { cls: "top-1.5 left-1.5", scale: 1 },
    { cls: "bottom-1.5 right-1.5", scale: 1 },
    { cls: "bottom-1.5 left-1.5", scale: 1 },
  ],
  high: [
    { cls: "top-1.5 right-1.5", scale: 1 },
    { cls: "top-1.5 left-1.5", scale: 1 },
    { cls: "bottom-1.5 right-1.5", scale: 1 },
    { cls: "bottom-1.5 left-1.5", scale: 1 },
    { cls: "top-1/2 right-0.5 -translate-y-1/2", scale: 0.8 },
    { cls: "top-1/2 left-0.5 -translate-y-1/2", scale: 0.8 },
  ],
}

/** إطار زخرفي لصفحة الامتحان (زوايا الصفحة) — شفاف وخلف المحتوى دائماً */
export function PaperCornerOrnaments({
  gradeName,
  size = 32,
  density = "medium",
  opacity,
}: {
  gradeName: string
  size?: number
  density?: OrnamentDensity
  opacity?: number
}) {
  const set = getOrnamentsForGrade(gradeName)
  if (set.length === 0) return null
  const layout = PAGE_LAYOUT[density]
  const effOpacity = resolveOrnamentOpacity(opacity, density, "page")

  return (
    <div
      className="exam-ornaments pointer-events-none absolute inset-0 overflow-hidden"
      style={{ opacity: effOpacity, zIndex: 0 }}
      aria-hidden
    >
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
