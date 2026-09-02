import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({
    request: {
      headers: req.headers,
    },
  })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // إذا لم يتم إعداد Supabase بعد، نسمح بالوصول لجميع الصفحات (وضع العمل المحلي).
  if (!supabaseUrl || !supabaseKey) {
    return res
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value))
          res = NextResponse.next({
            request: {
              headers: req.headers,
            },
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // استخدام getUser للتحقق الصارم والمشفر من صلاحية التوكين مع خادم المصادقة
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // إذا لم يكن المستخدم مسجلاً ويحاول دخول مسارات لوحة التحكم المحمية
  if (!user && req.nextUrl.pathname.startsWith('/dashboard')) {
    // الطالب (جلسة البوابة) لا يراه لوحة المدرس إطلاقاً — يُعاد لبوابته
    if (req.cookies.get('studentPortalSession')?.value) {
      const studentUrl = req.nextUrl.clone()
      studentUrl.pathname = '/student'
      studentUrl.search = ''
      return NextResponse.redirect(studentUrl)
    }
    const redirectUrl = req.nextUrl.clone()
    redirectUrl.pathname = '/login'
    redirectUrl.searchParams.set(`redirectedFrom`, req.nextUrl.pathname)
    return NextResponse.redirect(redirectUrl)
  }

  // إذا كان المستخدم مسجلاً بالفعل ويحاول دخول صفحة تسجيل الدخول
  if (user && req.nextUrl.pathname.startsWith('/login')) {
    const redirectUrl = req.nextUrl.clone()
    redirectUrl.pathname = '/dashboard'
    return NextResponse.redirect(redirectUrl)
  }

  return res
}

export const config = {
  matcher: ['/dashboard/:path*', '/login'],
}
