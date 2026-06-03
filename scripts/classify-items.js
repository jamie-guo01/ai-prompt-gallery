/**
 * Prompt 智能分类器
 * 
 * 根据 AI 图片 prompt 中的关键词，自动匹配到正确的子分类。
 * 
 * 用法：
 *   node scripts/classify-items.js [options]
 * 
 * 参数：
 *   --dry-run         仅输出分类结果，不修改数据库
 *   --unclassified    只处理当前在"其他"子分类中的item
 *   --all             重新分类所有item（覆盖已有分类）
 *   --ids 3658,3659   只分类指定ID的items
 *   --verbose         输出每条item的匹配详情
 */

const Database = require('better-sqlite3');
const path = require('path');

// ============ 配置 ============
const DB_PATH = path.join(__dirname, '..', 'prompthub.db');

// "其他"子分类ID列表
const OTHER_SUBCATEGORY_IDS = [169, 170, 171, 172, 173];

// 各大类的"其他"子分类映射
const CATEGORY_OTHER_MAP = {
  38: 169, // 运营-其他
  39: 170, // APP-其他
  40: 171, // 海报-其他
  41: 172, // 插画-其他
  42: 173, // IP-其他
};

// ============ 分类规则 ============
// 规则按优先级从高到低排列，命中即停止
// 每条规则：{ subcategory_id, name, strong: [...], weak: [...], exclude: [...] }
// strong: 命中任一 → 直接归类
// weak: 需命中多条或组合判断
// exclude: 排除条件（如果命中排除词则跳过该规则）

