/**
 * 即梦 (Jimeng) 爬虫 - 按子分类关键词精准搜索获取数据
 * 
 * 策略：
 * 1. 对每个子分类，用精确关键词在即梦搜索
 * 2. 从搜索结果的 React fiber 中提取 item key + coverUrl
 * 3. 逐个访问详情页，从 DOM 中提取"图片提示词"
 * 4. 数据存入 SQLite 数据库
 */

const Database = require('better-sqlite3');
const path = require('path');
const { execSync } = require('child_process');

const dbPath = path.join(__dirname, 'prompthub.db');

// ============ 分类配置 ============
// 每个子分类有一个用于搜索的精准关键词
const CATEGORIES = [
  {
    key: 'operation', name: '运营', sort: 1,
    subcategories: [
      { key: '3d_poster', name: '3D海报', sort: 1, searchKeyword: '3D海报' },
      { key: 'kv_poster', name: 'KV海报', sort: 2, searchKeyword: 'KV主视觉' },
      { key: 'banner', name: 'Banner', sort: 3, searchKeyword: '电商Banner' },
      { key: 'activity_page', name: '活动页', sort: 4, searchKeyword: '活动页H5' },
    ]
  },
  {
    key: 'app', name: 'APP', sort: 2,
    subcategories: [
      { key: 'app_icon', name: 'App图标', sort: 1, searchKeyword: 'App图标icon' },
      { key: 'empty_state', name: '空状态', sort: 2, searchKeyword: '空状态插画' },
      { key: 'jingang_icon', name: '金刚区图标', sort: 3, searchKeyword: '金刚区图标' },
      { key: 'onboarding', name: '引导页', sort: 4, searchKeyword: '引导页插画' },
      { key: 'splash_screen', name: '闪屏页', sort: 5, searchKeyword: '闪屏开屏页' },
    ]
  },
  {
    key: 'poster', name: '海报', sort: 3,
    subcategories: [
      { key: 'collage', name: '拼贴海报', sort: 1, searchKeyword: '拼贴风海报' },
      { key: 'gradient_art', name: '渐变艺术', sort: 2, searchKeyword: '渐变艺术海报' },
      { key: 'tech_poster', name: '科技海报', sort: 3, searchKeyword: '科技感海报' },
      { key: 'movie_poster', name: '电影海报', sort: 4, searchKeyword: '电影风海报' },
      { key: 'art_poster', name: '艺术海报', sort: 5, searchKeyword: '艺术创意海报' },
      { key: 'retro_poster', name: '复古海报', sort: 6, searchKeyword: '复古怀旧海报' },
    ]
  },
  {
    key: 'illustration', name: '插画', sort: 4,
    subcategories: [
      { key: 'dopamine', name: '多巴胺', sort: 1, searchKeyword: '多巴胺配色' },
      { key: 'clay', name: '黏土', sort: 2, searchKeyword: '黏土风格' },
      { key: 'exaggerated', name: '夸张', sort: 3, searchKeyword: '夸张漫画风' },
      { key: 'flat', name: '扁平', sort: 4, searchKeyword: '扁平插画' },
      { key: 'isometric', name: '2.5D', sort: 5, searchKeyword: '2.5D等距插画' },
    ]
  },
  {
    key: 'ip', name: 'IP', sort: 5,
    subcategories: [
      { key: 'cartoon_ip', name: '卡通IP', sort: 1, searchKeyword: '卡通IP形象' },
      { key: 'mascot', name: '吉祥物', sort: 2, searchKeyword: '品牌吉祥物' },
      { key: 'emoji', name: '表情包', sort: 3, searchKeyword: '表情包贴纸' },
    ]
  }
];

// ============ 工具函数 ============

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function browserAction(action) {
  const json = JSON.stringify(action);
  const cmd = `catdesk browser-action '${json.replace(/'/g, "'\\''")}'`;
  try {
    const result = execSync(cmd, { encoding: 'utf8', timeout: 60000, maxBuffer: 10 * 1024 * 1024 });
    return JSON.parse(result);
  } catch (e) {
    return null;
  }
}

/**
 * 在即梦搜索页面收集 item 列表（key + coverUrl）
 */
