
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { RadioBroadcast, RadioPlaylist } from '../types';
import { getTranslation, getUiLocale } from '../services/i18n';
import { getActiveLanguage, getStoredSettings } from '../services/storage';
import { isSafeHttpsMediaUrl, resolveMediaSource } from '../../shared/mediaSources';
import {
  ArrowLeft, Radio, Play, Pause, Volume2, Maximize2, ExternalLink,
  SkipBack, SkipForward, Gauge, BookOpen, Globe2, CalendarDays,
  ChevronRight, ListMusic, Clock3, Video, Headphones, Search, SlidersHorizontal
} from 'lucide-react';

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
function localTime(date: Date, timeZone?: string) {
  try { return new Intl.DateTimeFormat(undefined, { hour:'2-digit', minute:'2-digit', ...(timeZone ? {timeZone} : {}) }).format(date); }
  catch { return new Intl.DateTimeFormat(undefined, { hour:'2-digit', minute:'2-digit' }).format(date); }
}
function dateTime(value?: string, timeZone?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  try { return new Intl.DateTimeFormat(undefined, { dateStyle:'medium', timeStyle:'short', ...(timeZone ? {timeZone} : {}) }).format(date); }
  catch { return new Intl.DateTimeFormat(undefined, { dateStyle:'medium', timeStyle:'short' }).format(date); }
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
  const [viewMode,setViewMode]=useState<'browse'|'watch'>('browse');
  const [search,setSearch]=useState('');
  const [browseFilter,setBrowseFilter]=useState('all');
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
        playerVars: { autoplay: 0, controls: 1, rel: 0, playsinline: 1, enablejsapi: 1 },
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
    return () => { cancelled = true; ytPlayerRef.current?.destroy(); ytPlayerRef.current = null; };
  }, [source?.provider, youtubeVideoId, viewMode]);

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
  const selectProgramme = (item: RadioBroadcast) => { setSelected(item); setViewMode('watch'); };
  const selectPlaylist = (playlist: RadioPlaylist) => {
    const items = playlist.itemIds.map(id => broadcasts.find(item => item.id === id)).filter((item): item is RadioBroadcast => Boolean(item && detectMedia(item)));
    if (!items.length) return;
    setSelectedPlaylistId(playlist.id);
    selectProgramme(items[0]);
  };
  const playPlaylistItem = (item: RadioBroadcast) => { setSelectedPlaylistId(selectedPlaylist?.id || ''); selectProgramme(item); };
  const nextPlaylistItem = () => { if (playlistIndex >= 0 && playlistIndex < playlistItems.length - 1) selectProgramme(playlistItems[playlistIndex + 1]); };
  const previousPlaylistItem = () => { if (playlistIndex > 0) selectProgramme(playlistItems[playlistIndex - 1]); };
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
  const advancePlaylist = () => {
    if (playlistIndex >= 0 && playlistIndex < playlistItems.length - 1) {
      selectProgramme(playlistItems[playlistIndex + 1]);
      return true;
    }
    return false;
  };
  const mediaEvents = {
    onTimeUpdate: (event: React.SyntheticEvent<HTMLMediaElement>) => setCurrent(event.currentTarget.currentTime || 0),
    onLoadedMetadata: (event: React.SyntheticEvent<HTMLMediaElement>) => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0),
    onDurationChange: (event: React.SyntheticEvent<HTMLMediaElement>) => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0),
    onPlay: () => { setPlaying(true); setWaiting(false); }, onPlaying: () => setWaiting(false), onPause: () => setPlaying(false),
    onWaiting: () => setWaiting(true), onCanPlay: () => setWaiting(false), onEnded: () => { if (!advancePlaylist()) setPlaying(false); },
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
  const categories = Array.from(new Set(broadcasts.map(item => item.series?.trim()).filter(Boolean))) as string[];
  const filteredBroadcasts = useMemo(()=>{
    const q=search.trim().toLowerCase();
    return broadcasts.filter(item=>{
      const media=detectMedia(item);
      const matchesSearch=!q||[item.title,item.speaker,item.series,item.description,sourceLabel(media)].join(' ').toLowerCase().includes(q);
      const matchesFilter=browseFilter==='all'
        ||(browseFilter==='live'&&Boolean(media?.live))
        ||(browseFilter==='video'&&(media?.provider==='youtube'||media?.provider==='direct-video'))
        ||(browseFilter==='audio'&&(media?.provider==='direct-audio'||media?.provider==='audioverse'))
        ||item.series===browseFilter;
      return matchesSearch&&matchesFilter;
    });
  },[broadcasts,search,browseFilter]);
  const featured = filteredBroadcasts.slice(0, 4);
  const latestAudio = filteredBroadcasts.filter(item => { const media = detectMedia(item); return media?.provider !== 'direct-video' && media?.provider !== 'youtube'; }).slice(0, 6);
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
  const publishedPlaylists = playlists.filter(item => item.published === true && item.itemIds.length).slice(0, 8);
  const selectedPlaylist = publishedPlaylists.find(item => item.id === selectedPlaylistId) || null;
  const playlistItems = selectedPlaylist
    ? selectedPlaylist.itemIds.map(id => broadcasts.find(item => item.id === id)).filter((item): item is RadioBroadcast => Boolean(item && detectMedia(item)))
    : [];
  const playlistIndex = selected?.id ? playlistItems.findIndex(item => item.id === selected.id) : -1;
  const live = broadcasts.filter(item => detectMedia(item)?.live);
  useEffect(() => { playlistIndexRef.current = playlistIndex; playlistItemsRef.current = playlistItems; }, [playlistIndex, playlistItems]);

  if (!broadcasts.length) {
    return (
      <div className="vop-audience-radio">
        <header className="vop-public-radio-top">
          <button type="button" onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', border: '1px solid rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.12)', color: '#ffffff', borderRadius: '10px', padding: '8px 16px', fontWeight: 800, fontSize: '14px', cursor: 'pointer' }}>
            <ArrowLeft size={18}/> {t('common.back','Back')}
          </button>
        </header>
        <main className="vop-public-radio-empty">
          <Radio size={48}/>
          <h1>{t('navigation.radio','Radio')}</h1>
          <p>{t('radio.empty','No published radio programmes are currently available.')}</p>
        </main>
      </div>
    );
  }

  return (
    <div className="vop-audience-radio vop-yt-radio">
      <header className="vop-yt-topbar">
        <div className="vop-yt-brand">
          <button type="button" className="vop-yt-icon-button" onClick={onBack} aria-label={t('common.back','Back')}><ArrowLeft size={20}/></button>
          <button type="button" className="vop-yt-logo" onClick={()=>setViewMode('browse')} aria-label="VOP Media home">
            <img src="/assets/vop_logo_2.png" alt=""/>
            <span>VOP <b>Media</b></span>
          </button>
        </div>
        <label className="vop-yt-search">
          <input value={search} onChange={e=>{setSearch(e.target.value);setViewMode('browse')}} placeholder="Search VOP Radio & Media" aria-label="Search VOP Radio and Media"/>
          <span><Search size={20}/></span>
        </label>
        <div className="vop-yt-top-actions">
          {live.length>0&&<button type="button" className="vop-yt-live-pill" onClick={()=>{setBrowseFilter('live');setViewMode('browse')}}><i/> Live</button>}
          <button type="button" className="vop-yt-icon-button" onClick={()=>setViewMode('browse')} title="Browse media"><Radio size={20}/></button>
        </div>
      </header>

      <div className="vop-yt-chipbar" aria-label="Media filters">
        {[
          ['all','All'],['live','Live'],['video','Videos'],['audio','Audio'],
          ...categories.slice(0,10).map(category=>[category,category]),
        ].map(([value,label])=><button type="button" key={value} className={browseFilter===value?'active':''} aria-pressed={browseFilter===value} onClick={()=>{setBrowseFilter(value);setViewMode('browse')}}>{label}</button>)}
      </div>

      {viewMode==='browse' ? <main className="vop-yt-feed">
        <div className="vop-yt-feed-heading">
          <div><h1>VOP Radio & Media</h1><p>Messages of hope, Bible teaching, live radio, video and audio from Voice of Prophecy.</p></div>
          <span>{filteredBroadcasts.length} programme{filteredBroadcasts.length===1?'':'s'}</span>
        </div>

        <section className="vop-yt-grid" aria-label="VOP programmes">
          {filteredBroadcasts.map(item=>{
            const itemSource=detectMedia(item);
            return <button type="button" className="vop-yt-card" key={item.id} onClick={()=>selectProgramme(item)}>
              <div className="vop-yt-thumb" style={item.posterUrl?{backgroundImage:'url("' + item.posterUrl + '")'}:undefined}>
                {!item.posterUrl&&<span className="vop-yt-thumb-fallback"><Radio size={42}/></span>}
                {itemSource?.live?<span className="vop-yt-badge live">LIVE</span>:item.durationMinutes?<span className="vop-yt-badge duration">{formatTime(item.durationMinutes*60)}</span>:<span className="vop-yt-badge duration">{sourceLabel(itemSource)}</span>}
              </div>
              <div className="vop-yt-card-meta">
                <span className="vop-yt-channel-avatar"><img src="/assets/vop_logo_2.png" alt=""/></span>
                <div><strong>{item.title}</strong><span>{item.speaker||'Voice of Prophecy'}</span><small>{item.series||sourceLabel(itemSource)}{item.broadcastTime?' · '+dateTime(item.broadcastTime,settings.timezone):''}</small></div>
              </div>
            </button>;
          })}
          {!filteredBroadcasts.length&&<div className="vop-yt-empty"><Search size={34}/><h2>No programmes found</h2><p>Try another search or category.</p></div>}
        </section>

        {publishedPlaylists.length>0&&<section className="vop-yt-shelf">
          <div className="vop-yt-shelf-head"><div><h2>Playlists</h2><p>Curated VOP collections</p></div><ListMusic size={22}/></div>
          <div className="vop-yt-playlist-grid">{publishedPlaylists.map(playlist=><button type="button" key={playlist.id} onClick={()=>selectPlaylist(playlist)}>
            <div className="vop-yt-playlist-thumb" style={playlist.coverUrl?{backgroundImage:'url("' + playlist.coverUrl + '")'}:undefined}><span><ListMusic size={28}/>{playlist.itemIds.length} videos</span></div>
            <strong>{playlist.name}</strong><small>{playlist.description||'Voice of Prophecy playlist'}</small>
          </button>)}</div>
        </section>}

        {schedule.length>0&&<section className="vop-yt-shelf">
          <div className="vop-yt-shelf-head"><div><h2>Programme schedule</h2><p>Upcoming broadcasts in your configured timezone</p></div><div className="vop-yt-schedule-tabs">{(['today','tomorrow','week'] as const).map(range=><button key={range} className={scheduleRange===range?'active':''} onClick={()=>setScheduleRange(range)}>{range==='today'?'Today':range==='tomorrow'?'Tomorrow':'This week'}</button>)}</div></div>
          <div className="vop-yt-schedule-strip">{schedule.map(item=><button type="button" key={item.id} onClick={()=>selectProgramme(item)}><time>{item.broadcastTime?localTime(new Date(item.broadcastTime),settings.timezone):'—'}</time><div><strong>{item.title}</strong><span>{item.speaker||item.series||sourceLabel(detectMedia(item))}</span></div>{detectMedia(item)?.live&&<em>LIVE</em>}</button>)}</div>
        </section>}
      </main> : <main className="vop-yt-watch-page">
        <section className="vop-yt-watch-main">
          <div className="vop-yt-player">
            {source?.provider === 'youtube' && <div ref={ytMountRef} className="vop-yt-youtube-stage"/>}
            {source?.provider === 'audioverse' && <iframe src={source.embedUrl} title={selected?.title||'AudioVerse'} sandbox="allow-scripts allow-same-origin allow-presentation allow-popups" allow="autoplay; encrypted-media; picture-in-picture" />}
            {source?.provider === 'embed' && <iframe src={source.embedUrl} title={selected?.title||source.label} sandbox="allow-scripts allow-same-origin allow-presentation allow-popups" referrerPolicy="strict-origin-when-cross-origin" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen />}
            {source?.provider === 'direct-video' && <video ref={videoRef} src={source.url} poster={selectedPoster||undefined} playsInline preload="metadata" controls {...mediaEvents}/>}
            {source?.provider === 'direct-audio' && <div className="vop-yt-audio-stage" style={selectedPoster?{backgroundImage:'linear-gradient(rgba(0,0,0,.28),rgba(0,0,0,.58)),url("' + selectedPoster + '")'}:undefined}><audio ref={audioRef} src={source.url} preload="metadata" {...mediaEvents}/><button type="button" onClick={()=>void togglePlay()}>{playing?<Pause size={36}/>:<Play size={36} fill="currentColor"/>}</button><span>{source.live?'LIVE RADIO':'AUDIO PROGRAMME'}</span></div>}
            {!source&&<div className="vop-yt-player-empty"><Radio size={46}/><span>No playable source configured.</span></div>}
          </div>

          <h1 className="vop-yt-watch-title">{selected?.title||'VOP Media'}</h1>
          <div className="vop-yt-watch-meta">
            <div className="vop-yt-channel-row"><span className="vop-yt-channel-avatar large"><img src="/assets/vop_logo_2.png" alt=""/></span><div><strong>{selected?.speaker||'Voice of Prophecy'}</strong><span>{selected?.series||sourceLabel(source)}</span></div>{source?.live&&<em>LIVE</em>}</div>
            <div className="vop-yt-watch-actions">
              {source?.provider!=='audioverse'&&source?.provider!=='embed'&&<button type="button" onClick={()=>void togglePlay()}>{playing?<Pause size={18}/>:<Play size={18} fill="currentColor"/>}{playing?'Pause':'Play'}</button>}
              <a href={source?.url||'#'} target="_blank" rel="noreferrer"><ExternalLink size={17}/> Open source</a>
            </div>
          </div>

          {source?.provider==='direct-audio'&&<div className="vop-yt-custom-controls">
            <button type="button" onClick={()=>skip(-10)} disabled={!duration}><SkipBack size={17}/></button>
            <button type="button" onClick={()=>void togglePlay()} disabled={!source}>{playing?<Pause size={18}/>:<Play size={18} fill="currentColor"/>}</button>
            <button type="button" onClick={()=>skip(10)} disabled={!duration}><SkipForward size={17}/></button>
            <span>{formatTime(current)}</span><input className="progress" type="range" min="0" max={duration||0} step=".1" value={Math.min(current,duration||0)} onChange={e=>seek(Number(e.target.value))} disabled={!duration}/><span>{duration?formatTime(duration):source?.live?'LIVE':'—'}</span>
            <button type="button" onClick={toggleMute}><Volume2 size={17}/></button><input className="volume" type="range" min="0" max="1" step=".01" value={volume} onChange={e=>setPlayerVolume(Number(e.target.value))}/>
            <label><Gauge size={15}/><select value={rate} onChange={e=>changeRate(Number(e.target.value))}>{[.5,.75,1,1.25,1.5,1.75,2].map(v=><option key={v} value={v}>{v}×</option>)}</select></label>
          </div>}

          <div className="vop-yt-description">
            <strong>{selected?.broadcastTime?dateTime(selected.broadcastTime,settings.timezone):sourceLabel(source)}</strong>
            <p>{selected?.description||'Voice of Prophecy Bible teaching and media ministry.'}</p>
          </div>

          {selectedPlaylist&&<section className="vop-yt-watch-playlist">
            <div><h2>{selectedPlaylist.name}</h2><span>{Math.max(playlistIndex+1,1)} / {playlistItems.length}</span></div>
            {playlistItems.map((item,index)=><button type="button" key={item.id} className={selected?.id===item.id?'active':''} onClick={()=>playPlaylistItem(item)}><span>{index+1}</span><strong>{item.title}</strong>{selected?.id===item.id&&playing&&<em>PLAYING</em>}</button>)}
          </section>}
        </section>

        <aside className="vop-yt-upnext">
          <div className="vop-yt-upnext-head"><strong>Up next</strong><button type="button" onClick={()=>setViewMode('browse')}>See all</button></div>
          {broadcasts.filter(item=>item.id!==selected?.id).slice(0,14).map(item=>{
            const itemSource=detectMedia(item);
            return <button type="button" className="vop-yt-upnext-card" key={item.id} onClick={()=>selectProgramme(item)}>
              <div className="thumb" style={item.posterUrl?{backgroundImage:'url("' + item.posterUrl + '")'}:undefined}>{!item.posterUrl&&<Radio size={24}/>}<span>{itemSource?.live?'LIVE':item.durationMinutes?formatTime(item.durationMinutes*60):sourceLabel(itemSource)}</span></div>
              <div><strong>{item.title}</strong><span>{item.speaker||'Voice of Prophecy'}</span><small>{item.series||sourceLabel(itemSource)}</small></div>
            </button>;
          })}
        </aside>
      </main>}

      {error&&<div className="vop-radio-player-error">{error}</div>}
      {waiting&&<div className="vop-radio-player-waiting"><Clock3 size={15}/> Buffering media…</div>}
    </div>
  );
};

export default RadioPage;
