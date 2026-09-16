// ==========================================
// Servidor Standalone Backend API (Express + WebSockets Socket.io + SQLite)
// VALEVENTAS POS by VT VALETEC
// ==========================================
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db = require('./db-sqlite');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

const PORT = process.env.PORT || 3008;
const JWT_SECRET = process.env.JWT_SECRET || 'valetec_jwt_super_secret_key_2026';

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: '⚠️ Demasiados intentos fallidos de inicio de sesión. Por seguridad, espere 1 minuto antes de reintentar.' },
  standardHeaders: true,
  legacyHeaders: false
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
  console.log(`🔌 Cliente WebSocket conectado (ID: ${socket.id})`);
  socket.on('disconnect', () => {
    console.log(`🔌 Cliente WebSocket desconectado (ID: ${socket.id})`);
  });
});

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Acceso no autorizado. Token JWT requerido.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Sesión expirada o token no válido.' });
  }
}

function adminOnly(req, res, next) {
  if (req.user && req.user.role === 'Admin') {
    next();
  } else {
    res.status(403).json({ error: 'Acceso denegado. Se requieren permisos de Administrador.' });
  }
}

// 0. AUTENTICACIÓN
app.post('/api/auth/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña son requeridos.' });
  }

  try {
    const result = await db.query('SELECT * FROM users WHERE username = ?', [username.trim()]);
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    }

    const match = bcrypt.compareSync(password, user.password);
    if (!match) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, name: user.name, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role
      }
    });

  } catch (err) {
    console.error('❌ Error en login:', err.message);
    res.status(500).json({ error: 'Error al procesar el inicio de sesión.' });
  }
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

// 1. DASHBOARD
app.get('/api/dashboard', authMiddleware, async (req, res) => {
  try {
    const salesRes = await db.query(`
      SELECT COALESCE(SUM(total), 0) AS totalSales, COUNT(id) AS ticketsCount
      FROM sales WHERE DATE(created_at) = DATE('now') AND status = 'completada'
    `);

    const fiadosRes = await db.query('SELECT COALESCE(SUM(debt), 0) AS totalDebt FROM customers');

    const topProdRes = await db.query(`
      SELECT product_name, SUM(quantity) as totalQty 
      FROM sale_items GROUP BY product_name ORDER BY totalQty DESC LIMIT 1
    `);

    const lowStockRes = await db.query('SELECT COUNT(id) AS lowStockCount FROM products WHERE stock <= min_stock');

    res.json({
      todaySales: salesRes.rows[0] ? (salesRes.rows[0].totalSales || 0) : 0,
      todayTickets: salesRes.rows[0] ? (salesRes.rows[0].ticketsCount || 0) : 0,
      totalFiadosDebt: fiadosRes.rows[0] ? (fiadosRes.rows[0].totalDebt || 0) : 0,
      topProduct: topProdRes.rows[0] ? topProdRes.rows[0].product_name : 'N/A',
      lowStockCount: lowStockRes.rows[0] ? (lowStockRes.rows[0].lowStockCount || 0) : 0
    });
  } catch (err) {
    console.error('❌ Error cargando dashboard:', err.message);
    res.status(500).json({ error: 'Error al obtener métricas del sistema.' });
  }
});

// 2. PRODUCTOS
app.get('/api/products', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM products ORDER BY name ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Error obteniendo productos:', err.message);
    res.status(500).json({ error: 'Error al consultar inventario.' });
  }
});

app.post('/api/products', authMiddleware, adminOnly, async (req, res) => {
  const { code, name, category, purchase_price, price, stock, min_stock } = req.body;
  if (!code || !name || price === undefined) {
    return res.status(400).json({ error: 'Código, nombre y precio son requeridos.' });
  }

  try {
    const query = `
      INSERT INTO products (code, name, category, purchase_price, price, stock, min_stock)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    const result = await db.query(query, [
      code, name, category || 'Abarrotes',
      purchase_price || 0, price, stock || 0, min_stock || 5
    ]);
    io.emit('products_changed');
    res.json({ id: result.lastID, ...req.body });
  } catch (err) {
    console.error('❌ Error registrando producto:', err.message);
    res.status(400).json({ error: 'El código de producto ya existe o los datos son inválidos.' });
  }
});

app.put('/api/products/:id', authMiddleware, adminOnly, async (req, res) => {
  const { id } = req.params;
  const { code, name, category, purchase_price, price, stock, min_stock } = req.body;
  try {
    const query = `
      UPDATE products 
      SET code = ?, name = ?, category = ?, purchase_price = ?, price = ?, stock = ?, min_stock = ?
      WHERE id = ?
    `;
    await db.query(query, [code, name, category, purchase_price, price, stock, min_stock, id]);
    io.emit('products_changed');
    res.json({ message: 'Producto actualizado con éxito' });
  } catch (err) {
    console.error('❌ Error actualizando producto:', err.message);
    res.status(500).json({ error: 'Error al actualizar el producto.' });
  }
});

// REABASTECIMIENTO DE STOCK CON GUÍA / FACTURA / MERMA / CORTESÍA
app.post('/api/products/:id/stock', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { quantity, doc_type, doc_number, supplier_notes, new_purchase_price, new_price, movement_type } = req.body;
  const qty = parseInt(quantity);

  if (isNaN(qty) || qty <= 0) {
    return res.status(400).json({ error: 'La cantidad a ingresar debe ser un número entero mayor a 0.' });
  }

  try {
    const prodRes = await db.query('SELECT id, name, stock FROM products WHERE id = ?', [id]);
    const product = prodRes.rows[0];
    if (!product) return res.status(404).json({ error: 'Producto no encontrado.' });

    const mType = movement_type || 'INGRESO';
    let isReduction = ['MERMA', 'CORTESIA', 'SALIDA_INTERNA'].includes(mType);
    let newStock = isReduction ? Math.max(0, product.stock - qty) : product.stock + qty;

    await db.query('UPDATE products SET stock = ? WHERE id = ?', [newStock, id]);

    if (new_purchase_price !== undefined && new_purchase_price !== '') {
      await db.query('UPDATE products SET purchase_price = ? WHERE id = ?', [parseFloat(new_purchase_price), id]);
    }
    if (new_price !== undefined && new_price !== '') {
      await db.query('UPDATE products SET price = ? WHERE id = ?', [parseFloat(new_price), id]);
    }

    const userName = req.user ? req.user.name : 'Usuario';
    const userId = req.user ? req.user.id : null;
    await db.query(`
      INSERT INTO stock_movements (product_id, product_name, quantity, type, doc_type, doc_number, supplier_notes, user_id, user_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, product.name, qty, mType, doc_type || 'Guía de Remisión', doc_number || '', supplier_notes || '', userId, userName]);

    io.emit('products_changed');
    const msg = isReduction ? `Salida de stock registrada (${mType}): -${qty} unds.` : `Stock ingresado exitosamente: +${qty} unds.`;
    res.json({ success: true, message: msg, newStock });
  } catch (err) {
    console.error('❌ Error registrando stock:', err.message);
    res.status(500).json({ error: 'Error al registrar stock.' });
  }
});

