import React, { useState, useRef } from 'react';
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
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const togglePlay = (broadcast: RadioBroadcast) => {
    if (currentPlaying?.id === broadcast.id) {
      if (isPlaying) {
        audioRef.current?.pause();
        setIsPlaying(false);
      } else {
        audioRef.current?.play();
        setIsPlaying(true);
      }
    } else {
      setCurrentPlaying(broadcast);
      setIsPlaying(true);
      setTimeout(() => {
        audioRef.current?.play();
      }, 50);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
      setDuration(audioRef.current.duration || 0);
    }
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const rem = Math.floor(secs % 60);
    return `${mins}:${rem < 10 ? '0' : ''}${rem}`;
  };

  return (
    <div className="min-h-screen bg-[#f4f6fa] text-slate-800 pb-28 md:pb-12">
      {/* Top Banner - Deep Royal Blue (#002d72) Matching Original APK */}
      <div className="bg-[#002d72] text-white pt-5 pb-6 px-4 sm:px-6 shadow-md">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between gap-4 mb-4">
            <button
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-white/90 hover:text-white transition-colors cursor-pointer py-1"
            >
              <ArrowLeft size={22} />
              <span className="font-bold text-base sm:text-lg">Radio Ministry</span>
            </button>
            <span className="text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-white/15 text-amber-300 border border-white/20">
              Audio Sermons & Broadcasts
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Voice of Prophecy Radio Ministry
              </h1>
              <p className="text-xs sm:text-sm text-blue-100/90 mt-0.5">
                Listen to inspiring sermon series, Bible questions & answers, and worldwide broadcasts.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {/* Active Audio Player Card */}
        {currentPlaying && (
          <div className="mb-6 p-5 sm:p-7 rounded-2xl bg-white border border-slate-200/80 shadow-md relative overflow-hidden">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
              <button
                onClick={() => togglePlay(currentPlaying)}
                className="w-16 h-16 sm:w-18 sm:h-18 rounded-2xl bg-[#002d72] hover:bg-[#002257] text-white flex items-center justify-center shadow-md transition-transform active:scale-95 flex-shrink-0 cursor-pointer"
              >
                {isPlaying ? (
                  <Pause size={28} />
                ) : (
                  <Play size={28} className="ml-1" fill="currentColor" />
                )}
              </button>

              <div className="flex-1 min-w-0">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#002d72] bg-blue-50 border border-blue-100 px-2.5 py-0.5 rounded-full inline-block mb-1">
                  Now Playing • {currentPlaying.series}
                </span>
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 truncate">
                  {currentPlaying.title}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Speaker: {currentPlaying.speaker} • {currentPlaying.broadcastTime}
                </p>

                {/* Scrubber */}
                <div className="mt-3.5 flex items-center gap-3">
                  <span className="text-[11px] text-slate-500 font-mono">
                    {formatTime(currentTime)}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={duration || 100}
                    value={currentTime}
                    onChange={(e) => {
                      if (audioRef.current) {
                        audioRef.current.currentTime = Number(e.target.value);
                      }
                    }}
                    className="flex-1 accent-[#ff9900] cursor-pointer h-2 bg-slate-200 rounded-lg"
                  />
                  <span className="text-[11px] text-slate-500 font-mono">
                    {formatTime(duration || currentPlaying.durationMinutes * 60)}
                  </span>
                </div>
              </div>
            </div>

            <audio
              ref={audioRef}
              src={currentPlaying.audioUrl}
              onTimeUpdate={handleTimeUpdate}
              onEnded={() => setIsPlaying(false)}
            />
          </div>
        )}

        {/* Broadcasts Archive List */}
        <h3 className="text-base font-bold text-slate-900 mb-3">Available Radio Programs</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {broadcasts.map((b) => {
            const isSelected = currentPlaying?.id === b.id;
            return (
              <div
                key={b.id}
                onClick={() => togglePlay(b)}
                className={`p-5 rounded-2xl border cursor-pointer transition-all ${
                  isSelected
                    ? 'bg-blue-50/70 border-[#002d72] shadow-sm ring-1 ring-[#002d72]/20'
                    : 'bg-white border-slate-200/80 hover:border-slate-300 hover:shadow-sm'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#002d72] block mb-0.5">
                      {b.series}
                    </span>
                    <h4 className="font-bold text-slate-900 text-sm sm:text-base truncate">{b.title}</h4>
                    <p className="text-xs text-slate-500 mt-0.5">Speaker: {b.speaker}</p>
                    <p className="text-xs text-slate-600 mt-1.5 line-clamp-2 leading-relaxed">{b.description}</p>
                  </div>
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    isSelected ? 'bg-[#002d72] text-white' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {isSelected && isPlaying ? (
                      <Pause size={16} />
                    ) : (
                      <Play size={16} fill="currentColor" />
                    )}
                  </div>
                </div>
                <div className="mt-3.5 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400 font-medium">
                  <span>{b.broadcastTime}</span>
                  <span>{b.durationMinutes} mins</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
