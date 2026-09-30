
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { RadioBroadcast, RadioPlaylist } from '../types';
import { getTranslation, getUiLocale } from '../services/i18n';
import { getActiveLanguage, getStoredSettings } from '../services/storage';
import { isSafeHttpsMediaUrl, resolveMediaSource } from '../../shared/mediaSources';
import {
  ArrowLeft, Radio, Play, Pause, Volume2, Maximize2, ExternalLink,
  SkipBack, SkipForward, Gauge, BookOpen, Globe2, CalendarDays,
  ChevronRight, ListMusic, Clock3, Video, Headphones, Search, Sparkles
} from 'lucide-react';
import './radio-youtube.css';

interface RadioPageProps { broadcasts: RadioBroadcast[]; playlists?: RadioPlaylist[]; onBack: () => void; }

type YTPlayer = {
  playVideo: () => void; pauseVideo: () => void; seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  mute: () => void; unMute: () => void; isMuted: () => boolean; setVolume: (volume: number) => void;
  getVolume: () => number; getCurrentTime: () => number; getDuration: () => number;
  getPlaybackRate: () => number; setPlaybackRate: (rate: number) => void; getPlayerState: () => number; destroy: () => void;
};
type YTNamespace = {
  Player: new (element: HTMLElement, options: {
    videoId: string; width?: string; height?: string; playerVars?: Record<string, number | string>;
    events?: Record<string, (event: { target: YTPlayer }) => void>;
  }) => YTPlayer;
  PlayerState: { ENDED: number; PLAYING: number; PAUSED: number; BUFFERING: number; CUED: number };
};
declare global {
  interface Window { YT?: YTNamespace; onYouTubeIframeAPIReady?: () => void; }
}
let youtubeApiPromise: Promise<YTNamespace> | null = null;
function loadYouTubeApi(): Promise<YTNamespace> {
  const existingApi = window.YT;
  if (existingApi?.Player) return Promise.resolve(existingApi);
  if (youtubeApiPromise) return youtubeApiPromise;
  youtubeApiPromise = new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      const api = window.YT;
      if (api?.Player) resolve(api); else reject(new Error('YouTube player API did not initialise.'));
    };
    if (document.querySelector('script[data-vop-youtube-api]')) return;
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true; script.dataset.vopYoutubeApi = 'true';
    script.onerror = () => reject(new Error('YouTube player API could not be loaded.'));
    document.head.appendChild(script);
  });
  return youtubeApiPromise;
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = Math.floor(seconds % 60);
  return h ? h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') : m + ':' + String(s).padStart(2, '0');
}
function localTime(date: Date) { return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(date); }
function dateTime(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
function youtubeSource(value?: string) {
  if (!value) return null;
  try {
    const url = new URL(value), host = url.hostname.toLowerCase();
    if (host === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0] || '';
      return id ? { id, live: false } : null;
    }
    if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
      if (url.pathname === '/watch') {
        const id = url.searchParams.get('v') || '';
        return id ? { id, live: false } : null;
      }
      if (url.pathname.startsWith('/live/')) {
        const id = url.pathname.slice('/live/'.length).split('/')[0] || '';
        return id ? { id, live: true } : null;
      }
      for (const prefix of ['/shorts/', '/embed/']) {
        if (url.pathname.startsWith(prefix)) {
          const id = url.pathname.slice(prefix.length).split('/')[0] || '';
          return id ? { id, live: false } : null;
        }
      }
    }
  } catch {}
  return null;
}
function audioVerseEmbedUrl(value?: string) {
  if (!value) return null;
  try {
    const url = new URL(value), host = url.hostname.toLowerCase();
    if (host !== 'audioverse.org' && !host.endsWith('.audioverse.org')) return null;
    if (/\/embed\/media\/\d+(?:\/|$)/i.test(url.pathname)) return url.toString();
    const media = url.pathname.match(/\/media\/(\d+)(?:\/|$)/i);
    if (media?.[1]) return 'https://www.audioverse.org/en/embed/media/' + media[1];
    const teaching = url.pathname.match(/\/teachings\/(\d+)(?:\/|$)/i);
    if (teaching?.[1]) return 'https://www.audioverse.org/en/embed/media/' + teaching[1];
  } catch {}
  return null;
}
type MediaSource =
  | { provider: 'direct-audio' | 'direct-video'; url: string; live: boolean }
  | { provider: 'youtube'; url: string; videoId: string; live: boolean }
  | { provider: 'audioverse'; url: string; embedUrl: string; live: boolean }
  | { provider: 'embed'; url: string; embedUrl: string; label: string; live: false }
  | null;
