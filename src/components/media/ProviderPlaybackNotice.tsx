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
  return <div className="vop-provider-playback-notice" role="note" aria-label={provider+' playback information'}>
    <span className="vop-provider-playback-mark" aria-hidden="true">▶</span>
    <div className="vop-provider-playback-copy">
      <strong>{label}</strong>
      <p>{provider} restricts playback inside other websites. Open the programme on {provider}, or ask your organisation to supply an authorised direct audio/video URL for playback in VOP.</p>
      {valid&&<a href={sourceUrl} target="_blank" rel="noopener noreferrer">Open on {provider} <span aria-hidden="true">↗</span></a>}
    </div>
  </div>;
}
