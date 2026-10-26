/* ============================================
   ODOD PIZZA — общий скрипт для всех страниц
   ============================================ */

const DELIVERY_PRICE = 200;
const FREE_DELIVERY_FROM = 700;

const DRINKS_LIST = [
    { id: 201, name: 'Кока-Кола 0,5 л',        price: 150, image: 'images/cola.jpg' },
    { id: 202, name: 'Фанта 0,5 л',            price: 150, image: 'images/fanta.jpg' },
    { id: 203, name: 'Спрайт 0,5 л',           price: 150, image: 'images/sprite.jpg' },
    { id: 204, name: 'Апельсиновый сок 0,4 л', price: 180, image: 'images/juice.jpg' },
    { id: 205, name: 'Вода 0,5 л',             price: 100, image: 'images/water.jpg' },
    { id: 206, name: 'Молочный коктейль',      price: 220, image: 'images/milkshake.jpg' }
];

const PROMOCODES = {
    'FIRST20':  { type: 'percent', value: 20, label: '−20% на первый заказ' },
    'TWOPIZZA': { type: 'twoForOne', requiredName: 'Маргарита', requiredQty: 2, label: '2-я Маргарита в подарок' },
    'ORDER10':  { type: 'percent', value: 10, label: '−10% на заказ' },
    'SET15':    { type: 'percentOnSet', value: 15, label: '−15% на сеты' },
    'DRINK':    { type: 'freeDrink', minOrderSum: 150, label: 'Напиток в подарок' }
};

let MENU_CACHE = [];
let allOrders = [];
let showingAllOrders = false;
let reviewOrderId = null;
let reviewRating = 0;
let currentUserProfile = null;
let currentAdminTab = 'orders';
let currentUserTab = 'orders';
let currentFeedbackList = [];
let replyFeedbackId = null;
let hasUnreadFeedback = false;

// ============================================
// АВТОРИЗАЦИЯ
// ============================================
function getCurrentUser() {
    return JSON.parse(localStorage.getItem('ododCurrentUser')) || null;
}

function setCurrentUser(user) {
    if (user) localStorage.setItem('ododCurrentUser', JSON.stringify(user));
    else localStorage.removeItem('ododCurrentUser');
    renderAuthBlock();
}

function logout() {
    if (confirm('Выйти из профиля?')) {
        setCurrentUser(null);
        localStorage.removeItem('ododUnreadFeedback');
        location.reload();
    }
}

function renderAuthBlock() {
    const container = document.getElementById('authBlock');
    if (!container) return;

    const user = getCurrentUser();

    if (user) {
        const dotHtml = hasUnreadFeedback ? '<span class="unread-dot"></span>' : '';
        container.innerHTML = `
            <div class="user-info">
                <a href="profile.html" class="user-name-wrap">
                    <span class="user-name">👤 ${user.name}</span>
                    ${dotHtml}
                </a>
                <button class="logout-btn" id="logoutBtn" title="Выйти">Выйти</button>
            </div>
        `;
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) logoutBtn.addEventListener('click', logout);
    } else {
        container.innerHTML = `<a href="index2.html" class="login-link">Войти</a>`;
    }
}

async function checkUnreadFeedback() {
    const user = getCurrentUser();
    if (!user) { hasUnreadFeedback = false; return; }

    try {
        const r = await fetch('/api/feedback/unread?user=' + encodeURIComponent(user.login));
        const d = await r.json();
        hasUnreadFeedback = d.ok ? d.hasUnread : false;
    } catch (e) { hasUnreadFeedback = false; }
    renderAuthBlock();
}

// ============================================
// ВХОД / РЕГИСТРАЦИЯ
// ============================================
function initLoginPage() {
    const form = document.getElementById('loginForm');
    if (!form) return;

    form.addEventListener('submit', async function(event) {
        event.preventDefault();
        const login = document.getElementById('login').value.trim();
        const password = document.getElementById('password').value;
        const msg = document.getElementById('formMessage');

        try {
            const response = await fetch('/api/login', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ login, password })
            });
            const data = await response.json();

            if (data.ok) {
                msg.className = 'form-message success';
                msg.textContent = `✅ Добро пожаловать, ${data.user.name}!`;
                setCurrentUser(data.user);
                setTimeout(() => { window.location.href = 'main.html'; }, 800);
            } else {
                msg.className = 'form-message error';
                msg.textContent = `❌ ${data.error}`;
            }
        } catch (e) { console.error(e); }
    });
}

function initRegisterPage() {
    const form = document.getElementById('registerForm');
    if (!form) return;

    form.addEventListener('submit', async function(event) {
        event.preventDefault();
        const name = document.getElementById('name').value.trim();
        const login = document.getElementById('login').value.trim();
        const password = document.getElementById('password').value;
        const password2 = document.getElementById('password2').value;
        const msg = document.getElementById('formMessage');

        if (password !== password2) {
            msg.className = 'form-message error'; msg.textContent = '❌ Пароли не совпадают'; return;
        }

        try {
            const response = await fetch('/api/register', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ login, password, name })
            });
            const data = await response.json();

            if (data.ok) {
                msg.className = 'form-message success'; msg.textContent = '✅ Аккаунт создан!';
                setTimeout(() => { window.location.href = 'index2.html'; }, 1200);
            } else {
                msg.className = 'form-message error'; msg.textContent = `❌ ${data.error}`;
            }
        } catch (e) { console.error(e); }
    });
}

// ============================================
// МЕНЮ И РЕКОМЕНДАЦИИ
// ============================================
async function loadMenu() {
    try {
        const r = await fetch('/api/menu');
        const d = await r.json();
        if (d.ok) MENU_CACHE = d.menu || [];
    } catch (e) { console.error('Ошибка загрузки меню:', e); }
    return MENU_CACHE;
}

function renderPizzaCard(item) {
    const badgeHtml = item.badge ? `<span class="pizza-badge">${item.badge}</span>` : '';
    let imageHtml;
    if (item.category === 'set' && item.images && item.images.length > 1) {
        imageHtml = `<div class="pizza-card-image set-image">${badgeHtml}${item.images.map(img => `<img src="images/${img}" alt="${item.name}">`).join('')}</div>`;
    } else {
        const img = (item.images && item.images[0]) || item.image || 'placeholder.jpg';
        imageHtml = `<div class="pizza-card-image">${badgeHtml}<img src="images/${img}" alt="${item.name}"></div>`;
    }
    const firstImage = (item.images && item.images[0]) || item.image || 'placeholder.jpg';

    return `
        <div class="pizza-card">
            ${imageHtml}
            <div class="pizza-card-body">
                <h3>${item.name}</h3>
                <p>${item.description}</p>
                <div class="pizza-card-footer">
                    <span class="price">${item.price} ₽</span>
                    <button class="btn-small add-to-cart" data-id="${item.id}" data-name="${item.name}" data-price="${item.price}" data-image="images/${firstImage}">🛒 В корзину</button>
                </div>
            </div>
        </div>
    `;
}

