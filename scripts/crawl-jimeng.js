/**
 * 即梦(Jimeng)爬虫脚本
 * 
 * 通过浏览器自动化从即梦平台搜索结果中提取数据
 * 使用 catdesk browser-action 控制浏览器
 * 
 * 流程：
 * 1. 导航到搜索结果页
 * 2. 通过 React Fiber 提取列表数据 (key + coverUrl)
 * 3. 逐个访问详情页提取 prompt
 * 4. 去重后写入数据库
 */

const { execSync } = require('child_process');
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'prompthub.db');

// 搜索关键词 -> 目标分类映射
const SEARCH_KEYWORDS = [
  { keyword: '空状态插画', subcategoryId: 151 },
  { keyword: 'APP空状态', subcategoryId: 151 },
  { keyword: '空白页插画', subcategoryId: 151 },
  { keyword: '缺省页插画', subcategoryId: 151 },
  { keyword: '无数据插画', subcategoryId: 151 },
  { keyword: '空状态页面设计', subcategoryId: 151 },
];

function browserAction(action) {
  try {
    const jsonStr = JSON.stringify(action);
    // Escape single quotes for shell
    const escaped = jsonStr.replace(/'/g, "'\\''");
    const result = execSync(`catdesk browser-action '${escaped}'`, {
      encoding: 'utf-8',
      timeout: 30000,
    });
    const parsed = JSON.parse(result);
    if (!parsed.success) {
      // If tab ID mismatch, try to recover
      if (parsed.error && parsed.error.includes('Could not find agent-browser tab')) {
        console.log('  Tab mismatch, recovering...');
        const recovered = recoverTab();
        if (recovered && action.action === 'evaluate') {
          // Retry evaluate after recovery
          const retryResult = execSync(`catdesk browser-action '${escaped}'`, {
            encoding: 'utf-8',
            timeout: 30000,
          });
          const retryParsed = JSON.parse(retryResult);
          if (retryParsed.success) return retryParsed.data;
        }
      }
      console.error(`  Browser action failed: ${parsed.error}`);
      return null;
    }
    return parsed.data;
  } catch (e) {
    console.error(`  Browser action error: ${e.message.substring(0, 200)}`);
    return null;
  }
}

function recoverTab() {
  try {
    const listResult = execSync(`catdesk browser-action '{"action":"tab_list"}'`, {
      encoding: 'utf-8',
      timeout: 10000,
    });
    const parsed = JSON.parse(listResult);
    if (parsed.success && parsed.data && parsed.data.tabs && parsed.data.tabs.length > 0) {
      const activeIdx = parsed.data.active;
      const switchResult = execSync(`catdesk browser-action '{"action":"tab_switch","index":${activeIdx}}'`, {
        encoding: 'utf-8',
        timeout: 10000,
      });
      const switchParsed = JSON.parse(switchResult);
      return switchParsed.success;
    }
  } catch (e) {
    console.error('  Recovery failed:', e.message.substring(0, 100));
  }
  return false;
}

function navigateAndWait(url, waitMs = 4000) {
  // Navigate in the current tab (same tab navigation works fine)
  const result = browserAction({ action: 'navigate', url });
  if (!result) return false;
  
  sleep(waitMs);
  return true;
}

function sleep(ms) {
  execSync(`sleep ${ms / 1000}`);
}

/**
 * 从搜索结果页通过 React Fiber 提取所有 item 的 key
 * 只提取 key 来避免返回数据过大被截断的问题
 */
function extractSearchKeys() {
  const script = `(function(){
    const container = document.querySelector(".masonry-layout-scroll-content-K5a0PK");
    if(!container) return JSON.stringify({error: "no container"});
    let fiberKey = Object.keys(container).find(k => k.startsWith("__reactFiber"));
    if(!fiberKey) return JSON.stringify({error: "no fiber"});
    let fiber = container[fiberKey];
    let current = fiber;
    for(let i=0; i<10; i++) {
      if(!current) break;
      const props = current.memoizedProps;
      if(props && props.list && Array.isArray(props.list)) {
        const keys = props.list.map(item => item.key).filter(Boolean);
        return JSON.stringify({count: keys.length, keys: keys});
      }
      current = current.return;
    }
    return JSON.stringify({error: "list not found in fiber"});
  })()`;

  const result = browserAction({ action: 'evaluate', script });
  if (!result || !result.result) return [];
  
  try {
    const data = JSON.parse(result.result);
    if (data.error) {
      console.error(`  Extract error: ${data.error}`);
      return [];
    }
    return data.keys || [];
  } catch (e) {
    console.error(`  Parse error: ${e.message}`);
    return [];
  }
}

/**
 * 从详情页提取 prompt 和图片 URL
 */
function extractDetailData() {
  const script = `(function(){
    const allText = document.body.innerText;
    const lines = allText.split("\\n").filter(l => l.trim().length > 10);
    let foundPrompt = false;
    let prompt = "";
    // 找到"图片提示词"/"提示词"后面的文本
    for(let i=0; i<lines.length; i++) {
      if(lines[i].includes("图片提示词") || lines[i].includes("提示词")) {
        if(i+1 < lines.length && lines[i+1].length > 10 && !lines[i+1].includes("图片") && !lines[i+1].includes("更多")) {
          prompt = lines[i+1].trim();
          foundPrompt = true;
          break;
        }
      }
    }
    // 如果没找到，尝试找最长的中文文本行
    if(!foundPrompt) {
      const candidates = lines.filter(l => 
        l.length > 20 && 
        !l.includes("输入想法") && 
        !l.includes("Agent") &&
        !l.includes("登录") &&
        !l.includes("内容由") &&
        !l.includes("关注") &&
        /[\\u4e00-\\u9fa5]/.test(l)
      );
      if(candidates.length > 0) {
        prompt = candidates.sort((a,b) => b.length - a.length)[0].trim();
        foundPrompt = true;
      }
    }
    // 获取图片 URL（只获取核心部分避免数据过大）
    const imgs = document.querySelectorAll("img[src*='tos-cn-i']");
    let imgUrl = "";
    let maxSize = 0;
    for(let img of imgs) {
      const size = (img.naturalWidth || img.width) * (img.naturalHeight || img.height);
      if(size > maxSize && img.src.includes("tb4s082cfz")) {
        maxSize = size;
        imgUrl = img.src;
      }
    }
    // Keep full URL including query params (auth signatures are required for CDN access)
    // Only truncate if extremely long (> 600 chars) - preserve ?lk3s=...&x-expires=...&x-signature=...
    if(imgUrl.length > 600) {
      imgUrl = imgUrl.substring(0, 600);
    }
    return JSON.stringify({found: foundPrompt, prompt: prompt.substring(0, 500), imageUrl: imgUrl});
  })()`;

  const result = browserAction({ action: 'evaluate', script });
  if (!result || !result.result) return null;
  
  try {
    const data = JSON.parse(result.result);
    if (data.found && data.prompt && data.prompt.length > 10) {
      return { prompt: data.prompt, imageUrl: data.imageUrl || null };
    }
    return null;
  } catch (e) {
    return null;
  }
}


/**
 * 主爬取函数
 */
async function crawl() {
  const db = new Database(DB_PATH);
  
  // 获取已有的图片 URL 用于去重
  const existingUrls = new Set(
    db.prepare('SELECT image_url FROM items').all().map(r => {
      // 提取 URL 中的核心部分用于匹配（去掉签名参数）
      const url = r.image_url || '';
      const match = url.match(/tos-cn-i-[^/]+\/([^~?]+)/);
      return match ? match[1] : url;
    })
  );
  
  const existingPrompts = new Set(
    db.prepare('SELECT prompt FROM items').all().map(r => r.prompt.trim().substring(0, 50))
  );
  
  console.log(`数据库已有 ${existingUrls.size} 个图片, ${existingPrompts.size} 个prompt`);
  
  const insertStmt = db.prepare(`
    INSERT INTO items (title, prompt, image_url, thumbnail_url, subcategory_id, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  
  let totalAdded = 0;
  let totalSkipped = 0;
  
  for (const { keyword, subcategoryId } of SEARCH_KEYWORDS) {
    console.log(`\n===== 搜索关键词: "${keyword}" (分类ID: ${subcategoryId}) =====`);
    
    // 导航到搜索结果页
    const encodedKeyword = encodeURIComponent(keyword);
    const searchUrl = `https://jimeng.jianying.com/ai-tool/search-result?result=${encodedKeyword}&type=inspiration`;
    
    if (!navigateAndWait(searchUrl, 5000)) {
      console.error(`  导航失败，跳过`);
      continue;
    }
    
    // 提取搜索结果的 key 列表
    const keys = extractSearchKeys();
    console.log(`  找到 ${keys.length} 个搜索结果`);
    
    if (keys.length === 0) continue;
    
    // 逐个访问详情页获取 prompt 和图片
    let addedForKeyword = 0;
    const maxItems = 15; // 每个关键词最多取15个
    
    for (let i = 0; i < Math.min(keys.length, maxItems); i++) {
      const key = keys[i];
      if (!key) continue;
      
      // 访问详情页
      const detailUrl = `https://jimeng.jianying.com/ai-tool/work-detail/${key}`;
      if (!navigateAndWait(detailUrl, 3500)) {
        console.log(`  [${i+1}] 导航详情页失败: ${key}`);
        continue;
      }
      
      // 提取 prompt 和图片 URL
      const detailData = extractDetailData();
      if (!detailData || !detailData.prompt) {
        console.log(`  [${i+1}/${Math.min(keys.length, maxItems)}] 未找到prompt: ${key}`);
        continue;
      }
      
      const { prompt, imageUrl } = detailData;
      
      // Prompt 去重
      const promptKey = prompt.trim().substring(0, 50);
      if (existingPrompts.has(promptKey)) {
        console.log(`  [${i+1}/${Math.min(keys.length, maxItems)}] 跳过(prompt重复): ${promptKey.substring(0, 30)}...`);
        totalSkipped++;
        continue;
      }
      
      // URL 去重
      if (imageUrl) {
        const urlCore = imageUrl.match(/tos-cn-i-[^/]+\/([^~?]+)/);
        const urlKey = urlCore ? urlCore[1] : imageUrl;
        if (existingUrls.has(urlKey)) {
          console.log(`  [${i+1}/${Math.min(keys.length, maxItems)}] 跳过(URL重复): ${key}`);
          totalSkipped++;
          continue;
        }
      }
      
      // 构造最终 URL
      const finalImageUrl = imageUrl || `https://jimeng.jianying.com/work/${key}`;
      const thumbnailUrl = imageUrl ? imageUrl.replace(/aigc_resize:\d+:\d+/, 'aigc_resize:480:480') : finalImageUrl;
      
      // 生成标题（取 prompt 前20个字）
      const title = prompt.substring(0, 20).replace(/[，。、；：！？\s]/g, '').trim();
      
      // 写入数据库
      try {
        insertStmt.run(title, prompt, finalImageUrl, thumbnailUrl, subcategoryId, 0);
        if (imageUrl) {
          const urlCore = imageUrl.match(/tos-cn-i-[^/]+\/([^~?]+)/);
          existingUrls.add(urlCore ? urlCore[1] : imageUrl);
        }
        existingPrompts.add(promptKey);
        addedForKeyword++;
        totalAdded++;
        console.log(`  [${i+1}/${Math.min(keys.length, maxItems)}] ✓ 已添加: "${title}" (${prompt.length}字)`);
      } catch (e) {
        console.error(`  [${i+1}] 写入失败: ${e.message}`);
      }
    }
    
    console.log(`  关键词"${keyword}"完成: 新增 ${addedForKeyword} 条`);
  }
  
  db.close();
  console.log(`\n===== 爬取完成 =====`);
  console.log(`新增: ${totalAdded} 条`);
  console.log(`跳过(重复): ${totalSkipped} 条`);
  console.log(`数据库总计: ${374 + totalAdded} 条`);
}

crawl().catch(e => {
  console.error('爬取出错:', e);
  process.exit(1);
});
