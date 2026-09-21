import {
  DiscoverGuide,
  User,
  Announcement,
  BookResource,
  Union,
  Conference,
  District,
  ChurchOrganization,
  DetailPagesSettings,
  HierarchyConfig,
  GraduationRequest,
  PrayerRequest,
  RadioBroadcast,
  CustomLanguage
} from '../types';

export const INITIAL_DISCOVER_GUIDES: DiscoverGuide[] = [
  {
    id: 'guide-1',
    discoverNumber: 1,
    title: 'We Can Believe in God',
    subtitle: 'Discover Guide 1',
    description: 'Explore the compelling evidence of creation, design, and God\'s personal desire to be in a relationship with you.',
    language: 'en',
    image: '/assets/guide_2.jpg',
    certificateEligible: true,
    lessons: [
      {
        id: 'lesson-1-0',
        lessonNumber: '1.0',
        title: 'Introduction',
        description: 'Welcome to the Discover Bible Guides. An exciting spiritual journey begins.',
        type: 'Lesson',
        estimatedMinutes: 5,
        contentPages: [
          {
            pageNumber: 1,
            title: 'Welcome to Discover Guides',
            content: `Welcome to the Voice of Prophecy Discover Bible School! Millions of people across the globe have found answers to life's deepest questions through these guides. 

As you embark on this spiritual adventure, you will discover that the Bible is not just an ancient book of history, but a living, practical guide for your daily life, your family, and your eternal destiny. Each guide is designed to be studied with an open heart and an inquiring mind.`,
            scriptureQuote: {
              text: 'Your word is a lamp to my feet and a light to my path.',
              reference: 'Psalm 119:105'
            },
            keyTakeaway: 'The Word of God offers dependable guidance in a confused and restless world.'
          },
          {
            pageNumber: 2,
            title: 'How to Study These Guides',
            content: `Take your time to read through each lesson carefully. Contemplate the scriptures and ask God in prayer to reveal truth to your heart. 

At the conclusion of each guide, you will take an interactive comprehension test. Once you achieve an 80% or higher score on all required guides, you will earn your official Voice of Prophecy Course Certificate!`,
            keyTakeaway: 'Prayer and reflection unlock the deepest treasures of spiritual understanding.'
          }
        ]
      },
      {
        id: 'lesson-1-1',
        lessonNumber: '1.1',
        title: 'Everything Designed Has a Designer',
        description: 'The marvel of human biology and the complexity of the mind.',
        type: 'Lesson',
        estimatedMinutes: 8,
        contentPages: [
          {
            pageNumber: 1,
            title: 'The Human Body Demands a Designer',
            content: `The design of the human body demands the existence of a Designer. Have you ever pondered all that’s involved in the function of the human brain? 

The brain is made up of around 100 billion nerve cells. Each cell is connected to another 10,000 cells. This means that, in total, we have around 1,000 trillion connections in our brains. These are ultimately responsible for who we are. Our brains control the decisions we make, the way we move, the way we feel. The functions of the brain keep the intricate organs of the body working in harmony and balance with each other. The human brain is truly remarkable!`,
            scriptureQuote: {
              text: 'Then God said, “Let Us make man in Our image, according to Our likeness”... so God created man in His own image; in the image of God He created him; male and female He created them.',
              reference: 'Genesis 1:26, 27'
            },
            keyTakeaway: 'Intricate design requires an intelligent designer. We are not random accidents.'
          },
          {
            pageNumber: 2,
            title: 'Fearfully and Wonderfully Made',
            content: `Every second, millions of chemical reactions occur inside your body without your conscious effort. The human eye can distinguish over 10 million distinct color shades. The human heart pumps thousands of gallons of blood each day through thousands of miles of blood vessels.

Can such microscopic precision and biological symphony happen by mere coincidence? Just as a computer code requires a programmer, the complex DNA inside every living cell proves an omnipotent Creator.`,
            scriptureQuote: {
              text: 'I praise you because I am fearfully and wonderfully made; your works are wonderful, I know that full well.',
              reference: 'Psalm 139:14'
            },
            keyTakeaway: 'You were purposefully designed with infinite care and eternal value.'
          }
        ]
      },
      {
        id: 'lesson-1-2',
        lessonNumber: '1.2',
        title: 'Everything Made Has a Maker',
        description: 'Cosmic order, planetary precision, and the testimony of nature.',
        type: 'Lesson',
        estimatedMinutes: 7,
        contentPages: [
          {
            pageNumber: 1,
            title: 'The Heavens Declare God\'s Glory',
            content: `When you look at a wrist watch with dozens of gears, springs, and digital circuits working in unison, no rational person concludes that the parts assembled themselves over time. 

Consider our solar system: planets orbit with mathematical consistency. Earth is positioned at the exact distance from the sun to allow water in liquid form, breathable atmosphere, and lush life. Shift Earth slightly closer to the sun, and our oceans boil away; shift slightly farther, and we freeze into a permanent glacier.`,
            scriptureQuote: {
              text: 'The heavens declare the glory of God; and the firmament sheweth his handywork. Day unto day uttereth speech, and night unto night sheweth knowledge.',
              reference: 'Psalm 19:1, 2'
            },
            keyTakeaway: 'The vast cosmos is a silent yet powerful witness of the Creator\'s power.'
          }
        ]
      },
      {
        id: 'lesson-1-3',
        lessonNumber: '1.3',
        title: 'God Comes Into Personal Relationships With People',
        description: 'Discovering that God is not a distant force, but a loving Father.',
        type: 'Lesson',
        estimatedMinutes: 9,
        contentPages: [
          {
            pageNumber: 1,
            title: 'A God Who Draws Near',
            content: `God is not merely an impersonal force or cosmic clockmaker who wound up the universe and walked away. The God of the Bible is deeply, passionately personal. 

He knows your name, your heartaches, your triumphs, and your silent prayers. Throughout history, He walked with Enoch, spoke with Abraham as a friend, and led Moses. Today, through Jesus Christ and the Holy Spirit, He desires an abiding fellowship with you.`,
            scriptureQuote: {
              text: 'I have loved you with an everlasting love; I have drawn you with unfailing kindness.',
              reference: 'Jeremiah 31:3'
            },
            keyTakeaway: 'God does not just rule over us; He longs to walk beside us as our Father and Friend.'
          }
        ]
      },
      {
        id: 'lesson-1-4',
        lessonNumber: '1.4',
        title: 'What Kind of God Is He?',
        description: 'Understanding God\'s character: love, justice, mercy, and truth.',
        type: 'Lesson',
        estimatedMinutes: 8,
        contentPages: [
          {
            pageNumber: 1,
            title: 'The Character of God',
            content: `Many people view God through distorted lenses—as an angry judge waiting to catch them stumbling, or as an uncaring monarch. But scripture reveals His true nature: "The Lord, the Lord God, merciful and gracious, longsuffering, and abounding in goodness and truth."

If you want to know what God looks like, look at Jesus Christ. In Christ, God healed the brokenhearted, lifted the fallen, touched the outcasts, and laid down His life on Calvary so that you and I might have eternal life.`,
            scriptureQuote: {
              text: 'He who does not love does not know God, for God is love... In this is love, not that we loved God, but that He loved us and sent His Son to be the propitiation for our sins.',
              reference: '1 John 4:8, 10'
            },
            keyTakeaway: 'God\'s overarching character is self-sacrificing, unconditional love.'
          }
        ]
      },
      {
        id: 'lesson-1-5',
        lessonNumber: '1.5',
        title: 'Discover Guide 1 Test',
        description: 'Interactive test evaluating your comprehension of Discover Guide 1.',
        type: 'Test',
        estimatedMinutes: 10,
        questions: [
          {
            key: 'q1',
            question: 'The intricate design and 1,000 trillion connections of the human brain strongly evidence an intelligent Creator rather than blind chance.',
            answer: true,
            explanation: 'Correct! The astronomical complexity of the human brain and biological systems demands a Master Designer.',
            scriptureRef: 'Psalm 139:14'
          },
          {
            key: 'q2',
            question: 'The Bible teaches that God wound up the universe like a clock and has no interest in having a personal relationship with human beings.',
            answer: false,
            explanation: 'False! God desires an intimate, loving, personal relationship with every person, declaring "I have loved you with an everlasting love" (Jeremiah 31:3).',
            scriptureRef: 'Jeremiah 31:3'
          },
          {
            key: 'q3',
            question: 'The heavens and cosmic mathematical precision declare the glory and craftsmanship of God.',
            answer: true,
            explanation: 'Correct! Psalm 19:1 affirms: "The heavens declare the glory of God; and the firmament sheweth his handywork."',
            scriptureRef: 'Psalm 19:1'
          },
          {
            key: 'q4',
            question: 'According to 1 John 4:8, the fundamental character of God is summarized by the statement: "God is love".',
            answer: true,
            explanation: 'Correct! The foundational attribute of God is pure, sacrificial love.',
            scriptureRef: '1 John 4:8'
          },
          {
            key: 'q5',
            question: 'Human beings were created in the image and likeness of God according to Genesis 1:26-27.',
            answer: true,
            explanation: 'Correct! God deliberately created human beings in His own image and likeness.',
            scriptureRef: 'Genesis 1:26, 27'
          }
        ]
      }
    ]
  },
  {
    id: 'guide-2',
    discoverNumber: 2,
    title: 'Can God Be Trusted?',
    subtitle: 'Discover Guide 2',
    description: 'Examining the historical reliability, fulfilled prophecies, and enduring promises of the Holy Scriptures.',
    language: 'en',
    image: '/assets/bg_1.png',
    certificateEligible: false,
    lessons: [
      {
        id: 'lesson-2-0',
        lessonNumber: '2.0',
        title: 'Introduction to God\'s Word',
        description: 'Why the Bible stands unique among all books in world history.',
        type: 'Lesson',
        estimatedMinutes: 6,
        contentPages: [
          {
            pageNumber: 1,
            title: 'A Rock-Solid Foundation',
            content: `Can we trust the ancient scriptures in a fast-changing high-tech modern world? Fulfilled prophecies, archaeological discoveries, and millions of transformed lives attest to the divine inspiration of God's Word.`,
            scriptureQuote: {
              text: 'All Scripture is given by inspiration of God, and is profitable for doctrine, for reproof, for correction, for instruction in righteousness.',
              reference: '2 Timothy 3:16'
            },
            keyTakeaway: 'The Bible is God\'s inspired and trustworthy message for every generation.'
          }
        ]
      },
      {
        id: 'lesson-2-1',
        lessonNumber: '2.1',
        title: 'Prophecy Foretells the Future',
        description: 'How biblical prophecies unerringly unfolded through the rise and fall of world empires.',
        type: 'Lesson',
        estimatedMinutes: 8,
        contentPages: [
          {
            pageNumber: 1,
            title: 'The Great Prophecies of Daniel',
            content: `From Babylon, Medo-Persia, Greece, Rome, to the divided nations of modern Europe, God revealed world history centuries in advance to the prophet Daniel. No human could predict such geopolitical shifts—only God who knows the end from the beginning.`,
            scriptureQuote: {
              text: 'He reveals deep and secret things; He knows what is in the darkness, and light dwells with Him.',
              reference: 'Daniel 2:22'
            },
            keyTakeaway: 'God holds the future and directs the destiny of nations.'
          }
        ]
      },
      {
        id: 'lesson-2-2',
        lessonNumber: '2.2',
        title: 'Archaeology Confirms the Word',
        description: 'Excavations and ancient records supporting the biblical narrative.',
        type: 'Lesson',
        estimatedMinutes: 7,
        contentPages: [
          {
            pageNumber: 1,
            title: 'Stones That Cry Out',
            content: `Again and again, historical skeptics questioned biblical locations, kings, and customs—only for archaeologists\' spades to unearth the exact cities and rulers recorded in Scripture, from King David to Pontius Pilate.`,
            scriptureQuote: {
              text: 'The grass withers, the flower fades, but the word of our God stands forever.',
              reference: 'Isaiah 40:8'
            },
            keyTakeaway: 'History and archaeology continuously confirm the reliability of Scripture.'
          }
        ]
      },
      {
        id: 'lesson-2-3',
        lessonNumber: '2.3',
        title: 'Transformed Lives',
        description: 'The personal power of God\'s Word in human hearts.',
        type: 'Lesson',
        estimatedMinutes: 6,
        contentPages: [
          {
            pageNumber: 1,
            title: 'Living Power of the Word',
            content: `The ultimate test of any truth is its fruit. Throughout history, the Bible has transformed broken lives, reconciled shattered families, freed souls from addiction, and brought joy to despairing hearts.`,
            scriptureQuote: {
              text: 'Therefore, if anyone is in Christ, he is a new creation; old things have passed away; behold, all things have become new.',
              reference: '2 Corinthians 5:17'
            },
            keyTakeaway: 'God\'s Word has supernatural power to change your life today.'
          }
        ]
      },
      {
        id: 'lesson-2-4',
        lessonNumber: '2.4',
        title: 'The Problem of Evil',
        description: 'Why do good people suffer if God is both loving and all-powerful?',
        type: 'Lesson',
        estimatedMinutes: 9,
        contentPages: [
          {
            pageNumber: 1,
            title: 'Where Did Suffering Come From?',
            content: `God did not create sickness, grief, pain, or death. These are the tragic consequences of rebellion against God's law of love. The Bible reveals a cosmic drama where God is actively working to eliminate evil forever while preserving the free will of His creatures.`,
            scriptureQuote: {
              text: 'And God shall wipe away all tears from their eyes; and there shall be no more death, neither sorrow, nor crying, neither shall there be any more pain.',
              reference: 'Revelation 21:4'
            },
            keyTakeaway: 'Suffering is temporary; God\'s promise of healing and eternal peace is sure.'
          }
        ]
      }
    ]
  },
  {
    id: 'guide-bem-1',
    discoverNumber: 1,
    title: 'Tuti Twasumina muli Lesa',
    subtitle: 'Amasambililo ya Kusanga Icine 1',
    description: 'Moneni ifishinka fya kulangilila ukuti Lesa e wabumba fyonse kabili alifwaya ukuba ne cibusa na imwe.',
    language: 'bem',
    image: '/assets/guide_2.jpg',
    certificateEligible: true,
    lessons: [
      {
        id: 'lesson-bem-1-0',
        lessonNumber: '1.0',
        title: 'Intungululo ku Masambililo',
        description: 'Mwaiseni ku Masambililo ya Baibolo aya Kusanga Icine.',
        type: 'Lesson',
        estimatedMinutes: 5,
        contentPages: [
          {
            pageNumber: 1,
            title: 'Ukutemwa kwa kwa Lesa',
            content: 'Mwaiseni ku Isukulu lya Voice of Prophecy! Mu masambililo ya Baibolo aya, mwalasanga amasukulu ku fipusho fyakatama ifya bumi bwenu. Baibolo taba fye citabo ca kale lelo cebo ca mweo.',
            scriptureQuote: {
              text: 'Cebo cenu e nyali ku makasa yandi, no lubuuto ku nshila yandi.',
              reference: 'Amalumbo 119:105'
            },
            keyTakeaway: 'Icebo ca kwa Lesa caliba no bupilibulo kabili cilatutungulula mu nshita shonse.'
          }
        ]
      },
      {
        id: 'lesson-bem-1-1',
        lessonNumber: '1.1',
        title: 'Fyonse Ifyapangwa Fyaba no Wapangile',
        description: 'Imibumbilwe ya mubili wa muntu ilelanga ukuti kwaliba Kabumba.',
        type: 'Lesson',
        estimatedMinutes: 8,
        contentPages: [
          {
            pageNumber: 1,
            title: 'Ubongo bwa Muntu bwalipikana',
            content: 'Ubongo bwa muntu bwalikwata insandesande ishingi sana ishibomba mu kucetekanya na mu kukoselesha umubili onse. Ici cilelanga apabuuta ukuti twalibumbwa na Lesa wa mano apapata.',
            scriptureQuote: {
              text: 'Nalamutasha pantu nimpikana, nindumbwa mu nshila ya kupapa; ifilengwa fyenu fya kupapa, no mutima wandi ulishibe sana.',
              reference: 'Amalumbo 139:14'
            },
            keyTakeaway: 'Lesa alitubumba bwino sana kabili twalicindama ku menso yakwe.'
          }
        ]
      },
      {
        id: 'lesson-bem-1-5',
        lessonNumber: '1.5',
        title: 'Ukwesha kwa Masambililo 1',
        description: 'Ukwesha pa fintu mwasambilila muli Discover Guide 1 mu Cibemba.',
        type: 'Test',
        estimatedMinutes: 10,
        questions: [
          {
            key: 'q-bem-1',
            question: 'Ukupikana kwa mubili wa muntu no bongo cilelangilila apabuuta ukuti kwaliba Kabumba wa mano.',
            answer: true,
            explanation: 'Cine! Amalumbo 139:14 yalangilila ukuti twalibumbwa mu nshila ya kupapa.',
            scriptureRef: 'Amalumbo 139:14'
          },
          {
            key: 'q-bem-2',
            question: 'Lesa talafwaya ukuba ne cibusa na bantu pano isonde.',
            answer: false,
            explanation: 'Bufi! Lesa atila: "Namutemwa no kutemwa kwa pe" (Yeremiya 31:3).',
            scriptureRef: 'Yeremiya 31:3'
          },
          {
            key: 'q-bem-3',
            question: 'Mu 1 Yohane 4:8, Baibolo itila: "Lesa kutemwa".',
            answer: true,
            explanation: 'Cine! Imibele ikalamba iya kwa Lesa kutemwa.',
            scriptureRef: '1 Yohane 4:8'
          }
        ]
      }
    ]
  },
  {
    id: 'guide-nya-1',
    discoverNumber: 1,
    title: 'Tingakhulupirire mwa Mulungu',
    subtitle: 'Maphunziro a Zoonadi 1',
    description: 'Onani umboni wokhutiritsa wa chilengedwe ndi chikhumbo cha Mulungu chokhala ndi ubale ndi inu.',
    language: 'nya',
    image: '/assets/guide_2.jpg',
    certificateEligible: true,
    lessons: [
      {
        id: 'lesson-nya-1-0',
        lessonNumber: '1.0',
        title: 'Mawu Oyamba',
        description: 'Takulandirani ku Maphunziro a Baibulo a Voice of Prophecy.',
        type: 'Lesson',
        estimatedMinutes: 5,
        contentPages: [
          {
            pageNumber: 1,
            title: 'Chikondi cha Mulungu',
            content: 'Mawu a Mulungu ndi nyali yowunikira mapazi athu ndi njira yathu m\'dziko lovutali. Baibulo ndi buku la moyo limene lili ndi chiyembekezo.',
            scriptureQuote: {
              text: 'Mawu anu ndi nyali ya kumapazi anga, ndi kuunika kwa njira yanga.',
              reference: 'Salimo 119:105'
            },
            keyTakeaway: 'Mawu a Mulungu amatipatsa chitsogozo chodalirika pa moyo.'
          }
        ]
      },
      {
        id: 'lesson-nya-1-5',
        lessonNumber: '1.5',
        title: 'Mayeso a Phunziro 1',
        description: 'Mayeso a zomwe mwaphunzira mu Phunziro loyamba.',
        type: 'Test',
        estimatedMinutes: 10,
        questions: [
          {
            key: 'q-nya-1',
            question: 'Chilengedwe chonse ndi thupi la munthu zimachitira umboni kuti kuli Mlengi wamphamvu zonse.',
            answer: true,
            explanation: 'Zoona! Salimo 139:14 likutitsimikizira zimenezi.',
            scriptureRef: 'Salimo 139:14'
          },
          {
            key: 'q-nya-2',
            question: 'Mulungu saganizira za anthu ndipo safuna kukhala nawo pa ubale.',
            answer: false,
            explanation: 'Bodza! Mulungu amatilondola ndi chikondi chosatha (Yeremiya 31:3).',
            scriptureRef: 'Yeremiya 31:3'
          }
        ]
      }
    ]
  },
  {
    id: 'guide-3',
    discoverNumber: 3,
    title: 'A God of Love in a World of Pain',
    subtitle: 'Discover Guide 3',
    description: 'Understanding the origin of suffering, the great controversy between good and evil, and God\'s ultimate rescue plan.',
    language: 'en',
    image: '/assets/vop_less_bg.jpg',
    certificateEligible: false,
    lessons: [
      {
        id: 'lesson-3-0',
        lessonNumber: '3.0',
        title: 'The Origin of Evil',
        description: 'Why a loving God permits sorrow and suffering temporarily.',
        type: 'Lesson',
        estimatedMinutes: 7,
        contentPages: [
          {
            pageNumber: 1,
            title: 'Where Did Suffering Come From?',
            content: `God did not create sickness, grief, pain, or death. These are the tragic consequences of rebellion against God's law of love. The Bible reveals a cosmic drama where God is actively working to eliminate evil forever while preserving the free will of His creatures.`,
            scriptureQuote: {
              text: 'And God shall wipe away all tears from their eyes; and there shall be no more death, neither sorrow, nor crying, neither shall there be any more pain.',
              reference: 'Revelation 21:4'
            },
            keyTakeaway: 'Suffering is temporary; God\'s promise of healing and eternal peace is sure.'
          }
        ]
      }
    ]
  }
];