app.get('/api/inventory/movements', authMiddleware, async (req, res) => {
  const { type } = req.query;
  try {
    let sql = 'SELECT * FROM stock_movements';
    let params = [];
    if (type && type !== 'Todos') {
      sql += ' WHERE type = ?';
      params.push(type);
    }
    sql += ' ORDER BY id DESC LIMIT 100';
    const result = await db.query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Error consultando kardex:', err.message);
    res.status(500).json({ error: 'Error al obtener movimientos de inventario.' });
  }
});

app.delete('/api/products/:id', authMiddleware, adminOnly, async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM products WHERE id = ?', [id]);
    io.emit('products_changed');
    res.json({ message: 'Producto eliminado' });
  } catch (err) {
    console.error('❌ Error eliminando producto:', err.message);
    res.status(500).json({ error: 'Error al eliminar el producto.' });
  }
});

// 3. CLIENTES
app.get('/api/customers', authMiddleware, async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM customers ORDER BY name ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Error obteniendo clientes:', err.message);
    res.status(500).json({ error: 'Error al consultar clientes.' });
  }
});

app.post('/api/customers', authMiddleware, async (req, res) => {
  const { doc, name, phone, address } = req.body;
  if (!doc || !name) {
    return res.status(400).json({ error: 'Documento (DNI/RUC) y Nombre son requeridos.' });
  }

  try {
    const query = `INSERT INTO customers (doc, name, phone, address, debt) VALUES (?, ?, ?, ?, 0)`;
    const result = await db.query(query, [doc, name, phone || '', address || '']);
    io.emit('customers_changed');
    res.json({ id: result.lastID, doc, name, phone, address, debt: 0 });
  } catch (err) {
    console.error('❌ Error registrando cliente:', err.message);
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: '⚠️ Ya existe un cliente registrado con este Documento (DNI/RUC).' });
    }
    res.status(500).json({ error: 'Error al registrar cliente.' });
  }
});

// 4. CAJA DIARIA
app.get('/api/cash-register/current', async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM cash_registers WHERE status = 'abierta' ORDER BY id DESC LIMIT 1");
    const reg = result.rows[0] || null;
    if (reg) {
      reg.opening_amount = parseFloat(reg.opening_amount) || 0;
      reg.cash_sales = parseFloat(reg.cash_sales) || 0;
      reg.card_sales = parseFloat(reg.card_sales) || 0;
      reg.transfer_sales = parseFloat(reg.transfer_sales) || 0;
      reg.fiado_sales = parseFloat(reg.fiado_sales) || 0;
      reg.fiado_abonos = parseFloat(reg.fiado_abonos) || 0;
      reg.total_withdrawals = parseFloat(reg.total_withdrawals) || 0;
      reg.expected_cash = reg.opening_amount + reg.cash_sales + reg.fiado_abonos - reg.total_withdrawals;
      
      const movs = await db.query("SELECT * FROM cash_movements WHERE cash_register_id = ? ORDER BY id DESC", [reg.id]);
      reg.movements = movs.rows;

      const abonosRes = await db.query(`
        SELECT fp.id, fp.customer_id, COALESCE(c.name, 'Cliente Registrado') AS customer_name, COALESCE(c.doc, '-') AS customer_doc, COALESCE(fp.user_name, 'Sistema') AS user_name, fp.amount, fp.details, fp.created_at
        FROM fiado_payments fp
        LEFT JOIN customers c ON c.id = fp.customer_id
        WHERE fp.type = 'ABONO' AND fp.created_at >= ?
        ORDER BY fp.id DESC
      `, [reg.opened_at]);
      reg.shift_abonos = abonosRes.rows;
    }
    res.json(reg);
  } catch (err) {
    console.error('❌ Error obteniendo caja actual:', err.message);
    res.status(500).json({ error: 'Error obteniendo estado de caja.' });
  }
});

