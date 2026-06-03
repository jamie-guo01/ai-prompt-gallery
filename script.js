// ============ State ============
let categoriesData = []; // raw API data
let currentView = 'home'; // 'home' | 'category'
let currentCatId = null; // selected category id
let currentSubId = null; // selected subcategory id
let allItems = []; // flat list for search/detail

// ============ Init ============
document.addEventListener('DOMContentLoaded', () => {
    loadData();
    setupSearch();
    setupDetail();
    setupContact();
    setupCursorFollower();
    setupTrailEffect();
    playIntroAnimation();
});

// ============ Intro Animation ============
function playIntroAnimation() {
    if (!window.gsap) return;

    const topbar = document.querySelector('.topbar');
    if (topbar) {
        gsap.from(topbar, {
            opacity: 0,
            duration: 0.8,
            ease: 'power2.out',
        });
    }
}

// ============ Home Intro Animation ============
function playHomeIntro() {
    if (!window.gsap) return;

    const hero = document.querySelector('.home-hero');
    if (!hero) return;

    const h1 = hero.querySelector('h1');
    const p = hero.querySelector('p');
    const sections = document.querySelectorAll('.home-section');

    // Only animate position (y) and opacity, never hide with visibility
    // This prevents content from being permanently hidden if animation fails
    gsap.timeline({ defaults: { ease: 'power4.out' } })
        .from(h1, {
            y: 40,
            opacity: 0,
            duration: 1,
        })
        .from(p, {
            y: 30,
            opacity: 0,
            duration: 0.8,
        }, '-=0.6')
        .from(sections, {
            y: 60,
            opacity: 0,
            duration: 0.9,
            stagger: 0.12,
        }, '-=0.4');
}

// ============ Data Loading ============
async function loadData() {
    try {
        // Try static JSON first, fallback to API (for local dev)
        let data;
        try {
            const res = await fetch('data.json');
            if (res.ok) {
                data = await res.json();
            } else {
                throw new Error('no static data');
            }
        } catch (e) {
            const res = await fetch('/api/all?limit=200');
            data = await res.json();
        }

        categoriesData = data;

        // Build flat allItems
        allItems = [];
        categoriesData.forEach(cat => {
            cat.subcategories.forEach(sub => {
                sub.items.forEach(item => {
                    allItems.push({
                        ...item,
                        imageUrl: item.image_url || '',
                        category: cat.name,
                        subcategory: sub.name
                    });
                });
            });
        });

        renderNav();
        renderHome();
    } catch (err) {
        console.error('加载数据失败:', err);
        document.getElementById('grid').innerHTML = `
            <div style="text-align:center;padding:60px 20px;color:#999;grid-column:1/-1;">
                <p>数据加载失败，请确保服务器已启动</p>
                <p style="font-size:13px;margin-top:8px;color:#666;">运行 <code>node server.js</code> 启动后端服务</p>
            </div>
        `;
    }
}

// ============ Navigation ============
function renderNav() {
    const nav = document.getElementById('primaryNav');
    if (!nav) return;

    let html = '<button type="button" data-view="home" class="active">首页</button>';
    categoriesData.forEach(cat => {
        html += `<button type="button" data-cat="${cat.id}">${cat.name}</button>`;
    });
    html += '<span class="nav-indicator" id="navIndicator" aria-hidden="true"></span>';
    nav.innerHTML = html;

    // Bind clicks
    nav.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
            nav.querySelectorAll('button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            if (btn.dataset.view === 'home') {
                switchToHome();
            } else {
                const catId = parseInt(btn.dataset.cat);
                switchToCategory(catId);
            }
        });
    });
}

