import { auth } from '../lib/firebase';

export type EditableOwnProfile = {
  displayName: string;
  phoneNumber: string;
  whatsappNumber: string;
  address: string;
  bio: string;
  photoURL: string;
};
export type OwnProfile = Partial<EditableOwnProfile> & {
  uid?: string;
  email?: string;
  role?: string;
  organizationId?: string;
  organizationRole?: string;
  accountType?: string;
};

async function profileAction(action: 'profile' | 'updateOwnProfile', changes?: Partial<EditableOwnProfile>): Promise<OwnProfile> {
  const user=auth?.currentUser;
  if(!user)throw new Error('Please sign in to manage your profile.');
  const token=await user.getIdToken();
  const response=await fetch('/api/admin/users',{
    method:'POST',
    headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
    body:JSON.stringify({action,...(changes?{profile:changes}:{})}),
  });
  const result=await response.json().catch(()=>({})) as {error?:string;profile?:OwnProfile};
  if(!response.ok||!result.profile)throw new Error(result.error||'Your profile could not be loaded or saved.');
  if(action==='updateOwnProfile' && typeof window!=='undefined'){
    window.dispatchEvent(new Event('vop_profile_updated'));
  }
  return result.profile;
}
export const loadOwnProfile=()=>profileAction('profile');
export const saveOwnProfile=(changes:Partial<EditableOwnProfile>)=>profileAction('updateOwnProfile',changes);
export function editableOwnProfile(profile:OwnProfile):EditableOwnProfile{
  return {
    displayName:String(profile.displayName||''),
    phoneNumber:String(profile.phoneNumber||''),
    whatsappNumber:String(profile.whatsappNumber||''),
    address:String(profile.address||''),
    bio:String(profile.bio||''),
    photoURL:String(profile.photoURL||''),
  };
}
