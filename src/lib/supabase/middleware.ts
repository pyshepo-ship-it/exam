import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  // إذا لم يتم إعداد Supabase بعد، نسمح بالوصول
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey || supabaseUrl === 'your-supabase-url-here') {
    // Supabase غير مُعد، نسمح بالوصول لجميع الصفحات
    return NextResponse.next({ request })
  }

  // عندما يتم إعداد Supabase، سنضيف منطق المصادقة هنا
  return NextResponse.next({ request })
}