async function initMenuRender() {
    const hasMenuContainers = document.getElementById('pizzasGrid') || document.getElementById('featuredPizzas');
    if (!hasMenuContainers) return;

    await loadMenu();
    const pizzas = MENU_CACHE.filter(i => i.category === 'pizza');

    if (document.getElementById('pizzasGrid')) {
        const sets = MENU_CACHE.filter(i => i.category === 'set');
        const drinks = MENU_CACHE.filter(i => i.category === 'drink');
        document.getElementById('pizzasGrid').innerHTML = pizzas.map(renderPizzaCard).join('');
        if (document.getElementById('setsGrid')) document.getElementById('setsGrid').innerHTML = sets.map(renderPizzaCard).join('');
        if (document.getElementById('drinksGrid')) document.getElementById('drinksGrid').innerHTML = drinks.map(renderPizzaCard).join('');
        initAddToCartButtons();
    }
    
    if (document.getElementById('featuredPizzas')) {
        document.getElementById('featuredPizzas').innerHTML = pizzas.slice(0, 3).map(renderPizzaCard).join('');
        initAddToCartButtons();
        loadRecommendations(); // Запускаем рекомендации на главной
    }
}

// --- НОВАЯ ФУНКЦИЯ РЕКОМЕНДАЦИЙ ---
async function loadRecommendations() {
    const user = getCurrentUser();
    const section = document.getElementById('recommendationsSection');
    const grid = document.getElementById('recommendationsGrid');
    
    if (!user || !section || !grid) return;

    try {
        const r = await fetch('/api/recommendations?user=' + encodeURIComponent(user.login));
        const d = await r.json();
        
        if (d.ok && d.recommendations && d.recommendations.length > 0) {
            grid.innerHTML = d.recommendations.map(renderPizzaCard).join('');
            section.style.display = 'block';
            initAddToCartButtons();
        }
    } catch (e) {
        console.error('Ошибка рекомендаций:', e);
    }
}

// ============================================
// КОРЗИНА
// ============================================
function getCart() { return JSON.parse(localStorage.getItem('ododCart')) || []; }
function saveCart(cart) { localStorage.setItem('ododCart', JSON.stringify(cart)); updateCartCount(); }
function updateCartCount() {
    const cart = getCart();
    const total = cart.reduce((sum, item) => sum + item.quantity, 0);
    document.querySelectorAll('.cart-count').forEach(el => el.textContent = total);
}
function getPromo() { return localStorage.getItem('ododPromo') || ''; }
function setPromo(code) {
    if (code) localStorage.setItem('ododPromo', code);
    else localStorage.removeItem('ododPromo');
}
function getGiftDrink() { return JSON.parse(localStorage.getItem('ododGiftDrink')) || null; }
function setGiftDrink(drink) {
    if (drink) localStorage.setItem('ododGiftDrink', JSON.stringify(drink));
    else localStorage.removeItem('ododGiftDrink');
}

function checkPromoConditions(promo, cart, itemsSum) {
    if (promo.type === 'twoForOne') {
        const margarita = cart.find(item => item.name === promo.requiredName);
        if (!margarita || margarita.quantity < promo.requiredQty) {
            return { valid: false, message: `Нужно минимум ${promo.requiredQty} шт. «${promo.requiredName}» в корзине` };
        }
    }
    if (promo.type === 'percentOnSet') {
        const hasSet = cart.some(item => item.name.toLowerCase().includes('сет'));
        if (!hasSet) return { valid: false, message: 'Добавьте хотя бы один сет из 3 пицц' };
    }
    if (promo.type === 'freeDrink') {
        if (itemsSum < promo.minOrderSum) return { valid: false, message: `Сумма заказа должна быть от ${promo.minOrderSum} ₽` };
    }
    return { valid: true, message: '' };
}

function calcDiscount(promo, cart, itemsSum) {
    if (!promo) return { discount: 0, extraText: '' };
    if (promo.type === 'percent') return { discount: Math.round(itemsSum * promo.value / 100), extraText: '' };
    if (promo.type === 'percentOnSet') {
        const setsSum = cart.filter(item => item.name.toLowerCase().includes('сет')).reduce((sum, item) => sum + item.price * item.quantity, 0);
        return { discount: Math.round(setsSum * promo.value / 100), extraText: '(на сеты)' };
    }
    if (promo.type === 'twoForOne') {
        const margarita = cart.find(item => item.name === promo.requiredName);
        if (margarita && margarita.quantity >= 2) {
            return { discount: margarita.price, extraText: `(1 «${promo.requiredName}» в подарок)` };
        }
    }
    return { discount: 0, extraText: '' };
}

function initAddToCartButtons() {
    document.querySelectorAll('.add-to-cart').forEach(btn => {
        if (btn.dataset.bound === '1') return;
        btn.dataset.bound = '1';
        btn.addEventListener('click', function() {
            const id = parseInt(this.dataset.id);
            const name = this.dataset.name;
            const price = parseInt(this.dataset.price);
            const image = this.dataset.image;
            let cart = getCart();
            const existing = cart.find(item => item.id === id);
            if (existing) existing.quantity++;
            else cart.push({ id, name, price, image, quantity: 1 });
            saveCart(cart);
            const originalText = this.innerHTML;
            this.innerHTML = '✅ Добавлено';
            this.style.background = 'linear-gradient(135deg, #4a9428, #2d6b18)';
            setTimeout(() => { this.innerHTML = originalText; this.style.background = ''; }, 1200);
        });
    });
}

