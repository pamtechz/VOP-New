import type { AppRoute } from '../types';

export type RoutableNotification={
  actionUrl?:string;
  type?:string;
  metadata?:Record<string,unknown>;
};

export function notificationRoute(item:RoutableNotification):AppRoute{
  const path=String(item.actionUrl||'').trim().toLowerCase();
  const type=String(item.type||'').trim().toLowerCase();
  const source=String(item.metadata?.source||'').trim().toLowerCase();
  if(path.startsWith('/invites')||type==='invitation')return 'invites';
  if(path.startsWith('/notifications'))return 'notifications';
  if(path.startsWith('/events')||type==='event')return 'events';
  if(path.startsWith('/announcements')||type==='announcement')return 'announcements';
  if(path.startsWith('/resources')||type==='material')return 'resources';
  if(path.startsWith('/radio')||type==='radio')return 'radio';
  if(path.startsWith('/certificates')||type==='certificate')return 'certificates';
  if(path.startsWith('/personal-settings'))return 'personal-settings';
  if(path.startsWith('/iron-duels')||source==='scripture-duel')return 'iron-duels';
  if(path.startsWith('/mentor'))return 'mentor';
  if(path.startsWith('/support')||type==='learning-support'||type==='mentor-feedback')return 'support';
  if(path.startsWith('/admin')||type==='user')return 'admin';
  return 'home';
}


const ADMIN_TARGET_KEY='vop_notification_admin_target';
const adminTargets=new Set([
  'dashboard','userManagement','settings','candidates','curriculum','languages','translations',
  'announcements','events','materials','radio','prayer','engagement','unions','conferences',
  'districts','churches','certification','mentorship','organizations',
]);

export function prepareNotificationNavigation(item:RoutableNotification){
  if(typeof window==='undefined')return;
  const path=String(item.actionUrl||'').trim();
  const match=path.match(/^\/admin\/([A-Za-z-]+)(?:[/?#]|$)/);
  const raw=match?.[1]||'';
  const aliases:Record<string,string>={
    users:'userManagement',candidate:'candidates',candidates:'candidates',
    quizzes:'curriculum',lessons:'curriculum',guides:'curriculum',
    localization:'translations',graduations:'certification',certificates:'certification',
  };
  const target=aliases[raw]||raw;
  try{
    if(target&&adminTargets.has(target))window.sessionStorage.setItem(ADMIN_TARGET_KEY,target);
    else window.sessionStorage.removeItem(ADMIN_TARGET_KEY);
  }catch{/* storage unavailable */}
}

export function consumeNotificationAdminTarget(){
  if(typeof window==='undefined')return '';
  try{
    const value=window.sessionStorage.getItem(ADMIN_TARGET_KEY)||'';
    window.sessionStorage.removeItem(ADMIN_TARGET_KEY);
    return adminTargets.has(value)?value:'';
  }catch{return '';}
}
