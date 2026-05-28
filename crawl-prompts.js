/**
 * 从 Civitai 开源 API 爬取 AI 图片 Prompt 数据（V3 - 严格过滤版）
 * 
 * 核心策略：
 * 1. 大量获取数据（按 Most Reactions / Newest / Most Comments 多维度）
 * 2. 严格的 Prompt 内容后置过滤（每个子分类定义 mustMatchStrict，至少命中2个关键词）
 * 3. 游标分页，每个子分类目标 200 条真正匹配的数据
 */

const Database = require('better-sqlite3');
const path = require('path');
const https = require('https');

const dbPath = path.join(__dirname, 'prompthub.db');

// ============ 分类配置 ============
// searchTerms: 用于 Civitai API 的搜索词（尽量触发相关结果）
// mustMatchAny: prompt 必须包含至少一个关键词
// mustMatchCount: 需要命中的最低关键词数量（默认1）
// bonusTerms: 额外加分词，命中越多排序越靠前

const CRAWL_CONFIG = {
  categories: [
    {
      key: 'operation',
      name: '运营',
      subcategories: [
        {
          key: 'c4d_poster',
          name: 'C4D海报',
          searchTerms: ['3D render', 'C4D', 'octane render', 'blender render', '3D scene', 'isometric 3D', 'product render 3D', '3D illustration'],
          mustMatchAny: ['3d', 'c4d', 'render', 'blender', 'octane', 'cinema 4d', 'isometric', 'vray', 'redshift', 'unreal engine', 'cycles', 'eevee', 'keyshot'],
          mustMatchCount: 1,
        },
        {
          key: 'kv_poster',
          name: 'KV海报',
          searchTerms: ['poster design', 'event poster', 'promotional banner', 'key visual', 'advertising design', 'brand campaign', 'festival poster', 'sale banner'],
          mustMatchAny: ['poster', 'banner', 'flyer', 'advertisement', 'promotional', 'campaign', 'event', 'festival', 'sale', 'layout', 'graphic design', 'typography'],
          mustMatchCount: 2,
        },
      ]
    },
    {
      key: 'app',
      name: 'APP',
      subcategories: [
        {
          key: 'app_icon',
          name: 'App图标',
          searchTerms: ['app icon', 'icon design', 'mobile icon', 'iOS icon', 'app logo', '3D icon', 'icon set', 'rounded icon'],
          mustMatchAny: ['icon', 'app', 'logo', 'rounded', 'ios', 'android', 'mobile', 'badge'],
          mustMatchCount: 2,
        },
        {
          key: 'kingkong_icon',
          name: '金刚区图标',
          searchTerms: ['icon set', 'mini icon', 'category icon', '3D icon cute', 'clay icon', 'tiny icon', 'flat icon', 'emoji icon'],
          mustMatchAny: ['icon', 'set', 'mini', 'tiny', 'small', 'emoji', 'sticker', 'badge', 'symbol'],
          mustMatchCount: 2,
        },
        {
          key: 'empty_state',
          name: '空状态',
          searchTerms: ['empty state', 'error illustration', '404 page', 'no data', 'cute illustration minimal', 'flat illustration simple', 'empty page', 'simple scene illustration'],
          mustMatchAny: ['empty', 'error', '404', 'no data', 'not found', 'blank', 'loading', 'offline', 'illustration', 'simple', 'minimal', 'flat'],
          mustMatchCount: 2,
        },
      ]
    },
    {
      key: 'poster',
      name: '海报',
      subcategories: [
        {
          key: 'collage',
          name: '拼贴海报',
          searchTerms: ['collage art', 'torn paper', 'mixed media collage', 'cut paper art', 'paper texture collage', 'retro collage', 'magazine collage', 'scrapbook'],
          mustMatchAny: ['collage', 'torn', 'ripped', 'cut paper', 'mixed media', 'paste', 'scrapbook', 'layered paper', 'montage', 'patchwork', 'composite', 'paper texture'],
          mustMatchCount: 1,
        },
        {
          key: 'gradient_art',
          name: '渐变艺术',
          searchTerms: ['gradient', 'fluid art', 'aurora', 'holographic', 'abstract gradient', 'mesh gradient', 'iridescent', 'chromatic'],
          mustMatchAny: ['gradient', 'fluid', 'aurora', 'holographic', 'iridescent', 'chromatic', 'spectrum', 'mesh', 'blend', 'ombre'],
          mustMatchCount: 1,
        },
        {
          key: 'tech_poster',
          name: '科技海报',
          searchTerms: ['technology', 'futuristic tech', 'cyberpunk city', 'digital network', 'AI artificial intelligence', 'circuit board', 'hacker', 'data visualization'],
          mustMatchAny: ['tech', 'technology', 'digital', 'cyber', 'futuristic', 'circuit', 'network', 'data', 'code', 'programming', 'algorithm', 'matrix', 'neon city', 'hologram'],
          mustMatchCount: 2,
        },
        {
          key: 'art_poster',
          name: '艺术海报',
          searchTerms: ['art poster', 'abstract art', 'fine art', 'contemporary art', 'gallery art', 'artistic composition', 'surrealist art', 'expressionism'],
          mustMatchAny: ['art', 'artistic', 'abstract', 'surreal', 'expressionism', 'impressionism', 'gallery', 'museum', 'exhibition', 'contemporary', 'fine art', 'painting', 'canvas'],
          mustMatchCount: 2,
        },
        {
          key: 'movie_poster',
          name: '电影海报',
          searchTerms: ['movie poster', 'film poster', 'cinematic scene', 'dramatic lighting scene', 'epic scene', 'action scene', 'thriller poster', 'sci-fi movie'],
          mustMatchAny: ['movie', 'film', 'cinema', 'cinematic', 'dramatic', 'epic', 'scene', 'thriller', 'action hero', 'director', 'screenplay', 'blockbuster'],
          mustMatchCount: 2,
        },
      ]
    },
    {
      key: 'illustration',
      name: '插画',
      subcategories: [
        {
          key: 'dopamine',
          name: '多巴胺',
          searchTerms: ['colorful vibrant', 'neon colors', 'saturated art', 'pop art colorful', 'bright illustration', 'candy colors', 'rainbow art', 'electric colors'],
          mustMatchAny: ['vibrant', 'colorful', 'bright', 'saturated', 'neon', 'bold color', 'pop art', 'candy', 'rainbow', 'electric', 'vivid', 'psychedelic', 'kaleidoscope'],
          mustMatchCount: 2,
        },
        {
          key: 'clay',
          name: '黏土',
          searchTerms: ['clay render', 'claymation', 'plasticine', '3D clay', 'polymer clay', 'clay figure', 'clay texture', 'soft clay'],
          mustMatchAny: ['clay', 'claymation', 'plasticine', 'polymer', 'dough', 'sculpt', 'putty', 'molding', 'handmade', 'ceramic'],
          mustMatchCount: 1,
        },
        {
          key: 'exaggerated',
          name: '夸张',
          searchTerms: ['caricature', 'exaggerated features', 'cartoon exaggerated', 'big head character', 'distorted proportion', 'oversized', 'surreal proportion', 'stretched'],
          mustMatchAny: ['exaggerat', 'caricature', 'oversiz', 'giant', 'tiny person', 'distort', 'stretch', 'big head', 'proportion', 'huge', 'miniature person'],
          mustMatchCount: 1,
        },
      ]
    },
    {
      key: 'ip',
      name: 'IP',
      subcategories: [
        {
          key: 'cartoon_ip',
          name: '卡通IP',
          searchTerms: ['cute mascot', 'character design', 'kawaii character', 'chibi', 'vinyl toy', 'mascot design', 'plush toy character', 'cartoon character 3D'],
          mustMatchAny: ['mascot', 'character', 'kawaii', 'chibi', 'plush', 'toy', 'vinyl', 'figure', 'avatar', 'cute creature', 'cartoon'],
          mustMatchCount: 2,
        },
      ]
    }
  ]
};

