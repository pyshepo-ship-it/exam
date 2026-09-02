/**
 * الإعدادات الافتراضية لتوقيع المعلمة وخاتمة الصفحات والاختبارات
 */
export const DEFAULT_TEACHER_SIGNATURE_LINE = "مع تمنياتي لكم بالتوفيق والنجاح"
export const DEFAULT_TEACHER_NAME = "أ/ ضحى العربي"

/** التوقيع الثابت (متوافق مع الشيفرات القديمة وفحوصات التدقيق) */
export const TEACHER_SIGNATURE_LINE = DEFAULT_TEACHER_SIGNATURE_LINE
export const TEACHER_NAME = DEFAULT_TEACHER_NAME
export const TEACHER_SIGNATURE = `${TEACHER_SIGNATURE_LINE} ${TEACHER_NAME}`

/** قراءة عبارة التمني المخصصة من الإعدادات */
export const getTeacherSignatureLine = (): string => {
  if (typeof window === "undefined") return DEFAULT_TEACHER_SIGNATURE_LINE
  return localStorage.getItem("teacherSignatureLine") || DEFAULT_TEACHER_SIGNATURE_LINE
}

/** حفظ عبارة التمني المخصصة في الإعدادات */
export const setTeacherSignatureLine = (line: string): void => {
  if (typeof window === "undefined") return
  localStorage.setItem("teacherSignatureLine", line)
}

/** قراءة اسم المعلمة / اللقب المخصص من الإعدادات */
export const getTeacherName = (): string => {
  if (typeof window === "undefined") return DEFAULT_TEACHER_NAME
  return localStorage.getItem("teacherName") || DEFAULT_TEACHER_NAME
}

/** حفظ اسم المعلمة / اللقب المخصص في الإعدادات */
export const setTeacherName = (name: string): void => {
  if (typeof window === "undefined") return
  localStorage.setItem("teacherName", name)
}
