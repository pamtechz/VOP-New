import React, { useState } from 'react';
import {
  ArrowRight, BookOpen, CheckCircle2, ChevronDown, Globe2, GraduationCap,
  HeartHandshake, Headphones, LockKeyhole, Menu, Radio, ScrollText,
  ShieldCheck, Sparkles, Swords, Users, X,
} from 'lucide-react';
import './public-home.css';

type Props = {
  onSignIn: () => void;
  onRegister: () => void;
  configurationMissing?: boolean;
  registrationAllowed?: boolean;
};

const features = [
  { icon: BookOpen, label: 'Bible study', title: 'A path through Scripture', detail: 'Structured guides, lessons, chapter studies and reflection at your pace.' },
  { icon: GraduationCap, label: 'Learning', title: 'Study with purpose', detail: 'Practice questions, assessments and graduation review tied to published courses.' },
  { icon: ShieldCheck, label: 'Youth ministry', title: 'Grow into leadership', detail: 'Master Guide activities, portfolio evidence and mentor sign-offs in one place.' },
  { icon: Swords, label: 'Scripture', title: 'Make the Word memorable', detail: 'Scripture Memory reviews and Iron Duels for interactive Bible engagement.' },
  { icon: Radio, label: 'Community', title: 'Stay connected', detail: 'Ministry programmes, radio, prayer requests, events and announcements.' },
  { icon: Users, label: 'Organizations', title: 'Serve together', detail: 'Church, district, conference and union workspaces with scoped administration.' },
];

const steps = [
  { number:'01', title:'Create your account', text:'Register or sign in using your VOP account.' },
  { number:'02', title:'Explore published studies', text:'Find a guide in your language and follow its lessons.' },
  { number:'03', title:'Build your understanding', text:'Complete activities and submit assessments when you are ready.' },
  { number:'04', title:'Follow your progress', text:'View verified results and any configured certification steps.' },
];