function switchToHome() {
    currentView = 'home';
    currentCatId = null;
    currentSubId = null;
    document.getElementById('layout').dataset.view = 'home';
    renderHome();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function switchToCategory(catId) {
    currentView = 'category';
    currentCatId = catId;

    const cat = categoriesData.find(c => c.id === catId);
    if (!cat) return;

    // Default to first subcategory
    currentSubId = cat.subcategories.length > 0 ? cat.subcategories[0].id : null;

    document.getElementById('layout').dataset.view = 'category';
    renderSidebar(cat);
    renderCategoryGrid();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ============ Home View ============
function renderHome() {
    const grid = document.getElementById('grid');
    if (!grid) return;

    const totalCount = allItems.length;
    let html = `
        <section class="home-hero">
            <h1>给互联网设计师的 AI 图片提示词灵感库</h1>
            <p>已收录 ${totalCount}+ 张图片，覆盖 APP、运营、海报等设计场景，每张图都可直接复制的 AI 提示词，让灵感随取随用</p>
        </section>
        <div class="home-sections">
    `;

    // Define homepage display order (only these subcategories shown on home)
    const homeSubOrder = [
        '3D海报', 'KV海报', '字体设计', 'App图标', '空状态',
        'Banner', '弹窗', '引导页', '拼贴海报', '渐变艺术',
        '科技海报', '电影海报', '艺术海报', '复古海报', '多巴胺',
        '黏土', '夸张', '扁平', '卡通IP', '吉祥物'
    ];

    // Build a flat lookup of all subcategories with their parent category
    const allSubs = [];
    categoriesData.forEach(cat => {
        cat.subcategories.forEach(sub => {
            allSubs.push({ sub, cat });
        });
    });

    homeSubOrder.forEach(name => {
        const found = allSubs.find(s => s.sub.name === name);
        if (!found || found.sub.items.length === 0) return;
        const { sub, cat } = found;

        html += `
                <section class="home-section">
                    <header class="home-section-head">
                        <h2>${sub.name}</h2>
                        <button class="home-view-all" type="button" data-cat="${cat.id}" data-sub="${sub.id}">查看全部</button>
                    </header>
                    <div class="home-section-row">
            `;

        // Show first 5 items (matching reference site)
        sub.items.slice(0, 5).forEach(item => {
            html += renderCard(item);
        });

        html += `</div></section>`;
    });

    html += `</div>`;
    grid.innerHTML = html;
    grid.className = '';

    // Bind card clicks
    bindCardClicks(grid);

    // Play home intro animation
    playHomeIntro();

    // Bind "查看全部" buttons
    grid.querySelectorAll('.home-view-all').forEach(btn => {
        btn.addEventListener('click', () => {
            const catId = parseInt(btn.dataset.cat);
            const subId = parseInt(btn.dataset.sub);

            // Switch to category view with specific subcategory selected
            currentView = 'category';
            currentCatId = catId;
            currentSubId = subId;

            const cat = categoriesData.find(c => c.id === catId);
            if (!cat) return;

            document.getElementById('layout').dataset.view = 'category';

            // Update top nav active state
            const nav = document.getElementById('primaryNav');
            nav.querySelectorAll('button').forEach(b => b.classList.remove('active'));
            const catBtn = nav.querySelector(`button[data-cat="${catId}"]`);
            if (catBtn) catBtn.classList.add('active');

            renderSidebar(cat);
            renderCategoryGrid();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    });
}

// ============ Sidebar ============
function renderSidebar(cat) {
    const subNav = document.getElementById('subNav');
    if (!subNav) return;

    let html = '';
    cat.subcategories.forEach(sub => {
        const isActive = sub.id === currentSubId ? 'active' : '';
        html += `<li><button type="button" data-sub="${sub.id}" class="${isActive}">${sub.name}</button></li>`;
    });
    subNav.innerHTML = html;

    // Bind sub-nav clicks
    subNav.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
            subNav.querySelectorAll('button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentSubId = parseInt(btn.dataset.sub);
            renderCategoryGrid();
        });
    });
}

// ============ Category Grid View ============
async function renderCategoryGrid() {
    const grid = document.getElementById('grid');
    if (!grid || !currentSubId) return;

    grid.className = 'grid';

    // Show loading with existing data first
    const cat = categoriesData.find(c => c.id === currentCatId);
    const sub = cat ? cat.subcategories.find(s => s.id === currentSubId) : null;
    const existingItems = sub ? sub.items : [];

    // Render all items from cached data (static JSON has all items)
    renderGridItems(grid, existingItems);
}

function renderGridItems(grid, items) {
    let html = '';
    items.forEach(item => {
        html += renderCard(item);
    });
    grid.innerHTML = html;
    bindCardClicks(grid);
}

// ============ Card Rendering ============
function renderCard(item) {
    const imgUrl = getImageUrl(item.image_url || item.imageUrl || '');
    const prompt = item.prompt || '';
    const encodedPrompt = encodeURIComponent(prompt);

    return `
        <article class="card" data-item-id="${item.id}" tabindex="0" role="button" aria-label="查看大图" style="aspect-ratio: 9 / 16">
            <img src="${imgUrl}" alt="${item.title || ''}" loading="lazy" decoding="async">
            <div class="card-overlay">
                <p class="card-prompt">${escapeHtml(prompt)}</p>
                <button class="copy-btn" type="button" data-prompt="${encodedPrompt}">复制提示词</button>
            </div>
        </article>
    `;
}

function bindCardClicks(container) {
    container.querySelectorAll('.card').forEach(card => {
        card.addEventListener('click', (e) => {
            // If copy button clicked, handle copy instead
            if (e.target.closest('.copy-btn')) {
                e.stopPropagation();
                const btn = e.target.closest('.copy-btn');
                const prompt = decodeURIComponent(btn.dataset.prompt);
                copyToClipboard(prompt, btn);
                return;
            }
            const itemId = parseInt(card.dataset.itemId);
            openDetail(itemId);
        });
    });
}

// ============ Utilities ============
function getImageUrl(url) {
    if (!url) return 'https://picsum.photos/400/700';
    if (url.startsWith('http')) return url;
    return 'https://picsum.photos/400/700';
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function copyToClipboard(text, btn) {
    navigator.clipboard.writeText(text).then(() => {
        btn.classList.add('copied');
        btn.textContent = '已复制';
        setTimeout(() => {
            btn.classList.remove('copied');
            btn.textContent = '复制提示词';
        }, 2000);
    });
}

// ============ Search ============
function setupSearch() {
    const overlay = document.getElementById('searchOverlay');
    const input = document.getElementById('searchInput');
    const results = document.getElementById('searchResults');
    const toggle = document.getElementById('searchToggle');

    if (!overlay || !input || !results || !toggle) return;

    toggle.addEventListener('click', () => {
        overlay.classList.add('active');
        setTimeout(() => input.focus(), 100);
    });

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.classList.remove('active');
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            overlay.classList.remove('active');
        }
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault();
            overlay.classList.add('active');
            setTimeout(() => input.focus(), 100);
        }
    });

    let searchTimeout = null;
    input.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        if (!query) {
            results.innerHTML = '<div class="search-hint">输入关键词搜索灵感图片...</div>';
            return;
        }

        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            const lowerQuery = query.toLowerCase();
            const matches = allItems.filter(item => {
                const title = (item.title || '').toLowerCase();
                const prompt = (item.prompt || '').toLowerCase();
                const tags = (item.tags || []).join(' ').toLowerCase();
                return title.includes(lowerQuery) || prompt.includes(lowerQuery) || tags.includes(lowerQuery);
            }).slice(0, 20);

            if (matches.length === 0) {
                results.innerHTML = '<div class="search-hint">未找到相关结果</div>';
                return;
            }

            let html = `<div class="search-result-count">找到 ${matches.length} 个结果</div>`;

            matches.forEach(item => {
                html += `
                    <div class="search-result-item" data-item-id="${item.id}">
                        <div class="search-result-thumb">
                            <img src="${getImageUrl(item.image_url || item.imageUrl)}" alt="">
                        </div>
                        <div class="search-result-info">
                            <div class="search-result-title">${item.title || '无标题'}</div>
                            <div class="search-result-meta">${item.category || ''} · ${item.subcategory || ''}</div>
                        </div>
                    </div>
                `;
            });

            results.innerHTML = html;

            results.querySelectorAll('.search-result-item').forEach(el => {
                el.addEventListener('click', () => {
                    const itemId = parseInt(el.dataset.itemId);
                    overlay.classList.remove('active');
                    openDetail(itemId);
                });
            });
        }, 200);
    });
}

