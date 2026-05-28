const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'prompthub.db');
const db = new Database(dbPath);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
    -- 分类表
    CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 子分类表
    CREATE TABLE IF NOT EXISTS subcategories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        category_id INTEGER NOT NULL,
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES categories(id)
    );

    -- 图片条目表
    CREATE TABLE IF NOT EXISTS items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        prompt TEXT NOT NULL,
        image_url TEXT,
        thumbnail_url TEXT,
        subcategory_id INTEGER NOT NULL,
        sort_order INTEGER DEFAULT 0,
        views INTEGER DEFAULT 0,
        likes INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (subcategory_id) REFERENCES subcategories(id)
    );

    -- 标签表
    CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL
    );

    -- 图片-标签关联表
    CREATE TABLE IF NOT EXISTS item_tags (
        item_id INTEGER NOT NULL,
        tag_id INTEGER NOT NULL,
        PRIMARY KEY (item_id, tag_id),
        FOREIGN KEY (item_id) REFERENCES items(id),
        FOREIGN KEY (tag_id) REFERENCES tags(id)
    );

    -- 创建索引
    CREATE INDEX IF NOT EXISTS idx_subcategories_category ON subcategories(category_id);
    CREATE INDEX IF NOT EXISTS idx_items_subcategory ON items(subcategory_id);
    CREATE INDEX IF NOT EXISTS idx_items_title ON items(title);
    CREATE INDEX IF NOT EXISTS idx_item_tags_item ON item_tags(item_id);
    CREATE INDEX IF NOT EXISTS idx_item_tags_tag ON item_tags(tag_id);
