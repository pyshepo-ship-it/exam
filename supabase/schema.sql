-- Supabase Setup for Exam Management System
-- Run this SQL in your Supabase SQL Editor

-- ============================================
-- 1. Create Auth User
-- ============================================
-- Note: You need to create the user manually in Supabase Dashboard
-- Go to Authentication > Users > Add User
-- Email: your-email@example.com
-- Password: your-secure-password

-- ============================================
-- 2. Create Tables
-- ============================================

-- Grades Table
CREATE TABLE IF NOT EXISTS grades (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  academic_year TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Groups Table
CREATE TABLE IF NOT EXISTS groups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  grade_id UUID REFERENCES grades(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  days TEXT[] NOT NULL DEFAULT '{}',
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  monthly_fee DECIMAL(10,2) NOT NULL DEFAULT 0,
  students_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Students Table
CREATE TABLE IF NOT EXISTS students (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  grade_id UUID REFERENCES grades(id) ON DELETE SET NULL,
  group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Dues Table
CREATE TABLE IF NOT EXISTS dues (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Payments Table
CREATE TABLE IF NOT EXISTS payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  payment_date DATE NOT NULL,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Exams Table
CREATE TABLE IF NOT EXISTS exams (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  grade_id UUID REFERENCES grades(id) ON DELETE SET NULL,
  group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  month INTEGER,
  unit TEXT,
  duration INTEGER,
  total_marks INTEGER,
  questions JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Sessions Table
CREATE TABLE IF NOT EXISTS sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  session_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Attendance Table
CREATE TABLE IF NOT EXISTS attendance (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'present',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(session_id, student_id)
);

-- ============================================
-- 3. Create Indexes for Performance
-- ============================================

CREATE INDEX IF NOT EXISTS idx_groups_grade_id ON groups(grade_id);
CREATE INDEX IF NOT EXISTS idx_students_grade_id ON students(grade_id);
CREATE INDEX IF NOT EXISTS idx_students_group_id ON students(group_id);
CREATE INDEX IF NOT EXISTS idx_dues_student_id ON dues(student_id);
CREATE INDEX IF NOT EXISTS idx_dues_group_id ON dues(group_id);
CREATE INDEX IF NOT EXISTS idx_payments_student_id ON payments(student_id);
CREATE INDEX IF NOT EXISTS idx_exams_grade_id ON exams(grade_id);
CREATE INDEX IF NOT EXISTS idx_exams_group_id ON exams(group_id);
CREATE INDEX IF NOT EXISTS idx_sessions_group_id ON sessions(group_id);
CREATE INDEX IF NOT EXISTS idx_attendance_session_id ON attendance(session_id);
CREATE INDEX IF NOT EXISTS idx_attendance_student_id ON attendance(student_id);

-- ============================================
-- 4. Enable Row Level Security (RLS)
-- ============================================

ALTER TABLE grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE dues ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 5. Create RLS Policies
-- ============================================

-- Grades Policies
CREATE POLICY "Enable all access for authenticated users" ON grades
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- Groups Policies
CREATE POLICY "Enable all access for authenticated users" ON groups
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- Students Policies
CREATE POLICY "Enable all access for authenticated users" ON students
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- Dues Policies
CREATE POLICY "Enable all access for authenticated users" ON dues
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- Payments Policies
CREATE POLICY "Enable all access for authenticated users" ON payments
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- Exams Policies
CREATE POLICY "Enable all access for authenticated users" ON exams
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- Sessions Policies
CREATE POLICY "Enable all access for authenticated users" ON sessions
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- Attendance Policies
CREATE POLICY "Enable all access for authenticated users" ON attendance
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================
-- 6. Create Updated At Trigger Function
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers to tables with updated_at
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

-- ============================================
-- Done! Your database is ready.
-- ============================================