app.post('/api/cash-register/open', authMiddleware, async (req, res) => {
  const { opening_amount } = req.body;
  const initialAmt = parseFloat(opening_amount) || 0;

  try {
    const checkActive = await db.query("SELECT id FROM cash_registers WHERE status = 'abierta'");
    if (checkActive.rows.length > 0) {
      return res.status(400).json({ error: 'Ya existe una caja abierta actualmente.' });
    }

    const query = `
      INSERT INTO cash_registers (user_id, user_name, opening_amount, expected_cash, status)
      VALUES (?, ?, ?, ?, 'abierta')
    `;
    const result = await db.query(query, [req.user.id, req.user.name, initialAmt, initialAmt]);
    io.emit('cash_register_changed');
    res.json({ id: result.lastID, user_id: req.user.id, user_name: req.user.name, opening_amount: initialAmt, status: 'abierta' });
  } catch (err) {
    console.error('❌ Error abriendo caja:', err.message);
    res.status(500).json({ error: 'Error al abrir caja.' });
  }
});

// RETIRO DE EFECTIVO DE CAJA CON MOTIVO (Exclusivo Administrador)
app.post('/api/cash-register/movement', authMiddleware, adminOnly, async (req, res) => {
  const { amount, reason } = req.body;
  const withdrawalAmt = parseFloat(amount);

  if (isNaN(withdrawalAmt) || withdrawalAmt <= 0) {
    return res.status(400).json({ error: 'El monto del retiro debe ser un número mayor a 0.' });
  }
  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: 'Debe ingresar un motivo o concepto para el retiro de caja.' });
  }

  try {
    const activeRes = await db.query("SELECT * FROM cash_registers WHERE status = 'abierta' ORDER BY id DESC LIMIT 1");
    const activeRegister = activeRes.rows[0];

    if (!activeRegister) {
      return res.status(400).json({ error: 'No hay ninguna caja abierta para registrar el retiro.' });
    }

    await db.query(`
      INSERT INTO cash_movements (cash_register_id, user_id, user_name, type, amount, reason)
      VALUES (?, ?, ?, 'RETIRO', ?, ?)
    `, [activeRegister.id, req.user.id, req.user.name, withdrawalAmt, reason.trim()]);

    const newWithdrawals = (parseFloat(activeRegister.total_withdrawals) || 0) + withdrawalAmt;
    const newExpected = (parseFloat(activeRegister.opening_amount) || 0) + (parseFloat(activeRegister.cash_sales) || 0) + (parseFloat(activeRegister.fiado_abonos) || 0) - newWithdrawals;

    await db.query(`
      UPDATE cash_registers 
      SET total_withdrawals = ?, expected_cash = ? 
      WHERE id = ?
    `, [newWithdrawals, newExpected, activeRegister.id]);

    io.emit('cash_register_changed');

    res.json({
      success: true,
      message: `Retiro de S/ ${withdrawalAmt.toFixed(2)} registrado correctamente por ${req.user.name}`,
      newWithdrawals,
      newExpected
    });

  } catch (err) {
    console.error('❌ Error registrando retiro de caja:', err.message);
    res.status(500).json({ error: 'Error al registrar el retiro de caja.' });
  }
});

app.post('/api/cash-register/close', authMiddleware, async (req, res) => {
  const { actual_cash, notes } = req.body;
  const actualAmt = parseFloat(actual_cash) || 0;

  try {
    const activeRes = await db.query("SELECT * FROM cash_registers WHERE status = 'abierta' ORDER BY id DESC LIMIT 1");
    const activeRegister = activeRes.rows[0];

    if (!activeRegister) {
      return res.status(400).json({ error: 'No hay ninguna caja abierta para cerrar.' });
    }

    const expectedCash = (parseFloat(activeRegister.opening_amount) || 0) + 
                         (parseFloat(activeRegister.cash_sales) || 0) + 
                         (parseFloat(activeRegister.fiado_abonos) || 0) - 
                         (parseFloat(activeRegister.total_withdrawals) || 0);
    const difference = actualAmt - expectedCash;

    const updateQuery = `
      UPDATE cash_registers 
      SET expected_cash = ?, actual_cash = ?, difference = ?, status = 'cerrada', notes = ?, closed_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `;

    await db.query(updateQuery, [expectedCash, actualAmt, difference, notes || '', activeRegister.id]);
    io.emit('cash_register_changed');
    res.json({ success: true, message: 'Cierre Z completado correctamente' });

  } catch (err) {
    console.error('❌ Error cerrando caja Z:', err.message);
    res.status(500).json({ error: 'Error al realizar el cierre de caja.' });
  }
});

