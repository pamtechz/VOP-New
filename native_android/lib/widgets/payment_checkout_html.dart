import 'dart:convert';

String paymentCheckoutHtml(Map<String,dynamic> checkout,Map<String,dynamic> payment,String email){
  final script=Uri.tryParse('${checkout['scriptUrl']??''}');
  if(script==null||script.scheme!='https'||!['pay.lenco.co','pay.sandbox.lenco.co'].contains(script.host)||script.path!='/js/v1/inline.js'||script.userInfo.isNotEmpty||script.hasQuery||script.hasFragment){
    throw StateError('The configured payment window is unavailable.');
  }
  final options={'key':checkout['publicKey'],'reference':payment['reference'],'email':email,
    'amount':num.tryParse('${payment['amountDecimal']}'),'currency':payment['currency'],'channels':checkout['channels']};
  if(options['key']==null||options['reference']==null||options['amount']==null)throw StateError('Payment configuration is incomplete.');
  final encoded=jsonEncode(options).replaceAll('<',r'\u003c').replaceAll('>',r'\u003e');
  return '''<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'self' https:; script-src 'unsafe-inline' https://pay.lenco.co https://pay.sandbox.lenco.co; style-src 'unsafe-inline' https:; img-src https: data:; frame-src https:; connect-src https:">
<style>body{font:16px system-ui;margin:24px;color:#17324e;background:#fff}button{padding:14px 20px;font:inherit;border:0;border-radius:8px;background:#003366;color:white}p{line-height:1.5}</style></head><body>
<p>Continue to the payment provider to complete your payment.</p><button id="pay" disabled>Continue to payment</button><p id="status"></p>
<script>function notify(type){const value=JSON.stringify({type:type,reference:options.reference});if(window.VopCheckout){window.VopCheckout.postMessage(value);}else{window.parent.postMessage(value,'*');}}
const options=$encoded;
document.getElementById('pay').onclick=function(){try{window.LencoPay.getPaid(Object.assign({},options,{onSuccess:function(){notify('verify');},onClose:function(){notify('close');},onConfirmationPending:function(){notify('verify');}}));}catch(error){document.getElementById('status').textContent='The payment window could not open. Please retry.';notify('error');}};
</script><script src="$script" onload="document.getElementById('pay').disabled=false" onerror="document.getElementById('status').textContent='The payment provider could not be reached.';notify('error')"></script></body></html>''';
}