// ============ Detail Modal ============
function setupDetail() {
    const modal = document.getElementById('detailModal');
    if (!modal) return;

    const closeBtn = document.getElementById('detailClose');
    const backdrop = modal.querySelector('.detail-backdrop');

    if (closeBtn) closeBtn.addEventListener('click', () => modal.classList.remove('active'));
    if (backdrop) backdrop.addEventListener('click', () => modal.classList.remove('active'));

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') modal.classList.remove('active');
    });

    const copyBtn = document.getElementById('copyBtn');
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            const prompt = document.getElementById('detailPrompt').textContent;
            navigator.clipboard.writeText(prompt).then(() => {
                copyBtn.classList.add('copied');
                copyBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> 已复制`;
                setTimeout(() => {
                    copyBtn.classList.remove('copied');
                    copyBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg> 复制提示词`;
                }, 2000);
            });
        });
    }
}

// ============ Contact Modal ============
function setupContact() {
    const modal = document.getElementById('contactModal');
    const btn = document.getElementById('contactBtn');
    const closeBtn = document.getElementById('contactClose');
    const backdrop = modal ? modal.querySelector('.contact-backdrop') : null;
    const copyBtn = document.getElementById('contactCopyBtn');

    if (!modal || !btn) return;

    btn.addEventListener('click', (e) => {
        e.preventDefault();
        modal.classList.add('active');
    });

    if (closeBtn) closeBtn.addEventListener('click', () => modal.classList.remove('active'));
    if (backdrop) backdrop.addEventListener('click', () => modal.classList.remove('active'));

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('active')) {
            modal.classList.remove('active');
        }
    });

    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            navigator.clipboard.writeText('jianjianshuile').then(() => {
                copyBtn.classList.add('copied');
                copyBtn.textContent = '已复制';
                setTimeout(() => {
                    copyBtn.classList.remove('copied');
                    copyBtn.textContent = '复制微信号';
                }, 2000);
            });
        });
    }
}

