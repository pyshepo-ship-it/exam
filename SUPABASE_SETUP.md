# 🔐 إعداد Supabase - دليل كامل

## 📋 الخطوات المطلوبة

### 1️⃣ إنشاء مشروع Supabase

1. اذهب إلى [Supabase](https://supabase.com)
2. سجل دخول أو أنشئ حساب جديد
3. اضغط "New Project"
4. أدخل المعلومات:
   - **Name**: Exam Management System
   - **Database Password**: اختر كلمة مرور قوية (احتفظ بها!)
   - **Region**: اختر الأقرب لك
   - **Pricing Plan**: Free (مجاني)
5. اضغط "Create new project"
6. انتظر حتى يتم إنشاء المشروع (2-3 دقائق)

### 2️⃣ إنشاء حساب المستخدم

1. في لوحة تحكم Supabase، اذهب إلى **Authentication** → **Users**
2. اضغط **Add user** → **Create new user**
3. أدخل البيانات:
   - **Email**: بريدك الإلكتروني (مثال: `your-email@example.com`)
   - **Password**: كلمة مرور قوية (8 أحرف على الأقل)
   - **Auto Confirm User**: ✅ ضع علامة
4. اضغط **Create user**

**⚠️ مهم**: احتفظ بالبريد وكلمة المرور، ستحتاجهما لتسجيل الدخول!

### 3️⃣ إنشاء جداول قاعدة البيانات

1. اذهب إلى **SQL Editor**
2. اضغط **New query**
3. انسخ كامل محتوى ملف `supabase/schema.sql`
4. الصقه في المحرر
5. اضغط **Run** أو `Ctrl+Enter`
6. انتظر حتى تكتمل العملية (ستظهر رسالة "Success")

### 4️⃣ الحصول على مفاتيح API

1. اذهب إلى **Project Settings** → **API**
2. انسخ القيم التالية:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon public key**: `eyJhbGc...` (مفتاح طويل)

### 5️⃣ إعداد المتغيرات البيئية في Netlify

1. اذهب إلى [Netlify](https://netlify.com)
2. سجل دخول أو أنشئ حساب
3. اضغط **Add new site** → **Import an existing project**
4. اختر **GitHub** واختر repository الخاص بك
5. في صفحة الإعدادات:
   - **Build command**: `npm run build`
   - **Publish directory**: `.next`
6. قبل الضغط على Deploy، اضغط **Advanced** → **Add variable**
7. أضف المتغيرات التالية:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
```

**مهم**: لا تفعّل خيار **Contains secret values** لهذين المتغيرين. هما عامّان (`NEXT_PUBLIC_`) ويجب أن يظهرا في كود المتصفح. تفعيل الخيار يجعل Netlify يفشل البناء عند فحص الأسرار.

8. اضغط **Deploy site**

### 6️⃣ إعداد Netlify في Supabase

1. ارجع إلى Supabase
2. اذهب إلى **Authentication** → **URL Configuration**
3. في **Redirect URLs**، أضف:
```
https://your-site-name.netlify.app/**
```

4. في **Site URL**، أضف:
```
https://your-site-name.netlify.app
```

### 7️⃣ تفعيل إعادة تعيين كلمة المرور

1. في Supabase، اذهب إلى **Authentication** → **Email Templates**
2. اختر **Reset Password**
3. يمكنك تخصيص القالب أو تركه كما هو
4. اضغط **Save**

---

## 🎯 اختبار النظام

### تسجيل الدخول

1. افتح موقعك على Netlify
2. استخدم البريد وكلمة المرور اللذين أنشأتهما في الخطوة 2
3. يجب أن يتم تسجيل الدخول بنجاح

### إعادة تعيين كلمة المرور

1. في صفحة تسجيل الدخول، اضغط "نسيت كلمة المرور؟"
2. أدخل بريدك الإلكتروني
3. تحقق من بريدك واضغط على الرابط
4. أدخل كلمة مرور جديدة

---

## 🔒 الأمان

### ما تم تأمينه:

✅ **لا توجد بيانات حساسة في الكود**
- لا يوجد اسم مستخدم مشفر
- لا توجد كلمة مرور مشفرة
- كل شيء في Supabase

✅ **Row Level Security (RLS)**
- فقط المستخدمون المصادق عليهم يمكنهم الوصول للبيانات
- كل جدول محمي بـ RLS

✅ **متغيرات بيئية**
- المفاتيح في Netlify Environment Variables
- ليست في الكود أو Git

✅ **HTTPS**
- Netlify يوفر HTTPS تلقائياً
- جميع الاتصالات مشفرة

### نصائح إضافية:

1. **استخدم كلمة مرور قوية** لحساب Supabase
2. **فعّل Two-Factor Authentication** في Supabase
3. **راقب الاستخدام** في Supabase Dashboard
4. **انسخ احتياطياً** من قاعدة البيانات دورياً

---

## 📊 الحدود المجانية في Supabase

- **Database**: 500 MB
- **Storage**: 1 GB
- **Bandwidth**: 2 GB/شهر
- **Auth Users**: 50,000 مستخدم نشط/شهر
- **Edge Functions**: 500,000 استدعاء/شهر

**كافٍ جداً لمشروعك الشخصي!**

---

## 🚨 حل المشاكل الشائعة

### "Invalid login credentials"

- تأكد من إنشاء المستخدم في Supabase Authentication
- تأكد من تفعيل "Auto Confirm User"
- تأكد من استخدام البريد الصحيح

### "Database error"

- تأكد من تشغيل ملف `schema.sql` بنجاح
- تحقق من **Table Editor** في Supabase
- تأكد من وجود الجداول

### "CORS error"

- أضف رابط Netlify في **Redirect URLs** في Supabase
- تأكد من إضافة `/**` في نهاية الرابط

### "Build failed on Netlify"

- تأكد من إضافة المتغيرات البيئية
- تحقق من **Deploy logs** في Netlify
- تأكد من صحة المفاتيح

### "Secrets scanning found secrets in build"

Netlify يفحص مخرجات البناء عن قيم المتغيرات البيئية. مفاتيح `NEXT_PUBLIC_SUPABASE_URL` و `NEXT_PUBLIC_SUPABASE_ANON_KEY` عامة عمداً (Next.js يضعها في كود المتصفح، وSupabase يعتمد على RLS للحماية).

المشروع يعطّل فحص هذين المفتاحين عبر `SECRETS_SCAN_OMIT_KEYS` في `netlify.toml`. لا تعطّل فحص الأسرار بالكامل (`SECRETS_SCAN_ENABLED=false`).

إذا استمر الفشل، أضف نفس المتغير في Netlify Dashboard:

```
SECRETS_SCAN_OMIT_KEYS=NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY
```

---

## 📞 الدعم

- [Supabase Documentation](https://supabase.com/docs)
- [Netlify Documentation](https://docs.netlify.com)
- [Next.js Documentation](https://nextjs.org/docs)

---

## ✅ قائمة التحقق

- [ ] إنشاء مشروع Supabase
- [ ] إنشاء حساب المستخدم
- [ ] تشغيل ملف schema.sql
- [ ] نسخ API Keys
- [ ] إضافة المتغيرات في Netlify
- [ ] إعداد Redirect URLs
- [ ] Deploy الموقع
- [ ] اختبار تسجيل الدخول
- [ ] اختبار إعادة تعيين كلمة المرور

**🎉 مبروك! نظامك جاهز الآن!**
