/**
 * الإعدادات الافتراضية لتوقيع المعلمة وخاتمة الصفحات والاختبارات
 */
import { queuePush, pushSetting } from "./supabase/sync"
import { readSetting, writeSetting } from "./memory-store"

export const DEFAULT_TEACHER_SIGNATURE_LINE = "مع تمنياتي لكم بالتوفيق والنجاح"
export const DEFAULT_TEACHER_NAME = "أ/ ضحى العربي"

/** التوقيع الثابت (متوافق مع الشيفرات القديمة وفحوصات التدقيق) */
export const TEACHER_SIGNATURE_LINE = DEFAULT_TEACHER_SIGNATURE_LINE
export const TEACHER_NAME = DEFAULT_TEACHER_NAME
export const TEACHER_SIGNATURE = `${TEACHER_SIGNATURE_LINE} ${TEACHER_NAME}`

// الإعدادات مكانها جدول app_settings في Supabase (تصل مع pullAllData/fetchPublicData)،
// وذاكرة الجلسة للعرض الفوري فقط — لا يُكتب شيء على الجهاز.

/** قراءة عبارة التمني المخصصة من الإعدادات */
export const getTeacherSignatureLine = (): string =>
  readSetting("teacherSignatureLine", "") || DEFAULT_TEACHER_SIGNATURE_LINE

/** حفظ عبارة التمني المخصصة في Supabase (لتظهر للطلاب من أي جهاز) */
export const setTeacherSignatureLine = (line: string): void => {
  writeSetting("teacherSignatureLine", line)
  queuePush(() => pushSetting("teacherSignatureLine", line))
}

/** قراءة اسم المعلمة / اللقب المخصص من الإعدادات */
export const getTeacherName = (): string =>
  readSetting("teacherName", "") || DEFAULT_TEACHER_NAME

/** حفظ اسم المعلمة / اللقب المخصص في Supabase (لتظهر للطلاب من أي جهاز) */
export const setTeacherName = (name: string): void => {
  writeSetting("teacherName", name)
  queuePush(() => pushSetting("teacherName", name))
}
