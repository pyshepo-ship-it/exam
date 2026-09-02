# 🎓 نظام إدارة الدروس الخصوصية

نظام متكامل لإدارة الدروس الخصوصية والطلاب والتحصيل المالي والاختبارات.

## ✨ المميزات

### 📚 الصفوف والمواعيد
- إدارة الصفوف الدراسية
- إنشاء مجموعات مع جداول زمنية
- عرض الجدول الأسبوعي للحصص

### 👥 الطلاب
- تسجيل الطلاب وربطهم بالمجموعات
- كشف حساب مفصل لكل طالب
- تصدير كشوف الحسابات إلى PDF

### 💰 التحصيل الشهري
- إدارة المستحقات والمدفوعات
- إنشاء استحقاقات شهرية تلقائية
- تتبع الأرصدة والمتأخرات

### 📝 الاختبارات
- إنشاء اختبارات بـ 5 أنواع من الأسئلة
- معاينة وتصدير الاختبارات إلى PDF
- إدارة بنوك الأسئلة

### ✅ الحضور والغياب
- تسجيل الحضور اليومي
- إحصائيات الحضور والغياب
- تقارير الحضور

### 📊 التقارير
- تقارير مالية شاملة
- تقارير الحضور
- تقارير الطلاب والمجموعات
- تصدير التقارير إلى PDF

### ⚙️ الإعدادات
- إدارة الحساب
- نسخ احتياطي للبيانات
- استعادة البيانات

## 🛠️ التقنيات المستخدمة

- **Frontend**: Next.js 14, TypeScript, Tailwind CSS
- **Backend**: Supabase (PostgreSQL, Auth, Storage)
- **UI Components**: shadcn/ui, Radix UI
- **Animations**: Framer Motion
- **PDF Export**: jsPDF, html2canvas
- **Notifications**: react-hot-toast
- **Hosting**: Vercel

## 🚀 الإعداد والتشغيل

### المتطلبات الأساسية

- Node.js 22 أو أحدث
- npm أو yarn
- حساب Supabase (مجاني)
- حساب Vercel (مجاني)

### 1️⃣ تثبيت المكتبات

```bash
npm install
```

### 2️⃣ إعداد Supabase

راجع ملف [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) للتعليمات الكاملة.

**ملخص سريع:**

1. أنشئ مشروع Supabase جديد
2. أنشئ حساب مستخدم في Authentication
3. شغّل ملف `supabase/schema.sql` في SQL Editor
4. انسخ مفاتيح API

### 3️⃣ إعداد المتغيرات البيئية

أنشئ ملف `.env.local` في جذر المشروع:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 4️⃣ التشغيل المحلي

```bash
npm run dev
```

افتح [http://localhost:3000](http://localhost:3000)

### 5️⃣ النشر على Vercel

1. ارفع الكود إلى GitHub
2. اذهب إلى [vercel.com](https://vercel.com) وسجّل الدخول بحساب GitHub
3. اضغط **Add New → Project** واختر repository الخاص بك
4. Vercel يتعرّف على المشروع تلقائياً (Next.js):
   - **Framework Preset**: Next.js
   - **Build Command**: `npm run build`
   - **Output Directory**: `.next` (الافتراضي)
5. قبل الضغط على Deploy، افتح **Environment Variables** وأضف:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
```

6. اضغط **Deploy**

بعد أول deploy، كل push على الفرع الرئيسي ينشر تلقائياً، وكل Pull Request يحصل على رابط معاينة (Preview).

راجع [vercel.json](./vercel.json) للإعدادات (إطار العمل وأوامر البناء وترويسات الأمان).

> **ملاحظة**: المشروع لم يعد يستخدم Netlify — تم حذف `netlify.toml` وإزالة حزمة `@netlify/plugin-nextjs`.

## 🔒 الأمان

### ✅ ما تم تأمينه:

- **لا توجد بيانات حساسة في الكود**
  - اسم المستخدم وكلمة المرور في Supabase فقط
  - المفاتيح في المتغيرات البيئية
  
- **Row Level Security (RLS)**
  - جميع الجداول محمية بـ RLS
  - فقط المستخدمون المصادق عليهم يمكنهم الوصول
  
- **HTTPS**
  - Vercel يوفر HTTPS تلقائياً
  - جميع الاتصالات مشفرة

- **Environment Variables**
  - المفاتيح ليست في Git
  - محمية في Vercel Dashboard

## 📁 هيكل المشروع

```
exam/
├── src/
│   ├── app/
│   │   ├── login/          # صفحة تسجيل الدخول
│   │   ├── dashboard/      # لوحة التحكم
│   │   │   ├── grades/     # الصفوف والمواعيد
│   │   │   ├── students/   # الطلاب
│   │   │   ├── payments/   # التحصيل الشهري
│   │   │   ├── exams/      # الاختبارات
│   │   │   ├── attendance/ # الحضور والغياب
│   │   │   ├── reports/    # التقارير
│   │   │   └── settings/   # الإعدادات
│   │   └── layout.tsx      # التخطيط الرئيسي
│   ├── components/
│   │   ├── ui/             # مكونات shadcn/ui
│   │   └── providers/      # Providers
│   └── lib/
│       ├── supabase/       # إعداد Supabase
│       ├── data-storage.ts # نظام التخزين
│       └── pdf-utils.ts    # دوال تصدير PDF
├── supabase/
│   └── schema.sql          # مخطط قاعدة البيانات
├── public/                 # الملفات الثابتة
├── .env.example            # مثال المتغيرات البيئية
├── vercel.json             # إعدادات Vercel
├── SUPABASE_SETUP.md       # دليل إعداد Supabase
└── README.md               # هذا الملف
```

## 📖 الاستخدام

### تسجيل الدخول

استخدم البريد الإلكتروني وكلمة المرور اللذين أنشأتهما في Supabase.

### إضافة البيانات

1. **الصفوف**: أضف الصفوف والمجموعات مع الجداول
2. **الطلاب**: سجل الطلاب واربطهم بالمجموعات
3. **التحصيل**: أنشئ استحقاقات وسجل المدفوعات
4. **الاختبارات**: أنشئ اختبارات وصدّرها PDF
5. **الحضور**: سجل الحضور اليومي

### النسخ الاحتياطي

اذهب إلى **الإعدادات** → **تصدير البيانات** لحفظ نسخة احتياطية.

## 🎨 الميزات المتقدمة

### 📅 الجدول الأسبوعي

عرض جميع الحصص في جدول أسبوعي مع ألوان مختلفة لكل يوم.

### 📄 تصدير PDF

- تصدير الاختبارات
- تصدير كشوف الحسابات
- تصدير التقارير

### 🔔 الإشعارات

إشعارات جميلة لجميع العمليات (نجاح، خطأ، تحذير).

### 🌓 الوضع الليلي

دعم كامل للوضع الليلي والنهاري.

### 📱 تصميم متجاوب

يعمل على جميع الأجهزة (جوال، تابلت، حاسوب).

## 🆘 الدعم

- **Supabase Docs**: [supabase.com/docs](https://supabase.com/docs)
- **Next.js Docs**: [nextjs.org/docs](https://nextjs.org/docs)
- **Vercel Docs**: [vercel.com/docs](https://vercel.com/docs)

## 📝 الترخيص

هذا المشروع للاستخدام الشخصي.

## 👨‍💻 المطور

تم التطوير بواسطة: doha alaraby

---

**ملاحظة**: هذا النظام مصمم للاستخدام الشخصي فقط. جميع البيانات محفوظة في Supabase وخاص بك.