export const INITIAL_USERS: User[] = [
  {
    uid: 'user-aubrey-matende',
    displayName: 'Aubrey Matende',
    email: 'obsndyxd@gmail.com',
    phoneNumber: '+260 97 7206617',
    photoURL: '/assets/profile.png',
    role: 'super_admin',
    adminNodeType: 'super',
    information: {
      enrollmentDate: '2023-01-15',
      decisionDate: '2023-05-10',
      completionDate: '2023-06-12',
      graduationDate: '2023-06-12',
      baptismDate: '2023-07-01',
      graduating: false,
      graduated: true,
      baptismCandidate: true,
      baptized: false,
      guardian: 'Pst. Ernesto Ricci',
      notes: 'Super Admin - Full system authority and governance configurator.'
    },
    privileges: {
      admin: true,
      superAdmin: true,
      guardian: true,
      editor: true,
      manager: true,
      developer: true
    },
    progress: {
      discoverProgress: 100,
      completedGuidesCount: 1,
      totalGuidesCount: 1,
      guideScores: { 'guide-1': 100 },
      completedLessons: ['lesson-1-0', 'lesson-1-1', 'lesson-1-2', 'lesson-1-3', 'lesson-1-4', 'lesson-1-5']
    }
  },
  {
    uid: 'user-union-admin',
    displayName: 'Pst. Ernesto Ricci',
    email: 'union.admin@szuc.org.zm',
    phoneNumber: '+260 211 254820',
    photoURL: '/assets/admin_user.png',
    role: 'union_admin',
    adminNodeType: 'union',
    adminNodeId: 'union-szuc',
    unionId: 'union-szuc',
    information: {
      enrollmentDate: '2022-01-01',
      graduating: false,
      graduated: true,
      baptismCandidate: false,
      baptized: true,
      notes: 'SZUC Union Personal Ministries Director'
    },
    privileges: {
      admin: true,
      superAdmin: false,
      guardian: true,
      editor: true,
      manager: true,
      developer: false,
      coordinator: true
    },
    progress: {
      discoverProgress: 100,
      completedGuidesCount: 1,
      totalGuidesCount: 1,
      guideScores: { 'guide-1': 100 },
      completedLessons: ['lesson-1-0', 'lesson-1-1', 'lesson-1-2', 'lesson-1-3', 'lesson-1-4', 'lesson-1-5']
    }
  },
  {
    uid: 'user-conf-admin',
    displayName: 'Pst. Keith Chuumpu',
    email: 'conf.admin@luc.org.zm',
    phoneNumber: '+260 97 1234567',
    photoURL: '/assets/admin_user.png',
    role: 'conference_admin',
    adminNodeType: 'conference',
    adminNodeId: 'conf-1',
    unionId: 'union-szuc',
    conferenceId: 'conf-1',
    information: {
      enrollmentDate: '2022-06-01',
      graduating: false,
      graduated: true,
      baptismCandidate: false,
      baptized: true,
      notes: 'Lusaka Conference VOP Director'
    },
    privileges: {
      admin: true,
      superAdmin: false,
      guardian: true,
      editor: true,
      manager: true,
      developer: false,
      coordinator: true
    },
    progress: {
      discoverProgress: 100,
      completedGuidesCount: 1,
      totalGuidesCount: 1,
      guideScores: { 'guide-1': 95 },
      completedLessons: ['lesson-1-0', 'lesson-1-1', 'lesson-1-2', 'lesson-1-3', 'lesson-1-4', 'lesson-1-5']
    }
  },
  {
    uid: 'user-dist-admin',
    displayName: 'Pst. M. Hangoma',
    email: 'district.pastor@libala.org.zm',
    phoneNumber: '+260 97 1112233',
    photoURL: '/assets/admin_user.png',
    role: 'district_admin',
    adminNodeType: 'district',
    adminNodeId: 'dist-1',
    unionId: 'union-szuc',
    conferenceId: 'conf-1',
    districtId: 'dist-1',
    information: {
      enrollmentDate: '2023-01-01',
      graduating: false,
      graduated: true,
      baptismCandidate: false,
      baptized: true,
      notes: 'Central Lusaka District Pastor'
    },
    privileges: {
      admin: true,
      superAdmin: false,
      guardian: true,
      editor: false,
      manager: true,
      developer: false,
      coordinator: true
    },
    progress: {
      discoverProgress: 100,
      completedGuidesCount: 1,
      totalGuidesCount: 1,
      guideScores: { 'guide-1': 90 },
      completedLessons: ['lesson-1-0', 'lesson-1-1', 'lesson-1-2', 'lesson-1-3', 'lesson-1-4', 'lesson-1-5']
    }
  },
  {
    uid: 'user-church-admin',
    displayName: 'Elder Emmanuel Chileshe',
    email: 'vop.leader@unza.org.zm',
    phoneNumber: '+260 97 7112233',
    photoURL: '/assets/admin_user.png',
    role: 'church_admin',
    adminNodeType: 'church',
    adminNodeId: 'church-1',
    unionId: 'union-szuc',
    conferenceId: 'conf-1',
    districtId: 'dist-1',
    churchId: 'church-1',
    information: {
      enrollmentDate: '2023-02-01',
      graduating: false,
      graduated: true,
      baptismCandidate: false,
      baptized: true,
      notes: 'UNZA SDA Church VOP Coordinator'
    },
    privileges: {
      admin: true,
      superAdmin: false,
      guardian: true,
      editor: false,
      manager: true,
      developer: false,
      coordinator: true
    },
    progress: {
      discoverProgress: 100,
      completedGuidesCount: 1,
      totalGuidesCount: 1,
      guideScores: { 'guide-1': 95 },
      completedLessons: ['lesson-1-0', 'lesson-1-1', 'lesson-1-2', 'lesson-1-3', 'lesson-1-4', 'lesson-1-5']
    }
  },
  {
    uid: 'user-chileshe-phiri',
    displayName: 'Chileshe Phiri',
    email: 'chileshe.p@gmail.com',
    phoneNumber: '+260 96 6123456',
    photoURL: '/assets/profile.png',
    role: 'student',
    unionId: 'union-szuc',
    conferenceId: 'conf-1',
    districtId: 'dist-1',
    churchId: 'church-1',
    information: {
      enrollmentDate: '2023-04-10',
      graduating: true,
      graduated: false,
      baptismCandidate: false,
      baptized: false,
      guardian: 'Elder Emmanuel Chileshe',
      notes: 'Passed all lessons; candidate graduation recommended to District Pastor.'
    },
    privileges: {
      admin: false,
      guardian: false,
      editor: false,
      manager: false,
      developer: false
    },
    progress: {
      discoverProgress: 100,
      completedGuidesCount: 1,
      totalGuidesCount: 1,
      guideScores: { 'guide-1': 92 },
      completedLessons: ['lesson-1-0', 'lesson-1-1', 'lesson-1-2', 'lesson-1-3', 'lesson-1-4', 'lesson-1-5']
    }
  },
  {
    uid: 'user-mwamba-banda',
    displayName: 'Mwamba Banda',
    email: 'mwamba.banda@yahoo.com',
    phoneNumber: '+260 97 8887766',
    photoURL: '/assets/profile.png',
    role: 'student',
    unionId: 'union-szuc',
    conferenceId: 'conf-1',
    districtId: 'dist-2',
    churchId: 'church-2',
    information: {
      enrollmentDate: '2023-06-01',
      graduating: false,
      graduated: false,
      baptismCandidate: false,
      baptized: false,
      guardian: 'Elder Joseph Phiri',
      notes: 'Currently studying Lesson 1.2.'
    },
    privileges: {
      admin: false,
      guardian: false,
      editor: false,
      manager: false,
      developer: false
    },
    progress: {
      discoverProgress: 35,
      completedGuidesCount: 0,
      totalGuidesCount: 1,
      guideScores: {},
      completedLessons: ['lesson-1-0', 'lesson-1-1']
    }
  },
  {
    uid: 'user-unassigned-candidate',
    displayName: 'Kondwani Tembo (Unassigned)',
    email: 'kondwani.unassigned@gmail.com',
    phoneNumber: '+260 95 5543210',
    photoURL: '/assets/profile.png',
    role: 'student',
    information: {
      enrollmentDate: '2023-09-01',
      graduating: false,
      graduated: false,
      baptismCandidate: false,
      baptized: false,
      notes: 'Self-registered candidate not yet assigned to any local church or study center.'
    },
    privileges: {
      admin: false,
      guardian: false,
      editor: false,
      manager: false,
      developer: false
    },
    progress: {
      discoverProgress: 50,
      completedGuidesCount: 0,
      totalGuidesCount: 1,
      guideScores: {},
      completedLessons: ['lesson-1-0', 'lesson-1-1', 'lesson-1-2']
    }
  }
];