// 5. VENTAS
app.get('/api/sales', authMiddleware, async (req, res) => {
  const { startDate, endDate, paymentMethod, docType, userId, q } = req.query;

  try {
    let whereConditions = ["s.status = 'completada'"];
    let queryParams = [];

    if (startDate) {
      whereConditions.push("DATE(s.created_at) >= ?");
      queryParams.push(startDate);
    }
    if (endDate) {
      whereConditions.push("DATE(s.created_at) <= ?");
      queryParams.push(endDate);
    }

    if (paymentMethod && paymentMethod !== 'Todos') {
      whereConditions.push('s.payment_method = ?');
      queryParams.push(paymentMethod);
    }

    if (docType && docType !== 'Todos') {
      whereConditions.push('s.doc_type = ?');
      queryParams.push(docType);
    }

    if (userId && userId !== 'Todos') {
      whereConditions.push('s.user_id = ?');
      queryParams.push(parseInt(userId));
    }

    if (q && q.trim()) {
      const pattern = `%${q.trim().toLowerCase()}%`;
      whereConditions.push('(LOWER(s.receipt_code) LIKE ? OR LOWER(s.customer_name) LIKE ? OR LOWER(s.user_name) LIKE ?)');
      queryParams.push(pattern, pattern, pattern);
    }

    const whereClause = whereConditions.join(' AND ');

    const salesQuery = `
      SELECT 
        s.*,
        COALESCE(
          (SELECT SUM((si.unit_price - COALESCE(p.purchase_price, 0)) * si.quantity)
           FROM sale_items si
           LEFT JOIN products p ON si.product_id = p.id
           WHERE si.sale_id = s.id), 0
        ) AS profit
      FROM sales s
      WHERE ${whereClause}
      ORDER BY s.id DESC
    `;

    const result = await db.query(salesQuery, queryParams);
    const sales = result.rows;

    let totalSales = 0;
    let totalProfit = 0;
    let breakdown = { cash: 0, card: 0, transfer: 0, fiado: 0, fiadoAbonos: 0 };

    sales.forEach(s => {
      totalSales += s.total;
      totalProfit += s.profit;

      if (s.payment_method === 'Efectivo') breakdown.cash += s.total;
      else if (s.payment_method === 'Tarjeta') breakdown.card += s.total;
      else if (s.payment_method === 'Yape/Plin') breakdown.transfer += s.total;
      else if (s.payment_method === 'Fiado') breakdown.fiado += s.total;
      else if (s.payment_method === 'Pago Mixto') {
        breakdown.cash += (parseFloat(s.mixed_cash) || 0);
        breakdown.transfer += (parseFloat(s.mixed_other) || 0);
      }
    });

    let abonoConds = ["fp.type = 'ABONO'"];
    let abonoParams = [];
    if (startDate) {
      abonoConds.push("DATE(fp.created_at) >= ?");
      abonoParams.push(startDate);
    }
    if (endDate) {
      abonoConds.push("DATE(fp.created_at) <= ?");
      abonoParams.push(endDate);
    }

    const abonosResult = await db.query(`
      SELECT fp.id, fp.customer_id, COALESCE(c.name, 'Cliente Registrado') AS customer_name, COALESCE(c.doc, '-') AS customer_doc, COALESCE(fp.user_name, 'Sistema') AS user_name, fp.type, fp.amount, fp.details, fp.created_at
      FROM fiado_payments fp
      LEFT JOIN customers c ON c.id = fp.customer_id
      WHERE ${abonoConds.join(' AND ')}
      ORDER BY fp.id DESC
    `, abonoParams);
    const abonos = abonosResult.rows;
    let totalFiadoAbonos = 0;
    abonos.forEach(a => { totalFiadoAbonos += (parseFloat(a.amount) || 0); });
    breakdown.fiadoAbonos = totalFiadoAbonos;

    const ticketsCount = sales.length;
    const averageTicket = ticketsCount > 0 ? totalSales / ticketsCount : 0;

    res.json({
      summary: { totalSales, totalProfit, ticketsCount, averageTicket, breakdown },
      sales,
      abonos
    });

  } catch (err) {
    console.error('❌ Error filtrando ventas:', err.message);
    res.status(500).json({ error: 'Error al consultar reporte de ventas.' });
  }
});

app.put('/api/sales/:id', authMiddleware, adminOnly, async (req, res) => {
  const { id } = req.params;
  const { doc_type, payment_method, customer_id, customer_name } = req.body;

  try {
    const saleRes = await db.query('SELECT * FROM sales WHERE id = ?', [id]);
    const oldSale = saleRes.rows[0];

    if (!oldSale || oldSale.status === 'anulada') {
      return res.status(400).json({ error: 'La venta no existe o está anulada.' });
    }

    const oldTotal = parseFloat(oldSale.total);
    if (oldSale.payment_method === 'Fiado' && oldSale.customer_id) {
      const custRes = await db.query('SELECT debt FROM customers WHERE id = ?', [oldSale.customer_id]);
      if (custRes.rows[0]) {
        const revertedDebt = Math.max(0, custRes.rows[0].debt - oldTotal);
        await db.query('UPDATE customers SET debt = ? WHERE id = ?', [revertedDebt, oldSale.customer_id]);
      }
    }

    let finalCustId = customer_id !== undefined ? customer_id : oldSale.customer_id;
    let finalCustName = customer_name !== undefined ? customer_name : oldSale.customer_name;
    let finalDocType = doc_type || oldSale.doc_type;
    let finalPayMethod = payment_method || oldSale.payment_method;

    if (finalPayMethod === 'Fiado' && finalCustId) {
      const custRes = await db.query('SELECT debt FROM customers WHERE id = ?', [finalCustId]);
      if (custRes.rows[0]) {
        const newDebt = custRes.rows[0].debt + oldTotal;
        await db.query('UPDATE customers SET debt = ? WHERE id = ?', [newDebt, finalCustId]);
      }
    }

    await db.query(`
      UPDATE sales SET doc_type = ?, payment_method = ?, customer_id = ?, customer_name = ? WHERE id = ?
    `, [finalDocType, finalPayMethod, finalCustId || null, finalCustName || 'Público General', id]);

    io.emit('sales_changed');
    io.emit('customers_changed');

    res.json({ success: true, message: 'Venta actualizada correctamente' });
  } catch (err) {
    console.error('❌ Error editando venta:', err.message);
    res.status(500).json({ error: 'Error al editar la venta.' });
  }
});

