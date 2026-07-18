// Supabase connection for the private tools area.
// Both values are public by design: the anon key is meant to ship in
// front-end code, and Row-Level Security (auth.uid() = user_id) is what
// protects the data. See tools/schema.sql.
window.TOOLS_CONFIG = {
  SUPABASE_URL: 'https://casmljyasiynhshtnplt.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhc21sanlhc2l5bmhzaHRucGx0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzNzAzMDIsImV4cCI6MjA5OTk0NjMwMn0.Hb0gCKi5ceeXzbFPpbIRZSMItSfkgd3UXoOdFXjAIVc',
};
