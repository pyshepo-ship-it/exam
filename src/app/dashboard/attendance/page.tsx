"use client"

import React from "react"
import { motion } from "framer-motion"
import { ClipboardCheck, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function AttendancePage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-center md:justify-between gap-4"
      >
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            الحضور والغياب
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            تسجيل حضور وغياب الطلاب لكل حصة
          </p>
        </div>
        <Button className="bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-600 hover:to-cyan-700 shadow-lg">
          <Plus className="w-5 h-5" />
          <span>تسجيل حضور جديد</span>
        </Button>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "الحصص هذا الأسبوع", value: "0", color: "from-teal-500 to-cyan-600" },
          { label: "إجمالي الحضور", value: "0", color: "from-green-500 to-emerald-600" },
          { label: "إجمالي الغياب", value: "0", color: "from-red-500 to-rose-600" },
          { label: "نسبة الحضور", value: "0%", color: "from-blue-500 to-indigo-600" },
        ].map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + index * 0.1 }}
            className="bg-white dark:bg-gray-900 rounded-xl p-6 border border-gray-200 dark:border-gray-800 shadow-lg"
          >
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">{stat.label}</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">{stat.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Empty State */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.3 }}
        className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-lg p-12 text-center"
      >
        <div className="w-24 h-24 mx-auto bg-gradient-to-br from-teal-500 to-cyan-600 rounded-2xl flex items-center justify-center shadow-2xl mb-6">
          <ClipboardCheck className="w-12 h-12 text-white" />
        </div>
        <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
          لا يوجد سجلات حضور بعد
        </h3>
        <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-md mx-auto">
          ابدأ بتسجيل الحضور والغياب للطلاب. اختر المجموعة وسجل حضور كل طالب بنقرة واحدة
        </p>
        <Button className="bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-600 hover:to-cyan-700 shadow-lg">
          <Plus className="w-5 h-5" />
          <span>تسجيل أول حضور</span>
        </Button>
      </motion.div>
    </div>
  )
}
