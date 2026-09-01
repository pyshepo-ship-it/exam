# 📚 مخطط مشروع إدارة الدروس الخصوصية

## 🎯 نظرة عامة
موقع شخصي لمستخدم واحد لإدارة الدروس الخصوصية والاختبارات والتحصيل المالي

---

## 🏛️ البنية التقنية

### Frontend
- **Framework**: Next.js 14 (App Router) أو React + Vite
- **Styling**: Tailwind CSS + shadcn/ui
- **State Management**: Zustand أو React Context
- **PDF Generation**: jsPDF + html2canvas أو react-pdf
- **Authentication**: Supabase Auth
- **Hosting**: Vercel

### Backend & Database
- **Platform**: Supabase
- **Database**: PostgreSQL
- **Authentication**: Supabase Auth (مستخدم واحد فقط)
- **Storage**: Supabase Storage (للـ PDFs)
- **Real-time**: Supabase Realtime (للتحديثات المباشرة)

---

## 📊 الأقسام الرئيسية والعلاقات

```
┌─────────────────────────────────────────────────────────────────┐
│                    🔐 صفحة تسجيل الدخول                         │
│              (مستخدم واحد - لا يوجد تسجيل جديد)                  │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                      🏠 لوحة التحكم                             │
└────────────────────┬────────────────────────────────────────────┘
                     │
        ┌────────────┼────────────┬────────────┬────────────┬────────────┬────────────┐
        │            │            │            │            │            │            │
        ▼            ▼            ▼            ▼            ▼            ▼            ▼
   ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐
   │ الصفوف │  │ الطلاب │  │التحصيل │  │الاختبا │  │التقارير│  │الحضور  │  │الإعدادات│
   │والمواعيد│  │        │  │ الشهري │  │  رات   │  │        │  │والغياب │  │        │
   └────┬───┘  └────┬───┘  └────┬───┘  └────┬───┘  └────┬───┘  └────┬───┘  └────────┘
        │           │           │           │           │
        │           │           │           │           │
        ▼           ▼           ▼           ▼           ▼
   ┌─────────────────────────────────────────────────────────┐
   │              🗄️ قاعدة البيانات (Supabase)                │
   └─────────────────────────────────────────────────────────┘
```

---

## 📂 القسم 1: الصفوف والمواعيد

### 🎯 الهدف
إدارة الصفوف الدراسية والمجموعات والمواعيد

### 📋 البيانات المطلوبة

#### جدول الصفوف (grades)
```sql
- id (PK)
- name (الصف الرابع الابتدائي، الصف الخامس...)
- academic_year (العام الدراسي: 2024-2025)
- created_at
- updated_at
```

#### جدول المجموعات (groups)
```sql
- id (PK)
- grade_id (FK → grades)
- name (مجموعة 1، مجموعة 2...)
- days (JSON: ["الأربعاء", "السبت"])
- start_time (16:00)
- end_time (17:00)
- monthly_fee (السعر الشهري للمجموعة)
- academic_year
- created_at
- updated_at
```

### 🔗 العلاقات
- **صف واحد → مجموعات متعددة** (One-to-Many)
- **مجموعة واحدة → طلاب متعددين** (One-to-Many)

### 💡 الميزات
- عرض الصفوف مع المجموعات
- تعديل/حذف الصفوف والمجموعات
- فلترة حسب العام الدراسي
- عرض المواعيد بشكل مرئي (تقويم أسبوعي)

---

## 📂 القسم 2: الطلاب

### 🎯 الهدف
إدارة بيانات الطلاب وربطهم بالمجموعات

### 📋 البيانات المطلوبة

#### جدول الطلاب (students)
```sql
- id (PK)
- name (اسم الطالب)
- phone (رقم الهاتف - اختياري)
- grade_id (FK → grades)
- group_id (FK → groups)
- status (نشط/غير نشط)
- notes (ملاحظات)
- created_at
- updated_at
```

