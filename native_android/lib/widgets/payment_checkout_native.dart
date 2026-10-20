import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

class PaymentProviderView extends StatefulWidget{
  const PaymentProviderView({required this.html,required this.origin,required this.onEvent,super.key});
  final String html,origin;
  final ValueChanged<String> onEvent;
  @override State<PaymentProviderView> createState()=>_PaymentProviderViewState();
}
class _PaymentProviderViewState extends State<PaymentProviderView>{
  late final WebViewController controller;
  @override void initState(){super.initState();controller=WebViewController()
    ..setJavaScriptMode(JavaScriptMode.unrestricted)
    ..addJavaScriptChannel('VopCheckout',onMessageReceived:(message)=>widget.onEvent(message.message))
    ..setNavigationDelegate(NavigationDelegate(onNavigationRequest:(request){
      final uri=Uri.tryParse(request.url);return uri?.scheme=='https'||request.url=='about:blank'?NavigationDecision.navigate:NavigationDecision.prevent;
    }))
    ..loadHtmlString(widget.html,baseUrl:widget.origin);
  }
  @override Widget build(BuildContext context)=>WebViewWidget(controller:controller);
}
