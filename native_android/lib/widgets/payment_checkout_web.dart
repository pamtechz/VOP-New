import 'dart:async';
// This implementation is selected only for the browser by a conditional import.
// ignore: avoid_web_libraries_in_flutter
import 'dart:html' as html;
import 'dart:ui_web' as ui_web;
import 'package:flutter/material.dart';

class PaymentProviderView extends StatefulWidget{
  const PaymentProviderView({required this.html,required this.origin,required this.onEvent,super.key});
  final String html,origin;
  final ValueChanged<String> onEvent;
  @override State<PaymentProviderView> createState()=>_PaymentProviderViewState();
}
class _PaymentProviderViewState extends State<PaymentProviderView>{
  static int next=0;
  late final String view='vop-payment-${next++}';
  late final html.IFrameElement frame;
  StreamSubscription<html.MessageEvent>? subscription;
  @override void initState(){super.initState();frame=html.IFrameElement()
    ..setAttribute('srcdoc',widget.html)
    ..setAttribute('sandbox','allow-scripts allow-forms allow-popups')
    ..setAttribute('title','Payment provider')
    ..style.border='0'..style.width='100%'..style.height='100%';
    ui_web.platformViewRegistry.registerViewFactory(view,(_)=>frame);
    subscription=html.window.onMessage.listen((event){if(event.source==frame.contentWindow&&event.data is String)widget.onEvent(event.data as String);});
  }
  @override void dispose(){subscription?.cancel();frame.remove();super.dispose();}
  @override Widget build(BuildContext context)=>HtmlElementView(viewType:view);
}