function detectMedia(item: RadioBroadcast): MediaSource {
  const candidates = [item.videoUrl, item.audioUrl, item.streamUrl].map(v => v?.trim()).filter(Boolean) as string[];
  for (const url of candidates) {
    const resolved = resolveMediaSource(url);
    if (!resolved || resolved.kind === 'external') continue;
    if (resolved.provider === 'YouTube') {
      const id = resolved.url.split('/embed/')[1]?.split('?')[0] || '';
      if (id) return { provider:'youtube', url, videoId:id, live:url.includes('/live/') };
    }
    if (resolved.provider === 'AudioVerse') return { provider:'audioverse', url, embedUrl:resolved.url, live:false };
    if (resolved.kind === 'embed') return { provider:'embed', url, embedUrl:resolved.url, label:resolved.provider, live:false };
    return { provider:resolved.kind, url:resolved.url, live:false };
  }
  // Direct browser-playable HTTPS radio streams can have an extensionless path.
  if (item.streamUrl && isSafeHttpsMediaUrl(item.streamUrl)) return {provider:'direct-audio',url:item.streamUrl,live:true};
  return null;
}
function sourceLabel(source: MediaSource) {
  if (!source) return 'No media';
  if (source.provider === 'youtube') return 'YouTube';
  if (source.provider === 'audioverse') return 'AudioVerse';
  if (source.provider === 'embed') return source.label;
  if (source.provider === 'direct-video') return 'Video';
  return source.live ? 'Live stream' : 'Audio';
}

