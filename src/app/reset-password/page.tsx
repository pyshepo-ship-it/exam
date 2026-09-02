"use client"

import React, { useEffect, useRef, useState } from "react"
import { motion } from "framer-motion"
import {
  AlertCircle,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useRouter } from "next/navigation"
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client"
import toast from "react-hot-toast"

type Status = "checking" | "unconfigured" | "ready" | "invalid"

export default function ResetPasswordPage() {
  const router = useRouter()
  const [status, setStatus] = useState<Status>("checking")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")

  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null)
  const getSupabase = () => {
    if (!supabaseRef.current) {
      supabaseRef.current = createClient()
    }
    return supabaseRef.current
  }

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setStatus("unconfigured")
      return
    }

    const handleRecoveryLink = async () => {
      try {
        const supabase = getSupabase()
        const url = new URL(window.location.href)
        const code = url.searchParams.get("code")
        const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""))
        const accessToken = hashParams.get("access_token")
        const refreshToken = hashParams.get("refresh_token")

        // وضع PKCE: الرابط يحوي ?code=...
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code)
          if (error) {
            setErrorMessage(error.message)
            setStatus("invalid")
            return
          }
          setStatus("ready")
          return
        }

        // الوضع الافتراضي (implicit): الرابط يحوي #access_token=...
        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })
          if (error) {
            setErrorMessage(error.message)
            setStatus("invalid")
            return
          }
          setStatus("ready")
          return
        }

        // فضلاً عن ذلك، يجوز أن يكون الجلسة قد تمت معالجتها تلقائياً
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          setStatus("ready")
          return
        }

        setErrorMessage("رابط إعادة التعيين غير صالح أو انتهت صلاحيته.")
        setStatus("invalid")
      } catch {
        setErrorMessage("حدث خطأ أثناء التحقق من الرابط.")
        setStatus("invalid")
      }
    }

    handleRecoveryLink()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (password.length < 8) {
      toast.error("كلمة المرور يجب أن تكون 8 أحرف على الأقل")
      return
    }

    if (password !== confirmPassword) {
      toast.error("كلمتا المرور غير متطابقتين")
      return
    }

    setSubmitting(true)
    try {
      const supabase = getSupabase()
      const { error } = await supabase.auth.updateUser({ password })

      if (error) {
        toast.error(error.message)
        return
      }

      toast.success("تم تغيير كلمة المرور بنجاح")
      router.push("/login")
      router.refresh()
    } catch {
      toast.error("حدث خطأ أثناء تغيير كلمة المرور")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <Card className="shadow-2xl">
          <CardHeader className="space-y-1 text-center">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center">
                <KeyRound className="w-8 h-8 text-white" />
              </div>
            </div>
            <CardTitle className="text-3xl font-bold">إعادة تعيين كلمة المرور</CardTitle>
            <CardDescription>
              {status === "ready"
                ? "أدخل كلمة المرور الجديدة"
                : "أكمل عملية إعادة تعيين كلمة المرور"}
            </CardDescription>
          </CardHeader>

          <CardContent>
            {status === "checking" && (
              <div className="flex flex-col items-center gap-3 py-8 text-gray-500">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                <p>جاري التحقق من الرابط...</p>
              </div>
            )}

            {status === "unconfigured" && (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <AlertCircle className="w-10 h-10 text-amber-500" />
                <p className="text-gray-600 dark:text-gray-300">
                  Supabase غير مُعدّ. يرجى إعداد متغيرات البيئة أولاً
                  (راجع SUPABASE_SETUP.md)
                </p>
                <Button variant="outline" onClick={() => router.push("/login")}>
                  العودة لتسجيل الدخول
                </Button>
              </div>
            )}

            {status === "invalid" && (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <AlertCircle className="w-10 h-10 text-red-500" />
                <p className="text-gray-600 dark:text-gray-300">{errorMessage}</p>
                <Button
                  className="bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700"
                  onClick={() => router.push("/login")}
                >
                  العودة لتسجيل الدخول
                </Button>
              </div>
            )}

            {status === "ready" && (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password">كلمة المرور الجديدة</Label>
                  <div className="relative">
                    <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="8 أحرف على الأقل"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pr-10 pl-10"
                      required
                      dir="ltr"
                      minLength={8}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      aria-label="إظهار كلمة المرور"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm-password">تأكيد كلمة المرور</Label>
                  <div className="relative">
                    <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <Input
                      id="confirm-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="أعد إدخال كلمة المرور"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="pr-10"
                      required
                      dir="ltr"
                      minLength={8}
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700"
                  disabled={submitting}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                      جاري الحفظ...
                    </>
                  ) : (
                    "تغيير كلمة المرور"
                  )}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