function renderBasket() {
    const container = document.getElementById('basketItems');
    const totalBlock = document.getElementById('basketTotal');
    if (!container || !totalBlock) return;
    const cart = getCart();

    if (cart.length === 0) {
        container.innerHTML = `<div class="empty-basket"><div class="empty-basket-icon">🛒</div><h3>Корзина пуста</h3><a href="menu.html" class="btn-small" style="text-decoration:none;">Перейти в меню</a></div>`;
        totalBlock.style.display = 'none';
        return;
    }
    totalBlock.style.display = 'block';

    container.innerHTML = cart.map(item => {
        const isGift = !!item.isGift;
        return `
            <div class="basket-item">
                <div class="basket-item-image">${isGift ? '<span class="free-badge">Подарок</span>' : ''}<img src="${item.image}" alt="${item.name}"></div>
                <div class="basket-item-info"><h3>${item.name}</h3><p class="${isGift ? 'free-price' : ''}">${isGift ? '🎁 Бесплатно' : item.price + ' ₽ за шт.'}</p></div>
                <div class="quantity-control">
                    <button class="quantity-btn" data-action="minus" data-id="${item.id}" ${isGift ? 'disabled' : ''}>−</button>
                    <span class="quantity-value">${item.quantity}</span>
                    <button class="quantity-btn" data-action="plus" data-id="${item.id}" ${isGift ? 'disabled' : ''}>+</button>
                </div>
                <div class="basket-item-right">
                    <span class="basket-item-price ${isGift ? 'free' : ''}">${isGift ? '0 ₽' : item.price * item.quantity + ' ₽'}</span>
                    <button class="remove-btn" data-action="remove" data-id="${item.id}">🗑 Удалить</button>
                </div>
            </div>
        `;
    }).join('');

    container.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', function() {
            const action = this.dataset.action;
            const id = this.dataset.id;
            if (action === 'plus') changeQuantity(id, 1);
            else if (action === 'minus') changeQuantity(id, -1);
            else if (action === 'remove') removeItem(id);
        });
    });

    const itemsSum = cart.filter(item => !item.isGift).reduce((total, item) => total + item.price * item.quantity, 0);
    const count = cart.reduce((total, item) => total + item.quantity, 0);
    document.getElementById('totalItems').textContent = count;
    document.getElementById('itemsSum').textContent = `${itemsSum} ₽`;

    const promoCode = getPromo();
    const promo = promoCode ? PROMOCODES[promoCode] : null;
    let discount = 0;
    let deliveryCost = itemsSum >= FREE_DELIVERY_FROM ? 0 : DELIVERY_PRICE;
    let extraNote = '';

    if (promo) {
        const check = checkPromoConditions(promo, cart, itemsSum);
        if (check.valid) {
            const result = calcDiscount(promo, cart, itemsSum);
            discount = result.discount;
            extraNote = result.extraText;
        } else {
            setPromo(''); setGiftDrink(null);
            let cleanCart = getCart().filter(item => !item.isGift);
            localStorage.setItem('ododCart', JSON.stringify(cleanCart));
        }
    }

    const discountRow = document.getElementById('discountRow');
    if (discount > 0 && promo) {
        discountRow.style.display = 'flex';
        document.getElementById('discountPercent').textContent = `${promo.label} ${extraNote}`;
        document.getElementById('discountAmount').textContent = `−${discount} ₽`;
    } else { discountRow.style.display = 'none'; }

    const gift = getGiftDrink();
    const freeRow = document.getElementById('freeItemRow');
    if (promo && promo.type === 'freeDrink' && gift) {
        freeRow.style.display = 'flex';
        document.getElementById('freeItemName').textContent = gift.name;
    } else { freeRow.style.display = 'none'; }

    const deliveryEl = document.getElementById('delivery');
    if (deliveryCost === 0) {
        deliveryEl.textContent = 'Бесплатно'; deliveryEl.style.color = '#4a9428'; deliveryEl.style.fontWeight = '700';
    } else {
        deliveryEl.textContent = `${deliveryCost} ₽`; deliveryEl.style.color = ''; deliveryEl.style.fontWeight = '';
    }

    const total = itemsSum - discount + deliveryCost;
    document.getElementById('totalPrice').textContent = `${total} ₽`;
    renderPromoActiveBlock();
}

function renderPromoActiveBlock() {
    const block = document.getElementById('promoActiveBlock');
    const input = document.getElementById('promoInput');
    const applyBtn = document.getElementById('promoApplyBtn');
    if (!block) return;

    const promoCode = getPromo();
    if (promoCode && PROMOCODES[promoCode]) {
        const promo = PROMOCODES[promoCode];
        block.innerHTML = `
            <div class="promo-active">
                <div><div class="promo-active-text">Промокод применён</div><div class="promo-active-code">${promoCode} — ${promo.label}</div></div>
                <button class="promo-remove-btn" id="promoRemoveBtn" title="Отменить">✕</button>
            </div>
        `;
        const removeBtn = document.getElementById('promoRemoveBtn');
        if (removeBtn) removeBtn.addEventListener('click', removePromo);
        input.disabled = true; input.value = promoCode; applyBtn.disabled = true;
        applyBtn.style.opacity = '0.5'; applyBtn.style.cursor = 'not-allowed';
    } else {
        block.innerHTML = ''; input.disabled = false; input.value = ''; applyBtn.disabled = false;
        applyBtn.style.opacity = ''; applyBtn.style.cursor = '';
    }
}

function removeItem(id) {
    let cart = getCart().filter(item => String(item.id) !== String(id));
    saveCart(cart);
    const gift = getGiftDrink();
    if (gift && String(gift.id) === String(id)) setGiftDrink(null);
    const promoCode = getPromo();
    if (promoCode) {
        const promo = PROMOCODES[promoCode];
        const itemsSum = cart.filter(i => !i.isGift).reduce((s, i) => s + i.price * i.quantity, 0);
        const check = checkPromoConditions(promo, cart, itemsSum);
        if (!check.valid) { setPromo(''); setGiftDrink(null); }
    }
    renderBasket();
}

function changeQuantity(id, delta) {
    let cart = getCart();
    const item = cart.find(i => String(i.id) === String(id));
    if (!item || item.isGift) return;
    item.quantity += delta;
    if (item.quantity <= 0) cart = cart.filter(i => String(i.id) !== String(id));
    saveCart(cart);
    const promoCode = getPromo();
    if (promoCode) {
        const promo = PROMOCODES[promoCode];
        const itemsSum = cart.filter(i => !i.isGift).reduce((s, i) => s + i.price * i.quantity, 0);
        const check = checkPromoConditions(promo, cart, itemsSum);
        if (!check.valid) { setPromo(''); setGiftDrink(null); }
    }
    renderBasket();
}

