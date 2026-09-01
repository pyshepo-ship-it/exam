"use client"

import React from "react"
import { motion } from "framer-motion"
import { Users, Plus, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export default function StudentsPage() {
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
            الطلاب
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            إدارة بيانات الطلاب وربطهم بالمجموعات
          </p>
        </div>
        <Button className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 shadow-lg">
          <Plus className="w-5 h-5" />
          <span>إضافة طالب جديد</span>
        </Button>
      </motion.div>

      {/* Search Bar */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="relative"
      >
        <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <Input
          placeholder="ابحث عن طالب بالاسم..."
          className="pr-12 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 shadow-lg h-14 text-base"
        />
      </motion.div>

      {/* Empty State */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2 }}
        className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-lg p-12 text-center"
      >
        <div className="w-24 h-24 mx-auto bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center shadow-2xl mb-6">
          <Users className="w-12 h-12 text-white" />
        </div>
        <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
          لا يوجد طلاب بعد
        </h3>
        <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-md mx-auto">
          ابدأ بإضافة الطلاب وتسجيلهم في المجموعات. يمكنك إضافة الاسم ورقم الهاتف والصف والمجموعة
        </p>
        <Button className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 shadow-lg">
          <Plus className="w-5 h-5" />
          <span>إضافة أول طالب</span>
        </Button>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "إجمالي الطلاب", value: "0", color: "from-green-500 to-emerald-600" },
          { label: "الطلاب النشطين", value: "0", color: "from-blue-500 to-indigo-600" },
          { label: "الطلاب غير النشطين", value: "0", color: "from-gray-500 to-slate-600" },
          { label: "هذا الشهر", value: "0", color: "from-purple-500 to-pink-600" },
        ].map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 + index * 0.1 }}
            className="bg-white dark:bg-gray-900 rounded-xl p-6 border border-gray-200 dark:border-gray-800 shadow-lg"
          >
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">{stat.label}</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">{stat.value}</p>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