app.put('/api/sales/:id/anular', authMiddleware, adminOnly, async (req, res) => {
  const { id } = req.params;

  try {
    const saleRes = await db.query('SELECT * FROM sales WHERE id = ?', [id]);
    const sale = saleRes.rows[0];

    if (!sale || sale.status === 'anulada') {
      return res.status(400).json({ error: 'Venta no encontrada o ya anulada.' });
    }

    const itemsRes = await db.query('SELECT product_id, quantity FROM sale_items WHERE sale_id = ?', [id]);
    for (const item of itemsRes.rows) {
      if (item.product_id) {
        await db.query('UPDATE products SET stock = stock + ? WHERE id = ?', [item.quantity, item.product_id]);
      }
    }

    if (sale.payment_method === 'Fiado' && sale.customer_id) {
      const custRes = await db.query('SELECT debt FROM customers WHERE id = ?', [sale.customer_id]);
      const newDebt = Math.max(0, custRes.rows[0].debt - sale.total);
      await db.query('UPDATE customers SET debt = ? WHERE id = ?', [newDebt, sale.customer_id]);
      await db.query(`
        INSERT INTO fiado_payments (customer_id, type, amount, details, balance_after)
        VALUES (?, 'ANULACION', ?, ?, ?)
      `, [sale.customer_id, sale.total, 'Anulación de venta #' + id, newDebt]);
    }

    await db.query("UPDATE sales SET status = 'anulada' WHERE id = ?", [id]);
    io.emit('products_changed');
    io.emit('sales_changed');
    io.emit('cash_register_changed');

    res.json({ success: true, message: 'Venta anulada correctamente', receipt_code: sale.receipt_code });

  } catch (err) {
    console.error('❌ Error anulando venta:', err.message);
    res.status(500).json({ error: 'Error al anular la venta.' });
  }
});

app.post('/api/sales', authMiddleware, async (req, res) => {
  const { doc_type, customer_id, customer_name, payment_method, items, paid_amount, change_amount } = req.body;

  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'El carrito no puede estar vacío.' });
  }

  try {
    const activeRegisterRes = await db.query("SELECT id FROM cash_registers WHERE status = 'abierta' ORDER BY id DESC LIMIT 1");
    const activeRegister = activeRegisterRes.rows[0];

    if (!activeRegister) {
      return res.status(400).json({ error: '⚠️ No hay ninguna caja abierta en este turno. Debe abrir la caja antes de procesar ventas.' });
    }

    if (payment_method === 'Fiado' && (!customer_id || parseInt(customer_id) <= 0)) {
      return res.status(400).json({ error: '⚠️ Para registrar una venta a FIADO es obligatorio seleccionar un cliente registrado.' });
    }

    let total = 0;
    items.forEach(i => { total += i.quantity * i.unit_price; });

    const subtotal = total / 1.18;
    const tax = total - subtotal;

    const mixedCashAmt = payment_method === 'Pago Mixto' ? (parseFloat(req.body.mixed_cash) || 0) : 0;
    const mixedOtherAmt = payment_method === 'Pago Mixto' ? (parseFloat(req.body.mixed_other) || (total - mixedCashAmt)) : 0;

    for (const item of items) {
      if (item.product_id) {
        const prodRes = await db.query('SELECT stock FROM products WHERE id = ?', [item.product_id]);
        if (!prodRes.rows[0] || prodRes.rows[0].stock < item.quantity) {
          return res.status(400).json({ error: `Stock insuficiente para ${item.product_name}.` });
        }
      }
    }

    const prefix = doc_type === 'Factura' ? 'F' : (doc_type === 'Boleta' ? 'B' : 'T');
    const countRes = await db.query('SELECT COUNT(id) AS count FROM sales WHERE doc_type = ?', [doc_type || 'Ticket']);
    const nextNum = (countRes.rows[0] ? countRes.rows[0].count : 0) + 1;
    const receipt_code = `${prefix}001-${String(nextNum).padStart(6, '0')}`;

    const saleInsertRes = await db.query(`
      INSERT INTO sales (receipt_code, doc_type, customer_id, customer_name, payment_method, subtotal, tax, total, paid_amount, change_amount, user_id, user_name, cash_register_id, mixed_cash, mixed_other)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [receipt_code, doc_type || 'Ticket', customer_id || null, customer_name || 'Público General', payment_method, subtotal, tax, total, paid_amount || total, change_amount || 0, req.user.id, req.user.name, activeRegister.id, mixedCashAmt, mixedOtherAmt]);

    const saleId = saleInsertRes.lastID;

    for (const item of items) {
      const itemSubtotal = item.quantity * item.unit_price;
      await db.query(`
        INSERT INTO sale_items (sale_id, product_id, product_name, quantity, unit_price, total_price)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [saleId, item.product_id, item.product_name, item.quantity, item.unit_price, itemSubtotal]);

      if (item.product_id) {
        await db.query('UPDATE products SET stock = stock - ? WHERE id = ?', [item.quantity, item.product_id]);
      }
    }

    if (payment_method === 'Fiado' && customer_id) {
      const custRes = await db.query('SELECT debt FROM customers WHERE id = ?', [customer_id]);
      const newDebt = (custRes.rows[0] ? custRes.rows[0].debt : 0) + total;
      const details = items.map(i => `${i.quantity}x ${i.product_name}`).join(', ');

      await db.query('UPDATE customers SET debt = ? WHERE id = ?', [newDebt, customer_id]);
      await db.query(`
        INSERT INTO fiado_payments (customer_id, user_id, user_name, type, payment_method, amount, details, balance_after)
        VALUES (?, ?, ?, 'COMPRA_FIADA', 'Fiado', ?, ?, ?)
      `, [customer_id, req.user.id, req.user.name, total, details, newDebt]);
    }

    if (payment_method === 'Efectivo') {
      await db.query("UPDATE cash_registers SET cash_sales = cash_sales + ? WHERE id = ?", [total, activeRegister.id]);
    } else if (payment_method === 'Tarjeta') {
      await db.query("UPDATE cash_registers SET card_sales = card_sales + ? WHERE id = ?", [total, activeRegister.id]);
    } else if (payment_method === 'Yape/Plin') {
      await db.query("UPDATE cash_registers SET transfer_sales = transfer_sales + ? WHERE id = ?", [total, activeRegister.id]);
    } else if (payment_method === 'Pago Mixto') {
      await db.query("UPDATE cash_registers SET cash_sales = cash_sales + ?, transfer_sales = transfer_sales + ? WHERE id = ?", [mixedCashAmt, mixedOtherAmt, activeRegister.id]);
    } else if (payment_method === 'Fiado') {
      await db.query("UPDATE cash_registers SET fiado_sales = fiado_sales + ? WHERE id = ?", [total, activeRegister.id]);
    }

    io.emit('products_changed');
    io.emit('sales_changed');
    io.emit('cash_register_changed');
    if (payment_method === 'Fiado') io.emit('customers_changed');

    res.json({ success: true, receipt_code, saleId, total, payment_method, sellerName: req.user.name });

  } catch (err) {
    console.error('❌ Error procesando venta:', err.message);
    res.status(500).json({ error: 'Error procesando la venta: ' + err.message });
  }
});

