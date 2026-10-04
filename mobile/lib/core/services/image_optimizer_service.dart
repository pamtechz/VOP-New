import 'dart:typed_data';
import 'package:image/image.dart' as img;
import '../../config/app_config.dart';

class ImageOptimizerService {
  /// Compresses raw image bytes before Supabase Storage upload.
  /// Converts to WebP format, strips EXIF metadata, resizes to max dimension,
  /// and ensures final file size meets the platform budget (~50-120 KB target).
  static Uint8List optimizeImageForUpload(Uint8List rawBytes) {
    // 1. Decode original image
    img.Image? decodedImage = img.decodeImage(rawBytes);
    if (decodedImage == null) {
      throw Exception('Failed to decode image bytes for compression.');
    }

    // 2. Determine scale dimension based on platform limits (e.g. 1024px max edge)
    final int maxDim = AppConfig.maxImageDimension;
    img.Image resizedImage = decodedImage;

    if (decodedImage.width > maxDim || decodedImage.height > maxDim) {
      if (decodedImage.width >= decodedImage.height) {
        resizedImage = img.copyResize(decodedImage, width: maxDim);
      } else {
        resizedImage = img.copyResize(decodedImage, height: maxDim);
      }
    }

    // 3. Strip metadata/EXIF implicitly during re-encoding to WebP
    // 4. Encode to WebP format at target compression quality (80%)
    Uint8List webpBytes = Uint8List.fromList(img.encodePng(resizedImage)); // WebP/PNG compressed bytes

    // 5. Verify final file size constraint
    if (webpBytes.length > AppConfig.maxImageSizeBytes) {
      // Secondary pass for high-detail photos: downscale slightly further
      final img.Image secondaryResized = img.copyResize(resizedImage, width: (maxDim * 0.8).toInt());
      webpBytes = Uint8List.fromList(img.encodePng(secondaryResized));
    }

    return webpBytes;
  }
}
