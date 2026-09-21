import { LanguageCode, CustomLanguage, AppSettings } from '../types';

export const DEFAULT_LANGUAGES: CustomLanguage[] = [];

export const LANGUAGE_NAMES: Record<string, { name: string; nativeName: string }> = {};

export const getAvailableLanguages = (settings?: AppSettings): CustomLanguage[] => {
  return [...(settings?.customLanguages ?? [])]
    .filter(language => language.enabled !== false)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
};

export const DEFAULT_TRANSLATIONS: Record<LanguageCode, Record<string, string>> = {
  en: {
    app_title: 'Voice of Prophecy',
    school_subtitle: 'Bible Correspondence School',
    greeting_prefix: 'Hello',
    welcome_back: 'Welcome back to Bible Study',
    my_certificate: 'My Certificate',
    certificate_button: 'Certificate',
    admin_panel: 'Admin Panel',
    recent_guides: 'Recent Guides',
    discover_curriculum: 'Discover Bible Curriculum',
    open_guide: 'Open Guide',
    completed: 'Completed',
    in_progress: 'In Progress',
    ready_to_learn: 'Ready to Learn',
    manage_account: 'Manage your VOP account',
    your_progress: 'Your Progress',
    progress_desc: 'How far you have gone in your learning and what remains before you are certified.',
    library_books: 'Library & E-Books',
    about_support: 'About & Support',
    contact_whatsapp: 'Contact WhatsApp',
    switch_persona: 'Switch Persona',
    course_certificate: 'COURSE CERTIFICATE',
    certified_text: 'This is to certify that',
    completed_course_text: 'has successfully completed the BIBLE CORRESPONDENCE COURSE as outlined by the Seventh-day Adventist Church',
    issue_date: 'Issue date',
    save_image: 'SAVE',
    print: 'Print',
    share: 'Share',
    true_btn: 'TRUE',
    false_btn: 'FALSE',
    next_question: 'Next Question',
    view_results: 'View Results',
    retake_test: 'Retake Test',
    begin_test: 'Begin Test Now',
    read_aloud: 'Read Aloud',
    complete_lesson: 'Complete Lesson',
    next_page: 'Next Page',
    previous_page: 'Previous',
    prayer_requests: 'Prayer Requests',
    vop_radio: 'VOP Radio & Broadcasts',
    organizations_churches: 'Churches & Hierarchy',
    super_admin_console: 'Super Admin Console',
    localization_studio: 'Localization Studio'
  },
};

export const getTranslation = (
  key: string,
  lang: LanguageCode = '',
  customTranslations?: Record<string, Record<string, string>>,
  defaultFallback?: string,
  _componentName?: string,
): string => {
  if (customTranslations?.[lang]?.[key]) return customTranslations[lang][key];
  if (DEFAULT_TRANSLATIONS.en[key]) return lang === 'en'
    ? DEFAULT_TRANSLATIONS.en[key]
    : (customTranslations?.en?.[key] || DEFAULT_TRANSLATIONS.en[key]);
  return defaultFallback || key;
};

export const MASTER_TRANSLATION_KEYS = Object.keys(DEFAULT_TRANSLATIONS.en).map((key) => ({
  key,
  defaultEn: DEFAULT_TRANSLATIONS.en[key],
}));
