import React from 'react';
import type { AppRoute, DiscoverGuide, User } from '../types';
import InboxPage from './InboxPage';

interface Props{
  onBack:()=>void;
  onNavigate:(route:AppRoute)=>void;
  inviteToken?:string;
  currentUser?:User;
  guides?:DiscoverGuide[];
  onInvitationAccepted?:(targetPath:string)=>void;
  onAccountChanged?:()=>Promise<void>;
}

export default function InvitationsPage({
  onBack,onNavigate,inviteToken,currentUser,guides=[],
  onInvitationAccepted,onAccountChanged,
}:Props){
  return <InboxPage
    fixedMode="invites"
    initialTab="invites"
    inviteToken={inviteToken}
    currentUser={currentUser}
    guides={guides}
    onBack={onBack}
    onNavigate={onNavigate}
    onInvitationAccepted={onInvitationAccepted}
    onAccountChanged={onAccountChanged}
  />;
}