// 6. FIADOS
app.get('/api/fiados/:customerId', authMiddleware, async (req, res) => {
  const { customerId } = req.params;
  try {
    const result = await db.query('SELECT *, COALESCE(payment_method, \'Efectivo\') AS payment_method FROM fiado_payments WHERE customer_id = ? ORDER BY id DESC', [customerId]);
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Error consultando fiados:', err.message);
    res.status(500).json({ error: 'Error consultando fiados.' });
  }
});

app.post('/api/fiados/abono', authMiddleware, async (req, res) => {
  const { customer_id, amount, payment_method } = req.body;
  const abonoAmt = parseFloat(amount);
  const payMethod = payment_method || 'Efectivo';

  if (!customer_id || isNaN(abonoAmt) || abonoAmt <= 0) {
    return res.status(400).json({ error: 'Monto de abono válido es requerido.' });
  }

  try {
    const custRes = await db.query('SELECT debt, name FROM customers WHERE id = ?', [customer_id]);
    const customer = custRes.rows[0];

    if (!customer) {
      return res.status(404).json({ error: 'Cliente no encontrado.' });
    }

    const newDebt = Math.max(0, customer.debt - abonoAmt);
    await db.query('UPDATE customers SET debt = ? WHERE id = ?', [newDebt, customer_id]);

    await db.query(`
      INSERT INTO fiado_payments (customer_id, user_id, user_name, type, payment_method, amount, details, balance_after)
      VALUES (?, ?, ?, 'ABONO', ?, ?, ?, ?)
    `, [customer_id, req.user.id, req.user.name, payMethod, abonoAmt, `Abono / Pago en ${payMethod}`, newDebt]);

    let updateCashSql = "UPDATE cash_registers SET fiado_abonos = COALESCE(fiado_abonos, 0) + ? WHERE status = 'abierta'";
    if (payMethod === 'Efectivo') {
      updateCashSql = "UPDATE cash_registers SET fiado_abonos = COALESCE(fiado_abonos, 0) + ? WHERE status = 'abierta'";
    } else if (payMethod === 'Tarjeta') {
      updateCashSql = "UPDATE cash_registers SET card_sales = card_sales + ? WHERE status = 'abierta'";
    } else if (payMethod === 'Yape/Plin') {
      updateCashSql = "UPDATE cash_registers SET transfer_sales = transfer_sales + ? WHERE status = 'abierta'";
    }
    await db.query(updateCashSql, [abonoAmt]);

    io.emit('customers_changed');
    io.emit('cash_register_changed');

    const abonoCode = `AB-${String(Date.now()).slice(-6)}`;
    res.json({
      success: true,
      message: `Abono de S/ ${abonoAmt.toFixed(2)} (${payMethod}) registrado correctamente por ${req.user.name}`,
      receipt_code: abonoCode,
      customer_name: customer.name,
      user_name: req.user.name,
      amount: abonoAmt,
      payment_method: payMethod,
      newDebt
    });

  } catch (err) {
    console.error('❌ Error registrando abono:', err.message);
    res.status(500).json({ error: 'Error al registrar abono.' });
  }
});

