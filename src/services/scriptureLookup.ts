/**
 * Scripture Reference Parser and Lookup Service for Voice of Prophecy
 * Provides offline-first scripture reference detection, instant lookup for core passages,
 * safe remote fallback from public domain Bible APIs, and local caching.
 */

export interface ScriptureLookupResult {
  reference: string;
  text: string;
  translation: string;
  source: 'curated' | 'remote' | 'cached' | 'fallback';
}

export interface ScriptureTextToken {
  text: string;
  isScripture: boolean;
  reference?: string;
}

// Canonical list of Bible books and accepted abbreviations
interface BibleBookMeta {
  canonical: string;
  aliases: string[];
}

const BIBLE_BOOKS: BibleBookMeta[] = [
  // Old Testament
  { canonical: 'Genesis', aliases: ['gen', 'ge', 'gn'] },
  { canonical: 'Exodus', aliases: ['exod', 'exo', 'ex'] },
  { canonical: 'Leviticus', aliases: ['lev', 'le', 'lv'] },
  { canonical: 'Numbers', aliases: ['num', 'nu', 'nm', 'nb'] },
  { canonical: 'Deuteronomy', aliases: ['deut', 'deu', 'dt'] },
  { canonical: 'Joshua', aliases: ['josh', 'jos', 'jsh'] },
  { canonical: 'Judges', aliases: ['judg', 'jdg', 'jg', 'jdgs'] },
  { canonical: 'Ruth', aliases: ['rth', 'ru'] },
  { canonical: '1 Samuel', aliases: ['1 sam', '1sam', '1sa', '1s', 'i sam', 'i samuel'] },
  { canonical: '2 Samuel', aliases: ['2 sam', '2sam', '2sa', '2s', 'ii sam', 'ii samuel'] },
  { canonical: '1 Kings', aliases: ['1 kgs', '1kgs', '1 ki', '1ki', '1k', 'i kgs', 'i kings'] },
  { canonical: '2 Kings', aliases: ['2 kgs', '2kgs', '2 ki', '2ki', '2k', 'ii kgs', 'ii kings'] },
  { canonical: '1 Chronicles', aliases: ['1 chron', '1chron', '1 chr', '1chr', '1ch', 'i chron'] },
  { canonical: '2 Chronicles', aliases: ['2 chron', '2chron', '2 chr', '2chr', '2ch', 'ii chron'] },
  { canonical: 'Ezra', aliases: ['ezr', 'ez'] },
  { canonical: 'Nehemiah', aliases: ['neh', 'ne'] },
  { canonical: 'Esther', aliases: ['esth', 'est', 'es'] },
  { canonical: 'Job', aliases: ['jb'] },
  { canonical: 'Psalms', aliases: ['psalm', 'psalms', 'ps', 'psa', 'pss', 'amalumbo', 'masalimo', 'salimo', 'zaburi'] },
  { canonical: 'Proverbs', aliases: ['prov', 'prv', 'pr', 'pro'] },
  { canonical: 'Ecclesiastes', aliases: ['eccles', 'eccl', 'ecc', 'ec'] },
  { canonical: 'Song of Solomon', aliases: ['song of songs', 'song', 'canticles', 'sos', 'ss'] },
  { canonical: 'Isaiah', aliases: ['isa', 'is'] },
  { canonical: 'Jeremiah', aliases: ['jer', 'je', 'jr'] },
  { canonical: 'Lamentations', aliases: ['lam', 'la'] },
  { canonical: 'Ezekiel', aliases: ['ezek', 'eze', 'ezk'] },
  { canonical: 'Daniel', aliases: ['dan', 'da', 'dn'] },
  { canonical: 'Hosea', aliases: ['hos', 'ho'] },
  { canonical: 'Joel', aliases: ['joe', 'jl'] },
  { canonical: 'Amos', aliases: ['am'] },
  { canonical: 'Obadiah', aliases: ['obad', 'oba', 'ob'] },
  { canonical: 'Jonah', aliases: ['jon', 'jnh'] },
  { canonical: 'Micah', aliases: ['mic', 'mc'] },
  { canonical: 'Nahum', aliases: ['nah', 'na'] },
  { canonical: 'Habakkuk', aliases: ['hab', 'hb'] },
  { canonical: 'Zephaniah', aliases: ['zeph', 'zep', 'zp'] },
  { canonical: 'Haggai', aliases: ['hag', 'hg'] },
  { canonical: 'Zechariah', aliases: ['zech', 'zec', 'zc'] },
  { canonical: 'Malachi', aliases: ['mal', 'ml'] },
  // New Testament
  { canonical: 'Matthew', aliases: ['matt', 'mat', 'mt'] },
  { canonical: 'Mark', aliases: ['mrk', 'mk', 'mr'] },
  { canonical: 'Luke', aliases: ['luk', 'lk'] },
  { canonical: 'John', aliases: ['jhn', 'jn', 'j'] },
  { canonical: 'Acts', aliases: ['act', 'ac'] },
  { canonical: 'Romans', aliases: ['rom', 'ro', 'rm'] },
  { canonical: '1 Corinthians', aliases: ['1 cor', '1cor', '1 co', '1co', 'i cor', 'i corinthians'] },
  { canonical: '2 Corinthians', aliases: ['2 cor', '2cor', '2 co', '2co', 'ii cor', 'ii corinthians'] },
  { canonical: 'Galatians', aliases: ['gal', 'ga'] },
  { canonical: 'Ephesians', aliases: ['eph', 'ep'] },
  { canonical: 'Philippians', aliases: ['phil', 'php', 'phi', 'ph'] },
  { canonical: 'Colossians', aliases: ['col', 'cl'] },
  { canonical: '1 Thessalonians', aliases: ['1 thess', '1thess', '1 th', '1th', 'i thess', 'i thessalonians'] },
  { canonical: '2 Thessalonians', aliases: ['2 thess', '2thess', '2 th', '2th', 'ii thess', 'ii thessalonians'] },
  { canonical: '1 Timothy', aliases: ['1 tim', '1tim', '1 ti', '1ti', 'i tim', 'i timothy'] },
  { canonical: '2 Timothy', aliases: ['2 tim', '2tim', '2 ti', '2ti', 'ii tim', 'ii timothy'] },
  { canonical: 'Titus', aliases: ['tit', 'ti'] },
  { canonical: 'Philemon', aliases: ['philem', 'phlm', 'phm'] },
  { canonical: 'Hebrews', aliases: ['heb', 'he'] },
  { canonical: 'James', aliases: ['jas', 'jam', 'jm'] },
  { canonical: '1 Peter', aliases: ['1 pet', '1pet', '1 pe', '1pe', '1p', 'i pet', 'i peter'] },
  { canonical: '2 Peter', aliases: ['2 pet', '2pet', '2 pe', '2pe', '2p', 'ii pet', 'ii peter'] },
  { canonical: '1 John', aliases: ['1 jn', '1jn', '1 jhn', '1jhn', '1 jo', '1jo', '1j', 'i jn', 'i john'] },
  { canonical: '2 John', aliases: ['2 jn', '2jn', '2 jhn', '2jhn', '2 jo', '2jo', '2j', 'ii jn', 'ii john'] },
  { canonical: '3 John', aliases: ['3 jn', '3jn', '3 jhn', '3jhn', '3 jo', '3jo', '3j', 'iii jn', 'iii john'] },
  { canonical: 'Jude', aliases: ['jud', 'jd'] },
  { canonical: 'Revelation', aliases: ['rev', 're', 'apocalypse', 'rv'] },
];

