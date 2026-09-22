import React, { useEffect, useMemo, useRef, useState } from 'react';
import { RadioBroadcast } from '../types';
import { ArrowLeft, Radio, Play, Pause, Volume2, VolumeX, Maximize, ExternalLink } from 'lucide-react';

interface RadioPageProps {
  broadcasts: RadioBroadcast[];
  onBack: () => void;
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function mediaSource(item: RadioBroadcast) {
  const video = item.videoUrl?.trim();
  const audio = item.audioUrl?.trim();
  const stream = item.streamUrl?.trim();
  if (item.mediaType === 'video' && video) return { type: 'video' as const, url: video };
  if (item.mediaType === 'audio' && audio) return { type: 'audio' as const, url: audio };
  if (video) return { type: 'video' as const, url: video };
  if (audio) return { type: 'audio' as const, url: audio };
  if (stream) return { type: 'audio' as const, url: stream };
  return null;
}

export const RadioPage: React.FC<RadioPageProps> = ({ broadcasts, onBack }) => {
  const [currentPlaying, setCurrentPlaying] = useState<RadioBroadcast | null>(broadcasts[0] || null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [mediaError, setMediaError] = useState('');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const selectedSource = useMemo(() => currentPlaying ? mediaSource(currentPlaying) : null, [currentPlaying]);

  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setMediaError('');
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.load();
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.load();
    }
  }, [currentPlaying?.id]);

  const activeMedia = () => audioRef.current || videoRef.current;

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
      setMediaError('The configured media could not be played. Check the media URL and format.');
    }
  };

  const togglePlay = (item: RadioBroadcast) => {
    if (currentPlaying?.id !== item.id) {
      setCurrentPlaying(item);
      window.setTimeout(() => {}, 0);
      return;
    }
    if (isPlaying) {
      activeMedia()?.pause();
      setIsPlaying(false);
    } else {
      void playSelected();
    }
  };

  const seek = (value: number) => {
    const media = activeMedia();
    if (!media) return;
    media.currentTime = value;
    setCurrentTime(value);
  };

  const setVolume = (value: number) => {
    const media = activeMedia();
    if (!media) return;
    media.volume = value;
    setMuted(value === 0);
  };

  const toggleMute = () => {
    const media = activeMedia();
    if (!media) return;
    media.muted = !media.muted;
    setMuted(media.muted);
  };

  const enterFullscreen = () => {
    if (videoRef.current) void videoRef.current.requestFullscreen?.();
  };

  const updateTime = () => {
    const media = activeMedia();
    if (!media) return;
    setCurrentTime(media.currentTime);
    setDuration(Number.isFinite(media.duration) ? media.duration : 0);
  };

  return (
    <div className="vop-radio-page">
      <div className="vop-radio-header">
        <div className="vop-radio-header-inner">
          <button onClick={onBack} className="vop-radio-back" type="button">
            <ArrowLeft size={20} />
            <span>Radio Ministry</span>
          </button>
          <span className="vop-radio-badge"><Radio size={13}/> Audio & Video Broadcasts</span>
          <h1>Voice of Prophecy Radio Ministry</h1>
          <p>Listen to published programmes and watch available video broadcasts.</p>
        </div>
      </div>

      <main className="vop-radio-main">
        {currentPlaying && (
          <section className="vop-radio-player-card">
            <div className="vop-radio-media-stage">
              {selectedSource?.type === 'video' ? (
                <video
                  ref={videoRef}
                  src={selectedSource.url}
                  poster={currentPlaying.posterUrl?.trim() || undefined}
                  preload="metadata"
                  playsInline
                  onTimeUpdate={updateTime}
                  onLoadedMetadata={updateTime}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onEnded={() => setIsPlaying(false)}
                  onVolumeChange={() => setMuted(Boolean(videoRef.current?.muted))}
                  onError={() => { setIsPlaying(false); setMediaError('The configured video could not be loaded.'); }}
                />
              ) : selectedSource ? (
                <div className="vop-radio-audio-visual">
                  <Radio size={52}/>
                  <span>Voice of Prophecy Radio</span>
                  <small>Audio broadcast</small>
                </div>
              ) : (
                <div className="vop-radio-no-media">No media source configured for this programme.</div>
              )}
              {selectedSource?.type === 'video' && (
                <div className="vop-radio-video-overlay">
                  <button type="button" onClick={() => togglePlay(currentPlaying)} aria-label={isPlaying ? 'Pause video' : 'Play video'}>
                    {isPlaying ? <Pause size={23}/> : <Play size={23} fill="currentColor"/>}
                  </button>
                </div>
              )}
            </div>

            <div className="vop-radio-player-info">
              <div>
                <span className="vop-radio-series">{currentPlaying.series}</span>
                <h2>{currentPlaying.title}</h2>
                <p>{currentPlaying.speaker} · {currentPlaying.broadcastTime}</p>
              </div>
              {currentPlaying.streamUrl?.trim() && <span className="vop-radio-live"><span/>LIVE STREAM</span>}
            </div>

            {selectedSource?.type === 'audio' && (
              <audio
                ref={audioRef}
                src={selectedSource.url}
                preload="metadata"
                onTimeUpdate={updateTime}
                onLoadedMetadata={updateTime}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => setIsPlaying(false)}
                onVolumeChange={() => setMuted(Boolean(audioRef.current?.muted))}
                onError={() => { setIsPlaying(false); setMediaError('The configured audio could not be loaded.'); }}
              />
            )}

            <div className="vop-radio-controls">
              <button className="vop-radio-control-main" type="button" onClick={() => togglePlay(currentPlaying)} disabled={!selectedSource}>
                {isPlaying ? <Pause size={19}/> : <Play size={19} fill="currentColor"/>}
              </button>
              <span className="vop-radio-time">{formatTime(currentTime)}</span>
              <input className="vop-radio-seek" type="range" min={0} max={duration || 0} step="0.1" value={Math.min(currentTime, duration || 0)} onChange={e => seek(Number(e.target.value))} disabled={!selectedSource || !duration} aria-label="Playback position"/>
              <span className="vop-radio-time">{formatTime(duration)}</span>
              <button className="vop-radio-icon-btn" type="button" onClick={toggleMute} disabled={!selectedSource} aria-label={muted ? 'Unmute' : 'Mute'}>
                {muted ? <VolumeX size={18}/> : <Volume2 size={18}/>}
              </button>
              <input className="vop-radio-volume" type="range" min={0} max={1} step="0.05" defaultValue="1" onChange={e => setVolume(Number(e.target.value))} disabled={!selectedSource} aria-label="Volume"/>
              {selectedSource?.type === 'video' && <button className="vop-radio-icon-btn" type="button" onClick={enterFullscreen} aria-label="Fullscreen"><Maximize size={18}/></button>}
            </div>

            {mediaError && <div className="vop-radio-error" role="alert">{mediaError}</div>}
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
                    <span>{item.series}</span>
                    <h4>{item.title}</h4>
                    <p>{item.speaker}</p>
                    <small>{item.description}</small>
                  </div>
                  <span className="vop-radio-program-icon">{selected && isPlaying ? <Pause size={16}/> : <Play size={16} fill="currentColor"/>}</span>
                </button>
                <div className="vop-radio-program-footer">
                  <span>{item.broadcastTime}</span>
                  <span>{item.durationMinutes ? `${item.durationMinutes} min` : 'On demand'}</span>
                  {source?.type === 'video' && <span>VIDEO</span>}
                  {source?.type === 'audio' && <span>AUDIO</span>}
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