async function searchAndCollect(keyword, targetCount = 30) {
  const url = `https://jimeng.jianying.com/ai-tool/search-result?result=${encodeURIComponent(keyword)}&type=inspiration`;
  browserAction({ action: 'navigate', url, waitUntil: 'load' });
  await sleep(3500);

  // 滚动加载更多
  for (let scroll = 0; scroll < 3; scroll++) {
    browserAction({ action: 'scroll', direction: 'down', amount: 1500 });
    await sleep(2000);
  }

  // 从 React fiber 提取 work ID 列表（只取 key，避免 URL 太长超出 buffer）
  const script = `(function(){
    var items=document.querySelectorAll(".masonry-layout-item");
    if(items.length<2)return "[]";
    var item=items[1];
    var fiber=null;
    var keys=Object.keys(item);
    for(var i=0;i<keys.length;i++){
      if(keys[i].startsWith("__reactFiber")||keys[i].startsWith("__reactInternalInstance")){
        fiber=item[keys[i]];break;
      }
    }
    if(!fiber)return "[]";
    var p=fiber;
    for(var i=0;i<20;i++){
      if(p&&p.memoizedProps&&p.memoizedProps.list){
        var list=p.memoizedProps.list;
        var results=[];
        for(var j=0;j<list.length;j++){
          var d=list[j].data;
          if(d&&d.key&&d.type==="image"){
            results.push(d.key);
          }
        }
        return JSON.stringify(results);
      }
      p=p.return;
      if(!p)break;
    }
    return "[]";
  })()`.replace(/\n/g, '');

  const result = browserAction({ action: 'evaluate', script });
  if (result && result.data && result.data.result) {
    try {
      const keys = JSON.parse(result.data.result);
      return keys.slice(0, targetCount);
    } catch (e) {}
  }
  return [];
}

/**
 * 访问详情页提取 prompt
 */
async function getDetailPrompt(workId) {
  const url = `https://jimeng.jianying.com/ai-tool/work-detail/${workId}`;
  browserAction({ action: 'navigate', url, waitUntil: 'load' });
  await sleep(2500);

  const script = `(function(){
    var text=document.body.innerText;
    var idx=text.indexOf("图片提示词");
    if(idx<0) return "";
    var after=text.substring(idx+5).trim();
    var lines=after.split("\\n");
    var prompt="";
    for(var i=0;i<lines.length;i++){
      var line=lines[i].trim();
      if(line==="")continue;
      if(line.startsWith("图片")||line.startsWith("做同款")||line.startsWith("用作参考"))break;
      prompt+=line+" ";
    }
    return prompt.trim();
  })()`.replace(/\n/g, '');

  const result = browserAction({ action: 'evaluate', script });
  if (result && result.data && result.data.result) {
    return result.data.result;
  }
  return '';
}

/**
 * 从详情页获取大图 URL
 */
async function getDetailImage(workId) {
  const script = `(function(){
    var imgs=document.querySelectorAll("img[src*=dreamina-sign],img[src*=heycan-hgt-sign]");
    var best="";
    var bestSize=0;
    for(var i=0;i<imgs.length;i++){
      var w=imgs[i].naturalWidth||imgs[i].width||0;
      var h=imgs[i].naturalHeight||imgs[i].height||0;
      if(w*h>bestSize){bestSize=w*h;best=imgs[i].src;}
    }
    return best;
  })()`.replace(/\n/g, '');

  const result = browserAction({ action: 'evaluate', script });
  if (result && result.data && result.data.result) {
    return result.data.result;
  }
  return '';
}

// ============ 标签提取 ============
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
    { match: /极简|简约|简洁/, tag: '极简' },
    { match: /拼贴|剪纸|杂志/, tag: '拼贴' },
    { match: /卡通|动漫|动画/, tag: '卡通' },
    { match: /写实|真实|照片/, tag: '写实' },
    { match: /插画|插图/, tag: '插画' },
    { match: /海报|poster/, tag: '海报' },
    { match: /图标|icon/, tag: '图标' },
    { match: /国潮|中国风|中式/, tag: '国潮' },
    { match: /电影|影视|电影感/, tag: '电影感' },
    { match: /商业|产品|品牌|电商/, tag: '商业' },
    { match: /人像|人物|肖像/, tag: '人像' },
    { match: /自然|风景|山水/, tag: '自然' },
  ];

  patterns.forEach(({ match, tag }) => {
    if (match.test(prompt)) tags.add(tag);
  });

  return Array.from(tags).slice(0, 8);
}