// Map lookup table for normalized prefix matching
const BOOK_ALIAS_MAP = new Map<string, string>();
for (const book of BIBLE_BOOKS) {
  const normCanonical = book.canonical.toLowerCase().replace(/[^a-z0-9]/g, '');
  BOOK_ALIAS_MAP.set(normCanonical, book.canonical);
  for (const alias of book.aliases) {
    const normAlias = alias.toLowerCase().replace(/[^a-z0-9]/g, '');
    BOOK_ALIAS_MAP.set(normAlias, book.canonical);
  }
}

/**
 * Built-in curated scripture repository containing foundational Voice of Prophecy,
 * Sabbath, Prophecy, and Core Christian salvation passages.
 * Available offline with 0ms latency.
 */
export const CURATED_SCRIPTURES: Record<string, { reference: string; text: string; translation: string }> = {
  'john 3:16': {
    reference: 'John 3:16',
    text: 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.',
    translation: 'KJV',
  },
  'romans 6:23': {
    reference: 'Romans 6:23',
    text: 'For the wages of sin is death; but the gift of God is eternal life through Jesus Christ our Lord.',
    translation: 'KJV',
  },
  'revelation 14:6-7': {
    reference: 'Revelation 14:6-7',
    text: 'And I saw another angel fly in the midst of heaven, having the everlasting gospel to preach unto them that dwell on the earth, and to every nation, and kindred, and tongue, and people, Saying with a loud voice, Fear God, and give glory to him; for the hour of his judgment is come: and worship him that made heaven, and earth, and the sea, and the fountains of waters.',
    translation: 'KJV',
  },
  'revelation 14:6': {
    reference: 'Revelation 14:6',
    text: 'And I saw another angel fly in the midst of heaven, having the everlasting gospel to preach unto them that dwell on the earth, and to every nation, and kindred, and tongue, and people.',
    translation: 'KJV',
  },
  'revelation 14:12': {
    reference: 'Revelation 14:12',
    text: 'Here is the patience of the saints: here are they that keep the commandments of God, and the faith of Jesus.',
    translation: 'KJV',
  },
  'exodus 20:8-11': {
    reference: 'Exodus 20:8-11',
    text: 'Remember the sabbath day, to keep it holy. Six days shalt thou labour, and do all thy work: But the seventh day is the sabbath of the LORD thy God: in it thou shalt not do any work... For in six days the LORD made heaven and earth, the sea, and all that in them is, and rested the seventh day: wherefore the LORD blessed the sabbath day, and hallowed it.',
    translation: 'KJV',
  },
  'exodus 20:8': {
    reference: 'Exodus 20:8',
    text: 'Remember the sabbath day, to keep it holy.',
    translation: 'KJV',
  },
  'genesis 1:1': {
    reference: 'Genesis 1:1',
    text: 'In the beginning God created the heaven and the earth.',
    translation: 'KJV',
  },
  'genesis 2:1-3': {
    reference: 'Genesis 2:1-3',
    text: 'Thus the heavens and the earth were finished, and all the host of them. And on the seventh day God ended his work which he had made; and he rested on the seventh day from all his work which he had made. And God blessed the seventh day, and sanctified it: because that in it he had rested from all his work which God created and made.',
    translation: 'KJV',
  },
  'genesis 2:2-3': {
    reference: 'Genesis 2:2-3',
    text: 'And on the seventh day God ended his work which he had made; and he rested on the seventh day from all his work which he had made. And God blessed the seventh day, and sanctified it: because that in it he had rested from all his work which God created and made.',
    translation: 'KJV',
  },
  'matthew 28:18-20': {
    reference: 'Matthew 28:18-20',
    text: 'And Jesus came and spake unto them, saying, All power is given unto me in heaven and in earth. Go ye therefore, and teach all nations, baptizing them in the name of the Father, and of the Son, and of the Holy Ghost: Teaching them to observe all things whatsoever I have commanded you: and, lo, I am with you alway, even unto the end of the world.',
    translation: 'KJV',
  },
  'matthew 28:19-20': {
    reference: 'Matthew 28:19-20',
    text: 'Go ye therefore, and teach all nations, baptizing them in the name of the Father, and of the Son, and of the Holy Ghost: Teaching them to observe all things whatsoever I have commanded you: and, lo, I am with you alway, even unto the end of the world.',
    translation: 'KJV',
  },
  'jeremiah 29:11': {
    reference: 'Jeremiah 29:11',
    text: 'For I know the thoughts that I think toward you, saith the LORD, thoughts of peace, and not of evil, to give you an expected end.',
    translation: 'KJV',
  },
  'proverbs 3:5-6': {
    reference: 'Proverbs 3:5-6',
    text: 'Trust in the LORD with all thine heart; and lean not unto thine own understanding. In all thy ways acknowledge him, and he shall direct thy paths.',
    translation: 'KJV',
  },
  'philippians 4:13': {
    reference: 'Philippians 4:13',
    text: 'I can do all things through Christ which strengtheneth me.',
    translation: 'KJV',
  },
  'romans 8:28': {
    reference: 'Romans 8:28',
    text: 'And we know that all things work together for good to them that love God, to them who are the called according to his purpose.',
    translation: 'KJV',
  },
  'ephesians 2:8-9': {
    reference: 'Ephesians 2:8-9',
    text: 'For by grace are ye saved through faith; and that not of yourselves: it is the gift of God: Not of works, lest any man should boast.',
    translation: 'KJV',
  },
  'ephesians 2:8-10': {
    reference: 'Ephesians 2:8-10',
    text: 'For by grace are ye saved through faith; and that not of yourselves: it is the gift of God: Not of works, lest any man should boast. For we are his workmanship, created in Christ Jesus unto good works, which God hath before ordained that we should walk in them.',
    translation: 'KJV',
  },
  '2 timothy 3:16-17': {
    reference: '2 Timothy 3:16-17',
    text: 'All scripture is given by inspiration of God, and is profitable for doctrine, for reproof, for correction, for instruction in righteousness: That the man of God may be perfect, throughly furnished unto all good works.',
    translation: 'KJV',
  },
  '2 timothy 3:16': {
    reference: '2 Timothy 3:16',
    text: 'All scripture is given by inspiration of God, and is profitable for doctrine, for reproof, for correction, for instruction in righteousness.',
    translation: 'KJV',
  },
  '1 thessalonians 4:16-17': {
    reference: '1 Thessalonians 4:16-17',
    text: 'For the Lord himself shall descend from heaven with a shout, with the voice of the archangel, and with the trump of God: and the dead in Christ shall rise first: Then we which are alive and remain shall be caught up together with them in the clouds, to meet the Lord in the air: and so shall we ever be with the Lord.',
    translation: 'KJV',
  },
  // Public-domain KJV text for the localized citation Amalumbo 139:14.
  'psalms 139:14': {
    reference: 'Psalms 139:14',
    text: 'I will praise thee; for I am fearfully and wonderfully made: marvellous are thy works; and that my soul knoweth right well.',
    translation: 'KJV',
  },
  'psalms 23:1': {
    reference: 'Psalms 23:1',
    text: 'The LORD is my shepherd; I shall not want.',
    translation: 'KJV',
  },
  'psalm 23:1': {
    reference: 'Psalm 23:1',
    text: 'The LORD is my shepherd; I shall not want.',
    translation: 'KJV',
  },
  'hebrews 11:1': {
    reference: 'Hebrews 11:1',
    text: 'Now faith is the substance of things hoped for, the evidence of things not seen.',
    translation: 'KJV',
  },
  'hebrews 11:6': {
    reference: 'Hebrews 11:6',
    text: 'But without faith it is impossible to please him: for he that cometh to God must believe that he is, and that he is a rewarder of them that diligently seek him.',
    translation: 'KJV',
  },
  'acts 1:8': {
    reference: 'Acts 1:8',
    text: 'But ye shall receive power, after that the Holy Ghost is come upon you: and ye shall be witnesses unto me both in Jerusalem, and in all Judaea, and in Samaria, and unto the uttermost part of the earth.',
    translation: 'KJV',
  },
  '1 john 1:9': {
    reference: '1 John 1:9',
    text: 'If we confess our sins, he is faithful and just to forgive us our sins, and to cleanse us from all unrighteousness.',
    translation: 'KJV',
  },
  'revelation 21:4': {
    reference: 'Revelation 21:4',
    text: 'And God shall wipe away all tears from their eyes; and there shall be no more death, neither sorrow, nor crying, neither shall there be any more pain: for the former things are passed away.',
    translation: 'KJV',
  },
  'isaiah 40:31': {
    reference: 'Isaiah 40:31',
    text: 'But they that wait upon the LORD shall renew their strength; they shall mount up with wings as eagles; they shall run, and not be weary; and they shall walk, and not faint.',
    translation: 'KJV',
  },
  'joshua 1:9': {
    reference: 'Joshua 1:9',
    text: 'Have not I commanded thee? Be strong and of a good courage; be not afraid, neither be thou dismayed: for the LORD thy God is with thee whithersoever thou goest.',
    translation: 'KJV',
  },
  'romans 12:1-2': {
    reference: 'Romans 12:1-2',
    text: 'I beseech you therefore, brethren, by the mercies of God, that ye present your bodies a living sacrifice, holy, acceptable unto God, which is your reasonable service. And be not conformed to this world: but be ye transformed by the renewing of your mind, that ye may prove what is that good, and acceptable, and perfect, will of God.',
    translation: 'KJV',
  },
  'romans 12:2': {
    reference: 'Romans 12:2',
    text: 'And be not conformed to this world: but be ye transformed by the renewing of your mind, that ye may prove what is that good, and acceptable, and perfect, will of God.',
    translation: 'KJV',
  },
  'galatians 5:22-23': {
    reference: 'Galatians 5:22-23',
    text: 'But the fruit of the Spirit is love, joy, peace, longsuffering, gentleness, goodness, faith, Meekness, temperance: against such there is no law.',
    translation: 'KJV',
  },
  'micah 6:8': {
    reference: 'Micah 6:8',
    text: 'He hath shewed thee, O man, what is good; and what doth the LORD require of thee, but to do justly, and to love mercy, and to walk humbly with thy God?',
    translation: 'KJV',
  },
  'isaiah 58:13-14': {
    reference: 'Isaiah 58:13-14',
    text: 'If thou turn away thy foot from the sabbath, from doing thy pleasure on my holy day; and call the sabbath a delight, the holy of the LORD, honourable; and shalt honour him, not doing thine own ways, nor finding thine own pleasure, nor speaking thine own words: Then shalt thou delight thyself in the LORD; and I will cause thee to ride upon the high places of the earth.',
    translation: 'KJV',
  },
  'daniel 2:44': {
    reference: 'Daniel 2:44',
    text: 'And in the days of these kings shall the God of heaven set up a kingdom, which shall never be destroyed: and the kingdom shall not be left to other people, but it shall break in pieces and consume all these kingdoms, and it shall stand for ever.',
    translation: 'KJV',
  },
  'daniel 7:13-14': {
    reference: 'Daniel 7:13-14',
    text: 'I saw in the night visions, and, behold, one like the Son of man came with the clouds of heaven, and came to the Ancient of days, and they brought him near before him. And there was given him dominion, and glory, and a kingdom, that all people, nations, and languages, should serve him.',
    translation: 'KJV',
  },
  'revelation 12:17': {
    reference: 'Revelation 12:17',
    text: 'And the dragon was wroth with the woman, and went to make war with the remnant of her seed, which keep the commandments of God, and have the testimony of Jesus Christ.',
    translation: 'KJV',
  },
  'revelation 22:14': {
    reference: 'Revelation 22:14',
    text: 'Blessed are they that do his commandments, that they may have right to the tree of life, and may enter in through the gates into the city.',
    translation: 'KJV',
  },
  '1 corinthians 13:4-7': {
    reference: '1 Corinthians 13:4-7',
    text: 'Charity suffereth long, and is kind; charity envieth not; charity vaunteth not itself, is not puffed up, Doth not behave itself unseemly, seeketh not her own, is not easily provoked, thinketh no evil; Rejoiceth not in iniquity, but rejoiceth in the truth; Beareth all things, believeth all things, hopeth all things, endureth all things.',
    translation: 'KJV',
  },
  '1 corinthians 13:13': {
    reference: '1 Corinthians 13:13',
    text: 'And now abideth faith, hope, charity, these three; but the greatest of these is charity.',
    translation: 'KJV',
  },
  'matthew 11:28-30': {
    reference: 'Matthew 11:28-30',
    text: 'Come unto me, all ye that labour and are heavy laden, and I will give you rest. Take my yoke upon you, and learn of me; for I am meek and lowly in heart: and ye shall find rest unto your souls. For my yoke is easy, and my burden is light.',
    translation: 'KJV',
  },
  'john 14:1-3': {
    reference: 'John 14:1-3',
    text: 'Let not your heart be troubled: ye believe in God, believe also in me. In my Father’s house are many mansions: if it were not so, I would have told you. I go to prepare a place for you. And if I go and prepare a place for you, I will come again, and receive you unto myself; that where I am, there ye may be also.',
    translation: 'KJV',
  },
  'john 14:15': {
    reference: 'John 14:15',
    text: 'If ye love me, keep my commandments.',
    translation: 'KJV',
  },
  'hebrews 4:9-10': {
    reference: 'Hebrews 4:9-10',
    text: 'There remaineth therefore a rest to the people of God. For he that is entered into his rest, he also hath ceased from his own works, as God did from his.',
    translation: 'KJV',
  },
  'ecclesiastes 12:13-14': {
    reference: 'Ecclesiastes 12:13-14',
    text: 'Let us hear the conclusion of the whole matter: Fear God, and keep his commandments: for this is the whole duty of man. For God shall bring every work into judgment, with every secret thing, whether it be good, or whether it be evil.',
    translation: 'KJV',
  },
  'james 2:17': {
    reference: 'James 2:17',
    text: 'Even so faith, if it hath not works, is dead, being alone.',
    translation: 'KJV',
  },
  '1 peter 2:9': {
    reference: '1 Peter 2:9',
    text: 'But ye are a chosen generation, a royal priesthood, an holy nation, a peculiar people; that ye should shew forth the praises of him who hath called you out of darkness into his marvellous light.',
    translation: 'KJV',
  },
  'revelation 1:7': {
    reference: 'Revelation 1:7',
    text: 'Behold, he cometh with clouds; and every eye shall see him, and they also which pierced him: and all kindreds of the earth shall wail because of him. Even so, Amen.',
    translation: 'KJV',
  },
  'titus 2:11-13': {
    reference: 'Titus 2:11-13',
    text: 'For the grace of God that bringeth salvation hath appeared to all men, Teaching us that, denying ungodliness and worldly lusts, we should live soberly, righteously, and godly, in this present world; Looking for that blessed hope, and the glorious appearing of the great God and our Saviour Jesus Christ.',
    translation: 'KJV',
  },
};

