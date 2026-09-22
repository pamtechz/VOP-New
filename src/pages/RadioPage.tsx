import React, { useEffect, useMemo, useRef, useState } from 'react';
import { RadioBroadcast } from '../types';
import {
  ArrowLeft, Radio, Play, Pause, Volume2, VolumeX, Maximize,
  ExternalLink, SkipBack, SkipForward, Gauge, PictureInPicture2
} from 'lucide-react';

interface RadioPageProps {
  broadcasts: RadioBroadcast[];
  onBack: () => void;
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hours > 0) return `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function formatSystemDateTime(value?: string) {
  if (!value) return 'Time detected automatically';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Time detected automatically';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatLocalClock(date: Date) {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function mediaSource(item: RadioBroadcast) {
  const video = item.videoUrl?.trim();
  const audio = item.audioUrl?.trim();
  const stream = item.streamUrl?.trim();
  if (item.mediaType === 'video' && video) return { type: 'video' as const, url: video, live: false };
  if (item.mediaType === 'audio' && audio) return { type: 'audio' as const, url: audio, live: false };
  if (video) return { type: 'video' as const, url: video, live: false };
  if (audio) return { type: 'audio' as const, url: audio, live: false };
  if (stream) return { type: 'audio' as const, url: stream, live: true };
  return null;
}

export const RadioPage: React.FC<RadioPageProps> = ({ broadcasts, onBack }) => {
  const [currentPlaying, setCurrentPlaying] = useState<RadioBroadcast | null>(broadcasts[0] || null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolumeState] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [mediaError, setMediaError] = useState('');
  const [isWaiting, setIsWaiting] = useState(false);
  const [systemNow, setSystemNow] = useState(() => new Date());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const selectedSource = useMemo(
    () => currentPlaying ? mediaSource(currentPlaying) : null,
    [currentPlaying]
  );

  useEffect(() => {
    const timer = window.setInterval(() => setSystemNow(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!broadcasts.length) {
      setCurrentPlaying(null);
      return;
    }
    if (!currentPlaying || !broadcasts.some(item => item.id === currentPlaying.id)) {
      setCurrentPlaying(broadcasts[0]);
    }
  }, [broadcasts, currentPlaying]);

  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setBuffered(0);
    setMediaError('');
    setIsWaiting(false);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.load();
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.load();
    }
  }, [currentPlaying?.id]);

  useEffect(() => {
    const media = selectedSource?.type === 'video' ? videoRef.current : audioRef.current;
    if (!media) return;
    media.volume = volume;
    media.muted = muted;
    media.playbackRate = playbackRate;
  }, [selectedSource?.type, selectedSource?.url, volume, muted, playbackRate]);

  const activeMedia = () => {
    if (selectedSource?.type === 'video') return videoRef.current;
    if (selectedSource?.type === 'audio') return audioRef.current;
    return null;
  };

  const syncMediaState = () => {
    const media = activeMedia();
    if (!media) return;
    setCurrentTime(media.currentTime || 0);
    setDuration(Number.isFinite(media.duration) ? media.duration : 0);
    if (media.buffered.length) {
      try {
        setBuffered(media.buffered.end(media.buffered.length - 1));
      } catch {
        setBuffered(0);
      }
    }
  };

  const playSelected = async () => {
    const media = activeMedia();
    if (!media || !selectedSource) {
      setMediaError('No playable media source has been configured for this programme.');
      setIsPlaying(false);
      return;
    }
    setMediaError('');
    try {
      await media.play();
      setIsPlaying(true);
    } catch (error) {
      console.error('VOP media playback failed', error);
      setIsPlaying(false);
      setMediaError('The configured media could not be played. Check the media URL, format and browser permissions.');
    }
  };

  const selectProgramme = (item: RadioBroadcast) => {
    if (currentPlaying?.id === item.id) {
      if (isPlaying) {
        activeMedia()?.pause();
        setIsPlaying(false);
      } else {
        void playSelected();
      }
      return;
    }
    setCurrentPlaying(item);
  };

  const seek = (value: number) => {
    const media = activeMedia();
    if (!media || !Number.isFinite(media.duration)) return;
    media.currentTime = Math.max(0, Math.min(value, media.duration));
    setCurrentTime(media.currentTime);
  };

  const skip = (seconds: number) => {
    const media = activeMedia();
    if (!media || !Number.isFinite(media.duration)) return;
    seek(media.currentTime + seconds);
  };

  const setVolume = (value: number) => {
    const next = Math.max(0, Math.min(1, value));
    setVolumeState(next);
    setMuted(next === 0);
    const media = activeMedia();
    if (media) {
      media.volume = next;
      media.muted = next === 0;
    }
  };

  const toggleMute = () => {
    const media = activeMedia();
    if (!media) return;
    const next = !media.muted;
    media.muted = next;
    setMuted(next);
  };

  const changeRate = (value: number) => {
    setPlaybackRate(value);
    const media = activeMedia();
    if (media) media.playbackRate = value;
  };

  const enterFullscreen = () => {
    if (videoRef.current) void videoRef.current.requestFullscreen?.();
  };

  const pictureInPicture = async () => {
    const video = videoRef.current as (HTMLVideoElement & {
      requestPictureInPicture?: () => Promise<unknown>;
    }) | null;
    if (video?.requestPictureInPicture) {
      try {
        await video.requestPictureInPicture();
      } catch {
        setMediaError('Picture-in-picture is not available in this browser or for this video.');
      }
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' || target?.tagName === 'SELECT' || target?.tagName === 'TEXTAREA') return;
      if (!currentPlaying || !selectedSource) return;
      if (event.code === 'Space') {
        event.preventDefault();
        if (isPlaying) {
          activeMedia()?.pause();
          setIsPlaying(false);
        } else {
          void playSelected();
        }
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        skip(-10);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        skip(10);
      } else if (event.key.toLowerCase() === 'm') {
        event.preventDefault();
        toggleMute();
      } else if (event.key.toLowerCase() === 'f' && selectedSource.type === 'video') {
        event.preventDefault();
        enterFullscreen();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const timestamp = currentPlaying?.broadcastTime || currentPlaying?.createdAt || currentPlaying?.updatedAt;

  return (
    <div className="vop-radio-page">
      <div className="vop-radio-header">
        <div className="vop-radio-header-inner">
          <div className="vop-radio-header-top">
            <button onClick={onBack} className="vop-radio-back" type="button">
              <ArrowLeft size={20} />
              <span>Radio Ministry</span>
            </button>
            <span className="vop-radio-clock">Local time · {formatLocalClock(systemNow)}</span>
            <span className="vop-radio-badge"><Radio size={13}/> Audio & Video Broadcasts</span>
          </div>
          <h1>Voice of Prophecy Radio Ministry</h1>
          <p>Listen to published programmes and watch available video broadcasts.</p>
        </div>
      </div>

      <main className="vop-radio-main">
        {currentPlaying && (
          <section className="vop-radio-player-card" aria-label="Radio media player">
            <div className="vop-radio-media-stage">
              {selectedSource?.type === 'video' ? (
                <video
                  ref={videoRef}
                  src={selectedSource.url}
                  poster={currentPlaying.posterUrl?.trim() || undefined}
                  preload="metadata"
                  playsInline
                  onTimeUpdate={syncMediaState}
                  onProgress={syncMediaState}
                  onLoadedMetadata={syncMediaState}
                  onDurationChange={syncMediaState}
                  onPlay={() => { setIsPlaying(true); setIsWaiting(false); }}
                  onPlaying={() => setIsWaiting(false)}
                  onPause={() => setIsPlaying(false)}
                  onWaiting={() => setIsWaiting(true)}
                  onCanPlay={() => setIsWaiting(false)}
                  onEnded={() => setIsPlaying(false)}
                  onVolumeChange={() => {
                    setMuted(Boolean(videoRef.current?.muted));
                    setVolumeState(videoRef.current?.volume ?? 1);
                  }}
                  onRateChange={() => setPlaybackRate(videoRef.current?.playbackRate ?? 1)}
                  onError={() => { setIsPlaying(false); setMediaError('The configured video could not be loaded.'); }}
                  aria-label={currentPlaying.title}
                />
              ) : selectedSource ? (
                <>
                  <div className="vop-radio-audio-visual">
                    <Radio size={52}/>
                    <span>{currentPlaying.title}</span>
                    <small>{selectedSource.live ? 'Live audio stream' : 'Audio broadcast'}</small>
                  </div>
                  <audio
                    ref={audioRef}
                    src={selectedSource.url}
                    preload="metadata"
                    onTimeUpdate={syncMediaState}
                    onProgress={syncMediaState}
                    onLoadedMetadata={syncMediaState}
                    onDurationChange={syncMediaState}
                    onPlay={() => { setIsPlaying(true); setIsWaiting(false); }}
                    onPlaying={() => setIsWaiting(false)}
                    onPause={() => setIsPlaying(false)}
                    onWaiting={() => setIsWaiting(true)}
                    onCanPlay={() => setIsWaiting(false)}
                    onEnded={() => setIsPlaying(false)}
                    onVolumeChange={() => {
                      setMuted(Boolean(audioRef.current?.muted));
                      setVolumeState(audioRef.current?.volume ?? 1);
                    }}
                    onRateChange={() => setPlaybackRate(audioRef.current?.playbackRate ?? 1)}
                    onError={() => { setIsPlaying(false); setMediaError('The configured audio/stream could not be loaded.'); }}
                    aria-label={currentPlaying.title}
                  />
                </>
              ) : (
                <div className="vop-radio-no-media">No media source configured for this programme.</div>
              )}
              {selectedSource?.type === 'video' && (
                <div className="vop-radio-video-overlay">
                  <button type="button" onClick={() => selectProgramme(currentPlaying)} aria-label={isPlaying ? 'Pause video' : 'Play video'}>
                    {isPlaying ? <Pause size={23}/> : <Play size={23} fill="currentColor"/>}
                  </button>
                </div>
              )}
              {isWaiting && <div className="vop-radio-buffering" aria-live="polite"><span/>Loading media…</div>}
            </div>

            <div className="vop-radio-player-info">
              <div>
                <span className="vop-radio-series">{currentPlaying.series || 'Radio'}</span>
                <h2>{currentPlaying.title}</h2>
                <p>{currentPlaying.speaker || 'Voice of Prophecy'} · {formatSystemDateTime(timestamp)}</p>
              </div>
              {selectedSource?.live && <span className="vop-radio-live"><span/>LIVE</span>}
            </div>

            <div className="vop-radio-controls">
              <button className="vop-radio-control-main" type="button" onClick={() => selectProgramme(currentPlaying)} disabled={!selectedSource} aria-label={isPlaying ? 'Pause' : 'Play'}>
                {isPlaying ? <Pause size={19}/> : <Play size={19} fill="currentColor"/>}
              </button>
              <button className="vop-radio-icon-btn" type="button" onClick={() => skip(-10)} disabled={!selectedSource || !duration} aria-label="Back 10 seconds"><SkipBack size={17}/></button>
              <span className="vop-radio-time">{formatTime(currentTime)}</span>
              <div className="vop-radio-seek-wrap">
                <input className="vop-radio-seek" type="range" min={0} max={duration || 0} step="0.1" value={Math.min(currentTime, duration || 0)} onChange={e => seek(Number(e.target.value))} disabled={!selectedSource || !duration} aria-label="Playback position"/>
                {duration > 0 && <span className="vop-radio-buffered" style={{width: `${Math.min(100, (buffered / duration) * 100)}%`}}/>}
              </div>
              <span className="vop-radio-time">{duration ? formatTime(duration) : selectedSource?.live ? 'LIVE' : '—'}</span>
              <button className="vop-radio-icon-btn" type="button" onClick={() => skip(10)} disabled={!selectedSource || !duration} aria-label="Forward 10 seconds"><SkipForward size={17}/></button>
              <button className="vop-radio-icon-btn" type="button" onClick={toggleMute} disabled={!selectedSource} aria-label={muted ? 'Unmute' : 'Mute'}>
                {muted ? <VolumeX size={18}/> : <Volume2 size={18}/>}
              </button>
              <input className="vop-radio-volume" type="range" min={0} max={1} step="0.01" value={volume} onChange={e => setVolume(Number(e.target.value))} disabled={!selectedSource} aria-label="Volume"/>
              <label className="vop-radio-rate" title="Playback speed">
                <Gauge size={15}/>
                <select value={playbackRate} onChange={e => changeRate(Number(e.target.value))} aria-label="Playback speed">
                  {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map(rate => <option key={rate} value={rate}>{rate}×</option>)}
                </select>
              </label>
              {selectedSource?.type === 'video' && (
                <>
                  <button className="vop-radio-icon-btn" type="button" onClick={() => void pictureInPicture()} aria-label="Picture in picture"><PictureInPicture2 size={17}/></button>
                  <button className="vop-radio-icon-btn" type="button" onClick={enterFullscreen} aria-label="Fullscreen"><Maximize size={18}/></button>
                </>
              )}
            </div>

            {mediaError && <div className="vop-radio-error" role="alert">{mediaError}</div>}
            <div className="vop-radio-help">Keyboard: Space play/pause · ←/→ 10 seconds · M mute · F fullscreen</div>
          </section>
        )}

        <h3 className="vop-radio-list-title">Available Radio Programmes</h3>
        <div className="vop-radio-grid">
          {broadcasts.map(item => {
            const source = mediaSource(item);
            const selected = currentPlaying?.id === item.id;
            return (
              <article className={`vop-radio-program ${selected ? 'selected' : ''}`} key={item.id}>
                <button type="button" className="vop-radio-program-main" onClick={() => setCurrentPlaying(item)}>
                  <div>
                    <span>{item.series || 'Radio'}</span>
                    <h4>{item.title}</h4>
                    <p>{item.speaker || 'Voice of Prophecy'}</p>
                    <small>{item.description}</small>
                  </div>
                  <span className="vop-radio-program-icon">{selected && isPlaying ? <Pause size={16}/> : <Play size={16} fill="currentColor"/>}</span>
                </button>
                <div className="vop-radio-program-footer">
                  <span>{item.durationMinutes ? `${item.durationMinutes} min` : 'Auto duration'}</span>
                  {source?.live && <span>LIVE</span>}
                  {source?.type === 'video' && <span>VIDEO</span>}
                  {source?.type === 'audio' && !source.live && <span>AUDIO</span>}
                  {!source && <span>MEDIA NOT CONFIGURED</span>}
                </div>
                {item.streamUrl?.trim() && <a className="vop-radio-external" href={item.streamUrl} target="_blank" rel="noreferrer"><ExternalLink size={13}/>Open stream</a>}
              </article>
            );
          })}
          {!broadcasts.length && <div className="vop-radio-empty">No published radio programmes are available.</div>}
        </div>
      </main>
    </div>
  );
};
