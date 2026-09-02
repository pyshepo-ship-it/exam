"use client"

import React from "react"
import { Clock } from "lucide-react"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { formatTime12 } from "@/lib/utils"

interface TimePickerProps {
  label: string
  value: string // "HH:mm" (24h)
  onChange: (val: string) => void
  required?: boolean
  className?: string
}

const HOURS = [
  { value: "1", label: "الساعة 1" },
  { value: "2", label: "الساعة 2" },
  { value: "3", label: "الساعة 3" },
  { value: "4", label: "الساعة 4" },
  { value: "5", label: "الساعة 5" },
  { value: "6", label: "الساعة 6" },
  { value: "7", label: "الساعة 7" },
  { value: "8", label: "الساعة 8" },
  { value: "9", label: "الساعة 9" },
  { value: "10", label: "الساعة 10" },
  { value: "11", label: "الساعة 11" },
  { value: "12", label: "الساعة 12" },
]

const MINUTES = [
  { value: "00", label: "00 (تمت)" },
  { value: "15", label: "15 (وربع)" },
  { value: "30", label: "30 (ونصف)" },
  { value: "45", label: "45 (إلا ربع)" },
  { value: "05", label: "05" },
  { value: "10", label: "10" },
  { value: "20", label: "20" },
  { value: "25", label: "25" },
  { value: "35", label: "35" },
  { value: "40", label: "40" },
  { value: "50", label: "50" },
  { value: "55", label: "55" },
]

export function parseTime24(time24: string): { hour: string; minute: string; period: "am" | "pm" } {
  if (!time24 || !time24.includes(":")) {
    return { hour: "4", minute: "00", period: "pm" }
  }
  const [hStr, mStr] = time24.split(":")
  let h = parseInt(hStr, 10)
  if (isNaN(h)) h = 16
  const period: "am" | "pm" = h >= 12 ? "pm" : "am"
  let h12 = h % 12
  if (h12 === 0) h12 = 12
  const minute = mStr && mStr.length === 2 ? mStr : "00"
  return { hour: String(h12), minute, period }
}

export function toTime24(hour: string, minute: string, period: "am" | "pm"): string {
  let h = parseInt(hour, 10)
  if (isNaN(h) || h < 1 || h > 12) h = 4
  let h24 = h
  if (period === "pm") {
    h24 = h === 12 ? 12 : h + 12
  } else {
    h24 = h === 12 ? 0 : h
  }
  const m = minute || "00"
  return `${String(h24).padStart(2, "0")}:${m}`
}

export function TimePicker({ label, value, onChange, required, className }: TimePickerProps) {
  const { hour, minute, period } = parseTime24(value)

  const handleHourChange = (newHour: string) => {
    onChange(toTime24(newHour, minute, period))
  }

  const handleMinuteChange = (newMinute: string) => {
    onChange(toTime24(hour, newMinute, period))
  }

  const handlePeriodChange = (newPeriod: "am" | "pm") => {
    onChange(toTime24(hour, minute, newPeriod))
  }

  return (
    <div className={`space-y-1.5 p-3 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700/80 ${className || ""}`}>
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
          <span>{label} {required && "*"}</span>
        </Label>
        <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-900/60">
          {formatTime12(value || toTime24(hour, minute, period))}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-1.5 pt-1">
        {/* 1. الساعة */}
        <div>
          <Label className="text-[10px] text-gray-500 mb-0.5 block">الساعة</Label>
          <Select value={hour} onValueChange={handleHourChange}>
            <SelectTrigger className="h-9 text-xs font-bold bg-white dark:bg-gray-900">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HOURS.map(h => (
                <SelectItem key={h.value} value={h.value} className="text-xs">
                  {h.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 2. الدقيقة (افتراضي 00) */}
        <div>
          <Label className="text-[10px] text-gray-500 mb-0.5 block">الدقيقة</Label>
          <Select value={minute} onValueChange={handleMinuteChange}>
            <SelectTrigger className="h-9 text-xs font-bold bg-white dark:bg-gray-900">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MINUTES.map(m => (
                <SelectItem key={m.value} value={m.value} className="text-xs">
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 3. الفترة (افتراضي مساءً م) */}
        <div>
          <Label className="text-[10px] text-gray-500 mb-0.5 block">الفترة</Label>
          <div className="grid grid-cols-2 gap-1 h-9 p-0.5 bg-gray-200/80 dark:bg-gray-900 rounded-lg border border-gray-300/60 dark:border-gray-700">
            <button
              type="button"
              onClick={() => handlePeriodChange("pm")}
              className={`text-xs font-black rounded transition-all cursor-pointer select-none flex items-center justify-center ${
                period === "pm"
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              م
            </button>
            <button
              type="button"
              onClick={() => handlePeriodChange("am")}
              className={`text-xs font-black rounded transition-all cursor-pointer select-none flex items-center justify-center ${
                period === "am"
                  ? "bg-amber-600 text-white shadow-xs"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              ص
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
