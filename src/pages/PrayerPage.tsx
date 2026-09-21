import React, { useState } from 'react';
import { PrayerRequest, User } from '../types';
import { ArrowLeft, HeartHandshake, Plus, Check, Clock } from 'lucide-react';

interface PrayerPageProps {
  currentUser: User;
  prayerRequests: PrayerRequest[];
  onBack: () => void;
  onCreatePrayerRequest: (request: Omit<PrayerRequest, 'id' | 'createdAt'>) => Promise<void>;
  onUpdatePrayerStatus: (id: string, status: PrayerRequest['status']) => Promise<void>;
}

export const PrayerPage: React.FC<PrayerPageProps> = ({
  currentUser,
  prayerRequests,
  onBack,
  onCreatePrayerRequest,
  onUpdatePrayerStatus,
}) => {
  const [requestText, setRequestText] = useState('');
  const [category, setCategory] = useState<PrayerRequest['category']>('Spiritual');
  const [isPrivate, setIsPrivate] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>('All');

  const categories: PrayerRequest['category'][] = [
    'Spiritual',
    'Health',
    'Family',
    'Guidance',
    'Thanksgiving',
    'Other'
  ];

  const filteredRequests = prayerRequests.filter(p => {
    if (p.isPrivate && p.candidateId !== currentUser.uid && !currentUser.privileges?.admin) {
      return false;
    }
    if (filterCategory !== 'All' && p.category !== filterCategory) {
      return false;
    }
    return true;
  });

  const handleSubmitPrayer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestText.trim()) return;

    void onCreatePrayerRequest({
      candidateId: currentUser.uid,
      candidateName: currentUser.displayName,
      churchId: currentUser.churchId,
      category,
      isPrivate,
      status: 'Received',
      requestText: requestText.trim(),
    });

    setRequestText('');
    setShowSubmitModal(false);
  };

  return (
    <div className="min-h-screen bg-[#f4f6fa] text-slate-800 pb-24 md:pb-12">
      {/* Top Banner - Deep Royal Blue (#002d72) Matching Original APK */}
      <div className="bg-[#002d72] text-white pt-5 pb-6 px-4 sm:px-6 shadow-md">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between gap-4 mb-4">
            <button
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-white/90 hover:text-white transition-colors cursor-pointer py-1"
            >
              <ArrowLeft size={22} />
              <span className="font-bold text-base sm:text-lg">Prayer Ministry</span>
            </button>
            <span className="text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-white/15 text-amber-300 border border-white/20">
              Pastoral Care & Petitions
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Prayer Requests & Ministry Care
              </h1>
              <p className="text-xs sm:text-sm text-blue-100/90 mt-0.5">
                "Cast all your anxiety on Him because He cares for you." — 1 Peter 5:7
              </p>
            </div>

            <button
              onClick={() => setShowSubmitModal(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#ff9900] hover:bg-[#e68a00] text-white font-bold text-xs uppercase tracking-wider transition-colors shadow-md cursor-pointer"
            >
              <Plus size={16} />
              <span>Request Prayer</span>
            </button>
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-2 mt-5 overflow-x-auto pb-1">
            <button
              onClick={() => setFilterCategory('All')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
                filterCategory === 'All'
                  ? 'bg-[#ff9900] text-white shadow-xs'
                  : 'bg-white/15 border border-white/25 text-white hover:bg-white/25'
              }`}
            >
              All Petitions
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
                  filterCategory === cat
                    ? 'bg-[#ff9900] text-white shadow-xs'
                    : 'bg-white/15 border border-white/25 text-white hover:bg-white/25'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Requests Feed */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <div className="space-y-4">
          {filteredRequests.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-slate-200/80 shadow-sm">
              <p className="text-slate-500 text-sm">No prayer requests in this category yet.</p>
            </div>
          ) : (
            filteredRequests.map((req) => (
              <div
                key={req.id}
                className="bg-white border border-slate-200/80 rounded-2xl p-5 sm:p-6 shadow-sm hover:border-slate-300 hover:shadow-md transition-all"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-full bg-blue-50 border border-blue-100 text-[#002d72] flex items-center justify-center text-xs font-extrabold">
                      {req.candidateName.charAt(0)}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        {req.candidateName}
                        {req.isPrivate && (
                          <span className="text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 font-semibold">
                            Private Request
                          </span>
                        )}
                      </h4>
                      <span className="text-[11px] text-slate-400 font-medium">
                        Submitted on {new Date(req.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700">
                      {req.category}
                    </span>
                    <span className={`text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full ${
                      req.status === 'Answered'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : req.status === 'Praying'
                        ? 'bg-blue-50 text-[#002d72] border border-blue-200'
                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}>
                      {req.status}
                    </span>
                  </div>
                </div>

                <p className="text-xs sm:text-sm text-slate-700 leading-relaxed pl-11">
                  {req.requestText}
                </p>

                {currentUser.privileges?.admin && (
                  <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                    <button
                      onClick={() => void onUpdatePrayerStatus(req.id, 'Praying')}
                      className="px-3 py-1 rounded-full bg-blue-50 hover:bg-blue-100 text-xs font-bold text-[#002d72] transition-colors cursor-pointer"
                    >
                      Mark Praying
                    </button>
                    <button
                      onClick={() => void onUpdatePrayerStatus(req.id, 'Answered')}
                      className="px-3 py-1 rounded-full bg-emerald-50 hover:bg-emerald-100 text-xs font-bold text-emerald-700 transition-colors cursor-pointer"
                    >
                      Mark Answered
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Request Submission Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base sm:text-lg font-bold text-slate-900">Submit Prayer Petition</h3>
              <button
                onClick={() => setShowSubmitModal(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitPrayer} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as PrayerRequest['category'])}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-sm focus:border-[#002d72] focus:bg-white focus:outline-none"
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Your Prayer Request
                </label>
                <textarea
                  rows={4}
                  value={requestText}
                  onChange={(e) => setRequestText(e.target.value)}
                  placeholder="Share your personal prayer petition..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-sm focus:border-[#002d72] focus:bg-white focus:outline-none resize-none"
                  required
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="privateReq"
                  checked={isPrivate}
                  onChange={(e) => setIsPrivate(e.target.checked)}
                  className="w-4 h-4 rounded text-[#002d72] border-slate-300"
                />
                <label htmlFor="privateReq" className="text-xs text-slate-600">
                  Keep private (only visible to VOP Coordinators and District Pastors)
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowSubmitModal(false)}
                  className="px-4 py-2 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-full bg-[#002d72] hover:bg-[#002257] text-white text-xs font-bold uppercase tracking-wider shadow-sm cursor-pointer"
                >
                  Send Petition
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
