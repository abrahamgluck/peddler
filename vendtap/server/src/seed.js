// Seed the database with demo users, products, customers, trucks, and a few
// invoices/payments so the app is immediately explorable.
// Safe to run repeatedly: it truncates the domain tables first.
import { pool, initSchema, tx } from './db.js';
import { hashPassword } from './auth.js';

const users = [
  // The login the user provided maps to the admin account.
  { username: 'Gluck1', password: '5310', name: 'Abraham Gluck', role: 'admin' },
  { username: 'sam', password: 'sam123', name: 'Sam Salesman', role: 'salesman' },
  { username: 'wendy', password: 'wendy123', name: 'Wendy Warehouse', role: 'warehouse' },
];

const products = [
  { sku: 'BEV-COLA-12', name: 'Cola 12oz Can (24pk)', category: 'Beverages', unit: 'case', cost: 7.5, price: 13.99, stock: 120, reorder_level: 24 },
  { sku: 'BEV-WATER-16', name: 'Spring Water 16oz (24pk)', category: 'Beverages', unit: 'case', cost: 3.2, price: 6.99, stock: 200, reorder_level: 40 },
  { sku: 'BEV-ENRG-16', name: 'Energy Drink 16oz (12pk)', category: 'Beverages', unit: 'case', cost: 12.0, price: 22.5, stock: 60, reorder_level: 12 },
  { sku: 'SNK-CHIP-CL', name: 'Classic Potato Chips (40ct)', category: 'Snacks', unit: 'box', cost: 9.0, price: 16.0, stock: 80, reorder_level: 20 },
  { sku: 'SNK-CANDY-MX', name: 'Candy Bar Variety (48ct)', category: 'Snacks', unit: 'box', cost: 14.0, price: 26.0, stock: 45, reorder_level: 15 },
  { sku: 'SNK-GUM-PK', name: 'Chewing Gum (20pk)', category: 'Snacks', unit: 'pack', cost: 4.5, price: 9.0, stock: 18, reorder_level: 25 },
  { sku: 'GRO-COFFEE-1', name: 'Ground Coffee 1lb', category: 'Grocery', unit: 'each', cost: 5.0, price: 10.5, stock: 36, reorder_level: 12 },
  { sku: 'GRO-SUGAR-5', name: 'Sugar 5lb Bag', category: 'Grocery', unit: 'each', cost: 3.0, price: 6.25, stock: 22, reorder_level: 10 },
];

const customers = [
  { name: 'Downtown Mini Mart', contact: 'Raj Patel', phone: '212-555-0101', email: 'raj@downtownmm.com', address: '120 Main St, New York, NY' },
  { name: 'Corner Deli & Grocery', contact: 'Maria Lopez', phone: '212-555-0142', email: 'maria@cornerdeli.com', address: '88 Hudson Ave, Brooklyn, NY' },
  { name: 'Westside Gas & Go', contact: 'Tom Becker', phone: '201-555-0177', email: 'tom@westsidegas.com', address: '45 River Rd, Jersey City, NJ' },
  { name: 'Sunrise Convenience', contact: 'Aisha Khan', phone: '718-555-0193', email: 'aisha@sunrisestore.com', address: '300 Sunrise Hwy, Queens, NY' },
];

