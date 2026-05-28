/**
 * LibLib.art 爬虫 - 从国内 AI 图片社区抓取中文 prompt 数据
 * 
 * 策略：
 * 1. 通过 catdesk browser-action 在灵感页按分类收集图片 UUID 列表
 * 2. 通过 HTTP 直接请求详情页 HTML（SSR渲染），提取 prompt 和图片 URL
 * 3. 数据存入 SQLite 数据库
 */

const Database = require('better-sqlite3');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const dbPath = path.join(__dirname, 'prompthub.db');

// ============ 分类映射配置 ============
// 将 LibLib 的分类映射到我们的项目分类体系
const CATEGORY_MAP = {
  // 我们的分类 -> LibLib 的分类标签
  categories: [
    { key: 'operation', name: '运营', sort: 1 },
    { key: 'app', name: 'APP', sort: 2 },
    { key: 'poster', name: '海报', sort: 3 },
    { key: 'illustration', name: '插画', sort: 4 },
    { key: 'ip', name: 'IP', sort: 5 },
  ],
  subcategories: [
    // 运营类 - 从"电商营销"分类获取
    { key: '3d_poster', name: '3D海报', category: 'operation', sort: 1, liblibCategory: '电商营销', keywords: ['3D', 'C4D', '三维', '立体', '渲染', '建模'] },
    { key: 'kv_poster', name: 'KV海报', category: 'operation', sort: 2, liblibCategory: '电商营销', keywords: ['KV', '主视觉', '品牌', '发布会', '活动'] },
    { key: 'banner', name: 'Banner', category: 'operation', sort: 3, liblibCategory: '电商营销', keywords: ['banner', '横幅', '广告', '电商', '促销', '营销'] },
    { key: 'activity_page', name: '活动页', category: 'operation', sort: 4, liblibCategory: '电商营销', keywords: ['活动', '页面', 'H5', '营销', '专题'] },

    // APP类 - 从"平面设计"分类获取
    { key: 'app_icon', name: 'App图标', category: 'app', sort: 1, liblibCategory: '平面设计', keywords: ['图标', 'icon', 'logo', 'app', '应用'] },
    { key: 'empty_state', name: '空状态', category: 'app', sort: 2, liblibCategory: '风格插画', keywords: ['空状态', '缺省', '空白', '简约', '小场景'] },
    { key: 'jingang_icon', name: '金刚区图标', category: 'app', sort: 3, liblibCategory: '平面设计', keywords: ['金刚', '图标', '小图标', '功能', '导航'] },
    { key: 'onboarding', name: '引导页', category: 'app', sort: 4, liblibCategory: '风格插画', keywords: ['引导', '启动', '介绍', '欢迎'] },
    { key: 'splash_screen', name: '闪屏页', category: 'app', sort: 5, liblibCategory: '平面设计', keywords: ['闪屏', '启动', '开屏', '品牌'] },

    // 海报类 - 从多个分类获取
    { key: 'collage', name: '拼贴海报', category: 'poster', sort: 1, liblibCategory: '创意玩法', keywords: ['拼贴', '混搭', '剪纸', '杂志', '复古'] },
    { key: 'gradient_art', name: '渐变艺术', category: 'poster', sort: 2, liblibCategory: '平面设计', keywords: ['渐变', '流体', '色彩', '抽象', '光效'] },
    { key: 'tech_poster', name: '科技海报', category: 'poster', sort: 3, liblibCategory: '平面设计', keywords: ['科技', '未来', '数字', '赛博', '科幻', 'AI'] },
    { key: 'movie_poster', name: '电影海报', category: 'poster', sort: 4, liblibCategory: '摄影写真', keywords: ['电影', '影视', '剧照', '大片', '故事'] },
    { key: 'art_poster', name: '艺术海报', category: 'poster', sort: 5, liblibCategory: '创意玩法', keywords: ['艺术', '抽象', '超现实', '概念', '装置'] },
    { key: 'retro_poster', name: '复古海报', category: 'poster', sort: 6, liblibCategory: '创意玩法', keywords: ['复古', '怀旧', '年代', '老式', '经典'] },

    // 插画类 - 从"风格插画"分类获取
    { key: 'dopamine', name: '多巴胺', category: 'illustration', sort: 1, liblibCategory: '风格插画', keywords: ['多巴胺', '彩色', '鲜艳', '活力', '高饱和'] },
    { key: 'clay', name: '黏土', category: 'illustration', sort: 2, liblibCategory: '风格插画', keywords: ['黏土', '泥塑', '粘土', '陶瓷', '手工'] },
    { key: 'exaggerated', name: '夸张', category: 'illustration', sort: 3, liblibCategory: '风格插画', keywords: ['夸张', '变形', '漫画', '卡通', '有趣'] },
    { key: 'flat', name: '扁平', category: 'illustration', sort: 4, liblibCategory: '风格插画', keywords: ['扁平', '平面', '简约', '几何', '矢量'] },
    { key: 'isometric', name: '2.5D', category: 'illustration', sort: 5, liblibCategory: '风格插画', keywords: ['2.5D', '等距', '立体', '轴测', '等轴'] },

    // IP类 - 从"动漫游戏"和"文创周边"获取
    { key: 'cartoon_ip', name: '卡通IP', category: 'ip', sort: 1, liblibCategory: '文创周边', keywords: ['IP', '角色', '形象', '卡通', '吉祥物'] },
    { key: 'mascot', name: '吉祥物', category: 'ip', sort: 2, liblibCategory: '文创周边', keywords: ['吉祥物', '品牌', '企业', '可爱', '形象'] },
    { key: 'emoji', name: '表情包', category: 'ip', sort: 3, liblibCategory: '文创周边', keywords: ['表情', '贴纸', '可爱', '搞笑', '日常'] },
  ]
};

