const SUPABASE_URL = "https://aaqvjqbafkmjkvxhyhsd.supabase.co";
const SUPABASE_KEY = "sb_publishable_VVksfiC9WR4gNUilP3S_zQ_zsc5Ksbb";

if (!window.supabase || typeof window.supabase.createClient !== "function") {
  throw new Error("Supabase browser client failed to load.");
}

window.supabaseApp = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
