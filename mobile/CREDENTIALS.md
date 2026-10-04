# ── Flutter Mobile App ────────────────────────────────────────────────────────
# Credentials are injected at build/run time via --dart-define flags.
# Never place them in source code.
#
# Local development:
#   flutter run \
#     --dart-define=SUPABASE_URL=https://your-project.supabase.co \
#     --dart-define=SUPABASE_ANON_KEY=your-publishable-anon-key \
#     --dart-define=RESOURCE_MODE=constrained
#
# CI / Release builds:
#   flutter build apk \
#     --dart-define=SUPABASE_URL=$SUPABASE_URL \
#     --dart-define=SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY \
#     --dart-define=RESOURCE_MODE=constrained
#
# Required values (obtain from your Supabase project dashboard):
#   SUPABASE_URL          — Project URL  (Settings → API → Project URL)
#   SUPABASE_ANON_KEY     — Publishable anon key (Settings → API → Project API keys)
#
# Optional overrides:
#   RESOURCE_MODE         — constrained | standard  (default: constrained)
#   SHORT_LINK_DOMAIN     — optional custom domain override (default: dynamic relative path /s/)
