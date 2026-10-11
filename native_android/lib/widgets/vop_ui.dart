import 'package:flutter/material.dart';
import '../theme/vop_theme.dart';

class VopBrand extends StatelessWidget {
  const VopBrand({this.compact=false,super.key});
  final bool compact;
  @override Widget build(BuildContext context)=>Row(mainAxisSize: MainAxisSize.min,children:[
    ClipRRect(borderRadius: BorderRadius.circular(11),
      child: Container(width: compact?36:44,height: compact?36:44,
        color:VopColors.navy,
        child: Image.network('https://vopafrica.vercel.app/assets/vop_logo_2.png',
          fit:BoxFit.contain,
          errorBuilder:(_,error,stack)=>const Icon(Icons.auto_stories,
            color:VopColors.goldLight,size:23)))),
    const SizedBox(width:10),
    Column(crossAxisAlignment:CrossAxisAlignment.start,mainAxisSize:MainAxisSize.min,children:[
      Text('Voice of Prophecy',style:TextStyle(
        fontSize:compact?14:16,fontWeight:FontWeight.w900,letterSpacing:-.45)),
      Text('LEARNING WORKSPACE',style:TextStyle(
        fontSize:compact?8:9.5,fontWeight:FontWeight.w700,
        letterSpacing:1.15,color:Theme.of(context).colorScheme.onSurfaceVariant)),
    ]),
  ]);
}

class VopSectionTitle extends StatelessWidget {
  const VopSectionTitle(this.title,{this.subtitle,this.action,this.onAction,super.key});
  final String title;
  final String? subtitle,action;
  final VoidCallback? onAction;
  @override Widget build(BuildContext context)=>Padding(
    padding:const EdgeInsets.symmetric(vertical:9),
    child:Row(crossAxisAlignment:CrossAxisAlignment.center,children:[
      Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
        Text(title,style:Theme.of(context).textTheme.titleLarge),
        if(subtitle!=null)...[
          const SizedBox(height:3),
          Text(subtitle!,style:TextStyle(
            fontSize:12,color:Theme.of(context).colorScheme.onSurfaceVariant)),
        ],
      ])),
      if(action!=null&&onAction!=null)
        TextButton.icon(onPressed:onAction!,
          icon:const Icon(Icons.arrow_forward,size:15),
          iconAlignment:IconAlignment.end,label:Text(action!)),
    ]),
  );
}

/// Compact, content-first banner for narrow Android screens.
/// No giant decorative circles: the study content stays in the first viewport.
class VopHeroCard extends StatelessWidget {
  const VopHeroCard({
    required this.title,required this.description,required this.icon,
    this.kicker='YOUR JOURNEY',this.cta='Explore',this.onTap,super.key,
  });
  final String title,description,kicker,cta;
  final IconData icon;
  final VoidCallback? onTap;
  @override Widget build(BuildContext context)=>LayoutBuilder(
    builder:(context,constraints){
      final narrow=constraints.maxWidth<360;
      return Container(
        decoration:BoxDecoration(
          borderRadius:BorderRadius.circular(18),
          gradient:const LinearGradient(
            colors:[Color(0xFF002D72),Color(0xFF0D47A1)],
            begin:Alignment.topLeft,end:Alignment.bottomRight),
          boxShadow:[BoxShadow(color:VopColors.navy.withValues(alpha:.11),
            blurRadius:14,offset:const Offset(0,5))]),
        child:Padding(padding:EdgeInsets.all(narrow?14:16),
          child:Column(mainAxisSize:MainAxisSize.min,
            crossAxisAlignment:CrossAxisAlignment.start,children:[
            Row(children:[
              const Icon(Icons.auto_awesome_rounded,
                color:VopColors.goldLight,size:14),
              const SizedBox(width:7),
              Expanded(child:Text(kicker,maxLines:1,
                overflow:TextOverflow.ellipsis,style:const TextStyle(
                  fontSize:10,fontWeight:FontWeight.w800,
                  letterSpacing:1.25,color:VopColors.goldLight))),
              Container(width:28,height:28,
                decoration:BoxDecoration(
                  borderRadius:BorderRadius.circular(10),
                  color:Colors.white.withValues(alpha:.12)),
                child:Icon(icon,size:17,color:Colors.white)),
            ]),
            const SizedBox(height:9),
            Text(title,style:TextStyle(color:Colors.white,
              fontSize:narrow?19:21,fontWeight:FontWeight.w800,
              height:1.17,letterSpacing:-.55)),
            const SizedBox(height:6),
            Text(description,maxLines:2,overflow:TextOverflow.ellipsis,
              style:TextStyle(color:Colors.white.withValues(alpha:.88),
                height:1.33,fontSize:11.5)),
            if(onTap!=null)...[
              const SizedBox(height:9),
              FilledButton.icon(onPressed:onTap,
                style:FilledButton.styleFrom(
                  minimumSize:const Size(0,36),
                  padding:const EdgeInsets.symmetric(horizontal:16,vertical:0),
                  backgroundColor:VopColors.goldLight,
                  foregroundColor:VopColors.navyDeep),
                icon:const Icon(Icons.arrow_forward_rounded,size:16),
                label:Text(cta)),
            ],
          ]),
        ),
      );
    },
  );
}

