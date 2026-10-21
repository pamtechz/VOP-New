import type {TenantContext} from './tenant.js';
import {accessibleOrganizationIds} from './tenant.js';
import {loadPermissionMatrix} from './permissions.js';
import {PERMISSION_RESOURCES, PERMISSION_ACTIONS, permissionAllowed, roleForPermission, type PermissionResource} from '../shared/permissions.js';
import {SUBSCRIPTION_QUOTAS, SUBSCRIPTION_FEATURES} from '../shared/subscriptions.js';

// These are API/form contracts, not operational records. All field values,
// content, feature switches, tenant identities and permissions come from VOP.
type Field = {key:string;label:string;type?:string;required?:boolean;source?:string;choices?:string[];fields?:Field[]};
const text=(key:string,label:string,required=false):Field=>({key,label,required});
const flag=(key:string,label:string):Field=>({key,label,type:'boolean'});
const number=(key:string,label:string):Field=>({key,label,type:'number'});
const choice=(key:string,label:string,choices:string[]):Field=>({key,label,type:'choice',choices});
const language:Field={key:'language',label:'Language',type:'choice',source:'languages',required:true};
const publication=[flag('published','Published'),choice('sharingScope','Availability',['private','organization','shared'])];
const description:Field={key:'description',label:'Description',type:'multiline'};
const hierarchy=[text('name','Name',true),text('unionId','Union'),text('conferenceId','Conference'),text('districtId','District'),text('address','Address'),text('contactEmail','Contact email'),text('contactPhone','Contact phone')];
export const MOBILE_RECORD_SCHEMAS:Record<string,{title:string;permission:PermissionResource;fields:Field[];singleton?:boolean;feature?:string}>= {
  engagementRequirements:{title:'Master Guide requirements',permission:'portfolio',fields:[text('title','Title',true),description,number('requiredSignatures','Required evaluator signatures'),flag('evidenceRequired','Evidence required'),choice('status','Status',['draft','published']),choice('sharingScope','Availability',['private','organization','shared'])]},
  engagementMemoryDecks:{title:'Scripture memory decks',permission:'scripture',fields:[text('title','Title',true),description,{key:'verses',label:'Scripture cards',type:'list',fields:[text('reference','Scripture reference',true),{key:'text',label:'Verse text',type:'multiline',required:true}]},choice('status','Status',['draft','published']),choice('sharingScope','Availability',['private','organization','shared'])]},
  engagementDuelQuestions:{title:'Scripture challenge questions',permission:'duels',fields:[text('title','Title',true),description,{key:'question',label:'Question',type:'multiline',required:true},{key:'options',label:'Answer options',type:'strings'},text('answer','Correct answer (must match an option)',true),text('scriptureRef','Scripture reference'),choice('status','Status',['draft','published']),choice('sharingScope','Availability',['private','organization','shared'])]},
  guides:{title:'Guides & modules',permission:'curriculum',feature:'curriculumStudio',fields:[text('title','Title',true),text('subtitle','Subtitle'),description,language,number('discoverNumber','Order'),text('image','Cover image URL'),text('season','Season'),text('quarter','Quarter'),choice('learnerEntryMode','Learner navigation',['lessons','sections']),flag('certificateEligible','Certificate eligible'),flag('requiresFinalExam','Require final exam'),text('certificateTypeName','Certificate type'),{key:'certificationRequirementIds',label:'Certification requirements',type:'strings'},...publication]},
  quizzes:{title:'Quiz Library',permission:'quizzes',fields:[text('title','Title',true),description,language,choice('attachmentType','Attach to',['guide','lesson','chapter','section','block','program','all']),{key:'guideId',label:'Guide',type:'choice',source:'guides'},{key:'programId',label:'Program',type:'choice',source:'programs'},text('lessonId','Lesson'),text('anchorId','Chapter / section / block'),number('assessmentPassThreshold','Pass mark (%)'),number('assessmentTimeLimitMinutes','Time limit (minutes)'),{key:'assessmentInstructions',label:'Instructions',type:'multiline'},{key:'questions',label:'Questions',type:'list',fields:[text('key','Question reference'),{key:'question',label:'Question',type:'multiline',required:true},{key:'options',label:'Answer options',type:'strings'},number('correctOptionIndex','Correct answer index (first = 0)'),{key:'explanation',label:'Explanation',type:'multiline'}]},...publication]},
  programs:{title:'Programs & courses',permission:'curriculum',feature:'curriculumStudio',fields:[text('title','Title',true),description,language,{key:'guideIds',label:'Guides / modules',type:'references',source:'guides'},...publication]},
  learningPaths:{title:'Learning paths',permission:'curriculum',fields:[text('title','Title',true),description,{key:'programIds',label:'Programs',type:'references',source:'programs'},...publication]},
  bibleTopics:{title:'Bible topics',permission:'curriculum',fields:[text('title','Title',true),description,{key:'guideIds',label:'Guides',type:'references',source:'guides'},...publication]},
  seasons:{title:'Seasons & quarters',permission:'curriculum',fields:[text('title','Title',true),description,text('startDate','Start date'),text('endDate','End date'),...publication]},
  announcements:{title:'Announcements',permission:'announcements',feature:'announcements',fields:[text('title','Title',true),{key:'content',label:'Message',type:'multiline',required:true},text('imageUrl','Image URL'),...publication]},
  events:{title:'Events & programmes',permission:'announcements',fields:[text('title','Title',true),description,{key:'startAt',label:'Starts',type:'datetime',required:true},{key:'endAt',label:'Ends',type:'datetime'},text('location','Location'),text('registrationUrl','Registration URL'),number('capacity','Capacity'),...publication]},
  books:{title:'Library & materials',permission:'materials',fields:[text('name','Title',true),text('author','Author'),description,text('category','Category'),language,text('imageUrl','Cover URL'),text('url','Document URL'),...publication]},
  radioBroadcasts:{title:'Radio & broadcasts',permission:'radio',feature:'radio',fields:[text('title','Title',true),text('speaker','Speaker'),text('series','Series'),description,text('mediaUrl','Media URL',true),{key:'audioEmbedCode',label:'Publisher audio embed',type:'multiline'},text('posterUrl','Poster URL'),...publication]},
  playlists:{title:'Media playlists',permission:'radio',fields:[text('name','Name',true),description,{key:'broadcastIds',label:'Broadcasts',type:'references',source:'radioBroadcasts'},...publication]},
  languages:{title:'Languages',permission:'languages',fields:[text('code','Language code',true),text('name','Name',true),text('nativeName','Native name',true),flag('enabled','Enabled'),flag('rtl','Right to left'),text('fallback','Fallback language')]},
  unions:{title:'Unions',permission:'hierarchy',fields:hierarchy},
  conferences:{title:'Conferences',permission:'hierarchy',fields:hierarchy},
  districts:{title:'Districts',permission:'hierarchy',fields:hierarchy},
  churches:{title:'Churches',permission:'hierarchy',fields:hierarchy},
  settings:{title:'Workspace settings',permission:'settings',singleton:true,fields:[text('appName','Application name'),text('organizationName','Organization name'),text('appTagline','Tagline'),text('contactEmail','Contact email'),text('contactPhone','Contact phone'),text('website','Website'),text('timezone','Time zone'),{key:'welcomeMessage',label:'Welcome message',type:'multiline'},{key:'heroSlides',label:'Home slides',type:'list',fields:[text('id','Slide reference'),text('title','Title',true),description,text('imageUrl','Image URL'),text('kicker','Kicker'),flag('enabled','Enabled'),number('order','Order'),text('primaryActionLabel','Action label'),text('primaryActionTarget','Action destination'),text('startDate','Start date'),text('endDate','End date')]},number('heroSliderAutoplaySeconds','Slide interval (seconds)'),number('quizPassThreshold','Assessment pass mark (%)'),number('quizMaxAttempts','Maximum assessment attempts'),number('quizRetakeCooldownMinutes','Retake waiting period (minutes)'),{key:'systemOptions',label:'System options',type:'object',fields:[flag('allowRegistrations','Allow public registration'),flag('requireApproval','Require registration approval'),flag('maintenanceMode','Maintenance mode'),flag('enablePwa','Enable PWA')]},{key:'features',label:'Features',type:'object',fields:[flag('candidatesModule','Candidate management'),flag('curriculumStudio','Curriculum Studio'),flag('translations','Translations'),flag('radio','Radio'),flag('announcements','Announcements'),flag('certification','Certification')]}]},
  certificationConfig:{title:'Certificate configuration',permission:'certificates',feature:'certification',singleton:true,fields:[flag('enabled','Enabled'),text('certificateTitle','Certificate title'),text('issuerName','Issuer'),text('issuerSubtitle','Issuer subtitle'),text('directorName','Signatory name'),text('directorTitle','Signatory title'),text('backgroundUrl','Background image URL'),text('signatureUrl','Signature image URL'),text('logoUrl','Logo URL'),text('sealUrl','Seal URL'),text('courseName','Course name'),text('courseCode','Course code'),{key:'template',label:'Certificate canvas',type:'certificateLayout'},number('minimumScore','Minimum score (%)'),choice('releaseMode','Awarding',['automatic','review']),flag('verificationEnabled','Public verification'),{key:'approvalStages',label:'Approval stages',type:'list',fields:[text('id','Stage reference',true),text('label','Stage name',true),{key:'approverRoles',label:'Approver roles',type:'strings'},flag('enabled','Enabled')]}]},
};

