import React, { useState } from 'react';
import { AppSettings, LanguageCode } from '../types';
import { getTranslation } from '../services/i18n';
import { ArrowLeft, BookOpen, Clock, MapPin, Phone, Mail, MessageCircle, Info } from 'lucide-react';

interface AboutPageProps {
  settings: AppSettings;
  activeLanguage: LanguageCode;
  onBack: () => void;
}

export const AboutPage: React.FC<AboutPageProps> = ({
  settings,
  activeLanguage,
  onBack
}) => {
  const [activeTab, setActiveTab] = useState<'ministry' | 'app' | 'contact'>('ministry');
  const details = settings.detailPages;

  const t = (key: string, fallback: string) =>
    getTranslation(key, activeLanguage, settings.customTranslations, fallback, 'AboutPage');

  return (
    <div className="min-h-screen bg-[#f4f6fa] text-slate-800 pb-24 md:pb-12">
      {/* Top Banner - Deep Royal Blue (#002d72) Matching Original APK */}
      <div className="bg-[#002d72] text-white pt-5 pb-7 px-4 sm:px-6 shadow-md">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between gap-4 mb-5">
            <button
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-white/90 hover:text-white transition-colors cursor-pointer py-1"
            >
              <ArrowLeft size={22} />
              <span className="font-bold text-base sm:text-lg">About Voice of Prophecy</span>
            </button>
            <span className="text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-white/15 text-amber-300 border border-white/20">
              Official Ministry Portal
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 text-center sm:text-left">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-white/10 border-2 border-white/30 flex items-center justify-center p-2.5 shadow-lg overflow-hidden flex-shrink-0">
              <img src="/assets/vop_logo.png" alt="VOP Logo" className="w-full h-full object-contain" />
            </div>
            <div>
              <h1 className="text-xl sm:text-3xl font-black text-white tracking-tight">
                {settings.appName || 'Voice of Prophecy'}
              </h1>
              <p className="text-xs sm:text-sm text-blue-100/90 mt-0.5">
                {settings.schoolName} • {settings.organizationName}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 -mt-3">
        {/* Navigation Pill Tabs */}
        <div className="flex items-center justify-center gap-2 mb-6 overflow-x-auto pb-1">
          <button
            onClick={() => setActiveTab('ministry')}
            className={`px-4 py-2 rounded-full text-xs font-bold transition-all shadow-xs cursor-pointer ${
              activeTab === 'ministry'
                ? 'bg-[#002d72] text-white'
                : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
            }`}
          >
            {t('about.mission', 'About Ministry & Mission')}
          </button>
          <button
            onClick={() => setActiveTab('app')}
            className={`px-4 py-2 rounded-full text-xs font-bold transition-all shadow-xs cursor-pointer ${
              activeTab === 'app'
                ? 'bg-[#002d72] text-white'
                : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
            }`}
          >
            {t('about.aboutVop', 'About This Application')}
          </button>
          <button
            onClick={() => setActiveTab('contact')}
            className={`px-4 py-2 rounded-full text-xs font-bold transition-all shadow-xs cursor-pointer ${
              activeTab === 'contact'
                ? 'bg-[#002d72] text-white'
                : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
            }`}
          >
            {t('about.contactOffices', 'Offices & Contact')}
          </button>
        </div>

        {activeTab === 'ministry' && (
          <div className="space-y-5 animate-fadeIn">
            {/* Mission Card */}
            <div className="bg-white rounded-2xl p-6 sm:p-7 shadow-sm border border-slate-200/80">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
                  <BookOpen size={18} />
                </div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900">Our Mission & Purpose</h2>
              </div>
              <p className="text-slate-600 leading-relaxed text-xs sm:text-sm">
                {details?.aboutUsMission ||
                  'The Voice of Prophecy Bible Correspondence School exists to lead souls to Christ through Christ-centered correspondence lessons and community evangelism.'}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* History Card */}
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200/80">
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 text-[#002d72] flex items-center justify-center font-bold">
                    <Clock size={18} />
                  </div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900">Our Heritage & History</h3>
                </div>
                <p className="text-slate-600 text-xs sm:text-sm leading-relaxed">
                  {details?.aboutUsHistory ||
                    'With decades of faithful service in Southern Africa, the Voice of Prophecy has guided hundreds of thousands of candidates into truth and baptism.'}
                </p>
              </div>

              {/* Leadership Card */}
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200/80">
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                    <Info size={18} />
                  </div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900">Ministry Leadership</h3>
                </div>
                <p className="text-slate-600 text-xs sm:text-sm leading-relaxed">
                  {details?.aboutUsLeadership ||
                    'Supervised by the Personal Ministries Department under Director Pst. Ernesto Ricci, in full collaboration with conference presidents and district pastors.'}
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'app' && (
          <div className="space-y-5 animate-fadeIn">
            <div className="bg-white rounded-2xl p-6 sm:p-7 shadow-sm border border-slate-200/80">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 mb-2">About Voice of Prophecy App</h2>
              <p className="text-slate-600 leading-relaxed text-xs sm:text-sm">
                {details?.aboutAppDescription ||
                  'The Voice of Prophecy App is a next-generation Bible correspondence learning system operating simultaneously on Web and native Android.'}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6 pt-5 border-t border-slate-100">
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/70">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">Application Version</span>
                  <span className="text-xs sm:text-sm font-bold text-slate-800">
                    {details?.aboutAppVersion || 'Version 4.0.0 Pro'}
                  </span>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/70">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">Platform</span>
                  <span className="text-xs sm:text-sm font-bold text-slate-800">Dual Web & Android Native</span>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/70">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">Offline Support</span>
                  <span className="text-xs sm:text-sm font-bold text-emerald-700">100% Offline Enabled</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200/80">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 mb-1.5">Development Credits</h3>
              <p className="text-slate-600 text-xs sm:text-sm leading-relaxed">
                {details?.aboutAppCredits ||
                  'Engineered for the Voice of Prophecy Bible Correspondence School. All rights reserved by the Seventh-day Adventist Church.'}
              </p>
            </div>
          </div>
        )}

        {activeTab === 'contact' && (
          <div className="space-y-5 animate-fadeIn">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200/80">
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
                    <MapPin size={18} />
                  </div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900">Headquarters Office</h3>
                </div>
                <p className="text-slate-600 text-xs sm:text-sm leading-relaxed mb-4">
                  {details?.contactOfficeAddress ||
                    'Plot 9221, Corner of Burma & Independence Avenue, P.O. Box 31309, Lusaka, Zambia'}
                </p>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/70 text-xs text-slate-600">
                  <span className="font-bold text-slate-800 block mb-0.5">Office Hours</span>
                  {details?.contactOfficeHours ||
                    'Monday – Thursday: 08:00 – 17:00 | Friday: 08:00 – 12:30 | Sabbath & Sunday: Closed'}
                </div>
              </div>

              <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200/80 space-y-4">
                <h3 className="text-sm sm:text-base font-bold text-slate-900 mb-2">Direct Communication</h3>

                {details?.contactPhoneNumbers && details.contactPhoneNumbers.length > 0 && (
                  <div>
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Phone Enquiries</span>
                    <div className="space-y-1">
                      {details.contactPhoneNumbers.map((phone, idx) => (
                        <a
                          key={idx}
                          href={`tel:${phone.replace(/\s+/g, '')}`}
                          className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-[#002d72] hover:underline"
                        >
                          <Phone size={14} />
                          <span>{phone}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {details?.contactEmails && details.contactEmails.length > 0 && (
                  <div>
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Email Enquiries</span>
                    <div className="space-y-1">
                      {details.contactEmails.map((email, idx) => (
                        <a
                          key={idx}
                          href={`mailto:${email}`}
                          className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-[#002d72] hover:underline"
                        >
                          <Mail size={14} />
                          <span>{email}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {settings.whatsappNumber && (
                  <div className="pt-2">
                    <a
                      href={`https://wa.me/${settings.whatsappNumber.replace(/[^0-9]/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-wider transition-colors shadow-sm"
                    >
                      <MessageCircle size={16} />
                      <span>Chat on WhatsApp</span>
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
