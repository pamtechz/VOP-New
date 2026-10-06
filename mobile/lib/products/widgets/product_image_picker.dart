import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../auth/providers/auth_provider.dart';
import '../../core/services/media_link_interceptor.dart';

/// Result returned after any image attachment operation.
class ImageAttachResult {
  final String displayUrl;
  final String shortCode;
  final String sourcePlatform;

  const ImageAttachResult({
    required this.displayUrl,
    required this.shortCode,
    required this.sourcePlatform,
  });
}

/// External cloud image picker widget tailored for Cloudinary, Google Drive, and Dropbox.
class ProductImagePicker extends ConsumerStatefulWidget {
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
  ConsumerState<ProductImagePicker> createState() => _ProductImagePickerState();
}

class _ProductImagePickerState extends ConsumerState<ProductImagePicker> {
  bool _isLoading = false;
  String? _errorMessage;

  bool _isAdmin(WidgetRef ref) {
    final profile = ref.watch(profileProvider).valueOrNull;
    final role = profile?['role'] as String? ?? 'user';
    return role == 'admin' || role == 'super_admin';
  }

  bool _isAtLimit(bool isAdmin) {
    if (isAdmin) return false;
    return widget.currentImageCount >= widget.maxImages;
  }

  Future<void> _attachExternalUrl(String inputUrl) async {
    final trimmed = inputUrl.trim();
    if (trimmed.isEmpty) return;

    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      setState(() => _errorMessage = 'Please enter a valid URL starting with http:// or https://');
      return;
    }

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final intercepted = await MediaLinkInterceptor.interceptAndRegister(trimmed);