function removePromo() {
    setPromo(''); setGiftDrink(null);
    let cart = getCart().filter(item => !item.isGift);
    saveCart(cart);
    const input = document.getElementById('promoInput');
    const msg = document.getElementById('promoMessage');
    if (input) input.value = '';
    if (msg) { msg.className = 'promo-message'; msg.textContent = ''; }
    renderBasket();
}

function applyPromo() {
    const input = document.getElementById('promoInput');
    const msg = document.getElementById('promoMessage');
    if (!input || !msg) return;
    const code = input.value.trim().toUpperCase();
    if (!code) { msg.className = 'promo-message error'; msg.textContent = 'Введите промокод'; return; }
    if (!PROMOCODES[code]) { msg.className = 'promo-message error'; msg.textContent = '❌ Такого промокода не существует'; return; }
    
    const cart = getCart();
    const itemsSum = cart.filter(item => !item.isGift).reduce((total, item) => total + item.price * item.quantity, 0);
    const promo = PROMOCODES[code];
    const check = checkPromoConditions(promo, cart, itemsSum);
    if (!check.valid) { msg.className = 'promo-message error'; msg.textContent = `❌ ${check.message}`; return; }

    if (promo.type === 'freeDrink') {
        setPromo(code); msg.className = 'promo-message success'; msg.textContent = `✅ Промокод «${code}» применён! Выберите напиток`;
        openDrinkModal(); return;
    }
    setPromo(code); msg.className = 'promo-message success'; msg.textContent = `✅ Промокод «${code}» применён!`;
    renderBasket();
}

function openDrinkModal() {
    const modal = document.getElementById('drinkModal');
    const options = document.getElementById('drinkOptions');
    if (!modal || !options) return;
    options.innerHTML = DRINKS_LIST.map(drink => `
        <div class="drink-option" data-drink-id="${drink.id}">
            <div class="drink-option-image"><img src="${drink.image}" alt="${drink.name}"></div>
            <div class="drink-option-text"><h4>${drink.name}</h4><span>Бесплатно по промокоду</span></div>
            <div class="drink-option-price">${drink.price} ₽ → 0 ₽</div>
        </div>
    `).join('');
    options.querySelectorAll('.drink-option').forEach(opt => {
        opt.addEventListener('click', function() { selectGiftDrink(parseInt(this.dataset.drinkId)); });
    });
    modal.classList.add('show');
}

function closeDrinkModal() {
    const modal = document.getElementById('drinkModal');
    if (!modal) return;
    modal.classList.remove('show');
    if (!getGiftDrink()) {
        setPromo('');
        const msg = document.getElementById('promoMessage');
        if (msg) { msg.className = 'promo-message'; msg.textContent = ''; }
        renderBasket();
    }
}

function selectGiftDrink(drinkId) {
    const drink = DRINKS_LIST.find(d => d.id === drinkId);
    if (!drink) return;
    setGiftDrink(drink);
    let cart = getCart().filter(item => !item.isGift);
    cart.push({ id: 'gift-' + drink.id, name: drink.name + ' (подарок)', price: 0, image: drink.image, quantity: 1, isGift: true });
    saveCart(cart);
    closeDrinkModal();
    renderBasket();
    const msg = document.getElementById('promoMessage');
    if (msg) { msg.className = 'promo-message success'; msg.textContent = `✅ «${drink.name}» добавлен в подарок!`; }
}

function initBasketPage() {
    const promoApplyBtn = document.getElementById('promoApplyBtn');
    const promoInput = document.getElementById('promoInput');
    const clearBtn = document.getElementById('clearBtn');
    const checkoutBtn = document.getElementById('checkoutBtn');
    if (!promoApplyBtn) return;

    promoApplyBtn.addEventListener('click', applyPromo);
    promoInput.addEventListener('keypress', function(e) { if (e.key === 'Enter') { e.preventDefault(); applyPromo(); } });

    clearBtn.addEventListener('click', function() {
        if (confirm('Очистить всю корзину?')) {
            localStorage.removeItem('ododCart'); localStorage.removeItem('ododPromo'); localStorage.removeItem('ododGiftDrink');
            updateCartCount(); renderBasket();
        }
    });

    checkoutBtn.addEventListener('click', async function() {
        const user = getCurrentUser();
        if (!user) { alert('Чтобы оформить заказ, войдите в профиль'); window.location.href = 'index2.html'; return; }
        const cart = getCart();
        if (cart.length === 0) { alert('Корзина пуста!'); return; }

        const items = cart.map(i => ({ name: i.name, price: i.price, quantity: i.quantity }));
        const itemsSum = cart.filter(i => !i.isGift).reduce((s, i) => s + i.price * i.quantity, 0);
        const promoCode = getPromo();
        const promo = promoCode ? PROMOCODES[promoCode] : null;
        let discount = 0;
        if (promo) {
            const result = calcDiscount(promo, cart, itemsSum);
            discount = result.discount;
            if (promo.type === 'freeDrink') discount += 150;
        }
        const deliveryCost = itemsSum >= FREE_DELIVERY_FROM ? 0 : DELIVERY_PRICE;
        const total = itemsSum - discount + deliveryCost;

        try {
            const response = await fetch('/api/order', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userLogin: user.login, items, itemsSum, discount, delivery: deliveryCost, total, promo: promoCode })
            });
            const data = await response.json();
            if (data.ok) {
                alert('✅ Заказ оформлен! Спасибо за покупку!');
                localStorage.removeItem('ododCart'); localStorage.removeItem('ododPromo'); localStorage.removeItem('ododGiftDrink');
                updateCartCount(); renderBasket(); window.location.href = 'profile.html';
            } else { alert('❌ ' + (data.error || 'Не удалось оформить заказ')); }
        } catch (e) { alert('❌ Ошибка соединения с сервером'); }
    });

    const modal = document.getElementById('drinkModal');
    if (modal) { modal.addEventListener('click', function(e) { if (e.target === modal) closeDrinkModal(); }); }
    renderBasket();
    if (getPromo() === 'DRINK' && !getGiftDrink()) openDrinkModal();
}

// ============================================
// ПРОФИЛЬ
// ============================================
function initProfilePage() {
    const container = document.getElementById('profileContent');
    if (!container) return;
    const user = getCurrentUser();
    if (!user) { window.location.href = 'index2.html'; return; }

    currentUserProfile = user;
    const admin = user.role === 'admin';

    document.getElementById('profileSubtitle').textContent = admin ? 'Панель администратора' : 'Ваши заказы и обращения';
    container.innerHTML = `
        <div class="profile-greeting">
            <div><h2>Привет, <span>${user.name}</span>! 👋</h2><p>Логин: <strong>${user.login}</strong></p></div>
            <div class="profile-badge">${admin ? '🛡 Администратор' : '👤 Пользователь'}</div>
        </div>
        <div id="profileTabsBlock"></div>
        <div id="profileTabContent"></div>
    `;

    if (admin) renderAdminTabs();
    else renderUserTabs();
}