export const INITIAL_ANNOUNCEMENTS: Announcement[] = [
  {
    id: 'ann-1',
    title: 'New Discover Bible Series Available!',
    tag: 'Spiritual Growth',
    description: 'Explore our newly remastered Discover Guides with audio read-aloud and digital certification.',
    actionText: 'Start Guide 1',
    actionUrl: '#guide-1'
  },
  {
    id: 'ann-2',
    title: 'Upcoming Baptismal Ceremony',
    tag: 'Ministry Event',
    description: 'Candidates who completed Discover Guides will be celebrating public baptism next Sabbath.',
    actionText: 'View Candidates',
    actionUrl: '#baptism'
  },
  {
    id: 'ann-3',
    title: 'Voice of Prophecy Radio Broadcasts',
    tag: 'Radio Ministry',
    description: 'Tune in weekly on local FM stations and digital radio for uplifting sermons and Bible answers.',
    actionText: 'Listen Online',
    actionUrl: '#radio'
  }
];

export const INITIAL_BOOKS: BookResource[] = [
  {
    id: 'book-1',
    name: 'Steps to Christ',
    category: 'Christian Living',
    author: 'Ellen G. White',
    imageUrl: '/assets/book.png',
    description: 'A timeless spiritual masterpiece showing the step-by-step path to experiencing peace, forgiveness, and intimacy with Jesus.'
  },
  {
    id: 'book-2',
    name: 'The Great Controversy',
    category: 'Prophecy & History',
    author: 'Ellen G. White',
    imageUrl: '/assets/books.png',
    description: 'Traces the epic conflict between truth and deception from the destruction of Jerusalem through the triumph of God\'s kingdom.'
  },
  {
    id: 'book-3',
    name: 'The Desire of Ages',
    category: 'Life of Christ',
    author: 'Ellen G. White',
    imageUrl: '/assets/book.png',
    description: 'An inspiring and deeply moving biography of Jesus Christ, revealing God’s unbounded love for fallen humanity.'
  }
];

