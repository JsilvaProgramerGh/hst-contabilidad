import { createClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase para uso en el navegador (Client Components).
 * Mantiene el export "supabase" para compatibilidad con código viejo.
 */
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);