// ============================================================
// KOVA — Demo seed catalog (DEVELOPMENT DATA ONLY)
// Product imagery comes from the first-party CC0 photo pool
// (scripts/fetch-photo-pool.ts → kova/public/images/seed/photo/).
//
// Everything here is fictional. Business names, people and
// products were invented for development/testing and do not
// describe real companies or persons.
// ============================================================

// ── Categories ────────────────────────────────────────────

export const CATEGORIES = [
  { name: 'Health & Wellness',       slug: 'health-wellness',  icon: 'health',    sortOrder: 1 },
  { name: 'Beauty & Perfumes',       slug: 'beauty-perfumes',  icon: 'beauty',    sortOrder: 2 },
  { name: 'Interior & Home',         slug: 'interior-home',    icon: 'interior',  sortOrder: 3 },
  { name: 'Furniture',               slug: 'furniture',        icon: 'furniture', sortOrder: 4 },
  { name: 'Electronics & Gadgets',   slug: 'electronics',      icon: 'electronics', sortOrder: 5 },
  { name: 'Fashion',                 slug: 'fashion',          icon: 'fashion',   sortOrder: 6 },
  { name: 'Digital Education',       slug: 'digital-education', icon: 'education', sortOrder: 7 },
  { name: 'Digital Products',        slug: 'digital-products', icon: 'digital',   sortOrder: 8 },
] as const;

// ── Sellers (fictional businesses) ────────────────────────

export interface SeedSeller {
  clerkId: string;
  email: string;
  name: string; // owner display name
  avatarUrl: string;
  storeName: string;
  storeSlug: string;
  description: string;
  location: string; // Nigerian city — public-level, no street address
  bannerUrl: string;
  logoUrl: string;
  isVerified: boolean;
  categories: string[]; // category slugs this store sells in
}

export const SELLERS: SeedSeller[] = [
  {
    clerkId: 'demo_seller_amara',
    email: 'amara@kova.demo',
    name: 'Amara Eze',
    avatarUrl: '/images/amara-avatar.jpg',
    storeName: 'Amara Luxe Atelier',
    storeSlug: 'amara-luxe-atelier',
    description:
      'Lagos-based fashion and fragrance house. We cut, sew and blend in small batches — ankara pieces stitched by our tailors in Yaba, and perfumes blended and bottled in our Ikeja studio. Every listing is photographed by us, of our actual stock.',
    location: 'Lagos',
    bannerUrl: '/images/seed/photo/fashion/fashion-p12.jpg',
    logoUrl: '/images/seed/photo/fashion/fashion-p04.jpg',
    isVerified: true,
    categories: ['fashion', 'beauty-perfumes'],
  },
  {
    clerkId: 'demo_seller_tunde',
    email: 'tunde@kova.demo',
    name: 'Tunde Alabi',
    avatarUrl: '/images/tunde-avatar.jpg',
    storeName: 'Alabi TechHub',
    storeSlug: 'alabi-techhub',
    description:
      'Gadgets and accessories tested before they ship. We source from authorised distributors, check every unit in our Ibadan workshop, and back everything with a 7-day check-and-return window.',
    location: 'Ibadan',
    bannerUrl: '/images/seed/photo/electronics/electronics-p12.jpg',
    logoUrl: '/images/seed/photo/electronics/electronics-p04.jpg',
    isVerified: true,
    categories: ['electronics'],
  },
  {
    clerkId: 'demo_seller_zuri',
    email: 'zuri@kova.demo',
    name: 'Zainab Yusuf',
    avatarUrl: '/images/sophie-avatar.jpg',
    storeName: 'Zuri Home Living',
    storeSlug: 'zuri-home-living',
    description:
      'Furniture and home pieces made to order in Abuja. Working with local carpenters and weavers, we build in small runs — expect honest lead times and solid joinery, not flat-pack shortcuts.',
    location: 'Abuja',
    bannerUrl: '/images/seed/photo/interior-home/interior-home-p12.jpg',
    logoUrl: '/images/seed/photo/interior-home/interior-home-p04.jpg',
    isVerified: false,
    categories: ['interior-home', 'furniture'],
  },
  {
    clerkId: 'demo_seller_brightpath',
    email: 'brightpath@kova.demo',
    name: 'Chinedu Obi',
    avatarUrl: '/images/avatar-2.jpg',
    storeName: 'Brightpath Digital Academy',
    storeSlug: 'brightpath-digital-academy',
    description:
      'Practical courses and templates for Nigerians building digital careers. Lessons are self-paced video + downloadable workbooks, taught by practitioners who do the work daily.',
    location: 'Enugu',
    bannerUrl: '/images/seed/photo/digital-education/digital-education-p12.jpg',
    logoUrl: '/images/seed/photo/digital-education/digital-education-p04.jpg',
    isVerified: true,
    categories: ['digital-education', 'digital-products'],
  },
  {
    clerkId: 'demo_seller_wellspring',
    email: 'wellspring@kova.demo',
    name: 'Halima Sule',
    avatarUrl: '/images/avatar-3.jpg',
    storeName: 'Wellspring Wellness Co.',
    storeSlug: 'wellspring-wellness-co',
    description:
      'Home fitness gear and no-nonsense wellness guides from Port Harcourt. We sell equipment you can actually ship across Nigeria, and education resources written by certified trainers — never medical advice.',
    location: 'Port Harcourt',
    bannerUrl: '/images/seed/photo/health/health-p12.jpg',
    logoUrl: '/images/seed/photo/health/health-p04.jpg',
    isVerified: false,
    categories: ['health-wellness', 'digital-products'],
  },
];

// ── Demo buyers (fictional identities) ────────────────────

export const BUYERS: { clerkId: string; email: string; name: string; city: string; state: string }[] = [
  { clerkId: 'demo_buyer_01', email: 'chidera@kova.demo', name: 'Chidera Okafor',   city: 'Lagos',         state: 'Lagos' },
  { clerkId: 'demo_buyer_02', email: 'emeka@kova.demo',   name: 'Emeka Nwosu',     city: 'Lagos',         state: 'Lagos' },
  { clerkId: 'demo_buyer_03', email: 'fatima@kova.demo',  name: 'Fatima Bello',    city: 'Abuja',         state: 'FCT' },
  { clerkId: 'demo_buyer_04', email: 'ifeoma@kova.demo',  name: 'Ifeoma Adebayo',  city: 'Ibadan',        state: 'Oyo' },
  { clerkId: 'demo_buyer_05', email: 'kemi@kova.demo',    name: 'Kemi Ogundipe',   city: 'Abeokuta',      state: 'Ogun' },
  { clerkId: 'demo_buyer_06', email: 'musa@kova.demo',    name: 'Musa Danjuma',    city: 'Kaduna',        state: 'Kaduna' },
  { clerkId: 'demo_buyer_07', email: 'ngozi@kova.demo',   name: 'Ngozi Eze',       city: 'Enugu',         state: 'Enugu' },
  { clerkId: 'demo_buyer_08', email: 'olamide@kova.demo', name: 'Olamide Adewale', city: 'Lagos',         state: 'Lagos' },
  { clerkId: 'demo_buyer_09', email: 'preye@kova.demo',   name: 'Preye Timothy',   city: 'Port Harcourt', state: 'Rivers' },
  { clerkId: 'demo_buyer_10', email: 'sadiq@kova.demo',   name: 'Sadiq Ibrahim',   city: 'Kano',          state: 'Kano' },
  { clerkId: 'demo_buyer_11', email: 'tofunmi@kova.demo', name: 'Tofunmi Alade',   city: 'Lagos',         state: 'Lagos' },
  { clerkId: 'demo_buyer_12', email: 'uchi@kova.demo',    name: 'Uche Mbadiwe',    city: 'Lagos',         state: 'Lagos' },
  { clerkId: 'demo_buyer_13', email: 'yemi@kova.demo',    name: 'Yemi Olatunji',   city: 'Ilorin',        state: 'Kwara' },
  { clerkId: 'demo_buyer_14', email: 'zainab@kova.demo',  name: 'Zainab Lawal',    city: 'Benin City',    state: 'Edo' },
  { clerkId: 'demo_buyer_15', email: 'ada@kova.demo',     name: 'Ada Umeh',        city: 'Onitsha',       state: 'Anambra' },
  { clerkId: 'demo_buyer_16', email: 'bola@kova.demo',    name: 'Bola Aremu',      city: 'Lagos',         state: 'Lagos' },
  { clerkId: 'demo_buyer_17', email: 'deji@kova.demo',    name: 'Deji Fagbemi',    city: 'Lagos',         state: 'Lagos' },
  { clerkId: 'demo_buyer_18', email: 'halima@kova.demo',  name: 'Halima Garba',    city: 'Jos',           state: 'Plateau' },
];

// ── Admin (for testing the admin dashboard locally) ───────

export const DEMO_ADMIN = {
  clerkId: 'demo_admin_01',
  email: 'admin@kova.demo',
  name: 'Kova Admin (Demo)',
};

// ── Product catalog ───────────────────────────────────────
// Each item becomes 1..n products (one per colourway/size variant).
// Descriptions are composed in seed.ts from these structured fields —
// every field is real content for that product, never filler.

export interface SeedItem {
  name: string;
  category: string; // category slug
  type: 'PHYSICAL' | 'DIGITAL';
  price: number; // ₦ (whole naira)
  originalPrice?: number; // ₦, when discounted
  seller: string; // seller storeSlug
  // Physical
  material?: string;
  dimensions?: string;
  colours?: string[]; // each becomes its own product variant
  sizes?: string[]; // combined with colours when both exist
  features?: string[];
  includes?: string[];
  care?: string;
  leadTime?: string; // made-to-order note (furniture)
  // Digital
  format?: string; // e.g. "Video (MP4) + workbook (PDF)"
  contents?: string[];
  audience?: string;
  requirements?: string[];
  outcome?: string;
  // Variants beyond colour/size (explicit)
  namedVariants?: string[];
}