// ============ 主逻辑 ============

async function main() {
  console.log('🕷️  即梦 (Jimeng) 爬虫 - 按分类精准搜索');
  console.log('═'.repeat(60));
  console.log('数据源: jimeng.jianying.com (即梦AI)');
  console.log('策略: 按子分类关键词搜索 → 详情页提取 prompt');
  console.log('═'.repeat(60) + '\n');

  // 初始化数据库
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
  for (const cat of CATEGORIES) {
    const result = insertCategory.run(cat.key, cat.name, cat.sort);
    categoryIds[cat.key] = result.lastInsertRowid;
  }

  // 插入子分类
  const subcategoryIds = {};
  for (const cat of CATEGORIES) {
    for (const sub of cat.subcategories) {
      const result = insertSubcategory.run(sub.key, sub.name, categoryIds[cat.key], sub.sort);
      subcategoryIds[sub.key] = result.lastInsertRowid;
    }
  }

  let totalInserted = 0;

  // 对每个子分类进行搜索
  for (const cat of CATEGORIES) {
    console.log(`\n📁 ${cat.name}`);

    for (const sub of cat.subcategories) {
      console.log(`\n   🔍 搜索: "${sub.searchKeyword}" → [${sub.name}]`);

      // 搜索并收集 item 列表
      const items = await searchAndCollect(sub.searchKeyword, 20);
      console.log(`   📸 找到 ${items.length} 条结果`);

      if (items.length === 0) {
        console.log(`   ⚠️ 无结果，跳过`);
        continue;
      }

      // 逐个获取详情（items 现在是 key 字符串数组）
      let successCount = 0;
      for (let i = 0; i < items.length; i++) {
        const workId = items[i];
        
        // 获取详情页 prompt
        const prompt = await getDetailPrompt(workId);
        if (!prompt || prompt.length < 5) continue;

        // 获取大图
        const imageUrl = await getDetailImage(workId);
        if (!imageUrl) continue;

        // 生成标题
        let title = prompt.slice(0, 50);
        const commaIdx = title.indexOf('，');
        if (commaIdx > 5 && commaIdx < 40) title = title.slice(0, commaIdx);
        if (title.length > 30) title = title.slice(0, 30) + '...';

        // 写入数据库
        const subId = subcategoryIds[sub.key];
        const dbResult = insertItem.run(
          title, prompt, imageUrl, imageUrl,
          subId, successCount + 1, 0
        );

        // 提取并插入标签
        const tags = extractTags(prompt);
        const itemId = dbResult.lastInsertRowid;
        for (const tagName of tags) {
          insertTag.run(tagName);
          const tagRow = getTagId.get(tagName);
          if (tagRow) insertItemTag.run(itemId, tagRow.id);
        }

        successCount++;
        totalInserted++;

        // 每5条打印进度
        if (successCount % 5 === 0) {
          process.stdout.write(`   ✅ ${successCount} `);
        }
      }

      console.log(`\n   ✅ 写入 ${successCount} 条 [${sub.name}]`);
    }
  }

  // 最终统计
  console.log(`\n\n${'═'.repeat(60)}`);
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
    const bar = '█'.repeat(Math.min(Math.floor(row.count / 1), 30));
    console.log(`   ${row.cat_name} > ${row.sub_name}: ${row.count} ${bar}`);
  });

  const total = db.prepare('SELECT COUNT(*) as c FROM items').get();
  console.log(`\n   总计: ${total.c} 条 | 数据源: 即梦AI`);
  console.log('═'.repeat(60));

  db.close();
  console.log('\n✅ 爬虫完成！');
}

main().catch(err => {
  console.error('❌ 爬取出错:', err);
  process.exit(1);
});