### 🔗 العلاقات
- **طالب واحد → مجموعة واحدة** (Many-to-One)
- **طالب واحد → صف واحد** (Many-to-One)
- **طالب واحد → سجلات تحصيل متعددة** (One-to-Many)
- **طالب واحد → سجلات استحقاقات متعددة** (One-to-Many)

### 💡 الميزات
- إضافة/تعديل/حذف الطلاب
- البحث السريع عن الطلاب
- عرض الطلاب حسب المجموعة/الصف
- نقل طالب من مجموعة لأخرى
- إظهار رصيد الطالب الحالي

---

## 📂 القسم 3: التحصيل الشهري

### 🎯 الهدف
متابعة التحصيل المالي والاستحقاقات

### 📋 البيانات المطلوبة

#### جدول الاستحقاقات (dues)
```sql
- id (PK)
- student_id (FK → students)
- group_id (FK → groups)
- month (الشهر: 8)
- year (السنة: 2024)
- amount (المبلغ المستحق)
- status (مستحق/مدفوع/مدفوع جزئياً)
- created_at
- updated_at
```

#### جدول المدفوعات (payments)
```sql
- id (PK)
- student_id (FK → students)
- due_id (FK → dues - اختياري)
- amount (المبلغ المدفوع)
- payment_date (تاريخ الدفع)
- month (الشهر)
- year (السنة)
- notes (ملاحظات)
- created_at
- updated_at
```

### 🔗 العلاقات
- **استحقاق واحد → مدفوعات متعددة** (One-to-Many) - للدفع الجزئي
- **طالب واحد → استحقاقات متعددة** (One-to-Many)
- **طالب واحد → مدفوعات متعددة** (One-to-Many)

### 💡 الميزات

#### 1. تسجيل التحصيل
- اختيار الصف → المجموعة → الطالب (قوائم منسدلة متتابعة)
- أو بحث سريع عن الطالب
- إدخال المبلغ المدفوع
- إذا كان المبلغ أقل من المستحق → يتم تسجيله ويظهر الرصيد المتبقي

#### 2. الاستحقاق الشهري التلقائي
- زر "إنشاء استحقاق شهري"
- اختيار الشهر والسنة
- اختيار المجموعات (checkboxes)
- يتم إنشاء استحقاق لكل طالب في المجموعات المختارة بسعر المجموعة

#### 3. كشف حساب الطالب
- عرض جميع الشهور
- لكل شهر: المبلغ المستحق، المبلغ المدفوع، المتبقي
- علامة ✓ خضراء للمدفوع بالكامل
- علامة ✗ حمراء للمستحق
- زر طباعة/تصدير PDF

#### 4. حساب الرصيد
```
الرصيد = مجموع الاستحقاقات - مجموع المدفوعات
```

---

## 📂 القسم 4: الاختبارات

### 🎯 الهدف
إنشاء وإدارة الاختبارات وتحويلها لـ PDF

### 📋 البيانات المطلوبة

#### جدول الاختبارات (exams)
```sql
- id (PK)
- grade_id (FK → grades)
- group_id (FK → groups - اختياري)
- title (عنوان الاختبار)
- month (الشهر)
- unit (الوحدة - اختياري)
- academic_year
- duration (المدة بالدقائق)
- total_marks (الدرجة الكلية)
- created_at
- updated_at
```

#### جدول الأسئلة (questions)
```sql
- id (PK)
- exam_id (FK → exams)
- question_type (نوع السؤال: 1-5)
- question_number (رقم السؤال الرئيسي)
- order_number (ترتيب السؤال)
- header_text (نص رأس السؤال)
- created_at
- updated_at
```

#### جدول الأسئلة الفرعية (sub_questions)
```sql
- id (PK)
- question_id (FK → questions)
- order_number (ترتيب السؤال الفرعي)
- question_text (نص السؤال)
- marks (الدرجة)
- created_at
- updated_at
```