function renderUserTabs() {
    const tabs = document.getElementById('profileTabsBlock');
    const dotHtml = hasUnreadFeedback ? '<span class="tab-dot"></span>' : '';
    tabs.innerHTML = `
        <div class="profile-tabs">
            <button class="profile-tab ${currentUserTab === 'orders' ? 'active' : ''}" data-tab="orders">📦 Мои заказы</button>
            <button class="profile-tab ${currentUserTab === 'feedback' ? 'active' : ''}" data-tab="feedback">📩 Мои обращения${dotHtml}</button>
        </div>
    `;
    tabs.querySelectorAll('.profile-tab').forEach(btn => {
        btn.addEventListener('click', function() { currentUserTab = this.dataset.tab; renderUserTabs(); renderUserContent(); });
    });
    renderUserContent();
}

async function renderUserContent() {
    const content = document.getElementById('profileTabContent');
    content.innerHTML = '<div class="empty-profile"><h3>Загрузка...</h3></div>';
    if (currentUserTab === 'orders') await renderUserOrders();
    else if (currentUserTab === 'feedback') { await markFeedbackRead(); await renderUserFeedback(); }
}

async function renderUserOrders() {
    const user = currentUserProfile;
    const content = document.getElementById('profileTabContent');
    let orders = [];
    try {
        const r = await fetch('/api/orders?user=' + encodeURIComponent(user.login));
        const d = await r.json();
        if (d.ok) orders = d.orders;
    } catch (e) { console.error(e); }

    if (orders.length === 0) {
        content.innerHTML = `<div class="empty-profile"><div class="empty-profile-icon">📦</div><h3>Заказов пока нет</h3><p>Самое время заказать что-нибудь вкусное!</p><a href="menu.html" class="btn-small" style="text-decoration:none;">Перейти в меню</a></div>`;
        return;
    }
    allOrders = orders; showingAllOrders = false;
    renderOrdersListForUser();
}

function renderOrdersListForUser() {
    const content = document.getElementById('profileTabContent');
    const orders = showingAllOrders ? allOrders : allOrders.slice(0, 5);
    let html = orders.map(o => renderOrderCard(o, false)).join('');
    if (allOrders.length > 5) {
        html += `<button class="show-more-btn" id="showMoreBtn">${showingAllOrders ? '▲ Свернуть' : `▼ Показать все заказы (${allOrders.length})`}</button>`;
    }
    content.innerHTML = html;
    const btn = document.getElementById('showMoreBtn');
    if (btn) { btn.addEventListener('click', function() { showingAllOrders = !showingAllOrders; renderOrdersListForUser(); }); }
    content.querySelectorAll('[data-review]').forEach(b => {
        b.addEventListener('click', function() { openReviewModal(parseInt(this.dataset.review)); });
    });
    loadOrderReviews(content);
}

async function renderUserFeedback() {
    const user = currentUserProfile;
    const content = document.getElementById('profileTabContent');
    let list = [];
    try {
        const r = await fetch('/api/feedback?user=' + encodeURIComponent(user.login));
        const d = await r.json();
        if (d.ok) list = d.feedback;
    } catch (e) { console.error(e); }

    if (list.length === 0) {
        content.innerHTML = `<div class="empty-profile"><div class="empty-profile-icon">📩</div><h3>Обращений пока нет</h3><p>Напишите нам через форму на странице контактов</p><a href="contacts.html" class="btn-small" style="text-decoration:none;">Написать нам</a></div>`;
        return;
    }
    content.innerHTML = list.map(f => renderFeedbackCardUser(f)).join('');
}

