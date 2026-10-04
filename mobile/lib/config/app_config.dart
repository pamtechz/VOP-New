// Configuration & Central Platform Tokens for Local Multi-Vendor Marketplace
//
// ⚠️  NEVER hardcode credentials here.
// Supply values via compile-time --dart-define flags:
//
//   flutter run \
//     --dart-define=SUPABASE_URL=https://your-project.supabase.co \
//     --dart-define=SUPABASE_ANON_KEY=your-publishable-anon-key
//
// Or create a `.env` and use a package like `flutter_dotenv` to load them.

class AppConfig {
  static const String appName = 'Ubuy - Store';

  // ── Supabase ──────────────────────────────────────────────────────────────
  // Injected at build time via --dart-define. No default values here.
  static const String supabaseUrl =
      String.fromEnvironment('SUPABASE_URL');
  static const String supabaseAnonKey =
      String.fromEnvironment('SUPABASE_ANON_KEY');

  // ── Short Links ──────────────────────────────────────────────────────────
  // Injected at build time. Example: go.yourdomain.com
  static const String shortLinkDomain =
      String.fromEnvironment('SHORT_LINK_DOMAIN', defaultValue: 'go.marketplace.com');

  // ── Resource Strategy ────────────────────────────────────────────────────
  // Toggle via --dart-define=RESOURCE_MODE=constrained|standard
  static const String _resourceMode =
      String.fromEnvironment('RESOURCE_MODE', defaultValue: 'constrained');
  static bool get isConstrainedMode => _resourceMode == 'constrained';

  // ── Image Upload Budgets ──────────────────────────────────────────────────
  static int get maxImageSizeBytes => isConstrainedMode ? 150 * 1024 : 1024 * 1024;
  static int get maxImageDimension => isConstrainedMode ? 1024 : 2048;

  // ── Plan Image Limits (sourced from Supabase platform_settings at runtime) ─
  static const Map<String, int> planImageLimits = {
    'free': 2,
    'business': 4,
    'pro': 8,
  };

  // ── Business Defaults ─────────────────────────────────────────────────────
  // These are UI defaults only. Authoritative values come from Supabase.
  static const double defaultCommissionRate = 0.05;
  static const int inactivityPeriodDays = 60;
}