#### جدول الخيارات (choices) - للأسئلة من النوع 1
```sql
- id (PK)
- sub_question_id (FK → sub_questions)
- choice_key (أ، ب، ج، د)
- choice_text (نص الخيار)
- is_correct (هل هو الإجابة الصحيحة - اختياري)
- created_at
```

#### جدول أجزاء السؤال (question_parts) - للأسئلة من النوع 2
```sql
- id (PK)
- sub_question_id (FK → sub_questions)
- part_order (ترتيب الجزء)
- part_text (نص الجزء)
- blank_position (موقع الفراغ: قبل/بعد/بين)
```

#### جدول التصحيح (corrections) - للأسئلة من النوع 5
```sql
- id (PK)
- sub_question_id (FK → sub_questions)
- wrong_word (الكلمة الخطأ)
- correct_answer (الإجابة الصحيحة)
- word_position (موقع الكلمة في الجملة)
```

### 📝 أنواع الأسئلة الخمسة

#### النوع 1: اختر الإجابة الصحيحة
```
السؤال: الشمس هو نجم من المجموعة ___
أ- النجمية    ب- القمرية    ج- المذنبية    د- الشمسية

البيانات المطلوبة:
- نص السؤال (مع مكان الفراغ)
- 4-5 خيارات (أ، ب، ج، د، هـ)
```

#### النوع 2: أكمل (جملة ناقصة)
```
السؤال: الشمس نجم من المجموعة ___________

البيانات المطلوبة:
- الجزء الأول من الجملة
- الجزء الثاني (اختياري)
- موقع الفراغ (نهاية/وسط)
- الإجابة الصحيحة (اختياري)
```

#### النوع 3: ضع علامة صح أو خطأ
```
السؤال: الشمس أكبر من الأرض (    )

البيانات المطلوبة:
- نص الجملة
- الإجابة الصحيحة (اختياري)
```

#### النوع 4: علل / بم تفسر / اذكر أهمية (3 أشكال فرعية بنفس النمط)
```
الشكل أ - علل:
السؤال: علل: شروق الشمس من الشرق
الإجابة: ...........................................................................

الشكل ب - بم تفسر:
السؤال: بم تفسر: شروق الشمس من الشرق
الإجابة: ...........................................................................

الشكل ج - اذكر أهمية:
السؤال: اذكر أهمية: الشمس للكائنات الحية
الإجابة: ...........................................................................

البيانات المطلوبة:
- نوع السؤال الفرعي (علل/بم تفسر/اذكر أهمية)
- نص السؤال
- عدد الأسطر للإجابة (1-3)
- الإجابة النموذجية (اختياري)

ملاحظة: الأشكال الثلاثة تحمل نفس النمط من حيث الإدخال والإخراج
```

#### النوع 5: صحح ما تحته خط
```
السؤال: الشمس تشرق من الغرب
         --------
الإجابة: ...........................................................................

البيانات المطلوبة:
- نص الجملة كاملة
- الكلمات التي تحتها خط
- الإجابة الصحيحة
```

### 🔗 العلاقات
- **اختبار واحد → أسئلة متعددة** (One-to-Many)
- **سؤال رئيسي واحد → أسئلة فرعية متعددة** (One-to-Many)
- **سؤال فرعي من النوع 1 → خيارات متعددة** (One-to-Many)
- **سؤال فرعي من النوع 2 → أجزاء متعددة** (One-to-Many)

### 💡 الميزات

#### إنشاء الاختبار
1. اختيار الصف والمجموعة (اختياري)
2. إدخال عنوان الاختبار والشهر والوحدة
3. إضافة الأسئلة الرئيسية:
   - اختيار نوع السؤال (1-5)
   - إدخال نص رأس السؤال
   - تحديد عدد الأسئلة الفرعية (4-5)
   - إدخال كل سؤال فرعي حسب نوعه

#### تصدير PDF
- معاينة الاختبار قبل التصدير
- تنسيق احترافي للاختبار
- إضافة رأس وتذييل (اسم المدرسة، التاريخ...)
- تحميل PDF على الجوال
- حفظ نسخة في Supabase Storage