`);

console.log('✓ 数据库表创建完成');

// Insert categories
const insertCategory = db.prepare('INSERT OR IGNORE INTO categories (key, name, sort_order) VALUES (?, ?, ?)');
const categories = [
    ['operation', '运营', 1],
    ['app', 'APP', 2],
    ['poster', '海报', 3],
    ['illustration', '插画', 4],
    ['ip', 'IP', 5],
];

const insertCategoryMany = db.transaction((cats) => {
    for (const cat of cats) {
        insertCategory.run(...cat);
    }
});
insertCategoryMany(categories);
console.log('✓ 分类数据插入完成');

// Get category IDs
const getCategoryId = db.prepare('SELECT id FROM categories WHERE key = ?');

// Insert subcategories
const insertSubcategory = db.prepare('INSERT OR IGNORE INTO subcategories (key, name, category_id, sort_order) VALUES (?, ?, ?, ?)');

const subcategories = [
    // 运营
    ['3d_poster', '3D海报', 'operation', 1],
    ['kv_poster', 'KV海报', 'operation', 2],
    ['banner', 'Banner', 'operation', 3],
    ['activity_page', '活动页', 'operation', 4],
    // APP
    ['app_icon', 'App图标', 'app', 1],
    ['empty_state', '空状态', 'app', 2],
    ['jingang_icon', '金刚区图标', 'app', 3],
    ['onboarding', '引导页', 'app', 4],
    ['splash_screen', '闪屏页', 'app', 5],
    // 海报
    ['collage', '拼贴海报', 'poster', 1],
    ['gradient_art', '渐变艺术', 'poster', 2],
    ['tech_poster', '科技海报', 'poster', 3],
    ['movie_poster', '电影海报', 'poster', 4],
    ['art_poster', '艺术海报', 'poster', 5],
    ['retro_poster', '复古海报', 'poster', 6],
    // 插画
    ['dopamine', '多巴胺', 'illustration', 1],
    ['clay', '黏土', 'illustration', 2],
    ['exaggerated', '夸张', 'illustration', 3],
    ['flat', '扁平', 'illustration', 4],
    ['isometric', '2.5D', 'illustration', 5],
    // IP
    ['cartoon_ip', '卡通IP', 'ip', 1],
    ['mascot', '吉祥物', 'ip', 2],
    ['emoji', '表情包', 'ip', 3],
];

const insertSubcategoryMany = db.transaction((subs) => {
    for (const [key, name, catKey, order] of subs) {
        const catRow = getCategoryId.get(catKey);
        if (catRow) {
            insertSubcategory.run(key, name, catRow.id, order);
        }
    }
});
insertSubcategoryMany(subcategories);
console.log('✓ 子分类数据插入完成');

// Insert tags
const insertTag = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)');
const tagNames = ['3D', '渐变', '扁平', '科技', '复古', '可爱', '黏土', '多巴胺', '霓虹', '极简', '拼贴', '手绘', '概念', '卡通', '写实', '抽象', '暗色', '亮色', '节日', '商业'];

const insertTagMany = db.transaction((tags) => {
    for (const tag of tags) {
        insertTag.run(tag);
    }
});
insertTagMany(tagNames);
console.log('✓ 标签数据插入完成');

// Insert items
const insertItem = db.prepare('INSERT OR IGNORE INTO items (title, prompt, image_url, thumbnail_url, subcategory_id, sort_order) VALUES (?, ?, ?, ?, ?, ?)');
const getSubcategoryId = db.prepare('SELECT id FROM subcategories WHERE key = ?');
const getTagId = db.prepare('SELECT id FROM tags WHERE name = ?');
const insertItemTag = db.prepare('INSERT OR IGNORE INTO item_tags (item_id, tag_id) VALUES (?, ?)');

const itemsData = [
    // 运营 - 3D海报
    { subKey: '3d_poster', title: '去班味旅行指南 3D海报', prompt: 'A vibrant 3D poster for a travel guide titled "去班味旅行指南", featuring cute cartoon characters relaxing on inflatable pool floats, surrounded by colorful clouds, luggage, airplane, and tropical elements. Playful composition with bold Chinese typography, bright pastel candy colors (pink, yellow, mint green) on dark background. 3D rendered, C4D style, high quality, detailed textures.', imgId: 1080, tags: ['3D', '可爱', '亮色'] },
    { subKey: '3d_poster', title: '城市游牧计划 都市探索海报', prompt: 'Urban nomad project 3D poster, a stylish young character sitting casually on colorful abstract organic shapes, city landmarks (Oriental Pearl Tower, modern buildings) in background. Travel icons, camera, passport, coffee cup floating around. Modern gradient background pink to purple, bold Chinese title "城市游牧计划", subtitle "URBAN NOMAD PROJECT". C4D 3D rendering, vibrant saturated colors.', imgId: 1074, tags: ['3D', '渐变', '商业'] },
    { subKey: '3d_poster', title: '团队协作 JOIN US 招聘海报', prompt: '3D recruitment poster with diverse team of 4-5 cute characters in dynamic collaborative poses, sitting on and around large colorful geometric blocks. Floating icons of code, design tools, charts. Bold "JOIN US" text in English with Chinese subtitle "加入我们". Corporate yet playful style, gradient background from deep blue to purple. C4D rendering, studio lighting.', imgId: 1027, tags: ['3D', '商业'] },
    { subKey: '3d_poster', title: '双十一购物狂欢节 促销海报', prompt: 'Double 11 shopping festival 3D promotional poster, explosion of gift boxes, shopping bags, gold coins, red envelopes, and confetti flying from a central burst. Large "11.11" text in metallic gold with red accents. Vibrant red and gold color scheme on dark background. Festive celebratory atmosphere, C4D 3D rendering, high detail, particle effects.', imgId: 1062, tags: ['3D', '节日', '商业'] },
    { subKey: '3d_poster', title: '音乐节 PLAY LIVE 活动宣传', prompt: 'Music festival 3D promotional poster "PLAY LIVE", featuring oversized speakers, vinyl records, musical notes, and headphones in neon colors. Energetic character DJing with crowd silhouettes. Dark background with colorful neon lighting effects (pink, cyan, yellow). Modern dynamic composition, C4D rendering with glow effects.', imgId: 1005, tags: ['3D', '霓虹', '暗色'] },

    // 运营 - KV海报
    { subKey: 'kv_poster', title: '年度盛典 品牌发布会主视觉', prompt: 'Annual ceremony brand event KV key visual poster. Luxurious dark blue background with abstract golden light rays radiating from center. Elegant geometric patterns and subtle particle effects. Premium gold Chinese typography "年度盛典" with English subtitle. High-end corporate event feel, sophisticated color palette of navy blue, gold, and white.', imgId: 1011, tags: ['商业', '暗色'] },
    { subKey: 'kv_poster', title: '新品发布 科技产品主视觉', prompt: 'Tech product launch KV visual, a floating smartphone/device surrounded by holographic UI elements and data visualization. Dark futuristic background with subtle grid pattern. Clean minimal composition with blue and purple accent lighting. Abstract light trails connecting features. Professional product photography style, 3D rendering.', imgId: 1024, tags: ['科技', '暗色', '极简'] },
    { subKey: 'kv_poster', title: '夏日清凉节 饮品促销KV', prompt: 'Summer refreshment festival KV poster for beverage promotion. Dynamic ice splash and water droplets surrounding colorful drinks. Fresh fruit slices (lemon, watermelon, berries) floating in crystal clear liquid. Cool blue and mint green color palette with warm sunlight accents. Photorealistic product rendering, high-speed photography style.', imgId: 1035, tags: ['商业', '写实', '亮色'] },
    { subKey: 'kv_poster', title: '春节年货大促 电商KV', prompt: 'Chinese New Year shopping festival e-commerce KV poster. Traditional red lanterns, firecrackers, gold ingots combined with modern shopping elements. Bold red and gold color scheme with festive patterns. Large promotional text with price tags and discount badges. Warm celebratory atmosphere, mix of traditional and modern design elements.', imgId: 1047, tags: ['节日', '商业', '3D'] },

    // 运营 - Banner
    { subKey: 'banner', title: '会员日专属福利 Banner', prompt: 'VIP membership day exclusive benefits banner, horizontal format 750x360px. Gradient purple to gold background with sparkle effects. Premium crown icon, gift box, and discount badge floating. Bold "会员日" text with gold accents. Modern clean layout with clear CTA button, luxurious feel.', imgId: 1019, tags: ['商业', '渐变'] },
    { subKey: 'banner', title: '新用户注册有礼 引导Banner', prompt: 'New user registration reward banner, welcoming design with confetti and gift elements. Bright orange and white color scheme. Cute mascot character waving, registration form icons, bonus coins floating. Clean modern layout with prominent register button. Friendly inviting atmosphere.', imgId: 1039, tags: ['商业', '亮色', '可爱'] },

    // 运营 - 活动页
    { subKey: 'activity_page', title: '年终回顾 数据报告H5', prompt: 'Year-end review personal data report H5 page design, showing user statistics in beautiful data visualization. Dark gradient background with colorful charts (journey map, usage stats, top categories). Milestone achievements with animated confetti. Emotional storytelling flow, modern card-based layout, shareable format.', imgId: 292, tags: ['科技', '暗色', '渐变'] },
    { subKey: 'activity_page', title: '抽奖转盘 互动活动页', prompt: 'Lucky draw wheel interactive activity page, colorful spinning wheel with prize segments. Bright festive background with floating prizes (phone, coupon, gift card). Animated sparkle effects around wheel. Red and gold lottery theme with "立即抽奖" button. Playful energetic design, mobile-first layout.', imgId: 180, tags: ['节日', '商业', '亮色'] },

    // APP - App图标
    { subKey: 'app_icon', title: '社交应用图标 渐变气泡风格', prompt: 'App icon design for social media messaging app. Rounded square shape (iOS style). Two overlapping speech bubble shapes in gradient from vibrant purple (#8B5CF6) to hot pink (#EC4899). Subtle 3D depth with soft shadow. Clean minimal design on white background, 1024x1024 icon grid.', imgId: 1069, tags: ['渐变', '极简'] },
    { subKey: 'app_icon', title: '音乐应用图标 声波可视化', prompt: 'Music app icon design, rounded square shape. Abstract sound wave visualization forming a circular pattern. Gradient from deep purple to electric blue. Sleek dark background within the icon. Subtle glow effect on wave peaks. Modern minimal style, 1024x1024 pixel grid.', imgId: 1036, tags: ['渐变', '暗色', '极简'] },
    { subKey: 'app_icon', title: '健身应用图标 能量环设计', prompt: 'Fitness tracking app icon, rounded square. Three concentric energy rings in red, green, and blue (inspired by activity rings). Dynamic motion effect on rings. Dark background, subtle gradient glow. Clean sporty design. 1024x1024 icon specification.', imgId: 1048, tags: ['极简', '暗色'] },
    { subKey: 'app_icon', title: '理财应用图标 金币堆叠', prompt: 'Finance app icon design, rounded square shape. Stylized gold coin stack with subtle growth chart arrow pointing up. Rich gold to amber gradient on dark green background. Premium professional feel with metallic textures. Minimal clean composition, 1024x1024 grid.', imgId: 15, tags: ['商业', '极简'] },
    { subKey: 'app_icon', title: '相机应用图标 镜头光圈', prompt: 'Camera app icon, rounded square. Stylized camera lens aperture blades forming a circular pattern. Rainbow gradient spectrum colors on each blade segment. Sleek metallic silver ring border. Dark background, photorealistic material rendering. 1024x1024 specification.', imgId: 1052, tags: ['渐变', '写实'] },

    // APP - 空状态
    { subKey: 'empty_state', title: '无网络连接 空状态插画', prompt: 'Empty state illustration for "no internet connection". Cute unplugged cable character with sad expression, looking at disconnected Wi-Fi symbol. Soft pastel blue and grey color palette. Minimal flat illustration with slight 3D shadows. Centered composition on white background. 800x600px, friendly approachable style.', imgId: 326, tags: ['扁平', '可爱'] },
    { subKey: 'empty_state', title: '搜索无结果 空状态插画', prompt: 'Empty state illustration for "no search results found". Magnifying glass character with confused expression looking at empty space. Scattered faded document icons around. Soft muted purple and grey colors on light background. Flat design with subtle depth. Encouraging mood, 800x600px.', imgId: 1004, tags: ['扁平', '可爱', '极简'] },
    { subKey: 'empty_state', title: '购物车为空 可爱插画', prompt: 'Empty shopping cart illustration. A lonely shopping cart with cute googly eyes looking sad, with small sparkles suggesting emptiness. A few product silhouettes floating away like ghosts. Warm inviting pastel colors (soft orange, cream). Flat illustration style with rounded shapes, 800x600px.', imgId: 274, tags: ['扁平', '可爱'] },
    { subKey: 'empty_state', title: '收藏夹为空 星标插画', prompt: 'Empty favorites/bookmarks illustration. A large hollow star outline as central character, surrounded by tiny sparkles and hearts. Gentle pastel purple and gold color scheme. Soft rounded illustration style. Encouraging atmosphere suggesting "add your first favorite". 800x600px, minimal clean.', imgId: 106, tags: ['扁平', '可爱', '极简'] },

    // APP - 金刚区图标
    { subKey: 'jingang_icon', title: '外卖餐饮 金刚区图标套装', prompt: 'Set of 8 food delivery app navigation icons in consistent 3D clay style. Items: pizza slice, coffee cup, salad bowl, burger, sushi, ice cream, noodles, fruit. Each on white circular background. Warm appetizing colors, soft rounded forms with subtle shadows. Uniform 120x120px grid, cohesive playful style.', imgId: 1056, tags: ['3D', '黏土', '可爱'] },
    { subKey: 'jingang_icon', title: '生活服务 金刚区图标组', prompt: 'Set of 8 lifestyle service app navigation icons in 3D isometric style. Items: house cleaning (mop + sparkle), repair (wrench + hammer), pet care (paw + heart), delivery (package + truck), laundry (washing machine), grocery (shopping basket), beauty (lipstick + mirror), fitness (dumbbell). Colorful, consistent style, 120x120px each.', imgId: 1040, tags: ['3D', '可爱'] },
    { subKey: 'jingang_icon', title: '旅行出行 金刚区图标', prompt: 'Set of 8 travel category navigation icons in 3D rendered style. Items: airplane, hotel bed, train ticket, map pin, luggage, compass, camera, passport. Gradient blue and coral orange tones. Modern rounded style on circular white backgrounds, soft shadows. Consistent 120x120px grid.', imgId: 1055, tags: ['3D', '渐变'] },
    { subKey: 'jingang_icon', title: '金融理财 金刚区图标', prompt: 'Set of 8 finance app navigation icons in clean 3D style. Items: wallet, growth chart, gold coins, piggy bank, credit card, calculator, safe box, stock ticker. Professional gold and emerald green gradient palette. Premium minimal rendering, each on circular background, 120x120px grid.', imgId: 175, tags: ['3D', '商业', '极简'] },

    // APP - 引导页
    { subKey: 'onboarding', title: '社交APP引导页 连接世界', prompt: 'Onboarding illustration for social app, page 1 of 3: "Connect with the world". Globe made of connected avatar dots, colorful lines between people. Diverse characters waving from different positions. Vibrant purple and blue gradient background. Modern flat illustration, mobile screen proportion 375x667px.', imgId: 1043, tags: ['扁平', '渐变'] },
    { subKey: 'onboarding', title: '健身APP引导页 开始训练', prompt: 'Fitness app onboarding illustration "Start your journey". Energetic character in workout pose with abstract energy rings around them. Heart rate line, step counter, and achievement badges floating. Motivating green and teal color scheme. Dynamic composition, modern flat style, mobile screen 375x667px.', imgId: 1057, tags: ['扁平', '亮色'] },

    // APP - 闪屏页
    { subKey: 'splash_screen', title: '春节主题闪屏 福到万家', prompt: 'Chinese New Year themed splash screen for app. Traditional red background with modern gold geometric patterns. Central "福" character in creative calligraphic style surrounded by plum blossoms, lanterns, and auspicious clouds. Bottom app logo. Festive yet elegant, mobile screen proportion.', imgId: 1070, tags: ['节日', '暗色'] },
    { subKey: 'splash_screen', title: '周年庆闪屏 感恩有你', prompt: 'App anniversary celebration splash screen. Confetti and ribbon explosion from center. Large "3" or anniversary number in 3D metallic gold. "感恩有你" thank you message. Purple to pink gradient background with sparkle particles. Celebratory mood, premium feel, mobile screen proportion.', imgId: 1058, tags: ['节日', '渐变', '3D'] },

    // 海报 - 拼贴海报
    { subKey: 'collage', title: '复古拼贴 音乐节海报', prompt: 'Retro collage style music festival poster. Mixed media composition with torn vintage newspaper clippings, old concert ticket stubs, analog film photographs of musicians, hand-drawn doodles, postal stamps, and masking tape elements layered together. Warm analog colors (sepia, faded red, mustard yellow) on textured kraft paper background. Bold display typography mixed with handwritten notes. A4 portrait format.', imgId: 431, tags: ['复古', '拼贴', '手绘'] },
    { subKey: 'collage', title: '时尚杂志风 拼贴排版', prompt: 'Fashion editorial collage poster in high-fashion magazine style. Cut-out fashion photography of models mixed with geometric color blocks (hot pink, black, white). Overlapping elements: fashion sketches, fabric swatches, typography fragments. High contrast black and white photos with selective color pops. Avant-garde layout, A4 portrait.', imgId: 1006, tags: ['拼贴', '极简'] },
    { subKey: 'collage', title: '旅行记忆 拼贴风格海报', prompt: 'Travel memories collage poster. Layered postcards from different cities, polaroid photos with handwritten dates, boarding passes, vintage maps, stamp collections, pressed flowers, and washi tape decorations. Warm nostalgic color palette (cream, sage green, dusty rose). Scrapbook aesthetic on linen texture background. A4 portrait.', imgId: 1080, tags: ['复古', '拼贴', '手绘'] },
    { subKey: 'collage', title: '艺术展览 混合媒介拼贴', prompt: 'Art exhibition mixed media collage poster. Abstract expressionist paint strokes in bold colors overlapping with newspaper clippings, vintage anatomical illustrations, and geometric shapes. Deconstructed typography spelling exhibition details. Cream paper background with ink splatters and charcoal marks. Contemporary art gallery aesthetic.', imgId: 1074, tags: ['拼贴', '抽象'] },
    { subKey: 'collage', title: '复古胶片 摄影展拼贴海报', prompt: 'Vintage film photography exhibition collage poster. Overlapping 35mm film strips, contact sheets with red grease pencil marks, darkroom prints with white borders. Red safelight tones mixed with black and white images. Film sprocket holes as decorative elements. Authentic analog darkroom texture and grain throughout.', imgId: 1027, tags: ['复古', '拼贴', '暗色'] },

    // 海报 - 渐变艺术
    { subKey: 'gradient_art', title: '流体渐变 抽象艺术海报', prompt: 'Abstract fluid gradient art poster. Smooth organic flowing shapes transitioning from deep purple through magenta to soft pink, with accent strokes of electric blue. Ethereal misty atmosphere with subtle noise texture. Bold modern sans-serif title in white, centered. Clean edge-to-edge composition, A3 format, suitable for gallery printing.', imgId: 1062, tags: ['渐变', '抽象'] },
    { subKey: 'gradient_art', title: '极光渐变 北欧风格海报', prompt: 'Northern lights aurora gradient poster in Scandinavian design style. Vertical flowing curtains of color: emerald green, teal, violet purple, transitioning smoothly. Dark navy sky background with tiny star points. Minimalist composition with single line of elegant serif text at bottom. Calm meditative mood, A2 poster format.', imgId: 1005, tags: ['渐变', '极简', '暗色'] },
    { subKey: 'gradient_art', title: '日落渐变 冥想主题海报', prompt: 'Sunset meditation gradient poster. Warm color transition from deep burnt orange at top through coral, pink, to soft lavender at bottom. Silhouette of distant mountain range at lower third. Single figure in lotus pose, tiny scale. Minimal text "breathe" in thin sans-serif. Peaceful zen atmosphere, large format print.', imgId: 1011, tags: ['渐变', '极简'] },
    { subKey: 'gradient_art', title: '霓虹渐变 夜店活动海报', prompt: 'Neon gradient nightclub event poster. Electric hot pink transitioning to cyan/turquoise with streaks of yellow. Geometric light beams and lens flares cutting across. Chrome metallic 3D text for event name. Dark black background visible at edges. Futuristic clubbing aesthetic with visible noise/grain texture.', imgId: 1024, tags: ['渐变', '霓虹', '暗色'] },
    { subKey: 'gradient_art', title: '水彩渐变 文艺展览海报', prompt: 'Watercolor gradient art exhibition poster. Soft bleeding wet-on-wet watercolor transitions: dusty rose to sage green to soft gold. Natural pigment flow patterns and paper fiber texture visible. Elegant thin serif title and event details. Uncoated art paper texture, delicate botanical sketch overlay. Ethereal feminine aesthetic.', imgId: 1035, tags: ['渐变', '手绘', '亮色'] },

    // 海报 - 科技海报
    { subKey: 'tech_poster', title: 'AI人工智能 科技发布会海报', prompt: 'AI technology conference poster. Central neural network brain visualization with glowing nodes and connections. Deep dark blue background with subtle circuit board pattern. Holographic data streams and floating code fragments. Clean white typography "AI SUMMIT 2025" with thin accent lines. Professional tech event aesthetic, futuristic and clean.', imgId: 1047, tags: ['科技', '暗色'] },
    { subKey: 'tech_poster', title: '区块链大会 科技海报', prompt: 'Blockchain technology conference poster. Network of connected hexagonal nodes forming a chain structure, glowing edges. Dark background with deep blue to purple gradient. Gold accent on key nodes representing blocks. Abstract digital particle effects. Bold geometric sans-serif title. Professional enterprise tech event style.', imgId: 292, tags: ['科技', '暗色', '抽象'] },
    { subKey: 'tech_poster', title: '元宇宙 虚拟现实海报', prompt: 'Metaverse VR technology poster. Person wearing sleek VR headset, their physical form dissolving into colorful digital pixels and data particles. Split composition: real world (muted colors) on left, virtual world (vibrant neon colors) on right. Cyberpunk color palette (magenta, cyan, purple). Futuristic grid landscape in background.', imgId: 180, tags: ['科技', '霓虹', '概念'] },
    { subKey: 'tech_poster', title: '量子计算 学术会议海报', prompt: 'Quantum computing academic conference poster. Abstract visualization of quantum bits (qubits) as glowing spheres in superposition states, connected by entanglement lines. Deep space background with mathematical equations and Bloch sphere diagrams floating subtly. Scientific elegant design, muted blue and white palette with gold accents. Clean academic typography.', imgId: 1069, tags: ['科技', '暗色', '抽象'] },

    // 海报 - 电影海报
    { subKey: 'movie_poster', title: '科幻电影 太空歌剧海报', prompt: 'Epic sci-fi space opera movie poster. Massive detailed spaceship fleet in formation against colorful nebula backdrop. Dramatic volumetric lighting from a bright star. Hero characters in foreground at smaller scale looking up. Cinematic composition with bold sans-serif title at top. Blue, orange, and purple color scheme. Photorealistic digital painting style.', imgId: 1036, tags: ['概念', '暗色', '写实'] },
    { subKey: 'movie_poster', title: '悬疑惊悚 暗色调电影海报', prompt: 'Mystery thriller movie poster, dark moody noir style. Lone silhouette figure standing in a foggy narrow alley, single overhead light creating dramatic shadows. High contrast chiaroscuro lighting. Distressed grunge texture overlay. Deep shadows, desaturated teal and orange color grading. Suspenseful atmosphere, hand-painted quality.', imgId: 1048, tags: ['暗色', '概念'] },
    { subKey: 'movie_poster', title: '爱情电影 双人构图海报', prompt: 'Romantic drama movie poster with two characters composition. Man and woman facing each other in profile, city skyline visible in the negative space between them. Warm golden hour backlighting creating rim light on their silhouettes. Soft bokeh city lights in background. Elegant script font for title. Warm amber and deep blue color palette.', imgId: 15, tags: ['写实', '概念'] },
    { subKey: 'movie_poster', title: '动作电影 爆炸场景海报', prompt: 'Action blockbuster movie poster. Hero character walking confidently toward camera away from massive explosion behind them. Orange fire and debris flying. Dramatic Dutch angle composition. Teal and orange cinematic color grading. Motion blur on flying particles. Impact font title with metallic texture. Wide scope cinematic ratio.', imgId: 1052, tags: ['写实', '暗色'] },
    { subKey: 'movie_poster', title: '动画电影 奇幻世界海报', prompt: 'Animated fantasy adventure movie poster. Enchanted floating islands connected by rainbow bridges, with waterfalls cascading into clouds below. Cute diverse group of characters on foreground island looking out at the magical world. Vibrant painterly style with visible brush strokes. Warm saturated colors, whimsical atmosphere.', imgId: 326, tags: ['概念', '可爱', '亮色'] },

    // 海报 - 艺术海报
    { subKey: 'art_poster', title: '抽象几何构成 艺术海报', prompt: 'Abstract geometric composition art poster. Bold shapes - circles, triangles, rectangles - overlapping with transparency effects. Limited color palette of deep navy, burnt orange, and cream. Bauhaus-inspired typography integrated into the composition. Textured paper background with subtle grain. Museum exhibition quality.', imgId: 1004, tags: ['抽象', '几何', '极简'] },
    { subKey: 'art_poster', title: '水墨意境 东方美学海报', prompt: 'Chinese ink wash painting style art poster. Flowing black ink creating mountain landscape with negative space. Single red seal stamp accent. Elegant calligraphy text integration. Rice paper texture background. Meditative peaceful mood. Traditional meets contemporary design.', imgId: 274, tags: ['水墨', '东方', '意境'] },
    { subKey: 'art_poster', title: '超现实主义 梦境海报', prompt: 'Surrealist dreamscape art poster. Melting clocks, floating objects, impossible architecture. Inspired by Dali and Magritte. Muted earth tones with pops of vivid color. Photorealistic rendering of impossible scenes. Exhibition announcement layout with elegant serif typography.', imgId: 106, tags: ['超现实', '梦幻', '艺术'] },
    { subKey: 'art_poster', title: '波普艺术 复古海报', prompt: 'Pop art retro poster design. Bold Ben-Day dots pattern, comic book style speech bubbles. Bright primary colors - red, yellow, blue on white. Andy Warhol inspired repetition. Screen print texture effect. Ironic commercial aesthetic with gallery art sensibility.', imgId: 1056, tags: ['波普', '复古', '大胆'] },
    { subKey: 'art_poster', title: '极简线条 艺术展海报', prompt: 'Minimalist line art exhibition poster. Single continuous line drawing of a face or figure. Thin elegant stroke on vast white space. Small refined typography at bottom. Gallery-quality composition with mathematical precision. Sophisticated and contemplative mood.', imgId: 1040, tags: ['极简', '线条', '优雅'] },

    // 插画 - 多巴胺
    { subKey: 'dopamine', title: '多巴胺配色 快乐购物场景', prompt: 'Dopamine color palette shopping scene illustration. Extremely vibrant saturated colors everywhere. Happy character with exaggerated smile surrounded by colorful shopping bags, gift boxes, and confetti. Bold pop art style with playful polka dot and stripe patterns. Electric pink, lime green, bright orange, vivid purple palette. Maximum joy and energy.', imgId: 1055, tags: ['多巴胺', '购物', '活力'] },
    { subKey: 'dopamine', title: '多巴胺风格 夏日水果派对', prompt: 'Dopamine style summer fruit party illustration. Oversized fruits in electric neon colors - hot pink watermelon, acid yellow lemon, electric blue blueberries. Tiny characters dancing and celebrating among the giant fruits. Maximalist composition with no empty space. Confetti, sparkles, and rainbow gradients everywhere.', imgId: 175, tags: ['多巴胺', '夏日', '水果'] },
    { subKey: 'dopamine', title: '多巴胺 办公室活力场景', prompt: 'Dopamine-style office illustration with maximum color saturation. Neon colored desks, rainbow computers, characters in colorful outfits doing energetic poses. Bold geometric patterns on walls and floors. Every surface a different bright color. Flat graphic style with thick outlines. Energetic and impossibly cheerful workplace.', imgId: 1043, tags: ['多巴胺', '办公', '能量'] },
    { subKey: 'dopamine', title: '多巴胺配色 音乐节现场', prompt: 'Dopamine music festival illustration at maximum saturation. Crowd of colorful characters dancing with arms raised. Giant speakers emitting visible rainbow sound waves. Stage with neon lights in every color. Confetti explosions, glow sticks, laser beams. Every element competing for attention with vibrant clashing colors.', imgId: 1057, tags: ['多巴胺', '音乐', '派对'] },
    { subKey: 'dopamine', title: '多巴胺风格 美食探店', prompt: 'Dopamine style food exploration illustration. Oversized colorful dishes - neon pink ramen, electric blue sushi, lime green matcha dessert. Cute food character mascots with faces. Bold complementary color combinations on every element. Neon signs and colorful shop fronts. Flat graphic style with maximum chromatic intensity.', imgId: 1070, tags: ['多巴胺', '美食', '可爱'] },

    // 插画 - 黏土
    { subKey: 'clay', title: '黏土风格 可爱小动物系列', prompt: 'Clay style cute animal character series. Soft rounded 3D forms with visible fingerprint and tool mark textures. Warm pastel colors - soft pink, mint green, baby blue. Simple dot eyes and tiny smile. Studio photography lighting with soft shadows on cream background. Handmade polymer clay aesthetic.', imgId: 1058, tags: ['黏土', '动物', '可爱'] },
    { subKey: 'clay', title: '黏土质感 美食甜品插画', prompt: 'Clay texture dessert and pastry illustration. Handmade feel with soft rounded edges on every element. Colorful macaron tower, croissants, cupcakes with plasticine texture. Tiny chef character with white hat. Warm bakery lighting with soft shadows. Miniature diorama scene on wooden surface.', imgId: 431, tags: ['黏土', '甜品', '手工'] },
    { subKey: 'clay', title: '黏土风格 城市微缩景观', prompt: 'Clay style miniature city landscape diorama. Soft rounded buildings in pastel colors, tiny trees made of green clay balls. Small cars and characters on streets. Tilt-shift perspective making everything look tiny. Handmade texture visible on all surfaces. Gentle warm lighting, cozy mood.', imgId: 1006, tags: ['黏土', '城市', '微缩'] },
    { subKey: 'clay', title: '黏土质感 节日庆祝场景', prompt: 'Clay textured festival celebration scene. Cute round characters in party hats around a birthday cake. Balloons, presents, and bunting all with plasticine texture. Fingerprint marks visible on smooth surfaces. Warm studio lighting, soft pastel palette. Handcrafted miniature party diorama.', imgId: 1074, tags: ['黏土', '节日', '欢乐'] },
    { subKey: 'clay', title: '黏土风格 太空探险', prompt: 'Clay style space adventure scene. Cute rounded astronaut character with oversized helmet. Pastel colored planets with crater textures pressed by fingers. Rocket ship with visible seam lines. Stars as tiny white clay dots. Soft cosmic purple and blue background. Handmade miniature universe feeling.', imgId: 1027, tags: ['黏土', '太空', '探险'] },

    // 插画 - 夸张
    { subKey: 'exaggerated', title: '夸张比例 巨型美食插画', prompt: 'Exaggerated proportion giant food illustration. Tiny human character standing next to an enormously oversized hamburger that fills the entire frame. Every ingredient layer visible and detailed - sesame bun, lettuce, tomato, cheese melting. Dramatic scale contrast creating humorous effect. Warm appetizing color palette.', imgId: 64, tags: ['夸张', '美食', '趣味'] },
    { subKey: 'exaggerated', title: '夸张表情 搞笑人物', prompt: 'Exaggerated expression funny character illustration. Extremely stretched and distorted facial features showing intense surprise - eyes popping out, jaw dropping impossibly low. Bold thick black outlines. Vibrant flat colors with halftone texture. Comic book inspired dynamic composition with speed lines.', imgId: 1062, tags: ['夸张', '表情', '搞笑'] },
    { subKey: 'exaggerated', title: '夸张透视 超广角城市', prompt: 'Exaggerated perspective ultra-wide-angle city illustration. Buildings stretching and curving dramatically toward the viewer. Extreme fisheye lens distortion bending the entire scene. Dramatic depth with tiny distant elements and huge foreground. Dynamic diagonal compositions. Bold graphic color blocking.', imgId: 1005, tags: ['夸张', '透视', '城市'] },
    { subKey: 'exaggerated', title: '夸张动态 运动人物', prompt: 'Exaggerated dynamic sports character in impossible pose. Extremely elongated rubber-like limbs stretched in running motion. Multiple speed lines and motion blur ghosts showing movement path. Bold flat graphic style. High contrast complementary colors. Energetic powerful superhuman athletics.', imgId: 1011, tags: ['夸张', '运动', '动感'] },

    // IP - 卡通IP
    { subKey: 'cartoon_ip', title: '萌宠IP 猫咪角色设计', prompt: 'Cute cat IP character design sheet. Round body proportions with large head, tiny body. Big sparkly expressive eyes, small pink nose. Multiple poses: waving, sleeping, surprised, happy, angry. Soft pastel color scheme - white body with pink accents. Professional mascot turnaround and expression sheet.', imgId: 1024, tags: ['IP', '猫咪', '萌'] },
    { subKey: 'cartoon_ip', title: '美食IP 拟人化甜甜圈', prompt: 'Food IP character design - anthropomorphized donut mascot. Cute round face with sprinkle freckles on pink glaze. Small stubby arms and legs. Character sheet showing: happy, eating, running, sleeping, winking expressions. Cheerful personality, warm color palette. Professional brand mascot design.', imgId: 1035, tags: ['IP', '美食', '拟人'] },
    { subKey: 'cartoon_ip', title: '科技IP 机器人助手', prompt: 'Tech company IP robot assistant character. Friendly rounded white body design with soft blue LED eyes. Floating hovering pose. Character sheet: waving hello, thinking, thumbs up, confused, celebrating. Approachable and helpful personality. Clean modern design suitable for app interface.', imgId: 1047, tags: ['IP', '科技', '机器人'] },
    { subKey: 'cartoon_ip', title: '运动IP 活力兔子形象', prompt: 'Sports brand IP energetic rabbit character. Athletic lean build with cute oversized ears. Wearing sporty headband and sneakers. Dynamic action poses: running, jumping, stretching, victory pose. Vibrant orange and white color scheme. Professional sports mascot character sheet with guidelines.', imgId: 1019, tags: ['IP', '运动', '兔子'] },
    { subKey: 'cartoon_ip', title: '节日IP 新年锦鲤', prompt: 'Chinese New Year festival IP koi fish character. Traditional lucky red and gold colors. Cute proportions with big friendly eyes. Wearing tiny festive hat. Multiple poses: swimming, jumping through gate, holding hongbao, waving. Auspicious cloud patterns. Cultural mascot design sheet with color specifications.', imgId: 1039, tags: ['IP', '节日', '锦鲤'] },
];

// Insert items into database
function initDatabase() {
    const insertItemMany = db.transaction((items) => {
        for (const item of items) {
            const subRow = getSubcategoryId.get(item.subKey);
            if (!subRow) continue;

            const imgUrl = `https://picsum.photos/id/${item.imgId}/800/1060`;
            const thumbUrl = `https://picsum.photos/id/${item.imgId}/400/530`;

            const result = insertItem.run(
                item.title,
                item.prompt,
                imgUrl,
                thumbUrl,
                subRow.id,
                0
            );

            // Insert tags for this item
            if (item.tags && result.changes > 0) {
                const itemId = result.lastInsertRowid;
                for (const tagName of item.tags) {
                    // Ensure tag exists
                    insertTag.run(tagName);
                    const tagRow = getTagId.get(tagName);
                    if (tagRow) {
                        insertItemTag.run(itemId, tagRow.id);
                    }
                }
            }
        }
    });

    insertItemMany(itemsData);
    console.log(`✓ ${itemsData.length} 条图片数据插入完成`);
}

initDatabase();

// Verify
const count = db.prepare('SELECT COUNT(*) as total FROM items').get();
console.log(`\n✅ 数据库初始化完成！`);
console.log(`   - 分类: ${db.prepare('SELECT COUNT(*) as c FROM categories').get().c} 个`);
console.log(`   - 子分类: ${db.prepare('SELECT COUNT(*) as c FROM subcategories').get().c} 个`);
console.log(`   - 图片条目: ${count.total} 条`);
console.log(`   - 标签: ${db.prepare('SELECT COUNT(*) as c FROM tags').get().c} 个`);
console.log(`\n数据库文件: ${dbPath}`);

db.close();
