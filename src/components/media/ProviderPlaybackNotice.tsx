import React from 'react';
import { isSafeHttpsMediaUrl } from '../../../shared/mediaSources';
import './provider-playback-notice.css';

type Props = {
  sourceUrl: string;
  provider: string;
  title?: string;
};

/** A provider's frame-ancestors policy cannot be relaxed by VOP.
 * Avoid requesting an iframe when that provider blocks third-party origins.
 */
export function ProviderPlaybackNotice({sourceUrl,provider,title}: Props){
  const valid=isSafeHttpsMediaUrl(sourceUrl);
  const label=title || provider + ' programme';
  return <div className="vop-provider-playback-notice" role="note" aria-label={provider+' playback'}>
    <span className="vop-provider-playback-mark" aria-hidden="true">▶</span>
    <div className="vop-provider-playback-copy">
      <strong>{label}</strong>

      {valid&&<a href={sourceUrl} target="_blank" rel="noopener noreferrer">Play on {provider} <span aria-hidden="true">↗</span></a>}
    </div>
  </div>;
}