#### إدارة الاختبارات
- عرض جميع الاختبارات
- فلترة حسب الصف/الشهر/الوحدة
- تعديل/حذف الاختبارات
- نسخ اختبار موجود

---

## 📂 القسم 5: التقارير

### 🎯 الهدف
توفير تقارير ذكية وإحصائيات

### 📊 التقارير المقترحة

#### 1. تقرير التحصيل المالي
- إجمالي المستحقات لكل شهر
- إجمالي المحصل لكل شهر
- نسبة التحصيل
- الطلاب المتأخرين عن الدفع
- أفضل الطلاب التزاماً

#### 2. تقرير المجموعات
- عدد الطلاب في كل مجموعة
- إجمالي الإيرادات لكل مجموعة
- المجموعات الأكثر/الأقل عدداً

#### 3. تقرير الطلاب
- قائمة بجميع الطلاب
- حالة كل طالب (مدفوع/مستحق)
- رصيد كل طالب
- تاريخ آخر دفعة

#### 4. تقرير الاختبارات
- عدد الاختبارات لكل صف/شهر
- آخر الاختبارات المنشأة

#### 5. تقرير شهري شامل
- ملخص الشهر الحالي
- مقارنة بالشهر السابق
- رسوم بيانية

### 💡 الميزات
- فلترة التقارير حسب الفترة الزمنية
- رسوم بيانية تفاعلية
- تصدير التقارير (PDF/Excel)
- طباعة التقارير

---

## 📂 القسم 6: الحضور والغياب

### 🎯 الهدف
تسجيل حضور وغياب الطلاب لكل حصة

### 📋 البيانات المطلوبة

#### جدول الحصص (sessions)
```sql
- id (PK)
- group_id (FK → groups)
- session_date (تاريخ الحصة)
- start_time (وقت البداية)
- end_time (وقت النهاية)
- notes (ملاحظات)
- created_at
- updated_at
```

#### جدول الحضور (attendance)
```sql
- id (PK)
- session_id (FK → sessions)
- student_id (FK → students)
- status (حاضر/غائب/متأخر/إذن)
- late_minutes (عدد دقائق التأخير إن وُجد)
- notes (ملاحظات)
- created_at
```

### 🔗 العلاقات
- **مجموعة واحدة → حصص متعددة** (One-to-Many)
- **حصة واحدة → سجلات حضور متعددة** (One-to-Many)
- **طالب واحد → سجلات حضور متعددة** (One-to-Many)

### 💡 الميزات

#### تسجيل الحضور
- اختيار المجموعة → تظهر الحصة القادمة/الحالية
- عرض قائمة الطلاب مع أزرار سريعة (✓ حاضر / ✗ غائب / ⏰ متأخر / 📝 إذن)
- تسجيل سريع بنقرة واحدة لكل طالب
- زر "تحضير الكل" ثم تعديل الغائبين فقط

#### تقارير الحضور
- نسبة حضور كل طالب
- الطلاب كثيري الغياب (إنذار)
- تقرير شهري للحضور
- تقرير لكل مجموعة

#### إشعارات (ميزة مستقبلية)
- إشعار ولي الأمر عند الغياب
- إشعار عند التأخر المتكرر

---

## 📂 القسم 7: الإعدادات

### 🎯 الهدف
إدارة إعدادات الحساب والنظام

### ⚙️ الإعدادات المتاحة

#### 1. إعدادات الحساب
- تغيير كلمة المرور
- تغيير البريد الإلكتروني
- معلومات الحساب

#### 2. إعدادات النظام
- العام الدراسي الحالي
- العملة (جنيه مصري)
- تنسيق التاريخ
- اللغة (عربي)

#### 3. إعدادات المظهر
- الوضع الليلي/النهاري
- لون الثيم

#### 4. النسخ الاحتياطي
- تصدير جميع البيانات (JSON)
- استيراد البيانات
- جدولة النسخ الاحتياطي التلقائي

