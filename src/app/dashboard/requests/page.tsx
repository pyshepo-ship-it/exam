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
  MessageCircleQuestion,
  Reply,
  Lock,
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
import {
  getInquiries,
  teacherReplyInquiry,
  teacherCloseInquiry,
} from "@/lib/inquiries"
import type { InquiryThread } from "@/lib/data-storage"

type TabKey = "registrations" | "transfers" | "inquiries"

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
  const [inquiries, setInquiries] = useState<InquiryThread[]>([])
  const [replyTarget, setReplyTarget] = useState<InquiryThread | null>(null)
  const [replyText, setReplyText] = useState("")
  const [rejectTarget, setRejectTarget] = useState<{ kind: "reg" | "transfer"; id: string; name: string } | null>(null)
  const [rejectNote, setRejectNote] = useState("")

  const refresh = () => {
    setGrades(getGrades())
    setStudents(getStudents())
    setRegRequests(getRegistrationRequests())
    setTransferRequests(getGroupTransferRequests())
    setInquiries(getInquiries())
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
  // استفسارات بانتظار رد المعلم (آخر رسالة من الطالب)
  const awaitingReply = inquiries.filter(t => {
    if (t.status !== "open") return false
    const last = t.messages[t.messages.length - 1]
    return last && last.from === "student"
  }).length

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
          { key: "inquiries" as TabKey, label: "الاستفسارات", icon: MessageCircleQuestion, count: awaitingReply, color: "from-sky-500 to-blue-600" },
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

      {/* ============ الاستفسارات ============ */}
      {tab === "inquiries" && (
        <div className="space-y-4">
          {inquiries.length === 0 ? (
            <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
              <CardContent className="py-12 text-center">
                <MessageCircleQuestion className="w-14 h-14 mx-auto mb-3 text-gray-300 dark:text-gray-700" />
                <p className="text-gray-500 dark:text-gray-400">لا توجد استفسارات بعد</p>
                <p className="text-xs text-gray-400 mt-1">يرسل الطالب استفساراً واحداً من بوابته ويرد عليه هنا</p>
              </CardContent>
            </Card>
          ) : (
            [...inquiries]
              .sort((a, b) => {
                const aWait = a.status === "open" && a.messages[a.messages.length - 1]?.from === "student" ? 1 : 0
                const bWait = b.status === "open" && b.messages[b.messages.length - 1]?.from === "student" ? 1 : 0
                if (aWait !== bWait) return bWait - aWait
                return (b.updatedAt || "").localeCompare(a.updatedAt || "")
              })
              .map(t => {
                const waiting = t.status === "open" && t.messages[t.messages.length - 1]?.from === "student"
                return (
                  <Card key={t.id} className={`bg-white dark:bg-gray-900 border ${waiting ? "border-sky-300 dark:border-sky-800" : "border-gray-200 dark:border-gray-800"}`}>
                    <CardContent className="p-5 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-lg text-gray-900 dark:text-white">{t.studentName}</h3>
                        <Badge className={t.status === "closed" ? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300" : waiting ? "bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300" : "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"}>
                          {t.status === "closed" ? "مغلق 🔒" : waiting ? "بانتظار ردك" : "تم الرد — مفتوح للطالب"}
                        </Badge>
                        <span className="text-xs text-gray-400">
                          {gradeName(t.gradeId || "")}{t.groupId ? ` — ${groupName(t.groupId)}` : ""}
                        </span>
                      </div>

                      {/* الرسائل */}
                      <div className="space-y-2">
                        {t.messages.map((m, i) => (
                          <div key={i} className={`rounded-xl px-4 py-3 border text-sm ${
                            m.from === "student"
                              ? "bg-sky-50 dark:bg-sky-950/30 border-sky-200 dark:border-sky-800"
                              : "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800"
                          }`}>
                            <p className="font-bold text-xs mb-1 flex items-center gap-1.5">
                              {m.from === "student" ? <Users className="w-3.5 h-3.5" /> : <Reply className="w-3.5 h-3.5" />}
                              {m.from === "student" ? "الطالب" : "المعلم"}
                              <span className="font-normal text-gray-400">
                                {new Date(m.at).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" })}
                              </span>
                            </p>
                            <p className="text-gray-700 dark:text-gray-200 whitespace-pre-wrap">{m.text}</p>
                          </div>
                        ))}
                      </div>

                      {t.status === "open" && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          <Button
                            size="sm"
                            onClick={() => {
                              setReplyTarget(t)
                              setReplyText("")
                            }}
                            className={`text-white ${waiting ? "bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700" : "bg-gray-500 hover:bg-gray-600"}`}
                          >
                            <Reply className="w-4 h-4" />
                            <span>{waiting ? "الرد على الاستفسار" : "إضافة رد آخر"}</span>
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const res = teacherCloseInquiry(t.id)
                              if (res.ok) { toast.success(res.message || "تم"); refresh() } else toast.error(res.error || "تعذر الإغلاق")
                            }}
                            className="border-gray-400 text-gray-600"
                          >
                            <Lock className="w-4 h-4" />
                            <span>إغلاق الاستفسار</span>
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })
          )}
        </div>
      )}

      {/* حوار الرد على الاستفسار */}
      <Dialog open={!!replyTarget} onOpenChange={open => !open && setReplyTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>رد على استفسار «{replyTarget?.studentName}»</DialogTitle>
            <DialogDescription>
              بعد الرد يبقى الاستفسار مفتوحاً ليستطيع الطالب الرد مرة أخرى — أو أغلقه من زر الإغلاق
            </DialogDescription>
          </DialogHeader>
          <div className="py-3">
            <Label>نص الرد</Label>
            <textarea
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              rows={4}
              placeholder="اكتب ردك على استفسار الطالب..."
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReplyTarget(null)}>إلغاء</Button>
            <Button
              className="bg-gradient-to-r from-sky-500 to-blue-600 text-white"
              onClick={() => {
                if (!replyTarget) return
                const res = teacherReplyInquiry(replyTarget.id, replyText)
                if (res.ok) {
                  toast.success(res.message || "تم إرسال الرد")
                  setReplyTarget(null)
                  refresh()
                } else {
                  toast.error(res.error || "تعذر إرسال الرد")
                }
              }}
            >
              <Reply className="w-4 h-4" />
              <span>إرسال الرد</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