// ============ 工具函数 ============

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'PromptHub-Crawler/3.0' },
      timeout: 30000
    }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        fetchJSON(res.headers.location).then(resolve).catch(reject);
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`JSON parse error: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

/**
 * 检查 prompt 是否匹配关键词（返回匹配数量）
 */
function countMatches(prompt, keywords) {
  const lower = prompt.toLowerCase();
  let count = 0;
  for (const kw of keywords) {
    if (lower.includes(kw.toLowerCase())) count++;
  }
  return count;
}

/**
 * 游标分页爬取 + 严格过滤
 */
async function crawlSubcategory(sub, targetCount) {
  const results = [];
  const seenPrompts = new Set();
  const seenIds = new Set();

  // 多维度搜索：不同的搜索词 × 不同的排序方式
  const sortOptions = ['Most Reactions', 'Newest', 'Most Comments'];
  const requiredCount = sub.mustMatchCount || 1;

  for (const searchTerm of sub.searchTerms) {
    if (results.length >= targetCount) break;

    for (const sort of sortOptions) {
      if (results.length >= targetCount) break;

      let cursor = null;
      let pages = 0;
      const maxPages = 5; // 每个搜索词+排序组合最多5页

      while (results.length < targetCount && pages < maxPages) {
        let url = `https://civitai.com/api/v1/images?limit=100&nsfw=false&sort=${encodeURIComponent(sort)}&period=AllTime&query=${encodeURIComponent(searchTerm)}`;
        if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;

        try {
          const data = await fetchJSON(url);
          pages++;

          if (!data.items || data.items.length === 0) break;

          for (const raw of data.items) {
            if (results.length >= targetCount) break;

            const meta = raw.meta || {};
            const prompt = (meta.prompt || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

            if (!prompt || prompt.length < 20) continue;
            if (!raw.url) continue;

            // 严格关键词匹配
            const matchCount = countMatches(prompt, sub.mustMatchAny);
            if (matchCount < requiredCount) continue;

            // 去重
            const promptKey = prompt.slice(0, 80).toLowerCase();
            if (seenPrompts.has(promptKey)) continue;
            const sourceId = String(raw.id || '');
            if (seenIds.has(sourceId)) continue;

            seenPrompts.add(promptKey);
            seenIds.add(sourceId);

            // 生成标题
            let title = prompt.slice(0, 80);
            title = title.replace(/^(score_\d+,?\s*(score_\d+_up,?\s*)*)/i, '').trim();
            const commaIdx = title.lastIndexOf(',');
            if (commaIdx > 25) title = title.slice(0, commaIdx);
            title = title.trim().replace(/,\s*$/, '');
            if (!title || title.length < 5) {
              const parts = prompt.split(',').filter(p => p.trim().length > 5);
              title = parts.length > 2 ? parts.slice(1, 3).join(',').trim() : prompt.slice(0, 60);
            }

            results.push({
              title: title.slice(0, 100),
              prompt,
              image_url: raw.url,
              thumbnail_url: raw.url,
              source_id: sourceId,
              likes: (raw.stats?.likeCount || 0) + (raw.stats?.heartCount || 0),
              matchScore: matchCount, // 用于排序
            });
          }

          // 下一页
          if (data.metadata && data.metadata.nextCursor) {
            cursor = data.metadata.nextCursor;
          } else {
            break;
          }

          await sleep(600);
        } catch (err) {
          // 超时等错误，跳过这个组合
          break;
        }
      }

      await sleep(300);
    }
  }

  // 按匹配度排序，最相关的排前面
  results.sort((a, b) => b.matchScore - a.matchScore || b.likes - a.likes);
  return results.slice(0, targetCount);
}