export const INITIAL_UNIONS: Union[] = [
  {
    id: 'union-szuc',
    name: 'Southern Zambia Union Conference',
    code: 'SZUC',
    divisionName: 'Southern Africa-Indian Ocean Division (SID)',
    directorName: 'Pst. Ernesto Ricci',
    contactEmail: 'pm@szuc.adventist.org',
    contactPhone: '+260 211 254820',
    headquarters: 'Plot 9221, Corner of Burma & Independence Avenue, Lusaka'
  },
  {
    id: 'union-nzuc',
    name: 'Northern Zambia Union Conference',
    code: 'NZUC',
    divisionName: 'Southern Africa-Indian Ocean Division (SID)',
    directorName: 'Pst. Samuel Sinyangwe',
    contactEmail: 'pm@nzuc.adventist.org',
    contactPhone: '+260 212 612345',
    headquarters: 'Stand 445, Freedom Way, Ndola'
  }
];

export const INITIAL_CONFERENCES: Conference[] = [
  {
    id: 'conf-1',
    unionId: 'union-szuc',
    name: 'Lusaka Conference',
    code: 'LUC',
    region: 'Lusaka Province',
    directorName: 'Pst. Keith Chuumpu',
    contactEmail: 'pm@lusakaconference.org'
  },
  {
    id: 'conf-2',
    unionId: 'union-nzuc',
    name: 'Copperbelt Conference',
    code: 'CBC',
    region: 'Copperbelt Province',
    directorName: 'Pst. Webster Silungwe',
    contactEmail: 'pm@copperbeltconference.org'
  },
  {
    id: 'conf-3',
    unionId: 'union-szuc',
    name: 'South Zambia Conference',
    code: 'SZC',
    region: 'Southern Province',
    directorName: 'Pst. Maxwell Muvwimi',
    contactEmail: 'pm@southzambiaconference.org'
  }
];

