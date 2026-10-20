import 'package:flutter_test/flutter_test.dart';
import 'package:vop/widgets/payment_checkout_html.dart';

void main(){
  test('payment browser accepts only the configured official provider script',(){
    for(final script in ['http://pay.lenco.co/js/v1/inline.js','https://example.test/inline.js','https://pay.lenco.co/js/v1/inline.js?extra=1']){
      expect(()=>paymentCheckoutHtml({'scriptUrl':script},{},''),throwsStateError);
    }
  });
  test('provider callbacks request verification and never create a paid record',(){
    final html=paymentCheckoutHtml({'scriptUrl':'https://pay.lenco.co/js/v1/inline.js','publicKey':'public-client-key','channels':['card']},
      {'reference':'reference','amountDecimal':'10.00','currency':'ZMW'},'test@example.invalid');
    expect(html,contains("notify('verify')"));
    expect(html,contains('LencoPay.getPaid'));
    expect(html,contains('"amount":10.0'));
    expect(html,contains('reference:options.reference'));
    expect(html,contains('Content-Security-Policy'));
    expect(html, isNot(contains('Bearer')));
  });
}
