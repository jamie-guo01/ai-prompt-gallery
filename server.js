const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = 3000;

// 数据库连接
const dbPath = path.join(__dirname, 'prompthub.db');
const db = new Database(dbPath, { readonly: true });

// 启用 WAL 模式提升读取性能
db.pragma('journal_mode = WAL');

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // 提供静态文件（HTML/CSS/JS）

// ============ API 路由 ============

// 获取所有分类（含子分类和每子分类的条目数量）
app.get('/api/categories', (req, res) => {
  const categories = db.prepare('SELECT * FROM categories ORDER BY sort_order').all();
  const subcategories = db.prepare(`
    SELECT s.*, COUNT(i.id) as item_count
    FROM subcategories s
    LEFT JOIN items i ON i.subcategory_id = s.id
    GROUP BY s.id
    ORDER BY s.sort_order
  `).all();

  const result = categories.map(cat => ({
    ...cat,
    subcategories: subcategories.filter(sub => sub.category_id === cat.id)
  }));

  res.json(result);
});

// 获取所有数据（分类 + 子分类 + 条目）— 首页用，每子分类只返回前 20 条
app.get('/api/all', (req, res) => {
  const limit = parseInt(req.query.limit) || 20; // 每子分类默认 20 条

  const categories = db.prepare('SELECT * FROM categories ORDER BY sort_order').all();
  const subcategories = db.prepare(`
    SELECT s.*, COUNT(i.id) as total_count
    FROM subcategories s
    LEFT JOIN items i ON i.subcategory_id = s.id
    GROUP BY s.id
    ORDER BY s.sort_order
  `).all();

  // 为每个子分类获取前 N 条
  const getItemsStmt = db.prepare(`
    SELECT i.* FROM items i
    WHERE i.subcategory_id = ?
    ORDER BY i.likes DESC, i.sort_order ASC
    LIMIT ?
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
      icon: cat.icon,
      subcategories: catSubs.map(sub => {
        const items = getItemsStmt.all(sub.id, limit);
        return {
          id: sub.id,
          name: sub.name,
          total_count: sub.total_count,
          items: items.map(item => ({
            ...item,
            tags: getTagsStmt.all(item.id).map(t => t.name)
          }))
        };
      })
    };
  });

  res.json(result);
});

// 获取指定分类的条目（分页）
app.get('/api/categories/:id/items', (req, res) => {
  const categoryId = req.params.id;
  const limit = parseInt(req.query.limit) || 20;
  const offset = parseInt(req.query.offset) || 0;

  const total = db.prepare(`
    SELECT COUNT(*) as count FROM items i
    JOIN subcategories s ON i.subcategory_id = s.id
    WHERE s.category_id = ?
  `).get(categoryId);

  const items = db.prepare(`
    SELECT i.*, s.name as subcategory_name
    FROM items i
    JOIN subcategories s ON i.subcategory_id = s.id
    WHERE s.category_id = ?
    ORDER BY i.likes DESC, i.sort_order ASC
    LIMIT ? OFFSET ?
  `).all(categoryId, limit, offset);

  const getTagsStmt = db.prepare(`
    SELECT t.name FROM tags t
    JOIN item_tags it ON t.id = it.tag_id
    WHERE it.item_id = ?
  `);

  const result = items.map(item => ({
    ...item,
    tags: getTagsStmt.all(item.id).map(t => t.name)
  }));

  res.json({
    items: result,
    total: total.count,
    limit,
    offset,
    hasMore: offset + limit < total.count
  });
});

// 获取指定子分类的条目（分页）
app.get('/api/subcategories/:id/items', (req, res) => {
  const subId = req.params.id;
  const limit = parseInt(req.query.limit) || 20;
  const offset = parseInt(req.query.offset) || 0;

  const total = db.prepare('SELECT COUNT(*) as count FROM items WHERE subcategory_id = ?').get(subId);

  const items = db.prepare(`
    SELECT i.* FROM items i
    WHERE i.subcategory_id = ?
    ORDER BY i.likes DESC, i.sort_order ASC
    LIMIT ? OFFSET ?
  `).all(subId, limit, offset);

  const getTagsStmt = db.prepare(`
    SELECT t.name FROM tags t
    JOIN item_tags it ON t.id = it.tag_id
    WHERE it.item_id = ?
  `);

  const result = items.map(item => ({
    ...item,
    tags: getTagsStmt.all(item.id).map(t => t.name)
  }));

  res.json({
    items: result,
    total: total.count,
    limit,
    offset,
    hasMore: offset + limit < total.count
  });
});

// 获取单个条目详情
app.get('/api/items/:id', (req, res) => {
  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(req.params.id);
  if (!item) {
    return res.status(404).json({ error: 'Item not found' });
  }

  const tags = db.prepare(`
    SELECT t.name FROM tags t
    JOIN item_tags it ON t.id = it.tag_id
    WHERE it.item_id = ?
  `).all(item.id).map(t => t.name);

  res.json({ ...item, tags });
});

// 搜索（分页）
app.get('/api/search', (req, res) => {
  const query = req.query.q;
  const limit = parseInt(req.query.limit) || 50;
  const offset = parseInt(req.query.offset) || 0;

  if (!query || query.trim().length === 0) {
    return res.json({ items: [], total: 0, hasMore: false });
  }

  const searchTerm = `%${query.trim()}%`;

  const total = db.prepare(`
    SELECT COUNT(DISTINCT i.id) as count
    FROM items i
    LEFT JOIN item_tags it ON i.id = it.item_id
    LEFT JOIN tags t ON it.tag_id = t.id
    WHERE i.title LIKE ?
       OR i.prompt LIKE ?
       OR t.name LIKE ?
  `).get(searchTerm, searchTerm, searchTerm);

  const items = db.prepare(`
    SELECT DISTINCT i.*, s.name as subcategory_name, c.name as category_name
    FROM items i
    JOIN subcategories s ON i.subcategory_id = s.id
    JOIN categories c ON s.category_id = c.id
    LEFT JOIN item_tags it ON i.id = it.item_id
    LEFT JOIN tags t ON it.tag_id = t.id
    WHERE i.title LIKE ?
       OR i.prompt LIKE ?
       OR t.name LIKE ?
    ORDER BY i.likes DESC
    LIMIT ? OFFSET ?
  `).all(searchTerm, searchTerm, searchTerm, limit, offset);

  const getTagsStmt = db.prepare(`
    SELECT t.name FROM tags t
    JOIN item_tags it ON t.id = it.tag_id
    WHERE it.item_id = ?
  `);

  const result = items.map(item => ({
    ...item,
    tags: getTagsStmt.all(item.id).map(t => t.name)
  }));

  res.json({
    items: result,
    total: total.count,
    limit,
    offset,
    hasMore: offset + limit < total.count
  });
});

// 获取所有标签
app.get('/api/tags', (req, res) => {
  const tags = db.prepare(`
    SELECT t.name, COUNT(it.item_id) as count
    FROM tags t
    LEFT JOIN item_tags it ON t.id = it.tag_id
    GROUP BY t.id
    ORDER BY count DESC
  `).all();

  res.json(tags);
});

// 按标签筛选（分页）
app.get('/api/tags/:name/items', (req, res) => {
  const tagName = req.params.name;
  const limit = parseInt(req.query.limit) || 20;
  const offset = parseInt(req.query.offset) || 0;

  const total = db.prepare(`
    SELECT COUNT(*) as count
    FROM items i
    JOIN item_tags it ON i.id = it.item_id
    JOIN tags t ON it.tag_id = t.id
    WHERE t.name = ?
  `).get(tagName);

  const items = db.prepare(`
    SELECT i.*, s.name as subcategory_name
    FROM items i
    JOIN subcategories s ON i.subcategory_id = s.id
    JOIN item_tags it ON i.id = it.item_id
    JOIN tags t ON it.tag_id = t.id
    WHERE t.name = ?
    ORDER BY i.likes DESC
    LIMIT ? OFFSET ?
  `).all(tagName, limit, offset);

  const getTagsStmt = db.prepare(`
    SELECT t.name FROM tags t
    JOIN item_tags it ON t.id = it.tag_id
    WHERE it.item_id = ?
  `);

  const result = items.map(item => ({
    ...item,
    tags: getTagsStmt.all(item.id).map(t => t.name)
  }));

  res.json({
    items: result,
    total: total.count,
    limit,
    offset,
    hasMore: offset + limit < total.count
  });
});

// ============ 启动服务器 ============

app.listen(PORT, () => {
  console.log(`\n🚀 PromptHub API 服务器已启动`);
  console.log(`   地址: http://localhost:${PORT}`);
  console.log(`   API:  http://localhost:${PORT}/api/all`);
  console.log(`   搜索: http://localhost:${PORT}/api/search?q=关键词`);
  console.log(`   分页: http://localhost:${PORT}/api/subcategories/1/items?limit=20&offset=0\n`);
});

// 优雅关闭
process.on('SIGINT', () => {
  db.close();
  process.exit(0);
});
