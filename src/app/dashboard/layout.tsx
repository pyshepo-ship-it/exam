"use client"

import React, { useEffect, useState, useRef } from "react"
import { useRouter, usePathname } from "next/navigation"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import {
  BookOpen,
  Calendar,
  Users,
  DollarSign,
  FileText,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  ClipboardCheck,
  Home,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/theme-toggle"
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client"

// Force dynamic rendering to avoid prerendering issues
export const dynamic = 'force-dynamic'

const menuItems = [
  { href: "/dashboard", label: "الرئيسية", icon: Home, color: "from-blue-500 to-indigo-600" },
  { href: "/dashboard/grades", label: "الصفوف والمواعيد", icon: Calendar, color: "from-purple-500 to-pink-600" },
  { href: "/dashboard/students", label: "الطلاب", icon: Users, color: "from-green-500 to-emerald-600" },
  { href: "/dashboard/payments", label: "التحصيل الشهري", icon: DollarSign, color: "from-yellow-500 to-orange-600" },
  { href: "/dashboard/exams", label: "الاختبارات", icon: FileText, color: "from-red-500 to-rose-600" },
  { href: "/dashboard/attendance", label: "الحضور والغياب", icon: ClipboardCheck, color: "from-teal-500 to-cyan-600" },
  { href: "/dashboard/reports", label: "التقارير", icon: BarChart3, color: "from-indigo-500 to-blue-600" },
  { href: "/dashboard/settings", label: "الإعدادات", icon: Settings, color: "from-gray-500 to-slate-600" },
]

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [userEmail, setUserEmail] = useState<string>('')

  // يُنشأ عميل Supabase داخل المتصفح فقط (داخل التأثيرات/المعالجات)،
  // لتفادي تعطُّل البناء (prerender) عند عدم وجود متغيرات البيئة.
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null)
  const getSupabase = () => {
    if (!supabaseRef.current) {
      supabaseRef.current = createClient()
    }
    return supabaseRef.current
  }

  useEffect(() => {
    setMounted(true)

    // في الوضع المحلي (بدون Supabase) لا يوجد تسجيل دخول للتحقق منه.
    if (!isSupabaseConfigured()) {
      return
    }

    const supabase = getSupabase()

    // Check Supabase auth
    const getUser = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        router.push("/login")
        return
      }
      
      setUserEmail(session.user.email || '')
    }
    
    getUser()
    
    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        router.push("/login")
      } else {
        setUserEmail(session.user.email || '')
      }
    })
    
    return () => subscription.unsubscribe()
  }, [router])

  const handleLogout = async () => {
    if (!isSupabaseConfigured()) {
      router.push("/login")
      return
    }
    const supabase = getSupabase()
    await supabase.auth.signOut()
    router.push("/login")
  }

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex">
      {/* Sidebar - Desktop */}
      <aside className="hidden lg:flex flex-col w-72 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 shadow-xl">
        {/* Logo */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <BookOpen className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-gray-900 dark:text-white">إدارة الدروس</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">النظام الشخصي</p>
            </div>
          </div>
        </div>

        {/* Menu */}
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {menuItems.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href || 
              (item.href !== "/dashboard" && pathname.startsWith(item.href))

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 group ${
                  isActive
                    ? "bg-gradient-to-r " + item.color + " text-white shadow-lg"
                    : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? "" : "group-hover:scale-110"} transition-transform`} />
                <span className="font-medium">{item.label}</span>
              </Link>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <ThemeToggle />
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
            >
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Mobile Sidebar */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            {/* Overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSidebarOpen(false)}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden"
            />
            {/* Sidebar */}
            <motion.aside
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25 }}
              className="fixed top-0 right-0 h-full w-80 bg-white dark:bg-gray-900 z-50 lg:hidden shadow-2xl flex flex-col"
            >
              {/* Header */}
              <div className="p-6 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center">
                    <BookOpen className="w-6 h-6 text-white" />
                  </div>
                  <h1 className="font-bold text-gray-900 dark:text-white">إدارة الدروس</h1>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSidebarOpen(false)}
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>

              {/* Menu */}
              <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
                {menuItems.map((item) => {
                  const Icon = item.icon
                  const isActive = pathname === item.href || 
                    (item.href !== "/dashboard" && pathname.startsWith(item.href))

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setSidebarOpen(false)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                        isActive
                          ? "bg-gradient-to-r " + item.color + " text-white shadow-lg"
                          : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="font-medium">{item.label}</span>
                    </Link>
                  )
                })}
              </nav>

              {/* Footer */}
              <div className="p-4 border-t border-gray-200 dark:border-gray-800">
                <Button
                  variant="destructive"
                  onClick={handleLogout}
                  className="w-full"
                >
                  <LogOut className="w-5 h-5" />
                  <span>تسجيل الخروج</span>
                </Button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-h-screen overflow-hidden">
        {/* Top Bar */}
        <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-4 lg:px-8 flex items-center justify-between sticky top-0 z-30">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden"
          >
            <Menu className="w-6 h-6" />
          </Button>

          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="font-semibold text-gray-900 dark:text-white">مرحباً بك</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{userEmail || 'مدير النظام'}</p>
            </div>
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold shadow-lg">
              {userEmail ? userEmail.charAt(0).toUpperCase() : 'D'}
            </div>
          </div>

          <div className="lg:hidden">
            <ThemeToggle />
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-y-auto p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  )
}
