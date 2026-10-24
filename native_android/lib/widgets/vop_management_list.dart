import 'package:flutter/material.dart';

/// Lazy, keyboard-accessible management rows with a real column layout
/// on desktop, and the familiar tap targets on Android.
class VopAdaptiveManagementList extends StatelessWidget {
  const VopAdaptiveManagementList({
    required this.items,
    required this.title,
    required this.description,
    required this.status,
    required this.onOpen,
    required this.actions,
    this.icon,
    super.key,
  });
  final List<Map<String,dynamic>> items;
  final String Function(Map<String,dynamic>) title;
  final String Function(Map<String,dynamic>) description;
  final String Function(Map<String,dynamic>) status;
  final VoidCallback? Function(Map<String,dynamic>) onOpen;
  final Widget Function(Map<String,dynamic>) actions;
  final IconData Function(Map<String,dynamic>)? icon;

  @override
  Widget build(BuildContext context) => LayoutBuilder(builder:(context,layout) {
    final desktop=layout.maxWidth>=820;
    if(!desktop) {
      return ListView.separated(
        padding:const EdgeInsets.fromLTRB(12,0,12,90),
        itemCount:items.length,
        separatorBuilder:(_,__)=>const Divider(height:1),
        itemBuilder:(context,index){
          final row=items[index];
          return ListTile(
            leading:Icon(icon?.call(row)??Icons.folder_outlined),
            title:Text(title(row),maxLines:1,overflow:TextOverflow.ellipsis),
            subtitle:Text(description(row),maxLines:2,overflow:TextOverflow.ellipsis),
            trailing:actions(row),
            onTap:onOpen(row),
          );
        },
      );
    }
    final theme=Theme.of(context);
    Widget cell(String value,{bool primary=false})=>Text(value,
      maxLines:1,overflow:TextOverflow.ellipsis,
      style:primary?theme.textTheme.bodyMedium?.copyWith(fontWeight:FontWeight.w800)
        :theme.textTheme.bodySmall);
    return Column(children:[
      Container(padding:const EdgeInsets.fromLTRB(20,16,14,14),
        color:theme.colorScheme.surfaceContainerLow,
        child:Row(children:[
          Expanded(flex:3,child:cell('NAME',primary:true)),
          Expanded(flex:4,child:cell('DETAILS',primary:true)),
          Expanded(flex:2,child:cell('STATUS',primary:true)),
          const SizedBox(width:112,child:Text('ACTIONS',
            style:TextStyle(fontWeight:FontWeight.w800,fontSize:11))),
        ])),
      const Divider(height:1),
      Expanded(child:ListView.builder(
        padding:const EdgeInsets.fromLTRB(12,5,12,85),
        itemCount:items.length,
        itemBuilder:(context,index){
          final record=items[index];
          return Padding(padding:const EdgeInsets.only(bottom:5),
            child:Material(color:theme.colorScheme.surface,
              borderRadius:BorderRadius.circular(10),
              child:InkWell(
                borderRadius:BorderRadius.circular(10),
                onTap:onOpen(record),
                child:Padding(padding:const EdgeInsets.symmetric(
                  vertical:9,horizontal:8),
                  child:Row(children:[
                    Expanded(flex:3,child:Row(children:[
                      Icon(icon?.call(record)??Icons.folder_outlined,size:18,
                        color:theme.colorScheme.primary),
                      const SizedBox(width:9),
                      Expanded(child:cell(title(record),primary:true)),
                    ])),
                    Expanded(flex:4,child:cell(description(record))),
                    Expanded(flex:2,child:cell(status(record))),
                    SizedBox(width:112,child:Align(
                      alignment:Alignment.centerRight,child:actions(record))),
                  ]),
                ),
              ),
            ),
          );
        })),
    ]);
  });
}
