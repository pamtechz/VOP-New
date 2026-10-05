import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/supabase_service.dart';

/// Configuration for the active marketplace currency.
class CurrencyConfig {
  final String code; // e.g. 'ZMW', 'USD', 'KES', 'ZAR'
  final String symbol; // e.g. 'K', '$', '€', '£'

  const CurrencyConfig({
    this.code = 'ZMW',
    this.symbol = 'K',
  });

  /// Formats amount with active symbol (e.g. "K 1,250.00").
  String format(num? amount, {int decimals = 2}) {
    final val = (amount ?? 0.0).toDouble();
    return '$symbol ${val.toStringAsFixed(decimals)}';
  }

  /// Formats amount with active code (e.g. "ZMW 1,250.00").
  String formatWithCode(num? amount, {int decimals = 2}) {
    final val = (amount ?? 0.0).toDouble();
    return '$code ${val.toStringAsFixed(decimals)}';
  }
}

/// Dynamic currency provider that resolves active base currency from platform_settings.
final currencyProvider = FutureProvider<CurrencyConfig>((ref) async {
  try {
    final data = await SupabaseService.client
        .from('platform_settings')
        .select('key, value')
        .inFilter('key', ['default_currency', 'currency_symbol']);

    String code = 'ZMW';
    String symbol = 'K';

    for (final row in (data as List)) {
      final key = row['key'] as String?;
      final dynamic rawVal = row['value'];
      String? val;

      if (rawVal is String) {
        val = rawVal.replaceAll('"', '').trim();
      } else if (rawVal != null) {
        val = rawVal.toString().replaceAll('"', '').trim();
      }

      if (key == 'default_currency' && val != null && val.isNotEmpty) {
        code = val;
      } else if (key == 'currency_symbol' && val != null && val.isNotEmpty) {
        symbol = val;
      }
    }

    return CurrencyConfig(code: code, symbol: symbol);
  } catch (_) {
    return const CurrencyConfig(code: 'ZMW', symbol: 'K');
  }
});