const RULES = [
  // ===== 最高优先级：具体用途型 =====
  
  // 弹窗（非常明确）
  {
    subcategory_id: 174,
    name: '弹窗',
    strong: ['弹窗', '弹框', 'popup', '对话框'],
    weak: [],
    exclude: [],
  },
  
  // App图标
  {
    subcategory_id: 150,
    name: 'App图标',
    strong: ['icon设计', '图标设计', 'icon图标', '金刚区图标', '功能图标', 'UI图标', '节气图标', '节气的简洁图标'],
    weak: [
      { all: ['图标', '排布'] },
      { all: ['图标', '九宫格'] },
      { all: ['图标', '六宫格'] },
      { all: ['icon', '设计'] },
      { all: ['系列图标'] },
      { all: ['图标', '风格'] },
      { all: ['节气', '图标'] },
      { all: ['图标', '3D渲染'] },
    ],
    exclude: [],
  },
  
  // 表情包
  {
    subcategory_id: 168,
    name: '表情包',
    strong: ['表情包', '表情贴纸', 'emoji表情'],
    weak: [
      { all: ['表情', '九宫格'] },
      { all: ['表情', 'Q版'] },
      { all: ['表情', '贴纸'] },
    ],
    exclude: [],
  },
  
  // IP设计 / 卡通角色
  {
    subcategory_id: 166,
    name: '卡通IP',
    strong: ['IP设计', 'IP全案', 'IP形象设计', '卡通角色', '3D角色'],
    weak: [
      { all: ['IP', '三视角'] },
      { all: ['IP', '效果'] },
      { all: ['IP', '周边'] },
      { all: ['角色', '宝丽来'] },
      { all: ['角色', '3D', '坐在'] },
      { all: ['时尚', '可爱', '3D', '角色'] },
    ],
    exclude: [],
  },
  
  // 吉祥物
  {
    subcategory_id: 167,
    name: '吉祥物',
    strong: ['吉祥物', 'mascot'],
    weak: [
      { all: ['品牌', '形象', '卡通'] },
      { all: ['企业', 'IP'] },
    ],
    exclude: [],
  },
  
  // 空状态
  {
    subcategory_id: 151,
    name: '空状态',
    strong: ['空状态', '缺省页', 'empty state'],
    weak: [
      { all: ['APP', '空状态'] },
    ],
    exclude: [],
  },
  
  // 引导页
  {
    subcategory_id: 153,
    name: '引导页',
    strong: ['引导页', 'UI引导', 'onboarding'],
    weak: [
      { all: ['引导', '页'] },
    ],
    exclude: [],
  },
  
  // 闪屏页
  {
    subcategory_id: 154,
    name: '闪屏页',
    strong: ['闪屏', '开屏页', '开屏', '启动页', '冷启动'],
    weak: [
      { all: ['splash'] },
    ],
    exclude: [],
  },
  
  // ===== 运营类 =====
  
  // Banner（优先于3D海报，因为用途更具体）
  {
    subcategory_id: 148,
    name: 'Banner',
    strong: ['banner', 'Banner', '电商促销海报', '促销广告图', '促销标题'],
    weak: [
      { all: ['促销', '海报'] },
      { all: ['电商', '海报'] },
      { all: ['产品', '广告'] },
      { all: ['品牌', '海报', '产品'] },
      { all: ['广告', '海报'] },
      { all: ['电商', '促销'] },
    ],
    exclude: ['kv', 'KV', '主视觉', '发布会'],
  },
  
  // 活动页
  {
    subcategory_id: 149,
    name: '活动页',
    strong: ['活动页', '大促海报', '狂欢季', '嘉年华'],
    weak: [
      { all: ['活动', '海报'] },
      { all: ['双11', '海报'] },
      { all: ['双十一', '海报'] },
      { all: ['618', '海报'] },
      { all: ['节日', '促销'] },
      { all: ['购物节'] },
    ],
    exclude: ['banner', 'Banner', 'kv', 'KV'],
  },
  
  // KV海报
  {
    subcategory_id: 147,
    name: 'KV海报',
    strong: ['kv背景', 'KV背景', 'kv', 'KV', '主视觉', '发布会背景', '发布会海报', '发布会'],
    weak: [
      { all: ['科技感', '背景'] },
      { all: ['粒子', '背景'] },
      { all: ['峰会'] },
      { all: ['主视觉', '设计'] },
      { all: ['活动', '主视觉'] },
    ],
    exclude: [],
  },
  
  // 3D海报
  {
    subcategory_id: 146,
    name: '3D海报',
    strong: ['3D插图', 'C4D风格', '3D卡通渲染', '3D建模', 'C4D建模', '3D风格海报'],
    weak: [
      { all: ['3D', '海报'] },
      { all: ['C4D', '海报'] },
      { all: ['三维', '海报'] },
      { all: ['3D', '卡通', '风格'] },
    ],
    exclude: ['banner', 'Banner', 'kv', 'KV', '主视觉', '发布会', '电商促销'],
  },
  
  // ===== 海报类 =====
  
  // 拼贴海报
  {
    subcategory_id: 155,
    name: '拼贴海报',
    strong: ['拼贴', 'collage', '撕贴'],
    weak: [
      { all: ['波普', '拼贴'] },
      { all: ['布艺', '拼贴'] },
      { all: ['做旧', '画报'] },
    ],
    exclude: [],
  },
  
  // 电影海报
  {
    subcategory_id: 158,
    name: '电影海报',
    strong: ['电影海报', '电影风格海报'],
    weak: [
      { all: ['电影', '海报'] },
      { all: ['暗黑系', '胶片'] },
      { all: ['Frank Frazetta'] },
      { all: ['奇幻', '海报'] },
      { all: ['电影', '质感', '海报'] },
    ],
    exclude: [],
  },
  
  // 复古海报
  {
    subcategory_id: 160,
    name: '复古海报',
    strong: ['复古海报', '丝印海报', '丝网印海报', '凹版印刷'],
    weak: [
      { all: ['复古', '海报'] },
      { all: ['RISO', '海报'] },
      { all: ['半调', '海报'] },
      { all: ['丝网印', '质感'] },
      { all: ['丝网版画'] },
    ],
    exclude: [],
  },
  
  // 科技海报
  {
    subcategory_id: 157,
    name: '科技海报',
    strong: ['科技海报', '科技感海报'],
    weak: [
      { all: ['科技', '海报'] },
      { all: ['代码', '粒子'] },
      { all: ['未来科技', '展板'] },
    ],
    exclude: ['kv', 'KV', '发布会', '主视觉', '背景'],
  },
  
  // 渐变艺术
  {
    subcategory_id: 156,
    name: '渐变艺术',
    strong: ['弥散风海报', '渐变艺术'],
    weak: [
      { all: ['朦胧', '美学', '海报'] },
      { all: ['弥散', '海报', '留白'] },
      { all: ['渐变', '极简', '海报'] },
      { all: ['弥散渐变', '海报设计'] },
      { all: ['意识流', '美学', '海报'] },
    ],
    exclude: ['kv', 'KV', '发布会', '科技感', '电商'],
  },
  
  // 艺术海报（范围最广，放后面）
  {
    subcategory_id: 159,
    name: '艺术海报',
    strong: ['艺术海报', '文字海报'],
    weak: [
      { all: ['大师级排版', '海报'] },
      { all: ['新中式', '海报'] },
      { all: ['极繁主义', '海报'] },
      { all: ['国潮', '海报'] },
      { all: ['字体设计', '海报'] },
      { all: ['创意海报'] },
      { all: ['排版艺术', '海报'] },
    ],
    exclude: [],
  },
  
  // ===== 插画类 =====
  
  // 黏土
  {
    subcategory_id: 162,
    name: '黏土',
    strong: ['黏土', '粘土', '泥塑', 'clay'],
    weak: [
      { all: ['定格动画', '粘土'] },
      { all: ['超轻粘土'] },
      { all: ['凤翔泥塑'] },
    ],
    exclude: [],
  },
  
  // 多巴胺
  {
    subcategory_id: 161,
    name: '多巴胺',
    strong: ['多巴胺'],
    weak: [
      { all: ['多巴胺', '色'] },
      { all: ['高饱和', '矢量插画'] },
      { all: ['y2k', '潮流'] },
    ],
    exclude: [],
  },
  
  // 2.5D
  {
    subcategory_id: 165,
    name: '2.5D',
    strong: ['2.5D', '等距插画', 'isometric'],
    weak: [
      { all: ['轴测', '插画'] },
    ],
    exclude: [],
  },
  
  // 夸张
  {
    subcategory_id: 163,
    name: '夸张',
    strong: ['美式漫画', '搞怪漫画'],
    weak: [
      { all: ['夸张', '漫画'] },
      { all: ['赛璐璐', '动漫'] },
      { all: ['80年代', '漫画'] },
      { all: ['复古', '漫画', '动漫'] },
    ],
    exclude: [],
  },
  
  // 扁平
  {
    subcategory_id: 164,
    name: '扁平',
    strong: ['扁平插画', '扁平风格插画'],
    weak: [
      { all: ['扁平', '插画'] },
      { all: ['渐变色块', '扁平'] },
      { all: ['矢量', '扁平'] },
    ],
    exclude: ['海报', '多巴胺', 'banner', '拼贴'],
  },
];

