/**
 * Legal texts for /privacy and /terms, in Hebrew and English.
 *
 * STATUS: DRAFT. These texts have not been reviewed by a qualified Israeli lawyer.
 * Items in square brackets [like this] are open questions for counsel and must be
 * resolved before launch. See docs/LEGAL-TODO.md and docs/LEGAL-REVIEW-PACKET.md.
 */

export interface LegalBlock {
  h: string;
  p?: string[];
  ul?: string[];
}

export interface LegalDoc {
  title: string;
  updated: string;
  draftNotice: string;
  eyebrow: string;
  back: string;
  intro: string[];
  sections: LegalBlock[];
  contactLabel: string;
  contactEmail: string;
}

export const SUPPORT_EMAIL = "support@haveniq.com";

export const privacy: Record<"he" | "en", LegalDoc> = {
  he: {
    title: "מדיניות פרטיות",
    updated: "עודכן לאחרונה: נובמבר 2026",
    draftNotice: "טיוטה — הנוסח טרם נבדק על ידי עורך דין ואין להסתמך עליו עד לאישורו.",
    eyebrow: "משפטי",
    back: "חזרה ל-Haveniq",
    intro: [
      "מדיניות פרטיות זו מסבירה כיצד Haveniq (\"אנחנו\") אוספת, משתמשת ומשתפת מידע כאשר משתמשים בפלטפורמה (\"הפלטפורמה\"). השימוש בפלטפורמה כפוף למדיניות זו ולחוק הגנת הפרטיות, התשמ\"א-1981, ותיקוניו.",
    ],
    sections: [
      {
        h: "1. מידע שאנו אוספים",
        p: ["פרטי חשבון: כתובת דוא\"ל, שם, מספר טלפון, סיסמה (מאוחסנת בצורה מוצפנת), וליזמים ולמוכרים גם שם חברה, מספר רישום ופרטי התקשרות."],
        ul: [
          "נתוני ראיון: אודיו, ולעיתים וידאו, של השיחה; תמליל שנוצר ממנה; פרופיל העדפות מובנה שנגזר מהתמליל (למשל טווח תקציב, מיקום, לוח זמנים, מצב משפחתי וקריטריונים נוספים שתמסור).",
          "נתוני עסקה ומשא ומתן: הצעות מחיר, הצעות נגד, הודעות, שינויי סטטוס בחדר העסקה, ופרטי צעדי חתימה שביצעת (כולל תמונת החתימה והשם המוקלד).",
          "נתוני שימוש: חותמות זמן של כניסה, דפים שנצפו ופעולות בפלטפורמה, לצורכי אבטחה, הגבלת קצב ושיפור השירות.",
        ],
      },
      {
        h: "2. איך אנו משתמשים במידע",
        ul: [
          "להפעלת מנוע ההתאמה וליצירת התאמות רלוונטיות.",
          "לאפשר תקשורת ומשא ומתן בין קונים ליזמים או מוכרים.",
          "לאימות זהות של יזמים ולאישור חשבונותיהם.",
          "לשמירה על אבטחת הפלטפורמה, לרבות אכיפת מגבלות שימוש.",
          "לשיפור וזיהוי תקלות בתהליך הראיון וההתאמה.",
        ],
      },
      {
        h: "3. שיתוף המידע",
        p: [
          "עם משתמשים אחרים: כאשר אתה מגיש או מקבל הצעה, פרטים מסוימים (כגון כתובת הדוא\"ל, המחיר המוצע והעדפות שהצהרת) משותפים עם הצד השני לאותה עסקה בלבד.",
          "עם ספקי שירות: אנו משתמשים בספקים שמפעילים חלקים מהפלטפורמה, והם מעבדים מידע עבורנו בלבד: ספקי בינה מלאכותית קולית ותמלול לראיון; ספקי רינדור אווטאר; ספקי מודלי שפה לניתוח התמליל; ספקי אחסון ומסד נתונים; שירות שליחת דוא\"ל; ושירותי Google אם חיברת יומן.",
          "[לאישור עורך דין: חלק מהספקים עשויים לעבד מידע מחוץ לישראל. יש לקבוע את הדרישות להעברת מידע לחו\"ל.]",
          "לפי דין: אנו עשויים לחשוף מידע כנדרש על פי חוק, תקנה או צו שיפוטי.",
          "איננו מוכרים מידע אישי לצדדים שלישיים.",
        ],
      },
      {
        h: "4. עוגיות",
        p: [
          "הפלטפורמה משתמשת רק בעוגיות הכרחיות: עוגיית כניסה לחשבון (httpOnly) ועוגיית העדפת שפה. איננו משתמשים בעוגיות פרסום או מעקב. להודעה על העוגיות נשמר רק אישור צפייה בדפדפן שלך.",
        ],
      },
      {
        h: "5. שמירת מידע",
        p: [
          "נשמור נתוני חשבון כל עוד החשבון פעיל. נתוני עסקה ורישומים משפטיים ייתכן שיישמרו לתקופה נוספת כדי לעמוד בחובות חוקיות, לברר מחלוקות ולאכוף הסכמים.",
          "[לאישור עורך דין: תקופות שמירה מדויקות לכל סוג מידע, ונוהל מחיקה שמשמר רישומים משפטיים באופן מאובטח.]",
        ],
      },
      {
        h: "6. הזכויות שלך",
        p: ["בכפוף לדין, באפשרותך לבקש:"],
        ul: [
          "לעיין במידע האישי שאנו מחזיקים עליך.",
          "לתקן מידע שגוי. רוב השדות ניתנים לעריכה ישירות בעמוד הפרופיל.",
          "למחוק את חשבונך ואת המידע הקשור אליו, דרך עמוד הפרופיל או בפנייה לכתובת למטה.",
        ],
      },
      {
        h: "7. אבטחה",
        p: ["אנו נוקטים באמצעים טכניים וארגוניים סבירים להגנה על המידע, לרבות אחסון מוצפן של סיסמאות ובקרת גישה. אף מערכת אינה מאובטחת לחלוטין, ולכן איננו יכולים להבטיח אבטחה מוחלטת."],
      },
      {
        h: "8. קטינים",
        p: ["הפלטפורמה אינה מיועדת לאנשים מתחת לגיל 18, ואיננו אוספים ביודעין מידע אישי מקטינים."],
      },
      {
        h: "9. שינויים במדיניות",
        p: ["נעדכן מדיניות זו מעת לעת. שינויים מהותיים יסומנו בתאריך העדכון שבראש העמוד."],
      },
      {
        h: "10. יצירת קשר",
        p: ["לשאלות בנושא פרטיות ולבקשות מימוש זכויות ניתן לפנות אלינו בכתובת הדוא\"ל למטה."],
      },
    ],
    contactLabel: "דוא\"ל לפניות",
    contactEmail: SUPPORT_EMAIL,
  },
  en: {
    title: "Privacy Policy",
    updated: "Last updated: November 2026",
    draftNotice: "Draft — this text has not yet been reviewed by counsel. Do not rely on it until approved.",
    eyebrow: "Legal",
    back: "Back to Haveniq",
    intro: [
      "This Privacy Policy explains how Haveniq (\"we\") collects, uses and shares information when you use the platform (the \"Platform\"). Use of the Platform is subject to this policy and to the Israeli Protection of Privacy Law, 5741-1981, as amended.",
    ],
    sections: [
      {
        h: "1. Information we collect",
        p: ["Account information: email address, name, phone number, password (stored encrypted), and for Developers and Sellers also company name, registration number and contact details."],
        ul: [
          "Interview data: audio and, where applicable, video of the conversation; a transcript generated from it; and a structured preference profile derived from the transcript (for example budget range, location, timeline, family situation and other criteria you share).",
          "Transaction and negotiation data: offers, counter-offers, messages, status changes in the Deal Room, and details of signing steps you complete (including the signature image and typed name).",
          "Usage data: login timestamps, pages viewed and actions taken, used for security, rate-limiting and service improvement.",
        ],
      },
      {
        h: "2. How we use information",
        ul: [
          "To run the matching engine and produce relevant matches.",
          "To enable communication and negotiation between Buyers and Developers or Sellers.",
          "To verify Developer identity and approve Developer accounts.",
          "To keep the Platform secure, including enforcing usage limits.",
          "To improve and troubleshoot the Interview and matching features.",
        ],
      },
      {
        h: "3. Sharing information",
        p: [
          "With other users: when you submit or receive an offer, certain details (such as your email address, offered price and stated preferences) are shared with the other party to that transaction only.",
          "With service providers: we use providers that run parts of the Platform and process data only on our behalf: conversational AI and voice transcription for the Interview; avatar video rendering; language-model providers for analysing transcripts; cloud hosting and database providers; email delivery; and Google services if you connect a calendar.",
          "[For counsel: some providers may process data outside Israel. The requirements for cross-border transfers must be confirmed.]",
          "Legal requirements: we may disclose information where required by law, regulation or a court order.",
          "We do not sell personal information to third parties.",
        ],
      },
      {
        h: "4. Cookies",
        p: [
          "The Platform uses only strictly necessary cookies: a login session cookie (httpOnly) and a language preference cookie. We do not use advertising or tracking cookies. The cookie notice stores only a record in your browser that you dismissed it.",
        ],
      },
      {
        h: "5. Retention",
        p: [
          "We keep account data for as long as the account is active. Transaction records and legal records may be kept for a further period to meet legal obligations, resolve disputes and enforce agreements.",
          "[For counsel: exact retention periods for each category, and a deletion procedure that keeps legal records securely.]",
        ],
      },
      {
        h: "6. Your rights",
        p: ["Subject to applicable law, you may ask to:"],
        ul: [
          "Access the personal information we hold about you.",
          "Correct inaccurate information. Most fields can be edited on your Profile page.",
          "Delete your account and related data, from the Profile page or by contacting us below.",
        ],
      },
      {
        h: "7. Security",
        p: ["We use reasonable technical and organisational measures to protect information, including encrypted password storage and access controls. No system is completely secure, so we cannot guarantee absolute security."],
      },
      {
        h: "8. Children",
        p: ["The Platform is not directed to people under 18, and we do not knowingly collect personal information from minors."],
      },
      {
        h: "9. Changes to this policy",
        p: ["We may update this policy from time to time. Material changes will be reflected in the \"Last updated\" date above."],
      },
      {
        h: "10. Contact",
        p: ["For privacy questions and requests to exercise your rights, contact us at the address below."],
      },
    ],
    contactLabel: "Contact email",
    contactEmail: SUPPORT_EMAIL,
  },
};

