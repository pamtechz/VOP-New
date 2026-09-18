import React, { useRef, useState } from 'react';
import { User, AppSettings, LanguageCode } from '../types';
import { getTranslation } from '../services/i18n';
import { ArrowLeft, Download, Share2, Printer, CheckCircle, Award, Edit3 } from 'lucide-react';
import html2canvas from 'html2canvas';

interface CertificatesPageProps {
  currentUser: User;
  settings: AppSettings;
  activeLanguage: LanguageCode;
  onBack: () => void;
}

export const CertificatesPage: React.FC<CertificatesPageProps> = ({
  currentUser,
  settings,
  activeLanguage,
  onBack
}) => {
  const certificateRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [customName, setCustomName] = useState(currentUser.displayName);
  const [isEditingName, setIsEditingName] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const t = (key: string) => getTranslation(key, activeLanguage, settings.customTranslations);
  const issueDate = currentUser.information.graduationDate || currentUser.information.completionDate || '12 June, 2023';

  const handleDownloadImage = async () => {
    if (!certificateRef.current) return;
    try {
      setIsExporting(true);
      const canvas = await html2canvas(certificateRef.current, {
        scale: 2.5,
        useCORS: true,
        backgroundColor: '#ffffff'
      });
      const link = document.createElement('a');
      link.download = `VOP_Certificate_${customName.replace(/\s+/g, '_')}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3500);
    } catch (err) {
      console.error('Failed to export certificate:', err);
      alert('Could not export certificate image. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Voice of Prophecy Course Certificate',
          text: `I have completed the Voice of Prophecy Bible Correspondence Course! Certified by ${settings.organizationName}.`,
          url: window.location.href
        });
      } catch {
        // User dismissed
      }
    } else {
      navigator.clipboard.writeText(window.location.href);
      alert('Certificate verification link copied to clipboard!');
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f6fa] text-slate-800 pb-24 md:pb-12">
      {/* Top Banner - Deep Royal Blue (#002d72) Matching Original APK Screenshot 1 */}
      <div className="bg-[#002d72] text-white pt-5 pb-7 px-4 sm:px-6 shadow-md">
        <div className="max-w-4xl mx-auto">
          {/* Top Bar with Back Button */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-white/90 hover:text-white transition-colors cursor-pointer py-1"
              aria-label="Back"
            >
              <ArrowLeft size={22} />
              <span className="font-bold text-base sm:text-lg">My Certificate</span>
            </button>

            <span className="text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-white/15 text-amber-300 border border-white/20">
              Verified Credential
            </span>
          </div>

          {/* Congratulations Section in Banner (Exact Screenshot 1) */}
          <div className="text-center py-2">
            <div className="w-14 h-14 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/40 flex items-center justify-center mx-auto mb-2 shadow-inner">
              <Award size={30} />
            </div>

            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              Congratulations!!
            </h1>
            <p className="text-xs sm:text-sm text-blue-100/90 mt-1 max-w-md mx-auto">
              You have successfully completed the Bible Correspondence Course
            </p>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        {saveSuccess && (
          <div className="mb-4 p-4 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs sm:text-sm flex items-center gap-3 animate-fadeIn shadow-xs">
            <CheckCircle size={18} className="text-emerald-600 flex-shrink-0" />
            <span>High-resolution Certificate image saved to your device!</span>
          </div>
        )}

        {/* Certificate Card */}
        <div className="overflow-x-auto pb-4">
          <div
            ref={certificateRef}
            className="w-[820px] mx-auto min-h-[560px] bg-[#fffdfa] text-slate-900 p-8 sm:p-10 rounded-2xl shadow-xl relative border-[10px] border-double border-[#8b6e38] flex flex-col justify-between"
            style={{
              backgroundImage: 'radial-gradient(#f7efe3 1.5px, transparent 1.5px)',
              backgroundSize: '24px 24px'
            }}
          >
            {/* Top Logos & Header */}
            <div className="flex items-center justify-between border-b-2 border-[#8b6e38]/30 pb-4">
              <div className="w-20 h-20 flex items-center justify-center">
                <img src="/assets/vop_logo.png" alt="VOP" className="w-full h-full object-contain" />
              </div>

              <div className="text-center flex-1 px-4">
                <span className="text-[11px] font-bold tracking-[0.25em] text-[#8b6e38] uppercase block mb-0.5">
                  {settings.organizationName || 'Seventh-day Adventist Church'}
                </span>
                <h2 className="text-xl sm:text-2xl font-serif font-black tracking-wider text-[#1e293b] uppercase">
                  {settings.appName || 'Voice of Prophecy'}
                </h2>
                <span className="text-xs font-serif italic text-slate-600 block mt-0.5">
                  {settings.schoolName || 'Bible Correspondence School'}
                </span>
              </div>

              <div className="w-20 h-20 flex items-center justify-center">
                <img src="/assets/pm_logo.png" alt="PM Logo" className="w-full h-full object-contain" />
              </div>
            </div>

            {/* Certificate Title */}
            <div className="text-center my-6">
              <div className="inline-block relative">
                <h3 className="text-2xl sm:text-3xl font-serif font-black tracking-[0.18em] text-[#8b6e38] uppercase px-8 py-1 border-y-2 border-[#8b6e38]/50">
                  {settings.certificateTitle || t('course_certificate')}
                </h3>
              </div>
              <p className="text-xs font-serif uppercase tracking-widest text-slate-500 mt-4">
                {t('certified_text')}
              </p>

              {/* Recipient Name with Edit option */}
              <div className="my-4 relative group inline-block">
                {isEditingName ? (
                  <input
                    type="text"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    onBlur={() => setIsEditingName(false)}
                    autoFocus
                    className="text-2xl sm:text-3xl font-serif font-bold text-[#1e293b] border-b-2 border-[#8b6e38] bg-transparent text-center focus:outline-none"
                  />
                ) : (
                  <div className="flex items-center justify-center gap-2">
                    <h4 className="text-2xl sm:text-4xl font-serif font-bold tracking-wide text-[#1e293b] border-b-2 border-[#8b6e38]/60 pb-1 px-6 min-w-[280px]">
                      {customName}
                    </h4>
                    <button
                      onClick={() => setIsEditingName(true)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-slate-800 transition-opacity cursor-pointer"
                      title="Edit Name"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              <p className="text-xs sm:text-sm font-serif max-w-xl mx-auto text-slate-700 leading-relaxed px-4">
                {settings.certificateBodyText || t('completed_course_text')}
              </p>
            </div>

            {/* Bottom Signatures & Seal */}
            <div className="flex items-end justify-between border-t border-[#8b6e38]/30 pt-4 px-4">
              <div className="text-center">
                <span className="text-xs font-serif text-slate-800 font-medium block">
                  {issueDate}
                </span>
                <div className="w-36 border-t border-slate-400 mt-1 pt-1">
                  <span className="text-[10px] uppercase tracking-wider text-slate-500 font-sans">
                    {t('issue_date')}
                  </span>
                </div>
              </div>

              <div className="text-center flex flex-col items-center">
                <div className="w-16 h-16 rounded-full border-4 border-double border-[#8b6e38] flex items-center justify-center bg-[#fbf6ec] shadow-inner mb-1">
                  <Award className="w-8 h-8 text-[#8b6e38]" />
                </div>
                <span className="text-[9px] font-bold uppercase tracking-widest text-[#8b6e38]">
                  Official Seal
                </span>
              </div>

              <div className="text-center">
                <span className="text-xs font-serif font-semibold text-slate-800 block italic">
                  {settings.directorName || 'Pst. Ernesto Ricci'}
                </span>
                <div className="w-44 border-t border-slate-400 mt-1 pt-1">
                  <span className="text-[10px] uppercase tracking-wider text-slate-500 font-sans">
                    {settings.directorTitle || 'VOP School Director'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Progress & Save Bar Section Matching Screenshot 1 Exactly */}
        <div className="max-w-md mx-auto mt-6 text-center space-y-4">
          {/* Solid Orange Progress Bar */}
          <div>
            <div className="h-3 bg-slate-200 rounded-full overflow-hidden mb-1.5">
              <div className="h-full bg-[#ff9900] rounded-full w-full" />
            </div>
            <span className="text-xs font-bold text-slate-600">
              Guides completed: 1/1
            </span>
          </div>

          {/* Subtext */}
          <p className="text-xs text-slate-500 font-medium">
            Save • Screenshot • Share
          </p>

          {/* Large Royal Blue SAVE Pill Button (Matching Screenshot 1) */}
          <button
            onClick={handleDownloadImage}
            disabled={isExporting}
            className="w-full py-3.5 rounded-full bg-[#002d72] hover:bg-[#002257] text-white font-extrabold text-sm uppercase tracking-wider shadow-lg shadow-[#002d72]/25 transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Download size={18} />
            <span>{isExporting ? 'GENERATING CERTIFICATE...' : 'SAVE'}</span>
          </button>

          {/* Secondary Action Links */}
          <div className="flex items-center justify-center gap-4 pt-2 text-xs font-semibold text-slate-600">
            <button
              onClick={handlePrint}
              className="hover:text-[#002d72] flex items-center gap-1 cursor-pointer"
            >
              <Printer size={14} />
              <span>Print</span>
            </button>
            <span>•</span>
            <button
              onClick={handleShare}
              className="hover:text-[#002d72] flex items-center gap-1 cursor-pointer"
            >
              <Share2 size={14} />
              <span>Share</span>
            </button>
            <span>•</span>
            <button
              onClick={() => setIsEditingName(true)}
              className="hover:text-[#002d72] flex items-center gap-1 cursor-pointer"
            >
              <Edit3 size={14} />
              <span>Edit Name</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
