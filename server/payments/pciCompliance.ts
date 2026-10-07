export function passesLuhnCheck(digits:string):boolean {
  let sum=0;
  let alternate=false;
  for(let i=digits.length-1;i>=0;i--){
    let n=parseInt(digits[i],10);
    if(Number.isNaN(n))return false;
    if(alternate){
      n*=2;
      if(n>9)n=(n%10)+1;
    }
    sum+=n;
    alternate=!alternate;
  }
  return sum%10===0;
}

export const PROHIBITED_CARD_FIELDS=new Set([
  'cardnumber','card_number','pan','primaryaccountnumber',
  'cvv','cvc','cvv2','cvc2','securitycode','security_code',
  'pin','pinblock','cardpin',
  'expirymonth','expiryyear','expirationdate','cardexpiry','track2',
]);

export function assertPciDssCompliance(value:unknown){
  if(!value||typeof value!=='object')return;
  const scan=(obj:Record<string,unknown>,depth=0)=>{
    if(depth>6)return;
    for(const [key,val] of Object.entries(obj)){
      const normalizedKey=key.toLowerCase().replace(/[^a-z0-9]/g,'');
      if(PROHIBITED_CARD_FIELDS.has(normalizedKey)){
        throw new Error('PCI-DSS compliance violation: Raw cardholder and sensitive authentication data (PAN, CVV, PIN) cannot be ingested, transmitted to, or stored on VOP servers. Card transactions must use secure client-side hosted 3D-Secure checkout.');
      }
      if(typeof val==='string'){
        const digits=val.replace(/[\s-]/g,'');
        if(/^\d{13,19}$/.test(digits)&&passesLuhnCheck(digits)){
          throw new Error('PCI-DSS compliance violation: Primary Account Numbers (PAN) cannot be submitted to application endpoints. Use secure client-side tokenized checkout.');
        }
      }else if(val&&typeof val==='object'&&!Array.isArray(val)){
        scan(val as Record<string,unknown>,depth+1);
      }
    }
  };
  scan(value as Record<string,unknown>);
}

export function redactCardNumbers(text:string):string {
  return text.replace(/\b(?:\d[ -]*?){13,19}\b/g,'[REDACTED_PCI_PAN]');
}