export const terms: Record<"he" | "en", LegalDoc> = {
  he: {
    title: "תנאי שימוש",
    updated: "עודכן לאחרונה: נובמבר 2026",
    draftNotice: "טיוטה — הנוסח טרם נבדק על ידי עורך דין ואין להסתמך עליו עד לאישורו.",
    eyebrow: "משפטי",
    back: "חזרה ל-Haveniq",
    intro: [
      "Haveniq (\"אנחנו\" או \"הפלטפורמה\") מפעילה שוק מקוון המחבר בין קונים פוטנציאליים של נכסים לבין יזמים ומוכרים בישראל. הפלטפורמה משתמשת בראיון בעזרת בינה מלאכותית כדי לאפיין את העדפות הקונה ולהתאים לו נכסים רלוונטיים.",
      "בעצם יצירת חשבון או שימוש בפלטפורמה אתה מסכים לתנאים אלה. אם אינך מסכים, אל תשתמש בפלטפורמה.",
    ],
    sections: [
      {
        h: "1. זכאות וחשבונות",
        ul: [
          "עליך להיות בן 18 לפחות כדי לפתוח חשבון.",
          "קונים נרשמים בכתובת דוא\"ל תקפה ונדרשים לאמת אותה לפני גישה לתכונות ההתאמה.",
          "יזמים נרשמים עם פרטי חברה מזהים (לרבות מספר רישום) וכפופים לאישור ידני לפני גישה ללוח הבקרה. Haveniq רשאית לאשר, לדחות או לשלול גישה לפי שיקול דעתה.",
          "אתה אחראי לשמירה על סודיות פרטי ההתחברות שלך ולכל פעילות בחשבונך.",
        ],
      },
      {
        h: "2. הראיון ותהליך ההתאמה",
        ul: [
          "קונה משתתף בראיון מודרך בעזרת בינה מלאכותית כדי שהפלטפורמה תבין את העדפותיו בנכס, את התקציב, את לוח הזמנים וקריטריונים נוספים.",
          "הראיון עשוי להתבצע בקול סינתטי ו/או בוידאו (\"אווטאר\"), ומתומלל ומנותח על ידי מערכות בינה מלאכותית, לרבות ספקי צד שלישי, כדי לייצר פרופיל העדפות מובנה.",
          "מספר הראיונות (לרבות ניסיונות חוזרים) שקונה רשאי להתחיל בתקופה נתונה עשוי להיות מוגבל.",
          "תוצאות ההתאמה נוצרות אלגוריתמית על בסיס המידע שמסרת והמודעות הזמינות. Haveniq אינה מבטיחה שהתאמה, הצעה או מודעה יענו על ציפיותיך, יישארו זמינים או יובילו לעסקה שהושלמה.",
        ],
      },
      {
        h: "3. הצעות, משא ומתן וחדר העסקה",
        ul: [
          "קונים רשאים להגיש הצעות על מודעות. במודעות של מוכרים פרטיים, המוכר רשאי לקבל, לדחות או להציע נגד.",
          "הצעה שהתקבלה מובילה לחדר עסקה, שבו שני הצדדים יכולים לעקוב אחרי סטטוס העסקה, כולל שלב דמי קדימה מדומים ושלב חתימת חוזה דיגיטלי.",
          "הרכיבים הבאים של חדר העסקה, לרבות תשלום דמי קדימה וזרימת החתימה, הם כיום מדומים להדגמה בלבד, ואינם מהווים עסקה כספית אמיתית או הסכם מחייב. כל מסמך שנוצר בזרימת החתימה מסופק לצורכי תיעוד והדגמה בלבד, ואין להסתמך עליו במקום חוזה מחייב שנערך כדין בליווי עורך דין.",
          "השלמת עסקת מקרקעין דורשת צעדים משפטיים, פיננסיים ורגולטוריים מחוץ לפלטפורמה, לרבות מעורבות עורך דין מוסמך.",
        ],
      },
      {
        h: "4. מודעות יזמים ומוכרים",
        ul: [
          "יזמים ומוכרים אחראים באופן בלעדי לדיוק המידע, המחיר, הזמינות והמדיה (לרבות תמונות וסיורים וירטואליים) שהם מעלים לפלטפורמה.",
          "Haveniq אינה בודקת באופן עצמאי את דיוק המודעות, ואינה אחראית לשגיאות, להשמטות או למידע לא מעודכן בתוכן שמסרו היזמים.",
        ],
      },
      {
        h: "5. שימוש מותר",
        p: ["אתה מתחייב שלא:"],
        ul: [
          "למסור מידע כוזב או מטעה בהרשמה, בראיון או ביצירת מודעה.",
          "לנסות לתמרן, להפריע או לעקוף את מערכות הבינה המלאכותית, את אלגוריתם ההתאמה או את מגבלות השימוש של הפלטפורמה.",
          "להשתמש בפלטפורמה לכל מטרה בלתי חוקית או להטריד משתמש אחר.",
        ],
      },
      {
        h: "6. שירותי צד שלישי",
        p: [
          "הפלטפורמה נשענת על ספקי צד שלישי לתכונות מסוימות, לרבות בינה מלאכותית שיחתית, סינתזת קול, רינדור אווטאר וניתוח מבוסס מודלי שפה. השימוש בתכונות הראיון כרוך בעיבוד המידע שלך על ידי ספקים אלה כמתואר ב<a href=\"/privacy\">מדיניות הפרטיות</a>.",
        ],
      },
      {
        h: "7. הבהרות והגבלת אחריות",
        p: ["הפלטפורמה ניתנת \"כמות שהיא\" וכפי שהיא זמינה, ללא אחריות מכל סוג שהוא, במפורש או מכללא. במידה המרבית המותרת על פי דין, Haveniq מסירה מעליה כל אחריות, ואינה אחראית לנזקים עקיפים, מקריים, מיוחדים או תוצאתיים הנובעים משימוש בפלטפורמה, לרבות הסתמכות על תוצאות התאמה או על תוכן חדר העסקה. [לאישור עורך דין: היקף ההגבלה וסעיפי הפטור.]"],
      },
      {
        h: "8. נגישות",
        p: ["Haveniq מחויבת להנגשת הפלטפורמה לאנשים עם מוגבלות ושואפת לעמוד בתקן הישראלי ת\"י 5568, המבוסס על WCAG 2.0 ברמה AA. אם נתקלת בקושי גישה, פנה אלינו בכתובת שלמטה. [לאישור עורך דין ולבדיקת נגישות מלאה.]"],
      },
      {
        h: "9. שינויים בתנאים",
        p: ["נעדכן תנאים אלה מעת לעת. המשך השימוש בפלטפורמה לאחר כניסת השינויים לתוקף מהווה הסכמה לנוסח המעודכן."],
      },
      {
        h: "10. דין חל וסמכות שיפוט",
        p: ["תנאים אלה כפופים לדין הישראלי. [לאישור עורך דין: סמכות השיפוט הייחודית, למשל בתי המשפט במחוז תל אביב.]"],
      },
      {
        h: "11. יצירת קשר",
        p: ["לשאלות בנוגע לתנאים אלה ניתן לפנות אלינו בכתובת הדוא\"ל שלמטה."],
      },
    ],
    contactLabel: "דוא\"ל לפניות",
    contactEmail: SUPPORT_EMAIL,
  },
  en: {
    title: "Terms of Service",
    updated: "Last updated: November 2026",
    draftNotice: "Draft — this text has not yet been reviewed by counsel. Do not rely on it until approved.",
    eyebrow: "Legal",
    back: "Back to Haveniq",
    intro: [
      "Haveniq (\"we\" or the \"Platform\") runs an online marketplace that connects prospective property buyers with developers and sellers in Israel. The Platform uses an AI-assisted interview to characterise buyer preferences and match them with relevant listings.",
      "By creating an account or using the Platform you agree to these terms. If you do not agree, do not use the Platform.",
    ],
    sections: [
      {
        h: "1. Eligibility and accounts",
        ul: [
          "You must be at least 18 years old to create an account.",
          "Buyers register with a valid email address and must verify it before using matching features.",
          "Developers register with identifying company details (including a registration number) and need manual approval before accessing the developer dashboard. Haveniq may approve, reject or revoke access at its discretion.",
          "You are responsible for keeping your credentials confidential and for all activity under your account.",
        ],
      },
      {
        h: "2. The interview and matching",
        ul: [
          "Buyers take a guided, AI-assisted interview so the Platform can understand their property preferences, budget, timeline and other criteria.",
          "The interview may use synthetic voice and/or video (an \"avatar\") and is transcribed and analysed by AI systems, including third-party providers, to produce a structured preference profile.",
          "The number of interviews (including retakes) a buyer may start in a given period may be limited.",
          "Matches are generated algorithmically from the information you provide and the listings available. Haveniq does not guarantee that a match, offer or listing will meet your expectations, remain available or lead to a completed transaction.",
        ],
      },
      {
        h: "3. Offers, negotiation and the Deal Room",
        ul: [
          "Buyers may submit offers on listings. For private-seller listings, the seller may accept, reject or counter.",
          "An accepted offer moves to a Deal Room where both parties can follow the deal status, including a simulated deposit step and a digital contract-signing step.",
          "The following Deal Room features, including deposit payments and the signing flow, are currently simulated for demonstration only. They are not real financial transactions or binding agreements. Any document produced by the signing flow is for record-keeping and demonstration only and must not be relied on in place of a properly executed, legally binding contract prepared with independent counsel.",
          "Completing a real estate transaction requires independent legal, financial and regulatory steps outside the Platform, including engaging a licensed solicitor.",
        ],
      },
      {
        h: "4. Developer and seller listings",
        ul: [
          "Developers and sellers are solely responsible for the accuracy of the information, prices, availability and media (including photographs and virtual tours) they upload.",
          "Haveniq does not independently verify listings and is not responsible for errors, omissions or outdated information in content supplied by developers or sellers.",
        ],
      },
      {
        h: "5. Acceptable use",
        p: ["You agree not to:"],
        ul: [
          "Provide false or misleading information during registration, the interview or listing creation.",
          "Attempt to manipulate, disrupt or circumvent the AI systems, the matching algorithm or the Platform's usage limits.",
          "Use the Platform for any unlawful purpose or to harass another user.",
        ],
      },
      {
        h: "6. Third-party services",
        p: ["The Platform relies on third-party providers for some features, including conversational AI, voice synthesis, avatar rendering and language-model analysis. Using interview features involves those providers processing your data as described in our <a href=\"/privacy\">Privacy Policy</a>."],
      },
      {
        h: "7. Disclaimers and limitation of liability",
        p: ["The Platform is provided \"as is\" and \"as available\", without warranties of any kind, express or implied. To the maximum extent permitted by law, Haveniq disclaims all warranties and is not liable for indirect, incidental, special or consequential damages arising from use of the Platform, including reliance on matching results or Deal Room content. [For counsel: scope of the limitation and exclusion clauses.]"],
      },
      {
        h: "8. Accessibility",
        p: ["Haveniq is committed to making the Platform accessible to people with disabilities and aims to meet the Israeli standard SI 5568, based on WCAG 2.0 level AA. If you encounter an access barrier, contact us at the address below. [For counsel and a full accessibility audit before launch.]"],
      },
      {
        h: "9. Changes to these terms",
        p: ["We may update these terms from time to time. Continued use of the Platform after changes take effect means you accept the revised terms."],
      },
      {
        h: "10. Governing law and jurisdiction",
        p: ["These terms are governed by the laws of the State of Israel. [For counsel: exclusive jurisdiction, for example the courts of the Tel Aviv district.]"],
      },
      {
        h: "11. Contact",
        p: ["For questions about these terms, contact us at the address below."],
      },
    ],
    contactLabel: "Contact email",
    contactEmail: SUPPORT_EMAIL,
  },
};
