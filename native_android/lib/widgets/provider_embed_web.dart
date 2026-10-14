import 'dart:html' as html;
import 'dart:ui_web' as ui_web;
import 'package:flutter/material.dart';

/// Displays only provider URLs already approved by resolveRadioMedia.
/// Browser iframe restrictions and provider embed permissions remain intact.
class VopWebProviderEmbed extends StatefulWidget {
  const VopWebProviderEmbed({super.key, required this.url});
  final Uri url;
  @override
  State<VopWebProviderEmbed> createState() => _VopWebProviderEmbedState();
}

class _VopWebProviderEmbedState extends State<VopWebProviderEmbed> {
  late final String _viewType;
  static int _nextView = 0;

  @override
  void initState() {
    super.initState();
    _viewType = 'vop-provider-embed-' + (_nextView++).toString();
    final url = widget.url;
    if (url.scheme != 'https' || url.host.isEmpty || url.userInfo.isNotEmpty) {
      throw StateError('Only approved HTTPS provider embeds are allowed.');
    }
    ui_web.platformViewRegistry.registerViewFactory(_viewType, (int viewId) {
      return html.IFrameElement()
        ..src = url.toString()
        ..title = 'VOP media'
        ..style.border = '0'
        ..style.width = '100%'
        ..style.height = '100%'
        ..allowFullscreen = true
        ..allow = 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share'
        ..referrerPolicy = 'strict-origin-when-cross-origin';
    });
  }

  @override
  Widget build(BuildContext context) => HtmlElementView(viewType: _viewType);
}
