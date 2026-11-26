/* Bot + UI strings in English (en), Tanglish (tl), Tamil (ta).
   Each entry is either {en, tl, ta} strings or a function (p) => {en, tl, ta}. */
window.STR = {
  greet: {
    en: "Hi! 👋 I'm *MotoAI*, your personal car advisor.\nI'll ask 5 quick questions, just like a showroom expert would, and suggest the best car for your family with the *exact on-road price*.",
    tl: "Vanakkam! 👋 Naan *MotoAI*, unga personal car advisor.\nShowroom-la kekura maadhiri 5 simple questions kepen. Unga family-ku best car-a *exact on-road price*-oda solren.",
    ta: "வணக்கம்! 👋 நான் *MotoAI*, உங்க personal car advisor.\nShowroom-ல கேக்குற மாதிரி 5 சின்ன கேள்விகள் கேப்பேன். உங்க family-க்கு best car-ஐ *exact on-road price*-ஓட சொல்றேன்.",
  },
  web_greet: {
    en: "Hi! 👋 I'm *MotoAI*. Tell me a little about your needs and I'll shortlist the right car with exact on-road prices.",
    tl: "Hi! 👋 Naan *MotoAI*. Unga needs konjam sollunga, sariyana car-a exact on-road price-oda shortlist panren.",
    ta: "வணக்கம்! 👋 நான் *MotoAI*. உங்க தேவைகளை கொஞ்சம் சொல்லுங்க. சரியான car-ஐ exact on-road price-ஓட shortlist பண்றேன்.",
  },
  b_start: { en: "Let's start", tl: "Start pannalaam", ta: "ஆரம்பிக்கலாம்" },
  b_browse: { en: "Just browsing", tl: "Summa paakaren", ta: "சும்மா பாக்குறேன்" },
  browse_msg: {
    en: "No problem! Here's our full line-up on the website. I'll be right here when you need me.",
    tl: "Paravala! Full line-up website-la irukku. Thevai-na naan inga dhaan iruppen.",
    ta: "பரவாயில்ல! முழு line-up website-ல இருக்கு. தேவைப்பட்டா நான் இங்கதான் இருப்பேன்.",
  },
  b_open_site: { en: "Open car catalogue", tl: "Car catalogue paarunga", ta: "Car catalogue பாருங்க" },

  q_family: {
    en: "1/5 · How many people usually travel in the car (including you)?",
    tl: "1/5 · Car-la usually evlo per travel pannuveenga (neenga serthu)?",
    ta: "1/5 · Car-ல பொதுவா எத்தனை பேர் போவீங்க (நீங்களும் சேர்த்து)?",
  },
  q_budget: {
    en: "2/5 · What's your budget? (on-road, all-inclusive)",
    tl: "2/5 · Unga budget evlo? (on-road, ellam serthu)",
    ta: "2/5 · உங்க budget எவ்வளவு? (on-road, எல்லாம் சேர்த்து)",
  },
  q_usage: {
    en: "3/5 · Where will you drive mostly?",
    tl: "3/5 · Mostly enga drive pannuveenga?",
    ta: "3/5 · பெரும்பாலும் எங்க ஓட்டுவீங்க?",
  },
  q_fuel: {
    en: "4/5 · Any fuel preference?",
    tl: "4/5 · Fuel preference edhavadhu irukka?",
    ta: "4/5 · Fuel preference ஏதாவது இருக்கா?",
  },
  q_trans: {
    en: "5/5 · Gear: manual or automatic?",
    tl: "5/5 · Gear: manual-a automatic-a?",
    ta: "5/5 · Gear: manual-ஆ automatic-ஆ?",
  },
  o_people: (p) => ({ en: `${p.v} people`, tl: `${p.v} per`, ta: `${p.v} பேர்` }),
  o_city: { en: "Mostly city", tl: "Mostly city", ta: "பெரும்பாலும் city" },
  o_hwy: { en: "Highway / long trips", tl: "Highway / long trip", ta: "Highway / நீண்ட பயணம்" },
  o_both: { en: "Both equally", tl: "Rendum", ta: "ரெண்டும்" },
  o_taxi: { en: "Taxi / business use", tl: "Taxi / business", ta: "Taxi / business" },
  o_nofuel: { en: "No preference", tl: "Edhuvaa irundhaalum ok", ta: "எதுவா இருந்தாலும் சரி" },
  o_manual: { en: "Manual", tl: "Manual", ta: "Manual" },
  o_auto: { en: "Automatic", tl: "Automatic", ta: "Automatic" },
  o_either: { en: "Either is fine", tl: "Rendum ok", ta: "ரெண்டும் சரி" },

  searching: (p) => ({
    en: `Checking ${p.n} variants from the latest price list (w.e.f. ${p.d})…`,
    tl: `Latest price list-la (w.e.f. ${p.d}) ${p.n} variants check panren…`,
    ta: `Latest price list-ல (w.e.f. ${p.d}) ${p.n} variants check பண்றேன்…`,
  }),
  reco_intro: (p) => ({
    en: `Based on your answers (${p.summary}), these are my top picks 👇`,
    tl: `Neenga sonnadhu vechu (${p.summary}), idhu dhaan en top picks 👇`,
    ta: `நீங்க சொன்னதை வச்சு (${p.summary}), இதுதான் என் top picks 👇`,
  }),
  reco_relaxed: {
    en: "I couldn't find an exact match for every preference, so I relaxed one filter. These are the closest options 👇",
    tl: "Ellam match aagura car illa, so oru filter-a konjam relax pannen. Idhu closest options 👇",
    ta: "எல்லாத்துக்கும் match ஆகுற car இல்ல. அதனால ஒரு filter-ஐ கொஞ்சம் relax பண்ணேன். இதுதான் closest options 👇",
  },
  reco_follow: {
    en: "Tap *Price breakup* on any car to see the full on-road cost. Want me to compare all three?",
    tl: "Edhavadhu car-la *Price breakup* tap pannunga, full on-road cost varum. Moonaiyum compare pannatuma?",
    ta: "ஏதாவது car-ல *Price breakup* tap பண்ணுங்க, முழு on-road cost வரும். மூணையும் compare பண்ணட்டுமா?",
  },
  rank: (p) => ({ en: ["Best match", "Also great", "Worth a look"][p.i], tl: ["Best match", "Idhuvum super", "Idhaiyum paarunga"][p.i], ta: ["Best match", "இதுவும் சூப்பர்", "இதையும் பாருங்க"][p.i] }),
  r_seats: (p) => ({ en: `${p.s} seats, fits your family of ${p.f}`, tl: `${p.s} seats, unga ${p.f} per family-ku correct`, ta: `${p.s} seats, உங்க ${p.f} பேர் family-க்கு சரியா இருக்கும்` }),
  r_budget_in: { en: "Within your budget", tl: "Unga budget-kulla", ta: "உங்க budget-க்குள்ள" },
  r_budget_over: (p) => ({ en: `Just ${p.x} above budget`, tl: `Budget-a vida ${p.x} dhaan adhigam`, ta: `Budget-ஐ விட ${p.x} தான் அதிகம்` }),
  r_hybrid_city: { en: "Hybrid: excellent city mileage, low running cost", tl: "Hybrid: city-la super mileage, running cost kammi", ta: "Hybrid: city-ல சூப்பர் mileage, running cost கம்மி" },
  r_hybrid: { en: "Strong hybrid: saves fuel on every trip", tl: "Strong hybrid: ovvoru trip-layum fuel save", ta: "Strong hybrid: ஒவ்வொரு trip-லயும் fuel மிச்சம்" },
  r_diesel_hwy: { en: "Diesel torque: relaxed highway cruising", tl: "Diesel torque: highway-la relaxed-a pogum", ta: "Diesel torque: highway-ல relaxed-ஆ போகும்" },
  r_cng: { en: "CNG: lowest cost per km", tl: "CNG: per km cost romba kammi", ta: "CNG: ஒரு km-க்கு cost ரொம்ப கம்மி" },
  r_ev: { en: "Electric: near-zero fuel cost, home charging", tl: "Electric: fuel cost almost zero, veetla charge pannalaam", ta: "Electric: fuel cost கிட்டத்தட்ட zero, வீட்லயே charge பண்ணலாம்" },
  r_auto_city: { en: "Automatic: easy in city traffic", tl: "Automatic: city traffic-la easy", ta: "Automatic: city traffic-ல easy" },
  r_taxi: { en: "Taxi-permit variant with commercial pricing", tl: "Taxi permit variant, commercial price", ta: "Taxi permit variant, commercial price" },
  r_brand: { en: "Toyota reliability + 5-yr warranty option", tl: "Toyota reliability + 5 yr warranty option", ta: "Toyota நம்பகத்தன்மை + 5 வருட warranty option" },

  b_breakup: { en: "Price breakup", tl: "Price breakup", ta: "Price breakup" },
  b_view: { en: "View photos & full details", tl: "Photos & full details paarunga", ta: "Photos & full details பாருங்க" },
  b_compare: { en: "Compare top picks", tl: "Top picks compare pannu", ta: "Top picks compare பண்ணு" },
  b_td: { en: "Book a test drive", tl: "Test drive book pannu", ta: "Test drive book பண்ணு" },
  b_human: { en: "Talk to a person", tl: "Aal kitta pesanum", ta: "ஒருத்தர்கிட்ட பேசணும்" },
  b_emi: { en: "Show EMI", tl: "EMI evlo?", ta: "EMI எவ்வளவு?" },
  b_restart: { en: "Start over", tl: "Thirumba start pannu", ta: "மறுபடி ஆரம்பி" },

  breakup_head: (p) => ({
    en: `*${p.name}*, on-road price in Chennai:`,
    tl: `*${p.name}*, Chennai on-road price:`,
    ta: `*${p.name}*, Chennai on-road price:`,
  }),
  ins33_line: (p) => ({
    en: `With 3+3 yr insurance instead: *${p.v}*`,
    tl: `3+3 yr insurance eduthaa: *${p.v}*`,
    ta: `3+3 வருட insurance எடுத்தா: *${p.v}*`,
  }),
  disclaimer: (p) => ({
    en: `Price list w.e.f. ${p.d}. Price prevailing at delivery applies. Always pay only at the showroom.`,
    tl: `Price list w.e.f. ${p.d}. Delivery time-la irukura price dhaan apply aagum. Payment showroom-la mattum pannunga.`,
    ta: `Price list w.e.f. ${p.d}. Delivery நேரத்துல இருக்கிற price தான் apply ஆகும். Payment showroom-ல மட்டும் பண்ணுங்க.`,
  }),
  compare_head: { en: "Side by side 👇", tl: "Side by side 👇", ta: "பக்கத்து பக்கத்துல 👇" },
  compare_tip: (p) => ({
    en: `💡 My take: *${p.best}* gives you the most for your money. Open the website to see the full comparison.`,
    tl: `💡 En opinion: *${p.best}* dhaan value for money. Full comparison website-la paarunga.`,
    ta: `💡 என் கருத்து: *${p.best}* தான் value for money. முழு comparison website-ல பாருங்க.`,
  }),
  b_view_compare: { en: "Open full comparison", tl: "Full comparison paarunga", ta: "முழு comparison பாருங்க" },
  emi_msg: (p) => ({
    en: `For *${p.name}*: with ₹${p.dp} down payment, 5 years @ 9%:\nEMI ≈ *₹${p.emi}/month* (indicative, bank approval needed)`,
    tl: `*${p.name}*: ₹${p.dp} down payment, 5 years @ 9%:\nEMI ≈ *₹${p.emi}/month* (approx, bank approval venum)`,
    ta: `*${p.name}*: ₹${p.dp} down payment, 5 வருடம் @ 9%:\nEMI ≈ *₹${p.emi}/மாதம்* (தோராயமா, bank approval வேணும்)`,
  }),
  td_ask: (p) => ({
    en: `Great choice! When should we bring the *${p.name}* for a test drive?`,
    tl: `Super choice! *${p.name}* test drive eppo vechukalaam?`,
    ta: `சூப்பர் choice! *${p.name}* test drive எப்போ வச்சுக்கலாம்?`,
  }),
  slot1: { en: "Tomorrow 10 AM", tl: "Naalai 10 AM", ta: "நாளை 10 AM" },
  slot2: { en: "Tomorrow 4 PM", tl: "Naalai 4 PM", ta: "நாளை 4 PM" },
  slot3: { en: "Saturday 11 AM", tl: "Saturday 11 AM", ta: "சனிக்கிழமை 11 AM" },
  td_done: (p) => ({
    en: `✅ Test drive requested: *${p.name}*, ${p.slot}.\nThe showroom team will call you to confirm. No payment needed.`,
    tl: `✅ Test drive request aachu: *${p.name}*, ${p.slot}.\nShowroom team call panni confirm pannuvaanga. Payment edhuvum venaam.`,
    ta: `✅ Test drive request ஆயிடுச்சு: *${p.name}*, ${p.slot}.\nShowroom team call பண்ணி confirm பண்ணுவாங்க. Payment எதுவும் வேண்டாம்.`,
  }),
  human_msg: {
    en: "Sure! I've shared this chat with a car expert. They'll reply right here within ~10 minutes (9 AM–8 PM).",
    tl: "Sure! Indha chat-a car expert kitta share pannitten. ~10 mins-la inga reply pannuvaanga (9 AM–8 PM).",
    ta: "சரி! இந்த chat-ஐ car expert-கிட்ட share பண்ணிட்டேன். ~10 நிமிஷத்துல இங்கயே reply பண்ணுவாங்க (9 AM–8 PM).",
  },
  fallback: {
    en: "(Prototype) The real AI will understand any question here. For this demo, please use the buttons 🙂",
    tl: "(Prototype) Real AI edha kettaalum purinjukkum. Indha demo-ku buttons use pannunga 🙂",
    ta: "(Prototype) Real AI எந்த கேள்விக்கும் பதில் சொல்லும். இந்த demo-க்கு buttons use பண்ணுங்க 🙂",
  },
  handoff_sys: (p) => ({
    en: `🔗 Continued from WhatsApp · ${p.phone}`,
    tl: `🔗 WhatsApp chat continue aagudhu · ${p.phone}`,
    ta: `🔗 WhatsApp chat தொடருது · ${p.phone}`,
  }),
  welcome_back: (p) => ({
    en: `Welcome! 👋 You're now viewing the *${p.name}*.\nOn-road: *${p.price}* (1+3 insurance). Scroll for photos, specs and the full breakup. Want EMI, a comparison or a test drive?`,
    tl: `Vaanga! 👋 Ippo *${p.name}* paakureenga.\nOn-road: *${p.price}* (1+3 insurance). Keezha photos, specs, full breakup irukku. EMI, compare, test drive edhu venum?`,
    ta: `வாங்க! 👋 இப்போ *${p.name}* பாக்குறீங்க.\nOn-road: *${p.price}* (1+3 insurance). கீழ photos, specs, full breakup இருக்கு. EMI, compare, test drive எது வேணும்?`,
  }),
  page_context: (p) => ({
    en: `I see you're looking at the *${p.name}*. Want the on-road price breakup or should I find the right variant for you?`,
    tl: `*${p.name}* paakureenga pola. On-road breakup venuma, illa ungalukku sariyana variant naan find pannatuma?`,
    ta: `*${p.name}* பாக்குறீங்க போல. On-road breakup வேணுமா, இல்ல உங்களுக்கு சரியான variant-ஐ நான் கண்டுபிடிக்கட்டுமா?`,
  }),
  b_find_variant: { en: "Find my variant", tl: "En variant find pannu", ta: "என் variant கண்டுபிடி" },

  // ---- website UI ----
  hero_h: { en: "Your honest car advisor, <em>right on WhatsApp</em>", tl: "Unga honest car advisor, <em>WhatsApp-laye</em>", ta: "உங்க நேர்மையான car advisor, <em>WhatsApp-லயே</em>" },
  hero_p: {
    en: "Tell MotoAI about your family and budget. Get the right car and the exact on-road price from real dealer price lists, with no sales pressure.",
    tl: "Unga family, budget pathi MotoAI kitta sollunga. Real dealer price list-la irundhu sariyana car-um exact on-road price-um kidaikum. Sales pressure illa.",
    ta: "உங்க family, budget பத்தி MotoAI-கிட்ட சொல்லுங்க. Real dealer price list-ல இருந்து சரியான car-ம் exact on-road price-ம் கிடைக்கும். Sales pressure இல்ல.",
  },
  hero_cta: { en: "Find my car", tl: "En car find pannu", ta: "என் car கண்டுபிடி" },
  hero_wa: { en: "Chat on WhatsApp", tl: "WhatsApp-la chat", ta: "WhatsApp-ல chat" },
};