// ANULAR ABONO DE DEUDA (Solo Administrador)
app.post('/api/fiados/abono/:id/anular', authMiddleware, adminOnly, async (req, res) => {
  const { id } = req.params;

  try {
    const paymentRes = await db.query('SELECT id, customer_id, type, amount, payment_method, details FROM fiado_payments WHERE id = ?', [id]);
    const payment = paymentRes.rows[0];

    if (!payment || payment.type !== 'ABONO') {
      return res.status(400).json({ error: 'El registro no existe o no es un abono válido para anular.' });
    }

    if (payment.details && payment.details.includes('[ANULADO]')) {
      return res.status(400).json({ error: 'Este abono ya se encuentra anulado.' });
    }

    const custRes = await db.query('SELECT debt, name FROM customers WHERE id = ?', [payment.customer_id]);
    const customer = custRes.rows[0];
    if (!customer) {
      return res.status(404).json({ error: 'Cliente no encontrado.' });
    }

    // 1. Restaurar la deuda del cliente
    const restoredDebt = parseFloat(customer.debt) + parseFloat(payment.amount);
    await db.query('UPDATE customers SET debt = ? WHERE id = ?', [restoredDebt, payment.customer_id]);

    // 2. Registrar el movimiento de anulación en el historial
    await db.query(`
      INSERT INTO fiado_payments (customer_id, user_id, user_name, type, payment_method, amount, details, balance_after)
      VALUES (?, ?, ?, 'ANULACION_ABONO', ?, ?, ?, ?)
    `, [payment.customer_id, req.user.id, req.user.name, payment.payment_method, payment.amount, `Anulación de Abono #${payment.id}`, restoredDebt]);

    // 3. Revertir el dinero de la caja del turno si sigue abierta
    if (payment.payment_method === 'Efectivo') {
      await db.query("UPDATE cash_registers SET fiado_abonos = MAX(0, COALESCE(fiado_abonos, 0) - ?) WHERE status = 'abierta'", [payment.amount]);
    } else if (payment.payment_method === 'Tarjeta') {
      await db.query("UPDATE cash_registers SET card_sales = MAX(0, card_sales - ?) WHERE status = 'abierta'", [payment.amount]);
    } else if (payment.payment_method === 'Yape/Plin') {
      await db.query("UPDATE cash_registers SET transfer_sales = MAX(0, transfer_sales - ?) WHERE status = 'abierta'", [payment.amount]);
    }

    // 4. Marcar el abono original como anulado
    await db.query("UPDATE fiado_payments SET details = details || ' [ANULADO]' WHERE id = ?", [id]);

    io.emit('customers_changed');
    io.emit('cash_register_changed');

    res.json({
      success: true,
      message: `Abono #${id} por S/ ${parseFloat(payment.amount).toFixed(2)} anulado correctamente. Deuda restaurada a S/ ${restoredDebt.toFixed(2)}`,
      restoredDebt
    });

  } catch (err) {
    console.error('❌ Error anulando abono:', err.message);
    res.status(500).json({ error: 'Error anulando abono: ' + err.message });
  }
});

// 7. USUARIOS
app.get('/api/users', authMiddleware, adminOnly, async (req, res) => {
  try {
    const result = await db.query('SELECT id, username, name, role, plain_password, created_at FROM users ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Error obteniendo usuarios:', err.message);
    res.status(500).json({ error: 'Error al consultar usuarios.' });
  }
});

app.post('/api/users', authMiddleware, adminOnly, async (req, res) => {
  const { username, password, name, role } = req.body;
  if (!username || !password || !name || !role) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios (Usuario, Contraseña, Nombre, Rol).' });
  }

  try {
    const passHash = bcrypt.hashSync(password.trim(), 10);
    const plainPass = password.trim();
    const query = `INSERT INTO users (username, password, plain_password, name, role) VALUES (?, ?, ?, ?, ?)`;
    const result = await db.query(query, [username.trim(), passHash, plainPass, name.trim(), role]);
    res.json({ success: true, user: { id: result.lastID, username, name, role, plain_password: plainPass } });
  } catch (err) {
    console.error('❌ Error creando usuario:', err.message);
    res.status(400).json({ error: 'El nombre de usuario ya existe o los datos son inválidos.' });
  }
});

app.put('/api/users/:id/password', authMiddleware, adminOnly, async (req, res) => {
  const { id } = req.params;
  const { newPassword } = req.body;

  if (!newPassword || newPassword.trim().length < 4) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 4 caracteres.' });
  }

  try {
    const passHash = bcrypt.hashSync(newPassword.trim(), 10);
    const plainPass = newPassword.trim();
    await db.query('UPDATE users SET password = ?, plain_password = ? WHERE id = ?', [passHash, plainPass, id]);
    res.json({ success: true, message: 'Contraseña actualizada correctamente' });
  } catch (err) {
    console.error('❌ Error actualizando contraseña:', err.message);
    res.status(500).json({ error: 'Error al cambiar la contraseña del usuario.' });
  }
});

// ==========================================
// CATEGORÍAS (GET, POST, DELETE)
// ==========================================
app.get('/api/categories', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM categories ORDER BY name ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Error obteniendo categorías:', err.message);
    res.status(500).json({ error: 'Error al consultar categorías.' });
  }
});

app.post('/api/categories', authMiddleware, adminOnly, async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'El nombre de la categoría es obligatorio.' });
  }
  try {
    const cleanName = name.trim();
    const existing = await db.query('SELECT id FROM categories WHERE UPPER(name) = UPPER(?)', [cleanName]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: `La categoría "${cleanName}" ya existe.` });
    }
    const result = await db.query('INSERT INTO categories (name) VALUES (?)', [cleanName]);
    io.emit('categories_changed');
    res.json({ success: true, message: 'Categoría creada con éxito.', category: { id: result.lastID, name: cleanName } });
  } catch (err) {
    console.error('❌ Error creando categoría:', err.message);
    res.status(500).json({ error: 'Error al registrar la categoría.' });
  }
});

app.delete('/api/categories/:id', authMiddleware, adminOnly, async (req, res) => {
  const { id } = req.params;
  try {
    const catRes = await db.query('SELECT id, name FROM categories WHERE id = ?', [id]);
    if (catRes.rows.length === 0) {
      return res.status(404).json({ error: 'Categoría no encontrada.' });
    }
    const catName = catRes.rows[0].name;
    const prodCountRes = await db.query('SELECT COUNT(id) AS count FROM products WHERE category = ?', [catName]);
    const prodCount = prodCountRes.rows[0] ? parseInt(prodCountRes.rows[0].count) : 0;
    if (prodCount > 0) {
      return res.status(400).json({
        error: `No se puede eliminar la categoría "${catName}" porque tiene ${prodCount} producto(s) asignado(s).`
      });
    }
    await db.query('DELETE FROM categories WHERE id = ?', [id]);
    io.emit('categories_changed');
    res.json({ success: true, message: `Categoría "${catName}" eliminada correctamente.` });
  } catch (err) {
    console.error('❌ Error eliminando categoría:', err.message);
    res.status(500).json({ error: 'Error al eliminar la categoría.' });
  }
});

