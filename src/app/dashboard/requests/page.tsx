"use client"

import React, { useState, useEffect } from "react"
import { motion } from "framer-motion"
import {
  UserPlus,
  ArrowLeftRight,
  CheckCircle,
  XCircle,
  Clock,
  Phone,
  Mail,
  Users,
  BookOpen,
  Link2,
  Sparkles,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
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
import {
  Grade,
  Student,
  RegistrationRequest,
  GroupTransferRequest,
  getGrades,
  getStudents,
  getRegistrationRequests,
  getGroupTransferRequests,
} from "@/lib/data-storage"
import {
  approveRegistrationRequest,
  rejectRegistrationRequest,
  approveGroupTransferRequest,
  rejectGroupTransferRequest,
  findMatchingStudent,
} from "@/lib/student-accounts"

type TabKey = "registrations" | "transfers"

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  pending: { label: "قيد المراجعة", className: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300" },
  approved: { label: "مقبول ✓", className: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
  rejected: { label: "مرفوض", className: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
}

export default function RequestsPage() {
  const [tab, setTab] = useState<TabKey>("registrations")
  const [grades, setGrades] = useState<Grade[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [regRequests, setRegRequests] = useState<RegistrationRequest[]>([])
  const [transferRequests, setTransferRequests] = useState<GroupTransferRequest[]>([])
  const [rejectTarget, setRejectTarget] = useState<{ kind: "reg" | "transfer"; id: string; name: string } | null>(null)
  const [rejectNote, setRejectNote] = useState("")

  const refresh = () => {
    setGrades(getGrades())
    setStudents(getStudents())
    setRegRequests(getRegistrationRequests())
    setTransferRequests(getGroupTransferRequests())
  }

  useEffect(() => {
    refresh()
  }, [])

  const gradeName = (id: string) => grades.find(g => g.id === id)?.name || "غير محدد"
  const groupName = (id: string) => {
    for (const g of grades) {
      const found = g.groups.find(x => x.id === id)
      if (found) return `${g.name} — ${found.name}`
    }
    return "غير محدد"
  }

  const sortedReg = [...regRequests].sort((a, b) => {
    if (a.status === "pending" && b.status !== "pending") return -1
    if (b.status === "pending" && a.status !== "pending") return 1
    return (b.createdAt || "").localeCompare(a.createdAt || "")
  })
  const sortedTransfers = [...transferRequests].sort((a, b) => {
    if (a.status === "pending" && b.status !== "pending") return -1
    if (b.status === "pending" && a.status !== "pending") return 1
    return (b.createdAt || "").localeCompare(a.createdAt || "")
  })

  const pendingRegs = regRequests.filter(r => r.status === "pending").length
  const pendingTransfers = transferRequests.filter(r => r.status === "pending").length

  const handleApproveReg = (r: RegistrationRequest) => {
    const res = approveRegistrationRequest(r.id)
    if (res.ok) {
      toast.success(res.message, { duration: 6000 })
      refresh()
    } else {
      toast.error(res.message)
    }
  }

  const handleRejectReg = (r: RegistrationRequest, note: string) => {
    const res = rejectRegistrationRequest(r.id, note)
    if (res.ok) {
      toast.success(res.message)
      refresh()
    } else {
      toast.error(res.message)
    }
  }

  const handleApproveTransfer = (t: GroupTransferRequest) => {
    const res = approveGroupTransferRequest(t.id)
    if (res.ok) {
      toast.success(res.message, { duration: 6000 })
      refresh()
    } else {
      toast.error(res.message)
    }
  }

  const handleRejectTransfer = (t: GroupTransferRequest, note: string) => {
    const res = rejectGroupTransferRequest(t.id, note)
    if (res.ok) {
      toast.success(res.message)
      refresh()
    } else {
      toast.error(res.message)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">طلبات الطلاب</h1>
        <p className="text-gray-500 dark:text-gray-400">
          طلبات التسجيل الجديد وطلبات الانضمام لمجموعات أخرى — لا يستطيع الطالب الدخول أو النقل إلا بعد موافقتك
        </p>
      </motion.div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {([
          { key: "registrations" as TabKey, label: "طلبات التسجيل", icon: UserPlus, count: pendingRegs, color: "from-indigo-500 to-purple-600" },
          { key: "transfers" as TabKey, label: "طلبات نقل المجموعة", icon: ArrowLeftRight, count: pendingTransfers, color: "from-emerald-500 to-teal-600" },
        ]).map(({ key, label, icon: Icon, count, color }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl font-medium transition-all ${
              tab === key
                ? `bg-gradient-to-r ${color} text-white shadow-lg`
                : "bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
          >
            <Icon className="w-5 h-5" />
            {label}
            {count > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold rounded-full min-w-[22px] h-[22px] px-1.5 flex items-center justify-center">
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ============ طلبات التسجيل ============ */}
      {tab === "registrations" && (
        <div className="space-y-4">
          {sortedReg.length === 0 ? (
            <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
              <CardContent className="py-12 text-center">
                <UserPlus className="w-14 h-14 mx-auto mb-3 text-gray-300 dark:text-gray-700" />
                <p className="text-gray-500 dark:text-gray-400">لا توجد طلبات تسجيل بعد</p>
                <p className="text-xs text-gray-400 mt-1">تظهر هنا طلبات الطلاب من صفحة /student/register</p>
              </CardContent>
            </Card>
          ) : (
            sortedReg.map(r => {
              const match = r.status === "pending" ? findMatchingStudent(r) : undefined
              const badge = STATUS_BADGE[r.status] || STATUS_BADGE.pending
              return (
                <Card key={r.id} className={`bg-white dark:bg-gray-900 border ${r.status === "pending" ? "border-amber-300 dark:border-amber-800" : "border-gray-200 dark:border-gray-800"}`}>
                  <CardContent className="p-5">
                    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                      <div className="flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-bold text-lg text-gray-900 dark:text-white">{r.name}</h3>
                          <Badge className={badge.className}>{badge.label}</Badge>
                          <span className="text-xs text-gray-400">
                            {new Date(r.createdAt).toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" })}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-gray-600 dark:text-gray-300">
                          <span className="flex items-center gap-1.5"><Phone className="w-4 h-4 text-indigo-500" /><span dir="ltr">{r.phone}</span></span>
                          <span className="flex items-center gap-1.5"><Mail className="w-4 h-4 text-indigo-500" /><span dir="ltr">{r.email}</span></span>
                          <span className="flex items-center gap-1.5"><BookOpen className="w-4 h-4 text-purple-500" />{gradeName(r.gradeId)}</span>
                          <span className="flex items-center gap-1.5"><Users className="w-4 h-4 text-emerald-500" />{groupName(r.groupId)}</span>
                        </div>

                        {/* معاينة الربط قبل الموافقة */}
                        {r.status === "pending" && (
                          match ? (
                            <div className="rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3 text-sm">
                              <p className="font-bold text-blue-800 dark:text-blue-300 flex items-center gap-1.5">
                                <Link2 className="w-4 h-4" />
                                يبدو مطابقاً للطالب المسجل: «{match.name}» {match.phone ? `(هاتفه: ${match.phone})` : ""}
                              </p>
                              <p className="text-xs text-blue-700/80 dark:text-blue-400/80 mt-1">
                                عند الموافقة: ستُحدَّث بياناته اليدوية ببيانات الطلب (الاسم/الهاتف/البريد) ويُنقل إلى المجموعة المطلوبة إن اختلف — ويُسجَّل ذلك في سجله.
                              </p>
                            </div>
                          ) : (
                            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-3 text-sm">
                              <p className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                                <Sparkles className="w-4 h-4" />
                                لا توجد بيانات سابقة مطابقة
                              </p>
                              <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80 mt-1">
                                عند الموافقة: سيُنشأ الطالب فوراً على مجموعته المطلوبة ويصبح تسجيل الدخول ممكناً.
                              </p>
                            </div>
                          )
                        )}
                        {r.status !== "pending" && r.reviewNote && (
                          <p className="text-xs text-gray-500">سبب القرار: {r.reviewNote}</p>
                        )}
                        {r.status === "approved" && (
                          <p className="text-xs text-green-600">
                            ✓ مربوط بالطالب: {students.find(s => s.id === r.linkedStudentId)?.name || "—"}
                          </p>
                        )}
                      </div>

                      {r.status === "pending" && (
                        <div className="flex lg:flex-col gap-2 shrink-0">
                          <Button
                            onClick={() => handleApproveReg(r)}
                            className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white"
                          >
                            <CheckCircle className="w-4 h-4" />
                            <span>موافقة وربط</span>
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => {
                              setRejectTarget({ kind: "reg", id: r.id, name: r.name })
                              setRejectNote("")
                            }}
                            className="border-red-400 text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                          >
                            <XCircle className="w-4 h-4" />
                            <span>رفض</span>
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })
          )}
        </div>
      )}

      {/* ============ طلبات نقل المجموعة ============ */}
      {tab === "transfers" && (
        <div className="space-y-4">
          {sortedTransfers.length === 0 ? (
            <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
              <CardContent className="py-12 text-center">
                <ArrowLeftRight className="w-14 h-14 mx-auto mb-3 text-gray-300 dark:text-gray-700" />
                <p className="text-gray-500 dark:text-gray-400">لا توجد طلبات نقل بعد</p>
                <p className="text-xs text-gray-400 mt-1">يطلب الطالب النقل من بوابته (صفحة الطالب) وينتظر موافقتك</p>
              </CardContent>
            </Card>
          ) : (
            sortedTransfers.map(t => {
              const badge = STATUS_BADGE[t.status] || STATUS_BADGE.pending
              return (
                <Card key={t.id} className={`bg-white dark:bg-gray-900 border ${t.status === "pending" ? "border-amber-300 dark:border-amber-800" : "border-gray-200 dark:border-gray-800"}`}>
                  <CardContent className="p-5">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-bold text-lg text-gray-900 dark:text-white">{t.studentName}</h3>
                          <Badge className={badge.className}>{badge.label}</Badge>
                          <span className="text-xs text-gray-400">
                            {new Date(t.createdAt).toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" })}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-300 flex flex-wrap items-center gap-2">
                          <Clock className="w-4 h-4 text-indigo-500" />
                          من: <strong>{groupName(t.fromGroupId)}</strong>
                          <ArrowLeftRight className="w-4 h-4 text-amber-500" />
                          إلى: <strong>{groupName(t.toGroupId)}</strong>
                        </p>
                        {t.status !== "pending" && t.reviewNote && (
                          <p className="text-xs text-gray-500">سبب القرار: {t.reviewNote}</p>
                        )}
                      </div>
                      {t.status === "pending" && (
                        <div className="flex lg:flex-col gap-2 shrink-0">
                          <Button
                            onClick={() => handleApproveTransfer(t)}
                            className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white"
                          >
                            <CheckCircle className="w-4 h-4" />
                            <span>موافقة ونقل</span>
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => {
                              setRejectTarget({ kind: "transfer", id: t.id, name: t.studentName })
                              setRejectNote("")
                            }}
                            className="border-red-400 text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                          >
                            <XCircle className="w-4 h-4" />
                            <span>رفض</span>
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })
          )}
        </div>
      )}

      {/* حوار الرفض مع سبب */}
      <Dialog open={!!rejectTarget} onOpenChange={open => !open && setRejectTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>رفض طلب «{rejectTarget?.name}»</DialogTitle>
            <DialogDescription>
              {rejectTarget?.kind === "reg"
                ? "لن يتمكن الطالب من تسجيل الدخول — ويمكنه التقديم مرة أخرى بعد تعديل بياناته"
                : "سيبقى الطالب في مجموعته الحالية"}
            </DialogDescription>
          </DialogHeader>
          <div className="py-3">
            <Label>سبب الرفض (اختياري — يظهر للطالب)</Label>
            <Input
              value={rejectNote}
              onChange={e => setRejectNote(e.target.value)}
              placeholder="مثال: البيانات غير مكتملة — راجع المعلم"
              className="mt-1"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>إلغاء</Button>
            <Button
              className="bg-red-500 hover:bg-red-600 text-white"
              onClick={() => {
                if (!rejectTarget) return
                if (rejectTarget.kind === "reg") handleRejectReg(regRequests.find(r => r.id === rejectTarget.id)!, rejectNote)
                else handleRejectTransfer(transferRequests.find(r => r.id === rejectTarget.id)!, rejectNote)
                setRejectTarget(null)
              }}
            >
              <XCircle className="w-4 h-4" />
              <span>تأكيد الرفض</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
