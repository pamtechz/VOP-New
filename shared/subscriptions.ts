export const SUBSCRIPTION_QUOTAS = [
  { key:'maxSeats', usageKey:'seats', label:'Member / staff seats', description:'Active institutional members such as owners, organization administrators, editors, teachers, mentors and staff. Learners/candidates do not consume member seats.' },
  { key:'maxCandidates', usageKey:'candidates', label:'Candidates / learners', description:'Active learner, student and candidate records. These are tracked separately and never consume member/staff seats.' },
  { key:'maxMentors', usageKey:'mentors', label:'Mentors', description:'Active mentor memberships.' },
  { key:'maxGuides', usageKey:'guides', label:'Guides', description:'Active, non-archived organization-owned curriculum guides.' },
  { key:'maxPrograms', usageKey:'programs', label:'Programs / courses', description:'Active, non-archived organization-owned program and course containers.' },
  { key:'maxLearningPaths', usageKey:'learningPaths', label:'Learning paths', description:'Active, non-archived organization-owned learning paths.' },
  { key:'maxBibleTopics', usageKey:'bibleTopics', label:'Bible topics', description:'Active, non-archived organization-owned Bible topic collections.' },
  { key:'maxSeasons', usageKey:'seasons', label:'Seasons / quarters', description:'Active, non-archived organization-owned season and quarter definitions.' },
  { key:'maxQuizzes', usageKey:'quizzes', label:'Quizzes', description:'Active, non-archived organization-owned assessment records.' },
  { key:'maxAnnouncements', usageKey:'announcements', label:'Announcements', description:'Active, non-archived organization-owned announcements.' },
  { key:'maxEvents', usageKey:'events', label:'Events & programmes', description:'Active, non-archived organization-owned event and programme records.' },
  { key:'maxRadioItems', usageKey:'radio', label:'Radio items', description:'Active, non-archived organization-owned radio broadcasts.' },
  { key:'maxRadioPlaylists', usageKey:'radioPlaylists', label:'Radio playlists', description:'Active, non-archived organization-owned radio playlists.' },
  { key:'maxMaterials', usageKey:'materials', label:'Materials', description:'Active, non-archived organization-owned learning materials.' },
] as const;

export const SUBSCRIPTION_FEATURES = [
  { key:'curriculum', label:'Curriculum Studio' },
  { key:'candidates', label:'Candidate Management' },
  { key:'certification', label:'Certification & Diplomas' },
  { key:'mentorship', label:'Mentorship' },
  { key:'radio', label:'Radio Broadcasting' },
  { key:'materials', label:'Learning Materials' },
  { key:'announcements', label:'Announcements' },
  { key:'payments', label:'Payment Gateway' },
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