export const INITIAL_DISTRICTS: District[] = [
  {
    id: 'dist-1',
    unionId: 'union-szuc',
    conferenceId: 'conf-1',
    name: 'Central Lusaka District',
    pastorName: 'Pst. M. Hangoma',
    contactPhone: '+260 97 1112233'
  },
  {
    id: 'dist-2',
    unionId: 'union-szuc',
    conferenceId: 'conf-1',
    name: 'Woodlands District',
    pastorName: 'Pst. C. Siyumbwa',
    contactPhone: '+260 97 2223344'
  },
  {
    id: 'dist-3',
    unionId: 'union-nzuc',
    conferenceId: 'conf-2',
    name: 'Kitwe North District',
    pastorName: 'Pst. B. Mwewa',
    contactPhone: '+260 96 3334455'
  },
  {
    id: 'dist-4',
    unionId: 'union-szuc',
    conferenceId: 'conf-3',
    name: 'Livingstone Central District',
    pastorName: 'Pst. D. Haamaundu',
    contactPhone: '+260 95 4445566'
  }
];

export const INITIAL_CHURCHES: ChurchOrganization[] = [
  {
    id: 'church-1',
    unionId: 'union-szuc',
    conferenceId: 'conf-1',
    districtId: 'dist-1',
    name: 'University SDA Church',
    type: 'Campus Ministry',
    leaderName: 'Elder Emmanuel Chileshe',
    leaderPhone: '+260 97 7112233',
    location: 'UNZA Great East Road Campus, Lusaka'
  },
  {
    id: 'church-2',
    unionId: 'union-szuc',
    conferenceId: 'conf-1',
    districtId: 'dist-2',
    name: 'Libala SDA Church',
    type: 'Church',
    leaderName: 'Elder Joseph Phiri',
    leaderPhone: '+260 96 6223344',
    location: 'Libala Stage 2, Lusaka'
  },
  {
    id: 'church-3',
    unionId: 'union-nzuc',
    conferenceId: 'conf-2',
    districtId: 'dist-3',
    name: 'Riverside SDA Church',
    type: 'Church',
    leaderName: 'Elder Davis Mulenga',
    leaderPhone: '+260 97 8334455',
    location: 'Riverside, Kitwe'
  },
  {
    id: 'church-4',
    unionId: 'union-szuc',
    conferenceId: 'conf-1',
    districtId: 'dist-1',
    name: 'Lusaka Central Prison Ministry Center',
    type: 'Prison Ministry',
    leaderName: 'Chaplain Reuben Tembo',
    leaderPhone: '+260 97 9445566',
    location: 'Lusaka Central Correctional Facility'
  }
];

