export type ThemePreference='light'|'dark'|'system';

const KEY='vop.theme.preference';

export function normalizeThemePreference(value:unknown):ThemePreference{
  return value==='light'||value==='system'?'light'===value?'light':'system':'dark';
}

export function readThemePreference():ThemePreference{
  if(typeof window==='undefined')return 'dark';
  try{return normalizeThemePreference(window.localStorage.getItem(KEY)||'dark');}
  catch{return 'dark';}
}

export function resolvedTheme(preference:ThemePreference):'light'|'dark'{
  if(preference==='system'&&typeof window!=='undefined'&&window.matchMedia){
    return window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';
  }
  return preference==='light'?'light':'dark';
}

export function applyThemePreference(preference:ThemePreference){
  if(typeof document==='undefined')return;
  const resolved=resolvedTheme(preference);
  document.documentElement.dataset.theme=resolved;
  document.documentElement.style.colorScheme=resolved;
  document.body?.setAttribute('data-theme',resolved);
  const meta=document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if(meta)meta.content=resolved==='dark'?'#071224':'#0c2d63';
}

export function persistThemePreference(value:ThemePreference){
  const preference=normalizeThemePreference(value);
  if(typeof window!=='undefined'){
    try{window.localStorage.setItem(KEY,preference);}catch{/* storage can be unavailable */}
  }
  applyThemePreference(preference);
  return preference;
}

export function subscribeSystemTheme(preference:ThemePreference,onChange:()=>void){
  if(preference!=='system'||typeof window==='undefined'||!window.matchMedia)return()=>undefined;
  const query=window.matchMedia('(prefers-color-scheme: light)');
  const listener=()=>onChange();
  query.addEventListener?.('change',listener);
  return()=>query.removeEventListener?.('change',listener);
}
