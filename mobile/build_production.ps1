# build_production.ps1 — Build Hardened Production Obfuscated Binaries
# Obfuscates Dart code symbols and splits debug symbols to prevent reverse engineering.

$FlutterExe = "C:\src\flutter\bin\flutter.bat"
$SupabaseUrl = "https://yyscxqqiilpifogbktia.supabase.co"
$SupabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5c2N4cXFpaWxwaWZvZ2JrdGlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTExMjcwMDcsImV4cCI6MjEwNjcwMzAwN30.NneD_9JszOPPttf0JGQYNvweyJlBkN7LQRQfwwDfdMQ"

Write-Host "Building Anti-Tamper Obfuscated Flutter Web Release..." -ForegroundColor Green

& $FlutterExe build web `
  --release `
  --obfuscate `
  --split-debug-info="build/web/symbols" `
  "--dart-define=SUPABASE_URL=$SupabaseUrl" `
  "--dart-define=SUPABASE_ANON_KEY=$SupabaseAnonKey"

Write-Host "Production build complete! Binary symbols obfuscated against reverse engineering." -ForegroundColor Green
