import type { AppSettings, AboutContext, DetailPagesSettings } from '../types';

const text=(value:unknown)=>String(value||'').trim();
const list=(value:unknown)=>Array.isArray(value)
  ?value.map(item=>String(item||'').trim()).filter(Boolean)
  :[];
const details=(settings?:AppSettings|null):DetailPagesSettings=>({
  aboutUsMission:text(settings?.detailPages?.aboutUsMission),
  aboutUsHistory:text(settings?.detailPages?.aboutUsHistory),
  aboutUsLeadership:text(settings?.detailPages?.aboutUsLeadership),
  aboutAppDescription:text(settings?.detailPages?.aboutAppDescription),
  aboutAppVersion:text(settings?.detailPages?.aboutAppVersion),
  aboutAppCredits:text(settings?.detailPages?.aboutAppCredits),
  contactOfficeAddress:text(settings?.detailPages?.contactOfficeAddress),
  contactOfficeHours:text(settings?.detailPages?.contactOfficeHours),
  contactPhoneNumbers:list(settings?.detailPages?.contactPhoneNumbers),
  contactEmails:list(settings?.detailPages?.contactEmails),
  contactWhatsAppNumbers:list(settings?.detailPages?.contactWhatsAppNumbers),
  socialLinks:{
    facebook:text(settings?.detailPages?.socialLinks?.facebook)||undefined,
    youtube:text(settings?.detailPages?.socialLinks?.youtube)||undefined,
    website:text(settings?.detailPages?.socialLinks?.website)||undefined,
  },
});

export function hasScopedAboutProfile(settings?:AppSettings|null):boolean{
  if(!settings)return false;
  const d=details(settings);
  return Boolean(
    text(settings.organizationName)||
    text(settings.contactPhone)||
    text(settings.whatsappNumber)||
    text(settings.contactEmail)||
    text(settings.website)||
    d.aboutUsMission||d.aboutUsHistory||d.aboutUsLeadership||
    d.contactOfficeAddress||d.contactOfficeHours||
    d.contactPhoneNumbers.length||d.contactEmails.length||
    d.contactWhatsAppNumbers.length||
    d.socialLinks?.facebook||d.socialLinks?.youtube||d.socialLinks?.website
  );
}

type ScopeOptions={
  scope:'organization'|'hierarchy';
  organizationId?:string;
  organizationName?:string;
};

export function resolveAboutProfile(
  platform:AppSettings,
  scoped:AppSettings|null,
  options:ScopeOptions,
):Pick<AppSettings,
  'organizationName'|'contactPhone'|'whatsappNumber'|'contactEmail'|'website'|'detailPages'|'aboutContext'>{
  const platformDetails=details(platform);
  const scopedDetails=details(scoped);
  const useScoped=hasScopedAboutProfile(scoped);
  const pickText=(local:unknown,global:unknown)=>useScoped
    ?text(local)||text(global)
    :text(global);
  const pickList=(local:unknown,global:unknown)=>{
    const localItems=list(local);
    return useScoped&&localItems.length?localItems:list(global);
  };
  const platformLinks=platformDetails.socialLinks||{};
  const scopedLinks=scopedDetails.socialLinks||{};
  const context:AboutContext=useScoped?{
    scope:options.scope,
    organizationId:text(options.organizationId)||undefined,
    organizationName:pickText(scoped?.organizationName,options.organizationName)||undefined,
    inheritedFromPlatform:false,
  }:{
    scope:'platform',
    organizationId:text(options.organizationId)||undefined,
    organizationName:text(platform.organizationName)||undefined,
    inheritedFromPlatform:Boolean(scoped),
  };
  return {
    organizationName:useScoped
      ?pickText(scoped?.organizationName,options.organizationName)||text(platform.organizationName)
      :text(platform.organizationName),
    contactPhone:pickText(scoped?.contactPhone,platform.contactPhone),
    whatsappNumber:pickText(scoped?.whatsappNumber,platform.whatsappNumber),
    contactEmail:pickText(scoped?.contactEmail,platform.contactEmail),
    website:pickText(scoped?.website,platform.website),
    detailPages:{
      aboutUsMission:pickText(scopedDetails.aboutUsMission,platformDetails.aboutUsMission),
      aboutUsHistory:pickText(scopedDetails.aboutUsHistory,platformDetails.aboutUsHistory),
      aboutUsLeadership:pickText(scopedDetails.aboutUsLeadership,platformDetails.aboutUsLeadership),
      // Application identity remains platform-owned even for organization learners.
      aboutAppDescription:platformDetails.aboutAppDescription,
      aboutAppVersion:platformDetails.aboutAppVersion,
      aboutAppCredits:platformDetails.aboutAppCredits,
      contactOfficeAddress:pickText(scopedDetails.contactOfficeAddress,platformDetails.contactOfficeAddress),
      contactOfficeHours:pickText(scopedDetails.contactOfficeHours,platformDetails.contactOfficeHours),
      contactPhoneNumbers:pickList(scopedDetails.contactPhoneNumbers,platformDetails.contactPhoneNumbers),
      contactEmails:pickList(scopedDetails.contactEmails,platformDetails.contactEmails),
      contactWhatsAppNumbers:pickList(scopedDetails.contactWhatsAppNumbers,platformDetails.contactWhatsAppNumbers),
      socialLinks:{
        facebook:pickText(scopedLinks.facebook,platformLinks.facebook)||undefined,
        youtube:pickText(scopedLinks.youtube,platformLinks.youtube)||undefined,
        website:pickText(scopedLinks.website,platformLinks.website)||undefined,
      },
    },
    aboutContext:context,
  };
}