// 智能标签提取
function extractTags(prompt) {
  const tags = new Set();
  const tagPatterns = [
    { pattern: /\b(anime|manga)\b/i, tag: '动漫' },
    { pattern: /\b(realistic|photorealistic|hyper.?realistic)\b/i, tag: '写实' },
    { pattern: /\b(3[dD]|C4D|blender|render)\b/i, tag: '3D' },
    { pattern: /\b(watercolor)\b/i, tag: '水彩' },
    { pattern: /\b(oil painting)\b/i, tag: '油画' },
    { pattern: /\b(flat design|flat illustration|flat style)\b/i, tag: '扁平' },
    { pattern: /\b(minimalist|minimal)\b/i, tag: '极简' },
    { pattern: /\b(cyberpunk)\b/i, tag: '赛博朋克' },
    { pattern: /\b(retro|vintage)\b/i, tag: '复古' },
    { pattern: /\b(futuristic|sci.?fi)\b/i, tag: '科幻' },
    { pattern: /\b(fantasy)\b/i, tag: '奇幻' },
    { pattern: /\b(abstract)\b/i, tag: '抽象' },
    { pattern: /\b(surreal)\b/i, tag: '超现实' },
    { pattern: /\b(pixel art)\b/i, tag: '像素' },
    { pattern: /\b(pop art)\b/i, tag: '波普' },
    { pattern: /\b(collage)\b/i, tag: '拼贴' },
    { pattern: /\b(isometric)\b/i, tag: '等距' },
    { pattern: /\b(claymation|clay|plasticine)\b/i, tag: '黏土' },
    { pattern: /\b(dark|moody|noir)\b/i, tag: '暗色' },
    { pattern: /\b(vibrant|colorful|bright|vivid)\b/i, tag: '亮色' },
    { pattern: /\b(pastel)\b/i, tag: '粉彩' },
    { pattern: /\b(neon|glow)\b/i, tag: '霓虹' },
    { pattern: /\b(gradient)\b/i, tag: '渐变' },
    { pattern: /\b(portrait)\b/i, tag: '肖像' },
    { pattern: /\b(landscape)\b/i, tag: '风景' },
    { pattern: /\b(architecture|building|city)\b/i, tag: '建筑' },
    { pattern: /\b(nature|forest|ocean|mountain)\b/i, tag: '自然' },
    { pattern: /\b(space|galaxy|cosmic)\b/i, tag: '太空' },
    { pattern: /\b(character|mascot)\b/i, tag: '角色' },
    { pattern: /\b(food|cuisine|dish)\b/i, tag: '美食' },
    { pattern: /\b(animal|creature|cat|dog)\b/i, tag: '动物' },
    { pattern: /\b(robot|mech|mechanical)\b/i, tag: '机械' },
    { pattern: /\b(cute|kawaii|adorable)\b/i, tag: '可爱' },
    { pattern: /\b(cinematic)\b/i, tag: '电影感' },
    { pattern: /\b(concept art)\b/i, tag: '概念艺术' },
    { pattern: /\b(poster)\b/i, tag: '海报' },
    { pattern: /\b(icon)\b/i, tag: '图标' },
    { pattern: /\b(illustration)\b/i, tag: '插画' },
  ];

  tagPatterns.forEach(({ pattern, tag }) => {
    if (pattern.test(prompt)) tags.add(tag);
  });

  return Array.from(tags).slice(0, 8);
}