/**
 * Identifies if a token prefix matches a recognized Bible book
 */
export function resolveBibleBook(rawBook: string): string | null {
  const cleaned = rawBook.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  return BOOK_ALIAS_MAP.get(cleaned) || null;
}

/**
 * Normalizes a raw Bible reference into standard format, e.g. "Jn 3:16" -> "John 3:16"
 */
export function normalizeScriptureReference(rawRef: string): string {
  const cleanedRef=rawRef.trim().replace(/^[“"'‘]+|[.”"'’\s]+$/g,'');
  const match = cleanedRef.match(/^((?:[123]\s*)?[A-Za-z]+(?:\.|\b))\s+(\d{1,3}):(\d{1,3})(?:-(\d{1,3}))?$/i);
  if (!match) return cleanedRef;
  const [, rawBook, chapter, startVerse, endVerse] = match;
  const canonicalBook = resolveBibleBook(rawBook);
  if (!canonicalBook) return rawRef.trim();
  return endVerse
    ? `${canonicalBook} ${chapter}:${startVerse}-${endVerse}`
    : `${canonicalBook} ${chapter}:${startVerse}`;
}

// Regex to capture Bible references like "John 3:16", "1 Cor 13:4-8", "Rev. 14:6-12"
const SCRIPTURE_REGEX = /\b((?:[123]\s*)?[A-Za-z]+(?:\.|\b))\s+(\d{1,3}):(\d{1,3})(?:-(\d{1,3}))?\b/gi;

/**
 * Parses plain text into alternating tokens of plain strings and clickable scripture references.
 */
export function parseScriptureTokens(text: string): ScriptureTextToken[] {
  if (!text || typeof text !== 'string') return [];
  const tokens: ScriptureTextToken[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  // Reset regex
  SCRIPTURE_REGEX.lastIndex = 0;

  while ((match = SCRIPTURE_REGEX.exec(text)) !== null) {
    const rawMatch = match[0];
    const rawBook = match[1];
    const canonicalBook = resolveBibleBook(rawBook);

    // If the matched prefix is not a recognized Bible book, skip it (avoid false positives like "Section 2:10")
    if (!canonicalBook) {
      continue;
    }

    const matchStart = match.index;
    if (matchStart > lastIndex) {
      tokens.push({
        text: text.slice(lastIndex, matchStart),
        isScripture: false,
      });
    }

    const normalizedRef = normalizeScriptureReference(rawMatch);
    tokens.push({
      text: rawMatch,
      isScripture: true,
      reference: normalizedRef,
    });

    lastIndex = matchStart + rawMatch.length;
  }

  if (lastIndex < text.length) {
    tokens.push({
      text: text.slice(lastIndex),
      isScripture: false,
    });
  }

  return tokens;
}

const CACHE_STORAGE_KEY = 'vop_scripture_cache_v1';

function getMemoryOrLocalStorageCache(): Map<string, ScriptureLookupResult> {
  const cache = new Map<string, ScriptureLookupResult>();
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = localStorage.getItem(CACHE_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Record<string, ScriptureLookupResult>;
        for (const [key, val] of Object.entries(parsed)) {
          cache.set(key.toLowerCase(), val);
        }
      }
    }
  } catch {
    // Ignore storage errors in restricted contexts
  }
  return cache;
}

function persistCacheEntry(key: string, entry: ScriptureLookupResult): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = localStorage.getItem(CACHE_STORAGE_KEY);
      const parsed: Record<string, ScriptureLookupResult> = stored ? JSON.parse(stored) : {};
      parsed[key.toLowerCase()] = entry;
      // Cap at 200 entries to preserve storage quota
      const keys = Object.keys(parsed);
      if (keys.length > 200) {
        delete parsed[keys[0]];
      }
      localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(parsed));
    }
  } catch {
    // Non-blocking
  }
}

