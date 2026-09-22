
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { RadioBroadcast } from '../types';
import {
  ArrowLeft, Radio, Play, Pause, Volume2, Maximize2, ExternalLink,
  SkipBack, SkipForward, Gauge, BookOpen, Globe2, CalendarDays,
  ChevronRight, ListMusic, Clock3, Video, Headphones
} from 'lucide-react';

interface RadioPageProps { broadcasts: RadioBroadcast[]; onBack: () => void; }

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
  | null;
function detectMedia(item: RadioBroadcast): MediaSource {
  const candidates = [item.videoUrl, item.audioUrl, item.streamUrl].map(v => v?.trim()).filter(Boolean) as string[];
  for (const url of candidates) {
    const youtube = youtubeSource(url);
    if (youtube) return { provider: 'youtube', url, videoId: youtube.id, live: youtube.live };
    const audioVerse = audioVerseEmbedUrl(url);
    if (audioVerse) return { provider: 'audioverse', url, embedUrl: audioVerse, live: false };
  }
  if (item.mediaType === 'video' && item.videoUrl?.trim()) return { provider: 'direct-video', url: item.videoUrl.trim(), live: false };
  if (item.videoUrl?.trim()) return { provider: 'direct-video', url: item.videoUrl.trim(), live: false };
  if (item.audioUrl?.trim()) return { provider: 'direct-audio', url: item.audioUrl.trim(), live: false };
  if (item.streamUrl?.trim()) return { provider: 'direct-audio', url: item.streamUrl.trim(), live: true };
  return null;
}
function sourceLabel(source: MediaSource) {
  if (!source) return 'No media';
  if (source.provider === 'youtube') return 'YouTube';
  if (source.provider === 'audioverse') return 'AudioVerse';
  if (source.provider === 'direct-video') return 'Video';
  return source.live ? 'Live stream' : 'Audio';
}

