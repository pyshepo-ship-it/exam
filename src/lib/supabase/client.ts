import { createBrowserClient } from '@supabase/ssr'

// يتحقق مما إذا كانت متغيرات بيئة Supabase مُعدّة.
// يُستخدم للسماح بتشغيل الوضع المحلي (localStorage) عندما لا يكون Supabase متصلاً بعد.
export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
}

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'Missing Supabase environment variables. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY'
    )
  }
  
  return createBrowserClient(supabaseUrl, supabaseKey)
}
