import 'package:flutter/material.dart';

/// Shared section card for Classic web and Android. All content and progress
/// come from the authenticated study API; no course data is embedded here.
class VopSectionStudyCard extends StatelessWidget {
  const VopSectionStudyCard({
    required this.title,
    required this.description,
    required this.number,
    required this.pageCount,
    required this.readMinutes,
    required this.completed,
    required this.locked,
    this.onOpen,
    this.onTakeTest,
    this.onFlashcards,
    this.onEditQuestions,
    this.onReset,
    super.key,
  });
  final String title;
  final String description;
  final String number;
  final int pageCount;
  final int readMinutes;
  final bool completed;
  final bool locked;
  final VoidCallback? onOpen;
  final VoidCallback? onTakeTest;
  final VoidCallback? onFlashcards;
  final VoidCallback? onEditQuestions;
  final VoidCallback? onReset;

  @override
  Widget build(BuildContext context) {
    final theme=Theme.of(context);
    final scheme=theme.colorScheme;
    final foreground=theme.brightness==Brightness.dark
      ?const Color(0xFFE9ECF4):scheme.onSurface;
    final descriptionColor=theme.brightness==Brightness.dark
      ?const Color(0xFFAFB1BF):scheme.onSurfaceVariant;
    final stripe=locked?const Color(0xFF667085):
      completed?const Color(0xFF4AAC59):const Color(0xFF1646AA);
    final green=theme.brightness==Brightness.dark
      ?const Color(0xFF52C464):const Color(0xFF22833C);
    Widget metric(IconData icon,String text,Color color)=>Row(
      mainAxisSize:MainAxisSize.min,children:[
        Icon(icon,size:16,color:color),
        const SizedBox(width:6),
        Text(text,style:TextStyle(fontSize:12.5,fontWeight:FontWeight.w700,
          color:color)),
      ]);
    Widget action(IconData icon,String label,Color color,VoidCallback onTap)=>
      TextButton.icon(
        onPressed:onTap,
        style:TextButton.styleFrom(
          foregroundColor:color,visualDensity:VisualDensity.compact,
          padding:const EdgeInsets.symmetric(horizontal:2,vertical:4),
          minimumSize:const Size(0,34)),
        icon:Icon(icon,size:16),
        label:Text(label,style:const TextStyle(fontSize:12.5,
          fontWeight:FontWeight.w800)),
      );
    final cardContent=Padding(
      padding:const EdgeInsets.fromLTRB(18,17,14,12),
      child:Column(
        crossAxisAlignment:CrossAxisAlignment.start,
        mainAxisSize:MainAxisSize.min,children:[
          InkWell(
            onTap:locked?null:onOpen,
            borderRadius:BorderRadius.circular(9),
            child:Row(children:[
              Expanded(child:Column(
                crossAxisAlignment:CrossAxisAlignment.start,children:[
                  Text('Section $number: $title',maxLines:3,
                    overflow:TextOverflow.ellipsis,
                    style:TextStyle(color:foreground,fontWeight:FontWeight.w800,
                      fontSize:17,height:1.3)),
                  if(description.isNotEmpty) ...[
                    const SizedBox(height:5),
                    Text(description,maxLines:2,overflow:TextOverflow.ellipsis,
                      style:TextStyle(color:descriptionColor,fontSize:13,height:1.35)),
                  ],
                ])),
              const SizedBox(width:6),
              Icon(locked?Icons.lock_outline:Icons.chevron_right,
                color:descriptionColor,size:23),
            ]),
          ),
          const SizedBox(height:11),
          Wrap(spacing:16,runSpacing:5,children:[
            metric(Icons.article_outlined,'$pageCount ${pageCount==1?'page':'pages'}',green),
            metric(Icons.schedule_outlined,'~$readMinutes min read',green),
            if(locked)metric(Icons.lock_outline,'Locked',descriptionColor),
          ]),
          if(!locked&&(onTakeTest!=null||onFlashcards!=null||
              onEditQuestions!=null||onReset!=null)) ...[
            const SizedBox(height:4),
            Wrap(spacing:15,runSpacing:1,crossAxisAlignment:WrapCrossAlignment.center,
              children:[
                if(onTakeTest!=null)
                  action(Icons.quiz_outlined,'Take Test',
                    const Color(0xFFFF9700),onTakeTest!),
                if(onFlashcards!=null)
                  action(Icons.style_outlined,'Flashcards',
                    const Color(0xFFBD44E1),onFlashcards!),
                if(onEditQuestions!=null)
                  action(Icons.edit_note_outlined,'Edit Chapter Questions',
                    const Color(0xFFBD44E1),onEditQuestions!),
                if(onReset!=null)
                  action(Icons.restart_alt_outlined,'Reset progress',
                    descriptionColor,onReset!),
              ],
            ),
          ],
        ],
      ),
    );
    return Card(
      margin:const EdgeInsets.only(bottom:13),
      clipBehavior:Clip.antiAlias,
      color:theme.brightness==Brightness.dark
        ?const Color(0xFF1D202A):scheme.surface,
      shape:RoundedRectangleBorder(
        borderRadius:BorderRadius.circular(19),
        side:BorderSide(color:scheme.outlineVariant.withValues(alpha:.55))),
      child:IntrinsicHeight(child:Row(
        crossAxisAlignment:CrossAxisAlignment.stretch,children:[
          Container(width:72,color:stripe,
            alignment:Alignment.center,
            child:completed?const Icon(Icons.check,size:32,color:Colors.white)
              :locked?const Icon(Icons.lock_outline,size:25,color:Colors.white)
              :Text(number,style:const TextStyle(color:Colors.white,
                fontSize:24,fontWeight:FontWeight.w900))),
          Expanded(child:cardContent),
        ],
      )),
    );
  }
}
