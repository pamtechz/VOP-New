import React from 'react';
import type { AppRoute } from '../types';
import InboxPage from './InboxPage';

interface Props{
  onBack:()=>void;
  onNavigate:(route:AppRoute)=>void;
}

export default function NotificationsPage({onBack,onNavigate}:Props){
  return <InboxPage
    fixedMode="notifications"
    initialTab="notifications"
    onBack={onBack}
    onNavigate={onNavigate}
  />;
}