/**
 * Looks up a scripture verse offline-first with remote fallback.
 */
export async function lookupScriptureVerse(rawReference: string): Promise<ScriptureLookupResult> {
  const normalized = normalizeScriptureReference(rawReference);
  const cacheKey = normalized.toLowerCase();

  // 1. Check curated offline dictionary
  if (CURATED_SCRIPTURES[cacheKey]) {
    const curated = CURATED_SCRIPTURES[cacheKey];
    return {
      reference: curated.reference,
      text: curated.text,
      translation: curated.translation,
      source: 'curated',
    };
  }

  // 2. Check local storage cache
  const localCache = getMemoryOrLocalStorageCache();
  if (localCache.has(cacheKey)) {
    const cached = localCache.get(cacheKey)!;
    return {
      ...cached,
      source: 'cached',
    };
  }

  // 3. Remote lookup via public Bible API (timeout 3.5s)
  if (typeof window !== 'undefined' && navigator.onLine) {
    try {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 3500);

      const response = await fetch(`https://bible-api.com/${encodeURIComponent(normalized)}`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      window.clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        if (data && typeof data.text === 'string' && data.text.trim()) {
          const cleanText = data.text.trim().replace(/\s+/g, ' ');
          const result: ScriptureLookupResult = {
            reference: data.reference || normalized,
            text: cleanText,
            translation: data.translation_name || 'World English Bible',
            source: 'remote',
          };
          persistCacheEntry(cacheKey, result);
          return result;
        }
      }
    } catch {
      // Remote fetch failed or timed out — proceed to fallback
    }
  }

  // Never pass explanatory text off as scripture. The reader offers retry and
  // the canonical reference instead of displaying a fabricated quotation.
  return {
    reference: normalized,
    text: '',
    translation: '',
    source: 'fallback',
  };
}