class VopFeatureTile extends StatelessWidget {
  const VopFeatureTile({required this.title,required this.subtitle,
    required this.icon,required this.tint,required this.onTap,super.key});
  final String title,subtitle;
  final IconData icon;
  final Color tint;
  final VoidCallback onTap;
  @override Widget build(BuildContext context){
    final dark=Theme.of(context).brightness==Brightness.dark;
    // Deep-blue icons disappear against dark cards; brighten only in dark mode.
    final effectiveTint=dark&&tint==VopColors.navyBright
      ?const Color(0xFF9BC4FF):tint;
    return Card(
      clipBehavior:Clip.antiAlias,
      child:InkWell(onTap:onTap,
        child:Padding(padding:const EdgeInsets.all(12),
          child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
            Container(width:35,height:35,
              decoration:BoxDecoration(
                color:effectiveTint.withValues(alpha:dark ? .18 : .10),
                borderRadius:BorderRadius.circular(10)),
              child:Icon(icon,color:effectiveTint,size:20)),
            const Spacer(),
            Text(title,maxLines:1,overflow:TextOverflow.ellipsis,
              style:const TextStyle(fontSize:12.5,fontWeight:FontWeight.w800)),
            const SizedBox(height:2),
            Text(subtitle,maxLines:2,overflow:TextOverflow.ellipsis,
              style:TextStyle(fontSize:10.5,height:1.28,
                color:Theme.of(context).colorScheme.onSurfaceVariant)),
          ])),
      ),
    );
  }
}

class VopEmpty extends StatelessWidget {
  const VopEmpty({required this.icon,required this.message,this.onRetry,super.key});
  final IconData icon;
  final String message;
  final VoidCallback? onRetry;
  @override Widget build(BuildContext context)=>Center(child:Padding(
    padding:const EdgeInsets.all(28),
    child:Column(mainAxisSize:MainAxisSize.min,children:[
      Container(padding:const EdgeInsets.all(17),
        decoration:BoxDecoration(color:Theme.of(context).colorScheme.primaryContainer,
          shape:BoxShape.circle),
        child:Icon(icon,size:36,color:Theme.of(context).colorScheme.primary)),
      const SizedBox(height:14),
      Text(message,textAlign:TextAlign.center,
        style:TextStyle(color:Theme.of(context).colorScheme.onSurfaceVariant,height:1.5)),
      if(onRetry!=null)...[
        const SizedBox(height:12),
        OutlinedButton.icon(onPressed:onRetry!,icon:const Icon(Icons.refresh),
          label:const Text('Try again')),
      ],
    ]),
  ));
}
/// Native shimmer skeleton: content never forces an entire app refresh.
class VopSkeleton extends StatefulWidget {
  const VopSkeleton({this.rows=4,super.key});
  final int rows;
  @override State<VopSkeleton> createState()=>_VopSkeletonState();
}
class _VopSkeletonState extends State<VopSkeleton> with SingleTickerProviderStateMixin {
  late final AnimationController animation=AnimationController(
    vsync:this,duration:const Duration(milliseconds:1100))..repeat(reverse:true);
  @override void dispose(){animation.dispose();super.dispose();}
  @override Widget build(BuildContext context)=>AnimatedBuilder(
    animation:animation,
    builder:(context,child)=>ListView(padding:const EdgeInsets.all(18),children:[
      ...List.generate(widget.rows,(index)=>Container(
        height:index==0?175:94,
        margin:const EdgeInsets.only(bottom:13),
        decoration:BoxDecoration(
          borderRadius:BorderRadius.circular(18),
          color:Theme.of(context).colorScheme.onSurface.withValues(
            alpha:.04+animation.value*.035)),
      )),
    ]),
  );
}
class VopCourseCard extends StatelessWidget {
  const VopCourseCard({required this.title,required this.description,
    required this.language,required this.imageUrl,required this.onTap,
    super.key});
  final String title,description,language,imageUrl;
  final VoidCallback onTap;
  @override Widget build(BuildContext context)=>Card(
    margin:const EdgeInsets.only(bottom:9),
    clipBehavior:Clip.antiAlias,
    child:InkWell(onTap:onTap,
      child:Row(children:[
        SizedBox(width:76,height:86,
          child:imageUrl.startsWith('https://')
            ?Image.network(imageUrl,fit:BoxFit.cover,
              errorBuilder:(_,error,stack)=>const _CoursePlaceholder())
            :const _CoursePlaceholder()),
        Expanded(child:Padding(
          padding:const EdgeInsets.symmetric(horizontal:12,vertical:9),
          child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
            if(language.isNotEmpty)
              Text(language.toUpperCase(),maxLines:1,
                style:const TextStyle(fontSize:9,
                  fontWeight:FontWeight.w800,letterSpacing:1,color:VopColors.gold)),
            if(language.isNotEmpty)const SizedBox(height:3),
            Text(title,maxLines:2,overflow:TextOverflow.ellipsis,
              style:const TextStyle(fontSize:13.5,fontWeight:FontWeight.w800,
                height:1.2)),
            if(description.isNotEmpty)...[
              const SizedBox(height:3),
              Text(description,maxLines:2,overflow:TextOverflow.ellipsis,
                style:TextStyle(fontSize:11,height:1.35,
                  color:Theme.of(context).colorScheme.onSurfaceVariant)),
            ],
          ]),
        )),
        const Padding(padding:EdgeInsets.only(right:9),
          child:Icon(Icons.chevron_right_rounded,size:19)),
      ]),
    ),
  );
}
class _CoursePlaceholder extends StatelessWidget {
  const _CoursePlaceholder();
  @override Widget build(BuildContext context)=>Container(
    decoration:const BoxDecoration(gradient:LinearGradient(
      colors:[VopColors.navyDeep,VopColors.navyBright],
      begin:Alignment.topLeft,end:Alignment.bottomRight)),
    child:const Center(child:Icon(Icons.menu_book_rounded,
      color:VopColors.goldLight,size:27)));
}
