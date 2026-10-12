import 'dart:convert';
import 'dart:io';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class OfflineStudy {
  OfflineStudy({FlutterSecureStorage? storage}):
    _storage=storage??const FlutterSecureStorage();
  final FlutterSecureStorage _storage;
  static const maxCompressedBytes=320000;
  static const maxRecords=80;
  static const lifetime=Duration(days:14);
  static final _id=RegExp(r'^[A-Za-z0-9_-]{1,160}$');

  String _userKey(String uid)=>base64UrlEncode(utf8.encode(uid));
  String _key(String uid,String kind,String id)=>
    'vop.offline.'+_userKey(uid)+'.'+kind+'.'+base64UrlEncode(utf8.encode(id));
  String _indexKey(String uid)=>'vop.offline.index.'+_userKey(uid);
  String _queueKey(String uid)=>'vop.offline.queue.'+_userKey(uid);

  String _encode(Object payload){
    final bytes=zlib.encode(utf8.encode(jsonEncode(payload)));
    if(bytes.length>maxCompressedBytes)throw const OfflineStorageException(
      'This study is too large for the encrypted offline cache.');
    return base64Encode(bytes);
  }
  Map<String,dynamic>? _decode(String? encoded){
    if(encoded==null||encoded.isEmpty)return null;
    try{
      final data=jsonDecode(utf8.decode(zlib.decode(base64Decode(encoded))));
      return data is Map?Map<String,dynamic>.from(data):null;
    }catch(_){return null;}
  }
  Future<List<Map<String,dynamic>>> _index(String uid)async{
    final data=_decode(await _storage.read(key:_indexKey(uid)));
    final rows=data?['items'];
    return rows is List
      ?rows.whereType<Map>().map((v)=>Map<String,dynamic>.from(v)).toList()
      :[];
  }
  Future<void> save(String uid,String kind,String id,Map<String,dynamic> value,
      {String title='',DateTime? expiresAt})async{
    if(uid.isEmpty||!_id.hasMatch(kind)||!_id.hasMatch(id))throw
      const OfflineStorageException('This item cannot be downloaded.');
    final now=DateTime.now().toUtc();
    final expiry=expiresAt?.toUtc()??now.add(lifetime);
    final key=_key(uid,kind,id);
    await _storage.write(key:key,value:_encode({
      'createdAt':now.toIso8601String(),
      'expiresAt':expiry.toIso8601String(),'payload':value,
    }));
    final previous=await _index(uid);
    final items=[...previous.where((item)=>item['key']!=key),{
      'key':key,'kind':kind,'id':id,'title':title,
      'savedAt':now.toIso8601String(),'expiresAt':expiry.toIso8601String(),
    }]..sort((a,b)=>((b['savedAt']??'').toString())
      .compareTo((a['savedAt']??'').toString()));
    if(items.length>maxRecords){
      for(final old in items.skip(maxRecords)){
        await _storage.delete(key:old['key'].toString());
      }
      items.removeRange(maxRecords,items.length);
    }
    await _storage.write(key:_indexKey(uid),value:_encode({'items':items}));
  }
  Future<Map<String,dynamic>?> read(String uid,String kind,String id)async{
    if(uid.isEmpty||!_id.hasMatch(kind)||!_id.hasMatch(id))return null;
    final data=_decode(await _storage.read(key:_key(uid,kind,id)));
    if(data==null)return null;
    final deadline=DateTime.tryParse((data['expiresAt']??'').toString());
    if(deadline==null||!DateTime.now().toUtc().isBefore(deadline))return null;
    final payload=data['payload'];
    return payload is Map?Map<String,dynamic>.from(payload):null;
  }
  Future<List<Map<String,dynamic>>> list(String uid)async{
    if(uid.isEmpty)return [];
    final now=DateTime.now().toUtc();
    return (await _index(uid)).where((item){
      final deadline=DateTime.tryParse((item['expiresAt']??'').toString());
      return deadline!=null&&now.isBefore(deadline);
    }).toList();
  }
  Future<void> delete(String uid,String kind,String id)async{
    if(uid.isEmpty||!_id.hasMatch(kind)||!_id.hasMatch(id))return;
    final key=_key(uid,kind,id);
    await _storage.delete(key:key);
    final items=(await _index(uid)).where((entry)=>entry['key']!=key).toList();
    await _storage.write(key:_indexKey(uid),value:_encode({'items':items}));
  }
  Future<List<Map<String,dynamic>>> pending(String uid)async{
    if(uid.isEmpty)return [];
    final data=_decode(await _storage.read(key:_queueKey(uid)));
    final rows=data?['items'];
    return rows is List
      ?rows.whereType<Map>().map((v)=>Map<String,dynamic>.from(v)).toList()
      :[];
  }
  Future<void> enqueue(String uid,String type,Map<String,dynamic> body,
      {DateTime? expiresAt})async{
    if(uid.isEmpty||!['saveLessonResume','completeLesson','submitQuiz'].contains(type)){
      throw const OfflineStorageException('This change cannot be queued offline.');
    }
    final items=await pending(uid);
    final id=type=='submitQuiz'
      ?'quiz:'+body['sessionId'].toString()
      :type+':'+body['language'].toString()+':'+body['guideId'].toString()+
        ':'+body['lessonId'].toString();
    final change=<String,dynamic>{
      'id':id,'type':type,'body':body,
      'createdAt':DateTime.now().toUtc().toIso8601String(),
      if(expiresAt!=null)'expiresAt':expiresAt.toUtc().toIso8601String(),
    };
    final updated=[...items.where((entry)=>entry['id']!=id),change];
    if(updated.length>50)throw const OfflineStorageException(
      'Sync pending changes before saving more offline.');
    await _storage.write(key:_queueKey(uid),value:_encode({'items':updated}));
  }
  Future<void> resolvePending(String uid,String id)async{
    final rows=(await pending(uid)).where((row)=>row['id']!=id).toList();
    await _storage.write(key:_queueKey(uid),value:_encode({'items':rows}));
  }
  Future<void> clear(String uid)async{
    if(uid.isEmpty)return;
    for(final item in await _index(uid)){
      await _storage.delete(key:item['key'].toString());
    }
    await _storage.delete(key:_indexKey(uid));
    await _storage.delete(key:_queueKey(uid));
  }
}
class OfflineStorageException implements Exception {
  const OfflineStorageException(this.message);
  final String message;
  @override String toString()=>message;
}
