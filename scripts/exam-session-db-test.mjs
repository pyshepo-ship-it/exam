/**
 * Real PostgreSQL integration tests, including row/advisory-lock races.
 * Requires a DISPOSABLE local database with schema.sql + migrations 018–028.
 * TEST_DATABASE_URL=postgresql://.../exam_test npm run test:exam-db
 * The runner applies 029 twice, runs the SQL assertions as anon, then tests locks.
 * Never connect this script to a live Supabase/production database.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { setTimeout as delay } from "node:timers/promises"
import pg from "pg"

const target = process.env.TEST_DATABASE_URL
if (!target) throw new Error("Set TEST_DATABASE_URL to a disposable LOCAL PostgreSQL database ending in _test or _regression")
const url = new URL(target)
const host = url.searchParams.get("host") || url.hostname
const database = decodeURIComponent(url.pathname.slice(1))
if (!(host.startsWith("/") || ["localhost", "127.0.0.1", "[::1]"].includes(host)) || !/_(test|regression)$/.test(database)) {
  throw new Error("Refusing a non-local or non-test database. This runner is for disposable local databases only.")
}
const admin = new pg.Client({ connectionString: target })
const worker = new pg.Client({ connectionString: target })
const suffix = randomUUID()
const examId = `lock-exam-${suffix}`
const sessionId = `lock-session-${suffix}`
const attemptId = `lock-attempt-${suffix}`
const closedId = `closed-session-${suffix}`
let pass = 0
const passed = name => { console.log(`✅ ${name}`); pass++ }

await admin.connect()
await worker.connect()
try {
  await admin.query("SET statement_timeout = '10s'; SET search_path = public, extensions")
  await worker.query("SET statement_timeout = '10s'; SET ROLE anon")
  const migration = readFileSync(new URL("../supabase/migrations/029_exam_clock_and_result_privacy.sql", import.meta.url), "utf8")
  await admin.query(migration)
  await admin.query(migration)
  passed("Migration 029 applies and is idempotent on real PostgreSQL")
  await admin.query(readFileSync(new URL("../supabase/tests/exam_session_regression.sql", import.meta.url), "utf8"))
  passed("All SQL assertions: duration, early/late submit, ownership, guest access, release gates, grants, and idempotency")

  await admin.query(`INSERT INTO public.exams(id, title, academic_year, duration, questions, created_at, updated_at)
    VALUES ($1, 'Lock regression only', '', 30, '{"deliveryMode":"online","allowOnline":true,"accessMode":"public","items":[]}', '', '')`, [examId])
  // Diagnose unknown flags without treating them as false, including orphaned rows.
  const diagnosticCases = [
    { name: "false", meta: { timedOut: false }, status: "recorded", flag: "false" },
    { name: "true", meta: { timedOut: true }, status: "recorded", flag: "true" },
    { name: "missing-flag", meta: {}, status: "flag_missing", flag: null },
    { name: "missing-meta", meta: null, status: "metadata_missing", flag: null },
    { name: "null-flag", meta: { timedOut: null }, status: "flag_null", flag: null },
    { name: "invalid-flag", meta: { timedOut: "false" }, status: "flag_invalid", flag: "false" },
    { name: "invalid-meta", meta: [], status: "metadata_invalid", flag: null },
    { name: "missing-attempt", missing: true, status: "attempt_missing", flag: null },
  ].map(test => ({ ...test, id: `diagnostic-${test.name}-${suffix}` }))
  try {
    for (const test of diagnosticCases) {
      await admin.query(`INSERT INTO public.online_exam_sessions
        (id, attempt_id, session_secret, exam_id, student_name, answers, started_at, expires_at, submitted_at)
        VALUES ($1,$1,'test-only-secret',$2,'Diagnostic Guest','{"one":{"text":"test-only answer"}}',
          now()-interval '20 seconds',now()+interval '3580 seconds',now())`, [test.id, examId])
      if (!test.missing) {
        await admin.query(`INSERT INTO public.exam_attempts
          (id, exam_id, student_name, group_id, grade_id, answers, score, total_marks,
           started_at, submitted_at, duration_seconds, manual_override)
          VALUES ($1,$2,'Diagnostic Guest','','','{"one":{"text":"test-only answer"}}',0,1,
            (now()-interval '20 seconds')::text,now()::text,20,$3::jsonb)`,
          [test.id, examId, test.meta === null ? null : JSON.stringify(test.meta)])
      }
    }
    const results = await admin.query(readFileSync(new URL("../supabase/exam_timer_diagnostics.sql", import.meta.url), "utf8"))
    const selects = results.filter(result => result.command === "SELECT")
    const details = selects.at(-1).rows
    for (const test of diagnosticCases) {
      const row = details.find(row => row.session_id === test.id)
      assert.ok(row, `Early submission was excluded: ${test.name}`)
      assert.equal(row.timeout_metadata_status, test.status)
      assert.equal(row.server_timed_out, test.flag)
      assert.equal(row.deadline_reached_at_submission, false)
      assert.equal(row.attempt_found, !test.missing)
      assert.equal(row.attempt_matches_session, test.missing ? null : true)
      assert.equal(Number(row.session_answer_entries), 1)
      assert.equal(row.attempt_answer_entries, test.missing ? null : "1")
      assert.equal(row.has_conditional_submit, true)
      assert.equal(row.unsafe_legacy_submit_signature, false)
      assert.ok(!("answers" in row) && !("session_secret" in row) && !("student_name" in row))
    }
    const summary = selects[2].rows.find(row => row.exam_id === examId)
    assert.equal(Number(summary.early_submissions_to_review), 8)
    assert.equal(Number(summary.submitted_without_attempt), 1)
    assert.equal(Number(summary.unknown_timeout_flags), 5)
    assert.equal(Number(summary.timeout_flag_conflicts), 1)
    passed("Read-only diagnostics distinguish false, unknown/malformed metadata, missing attempts, and flag/clock conflicts")
  } finally {
    await admin.query("ROLLBACK")
    const ids = diagnosticCases.map(test => test.id)
    await admin.query("DELETE FROM public.exam_attempts WHERE id=ANY($1::text[])", [ids])
    await admin.query("DELETE FROM public.online_exam_sessions WHERE id=ANY($1::text[])", [ids])
  }

  const { rows: [{ pid }] } = await worker.query("SELECT pg_backend_pid() AS pid")
  // Bounded database synchronization, not an arbitrary sleep pretending a lock occurred.
  const waitUntilBlocked = async () => {
    for (let tries = 0; tries < 100; tries++) {
      const { rows: [{ blocked }] } = await admin.query("SELECT cardinality(pg_blocking_pids($1)) > 0 AS blocked", [pid])
      if (blocked) return
      await delay(10)
    }
    throw new Error("Worker did not reach the expected database lock")
  }
  const start = (id, attempt) => worker.query(`SELECT public.start_online_exam_session($1,$2,$3,NULL,'Lock Guest') AS result`, [id, attempt, examId])
  const lockKey = `${examId}:lock guest:`

  await admin.query("BEGIN")
  await admin.query("SELECT pg_advisory_xact_lock(hashtext($1))", [lockKey])
  const pendingStart = start(sessionId, attemptId)
  await waitUntilBlocked()
  const { rows: [{ releasedAt }] } = await admin.query('SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint AS "releasedAt"')
  await admin.query("COMMIT")
  const { rows: [{ result: session }] } = await pendingStart
  assert.ok(Date.parse(session.startedAt) >= Number(releasedAt), "Waiting for an advisory lock consumed exam time")
  assert.equal(Date.parse(session.expiresAt) - Date.parse(session.startedAt), 1800000)
  passed("New session time starts after advisory-lock waits, with the full duration")

  // Set a near deadline inside a transaction, then let a student request wait past it.
  await admin.query("BEGIN")
  await admin.query(`UPDATE public.online_exam_sessions SET
    started_at=clock_timestamp()-interval '60 seconds', expires_at=clock_timestamp()+interval '200 milliseconds'
    WHERE id=$1`, [session.id])
  const pendingSave = worker.query("SELECT public.save_online_exam_progress($1,$2,$3) AS result", [session.id, session.secret, { late: { text: "late save" } }])
  await waitUntilBlocked()
  await delay(250)
  await admin.query("COMMIT")
  assert.equal((await pendingSave).rows[0].result.state, "expired")
  assert.deepEqual((await admin.query("SELECT answers FROM public.online_exam_sessions WHERE id=$1", [session.id])).rows[0].answers, {})
  passed("Progress waiting on a row lock is checked against the time AFTER the lock")

  await admin.query("BEGIN")
  await admin.query(`UPDATE public.online_exam_sessions SET
    answers='{"accepted":{"text":"Before deadline"}}', started_at=clock_timestamp()-interval '60 seconds',
    expires_at=clock_timestamp()+interval '200 milliseconds' WHERE id=$1`, [session.id])
  const pendingSubmit = worker.query("SELECT public.submit_online_exam_session($1,$2,$3,false) AS result", [session.id, session.secret, { late: { text: "late submit" } }])
  await waitUntilBlocked()
  await delay(250)
  await admin.query("COMMIT")
  const timedOut = (await pendingSubmit).rows[0].result
  assert.equal(timedOut.timedOut, true)
  assert.deepEqual(timedOut.attempt.answers, { accepted: { text: "Before deadline" } })
  passed("Submission waiting past expiry uses only the previously accepted answers")

  await admin.query(`UPDATE public.exams SET questions=questions || jsonb_build_object(
    'availabilityMode','scheduled', 'availableFrom',clock_timestamp()-interval '1 minute',
    'availableUntil',clock_timestamp()+interval '200 milliseconds') WHERE id=$1`, [examId])
  await admin.query("BEGIN")
  await admin.query("SELECT pg_advisory_xact_lock(hashtext($1))", [lockKey])
  const pendingClosed = start(closedId, `closed-attempt-${suffix}`).then(() => null, error => error)
  await waitUntilBlocked()
  await delay(250)
  await admin.query("COMMIT")
  assert.match((await pendingClosed)?.message || "", /غير متاح/)
  assert.equal((await admin.query("SELECT 1 FROM public.online_exam_sessions WHERE id=$1", [closedId])).rowCount, 0)
  passed("A scheduling window is rechecked if it closes while waiting for the start lock")
  console.log(`\nPostgreSQL exam regression groups: ${pass} passed`)
} finally {
  await admin.query("ROLLBACK")
  // These UUIDs were generated for this run only; no broad deletes or production data.
  await admin.query("DELETE FROM public.exam_attempts WHERE id=$1", [attemptId])
  await admin.query("DELETE FROM public.online_exam_sessions WHERE id=ANY($1::text[])", [[sessionId, closedId]])
  await admin.query("DELETE FROM public.exams WHERE id=$1", [examId])
  await Promise.all([worker.end(), admin.end()])
}
