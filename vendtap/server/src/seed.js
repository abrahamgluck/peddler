// Seed the database with demo users, products, customers, trucks, and a few
// invoices/payments so the app is immediately explorable.
import { db } from './db.js';
import { hashPassword } from './auth.js';

function reset() {
  db.exec(`
    DELETE FROM inventory_ledger;
    DELETE FROM payments;
    DELETE FROM invoice_items;
    DELETE FROM invoices;
    DELETE FROM trucks;
    DELETE FROM customers;
    DELETE FROM products;
    DELETE FROM users;
    DELETE FROM sqlite_sequence;
  `);
}

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

const trucks = [
  { name: 'Truck 1 - Box', plate: 'NY-VT-101', status: 'idle' },
  { name: 'Truck 2 - Van', plate: 'NY-VT-102', status: 'on_route' },
];

function run() {
  reset();

  const insUser = db.prepare('INSERT INTO users (username, password_hash, name, role) VALUES (?, ?, ?, ?)');
  const userIds = {};
  for (const u of users) {
    const info = insUser.run(u.username, hashPassword(u.password), u.name, u.role);
    userIds[u.username] = info.lastInsertRowid;
  }

  const insProduct = db.prepare(
    'INSERT INTO products (sku, name, category, unit, cost, price, stock, reorder_level) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const productIds = [];
  for (const p of products) {
    const info = insProduct.run(p.sku, p.name, p.category, p.unit, p.cost, p.price, p.stock, p.reorder_level);
    productIds.push(info.lastInsertRowid);
  }

  const insCustomer = db.prepare('INSERT INTO customers (name, contact, phone, email, address) VALUES (?, ?, ?, ?, ?)');
  const customerIds = [];
  for (const c of customers) {
    const info = insCustomer.run(c.name, c.contact, c.phone, c.email, c.address);
    customerIds.push(info.lastInsertRowid);
  }

  const insTruck = db.prepare('INSERT INTO trucks (name, plate, status, driver_id) VALUES (?, ?, ?, ?)');
  insTruck.run(trucks[0].name, trucks[0].plate, trucks[0].status, userIds['sam']);
  insTruck.run(trucks[1].name, trucks[1].plate, trucks[1].status, userIds['sam']);

  // A couple of demo invoices using the same logic the API uses.
  const demoInvoices = [
    { customer: 0, salesman: 'sam', items: [{ p: 0, q: 5 }, { p: 3, q: 2 }], pay: 'full' },
    { customer: 1, salesman: 'sam', items: [{ p: 1, q: 10 }, { p: 4, q: 1 }], pay: 'partial' },
    { customer: 2, salesman: 'Gluck1', items: [{ p: 2, q: 3 }], pay: 'none' },
  ];

  let counter = 0;
  for (const inv of demoInvoices) {
    counter += 1;
    const number = `INV-${String(counter).padStart(5, '0')}`;
    const lines = inv.items.map((it) => {
      const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productIds[it.p]);
      return { product, qty: it.q, price: product.price, lineTotal: +(product.price * it.q).toFixed(2) };
    });
    const subtotal = +lines.reduce((s, l) => s + l.lineTotal, 0).toFixed(2);
    const total = subtotal; // tax-free resale demo

    const tx = db.transaction(() => {
      const info = db
        .prepare(
          `INSERT INTO invoices (number, customer_id, salesman_id, status, subtotal, tax, total, paid)
           VALUES (?, ?, ?, 'open', ?, 0, ?, 0)`
        )
        .run(number, customerIds[inv.customer], userIds[inv.salesman], subtotal, total);
      const invoiceId = info.lastInsertRowid;
      for (const l of lines) {
        db.prepare(
          `INSERT INTO invoice_items (invoice_id, product_id, description, quantity, price, line_total)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run(invoiceId, l.product.id, l.product.name, l.qty, l.price, l.lineTotal);
        db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').run(l.qty, l.product.id);
        db.prepare('INSERT INTO inventory_ledger (product_id, change, reason, ref) VALUES (?, ?, ?, ?)')
          .run(l.product.id, -l.qty, 'sale', number);
      }
      db.prepare('UPDATE customers SET balance = balance + ? WHERE id = ?').run(total, customerIds[inv.customer]);

      if (inv.pay !== 'none') {
        const amount = inv.pay === 'full' ? total : +(total / 2).toFixed(2);
        db.prepare('INSERT INTO payments (invoice_id, amount, method, received_by) VALUES (?, ?, ?, ?)')
          .run(invoiceId, amount, 'cash', userIds[inv.salesman]);
        const status = amount >= total - 0.001 ? 'paid' : 'partial';
        db.prepare('UPDATE invoices SET paid = ?, status = ? WHERE id = ?').run(amount, status, invoiceId);
        db.prepare('UPDATE customers SET balance = balance - ? WHERE id = ?').run(amount, customerIds[inv.customer]);
      }
    });
    tx();
  }

  console.log('Seed complete:');
  console.log(`  users:     ${users.length} (login Gluck1 / 5310)`);
  console.log(`  products:  ${products.length}`);
  console.log(`  customers: ${customers.length}`);
  console.log(`  invoices:  ${demoInvoices.length}`);
}

run();
