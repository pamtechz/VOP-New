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
  if(path.startsWith('/iron-duels')||source==='scripture-duel')return 'iron-duels';
  if(path.startsWith('/mentor'))return 'mentor';
  if(path.startsWith('/support')||type==='learning-support'||type==='mentor-feedback')return 'support';
  if(path.startsWith('/admin')||type==='user')return 'admin';
  return 'home';
}