export const ITEMS: SeedItem[] = [
  // ═══ ELECTRONICS & GADGETS — Alabi TechHub ═══════════════
  {
    name: 'Wireless Noise-Cancelling Headphones', category: 'electronics', type: 'PHYSICAL',
    price: 68000, originalPrice: 85000, seller: 'alabi-techhub',
    material: 'ABS frame, protein-leather earcups',
    dimensions: '18 × 16 × 8 cm (folded), 245 g',
    colours: ['Onyx Black', 'Sand Beige', 'Midnight Navy'],
    features: [
      'Hybrid active noise cancellation with a transparency mode for conversations',
      '40 mm drivers tuned for a balanced signature rather than exaggerated bass',
      'Up to 30 hours playback with ANC off, 22 hours with ANC on (USB-C charging)',
      'Multipoint Bluetooth 5.3 — stay connected to your phone and laptop at once',
    ],
    includes: ['Carry pouch', 'USB-C cable', '3.5 mm audio cable'],
  },
  {
    name: 'ENC Wireless Earbuds', category: 'electronics', type: 'PHYSICAL',
    price: 14500, seller: 'alabi-techhub',
    material: 'Polycarbonate shell, silicone tips (S/M/L)',
    dimensions: 'Case: 6 × 5 × 2.5 cm; buds 4 g each',
    colours: ['White', 'Black'],
    features: [
      'Environmental noise cancellation on calls so your voice stays clear in traffic',
      '13 mm drivers with a warm, vocal-forward tuning',
      '6 hours per charge, 24 hours total with the case (USB-C)',
      'IPX4 splash resistance for workouts and light rain',
    ],
    includes: ['Charging case', '3 sizes of silicone tips', 'USB-C cable'],
  },
  {
    name: '87-Key Mechanical Keyboard', category: 'electronics', type: 'PHYSICAL',
    price: 32000, seller: 'alabi-techhub',
    material: 'Aluminium top plate, PBT keycaps',
    dimensions: '36 × 14 × 3.5 cm, 850 g',
    colours: ['Grey/White', 'Black/Gold'],
    namedVariants: ['— Brown Switches', '— Red Switches'],
    features: [
      'Hot-swappable switches — change the feel without soldering',
      'Wired and 2.4 GHz + Bluetooth wireless modes',
      'PBT double-shot keycaps that resist the shine ABS develops',
      'White backlight with 8 brightness levels',
    ],
    includes: ['Keycap puller', 'USB-C cable', 'Spare switches (4)'],
  },
  {
    name: 'Silent-Click Wireless Mouse', category: 'electronics', type: 'PHYSICAL',
    price: 8500, seller: 'alabi-techhub',
    material: 'Matte ABS, PTFE feet',
    dimensions: '11 × 6.5 × 3.8 cm',
    colours: ['Graphite', 'Ivory'],
    features: [
      'Whisper-quiet switches rated for 3 million clicks — library- and office-safe',
      '1600 DPI optical sensor with a single-button DPI cycle',
      'One AA battery runs up to 8 months (standby included)',
      '2.4 GHz dongle stores inside the shell',
    ],
  },
  {
    name: '20000mAh Power Bank (22.5W PD)', category: 'electronics', type: 'PHYSICAL',
    price: 19500, seller: 'alabi-techhub',
    material: 'Aluminium shell, LED charge display',
    dimensions: '14.5 × 7 × 2.6 cm, 420 g',
    features: [
      'Charges a 4500 mAh phone about 3.5 times',
      '22.5 W Power Delivery out, 18 W recharge in — full in about 5 hours',
      'Three ports: USB-C in/out, USB-A × 2',
      'Digital percentage display instead of vague four-dot LEDs',
    ],
    includes: ['USB-C cable'],
  },
  {
    name: '65W GaN Fast Charger', category: 'electronics', type: 'PHYSICAL',
    price: 12500, seller: 'alabi-techhub',
    material: 'GaN (gallium nitride) internals, foldable pins',
    dimensions: '5 × 5 × 3 cm, 120 g',
    features: [
      'Two USB-C + one USB-A; runs a laptop and two phones together',
      'GaN runs cooler and smaller than standard silicon chargers',
      'Negotiates safe speeds with phones, tablets, laptops and the Switch',
      'Built-in over-current and over-temperature protection',
    ],
  },
  {
    name: '20W Bluetooth Speaker', category: 'electronics', type: 'PHYSICAL',
    price: 24000, originalPrice: 30000, seller: 'alabi-techhub',
    material: 'Fabric-wrapped body, rubberized base',
    dimensions: '19 × 7 × 7 cm, 560 g',
    colours: ['Charcoal', 'Rust Orange'],
    features: [
      'Dual 10 W drivers with a passive bass radiator on the back',
      'IPX5 — rain and splash safe for balconies and bathrooms',
      '12 hours at moderate volume; USB-C charging',
      'Pair two units for left/right stereo',
    ],
    includes: ['Woven carry strap', 'USB-C cable'],
  },
  {
    name: 'Fitness Smart Watch', category: 'electronics', type: 'PHYSICAL',
    price: 42000, seller: 'alabi-techhub',
    material: 'Alloy case, silicone strap',
    dimensions: 'Case 44 mm; fits 14–21 cm wrists',
    colours: ['Black', 'Rose Gold'],
    features: [
      '1.85″ AMOLED display with 100+ watch faces',
      'Calls, notifications and music control once paired over Bluetooth',
      'Workout modes for running, cycling, rows and more; heart-rate and SpO₂ readings are wellness indicators, not medical measurements',
      '7-day typical battery; magnetic pogo charger included',
    ],
    includes: ['Extra mesh strap', 'Magnetic charging cable'],
  },
  {
    name: 'Smartphone Gimbal Stabilizer', category: 'electronics', type: 'PHYSICAL',
    price: 58000, seller: 'alabi-techhub',
    material: 'Composite frame, rubberised grip',
    dimensions: 'Folded 16 × 8 cm; payload up to 280 g',
    features: [
      '3-axis stabilization smooths walking shots without a steadicam',
      'Active tracking keeps a subject centred while you film',
      'Folds to pocket size; charges phones while filming',
      'Works with the camera apps of major Android and iOS phones',
    ],
    includes: ['Mini tripod', 'USB-C cable', 'Wrist strap'],
  },
  {
    name: 'Aluminium Laptop Stand', category: 'electronics', type: 'PHYSICAL',
    price: 16500, seller: 'alabi-techhub',
    material: 'Aircraft-grade aluminium, silicone pads',
    dimensions: 'Raises screen 12–16 cm; fits 11–17″ laptops',
    colours: ['Silver', 'Space Grey'],
    features: [
      'Two-level adjustability for desk ergonomics',
      'Open frame lets laptop fans breathe — cooler under load',
      'Silicone pads grip without scratching; holds up to 8 kg',
      'Folds flat enough for a laptop sleeve pocket',
    ],
  },
  {
    name: '7-in-1 USB-C Hub', category: 'electronics', type: 'PHYSICAL',
    price: 21000, seller: 'alabi-techhub',
    material: 'Aluminium shell, braided cable',
    dimensions: '11 × 3 × 1.5 cm (cable 18 cm)',
    features: [
      '4K@60 Hz HDMI, 100 W USB-C passthrough charging, 2× USB 3.0',
      'SD + microSD card readers for photographers',
      'Gigabit Ethernet port for stable video calls',
      'Plug and play on Windows, macOS and most Android devices',
    ],
  },
  {
    name: '18″ Ring Light with Tripod', category: 'electronics', type: 'PHYSICAL',
    price: 38000, seller: 'alabi-techhub',
    material: 'Steel tripod, aluminium light frame',
    dimensions: 'Light 45 cm; tripod 60–200 cm',
    features: [
      '3 colour temperatures × 10 brightness levels for product and portrait shoots',
      'Reaches full standing height — waist-up framing without a stool',
      'Phone holder included; remote shutter works on Android and iOS',
      'Bluetooth remote with 10 m range',
    ],
    includes: ['Phone holder', 'Bluetooth remote', 'Carry bag'],
  },
  {
    name: '1080p Streaming Webcam', category: 'electronics', type: 'PHYSICAL',
    price: 17500, seller: 'alabi-techhub',
    material: 'Glass lens, ABS body',
    dimensions: '8 × 5 × 5 cm; cable 1.5 m',
    features: [
      '1080p/30 fps with auto light correction for dim rooms',
      'Dual noise-reducing mics',
      'Privacy shutter slides over the lens when not streaming',
      'Clips to monitors or stands on a tripod thread',
    ],
  },
  {
    name: '7.1 Gaming Headset', category: 'electronics', type: 'PHYSICAL',
    price: 22500, seller: 'alabi-techhub',
    material: 'Steel headband, breathable mesh earcups',
    dimensions: 'Weight 310 g; cable 2.2 m',
    colours: ['Black/Red', 'Black/Blue'],
    features: [
      'Virtual 7.1 surround over USB for positional audio in games',
      'Boom mic that mutes by flipping it up',
      'Memory-foam earcups that stay comfortable through long sessions',
      'Inline volume wheel',
    ],
  },
  {
    name: 'Bluetooth FM Transmitter', category: 'electronics', type: 'PHYSICAL',
    price: 7500, seller: 'alabi-techhub',
    material: 'ABS with brass contacts',
    dimensions: '8 × 4 cm; fits standard 12 V sockets',
    features: [
      'Streams phone audio to cars without aux or Bluetooth',
      'Dual USB ports (2.4 A + 1 A) charge while you drive',
      'Answers calls hands-free through the car speakers',
      'Reads battery voltage so a weak alternator does not surprise you',
    ],
  },
  {
    name: 'WiFi Smart Bulb (RGB)', category: 'electronics', type: 'PHYSICAL',
    price: 6500, seller: 'alabi-techhub',
    material: 'Aluminium + PC, E27 base',
    dimensions: 'Standard E27 bulb, 9 W',
    colours: ['Single Pack', 'Two-Pack (–15%)'],
    features: [
      '16 million colours plus warm-to-cool white on a schedule',
      'Works over home WiFi — no hub needed; Android and iOS app',
      'Schedules and away modes make the house look lived-in',
      '9 W output ≈ 60 W incandescent brightness',
    ],
  },
  {
    name: '300W Solar Generator Kit', category: 'electronics', type: 'PHYSICAL',
    price: 295000, originalPrice: 340000, seller: 'alabi-techhub',
    material: 'LiFePO₄ battery, monocrystalline panel',
    dimensions: 'Unit 24 × 16 × 18 cm; panel 100 W foldable',
    features: [
      'Runs lights, fans, TVs, laptops and chargers through a blackout',
      '296 Wh LiFePO₄ battery rated for 2000+ cycles',
      'AC, DC, USB-C and car-socket outputs; solar panel included',
      'Silent alternative to petrol generators for indoor use',
    ],
    includes: ['100 W foldable solar panel', 'AC + car chargers', 'DC cables'],
  },

  // ═══ FASHION — Amara Luxe Atelier ═════════════════════════
  {
    name: 'Ankara Print Maxi Dress', category: 'fashion', type: 'PHYSICAL',
    price: 27500, originalPrice: 35000, seller: 'amara-luxe-atelier',
    material: '100% cotton ankara wax print',
    dimensions: 'Length 140 cm (size-referenced)',
    colours: ['Indigo Medallion', 'Terracotta Bloom', 'Emerald Fan'],
    sizes: ['S', 'M', 'L', 'XL'],
    features: [
      'Fully lined bodice with an invisible back zip',
      'Side pockets deep enough for a phone — yes, really',
      'Adjustable waist tie for a fitted or relaxed drape',
      'Hand-cut prints, so pattern placement varies slightly per piece',
    ],
    care: 'First wash cold and separate; thereafter machine wash gentle, iron inside out.',
  },
  {
    name: 'Handwoven Leather Tote', category: 'fashion', type: 'PHYSICAL',
    price: 95000, seller: 'amara-luxe-atelier',
    material: 'Full-grain leather, hand-woven front panel',
    dimensions: '38 × 30 × 12 cm; drop 25 cm',
    colours: ['Tan', 'Cognac', 'Black'],
    features: [
      'Vegetable-tanned leather that darkens beautifully with use',
      'Unlined interior with a zip pocket and two slip pockets',
      'Reinforced handles stitched, not just glued',
      'Fits a 14″ laptop, a lunch and a gym top',
    ],
    care: 'Wipe with a dry cloth; condition with leather balm every few months.',
  },
  {
    name: "Men's Embroidered Kaftan", category: 'fashion', type: 'PHYSICAL',
    price: 32000, seller: 'amara-luxe-atelier',
    material: 'Champagne-crepe polyester blend',
    dimensions: 'Length 145 cm (size-referenced)',
    colours: ['Ivory', 'Navy', 'Dusty Rose'],
    sizes: ['M', 'L', 'XL', 'XXL'],
    features: [
      'Hand-guided chest embroidery finished in matching thread',
      'Breathable weave that holds its drape in heat',
      'Side slits for an easy stride; mandarin collar',
    ],
    care: 'Hand wash or dry clean; steam rather than press the embroidery.',
  },
  {
    name: 'Adire Camp Shirt', category: 'fashion', type: 'PHYSICAL',
    price: 18000, seller: 'amara-luxe-atelier',
    material: 'Hand-dyed adire cotton',
    dimensions: 'Regular fit; length 74 cm (M)',
    colours: ['Indigo Spiral', 'Charcoal Tie-Dye'],
    sizes: ['S', 'M', 'L', 'XL'],
    features: [
      'Indigo-dyed in our Abeokuta partner workshop — every shirt’s pattern is unique',
      'Boxy camp collar with a straight hem for wearing tucked or loose',
      'Pre-shrunk so your size stays your size',
    ],
    care: 'Cold wash separately for the first two washes; indigo releases a little dye at first.',
  },
  {
    name: 'Waxed Canvas Weekender Bag', category: 'fashion', type: 'PHYSICAL',
    price: 58000, seller: 'amara-luxe-atelier',
    material: '18 oz waxed canvas, leather trim, brass YKK zips',
    dimensions: '52 × 28 × 24 cm; 38 L',
    colours: ['Field Green', 'Espresso'],
    features: [
      'Carry-on sized for Arik and Air Peace overhead bins',
      'Waxed canvas shrugs off drizzle and improves with scuffs',
      'Detachable shoulder strap; leather-wrapped grab handles',
      'Interior: one zip pocket, two slip pockets, key leash',
    ],
    care: 'Brush off dirt; re-wax annually with any standard wax bar.',
  },
  {
    name: 'Beaded Statement Necklace', category: 'fashion', type: 'PHYSICAL',
    price: 12500, seller: 'amara-luxe-atelier',
    material: 'Glass and brass beads on waxed cord',
    dimensions: 'Length 46 cm + 5 cm extender',
    colours: ['Coral/Gold', 'Lagoon Blue', 'Mono Black'],
    features: [
      'Strung by hand on triple-knotted cord — no stretch-line snap risk',
      'Brass findings that will not turn your neck green',
      'Arrives in a small kraft gift box',
    ],
    care: 'Keep dry; store flat to protect the drape.',
  },
  {
    name: 'Handmade Leather Sandals', category: 'fashion', type: 'PHYSICAL',
    price: 22000, seller: 'amara-luxe-atelier',
    material: 'Vegetable-tanned leather footbed and straps',
    dimensions: 'Sizes 38–46 EU',
    colours: ['Natural Tan', 'Dark Brown'],
    sizes: ['38', '40', '42', '44', '46'],
    features: [
      'Stitched, cemented and nailed sole construction from our Aba workshop',
      'Footbed moulds to your arch within a week of wear',
      'Resoleable — a sandal you keep, not bin',
    ],
    care: 'Avoid soaking; treat scuffs with leather balm.',
  },
  {
    name: 'Silk-Blend Headwrap Set (2)', category: 'fashion', type: 'PHYSICAL',
    price: 9500, seller: 'amara-luxe-atelier',
    material: 'Silk-touch polyester blend (72 × 72 cm)',
    colours: ['Ember/Champagne', 'Royal/Plum'],
    features: [
      'Two complementary prints per set — coordinate or split the pair',
      'Hand-rolled edges stop fraying',
      'Generous 72 cm square ties a full head wrap without gap',
    ],
    care: 'Hand wash cool; hang dry.',
  },
  {
    name: 'Canvas Low-Top Sneakers', category: 'fashion', type: 'PHYSICAL',
    price: 26000, seller: 'amara-luxe-atelier',
    material: '12 oz cotton canvas, vulcanised rubber sole',
    dimensions: 'Sizes 39–45 EU',
    colours: ['Ecru', 'Black', 'Olive'],
    sizes: ['39', '41', '43', '45'],
    features: [
      'Vulcanised sole that flexes instead of peeling',
      'Padded collar and a removable cushioned insole',
      'Metal-free eyelets that will not stain the canvas',
    ],
    care: 'Spot clean with mild soap; air dry away from direct sun.',
  },
  {
    name: 'Minimal Leather-Strap Watch', category: 'fashion', type: 'PHYSICAL',
    price: 46000, originalPrice: 58000, seller: 'amara-luxe-atelier',
    material: 'Stainless case (316L), Japanese quartz movement, leather strap',
    dimensions: 'Case 38 mm; lug width 20 mm',
    colours: ['Silver/White Dial', 'Gold/Black Dial'],
    features: [
      'Slim 7 mm case slides under a shirt cuff',
      'Japanese quartz movement; battery lasts ~2 years',
      '5 ATM splash resistance (not for swimming)',
      'Quick-release strap — swap in seconds without tools',
    ],
    includes: ['Extra nylon strap', 'Gift box'],
  },
  {
    name: 'Full-Grain Leather Belt', category: 'fashion', type: 'PHYSICAL',
    price: 13500, seller: 'amara-luxe-atelier',
    material: 'Full-grain leather, solid brass buckle',
    dimensions: 'Width 3.5 cm; sizes 30–42',
    sizes: ['30–32', '34–36', '38–40', '42'],
    features: [
      'One piece of leather — no bonded splits that peel in a year',
      'Brass buckle screwed, not riveted, so it can be replaced',
      'Five holes for a 10 cm adjustment range',
    ],
  },
  {
    name: 'Polarized Sunglasses', category: 'fashion', type: 'PHYSICAL',
    price: 15500, seller: 'amara-luxe-atelier',
    material: 'Acetate frame, polarized CR-39 lenses',
    dimensions: 'Lens 52 mm; fits medium faces',
    colours: ['Tortoise', 'Matte Black'],
    features: [
      'Polarized lenses cut road and water glare for real driving comfort',
      'UV400 — blocks UVA/UVB',
      'Acetate frames adjust with gentle heat if the fit needs tweaking',
    ],
    includes: ['Hard case', 'Microfibre pouch'],
  },
  {
    name: 'Crossbody Sling Bag', category: 'fashion', type: 'PHYSICAL',
    price: 21000, seller: 'amara-luxe-atelier',
    material: 'Coated canvas, webbing strap',
    dimensions: '28 × 16 × 9 cm; strap 60–130 cm',
    colours: ['Slate', 'Mustard'],
    features: [
      'Wear across the chest for crowded-market security',
      'Padded sleeve fits an 11″ tablet',
      'Hidden back zip pocket against the body for cards and cash',
    ],
  },
  {
    name: "Women's Palazzo Trousers", category: 'fashion', type: 'PHYSICAL',
    price: 16500, seller: 'amara-luxe-atelier',
    material: 'Fluid viscose twill',
    dimensions: 'Inseam 104 cm; high-rise',
    colours: ['Black', 'Cream', 'Wine'],
    sizes: ['S', 'M', 'L', 'XL'],
    features: [
      'Wide leg with a covered elastic back waist for all-day comfort',
      'Pockets on both sides, deep enough to be useful',
      'Drapes well in heat and travels without deep creasing',
    ],
    care: 'Machine wash cold, hang dry; a quick steam revives the drape.',
  },

  // ═══ BEAUTY & PERFUMES — Amara Luxe Atelier ═══════════════
  {
    name: 'Eau de Parfum — Ivory Oud', category: 'beauty-perfumes', type: 'PHYSICAL',
    price: 72000, seller: 'amara-luxe-atelier',
    material: 'Eau de parfum concentration (20% oils)',
    dimensions: '100 ml glass flacon',
    namedVariants: ['— 100 ml', '— 30 ml Travel (₦32,000)'],
    features: [
      'Opening of bergamot and pink pepper over an oud-amber heart',
      'Base of sandalwood and musk that sits close to the skin for hours',
      'Blended and bottled in our Ikeja studio in small numbered batches',
      'For external use only — patch-test on skin before regular wear',
    ],
    includes: ['Gift box', 'Sample vial of our companion scent'],
  },
  {
    name: 'Fragrance Oil Discovery Set', category: 'beauty-perfumes', type: 'PHYSICAL',
    price: 14000, seller: 'amara-luxe-atelier',
    material: 'Body-safe fragrance oils (alcohol-free)',
    dimensions: '6 × 10 ml roll-on vials',
    features: [
      'Six best-sellers: Oud Royale, Vanilla Tuwo, Gardenia Rain, Leather & Honey, White Musk, Citrus Peel',
      'Alcohol-free oils sit closer to the skin and often last longer in harmattan',
      'Roll-on format for handbag top-ups',
    ],
  },
  {
    name: 'Whipped Shea Body Butter', category: 'beauty-perfumes', type: 'PHYSICAL',
    price: 7500, seller: 'amara-luxe-atelier',
    material: 'Unrefined shea butter, coconut oil, vitamin E',
    dimensions: '250 g jar',
    namedVariants: ['— Unscented', '— Vanilla & Shea', '— Lavender'],
    features: [
      'Whipped texture that sinks in without the heavy shea grease',
      'No mineral oil, no parabens, no bleaching agents — just hydration',
      'Especially good on elbows, knuckles and shins in harmattan',
    ],
    care: 'Store below 30 °C; melts in heat but re-sets fine.',
  },
  {
    name: 'Traditional African Black Soap', category: 'beauty-perfumes', type: 'PHYSICAL',
    price: 3500, seller: 'amara-luxe-atelier',
    material: 'Palm ash, shea butter, honey, palm kernel oil',
    dimensions: '200 g bar (hand-cut)',
    namedVariants: ['— Original', '— With Honey', '— With Camwood'],
    features: [
      'Made by our partner cooperative using the traditional osun-dudu process',
      'Cleans thoroughly without stripping — suits most skin types',
      'Hand-cut bars vary slightly in shape and weight',
    ],
    care: 'Keep on a draining dish; black soap softens when left in water.',
  },
  {
    name: 'Rosewater Facial Mist', category: 'beauty-perfumes', type: 'PHYSICAL',
    price: 5500, seller: 'amara-luxe-atelier',
    material: 'Rose distillate, glycerin, panthenol',
    dimensions: '150 ml spray bottle',
    features: [
      'Real rose distillate, not synthetic rose fragrance in water',
      'Refreshing mid-day reset over makeup — fine, even mist',
      'Alcohol-free, so it does not sting or dry skin',
    ],
  },
  {
    name: 'Makeup Brush Set (12 pc)', category: 'beauty-perfumes', type: 'PHYSICAL',
    price: 15500, seller: 'amara-luxe-atelier',
    material: 'Synthetic fibres, aluminium ferrules, wooden handles',
    dimensions: 'Face: 4 brushes; eye: 8 brushes',
    features: [
      'Vegan synthetic fibres that work with powder and cream products',
      'Dense, no-shed bristles after washing (we test every batch)',
      'Ferrules double-crimped so heads do not wobble loose',
    ],
    includes: ['Roll-up canvas pouch', 'Brush-guard netting'],
    care: 'Wash with mild soap every 1–2 weeks; dry flat or bristles-down.',
  },
  {
    name: 'Satin-Lined Sleep Bonnet', category: 'beauty-perfumes', type: 'PHYSICAL',
    price: 6500, seller: 'amara-luxe-atelier',
    material: 'Satin-lined polyester shell, elastic band',
    dimensions: 'One size; roomy for braids, locs and rollers',
    colours: ['Black', 'Burgundy', 'Print'],
    features: [
      'Satin lining reduces friction that roughens edges and dries hair overnight',
      'Double-layer crown keeps its shape through the night',
      'Soft, wide elastic that does not press a line into your edges',
    ],
  },
  {
    name: 'Beard Growth Oil', category: 'beauty-perfumes', type: 'PHYSICAL',
    price: 6000, seller: 'amara-luxe-atelier',
    material: 'Jojoba, castor and argan oils with vitamin E',
    dimensions: '60 ml dropper bottle',
    namedVariants: ['— Sandalwood', '— Citrus', '— Unscented'],
    features: [
      'Conditions the beard and the skin under it — less itch, less flake',
      'Lightweight oils that do not sit greasy on the surface',
      'Cosmetic conditioning only; no medical or growth-hormone claims',
    ],
  },
  {
    name: 'Coffee Body Scrub', category: 'beauty-perfumes', type: 'PHYSICAL',
    price: 7000, seller: 'amara-luxe-atelier',
    material: 'Arabica coffee grounds, brown sugar, coconut oil',
    dimensions: '300 g jar',
    features: [
      'Medium-grit scrub for arms and legs — gentle enough for weekly use',
      'Coconut-oil base leaves skin soft after rinsing',
      'Smells like a café for the length of a shower',
    ],
    care: 'Use a spoon, not wet fingers, to keep the jar fresh.',
  },
  {
    name: 'Lip Balm Trio', category: 'beauty-perfumes', type: 'PHYSICAL',
    price: 4200, seller: 'amara-luxe-atelier',
    material: 'Shea butter, beeswax, coconut oil',
    dimensions: '3 × 10 g tubes',
    namedVariants: ['— Mint, Vanilla, Original', '— Cocoa, Strawberry, Original'],
    features: [
      'Beeswax base that survives harmattan without constant reapplication',
      'Tinted options give a sheer wash; originals go on clear',
      'Small enough for a pocket — sold as a trio because one disappears',
    ],
  },
  {
    name: 'Reed Diffuser Set', category: 'beauty-perfumes', type: 'PHYSICAL',
    price: 18500, seller: 'amara-luxe-atelier',
    material: 'Glass vessel, rattan reeds, fragrance oil base',
    dimensions: '200 ml; reeds 25 cm',
    namedVariants: ['— Lemongrass & Ginger', '— Sandalwood Rose', '— Fresh Linen'],
    features: [
      'Flame-free fragrance for bedrooms and sitting rooms — good where candles are impractical',
      'Rattan reeds draw oil continuously; lasts about 10–12 weeks',
      'Flip reeds weekly to refresh the throw',
    ],
  },
  {
    name: 'Soy Wax Candle Set', category: 'beauty-perfumes', type: 'PHYSICAL',
    price: 13000, seller: 'amara-luxe-atelier',
    material: 'Soy wax, cotton wicks, 8% fragrance load',
    dimensions: '3 × 120 g tins (25–30 hr burn each)',
    namedVariants: ['— Warm Set (Vanilla, Amber, Musk)', '— Fresh Set (Linen, Citrus, Mint)'],
    features: [
      'Soy wax burns cleaner and slower than paraffin equivalents',
      'Cotton wicks trimmed to size — light and go',
      'Reusable tins for spices or pins after the last burn',
    ],
    care: 'Trim wick to 5 mm before each burn; never leave a burning candle unattended.',
  },

  // ═══ INTERIOR & HOME — Zuri Home Living ═══════════════════
  {
    name: 'Handwoven Wall Tapestry', category: 'interior-home', type: 'PHYSICAL',
    price: 26000, seller: 'zuri-home-living',
    material: 'Cotton and jute weave on a hardwood dowel',
    dimensions: '90 × 120 cm',
    namedVariants: ['— Geometric Diamonds', '— Horizontal Stripes', '— Natural Mix'],
    features: [
      'Woven on floor looms by our partner workshop in Abuja',
      'Dowel hanging rod included — mounts on a single nail',
      'Texture warms up TV walls and stairwells without a heavy frame',
    ],
    care: 'Dust with a soft brush; spot clean only.',
  },
  {
    name: 'Rattan Pendant Lamp', category: 'interior-home', type: 'PHYSICAL',
    price: 42000, seller: 'zuri-home-living',
    material: 'Hand-woven rattan with bamboo frame',
    dimensions: 'Ø 45 cm; drop adjustable to 120 cm',
    colours: ['Natural', 'Walnut Stain'],
    features: [
      'Casts soft patterned light — beautiful over dining tables and stairwells',
      'Ships flat, opens to shape in minutes',
      'Fits standard E27 bulbs (warm 2700 K recommended); bulb not included',
    ],
  },
  {
    name: 'Arch Full-Length Mirror', category: 'interior-home', type: 'PHYSICAL',
    price: 98000, seller: 'zuri-home-living',
    material: '5 mm float glass, MDF + solid wood frame',
    dimensions: '160 × 70 cm; free-standing or wall-mount',
    colours: ['Natural Wood', 'Black', 'Gold Trim'],
    features: [
      'True-colour, low-distortion glass — the whole outfit, head to toe',
      'Leans safely with an anti-tip wall strap included',
      'Frame joints screwed and filled, not visible staples',
    ],
  },
  {
    name: 'Ceramic Vase Trio', category: 'interior-home', type: 'PHYSICAL',
    price: 19000, seller: 'zuri-home-living',
    material: 'Glazed stoneware',
    dimensions: 'Heights 18 / 25 / 32 cm',
    colours: ['Matte Cream', 'Reactive Blue-Green'],
    features: [
      'Watertight glazes — fresh flowers and dried stems both welcome',
      'Weighted bases that do not tip with tall branches',
      'Set of three scales nicely on a console or mantel',
    ],
  },
  {
    name: 'Woven Storage Basket Set', category: 'interior-home', type: 'PHYSICAL',
    price: 15500, seller: 'zuri-home-living',
    material: 'Water hyacinth weave, steel frame',
    dimensions: 'Set of 3: Ø 28 / 34 / 40 cm',
    features: [
      'Tidy toys, throws or laundry while adding texture instead of plastic',
      'Steel frame keeps round walls upright when empty',
      'Built-in side handles for carrying room to room',
    ],
  },
  {
    name: 'Beaded Placemat Set (4)', category: 'interior-home', type: 'PHYSICAL',
    price: 9800, seller: 'zuri-home-living',
    material: 'Wooden beads, jute cord',
    dimensions: 'Ø 38 cm each; set of 4',
    colours: ['Natural', 'Two-Tone Coffee'],
    features: [
      'Hand-strung beads turn everyday meals into an occasion',
      'Wipes clean with a damp cloth after dinner',
      'Roll for storage without damaging the weave',
    ],
  },
  {
    name: 'Framed Abstract Canvas Print', category: 'interior-home', type: 'PHYSICAL',
    price: 68000, seller: 'zuri-home-living',
    material: 'Giclée print on cotton canvas, pine floating frame',
    dimensions: '90 × 60 cm',
    namedVariants: ['— Dunes', '— Tides', '— Ember Field', '— Marble Study'],
    features: [
      'Original artworks printed on heavy cotton canvas — crisp, not poster-flat',
      'Floating pine frame with a finished back — hangs clean on one hook',
      'Archival inks resist fading in bright rooms',
    ],
  },
  {
    name: 'Bamboo Drawer Organisers', category: 'interior-home', type: 'PHYSICAL',
    price: 8800, seller: 'zuri-home-living',
    material: 'Bamboo with finger joints',
    dimensions: 'Set of 5 trays: 6–20 cm deep bins',
    features: [
      'Mix-and-match trays for kitchen junk drawers, vanities and desks',
      'Rounded corners slot together and stay put',
      'Wipe-clean bamboo that does not splinter like cheap ply',
    ],
  },
  {
    name: 'Ankara Throw Pillow Covers (2)', category: 'interior-home', type: 'PHYSICAL',
    price: 8500, seller: 'zuri-home-living',
    material: 'Cotton ankara, hidden zip',
    dimensions: '45 × 45 cm (inserts not included)',
    colours: ['Indigo Medallion', 'Terracotta Bloom', 'Emerald Fan'],
    features: [
      'Same prints as our fashion line — coordinate a room with your wardrobe',
      'Hidden zips keep the look clean and inserts swap in seconds',
      'Colour-fast prints survive regular washing',
    ],
    care: 'Machine wash cold, line dry, iron on reverse.',
  },
  {
    name: 'Brass Table Lamp with Linen Shade', category: 'interior-home', type: 'PHYSICAL',
    price: 44000, seller: 'zuri-home-living',
    material: 'Brushed brass base, natural linen shade',
    dimensions: 'Height 48 cm; shade Ø 25 cm',
    features: [
      'Warm, filtered light for bedside tables and consoles',
      'Inline switch on a 1.8 m cord',
      'Fits standard E27 bulbs (warm LED recommended); bulb not included',
    ],
  },
  {
    name: 'Handwoven Jute Rug', category: 'interior-home', type: 'PHYSICAL',
    price: 110000, seller: 'zuri-home-living',
    material: 'Hand-braided jute with cotton backing',
    dimensions: '150 × 240 cm (5 × 8 ft)',
    namedVariants: ['— Natural', '— Natural/Charcoal Border'],
    features: [
      'Dense braided weave that stands up to hallways and living rooms',
      'Cotton-backed so it does not scratch wooden floors; rug grip pad recommended',
      'Sheds a little at first, then settles',
    ],
    care: 'Vacuum without beater bar; rotate seasonally for even wear.',
  },
  {
    name: 'Minimal Wood Wall Clock', category: 'interior-home', type: 'PHYSICAL',
    price: 14500, seller: 'zuri-home-living',
    material: 'Rubberwood face, silent quartz movement',
    dimensions: 'Ø 30 cm; depth 4 cm',
    colours: ['Natural', 'Espresso'],
    features: [
      'Truly silent sweep movement — no tick in bedrooms or studies',
      'One AA battery runs about 12 months',
      'Matte face reads clearly across a room without shouting',
    ],
  },
  {
    name: 'Incense Holder & Stick Set', category: 'interior-home', type: 'PHYSICAL',
    price: 6200, seller: 'zuri-home-living',
    material: 'Ceramic dish; charcoal-free sticks',
    dimensions: 'Dish Ø 12 cm; 40 sticks',
    namedVariants: ['— Sandalwood', '— Frankincense', '— Lemongrass'],
    features: [
      'Catch-all ceramic dish means no ash on the table',
      'Charcoal-free sticks burn about 35 minutes each',
      'Burn in ventilated rooms, away from curtains and children',
    ],
  },

  // ═══ FURNITURE — Zuri Home Living ═════════════════════════
  {
    name: 'Rattan Lounge Chair', category: 'furniture', type: 'PHYSICAL',
    price: 165000, seller: 'zuri-home-living',
    material: 'Rattan over kiln-dried hardwood frame, foam cushion',
    dimensions: '72 W × 78 D × 80 H cm; seat height 42 cm',
    colours: ['Natural Rattan', 'Walnut Frame + Cream Cushion'],
    features: [
      'Open-weave back keeps sitting cool in our climate',
      'High-resilience foam cushion with a washable cover',
      'Corner blocks glued and screwed — no wobble after moving',
    ],
    leadTime: 'Made to order: ships in 2–3 weeks.',
  },
  {
    name: 'Solid Oak Dining Table (6-Seater)', category: 'furniture', type: 'PHYSICAL',
    price: 780000, seller: 'zuri-home-living',
    material: 'Solid oak top, oak legs, matte oil finish',
    dimensions: '180 × 90 × 75 cm; top 3.5 cm thick',
    colours: ['Natural Oak', 'Warm Walnut Stain'],
    features: [
      'Joined top boards with breadboard ends that move with the seasons without cracking',
      'Tapered legs bolted with steel inserts for flat-pack-free stability',
      'Food-safe matte oil finish — water beads, coasters still appreciated',
    ],
    leadTime: 'Made to order: ships in 3–4 weeks.',
  },
  {
    name: '5-Tier Solid Wood Bookshelf', category: 'furniture', type: 'PHYSICAL',
    price: 195000, seller: 'zuri-home-living',
    material: 'Pine and hardwood mix, water-based lacquer',
    dimensions: '80 W × 30 D × 180 H cm; shelf load 25 kg',
    colours: ['Natural Pine', 'Espresso'],
    features: [
      'Fixed shelves with rear-brace stability — it does not need wall anchoring to stand square',
      '15 cm clearance under the bottom shelf for skirting boards',
      'Wall-strap included for homes with toddlers',
    ],
    leadTime: 'Made to order: ships in 2–3 weeks.',
  },
  {
    name: 'Bedside Table with Drawer', category: 'furniture', type: 'PHYSICAL',
    price: 72000, seller: 'zuri-home-living',
    material: 'Rubberwood, soft-close drawer runners',
    dimensions: '45 W × 40 D × 55 H cm',
    colours: ['Natural', 'White', 'Walnut'],
    features: [
      'One deep drawer plus an open shelf for books and chargers',
      'Cable notch at the back for lamp and phone cords',
      'Soft-close runners that do not slam at midnight',
    ],
    leadTime: 'Made to order: ships in 2 weeks.',
  },
  {
    name: 'Ergonomic Mesh Office Chair', category: 'furniture', type: 'PHYSICAL',
    price: 135000, seller: 'zuri-home-living',
    material: 'Breathable mesh back, moulded foam seat, nylon base',
    dimensions: 'Seat height 45–53 cm; holds up to 120 kg',
    features: [
      'Adjustable lumbar support, armrests and tilt tension for long work days',
      'Mesh back breathes in heat — no sweaty-back afternoons',
      'Class-4 gas lift rated for daily height changes',
    ],
  },
  {
    name: 'Walnut Round Coffee Table', category: 'furniture', type: 'PHYSICAL',
    price: 105000, seller: 'zuri-home-living',
    material: 'Walnut-veneered top, solid wood legs',
    dimensions: 'Ø 90 cm; height 42 cm',
    colours: ['Walnut', 'Natural Oak'],
    features: [
      'Rounded edges that are kinder to toddler heads and hips',
      'Lower shelf for remotes and magazines',
      'Water-resistant matte top — wipes clean after movie snacks',
    ],
    leadTime: 'Made to order: ships in 2 weeks.',
  },
  {
    name: '3-Seater Bouclé Sofa', category: 'furniture', type: 'PHYSICAL',
    price: 560000, originalPrice: 640000, seller: 'zuri-home-living',
    material: 'Bouclé upholstery, hardwood frame, webbing suspension',
    dimensions: '210 W × 88 D × 82 H cm; seat depth 60 cm',
    colours: ['Ivory Bouclé', 'Mocha Bouclé', 'Sage Bouclé'],
    features: [
      'Deep-seat comfort with back cushions that actually keep their shape',
      'Removable, washable cushion covers — practical with children',
      'Solid hardwood frame on webbing suspension, warranted for 2 years',
    ],
    leadTime: 'Made to order: ships in 4 weeks.',
  },
  {
    name: 'Oak Bar Stools (Set of 2)', category: 'furniture', type: 'PHYSICAL',
    price: 78000, seller: 'zuri-home-living',
    material: 'Solid oak, footrest bar',
    dimensions: 'Seat height 65 cm (counter height)',
    colours: ['Natural', 'Charcoal'],
    features: [
      'Counter-height pair for kitchen islands and breakfast bars',
      'Contoured seats that are kind at breakfast and at midnight snacks',
      'Felt-padded feet that protect tile and wood floors',
    ],
    leadTime: 'Made to order: ships in 2 weeks.',
  },
  {
    name: '2-Door Wardrobe', category: 'furniture', type: 'PHYSICAL',
    price: 265000, seller: 'zuri-home-living',
    material: 'MDF body, hardwood frame, hanging rail + shelf',
    dimensions: '100 W × 55 D × 195 H cm',
    colours: ['White', 'Walnut'],
    features: [
      'Full-length hanging space plus a top shelf and bottom drawer',
      'Doors align with adjustable hinges — no sagging gaps',
      'Anti-tip wall fixings included and expected',
    ],
    leadTime: 'Made to order: ships in 3 weeks.',
  },
  {
    name: 'Writing Desk with Drawers', category: 'furniture', type: 'PHYSICAL',
    price: 165000, seller: 'zuri-home-living',
    material: 'Rubberwood top, plywood carcass',
    dimensions: '120 W × 55 D × 76 H cm',
    colours: ['Natural', 'Espresso'],
    features: [
      'Two side drawers with real dovetail joints, not stapled boxes',
      'Cable grommet at the back for tidy laptop setups',
      'Knee clearance 68 cm — no shin-knocking apron',
    ],
    leadTime: 'Made to order: ships in 2–3 weeks.',
  },
  {
    name: 'TV Stand Console', category: 'furniture', type: 'PHYSICAL',
    price: 125000, seller: 'zuri-home-living',
    material: 'MDF with oak-veneer doors, steel legs',
    dimensions: '160 W × 40 D × 48 H cm; fits up to 65″ TVs',
    colours: ['Oak/White', 'Oak/Black'],
    features: [
      'Cable cut-outs at the back keep consoles and decoders tidy',
      'Soft-close doors with adjustable shelves inside',
      'Steel legs rated for the weight of a 65″ screen plus gear',
    ],
    leadTime: 'Made to order: ships in 2 weeks.',
  },
  {
    name: 'Console Entryway Table', category: 'furniture', type: 'PHYSICAL',
    price: 118000, seller: 'zuri-home-living',
    material: 'Solid rubberwood, walnut stain',
    dimensions: '110 W × 35 D × 80 H cm',
    features: [
      'Slim profile that fits hallways without blocking doors',
      'Lower shelf for shoes or baskets; top takes keys, trays and lamps',
      'Wall strap included for wobbly-floor safety',
    ],
    leadTime: 'Made to order: ships in 2 weeks.',
  },

  // ═══ HEALTH & WELLNESS — Wellspring Wellness Co. ══════════
  {
    name: 'Non-Slip Yoga Mat (6 mm)', category: 'health-wellness', type: 'PHYSICAL',
    price: 15000, seller: 'wellspring-wellness-co',
    material: 'TPE foam (latex-free)',
    dimensions: '183 × 61 cm × 6 mm; 1.1 kg',
    colours: ['Sage', 'Charcoal', 'Plum'],
    features: [
      'Dual-texture surface grips palms in downward dog even with light sweat',
      '6 mm cushioning is kind to knees on tiled floors',
      'Alignment lines down the centre help you square your hands and feet',
    ],
    includes: ['Carry strap'],
    care: 'Wipe with water and mild soap; air dry flat, out of sun.',
  },
  {
    name: 'Resistance Bands Set', category: 'health-wellness', type: 'PHYSICAL',
    price: 9800, seller: 'wellspring-wellness-co',
    material: 'Layered latex with fabric sleeves on loops',
    dimensions: '5 bands: 5–25 kg assistance levels',
    features: [
      'Five progressive levels — from assisted stretches to real strength work',
      'Fabric-sleeved loops for glute work that does not pinch skin',
      'Includes door anchor and handles for rows and presses',
    ],
    includes: ['Door anchor', 'Handles', 'Ankle straps', 'Mesh carry bag', 'Exercise card'],
  },
  {
    name: 'Adjustable Dumbbells Pair (2×10 kg)', category: 'health-wellness', type: 'PHYSICAL',
    price: 58000, seller: 'wellspring-wellness-co',
    material: 'Cast iron plates, knurled steel handles, spinlock collars',
    dimensions: 'Each dumbbell adjusts 2–10 kg; bar 40 cm',
    features: [
      'Spinlock collars hold plates tight — no rattle mid-set',
      'Knurled handles with a crosshatch that grips without shredding palms',
      'Replaces a full rack in a small apartment',
    ],
    includes: ['8 × 2 kg plates', '4 × 1 kg plates', '2 bars + collars'],
  },
  {
    name: 'Weighted Jump Rope', category: 'health-wellness', type: 'PHYSICAL',
    price: 6200, seller: 'wellspring-wellness-co',
    material: 'PVC-coated steel cable, ball-bearing handles',
    dimensions: 'Cable 3 m, adjustable; handles 15 cm',
    colours: ['Black', 'Red'],
    features: [
      'Ball-bearing rotation keeps rhythm smooth for double-unders',
      'Removable weight rods switch between speed and endurance modes',
      'Cable cutters not needed — adjust length at the handle',
    ],
    includes: ['Spare cable', 'Carry pouch'],
  },
  {
    name: 'High-Density Foam Roller', category: 'health-wellness', type: 'PHYSICAL',
    price: 12500, seller: 'wellspring-wellness-co',
    material: 'EVA foam over ABS core',
    dimensions: '45 × 15 cm; holds 120 kg',
    features: [
      'Firm density for quads, calves and back release after training',
      'Textured surface mimics a therapist’s palm-and-thumb pattern',
      'Core will not flex or crack with bodyweight use',
    ],
  },
  {
    name: 'Time-Marker Water Bottle (1 L)', category: 'health-wellness', type: 'PHYSICAL',
    price: 6800, seller: 'wellspring-wellness-co',
    material: 'BPA-free Tritan, silicone spout',
    dimensions: '1 L; 28 × 8 cm',
    colours: ['Clear/Mint', 'Clear/Pink', 'Smoke'],
    features: [
      'Hourly time markers nudge steady sipping through the workday',
      'Leak-proof flip lock that survives being tossed in a bag',
      'Wide mouth takes ice cubes and cleaning brushes',
    ],
  },
  {
    name: 'Glass Meal-Prep Containers (7-pack)', category: 'health-wellness', type: 'PHYSICAL',
    price: 32000, seller: 'wellspring-wellness-co',
    material: 'Borosilicate glass, snap-lock lids',
    dimensions: '940 ml each; 21 × 15 × 7 cm',
    features: [
      'Oven-to-fridge-to-bag for a week of lunches in one prep session',
      'Lids are leak-tested with stew — soup stays in the box',
      'Glass does not stain or hold curry smells like plastic',
    ],
    care: 'Lids: hand wash. Glass: dishwasher safe.',
  },
  {
    name: 'Essential Oil Diffuser', category: 'health-wellness', type: 'PHYSICAL',
    price: 19500, seller: 'wellspring-wellness-co',
    material: 'PP water tank, wood-grain base',
    dimensions: '300 ml tank; runs up to 8 hr',
    colours: ['Light Wood', 'Dark Wood'],
    features: [
      'Ultrasonic mist with 7-colour ambient light and timer modes',
      'Auto shut-off when dry — safe for bedrooms',
      'Aromatherapy ambience only; oils sold separately and this is not a medical device',
    ],
  },
  {
    name: 'Acupressure Mat & Pillow Set', category: 'health-wellness', type: 'PHYSICAL',
    price: 17000, seller: 'wellspring-wellness-co',
    material: 'Cotton-linen cover, ABS lotus spikes, foam core',
    dimensions: 'Mat 70 × 42 cm; pillow 38 × 15 cm',
    features: [
      '6,210 lotus points for after-work tension release on the back and neck',
      'First minute is intense — most users ease in over a shirt',
      'Wellness relaxation product, not a medical treatment',
    ],
  },
  {
    name: 'Undated Fitness Journal', category: 'health-wellness', type: 'PHYSICAL',
    price: 5500, seller: 'wellspring-wellness-co',
    material: 'FSC paper, PU cover, lay-flat binding',
    dimensions: 'A5; 140 pages',
    colours: ['Sage', 'Charcoal'],
    features: [
      'Undated daily pages: goals, workouts, sets/reps, water and sleep logs',
      '12 weekly review spreads to track what is actually working',
      'Lay-flat binding writes cleanly on both pages',
    ],
  },
  {
    name: '12-Week Home Workout Program', category: 'health-wellness', type: 'DIGITAL',
    price: 8000, seller: 'wellspring-wellness-co',
    format: 'PDF (85 pages) + printable trackers',
    audience: 'Beginners and returners training at home, no gym needed',
    contents: [
      '36 structured sessions across 12 weeks — strength, cardio and mobility days',
      'Every exercise has a step-by-step photo guide and a regression option',
      'Printable weekly trackers and a measurement log',
      'Warm-up and cooldown routines you can follow in real time',
    ],
    outcome: 'Finish with a consistent training habit and a clear picture of how to progress beyond week 12.',
  },
  {
    name: 'Nigerian Meal Plan & Nutrition Guide', category: 'health-wellness', type: 'DIGITAL',
    price: 9500, seller: 'wellspring-wellness-co',
    format: 'PDF (60 pages) + editable shopping list (Sheets)',
    audience: 'Anyone wanting balanced everyday meals built around Nigerian staples',
    contents: [
      '4 weeks of meal plans built around swallows, rice, beans and local proteins',
      'Portion guides using everyday measures (cups, spoons, pieces)',
      'Swaps for budget, vegetarian and higher-protein preferences',
      'Shopping lists priced against common Lagos and Abuja market items',
    ],
    outcome: 'Plan a balanced week of familiar meals without guessing portions.',
  },
  {
    name: 'Beginner’s Guide to Intermittent Fasting', category: 'health-wellness', type: 'DIGITAL',
    price: 4800, seller: 'wellspring-wellness-co',
    format: 'PDF (34 pages) + habit tracker',
    audience: 'Curious beginners who want a sober, no-hype explanation',
    contents: [
      'What fasting windows are (16:8, 14:10, 5:2) and who should speak to a doctor first',
      'How to structure meals inside a window with Nigerian foods',
      'Hydration, headaches, and the adjustments most beginners miss',
      'A 4-week on-ramp tracker',
    ],
    outcome: 'Decide calmly whether fasting fits your life — and how to start safely.',
  },
  {
    name: 'Sleep Reset: A Practical Sleep-Hygiene Course', category: 'health-wellness', type: 'DIGITAL',
    price: 6500, seller: 'wellspring-wellness-co',
    format: 'Video (7 lessons, ~55 min) + workbook (PDF)',
    audience: 'Anyone whose screen-filled evenings are wrecking their mornings',
    contents: [
      'Light, caffeine and temperature: the three levers that matter most',
      'A wind-down routine you can run in 20 minutes',
      'Night-shift and irregular-schedule adaptations',
      'A 21-day sleep-hygiene workbook',
    ],
    outcome: 'A personal evening routine with the habits that most reliably improve sleep quality.',
  },

  // ═══ DIGITAL EDUCATION — Brightpath Digital Academy ═══════
  {
    name: 'Full-Stack Web Development Bootcamp', category: 'digital-education', type: 'DIGITAL',
    price: 78000, originalPrice: 95000, seller: 'brightpath-digital-academy',
    format: 'Video (128 lessons, ~42 hrs) + 14 projects + private community',
    audience: 'Career-switchers and students who want job-ready web skills',
    contents: [
      'HTML, CSS and modern JavaScript, taught by building real pages from lesson one',
      'React frontend and Node.js/Express backend with a PostgreSQL capstone',
      'Git, GitHub and deployment workflows on real hosting',
      '14 portfolio projects reviewed against a professional checklist',
    ],
    requirements: ['A laptop with 8 GB RAM', 'Reliable internet for video lessons (downloadable at lower resolutions)'],
    outcome: 'Build, deploy and explain full-stack applications — the portfolio does the talking in interviews.',
  },
  {
    name: 'UI/UX Design Fundamentals', category: 'digital-education', type: 'DIGITAL',
    price: 48000, seller: 'brightpath-digital-academy',
    format: 'Video (64 lessons, ~19 hrs) + Figma exercise files',
    audience: 'Aspiring product designers; no design background required',
    contents: [
      'Figma fluency: frames, components, auto-layout and prototyping',
      'Layout, type and colour systems with practical constraints',
      'User flows, wireframes and usability testing on a real budget',
      'A complete case study project to anchor your portfolio',
    ],
    requirements: ['A Figma account (free tier is enough)', 'Google Chrome'],
    outcome: 'Design a polished product flow end-to-end and present it as a hiring-ready case study.',
  },
  {
    name: 'Excel for Business & Finance', category: 'digital-education', type: 'DIGITAL',
    price: 26000, seller: 'brightpath-digital-academy',
    format: 'Video (48 lessons, ~12 hrs) + 30 practice workbooks',
    audience: 'Analysts, accountants, ops and admin professionals',
    contents: [
      'From clean data to dashboards: XLOOKUP, SUMIFS, pivot tables, Power Query',
      'Financial models: forecasts, loan amortisation and break-even sheets',
      'Chart design that survives management review',
      'Real Nigerian business scenarios — inventory, payroll, FX exposure',
    ],
    requirements: ['Excel 2016 or newer / Microsoft 365'],
    outcome: 'Automate the reports you currently build by hand every month.',
  },
  {
    name: 'Digital Marketing Masterclass', category: 'digital-education', type: 'DIGITAL',
    price: 39000, seller: 'brightpath-digital-academy',
    format: 'Video (72 lessons, ~21 hrs) + campaign template pack',
    audience: 'Small-business owners and first marketing hires',
    contents: [
      'Meta and Google Ads from account setup to first conversion',
      'Email marketing and automation with a budget-friendly stack',
      'Content systems for Instagram, TikTok and WhatsApp Business',
      'Analytics: reading dashboards, cutting what does not convert',
    ],
    outcome: 'Launch a measured, multi-channel campaign with realistic budgets for the Nigerian market.',
  },
  {
    name: 'Data Analysis with Python', category: 'digital-education', type: 'DIGITAL',
    price: 62000, seller: 'brightpath-digital-academy',
    format: 'Video (58 lessons, ~24 hrs) + 20 notebooks',
    audience: 'Analysts and developers moving from spreadsheets to code',
    contents: [
      'Python fundamentals through data work — no prior coding needed',
      'pandas for cleaning and reshaping messy, real-world exports',
      'Matplotlib/Seaborn visualisation and a stats primer',
      'Capstone: a full analysis of an open Lagos transport dataset',
    ],
    requirements: ['Any computer from the last 6 years', 'We walk through installing Python and VS Code'],
    outcome: 'Take a raw CSV from chaos to a reproducible, presentable analysis.',
  },
  {
    name: 'Product Management Primer', category: 'digital-education', type: 'DIGITAL',
    price: 36000, seller: 'brightpath-digital-academy',
    format: 'Video (40 lessons, ~11 hrs) + templates',
    audience: 'Aspiring PMs, founders and team leads',
    contents: [
      'Discovery interviews, opportunity sizing and PRD writing',
      'Roadmaps, prioritisation frameworks (RICE, Kano) done practically',
      'Working with engineers and designers without becoming a ticket machine',
      'A portfolio-ready product case study workbook',
    ],
    outcome: 'Run a discovery cycle and write specs engineers actually want to build.',
  },
  {
    name: 'CV & Interview Toolkit', category: 'digital-education', type: 'DIGITAL',
    price: 8500, seller: 'brightpath-digital-academy',
    format: 'Templates (DOCX + PDF) + video walkthroughs (3 hrs)',
    audience: 'Job seekers in tech, finance and operations',
    contents: [
      'ATS-friendly CV templates with recruiter-explained structure',
      'Before/after rewrites of six real (anonymised) Nigerian CVs',
      'Interview answer frameworks: STAR stories and salary negotiation scripts',
      'LinkedIn profile checklist',
    ],
    outcome: 'A CV that gets read and interviews you walk into prepared.',
  },
  {
    name: 'Financial Literacy for Nigerians', category: 'digital-education', type: 'DIGITAL',
    price: 15500, seller: 'brightpath-digital-academy',
    format: 'Video (32 lessons, ~8 hrs) + planning workbook',
    audience: 'Young professionals building their first financial systems',
    contents: [
      'Budgeting with irregular income — the envelope method, digital edition',
      'Emergency funds, and how Nigerian inflation shapes where you keep cash',
      'T-Bills, money-market funds and mutual funds explained without jargon',
      'Fraud recognition: the current scams and the questions that expose them',
    ],
    outcome: 'A personal money system with automated savings and a working emergency fund plan.',
  },
  {
    name: 'Graphic Design with Figma', category: 'digital-education', type: 'DIGITAL',
    price: 31000, seller: 'brightpath-digital-academy',
    format: 'Video (52 lessons, ~15 hrs) + asset library',
    audience: 'Social media managers and self-taught designers',
    contents: [
      'Figma for print-adjacent and social design — flyers, carousels, banners',
      'Typography, grids and colour that stop looking “template-y”',
      'Brand kits: build a reusable system once, ship fast forever',
      'Export settings that keep quality on every platform',
    ],
    outcome: 'Produce a month of on-brand social content in a single sitting.',
  },
  {
    name: 'Video Editing with Premiere Pro', category: 'digital-education', type: 'DIGITAL',
    price: 44000, seller: 'brightpath-digital-academy',
    format: 'Video (60 lessons, ~18 hrs) + practice footage',
    audience: 'Content creators and aspiring editors',
    contents: [
      'Editing fundamentals: cuts, pacing, J/L cuts and music beds',
      'Colour correction and grades with Lumetri',
      'Sound cleanup for dialogue recorded in Nigerian rooms (generators, traffic)',
      'Export presets for YouTube, Instagram Reels and client deliverables',
    ],
    requirements: ['Adobe Premiere Pro 2022 or newer', '16 GB RAM recommended'],
    outcome: 'Deliver a client-ready edit from raw footage to final export.',
  },
  {
    name: 'Copywriting that Converts', category: 'digital-education', type: 'DIGITAL',
    price: 19500, seller: 'brightpath-digital-academy',
    format: 'Video (36 lessons, ~9 hrs) + swipe library',
    audience: 'Founders, freelancers and marketers who write their own copy',
    contents: [
      'Voice-of-customer research — mining reviews and WhatsApp threads for language',
      'Landing pages, emails and ad copy structures with worked examples',
      'Editing passes that cut fluff without losing warmth',
      'A/B thinking: what to test and how to read the result',
    ],
    outcome: 'Rewrite one of your own pages in class and measure the difference.',
  },
  {
    name: 'IELTS Academic Preparation Program', category: 'digital-education', type: 'DIGITAL',
    price: 58000, originalPrice: 70000, seller: 'brightpath-digital-academy',
    format: 'Video (68 lessons, ~20 hrs) + 8 mock tests + speaking clinics',
    audience: 'Candidates targeting Band 7+ for study or migration',
    contents: [
      'Strategy per band section: Listening, Reading, Writing Tasks 1 & 2, Speaking',
      'Writing assessments on two submitted essays with examiner-style feedback',
      'Timed mock tests with score conversion tables',
      'Monthly live speaking clinics in small groups',
    ],
    outcome: 'Walk into the exam knowing exactly how your band is assembled.',
  },
  {
    name: 'Bookkeeping for Small Business', category: 'digital-education', type: 'DIGITAL',
    price: 23500, seller: 'brightpath-digital-academy',
    format: 'Video (44 lessons, ~10 hrs) + Excel ledger system',
    audience: 'Shop owners, freelancers and side-hustlers',
    contents: [
      'Separating business and personal money — the foundational move',
      'A ready-made Excel ledger: sales, expenses, inventory and debtors',
      'Simple monthly close: reconciling bank, POS and cash',
      'Reading your numbers: margin, burn and restock signals',
    ],
    outcome: 'Close each month knowing exactly what the business made and owes.',
  },
  {
    name: 'WhatsApp & Instagram Sales Playbook', category: 'digital-education', type: 'DIGITAL',
    price: 10500, seller: 'brightpath-digital-academy',
    format: 'PDF playbook (78 pages) + 60 message templates',
    audience: 'Vendor businesses selling through chat and social DMs',
    contents: [
      'Catalogue setup that ends “how much is this?” messages',
      'Status-selling rhythm: a weekly posting plan that does not feel spammy',
      'Objection handling scripts for price, delivery and trust questions',
      'Order-to-delivery tracking sheet included',
    ],
    outcome: 'A repeatable DM-to-delivery pipeline your assistant could run.',
  },

  // ═══ DIGITAL PRODUCTS — Brightpath + Wellspring ═══════════
  {
    name: 'Notion Business OS Template', category: 'digital-products', type: 'DIGITAL',
    price: 9800, seller: 'brightpath-digital-academy',
    format: 'Notion template (duplicate link) + setup video (25 min)',
    audience: 'Freelancers and small teams running ops in Notion',
    contents: [
      'Dashboard: tasks, clients, invoices and goals on one page',
      'CRM with pipeline stages and follow-up reminders',
      'Invoice tracker tied to client records',
      'Weekly and monthly review templates',
    ],
    requirements: ['A free Notion account'],
    outcome: 'Replace eight scattered docs with one organised workspace in an afternoon.',
  },
  {
    name: 'Minimal Portfolio UI Kit (Figma)', category: 'digital-products', type: 'DIGITAL',
    price: 14500, seller: 'brightpath-digital-academy',
    format: 'Figma file + style guide',
    audience: 'Designers and developers building portfolio sites',
    contents: [
      '12 desktop and 12 mobile screens: home, work, case study, contact, blog',
      'Auto-layout components with a documented style guide',
      'Light and dark themes on shared variables',
      'A 1-hour walkthrough video of the file structure',
    ],
    requirements: ['Figma (free plan works)'],
    outcome: 'Ship a clean portfolio site in days by remixing proven screens.',
  },
  {
    name: 'Product Photo Presets Pack (Lightroom)', category: 'digital-products', type: 'DIGITAL',
    price: 11500, seller: 'brightpath-digital-academy',
    format: '40 XMP/DNG presets + PDF usage guide',
    audience: 'Online sellers photographing products on phones or entry DSLRs',
    contents: [
      'Presets for white-background, lifestyle and outdoor-market lighting',
      'Skin-safe versions for fashion and beauty shots',
      'Before/after examples for each preset',
      'A phone-lighting primer written for Nigerian rooms',
    ],
    requirements: ['Lightroom mobile (free) or desktop'],
    outcome: 'Consistent, credible product photos without a studio budget.',
  },
  {
    name: 'Invoice & Quote Template Pack', category: 'digital-products', type: 'DIGITAL',
    price: 5000, seller: 'brightpath-digital-academy',
    format: 'DOCX, XLSX and Google Docs/Sheets copies + PDFs',
    audience: 'Freelancers and small businesses without invoicing software',
    contents: [
      'Professional invoice, quote and receipt templates with auto-calculating totals',
      'VAT-inclusive and exclusive variants',
      'A simple receivables tracker',
      'Guidance on payment terms and overdue wording',
    ],
    outcome: 'Send documents that look established and get paid faster.',
  },
  {
    name: 'Bank-Ready Business Plan Template', category: 'digital-products', type: 'DIGITAL',
    price: 7800, seller: 'brightpath-digital-academy',
    format: 'DOCX template + financial model (XLSX) + guide PDF',
    audience: 'Founders approaching banks, MFIs or grant programmes',
    contents: [
      'Section-by-section plan structure with prompts and worked examples',
      '3-year financial model: revenue, costs, cash flow and break-even',
      'Nigerian lending context: what loan officers look for',
      'Executive summary formula that survives a 60-second skim',
    ],
    outcome: 'A complete, coherent plan and the numbers to defend it.',
  },
  {
    name: 'Social Media Content Calendar (365 Days)', category: 'digital-products', type: 'DIGITAL',
    price: 8800, seller: 'brightpath-digital-academy',
    format: 'Sheets/Excel calendar + prompt library PDF',
    audience: 'Small businesses posting without a content team',
    contents: [
      'A full year of daily post prompts themed by weekday',
      'Nigerian retail calendar baked in: Detty December, Independence sales, Sallah/Christmas windows',
      'Hooks and caption starters per prompt',
      'A batching workflow to plan a month in one hour',
    ],
    outcome: 'Never open the app wondering what to post today.',
  },
  {
    name: 'Instagram Carousel Templates (90)', category: 'digital-products', type: 'DIGITAL',
    price: 6800, seller: 'brightpath-digital-academy',
    format: 'Canva template links + font list',
    audience: 'Creators and brands building educational carousel content',
    contents: [
      '90 Canva layouts: hooks, step slides, quotes, CTAs — mix and match',
      'Free-font pairing list so exports match previews',
      'Swipe-through demo deck showing sequence structure',
    ],
    requirements: ['A free Canva account'],
    outcome: 'Carousels that look custom-designed, batch-produced in minutes.',
  },
  {
    name: 'Freelance Proposal Template Kit', category: 'digital-products', type: 'DIGITAL',
    price: 6200, seller: 'brightpath-digital-academy',
    format: 'DOCX/PDF templates + pricing sheet + guide',
    audience: 'Freelancers bidding for agency and corporate work',
    contents: [
      'Three proposal lengths: one-pager, standard, enterprise',
      'Scope, milestone and payment-terms language that protects you',
      'A pricing calculator with margin guardrails',
      'Follow-up and objection scripts',
    ],
    outcome: 'Proposals that read professional and close without panic-discounts.',
  },
  {
    name: 'Study Planner (Printable PDF)', category: 'digital-products', type: 'DIGITAL',
    price: 3500, seller: 'brightpath-digital-academy',
    format: 'Printable PDF (A4 + A5, 28 pages)',
    audience: 'Students and exam candidates',
    contents: [
      'Semester and term overviews with exam-date mapping',
      'Weekly study timetables with spaced-repetition reminders',
      'Assignment and project trackers',
      'Both A4 and A5 print layouts (print at home or a business centre)',
    ],
    outcome: 'A term planned on paper in an evening, used all semester.',
  },
  {
    name: 'Resume Template Bundle (12 Designs)', category: 'digital-products', type: 'DIGITAL',
    price: 5800, seller: 'brightpath-digital-academy',
    format: 'DOCX + Canva links + icon pack',
    audience: 'Job seekers who want a CV that survives ATS filters',
    contents: [
      '12 one-page and two-page designs — conservative to modern',
      'ATS-tested: standard headings, no tables that scramble parsing',
      'Matching cover-letter layouts',
      'Word-by-word writing prompts for each section',
    ],
    outcome: 'Pick a design, drop in your story, apply the same day.',
  },
  {
    name: 'Email Marketing Swipe File', category: 'digital-products', type: 'DIGITAL',
    price: 7200, seller: 'brightpath-digital-academy',
    format: 'PDF (110 emails) + Notion index',
    audience: 'Marketers and founders writing lifecycle email',
    contents: [
      '110 annotated emails: welcome, cart/nudge, winback, launch, newsletter',
      'Subject-line library organised by intent with open-rate notes',
      'Structure breakdowns: why each email works, line by line',
      'Adaptation worksheet for your own voice',
    ],
    outcome: 'Write your next email campaign from proven skeletons, not a blank page.',
  },
  {
    name: 'Digital Life Planner (iPad + Print)', category: 'digital-products', type: 'DIGITAL',
    price: 5500, seller: 'wellspring-wellness-co',
    format: 'Interactive PDF (hyperlinked, 300+ pages) + goodnotes-ready',
    audience: 'Planner users on tablets, plus printable for paper people',
    contents: [
      'Hyperlinked daily, weekly and monthly pages for a year',
      'Habit, meal, budget and fitness layouts',
      'Undated — start any month',
      'Setup video for GoodNotes/Notability users',
    ],
    requirements: ['A tablet PDF annotation app (or a printer)'],
    outcome: 'One planner for the whole life admin — no more four separate apps.',
  },
  {
    name: 'Small Business Legal Document Starter Pack', category: 'digital-products', type: 'DIGITAL',
    price: 12000, seller: 'brightpath-digital-academy',
    format: 'DOCX templates (9 documents) + plain-language guide',
    audience: 'Nigerian small businesses without in-house counsel',
    contents: [
      'Service agreement, NDA, invoice terms, freelance contract and more',
      'Plain-language guide to what each clause means and when to adjust it',
      'CAC-registration and tax-TIN checklist for context',
    ],
    outcome: 'Stop sending work on a handshake — start with documents that set expectations.',
  },
];

