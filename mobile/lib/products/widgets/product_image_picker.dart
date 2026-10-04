import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../core/services/supabase_service.dart';
import '../../core/services/image_optimizer_service.dart';

/// Result returned after any image attachment operation.
class ImageAttachResult {
  final String displayUrl; // shortened URL or storage URL — ready to show
  final String? shortCode; // Base62 code if shortened
  final bool isShortened;

  const ImageAttachResult({
    required this.displayUrl,
    this.shortCode,
    required this.isShortened,
  });
}

/// Unified product image picker widget.
/// Offers two modes:
///   1. Upload from device  → compresses to WebP → Supabase Storage
///   2. Paste external URL  → validates → shortens via RPC → stores short URL
class ProductImagePicker extends StatefulWidget {
  final String productId;
  final String storeId;
  final int currentImageCount;
  final int maxImages;
  final void Function(ImageAttachResult result) onImageAttached;

  const ProductImagePicker({
    super.key,
    required this.productId,
    required this.storeId,
    required this.currentImageCount,
    required this.maxImages,
    required this.onImageAttached,
  });

  @override
  State<ProductImagePicker> createState() => _ProductImagePickerState();
}

class _ProductImagePickerState extends State<ProductImagePicker> {
  bool _isLoading = false;
  String? _errorMessage;

  bool get _atLimit => widget.currentImageCount >= widget.maxImages;

  // ── Option 1: Paste an external URL ────────────────────────────────────────
  Future<void> _pasteUrlFlow() async {
    if (_atLimit) {
      _showLimitError();
      return;
    }
    final url = await _showUrlInputDialog();
    if (url == null || url.isEmpty) return;

    setState(() { _isLoading = true; _errorMessage = null; });
    try {
      final result = await SupabaseService.client.rpc(
        'attach_shortened_url_to_product_image',
        params: {
          'p_product_id':   widget.productId,
          'p_external_url': url,
          'p_created_by':   SupabaseService.client.auth.currentUser?.id,
        },
      );

      widget.onImageAttached(ImageAttachResult(
        displayUrl:  result['short_url'] as String,
        shortCode:   result['code'] as String?,
        isShortened: true,
      ));
    } on PostgrestException catch (e) {
      setState(() => _errorMessage = _friendlyError(e.message));
    } catch (e) {
      setState(() => _errorMessage = 'Unexpected error. Please try again.');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  // ── Option 2: Upload from device (compressed to WebP) ──────────────────────
  Future<void> _uploadFromDeviceFlow() async {
    if (_atLimit) {
      _showLimitError();
      return;
    }
    // In a real build, use image_picker to pick a file.
    // Here we demonstrate the compress-then-upload pipeline.
    setState(() { _isLoading = true; _errorMessage = null; });
    try {
      // Simulate picking a file — replace with ImagePicker in production.
      await Future.delayed(const Duration(milliseconds: 500));

      // Example: compress raw bytes before upload.
      // final Uint8List rawBytes = await _pickImageBytes();
      // final Uint8List webpBytes = ImageOptimizerService.optimizeImageForUpload(rawBytes);
      //
      // final String storagePath =
      //     'products/${widget.storeId}/${widget.productId}/${const Uuid().v4()}.webp';
      // await SupabaseService.client.storage
      //     .from('product-media')
      //     .uploadBinary(storagePath, webpBytes,
      //         fileOptions: const FileOptions(contentType: 'image/webp', upsert: false));
      //
      // final String publicUrl = SupabaseService.client.storage
      //     .from('product-media').getPublicUrl(storagePath);
      //
      // widget.onImageAttached(ImageAttachResult(
      //     displayUrl: publicUrl, isShortened: false));

      if (mounted) {
        setState(() => _errorMessage = 'Device upload: integrate image_picker package then un-comment the upload block above.');
      }
    } catch (e) {
      setState(() => _errorMessage = e.toString());
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  // ── URL input dialog ────────────────────────────────────────────────────────
  Future<String?> _showUrlInputDialog() async {
    final controller = TextEditingController();
    return showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Paste Image or File URL'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Paste a direct link to your image or file.\n'
              'The URL will be automatically shortened to save storage.',
              style: TextStyle(fontSize: 12, color: Colors.grey),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: controller,
              autofocus: true,
              keyboardType: TextInputType.url,
              decoration: const InputDecoration(
                labelText: 'Image or File URL',
                hintText: 'https://example.com/my-product-photo.jpg',
                border: OutlineInputBorder(),
                prefixIcon: Icon(Icons.link),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              final url = controller.text.trim();
              Navigator.pop(ctx, url.isNotEmpty ? url : null);
            },
            child: const Text('Shorten & Attach'),
          ),
        ],
      ),
    );
  }

  void _showLimitError() {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          'Image limit reached (${widget.maxImages} images). '
          'Upgrade your plan to add more.',
        ),
        backgroundColor: Colors.red.shade700,
      ),
    );
  }

  String _friendlyError(String raw) {
    if (raw.contains('URL_SCHEME_BLOCKED')) return 'Only http:// and https:// URLs are allowed.';
    if (raw.contains('URL_TOO_LONG')) return 'URL is too long (max 2048 characters).';
    if (raw.contains('IMAGE_LIMIT_REACHED')) return 'Image limit reached for your plan.';
    return 'Could not shorten URL. Please check the link and try again.';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Limit indicator
        Row(
          children: [
            Text(
              'Product Images',
              style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
            ),
            const Spacer(),
            Text(
              '${widget.currentImageCount} / ${widget.maxImages}',
              style: TextStyle(
                fontSize: 12,
                color: _atLimit ? Colors.red : Colors.grey,
                fontWeight: FontWeight.bold,
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),

        // Error message
        if (_errorMessage != null)
          Container(
            padding: const EdgeInsets.all(10),
            margin: const EdgeInsets.only(bottom: 8),
            decoration: BoxDecoration(
              color: Colors.red.shade50,
              border: Border.all(color: Colors.red.shade300),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              children: [
                const Icon(Icons.error_outline, size: 16, color: Colors.red),
                const SizedBox(width: 8),
                Expanded(child: Text(_errorMessage!, style: const TextStyle(fontSize: 12, color: Colors.red))),
              ],
            ),
          ),

        // Action buttons
        if (_isLoading)
          const Center(child: Padding(
            padding: EdgeInsets.all(16),
            child: CircularProgressIndicator(),
          ))
        else if (!_atLimit)
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  icon: const Icon(Icons.upload_file, size: 18),
                  label: const Text('Upload File', style: TextStyle(fontSize: 13)),
                  onPressed: _uploadFromDeviceFlow,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: ElevatedButton.icon(
                  icon: const Icon(Icons.link, size: 18),
                  label: const Text('Paste URL', style: TextStyle(fontSize: 13)),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: theme.colorScheme.primary,
                    foregroundColor: Colors.white,
                  ),
                  onPressed: _pasteUrlFlow,
                ),
              ),
            ],
          )
        else
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.amber.shade50,
              border: Border.all(color: Colors.amber.shade400),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              children: [
                Icon(Icons.info_outline, size: 16, color: Colors.amber.shade800),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Image limit reached. Upgrade your seller plan to add more images.',
                    style: TextStyle(fontSize: 12, color: Colors.amber.shade900),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}
