import {App as CapacitorApp} from '@capacitor/app';
import {Capacitor} from '@capacitor/core';

const APP_LINK_HOSTS=new Set(['vopapp.org','www.vopapp.org']);

export function normalizeNativeDeepLink(raw:string):string|null{
  try{
    const url=new URL(raw);
    if(url.protocol==='vop:'){
      if(url.hostname!=='invite')return null;
      const token=url.searchParams.get('token')||'';
      if(!/^[A-Za-z0-9]{32,128}$/.test(token))return null;
      return '/?invite='+encodeURIComponent(token);
    }
    if(url.protocol!=='https:'||!APP_LINK_HOSTS.has(url.hostname.toLowerCase()))return null;
    if(url.username||url.password)return null;
    return (url.pathname||'/')+url.search+url.hash;
  }catch{return null}
}

function openDeepLink(raw:string){
  const target=normalizeNativeDeepLink(raw);
  if(!target)return;
  const current=window.location.pathname+window.location.search+window.location.hash;
  if(target===current)return;
  window.location.assign(target);
}

export async function installNativeDeepLinkBridge(){
  if(!Capacitor.isNativePlatform())return;
  await CapacitorApp.addListener('appUrlOpen',event=>openDeepLink(event.url));
  const launch=await CapacitorApp.getLaunchUrl().catch(()=>undefined);
  if(launch?.url)openDeepLink(launch.url);
}