// LibLib 分类列表
const LIBLIB_CATEGORIES = ['电商营销', '风格插画', '平面设计', '创意玩法', '文创周边', '摄影写真', '动漫游戏'];

// ============ 工具函数 ============

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function browserAction(action) {
  const json = JSON.stringify(action);
  const cmd = `catdesk browser-action '${json.replace(/'/g, "'\\''")}'`;
  try {
    const result = execSync(cmd, { encoding: 'utf8', timeout: 30000 });
    return JSON.parse(result);
  } catch (e) {
    console.error('Browser action failed:', e.message.slice(0, 200));
    return null;
  }
}

function fetchHTML(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
      timeout: 15000
    }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        fetchHTML(res.headers.location).then(resolve).catch(reject);
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

/**
 * 从详情页 HTML 中提取 prompt 和图片信息
 */
function extractFromHTML(html) {
  const result = {
    prompt: '',
    imageUrl: '',
    model: '',
    resolution: '',
    likes: 0,
  };

  // 提取 prompt（提示词后面的文本内容）
  const promptMatch = html.match(/提示词<\/span><\/div><div[^>]*>([^<]+)/);
  if (promptMatch) {
    result.prompt = promptMatch[1].trim();
  }

  // 提取大图 URL（og:image 或第一张大图）
  const ogImage = html.match(/property="og:image"\s*content="([^"]+)"/);
  if (ogImage) {
    result.imageUrl = ogImage[1];
  } else {
    // 找 community-img 或 img 路径的大图
    const imgMatch = html.match(/(https:\/\/liblibai-online\.liblib\.cloud\/(?:community-img|img)\/[^?"]+)/);
    if (imgMatch) {
      result.imageUrl = imgMatch[1];
    }
  }

  // 提取模型名称
  const modelMatch = html.match(/模型信息<\/div>[\s\S]*?class="[^"]*truncate[^"]*"[^>]*>([^<]+)/);
  if (modelMatch) {
    result.model = modelMatch[1].trim();
  }

  // 提取分辨率
  const resMatch = html.match(/(\d{3,4})\s*[x×]\s*(\d{3,4})/);
  if (resMatch) {
    result.resolution = `${resMatch[1]}x${resMatch[2]}`;
  }

  // 提取点赞数
  const likeMatch = html.match(/(\d+)\s*<\/span>\s*<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<div[^>]*class="[^"]*ImagesDetail/);
  if (!likeMatch) {
    // 尝试从其他位置获取
    const altLikeMatch = html.match(/"likeCount"\s*:\s*(\d+)/);
    if (altLikeMatch) result.likes = parseInt(altLikeMatch[1]);
  } else {
    result.likes = parseInt(likeMatch[1]);
  }

  return result;
}

/**
 * 通过浏览器收集特定分类的图片UUID列表
 */
async function collectUUIDs(categoryName, targetCount = 60) {
  console.log(`   📸 收集 "${categoryName}" 分类的图片...`);
  
  // 点击分类按钮 - 使用 getbytext 语义定位器
  let result = browserAction({ action: 'getbytext', text: categoryName, subaction: 'click' });
  
  if (!result || !result.success) {
    // 备用方案：通过 evaluate 点击
    const clickScript = '(function(){var bs=document.querySelectorAll("button");var b=Array.from(bs).find(function(x){return x.textContent.trim()==="' + categoryName + '"});if(b){b.click();return "ok"}return "nf"})()';
    result = browserAction({ action: 'evaluate', script: clickScript });
  }
  
  await sleep(3000);

  // 收集图片 UUID，通过滚动加载更多
  const allUUIDs = new Set();
  let scrollCount = 0;
  const maxScrolls = 12;

  while (allUUIDs.size < targetCount && scrollCount < maxScrolls) {
    // 提取当前可见的图片链接
    const extractScript = '(function(){var ls=document.querySelectorAll("a[href*=imageinfo]");return JSON.stringify(Array.from(ls).map(function(a){var m=a.href.match(/imageinfo\\/([a-f0-9]+)/);return m?m[1]:null}).filter(Boolean))})()';

    result = browserAction({ action: 'evaluate', script: extractScript });
    if (result && result.data && result.data.result) {
      try {
        const uuids = JSON.parse(result.data.result);
        uuids.forEach(uuid => allUUIDs.add(uuid));
      } catch (e) {}
    }

    if (allUUIDs.size >= targetCount) break;

    // 滚动加载更多
    browserAction([
      { action: 'scroll', direction: 'down', amount: 1500 },
      { action: 'wait', timeout: 2500 }
    ]);
    scrollCount++;
  }

  console.log(`   ✅ 收集到 ${allUUIDs.size} 个图片 UUID`);
  return Array.from(allUUIDs);
}

/**
 * 批量获取图片详情
 */
async function fetchDetails(uuids, concurrency = 3) {
  const results = [];
  
  for (let i = 0; i < uuids.length; i += concurrency) {
    const batch = uuids.slice(i, i + concurrency);
    const promises = batch.map(async (uuid) => {
      try {
        const html = await fetchHTML(`https://www.liblib.art/imageinfo/${uuid}`);
        const data = extractFromHTML(html);
        if (data.prompt && data.imageUrl) {
          return { uuid, ...data };
        }
      } catch (e) {
        // 跳过失败的请求
      }
      return null;
    });

    const batchResults = await Promise.all(promises);
    batchResults.filter(Boolean).forEach(r => results.push(r));
    
    // 控制请求频率
    if (i + concurrency < uuids.length) {
      await sleep(500);
    }
  }

  return results;
}

/**
 * 根据关键词匹配，将图片分配到子分类
 */
function matchSubcategory(item, subcategories) {
  let bestMatch = null;
  let bestScore = 0;

  for (const sub of subcategories) {
    let score = 0;
    const text = (item.prompt + ' ' + (item.model || '')).toLowerCase();
    
    for (const kw of sub.keywords) {
      if (text.includes(kw.toLowerCase())) {
        score++;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = sub;
    }
  }

  return bestMatch;
}

// ============ 主逻辑 ============

async function main() {
  console.log('🕷️  LibLib.art 爬虫 - 中文 AI 图片数据');
  console.log('═'.repeat(60));
  console.log(`数据源: LibLib.art (哩布哩布AI)`);
  console.log(`策略: 浏览器按分类收集 + HTTP详情页提取`);
  console.log('═'.repeat(60) + '\n');

  // 确保浏览器在灵感页
  console.log('🌐 导航到灵感页面...');
  browserAction({ action: 'navigate', url: 'https://www.liblib.art/', waitUntil: 'load' });
  await sleep(5000);

  // 用客户端路由导航到灵感页
  browserAction({ action: 'evaluate', script: 'window.location.href = "/inspiration"' });
  await sleep(5000);

  // 检查是否跳转到了 /inspiration
  const urlResult = browserAction({ action: 'url' });
  console.log('   当前URL:', urlResult?.data?.url || 'unknown');
  
  // 确认页面有内容
  const checkResult = browserAction({ action: 'evaluate', script: '(function(){ return document.querySelectorAll("a[href*=imageinfo]").length; })()' });
  console.log('   页面图片数:', checkResult?.data?.result || 0);

  // 按 LibLib 分类收集图片
  const allImages = {}; // liblibCategory -> [items]
  
  for (const libCat of LIBLIB_CATEGORIES) {
    console.log(`\n📂 收集分类: ${libCat}`);
    const uuids = await collectUUIDs(libCat, 80);
    
    if (uuids.length === 0) {
      console.log(`   ⚠️ 未收集到图片，跳过`);
      continue;
    }

    console.log(`   🔍 获取详情数据 (${uuids.length} 个)...`);
    const details = await fetchDetails(uuids);
    allImages[libCat] = details;
    console.log(`   ✅ 成功获取 ${details.length} 条有效数据`);
    
    // 回到顶部准备下一个分类
    browserAction([
      { action: 'scroll', direction: 'up', amount: 50000 },
      { action: 'wait', timeout: 1000 }
    ]);
  }

  // ============ 写入数据库 ============
  console.log('\n\n📦 写入数据库...');
  
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  // 清空旧数据
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

  // 插入分类
  const categoryIds = {};
  for (const cat of CATEGORY_MAP.categories) {
    const result = insertCategory.run(cat.key, cat.name, cat.sort);
    categoryIds[cat.key] = result.lastInsertRowid;
  }

  // 插入子分类
  const subcategoryIds = {};
  for (const sub of CATEGORY_MAP.subcategories) {
    const catId = categoryIds[sub.category];
    const result = insertSubcategory.run(sub.key, sub.name, catId, sub.sort);
    subcategoryIds[sub.key] = result.lastInsertRowid;
  }

  // 分配图片到子分类并插入
  let totalInserted = 0;
  const subcategoryItems = {}; // subKey -> count

  for (const [libCat, items] of Object.entries(allImages)) {
    // 找到所有匹配该 LibLib 分类的子分类
    const matchingSubs = CATEGORY_MAP.subcategories.filter(s => s.liblibCategory === libCat);
    
    if (matchingSubs.length === 0) continue;

    for (const item of items) {
      const sub = matchSubcategory(item, matchingSubs);
      if (!sub) continue;

      const subId = subcategoryIds[sub.key];
      if (!subId) continue;

      // 限制每个子分类最多 200 条
      subcategoryItems[sub.key] = (subcategoryItems[sub.key] || 0) + 1;
      if (subcategoryItems[sub.key] > 200) continue;

      // 生成标题（从 prompt 提取前30字）
      let title = item.prompt.slice(0, 50);
      const commaIdx = title.indexOf('，');
      if (commaIdx > 5 && commaIdx < 40) title = title.slice(0, commaIdx);
      if (title.length > 30) title = title.slice(0, 30) + '...';

      // 生成缩略图 URL
      const thumbUrl = item.imageUrl + '?x-oss-process=image/resize,w_400,m_lfit/format,webp';
      const fullUrl = item.imageUrl + '?x-oss-process=image/resize,w_800,m_lfit/format,webp';

      const result = insertItem.run(
        title, item.prompt, fullUrl, thumbUrl,
        subId, subcategoryItems[sub.key], item.likes || 0
      );

      // 提取并插入标签
      const tags = extractTags(item.prompt);
      const itemId = result.lastInsertRowid;
      for (const tagName of tags) {
        insertTag.run(tagName);
        const tagRow = getTagId.get(tagName);
        if (tagRow) insertItemTag.run(itemId, tagRow.id);
      }

      totalInserted++;
    }
  }

  // 如果数据不够，用剩余的图片随机分配
  for (const sub of CATEGORY_MAP.subcategories) {
    const count = subcategoryItems[sub.key] || 0;
    if (count < 5) {
      // 从对应 LibLib 分类中取未分配的图片
      const items = allImages[sub.liblibCategory] || [];
      let added = 0;
      for (const item of items) {
        if (added >= 20 - count) break;
        const subId = subcategoryIds[sub.key];

        let title = item.prompt.slice(0, 50);
        if (title.length > 30) title = title.slice(0, 30) + '...';

        const thumbUrl = item.imageUrl + '?x-oss-process=image/resize,w_400,m_lfit/format,webp';
        const fullUrl = item.imageUrl + '?x-oss-process=image/resize,w_800,m_lfit/format,webp';

        try {
          insertItem.run(title, item.prompt, fullUrl, thumbUrl, subId, count + added + 1, item.likes || 0);
          added++;
          totalInserted++;
        } catch (e) {}
      }
    }
  }

  // 统计
  console.log(`\n${'═'.repeat(60)}`);
  console.log('📊 最终统计:');
  const stats = db.prepare(`
    SELECT c.name as cat_name, s.name as sub_name, COUNT(i.id) as count
    FROM categories c
    JOIN subcategories s ON s.category_id = c.id
    LEFT JOIN items i ON i.subcategory_id = s.id
    GROUP BY s.id
    ORDER BY c.sort_order, s.sort_order
  `).all();

  stats.forEach(row => {
    const bar = '█'.repeat(Math.min(Math.floor(row.count / 2), 40));
    console.log(`   ${row.cat_name} > ${row.sub_name}: ${row.count} ${bar}`);
  });

  const total = db.prepare('SELECT COUNT(*) as c FROM items').get();
  console.log(`\n   总计: ${total.c} 条 | 数据源: LibLib.art`);
  console.log('═'.repeat(60));

  db.close();
  console.log('\n✅ 爬虫完成！');
}

// 标签提取
function extractTags(prompt) {
  const tags = new Set();
  const patterns = [
    { match: /3[dD]|C4D|三维|立体|渲染/, tag: '3D' },
    { match: /渐变|流体|彩虹/, tag: '渐变' },
    { match: /扁平|平面|矢量/, tag: '扁平' },
    { match: /科技|赛博|数字|AI|未来/, tag: '科技' },
    { match: /复古|怀旧|年代|老式/, tag: '复古' },
    { match: /可爱|萌|Q版|卡哇伊/, tag: '可爱' },
    { match: /黏土|泥塑|粘土/, tag: '黏土' },
    { match: /多巴胺|高饱和|鲜艳/, tag: '多巴胺' },
    { match: /霓虹|发光|荧光/, tag: '霓虹' },
    { match: /极简|简约|简洁/, tag: '极简' },
    { match: /拼贴|剪纸|杂志/, tag: '拼贴' },
    { match: /手绘|手工|绘画/, tag: '手绘' },
    { match: /卡通|动漫|动画/, tag: '卡通' },
    { match: /写实|真实|照片/, tag: '写实' },
    { match: /抽象|几何|非具象/, tag: '抽象' },
    { match: /暗[色调]|黑暗|深色/, tag: '暗色' },
    { match: /明[亮色]|彩色|鲜明/, tag: '亮色' },
    { match: /节日|过年|春节|圣诞/, tag: '节日' },
    { match: /商业|产品|品牌|电商/, tag: '商业' },
    { match: /插画|插图/, tag: '插画' },
    { match: /海报|poster/, tag: '海报' },
    { match: /图标|icon/, tag: '图标' },
    { match: /建筑|室内|空间/, tag: '建筑' },
    { match: /自然|风景|山水/, tag: '自然' },
    { match: /美食|食物|饮品/, tag: '美食' },
    { match: /动物|宠物/, tag: '动物' },
    { match: /人像|人物|肖像/, tag: '人像' },
    { match: /电影|影视|电影感/, tag: '电影感' },
    { match: /国潮|中国风|中式/, tag: '国潮' },
    { match: /潮流|街头|嘻哈/, tag: '潮流' },
  ];

  patterns.forEach(({ match, tag }) => {
    if (match.test(prompt)) tags.add(tag);
  });

  return Array.from(tags).slice(0, 8);
}

main().catch(err => {
  console.error('❌ 爬取出错:', err);
  process.exit(1);
});
