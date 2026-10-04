# run_windows.ps1 — Run the Flutter marketplace app on Windows Desktop
# Usage: .\run_windows.ps1

$FlutterExe = "C:\src\flutter\bin\flutter.bat"
$SupabaseUrl = "https://yyscxqqiilpifogbktia.supabase.co"
$SupabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5c2N4cXFpaWxwaWZvZ2JrdGlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTExMjcwMDcsImV4cCI6MjEwNjcwMzAwN30.NneD_9JszOPPttf0JGQYNvweyJlBkN7LQRQfwwDfdMQ"

& $FlutterExe run `
  -d windows `
  "--dart-define=SUPABASE_URL=$SupabaseUrl" `
  "--dart-define=SUPABASE_ANON_KEY=$SupabaseAnonKey" `
  "--dart-define=RESOURCE_MODE=constrained"
