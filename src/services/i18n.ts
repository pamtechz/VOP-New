import { LanguageCode, CustomLanguage, AppSettings } from '../types';
import { getStoredAutoLocalization, registerLocalizationString } from './storage';

export const getAvailableLanguages = (settings?: AppSettings): CustomLanguage[] => {
  return (settings?.customLanguages ?? [])
    .filter(language => language.enabled !== false && language.code.trim() && language.name.trim())
    .map(language => ({ ...language, code: language.code.trim().toLowerCase() }))
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));
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
    switch_persona: 'Switch Persona (Demo / Testing)',
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
  bem: {
    app_title: 'Voice of Prophecy',
    school_subtitle: 'Isukulu lya Baibolo mu Makalata',
    greeting_prefix: 'Mwapoleni',
    welcome_back: 'Mwaiseni kabili ku masambililo ya Baibolo',
    my_certificate: 'Satifiketi Yandi',
    certificate_button: 'Satifiketi',
    admin_panel: 'Icipande ca Batungulushi',
    recent_guides: 'Amasambililo ya Nshita Ino',
    discover_curriculum: 'Amasambililo ya Kusanga Icine',
    open_guide: 'Isuleni Isambililo',
    completed: 'Cilipwile',
    in_progress: 'Cilecita',
    ready_to_learn: 'Uiteyenye Ukusambilila',
    manage_account: 'Lolekesheni Akaunti Yenu',
    your_progress: 'Ukulunduluka Kwenu',
    progress_desc: 'Uko mwafika mu kusambilila na fintu fishalako pa kuti mupokelele satifiketi.',
    library_books: 'Ilaibulale lya Vitabo',
    about_support: 'Palifwe no Bwafwilisho',
    contact_whatsapp: 'Lembeleni pa WhatsApp',
    switch_persona: 'Cinjeniko Umuntu (Kwesha)',
    course_certificate: 'SATIFIKETI YA MASAMBILILO',
    certified_text: 'Ici cilelangilila ukuti',
    completed_course_text: 'napwisha bwino AMASAMBILILO YA BAIBOLO ayapekanywa ne Calici lya Seventh-day Adventist',
    issue_date: 'Ubushiku bwa kupelwapo',
    save_image: 'SUNGENI',
    print: 'Printa',
    share: 'Akeniko bambi',
    true_btn: 'CINE',
    false_btn: 'BUFI',
    next_question: 'Icipusho Cikonkelepo',
    view_results: 'Moneni Ifyafuma',
    retake_test: 'Bwekeshenipo Ukwesha',
    begin_test: 'Tampeni Ukwesha Nombaline',
    read_aloud: 'Belengeni mu Kupongomoka',
    complete_lesson: 'Pwilisheni Isambililo',
    next_page: 'Ibula Likonkelepo',
    previous_page: 'Ibula lya Fumako',
    prayer_requests: 'Amapepo ya Kulomba',
    vop_radio: 'Wileshi ya VOP',
    organizations_churches: 'Amacalici no Butungulushi',
    super_admin_console: 'Akansolo ka Batungulushi Bakalamba',
    localization_studio: 'Icipande ca Ndimi'
  },
  nya: {
    app_title: 'Voice of Prophecy',
    school_subtitle: 'Sukulu ya Baibolo ya Makalata',
    greeting_prefix: 'Moni',
    welcome_back: 'Mwalandiridwa ku maphunziro a Baibolo',
    my_certificate: 'Satifiketi Yanga',
    certificate_button: 'Satifiketi',
    admin_panel: 'Gawo la Atsogoleri',
    recent_guides: 'Maphunziro Atsopano',
    discover_curriculum: 'Maphunziro a Pezani Choonadi',
    open_guide: 'Tsegulani Phunziro',
    completed: 'Mwatsiriza',
    in_progress: 'Mukupitiriza',
    ready_to_learn: 'Wokonzeka Kuphunzira',
    manage_account: 'Yang\'anirani Akaunti Yanu',
    your_progress: 'Kupita Patsogolo Kwanu',
    progress_desc: 'Pamene mwafika pophunzira ndi zimene zatsala kuti mulandire satifiketi.',
    library_books: 'Laibulale ya Mabuku',
    about_support: 'Za Ife ndi Chithandizo',
    contact_whatsapp: 'Lembani pa WhatsApp',
    switch_persona: 'Sinthani Munthu',
    course_certificate: 'SATIFIKETI YA MAPHUNZIRO',
    certified_text: 'Izi zikuchitira umboni kuti',
    completed_course_text: 'wamaliza bwino MAPHUNZIRO A BAIBOLO operekedwa ndi Mpingo wa Seventh-day Adventist',
    issue_date: 'Tsiku lolandirira',
    save_image: 'SUNGANI',
    print: 'Sindikizani',
    share: 'Gawiranani',
    true_btn: 'ZOONA',
    false_btn: 'ZONAMA',
    next_question: 'Funso Lotsatira',
    view_results: 'Onani Zotsatira',
    retake_test: 'Yeseraninso Mayeso',
    begin_test: 'Yambani Mayeso Tsopano',
    read_aloud: 'Werengani Mokweza',
    complete_lesson: 'Malizani Phunziro',
    next_page: 'Tsamba Lotsatira',
    previous_page: 'Tsamba Lapita',
    prayer_requests: 'Zopempha za Mapemphero',
    vop_radio: 'Wailesi ya VOP',
    organizations_churches: 'Mipingo ndi Utsogoleri',
    super_admin_console: 'Utsogoleri Waukulu',
    localization_studio: 'Chigawo cha Zinenero'
  },
  ton: {
    app_title: 'Voice of Prophecy',
    school_subtitle: 'Cikolo ca Bbaibbele ca Magwalo',
    greeting_prefix: 'Mwabuka buti',
    welcome_back: 'Mwatambulwa kabili ku ziiyo zya Bbaibbele',
    my_certificate: 'Satifiketi Yangu',
    certificate_button: 'Satifiketi',
    admin_panel: 'Bweendelezi',
    recent_guides: 'Ziiyo zya Cino Ciindi',
    discover_curriculum: 'Ziiyo zyakubona Kasimpe',
    open_guide: 'Jula Ciiyo',
    completed: 'Camanana',
    in_progress: 'Cileenda kabotu',
    ready_to_learn: 'Ulibambide Kwiiya',
    manage_account: 'Langisya Akaunti Yako',
    your_progress: 'Kuzwidilila Kwako',
    progress_desc: 'Mpuwasika mukwiiya a zicasala kuti utambule satifiketi.',
    library_books: 'Mabbuku a Mwuuya',
    about_support: 'Makani Eswe a Lugwasyo',
    contact_whatsapp: 'Tumila a WhatsApp',
    switch_persona: 'Cinca Muntu',
    course_certificate: 'SATIFIKETI YABWIIYI',
    certified_text: 'Eechi citondezya kuti',
    completed_course_text: 'wamana kabotu ZIIYO ZYA BBAIBBELE mbuli mbocakabikkwa a Cikombelo ca Seventh-day Adventist',
    issue_date: 'Buzuba bwakupeda',
    save_image: 'YBAMBA',
    print: 'Gwisya pa Pepa',
    share: 'Aabila Bambi',
    true_btn: 'MASIMPE',
    false_btn: 'KUBEJA',
    next_question: 'Mubuzyo Utobela',
    view_results: 'Langa Zyakazwa',
    retake_test: 'Alusya Kusunka',
    begin_test: 'Talika Kusunka Lino',
    read_aloud: 'Bala Kumvwigwa',
    complete_lesson: 'Mana Ciiyo',
    next_page: 'Peeji Litobela',
    previous_page: 'Peeji Lyainda',
    prayer_requests: 'Kukomba kwayanda',
    vop_radio: 'Wayilezi ya VOP',
    organizations_churches: 'Zikombelo a Bweendelezi',
    super_admin_console: 'Bweendelezi Bwakumulu',
    localization_studio: 'Cibeela ca Milaka'
  }
};

