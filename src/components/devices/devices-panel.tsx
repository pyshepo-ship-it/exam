"use client"

/**
 * لوحة الأجهزة داخل «طلبات الطلاب»:
 *  • الأجهزة المحظورة: رفع الحظر بضغطة.
 *  • كل الأجهزة التي زارت الموقع: من صاحبها (إن دخل بحسابه يوماً)، آخر ظهور،
 *    عدد الزيارات، وآخر اسم استعمله كزائر — مع حظر مباشر من هنا.
 */

import { useCallback, useEffect, useState } from "react"
import {
  Ban,
  Laptop,
  Loader2,
  RefreshCw,
  ShieldCheck,
  UserCheck,
  UserX,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import toast from "react-hot-toast"
import {
  fetchDeviceBans,
  fetchDevices,
  unbanDevice,
  type DeviceBanRow,
  type DeviceRow,
} from "@/lib/supabase/sync"
import { BanDeviceButton } from "@/components/devices/device-actions"

const fmt = (iso?: string) =>
  iso ? new Date(iso).toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" }) : "—"

export function DevicesPanel({ gradeName }: { gradeName?: (gradeId?: string) => string }) {
  const [devices, setDevices] = useState<DeviceRow[]>([])
  const [bans, setBans] = useState<DeviceBanRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [d, b] = await Promise.all([fetchDevices(), fetchDeviceBans()])
    setDevices(d)
    setBans(b)
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const lift = async (banId: string) => {
    setBusyId(banId)
    const res = await unbanDevice(banId)
    setBusyId(null)
    if (!res.ok) {
      toast.error(res.error || "تعذر رفع الحظر")
      return
    }
    toast.success("تم رفع الحظر — يستطيع الجهاز فتح الموقع الآن")
    void load()
  }

  const term = search.trim()
  const visible = term
    ? devices.filter(d =>
        [d.studentName, d.lastGuestName, d.phone, d.card].some(v => (v || "").includes(term))
      )
    : devices

  const known = devices.filter(d => d.studentId).length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">الأجهزة والحظر</h2>
          <p className="text-sm text-gray-500">
            كل جهاز يفتح الموقع يُسجَّل ببطاقة عشوائية وبصمة عتاد. حين يسجّل طالب دخوله من الجهاز
            يُربط به، فتُعرف مشاركاته المجهولة بعدها.
          </p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading} className="shrink-0">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span>تحديث</span>
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card className="bg-white dark:bg-gray-900">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">أجهزة زارت الموقع</p>
            <p className="text-2xl font-black text-indigo-600">{devices.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-900">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">معروف صاحبها</p>
            <p className="text-2xl font-black text-emerald-600">{known}</p>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-900">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">أجهزة محظورة</p>
            <p className="text-2xl font-black text-red-600">{bans.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* ===== المحظورون ===== */}
      <Card className="bg-white dark:bg-gray-900 border-red-200 dark:border-red-900">
        <CardContent className="p-4 space-y-3">
          <h3 className="flex items-center gap-2 font-bold text-red-700 dark:text-red-300">
            <Ban className="h-5 w-5" />
            الأجهزة المحظورة ({bans.length})
          </h3>
          {bans.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-400">لا توجد أجهزة محظورة</p>
          ) : (
            bans.map(ban => (
              <div
                key={ban.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 dark:border-red-900 bg-red-50/60 dark:bg-red-950/20 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="font-bold text-sm text-gray-900 dark:text-white">
                    {ban.label || "جهاز بلا اسم مسجَّل"}
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-300">السبب: {ban.reason || "—"}</p>
                  <p className="text-[11px] text-gray-400">
                    مُنذ {fmt(ban.createdAt)}
                    {ban.card && <span dir="ltr" className="mr-2 font-mono">…{ban.card.slice(-8)}</span>}
                    {ban.fpHash && <span className="mr-2">+ بصمة عتاد</span>}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyId === ban.id}
                  onClick={() => lift(ban.id)}
                  className="border-emerald-400 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300"
                >
                  {busyId === ban.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  <span>رفع الحظر</span>
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* ===== كل الأجهزة ===== */}
      <Card className="bg-white dark:bg-gray-900">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 font-bold text-gray-900 dark:text-white">
              <Laptop className="h-5 w-5 text-indigo-600" />
              الأجهزة الزائرة
            </h3>
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="بحث بالاسم أو الرقم"
              className="h-9 w-full sm:w-64"
            />
          </div>

          {loading ? (
            <div className="flex justify-center py-8 text-gray-400">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : visible.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">
              لا توجد أجهزة مسجَّلة بعد — تُسجَّل تلقائياً مع أول زيارة بعد تشغيل ترحيل 027
            </p>
          ) : (
            <div className="space-y-2">
              {visible.map(device => (
                <div
                  key={device.card}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/60 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-bold text-sm text-gray-900 dark:text-white">
                      {device.studentName ? (
                        <>
                          <UserCheck className="h-4 w-4 text-emerald-600" />
                          {device.studentName}
                          {gradeName && device.gradeId && (
                            <span className="text-xs font-normal text-gray-500">{gradeName(device.gradeId)}</span>
                          )}
                        </>
                      ) : (
                        <>
                          <UserX className="h-4 w-4 text-gray-400" />
                          جهاز غير معروف صاحبه
                        </>
                      )}
                      {device.banned && <Badge className="bg-red-500 text-white text-[10px]">محظور</Badge>}
                    </p>
                    <p className="text-xs text-gray-500">
                      {device.phone && <span dir="ltr" className="font-mono">{device.phone}</span>}
                      {device.lastGuestName && <span className="mr-2">آخر اسم كزائر: {device.lastGuestName}</span>}
                    </p>
                    <p className="text-[11px] text-gray-400">
                      آخر ظهور {fmt(device.lastSeen)} • {device.visits} زيارة
                      <span dir="ltr" className="mr-2 font-mono">…{device.card.slice(-8)}</span>
                    </p>
                  </div>
                  {!device.banned && (
                    <BanDeviceButton
                      card={device.card}
                      fpHash={device.fpHash}
                      label={device.studentName || device.lastGuestName || "جهاز زائر"}
                      onChanged={load}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
