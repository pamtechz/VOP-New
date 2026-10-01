export type VopTheme='dark'|'light';
const KEY='vop_theme';

export function readThemePreference():VopTheme{
  if(typeof window==='undefined')return 'light';
  try{
    return window.localStorage.getItem(KEY)==='dark'?'dark':'light';
  }catch{return 'light';}
}
export function applyThemePreference(theme:VopTheme){
  if(typeof document==='undefined')return;
  document.documentElement.setAttribute('data-theme',theme);
  document.documentElement.style.colorScheme=theme;
  const meta=document.querySelector('meta[name="theme-color"]');
  if(meta)meta.setAttribute('content',theme==='dark'?'#0c1118':'#0c2d63');
}
export function persistThemePreference(theme:VopTheme){
  applyThemePreference(theme);
  if(typeof window==='undefined')return;
  try{window.localStorage.setItem(KEY,theme);}catch{/* storage unavailable */}
  window.dispatchEvent(new CustomEvent('vop_theme_changed',{detail:{theme}}));
}