#### 5. استعادة كلمة المرور
- إرسال رابط إعادة التعيين إلى البريد الإلكتروني
- كلمة مرور مؤقتة

---

## 🔗 خريطة العلاقات الكاملة

```
┌──────────────┐
│   grades     │
│   (الصفوف)    │
└──────┬───────┘
       │ 1:N
       │
       ├──────────────────────────────┐
       │                              │
       ▼                              ▼
┌──────────────┐              ┌──────────────┐
│   groups     │              │   exams      │
│  (المجموعات)  │              │ (الاختبارات)  │
└──────┬───────┘              └──────┬───────┘
       │ 1:N                         │ 1:N
       │                             │
       ├──────────────┐              ▼
       │              │       ┌──────────────┐
       │              │       │  questions   │
       │              │       │   (الأسئلة)   │
       │              │       └──────┬───────┘
       │              │              │ 1:N
       │              │              │
       │              │              ▼
       │              │       ┌──────────────┐
       │              │       │sub_questions │
       │              │       │(أسئلة فرعية)  │
       │              │       └──────┬───────┘
       │              │              │
       │              │              ├──────────┬──────────┐
       │              │              │          │          │
       │              │              ▼          ▼          ▼
       │              │       ┌──────────┐ ┌────────┐ ┌──────────┐
       │              │       │ choices  │ │ parts  │ │corrections│
       │              │       │ (خيارات) │ │(أجزاء) │ │ (تصحيحات) │
       │              │       └──────────┘ └────────┘ └──────────┘
       │              │
       ▼              │
┌──────────────┐      │
│  students    │      │
│   (الطلاب)    │      │
└──────┬───────┘      │
       │ 1:N          │
       │              │
       ├──────────────┤
       │              │
       ▼              ▼
┌──────────────┐  ┌──────────────┐
│    dues      │  │  payments    │
│ (الاستحقاقات) │  │  (المدفوعات)  │
└──────────────┘  └──────────────┘
```

---

## 🗄️ مخطط قاعدة البيانات التفصيلي

### الجداول الأساسية

```sql
-- 1. المستخدمين (مستخدم واحد فقط)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. الصفوف
CREATE TABLE grades (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  academic_year TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 3. المجموعات
CREATE TABLE groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  grade_id UUID REFERENCES grades(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  days JSONB NOT NULL, -- ["الأربعاء", "السبت"]
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  monthly_fee DECIMAL(10,2) NOT NULL,
  academic_year TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 4. الطلاب
CREATE TABLE students (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  phone TEXT,
  grade_id UUID REFERENCES grades(id) ON DELETE SET NULL,
  group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'active', -- active, inactive
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 5. الاستحقاقات
CREATE TABLE dues (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  status TEXT DEFAULT 'pending', -- pending, paid, partial
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(student_id, month, year)
);

-- 6. المدفوعات
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  due_id UUID REFERENCES dues(id) ON DELETE SET NULL,
  amount DECIMAL(10,2) NOT NULL,
  payment_date DATE NOT NULL,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 7. الاختبارات
CREATE TABLE exams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  grade_id UUID REFERENCES grades(id) ON DELETE CASCADE,
  group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  month INTEGER,
  unit TEXT,
  academic_year TEXT,
  duration INTEGER, -- بالدقائق
  total_marks INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 8. الأسئلة الرئيسية
CREATE TABLE questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exam_id UUID REFERENCES exams(id) ON DELETE CASCADE,
  question_type INTEGER NOT NULL, -- 1-5
  question_number INTEGER NOT NULL,
  order_number INTEGER NOT NULL,
  header_text TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 9. الأسئلة الفرعية
CREATE TABLE sub_questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
  order_number INTEGER NOT NULL,
  question_text TEXT NOT NULL,
  marks INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 10. الخيارات (للنوع 1)
CREATE TABLE choices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sub_question_id UUID REFERENCES sub_questions(id) ON DELETE CASCADE,
  choice_key TEXT NOT NULL, -- أ، ب، ج، د
  choice_text TEXT NOT NULL,
  is_correct BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 11. أجزاء السؤال (للنوع 2)
CREATE TABLE question_parts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sub_question_id UUID REFERENCES sub_questions(id) ON DELETE CASCADE,
  part_order INTEGER NOT NULL,
  part_text TEXT NOT NULL,
  blank_position TEXT, -- before, after, between
  created_at TIMESTAMP DEFAULT NOW()
);

-- 12. التصحيحات (للنوع 5)
CREATE TABLE corrections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sub_question_id UUID REFERENCES sub_questions(id) ON DELETE CASCADE,
  wrong_word TEXT NOT NULL,
  correct_answer TEXT NOT NULL,
  word_position INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 13. الحصص
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  session_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(group_id, session_date)
);

-- 14. الحضور والغياب
CREATE TABLE attendance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'absent', -- present, absent, late, excused
  late_minutes INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(session_id, student_id)
);
```