export const INITIAL_HIERARCHY_CONFIG: HierarchyConfig = {
  divisionName: 'Southern Africa-Indian Ocean Division (SID)',
  reportingLevels: [
    {
      id: 'level-1',
      level: 'church',
      title: 'Local Church / Study Center',
      order: 1,
      reportsToLevelId: 'level-2',
      graduationApprovalRequired: true,
      description: 'Reviews candidate lessons, marks quiz submissions, and conducts local spiritual mentoring.'
    },
    {
      id: 'level-2',
      level: 'district',
      title: 'Church District',
      order: 2,
      reportsToLevelId: 'level-3',
      graduationApprovalRequired: true,
      description: 'Supervises all local churches in district, endorses graduation candidates, and plans district rallies.'
    },
    {
      id: 'level-3',
      level: 'conference',
      title: 'Conference / Field',
      order: 3,
      reportsToLevelId: 'level-4',
      graduationApprovalRequired: true,
      description: 'Issues graduation certificates, manages district directors, coordinates lesson distribution.'
    },
    {
      id: 'level-4',
      level: 'union',
      title: 'Union Conference',
      order: 4,
      reportsToLevelId: 'level-5',
      graduationApprovalRequired: false,
      description: 'Strategic oversight across conferences, multi-lingual curriculum development, national media.'
    },
    {
      id: 'level-5',
      level: 'division',
      title: 'Division / General (SID)',
      order: 5,
      graduationApprovalRequired: false,
      description: 'Continental leadership, doctrinal alignment, global radio and TV broadcasting partnerships.'
    }
  ],
  graduationChain: ['church', 'district', 'conference'],
  allowUnassignedStudents: true
};