// ==========================================
// CONFIGURACIÓN DE EMPRESA Y TICKETS
// ==========================================
app.get('/api/settings/company', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM company_settings WHERE id = 1');
    if (result.rows.length === 0) {
      return res.json({
        id: 1,
        name: 'ÓPTICA VALE-LENTES by VALETEC',
        ruc: '20123456789',
        address: 'Av. Principal 123 - Lima, Perú',
        phone: '987654321',
        ticket_footer: '¡Gracias por su preferencia! Su salud visual en las mejores manos.'
      });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('❌ Error obteniendo datos de la empresa:', err.message);
    res.status(500).json({ error: 'Error consultando datos de la empresa.' });
  }
});

app.put('/api/settings/company', authMiddleware, adminOnly, async (req, res) => {
  const { name, ruc, address, phone, ticket_footer } = req.body;
  if (!name || !ruc) {
    return res.status(400).json({ error: 'El Nombre del Negocio y el RUC son obligatorios.' });
  }
  try {
    await db.query(`
      INSERT INTO company_settings (id, name, ruc, address, phone, ticket_footer, updated_at)
      VALUES (1, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO UPDATE SET
        name = excluded.name,
        ruc = excluded.ruc,
        address = excluded.address,
        phone = excluded.phone,
        ticket_footer = excluded.ticket_footer,
        updated_at = CURRENT_TIMESTAMP
    `, [name.trim(), ruc.trim(), (address || '').trim(), (phone || '').trim(), (ticket_footer || '¡Gracias por su preferencia! Su salud visual en las mejores manos.').trim()]);

    const updatedRes = await db.query('SELECT * FROM company_settings WHERE id = 1');
    const updated = updatedRes.rows[0];
    io.emit('settings_changed', updated);
    res.json({ success: true, message: 'Datos de la empresa actualizados correctamente', settings: updated });
  } catch (err) {
    console.error('❌ Error actualizando datos de la empresa:', err.message);
    res.status(500).json({ error: 'Error al actualizar configuración de la empresa.' });
  }
});

// ==========================================
// IMPORTACIÓN MASIVA DE CATÁLOGO BASE
// ==========================================
app.post('/api/products/bulk', authMiddleware, adminOnly, async (req, res) => {
  const { products } = req.body;
  if (!Array.isArray(products) || products.length === 0) {
    return res.status(400).json({ error: 'Se requiere una lista de productos válida.' });
  }
  let inserted = 0;
  let skipped = 0;
  try {
    for (const p of products) {
      if (!p.code || !p.name || !p.price) { skipped++; continue; }
      const exists = await db.query('SELECT id FROM products WHERE code = ?', [p.code]);
      if (exists.rows.length > 0) { skipped++; continue; }
      await db.query(
        `INSERT INTO products (code, name, category, purchase_price, price, stock, min_stock) VALUES (?,?,?,?,?,?,?)`,
        [p.code, p.name, p.category || 'Monturas / Armazones', p.purchase_price || 0, p.price, p.stock || 10, p.min_stock || 5]
      );
      inserted++;
    }
    io.emit('products_changed');
    res.json({ success: true, message: `✅ ${inserted} productos cargados, ${skipped} omitidos (duplicados o inválidos).`, inserted, skipped });
  } catch (err) {
    console.error('❌ Error en carga masiva:', err.message);
    res.status(500).json({ error: 'Error en carga masiva: ' + err.message });
  }
});

// ==========================================
// COPIA DE SEGURIDAD (BACKUP)
// ==========================================
app.get('/api/backup/download', authMiddleware, adminOnly, async (req, res) => {
  try {
    const [settings, users, products, customers, sales, saleItems, cashRegisters, cashMovements, fiadoPayments, stockMovements] = await Promise.all([
      db.query('SELECT * FROM company_settings'),
      db.query('SELECT id, username, name, role, created_at FROM users'),
      db.query('SELECT * FROM products ORDER BY id ASC'),
      db.query('SELECT * FROM customers ORDER BY id ASC'),
      db.query('SELECT * FROM sales ORDER BY id ASC'),
      db.query('SELECT * FROM sale_items ORDER BY id ASC'),
      db.query('SELECT * FROM cash_registers ORDER BY id ASC'),
      db.query('SELECT * FROM cash_movements ORDER BY id ASC'),
      db.query('SELECT * FROM fiado_payments ORDER BY id ASC'),
      db.query('SELECT * FROM stock_movements ORDER BY id ASC')
    ]);

    const backupData = {
      system: 'VALE-LENTES POS Óptica by VT VALETEC',
      version: '2.0',
      exported_at: new Date().toISOString(),
      exported_by: { id: req.user.id, name: req.user.name, username: req.user.username },
      counts: {
        products: products.rows.length,
        customers: customers.rows.length,
        sales: sales.rows.length,
        cash_registers: cashRegisters.rows.length
      },
      data: {
        company_settings: settings.rows,
        users: users.rows,
        products: products.rows,
        customers: customers.rows,
        sales: sales.rows,
        sale_items: saleItems.rows,
        cash_registers: cashRegisters.rows,
        cash_movements: cashMovements.rows,
        fiado_payments: fiadoPayments.rows,
        stock_movements: stockMovements.rows
      }
    };

    const fileName = `backup_valelentes_${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(JSON.stringify(backupData, null, 2));
  } catch (err) {
    console.error('❌ Error generando copia de seguridad:', err.message);
    res.status(500).json({ error: 'Error al generar la copia de seguridad: ' + err.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor Standalone VALE-LENTES POS Óptica (SQLite Autónomo) activo en http://localhost:${PORT}`);
});
