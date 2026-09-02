"use client"

import React, { useState, useEffect } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { GraduationCap, LogIn, Loader2, Mail, Lock, Home, Hourglass, ShieldX } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { portalLogin, type LoginResult } from "@/lib/student-accounts"

export default function StudentLoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [errorStatus, setErrorStatus] = useState<string>("")

  // إن كانت له جلسة سابقة ننتقل به للبوابة مباشرة
  useEffect(() => {
    const { getPortalSession } = require("@/lib/student-accounts") as typeof import("@/lib/student-accounts")
    if (getPortalSession()) {
      window.location.href = "/student"
    }
  }, [])

  const submit = async () => {
    setBusy(true)
    setError("")
    setErrorStatus("")
    const res: LoginResult = await portalLogin(email, password)
    setBusy(false)
    if (res.ok) {
      window.location.href = "/student"
    } else {
      setError(res.error)
      setErrorStatus(res.status || "")
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-emerald-50 dark:from-gray-950 dark:via-gray-950 dark:to-gray-900 font-arabic flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-6">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-xl shadow-indigo-500/30">
            <GraduationCap className="w-9 h-9 text-white" />
          </div>
          <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white mt-4">دخول الطلاب</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            شاهد تقريرك الكامل: الدرجات والمدفوعات والحضور والمكافآت
          </p>
        </div>

        <Card className="bg-white/90 dark:bg-gray-900/90 backdrop-blur border-gray-200 dark:border-gray-800 shadow-2xl">
          <CardHeader>
            <CardTitle className="text-lg">تسجيل الدخول</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>البريد الإلكتروني</Label>
              <div className="relative mt-1">
                <Input
                  dir="ltr"
                  type="email"
                  placeholder="student@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="pr-10"
                />
                <Mail className="w-4 h-4 text-gray-400 absolute top-1/2 right-3 -translate-y-1/2" />
              </div>
            </div>
            <div>
              <Label>كلمة المرور</Label>
              <div className="relative mt-1">
                <Input
                  type="password"
                  placeholder="كلمة المرور"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && submit()}
                  className="pr-10"
                />
                <Lock className="w-4 h-4 text-gray-400 absolute top-1/2 right-3 -translate-y-1/2" />
              </div>
            </div>

            {error && (
              <div className={`rounded-xl border p-3 text-sm ${
                errorStatus === "pending"
                  ? "bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300"
                  : "bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-800 text-red-700 dark:text-red-300"
              }`}>
                {errorStatus === "pending" ? (
                  <p className="flex items-start gap-2 font-semibold">
                    <Hourglass className="w-4 h-4 shrink-0 mt-0.5" />
                    {error}
                  </p>
                ) : errorStatus === "rejected" || errorStatus === "blocked" ? (
                  <p className="flex items-start gap-2 font-semibold">
                    <ShieldX className="w-4 h-4 shrink-0 mt-0.5" />
                    {error}
                  </p>
                ) : (
                  <p className="font-semibold">{error}</p>
                )}
              </div>
            )}

            <Button
              onClick={submit}
              disabled={busy}
              className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white h-12 text-base"
            >
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogIn className="w-5 h-5" />}
              <span>{busy ? "جاري الدخول..." : "تسجيل الدخول"}</span>
            </Button>

            <p className="text-center text-sm text-gray-500 dark:text-gray-400">
              ليس لديك حساب؟{" "}
              <Link href="/student/register" className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline">
                سجّل الآن وانتظر موافقة المعلم
              </Link>
            </p>
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
