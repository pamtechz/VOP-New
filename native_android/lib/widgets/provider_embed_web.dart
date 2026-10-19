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
    _viewType = 'vop-provider-embed-${_nextView++}';
    final url = widget.url;
    if (url.scheme != 'https' || url.host.isEmpty || url.userInfo.isNotEmpty) {
      throw StateError('Only approved HTTPS provider embeds are allowed.');
    }
    if (url.host.toLowerCase().endsWith('audioverse.org')) {
      // AudioVerse CSP directive frame-ancestors prevents browser iframe embedding.
      ui_web.platformViewRegistry.registerViewFactory(_viewType, (int viewId) {
        final container = html.DivElement()
          ..style.display = 'flex'
          ..style.flexDirection = 'column'
          ..style.alignItems = 'center'
          ..style.justifyContent = 'center'
          ..style.width = '100%'
          ..style.height = '100%'
          ..style.backgroundColor = '#071A33'
          ..style.color = '#FFFFFF'
          ..style.fontFamily = 'system-ui, -apple-system, sans-serif'
          ..style.padding = '20px'
          ..style.boxSizing = 'border-box'
          ..style.textAlign = 'center';

        final badge = html.SpanElement()
          ..innerText = 'AUDIOVERSE SERMON & TEACHING'
          ..style.fontSize = '10.5px'
          ..style.fontWeight = 'bold'
          ..style.letterSpacing = '0.6px'
          ..style.color = '#FDE68A'
          ..style.marginBottom = '8px';

        final desc = html.ParagraphElement()
          ..innerText = 'AudioVerse media is available directly for streaming.'
          ..style.margin = '0 0 16px 0'
          ..style.fontSize = '14px'
          ..style.color = 'rgba(255,255,255,0.85)';

        final btn = html.AnchorElement(href: url.toString())
          ..target = '_blank'
          ..innerText = 'Open on AudioVerse'
          ..style.padding = '10px 22px'
          ..style.backgroundColor = '#D97706'
          ..style.color = '#FFFFFF'
          ..style.textDecoration = 'none'
          ..style.borderRadius = '24px'
          ..style.fontWeight = '700'
          ..style.fontSize = '13.5px'
          ..style.display = 'inline-block';

        container.append(badge);
        container.append(desc);
        container.append(btn);
        return container;
      });
      return;
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
