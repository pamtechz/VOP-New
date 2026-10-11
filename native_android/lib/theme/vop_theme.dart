import 'package:flutter/material.dart';

/// Shared with the web application src/index.css (primary brand tokens).
abstract final class VopColors {
  static const navy = Color(0xFF003366);
  static const navyDeep = Color(0xFF002D72);
  static const navyBright = Color(0xFF0D47A1);
  static const gold = Color(0xFFE69D12);
  static const goldLight = Color(0xFFFAC659);
  static const ink = Color(0xFF0F172A);
  static const slate = Color(0xFF475569);
  static const canvas = Color(0xFFF0F4F9);
  static const card = Colors.white;
  static const border = Color(0xFFE2E8F0);
  static const success = Color(0xFF10B981);
  static const darkCanvas = Color(0xFF0B192D);
  static const darkSurface = Color(0xFF142A46);
  static const darkBorder = Color(0xFF294263);
}
abstract final class VopTheme {
  static ThemeData build(Brightness brightness) {
    final dark = brightness == Brightness.dark;
    final surface = dark ? VopColors.darkSurface : VopColors.card;
    final colors = ColorScheme.fromSeed(
      seedColor: VopColors.navy,
      brightness: brightness,
      primary: dark ? const Color(0xFF9BC4FF) : VopColors.navy,
      secondary: dark ? VopColors.goldLight : VopColors.gold,
      surface: surface,
    );
    final base = ThemeData(
      useMaterial3: true, colorScheme: colors,
      brightness: brightness,
      scaffoldBackgroundColor: dark ? VopColors.darkCanvas : VopColors.canvas,
      splashFactory: InkRipple.splashFactory,
    );
    return base.copyWith(
      textTheme: base.textTheme.copyWith(
        headlineMedium: base.textTheme.headlineMedium?.copyWith(
          fontSize: 27, fontWeight: FontWeight.w800, letterSpacing: -0.7),
        headlineSmall: base.textTheme.headlineSmall?.copyWith(
          fontSize: 23, fontWeight: FontWeight.w800, letterSpacing: -0.45),
        titleLarge: base.textTheme.titleLarge?.copyWith(
          fontSize: 19, fontWeight: FontWeight.w800, letterSpacing: -0.35),
        titleMedium: base.textTheme.titleMedium?.copyWith(
          fontSize: 15, fontWeight: FontWeight.w700),
        bodyMedium: base.textTheme.bodyMedium?.copyWith(height: 1.52),
      ),
      appBarTheme: AppBarTheme(
        elevation: 0, scrolledUnderElevation: 0,
        backgroundColor: surface, foregroundColor: colors.onSurface,
        titleTextStyle: TextStyle(fontWeight: FontWeight.w800,
          fontSize: 17, color: colors.onSurface, letterSpacing: -0.25),
      ),
      cardTheme: CardThemeData(
        color: surface, elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(19),
          side: BorderSide(
            color: dark ? VopColors.darkBorder : VopColors.border)),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true, fillColor: surface,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(13),
          borderSide: BorderSide(color: dark
            ? VopColors.darkBorder : VopColors.border)),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(13),
          borderSide: BorderSide(color: dark
            ? VopColors.darkBorder : VopColors.border)),
        contentPadding: const EdgeInsets.symmetric(horizontal: 14,vertical: 13),
      ),
      filledButtonTheme: FilledButtonThemeData(style: FilledButton.styleFrom(
        minimumSize: const Size(0,46),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        textStyle: const TextStyle(fontWeight: FontWeight.w700),
      )),
      outlinedButtonTheme: OutlinedButtonThemeData(style: OutlinedButton.styleFrom(
        minimumSize: const Size(0,43),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      )),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: surface, elevation: 0, height: 62,
        iconTheme: WidgetStateProperty.all(const IconThemeData(size:21)),
        indicatorColor: dark ? const Color(0xFF1C406B) : const Color(0xFFE8F0FB),
        labelTextStyle: WidgetStateProperty.all(const TextStyle(
          fontSize: 10,fontWeight: FontWeight.w700)),
      ),
      dividerTheme: DividerThemeData(
        color: dark ? VopColors.darkBorder : VopColors.border),
      chipTheme: base.chipTheme.copyWith(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(9)),
        side: BorderSide.none),
    );
  }
}