      widget.onImageAttached(ImageAttachResult(
        displayUrl: intercepted.directDisplayUrl,
        shortCode: intercepted.shortCode,
        sourcePlatform: intercepted.sourcePlatform,
      ));
    } catch (e) {
      setState(() => _errorMessage = 'Failed to attach cloud image: $e');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _showAddImageDialog(BuildContext context) async {
    final controller = TextEditingController();
    String? previewUrl;

    await showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (context, setDialogState) {
          return AlertDialog(
            title: const Row(
              children: [
                Icon(Icons.cloud_upload_outlined, color: Colors.blue),
                SizedBox(width: 8),
                Text('Add External Image', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
              ],
            ),
            content: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    margin: const EdgeInsets.only(bottom: 12),
                    decoration: BoxDecoration(
                      color: const Color(0xFF10B981).withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: const Color(0xFF10B981).withValues(alpha: 0.3)),
                    ),
                    child: const Row(
                      children: [
                        Icon(Icons.shield_outlined, size: 18, color: Color(0xFF10B981)),
                        SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            'Enter direct image CDN link or web address for optimal display.',
                            style: TextStyle(fontSize: 11, color: Color(0xFF047857), fontWeight: FontWeight.w600),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const Text(
                    'Paste an image URL for your product listing:',
                    style: TextStyle(fontSize: 12, color: Colors.grey),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: controller,
                    autofocus: true,
                    keyboardType: TextInputType.url,
                    decoration: const InputDecoration(
                      labelText: 'Product Image URL',
                      hintText: 'https://images.example.com/item.jpg',
                      border: OutlineInputBorder(),
                      prefixIcon: Icon(Icons.link),
                    ),
                    onChanged: (val) {
                      final parsed = MediaLinkInterceptor.parse(val);
                      setDialogState(() {
                        previewUrl = parsed.directDisplayUrl.isNotEmpty ? parsed.directDisplayUrl : null;
                      });
                    },
                  ),
                  const SizedBox(height: 12),

                  // Quick presets / provider helpers
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      ActionChip(
                        avatar: const Icon(Icons.cloud_done, size: 14, color: Colors.blue),
                        label: const Text('Cloudinary', style: TextStyle(fontSize: 11)),
                        onPressed: () {
                          _showGuideDialog(
                            context,
                            'Cloudinary Guide',
                            '1. Visit console.cloudinary.com/app\n'
                            '2. Upload your product photo into your Media Library\n'
                            '3. Click "Copy URL" on the image\n'
                            '4. Paste the URL here.',
                          );
                        },
                      ),
                      ActionChip(
                        avatar: const Icon(Icons.drive_folder_upload, size: 14, color: Color(0xFF10B981)),
                        label: const Text('Google Drive', style: TextStyle(fontSize: 11)),
                        onPressed: () {
                          _showGuideDialog(
                            context,
                            'Google Drive Guide',
                            '1. Upload your photo to Google Drive\n'
                            '2. Right click file -> Share -> Change to "Anyone with the link"\n'
                            '3. Copy the link and paste it here.\n'
                            '4. Our system converts it automatically into a direct product image!',
                          );
                        },
                      ),
                      ActionChip(
                        avatar: const Icon(Icons.folder_shared, size: 14, color: Colors.cyan),
                        label: const Text('Dropbox', style: TextStyle(fontSize: 11)),
                        onPressed: () {
                          _showGuideDialog(
                            context,
                            'Dropbox Guide',
                            '1. Upload your image to Dropbox\n'
                            '2. Click "Share" -> "Create Link" -> "Copy link"\n'
                            '3. Paste it here.\n'
                            '4. The system automatically routes raw streaming direct to your product.',
                          );
                        },
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),

                  // Live Preview Box
                  if (previewUrl != null && previewUrl!.isNotEmpty) ...[
                    const Text('Live Preview:', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 6),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: Container(
                        height: 120,
                        width: double.infinity,
                        color: Colors.black12,
                        child: Image.network(
                          previewUrl!,
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) => const Center(
                            child: Text('Invalid image link or permissions', style: TextStyle(fontSize: 11, color: Colors.red)),
                          ),
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: const Text('Cancel'),
              ),
              ElevatedButton(
                onPressed: () {
                  final text = controller.text.trim();
                  if (text.isNotEmpty) {
                    Navigator.pop(ctx);
                    _attachExternalUrl(text);
                  }
                },
                child: const Text('Attach Image'),
              ),
            ],
          );
        },
      ),
    );
  }

  void _showGuideDialog(BuildContext context, String title, String body) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
        content: Text(body, style: const TextStyle(fontSize: 13, height: 1.5)),
        actions: [
          FilledButton(onPressed: () => Navigator.pop(ctx), child: const Text('Got It')),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final isAdmin = _isAdmin(ref);
    final atLimit = _isAtLimit(isAdmin);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text(
              'Product Images & Media Gallery',
              style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
            ),
            const Spacer(),
            if (isAdmin)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: const Color(0xFF10B981).withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: const Text(
                  'ADMIN: UNLIMITED',
                  style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Color(0xFF10B981)),
                ),
              )
            else
              Text(
                '${widget.currentImageCount} / ${widget.maxImages}',
                style: TextStyle(
                  fontSize: 12,
                  color: atLimit ? Colors.red : Colors.grey,
                  fontWeight: FontWeight.bold,
                ),
              ),
          ],
        ),
        const SizedBox(height: 6),
        const Text(
          'Attach high-resolution product image links. CDN media and WebP images are optimized and rendered dynamically.',
          style: TextStyle(fontSize: 12, color: Colors.grey),
        ),
        const SizedBox(height: 10),

        if (_errorMessage != null)
          Container(
            padding: const EdgeInsets.all(8),
            margin: const EdgeInsets.only(bottom: 8),
            decoration: BoxDecoration(
              color: Colors.red.shade50,
              border: Border.all(color: Colors.red.shade200),
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

        if (_isLoading)
          const Center(
            child: Padding(
              padding: EdgeInsets.all(12),
              child: CircularProgressIndicator(),
            ),
          )
        else if (!atLimit)
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  icon: const Icon(Icons.link, size: 18),
                  label: const Text('Add Cloud Image Link', style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold)),
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    side: BorderSide(color: scheme.primary),
                  ),
                  onPressed: () => _showAddImageDialog(context),
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
                    'Image limit reached (${widget.maxImages}). Upgrade your seller plan to add more images.',
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