// Seed the database. Reusable by both the CLI (`npm run seed`) and the
// server's optional auto-seed on first boot.
export async function seedDatabase() {
  await initSchema();

  await tx(async (client) => {
    await client.query(`
      TRUNCATE inventory_ledger, payments, invoice_items, invoices, trucks, customers, products, users
      RESTART IDENTITY CASCADE
    `);

    const userIds = {};
    for (const u of users) {
      const { rows } = await client.query(
        'INSERT INTO users (username, password_hash, name, role) VALUES ($1, $2, $3, $4) RETURNING id',
        [u.username, hashPassword(u.password), u.name, u.role]
      );
      userIds[u.username] = rows[0].id;
    }

    const productIds = [];
    for (const p of products) {
      const { rows } = await client.query(
        'INSERT INTO products (sku, name, category, unit, cost, price, stock, reorder_level) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
        [p.sku, p.name, p.category, p.unit, p.cost, p.price, p.stock, p.reorder_level]
      );
      productIds.push(rows[0].id);
    }

    const customerIds = [];
    for (const c of customers) {
      const { rows } = await client.query(
        'INSERT INTO customers (name, contact, phone, email, address) VALUES ($1,$2,$3,$4,$5) RETURNING id',
        [c.name, c.contact, c.phone, c.email, c.address]
      );
      customerIds.push(rows[0].id);
    }

    await client.query('INSERT INTO trucks (name, plate, status, driver_id) VALUES ($1,$2,$3,$4)', ['Truck 1 - Box', 'NY-VT-101', 'idle', userIds['sam']]);
    await client.query('INSERT INTO trucks (name, plate, status, driver_id) VALUES ($1,$2,$3,$4)', ['Truck 2 - Van', 'NY-VT-102', 'on_route', userIds['sam']]);

    // A few demo invoices using the same logic the API uses.
    const demoInvoices = [
      { customer: 0, salesman: 'sam', items: [{ p: 0, q: 5 }, { p: 3, q: 2 }], pay: 'full' },
      { customer: 1, salesman: 'sam', items: [{ p: 1, q: 10 }, { p: 4, q: 1 }], pay: 'partial' },
      { customer: 2, salesman: 'Gluck1', items: [{ p: 2, q: 3 }], pay: 'none' },
    ];

    let counter = 0;
    for (const inv of demoInvoices) {
      counter += 1;
      const number = `INV-${String(counter).padStart(5, '0')}`;
      const lines = [];
      for (const it of inv.items) {
        const { rows } = await client.query('SELECT * FROM products WHERE id = $1', [productIds[it.p]]);
        const product = rows[0];
        lines.push({ product, qty: it.q, price: product.price, lineTotal: +(product.price * it.q).toFixed(2) });
      }
      const subtotal = +lines.reduce((s, l) => s + l.lineTotal, 0).toFixed(2);
      const total = subtotal;

      const { rows: invRows } = await client.query(
        `INSERT INTO invoices (number, customer_id, salesman_id, status, subtotal, tax, total, paid)
         VALUES ($1,$2,$3,'open',$4,0,$5,0) RETURNING id`,
        [number, customerIds[inv.customer], userIds[inv.salesman], subtotal, total]
      );
      const invoiceId = invRows[0].id;
      for (const l of lines) {
        await client.query(
          `INSERT INTO invoice_items (invoice_id, product_id, description, quantity, price, line_total)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [invoiceId, l.product.id, l.product.name, l.qty, l.price, l.lineTotal]
        );
        await client.query('UPDATE products SET stock = stock - $1 WHERE id = $2', [l.qty, l.product.id]);
        await client.query('INSERT INTO inventory_ledger (product_id, change, reason, ref) VALUES ($1,$2,$3,$4)', [l.product.id, -l.qty, 'sale', number]);
      }
      await client.query('UPDATE customers SET balance = balance + $1 WHERE id = $2', [total, customerIds[inv.customer]]);

      if (inv.pay !== 'none') {
        const amount = inv.pay === 'full' ? total : +(total / 2).toFixed(2);
        await client.query('INSERT INTO payments (invoice_id, amount, method, received_by) VALUES ($1,$2,$3,$4)', [invoiceId, amount, 'cash', userIds[inv.salesman]]);
        const status = amount >= total - 0.001 ? 'paid' : 'partial';
        await client.query('UPDATE invoices SET paid = $1, status = $2 WHERE id = $3', [amount, status, invoiceId]);
        await client.query('UPDATE customers SET balance = balance - $1 WHERE id = $2', [amount, customerIds[inv.customer]]);
      }
    }

    console.log('Seed complete:');
    console.log(`  users:     ${users.length} (login Gluck1 / 5310)`);
    console.log(`  products:  ${products.length}`);
    console.log(`  customers: ${customers.length}`);
    console.log(`  invoices:  ${demoInvoices.length}`);
  });
}

// Seed only if the database has no users yet. Used for one-click deploys so the
// demo login works immediately without a manual seed step.
export async function seedIfEmpty() {
  await initSchema();
  const existing = await pool.query('SELECT COUNT(*)::int AS n FROM users');
  if (existing.rows[0].n > 0) {
    console.log('Database already has data — skipping auto-seed.');
    return;
  }
  console.log('Empty database detected — seeding demo data…');
  await seedDatabase();
}

// When run directly (`npm run seed`), seed and close the pool.
const isCli = process.argv[1] && process.argv[1].endsWith('seed.js');
if (isCli) {
  seedDatabase()
    .then(() => pool.end())
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}