### الفهارس (Indexes)
```sql
-- لتحسين الأداء
CREATE INDEX idx_groups_grade ON groups(grade_id);
CREATE INDEX idx_students_grade ON students(grade_id);
CREATE INDEX idx_students_group ON students(group_id);
CREATE INDEX idx_dues_student ON dues(student_id);
CREATE INDEX idx_dues_month_year ON dues(month, year);
CREATE INDEX idx_payments_student ON payments(student_id);
CREATE INDEX idx_questions_exam ON questions(exam_id);
CREATE INDEX idx_sub_questions_question ON sub_questions(question_id);
```

---

## 🎨 واجهة المستخدم

### الصفحات الرئيسية

1. **صفحة تسجيل الدخول** (`/login`)
   - حقل اسم المستخدم
   - حقل كلمة المرور
   - زر تسجيل الدخول
   - رابط نسيت كلمة المرور

2. **لوحة التحكم** (`/dashboard`)
   - نظرة عامة
   - إحصائيات سريعة
   - آخر النشاطات

3. **الصفوف والمواعيد** (`/grades`)
   - قائمة الصفوف
   - تفاصيل كل صف مع المجموعات
   - إضافة/تعديل

4. **الطلاب** (`/students`)
   - قائمة الطلاب
   - بحث وفلترة
   - إضافة/تعديل

5. **التحصيل** (`/payments`)
   - تسجيل تحصيل جديد
   - استحقاق شهري
   - كشوف الحسابات

6. **الاختبارات** (`/exams`)
   - قائمة الاختبارات
   - إنشاء اختبار جديد
   - معاينة وتصدير

7. **التقارير** (`/reports`)
   - أنواع التقارير
   - عرض وطباعة

8. **الإعدادات** (`/settings`)
   - إعدادات الحساب
   - إعدادات النظام

### 🌓 الوضع الليلي/النهاري
- تبديل سهل من الشريط العلوي
- حفظ التفضيل في localStorage
- ألوان مريحة للعين

### 📱 التصميم المتجاوب
- يعمل على الجوال والتابلت والحاسوب
- قائمة جانبية قابلة للطي على الجوال

---

## 🚀 خطة التطوير المقترحة

### المرحلة 1: الأساسيات (أسبوع 1-2)
- [x] إعداد المشروع (Next.js + Supabase)
- [ ] إعداد قاعدة البيانات
- [ ] نظام المصادقة
- [ ] صفحة تسجيل الدخول
- [ ] لوحة التحكم الأساسية

### المرحلة 2: إدارة الصفوف والطلاب (أسبوع 3-4)
- [ ] قسم الصفوف والمجموعات
- [ ] قسم الطلاب
- [ ] البحث والفلترة

### المرحلة 3: النظام المالي (أسبوع 5-6)
- [ ] قسم التحصيل
- [ ] الاستحقاق الشهري التلقائي
- [ ] كشوف الحسابات
- [ ] حساب الأرصدة

