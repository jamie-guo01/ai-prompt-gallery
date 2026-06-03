/**
 * 即梦数据导入脚本（含去重）
 * 
 * 将爬取的原始 JSON 数据导入 SQLite 数据库，自动跳过重复内容。
 * 
 * 用法：
 *   node scripts/import-data.js [--input <file>] [--subcategory-id <id>] [--dry-run]
 * 
 * 参数：
 *   --input <file>          输入文件路径（默认 scripts/raw-data-latest.json）
 *   --subcategory-id <id>   指定子分类 ID（默认自动匹配）
 *   --dry-run               仅检查去重，不实际写入
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// ============ 配置 ============
const PROJECT_DIR = path.join(__dirname, '..');
const DB_PATH = path.join(PROJECT_DIR, 'prompthub.db');
const DEFAULT_INPUT = path.join(__dirname, 'raw-data-latest.json');

// 标签到子分类的自动映射规则
const TAG_CATEGORY_MAP = {
  // 运营类 (category_id: 38)
  '3D': 146,        // 3D海报
  'KV': 147,        // KV海报
  'Banner': 148,    // Banner
  'banner': 148,
  '活动': 149,      // 活动页
  '运营': 146,      // 默认运营→3D海报
  
  // APP类 (category_id: 39)
  '图标': 150,      // App图标
  'icon': 150,
  'APP': 150,
  'app': 150,
  
  // 海报类 (category_id: 40)
  '海报': 146,      // 复用3D海报
  'poster': 146,
  
  // 插画类 (category_id: 41)
  '插画': 155,
  '手绘': 155,
  'illustration': 155,
  
  // IP类 (category_id: 42)
  'IP': 160,
  '吉祥物': 160,
  '卡通': 160,
};

// 默认子分类（当无法自动匹配时）
const DEFAULT_SUBCATEGORY_ID = 146; // 3D海报

// ============ 工具函数 ============

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    input: DEFAULT_INPUT,
    subcategoryId: null,
    dryRun: false,
  };
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' && args[i + 1]) {
      // 支持相对路径和绝对路径
      const inputPath = args[i + 1];
      options.input = path.isAbsolute(inputPath) ? inputPath : path.join(__dirname, inputPath);
      i++;
    } else if (args[i] === '--subcategory-id' && args[i + 1]) {
      options.subcategoryId = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--dry-run') {
      options.dryRun = true;
    }
  }
  
  return options;
}

function extractImageBasePath(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    const basePath = u.pathname.split('~')[0] || u.pathname;
    return `${u.hostname}${basePath}`;
  } catch {
    return url;
  }
}

function normalizePrompt(text) {
  if (!text) return '';
  return text
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/，/g, ',')
    .replace(/。/g, '.')
    .replace(/！/g, '!')
    .replace(/？/g, '?')
    .replace(/：/g, ':')
    .replace(/；/g, ';')
    .toLowerCase();
}

function guessSubcategoryId(item, existingSubcategories) {
  // 根据标签猜测合适的子分类
  if (item.tags && item.tags.length > 0) {
    for (const tag of item.tags) {
      if (TAG_CATEGORY_MAP[tag]) {
        return TAG_CATEGORY_MAP[tag];
      }
    }
  }
  
  // 根据 prompt 关键词猜测
  const prompt = (item.prompt || '').toLowerCase();
  if (prompt.includes('3d') || prompt.includes('立体')) return 146;
  if (prompt.includes('banner') || prompt.includes('横幅')) return 148;
  if (prompt.includes('图标') || prompt.includes('icon')) return 150;
  if (prompt.includes('插画') || prompt.includes('illustration')) return 155;
  if (prompt.includes('ip') || prompt.includes('吉祥物') || prompt.includes('卡通')) return 160;
  if (prompt.includes('海报') || prompt.includes('poster')) return 146;
  if (prompt.includes('活动') || prompt.includes('节日')) return 149;
  
  return DEFAULT_SUBCATEGORY_ID;
}

// ============ 主逻辑 ============

function main() {
  const options = parseArgs();
  
  console.log('📥 即梦数据导入工具');
  console.log(`   输入文件: ${options.input}`);
  console.log(`   数据库: ${DB_PATH}`);
  console.log(`   模式: ${options.dryRun ? '🔍 仅检查（dry-run）' : '✏️ 写入数据库'}`);
  console.log('');
  
  // 检查输入文件
  if (!fs.existsSync(options.input)) {
    console.error(`❌ 输入文件不存在: ${options.input}`);
    console.error('   请先运行爬虫: node scripts/crawl-jimeng.js');
    process.exit(1);
  }
  
  // 读取输入数据
  const rawData = JSON.parse(fs.readFileSync(options.input, 'utf-8'));
  const inputItems = rawData.items || rawData;
  console.log(`   输入数据: ${inputItems.length} 条`);
  
  // 打开数据库
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  
  // 获取现有数据用于去重
  const existingItems = db.prepare('SELECT id, image_url, prompt FROM items').all();
  console.log(`   现有数据: ${existingItems.length} 条`);
  
  // 构建去重索引
  const existingImagePaths = new Set(
    existingItems.map(item => extractImageBasePath(item.image_url)).filter(Boolean)
  );
  const existingPrompts = new Set(
    existingItems.map(item => normalizePrompt(item.prompt)).filter(Boolean)
  );
  
  // 去重检查
  let duplicateCount = 0;
  let newItems = [];
  
  for (const item of inputItems) {
    const imagePath = extractImageBasePath(item.imageUrl);
    const normalizedPrompt = normalizePrompt(item.prompt);
    
    // 检查是否重复
    let isDuplicate = false;
    
    if (imagePath && existingImagePaths.has(imagePath)) {
      isDuplicate = true;
    } else if (normalizedPrompt && normalizedPrompt.length > 20 && existingPrompts.has(normalizedPrompt)) {
      isDuplicate = true;
    }
    
    if (isDuplicate) {
      duplicateCount++;
    } else {
      newItems.push(item);
      // 将新项也加入去重集合，防止输入数据本身有重复
      if (imagePath) existingImagePaths.add(imagePath);
      if (normalizedPrompt) existingPrompts.add(normalizedPrompt);
    }
  }
  
  console.log(`\n📊 去重结果:`);
  console.log(`   重复跳过: ${duplicateCount} 条`);
  console.log(`   新增数据: ${newItems.length} 条`);
  
  if (newItems.length === 0) {
    console.log('\n✅ 没有新数据需要导入');
    db.close();
    return;
  }
  
  if (options.dryRun) {
    console.log('\n🔍 Dry-run 模式，不执行写入');
    console.log('   预览前 5 条新数据:');
    newItems.slice(0, 5).forEach((item, i) => {
      console.log(`   ${i + 1}. ${(item.title || item.prompt || '').substring(0, 50)}`);
    });
    db.close();
    return;
  }
  
  // ============ 写入数据库 ============
  console.log('\n✏️ 开始写入数据库...');
  
  // 预处理语句
  const insertItem = db.prepare(`
    INSERT INTO items (title, prompt, image_url, thumbnail_url, subcategory_id, sort_order, views, likes)
    VALUES (@title, @prompt, @image_url, @thumbnail_url, @subcategory_id, @sort_order, @views, @likes)
  `);
  
  const findTag = db.prepare('SELECT id FROM tags WHERE name = ?');
  const insertTag = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)');
  const insertItemTag = db.prepare('INSERT OR IGNORE INTO item_tags (item_id, tag_id) VALUES (?, ?)');
  
  // 获取现有最大 sort_order
  const maxSort = db.prepare('SELECT MAX(sort_order) as max_sort FROM items').get();
  let sortOrder = (maxSort?.max_sort || 0) + 1;
  
  // 获取现有子分类列表
  const subcategories = db.prepare('SELECT id, name FROM subcategories').all();
  
  // 使用事务批量插入
  const insertMany = db.transaction((items) => {
    let inserted = 0;
    
    for (const item of items) {
      // 确定子分类
      const subcategoryId = options.subcategoryId || guessSubcategoryId(item, subcategories);
      
      // 确保子分类存在
      const subExists = db.prepare('SELECT id FROM subcategories WHERE id = ?').get(subcategoryId);
      if (!subExists) {
        console.warn(`   ⚠️ 子分类 ${subcategoryId} 不存在，使用默认值 ${DEFAULT_SUBCATEGORY_ID}`);
      }
      
      const finalSubcategoryId = subExists ? subcategoryId : DEFAULT_SUBCATEGORY_ID;
      
      // 插入 item
      const result = insertItem.run({
        title: (item.title || item.prompt?.substring(0, 40) || '未命名').substring(0, 200),
        prompt: item.prompt || '',
        image_url: item.imageUrl || '',
        thumbnail_url: item.thumbnailUrl || item.imageUrl || '',
        subcategory_id: finalSubcategoryId,
        sort_order: sortOrder++,
        views: 0,
        likes: item.likes || 0,
      });
      
      const itemId = result.lastInsertRowid;
      
      // 处理标签
      if (item.tags && item.tags.length > 0) {
        for (const tagName of item.tags) {
          if (!tagName) continue;
          
          insertTag.run(tagName);
          const tag = findTag.get(tagName);
          if (tag) {
            insertItemTag.run(itemId, tag.id);
          }
        }
      }
      
      inserted++;
    }
    
    return inserted;
  });
  
  const insertedCount = insertMany(newItems);
  
  // 验证
  const totalAfter = db.prepare('SELECT COUNT(*) as count FROM items').get();
  
  console.log(`\n✅ 导入完成！`);
  console.log(`   新增: ${insertedCount} 条`);
  console.log(`   数据库总计: ${totalAfter.count} 条`);
  console.log(`\n   下一步: node scripts/export-and-deploy.js`);
  
  db.close();
}

main();