export const RadioPage: React.FC<RadioPageProps> = ({ broadcasts, playlists = [], onBack }) => {
  const language = getActiveLanguage();
  const settings = getStoredSettings();
  const t = (key: string, fallback: string) => getTranslation(key, getUiLocale(), settings.customTranslations, fallback, 'RadioPage');
  const [selected, setSelected] = useState<RadioBroadcast | null>(broadcasts[0] || null);
  const [playing, setPlaying] = useState(false), [muted, setMuted] = useState(false), [volume, setVolume] = useState(1);
  const [current, setCurrent] = useState(0), [duration, setDuration] = useState(0), [rate, setRate] = useState(1);
  const [error, setError] = useState(''), [waiting, setWaiting] = useState(false), [now, setNow] = useState(() => new Date());
  const [ytReady, setYtReady] = useState(false);
  const [scheduleRange, setScheduleRange] = useState<'today' | 'tomorrow' | 'week'>('today');
  const [selectedPlaylistId, setSelectedPlaylistId] = useState('');
  const [query,setQuery]=useState('');
  const [mediaFilter,setMediaFilter]=useState<'all'|'live'|'video'|'audio'>('all');
  const playlistIndexRef = useRef(-1);
  const playlistItemsRef = useRef<RadioBroadcast[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null), videoRef = useRef<HTMLVideoElement | null>(null);
  const ytMountRef = useRef<HTMLDivElement | null>(null), ytPlayerRef = useRef<YTPlayer | null>(null);
  const source = useMemo(() => selected ? detectMedia(selected) : null, [selected]);
  const youtubeVideoId = source?.provider === 'youtube' ? source.videoId : undefined;

  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 30000); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    if (!broadcasts.length) { setSelected(null); return; }
    if (!selected || !broadcasts.some(item => item.id === selected.id)) setSelected(broadcasts[0]);
  }, [broadcasts, selected]);
  useEffect(() => {
    setPlaying(false); setCurrent(0); setDuration(0); setError(''); setWaiting(false); setYtReady(false);
    ytPlayerRef.current?.destroy(); ytPlayerRef.current = null; audioRef.current?.pause(); videoRef.current?.pause();
  }, [selected?.id]);

  useEffect(() => {
    if (source?.provider !== 'youtube' || !ytMountRef.current || !youtubeVideoId) return;
    let cancelled = false;
    void loadYouTubeApi().then(YT => {
      if (cancelled || !ytMountRef.current) return;
      const player = new YT.Player(ytMountRef.current, {
        videoId: youtubeVideoId, width: '100%', height: '100%',
        playerVars: { autoplay: 0, controls: 0, rel: 0, playsinline: 1, enablejsapi: 1 },
        events: {
          onReady: event => { if (cancelled) return; ytPlayerRef.current = event.target; setYtReady(true); setDuration(event.target.getDuration() || 0); event.target.setVolume(volume * 100); },
          onStateChange: event => {
            const state = event.target.getPlayerState();
            setPlaying(state === YT.PlayerState.PLAYING); setWaiting(state === YT.PlayerState.BUFFERING);
            setCurrent(event.target.getCurrentTime() || 0); setDuration(event.target.getDuration() || 0);
            if (state === YT.PlayerState.ENDED) {
              const index = playlistIndexRef.current;
              const items = playlistItemsRef.current;
              if (index >= 0 && index < items.length - 1) { setSelectedPlaylistId(selectedPlaylistId || ''); setSelected(items[index + 1]); }
              else setPlaying(false);
            }
          }
        }
      });
      ytPlayerRef.current = player;
    }).catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'YouTube player controls could not be initialised.'); });
    return (
    <div className="vop-audience-radio vop-media-hub">
      <header className="vop-media-topbar">
        <div className="vop-media-topbar-start">
          <button type="button" className="vop-media-icon-button" onClick={onBack} aria-label={t('common.back','Back')}><ArrowLeft size={20}/></button>
          <div className="vop-media-brand"><span><Radio size={22}/></span><div><strong>VOP Media</strong><small>Radio · Video · Messages of Hope</small></div></div>
        </div>
        <label className="vop-media-search"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search programmes, speakers and series" aria-label="Search VOP media"/></label>
        <div className="vop-media-topbar-end"><span className="vop-media-live-count"><i/>{live.length} live</span></div>
      </header>

      <div className="vop-media-filterbar" role="toolbar" aria-label="Media filters">
        {(['all','live','video','audio'] as const).map(filter=><button key={filter} type="button" className={mediaFilter===filter?'active':''} onClick={()=>setMediaFilter(filter)}>
          {filter==='all'?'All':filter==='live'?'Live now':filter==='video'?'Video':'Audio'}
        </button>)}
        <span>{filteredBroadcasts.length} programme{filteredBroadcasts.length===1?'':'s'}</span>
      </div>

      <main className="vop-media-watch-page">
        <section className="vop-media-watch-grid">
          <div className="vop-media-watch-main">
            <div className="vop-media-player-shell">
              <div className="vop-media-player-frame" style={source?.provider==='direct-audio'&&selectedPoster?{backgroundImage:'linear-gradient(rgba(4,15,32,.36),rgba(4,15,32,.82)),url("'+selectedPoster+'")'}:undefined}>
                {source?.provider === 'youtube' && <div ref={ytMountRef} className="vop-radio-youtube-stage"/>}
                {source?.provider === 'audioverse' && <iframe className="vop-radio-audioverse-stage" src={source.embedUrl} title={heroItem?.title || 'AudioVerse'} sandbox="allow-scripts allow-same-origin allow-presentation allow-popups" allow="autoplay; encrypted-media; picture-in-picture" />}
                {source?.provider === 'embed' && <iframe className="vop-radio-audioverse-stage" src={source.embedUrl} title={heroItem?.title || source.label} sandbox="allow-scripts allow-same-origin allow-presentation allow-popups" referrerPolicy="strict-origin-when-cross-origin" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen />}
                {source?.provider === 'direct-video' && <video ref={videoRef} src={source.url} poster={selectedPoster || undefined} playsInline preload="metadata" {...mediaEvents}/>}
                {source?.provider === 'direct-audio' && <><audio ref={audioRef} src={source.url} preload="metadata" {...mediaEvents}/><div className="vop-media-audio-stage"><span><Radio size={42}/></span><strong>{heroItem?.title}</strong><small>{heroItem?.speaker||heroItem?.series||'Voice of Prophecy'}</small><div className="vop-radio-wave">{Array.from({length:28},(_,i)=><b key={i} style={{height:(12+((i*17)%34))+'px'}}/>)}</div></div></>}
                {!source && <div className="vop-radio-provider-empty"><Radio size={34}/>{t('radio.no_source','No playable source configured.')}</div>}
                {source?.live&&<span className="vop-media-live-badge">LIVE</span>}
              </div>
              {source?.provider !== 'audioverse' && source?.provider !== 'embed' && <div className="vop-media-player-controls">
                <button type="button" onClick={()=>skip(-10)} disabled={!duration}><SkipBack size={18}/></button>
                <button type="button" className="primary" onClick={()=>void togglePlay()} disabled={!source||(source.provider==='youtube'&&!ytReady)}>{playing?<Pause size={21}/>:<Play size={21} fill="currentColor"/>}</button>
                <button type="button" onClick={()=>skip(10)} disabled={!duration}><SkipForward size={18}/></button>
                <span>{formatTime(current)}</span><input className="progress" type="range" min="0" max={duration||0} step=".1" value={Math.min(current,duration||0)} onChange={e=>seek(Number(e.target.value))} disabled={!duration}/><span>{duration?formatTime(duration):source?.live?'LIVE':'—'}</span>
                <button type="button" onClick={toggleMute}><Volume2 size={18}/></button>
                <input className="volume" type="range" min="0" max="1" step=".01" value={volume} onChange={e=>setPlayerVolume(Number(e.target.value))}/>
                {(source?.provider==='direct-video'||source?.provider==='youtube')&&<button type="button" onClick={fullscreen}><Maximize2 size={18}/></button>}
              </div>}
            </div>

            <article className="vop-media-programme-meta">
              <h1>{heroItem?.title||'VOP Media'}</h1>
              <div className="vop-media-programme-row"><div className="vop-media-channel-avatar"><Radio size={20}/></div><div className="vop-media-channel-copy"><strong>{heroItem?.speaker||'Voice of Prophecy'}</strong><span>{heroItem?.series||sourceLabel(source)}</span></div>
                <span className="vop-media-provider-pill">{sourceLabel(source)}</span>
                {source?.url&&<a href={source.url} target="_blank" rel="noreferrer"><ExternalLink size={16}/> Open source</a>}
              </div>
              <div className="vop-media-description"><strong>{heroItem?.broadcastTime?dateTime(heroItem.broadcastTime):dateTime(heroItem?.createdAt||heroItem?.updatedAt)}</strong><p>{heroItem?.description||'Bible truth, practical life teaching and messages of hope.'}</p></div>
            </article>
          </div>

          <aside className="vop-media-up-next">
            <div className="vop-media-side-head"><div><strong>Up next</strong><small>Continue watching and listening</small></div><Sparkles size={18}/></div>
            <div className="vop-media-up-next-list">
              {upNext.map(item=>{const media=detectMedia(item);return <button key={item.id} type="button" onClick={()=>selectProgramme(item)}>
                <div className="vop-media-up-thumb" style={item.posterUrl?{backgroundImage:'url("'+item.posterUrl+'")'}:undefined}><span>{media?.live?'LIVE':item.durationMinutes?formatTime(item.durationMinutes*60):sourceLabel(media)}</span><Play size={18} fill="currentColor"/></div>
                <div><strong>{item.title}</strong><span>{item.speaker||item.series||'Voice of Prophecy'}</span><small>{sourceLabel(media)}{item.broadcastTime?' · '+dateTime(item.broadcastTime):''}</small></div>
              </button>})}
              {!upNext.length&&<div className="vop-media-side-empty">No other programmes match this filter.</div>}
            </div>
          </aside>
        </section>

        {categories.length>0&&<nav className="vop-media-category-chips" aria-label="Browse series">
          <button type="button" className={!query?'active':''} onClick={()=>setQuery('')}>Explore</button>
          {categories.map(category=><button type="button" key={category} onClick={()=>setQuery(category)}>{category}</button>)}
        </nav>}

        <section className="vop-media-shelf">
          <div className="vop-media-shelf-head"><div><h2>Recommended</h2><p>Published programmes selected from your ministry library.</p></div><span>{featured.length} shown</span></div>
          <div className="vop-media-card-grid">{featured.map(item=>{const media=detectMedia(item);return <button key={item.id} type="button" className={selected?.id===item.id?'active':''} onClick={()=>selectProgramme(item)}>
            <div className="vop-media-card-thumb" style={item.posterUrl?{backgroundImage:'url("'+item.posterUrl+'")'}:undefined}><Play size={22} fill="currentColor"/><span>{media?.live?'LIVE':item.durationMinutes?formatTime(item.durationMinutes*60):sourceLabel(media)}</span></div>
            <div className="vop-media-card-copy"><span className="avatar"><Radio size={15}/></span><div><strong>{item.title}</strong><span>{item.speaker||item.series||'Voice of Prophecy'}</span><small>{sourceLabel(media)}{item.createdAt?' · '+dateTime(item.createdAt):''}</small></div></div>
          </button>})}</div>
        </section>

        {publishedPlaylists.length>0&&<section className="vop-media-shelf">
          <div className="vop-media-shelf-head"><div><h2>Playlists</h2><p>Curated series for continuous study and listening.</p></div><span>{publishedPlaylists.length}</span></div>
          <div className="vop-media-playlist-grid">{publishedPlaylists.map(playlist=><button key={playlist.id} type="button" className={selectedPlaylistId===playlist.id?'active':''} onClick={()=>selectPlaylist(playlist)}>
            <div className="vop-media-playlist-cover" style={playlist.coverUrl?{backgroundImage:'url("'+playlist.coverUrl+'")'}:undefined}><ListMusic size={28}/><span>{playlist.itemIds.length} videos / audio</span></div>
            <strong>{playlist.name}</strong><small>{playlist.description||'VOP curated playlist'}</small>
          </button>)}</div>
        </section>}

        <section className="vop-media-lower-grid">
          <div className="vop-media-schedule-panel">
            <div className="vop-media-shelf-head"><div><h2><CalendarDays size={19}/> Schedule</h2><p>Upcoming ministry programming.</p></div></div>
            <div className="vop-radio-schedule-tabs">{(['today','tomorrow','week'] as const).map(range=><button key={range} className={scheduleRange===range?'active':''} type="button" onClick={()=>setScheduleRange(range)}>{range==='today'?'Today':range==='tomorrow'?'Tomorrow':'This week'}</button>)}</div>
            <div className="vop-media-schedule-list">{schedule.map(item=><button key={item.id} type="button" onClick={()=>selectProgramme(item)} className={selected?.id===item.id?'active':''}><time>{item.broadcastTime?localTime(new Date(item.broadcastTime)):'—'}</time><div><strong>{item.title}</strong><span>{item.speaker||item.series||sourceLabel(detectMedia(item))}</span></div>{detectMedia(item)?.live&&<em>LIVE</em>}</button>)}{!schedule.length&&<div className="vop-media-side-empty">No programmes are scheduled for this period.</div>}</div>
          </div>
          <div className="vop-media-audio-panel">
            <div className="vop-media-shelf-head"><div><h2><Headphones size={19}/> Latest audio</h2><p>Listen while you study, travel or work.</p></div></div>
            <div className="vop-media-audio-list">{latestAudio.map(item=><button key={item.id} type="button" onClick={()=>selectProgramme(item)}><div className="vop-media-audio-thumb" style={item.posterUrl?{backgroundImage:'url("'+item.posterUrl+'")'}:undefined}><Play size={16} fill="currentColor"/></div><div><strong>{item.title}</strong><span>{item.speaker||item.series||'Voice of Prophecy'}</span></div><small>{item.durationMinutes?formatTime(item.durationMinutes*60):sourceLabel(detectMedia(item))}</small></button>)}{!latestAudio.length&&<div className="vop-media-side-empty">No audio programmes match this filter.</div>}</div>
          </div>
        </section>
      </main>

      {selected&&<section className="vop-radio-docked-player">
        <div className="vop-radio-docked-meta"><div className="vop-radio-docked-cover" style={selectedPoster?{backgroundImage:'url("'+selectedPoster+'")'}:undefined}><Radio size={18}/></div><div><strong>{selected.title}</strong><small>{selected.speaker||selected.series||'Voice of Prophecy'}</small></div>{source?.live&&<em>{t('radio.live','LIVE')}</em>}</div>
        <div className="vop-radio-docked-center"><button type="button" onClick={()=>skip(-10)} disabled={!duration}><SkipBack size={17}/></button><button className="main" type="button" onClick={()=>void togglePlay()} disabled={!source||(source.provider==='youtube'&&!ytReady)||(source.provider==='audioverse'||source.provider==='embed')}>{playing?<Pause size={19}/>:<Play size={19} fill="currentColor"/>}</button><button type="button" onClick={()=>skip(10)} disabled={!duration}><SkipForward size={17}/></button></div>
        <div className="vop-radio-docked-progress"><span>{formatTime(current)}</span><input type="range" min="0" max={duration||0} step=".1" value={Math.min(current,duration||0)} onChange={e=>seek(Number(e.target.value))} disabled={!duration}/><span>{duration?formatTime(duration):source?.live?'LIVE':'—'}</span></div>
        <div className="vop-radio-docked-actions">{source?.provider!=='audioverse'&&source?.provider!=='embed'&&<><button type="button" onClick={toggleMute}><Volume2 size={17}/></button><input type="range" min="0" max="1" step=".01" value={volume} onChange={e=>setPlayerVolume(Number(e.target.value))}/></>}{source?.provider !== 'audioverse' && source?.provider !== 'embed' && <label><Gauge size={15}/><select value={rate} onChange={e=>changeRate(Number(e.target.value))}>{[.5,.75,1,1.25,1.5,1.75,2].map(v=><option key={v} value={v}>{v}×</option>)}</select></label>}{(source?.provider==='direct-video'||source?.provider==='youtube')&&<button type="button" onClick={fullscreen}><Maximize2 size={17}/></button>}</div>
      </section>}
      {error&&<div className="vop-radio-player-error">{error}</div>}
      {waiting&&<div className="vop-radio-player-waiting"><Clock3 size={15}/> Buffering media…</div>}
    </div>
  );
};

export default RadioPage;
