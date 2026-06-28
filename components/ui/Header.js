import Link from 'next/link'
import { useRouter } from 'next/router'
import { useState, useEffect } from 'react'
import { supabase, isSupabaseConfigured } from '../../lib/supabase'
import styles from '../../styles/components/Header.module.css'

export default function Header() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setLoading(false)
      return
    }

    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      setLoading(false)
    }
    getUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleLogout = async () => {
    if (supabase) {
      await supabase.auth.signOut()
    }
    router.push('/')
  }

  const isActive = (path) => router.pathname === path

  return (
    <header className={styles.header}>
      <div className={styles.container}>
        <Link href="/" className={styles.logo}>
          📖 AI 동화책
        </Link>

        <nav className={styles.nav}>
          <Link href="/create" className={`${styles.navLink} ${isActive('/create') ? styles.active : ''}`}>
            동화책 만들기
          </Link>
          <Link href="/books" className={`${styles.navLink} ${isActive('/books') ? styles.active : ''}`}>
            내 동화책
          </Link>
          <Link href="/pricing" className={`${styles.navLink} ${isActive('/pricing') ? styles.active : ''}`}>
            요금제
          </Link>
        </nav>

        <div className={styles.actions}>
          {!loading && (
            <>
              {user ? (
                <div className={styles.userMenu}>
                  <button className={styles.userBtn} onClick={() => setMenuOpen(!menuOpen)}>
                    {user.email?.charAt(0).toUpperCase()}
                  </button>
                  {menuOpen && (
                    <div className={styles.dropdown}>
                      <p className={styles.userEmail}>{user.email}</p>
                      <Link href="/books" className={styles.dropdownItem} onClick={() => setMenuOpen(false)}>
                        내 동화책
                      </Link>
                      <Link href="/pricing" className={styles.dropdownItem} onClick={() => setMenuOpen(false)}>
                        구독 관리
                      </Link>
                      <button className={styles.dropdownItem} onClick={handleLogout}>
                        로그아웃
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className={styles.authLinks}>
                  <Link href="/login" className={styles.loginLink}>
                    로그인
                  </Link>
                  <Link href="/signup" className={styles.signupBtn}>
                    회원가입
                  </Link>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </header>
  )
}