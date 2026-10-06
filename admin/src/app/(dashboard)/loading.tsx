import React from 'react';

export default function DashboardLoading() {
  return (
    <div className="space-y-6 p-6 animate-pulse">
      {/* Header Skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-7 w-64 bg-slate-800 rounded-lg"></div>
          <div className="h-4 w-96 bg-slate-800/60 rounded"></div>
        </div>
        <div className="h-8 w-32 bg-slate-800/80 rounded-lg"></div>
      </div>

      {/* Stats Cards Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-slate-900 border border-slate-800/60 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="h-4 w-24 bg-slate-800 rounded"></div>
              <div className="w-8 h-8 rounded-lg bg-slate-800"></div>
            </div>
            <div className="h-8 w-32 bg-slate-800 rounded"></div>
            <div className="h-3 w-40 bg-slate-800/40 rounded"></div>
          </div>
        ))}
      </div>

      {/* Main Table Shimmer Skeleton */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4">
        <div className="h-6 w-48 bg-slate-800 rounded mb-4"></div>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5, 6].map((row) => (
            <div key={row} className="flex items-center justify-between py-3 border-b border-slate-800/50">
              <div className="h-4 w-1/5 bg-slate-800/80 rounded"></div>
              <div className="h-4 w-1/6 bg-slate-800/60 rounded"></div>
              <div className="h-4 w-1/6 bg-slate-800/60 rounded"></div>
              <div className="h-6 w-20 bg-slate-800 rounded-full"></div>
              <div className="h-8 w-24 bg-slate-800/80 rounded-lg"></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
