import React from 'react';

type ShimmerProps = {
  rows?: number;
  cards?: number;
  compact?: boolean;
  className?: string;
  label?: string;
};

export function ShimmerBlock({ className='' }: { className?: string }) {
  return <span className={'vop-shimmer-block '+className} aria-hidden="true" />;
}

export function ShimmerList({ rows=5, compact=false, className='', label='Loading content' }: ShimmerProps) {
  return <div className={'vop-shimmer-list '+(compact?'compact ':'')+className} role="status" aria-live="polite" aria-label={label}>
    {Array.from({length:Math.max(1,rows)},(_,index)=><div className="vop-shimmer-row" key={index} aria-hidden="true">
      <ShimmerBlock className="vop-shimmer-avatar"/>
      <div className="vop-shimmer-copy">
        <ShimmerBlock className="vop-shimmer-line strong"/>
        <ShimmerBlock className="vop-shimmer-line"/>
        {!compact&&<ShimmerBlock className="vop-shimmer-line short"/>}
      </div>
    </div>)}
  </div>;
}

export function ShimmerCards({ cards=4, className='', label='Loading content' }: ShimmerProps) {
  return <div className={'vop-shimmer-card-grid '+className} role="status" aria-live="polite" aria-label={label}>
    {Array.from({length:Math.max(1,cards)},(_,index)=><div className="vop-shimmer-card" key={index} aria-hidden="true">
      <ShimmerBlock className="vop-shimmer-card-title"/>
      <ShimmerBlock className="vop-shimmer-line"/>
      <ShimmerBlock className="vop-shimmer-line short"/>
      <div className="vop-shimmer-card-footer">
        <ShimmerBlock className="vop-shimmer-pill"/>
        <ShimmerBlock className="vop-shimmer-button"/>
      </div>
    </div>)}
  </div>;
}

export function RouteShimmer({ label='Opening workspace' }: { label?: string }) {
  return <section className="vop-route-shimmer" role="status" aria-live="polite" aria-label={label}>
    <div className="vop-route-shimmer-head" aria-hidden="true">
      <div>
        <ShimmerBlock className="vop-shimmer-kicker"/>
        <ShimmerBlock className="vop-shimmer-heading"/>
        <ShimmerBlock className="vop-shimmer-subheading"/>
      </div>
      <ShimmerBlock className="vop-shimmer-action"/>
    </div>
    <ShimmerCards cards={3} label={label}/>
    <ShimmerList rows={4} compact label={label}/>
  </section>;
}
