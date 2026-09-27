export interface ScienceStampSymbol {
  id: string
  glyph: string
  name: string
  group: string
}

export interface PlacedScienceStamp {
  id: string
  symbolId: string
  page: number
  x: number
  y: number
  size: number
  rotation: number
  opacity: number
}

export const SCIENCE_STAMP_GROUPS = [
  { id: "chemistry", name: "الكيمياء", items: [["⚗️","دورق"],["🧪","أنبوب اختبار"],["🧫","طبق بتري"],["⚛️","ذرة"],["🔥","لهب"],["💧","قطرة"],["🧊","بلورة"],["☣️","مادة خطرة"],["♨️","تسخين"],["🧴","محلول"]] },
  { id: "physics", name: "الفيزياء", items: [["🧲","مغناطيس"],["💡","مصباح"],["🔋","بطارية"],["⚡","كهرباء"],["🔌","دائرة كهربائية"],["🌡️","حرارة"],["🔭","منظار"],["📡","موجات"],["⏱️","زمن"],["⚖️","ميزان"]] },
  { id: "biology", name: "الأحياء", items: [["🧬","حمض نووي"],["🔬","ميكروسكوب"],["🦠","كائن دقيق"],["🫀","قلب"],["🫁","رئتان"],["🧠","دماغ"],["🦴","عظام"],["🌿","نبات"],["🌱","إنبات"],["🩸","دم"]] },
  { id: "space", name: "الفضاء والفلك", items: [["🚀","صاروخ"],["🪐","كوكب"],["🌍","الأرض"],["🌙","القمر"],["☀️","الشمس"],["⭐","نجم"],["☄️","مذنب"],["🌌","مجرة"],["🛰️","قمر صناعي"],["👨‍🚀","رائد فضاء"]] },
  { id: "earth", name: "الأرض والبيئة", items: [["🌋","بركان"],["🏔️","جبل"],["🌊","محيط"],["☁️","سحاب"],["🌧️","مطر"],["🌪️","إعصار"],["♻️","إعادة تدوير"],["🍃","بيئة"],["💎","معدن"],["🏜️","صحراء"]] },
  { id: "energy", name: "الطاقة", items: [["🔆","طاقة شمسية"],["🌬️","طاقة رياح"],["💦","طاقة مائية"],["🏭","مصنع"],["🛢️","وقود"],["☢️","طاقة نووية"],["🔦","ضوء"],["🕯️","حرارة"],["🔁","تحول الطاقة"],["📈","زيادة الطاقة"]] },
  { id: "tools", name: "أدوات القياس", items: [["📏","مسطرة"],["📐","مثلث"],["🧭","بوصلة"],["⏲️","مؤقت"],["🕰️","ساعة"],["🔎","عدسة"],["🩺","سماعة"],["🧰","صندوق أدوات"],["🔧","مفتاح"],["⚙️","ترس"]] },
  { id: "math", name: "الرياضيات والهندسة", items: [["➕","جمع"],["➖","طرح"],["✖️","ضرب"],["➗","قسمة"],["🟰","يساوي"],["∞","لانهاية"],["π","باي"],["√","جذر"],["📊","رسم بياني"],["🔢","أرقام"]] },
  { id: "science", name: "العلوم العامة", items: [["👩‍🔬","عالمة"],["👨‍🔬","عالم"],["🥼","معطف مختبر"],["🥽","نظارة أمان"],["🧤","قفاز"],["📚","كتب"],["🔍","استكشاف"],["💭","فرضية"],["✅","نتيجة صحيحة"],["❓","سؤال علمي"]] },
  { id: "education", name: "التعليم والتقدير", items: [["🎓","تعليم"],["🏆","كأس"],["🥇","ميدالية"],["🎯","هدف"],["✏️","قلم"],["📝","ملاحظات"],["📌","تثبيت"],["🔔","تنبيه"],["👏","أحسنت"],["🌟","تميز"]] },
] as const

export const SCIENCE_STAMPS: ScienceStampSymbol[] = SCIENCE_STAMP_GROUPS.flatMap(group =>
  group.items.map(([glyph, name], index) => ({ id: `${group.id}-${index + 1}`, glyph, name, group: group.id }))
)

export function makeRandomStamps(groupId: string, count: number, pages = 2): PlacedScienceStamp[] {
  const symbols = SCIENCE_STAMPS.filter(symbol => symbol.group === groupId)
  if (!symbols.length) return []
  return Array.from({ length: count }, (_, index) => {
    const page = (index % Math.max(1, pages)) + 1
    const column = index % 4
    const row = Math.floor(index / 4) % 4
    return {
      id: `stamp-${Date.now()}-${index}`,
      symbolId: symbols[Math.floor(Math.random() * symbols.length)].id,
      page,
      x: 7 + column * 28 + Math.random() * 5,
      y: 10 + row * 24 + Math.random() * 7,
      size: 30,
      rotation: -18 + Math.random() * 36,
      opacity: 0.18,
    }
  })
}
