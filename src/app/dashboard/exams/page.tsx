"use client"

import React from "react"
import { motion } from "framer-motion"
import { FileText, Plus, Download } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function ExamsPage() {
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
            الاختبارات
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            إنشاء وإدارة الاختبارات وتحويلها لـ PDF
          </p>
        </div>
        <Button className="bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 shadow-lg">
          <Plus className="w-5 h-5" />
          <span>إنشاء اختبار جديد</span>
        </Button>
      </motion.div>

      {/* Question Types Info */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 border border-indigo-200 dark:border-indigo-900 rounded-2xl p-6"
      >
        <h3 className="font-bold text-gray-900 dark:text-white mb-4">
          أنواع الأسئلة المتاحة (5 أنواع)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {[
            { num: "1", title: "اختر", desc: "اختيار من متعدد" },
            { num: "2", title: "أكمل", desc: "إكمال الجمل" },
            { num: "3", title: "صح أو خطأ", desc: "علامة صح أو خطأ" },
            { num: "4", title: "علل/فسر", desc: "أسئلة التعليل" },
            { num: "5", title: "صحح", desc: "تصحيح الأخطاء" },
          ].map((type) => (
            <div
              key={type.num}
              className="bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-800"
            >
              <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center text-white font-bold mb-2">
                {type.num}
              </div>
              <p className="font-semibold text-gray-900 dark:text-white text-sm">{type.title}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{type.desc}</p>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Empty State */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2 }}
        className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-lg p-12 text-center"
      >
        <div className="w-24 h-24 mx-auto bg-gradient-to-br from-red-500 to-rose-600 rounded-2xl flex items-center justify-center shadow-2xl mb-6">
          <FileText className="w-12 h-12 text-white" />
        </div>
        <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
          لا توجد اختبارات بعد
        </h3>
        <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-md mx-auto">
          ابدأ بإنشاء اختبار جديد. يمكنك اختيار الصف والشهر، ثم إضافة الأسئلة من الأنواع الخمسة المتاحة
        </p>
        <div className="flex gap-3 justify-center">
          <Button className="bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 shadow-lg">
            <Plus className="w-5 h-5" />
            <span>إنشاء اختبار</span>
          </Button>
        </div>
      </motion.div>
    </div>
  )
}
