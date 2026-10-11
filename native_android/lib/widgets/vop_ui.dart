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

class VopHeroCard extends StatelessWidget {
  const VopHeroCard({required this.title,required this.description,
    required this.icon,this.kicker='YOUR JOURNEY',this.cta='Explore',
    this.onTap,super.key});
  final String title,description,kicker,cta;
  final IconData icon;
  final VoidCallback? onTap;
  @override Widget build(BuildContext context)=>Container(
    constraints:const BoxConstraints(minHeight:210),
    decoration:BoxDecoration(
      borderRadius:BorderRadius.circular(24),
      gradient:const LinearGradient(
        colors:[Color(0xFF002D72),Color(0xFF0D47A1),Color(0xFF174B84)],
        begin:Alignment.topLeft,end:Alignment.bottomRight),
      boxShadow:[BoxShadow(color:VopColors.navy.withValues(alpha:.16),
        blurRadius:24,offset:const Offset(0,10))]),
    clipBehavior:Clip.antiAlias,
    child:Stack(children:[
      Positioned(right:-49,top:-70,child:_Halo(size:210,color:Colors.white.withValues(alpha:.06))),
      Positioned(right:34,bottom:-90,child:_Halo(size:180,color:VopColors.gold.withValues(alpha:.11))),
      Positioned(right:0,bottom:4,child:Opacity(opacity:.17,
        child:Icon(icon,size:132,color:Colors.white))),
      Padding(padding:const EdgeInsets.all(23),
        child:ConstrainedBox(constraints:const BoxConstraints(maxWidth:385),
        child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
          Row(mainAxisSize:MainAxisSize.min,children:[
            const Icon(Icons.auto_awesome_rounded,color:VopColors.goldLight,size:15),
            const SizedBox(width:6),
            Text(kicker,style:const TextStyle(
              fontSize:10,fontWeight:FontWeight.w800,
              letterSpacing:1.45,color:VopColors.goldLight)),
          ]),
          const SizedBox(height:15),
          Text(title,style:const TextStyle(
            color:Colors.white,fontSize:25,fontWeight:FontWeight.w900,
            height:1.15,letterSpacing:-.65)),
          const SizedBox(height:11),
          Text(description,style:TextStyle(
            color:Colors.white.withValues(alpha:.85),
            height:1.5,fontSize:12.5)),
          const SizedBox(height:19),
          if(onTap!=null)FilledButton.icon(
            onPressed:onTap,style:FilledButton.styleFrom(
              backgroundColor:VopColors.goldLight,foregroundColor:VopColors.navyDeep),
            label:Text(cta),icon:const Icon(Icons.arrow_forward_rounded,size:17)),
        ]))),
    ]),
  );
}
class _Halo extends StatelessWidget {
  const _Halo({required this.size,required this.color});
  final double size;
  final Color color;
  @override Widget build(BuildContext context)=>Container(
    width:size,height:size,
    decoration:BoxDecoration(shape:BoxShape.circle,
      border:Border.all(color:color,width:23)));
}

class VopFeatureTile extends StatelessWidget {
  const VopFeatureTile({required this.title,required this.subtitle,
    required this.icon,required this.tint,required this.onTap,super.key});
  final String title,subtitle;
  final IconData icon;
  final Color tint;
  final VoidCallback onTap;
  @override Widget build(BuildContext context)=>Card(
    clipBehavior:Clip.antiAlias,
    child:InkWell(onTap:onTap,child:Padding(
      padding:const EdgeInsets.all(15),
      child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
        Container(width:43,height:43,
          decoration:BoxDecoration(color:tint.withValues(alpha:.12),
            borderRadius:BorderRadius.circular(12)),
          child:Icon(icon,color:tint,size:23)),
        const Spacer(),
        Text(title,maxLines:1,overflow:TextOverflow.ellipsis,
          style:const TextStyle(fontWeight:FontWeight.w800,fontSize:13)),
        const SizedBox(height:4),
        Text(subtitle,maxLines:2,overflow:TextOverflow.ellipsis,
          style:TextStyle(fontSize:10.5,height:1.35,
            color:Theme.of(context).colorScheme.onSurfaceVariant)),
      ])),
    ),
  );
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
    margin:const EdgeInsets.only(bottom:11),
    clipBehavior:Clip.antiAlias,
    child:InkWell(onTap:onTap,child:Row(children:[
      SizedBox(width:96,height:112,child:imageUrl.startsWith('https://')
        ?Image.network(imageUrl,fit:BoxFit.cover,
          errorBuilder:(_,error,stack)=>const _CoursePlaceholder())
        :const _CoursePlaceholder()),
      Expanded(child:Padding(padding:const EdgeInsets.symmetric(
        horizontal:14,vertical:11),
        child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
          Text(language.toUpperCase(),
            style:const TextStyle(fontSize:9,fontWeight:FontWeight.w800,
              letterSpacing:1.1,color:VopColors.gold)),
          const SizedBox(height:5),
          Text(title,maxLines:2,overflow:TextOverflow.ellipsis,
            style:const TextStyle(fontSize:14,fontWeight:FontWeight.w800,height:1.28)),
          const SizedBox(height:5),
          Text(description,maxLines:2,overflow:TextOverflow.ellipsis,
            style:TextStyle(fontSize:11.5,height:1.4,
              color:Theme.of(context).colorScheme.onSurfaceVariant)),
        ]))),
      const Padding(padding:EdgeInsets.only(right:10),
        child:Icon(Icons.chevron_right_rounded,size:21)),
    ])),
  );
}
class _CoursePlaceholder extends StatelessWidget {
  const _CoursePlaceholder();
  @override Widget build(BuildContext context)=>Container(
    decoration:const BoxDecoration(gradient:LinearGradient(
      colors:[VopColors.navyDeep,VopColors.navyBright],
      begin:Alignment.topLeft,end:Alignment.bottomRight)),
    child:const Center(child:Icon(Icons.menu_book_rounded,
      color:VopColors.goldLight,size:36)));
}