### المرحلة 4: نظام الاختبارات (أسبوع 7-9)
- [ ] إنشاء الاختبارات
- [ ] أنواع الأسئلة الخمسة
- [ ] معاينة الاختبار
- [ ] تصدير PDF

### المرحلة 5: التقارير والإعدادات (أسبوع 10)
- [ ] التقارير الذكية
- [ ] الرسوم البيانية
- [ ] الإعدادات
- [ ] النسخ الاحتياطي

### المرحلة 6: التحسينات (أسبوع 11-12)
- [ ] تحسين الأداء
- [ ] اختبار شامل
- [ ] إصلاح الأخطاء
- [ ] النشر النهائي

---

## 💰 التكلفة المتوقعة

### Supabase (Free Tier)
- ✅ 500 MB قاعدة بيانات
- ✅ 1 GB تخزين
- ✅ 50,000 مستخدم نشط شهرياً
- ✅ 2 GB bandwidth
- **المشروع الشخصي يكفي تماماً**

### Vercel (Free Tier)
- ✅ 100 GB bandwidth
- ✅ Serverless functions
- ✅ SSL certificate
- **كافي للمشروع الشخصي**

### Domain (اختياري)
- ~10-15$ سنوياً

**الإجمالي: 0$ (مجاني تماماً)**

---

## 🔒 الأمان

### المصادقة
- كلمة مرور مشفرة (bcrypt)
- JWT tokens
- حماية الصفحات (middleware)

### البيانات
- Row Level Security (RLS) في Supabase
- تشفير البيانات الحساسة
- نسخ احتياطي منتظم

### استعادة كلمة المرور
- إرسال رابط إعادة التعيين للبريد
- كلمة مرور مؤقتة صالحة لمدة ساعة

---

## 📈 ميزات مستقبلية مقترحة

1. **إشعارات WhatsApp**
   - تذكير الطلاب بالمواعيد
   - إشعار بالأقساط المستحقة

2. **تطبيق موبايل**
   - PWA (Progressive Web App)
   - إشعارات فورية

3. **نظام الحضور والغياب**
   - تسجيل حضور كل حصة
   - تقارير الحضور

4. **رسائل للطلاب**
   - إرسال رسائل جماعية
   - ملاحظات لكل طالب

5. **نظام الواجبات**
   - تعيين واجبات
   - متابعة التسليم

---

## ✅ ملخص الميزات المطلوبة

- ✅ تسجيل المجموعات حسب الصف والوقت واليوم
- ✅ تسجيل الطلاب داخل المجموعات
- ✅ نظام تحصيل مع رصيد واستحقاقات
- ✅ استحقاق شهري تلقائي
- ✅ كشف حساب للطالب
- ✅ إنشاء اختبارات بـ 5 أنواع من الأسئلة
- ✅ تصدير الاختبارات لـ PDF
- ✅ تقارير ذكية
- ✅ إعدادات الحساب
- ✅ وضع ليلي/نهاري
- ✅ مستخدم واحد فقط
- ✅ صفحة تسجيل دخول فقط
- ✅ استعادة كلمة المرور عبر البريد

---

## 🎯 التوصيات النهائية

1. **ابدأ بالأساسيات**: ركز على الأقسام 1-3 أولاً
2. **اختبر باستمرار**: جرب كل ميزة بعد تطويرها
3. **النسخ الاحتياطي**: قم بتصدير البيانات أسبوعياً
4. **البساطة**: لا تضف ميزات غير ضرورية
5. **الأداء**: استخدم الفهارس وتحسين الاستعلامات

---

## 📞 الدعم

في حالة الحاجة للمساعدة:
- Supabase Documentation
- Next.js Documentation
- Tailwind CSS Documentation

---

**ملاحظة**: هذا المشروع مصمم ليكون بسيط وفعال لمستخدم واحد، ويمكن تطويره لاحقاً إذا لزم الأمر.
