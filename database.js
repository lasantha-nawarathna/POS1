const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'pos.db');

let _db = null;
let _inTransaction = false;

function save() {
  if (_db && !_inTransaction) {
    const data = _db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }
}

function queryAll(sql, params = []) {
  const stmt = _db.prepare(sql);
  if (params.length) stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function queryGet(sql, params = []) {
  const results = queryAll(sql, params);
  return results[0] || null;
}

function runSql(sql, params = []) {
  _db.run(sql, params);
  save();
  return {
    lastInsertRowid: _db.exec("SELECT last_insert_rowid() as id")[0]?.values[0][0] || 0,
    changes: _db.getRowsModified()
  };
}

function execSql(sql) {
  _db.exec(sql);
  save();
}

const dbWrapper = {
  prepare(sql) {
    return {
      get(...params) {
        return queryGet(sql, params.length ? params.flat() : []);
      },
      all(...params) {
        return queryAll(sql, params.length ? params.flat() : []);
      },
      run(...params) {
        return runSql(sql, params.length ? params.flat() : []);
      }
    };
  },
  exec(sql) {
    execSql(sql);
  },
  transaction(fn) {
    return () => {
      _inTransaction = true;
      _db.exec('BEGIN TRANSACTION');
      try {
        const result = fn();
        _db.exec('COMMIT');
        _inTransaction = false;
        save();
        return result;
      } catch (e) {
        try { _db.exec('ROLLBACK'); } catch (_) {}
        _inTransaction = false;
        throw e;
      }
    };
  }
};

const defaultCategories = [
  { name: 'Beverages', color: '#e74c3c', icon: '🥤', sort_order: 1 },
  { name: 'Food', color: '#f39c12', icon: '🍔', sort_order: 2 },
  { name: 'Snacks', color: '#2ecc71', icon: '🍿', sort_order: 3 },
  { name: 'Desserts', color: '#9b59b6', icon: '🍰', sort_order: 4 },
  { name: 'Other', color: '#95a5a6', icon: '📦', sort_order: 5 }
];

const defaultProducts = [
  { name: 'Coffee', price: 3.50, cost_price: 1.00, category: 'Beverages', stock: 100 },
  { name: 'Tea', price: 2.50, cost_price: 0.50, category: 'Beverages', stock: 100 },
  { name: 'Orange Juice', price: 4.00, cost_price: 1.50, category: 'Beverages', stock: 50 },
  { name: 'Water Bottle', price: 1.50, cost_price: 0.30, category: 'Beverages', stock: 200 },
  { name: 'Cola', price: 2.00, cost_price: 0.80, category: 'Beverages', stock: 150 },
  { name: 'Burger', price: 8.99, cost_price: 3.50, category: 'Food', stock: 30 },
  { name: 'Pizza Slice', price: 4.50, cost_price: 1.50, category: 'Food', stock: 40 },
  { name: 'Sandwich', price: 6.50, cost_price: 2.00, category: 'Food', stock: 25 },
  { name: 'Hot Dog', price: 4.00, cost_price: 1.20, category: 'Food', stock: 35 },
  { name: 'Salad', price: 7.50, cost_price: 2.50, category: 'Food', stock: 20 },
  { name: 'French Fries', price: 3.50, cost_price: 1.00, category: 'Snacks', stock: 50 },
  { name: 'Chips', price: 2.00, cost_price: 0.60, category: 'Snacks', stock: 80 },
  { name: 'Nachos', price: 5.00, cost_price: 1.80, category: 'Snacks', stock: 30 },
  { name: 'Popcorn', price: 3.00, cost_price: 0.80, category: 'Snacks', stock: 40 },
  { name: 'Cake Slice', price: 5.50, cost_price: 2.00, category: 'Desserts', stock: 15 },
  { name: 'Ice Cream', price: 4.00, cost_price: 1.20, category: 'Desserts', stock: 30 },
  { name: 'Cookie', price: 2.50, cost_price: 0.50, category: 'Desserts', stock: 60 },
  { name: 'Brownie', price: 3.50, cost_price: 1.00, category: 'Desserts', stock: 25 }
];

const defaultSettings = {
  store_name: 'My Store',
  tax_rate: '0.10',
  currency: '$',
  receipt_footer: 'Thank you for your purchase!',
  low_stock_alert: '5'
};

function seedDatabase() {
  const catCount = queryGet('SELECT COUNT(*) as count FROM categories');
  if (catCount.count > 0) return;

  for (const cat of defaultCategories) {
    runSql('INSERT INTO categories (name, color, icon, sort_order) VALUES (?, ?, ?, ?)', [cat.name, cat.color, cat.icon, cat.sort_order]);
  }

  const cats = queryAll('SELECT id, name FROM categories');
  const catMap = {};
  cats.forEach(c => catMap[c.name] = c.id);

  for (const prod of defaultProducts) {
    runSql('INSERT INTO products (name, price, cost_price, category_id, stock) VALUES (?, ?, ?, ?, ?)', [prod.name, prod.price, prod.cost_price, catMap[prod.category], prod.stock]);
  }

  for (const [key, value] of Object.entries(defaultSettings)) {
    runSql('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', [key, value]);
  }

  const crypto = require('crypto');
  const hashPassword = (pwd) => crypto.createHash('sha256').update(pwd).digest('hex');
  runSql('INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, ?)', ['admin', hashPassword('admin123'), 'Administrator', 'admin']);
  runSql('INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, ?)', ['cashier', hashPassword('cash123'), 'Default Cashier', 'cashier']);
}

async function initDatabase() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    _db = new SQL.Database(fileBuffer);
  } else {
    _db = new SQL.Database();
  }

  _db.exec('PRAGMA foreign_keys = ON');

  _db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT DEFAULT '#4a90d9',
      icon TEXT DEFAULT '📦',
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      cost_price REAL DEFAULT 0,
      category_id INTEGER,
      stock INTEGER DEFAULT 0,
      barcode TEXT UNIQUE,
      image_url TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'cashier',
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT NOT NULL UNIQUE,
      user_id INTEGER,
      subtotal REAL NOT NULL,
      tax REAL NOT NULL DEFAULT 0,
      discount REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL,
      payment_method TEXT NOT NULL DEFAULT 'cash',
      payment_received REAL NOT NULL,
      change_amount REAL NOT NULL DEFAULT 0,
      status TEXT DEFAULT 'completed',
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      product_name TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit_price REAL NOT NULL,
      total_price REAL NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  seedDatabase();
  save();

  return dbWrapper;
}

module.exports = { initDatabase };
