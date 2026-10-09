import React from 'react';
import { Play, Pause, Square, Volume2 } from 'lucide-react';
import { AVAILABLE_NARRATION_RATES, type NarrationPlaybackRate } from '../../services/lessonNarration';
import './lesson-reader-audio.css';

interface AudioNarrationBarProps {
  pageTitle: string;
  pageSubtitle?: string;
  status: 'idle' | 'playing' | 'paused';
  rate: NarrationPlaybackRate;
  onPlay: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onRateChange: (rate: NarrationPlaybackRate) => void;
}

export const AudioNarrationBar: React.FC<AudioNarrationBarProps> = ({
  pageTitle,
  pageSubtitle,
  status,
  rate,
  onPlay,
  onPause,
  onResume,
  onStop,
  onRateChange,
}) => {
  const isPlaying = status === 'playing';
  const isPaused = status === 'paused';

  return (
    <div className="vop-audio-narration-bar" role="region" aria-label="Audio narration controls">
      <div className="vop-audio-narration-info">
        <div className={`vop-audio-equalizer ${isPlaying ? 'playing' : ''}`}>
          <span className="vop-audio-equalizer-bar" />
          <span className="vop-audio-equalizer-bar" />
          <span className="vop-audio-equalizer-bar" />
          <span className="vop-audio-equalizer-bar" />
        </div>

        <div className="vop-audio-narration-title">
          <strong>
            {isPlaying ? 'Reading Aloud...' : isPaused ? 'Narration Paused' : 'Audio Narration'}
          </strong>
          <span>
            {pageSubtitle || pageTitle}
          </span>
        </div>
      </div>

      <div className="vop-audio-narration-actions">
        {/* Playback speed toggle */}
        <div className="vop-audio-rate-selector" title="Audio playback speed">
          {AVAILABLE_NARRATION_RATES.map(r => (
            <button
              key={r}
              type="button"
              className={`vop-audio-rate-btn ${rate === r ? 'active' : ''}`}
              onClick={() => onRateChange(r)}
              aria-label={`Set playback speed to ${r}x`}
            >
              {r}x
            </button>
          ))}
        </div>

        {/* Play / Pause / Resume */}
        {isPlaying ? (
          <button
            type="button"
            className="vop-audio-btn primary"
            onClick={onPause}
            aria-label="Pause narration"
            title="Pause audio"
          >
            <Pause size={14} />
            <span>Pause</span>
          </button>
        ) : isPaused ? (
          <button
            type="button"
            className="vop-audio-btn primary"
            onClick={onResume}
            aria-label="Resume narration"
            title="Resume audio"
          >
            <Play size={14} />
            <span>Resume</span>
          </button>
        ) : (
          <button
            type="button"
            className="vop-audio-btn primary"
            onClick={onPlay}
            aria-label="Start narration"
            title="Play audio"
          >
            <Volume2 size={14} />
            <span>Play</span>
          </button>
        )}

        {/* Stop button */}
        {(isPlaying || isPaused) && (
          <button
            type="button"
            className="vop-audio-btn icon-only"
            onClick={onStop}
            aria-label="Stop narration"
            title="Stop audio"
          >
            <Square size={13} fill="currentColor" />
          </button>
        )}
      </div>
    </div>
  );
};
