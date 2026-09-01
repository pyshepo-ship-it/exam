-- ============================================
-- 📚 مخطط قاعدة بيانات إدارة الدروس الخصوصية
-- ============================================
-- تشغيل هذا الملف في Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. جدول المستخدمين (مستخدم واحد فقط)
-- ============================================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 2. جدول الصفوف الدراسية
-- ============================================
CREATE TABLE grades (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  academic_year TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_grades_academic_year ON grades(academic_year);

-- ============================================
-- 3. جدول المجموعات
-- ============================================
CREATE TABLE groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  grade_id UUID REFERENCES grades(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  days JSONB NOT NULL DEFAULT '[]'::jsonb,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  monthly_fee DECIMAL(10,2) NOT NULL DEFAULT 0,
  academic_year TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_groups_grade ON groups(grade_id);
CREATE INDEX idx_groups_academic_year ON groups(academic_year);

-- ============================================
-- 4. جدول الطلاب
-- ============================================
CREATE TABLE students (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  phone TEXT,
  grade_id UUID REFERENCES grades(id) ON DELETE SET NULL,
  group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_students_grade ON students(grade_id);
CREATE INDEX idx_students_group ON students(group_id);
CREATE INDEX idx_students_name ON students(name);
CREATE INDEX idx_students_status ON students(status);

-- ============================================
-- 5. جدول الاستحقاقات المالية
-- ============================================
CREATE TABLE dues (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL CHECK (year >= 2020),
  amount DECIMAL(10,2) NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'partial')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(student_id, month, year)
);

CREATE INDEX idx_dues_student ON dues(student_id);
CREATE INDEX idx_dues_month_year ON dues(month, year);
CREATE INDEX idx_dues_status ON dues(status);

-- ============================================
-- 6. جدول المدفوعات
-- ============================================
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  due_id UUID REFERENCES dues(id) ON DELETE SET NULL,
  amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL CHECK (year >= 2020),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_payments_student ON payments(student_id);
CREATE INDEX idx_payments_month_year ON payments(month, year);
CREATE INDEX idx_payments_date ON payments(payment_date);

-- ============================================
-- 7. جدول الاختبارات
-- ============================================
CREATE TABLE exams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  grade_id UUID REFERENCES grades(id) ON DELETE CASCADE,
  group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  month INTEGER CHECK (month >= 1 AND month <= 12),
  unit TEXT,
  academic_year TEXT,
  duration INTEGER,
  total_marks INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_exams_grade ON exams(grade_id);
CREATE INDEX idx_exams_month ON exams(month);
CREATE INDEX idx_exams_academic_year ON exams(academic_year);

-- ============================================
-- 8. جدول الأسئلة الرئيسية
-- ============================================
CREATE TABLE questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exam_id UUID REFERENCES exams(id) ON DELETE CASCADE,
  question_type INTEGER NOT NULL CHECK (question_type >= 1 AND question_type <= 5),
  question_number INTEGER NOT NULL,
  order_number INTEGER NOT NULL,
  header_text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_questions_exam ON questions(exam_id);
CREATE INDEX idx_questions_order ON questions(order_number);

-- ============================================
-- 9. جدول الأسئلة الفرعية
-- ============================================
CREATE TABLE sub_questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
  order_number INTEGER NOT NULL,
  question_text TEXT NOT NULL,
  marks INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_sub_questions_question ON sub_questions(question_id);
CREATE INDEX idx_sub_questions_order ON sub_questions(order_number);

-- ============================================
-- 10. جدول الخيارات (للنوع 1: اختر)
-- ============================================
CREATE TABLE choices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sub_question_id UUID REFERENCES sub_questions(id) ON DELETE CASCADE,
  choice_key TEXT NOT NULL,
  choice_text TEXT NOT NULL,
  is_correct BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_choices_sub_question ON choices(sub_question_id);

-- ============================================
-- 11. جدول أجزاء السؤال (للنوع 2: أكمل)
-- ============================================
CREATE TABLE question_parts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sub_question_id UUID REFERENCES sub_questions(id) ON DELETE CASCADE,
  part_order INTEGER NOT NULL,
  part_text TEXT NOT NULL,
  blank_position TEXT CHECK (blank_position IN ('before', 'after', 'between')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_question_parts_sub_question ON question_parts(sub_question_id);

-- ============================================
-- 12. جدول التصحيحات (للنوع 5: صحح)
-- ============================================
CREATE TABLE corrections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sub_question_id UUID REFERENCES sub_questions(id) ON DELETE CASCADE,
  wrong_word TEXT NOT NULL,
  correct_answer TEXT NOT NULL,
  word_position INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_corrections_sub_question ON corrections(sub_question_id);

-- ============================================
-- 13. جدول الحصص
-- ============================================
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  session_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(group_id, session_date)
);

CREATE INDEX idx_sessions_group ON sessions(group_id);
CREATE INDEX idx_sessions_date ON sessions(session_date);

-- ============================================
-- 14. جدول الحضور والغياب
-- ============================================
CREATE TABLE attendance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'absent' CHECK (status IN ('present', 'absent', 'late', 'excused')),
  late_minutes INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(session_id, student_id)
);

CREATE INDEX idx_attendance_session ON attendance(session_id);
CREATE INDEX idx_attendance_student ON attendance(student_id);
CREATE INDEX idx_attendance_status ON attendance(status);

-- ============================================
-- Functions لحساب الرصيد
-- ============================================

-- Function لحساب إجمالي الاستحقاقات للطالب
CREATE OR REPLACE FUNCTION get_student_total_dues(student_uuid UUID)
RETURNS DECIMAL AS $$
BEGIN
  RETURN COALESCE(
    (SELECT SUM(amount) FROM dues WHERE student_id = student_uuid),
    0
  );
END;
$$ LANGUAGE plpgsql;

-- Function لحساب إجمالي المدفوعات للطالب
CREATE OR REPLACE FUNCTION get_student_total_payments(student_uuid UUID)
RETURNS DECIMAL AS $$
BEGIN
  RETURN COALESCE(
    (SELECT SUM(amount) FROM payments WHERE student_id = student_uuid),
    0
  );
END;
$$ LANGUAGE plpgsql;

-- Function لحساب رصيد الطالب (المتبقي عليه)
CREATE OR REPLACE FUNCTION get_student_balance(student_uuid UUID)
RETURNS DECIMAL AS $$
BEGIN
  RETURN get_student_total_dues(student_uuid) - get_student_total_payments(student_uuid);
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Triggers للتحديث التلقائي
-- ============================================

-- Trigger لتحديث updated_at تلقائياً
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- تطبيق Trigger على جميع الجداول التي تحتوي على updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_grades_updated_at BEFORE UPDATE ON grades
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_groups_updated_at BEFORE UPDATE ON groups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_students_updated_at BEFORE UPDATE ON students
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_dues_updated_at BEFORE UPDATE ON dues
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_exams_updated_at BEFORE UPDATE ON exams
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_questions_updated_at BEFORE UPDATE ON questions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sub_questions_updated_at BEFORE UPDATE ON sub_questions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sessions_updated_at BEFORE UPDATE ON sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Row Level Security (RLS)
-- ============================================

-- تفعيل RLS على جميع الجداول
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE dues ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sub_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE choices ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

-- Policies: السماح للمستخدم المصادق عليه بالوصول الكامل (مستخدم واحد فقط)
CREATE POLICY "Allow authenticated users full access" ON users
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users full access" ON grades
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users full access" ON groups
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users full access" ON students
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users full access" ON dues
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users full access" ON payments
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users full access" ON exams
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users full access" ON questions
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users full access" ON sub_questions
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users full access" ON choices
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users full access" ON question_parts
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users full access" ON corrections
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users full access" ON sessions
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users full access" ON attendance
  FOR ALL USING (auth.role() = 'authenticated');

-- ============================================
-- إدخال المستخدم الافتراضي
-- ============================================
-- ملاحظة: يجب تشغيل هذا بعد إعداد Supabase Auth
-- سيتم إنشاء المستخدم تلقائياً عند أول تسجيل دخول

-- ============================================
-- Views للتقارير
-- ============================================

-- View لعرض حالة الطلاب المالية
CREATE OR REPLACE VIEW student_financial_status AS
SELECT 
  s.id,
  s.name,
  s.phone,
  g.name as grade_name,
  gr.name as group_name,
  gr.monthly_fee,
  get_student_total_dues(s.id) as total_dues,
  get_student_total_payments(s.id) as total_payments,
  get_student_balance(s.id) as balance
FROM students s
LEFT JOIN grades g ON s.grade_id = g.id
LEFT JOIN groups gr ON s.group_id = gr.id
WHERE s.status = 'active';

-- View لعرض نسبة الحضور لكل طالب
CREATE OR REPLACE VIEW student_attendance_rate AS
SELECT 
  s.id,
  s.name,
  COUNT(a.id) as total_sessions,
  COUNT(CASE WHEN a.status = 'present' THEN 1 END) as present_count,
  COUNT(CASE WHEN a.status = 'absent' THEN 1 END) as absent_count,
  COUNT(CASE WHEN a.status = 'late' THEN 1 END) as late_count,
  COUNT(CASE WHEN a.status = 'excused' THEN 1 END) as excused_count,
  ROUND(
    COUNT(CASE WHEN a.status = 'present' THEN 1 END)::DECIMAL / 
    NULLIF(COUNT(a.id), 0) * 100, 
    2
  ) as attendance_rate
FROM students s
LEFT JOIN attendance a ON s.id = a.student_id
WHERE s.status = 'active'
GROUP BY s.id, s.name;

-- ============================================
-- نهاية المخطط
-- ============================================