function openDetail(itemId) {
    const foundItem = allItems.find(item => item.id === itemId);
    if (foundItem) {
        showDetailModal(foundItem);
    }
}

function showDetailModal(item) {
    const modal = document.getElementById('detailModal');
    if (!modal) return;

    document.getElementById('detailImg').src = getImageUrl(item.image_url || item.imageUrl || '');
    document.getElementById('detailTitle').textContent = item.title || '';
    document.getElementById('detailPrompt').textContent = item.prompt || '';
    document.getElementById('detailCategory').textContent = item.category || '';
    document.getElementById('detailStyle').textContent = item.subcategory || '';

    modal.classList.add('active');
}

// ============ Cursor Follower (GSAP) ============
function setupCursorFollower() {
    if (!window.gsap || !window.matchMedia('(pointer: fine)').matches) return;

    const cursor = document.getElementById('cursorFollower');
    if (!cursor) return;

    gsap.set(cursor, { xPercent: -50, yPercent: -50 });

    const xTo = gsap.quickTo(cursor, 'x', { duration: 0.36, ease: 'power2.out' });
    const yTo = gsap.quickTo(cursor, 'y', { duration: 0.36, ease: 'power2.out' });

    window.addEventListener('pointermove', (event) => {
        cursor.classList.add('visible');
        xTo(event.clientX);
        yTo(event.clientY);
    });

    document.addEventListener('pointerleave', () => {
        cursor.classList.remove('visible');
    });
}

