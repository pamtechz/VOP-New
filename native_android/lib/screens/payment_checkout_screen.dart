import 'dart:convert';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import '../core/config.dart';
import '../core/vop_api.dart';
import '../widgets/payment_checkout_html.dart';
import '../widgets/payment_checkout_native.dart' if(dart.library.html) '../widgets/payment_checkout_web.dart';
import 'workspace_records_screen.dart';

class PaymentCheckoutScreen extends StatefulWidget{
  const PaymentCheckoutScreen({required this.api,required this.checkout,required this.payment,super.key});
  final VopApi api;
  final Map<String,dynamic> checkout,payment;
  @override State<PaymentCheckoutScreen> createState()=>_PaymentCheckoutState();
}
class _PaymentCheckoutState extends State<PaymentCheckoutScreen>{
  bool busy=false;
  String message='';
  late final String document;
  @override void initState(){super.initState();document=paymentCheckoutHtml(widget.checkout,widget.payment,FirebaseAuth.instance.currentUser?.email??'');}
  Future<void> verify()async{
    if(busy)return;setState(()=>busy=true);
    try{
      final result=await widget.api.action('/api/payments/verify',{'reference':widget.payment['reference']});
      final payment=recordMap(result['payment']);
      if(mounted)setState(()=>message=payment['status']=='paid'?'Payment confirmed.':'Payment status: ${payment['status']??'unavailable'}.');
    }catch(e){if(mounted)setState(()=>message='$e');}
    finally{if(mounted)setState(()=>busy=false);}
  }
  void event(String value){
    try{final data=jsonDecode(value);if(data is! Map||data['reference']!=widget.payment['reference'])return;
      if(data['type']=='verify'||data['type']=='close')verify();
      else if(data['type']=='error'&&mounted)setState(()=>message='The payment provider could not be reached. You can check payment status or retry.');
    }catch(_){/* Ignore unrelated provider messages. */}
  }
  @override Widget build(BuildContext context)=>Scaffold(appBar:AppBar(title:const Text('Payment'),actions:[TextButton(onPressed:busy?null:verify,child:const Text('Check status'))]),
    body:Column(children:[if(busy)const LinearProgressIndicator(),if(message.isNotEmpty)Padding(padding:const EdgeInsets.all(16),child:Text(message)),
      Expanded(child:PaymentProviderView(html:document,origin:VopConfig.apiUrl,onEvent:event))]));
}
