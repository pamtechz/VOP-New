export type PersonalRuntimeSettings={
  accessibility?:{
    reducedMotion?:boolean;
    largeText?:boolean;
    highContrast?:boolean;
  };
};

export function applyPersonalRuntimeSettings(settings?:PersonalRuntimeSettings|null){
  if(typeof document==='undefined')return;
  const root=document.documentElement;
  const accessibility=settings?.accessibility||{};
  root.toggleAttribute('data-vop-reduced-motion',accessibility.reducedMotion===true);
  root.toggleAttribute('data-vop-large-text',accessibility.largeText===true);
  root.toggleAttribute('data-vop-high-contrast',accessibility.highContrast===true);
}

export function resetPersonalRuntimeSettings(){
  applyPersonalRuntimeSettings(null);
}