export const INITIAL_GRADUATION_REQUESTS: GraduationRequest[] = [
  {
    id: 'grad-req-1',
    candidateId: 'user-chileshe-phiri',
    candidateName: 'Chileshe Phiri',
    candidateEmail: 'chileshe.p@gmail.com',
    guideId: 'guide-1',
    guideTitle: 'We Can Believe in God',
    churchId: 'church-1',
    districtId: 'dist-1',
    conferenceId: 'conf-1',
    unionId: 'union-szuc',
    averageScore: 92,
    status: 'pending_district',
    submittedAt: '2026-09-10T14:30:00Z',
    approverNotes: 'Completed all 5 lessons with excellent answers. Church approved recommendation on Sep 12.'
  },
  {
    id: 'grad-req-2',
    candidateId: 'user-aubrey-matende',
    candidateName: 'Aubrey Matende',
    candidateEmail: 'obsndyxd@gmail.com',
    guideId: 'guide-1',
    guideTitle: 'We Can Believe in God',
    churchId: 'church-1',
    districtId: 'dist-1',
    conferenceId: 'conf-1',
    unionId: 'union-szuc',
    averageScore: 100,
    status: 'approved',
    submittedAt: '2026-08-20T10:00:00Z',
    approvedAt: '2026-08-25T11:30:00Z',
    approverNotes: 'Full distinction. Certificate issued by Conference VOP Director.'
  }
];

