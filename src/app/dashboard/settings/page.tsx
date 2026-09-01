"use client"

import React from "react"
import { motion } from "framer-motion"
import { Settings, User, Lock, Mail, Palette, Database } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ThemeToggle } from "@/components/theme-toggle"

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          الإعدادات
        </h1>
        <p className="text-gray-500 dark:text-gray-400">
          إدارة إعدادات الحساب والنظام
        </p>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Account Settings */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white dark:bg-gray-900 rounded-2xl p-6 border border-gray-200 dark:border-gray-800 shadow-lg"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
              <User className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                إعدادات الحساب
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                معلومات الحساب الشخصي
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <Label>اسم المستخدم</Label>
              <Input defaultValue="doha alaraby" disabled className="mt-1" />
            </div>
            <div>
              <Label>البريد الإلكتروني</Label>
              <Input defaultValue="py.shepo@gmail.com" disabled className="mt-1" />
            </div>
            <Button variant="outline" className="w-full">
              تعديل المعلومات
            </Button>
          </div>
        </motion.div>

        {/* Security Settings */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white dark:bg-gray-900 rounded-2xl p-6 border border-gray-200 dark:border-gray-800 shadow-lg"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center shadow-lg">
              <Lock className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                الأمان
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                تغيير كلمة المرور
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <Label>كلمة المرور الحالية</Label>
              <Input type="password" className="mt-1" />
            </div>
            <div>
              <Label>كلمة المرور الجديدة</Label>
              <Input type="password" className="mt-1" />
            </div>
            <div>
              <Label>تأكيد كلمة المرور</Label>
              <Input type="password" className="mt-1" />
            </div>
            <Button className="w-full bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700">
              تغيير كلمة المرور
            </Button>
          </div>
        </motion.div>

        {/* Appearance Settings */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white dark:bg-gray-900 rounded-2xl p-6 border border-gray-200 dark:border-gray-800 shadow-lg"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center shadow-lg">
              <Palette className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                المظهر
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                تخصيص شكل النظام
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">الوضع الليلي</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">تفعيل الوضع الداكن</p>
              </div>
              <ThemeToggle />
            </div>
          </div>
        </motion.div>

        {/* System Settings */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white dark:bg-gray-900 rounded-2xl p-6 border border-gray-200 dark:border-gray-800 shadow-lg"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-gray-500 to-slate-600 flex items-center justify-center shadow-lg">
              <Database className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                النظام
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                إعدادات النظام والبيانات
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <Label>العام الدراسي الحالي</Label>
              <Input defaultValue="2025-2026" className="mt-1" />
            </div>
            <div>
              <Label>العملة</Label>
              <Input defaultValue="جنيه مصري (ج.م)" disabled className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline">
                تصدير البيانات
              </Button>
              <Button variant="outline">
                استيراد البيانات
              </Button>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