export const RadioPage: React.FC<RadioPageProps> = ({ broadcasts, onBack }) => {
  const [selected, setSelected] = useState<RadioBroadcast | null>(broadcasts[0] || null);
  const [playing, setPlaying] = useState(false), [muted, setMuted] = useState(false), [volume, setVolume] = useState(1);
  const [current, setCurrent] = useState(0), [duration, setDuration] = useState(0), [rate, setRate] = useState(1);
  const [error, setError] = useState(''), [waiting, setWaiting] = useState(false), [now, setNow] = useState(() => new Date());
  const [ytReady, setYtReady] = useState(false);
  const [scheduleRange, setScheduleRange] = useState<'today' | 'tomorrow' | 'week'>('today');
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
          }
        }
      });
      ytPlayerRef.current = player;
    }).catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'YouTube player controls could not be initialised.'); });
    return () => { cancelled = true; ytPlayerRef.current?.destroy(); ytPlayerRef.current = null; };
  }, [source?.provider, youtubeVideoId]);

  useEffect(() => {
    if (source?.provider !== 'youtube' || !ytPlayerRef.current || !ytReady) return;
    const timer = window.setInterval(() => {
      const player = ytPlayerRef.current; if (!player) return;
      setCurrent(player.getCurrentTime() || 0); setDuration(player.getDuration() || 0);
      setMuted(player.isMuted()); setVolume((player.getVolume() || 0) / 100); setRate(player.getPlaybackRate() || 1);
    }, 500);
    return () => window.clearInterval(timer);
  }, [source?.provider, ytReady]);

  useEffect(() => {
    const media = source?.provider === 'direct-audio' ? audioRef.current : source?.provider === 'direct-video' ? videoRef.current : null;
    if (!media) return; media.volume = volume; media.muted = muted; media.playbackRate = rate;
  }, [source?.provider, volume, muted, rate]);

  const togglePlay = async () => {
    if (!source) return;
    setError('');
    try {
      if (source.provider === 'youtube') {
        const player = ytPlayerRef.current; if (!player || !ytReady) return;
        if (playing) player.pauseVideo(); else player.playVideo();
      } else {
        const media = source.provider === 'direct-video' ? videoRef.current : audioRef.current;
        if (!media) return; if (playing) media.pause(); else await media.play();
      }
    } catch { setPlaying(false); setError('The configured media could not be played. Check the source and browser permissions.'); }
  };
  const selectProgramme = (item: RadioBroadcast) => { if (selected?.id === item.id) void togglePlay(); else setSelected(item); };
  const seek = (value: number) => {
    if (!source || !duration) return; const next = Math.max(0, Math.min(value, duration));
    if (source.provider === 'youtube') ytPlayerRef.current?.seekTo(next, true);
    else { const media = source.provider === 'direct-video' ? videoRef.current : audioRef.current; if (media) media.currentTime = next; }
    setCurrent(next);
  };
  const skip = (seconds: number) => seek(current + seconds);
  const setPlayerVolume = (next: number) => {
    const value = Math.max(0, Math.min(1, next)); setVolume(value); setMuted(value === 0);
    if (source?.provider === 'youtube') { ytPlayerRef.current?.setVolume(value * 100); if (value === 0) ytPlayerRef.current?.mute(); else ytPlayerRef.current?.unMute(); }
    else { const media = source?.provider === 'direct-video' ? videoRef.current : audioRef.current; if (media) { media.volume = value; media.muted = value === 0; } }
  };
  const toggleMute = () => {
    if (source?.provider === 'youtube') {
      const player = ytPlayerRef.current; if (!player) return; const wasMuted = player.isMuted(); if (wasMuted) { player.unMute(); setMuted(false); } else { player.mute(); setMuted(true); } return;
    }
    const media = source?.provider === 'direct-video' ? videoRef.current : audioRef.current; if (!media) return; media.muted = !media.muted; setMuted(media.muted);
  };
  const changeRate = (next: number) => {
    setRate(next);
    if (source?.provider === 'youtube') ytPlayerRef.current?.setPlaybackRate(next);
    else { const media = source?.provider === 'direct-video' ? videoRef.current : audioRef.current; if (media) media.playbackRate = next; }
  };
  const fullscreen = () => { const element = source?.provider === 'youtube' ? ytMountRef.current : videoRef.current; if (element) void element.requestFullscreen?.(); };
  const mediaEvents = {
    onTimeUpdate: (event: React.SyntheticEvent<HTMLMediaElement>) => setCurrent(event.currentTarget.currentTime || 0),
    onLoadedMetadata: (event: React.SyntheticEvent<HTMLMediaElement>) => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0),
    onDurationChange: (event: React.SyntheticEvent<HTMLMediaElement>) => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0),
    onPlay: () => { setPlaying(true); setWaiting(false); }, onPlaying: () => setWaiting(false), onPause: () => setPlaying(false),
    onWaiting: () => setWaiting(true), onCanPlay: () => setWaiting(false), onEnded: () => setPlaying(false),
    onVolumeChange: (event: React.SyntheticEvent<HTMLMediaElement>) => { setMuted(event.currentTarget.muted); setVolume(event.currentTarget.volume); },
    onRateChange: (event: React.SyntheticEvent<HTMLMediaElement>) => setRate(event.currentTarget.playbackRate),
    onError: () => { setPlaying(false); setError('The configured media could not be loaded.'); }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null; if (target?.matches('input,select,textarea,button') || !source) return;
      if (event.code === 'Space') { event.preventDefault(); void togglePlay(); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); skip(-10); }
      if (event.key === 'ArrowRight') { event.preventDefault(); skip(10); }
      if (event.key.toLowerCase() === 'm') { event.preventDefault(); toggleMute(); }
      if (event.key.toLowerCase() === 'f') { event.preventDefault(); fullscreen(); }
    };
    window.addEventListener('keydown', onKeyDown); return () => window.removeEventListener('keydown', onKeyDown);
  });

  const heroItem = selected || broadcasts[0], selectedPoster = heroItem?.posterUrl?.trim() || '';
  const featured = broadcasts.slice(0, 4);
  const latestAudio = broadcasts.filter(item => { const media = detectMedia(item); return media?.provider !== 'direct-video'; }).slice(0, 4);
  const schedule = useMemo(() => {
    const nowDate = new Date();
    const startToday = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate());
    const startTomorrow = new Date(startToday);
    startTomorrow.setDate(startTomorrow.getDate() + 1);
    const startWeek = new Date(startToday);
    startWeek.setDate(startWeek.getDate() - startWeek.getDay());
    const endWeek = new Date(startWeek);
    endWeek.setDate(endWeek.getDate() + 7);

    return broadcasts
      .map(item => ({ item, date: item.broadcastTime ? new Date(item.broadcastTime) : null }))
      .filter(entry => {
        if (!entry.date || Number.isNaN(entry.date.getTime())) return false;
        if (scheduleRange === 'today') {
          return entry.date >= startToday && entry.date < startTomorrow;
        }
        if (scheduleRange === 'tomorrow') {
          const endTomorrow = new Date(startTomorrow);
          endTomorrow.setDate(endTomorrow.getDate() + 1);
          return entry.date >= startTomorrow && entry.date < endTomorrow;
        }
        return entry.date >= startWeek && entry.date < endWeek;
      })
      .sort((a, b) => a.date!.getTime() - b.date!.getTime())
      .map(entry => entry.item)
      .slice(0, 10);
  }, [broadcasts, scheduleRange]);
  const categories = Array.from(new Set(broadcasts.map(item => item.series?.trim()).filter(Boolean))) as string[];
  const live = broadcasts.filter(item => detectMedia(item)?.live);

  if (!broadcasts.length) return <div className="vop-audience-radio"><header className="vop-public-radio-top"><button type="button" onClick={onBack}><ArrowLeft size={19}/> Back</button></header><main className="vop-public-radio-empty"><Radio size={48}/><h1>Radio</h1><p>No published radio programmes are currently available.</p></main></div>;

  return (
    <div className="vop-audience-radio">
      <section className="vop-radio-hero" style={selectedPoster ? { backgroundImage: 'linear-gradient(90deg, rgba(2,20,45,.96) 0%, rgba(2,20,45,.75) 42%, rgba(2,20,45,.35) 100%), url("' + selectedPoster + '")' } : undefined}>
        <div className="vop-radio-hero-inner">
          <div className="vop-radio-hero-copy">
            <button type="button" className="vop-radio-hero-back" onClick={onBack}><ArrowLeft size={17}/> Radio</button>
            <div className="vop-radio-kicker">Voice of Prophecy</div>
            <h1>{heroItem?.title || 'Radio'}</h1>
            <div className="vop-radio-tagline">{heroItem?.series || 'Inspire · Equip · Transform'}</div>
            <p>{heroItem?.description || 'Bible truth, practical life teaching and messages of hope for everyone, everywhere.'}</p>
            <div className="vop-radio-hero-actions">
              <button type="button" className="vop-radio-listen" onClick={() => void togglePlay()}><Play size={17} fill="currentColor"/> {playing ? 'Pause' : 'Listen Live'}</button>
              <a className="vop-radio-watch" href={source?.url || '#'} target="_blank" rel="noreferrer"><Video size={17}/> Watch / Open</a>
            </div>
          </div>
          <div className="vop-radio-live-card">
            <div className="vop-radio-live-head"><span><i/> {source?.live ? 'LIVE ON VOP RADIO' : sourceLabel(source)}</span><small>{live.length ? live.length + ' live source' + (live.length === 1 ? '' : 's') : localTime(now)}</small></div>
            <div className="vop-radio-provider-stage">
              {source?.provider === 'youtube' && <div ref={ytMountRef} className="vop-radio-youtube-stage"/>}
              {source?.provider === 'audioverse' && <iframe className="vop-radio-audioverse-stage" src={source.embedUrl} title={heroItem?.title || 'AudioVerse'} allow="autoplay; encrypted-media; picture-in-picture" />}
              {source?.provider === 'direct-video' && <video ref={videoRef} src={source.url} poster={selectedPoster || undefined} playsInline preload="metadata" {...mediaEvents}/>}
              {source?.provider === 'direct-audio' && <audio ref={audioRef} src={source.url} preload="metadata" {...mediaEvents} />}
              {!source && <div className="vop-radio-provider-empty"><Radio size={26}/>No playable source configured.</div>}
            </div>
            <div className="vop-radio-live-body">
              <div className="vop-radio-cover" style={selectedPoster ? {backgroundImage: 'url("' + selectedPoster + '" )'} : undefined}><Radio size={28}/></div>
              <div><strong>{heroItem?.title}</strong><span>{heroItem?.speaker || 'Voice of Prophecy'}</span><span>{heroItem?.broadcastTime ? dateTime(heroItem.broadcastTime) : localTime(now)}</span></div>
            </div>
            <div className="vop-radio-wave">{Array.from({length:24},(_,i)=><b key={i} style={{height: (12 + ((i*17)%30)) + 'px'}}/>)}</div>
            {source?.provider === 'audioverse' ? <div className="vop-radio-provider-note">AudioVerse controls are provided by the embedded player.</div> : <div className="vop-radio-mini-controls"><button type="button" onClick={toggleMute}><Volume2 size={17}/></button><input type="range" min="0" max="1" step=".01" value={volume} onChange={e=>setPlayerVolume(Number(e.target.value))}/><button type="button" className="vop-radio-mini-play" onClick={() => void togglePlay()}>{playing?<Pause size={17}/>:<Play size={17} fill="currentColor"/>}</button><button type="button" onClick={fullscreen}><Maximize2 size={16}/></button></div>}
          </div>
        </div>
      </section>

      <section className="vop-radio-feature-strip">
        <div><span><Radio size={24}/></span><div><strong>Radio</strong><small>Live & On-Demand</small></div></div>
        <div><span><Video size={24}/></span><div><strong>Videos</strong><small>Sermons, Bible Studies & More</small></div></div>
        <div><span><BookOpen size={24}/></span><div><strong>Bible Study Materials</strong><small>Guides, PDFs, eBooks</small></div></div>
        <div><span><Headphones size={24}/></span><div><strong>Listen Anywhere</strong><small>Web, Mobile, YouTube, AudioVerse</small></div></div>
        <div><span><Globe2 size={24}/></span><div><strong>Multiple Languages</strong><small>Reaching Everyone</small></div></div>
      </section>

      <main className="vop-radio-audience-main">
        <section className="vop-radio-section-grid">
          <div className="vop-radio-schedule-card">
            <div className="vop-radio-section-head"><h2><CalendarDays size={19}/> Program Schedule</h2><button type="button">View Full Schedule <ChevronRight size={15}/></button></div>
            <div className="vop-radio-schedule-tabs">
              {(['today', 'tomorrow', 'week'] as const).map(range => (
                <button key={range} className={scheduleRange === range ? 'active' : ''} type="button" onClick={() => setScheduleRange(range)}>
                  {range === 'today' ? 'Today' : range === 'tomorrow' ? 'Tomorrow' : 'This Week'}
                </button>
              ))}
            </div>
            <div className="vop-radio-schedule-list">
              {schedule.map(item=><button type="button" key={item.id} className={selected?.id===item.id?'active':''} onClick={()=>selectProgramme(item)}><time>{item.broadcastTime ? localTime(new Date(item.broadcastTime)) : '—'}</time><strong>{item.title}</strong><span>{item.speaker || item.series || sourceLabel(detectMedia(item))}</span>{detectMedia(item)?.live && <em>LIVE</em>}</button>)}
              {!schedule.length && <div className="vop-radio-muted">No scheduled programmes configured.</div>}
            </div>
          </div>
          <div className="vop-radio-featured-card">
            <div className="vop-radio-section-head"><h2><Radio size={19}/> Featured Programs</h2><span>{broadcasts.length} available</span></div>
            <div className="vop-radio-featured-grid">
              {featured.map(item=>{const itemSource=detectMedia(item);return <button key={item.id} type="button" onClick={()=>selectProgramme(item)}><div className="vop-radio-feature-image" style={item.posterUrl?{backgroundImage:'url("' + item.posterUrl + '")'}:undefined}><span>{itemSource?.provider==='audioverse'?<Headphones/>:itemSource?.provider==='youtube'||itemSource?.provider==='direct-video'?<Video/>:<Play fill="currentColor"/>}</span><small>{item.durationMinutes?formatTime(item.durationMinutes*60):sourceLabel(itemSource)}</small></div><strong>{item.title}</strong><span>{item.speaker||item.series||'Voice of Prophecy'}</span><small>{dateTime(item.createdAt||item.updatedAt)}</small></button>;})}
            </div>
          </div>
        </section>

        {categories.length>0 && <section className="vop-radio-audience-block"><div className="vop-radio-section-head"><h2><ListMusic size={19}/> Browse by Category</h2><span>{categories.length} configured</span></div><div className="vop-radio-category-grid">{categories.slice(0,6).map(category=><button key={category} type="button" onClick={()=>setSelected(broadcasts.find(item=>item.series===category)||selected)}><span><BookOpen size={25}/></span><strong>{category}</strong><small>{broadcasts.filter(item=>item.series===category).length} programme{broadcasts.filter(item=>item.series===category).length===1?'':'s'}</small></button>)}</div></section>}

        <section className="vop-radio-audience-block"><div className="vop-radio-section-head"><h2><Headphones size={19}/> Latest Audio</h2><span>{latestAudio.length} shown</span></div><div className="vop-radio-latest-list">{latestAudio.map(item=><button key={item.id} type="button" onClick={()=>selectProgramme(item)}><div className="vop-radio-latest-cover" style={item.posterUrl?{backgroundImage:'url("' + item.posterUrl + '")'}:undefined}><Play size={17} fill="currentColor"/></div><div><strong>{item.title}</strong><small>{item.speaker||item.series||'Voice of Prophecy'}</small><span>{item.durationMinutes?formatTime(item.durationMinutes*60):sourceLabel(detectMedia(item))}</span></div><Play className="latest-play" size={18} fill="currentColor"/></button>)}</div></section>
      </main>

      <section className="vop-radio-docked-player">
        <div className="vop-radio-docked-meta"><div className="vop-radio-docked-cover" style={selectedPoster?{backgroundImage:'url("' + selectedPoster + '")'}:undefined}><Radio size={18}/></div><div><strong>{selected?.title}</strong><small>{selected?.speaker||selected?.series||'Voice of Prophecy'}</small></div>{source?.live&&<em>LIVE</em>}</div>
        <div className="vop-radio-docked-center"><button type="button" onClick={()=>skip(-10)} disabled={!duration}><SkipBack size={17}/></button><button className="main" type="button" onClick={()=>void togglePlay()} disabled={!source||(source.provider==='youtube'&&!ytReady)||(source.provider==='audioverse')}>{playing?<Pause size={19}/>:<Play size={19} fill="currentColor"/>}</button><button type="button" onClick={()=>skip(10)} disabled={!duration}><SkipForward size={17}/></button></div>
        <div className="vop-radio-docked-progress"><span>{formatTime(current)}</span><input type="range" min="0" max={duration||0} step=".1" value={Math.min(current,duration||0)} onChange={e=>seek(Number(e.target.value))} disabled={!duration}/><span>{duration?formatTime(duration):source?.live?'LIVE':'—'}</span></div>
        <div className="vop-radio-docked-actions">{source?.provider!=='audioverse'&&<><button type="button" onClick={toggleMute}><Volume2 size={17}/></button><input type="range" min="0" max="1" step=".01" value={volume} onChange={e=>setPlayerVolume(Number(e.target.value))}/></>}{source?.provider !== 'audioverse' && <label><Gauge size={15}/><select value={rate} onChange={e=>changeRate(Number(e.target.value))}>{[.5,.75,1,1.25,1.5,1.75,2].map(v=><option key={v} value={v}>{v}×</option>)}</select></label>}{(source?.provider==='direct-video'||source?.provider==='youtube')&&<button type="button" onClick={fullscreen}><Maximize2 size={17}/></button>}<a href={source?.url||'#'} target="_blank" rel="noreferrer"><ExternalLink size={17}/></a></div>
      </section>
      {error&&<div className="vop-radio-player-error">{error}</div>}
      {waiting&&<div className="vop-radio-player-waiting"><Clock3 size={15}/> Buffering media…</div>}
    </div>
  );
};

export default RadioPage;