// ── Review comment pools (deterministic assignment) ───────

export const REVIEW_TITLES_5 = [
  'Worth every naira', 'Exactly as described', 'Exceeded expectations',
  'I am ordering again', 'Better than I expected', 'Seller did not disappoint',
  'This is my third order', 'Quality is solid', 'Fast delivery too',
  'Recommend without hesitation',
];
export const REVIEW_TITLES_4 = [
  'Very good overall', 'Happy with it', 'Good value for the price',
  'Small issues, still recommend', 'Does the job well', 'Solid purchase',
  'Would buy again', 'Nearly perfect',
];
export const REVIEW_TITLES_3 = [
  'Decent but read the details', 'Okay for the price', 'Mixed feelings',
  'Fine, with caveats', 'Good product, slow dispatch', 'It works',
];
export const REVIEW_TITLES_2 = [
  'Not for me', 'Expected more', 'Had issues', 'Below what I hoped',
];

export const REVIEW_COMMENTS_5 = [
  'Exactly as described. The {material} feels premium and delivery to {city} took just two days. Packaging was neat too.',
  'I was skeptical about ordering this online but it arrived well packed and it is genuinely good quality. The {feature} alone is worth it.',
  'Second time ordering from this seller and they remain consistent. Product works perfectly.',
  'Been using it daily for three weeks now and zero complaints. It arrived earlier than the estimated date.',
  'Quality you would pay double for in the mall. {feature} works exactly as promised.',
  'My sister saw mine and immediately ordered hers. That says everything. Well done to this seller.',
  'The attention to detail is clear — even the packaging was thoughtful. Very happy with this purchase.',
  'Received in {city} in three days, well wrapped. Product matches the photos exactly, no Photoshop tricks.',
  'Honestly impressed. You can tell the seller actually tests what they sell instead of just reselling.',
  'Perfect. {feature} makes such a difference compared to the cheaper one I used before.',
];
export const REVIEW_COMMENTS_4 = [
  'Very good overall. Took a while to arrive in {city} but the product itself is solid and well made.',
  'Happy with it. One tiny detail I would change is the {feature} setup, but everything else works as described.',
  'Good value for the price. Not luxury-level, but honestly better than what you get at this price range in most shops.',
  'The {material} is nicer than I expected at this price. Minor cosmetic difference from the photos but nothing that matters.',
  'Does exactly what it says. Communication from the seller was good and dispatch was quick.',
  'Bought two — keeping one, gifting the other. The recipient was impressed, so the quality travels well.',
  'Solid purchase. Took me a few days to get used to {feature}, but now I use it every day.',
  'Nearly perfect. Docking one star only because the delivery took four days instead of two, but the item itself is great.',
];
export const REVIEW_COMMENTS_3 = [
  'Decent, but read the details carefully before ordering. It is good for the price, just not premium. {feature} is the part I use most.',
  'Okay product. The {material} is lighter than I expected and shipping to {city} added a few days, but the seller responded quickly when I asked.',
  'Mixed feelings. The main function works well but the finishing could be neater. Acceptable for the price.',
  'It works fine, though the first one I was sent had a small issue. The seller replaced it without much stress, which I appreciated.',
  'Good value but manage expectations — this is a budget option, not a premium one. Fine for daily use.',
];
export const REVIEW_COMMENTS_2 = [
  'Not what I hoped. The {feature} did not work as described and returning it was a process. Seller did respond eventually.',
  'Expected more at this price point. It functions, but the quality feels a tier below the photos.',
  'Arrived later than promised and one part was loose. The seller offered a partial refund, so two stars for the effort.',
];