// ============ Trail Effect (Hero Area, GSAP) ============
function setupTrailEffect() {
    if (!window.gsap || !window.matchMedia('(pointer: fine)').matches) return;

    const config = {
        mouseThreshold: 100,
        minImageSize: 120,
        maxImageSize: 240,
        lifespan: 0.1,
        inDuration: 0.45,
        outDuration: 0.65,
        speedSmoothing: 0.25
    };

    let imageIndex = 0;
    let lastX = 0;
    let lastY = 0;
    let lastTime = performance.now();
    let smoothedSpeed = 0;
    let maxSpeed = 0.5;
    let hasPointer = false;
    let heroEl = null;

    // Use the same trail images as fanghome
    const trailImageUrls = [
        './assets/trail-01.webp',
        './assets/trail-02.webp',
        './assets/trail-03.webp',
        './assets/trail-04.webp',
        './assets/trail-05.webp',
        './assets/trail-06.webp',
        './assets/trail-07.webp',
        './assets/trail-08.webp',
        './assets/trail-09.webp',
        './assets/trail-10.webp',
        './assets/trail-11.webp',
        './assets/trail-12.webp',
        './assets/trail-13.webp',
        './assets/trail-14.webp',
    ];

    // Preload images
    if (window.matchMedia('(pointer: fine)').matches) {
        trailImageUrls.forEach(src => {
            const img = new Image();
            img.decoding = 'async';
            img.src = src;
        });
    }

    function getRelativePoint(event) {
        const rect = heroEl.getBoundingClientRect();
        return {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top
        };
    }

    function getSpeed(x, y) {
        const now = performance.now();
        const distance = Math.hypot(x - lastX, y - lastY);
        const delta = Math.max(now - lastTime, 16);
        const rawSpeed = distance / delta;

        maxSpeed = Math.max(maxSpeed, rawSpeed);
        smoothedSpeed = smoothedSpeed * (1 - config.speedSmoothing) +
            Math.min(rawSpeed / maxSpeed, 1) * config.speedSmoothing;

        lastTime = now;
        return smoothedSpeed;
    }

    function createTrailImage(x, y, speed) {
        if (!heroEl || trailImageUrls.length === 0) return;

        const img = document.createElement('img');
        const imageSize = config.minImageSize + (config.maxImageSize - config.minImageSize) * speed;
        const rotation = gsap.utils.random(-28, 28) * (1 + speed);

        img.className = 'trail-img';
        img.src = trailImageUrls[imageIndex];
        img.alt = '';
        img.decoding = 'async';
        imageIndex = (imageIndex + 1) % trailImageUrls.length;
        heroEl.appendChild(img);

        gsap.set(img, {
            x,
            y,
            xPercent: -50,
            yPercent: -50,
            width: imageSize,
            height: 'auto',
            rotation,
            scale: 0,
            autoAlpha: 0
        });

        gsap.timeline({ onComplete: () => img.remove() })
            .to(img, {
                scale: 1,
                autoAlpha: 1,
                duration: config.inDuration,
                ease: 'power3.out'
            })
            .to(img, {
                scale: 0,
                rotation: rotation + 180,
                autoAlpha: 0,
                duration: config.outDuration,
                ease: 'power3.inOut'
            }, `+=${config.lifespan}`);
    }

    function bindHeroEvents() {
        heroEl = document.querySelector('.home-hero');
        if (!heroEl) return;

        heroEl.addEventListener('pointerenter', (event) => {
            const point = getRelativePoint(event);
            lastX = point.x;
            lastY = point.y;
            lastTime = performance.now();
            hasPointer = true;
        });

        heroEl.addEventListener('pointerleave', () => {
            hasPointer = false;
        });

        heroEl.addEventListener('pointermove', (event) => {
            const point = getRelativePoint(event);
            const distance = Math.hypot(point.x - lastX, point.y - lastY);

            if (!hasPointer || distance < config.mouseThreshold) return;

            const speed = getSpeed(point.x, point.y);
            createTrailImage(point.x, point.y, speed);
            lastX = point.x;
            lastY = point.y;
        });
    }

    // Watch for hero element appearing (since it's dynamically rendered)
    const observer = new MutationObserver(() => {
        const newHero = document.querySelector('.home-hero');
        if (newHero && newHero !== heroEl) {
            heroEl = null;
            hasPointer = false;
            bindHeroEvents();
        }
    });

    observer.observe(document.getElementById('grid') || document.body, {
        childList: true,
        subtree: true
    });

    // Initial setup if hero already exists
    setTimeout(() => {
        bindHeroEvents();
    }, 500);
}