// ============ 匹配引擎 ============

function normalizePrompt(prompt) {
  // 统一全角半角、去除多余空格
  return prompt
    .replace(/，/g, ',')
    .replace(/。/g, '.')
    .replace(/：/g, ':')
    .replace(/；/g, ';')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function containsKeyword(text, keyword) {
  return text.toLowerCase().includes(keyword.toLowerCase());
}

function matchRule(prompt, rule) {
  const normalizedPrompt = prompt.toLowerCase();
  
  // 检查排除词
  for (const exc of rule.exclude) {
    if (containsKeyword(prompt, exc)) {
      return { matched: false, reason: `excluded by "${exc}"` };
    }
  }
  
  // 检查强特征词
  for (const strong of rule.strong) {
    if (containsKeyword(prompt, strong)) {
      return { matched: true, reason: `strong: "${strong}"`, confidence: 'high' };
    }
  }
  
  // 检查弱特征词组合
  for (const weak of rule.weak) {
    if (weak.all) {
      const allMatch = weak.all.every(kw => containsKeyword(prompt, kw));
      if (allMatch) {
        return { matched: true, reason: `weak combo: [${weak.all.join(' + ')}]`, confidence: 'medium' };
      }
    }
  }
  
  return { matched: false, reason: 'no match' };
}

function classifyPrompt(prompt) {
  for (const rule of RULES) {
    const result = matchRule(prompt, rule);
    if (result.matched) {
      return {
        subcategory_id: rule.subcategory_id,
        name: rule.name,
        reason: result.reason,
        confidence: result.confidence,
      };
    }
  }
  
  // 无法匹配具体子分类，判断大类
  return classifyToOther(prompt);
}

function classifyToOther(prompt) {
  const p = prompt.toLowerCase();
  
  // APP相关 — 但需要排除仅包含 "app" 作为场景描述词的情况
  if (containsKeyword(p, 'icon') || containsKeyword(p, '图标') || containsKeyword(p, 'ui设计') || containsKeyword(p, 'ui界面')) {
    return { subcategory_id: 170, name: 'APP-其他', reason: 'fallback to APP-其他', confidence: 'low' };
  }
  // IP角色相关
  if (containsKeyword(p, '吉祥物') || containsKeyword(p, '角色设计') || containsKeyword(p, '形象设计') || containsKeyword(p, 'mascot')) {
    return { subcategory_id: 173, name: 'IP-其他', reason: 'fallback to IP-其他', confidence: 'low' };
  }
  // 插画相关 — 覆盖手绘/插画/卡通/漫画/治愈系等描绘性prompt
  if (containsKeyword(p, '插画') || containsKeyword(p, 'illustration') || containsKeyword(p, '手绘') || containsKeyword(p, '简笔画') || containsKeyword(p, '治愈') || containsKeyword(p, '漫画') || containsKeyword(p, '卡通') || containsKeyword(p, '画风')) {
    return { subcategory_id: 172, name: '插画-其他', reason: 'fallback to 插画-其他', confidence: 'low' };
  }
  // 海报相关
  if (containsKeyword(p, '海报') || containsKeyword(p, 'poster')) {
    return { subcategory_id: 171, name: '海报-其他', reason: 'fallback to 海报-其他', confidence: 'low' };
  }
  // 运营相关
  if (containsKeyword(p, '促销') || containsKeyword(p, '广告') || containsKeyword(p, '运营') || containsKeyword(p, '电商')) {
    return { subcategory_id: 169, name: '运营-其他', reason: 'fallback to 运营-其他', confidence: 'low' };
  }
  
  // 最终兜底 — 归入插画-其他（大部分即梦内容偏插画/创意方向）
  return { subcategory_id: 172, name: '插画-其他', reason: 'default fallback', confidence: 'low' };
}

// ============ 主逻辑 ============

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes('--dry-run'),
    unclassified: args.includes('--unclassified'),
    all: args.includes('--all'),
    verbose: args.includes('--verbose'),
    ids: (() => {
      const idx = args.indexOf('--ids');
      if (idx !== -1 && args[idx + 1]) {
        return args[idx + 1].split(',').map(Number);
      }
      return null;
    })(),
  };
}

