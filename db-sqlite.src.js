// ==========================================
// Módulo de Base de Datos SQLite Autónoma (sql.js WebAssembly / Zero-Native C++)
// VALE-LENTES POS Óptica by VT VALETEC
// ==========================================
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = process.env.SQLITE_DB_PATH || path.join(dataDir, 'valelentes.db');

let dbInstance = null;
let SQL = null;

async function getDB() {
  if (!dbInstance) {
    SQL = await initSqlJs();
    if (fs.existsSync(dbPath)) {
      const filebuffer = fs.readFileSync(dbPath);
      dbInstance = new SQL.Database(filebuffer);
    } else {
      dbInstance = new SQL.Database();
    }
    initSchema();
  }
  return dbInstance;
}

function saveDB() {
  if (dbInstance) {
    const data = dbInstance.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  }
}

function initSchema() {
  if (!dbInstance) return;

  // 0. Categorías Independientes
  dbInstance.run(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  const catStmt = dbInstance.prepare('SELECT COUNT(*) AS count FROM categories');
  if (catStmt.step() && catStmt.getAsObject().count === 0) {
    const defaultCategories = [
      'Monturas / Armazones', 'Lunas Oftálmicas', 'Lentes de Sol',
      'Lentes de Contacto', 'Soluciones y Gotas', 'Accesorios y Estuches',
      'Servicios de Optometría'
    ];
    defaultCategories.forEach(cat => {
      dbInstance.run('INSERT OR IGNORE INTO categories (name) VALUES (?)', [cat]);
    });
  }
  catStmt.free();

  // 1. Usuarios
  dbInstance.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      plain_password TEXT DEFAULT '',
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'Cajero',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 2. Productos
  dbInstance.run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      category TEXT DEFAULT 'Monturas / Armazones',
      purchase_price REAL DEFAULT 0,
      price REAL NOT NULL,
      stock INTEGER DEFAULT 0,
      min_stock INTEGER DEFAULT 5,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 3. Clientes
  dbInstance.run(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doc TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      phone TEXT DEFAULT '',
      address TEXT DEFAULT '',
      debt REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 4. Cajas
  dbInstance.run(`
    CREATE TABLE IF NOT EXISTS cash_registers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      user_name TEXT,
      opening_amount REAL NOT NULL DEFAULT 0,
      cash_sales REAL DEFAULT 0,
      card_sales REAL DEFAULT 0,
      transfer_sales REAL DEFAULT 0,
      fiado_sales REAL DEFAULT 0,
      fiado_abonos REAL DEFAULT 0,
      total_withdrawals REAL DEFAULT 0,
      expected_cash REAL DEFAULT 0,
      actual_cash REAL DEFAULT 0,
      difference REAL DEFAULT 0,
      status TEXT DEFAULT 'abierta',
      notes TEXT DEFAULT '',
      opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      closed_at DATETIME
    );
  `);

  // 5. Movimientos y Retiros de Caja
  dbInstance.run(`
    CREATE TABLE IF NOT EXISTS cash_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cash_register_id INTEGER,
      user_id INTEGER,
      user_name TEXT,
      type TEXT DEFAULT 'RETIRO',
      amount REAL NOT NULL,
      reason TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 6. Ventas
  dbInstance.run(`
    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      receipt_code TEXT UNIQUE NOT NULL,
      doc_type TEXT NOT NULL DEFAULT 'Ticket',
      customer_id INTEGER,
      customer_name TEXT DEFAULT 'Público General',
      payment_method TEXT NOT NULL,
      subtotal REAL NOT NULL,
      tax REAL NOT NULL,
      total REAL NOT NULL,
      paid_amount REAL NOT NULL,
      change_amount REAL NOT NULL,
      mixed_cash REAL DEFAULT 0,
      mixed_other REAL DEFAULT 0,
      user_id INTEGER,
      user_name TEXT,
      cash_register_id INTEGER,
      status TEXT DEFAULT 'completada',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 7. Detalle de Ítems
  dbInstance.run(`
    CREATE TABLE IF NOT EXISTS sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL,
      product_id INTEGER,
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      total_price REAL NOT NULL
    );
  `);

  // 8. Fiados
  dbInstance.run(`
    CREATE TABLE IF NOT EXISTS fiado_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      user_id INTEGER,
      user_name TEXT DEFAULT 'Sistema',
      type TEXT NOT NULL,
      payment_method TEXT DEFAULT 'Efectivo',
      amount REAL NOT NULL,
      balance_after REAL NOT NULL,
      details TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 9. Reabastecimiento e Ingresos de Inventario (Kardex)
  dbInstance.run(`
    CREATE TABLE IF NOT EXISTS stock_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      type TEXT DEFAULT 'INGRESO',
      doc_type TEXT DEFAULT 'Guía de Remisión',
      doc_number TEXT DEFAULT '',
      supplier_notes TEXT DEFAULT '',
      user_id INTEGER,
      user_name TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 10. Datos de la Empresa y Tickets
  dbInstance.run(`
    CREATE TABLE IF NOT EXISTS company_settings (
      id INTEGER PRIMARY KEY DEFAULT 1,
      name TEXT NOT NULL DEFAULT 'ÓPTICA VALE-LENTES by VALETEC',
      ruc TEXT NOT NULL DEFAULT '20123456789',
      address TEXT NOT NULL DEFAULT 'Av. Principal 123 - Lima, Perú',
      phone TEXT NOT NULL DEFAULT '987654321',
      ticket_footer TEXT NOT NULL DEFAULT '¡Gracias por su preferencia! Su salud visual en las mejores manos.',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  dbInstance.run(`
    INSERT OR IGNORE INTO company_settings (id, name, ruc, address, phone, ticket_footer)
    VALUES (1, 'ÓPTICA VALE-LENTES by VALETEC', '20123456789', 'Av. Principal 123 - Lima, Perú', '987654321', '¡Gracias por su preferencia! Su salud visual en las mejores manos.');
  `);

  // Sembrar Usuarios por defecto si está vacía
  const userStmt = dbInstance.prepare('SELECT COUNT(*) AS count FROM users');
  if (userStmt.step()) {
    const row = userStmt.getAsObject();
    if (row.count === 0) {
      console.log('🌱 Sembrando usuarios predeterminados...');
      const passAdmin = bcrypt.hashSync('admin123', 10);
      const passCajero = bcrypt.hashSync('cajero123', 10);

      dbInstance.run('INSERT INTO users (username, password, plain_password, name, role) VALUES (?, ?, ?, ?, ?)', ['admin', passAdmin, 'admin123', 'Administrador Principal', 'Admin']);
      dbInstance.run('INSERT INTO users (username, password, plain_password, name, role) VALUES (?, ?, ?, ?, ?)', ['cajero', passCajero, 'cajero123', 'Cajero Turno Mañana', 'Cajero']);
    }
  }
  userStmt.free();

  // Sembrar cliente de ejemplo inicial
  const custStmt = dbInstance.prepare('SELECT COUNT(*) AS count FROM customers');
  if (custStmt.step() && custStmt.getAsObject().count === 0) {
    dbInstance.run('INSERT INTO customers (doc, name, phone, address, debt) VALUES (?, ?, ?, ?, ?)',
      ['45892301', 'Juan Pérez (Medición: OD -1.50 / OI -1.25)', '987654321', 'Av. Central 123', 0]);
  }
  custStmt.free();

  saveDB();
}

async function query(sql, params = []) {
  const db = await getDB();
  const trimmed = sql.trim().toUpperCase();
  const isSelect = trimmed.startsWith('SELECT') || trimmed.startsWith('PRAGMA');

  // Convertir $1, $2 en ? si vienen con formato postgres
  let formattedSql = sql;
  if (/\$[0-9]+/.test(formattedSql)) {
    formattedSql = formattedSql.replace(/\$[0-9]+/g, '?');
  }

  if (isSelect) {
    const stmt = db.prepare(formattedSql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return { rows, rowCount: rows.length };
  } else {
    db.run(formattedSql, params);
    saveDB();
    const lastIdStmt = db.prepare('SELECT last_insert_rowid() AS lastID, changes() AS changes');
    let lastID = 0;
    let rowCount = 0;
    if (lastIdStmt.step()) {
      const obj = lastIdStmt.getAsObject();
      lastID = obj.lastID;
      rowCount = obj.changes;
    }
    lastIdStmt.free();
    return { lastID, rowCount, rows: [] };
  }
}

module.exports = {
  getDB,
  query,
  saveDB
};
