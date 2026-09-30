import { createClient } from '@supabase/supabase-js'
import { wrapSupabaseClient } from './lib/viewOnlyClient'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// wrapSupabaseClient solo interviene cuando el modo "Ver como" está activo
// (ver src/lib/viewAs.js): fuera de ese modo el cliente se comporta igual que antes.
export const supabase = wrapSupabaseClient(
  createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }),
)
