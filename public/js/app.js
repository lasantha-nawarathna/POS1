let categories = [];
let products = [];
let cart = [];
let settings = {};
let currentUser = null;
let authToken = null;
let activeCategory = null;
let paymentMethod = 'cash';
let numpadValue = '0';
let currentOrderTotal = 0;
let currentReportTab = 'sales';

// ─── Init ─────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  authToken = localStorage.getItem('pos_token');
  if (authToken) {
    checkSession();
  }
  updateDateTime();
  setInterval(updateDateTime, 1000);
  document.addEventListener('click', (e) => {
    const menu = document.getElementById('userMenu');
    if (menu.style.display === 'block' && !e.target.closest('.user-badge') && !e.target.closest('.user-menu')) {
      menu.style.display = 'none';
    }
  });
});

function updateDateTime() {
  const now = new Date();
  const el = document.getElementById('dateTime');
  if (el) el.textContent = now.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

// ─── API Helper ───────────────────────────────
async function api(url, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (authToken) headers['X-Auth-Token'] = authToken;

  const res = await fetch(url, {
    ...options,
    headers: options.headers || headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  if (res.status === 401) {
    handleLogout();
    throw new Error('Session expired');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

async function apiUpload(url, formData) {
  const headers = {};
  if (authToken) headers['X-Auth-Token'] = authToken;
  const res = await fetch(url, { method: 'POST', headers, body: formData });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Upload failed');
  }
  return res.json();
}

// ─── Toast ────────────────────────────────────
function toast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ─── Auth ─────────────────────────────────────
async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('loginUsername').value;
  const password = document.getElementById('loginPassword').value;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    if (!res.ok) {
      const err = await res.json();
      toast(err.error || 'Login failed', 'error');
      return;
    }

    const data = await res.json();
    authToken = data.token;
    currentUser = data.user;
    localStorage.setItem('pos_token', authToken);
    enterApp();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function checkSession() {
  try {
    currentUser = await api('/api/auth/me');
    enterApp();
  } catch {
    localStorage.removeItem('pos_token');
    authToken = null;
  }
}

function enterApp() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('app').style.display = '';
  document.getElementById('userName').textContent = currentUser.name;

  if (currentUser.role !== 'admin') {
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
  } else {
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = '');
  }

  initApp();
}

function handleLogout() {
  if (authToken) {
    fetch('/api/auth/logout', { method: 'POST', headers: { 'X-Auth-Token': authToken } }).catch(() => {});
  }
  authToken = null;
  currentUser = null;
  localStorage.removeItem('pos_token');
  document.getElementById('loginScreen').style.display = '';
  document.getElementById('app').style.display = 'none';
  document.getElementById('loginPassword').value = '';
  document.getElementById('userMenu').style.display = 'none';
}

function showUserMenu() {
  const menu = document.getElementById('userMenu');
  menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
}

function openPasswordModal() {
  document.getElementById('userMenu').style.display = 'none';
  document.getElementById('pwd_current').value = '';
  document.getElementById('pwd_new').value = '';
  document.getElementById('pwd_confirm').value = '';
  openModal('passwordModal');
}

async function changePassword(e) {
  e.preventDefault();
  const current = document.getElementById('pwd_current').value;
  const newPwd = document.getElementById('pwd_new').value;
  const confirm = document.getElementById('pwd_confirm').value;

  if (newPwd !== confirm) { toast('Passwords do not match', 'error'); return; }

  try {
    await api('/api/auth/password', { method: 'PUT', body: { current_password: current, new_password: newPwd } });
    toast('Password changed');
    closeModal('passwordModal');
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ─── App Init ─────────────────────────────────
async function initApp() {
  await loadSettings();
  await loadCategories();
  await loadProducts();
  setReportToday();
}

// ─── Views ────────────────────────────────────
function showView(view) {
  if (view === 'admin' && currentUser.role !== 'admin') {
    toast('Admin access required', 'error');
    return;
  }
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(`${view}View`).classList.add('active');

  if (view === 'orders') loadOrders();
  if (view === 'reports') loadReports();
  if (view === 'storage') loadStorageReport();
  if (view === 'admin') { loadAdminProducts(); loadAdminCategories(); loadAdminUsers(); loadSettingsForm(); }
}

// ─── Settings ─────────────────────────────────
async function loadSettings() {
  settings = await api('/api/settings');
  document.getElementById('storeName').textContent = settings.store_name || 'My Store';
}

async function loadSettingsForm() {
  settings = await api('/api/settings');
  document.getElementById('set_store_name').value = settings.store_name || '';
  document.getElementById('set_tax_rate').value = settings.tax_rate || '0';
  document.getElementById('set_currency').value = settings.currency || '$';
  document.getElementById('set_receipt_footer').value = settings.receipt_footer || '';
  document.getElementById('set_low_stock_alert').value = settings.low_stock_alert || '5';
}

async function saveSettings(e) {
  e.preventDefault();
  const form = document.getElementById('settingsForm');
  const data = Object.fromEntries(new FormData(form));
  await api('/api/settings', { method: 'PUT', body: data });
  await loadSettings();
  toast('Settings saved');
}

// ─── Categories ───────────────────────────────
async function loadCategories() {
  categories = await api('/api/categories');
  renderCategories();
}

function renderCategories() {
  const bar = document.getElementById('categoriesBar');
  let html = `<button class="cat-btn ${!activeCategory ? 'active' : ''}" onclick="selectCategory(null)">All</button>`;
  categories.forEach(c => {
    html += `<button class="cat-btn ${activeCategory === c.id ? 'active' : ''}" 
              style="${activeCategory === c.id ? `background:${c.color};border-color:${c.color}` : ''}" 
              onclick="selectCategory(${c.id})">${c.icon} ${c.name}</button>`;
  });
  bar.innerHTML = html;
}

function selectCategory(id) {
  activeCategory = id;
  renderCategories();
  renderProducts();
}

// ─── Products ─────────────────────────────────
async function loadProducts() {
  products = await api('/api/products?active_only=1');
  renderProducts();
}

function filterProducts() { renderProducts(); }

function renderProducts() {
  const grid = document.getElementById('productsGrid');
  const search = document.getElementById('searchInput').value.toLowerCase();
  const lowStockThreshold = parseInt(settings.low_stock_alert || '5');

  let filtered = products.filter(p => {
    if (activeCategory && p.category_id !== activeCategory) return false;
    if (search && !p.name.toLowerCase().includes(search)) return false;
    return true;
  });

  if (filtered.length === 0) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted)">No products found</div>';
    return;
  }

  grid.innerHTML = filtered.map(p => {
    const cat = categories.find(c => c.id === p.category_id);
    const icon = cat ? cat.icon : '📦';
    const isLow = p.stock > 0 && p.stock <= lowStockThreshold;
    const isOut = p.stock <= 0;
    const currency = settings.currency || '$';

    const imageHtml = p.image_url
      ? `<img class="product-img" src="${p.image_url}" alt="${p.name}">`
      : `<div class="product-icon">${icon}</div>`;

    return `<div class="product-card ${isOut ? 'out-of-stock' : ''}" onclick="addToCart(${p.id})" 
              style="border-left: 3px solid ${cat ? cat.color : 'var(--border)'}">
      ${isLow ? '<span class="stock-badge low">Low</span>' : ''}
      ${isOut ? '<span class="stock-badge out">Out</span>' : ''}
      ${imageHtml}
      <div class="product-name">${p.name}</div>
      <div class="product-price">${currency}${p.price.toFixed(2)}</div>
      <div class="product-stock">Stock: ${p.stock}</div>
    </div>`;
  }).join('');
}

// ─── Cart ─────────────────────────────────────
function addToCart(productId) {
  const product = products.find(p => p.id === productId);
  if (!product || product.stock <= 0) return;

  const existing = cart.find(item => item.product_id === productId);
  if (existing) {
    if (existing.quantity >= product.stock) { toast('Not enough stock', 'error'); return; }
    existing.quantity++;
  } else {
    cart.push({ product_id: product.id, product_name: product.name, unit_price: product.price, quantity: 1 });
  }
  renderCart();
}

function updateQty(productId, delta) {
  const item = cart.find(i => i.product_id === productId);
  if (!item) return;
  const product = products.find(p => p.id === productId);
  item.quantity += delta;
  if (item.quantity <= 0) {
    cart = cart.filter(i => i.product_id !== productId);
  } else if (product && item.quantity > product.stock) {
    item.quantity = product.stock;
    toast('Not enough stock', 'error');
  }
  renderCart();
}

function clearCart() {
  if (cart.length === 0) return;
  cart = [];
  document.getElementById('discountInput').value = '0';
  renderCart();
}

function renderCart() {
  const container = document.getElementById('cartItems');
  const currency = settings.currency || '$';

  if (cart.length === 0) {
    container.innerHTML = '<div class="cart-empty">Tap products to add them</div>';
    updateTotals();
    return;
  }

  container.innerHTML = cart.map(item => `
    <div class="cart-item">
      <div class="cart-item-info">
        <div class="cart-item-name">${item.product_name}</div>
        <div class="cart-item-price">${currency}${item.unit_price.toFixed(2)} each</div>
      </div>
      <div class="cart-item-qty">
        <button class="qty-btn ${item.quantity === 1 ? 'remove' : ''}" onclick="updateQty(${item.product_id}, -1)">
          ${item.quantity === 1 ? '🗑' : '−'}
        </button>
        <span>${item.quantity}</span>
        <button class="qty-btn" onclick="updateQty(${item.product_id}, 1)">+</button>
      </div>
      <div class="cart-item-total">${currency}${(item.unit_price * item.quantity).toFixed(2)}</div>
    </div>
  `).join('');

  updateTotals();
}

function updateTotals() {
  const currency = settings.currency || '$';
  const subtotal = cart.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
  const discount = parseFloat(document.getElementById('discountInput').value) || 0;
  const taxRate = parseFloat(settings.tax_rate || '0');
  const taxable = subtotal - discount;
  const tax = Math.max(0, taxable * taxRate);
  const total = Math.max(0, taxable + tax);

  document.getElementById('subtotal').textContent = `${currency}${subtotal.toFixed(2)}`;
  document.getElementById('taxAmount').textContent = `${currency}${tax.toFixed(2)}`;
  document.getElementById('totalAmount').textContent = `${currency}${total.toFixed(2)}`;
  currentOrderTotal = total;
}

function adjustDiscount(delta) {
  const input = document.getElementById('discountInput');
  input.value = Math.max(0, (parseFloat(input.value) || 0) + delta);
  updateTotals();
}

// ─── Payment ──────────────────────────────────
function openPayment(method) {
  if (cart.length === 0) { toast('Cart is empty', 'error'); return; }
  paymentMethod = method;
  numpadValue = '0';
  const currency = settings.currency || '$';
  document.getElementById('paymentTotalDisplay').textContent = `${currency}${currentOrderTotal.toFixed(2)}`;
  document.getElementById('numpadDisplay').textContent = currentOrderTotal.toFixed(2);
  numpadValue = currentOrderTotal.toFixed(2);
  selectPayMethod(method);
  generateQuickCash();
  updateChangeDisplay();
  openModal('paymentModal');
}

function selectPayMethod(method) {
  paymentMethod = method;
  document.getElementById('methodCash').classList.toggle('active', method === 'cash');
  document.getElementById('methodCard').classList.toggle('active', method === 'card');
  document.getElementById('cashSection').style.display = method === 'cash' ? 'block' : 'none';
  document.getElementById('changeDisplay').style.display = method === 'cash' ? 'flex' : 'none';
}

function generateQuickCash() {
  const total = currentOrderTotal;
  const amounts = [Math.ceil(total), Math.ceil(total / 5) * 5, Math.ceil(total / 10) * 10, Math.ceil(total / 20) * 20];
  if (total > 50) amounts.push(Math.ceil(total / 50) * 50);
  if (total > 100) amounts.push(100);
  const unique = [...new Set(amounts)].filter(a => a >= total).slice(0, 5);
  const currency = settings.currency || '$';
  document.getElementById('quickCash').innerHTML = unique.map(a =>
    `<button class="btn" onclick="setNumpadValue('${a.toFixed(2)}')">${currency}${a.toFixed(2)}</button>`
  ).join('');
}

function numpadPress(key) {
  if (key === 'back') {
    numpadValue = numpadValue.length > 1 ? numpadValue.slice(0, -1) : '0';
  } else if (key === '.') {
    if (!numpadValue.includes('.')) numpadValue += '.';
  } else {
    if (numpadValue === '0') { numpadValue = key; }
    else if (numpadValue.includes('.') && numpadValue.split('.')[1].length >= 2) { return; }
    else { numpadValue += key; }
  }
  document.getElementById('numpadDisplay').textContent = parseFloat(numpadValue).toFixed(2);
  updateChangeDisplay();
}

function setNumpadValue(val) {
  numpadValue = val;
  document.getElementById('numpadDisplay').textContent = parseFloat(numpadValue).toFixed(2);
  updateChangeDisplay();
}

function updateChangeDisplay() {
  const currency = settings.currency || '$';
  const received = parseFloat(numpadValue) || 0;
  const change = Math.max(0, received - currentOrderTotal);
  document.getElementById('changeAmount').textContent = `${currency}${change.toFixed(2)}`;
}

async function completePayment() {
  const received = paymentMethod === 'card' ? currentOrderTotal : (parseFloat(numpadValue) || 0);
  if (paymentMethod === 'cash' && received < currentOrderTotal) { toast('Insufficient payment amount', 'error'); return; }

  try {
    const order = await api('/api/orders', {
      method: 'POST',
      body: {
        items: cart,
        payment_method: paymentMethod,
        payment_received: received,
        discount: parseFloat(document.getElementById('discountInput').value) || 0
      }
    });
    closeModal('paymentModal');
    showReceipt(order);
    toast('Sale completed!', 'success');
    await loadProducts();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ─── Receipt ──────────────────────────────────
function showReceipt(order) {
  const currency = settings.currency || '$';
  const storeName = settings.store_name || 'My Store';
  const footer = settings.receipt_footer || '';

  const items = cart.map(item => `
    <div class="receipt-item">
      <span>${item.product_name} x${item.quantity}</span>
      <span>${currency}${(item.unit_price * item.quantity).toFixed(2)}</span>
    </div>
  `).join('');

  document.getElementById('receiptContent').innerHTML = `
    <div class="receipt-header">
      <h3>${storeName}</h3>
      <div>${order.order_number}</div>
      <div>${new Date(order.created_at).toLocaleString()}</div>
      ${order.user_name ? `<div>Cashier: ${order.user_name}</div>` : ''}
    </div>
    <div class="receipt-items">${items}</div>
    <div class="receipt-totals">
      <div class="receipt-item"><span>Subtotal</span><span>${currency}${order.subtotal.toFixed(2)}</span></div>
      ${order.discount > 0 ? `<div class="receipt-item"><span>Discount</span><span>-${currency}${order.discount.toFixed(2)}</span></div>` : ''}
      <div class="receipt-item"><span>Tax</span><span>${currency}${order.tax.toFixed(2)}</span></div>
      <div class="receipt-item receipt-total-final"><span>TOTAL</span><span>${currency}${order.total.toFixed(2)}</span></div>
      <div class="receipt-item"><span>Paid (${order.payment_method})</span><span>${currency}${order.payment_received.toFixed(2)}</span></div>
      ${order.change_amount > 0 ? `<div class="receipt-item"><span>Change</span><span>${currency}${order.change_amount.toFixed(2)}</span></div>` : ''}
    </div>
    <div class="receipt-footer">${footer}</div>
  `;
  openModal('receiptModal');
}

function printReceipt() { window.print(); }

function newOrder() {
  cart = [];
  document.getElementById('discountInput').value = '0';
  renderCart();
}

// ─── Orders ───────────────────────────────────
async function loadOrders() {
  const date = document.getElementById('orderDateFilter').value;
  const params = date ? `?date=${date}` : '';
  const orders = await api(`/api/orders${params}`);
  const currency = settings.currency || '$';
  const list = document.getElementById('ordersList');

  if (orders.length === 0) {
    list.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted)">No orders found</div>';
    return;
  }

  list.innerHTML = orders.map(o => `
    <div class="order-card" onclick="viewOrder(${o.id})">
      <div class="order-card-header">
        <span class="order-number">${o.order_number}</span>
        <span class="order-status ${o.status}">${o.status}</span>
      </div>
      <div class="order-card-body">
        <div>${new Date(o.created_at).toLocaleString()}</div>
        <div>${o.user_name ? `By: ${o.user_name} | ` : ''}${o.payment_method.toUpperCase()}</div>
      </div>
      <div class="order-card-footer">
        <span>${currency}${o.total.toFixed(2)}</span>
      </div>
    </div>
  `).join('');
}

async function viewOrder(id) {
  const order = await api(`/api/orders/${id}`);
  const currency = settings.currency || '$';

  const itemsHtml = order.items.map(i => `
    <div style="display:flex;justify-content:space-between;padding:4px 0">
      <span>${i.product_name} x${i.quantity}</span>
      <span>${currency}${i.total_price.toFixed(2)}</span>
    </div>
  `).join('');

  document.getElementById('orderDetailContent').innerHTML = `
    <div style="margin-bottom:12px"><strong>${order.order_number}</strong> - ${new Date(order.created_at).toLocaleString()}</div>
    ${order.user_name ? `<div style="margin-bottom:8px;color:var(--text-muted)">Cashier: ${order.user_name}</div>` : ''}
    <div style="margin-bottom:16px">${itemsHtml}</div>
    <div style="border-top:1px solid var(--border);padding-top:12px">
      <div style="display:flex;justify-content:space-between"><span>Subtotal</span><span>${currency}${order.subtotal.toFixed(2)}</span></div>
      ${order.discount > 0 ? `<div style="display:flex;justify-content:space-between"><span>Discount</span><span>-${currency}${order.discount.toFixed(2)}</span></div>` : ''}
      <div style="display:flex;justify-content:space-between"><span>Tax</span><span>${currency}${order.tax.toFixed(2)}</span></div>
      <div style="display:flex;justify-content:space-between;font-weight:700;font-size:1.2rem;margin-top:8px"><span>Total</span><span>${currency}${order.total.toFixed(2)}</span></div>
      <div style="display:flex;justify-content:space-between;margin-top:4px;color:var(--text-muted)"><span>Payment</span><span>${order.payment_method.toUpperCase()} - ${currency}${order.payment_received.toFixed(2)}</span></div>
      ${order.change_amount > 0 ? `<div style="display:flex;justify-content:space-between;color:var(--text-muted)"><span>Change</span><span>${currency}${order.change_amount.toFixed(2)}</span></div>` : ''}
    </div>
  `;

  document.getElementById('orderDetailFooter').innerHTML = order.status === 'completed'
    ? `<button class="btn btn-danger" onclick="refundOrder(${order.id})">Refund</button>
       <button class="btn btn-secondary" onclick="closeModal('orderDetailModal')">Close</button>`
    : `<button class="btn btn-secondary" onclick="closeModal('orderDetailModal')">Close</button>`;

  openModal('orderDetailModal');
}

async function refundOrder(id) {
  if (!confirm('Refund this order? Stock will be restored.')) return;
  try {
    await api(`/api/orders/${id}/refund`, { method: 'PUT' });
    toast('Order refunded', 'success');
    closeModal('orderDetailModal');
    loadOrders();
    loadProducts();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ─── Reports ──────────────────────────────────
function switchReportTab(tab) {
  currentReportTab = tab;
  document.querySelectorAll('.report-tab').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');
  if (tab === 'sales') loadReports();
  if (tab === 'users') loadUserReports();
}

async function loadReports() {
  const from = document.getElementById('reportFrom').value;
  const to = document.getElementById('reportTo').value;
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);

  const [sales, topProducts] = await Promise.all([
    api(`/api/reports/sales?${params}`),
    api(`/api/reports/top-products?${params}&limit=10`)
  ]);

  const currency = settings.currency || '$';
  const content = document.getElementById('reportsContent');

  const methodBreakdown = Object.entries(sales.byMethod).map(([m, v]) =>
    `<div style="display:flex;justify-content:space-between;padding:4px 0"><span>${m.toUpperCase()}</span><span>${currency}${v.toFixed(2)}</span></div>`
  ).join('');

  const topProductsHtml = topProducts.length > 0 ? topProducts.map((p, i) => `
    <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)">
      <span>${i + 1}. ${p.product_name}</span>
      <span>${p.total_qty} sold | ${currency}${p.total_revenue.toFixed(2)}</span>
    </div>
  `).join('') : '<div style="color:var(--text-muted)">No sales data</div>';

  content.innerHTML = `
    <div class="report-cards">
      <div class="report-card"><div class="label">Total Sales</div><div class="value green">${currency}${sales.totalSales.toFixed(2)}</div></div>
      <div class="report-card"><div class="label">Total Orders</div><div class="value blue">${sales.totalOrders}</div></div>
      <div class="report-card"><div class="label">Tax Collected</div><div class="value orange">${currency}${sales.totalTax.toFixed(2)}</div></div>
      <div class="report-card"><div class="label">Discounts Given</div><div class="value">${currency}${sales.totalDiscount.toFixed(2)}</div></div>
    </div>
    <div class="report-section">
      <h3>Payment Methods</h3>
      ${methodBreakdown || '<div style="color:var(--text-muted)">No data</div>'}
    </div>
    <div class="report-section">
      <h3>Top Products</h3>
      ${topProductsHtml}
    </div>
  `;
}

async function loadUserReports() {
  if (currentUser.role !== 'admin') {
    document.getElementById('reportsContent').innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted)">Admin access required</div>';
    return;
  }

  const from = document.getElementById('reportFrom').value;
  const to = document.getElementById('reportTo').value;
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);

  const data = await api(`/api/reports/users?${params}`);
  const currency = settings.currency || '$';
  const content = document.getElementById('reportsContent');

  const userCards = data.userStats.map(u => `
    <div class="report-card">
      <div class="label">${u.name} (${u.role})</div>
      <div class="value green">${currency}${u.total_sales.toFixed(2)}</div>
      <div style="font-size:0.8rem;color:var(--text-muted);margin-top:4px">
        ${u.total_orders} orders | Avg: ${currency}${u.avg_order_value.toFixed(2)}
        ${u.total_refunds > 0 ? `<br><span style="color:var(--danger)">${u.total_refunds} refunds (${currency}${u.refund_amount.toFixed(2)})</span>` : ''}
      </div>
    </div>
  `).join('');

  const userTableRows = data.userStats.map(u => `
    <tr>
      <td><strong>${u.name}</strong></td>
      <td><span class="role-badge ${u.role}">${u.role}</span></td>
      <td>${u.total_orders}</td>
      <td>${currency}${u.total_sales.toFixed(2)}</td>
      <td>${currency}${u.avg_order_value.toFixed(2)}</td>
      <td>${currency}${u.total_tax.toFixed(2)}</td>
      <td>${u.total_refunds} (${currency}${u.refund_amount.toFixed(2)})</td>
      <td>${u.last_order_at ? new Date(u.last_order_at).toLocaleDateString() : '-'}</td>
    </tr>
  `).join('');

  content.innerHTML = `
    <div class="report-cards">${userCards}</div>
    <div class="report-section">
      <h3>Detailed User Performance</h3>
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr><th>User</th><th>Role</th><th>Orders</th><th>Sales</th><th>Avg Order</th><th>Tax</th><th>Refunds</th><th>Last Order</th></tr></thead>
          <tbody>${userTableRows || '<tr><td colspan="8" style="text-align:center;color:var(--text-muted)">No data</td></tr>'}</tbody>
        </table>
      </div>
    </div>
  `;
}

function setReportToday() {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('reportFrom').value = today;
  document.getElementById('reportTo').value = today;
  if (currentReportTab === 'users') loadUserReports(); else loadReports();
}

function setReportWeek() {
  const to = new Date();
  const from = new Date(); from.setDate(from.getDate() - 7);
  document.getElementById('reportFrom').value = from.toISOString().split('T')[0];
  document.getElementById('reportTo').value = to.toISOString().split('T')[0];
  if (currentReportTab === 'users') loadUserReports(); else loadReports();
}

function setReportMonth() {
  const to = new Date();
  const from = new Date(); from.setMonth(from.getMonth() - 1);
  document.getElementById('reportFrom').value = from.toISOString().split('T')[0];
  document.getElementById('reportTo').value = to.toISOString().split('T')[0];
  if (currentReportTab === 'users') loadUserReports(); else loadReports();
}

// ─── Storage / Inventory Report ───────────────
async function loadStorageReport() {
  const data = await api('/api/reports/storage');
  const currency = settings.currency || '$';
  const content = document.getElementById('storageContent');
  const lowThreshold = parseInt(settings.low_stock_alert || '5');
  const maxStock = Math.max(...data.allProducts.map(p => p.stock), 1);

  const categoryCards = Object.entries(data.byCategory).map(([name, info]) => `
    <div class="category-breakdown-card">
      <div class="cat-title"><span>${info.icon}</span> ${name}</div>
      <div class="cat-stats">
        <span>${info.count} products</span>
        <span>${info.stock} units</span>
        <span>${currency}${info.value.toFixed(2)}</span>
      </div>
    </div>
  `).join('');

  const productCards = data.allProducts.map(p => {
    const pct = Math.min(100, (p.stock / maxStock) * 100);
    const barClass = p.stock <= 0 ? 'out' : p.stock <= lowThreshold ? 'low' : 'good';
    const imgHtml = p.image_url
      ? `<img class="storage-product-img" src="${p.image_url}" alt="">`
      : `<div class="storage-product-img-placeholder">${p.category_icon || '📦'}</div>`;

    return `<div class="storage-product-card">
      ${imgHtml}
      <div class="storage-product-info">
        <div class="name">${p.name}</div>
        <div class="cat">${p.category_name || 'Uncategorized'}</div>
        <div class="stock-bar"><div class="stock-bar-fill ${barClass}" style="width:${pct}%"></div></div>
        <div class="storage-stats">
          <span>Stock: ${p.stock}</span>
          <span>${currency}${(p.stock * p.cost_price).toFixed(2)}</span>
          <span>${currency}${(p.stock * p.price).toFixed(2)}</span>
        </div>
      </div>
    </div>`;
  }).join('');

  const movementRows = data.stockMovement.length > 0 ? data.stockMovement.map(m => `
    <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)">
      <span>${m.product_name}</span>
      <span>${m.total_sold} sold</span>
    </div>
  `).join('') : '<div style="color:var(--text-muted)">No sales data yet</div>';

  content.innerHTML = `
    <div class="report-cards">
      <div class="report-card"><div class="label">Total Products</div><div class="value blue">${data.totalProducts}</div></div>
      <div class="report-card"><div class="label">Total Units</div><div class="value">${data.totalItems}</div></div>
      <div class="report-card"><div class="label">Stock Value (Cost)</div><div class="value green">${currency}${data.totalValue.toFixed(2)}</div></div>
      <div class="report-card"><div class="label">Stock Value (Retail)</div><div class="value green">${currency}${data.totalRetailValue.toFixed(2)}</div></div>
      <div class="report-card"><div class="label">Out of Stock</div><div class="value red">${data.outOfStock}</div></div>
      <div class="report-card"><div class="label">Low Stock</div><div class="value orange">${data.lowStock}</div></div>
    </div>
    <div class="report-section">
      <h3>By Category</h3>
      <div class="storage-grid">${categoryCards}</div>
    </div>
    <div class="report-section">
      <h3>Top Selling Products</h3>
      ${movementRows}
    </div>
    <div class="report-section">
      <h3>All Products Inventory</h3>
      <div class="storage-grid">${productCards}</div>
    </div>
  `;
}

// ─── Admin: Products ──────────────────────────
async function loadAdminProducts() {
  const search = document.getElementById('adminProductSearch')?.value || '';
  const params = search ? `?search=${encodeURIComponent(search)}` : '';
  const prods = await api(`/api/products${params}`);
  const currency = settings.currency || '$';

  document.getElementById('productsTableBody').innerHTML = prods.map(p => {
    const thumbHtml = p.image_url
      ? `<img class="admin-thumb" src="${p.image_url}" alt="">`
      : `<div class="admin-thumb-placeholder">📦</div>`;

    return `<tr>
      <td>${thumbHtml}</td>
      <td><strong>${p.name}</strong>${p.barcode ? `<br><small>${p.barcode}</small>` : ''}</td>
      <td>${p.category_name || '-'}</td>
      <td>${currency}${p.price.toFixed(2)}</td>
      <td>${currency}${p.cost_price.toFixed(2)}</td>
      <td>${p.stock}</td>
      <td><span class="status-badge ${p.is_active ? 'active' : 'inactive'}">${p.is_active ? 'Active' : 'Inactive'}</span></td>
      <td class="action-btns">
        <button class="btn btn-sm btn-primary" onclick="editProduct(${p.id})">Edit</button>
        <button class="btn btn-sm btn-danger" onclick="deleteProduct(${p.id}, '${p.name.replace(/'/g, "\\'")}')">Del</button>
      </td>
    </tr>`;
  }).join('');
}

function openProductModal(product = null) {
  document.getElementById('productModalTitle').textContent = product ? 'Edit Product' : 'Add Product';
  document.getElementById('prod_id').value = product?.id || '';
  document.getElementById('prod_name').value = product?.name || '';
  document.getElementById('prod_price').value = product?.price || '';
  document.getElementById('prod_cost_price').value = product?.cost_price || '0';
  document.getElementById('prod_stock').value = product?.stock || '0';
  document.getElementById('prod_barcode').value = product?.barcode || '';
  document.getElementById('prod_image_url').value = product?.image_url || '';

  const preview = document.getElementById('prodImagePreview');
  const placeholder = document.getElementById('imageUploadPlaceholder');
  const removeBtn = document.getElementById('imageRemoveBtn');

  if (product?.image_url) {
    preview.src = product.image_url;
    preview.style.display = 'block';
    placeholder.style.display = 'none';
    removeBtn.style.display = 'block';
  } else {
    preview.style.display = 'none';
    placeholder.style.display = 'flex';
    removeBtn.style.display = 'none';
  }

  const select = document.getElementById('prod_category_id');
  select.innerHTML = '<option value="">No Category</option>' +
    categories.map(c => `<option value="${c.id}" ${product?.category_id === c.id ? 'selected' : ''}>${c.icon} ${c.name}</option>`).join('');

  openModal('productModal');
}

async function editProduct(id) {
  const product = await api(`/api/products/${id}`);
  openProductModal(product);
}

async function handleImageUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('image', file);

  try {
    const result = await apiUpload('/api/upload', formData);
    document.getElementById('prod_image_url').value = result.url;
    document.getElementById('prodImagePreview').src = result.url;
    document.getElementById('prodImagePreview').style.display = 'block';
    document.getElementById('imageUploadPlaceholder').style.display = 'none';
    document.getElementById('imageRemoveBtn').style.display = 'block';
    toast('Image uploaded');
  } catch (err) {
    toast(err.message, 'error');
  }

  e.target.value = '';
}

function removeProductImage(e) {
  e.stopPropagation();
  document.getElementById('prod_image_url').value = '';
  document.getElementById('prodImagePreview').style.display = 'none';
  document.getElementById('imageUploadPlaceholder').style.display = 'flex';
  document.getElementById('imageRemoveBtn').style.display = 'none';
}

async function saveProduct(e) {
  e.preventDefault();
  const id = document.getElementById('prod_id').value;
  const data = {
    name: document.getElementById('prod_name').value,
    price: parseFloat(document.getElementById('prod_price').value),
    cost_price: parseFloat(document.getElementById('prod_cost_price').value) || 0,
    category_id: document.getElementById('prod_category_id').value || null,
    stock: parseInt(document.getElementById('prod_stock').value) || 0,
    barcode: document.getElementById('prod_barcode').value || null,
    image_url: document.getElementById('prod_image_url').value || null
  };

  try {
    if (id) {
      await api(`/api/products/${id}`, { method: 'PUT', body: data });
      toast('Product updated');
    } else {
      await api('/api/products', { method: 'POST', body: data });
      toast('Product added');
    }
    closeModal('productModal');
    loadAdminProducts();
    loadProducts();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function deleteProduct(id, name) {
  if (!confirm(`Delete "${name}"?`)) return;
  try {
    await api(`/api/products/${id}`, { method: 'DELETE' });
    toast('Product removed');
    loadAdminProducts();
    loadProducts();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ─── Admin: Categories ────────────────────────
async function loadAdminCategories() {
  categories = await api('/api/categories');
  const grid = document.getElementById('categoriesAdminGrid');

  grid.innerHTML = categories.map(c => `
    <div class="category-admin-card">
      <div class="cat-header">
        <div class="cat-icon-name">
          <span style="font-size:1.5rem">${c.icon}</span>
          <span>${c.name}</span>
        </div>
        <div class="action-btns">
          <button class="btn btn-sm btn-primary" onclick="editCategory(${c.id})">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="deleteCategory(${c.id}, '${c.name.replace(/'/g, "\\'")}')">Del</button>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:4px">
        <div style="width:20px;height:20px;border-radius:4px;background:${c.color}"></div>
        <span style="font-size:0.8rem;color:var(--text-muted)">Order: ${c.sort_order}</span>
      </div>
    </div>
  `).join('');
}

function openCategoryModal(category = null) {
  document.getElementById('categoryModalTitle').textContent = category ? 'Edit Category' : 'Add Category';
  document.getElementById('cat_id').value = category?.id || '';
  document.getElementById('cat_name').value = category?.name || '';
  document.getElementById('cat_color').value = category?.color || '#4a90d9';
  document.getElementById('cat_icon').value = category?.icon || '📦';
  document.getElementById('cat_sort_order').value = category?.sort_order || '0';
  openModal('categoryModal');
}

async function editCategory(id) {
  const cat = categories.find(c => c.id === id);
  if (cat) openCategoryModal(cat);
}

async function saveCategory(e) {
  e.preventDefault();
  const id = document.getElementById('cat_id').value;
  const data = {
    name: document.getElementById('cat_name').value,
    color: document.getElementById('cat_color').value,
    icon: document.getElementById('cat_icon').value,
    sort_order: parseInt(document.getElementById('cat_sort_order').value) || 0
  };

  try {
    if (id) {
      await api(`/api/categories/${id}`, { method: 'PUT', body: data });
      toast('Category updated');
    } else {
      await api('/api/categories', { method: 'POST', body: data });
      toast('Category added');
    }
    closeModal('categoryModal');
    loadAdminCategories();
    loadCategories();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function deleteCategory(id, name) {
  if (!confirm(`Delete category "${name}"?`)) return;
  try {
    await api(`/api/categories/${id}`, { method: 'DELETE' });
    toast('Category deleted');
    loadAdminCategories();
    loadCategories();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ─── Admin: Users ─────────────────────────────
async function loadAdminUsers() {
  const users = await api('/api/users');
  document.getElementById('usersTableBody').innerHTML = users.map(u => `
    <tr>
      <td><strong>${u.name}</strong></td>
      <td>${u.username}</td>
      <td><span class="role-badge ${u.role}">${u.role}</span></td>
      <td><span class="status-badge ${u.is_active ? 'active' : 'inactive'}">${u.is_active ? 'Active' : 'Inactive'}</span></td>
      <td>${new Date(u.created_at).toLocaleDateString()}</td>
      <td class="action-btns">
        <button class="btn btn-sm btn-primary" onclick="editUser(${u.id})">Edit</button>
        <button class="btn btn-sm btn-danger" onclick="deleteUser(${u.id}, '${u.name.replace(/'/g, "\\'")}')">Del</button>
      </td>
    </tr>
  `).join('');
}

function openUserModal(user = null) {
  document.getElementById('userModalTitle').textContent = user ? 'Edit User' : 'Add User';
  document.getElementById('user_id').value = user?.id || '';
  document.getElementById('user_name').value = user?.name || '';
  document.getElementById('user_username').value = user?.username || '';
  document.getElementById('user_password').value = '';
  document.getElementById('user_role').value = user?.role || 'cashier';
  document.getElementById('pwdHint').textContent = user ? '(leave blank to keep)' : '*';
  document.getElementById('user_password').required = !user;
  openModal('userModal');
}

async function editUser(id) {
  const users = await api('/api/users');
  const user = users.find(u => u.id === id);
  if (user) openUserModal(user);
}

async function saveUser(e) {
  e.preventDefault();
  const id = document.getElementById('user_id').value;
  const data = {
    name: document.getElementById('user_name').value,
    username: document.getElementById('user_username').value,
    role: document.getElementById('user_role').value
  };

  const password = document.getElementById('user_password').value;
  if (password) data.password = password;

  try {
    if (id) {
      await api(`/api/users/${id}`, { method: 'PUT', body: data });
      toast('User updated');
    } else {
      data.password = password;
      await api('/api/users', { method: 'POST', body: data });
      toast('User added');
    }
    closeModal('userModal');
    loadAdminUsers();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function deleteUser(id, name) {
  if (!confirm(`Delete user "${name}"?`)) return;
  try {
    await api(`/api/users/${id}`, { method: 'DELETE' });
    toast('User removed');
    loadAdminUsers();
  } catch (err) {
    toast(err.message, 'error');
  }
}

function showAdminTab(tab, btn) {
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.admin-nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`admin${tab.charAt(0).toUpperCase() + tab.slice(1)}`).classList.add('active');
  btn.classList.add('active');
}

// ─── Modals ───────────────────────────────────
function openModal(id) {
  document.getElementById(id).classList.add('active');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}

document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.remove('active');
  });
});
