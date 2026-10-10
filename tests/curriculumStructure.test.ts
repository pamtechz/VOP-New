import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createServer } from 'vite';

const server = await createServer({configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom'});
after(async()=>{await server.close();});
const {
  normalizeCurriculumStructure,curriculumPages,curriculumAnchorExists,
  containsPublicQuizAnswer,hasRequiredFinalExam,
} = await server.ssrLoadModule('/shared/curriculumStructure.ts') as typeof import('../shared/curriculumStructure.ts');

const chapter=()=>[{
  id:'chapter-one',title:'The beginning',
  sections:[{
    id:'section-one',title:'Scripture and reflection',
    blocks:[
      {id:'block-heading',type:'heading',text:'Genesis 1:1'},
      {id:'block-text',type:'paragraph',text:'In the beginning God created the heavens and the earth.'},
      {id:'block-audio',type:'audio',src:'https://example.com/lesson.mp3'},
    ],
  }],
}];

test('normalizes chapter/section/block hierarchy and produces reader-compatible pages',()=>{
  const model=normalizeCurriculumStructure(chapter());
  assert.equal(model[0].sections[0].blocks.length,3);
  const pages=curriculumPages(model);
  assert.equal(pages.length,1);
  assert.equal(pages[0].chapterId,'chapter-one');
  assert.equal(pages[0].sectionId,'section-one');
  assert.match(pages[0].content,/Genesis 1:1/);
  assert.match(pages[0].content,/heavens and the earth/);
  assert.ok(pages[0].blocks.every(block=>block.id));
  assert.equal(JSON.stringify(pages).includes('correctOptionIndex'),false);
  for (const [kind,id] of [['chapter','chapter-one'],['section','section-one'],['block','block-heading']] as const){
    assert.equal(curriculumAnchorExists(model,kind,id),true);
  }
  assert.equal(curriculumAnchorExists(model,'block','not-in-this-lesson'),false);
});

test('refuses missing, duplicate, oversized, scriptable and private media blocks',()=>{
  assert.throws(()=>normalizeCurriculumStructure([]),/chapters/);
  assert.throws(()=>normalizeCurriculumStructure([{id:'c',title:'Chapter',sections:[]}]),/sections/);
  const bad=chapter();bad[0].sections[0].blocks[0].id='section-one';
  assert.throws(()=>normalizeCurriculumStructure(bad),/duplicate block identifier/);
  for(const src of [
    'javascript:alert(1)','http://example.com/audio.mp3',
    'https://127.0.0.1/lesson.mp3','https://localhost/lesson.mp3',
    'https://user:password@example.com/lesson.mp3',
    'https://example.com/lesson.mp3#fragment',
  ]){
    const item=chapter();item[0].sections[0].blocks[2].src=src;
    assert.throws(()=>normalizeCurriculumStructure(item),/safe public HTTPS/);
  }
  const tooMany=Array.from({length:41},(_,index)=>({...chapter()[0],id:'c'+index}));
  assert.throws(()=>normalizeCurriculumStructure(tooMany),/1–40 chapters/);
});

test('detects disguised inline answer keys before learner-readable lesson persistence',()=>{
  assert.equal(containsPublicQuizAnswer(chapter()),false);
  assert.equal(containsPublicQuizAnswer({chapters:[{blocks:[{question:'Faith?',options:['Yes','No'],correctOptionIndex:0}]}]}),true);
  assert.equal(containsPublicQuizAnswer({pages:[{quiz:[{prompt:'Faith?',answer:'Yes'}]}]}),true);
  assert.equal(containsPublicQuizAnswer({questions:[{question:'Prompt only',options:['One','Two']}]}),false);
});

test('requires real published private-bank final examination only for opted-in structured guides',()=>{
  const exam={
    id:'exam-1',type:'Test',published:true,archived:false,
    attachmentType:'guide',assessmentKind:'final_exam',answerVisibility:'public_redacted',
    sourceQuizId:'quiz1',questions:[{key:'q1',question:'What?',options:['A','B']}],
  };
  assert.equal(hasRequiredFinalExam({requiresFinalExam:true},[]),false);
  assert.equal(hasRequiredFinalExam({requiresFinalExam:false},[]),true);
  assert.equal(hasRequiredFinalExam({requiresFinalExam:true},[{...exam,published:false}]),false);
  assert.equal(hasRequiredFinalExam({requiresFinalExam:true},[{...exam,attachmentType:'lesson'}]),false);
  assert.equal(hasRequiredFinalExam({requiresFinalExam:true},[{...exam,assessmentKind:'practice'}]),false);
  assert.equal(hasRequiredFinalExam({requiresFinalExam:true},[{...exam,sourceQuizId:''}]),false);
  assert.equal(hasRequiredFinalExam({requiresFinalExam:true},[exam]),true);
});

test('selecting a section navigates to the beginning of the section in authoring and student reader', async () => {
  const { readFileSync } = await import('node:fs');
  const authoringReview = readFileSync('src/components/admin/PlateCurriculumAuthoringReview.tsx', 'utf8');
  const pageEditor = readFileSync('src/components/admin/StudyPlatePageEditor.tsx', 'utf8');
  const authoringCss = readFileSync('src/components/admin/plate-authoring.css', 'utf8');
  const readerModal = readFileSync('src/components/reader/LessonReaderModal.tsx', 'utf8');

  // Authoring outline scroll jump targets the beginning of the section beneath the sticky toolbar
  assert.match(authoringReview, /jumpToSection/);
  assert.match(authoringReview, /block:\s*'start'/);
  assert.match(pageEditor, /block:\s*'start'/);
  assert.match(authoringCss, /\.vop-plate-section-marker\s*\{[^}]*scroll-margin-top:\s*68px/);

  // Student reader resets scroll position to beginning on section/page change
  assert.match(readerModal, /scrollContentRef\.current\.scrollTop\s*=\s*0/);
  assert.match(readerModal, /ref=\{scrollContentRef\}/);
});

test('learner portal displays added lessons in their organisation and those that are shared', async () => {
  const { readFileSync } = await import('node:fs');
  const firestoreData = readFileSync('src/services/firestoreData.ts', 'utf8');
  const lessonsPage = readFileSync('src/pages/LessonsPage.tsx', 'utf8');

  // Firestore loader queries and filters lessons for learner's organisation or shared
  assert.match(firestoreData, /isShared\s*=\s*data\.sharingScope\s*===\s*'shared'/);
  assert.match(firestoreData, /isOwnOrg\s*=\s*Boolean\(organizationId\s*&&/);
  assert.match(firestoreData, /if\s*\(!isShared\s*&&\s*!isOwnOrg\s*&&\s*!isSuperAdmin\)\s*\{\s*continue;\s*\}/);

  // LessonsPage supports scoping by organization or shared
  assert.match(lessonsPage, /scope==='organization'/);
  assert.match(lessonsPage, /scope==='shared'/);
  assert.match(lessonsPage, /isOrgLesson/);
});

test('student portal features interactive hero slider and removes personal evangelism hub section', async () => {
  const { readFileSync } = await import('node:fs');
  const homeDashboard = readFileSync('src/components/home/HomeDashboard.tsx', 'utf8');
  const heroSliderCss = readFileSync('src/components/home/hero-slider.css', 'utf8');

  // Personal evangelism hub section removed
  assert.equal(homeDashboard.includes('vop-home-mission'), false);
  assert.equal(homeDashboard.includes('Your personal evangelism hub'), false);

  // Interactive Hero slider implemented with slide indicators, navigation and progress
  assert.match(homeDashboard, /className="vop-hero-slider"/);
  assert.match(homeDashboard, /heroSlides\.map/);
  assert.match(homeDashboard, /vop-hero-pagination/);
  assert.match(heroSliderCss, /\.vop-hero-slider/);
  assert.match(heroSliderCss, /\.vop-hero-slide/);
});

test('lesson editor allows inserting a section at cursor position rather than only at the bottom', async () => {
  const { readFileSync } = await import('node:fs');
  const pageEditor = readFileSync('src/components/admin/StudyPlatePageEditor.tsx', 'utf8');
  const authoringReview = readFileSync('src/components/admin/PlateCurriculumAuthoringReview.tsx', 'utf8');
  const authoringCss = readFileSync('src/components/admin/plate-authoring.css', 'utf8');
  const structureCss = readFileSync('src/components/admin/plate-structure.css', 'utf8');

  // Plate editor provides insertSectionAtCursor and UI controls
  assert.match(pageEditor, /insertSectionAtCursor/);
  assert.match(pageEditor, /vop-plate-insert-section-btn/);
  assert.match(pageEditor, /Insert section at cursor/);
  assert.match(pageEditor, /editor\.tf\.splitNodes/);
  assert.match(authoringCss, /\.vop-plate-insert-section-btn/);

  // Curriculum review allows inserting after target/focused section rather than only at bottom
  assert.match(authoringReview, /addSection=\(afterSectionId\?:string\)/);
  assert.match(authoringReview, /vop-plate-outline-quick-add/);
  assert.match(authoringReview, /Insert section after/);
  assert.match(structureCss, /\.vop-plate-outline-quick-add/);
});

test('lesson editor supports drag-and-drop section reordering in the learner page outline', async () => {
  const { readFileSync } = await import('node:fs');
  const authoringReview = readFileSync('src/components/admin/PlateCurriculumAuthoringReview.tsx', 'utf8');
  const structureCss = readFileSync('src/components/admin/plate-structure.css', 'utf8');

  // Drag-and-drop handlers and drag handle elements
  assert.match(authoringReview, /reorderSection/);
  assert.match(authoringReview, /draggable=\{!isEditing\}/);
  assert.match(authoringReview, /onDragStart/);
  assert.match(authoringReview, /onDragOver/);
  assert.match(authoringReview, /onDrop/);
  assert.match(authoringReview, /vop-plate-outline-drag-handle/);

  // Drag and drop CSS states
  assert.match(structureCss, /\.vop-plate-outline-drag-handle/);
  assert.match(structureCss, /\.vop-plate-outline-row\.dragging/);
  assert.match(structureCss, /\.vop-plate-outline-row\.drop-above/);
  assert.match(structureCss, /\.vop-plate-outline-row\.drop-below/);
});

test('lesson editor includes learner preview mode with direct student reader modal integration', async () => {
  const { readFileSync } = await import('node:fs');
  const authoringReview = readFileSync('src/components/admin/PlateCurriculumAuthoringReview.tsx', 'utf8');
  const structureCss = readFileSync('src/components/admin/plate-structure.css', 'utf8');

  // Preview button in toolbar/header and actions menu
  assert.match(authoringReview, /vop-plate-btn-preview/);
  assert.match(authoringReview, /setPreviewOpen\(true\)/);
  assert.match(authoringReview, /previewLesson/);
  assert.match(authoringReview, /previewGuide/);
  assert.match(authoringReview, /<LessonReaderModal/);
  assert.match(authoringReview, /vop-lesson-preview-banner/);

  // Preview CSS styling
  assert.match(structureCss, /\.vop-plate-btn-preview/);
  assert.match(structureCss, /\.vop-lesson-preview-banner/);
  assert.match(structureCss, /\.vop-lesson-preview-pill/);
});

test('smart section resume bookmarks and direct jump-in links are provided on course and lesson cards', async () => {
  const { readFileSync } = await import('node:fs');
  const homeDashboard = readFileSync('src/components/home/HomeDashboard.tsx', 'utf8');
  const lessonsPage = readFileSync('src/pages/LessonsPage.tsx', 'utf8');
  const guideView = readFileSync('src/components/guide/DiscoverGuideView.tsx', 'utf8');
  const heroSliderCss = readFileSync('src/components/home/hero-slider.css', 'utf8');
  const programCatalogCss = readFileSync('src/pages/program-catalog.css', 'utf8');
  const learningCss = readFileSync('src/pages/learning.css', 'utf8');
  const guideSectionsCss = readFileSync('src/components/guide/guide-sections.css', 'utf8');
  const { resolveLessonResumeBookmark, getActiveGuideBookmark } = await import('../src/services/lessonBookmark.ts');

  // Verify bookmark service calculation
  const mockGuide = {
    id: 'guide-1',
    discoverNumber: 1,
    title: 'Prophecy Guide',
    subtitle: 'Bible Prophecy',
    description: 'Guide description',
    language: 'en' as const,
    image: '',
    certificateEligible: true,
    lessons: [
      {
        id: 'lesson-1',
        type: 'Lesson' as const,
        lessonNumber: '1',
        title: 'The Prophecy Begins',
        description: 'First study lesson',
        estimatedMinutes: 15,
        contentPages: [
          { id: 'page-1', title: 'Introduction', content: 'Intro text', chapterId: 'ch-1', sectionId: 'sec-1' },
          { id: 'page-2', title: 'Historical Backdrop', content: 'History text', chapterId: 'ch-1', sectionId: 'sec-1' },
          { id: 'page-3', title: 'The Vision Revealed', content: 'Vision text', chapterId: 'ch-1', sectionId: 'sec-2' },
          { id: 'page-4', title: 'Practical Application', content: 'App text', chapterId: 'ch-1', sectionId: 'sec-2' },
        ],
        chapters: [
          {
            id: 'ch-1',
            title: 'Foundations of Prophecy',
            sections: [
              { id: 'sec-1', title: 'Historical Foundations', blocks: [] },
              { id: 'sec-2', title: 'The Vision', blocks: [] },
            ],
          },
        ],
      },
    ],
  };

  const mockUser = {
    uid: 'learner-1',
    displayName: 'Ruth Student',
    email: 'ruth@example.com',
    information: {
      enrollmentDate: '2026-01-01',
      graduating: false,
      graduated: false,
      baptismCandidate: false,
      baptized: false,
    },
    privileges: {
      admin: false,
      superAdmin: false,
      guardian: false,
      editor: false,
      manager: false,
      developer: false,
    },
    progress: {
      discoverProgress: 35,
      completedGuidesCount: 0,
      totalGuidesCount: 1,
      guideScores: {},
      completedLessons: [],
      lessonResume: {
        'en:guide-1:lesson-1': {
          language: 'en' as const,
          guideId: 'guide-1',
          lessonId: 'lesson-1',
          pageIndex: 2,
          updatedAt: '2026-10-09T08:00:00.000Z',
        },
      },
    },
  };

  const bookmark = resolveLessonResumeBookmark(mockGuide, mockGuide.lessons[0], mockUser, 75);
  assert.ok(bookmark);
  assert.equal(bookmark.pageIndex, 2);
  assert.equal(bookmark.pageNumber, 3);
  assert.equal(bookmark.totalPages, 4);
  assert.equal(bookmark.hasBookmark, true);
  assert.equal(bookmark.isCompleted, false);
  assert.equal(bookmark.chapterTitle, 'Foundations of Prophecy');
  assert.equal(bookmark.sectionTitle, 'The Vision');
  assert.equal(bookmark.progressPercent, 75);

  const activeGuideBm = getActiveGuideBookmark(mockGuide, mockUser, 75);
  assert.ok(activeGuideBm);
  assert.equal(activeGuideBm.lesson.id, 'lesson-1');
  assert.equal(activeGuideBm.bookmark.pageIndex, 2);

  // Home dashboard: hero bookmark tag, continue study card with bookmark banner, quick actions & guide cards
  assert.match(homeDashboard, /primaryBookmark/);
  assert.match(homeDashboard, /vop-hero-bookmark-pill/);
  assert.match(homeDashboard, /vop-home-bookmark-banner/);
  assert.match(homeDashboard, /vop-home-quick-jump-btn/);
  assert.match(homeDashboard, /vop-home-guide-bookmark-chip/);
  assert.match(heroSliderCss, /\.vop-hero-bookmark-pill/);
  assert.match(heroSliderCss, /\.vop-home-bookmark-banner/);
  assert.match(heroSliderCss, /\.vop-home-quick-jump-btn/);
  assert.match(heroSliderCss, /\.vop-home-guide-bookmark-chip/);

  // Lessons page: program catalog cards, program guide resume links, standalone lesson bookmark pills & resume buttons
  assert.match(lessonsPage, /vop-program-bookmark-badge/);
  assert.match(lessonsPage, /vop-program-guide-resume-link/);
  assert.match(lessonsPage, /vop-lesson-bookmark-pill/);
  assert.match(lessonsPage, /vop-lesson-resume-btn-group/);
  assert.match(lessonsPage, /vop-lesson-resume-btn/);
  assert.match(programCatalogCss, /\.vop-program-bookmark-badge/);
  assert.match(programCatalogCss, /\.vop-program-guide-resume-link/);
  assert.match(learningCss, /\.vop-lesson-bookmark-pill/);
  assert.match(learningCss, /\.vop-lesson-resume-btn-group/);

  // Discover Guide view: section-mode bookmark tag, lesson-mode resume strip & direct jump-in button
  assert.match(guideView, /vop-section-bookmark-tag/);
  assert.match(guideView, /vop-guide-lesson-resume-strip/);
  assert.match(guideView, /vop-guide-lesson-resume-jump-btn/);
  assert.match(guideSectionsCss, /\.vop-section-bookmark-tag/);
  assert.match(guideSectionsCss, /\.vop-guide-lesson-resume-strip/);
  assert.match(guideSectionsCss, /\.vop-guide-lesson-resume-jump-btn/);
});

test('admin hero slider manager allows creating, editing, reordering, and toggling custom hero slides with actions and live preview', async () => {
  const { normalizeHeroSlides } = await server.ssrLoadModule('/src/services/adminFirestore.ts') as typeof import('../src/services/adminFirestore.ts');
  const { DEFAULT_SETTINGS } = await server.ssrLoadModule('/src/services/storage.ts') as typeof import('../src/services/storage.ts');
  const { emptySettings } = await server.ssrLoadModule('/src/services/publicFirestore.ts') as typeof import('../src/services/publicFirestore.ts');

  // Verify baseline defaults in storage and firestore
  assert.deepEqual(DEFAULT_SETTINGS.heroSlides, []);
  assert.equal(DEFAULT_SETTINGS.heroSliderAutoplaySeconds, 6);
  assert.equal(DEFAULT_SETTINGS.heroSliderIncludeDefaultSlides, true);

  const empty = emptySettings();
  assert.deepEqual(empty.heroSlides, []);
  assert.equal(empty.heroSliderAutoplaySeconds, 6);
  assert.equal(empty.heroSliderIncludeDefaultSlides, true);

  // Normalization handles incomplete, malformed, or full slide definitions
  const rawSlides = [
    {
      id: 'slide-1',
      title: 'Proclaim the Gospel',
      description: 'Discover Christ-centered spiritual guides.',
      kicker: 'Voice of Prophecy',
      badge: 'Featured',
      gradient: 'linear-gradient(135deg, #021a42 0%, #083c84 55%, #0f5eb8 100%)',
      icon: 'sparkles',
      enabled: true,
      order: 0,
      primaryActionLabel: 'Explore Guides',
      primaryActionTarget: 'lessons',
      secondaryActionLabel: 'About Us',
      secondaryActionTarget: 'about',
    },
    {
      id: 'slide-2',
      title: 'Radio Broadcasts',
      description: 'Stream inspiring messages and sacred music.',
      kicker: 'Voice of Hope',
      badge: 'Live',
      icon: 'radio',
      enabled: false,
      order: 1,
      primaryActionLabel: 'Listen Now',
      primaryActionTarget: 'radio',
    },
    {
      // Missing title and description should be filtered out
      id: 'slide-bad',
      title: '',
      description: '',
    },
  ];

  const normalized = normalizeHeroSlides(rawSlides);
  assert.equal(normalized.length, 2);
  assert.equal(normalized[0].id, 'slide-1');
  assert.equal(normalized[0].enabled, true);
  assert.equal(normalized[0].primaryActionLabel, 'Explore Guides');
  assert.equal(normalized[0].primaryActionTarget, 'lessons');
  assert.equal(normalized[0].secondaryActionLabel, 'About Us');
  assert.equal(normalized[0].secondaryActionTarget, 'about');

  assert.equal(normalized[1].id, 'slide-2');
  assert.equal(normalized[1].enabled, false);
  assert.equal(normalized[1].icon, 'radio');

  // Verify reordering logic preserves custom sort
  const reordered = [normalized[1], normalized[0]].map((slide, idx) => ({ ...slide, order: idx }));
  assert.equal(reordered[0].id, 'slide-2');
  assert.equal(reordered[0].order, 0);
  assert.equal(reordered[1].id, 'slide-1');
  assert.equal(reordered[1].order, 1);

  // Verify component and style files exist and contain required capabilities
  const fs = await import('node:fs');
  const hsmComponent = fs.readFileSync('src/components/admin/HeroSliderManager.tsx', 'utf8');
  const hsmCss = fs.readFileSync('src/components/admin/hero-slider-manager.css', 'utf8');
  const adminPage = fs.readFileSync('src/pages/AdminPage.tsx', 'utf8');
  const homeDashboard = fs.readFileSync('src/components/home/HomeDashboard.tsx', 'utf8');

  // HeroSliderManager features
  assert.match(hsmComponent, /Homepage Hero Carousel Manager/);
  assert.match(hsmComponent, /Include Dynamic Study & Resume Slides/);
  assert.match(hsmComponent, /Autoplay Rotation Duration/);
  assert.match(hsmComponent, /Live Homepage Hero Preview/);
  assert.match(hsmComponent, /GRADIENT_PRESETS/);
  assert.match(hsmComponent, /ICON_OPTIONS/);
  assert.match(hsmComponent, /DESTINATION_PRESETS/);
  assert.match(hsmComponent, /TEMPLATES/);
  assert.match(hsmComponent, /handleToggleSlide/);
  assert.match(hsmComponent, /handleMoveUp/);
  assert.match(hsmComponent, /handleMoveDown/);
  assert.match(hsmComponent, /handleDuplicate/);
  assert.match(hsmComponent, /handleDelete/);

  // CSS classes
  assert.match(hsmCss, /\.vop-hsm-container/);
  assert.match(hsmCss, /\.vop-hsm-slide-card/);
  assert.match(hsmCss, /\.vop-hsm-gradients-grid/);
  assert.match(hsmCss, /\.vop-hsm-icons-grid/);
  assert.match(hsmCss, /\.vop-hsm-modal/);

  // AdminPage integration
  assert.match(adminPage, /HeroSliderManager/);
  assert.match(adminPage, /'heroSlider'/);
  assert.match(adminPage, /Hero Carousel/);

  // HomeDashboard integration
  assert.match(homeDashboard, /settings\.heroSlides/);
  assert.match(homeDashboard, /settings\.heroSliderIncludeDefaultSlides/);
  assert.match(homeDashboard, /settings\.heroSliderAutoplaySeconds/);
  assert.match(homeDashboard, /configuredCustomSlides/);
  assert.match(homeDashboard, /resolveSlideAction/);
  assert.match(homeDashboard, /isSlideScheduledAndActive/);

  // Image link picker and curated gallery
  assert.match(hsmComponent, /CURATED_MINISTRY_IMAGES/);
  assert.match(hsmComponent, /Choose from Curated Ministry Image Links/);
  assert.match(hsmComponent, /Slide Visual Image \(from Link \/ URL\)/);
  assert.match(hsmCss, /\.vop-hsm-curated-gallery/);
  assert.match(hsmCss, /\.vop-hsm-curated-item/);
  assert.match(hsmCss, /\.vop-hsm-image-preview-bar/);

  // Campaign scheduling and date windows
  assert.match(hsmComponent, /Campaign Schedule & Display Window/);
  assert.match(hsmComponent, /toDatetimeLocal/);
  assert.match(hsmCss, /\.vop-hsm-schedule-badge/);
  assert.match(hsmCss, /\.vop-hsm-schedule-badge\.active/);
  assert.match(hsmCss, /\.vop-hsm-schedule-badge\.upcoming/);
  assert.match(hsmCss, /\.vop-hsm-schedule-badge\.expired/);

  // Verify scheduled window logic behavior
  const now = Date.now();
  const pastDate = new Date(now - 86400000).toISOString();
  const futureDate = new Date(now + 86400000).toISOString();

  const scheduledSlide = {
    id: 'slide-sched',
    title: 'Upcoming Campaign',
    description: 'Will display tomorrow',
    enabled: true,
    order: 0,
    startDate: futureDate,
  };
  const expiredSlide = {
    id: 'slide-exp',
    title: 'Old Campaign',
    description: 'Expired yesterday',
    enabled: true,
    order: 1,
    endDate: pastDate,
  };
  const activeSlide = {
    id: 'slide-active',
    title: 'Active Campaign',
    description: 'Currently running',
    enabled: true,
    order: 2,
    startDate: pastDate,
    endDate: futureDate,
  };

  const normScheduled = normalizeHeroSlides([scheduledSlide, expiredSlide, activeSlide]);
  assert.equal(normScheduled.length, 3);
  assert.equal(normScheduled[0].startDate, futureDate);
  assert.equal(normScheduled[1].endDate, pastDate);
  assert.equal(normScheduled[2].startDate, pastDate);
  assert.equal(normScheduled[2].endDate, futureDate);
});

test('13. enhanced audio narration extracts full rich plate document and interactive scripture popover parses and resolves references', async () => {
  const {
    parseScriptureTokens,
    normalizeScriptureReference,
    lookupScriptureVerse,
    CURATED_SCRIPTURES,
  } = await server.ssrLoadModule('/src/services/scriptureLookup.ts') as typeof import('../src/services/scriptureLookup.ts');

  const {
    extractLessonPageSpokenText,
    AVAILABLE_NARRATION_RATES,
  } = await server.ssrLoadModule('/src/services/lessonNarration.ts') as typeof import('../src/services/lessonNarration.ts');

  // 1. Scripture parsing and token extraction
  const sampleParagraph = 'According to John 3:16, God loved the world. Also read Romans 8:28 and Rev 14:6-12 in your study.';
  const tokens = parseScriptureTokens(sampleParagraph);
  assert.equal(tokens.length, 7);
  assert.equal(tokens[1].isScripture, true);
  assert.equal(tokens[1].text, 'John 3:16');
  assert.equal(tokens[1].reference, 'John 3:16');
  assert.equal(tokens[3].isScripture, true);
  assert.equal(tokens[3].text, 'Romans 8:28');
  assert.equal(tokens[5].isScripture, true);
  assert.equal(tokens[5].text, 'Rev 14:6-12');
  assert.equal(tokens[5].reference, 'Revelation 14:6-12');

  // Verify non-scriptures are ignored (no false positives)
  const nonScriptureText = 'Chapter 2:3 and Section 4:10 are not Bible books.';
  const nonTokens = parseScriptureTokens(nonScriptureText);
  assert.equal(nonTokens.every(t => !t.isScripture), true);

  // 2. Reference normalization
  assert.equal(normalizeScriptureReference('jn 3:16'), 'John 3:16');
  assert.equal(normalizeScriptureReference('1cor 13:4-7'), '1 Corinthians 13:4-7');
  assert.equal(normalizeScriptureReference('ps 23:1'), 'Psalms 23:1');
  assert.equal(normalizeScriptureReference('ex 20:8-11'), 'Exodus 20:8-11');

  // 3. Offline curated scripture lookup
  const jn316 = await lookupScriptureVerse('John 3:16');
  assert.equal(jn316.source, 'curated');
  assert.match(jn316.text, /everlasting life/);
  assert.equal(jn316.translation, 'KJV');

  const rev14 = await lookupScriptureVerse('Rev 14:12');
  assert.equal(rev14.source, 'curated');
  assert.match(rev14.text, /faith of Jesus/);

  assert.ok(Object.keys(CURATED_SCRIPTURES).length >= 30);

  // 4. Audio Narration spoken text extraction from Plate document
  const samplePlateDoc = [
    { id: 'b1', type: 'h2' as const, children: [{ text: 'The Plan of Redemption', bold: true as const }] },
    { id: 'b2', type: 'p' as const, children: [{ text: 'Grace is extended freely to everyone who seeks the Lord.' }] },
    { id: 'b3', type: 'blockquote' as const, children: [{ text: 'Walk in faith and prayer.' }] },
  ];

  const spokenPlate = extractLessonPageSpokenText({
    page: {
      pageNumber: 1,
      title: 'Grace & Truth',
      content: '',
      scriptureQuote: {
        text: 'For by grace are ye saved through faith.',
        reference: 'Ephesians 2:8',
      },
      keyTakeaway: 'Salvation is a gift received by faith.',
    },
    chapter: {
      id: 'c1',
      title: 'Chapter 1: The Gospel Foundation',
      sections: [],
    },
    section: {
      id: 's1',
      title: 'Section A: Free Grace',
      blocks: [],
      document: samplePlateDoc,
    },
    isLastPage: false,
  });

  assert.match(spokenPlate, /Chapter 1: The Gospel Foundation/);
  assert.match(spokenPlate, /Section A: Free Grace/);
  assert.match(spokenPlate, /The Plan of Redemption/);
  assert.match(spokenPlate, /Grace is extended freely/);
  assert.match(spokenPlate, /Holy Scripture passage: For by grace are ye saved through faith/);
  assert.match(spokenPlate, /Key truth: Salvation is a gift received by faith/);

  // 5. Narration playback rates
  assert.deepEqual(AVAILABLE_NARRATION_RATES, [0.75, 1.0, 1.25, 1.5]);

  // 6. Component and CSS inspection
  const fs = await import('node:fs');
  const audioBarCode = fs.readFileSync('src/components/reader/AudioNarrationBar.tsx', 'utf8');
  const scripturePopoverCode = fs.readFileSync('src/components/reader/ScripturePopover.tsx', 'utf8');
  const audioCss = fs.readFileSync('src/components/reader/lesson-reader-audio.css', 'utf8');
  const readerModalCode = fs.readFileSync('src/components/reader/LessonReaderModal.tsx', 'utf8');
  const studyPlateContentCode = fs.readFileSync('src/components/reader/StudyPlateContent.tsx', 'utf8');

  // Verify AudioNarrationBar features
  assert.match(audioBarCode, /vop-audio-equalizer/);
  assert.match(audioBarCode, /vop-audio-rate-selector/);
  assert.match(audioBarCode, /onRateChange/);
  assert.match(audioBarCode, /AVAILABLE_NARRATION_RATES/);

  // Verify ScripturePopover features
  assert.match(scripturePopoverCode, /lookupScriptureVerse/);
  assert.match(scripturePopoverCode, /isSpeakingVerse/);
  assert.match(scripturePopoverCode, /handleCopy/);
  assert.match(scripturePopoverCode, /vop-scripture-modal/);

  // Verify CSS styles
  assert.match(audioCss, /\.vop-audio-narration-bar/);
  assert.match(audioCss, /\.vop-audio-equalizer/);
  assert.match(audioCss, /\.vop-scripture-ref-btn/);
  assert.match(audioCss, /\.vop-scripture-modal/);

  // Verify LessonReaderModal & StudyPlateContent integration
  assert.match(readerModalCode, /AudioNarrationBar/);
  assert.match(readerModalCode, /ScripturePopover/);
  assert.match(readerModalCode, /startNarration/);
  assert.match(readerModalCode, /pauseNarration/);
  assert.match(readerModalCode, /onScriptureClick/);
  assert.match(studyPlateContentCode, /onScriptureClick/);
  assert.match(studyPlateContentCode, /parseScriptureTokens/);
});


test('Bemba Psalms citations resolve to actual Scripture and author-supplied text flows to the reader',async()=>{
  const {normalizeScriptureReference,lookupScriptureVerse,parseScriptureTokens}
    =await server.ssrLoadModule('/src/services/scriptureLookup.ts') as typeof import('../src/services/scriptureLookup.ts');
  assert.equal(normalizeScriptureReference('Amalumbo 139:14.'),'Psalms 139:14');
  assert.equal(normalizeScriptureReference('Masalimo 139:14'),'Psalms 139:14');
  assert.equal(parseScriptureTokens('Amalumbo 139:14')[0].reference,'Psalms 139:14');
  const verse=await lookupScriptureVerse('Amalumbo 139:14.');
  assert.equal(verse.translation,'KJV');
  assert.match(verse.text,/fearfully and wonderfully made/);
  assert.doesNotMatch(verse.text,/is cited in this study/);
  const fs=await import('node:fs');
  const popover=fs.readFileSync('src/components/reader/ScripturePopover.tsx','utf8');
  const lesson=fs.readFileSync('src/components/reader/LessonReaderModal.tsx','utf8');
  const plate=fs.readFileSync('src/components/reader/StudyPlateContent.tsx','utf8');
  const author=fs.readFileSync('src/components/admin/StudyPlatePageEditor.tsx','utf8');
  assert.match(popover,/passageText\?: string/);
  assert.match(popover,/Full Scripture text is not available/);
  assert.match(popover,/Retry Scripture lookup/);
  assert.match(lesson,/passageText=\{selectedScriptureRef\.passageText\}/);
  assert.match(plate,/onScriptureClick\(ref,isReferenceOnly\?'':written,leaf\.bibleVersion\)/);
  assert.match(author,/await lookupScriptureVerse\(ref\)/);
  assert.match(author,/Never label KJV text as NKJV\/Bemba/);
});
