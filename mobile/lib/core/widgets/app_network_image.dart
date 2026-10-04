import 'package:flutter/material.dart';
import '../services/media_link_interceptor.dart';

/// Modern, resilient image component that seamlessly resolves
/// internal short codes, Cloudinary, Google Drive, and Dropbox URLs.
class AppNetworkImage extends StatelessWidget {
  final String? imageUrlOrCode;
  final double? width;
  final double? height;
  final BoxFit fit;
  final BorderRadius? borderRadius;
  final Widget? placeholder;
  final Widget? errorWidget;

  const AppNetworkImage({
    super.key,
    required this.imageUrlOrCode,
    this.width,
    this.height,
    this.fit = BoxFit.cover,
    this.borderRadius,
    this.placeholder,
    this.errorWidget,
  });

  @override
  Widget build(BuildContext context) {
    final raw = imageUrlOrCode?.trim() ?? '';
    if (raw.isEmpty) {
      return _buildErrorPlaceholder(context);
    }

    final syncUrl = MediaLinkInterceptor.resolveSynchronous(raw);
    if (syncUrl != null && syncUrl.isNotEmpty) {
      return _buildImage(context, syncUrl);
    }

    return FutureBuilder<String>(
      future: MediaLinkInterceptor.resolveToDirectUrl(raw),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting && syncUrl == null) {
          return _buildLoadingPlaceholder(context);
        }
        final finalUrl = snapshot.data ?? raw;
        return _buildImage(context, finalUrl);
      },
    );
  }

  Widget _buildImage(BuildContext context, String url) {
    final image = Image.network(
      url,
      width: width,
      height: height,
      fit: fit,
      errorBuilder: (ctx, err, stack) => _buildErrorPlaceholder(ctx),
      loadingBuilder: (ctx, child, progress) {
        if (progress == null) return child;
        return _buildLoadingPlaceholder(ctx);
      },
    );

    if (borderRadius != null) {
      return ClipRRect(
        borderRadius: borderRadius!,
        child: image,
      );
    }

    return image;
  }

  Widget _buildLoadingPlaceholder(BuildContext context) {
    final theme = Theme.of(context);
    final widgetChild = Container(
      width: width,
      height: height,
      color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.5),
      child: Center(
        child: SizedBox(
          width: 20,
          height: 20,
          child: CircularProgressIndicator(
            strokeWidth: 2,
            color: theme.colorScheme.primary.withValues(alpha: 0.6),
          ),
        ),
      ),
    );

    if (borderRadius != null) {
      return ClipRRect(borderRadius: borderRadius!, child: widgetChild);
    }
    return widgetChild;
  }

  Widget _buildErrorPlaceholder(BuildContext context) {
    if (errorWidget != null) return errorWidget!;
    final theme = Theme.of(context);
    final widgetChild = Container(
      width: width,
      height: height,
      color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.3),
      child: Center(
        child: Icon(
          Icons.image_not_supported_outlined,
          size: (height != null && height! < 50) ? 18 : 28,
          color: theme.colorScheme.outline.withValues(alpha: 0.5),
        ),
      ),
    );

    if (borderRadius != null) {
      return ClipRRect(borderRadius: borderRadius!, child: widgetChild);
    }
    return widgetChild;
  }
}
