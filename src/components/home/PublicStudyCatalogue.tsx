import {useEffect,useMemo,useState} from 'react';
import {ArrowRight,BookOpen,ChevronDown,Clock3,GraduationCap,LockKeyhole,Search} from 'lucide-react';
import './public-study-catalogue.css';

type PublicLesson={id:string;title:string;description:string;lessonNumber:string;type:'lesson'|'assessment';estimatedMinutes:number|null};
type PublicGuide={id:string;title:string;subtitle:string;description:string;language:string;lessons:PublicLesson[]};
type PublicProgram={id:string;title:string;description:string;guideIds:string[]};
type Catalogue={ok:boolean;programs:PublicProgram[];guides:PublicGuide[]};

export function PublicStudyCatalogue({onSignIn}:{onSignIn:()=>void}){
  const [data,setData]=useState<Catalogue|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [search,setSearch]=useState('');
  const [programme,setProgramme]=useState('all');
  const [expanded,setExpanded]=useState<string[]>([]);

  useEffect(()=>{
    const controller=new AbortController();
    void (async()=>{
      try{
        const response=await fetch('/api/public-catalog',{signal:controller.signal,headers:{Accept:'application/json'}});
        if(!response.ok)throw new Error('Published studies could not be loaded.');
        const result=await response.json() as Catalogue;
        if(!result.ok||!Array.isArray(result.guides)||!Array.isArray(result.programs))throw new Error('Invalid catalogue response.');
        if(!controller.signal.aborted)setData(result);
      }catch(reason){
        if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'Published studies are unavailable.');
      }finally{if(!controller.signal.aborted)setLoading(false);}
    })();
    return()=>controller.abort();
  },[]);

  const matches=useMemo(()=>{
    if(!data)return [];
    const query=search.trim().toLocaleLowerCase();
    const selected=data.programs.find(program=>program.id===programme);
    return data.guides.filter(guide=>
      (!selected||selected.guideIds.includes(guide.id))&&
      (!query||[guide.title,guide.subtitle,guide.description,guide.language,
        ...guide.lessons.map(lesson=>lesson.title)].some(value=>value.toLocaleLowerCase().includes(query))));
  },[data,search,programme]);

  const toggle=(id:string)=>setExpanded(ids=>ids.includes(id)?ids.filter(value=>value!==id):[...ids,id]);
  return <section className="vop-catalogue" id="study-catalogue" aria-labelledby="vop-catalogue-title">
    <div className="vop-catalogue-inner">
      <div className="vop-catalogue-heading">
        <span className="vop-catalogue-eyebrow">OPEN STUDY DIRECTORY</span>
        <h2 id="vop-catalogue-title">Explore Bible studies before you sign in</h2>
        <p>Browse published programmes, course introductions and lesson titles. Sign in to read full lessons, answer assessments, save progress and connect with a mentor.</p>
      </div>
      <div className="vop-catalogue-filters">
        <label className="vop-catalogue-search"><Search size={19} aria-hidden="true"/>
          <span className="sr-only">Search published studies</span>
          <input type="search" value={search} onChange={event=>setSearch(event.target.value)}
            placeholder="Search topics, courses or lesson names"/>
        </label>
        <label className="vop-catalogue-select"><span>Programme</span>
          <select value={programme} onChange={event=>setProgramme(event.target.value)}>
            <option value="all">All published studies</option>
            {(data?.programs??[]).map(program=><option key={program.id} value={program.id}>{program.title}</option>)}
          </select>
        </label>
      </div>
      {loading&&<div className="vop-catalogue-status" role="status">Loading published studies…</div>}
      {!loading&&error&&<div className="vop-catalogue-status" role="status">{error} You can still sign in to VOP.</div>}
      {!loading&&!error&&<div className="vop-catalogue-result-count" aria-live="polite">
        {matches.length} published {matches.length===1?'course':'courses'} to explore
      </div>}
      {!loading&&!error&&matches.length===0&&
        <div className="vop-catalogue-status">No published studies match your filters. Try another search or programme.</div>}
      <div className="vop-catalogue-grid">
        {matches.map(guide=>{
          const open=expanded.includes(guide.id);
          const program=data?.programs.find(item=>item.guideIds.includes(guide.id));
          return <article className="vop-catalogue-card" key={guide.id}>
            <div className="vop-catalogue-card-top">
              <span><BookOpen size={15}/> {guide.language||'Bible study'}</span>
              {program&&<span className="vop-catalogue-programme">{program.title}</span>}
            </div>
            <h3>{guide.title}</h3>
            {guide.subtitle&&<strong className="vop-catalogue-subtitle">{guide.subtitle}</strong>}
            <p>{guide.description||'Explore the published lesson outline and continue studying with your VOP account.'}</p>
            <div className="vop-catalogue-lesson-count"><GraduationCap size={17}/>
              {guide.lessons.length} published {guide.lessons.length===1?'lesson or assessment':'lessons and assessments'}
            </div>
            <button type="button" className="vop-catalogue-expand" aria-expanded={open}
              aria-controls={`vop-course-${guide.id}`} onClick={()=>toggle(guide.id)}>
              {open?'Hide lesson outline':'Browse lesson outline'} <ChevronDown size={17} aria-hidden="true"/>
            </button>
            {open&&<div className="vop-catalogue-outline" id={`vop-course-${guide.id}`}>
              {guide.lessons.length===0
                ?<p>No public lesson outline has been published for this course.</p>
                :<ol>{guide.lessons.map((lesson,index)=><li key={lesson.id}>
                  <span className="vop-catalogue-lesson-index">{lesson.lessonNumber||String(index+1).padStart(2,'0')}</span>
                  <div><strong>{lesson.title}</strong>
                    {lesson.description&&<small>{lesson.description}</small>}
                    <span className="vop-catalogue-lesson-meta">{lesson.type==='assessment'?'Assessment':'Lesson'}
                      {lesson.estimatedMinutes?<><Clock3 size={12}/> {lesson.estimatedMinutes} min</>:null}</span>
                  </div>
                  <LockKeyhole size={16} aria-label="Sign in required for full lesson"/>
                </li>)}</ol>}
              <button type="button" className="vop-catalogue-start" onClick={onSignIn}>
                Sign in to open this course <ArrowRight size={16}/>
              </button>
            </div>}
          </article>;
        })}
      </div>
      <div className="vop-catalogue-footer"><LockKeyhole size={18}/>
        Full lesson pages, assessments, certificates and personal learning records require your VOP account.
        <button type="button" onClick={onSignIn}>Sign in <ArrowRight size={15}/></button>
      </div>
    </div>
  </section>;
}
