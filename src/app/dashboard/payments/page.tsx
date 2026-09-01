"use client"

import React from "react"
import { motion } from "framer-motion"
import { DollarSign, Plus, TrendingUp, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function PaymentsPage() {
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
            التحصيل الشهري
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            إدارة التحصيل المالي والاستحقاقات الشهرية
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="border-yellow-500 text-yellow-600 hover:bg-yellow-50 dark:hover:bg-yellow-950">
            <AlertCircle className="w-5 h-5" />
            <span>استحقاق شهري</span>
          </Button>
          <Button className="bg-gradient-to-r from-yellow-500 to-orange-600 hover:from-yellow-600 hover:to-orange-700 shadow-lg">
            <Plus className="w-5 h-5" />
            <span>تسجيل تحصيل</span>
          </Button>
        </div>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "إجمالي المستحقات", value: "0 ج.م", color: "from-yellow-500 to-orange-600", icon: DollarSign },
          { label: "إجمالي المحصل", value: "0 ج.م", color: "from-green-500 to-emerald-600", icon: TrendingUp },
          { label: "المتبقي", value: "0 ج.م", color: "from-red-500 to-rose-600", icon: AlertCircle },
          { label: "نسبة التحصيل", value: "0%", color: "from-blue-500 to-indigo-600", icon: TrendingUp },
        ].map((stat, index) => {
          const Icon = stat.icon
          return (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + index * 0.1 }}
              className="bg-white dark:bg-gray-900 rounded-xl p-6 border border-gray-200 dark:border-gray-800 shadow-lg"
            >
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center shadow-lg mb-4`}>
                <Icon className="w-6 h-6 text-white" />
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">{stat.label}</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stat.value}</p>
            </motion.div>
          )
        })}
      </div>

      {/* Empty State */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.3 }}
        className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-lg p-12 text-center"
      >
        <div className="w-24 h-24 mx-auto bg-gradient-to-br from-yellow-500 to-orange-600 rounded-2xl flex items-center justify-center shadow-2xl mb-6">
          <DollarSign className="w-12 h-12 text-white" />
        </div>
        <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
          لا توجد عمليات تحصيل بعد
        </h3>
        <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-md mx-auto">
          ابدأ بتسجيل الاستحقاقات الشهرية، ثم سجل التحصيل من الطلاب. يمكنك إنشاء استحقاق شهري تلقائي لجميع الطلاب
        </p>
      </motion.div>
    </div>
  )
}
