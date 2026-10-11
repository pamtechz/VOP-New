import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:url_launcher/url_launcher.dart';
import '../core/vop_api.dart';
import '../theme/vop_theme.dart';

enum RadioMediaKind { audio, video, provider, external, unsupported }
class RadioMedia {
  const RadioMedia(this.kind, this.url, {this.provider = ''});
  final RadioMediaKind kind;
  final Uri? url;
  final String provider;
}
bool safeRadioHttps(String value) {
  if(value.length>2048)return false;
  final url=Uri.tryParse(value);
  if(url==null||url.scheme!='https'||url.host.isEmpty||
      url.userInfo.isNotEmpty||url.hasFragment||(url.hasPort&&url.port!=443))return false;
  final host=url.host.toLowerCase();
  return host!='localhost'&&!host.endsWith('.local')&&
    !host.endsWith('.internal')&&!host.endsWith('.localhost')&&
    !RegExp(r'^\d{1,3}(?:\.\d{1,3}){3}$').hasMatch(host)&&!host.contains(':');
}
bool _host(String host,String domain)=>
    host==domain||host.endsWith('.'+domain);
String? audioVerseMediaId(Uri uri) =>
    RegExp(r'/(?:media|teachings)/(\d+)(?:/|$)')
      .firstMatch(uri.path)?.group(1) ??
    RegExp(r'/(?:embed|player)/media/(\d+)(?:/|$)')
      .firstMatch(uri.path)?.group(1);
