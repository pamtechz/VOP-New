import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:url_launcher/url_launcher.dart';
import '../theme/vop_theme.dart';
import '../core/config.dart';

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
      final match=RegExp(r'/(?:media|teachings)/(\d+)(?:/|$)').firstMatch(uri.path);
      final embed=RegExp(r'/embed/media/(\d+)(?:/|$)').firstMatch(uri.path);
      final id=match?.group(1)??embed?.group(1);
      if(id!=null)return RadioMedia(RadioMediaKind.external,
        uri,provider:'AudioVerse');
      continue;
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
String get vopYoutubeClientOrigin=>Uri.parse(VopConfig.apiUrl).origin;
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
  const RadioPlayerScreen({required this.item,super.key});
  final Map<String,dynamic> item;
  @override State<RadioPlayerScreen> createState()=>_RadioPlayerScreenState();
}
class _RadioPlayerScreenState extends State<RadioPlayerScreen>
    with WidgetsBindingObserver {
  late final RadioMedia source=resolveRadioMedia(widget.item);
  VideoPlayerController? player;
  WebViewController? embed;
  bool loading=true;
  String? error;
  @override void initState(){super.initState();WidgetsBinding.instance.addObserver(this);_prepare();}
  Future<void> _prepare()async{
    if(source.url==null){if(mounted)setState((){
      loading=false;error='This programme has no supported playable media URL.';
    });return;}
    // A retry resets any previous load error.
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
      }
      return;
    }
    try{
      final controller=VideoPlayerController.networkUrl(source.url!,
        videoPlayerOptions:VideoPlayerOptions(mixWithOthers:false));
      player=controller;
      await controller.initialize();
      controller.addListener(_refresh);
      if(mounted){setState(()=>loading=false);await controller.play();}
    }catch(_){if(mounted)setState((){
      loading=false;error='Unable to play this media. Verify the URL and connection.';
    });}
  }
  void _refresh(){if(mounted)setState((){});}
  @override void didChangeAppLifecycleState(AppLifecycleState state){
    if(state==AppLifecycleState.paused||state==AppLifecycleState.inactive)player?.pause();
  }
  @override void dispose(){
    WidgetsBinding.instance.removeObserver(this);
    player?.removeListener(_refresh);player?.dispose();embed=null;super.dispose();
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
  @override Widget build(BuildContext context){
    final c=player,v=c?.value;
    final ready=v?.isInitialized==true;
    final duration=v?.duration??Duration.zero;
    final position=v?.position??Duration.zero;
    final elapsed=position.inMilliseconds.clamp(0,
      duration.inMilliseconds>0?duration.inMilliseconds:0);
    return Scaffold(
      appBar:AppBar(title:const Text('VOP Radio & Media')),
      body:ListView(padding:const EdgeInsets.all(16),children:[
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
            if(source.kind==RadioMediaKind.audio)
              const Icon(Icons.graphic_eq,size:74,color:VopColors.goldLight),
            if(source.kind==RadioMediaKind.external)
              const Icon(Icons.open_in_new,size:65,color:VopColors.goldLight),
            if(loading)const CircularProgressIndicator(color:VopColors.goldLight),
            if(error!=null)Padding(
              padding:const EdgeInsets.all(18),
              child:Column(mainAxisSize:MainAxisSize.min,children:[
                Text(error!,textAlign:TextAlign.center,
                  style:const TextStyle(color:Colors.white)),
                const SizedBox(height:12),
                IconButton.filledTonal(
                  tooltip:'Retry playback',
                  onPressed:()=>_prepare(),
                  icon:const Icon(Icons.refresh_rounded),
                ),
              ]),
            ),
          ]),
        )),
        const SizedBox(height:16),
        Text((widget.item['title']??'VOP Programme').toString(),
          style:Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height:6),
        Text([widget.item['speaker'],widget.item['series'],source.provider]
          .where((e)=>e!=null&&e.toString().trim().isNotEmpty)
          .join(' · ')),
        if(source.kind==RadioMediaKind.external && source.url!=null)
          Padding(
            padding:const EdgeInsets.only(top:12),
            child:FilledButton.icon(
              onPressed:()=>launchUrl(source.url!,
                mode:LaunchMode.externalApplication),
              icon:const Icon(Icons.open_in_new_rounded),
              label:const Text('Play on provider'),
            ),
          ),
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
            style:const TextStyle(height:1.55)),
      ]),
    );
  }
}