export async function mobileAppInfo(ctx:TenantContext){
  const [platform,tenant]=await Promise.all([ctx.db.doc('system/settings').get(),
    ctx.organizationId?ctx.db.doc('organizations/'+ctx.organizationId+'/settings/settings').get():Promise.resolve(null)]);
  return projectAppInfo({...platform.data(),...tenant?.data()});
}
function projectAppInfo(data:Record<string,unknown>){
  return Object.fromEntries(['appName','appTagline','organizationName','contactEmail','contactPhone','website','welcomeMessage','detailPages','heroSlides','heroSliderEnabled','heroSliderAutoplaySeconds'].filter(key=>data[key]!==undefined).map(key=>[key,data[key]]));
}

export async function mobileWorkspace(ctx:TenantContext){
  const [matrix,settings,languages,ids]=await Promise.all([
    loadPermissionMatrix(ctx),ctx.db.doc('system/settings').get(),
    ctx.db.collection('languages').get(),accessibleOrganizationIds(ctx),
  ]);
  const role=roleForPermission({...ctx.profile,organizationRole:ctx.membership.role});
  const permissions=Object.fromEntries(PERMISSION_RESOURCES.map(resource=>[resource,
    PERMISSION_ACTIONS.filter(action=>permissionAllowed(matrix,role,resource,action))]));
  const data=settings.data()||{};
  const local=ctx.organizationId?await ctx.db.doc('organizations/'+ctx.organizationId+'/settings/settings').get():null;
  const features={...(data.features||{}),...(local?.data()?.features||{})};
  const staff=ctx.isSuperAdmin||ctx.tenantType==='hierarchy'||['owner','admin','editor','teacher','staff'].includes(String(ctx.membership.role||''));
  const schemas=staff?Object.fromEntries(Object.entries(MOBILE_RECORD_SCHEMAS).filter(([key,schema])=>
    permissions[schema.permission]?.includes(key.startsWith('engagement')?'create':'view')&&(!schema.feature||features[schema.feature]!==false)&&
    (ctx.isSuperAdmin||key!=='languages')&&
    (ctx.tenantType!=='organization'||!['unions','conferences','districts','churches'].includes(key))
  ).map(([key,schema])=>[key,{...schema,actions:permissions[schema.permission]}])):{};
  const organizations=ids.length?await ctx.db.getAll(...ids.map(id=>ctx.db.doc('organizations/'+id))):[];
  const countries=Array.isArray(data.billingCountries)?data.billingCountries:
    [...new Set(organizations.map(doc=>String(doc.data()?.billingCountry||'')).filter(Boolean))];
  return {ok:true,isSuperAdmin:ctx.isSuperAdmin,tenantType:ctx.tenantType,organizationId:ctx.organizationId,schemas,permissions,features,options:{
    languages:languages.docs.filter(doc=>doc.data().enabled!==false).map(doc=>({value:doc.id,label:String(doc.data().nativeName||doc.data().name||doc.id)})),
    organizations:organizations.map(doc=>({value:doc.id,label:String(doc.data()?.name||doc.id)})),
    countries,subscriptionQuotas:SUBSCRIPTION_QUOTAS,subscriptionFeatures:SUBSCRIPTION_FEATURES,
    organizationTypes:['union','conference','district','church','secondary_school','adventist_university','acm','pcm','other'].map(value=>({value,label:value.replaceAll('_',' ')})),
  },appInfo:projectAppInfo({...data,...local?.data()})};
}
