/**
 * 数据导出与部署脚本
 * 
 * 将 SQLite 数据库导出为 data.json，并推送到 GitHub 触发 Netlify 自动部署。
 * 
 * 用法：
 *   node scripts/export-and-deploy.js [--export-only] [--no-push]
 * 
 * 参数：
 *   --export-only   仅导出 JSON，不执行 git 操作
 *   --no-push       执行 git commit 但不 push
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ============ 配置 ============
const PROJECT_DIR = path.join(__dirname, '..');
const DB_PATH = path.join(PROJECT_DIR, 'prompthub.db');
const OUTPUT_PATH = path.join(PROJECT_DIR, 'data.json');

// ============ 工具函数 ============

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    exportOnly: args.includes('--export-only'),
    noPush: args.includes('--no-push'),
  };
}

function runGit(command) {
  try {
    const output = execSync(command, { 
      cwd: PROJECT_DIR, 
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return output.trim();
  } catch (error) {
    console.error(`   Git 命令失败: ${command}`);
    console.error(`   ${error.stderr || error.message}`);
    throw error;
  }
}

// ============ 主逻辑 ============

function exportData() {
  console.log('📤 导出数据库为 JSON...');
  
  const db = new Database(DB_PATH, { readonly: true });
  db.pragma('journal_mode = WAL');
  
  // 获取分类结构（与 server.js 的 /api/all 逻辑一致）
  const categories = db.prepare('SELECT * FROM categories ORDER BY sort_order').all();
  const subcategories = db.prepare(`
    SELECT s.*, COUNT(i.id) as total_count
    FROM subcategories s
    LEFT JOIN items i ON i.subcategory_id = s.id
    GROUP BY s.id
    ORDER BY s.sort_order
  `).all();
  
  const getItemsStmt = db.prepare(`
    SELECT i.* FROM items i
    WHERE i.subcategory_id = ?
    ORDER BY i.likes DESC, i.sort_order ASC
  `);
  
  const getTagsStmt = db.prepare(`
    SELECT t.name FROM tags t
    JOIN item_tags it ON t.id = it.tag_id
    WHERE it.item_id = ?
  `);
  
  const result = categories.map(cat => {
    const catSubs = subcategories.filter(sub => sub.category_id === cat.id);
    return {
      id: cat.id,
      name: cat.name,
      icon: cat.icon || '',
      subcategories: catSubs.map(sub => {
        const items = getItemsStmt.all(sub.id);
        return {
          id: sub.id,
          name: sub.name,
          total_count: sub.total_count,
          items: items.map(item => ({
            ...item,
            tags: getTagsStmt.all(item.id).map(t => t.name),
          })),
        };
      }),
    };
  });
  
  // 统计
  const totalItems = db.prepare('SELECT COUNT(*) as count FROM items').get();
  
  db.close();
  
  // 写入 JSON
  const jsonStr = JSON.stringify(result, null, 0); // 紧凑格式减小体积
  fs.writeFileSync(OUTPUT_PATH, jsonStr, 'utf-8');
  
  const fileSizeKB = Math.round(fs.statSync(OUTPUT_PATH).size / 1024);
  
  console.log(`   ✅ 导出完成`);
  console.log(`   文件: ${OUTPUT_PATH}`);
  console.log(`   大小: ${fileSizeKB} KB`);
  console.log(`   总条目: ${totalItems.count}`);
  
  return totalItems.count;
}

function deployToGithub(options, totalItems) {
  if (options.exportOnly) {
    console.log('\n📦 仅导出模式，跳过 Git 操作');
    return;
  }
  
  console.log('\n🚀 推送到 GitHub...');
  
  // 检查是否有变更
  const status = runGit('git status --porcelain data.json');
  if (!status) {
    console.log('   ℹ️ data.json 无变化，跳过提交');
    return;
  }
  
  // 添加并提交
  const timestamp = new Date().toISOString().slice(0, 10);
  const commitMsg = `chore: update data.json (${totalItems} items) - ${timestamp}`;
  
  runGit('git add data.json');
  runGit(`git commit -m "${commitMsg}"`);
  console.log(`   ✅ 已提交: ${commitMsg}`);
  
  if (options.noPush) {
    console.log('   ℹ️ --no-push 模式，跳过 push');
    return;
  }
  
  // 推送
  console.log('   推送中...');
  runGit('git push');
  console.log('   ✅ 已推送到 GitHub');
  
  // 直接通过 Netlify CLI 部署（确保立即生效）
  console.log('   Netlify 部署中...');
  try {
    execSync('netlify deploy --prod --dir=.', {
      cwd: PROJECT_DIR,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    console.log('   ✅ Netlify 部署完成');
  } catch (e) {
    console.log('   ⚠️ Netlify CLI 部署失败，等待自动部署');
  }
  console.log('   🌐 https://jamie-ai-prompt-gallery.netlify.app');
}

// ============ 入口 ============

function main() {
  const options = parseArgs();
  
  console.log('🔄 数据导出与部署工具');
  console.log(`   数据库: ${DB_PATH}`);
  console.log(`   输出: ${OUTPUT_PATH}`);
  console.log('');
  
  // 检查数据库是否存在
  if (!fs.existsSync(DB_PATH)) {
    console.error(`❌ 数据库不存在: ${DB_PATH}`);
    process.exit(1);
  }
  
  // 导出
  const totalItems = exportData();
  
  // 部署
  deployToGithub(options, totalItems);
  
  console.log('\n✅ 全部完成！');
}

main();
