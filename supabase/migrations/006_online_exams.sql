-- اختبارات إلكترونية + محاولات الطلاب + سياسات القراءة العامة
BEGIN;

CREATE TABLE IF NOT EXISTS exam_attempts (
  id TEXT PRIMARY KEY,
  exam_id TEXT NOT NULL,
  student_id TEXT,
  student_name TEXT NOT NULL,
  group_id TEXT NOT NULL DEFAULT '',
  grade_id TEXT NOT NULL DEFAULT '',
  answers JSONB NOT NULL DEFAULT '{}',
  score NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_marks NUMERIC(10,2) NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  submitted_at TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_exam_attempts_exam ON exam_attempts(exam_id);

ALTER TABLE exam_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated full access" ON exam_attempts;
CREATE POLICY "authenticated full access" ON exam_attempts FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "public read exams" ON exams;
CREATE POLICY "public read exams" ON exams FOR SELECT TO anon USING (
  jsonb_typeof(questions) = 'object'
  AND COALESCE(questions->>'allowOnline', 'false') = 'true'
);

DROP POLICY IF EXISTS "anon insert exam_attempts" ON exam_attempts;
CREATE POLICY "anon insert exam_attempts" ON exam_attempts FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "anon insert honorees" ON honorees;
CREATE POLICY "anon insert honorees" ON honorees FOR INSERT TO anon WITH CHECK (true);

GRANT SELECT ON exams TO anon;
GRANT INSERT ON exam_attempts TO anon;
GRANT INSERT ON honorees TO anon;
GRANT ALL PRIVILEGES ON exam_attempts TO authenticated, service_role;

COMMIT;