export const PublicHome: React.FC<Props> = ({onSignIn,onRegister,configurationMissing=false,registrationAllowed=false}) => {
  const [menuOpen,setMenuOpen]=useState(false);
  const navigate=(hash:string)=>{setMenuOpen(false);document.getElementById(hash)?.scrollIntoView({behavior:'smooth'});};
  return <main className="vop-public">
    <a className="vop-public-skip" href="#main-content">Skip to content</a>
    <header className="vop-public-header">
      <div className="vop-public-header-inner">
        <a href="/" className="vop-public-brand" aria-label="Voice of Prophecy home">
          <img src="/assets/vop_logo_2.png" alt="" /><span><strong>Voice of Prophecy</strong><small>One connected ministry</small></span>
        </a>
        <nav className={menuOpen?'vop-public-links open':'vop-public-links'} aria-label="Public site">
          <button type="button" onClick={()=>navigate('features')}>Discover VOP</button>
          <button type="button" onClick={()=>navigate('how-it-works')}>How it works</button>
          <button type="button" onClick={()=>navigate('organizations')}>For organizations</button>
          <button type="button" className="vop-public-mobile-signin" onClick={onSignIn}>Sign in</button>
        </nav>
        <div className="vop-public-header-actions">
          <button type="button" className="vop-public-signin" onClick={onSignIn}>Sign in</button>
          {registrationAllowed&&<button type="button" className="vop-public-join" onClick={onRegister}>Get started <ArrowRight size={16}/></button>}
          <button type="button" className="vop-public-menu-toggle" onClick={()=>setMenuOpen(value=>!value)}
            aria-expanded={menuOpen} aria-label={menuOpen?'Close navigation':'Open navigation'}>{menuOpen?<X size={22}/>:<Menu size={22}/>}</button>
        </div>
      </div>
    </header>
    <section id="main-content" className="vop-public-hero">
      <div className="vop-public-hero-inner">
        <div className="vop-public-hero-copy">
          <span className="vop-public-eyebrow"><Sparkles size={16}/> One Digital Platform. One Connected Ministry.</span>
          <h1>Study the Word.<br/><em>Grow in faith.</em><br/>Serve together.</h1>
          <p className="vop-public-lead">Bible study, discipleship, youth leadership and church connection—united in one secure, mobile-first ministry experience.</p>
          <div className="vop-public-hero-actions">
            {registrationAllowed?<button type="button" className="vop-public-primary" onClick={onRegister}>Begin your journey <ArrowRight size={19}/></button>:<button type="button" className="vop-public-primary" onClick={onSignIn}>Sign in to continue <ArrowRight size={19}/></button>}
            <button type="button" className="vop-public-secondary" onClick={()=>navigate('features')}>Explore the platform <ChevronDown size={18}/></button>
          </div>
          <div className="vop-public-trust"><span><CheckCircle2 size={17}/> Self-paced lessons</span><span><CheckCircle2 size={17}/> Multilingual learning</span><span><CheckCircle2 size={17}/> Account-linked progress</span></div>
          {configurationMissing&&<p className="vop-public-config-notice" role="status">Account sign-in is temporarily unavailable because Firebase configuration is missing for this deployment.</p>}
        </div>
        <div className="vop-public-showcase" aria-label="Illustration of the VOP learning experience">
          <div className="vop-public-showcase-orbit"/>
          <div className="vop-public-window">
            <div className="vop-public-window-bar"><span/><span/><span/><small>YOUR LEARNING PATH</small></div>
            <div className="vop-public-window-head"><div className="vop-public-window-icon"><BookOpen size={26}/></div><div><span>BIBLE STUDY</span><h2>Discover the Word</h2><p>Learn one lesson at a time.</p></div></div>
            <div className="vop-public-window-track"><i/><i/><i/><i/></div>
            <div className="vop-public-window-lesson"><span><CheckCircle2 size={19}/></span><div><strong>Read the lesson</strong><small>Study at your own pace</small></div><span className="vop-public-window-tick">✓</span></div>
            <div className="vop-public-window-lesson"><span><ScrollText size={19}/></span><div><strong>Explore Scripture</strong><small>Connect faith and understanding</small></div><ArrowRight size={17}/></div>
            <div className="vop-public-window-lesson"><span><GraduationCap size={19}/></span><div><strong>Check your understanding</strong><small>Practice and assessments</small></div><LockKeyhole size={16}/></div>
          </div>
          <div className="vop-public-float vop-public-float-top"><span><Headphones size={20}/></span><div><strong>Listen & learn</strong><small>Audio learning</small></div></div>
          <div className="vop-public-float vop-public-float-bottom"><span><HeartHandshake size={20}/></span><div><strong>Grow together</strong><small>One connected ministry</small></div></div>
        </div>
      </div>
    </section>
    <section className="vop-public-feature-section" id="features">
      <div className="vop-public-section-head"><span>BUILT FOR GROWTH</span><h2>Everything you need to learn, connect and serve</h2><p>Choose the ministry experience that fits where you are on your journey.</p></div>
      <div className="vop-public-feature-grid">{features.map(({icon:Icon,label,title,detail})=><article key={title} className="vop-public-feature">
        <div className="vop-public-feature-icon"><Icon size={25}/></div><span>{label}</span><h3>{title}</h3><p>{detail}</p>
      </article>)}</div>
    </section>
    <section id="how-it-works" className="vop-public-steps">
      <div className="vop-public-steps-inner"><div className="vop-public-section-head"><span>YOUR JOURNEY</span><h2>Small steps. Lasting growth.</h2><p>A simple path from your first study to your next milestone.</p></div>
        <div className="vop-public-step-grid">{steps.map(step=><article key={step.number}><span>{step.number}</span><h3>{step.title}</h3><p>{step.text}</p></article>)}</div>
      </div>
    </section>
    <section className="vop-public-org" id="organizations">
      <div className="vop-public-org-inner"><div><span className="vop-public-eyebrow"><Globe2 size={16}/> FOR ADVENTIST ORGANIZATIONS</span><h2>One connected ministry, from the local church outward.</h2><p>Give churches, districts, conferences, unions and educational institutions a shared space for discipleship, organized learning and meaningful communication.</p><div className="vop-public-org-points"><span><ShieldCheck size={17}/> Organization-scoped administration</span><span><Users size={17}/> Connected membership and mentorship</span><span><BookOpen size={17}/> Published learning materials</span></div></div>
        <div className="vop-public-org-art" aria-hidden="true"><span className="vop-public-org-ring ring-one"/><span className="vop-public-org-ring ring-two"/><div className="vop-public-org-symbol"><img src="/assets/vop_logo_2.png" alt=""/></div></div>
      </div>
    </section>
    <section className="vop-public-cta"><span>YOUR NEXT CHAPTER STARTS HERE</span><h2>Ready to begin?</h2><p>Continue your Bible study journey with Voice of Prophecy.</p><div>{registrationAllowed&&<button type="button" onClick={onRegister}>Create your VOP account <ArrowRight size={17}/></button>}<button type="button" onClick={onSignIn}>{registrationAllowed?'I already have an account':'Sign in to VOP'}</button></div>{!registrationAllowed&&<small>New public registrations are currently closed. Organization invitation links can still be used to create an account.</small>}</section>
    <footer className="vop-public-footer"><span><img src="/assets/vop_logo_2.png" alt=""/> Voice of Prophecy</span><p>One Digital Platform. One Connected Ministry. A Stronger Church.</p><small>© {new Date().getFullYear()} Voice of Prophecy</small></footer>
  </main>;
};
