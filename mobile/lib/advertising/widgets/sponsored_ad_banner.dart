import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../services/ad_placement_service.dart';
import '../../core/widgets/app_network_image.dart';

class SponsoredAdBanner extends ConsumerStatefulWidget {
  final String placement;
  final EdgeInsetsGeometry padding;

  const SponsoredAdBanner({
    super.key,
    required this.placement,
    this.padding = const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
  });

  @override
  ConsumerState<SponsoredAdBanner> createState() => _SponsoredAdBannerState();
}

class _SponsoredAdBannerState extends ConsumerState<SponsoredAdBanner> {
  @override
  Widget build(BuildContext context) {
    final adAsync = ref.watch(placementAdProvider(widget.placement));
    final scheme = Theme.of(context).colorScheme;

    return adAsync.when(
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
      data: (ad) {
        if (ad == null) return const SizedBox.shrink();

        // Record impression once rendered
        WidgetsBinding.instance.addPostFrameCallback((_) {
          AdPlacementService.recordImpression(ad.campaignId);
        });

        return Padding(
          padding: widget.padding,
          child: Card(
            elevation: 1,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
              side: BorderSide(color: scheme.outlineVariant.withValues(alpha: 0.4)),
            ),
            clipBehavior: Clip.antiAlias,
            child: InkWell(
              onTap: () {
                AdPlacementService.recordClick(ad.campaignId);
                if (ad.targetUrl.isNotEmpty) {
                  context.push(ad.targetUrl);
                }
              },
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Image with Sponsored Badge
                  Stack(
                    children: [
                      if (ad.imageUrl.isNotEmpty)
                        AppNetworkImage(
                          imageUrlOrCode: ad.imageUrl,
                          height: 140,
                          width: double.infinity,
                          fit: BoxFit.cover,
                        )
                      else
                        Container(
                          height: 120,
                          color: scheme.primaryContainer,
                        ),
                      Positioned(
                        top: 10,
                        left: 10,
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: Colors.black.withValues(alpha: 0.75),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: const Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.campaign_outlined, size: 12, color: Colors.amber),
                              SizedBox(width: 4),
                              Text(
                                'SPONSORED',
                                style: TextStyle(
                                  color: Colors.white,
                                  fontSize: 9,
                                  fontWeight: FontWeight.bold,
                                  letterSpacing: 0.5,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),

                  // Text content
                  Padding(
                    padding: const EdgeInsets.all(12),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                ad.headline,
                                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                              ),
                              if (ad.bodyText.isNotEmpty) ...[
                                const SizedBox(height: 2),
                                Text(
                                  ad.bodyText,
                                  style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 12),
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ],
                            ],
                          ),
                        ),
                        const SizedBox(width: 12),
                        FilledButton.tonal(
                          style: FilledButton.styleFrom(
                            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                          ),
                          onPressed: () {
                            AdPlacementService.recordClick(ad.campaignId);
                            if (ad.targetUrl.isNotEmpty) {
                              context.push(ad.targetUrl);
                            }
                          },
                          child: Text(ad.ctaText, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}
