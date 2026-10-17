import 'dart:async';
import 'dart:convert';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:http/http.dart' as http;
import 'package:passkeys/authenticator.dart';
import 'package:passkeys/types.dart';

import 'config.dart';

class VopPasskeys {
  VopPasskeys({FirebaseAuth? auth,PasskeyAuthenticator? authenticator,http.Client? client})
    :_auth=auth??FirebaseAuth.instance,
     _authenticator=authenticator??PasskeyAuthenticator(),
     _client=client??http.Client();

  final FirebaseAuth _auth;
  final PasskeyAuthenticator _authenticator;
  final http.Client _client;

  Future<Map<String,dynamic>> _call(String action,Map<String,Object?> payload,
      {bool authenticated=false})async{
    final origin=Uri.parse(VopConfig.apiUrl);
    if(origin.scheme!='https')throw StateError('Passkeys need an HTTPS VOP server.');
    final url=origin.replace(path:'/api/admin/passkeys',query:null,fragment:null);
    final headers=<String,String>{'Content-Type':'application/json','Accept':'application/json'};
    if(authenticated){
      final user=_auth.currentUser;
      if(user==null)throw StateError('Sign in before managing passkeys.');
      headers['Authorization']='Bearer ${await user.getIdToken()}';
    }
    final request=http.Request('POST',url)
      ..followRedirects=false
      ..headers.addAll(headers)
      ..body=jsonEncode({'action':action,'clientPlatform':'android',...payload});
    try{
      final stream=await _client.send(request).timeout(const Duration(seconds:25));
      if(stream.statusCode>=300&&stream.statusCode<400)throw StateError('Unexpected passkey API redirect.');
      final response=await http.Response.fromStream(stream).timeout(const Duration(seconds:25));
      final value=jsonDecode(response.body);
      if(value is! Map)throw StateError('Invalid VOP passkey response.');
      final body=Map<String,dynamic>.from(value);
      if (response.statusCode < 200 || response.statusCode >= 300 || body['ok'] == false) {
        throw StateError((body['error'] ?? 'Passkey request failed.').toString());
      }
      return body;
    }on TimeoutException{
      throw StateError('The VOP passkey service timed out. Check your connection.');
    }on FormatException{
      throw StateError('VOP returned an invalid passkey response.');
    }
  }

  Future<bool> get supported=>_authenticator.canAuthenticate();

  Future<void> signIn()async{
    if(!await supported)throw StateError('Passkeys are unavailable on this device.');
    final begin=await _call('beginAuthentication',{});
    final result=await _authenticator.authenticate(AuthenticateRequestType(
      relyingPartyId:begin['rpId'].toString(),
      challenge:begin['challenge'].toString(),
      timeout:(begin['timeout'] as num?)?.toInt()??60000,
      mediation:MediationType.Optional,
      preferImmediatelyAvailableCredentials:false,
      userVerification:'required',
    ));
    final finish=await _call('finishAuthentication',{
      'challengeToken':begin['challengeToken'],
      'credentialId':result.id,
      'clientDataJSON':result.clientDataJSON,
      'authenticatorData':result.authenticatorData,
      'signature':result.signature,
    });
    final token=(finish['customToken']??'').toString();
    if(token.isEmpty)throw StateError('VOP did not verify your passkey.');
    await _auth.signInWithCustomToken(token);
  }

  Future<void> register({String label='Android passkey'})async{
    if(!await supported)throw StateError('Passkeys are unavailable on this device.');
    final begin=await _call('beginRegistration',{},authenticated:true);
    final user=Map<String,dynamic>.from(begin['user'] as Map);
    final result=await _authenticator.register(RegisterRequestType(
      challenge:begin['challenge'].toString(),
      relyingParty:RelyingPartyType(
        id:begin['rpId'].toString(),name:begin['rpName'].toString()),
      user:UserType(
        id:user['id'].toString(),name:user['name'].toString(),
        displayName:user['displayName'].toString()),
      excludeCredentials:const [],
      authSelectionType:AuthenticatorSelectionType(
        requireResidentKey:true,residentKey:'required',userVerification:'required'),
      pubKeyCredParams:[
        PubKeyCredParamType(type:'public-key',alg:-7),
        PubKeyCredParamType(type:'public-key',alg:-257),
      ],
      timeout:(begin['timeout'] as num?)?.toInt()??60000,
      attestation:'none',
    ));
    await _call('finishRegistration',{
      'challengeToken':begin['challengeToken'],
      'credentialId':result.id,
      'clientDataJSON':result.clientDataJSON,
      'attestationObject':result.attestationObject,
      'transports':result.transports.whereType<String>().toList(),
      'label':label,
    },authenticated:true);
  }

  Future<List<Map<String,dynamic>>> credentials()async{
    final result=await _call('status',{},authenticated:true);
    final entries=result['items'];
    if(entries is! List)return [];
    return entries.whereType<Map>().map((e)=>Map<String,dynamic>.from(e)).toList();
  }

  Future<void> delete(String credentialHash)async{
    await _call('deleteCredential',{'credentialHash':credentialHash},authenticated:true);
  }
}
