import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Create client (will handle missing env vars gracefully)
const createSupabaseClient = () => {
  try {
    if (!supabaseUrl || !supabaseAnonKey) {
      console.warn('Supabase: Missing environment variables')
      return null
    }
    return createClient(supabaseUrl, supabaseAnonKey)
  } catch (error) {
    console.error('Supabase client creation failed:', error)
    return null
  }
}

export const supabase = createSupabaseClient()

// Server-side client for API routes
export function createServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error(
      'Missing required Supabase environment variables: ' +
      (!url ? 'NEXT_PUBLIC_SUPABASE_URL ' : '') +
      (!serviceKey ? 'SUPABASE_SERVICE_ROLE_KEY' : '')
    )
  }

  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    }
  })
}

// Check if Supabase is configured
export function isSupabaseConfigured() {
  return !!(supabaseUrl && supabaseAnonKey)
}