// ============ 主爬取逻辑 ============

async function crawl() {
  const TARGET_PER_SUBCATEGORY = 200;

  console.log('🕷️  PromptHub 爬虫 V3 - 严格 Prompt 内容过滤');
  console.log('═'.repeat(60));
  console.log(`数据源: Civitai API`);
  console.log(`策略: 多维度搜索 × 严格 Prompt 关键词匹配`);
  console.log(`目标: 每子分类 ${TARGET_PER_SUBCATEGORY} 条`);
  console.log('═'.repeat(60) + '\n');

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  // 清空旧数据
  console.log('📦 清空旧数据...');
  db.exec(`
    DELETE FROM item_tags;
    DELETE FROM items;
    DELETE FROM tags;
    DELETE FROM subcategories;
    DELETE FROM categories;
  `);

  const insertCategory = db.prepare('INSERT INTO categories (key, name, sort_order) VALUES (?, ?, ?)');
  const insertSubcategory = db.prepare('INSERT INTO subcategories (key, name, category_id, sort_order) VALUES (?, ?, ?, ?)');
  const insertItem = db.prepare('INSERT INTO items (title, prompt, image_url, thumbnail_url, subcategory_id, sort_order, likes) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const insertTag = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)');
  const getTagId = db.prepare('SELECT id FROM tags WHERE name = ?');
  const insertItemTag = db.prepare('INSERT OR IGNORE INTO item_tags (item_id, tag_id) VALUES (?, ?)');

  let totalItems = 0;
  let catOrder = 0;

  for (const category of CRAWL_CONFIG.categories) {
    catOrder++;
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`📂 [${catOrder}/${CRAWL_CONFIG.categories.length}] ${category.name}`);
    console.log('═'.repeat(60));

    const catResult = insertCategory.run(category.key, category.name, catOrder);
    const categoryId = catResult.lastInsertRowid;

    let subOrder = 0;
    for (const sub of category.subcategories) {
      subOrder++;
      console.log(`\n   📁 ${sub.name} — 爬取中...`);

      const subResult = insertSubcategory.run(sub.key, sub.name, categoryId, subOrder);
      const subcategoryId = subResult.lastInsertRowid;

      const items = await crawlSubcategory(sub, TARGET_PER_SUBCATEGORY);

      // 批量写入
      let itemOrder = 0;
      for (const item of items) {
        itemOrder++;
        const itemResult = insertItem.run(
          item.title, item.prompt, item.image_url,
          item.thumbnail_url, subcategoryId, itemOrder, item.likes
        );
        const itemId = itemResult.lastInsertRowid;

        const tags = extractTags(item.prompt);
        for (const tagName of tags) {
          insertTag.run(tagName);
          const tagRow = getTagId.get(tagName);
          if (tagRow) insertItemTag.run(itemId, tagRow.id);
        }

        totalItems++;
      }

      console.log(`      ✅ ${sub.name}: ${items.length} 条 (目标 ${TARGET_PER_SUBCATEGORY})`);
    }
  }

  // 统计
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`📊 最终统计:`);
  const subStats = db.prepare(`
    SELECT c.name as cat_name, s.name as sub_name, COUNT(i.id) as item_count
    FROM categories c
    JOIN subcategories s ON s.category_id = c.id
    LEFT JOIN items i ON i.subcategory_id = s.id
    GROUP BY s.id
    ORDER BY c.sort_order, s.sort_order
  `).all();

  subStats.forEach(row => {
    const bar = '█'.repeat(Math.min(Math.floor(row.item_count / 5), 40));
    console.log(`   ${row.cat_name} > ${row.sub_name}: ${row.item_count} ${bar}`);
  });

  const stats = db.prepare('SELECT COUNT(*) as c FROM items').get();
  const tagCount = db.prepare('SELECT COUNT(*) as c FROM tags').get();

  console.log(`\n   总计: ${stats.c} 条 | 标签: ${tagCount.c} 个`);
  console.log(`   平均每子分类: ${Math.round(stats.c / subStats.length)} 条`);
  console.log('═'.repeat(60) + '\n');

  db.close();
}

crawl().catch(err => {
  console.error('❌ 爬取出错:', err);
  process.exit(1);
});
