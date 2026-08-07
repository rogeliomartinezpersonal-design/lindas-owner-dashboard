// Same project URL + anon key already bundled into the public mobile app — safe to expose
// client-side, since every table this page can reach is protected by Postgres RLS (see
// supabase/migrations), not by keeping this key secret.
const SUPABASE_URL = 'https://uzkduzkptlbhixlalvpr.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV6a2R1emtwdGxiaGl4bGFsdnByIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwNjcyNTgsImV4cCI6MjEwMTY0MzI1OH0.lnxjfTaKQfgJ_D9lVv4YjiFRSY52P6u0KgpFl2d8YJY';
