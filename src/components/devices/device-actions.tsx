"use client"

/**
 * زر «حظر هذا الجهاز» + شارة «غالباً هذا الطالب».
 * يظهر بجانب أي مشاركة يمكن ربطها بجهاز: رد استبيان، محاولة اختبار، استفسار.
 *
 * الحظر يتم بالبطاقة والبصمة معاً؛ فمسح الطالب لتخزين متصفحه لا يرفع الحظر
 * لأن البصمة تُحسب من عتاد الجهاز نفسه في كل مرة.
 */

import { useEffect, useState } from "react"
import { Ban, Loader2, ShieldCheck, UserSearch } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import toast from "react-hot-toast"
import { banDevice, identifyDevice, type DeviceOwnerHint } from "@/lib/supabase/sync"

interface DeviceActionsProps {
  card?: string | null
  fpHash?: string | null
  /** وصف المشاركة يظهر في سجل الحظر: «رد استبيان س١» مثلاً */
  label?: string
  /** اسم كتبه الزائر بنفسه (لعرضه في التأكيد) */
  writtenName?: string
  onChanged?: () => void
}

export function DeviceOwnerBadge({ card, fpHash, writtenName }: DeviceActionsProps) {
  const [hint, setHint] = useState<DeviceOwnerHint | null>(null)

  useEffect(() => {
    let alive = true
    if (!card && !fpHash) return
    void identifyDevice(card || undefined, fpHash || undefined).then(result => {
      if (alive) setHint(result)
    })
    return () => { alive = false }
  }, [card, fpHash])

  if (!hint || hint.match === "none" || !hint.name) return null

  // اسم الطالب المعروف يطابق ما كتبه ⇒ لا داعي للتنبيه
  const sameName = !!writtenName && writtenName.trim() === (hint.name || "").trim()
  if (sameName) return null

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5 rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/30 px-2.5 py-1.5 text-[11px] text-purple-800 dark:text-purple-200">
      <UserSearch className="h-3.5 w-3.5 shrink-0" />
      <span className="font-extrabold">
        {hint.confidence === "high" ? "هذا الجهاز لـ" : "غالباً جهاز"}: {hint.name}
      </span>
      {hint.phone && <span dir="ltr" className="font-mono">{hint.phone}</span>}
      <span className="opacity-70">
        {hint.confidence === "high" ? "(مطابقة مؤكدة ببطاقة الجهاز)" : "(مطابقة ببصمة العتاد)"}
      </span>
    </div>
  )
}

export function BanDeviceButton({ card, fpHash, label, writtenName, onChanged }: DeviceActionsProps) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)

  if (!card && !fpHash) {
    return (
      <span className="text-[11px] text-gray-400" title="هذه المشاركة أُرسلت قبل تفعيل تعريف الأجهزة">
        بلا بيانات جهاز
      </span>
    )
  }

  const submit = async () => {
    setBusy(true)
    const res = await banDevice({
      card: card || undefined,
      fpHash: fpHash || undefined,
      reason: reason.trim() || "تصرف مسيء",
      label: [label, writtenName].filter(Boolean).join(" — "),
    })
    setBusy(false)
    if (!res.ok) {
      toast.error(res.error || "تعذر حظر الجهاز")
      return
    }
    toast.success("تم إيقاف هذا الجهاز — لن يستطيع فتح الموقع حتى ترفع الحظر", { duration: 6000 })
    setOpen(false)
    setReason("")
    onChanged?.()
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        className="h-7 border-red-300 px-2 text-[11px] text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
        title="إيقاف جهاز صاحب هذه المشاركة عن الموقع"
      >
        <Ban className="h-3.5 w-3.5" />
        <span>حظر الجهاز</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Ban className="h-5 w-5" />
              حظر جهاز
            </DialogTitle>
            <DialogDescription className="text-right leading-relaxed">
              سيُمنع هذا الجهاز من فتح الموقع كله: لا اختبارات ولا استبيانات ولا استفسارات، حتى لو غيّر
              اسمه أو مسح بيانات المتصفح — لأن الحظر يشمل بصمة العتاد أيضاً.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {label && (
              <p className="rounded-lg bg-gray-50 dark:bg-gray-800/60 px-3 py-2 text-xs text-gray-600 dark:text-gray-300">
                المشاركة: {label}
              </p>
            )}
            <div>
              <Label>سبب الحظر (يظهر لك في قائمة المحظورين)</Label>
              <Input
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="مثال: كتابة عبارة مسيئة في الاستبيان"
                className="mt-1"
              />
            </div>
            <p className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs font-bold text-amber-700 dark:text-amber-300">
              تنبيه: لو كان جهازاً مشتركاً في البيت فسيُمنع إخوته أيضاً. ترفع الحظر متى شئت من
              «طلبات الطلاب ← الأجهزة المحظورة».
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>تراجع</Button>
            <Button onClick={submit} disabled={busy} className="bg-red-600 text-white hover:bg-red-700">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              <span>تأكيد الحظر</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
