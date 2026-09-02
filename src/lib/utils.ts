import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * تنسيق الوقت من صيغة 24 ساعة (HH:mm) إلى 12 ساعة بالعربية (مثال: 16:00 -> 4:00 م)
 */
export function formatTime12(time24: string): string {
  if (!time24) return ""
  const parts = time24.split(":")
  if (parts.length < 2) return time24
  let hours = parseInt(parts[0], 10)
  const minutes = parts[1]
  if (isNaN(hours)) return time24
  const period = hours >= 12 ? "م" : "ص"
  hours = hours % 12
  if (hours === 0) hours = 12
  return `${hours}:${minutes} ${period}`
}

/**
 * إضافة مدة زمنية بالدقائق إلى وقت بصيغة 24 ساعة
 */
export function addDuration(time24: string, minutesToAdd: number): string {
  if (!time24 || !time24.includes(":")) return "18:00"
  const [hStr, mStr] = time24.split(":")
  let h = parseInt(hStr, 10)
  let m = parseInt(mStr, 10)
  if (isNaN(h)) h = 16
  if (isNaN(m)) m = 0
  const totalMinutes = (h * 60 + m + minutesToAdd) % (24 * 60)
  const newH = Math.floor(totalMinutes / 60)
  const newM = totalMinutes % 60
  return `${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}`
}
