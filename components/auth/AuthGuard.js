import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase, isSupabaseConfigured } from '../../lib/supabase'
import LoadingSpinner from '../ui/LoadingSpinner'

export default function AuthGuard({ children }) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [authenticated, setAuthenticated] = useState(false)

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      router.push('/login')
      return
    }

    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push('/login')
      } else {
        setAuthenticated(true)
        setLoading(false)
      }
    }

    checkAuth()
  }, [router])

  if (loading) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <LoadingSpinner text="로딩 중..." />
      </div>
    )
  }

  if (!authenticated) {
    return null
  }

  return children
}