export const getTranslation = (
  key: string,
  lang: LanguageCode = 'en',
  customTranslations?: Record<string, Record<string, string>>,
  defaultFallback?: string,
  componentName?: string
): string => {
  const fallbackEnglish = defaultFallback || (DEFAULT_TRANSLATIONS.en && DEFAULT_TRANSLATIONS.en[key]) || key;
  
  // Auto-discover in background
  try {
    registerLocalizationString(key, fallbackEnglish, componentName);
  } catch {
    // silent catch
  }

  // 1. Check custom overrides from admin settings
  if (customTranslations && customTranslations[lang] && customTranslations[lang][key]) {
    return customTranslations[lang][key];
  }

  // 2. Check auto-discovered translations in storage
  try {
    const autoEntries = getStoredAutoLocalization();
    const entry = autoEntries.find(e => e.key === key);
    if (entry && entry.translations && entry.translations[lang]) {
      return entry.translations[lang];
    }
  } catch {
    // silent catch
  }

  // 3. Check seeded dictionaries
  const dict = DEFAULT_TRANSLATIONS[lang] || DEFAULT_TRANSLATIONS.en;
  if (dict && dict[key]) {
    return dict[key];
  }

  if (DEFAULT_TRANSLATIONS.en && DEFAULT_TRANSLATIONS.en[key]) {
    return DEFAULT_TRANSLATIONS.en[key];
  }

  return fallbackEnglish;
};

export const MASTER_TRANSLATION_KEYS = Object.keys(DEFAULT_TRANSLATIONS.en).map((k) => ({
  key: k,
  defaultEn: DEFAULT_TRANSLATIONS.en[k]
}));
