export const SUBSCRIPTION_QUOTAS = [
  { key:'maxSeats', usageKey:'seats', label:'Active seats', description:'All active organization members, including owners, administrators, staff, mentors and learners.' },
  { key:'maxCandidates', usageKey:'candidates', label:'Candidates / learners', description:'Active learner, student and candidate memberships.' },
  { key:'maxMentors', usageKey:'mentors', label:'Mentors', description:'Active mentor memberships.' },
  { key:'maxGuides', usageKey:'guides', label:'Guides', description:'Organization-owned curriculum guides.' },
  { key:'maxQuizzes', usageKey:'quizzes', label:'Quizzes', description:'Organization-owned assessment records.' },
  { key:'maxAnnouncements', usageKey:'announcements', label:'Announcements', description:'Organization-owned announcements.' },
  { key:'maxRadioItems', usageKey:'radio', label:'Radio items', description:'Organization-owned radio broadcasts.' },
  { key:'maxRadioPlaylists', usageKey:'radioPlaylists', label:'Radio playlists', description:'Organization-owned radio playlists.' },
  { key:'maxMaterials', usageKey:'materials', label:'Materials', description:'Organization-owned learning materials.' },
] as const;

export const SUBSCRIPTION_FEATURES = [
  { key:'curriculum', label:'Curriculum Studio' },
  { key:'candidates', label:'Candidate management' },
  { key:'certification', label:'Certification' },
  { key:'mentorship', label:'Mentorship' },
  { key:'radio', label:'Radio' },
  { key:'materials', label:'Materials' },
  { key:'announcements', label:'Announcements' },
  { key:'payments', label:'Payments' },
] as const;

export type SubscriptionQuotaKey = typeof SUBSCRIPTION_QUOTAS[number]['key'];
export type SubscriptionUsageKey = typeof SUBSCRIPTION_QUOTAS[number]['usageKey'];
export type SubscriptionFeatureKey = typeof SUBSCRIPTION_FEATURES[number]['key'];

function record(value:unknown):Record<string,unknown>{
  return value && typeof value==='object' && !Array.isArray(value)
    ? value as Record<string,unknown>
    : {};
}

export function normalizeSubscriptionQuotas(value:unknown):Record<string,number>{
  const input=record(value);
  const normalized:Record<string,number>={};
  for(const definition of SUBSCRIPTION_QUOTAS){
    const raw=definition.key==='maxSeats'
      ? input.maxSeats ?? input.maxUsers
      : input[definition.key];
    if(raw===undefined||raw===null||raw==='')continue;
    const amount=Number(raw);
    if(!Number.isInteger(amount)||amount < -1){
      throw new Error('Subscription limits must be whole numbers of -1 or greater.');
    }
    normalized[definition.key]=amount;
  }
  return normalized;
}

export function normalizeSubscriptionFeatures(value:unknown):Record<string,boolean>{
  const input=record(value);
  return Object.fromEntries(SUBSCRIPTION_FEATURES.map(definition=>[
    definition.key,
    input[definition.key]===true,
  ]));
}

export function subscriptionQuotaLimit(quotas:unknown,key:SubscriptionQuotaKey):number|null{
  const input=record(quotas);
  const raw=key==='maxSeats' ? input.maxSeats ?? input.maxUsers : input[key];
  const value=Number(raw);
  return Number.isFinite(value)&&value>=0?value:null;
}

export function subscriptionStatusLabel(status:unknown){
  const value=String(status||'').trim().toLowerCase();
  if(value==='active')return 'Active';
  if(value==='trialing')return 'Trial';
  if(value==='past_due')return 'Past due';
  if(value==='cancelled')return 'Cancelled';
  if(value==='expired')return 'Expired';
  if(value==='refunded')return 'Refunded';
  if(value==='suspended')return 'Suspended';
  return value ? value.replaceAll('_',' ').replace(/\b\w/g,character=>character.toUpperCase()) : 'Not subscribed';
}

export function subscriptionIntervalLabel(interval:unknown){
  const value=String(interval||'').trim().toLowerCase();
  if(value==='year')return 'Annual';
  if(value==='one_time')return 'One-time';
  return 'Monthly';
}