function main() {
  const options = parseArgs();
  
  console.log('🏷️  Prompt 智能分类器');
  console.log(`   数据库: ${DB_PATH}`);
  console.log(`   模式: ${options.dryRun ? 'DRY RUN (不修改数据库)' : '实际执行'}`);
  console.log('');
  
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  
  // 获取要处理的items
  let items;
  if (options.ids) {
    const placeholders = options.ids.map(() => '?').join(',');
    items = db.prepare(`SELECT id, prompt, subcategory_id FROM items WHERE id IN (${placeholders})`).all(...options.ids);
    console.log(`   范围: 指定IDs (${options.ids.length} 条)`);
  } else if (options.unclassified) {
    const placeholders = OTHER_SUBCATEGORY_IDS.map(() => '?').join(',');
    items = db.prepare(`SELECT id, prompt, subcategory_id FROM items WHERE subcategory_id IN (${placeholders})`).all(...OTHER_SUBCATEGORY_IDS);
    console.log(`   范围: 仅"其他"分类 (${items.length} 条)`);
  } else if (options.all) {
    items = db.prepare('SELECT id, prompt, subcategory_id FROM items').all();
    console.log(`   范围: 全部 (${items.length} 条)`);
  } else {
    // 默认只处理"其他"分类
    const placeholders = OTHER_SUBCATEGORY_IDS.map(() => '?').join(',');
    items = db.prepare(`SELECT id, prompt, subcategory_id FROM items WHERE subcategory_id IN (${placeholders})`).all(...OTHER_SUBCATEGORY_IDS);
    console.log(`   范围: 仅"其他"分类 (${items.length} 条)`);
  }
  
  console.log('');
  
  // 分类统计
  const stats = { total: items.length, changed: 0, unchanged: 0, byCategory: {} };
  const updateStmt = db.prepare('UPDATE items SET subcategory_id = ? WHERE id = ?');
  
  const changes = [];
  
  for (const item of items) {
    const result = classifyPrompt(item.prompt);
    
    if (result.subcategory_id !== item.subcategory_id) {
      changes.push({
        id: item.id,
        from: item.subcategory_id,
        to: result.subcategory_id,
        name: result.name,
        reason: result.reason,
        confidence: result.confidence,
        prompt_preview: item.prompt.substring(0, 50),
      });
      
      if (!options.dryRun) {
        updateStmt.run(result.subcategory_id, item.id);
      }
      
      stats.changed++;
      stats.byCategory[result.name] = (stats.byCategory[result.name] || 0) + 1;
    } else {
      stats.unchanged++;
    }
    
    if (options.verbose) {
      const status = result.subcategory_id !== item.subcategory_id ? '✏️  MOVE' : '✓  OK';
      console.log(`   ${status} [${item.id}] → ${result.name} (${result.reason})`);
    }
  }
  
  // 输出结果
  console.log('📊 分类结果:');
  console.log(`   总数: ${stats.total}`);
  console.log(`   需移动: ${stats.changed}`);
  console.log(`   无需变化: ${stats.unchanged}`);
  console.log('');
  
  if (stats.changed > 0) {
    console.log('📋 变更详情:');
    for (const c of changes) {
      console.log(`   [${c.id}] ${c.from} → ${c.to}(${c.name}) | ${c.confidence} | ${c.reason}`);
      if (options.verbose) {
        console.log(`         "${c.prompt_preview}..."`);
      }
    }
    console.log('');
    
    console.log('📈 分类分布:');
    for (const [name, count] of Object.entries(stats.byCategory).sort((a, b) => b[1] - a[1])) {
      console.log(`   ${name}: ${count}`);
    }
  }
  
  if (options.dryRun) {
    console.log('\n⚠️  DRY RUN 模式 — 以上变更未实际写入数据库');
    console.log('   去掉 --dry-run 参数后重新运行以实际执行');
  } else if (stats.changed > 0) {
    console.log(`\n✅ 已更新 ${stats.changed} 条记录`);
    console.log('   运行 node scripts/export-and-deploy.js 导出并部署');
  } else {
    console.log('\n✅ 所有数据分类正确，无需变更');
  }
  
  db.close();
}

main();
