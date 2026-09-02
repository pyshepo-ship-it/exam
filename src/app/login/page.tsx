"use client"

import React, { useState, useRef } from "react"
import { motion } from "framer-motion"
import { 
  BookOpen, 
  Eye, 
  EyeOff, 
  Lock, 
  User, 
  Loader2, 
  Mail
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useRouter } from "next/navigation"
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client"
import toast from "react-hot-toast"
import { TeacherSignature } from "@/components/teacher-signature"

export default function LoginPage() {
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showForgotPassword, setShowForgotPassword] = useState(false)

  // يُنشأ عميل Supabase داخل المتصفح فقط (داخل المعالجات)،
  // لتفادي تعطُّل البناء (prerender) عند عدم وجود متغيرات البيئة.
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null)
  const getSupabase = () => {
    if (!supabaseRef.current) {
      supabaseRef.current = createClient()
    }
    return supabaseRef.current
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    if (!isSupabaseConfigured()) {
      setLoading(false)
      toast.error("Supabase غير مُعدّ. يرجى إعداد متغيرات البيئة أولاً (راجع SUPABASE_SETUP.md)")
      return
    }

    try {
      const supabase = getSupabase()
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        toast.error(error.message)
        return
      }

      if (data.user) {
        toast.success("تم تسجيل الدخول بنجاح")
        router.push("/dashboard")
        router.refresh()
      }
    } catch (error) {
      toast.error("حدث خطأ أثناء تسجيل الدخول")
    } finally {
      setLoading(false)
    }
  }

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    if (!isSupabaseConfigured()) {
      setLoading(false)
      toast.error("Supabase غير مُعدّ. يرجى إعداد متغيرات البيئة أولاً (راجع SUPABASE_SETUP.md)")
      return
    }

    try {
      const supabase = getSupabase()
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })

      if (error) {
        toast.error(error.message)
        return
      }

      toast.success("تم إرسال رابط إعادة التعيين إلى بريدك الإلكتروني")
      setShowForgotPassword(false)
    } catch (error) {
      toast.error("حدث خطأ أثناء إرسال البريد")
    } finally {
      setLoading(false)
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
                <BookOpen className="w-8 h-8 text-white" />
              </div>
            </div>
            <CardTitle className="text-3xl font-bold">أ/ ضحى العربي</CardTitle>
            <CardDescription>
              {!showForgotPassword 
                ? "سجل دخولك للوصول إلى لوحة التحكم" 
                : "أدخل بريدك الإلكتروني لإعادة تعيين كلمة المرور"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!showForgotPassword ? (
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">البريد الإلكتروني</Label>
                  <div className="relative">
                    <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="example@domain.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pr-10"
                      required
                      dir="ltr"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">كلمة المرور</Label>
                  <div className="relative">
                    <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pr-10 pl-10"
                      required
                      dir="ltr"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                      جاري تسجيل الدخول...
                    </>
                  ) : (
                    "تسجيل الدخول"
                  )}
                </Button>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => setShowForgotPassword(true)}
                    className="text-sm text-blue-600 hover:text-blue-700 hover:underline"
                  >
                    نسيت كلمة المرور؟
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reset-email">البريد الإلكتروني</Label>
                  <div className="relative">
                    <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <Input
                      id="reset-email"
                      type="email"
                      placeholder="example@domain.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pr-10"
                      required
                      dir="ltr"
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                      جاري الإرسال...
                    </>
                  ) : (
                    "إرسال رابط إعادة التعيين"
                  )}
                </Button>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => setShowForgotPassword(false)}
                    className="text-sm text-blue-600 hover:text-blue-700 hover:underline"
                  >
                    العودة لتسجيل الدخول
                  </button>
                </div>
              </form>
            )}

          </CardContent>
        </Card>
        <TeacherSignature compact className="mt-6" />
      </motion.div>
    </div>
  )
}
