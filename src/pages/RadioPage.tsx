import React, { useEffect, useRef, useState } from 'react';
import { RadioBroadcast } from '../types';
import { ArrowLeft, Radio, Play, Pause, Volume2 } from 'lucide-react';

interface RadioPageProps {
  broadcasts: RadioBroadcast[];
  onBack: () => void;
}

export const RadioPage: React.FC<RadioPageProps> = ({ broadcasts, onBack }) => {
  const [currentPlaying, setCurrentPlaying] = useState<RadioBroadcast | null>(broadcasts[0] || null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [audioError, setAudioError] = useState('');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const playCurrent = async () => {
    const source = currentPlaying?.audioUrl?.trim();
    if (!audioRef.current || !source) {
      setIsPlaying(false);
      setAudioError('This broadcast does not have a playable audio source configured.');
      return;
    }

    setAudioError('');
    try {
      await audioRef.current.play();
      setIsPlaying(true);
    } catch (error) {
      console.error('VOP radio playback failed', error);
      setIsPlaying(false);
      setAudioError('The configured audio source could not be played on this device.');
    }
  };

  useEffect(() => {
    setCurrentTime(0);
    setDuration(0);
    setAudioError('');
    if (!currentPlaying?.audioUrl?.trim()) setIsPlaying(false);
  }, [currentPlaying?.id, currentPlaying?.audioUrl]);

  const togglePlay = (broadcast: RadioBroadcast) => {
    const hasSource = Boolean(broadcast.audioUrl?.trim());
    if (currentPlaying?.id === broadcast.id) {
      if (isPlaying) {
        audioRef.current?.pause();
        setIsPlaying(false);
      } else if (hasSource) {
        void playCurrent();
      } else {
        setAudioError('This broadcast does not have a playable audio source configured.');
      }
      return;
    }

    setCurrentPlaying(broadcast);
    setIsPlaying(hasSource);
    setAudioError('');
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
      setDuration(Number.isFinite(audioRef.current.duration) ? audioRef.current.duration : 0);
    }
  };

  const formatTime = (secs: number) => {
    if (!Number.isFinite(secs) || secs < 0) return '0:00';
    const mins = Math.floor(secs / 60);
    const rem = Math.floor(secs % 60);
    return `${mins}:${rem < 10 ? '0' : ''}${rem}`;
  };

  return (
    <div className="min-h-screen bg-[#f4f6fa] text-slate-800 pb-28 md:pb-12">
      <div className="bg-[#002d72] text-white pt-5 pb-6 px-4 sm:px-6 shadow-md">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between gap-4 mb-4">
            <button onClick={onBack} className="inline-flex items-center gap-1.5 text-white/90 hover:text-white transition-colors cursor-pointer py-1">
              <ArrowLeft size={22} />
              <span className="font-bold text-base sm:text-lg">Radio Ministry</span>
            </button>
            <span className="text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-white/15 text-amber-300 border border-white/20">
              Audio Sermons & Broadcasts
            </span>
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">Voice of Prophecy Radio Ministry</h1>
              <p className="text-xs sm:text-sm text-blue-100/90 mt-0.5">Listen to published radio programmes and broadcasts.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {currentPlaying && (
          <div className="mb-6 p-5 sm:p-7 rounded-2xl bg-white border border-slate-200/80 shadow-md relative overflow-hidden">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
              <button
                onClick={() => togglePlay(currentPlaying)}
                disabled={!currentPlaying.audioUrl?.trim()}
                className="w-16 h-16 sm:w-18 sm:h-18 rounded-2xl bg-[#002d72] hover:bg-[#002257] disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center shadow-md transition-transform active:scale-95 flex-shrink-0 cursor-pointer"
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause size={28} /> : <Play size={28} className="ml-1" fill="currentColor" />}
              </button>

              <div className="flex-1 min-w-0">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#002d72] bg-blue-50 border border-blue-100 px-2.5 py-0.5 rounded-full inline-block mb-1">
                  {currentPlaying.series}
                </span>
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 truncate">{currentPlaying.title}</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {currentPlaying.speaker} • {currentPlaying.broadcastTime}
                </p>

                <div className="mt-3.5 flex items-center gap-3">
                  <span className="text-[11px] text-slate-500 font-mono">{formatTime(currentTime)}</span>
                  <input
                    type="range"
                    min={0}
                    max={duration || Math.max(1, currentPlaying.durationMinutes * 60)}
                    value={Math.min(currentTime, duration || Math.max(1, currentPlaying.durationMinutes * 60))}
                    onChange={(e) => {
                      if (audioRef.current) audioRef.current.currentTime = Number(e.target.value);
                    }}
                    className="flex-1 accent-[#ff9900] cursor-pointer h-2 bg-slate-200 rounded-lg"
                    disabled={!currentPlaying.audioUrl?.trim()}
                    aria-label="Audio position"
                  />
                  <span className="text-[11px] text-slate-500 font-mono">
                    {formatTime(duration || currentPlaying.durationMinutes * 60)}
                  </span>
                </div>

                {audioError && <div className="vop-radio-error" role="alert">{audioError}</div>}
              </div>
            </div>

            {currentPlaying.audioUrl?.trim() && (
              <audio
                ref={audioRef}
                src={currentPlaying.audioUrl.trim()}
                preload="metadata"
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleTimeUpdate}
                onEnded={() => setIsPlaying(false)}
                onError={() => {
                  setIsPlaying(false);
                  setAudioError('The configured audio source could not be loaded.');
                }}
              />
            )}
          </div>
        )}

        <h3 className="text-base font-bold text-slate-900 mb-3">Available Radio Programs</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {broadcasts.map((b) => {
            const isSelected = currentPlaying?.id === b.id;
            const hasSource = Boolean(b.audioUrl?.trim());
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => togglePlay(b)}
                className={`p-5 rounded-2xl border text-left cursor-pointer transition-all ${isSelected
                  ? 'bg-blue-50/70 border-[#002d72] shadow-sm ring-1 ring-[#002d72]/20'
                  : 'bg-white border-slate-200/80 hover:border-slate-300 hover:shadow-sm'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#002d72] block mb-0.5">{b.series}</span>
                    <h4 className="font-bold text-slate-900 text-sm sm:text-base truncate">{b.title}</h4>
                    <p className="text-xs text-slate-500 mt-0.5">{b.speaker}</p>
                    <p className="text-xs text-slate-600 mt-1.5 line-clamp-2 leading-relaxed">{b.description}</p>
                  </div>
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-[#002d72] text-white' : 'bg-slate-100 text-slate-600'}`}>
                    {isSelected && isPlaying ? <Pause size={16} /> : <Play size={16} fill="currentColor" />}
                  </div>
                </div>
                <div className="mt-3.5 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400 font-medium">
                  <span>{b.broadcastTime}</span>
                  <span>{b.durationMinutes} mins</span>
                </div>
                {!hasSource && <div className="mt-2 text-[10px] font-semibold text-amber-700">Audio source not configured</div>}
              </button>
            );
          })}
          {!broadcasts.length && (
            <div className="sm:col-span-2 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
              No published radio programmes are available.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