export const INITIAL_PRAYER_REQUESTS: PrayerRequest[] = [
  {
    id: 'prayer-1',
    candidateId: 'user-chileshe-phiri',
    candidateName: 'Chileshe Phiri',
    churchId: 'church-1',
    category: 'Spiritual',
    requestText: 'Please pray for my upcoming baptismal decision and for my family to accept Christ.',
    isPrivate: false,
    status: 'Praying',
    createdAt: '2026-09-14T09:15:00Z'
  },
  {
    id: 'prayer-2',
    candidateId: 'user-mwamba-banda',
    candidateName: 'Mwamba Banda',
    churchId: 'church-2',
    category: 'Health',
    requestText: 'Praying for healing for my mother undergoing surgery next Tuesday.',
    isPrivate: true,
    status: 'Received',
    createdAt: '2026-09-16T16:40:00Z'
  }
];

export const INITIAL_RADIO_BROADCASTS: RadioBroadcast[] = [
  {
    id: 'radio-1',
    title: 'Finding Peace in a Chaotic World',
    speaker: 'Pastor Shawn Boonstra',
    series: 'Voice of Prophecy Worldwide',
    durationMinutes: 28,
    audioUrl: 'https://archive.org/download/PeaceInAChaoticWorld/PeaceInAChaoticWorld.mp3',
    broadcastTime: 'Every Sunday 09:00 AM CAT',
    description: 'A powerful look into biblical prophecies revealing God\'s ultimate plan for human restoration.'
  },
  {
    id: 'radio-2',
    title: 'Bible Answers Live: The Law and Grace',
    speaker: 'Pst. Ernesto Ricci',
    series: 'VOP Zambia Airwaves',
    durationMinutes: 45,
    audioUrl: 'https://archive.org/download/LawAndGraceVOP/LawAndGraceVOP.mp3',
    broadcastTime: 'Every Wednesday 19:30 PM CAT',
    description: 'Answering listener call-in questions regarding the Sabbath, the Ten Commandments, and salvation by faith alone.'
  }
];

export const INITIAL_DETAIL_PAGES: DetailPagesSettings = {
  aboutUsMission: 'The Voice of Prophecy (VOP) Bible Correspondence School is dedicated to proclaiming the everlasting gospel of our Lord and Savior Jesus Christ across Zambia and Southern Africa. Through systematic, Christ-centered correspondence lessons, evangelistic rallies, and community mentorship, we lead souls into saving fellowship with Christ.',
  aboutUsHistory: 'Established under the Seventh-day Adventist Church / RZUC Personal Ministries Department, the Voice of Prophecy has graduated hundreds of thousands of candidates since its inception, touching hearts across universities, correctional centers, urban centers, and remote rural districts.',
  aboutUsLeadership: 'Supervised by the RZUC Personal Ministries Department under Director Pst. Ernesto Ricci, in full collaboration with conference leadership, district pastors, and volunteer VOP coordinators in local churches.',
  aboutAppDescription: 'The Voice of Prophecy App v3.5 Pro is an advanced, offline-first Bible correspondence platform engineered for both web browsers and native Android devices. It enables students to study lessons in their native languages, take interactive doctrinal tests, track spiritual milestones toward graduation and baptism, and receive official certified credentials.',
  aboutAppVersion: 'Version 3.5.0 Pro (Dual Web & Android Release)',
  aboutAppCredits: 'Built with pride for the Voice of Prophecy Bible School by the RZUC Technology and Media Ministry Team.',
  contactOfficeAddress: 'Plot 9221, Corner of Burma & Independence Avenue, P.O. Box 31309, Lusaka, Zambia',
  contactOfficeHours: 'Monday – Thursday: 08:00 – 17:00 | Friday: 08:00 – 12:30 | Sabbath & Sunday: Closed for Worship & Ministry',
  contactPhoneNumbers: ['+260 97 7206617', '+260 211 254820'],
  contactEmails: ['vop@rzuc.adventist.org', 'support@vopapp.org'],
  contactWhatsAppNumbers: ['260977206617'],
  socialLinks: {
    website: 'https://vop.adventist.org',
    facebook: 'https://facebook.com/vopzambia',
    youtube: 'https://youtube.com/@vopzambia'
  }
};

export const INITIAL_LANGUAGES: CustomLanguage[] = [
  { code: 'BEM', name: 'Bemba', nativeName: 'Ichibemba', enabled: true, sortOrder: 1 },
  { code: 'ENG', name: 'English', nativeName: 'English', enabled: true, sortOrder: 2 },
  { code: 'NYA', name: 'Nyanja', nativeName: 'Chinyanja', enabled: true, sortOrder: 3 },
  { code: 'TON', name: 'Tonga', nativeName: 'Chitonga', enabled: false, sortOrder: 4 },
  { code: 'LOZ', name: 'Lozi', nativeName: 'Silozi', enabled: false, sortOrder: 5 },
  { code: 'KAO', name: 'Kaonde', nativeName: 'Kiikaonde', enabled: false, sortOrder: 6 },
];