bool safeAudioVerseEmbedUrl(Uri uri) =>
    safeRadioHttps(uri.toString()) &&
    _host(uri.host.toLowerCase(),'audioverse.org') &&
    RegExp(r'^/(?:[a-z]{2}(?:-[a-z]{2})?/)?(?:embed|player)/media/\d+/?

/// Only known providers or media file URLs, never unapproved private webpages.
RadioMedia resolveRadioMedia(Map<String,dynamic> item) {
  for(final name in ['mediaUrl','streamUrl','videoUrl','audioUrl']){
    final raw=(item[name]??'').toString().trim();
    if(!safeRadioHttps(raw))continue;
    final uri=Uri.parse(raw), host=uri.host.toLowerCase(), path=uri.path.toLowerCase();
    if(host=='youtu.be'||_host(host,'youtube.com')||_host(host,'youtube-nocookie.com')){
      final segments=uri.pathSegments;
      final id=host=='youtu.be'?(segments.isEmpty?'':segments.first):
        segments.isNotEmpty&&segments.first=='watch'?(uri.queryParameters['v']??''):
        segments.length>=2&&['embed','shorts','live'].contains(segments.first)
          ?segments[1]:'';
      if(RegExp(r'^[A-Za-z0-9_-]{11}$').hasMatch(id)){
        return RadioMedia(RadioMediaKind.provider,
          Uri.parse('https://www.youtube-nocookie.com/embed/'+id+'?playsinline=1'),
          provider:'YouTube');
      }
      continue;
    }
    if(_host(host,'audioverse.org')){
      final id=audioVerseMediaId(uri);
      final approved=(item['audioEmbedUrl']??'').toString().trim();
      final parsed=Uri.tryParse(approved);
      if(parsed!=null && safeAudioVerseEmbedUrl(parsed) &&
          id!=null && audioVerseMediaId(parsed)==id){
        return RadioMedia(RadioMediaKind.provider,parsed,provider:'AudioVerse');
      }
      if(id!=null)return RadioMedia(RadioMediaKind.provider,
        Uri.parse('https://www.audioverse.org/en/embed/media/'+id),
        provider:'AudioVerse');
      return RadioMedia(RadioMediaKind.external,uri,provider:'AudioVerse');
    }
    if(_host(host,'vimeo.com')){
      final id=RegExp(r'^/(?:video/)?(\d+)(?:/|$)').firstMatch(uri.path)?.group(1);
      if(id!=null)return RadioMedia(RadioMediaKind.provider,
        Uri.parse('https://player.vimeo.com/video/'+id),provider:'Vimeo');
      continue;
    }
    if(_host(host,'soundcloud.com')){
      return RadioMedia(RadioMediaKind.provider,
        Uri.parse('https://w.soundcloud.com/player/?url='+Uri.encodeComponent(raw)),
        provider:'SoundCloud');
    }
    if(_host(host,'tiktok.com')){
      final id=RegExp(r'/@[^/]+/video/(\d+)(?:/|$)').firstMatch(uri.path)?.group(1)
        ??RegExp(r'/player/v1/(\d+)(?:/|$)').firstMatch(uri.path)?.group(1);
      if(id!=null)return RadioMedia(RadioMediaKind.provider,
        Uri.parse('https://www.tiktok.com/player/v1/'+id),provider:'TikTok');
      continue;
    }
    if(_host(host,'instagram.com')){
      final match=RegExp(r'^/(p|reel|tv)/([A-Za-z0-9_-]{5,30})(?:/|$)')
        .firstMatch(uri.path);
      if(match!=null){
        return RadioMedia(RadioMediaKind.provider,
          Uri.parse('https://www.instagram.com/'+match.group(1)!+'/'
            +match.group(2)!+'/embed/'),provider:'Instagram');
      }
      continue;
    }
    if(_host(host,'facebook.com')||host=='fb.watch'){
      final media=path.contains('/videos/')||path.contains('/reel/')
        ||path=='/watch'||path=='/watch/';
      final validWatch=!path.startsWith('/watch')||
        RegExp(r'^\d+$').hasMatch(uri.queryParameters['v']??'');
      if(media&&validWatch){
        return RadioMedia(RadioMediaKind.provider,
          Uri.parse('https://www.facebook.com/plugins/video.php?href='+
            Uri.encodeComponent(raw)+'&show_text=0'),provider:'Facebook');
      }
      continue;
    }
    if(RegExp(r'\.(mp4|m4v|webm|mov|ogv)$').hasMatch(path)){
      return RadioMedia(RadioMediaKind.video,uri);
    }
    if(RegExp(r'\.(mp3|m4a|aac|ogg|oga|wav|opus)$').hasMatch(path)){
      return RadioMedia(RadioMediaKind.audio,uri);
    }
    if(name=='streamUrl'||path.endsWith('.m3u8')||path.endsWith('.mpd')||
        item['mediaType']=='stream'){
      return RadioMedia(RadioMediaKind.video,uri,provider:'Live stream');
    }
    // Only the backend writes extensionless media types after inspecting public
    // content-type metadata. This handles signed audio/video CDN URLs.
    if(name=='mediaUrl'&&item['mediaType']=='audio'){
      return RadioMedia(RadioMediaKind.audio,uri,provider:'Audio file');
    }
    if(name=='mediaUrl'&&item['mediaType']=='video'){
      return RadioMedia(RadioMediaKind.video,uri,provider:'Video file');
    }
  }
  return const RadioMedia(RadioMediaKind.unsupported,null);
}
/// The installed Android package ID identifies this YouTube embed client.
const vopYoutubeClientOrigin='https://com.sda.vop';
String youtubeEmbedHtml(Uri embedUrl) {
  if(embedUrl.host!='www.youtube-nocookie.com' ||
     !RegExp(r'^/embed/[A-Za-z0-9_-]{11}$').hasMatch(embedUrl.path)) {
    throw ArgumentError('Only validated YouTube embed URLs are accepted.');
  }
  // A secure HTTPS baseUrl supplies the required HTTP Referer for the iframe.
  final identified=embedUrl.replace(queryParameters:{
    ...embedUrl.queryParameters,'origin':vopYoutubeClientOrigin,
    'playsinline':'1',
  });
  return '''<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="strict-origin-when-cross-origin">
<style>html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:#071a33}
iframe{display:block;width:100%;height:100%;border:0}</style>
</head><body><iframe title="YouTube video player"
src="$identified"
referrerpolicy="strict-origin-when-cross-origin"
allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share"
allowfullscreen></iframe></body></html>''';
}
class RadioPlayerScreen extends StatefulWidget {
  const RadioPlayerScreen({required this.item,this.api,
    this.related=const [],super.key});
  final Map<String,dynamic> item;
  final VopApi? api;
  final List<Map<String,dynamic>> related;
  @override State<RadioPlayerScreen> createState()=>_RadioPlayerScreenState();
}
class _RadioPlayerScreenState extends State<RadioPlayerScreen>
    with WidgetsBindingObserver {
  late final RadioMedia source=resolveRadioMedia(widget.item);
  VideoPlayerController? player;
  WebViewController? embed;
  bool loading=false;
  bool _preparing=false;
  bool _openingInApp=false;
  String? error;
  late List<Map<String,dynamic>> recommendations;
  String category='All';
  @override void initState(){
    super.initState();
    recommendations=List<Map<String,dynamic>>.from(widget.related);
    WidgetsBinding.instance.addObserver(this);
    if(source.kind==RadioMediaKind.audio||source.kind==RadioMediaKind.video){
      _prepare();
    }
  }
  Future<void> _prepare()async{
    if(_preparing)return;
    if(source.url==null){if(mounted)setState((){
      loading=false;error='This programme has no supported playable media URL.';
    });return;}
    _preparing=true;
    if(mounted)setState((){loading=true;error=null;});
    if(source.kind==RadioMediaKind.external){
      if(mounted)setState(()=>loading=false);
      return;
    }
    if(source.kind==RadioMediaKind.provider){
      final allowed=source.url!.host;
      embed=WebViewController()
        ..setJavaScriptMode(JavaScriptMode.unrestricted)
        ..setBackgroundColor(const Color(0xFF071A33))
        ..setNavigationDelegate(NavigationDelegate(
          onPageFinished:(_){if(mounted)setState(()=>loading=false);},
          onWebResourceError:(e){if(e.isForMainFrame==true&&mounted)setState((){
            loading=false;error='The media provider could not load.';
          });},
          onNavigationRequest:(request){
            final uri=Uri.tryParse(request.url);
            if(uri==null)return NavigationDecision.prevent;
            // YouTube may require HTTPS subframe navigation for consent and
            // its player internals. Main-frame navigation remains restricted.
            if(!request.isMainFrame){
              return uri.scheme=='https'||request.url=='about:blank'
                ?NavigationDecision.navigate:NavigationDecision.prevent;
            }
            if(uri.scheme!='https')return NavigationDecision.prevent;
            final host=uri.host.toLowerCase();
            return host==allowed||
                (source.provider=='YouTube'&&host=='com.sda.vop')
              ?NavigationDecision.navigate:NavigationDecision.prevent;
          },
        ));
      try {
        if(source.provider=='YouTube'){
          await embed!.loadHtmlString(youtubeEmbedHtml(source.url!),
            baseUrl:'$vopYoutubeClientOrigin/');
        }else{
          await embed!.loadRequest(source.url!);
        }
      }catch(_){
        if(mounted)setState((){
          loading=false;
          error='The media player could not initialise. Please retry.';
        });
      }finally{_preparing=false;}
      return;
    }
    try{
      final controller=VideoPlayerController.networkUrl(source.url!,
        videoPlayerOptions:VideoPlayerOptions(mixWithOthers:false));
      player=controller;
      await controller.initialize();
      if(mounted){setState(()=>loading=false);await controller.play();}
    }catch(_){if(mounted)setState((){
      loading=false;error='Unable to play this media. Verify the URL and connection.';
    });}finally{_preparing=false;}
  }
  @override void didChangeAppLifecycleState(AppLifecycleState state){
    if(state==AppLifecycleState.paused||state==AppLifecycleState.inactive)player?.pause();
  }
  @override void dispose(){
    WidgetsBinding.instance.removeObserver(this);
    player?.dispose();embed=null;super.dispose();
  }
  String _clock(Duration value){
    final minutes=value.inMinutes,seconds=value.inSeconds.remainder(60);
    return minutes.toString()+':'+seconds.toString().padLeft(2,'0');
  }
  Future<void> _skip(int offset)async{
    final c=player;
    if(c==null||!c.value.isInitialized)return;
    final target=c.value.position+Duration(seconds:offset);
    await c.seekTo(target<Duration.zero?Duration.zero:
      target>c.value.duration?c.value.duration:target);
  }
  String value(Map<String,dynamic> item,String key)=>
    (item[key]??'').toString().trim();
  String mediaKey(Map<String,dynamic> item){
    final id=value(item,'id');
    return id.isNotEmpty?id:[value(item,'mediaUrl'),value(item,'audioUrl'),
      value(item,'videoUrl'),value(item,'streamUrl')]
      .firstWhere((v)=>v.isNotEmpty,orElse:()=>value(item,'title'));
  }
  Future<void> _reload()async{
    final api=widget.api;
    if(api==null)return;
    try{
      final result=await api.radio();
      final raw=result['items'];
      if(!mounted)return;
      setState(()=>recommendations=raw is List
        ?raw.whereType<Map>().map((e)=>Map<String,dynamic>.from(e)).toList()
        :<Map<String,dynamic>>[]);
    }catch(_){
      if(mounted)ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content:Text('Could not refresh programmes.')));
    }
  }
  void _select(Map<String,dynamic> item){
    if(mediaKey(item)==mediaKey(widget.item))return;
    Navigator.pushReplacement(context,MaterialPageRoute<void>(
      builder:(_)=>RadioPlayerScreen(item:item,api:widget.api,
        related:recommendations)));
  }
  Future<void> _openInApp()async{
    if(_openingInApp)return;
    final raw=[value(widget.item,'mediaUrl'),value(widget.item,'audioUrl'),
      value(widget.item,'videoUrl'),value(widget.item,'streamUrl')]
      .firstWhere((value)=>value.isNotEmpty,orElse:()=>'');
    if(!safeRadioHttps(raw))return;
    _openingInApp=true;
    try{
      final opened=await launchUrl(Uri.parse(raw),mode:LaunchMode.inAppBrowserView);
      if(!opened&&mounted)ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content:Text('Unable to open media.')));
    }catch(_){
      if(mounted)ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content:Text('Unable to open media.')));
    }finally{_openingInApp=false;}
  }
  Widget _moreProgrammes(){
    final items=recommendations.where((item)=>
      mediaKey(item)!=mediaKey(widget.item)).where((item){
        final result=resolveRadioMedia(item);
        if(category=='Audio')return result.kind==RadioMediaKind.audio||
          result.provider=='AudioVerse'||result.provider=='SoundCloud';
        if(category=='Video')return result.kind==RadioMediaKind.video||
          (result.kind==RadioMediaKind.provider&&
            result.provider!='AudioVerse'&&result.provider!='SoundCloud');
        return true;
      }).toList();
    return Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
      Row(children:[
        Expanded(child:Text('More from VOP',
          style:Theme.of(context).textTheme.titleLarge)),
        Text(items.length.toString(),
          style:Theme.of(context).textTheme.labelMedium),
      ]),
      const SizedBox(height:8),
      SingleChildScrollView(scrollDirection:Axis.horizontal,
        child:Row(children:[
          for(final label in const ['All','Video','Audio'])
            Padding(padding:const EdgeInsets.only(right:8),
              child:ChoiceChip(label:Text(label),selected:category==label,
                onSelected:(_)=>setState(()=>category=label))),
        ])),
      const SizedBox(height:9),
      if(items.isEmpty)const Padding(padding:EdgeInsets.all(22),
        child:Center(child:Text('No other programmes yet'))),
      ...items.map((item)=>Card(margin:const EdgeInsets.only(bottom:9),
        clipBehavior:Clip.antiAlias,
        child:InkWell(onTap:()=>_select(item),child:Row(children:[
          SizedBox(width:116,height:80,
            child:value(item,'posterUrl').startsWith('https://')
              ?Image.network(value(item,'posterUrl'),fit:BoxFit.cover,
                errorBuilder:(_,error,stack)=>_posterPlaceholder(item))
              :_posterPlaceholder(item)),
          Expanded(child:Padding(padding:const EdgeInsets.all(11),
            child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
              Text(value(item,'title'),maxLines:2,overflow:TextOverflow.ellipsis,
                style:const TextStyle(fontSize:13,fontWeight:FontWeight.w800)),
              const SizedBox(height:4),
              Text(value(item,'speaker').isNotEmpty
                  ?value(item,'speaker'):resolveRadioMedia(item).provider,
                maxLines:1,overflow:TextOverflow.ellipsis,
                style:TextStyle(fontSize:11,
                  color:Theme.of(context).colorScheme.onSurfaceVariant)),
            ]))),
          const Icon(Icons.play_circle_outline),
          const SizedBox(width:10),
        ]))),
      ),
    ]);
  }
  Widget _posterPlaceholder(Map<String,dynamic> item)=>Container(
    color:VopColors.navy,
    child:Center(child:Icon(
      resolveRadioMedia(item).kind==RadioMediaKind.audio
        ?Icons.graphic_eq:Icons.play_circle_outline,
      color:VopColors.goldLight,size:30)));
  @override Widget build(BuildContext context){
    final c=player,v=c?.value;
    final ready=v?.isInitialized==true;
    final duration=v?.duration??Duration.zero;
    final position=v?.position??Duration.zero;
    final elapsed=position.inMilliseconds.clamp(0,
      duration.inMilliseconds>0?duration.inMilliseconds:0);
    return Scaffold(
      appBar:AppBar(title:const Text('VOP Radio & Media')),
      body:RefreshIndicator(onRefresh:_reload,
        child:ListView(physics:const AlwaysScrollableScrollPhysics(),
          padding:const EdgeInsets.all(16),children:[
        AspectRatio(aspectRatio:16/9,child:Container(
          clipBehavior:Clip.antiAlias,
          decoration:BoxDecoration(color:const Color(0xFF071A33),
            borderRadius:BorderRadius.circular(16)),
          child:Stack(alignment:Alignment.center,children:[
            if(ready&&source.kind==RadioMediaKind.video)
              AspectRatio(aspectRatio:v!.aspectRatio>0?v.aspectRatio:16/9,
                child:VideoPlayer(c!)),
            if(source.kind==RadioMediaKind.provider&&embed!=null)
              WebViewWidget(controller:embed!),
            if(source.kind==RadioMediaKind.provider&&embed==null)
              Positioned.fill(child:Stack(fit:StackFit.expand,children:[
                if(safeRadioHttps(value(widget.item,'posterUrl')))
                  Image.network(value(widget.item,'posterUrl'),fit:BoxFit.cover,
                    errorBuilder:(_,__,___)=>const SizedBox.shrink()),
                Container(color:Colors.black38),
                Center(child:FilledButton.icon(
                  onPressed:source.provider=='AudioVerse'?_openInApp:_prepare,
                  icon:const Icon(Icons.play_arrow_rounded),
                  label:const Text('Play'),
                )),
              ])),
            if(source.kind==RadioMediaKind.audio)
              const Icon(Icons.graphic_eq,size:74,color:VopColors.goldLight),
            if(source.kind==RadioMediaKind.external)
              FilledButton.icon(onPressed:_openInApp,
                icon:const Icon(Icons.play_arrow),label:const Text('Play')),

            if(loading)const CircularProgressIndicator(color:VopColors.goldLight),
            if(error!=null)
              FilledButton.tonalIcon(
                onPressed:source.provider=='AudioVerse'?_openInApp:_prepare,
                icon:const Icon(Icons.refresh),label:const Text('Retry')),
          ]),
        )),
        const SizedBox(height:16),
        Text((widget.item['title']??'VOP Programme').toString(),
          style:Theme.of(context).textTheme.headlineSmall),
        if([widget.item['speaker'],widget.item['series']]
            .any((entry)=>entry!=null&&entry.toString().trim().isNotEmpty))...[
          const SizedBox(height:6),
          Text([widget.item['speaker'],widget.item['series']]
            .where((entry)=>entry!=null&&entry.toString().trim().isNotEmpty)
            .join(' · ')),
        ],
        if(source.provider=='AudioVerse'&&source.kind==RadioMediaKind.provider)
          Row(children:[
            TextButton.icon(onPressed:_openInApp,
              icon:const Icon(Icons.play_circle_outline,size:17),
              label:const Text('Listen in app')),
            const SizedBox(width:8),
            TextButton.icon(onPressed:_prepare,
              icon:const Icon(Icons.picture_in_picture_alt_outlined,size:17),
              label:const Text('Embedded player')),
          ]),
        if(ready)...[
          const SizedBox(height:14),
          if(duration>Duration.zero)Slider(
            min:0,max:duration.inMilliseconds.toDouble(),
            value:elapsed.toDouble(),
            onChanged:(value)=>c!.seekTo(Duration(milliseconds:value.round()))),
          Row(mainAxisAlignment:MainAxisAlignment.spaceBetween,children:[
            Text(_clock(position)),
            Text(duration>Duration.zero?_clock(duration):'LIVE'),
          ]),
          Row(mainAxisAlignment:MainAxisAlignment.center,children:[
            IconButton(tooltip:'Back ten seconds',onPressed:()=>_skip(-10),
              icon:const Icon(Icons.replay_10)),
            FilledButton.tonalIcon(
              onPressed:()=>v.isPlaying?c!.pause():c!.play(),
              icon:Icon(v!.isPlaying?Icons.pause:Icons.play_arrow),
              label:Text(v.isPlaying?'Pause':'Play')),
            IconButton(tooltip:'Forward ten seconds',onPressed:()=>_skip(10),
              icon:const Icon(Icons.forward_10)),
            PopupMenuButton<double>(
              tooltip:'Playback speed',icon:const Icon(Icons.speed),
              onSelected:(speed)=>c!.setPlaybackSpeed(speed),
              itemBuilder:(_)=>[
                for(final speed in [0.75,1.0,1.25,1.5,2.0])
                  PopupMenuItem(value:speed,child:Text(speed.toString()+'x')),
              ]),
          ]),
        ],
        const SizedBox(height:17),
        if((widget.item['description']??'').toString().isNotEmpty)
          Text((widget.item['description']??'').toString(),
            maxLines:4,overflow:TextOverflow.ellipsis,
            style:const TextStyle(height:1.45)),
        const SizedBox(height:20),
        _moreProgrammes(),
      ]),
      ),
    );
  }
}