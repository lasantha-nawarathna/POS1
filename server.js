const express = require('express');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const fs = require('fs');
const { initDatabase } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `prod_${Date.now()}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (req, file, cb) => {
  const allowed = /jpeg|jpg|png|gif|webp/;
  cb(null, allowed.test(path.extname(file.originalname).toLowerCase()));
}});

let db;
const sessions = {};

const hashPassword = (pwd) => crypto.createHash('sha256').update(pwd).digest('hex');

function authMiddleware(req, res, next) {
  const token = req.headers['x-auth-token'];
  if (!token || !sessions[token]) return res.status(401).json({ error: 'Unauthorized' });
  req.user = sessions[token];
  next();
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}

async function startServer() {
  db = await initDatabase();
  setupRoutes();
  app.listen(PORT, () => {
    console.log(`POS System running at http://localhost:${PORT}`);
    console.log(`Default login: admin / admin123`);
  });
}

function setupRoutes() {

// ─── Auth ──────────────────────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ? AND is_active = 1').get(username);
  if (!user || user.password !== hashPassword(password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = crypto.randomBytes(32).toString('hex');
  sessions[token] = { id: user.id, username: user.username, name: user.name, role: user.role };
  res.json({ token, user: sessions[token] });
});

app.post('/api/auth/logout', authMiddleware, (req, res) => {
  const token = req.headers['x-auth-token'];
  delete sessions[token];
  res.json({ success: true });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json(req.user);
});

app.put('/api/auth/password', authMiddleware, (req, res) => {
  const { current_password, new_password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (user.password !== hashPassword(current_password)) {
    return res.status(400).json({ error: 'Current password is incorrect' });
  }
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashPassword(new_password), req.user.id);
  res.json({ success: true });
});

// ─── Users ─────────────────────────────────────────────────────
app.get('/api/users', authMiddleware, adminOnly, (req, res) => {
  const users = db.prepare('SELECT id, username, name, role, is_active, created_at FROM users ORDER BY name').all();
  res.json(users);
});

app.post('/api/users', authMiddleware, adminOnly, (req, res) => {
  const { username, password, name, role } = req.body;
  try {
    const result = db.prepare('INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, ?)')
      .run(username, hashPassword(password), name, role || 'cashier');
    const user = db.prepare('SELECT id, username, name, role, is_active, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(user);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/users/:id', authMiddleware, adminOnly, (req, res) => {
  const { username, name, role, is_active, password } = req.body;
  if (password) {
    db.prepare('UPDATE users SET username=?, name=?, role=?, is_active=?, password=? WHERE id=?')
      .run(username, name, role, is_active ?? 1, hashPassword(password), req.params.id);
  } else {
    db.prepare('UPDATE users SET username=?, name=?, role=?, is_active=? WHERE id=?')
      .run(username, name, role, is_active ?? 1, req.params.id);
  }
  const user = db.prepare('SELECT id, username, name, role, is_active, created_at FROM users WHERE id = ?').get(req.params.id);
  res.json(user);
});

app.delete('/api/users/:id', authMiddleware, adminOnly, (req, res) => {
  if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
  const orderCount = db.prepare('SELECT COUNT(*) as count FROM orders WHERE user_id = ?').get(req.params.id);
  if (orderCount.count > 0) {
    db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(req.params.id);
    return res.json({ success: true, message: 'User deactivated (has order history)' });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ─── Image Upload ──────────────────────────────────────────────
app.post('/api/upload', authMiddleware, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

// ─── Categories ────────────────────────────────────────────────
app.get('/api/categories', authMiddleware, (req, res) => {
  const categories = db.prepare('SELECT * FROM categories ORDER BY sort_order').all();
  res.json(categories);
});

app.post('/api/categories', authMiddleware, adminOnly, (req, res) => {
  const { name, color, icon, sort_order } = req.body;
  try {
    const result = db.prepare('INSERT INTO categories (name, color, icon, sort_order) VALUES (?, ?, ?, ?)').run(name, color || '#4a90d9', icon || '📦', sort_order || 0);
    const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(category);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/categories/:id', authMiddleware, adminOnly, (req, res) => {
  const { name, color, icon, sort_order } = req.body;
  db.prepare('UPDATE categories SET name=?, color=?, icon=?, sort_order=? WHERE id=?').run(name, color, icon, sort_order, req.params.id);
  const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
  res.json(category);
});

app.delete('/api/categories/:id', authMiddleware, adminOnly, (req, res) => {
  const products = db.prepare('SELECT COUNT(*) as count FROM products WHERE category_id = ?').get(req.params.id);
  if (products.count > 0) return res.status(400).json({ error: 'Category has products. Remove them first.' });
  db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ─── Products ──────────────────────────────────────────────────
app.get('/api/products', authMiddleware, (req, res) => {
  const { category_id, search, active_only } = req.query;
  let sql = `SELECT p.*, c.name as category_name, c.color as category_color 
             FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE 1=1`;
  const params = [];

  if (category_id) { sql += ' AND p.category_id = ?'; params.push(category_id); }
  if (search) { sql += ' AND p.name LIKE ?'; params.push(`%${search}%`); }
  if (active_only === '1') { sql += ' AND p.is_active = 1'; }

  sql += ' ORDER BY p.name';
  res.json(db.prepare(sql).all(...params));
});

app.get('/api/products/:id', authMiddleware, (req, res) => {
  const product = db.prepare('SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json(product);
});

app.post('/api/products', authMiddleware, adminOnly, (req, res) => {
  const { name, price, cost_price, category_id, stock, barcode, image_url } = req.body;
  try {
    const result = db.prepare('INSERT INTO products (name, price, cost_price, category_id, stock, barcode, image_url) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(name, price, cost_price || 0, category_id, stock || 0, barcode || null, image_url || null);
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(product);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/products/:id', authMiddleware, adminOnly, (req, res) => {
  const { name, price, cost_price, category_id, stock, barcode, is_active, image_url } = req.body;
  db.prepare('UPDATE products SET name=?, price=?, cost_price=?, category_id=?, stock=?, barcode=?, is_active=?, image_url=? WHERE id=?')
    .run(name, price, cost_price, category_id, stock, barcode, is_active ?? 1, image_url || null, req.params.id);
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  res.json(product);
});

app.delete('/api/products/:id', authMiddleware, adminOnly, (req, res) => {
  const orderItems = db.prepare('SELECT COUNT(*) as count FROM order_items WHERE product_id = ?').get(req.params.id);
  if (orderItems.count > 0) {
    db.prepare('UPDATE products SET is_active = 0 WHERE id = ?').run(req.params.id);
    return res.json({ success: true, message: 'Product deactivated (has order history)' });
  }
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.get('/api/products/search/barcode/:barcode', authMiddleware, (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE barcode = ? AND is_active = 1').get(req.params.barcode);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json(product);
});

// ─── Orders ────────────────────────────────────────────────────
function generateOrderNumber() {
  const now = new Date();
  const y = now.getFullYear().toString().slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `ORD-${y}${m}${d}-${rand}`;
}

app.post('/api/orders', authMiddleware, (req, res) => {
  const { items, payment_method, payment_received, discount, notes } = req.body;
  if (!items || items.length === 0) return res.status(400).json({ error: 'No items in order' });

  const settings = {};
  db.prepare('SELECT * FROM settings').all().forEach(s => settings[s.key] = s.value);
  const taxRate = parseFloat(settings.tax_rate || '0');

  const transaction = db.transaction(() => {
    let subtotal = 0;
    for (const item of items) {
      subtotal += item.quantity * item.unit_price;
    }

    const discountAmount = discount || 0;
    const taxableAmount = subtotal - discountAmount;
    const tax = Math.round(taxableAmount * taxRate * 100) / 100;
    const total = Math.round((taxableAmount + tax) * 100) / 100;
    const change = Math.round(Math.max(0, payment_received - total) * 100) / 100;

    const orderNumber = generateOrderNumber();
    const orderResult = db.prepare(
      'INSERT INTO orders (order_number, user_id, subtotal, tax, discount, total, payment_method, payment_received, change_amount, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(orderNumber, req.user.id, subtotal, tax, discountAmount, total, payment_method || 'cash', payment_received, change, notes || null);

    const orderId = orderResult.lastInsertRowid;
    const insertItem = db.prepare('INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, total_price) VALUES (?, ?, ?, ?, ?, ?)');
    const updateStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');

    for (const item of items) {
      insertItem.run(orderId, item.product_id, item.product_name, item.quantity, item.unit_price, item.quantity * item.unit_price);
      updateStock.run(item.quantity, item.product_id);
    }

    return db.prepare(`
      SELECT o.*, u.name as user_name, GROUP_CONCAT(oi.product_name || ' x' || oi.quantity, ', ') as items_summary
      FROM orders o LEFT JOIN order_items oi ON o.id = oi.order_id LEFT JOIN users u ON o.user_id = u.id
      WHERE o.id = ? GROUP BY o.id
    `).get(orderId);
  });

  try {
    const order = transaction();
    res.status(201).json(order);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/orders', authMiddleware, (req, res) => {
  const { date, status, limit, user_id } = req.query;
  let sql = `SELECT o.*, u.name as user_name FROM orders o LEFT JOIN users u ON o.user_id = u.id WHERE 1=1`;
  const params = [];

  if (date) { sql += " AND DATE(o.created_at) = ?"; params.push(date); }
  if (status) { sql += ' AND o.status = ?'; params.push(status); }
  if (user_id) { sql += ' AND o.user_id = ?'; params.push(user_id); }

  sql += ' ORDER BY o.created_at DESC';
  if (limit) { sql += ' LIMIT ?'; params.push(parseInt(limit)); }

  res.json(db.prepare(sql).all(...params));
});

app.get('/api/orders/:id', authMiddleware, (req, res) => {
  const order = db.prepare('SELECT o.*, u.name as user_name FROM orders o LEFT JOIN users u ON o.user_id = u.id WHERE o.id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(req.params.id);
  res.json({ ...order, items });
});

app.put('/api/orders/:id/refund', authMiddleware, (req, res) => {
  const transaction = db.transaction(() => {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
    if (!order) throw new Error('Order not found');

    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(req.params.id);
    const updateStock = db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?');
    for (const item of items) {
      updateStock.run(item.quantity, item.product_id);
    }

    db.prepare("UPDATE orders SET status = 'refunded' WHERE id = ?").run(req.params.id);
    return db.prepare('SELECT o.*, u.name as user_name FROM orders o LEFT JOIN users u ON o.user_id = u.id WHERE o.id = ?').get(req.params.id);
  });

  try {
    res.json(transaction());
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── Reports / Dashboard ───────────────────────────────────────
app.get('/api/reports/sales', authMiddleware, (req, res) => {
  const { from, to } = req.query;
  let sql = "SELECT o.*, u.name as user_name FROM orders o LEFT JOIN users u ON o.user_id = u.id WHERE o.status = 'completed'";
  const params = [];

  if (from) { sql += " AND DATE(o.created_at) >= ?"; params.push(from); }
  if (to) { sql += " AND DATE(o.created_at) <= ?"; params.push(to); }

  sql += ' ORDER BY o.created_at DESC';
  const orders = db.prepare(sql).all(...params);

  const totalSales = orders.reduce((sum, o) => sum + o.total, 0);
  const totalOrders = orders.length;
  const totalTax = orders.reduce((sum, o) => sum + o.tax, 0);
  const totalDiscount = orders.reduce((sum, o) => sum + o.discount, 0);

  const byMethod = {};
  orders.forEach(o => { byMethod[o.payment_method] = (byMethod[o.payment_method] || 0) + o.total; });

  res.json({ totalSales, totalOrders, totalTax, totalDiscount, byMethod, orders });
});

app.get('/api/reports/top-products', authMiddleware, (req, res) => {
  const { from, to, limit } = req.query;
  let sql = `
    SELECT oi.product_id, oi.product_name, SUM(oi.quantity) as total_qty, SUM(oi.total_price) as total_revenue
    FROM order_items oi JOIN orders o ON oi.order_id = o.id
    WHERE o.status = 'completed'
  `;
  const params = [];

  if (from) { sql += " AND DATE(o.created_at) >= ?"; params.push(from); }
  if (to) { sql += " AND DATE(o.created_at) <= ?"; params.push(to); }

  sql += ' GROUP BY oi.product_id ORDER BY total_revenue DESC';
  if (limit) { sql += ' LIMIT ?'; params.push(parseInt(limit)); }

  res.json(db.prepare(sql).all(...params));
});

app.get('/api/reports/low-stock', authMiddleware, (req, res) => {
  const threshold = db.prepare("SELECT value FROM settings WHERE key = 'low_stock_alert'").get();
  const limit = threshold ? parseInt(threshold.value) : 5;
  const products = db.prepare('SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.is_active = 1 AND p.stock <= ? ORDER BY p.stock ASC').all(limit);
  res.json(products);
});

// ─── Storage / Inventory Reports ───────────────────────────────
app.get('/api/reports/storage', authMiddleware, (req, res) => {
  const threshold = db.prepare("SELECT value FROM settings WHERE key = 'low_stock_alert'").get();
  const lowStockLimit = threshold ? parseInt(threshold.value) : 5;

  const allProducts = db.prepare(`
    SELECT p.*, c.name as category_name, c.icon as category_icon
    FROM products p LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.is_active = 1 ORDER BY p.stock ASC
  `).all();

  const totalItems = allProducts.reduce((sum, p) => sum + p.stock, 0);
  const totalValue = allProducts.reduce((sum, p) => sum + (p.stock * p.cost_price), 0);
  const totalRetailValue = allProducts.reduce((sum, p) => sum + (p.stock * p.price), 0);
  const outOfStock = allProducts.filter(p => p.stock <= 0).length;
  const lowStock = allProducts.filter(p => p.stock > 0 && p.stock <= lowStockLimit).length;
  const totalProducts = allProducts.length;

  const byCategory = {};
  allProducts.forEach(p => {
    const cat = p.category_name || 'Uncategorized';
    if (!byCategory[cat]) byCategory[cat] = { count: 0, stock: 0, value: 0, icon: p.category_icon || '📦' };
    byCategory[cat].count++;
    byCategory[cat].stock += p.stock;
    byCategory[cat].value += p.stock * p.cost_price;
  });

  const stockMovement = db.prepare(`
    SELECT oi.product_name, SUM(oi.quantity) as total_sold,
           MAX(o.created_at) as last_sold
    FROM order_items oi JOIN orders o ON oi.order_id = o.id
    WHERE o.status = 'completed'
    GROUP BY oi.product_id ORDER BY total_sold DESC LIMIT 20
  `).all();

  const recentRestocks = [];

  res.json({
    totalItems, totalValue, totalRetailValue,
    outOfStock, lowStock, totalProducts,
    byCategory, allProducts, stockMovement, recentRestocks
  });
});

// ─── User Reports ──────────────────────────────────────────────
app.get('/api/reports/users', authMiddleware, adminOnly, (req, res) => {
  const { from, to } = req.query;

  let dateFilter = '';
  const params = [];
  if (from) { dateFilter += " AND DATE(o.created_at) >= ?"; params.push(from); }
  if (to) { dateFilter += " AND DATE(o.created_at) <= ?"; params.push(to); }

  const userStats = db.prepare(`
    SELECT u.id, u.username, u.name, u.role,
      COUNT(CASE WHEN o.status = 'completed' THEN 1 END) as total_orders,
      COALESCE(SUM(CASE WHEN o.status = 'completed' THEN o.total END), 0) as total_sales,
      COALESCE(SUM(CASE WHEN o.status = 'completed' THEN o.tax END), 0) as total_tax,
      COALESCE(SUM(CASE WHEN o.status = 'completed' THEN o.discount END), 0) as total_discounts,
      COUNT(CASE WHEN o.status = 'refunded' THEN 1 END) as total_refunds,
      COALESCE(SUM(CASE WHEN o.status = 'refunded' THEN o.total END), 0) as refund_amount,
      COALESCE(AVG(CASE WHEN o.status = 'completed' THEN o.total END), 0) as avg_order_value,
      MAX(o.created_at) as last_order_at
    FROM users u
    LEFT JOIN orders o ON u.id = o.user_id ${dateFilter}
    WHERE u.is_active = 1
    GROUP BY u.id ORDER BY total_sales DESC
  `).all(...params);

  const userHourly = db.prepare(`
    SELECT u.name as user_name, 
      CAST(strftime('%H', o.created_at) AS INTEGER) as hour,
      COUNT(*) as order_count,
      SUM(o.total) as total_sales
    FROM orders o JOIN users u ON o.user_id = u.id
    WHERE o.status = 'completed' ${dateFilter}
    GROUP BY u.id, hour ORDER BY u.name, hour
  `).all(...params);

  res.json({ userStats, userHourly });
});

// ─── Settings ──────────────────────────────────────────────────
app.get('/api/settings', authMiddleware, (req, res) => {
  const settings = {};
  db.prepare('SELECT * FROM settings').all().forEach(s => settings[s.key] = s.value);
  res.json(settings);
});

app.put('/api/settings', authMiddleware, adminOnly, (req, res) => {
  const upsert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  const transaction = db.transaction(() => {
    for (const [key, value] of Object.entries(req.body)) {
      upsert.run(key, String(value));
    }
  });
  transaction();
  const settings = {};
  db.prepare('SELECT * FROM settings').all().forEach(s => settings[s.key] = s.value);
  res.json(settings);
});

// ─── Fallback ──────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

} // end setupRoutes

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
