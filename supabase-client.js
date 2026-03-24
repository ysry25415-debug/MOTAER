const SUPABASE_URL = "https://aaqvjqbafkmjkvxhyhsd.supabase.co";
const SUPABASE_KEY = "sb_publishable_VVksfiC9WR4gNUilP3S_zQ_zsc5Ksbb";

window.supabaseConfig = {
  url: SUPABASE_URL,
  key: SUPABASE_KEY,
};

window.supabaseApp = null;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Supabase URL/Key are missing. Update supabase-client.js first.");
} else if (!window.supabase || typeof window.supabase.createClient !== "function") {
  // Keep the app alive even if SDK CDN fails; auth pages can use REST fallback.
  console.warn("Supabase SDK did not load. Using auth fallback mode.");
} else {
  window.supabaseApp = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}
