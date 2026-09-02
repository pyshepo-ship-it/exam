"use client"

import React, { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { motion } from "framer-motion"
import { GraduationCap, UserPlus, Loader2, CheckCircle, Lock, Mail, Phone, BookOpen, Users, Home } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Grade, getGrades } from "@/lib/data-storage"
import { registerStudentAccount, isRegistrationOpen } from "@/lib/student-accounts"

export default function StudentRegisterPage() {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [grades, setGrades] = useState<Grade[]>([])
  const [form, setForm] = useState({
    name: "",
    phone: "",
    guardianPhone: "",
    email: "",
    password: "",
    confirmPassword: "",
    gradeId: "",
    groupId: "",
  })
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [registrationOpen, setRegistrationOpen] = useState(true)

  useEffect(() => {
    setGrades(getGrades())
    setRegistrationOpen(isRegistrationOpen())
    setMounted(true)
  }, [])

  const selectedGrade = grades.find(g => g.id === form.gradeId)

  const submit = async () => {
    setBusy(true)
    const res = await registerStudentAccount(form)
    setBusy(false)
    if (res.ok) {
      setDone(true)
    } else {
      alert(res.error)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-emerald-50 dark:from-gray-950 dark:via-gray-950 dark:to-gray-900 font-arabic flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg"
      >
        <div className="text-center mb-6">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-xl shadow-indigo-500/30">
            <GraduationCap className="w-9 h-9 text-white" />
          </div>
          <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white mt-4">تسجيل طالب جديد</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            سجّل بياناتك وستنتظر موافقة المعلم قبل تفعيل حسابك
          </p>
        </div>

        <Card className="bg-white/90 dark:bg-gray-900/90 backdrop-blur border-gray-200 dark:border-gray-800 shadow-2xl">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-indigo-600" />
              بيانات الطالب
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!mounted ? null : !registrationOpen ? (
              <div className="text-center py-8">
                <Lock className="w-12 h-12 mx-auto mb-3 text-amber-500" />
                <p className="font-bold text-gray-900 dark:text-white">التسجيل مغلق حالياً</p>
                <p className="text-sm text-gray-500 mt-2">أغلق المعلم باب التسجيل مؤقتاً — يرجى التواصل معه مباشرة</p>
                <Link href="/student/login" className="inline-block mt-4">
                  <Button variant="outline" className="border-indigo-500 text-indigo-600">
                    لدي حساب؟ تسجيل الدخول
                  </Button>
                </Link>
              </div>
            ) : done ? (
              <div className="text-center py-8">
                <CheckCircle className="w-14 h-14 mx-auto mb-3 text-green-500" />
                <p className="font-bold text-lg text-gray-900 dark:text-white">تم إرسال طلبك بنجاح 🎉</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 leading-relaxed">
                  طلبك الآن في انتظار موافقة المعلم.
                  <br />
                  بمجرد الموافقة يمكنك تسجيل الدخول بنفس البريد وكلمة المرور
                  <br />
                  ومشاهدة تقريرك الكامل (الدرجات والمدفوعات والحضور).
                </p>
                <Link href="/student/login" className="inline-block mt-5">
                  <Button className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
                    الانتقال لتسجيل الدخول
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <Label>الاسم الكامل *</Label>
                  <Input
                    placeholder="مثال: أحمد محمد علي"
                    value={form.name}
                    onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label>رقم الهاتف * <span className="text-xs text-gray-400">(أرقام فقط بدون حروف)</span></Label>
                    <div className="relative mt-1">
                      <Input
                        dir="ltr"
                        placeholder="01012345678"
                        value={form.phone}
                        onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                        className="pr-10"
                      />
                      <Phone className="w-4 h-4 text-gray-400 absolute top-1/2 right-3 -translate-y-1/2" />
                    </div>
                  </div>
                  <div>
                    <Label>هاتف ولي الأمر * (إجباري)</Label>
                    <div className="relative mt-1">
                      <Input
                        dir="ltr"
                        placeholder="01098765432"
                        value={form.guardianPhone}
                        onChange={e => setForm(p => ({ ...p, guardianPhone: e.target.value }))}
                        className="pr-10"
                      />
                      <Phone className="w-4 h-4 text-amber-500 absolute top-1/2 right-3 -translate-y-1/2" />
                    </div>
                  </div>
                  <div>
                    <Label>البريد الإلكتروني *</Label>
                    <div className="relative mt-1">
                      <Input
                        dir="ltr"
                        type="email"
                        placeholder="student@example.com"
                        value={form.email}
                        onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                        className="pr-10"
                      />
                      <Mail className="w-4 h-4 text-gray-400 absolute top-1/2 right-3 -translate-y-1/2" />
                    </div>
                  </div>
                </div>
                <div>
                  <Label>الصف *</Label>
                  <Select
                    value={form.gradeId}
                    onValueChange={val => setForm(p => ({ ...p, gradeId: val, groupId: "" }))}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="اختر صفك" />
                    </SelectTrigger>
                    <SelectContent>
                      {grades.map(g => (
                        <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>المجموعة * {form.gradeId && <span className="text-xs text-gray-400">(مجموعات صفك فقط)</span>}</Label>
                  <Select
                    value={form.groupId}
                    disabled={!form.gradeId}
                    onValueChange={val => setForm(p => ({ ...p, groupId: val }))}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder={form.gradeId ? "اختر مجموعتك" : "اختر الصف أولاً"} />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedGrade?.groups.map(g => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.name} {g.startTime && g.endTime ? `(${g.days.join("، ")} — ${g.startTime})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label>كلمة المرور *</Label>
                    <Input
                      type="password"
                      placeholder="6 أحرف على الأقل"
                      value={form.password}
                      onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>تأكيد كلمة المرور *</Label>
                    <Input
                      type="password"
                      placeholder="أعد كتابة كلمة المرور"
                      value={form.confirmPassword}
                      onChange={e => setForm(p => ({ ...p, confirmPassword: e.target.value }))}
                      className="mt-1"
                    />
                  </div>
                </div>

                <Button
                  onClick={submit}
                  disabled={busy}
                  className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white h-12 text-base"
                >
                  {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <UserPlus className="w-5 h-5" />}
                  <span>{busy ? "جاري الإرسال..." : "إرسال طلب التسجيل"}</span>
                </Button>

                <p className="text-center text-sm text-gray-500 dark:text-gray-400">
                  لديك حساب بالفعل؟{" "}
                  <Link href="/student/login" className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline">
                    سجّل الدخول
                  </Link>
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="text-center mt-5">
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600">
            <Home className="w-4 h-4" />
            العودة للصفحة الرئيسية
          </Link>
        </div>
      </motion.div>
    </div>
  )
}