async function markFeedbackRead() {
    const user = currentUserProfile;
    if (!user) return;
    try {
        await fetch('/api/feedback/read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userLogin: user.login }) });
        hasUnreadFeedback = false;
        renderAuthBlock();
    } catch (e) { console.error(e); }
}

function renderOrderCard(order, admin) {
    const date = new Date(order.createdAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const itemsHtml = order.items.map(i => `<div class="order-item-row"><span>${i.name}</span><span>×${i.quantity} — ${i.price * i.quantity} ₽</span></div>`).join('');
    const adminUserHtml = admin ? `<div class="order-user">👤 ${order.userName} (${order.userLogin})</div>` : '';
    let reviewHtml = '';
    if (admin) {
        reviewHtml = order.reviewed ? `<div class="order-review" data-order-review="${order.id}"><div class="order-review-stars">⏳ Загрузка...</div></div>` : `<div class="order-review-empty">💬 Отзыва нет</div>`;
    } else {
        reviewHtml = order.reviewed ? `<div class="order-review" data-order-review="${order.id}"><div class="order-review-stars">⏳ Загрузка...</div></div>` : `<div class="order-actions" style="margin-top:15px;"><button class="btn-small" data-review="${order.id}">⭐ Оставить отзыв</button></div>`;
    }
    return `
        <div class="order-card">
            <div class="order-header"><div><div class="order-id">📦 Заказ №${order.id}</div><div class="order-date">${date}</div>${adminUserHtml}</div><div class="order-status">${order.status}</div></div>
            <div class="order-items">${itemsHtml}</div>
            <div class="order-footer"><div class="order-total">${order.total} ₽</div></div>
            ${reviewHtml}
        </div>
    `;
}

async function loadOrderReviews(container) {
    const placeholders = container.querySelectorAll('[data-order-review]');
    if (placeholders.length === 0) return;
    let reviews = [];
    try {
        const r = await fetch('/api/reviews');
        const d = await r.json();
        if (d.ok) reviews = d.reviews;
    } catch (e) { console.error(e); }

    placeholders.forEach(placeholder => {
        const orderId = parseInt(placeholder.dataset.orderReview);
        const review = reviews.find(rv => rv.orderId === orderId);
        if (!review) { placeholder.outerHTML = `<div class="order-review-empty">💬 Отзыва нет</div>`; return; }
        const stars = '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating);
        const date = new Date(review.createdAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        placeholder.innerHTML = `<div class="order-review-stars">${stars}</div><div class="order-review-text">"${review.comment}"</div><div class="order-review-date">📅 ${date}</div>`;
    });
}

function renderFeedbackCardUser(f) {
    const date = new Date(f.createdAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const statusClass = f.processed ? 'processed' : 'new';
    const statusText = f.processed ? '✅ Обработано' : '⏳ Ожидает ответа';
    let replyHtml = '';
    if (f.reply) {
        const replyDate = f.repliedAt ? new Date(f.repliedAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
        replyHtml = `<div class="feedback-reply"><div class="feedback-reply-label">💬 Ответ администратора:</div><div class="feedback-reply-text">${f.reply}</div>${replyDate ? `<div class="feedback-reply-date">📅 ${replyDate}</div>` : ''}</div>`;
    } else {
        replyHtml = `<div class="feedback-pending">⏳ Мы получили ваше обращение и скоро ответим</div>`;
    }
    return `
        <div class="feedback-card">
            <div class="feedback-header"><div><div class="feedback-id">📩 Обращение №${f.id}</div></div><div class="feedback-status ${statusClass}">${statusText}</div></div>
            <div class="feedback-email">📧 ${f.email}</div><div class="feedback-message">${f.message}</div>${replyHtml}
            <div class="feedback-footer"><div class="order-date">📅 ${date}</div></div>
        </div>
    `;
}

function renderFeedbackCardAdmin(f) {
    const date = new Date(f.createdAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const statusClass = f.processed ? 'processed' : 'new';
    const statusText = f.processed ? '✅ Обработано' : '⏳ Не обработано';
    let replyHtml = '';
    if (f.reply) {
        const replyDate = f.repliedAt ? new Date(f.repliedAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
        replyHtml = `<div class="feedback-reply"><div class="feedback-reply-label">💬 Ваш ответ:</div><div class="feedback-reply-text">${f.reply}</div>${replyDate ? `<div class="feedback-reply-date">📅 ${replyDate}</div>` : ''}<div class="feedback-reply-actions"><button class="btn-edit-reply" data-edit-reply="${f.id}">✏️ Изменить</button><button class="btn-delete-reply" data-delete-reply="${f.id}">🗑 Удалить ответ</button></div></div>`;
    }
    const replyButton = !f.reply ? `<button class="btn-reply" data-reply="${f.id}">✉️ Ответить</button>` : '';
    return `
        <div class="feedback-card">
            <div class="feedback-header"><div><div class="feedback-id">📩 Обращение №${f.id}</div><div class="feedback-user">👤 ${f.userName} (${f.userLogin})</div></div><div class="feedback-status ${statusClass}">${statusText}</div></div>
            <div class="feedback-email">📧 ${f.email}</div><div class="feedback-message">${f.message}</div>${replyHtml}
            <div class="feedback-footer"><div class="order-date">📅 ${date}</div><div class="feedback-actions">${replyButton}<button class="btn-delete" data-delete="${f.id}">🗑 Удалить</button></div></div>
        </div>
    `;
}

function openReviewModal(orderId) {
    const modal = document.getElementById('reviewModal');
    if (!modal) return;
    reviewOrderId = orderId; reviewRating = 0;
    document.querySelectorAll('#starRating .star').forEach(s => s.classList.remove('active'));
    document.getElementById('reviewComment').value = '';
    document.getElementById('reviewMessage').textContent = '';
    document.getElementById('reviewMessage').className = 'promo-message';
    modal.classList.add('show');
}

function closeReviewModal() {
    const modal = document.getElementById('reviewModal');
    if (!modal) return;
    modal.classList.remove('show');
    reviewOrderId = null; reviewRating = 0;
}

function initReviewStars() {
    const stars = document.querySelectorAll('#starRating .star');
    if (!stars.length) return;
    stars.forEach(star => {
        star.addEventListener('mouseenter', function() { const r = parseInt(this.dataset.rating); stars.forEach(s => { s.classList.toggle('active', parseInt(s.dataset.rating) <= r); }); });
        star.addEventListener('mouseleave', function() { stars.forEach(s => { s.classList.toggle('active', parseInt(s.dataset.rating) <= reviewRating); }); });
        star.addEventListener('click', function() { reviewRating = parseInt(this.dataset.rating); stars.forEach(s => { s.classList.toggle('active', parseInt(s.dataset.rating) <= reviewRating); }); });
    });
}

async function submitReview() {
    const user = getCurrentUser();
    const msg = document.getElementById('reviewMessage');
    const comment = document.getElementById('reviewComment').value.trim();
    if (!user) return;
    if (reviewRating < 1) { msg.className = 'promo-message error'; msg.textContent = '❌ Поставьте оценку'; return; }
    if (!comment) { msg.className = 'promo-message error'; msg.textContent = '❌ Напишите комментарий'; return; }
    try {
        const response = await fetch('/api/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: reviewOrderId, userLogin: user.login, rating: reviewRating, comment }) });
        const data = await response.json();
        if (data.ok) { msg.className = 'promo-message success'; msg.textContent = '✅ Отзыв отправлен!'; setTimeout(() => { closeReviewModal(); renderUserContent(); }, 1000); }
        else { msg.className = 'promo-message error'; msg.textContent = `❌ ${data.error}`; }
    } catch (e) { msg.className = 'promo-message error'; msg.textContent = '❌ Ошибка'; }
}

function renderAdminTabs() {
    const tabs = document.getElementById('profileTabsBlock');
    tabs.innerHTML = `<div class="profile-tabs"><button class="profile-tab ${currentAdminTab === 'orders' ? 'active' : ''}" data-tab="orders">📦 Заказы</button><button class="profile-tab ${currentAdminTab === 'reviews' ? 'active' : ''}" data-tab="reviews">⭐ Отзывы</button><button class="profile-tab ${currentAdminTab === 'feedback' ? 'active' : ''}" data-tab="feedback">📩 Feedback</button></div>`;
    tabs.querySelectorAll('.profile-tab').forEach(btn => { btn.addEventListener('click', function() { currentAdminTab = this.dataset.tab; renderAdminTabs(); renderAdminContent(); }); });
    renderAdminContent();
}

async function renderAdminContent() {
    const content = document.getElementById('profileTabContent');
    content.innerHTML = '<div class="empty-profile"><h3>Загрузка...</h3></div>';
    if (currentAdminTab === 'orders') await renderAdminOrders();
    else if (currentAdminTab === 'reviews') await renderAdminReviews();
    else if (currentAdminTab === 'feedback') await renderAdminFeedback();
}

async function renderAdminOrders() {
    const content = document.getElementById('profileTabContent');
    const user = getCurrentUser();
    let orders = [];
    try { const r = await fetch('/api/orders/all?user=' + user.login); const d = await r.json(); if (d.ok) orders = d.orders; } catch (e) { console.error(e); }
    const totalOrders = orders.length;
    const totalRevenue = orders.reduce((s, o) => s + (o.total || 0), 0);
    const avgCheck = totalOrders ? (totalRevenue / totalOrders) : 0;
    let ordersHtml = orders.length === 0 ? `<div class="empty-profile"><h3>Заказов пока нет</h3></div>` : orders.map(o => renderOrderCard(o, true)).join('');
    content.innerHTML = `<div class="stats-grid"><div class="stat-card"><div class="stat-icon">📦</div><div class="stat-value">${totalOrders}</div><div class="stat-label">Всего заказов</div></div><div class="stat-card"><div class="stat-icon">💰</div><div class="stat-value">${totalRevenue} ₽</div><div class="stat-label">Общая выручка</div></div><div class="stat-card"><div class="stat-icon">🧾</div><div class="stat-value">${Math.round(avgCheck)} ₽</div><div class="stat-label">Средний чек</div></div></div><h3 style="font-size:22px; margin-bottom:15px; color:#1a1a1a;">Все заказы</h3>${ordersHtml}`;
    loadOrderReviews(content);
}

async function renderAdminReviews() {
    const content = document.getElementById('profileTabContent');
    let reviews = [];
    try { const r = await fetch('/api/reviews'); const d = await r.json(); if (d.ok) reviews = d.reviews; } catch (e) { console.error(e); }
    const count = reviews.length; const avg = count ? (reviews.reduce((s, r) => s + r.rating, 0) / count) : 0;
    let reviewsHtml = count === 0 ? `<div class="empty-profile"><h3>Отзывов пока нет</h3></div>` : reviews.map(r => `<div class="review-admin-card"><div class="review-admin-header"><div><div class="review-admin-stars">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</div><div class="review-admin-rating">${r.rating}/5</div></div><div class="review-admin-user">👤 ${r.userName} (${r.userLogin})</div></div><div class="review-admin-comment">"${r.comment}"</div><div class="review-admin-footer"><div class="review-admin-order">К заказу №${r.orderId}</div><button class="btn-delete" data-delete-review="${r.id}">🗑 Удалить</button></div></div>`).join('');
    content.innerHTML = `<div class="avg-rating-block"><div class="avg-rating-value">${avg.toFixed(2)}</div><div class="avg-rating-stars">${'★'.repeat(Math.round(avg))}${'☆'.repeat(5 - Math.round(avg))}</div><div class="avg-rating-count">${count} ${declineReviews(count)}</div></div><h3 style="font-size:22px; margin-bottom:15px; color:#1a1a1a;">Все отзывы</h3>${reviewsHtml}`;
    content.querySelectorAll('[data-delete-review]').forEach(btn => { btn.addEventListener('click', async function() { if (!confirm('Удалить отзыв?')) return; try { const u = getCurrentUser(); await fetch('/api/review/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ admin: u.login, reviewId: parseInt(this.dataset.deleteReview) }) }); renderAdminReviews(); } catch (e) {} }); });
}

async function renderAdminFeedback() {
    const content = document.getElementById('profileTabContent');
    const user = getCurrentUser();
    let list = [];
    try { const r = await fetch('/api/feedback/all?user=' + user.login); const d = await r.json(); if (d.ok) list = d.feedback; } catch (e) { console.error(e); }
    currentFeedbackList = list;
    let html = list.length === 0 ? `<div class="empty-profile"><h3>Обращений пока нет</h3></div>` : list.map(f => renderFeedbackCardAdmin(f)).join('');
    content.innerHTML = `<h3 style="font-size:22px; margin-bottom:15px; color:#1a1a1a;">Обращения</h3>${html}`;
    content.querySelectorAll('[data-reply]').forEach(btn => { btn.addEventListener('click', function() { openReplyModal(parseInt(this.dataset.reply)); }); });
    content.querySelectorAll('[data-edit-reply]').forEach(btn => { btn.addEventListener('click', function() { openReplyModal(parseInt(this.dataset.editReply)); }); });
    content.querySelectorAll('[data-delete-reply]').forEach(btn => { btn.addEventListener('click', async function() { if (!confirm('Удалить ответ?')) return; await fetch('/api/feedback/reply/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ admin: user.login, fbId: parseInt(this.dataset.deleteReply) }) }); renderAdminFeedback(); }); });
    content.querySelectorAll('[data-delete]').forEach(btn => { btn.addEventListener('click', async function() { if (!confirm('Удалить обращение?')) return; await fetch('/api/feedback/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ admin: user.login, fbId: parseInt(this.dataset.delete) }) }); renderAdminFeedback(); }); });
}

function openReplyModal(fbId) {
    const modal = document.getElementById('replyModal');
    if (!modal) return;
    const fb = currentFeedbackList.find(f => f.id === fbId);
    if (!fb) return;
    replyFeedbackId = fbId;
    document.getElementById('replyModalSubtitle').textContent = `Обращение №${fb.id} от ${fb.userName} (${fb.userLogin})`;
    document.getElementById('replyModalQuote').innerHTML = `<strong>Обращение:</strong>«${fb.message}»`;
    document.getElementById('replyText').value = fb.reply || '';
    document.getElementById('replyMessage').textContent = '';
    document.getElementById('replyMessage').className = 'promo-message';
    const aiBtn = document.getElementById('aiSuggestBtn');
    if (aiBtn) { aiBtn.disabled = false; aiBtn.innerHTML = '✨ Предложить ответ с помощью ИИ'; }
    modal.classList.add('show');
}

function closeReplyModal() {
    const modal = document.getElementById('replyModal');
    if (!modal) return;
    modal.classList.remove('show'); replyFeedbackId = null;
}

async function submitReply() {
    const user = getCurrentUser();
    const msg = document.getElementById('replyMessage');
    const text = document.getElementById('replyText').value.trim();
    if (!user || !replyFeedbackId) return;
    if (!text) { msg.className = 'promo-message error'; msg.textContent = '❌ Введите текст ответа'; return; }
    try {
        await fetch('/api/feedback/reply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ admin: user.login, fbId: replyFeedbackId, reply: text }) });
        msg.className = 'promo-message success'; msg.textContent = '✅ Ответ сохранён!';
        setTimeout(() => { closeReplyModal(); renderAdminFeedback(); }, 800);
    } catch (e) { msg.className = 'promo-message error'; msg.textContent = '❌ Ошибка'; }
}

async function suggestAiReply() {
    const user = getCurrentUser();
    const msg = document.getElementById('replyMessage');
    const textarea = document.getElementById('replyText');
    const aiBtn = document.getElementById('aiSuggestBtn');
    if (!user || !replyFeedbackId) return;
    const fb = currentFeedbackList.find(f => f.id === replyFeedbackId);
    if (!fb) return;

    aiBtn.disabled = true; aiBtn.innerHTML = '✨ Генерирую...';
    msg.className = 'promo-message'; msg.textContent = '';

    try {
        const response = await fetch('/api/feedback/suggest-reply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ admin: user.login, message: fb.message }) });
        const data = await response.json();
        if (data.ok) {
            textarea.value = data.reply; textarea.focus();
            msg.className = 'promo-message success'; msg.textContent = '✅ Ответ сгенерирован!';
        } else {
            msg.className = 'promo-message error'; msg.textContent = `❌ ${data.error}`;
        }
    } catch (e) { msg.className = 'promo-message error'; msg.textContent = '❌ Ошибка сети'; }
    finally { aiBtn.disabled = false; aiBtn.innerHTML = '✨ Предложить ответ с помощью ИИ'; }
}

function declineReviews(n) { const m10 = n % 10; const m100 = n % 100; if (m10 === 1 && m100 !== 11) return 'отзыв'; if ([2,3,4].includes(m10) && ![12,13,14].includes(m100)) return 'отзыва'; return 'отзывов'; }

// ============================================
// ЭКСПОРТ И ИНИЦИАЛИЗАЦИЯ
// ============================================
function initContactForm() {
    const area = document.getElementById('contactFormArea');
    if (!area) return;
    const user = getCurrentUser();
    if (!user) { area.innerHTML = `<div class="login-hint">💬 Войдите, чтобы отправить нам сообщение</div><a href="index2.html" class="login-to-send">Войти и отправить</a>`; return; }
    area.innerHTML = `<form id="contactForm"><div class="form-group"><label for="fbEmail">Email</label><input type="email" id="fbEmail" placeholder="your@email.ru" required></div><div class="form-group"><label for="fbMessage">Сообщение</label><textarea id="fbMessage" placeholder="Напишите ваш вопрос или отзыв..." required></textarea></div><button type="submit">Отправить сообщение</button><div class="promo-message" id="fbMessageStatus"></div></form>`;
    document.getElementById('contactForm').addEventListener('submit', async function(event) {
        event.preventDefault();
        const email = document.getElementById('fbEmail').value.trim(); const message = document.getElementById('fbMessage').value.trim(); const status = document.getElementById('fbMessageStatus');
        try {
            const response = await fetch('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userLogin: user.login, userName: user.name, email, message }) });
            const data = await response.json();
            if (data.ok) { status.className = 'promo-message success'; status.textContent = '✅ Сообщение отправлено!'; this.reset(); }
            else { status.className = 'promo-message error'; status.textContent = `❌ ${data.error}`; }
        } catch (e) { status.className = 'promo-message error'; status.textContent = '❌ Ошибка'; }
    });
}

function initPromoCopyButtons() {
    document.querySelectorAll('.promo-code-copy').forEach(btn => { btn.addEventListener('click', function() { const code = this.dataset.code; const originalText = this.textContent; navigator.clipboard.writeText(code).then(() => { this.textContent = '✅ Скопировано'; this.style.background = 'linear-gradient(135deg, #4a9428, #2d6b18)'; this.style.color = '#fff'; setTimeout(() => { this.textContent = originalText; this.style.background = ''; this.style.color = ''; }, 1500); }); }); });
}

function initMenuCategories() {
    const categoryBtns = document.querySelectorAll('.category-btn');
    const sections = { pizzas: document.getElementById('pizzas'), sets: document.getElementById('sets'), drinks: document.getElementById('drinks') };
    if (!categoryBtns.length || !sections.pizzas) return;
    function activateCategory(target) { categoryBtns.forEach(btn => { btn.classList.toggle('active', btn.dataset.target === target); }); }
    categoryBtns.forEach(btn => { btn.addEventListener('click', function(e) { e.preventDefault(); const target = this.dataset.target; const section = sections[target]; if (section) { const offset = 150; const top = section.getBoundingClientRect().top + window.pageYOffset - offset; window.scrollTo({ top, behavior: 'smooth' }); activateCategory(target); } }); });
    function updateActiveByScroll() { const scrollY = window.pageYOffset; const offset = 200; let current = 'pizzas'; Object.entries(sections).forEach(([key, section]) => { if (section && section.offsetTop - offset <= scrollY) current = key; }); const nearBottom = window.innerHeight + scrollY >= document.body.offsetHeight - 50; if (nearBottom) current = 'drinks'; activateCategory(current); }
    window.addEventListener('scroll', updateActiveByScroll); window.addEventListener('load', updateActiveByScroll); updateActiveByScroll();
}

window.changeQuantity = changeQuantity; window.removeItem = removeItem; window.removePromo = removePromo; window.selectGiftDrink = selectGiftDrink; window.closeDrinkModal = closeDrinkModal; window.closeReviewModal = closeReviewModal; window.closeReplyModal = closeReplyModal; window.logout = logout;

document.addEventListener('DOMContentLoaded', async function() {
    updateCartCount(); renderAuthBlock(); await checkUnreadFeedback(); await initMenuRender();
    initAddToCartButtons(); initPromoCopyButtons(); initMenuCategories(); initLoginPage(); initRegisterPage(); initContactForm(); initBasketPage(); initProfilePage(); initReviewStars();
    const submitBtn = document.getElementById('reviewSubmitBtn'); if (submitBtn) submitBtn.addEventListener('click', submitReview);
    const replySubmitBtn = document.getElementById('replySubmitBtn'); if (replySubmitBtn) replySubmitBtn.addEventListener('click', submitReply);
    const aiSuggestBtn = document.getElementById('aiSuggestBtn'); if (aiSuggestBtn) aiSuggestBtn.addEventListener('click', suggestAiReply);
    const replyModal = document.getElementById('replyModal'); if (replyModal) replyModal.addEventListener('click', function(e) { if (e.target === replyModal) closeReplyModal(); });
});