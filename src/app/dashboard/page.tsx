"use client"

import React from "react"
import { motion } from "framer-motion"
import { 
  Users, 
  DollarSign, 
  Calendar, 
  FileText, 
  TrendingUp,
  BookOpen,
  ClipboardCheck,
  AlertCircle
} from "lucide-react"
import Link from "next/link"

const stats = [
  {
    label: "الطلاب",
    value: "0",
    icon: Users,
    color: "from-blue-500 to-indigo-600",
    bgLight: "bg-blue-50 dark:bg-blue-950",
    change: "+12%",
  },
  {
    label: "المجموعات",
    value: "0",
    icon: Calendar,
    color: "from-purple-500 to-pink-600",
    bgLight: "bg-purple-50 dark:bg-purple-950",
    change: "+5%",
  },
  {
    label: "التحصيل الشهري",
    value: "0 ج.م",
    icon: DollarSign,
    color: "from-green-500 to-emerald-600",
    bgLight: "bg-green-50 dark:bg-green-950",
    change: "+8%",
  },
  {
    label: "الاختبارات",
    value: "0",
    icon: FileText,
    color: "from-orange-500 to-red-600",
    bgLight: "bg-orange-50 dark:bg-orange-950",
    change: "+3%",
  },
]

const quickActions = [
  {
    label: "إضافة طالب",
    description: "تسجيل طالب جديد في النظام",
    icon: Users,
    href: "/dashboard/students",
    color: "from-green-500 to-emerald-600",
  },
  {
    label: "تسجيل تحصيل",
    description: "تسجيل دفعة من طالب",
    icon: DollarSign,
    href: "/dashboard/payments",
    color: "from-yellow-500 to-orange-600",
  },
  {
    label: "إنشاء اختبار",
    description: "إنشاء اختبار جديد وتحويله لـ PDF",
    icon: FileText,
    href: "/dashboard/exams",
    color: "from-red-500 to-rose-600",
  },
  {
    label: "تسجيل حضور",
    description: "تسجيل حضور وغياب الطلاب",
    icon: ClipboardCheck,
    href: "/dashboard/attendance",
    color: "from-teal-500 to-cyan-600",
  },
]

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 p-8 text-white shadow-2xl"
      >
        <div className="relative z-10">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">
            مرحباً بك في نظام إدارة الدروس 👋
          </h1>
          <p className="text-indigo-100 text-lg">
            يمكنك من هنا إدارة جميع دروسك الخصوصية بسهولة ويسر
          </p>
        </div>
        <div className="absolute top-0 left-0 w-64 h-64 bg-white/10 rounded-full -translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-white/5 rounded-full translate-x-1/3 translate-y-1/2" />
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, index) => {
          const Icon = stat.icon
          return (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="bg-white dark:bg-gray-900 rounded-2xl p-6 border border-gray-200 dark:border-gray-800 shadow-lg hover:shadow-xl transition-shadow"
            >
              <div className="flex items-center justify-between mb-4">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center shadow-lg`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
                <span className="text-xs font-semibold text-green-600 bg-green-50 dark:bg-green-950 dark:text-green-400 px-2 py-1 rounded-full">
                  {stat.change}
                </span>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">{stat.label}</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stat.value}</p>
            </motion.div>
          )
        })}
      </div>

      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
          إجراءات سريعة
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {quickActions.map((action) => {
            const Icon = action.icon
            return (
              <Link
                key={action.label}
                href={action.href}
                className="group bg-white dark:bg-gray-900 rounded-2xl p-6 border border-gray-200 dark:border-gray-800 shadow-lg hover:shadow-xl transition-all hover:-translate-y-1"
              >
                <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${action.color} flex items-center justify-center shadow-lg mb-4 group-hover:scale-110 transition-transform`}>
                  <Icon className="w-7 h-7 text-white" />
                </div>
                <h3 className="font-bold text-gray-900 dark:text-white mb-1">{action.label}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">{action.description}</p>
              </Link>
            )
          })}
        </div>
      </motion.div>

      {/* Info Card */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border border-blue-200 dark:border-blue-900 rounded-2xl p-6 flex gap-4"
      >
        <div className="w-12 h-12 bg-blue-500 rounded-xl flex items-center justify-center shrink-0">
          <BookOpen className="w-6 h-6 text-white" />
        </div>
        <div>
          <h3 className="font-bold text-gray-900 dark:text-white mb-1">
            نصيحة اليوم
          </h3>
          <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">
            ابدأ بإضافة الصفوف والمجموعات، ثم أضف الطلاب، وبعدها يمكنك تسجيل التحصيل وإنشاء الاختبارات بسهولة. 
            استخدم القسم الجانبي للتنقل بين الأقسام.
          </p>
        </div>
      </motion.div>
    </div>
  )
}
