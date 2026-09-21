import { auth } from '../lib/firebase';
import type { AccountProgress } from '../types';

async function request(action:string,lessonId:string,score?:number):Promise<AccountProgress>{
 if(!auth?.currentUser)throw new Error('Your Firebase session has expired. Sign in again.');
 const token=await auth.currentUser.getIdToken();const response=await fetch('/api/study/progress',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({action,lessonId,score})});
 const body=await response.json().catch(()=>({})) as {error?:string;progress?:AccountProgress};if(!response.ok)throw new Error(body.error||`Study progress failed (${response.status}).`);if(!body.progress)throw new Error('Firebase did not return updated study progress.');return body.progress;
}
export const completeLesson= (lessonId:string)=>request('complete-lesson',lessonId);
export const submitTestScore=(lessonId:string,score:number)=>request('submit-test',lessonId,score);
