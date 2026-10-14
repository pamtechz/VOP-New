import 'package:flutter/material.dart';

/// Browser-only provider embed is selected by conditional import on web.
class VopWebProviderEmbed extends StatelessWidget {
  const VopWebProviderEmbed({super.key, required this.url});
  final Uri url;
  @override
  Widget build(BuildContext context) => const SizedBox.shrink();
}
