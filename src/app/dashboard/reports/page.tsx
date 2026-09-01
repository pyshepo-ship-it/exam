"use client"

import React from "react"
import { motion } from "framer-motion"
import { BarChart3, TrendingUp, Users, DollarSign, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function ReportsPage() {
  const reports = [
    {
      title: "تقرير التحصيل المالي",
      description: "إحصائيات شاملة عن التحصيل والاستحقاقات",
      icon: DollarSign,
      color: "from-green-500 to-emerald-600",
    },
    {
      title: "تقرير المجموعات",
      description: "عدد الطلاب والإيرادات لكل مجموعة",
      icon: Users,
      color: "from-purple-500 to-pink-600",
    },
    {
      title: "تقرير الطلاب",
      description: "حالة جميع الطلاب وأرصدتهم",
      icon: Users,
      color: "from-blue-500 to-indigo-600",
    },
    {
      title: "تقرير الاختبارات",
      description: "إحصائيات الاختبارات المنشأة",
      icon: FileText,
      color: "from-red-500 to-rose-600",
    },
    {
      title: "تقرير شهري شامل",
      description: "ملخص شامل للشهر الحالي",
      icon: TrendingUp,
      color: "from-yellow-500 to-orange-600",
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          التقارير
        </h1>
        <p className="text-gray-500 dark:text-gray-400">
          تقارير ذكية وإحصائيات شاملة
        </p>
      </motion.div>

      {/* Reports Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {reports.map((report, index) => {
          const Icon = report.icon
          return (
            <motion.div
              key={report.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + index * 0.1 }}
              className="bg-white dark:bg-gray-900 rounded-2xl p-6 border border-gray-200 dark:border-gray-800 shadow-lg hover:shadow-xl transition-all hover:-translate-y-1 cursor-pointer"
            >
              <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${report.color} flex items-center justify-center shadow-lg mb-4`}>
                <Icon className="w-7 h-7 text-white" />
              </div>
              <h3 className="font-bold text-gray-900 dark:text-white mb-2 text-lg">
                {report.title}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                {report.description}
              </p>
              <Button variant="outline" className="w-full">
                عرض التقرير
              </Button>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
