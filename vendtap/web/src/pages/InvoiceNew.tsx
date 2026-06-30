import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, money } from '../api';
import type { Customer, Product, Invoice } from '../types';

interface Line { product_id: number; quantity: number; }

interface HistoryItem {
  product_id: number;
  name: string;
  sku: string;
  unit: string;
  price: number;
  stock: number;
  total_qty: number;
  times_ordered: number;
  last_ordered: string;
  last_qty: number;
  last_price: number;
}

export default function InvoiceNew() {
  const nav = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customerId, setCustomerId] = useState<number | ''>('');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<Customer[]>('/customers').then(setCustomers).catch(() => {});
    api.get<Product[]>('/products').then(setProducts).catch(() => {});
  }, []);

  // When the customer changes, load what they've bought before and start fresh.
  useEffect(() => {
    setLines([]);
    setHistory([]);
    if (!customerId) return;
    api.get<HistoryItem[]>(`/customers/${customerId}/history`).then(setHistory).catch(() => {});
  }, [customerId]);

  const byId = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p])), [products]);
  const total = lines.reduce((s, l) => s + (byId[l.product_id]?.price || 0) * l.quantity, 0);
  const inCart = (productId: number) => lines.some((l) => l.product_id === productId);

  function addProduct(productId: number, qty: number) {
    const p = byId[productId];
    const capped = Math.max(1, Math.min(qty, p?.stock ?? qty));
    setLines((prev) => (prev.some((l) => l.product_id === productId) ? prev : [...prev, { product_id: productId, quantity: capped }]));
  }
  function addAllHistory() {
    const additions = history
      .filter((h) => h.stock > 0 && !inCart(h.product_id))
      .map((h) => ({ product_id: h.product_id, quantity: Math.max(1, Math.min(h.last_qty, h.stock)) }));
    setLines((prev) => [...prev, ...additions]);
  }

  function addLine() {
    const firstUnused = products.find((p) => !lines.some((l) => l.product_id === p.id));
    if (firstUnused) setLines([...lines, { product_id: firstUnused.id, quantity: 1 }]);
  }
  function updateLine(i: number, patch: Partial<Line>) {
    setLines(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function removeLine(i: number) {
    setLines(lines.filter((_, idx) => idx !== i));
  }

  async function submit() {
    setError('');
    if (!customerId) return setError('Select a customer');
    if (lines.length === 0) return setError('Add at least one product');
    setBusy(true);
    try {
      const inv = await api.post<Invoice>('/invoices', { customer_id: customerId, note, items: lines });
      nav(`/invoices/${inv.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="page-head">
        <div><h1>New Invoice</h1><p>Create a sales order and deduct from live inventory</p></div>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="card">
        <div className="field">
          <label>Customer</label>
          <select value={customerId} onChange={(e) => setCustomerId(Number(e.target.value) || '')}>
            <option value="">— Select customer —</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {/* Quick reorder: everything this customer has bought before. */}
        {customerId !== '' && (
          <div className="panel" style={{ marginTop: 6 }}>
            <div className="panel-head">
              ⭐ Reorder — previously bought by this customer
              {history.length > 0 && <button className="btn" onClick={addAllHistory}>+ Add all</button>}
            </div>
            {history.length === 0 ? (
              <div style={{ padding: '14px 18px' }} className="muted">No prior orders for this customer yet.</div>
            ) : (
              <table>
                <thead><tr><th>Product</th><th className="num">Last qty</th><th className="num">Last price</th><th className="num">Ordered</th><th className="num">In stock</th><th></th></tr></thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.product_id}>
                      <td><strong>{h.name}</strong><br /><span className="muted">{h.sku}</span></td>
                      <td className="num">{h.last_qty}</td>
                      <td className="num">{money(h.last_price)}</td>
                      <td className="num">{h.times_ordered}×</td>
                      <td className="num">{h.stock}{h.stock <= 0 && <span className="badge void">out</span>}</td>
                      <td className="right">
                        <button className="btn ghost" disabled={inCart(h.product_id) || h.stock <= 0}
                          onClick={() => addProduct(h.product_id, h.last_qty)}>
                          {inCart(h.product_id) ? 'Added' : '+ Add'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        <div className="panel" style={{ marginTop: 16 }}>
          <div className="panel-head">Line Items <button className="btn ghost" onClick={addLine} disabled={lines.length >= products.length}>+ Add product</button></div>
          <table>
            <thead><tr><th>Product</th><th className="num">Stock</th><th className="num">Price</th><th style={{ width: 110 }}>Qty</th><th className="num">Line total</th><th></th></tr></thead>
            <tbody>
              {lines.map((l, i) => {
                const p = byId[l.product_id];
                return (
                  <tr key={i}>
                    <td>
                      <select value={l.product_id} onChange={(e) => updateLine(i, { product_id: Number(e.target.value) })}>
                        {products.map((pr) => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
                      </select>
                    </td>
                    <td className="num">{p?.stock}</td>
                    <td className="num">{money(p?.price || 0)}</td>
                    <td><input type="number" min={1} value={l.quantity} onChange={(e) => updateLine(i, { quantity: Math.max(1, Number(e.target.value)) })} /></td>
                    <td className="num">{money((p?.price || 0) * l.quantity)}</td>
                    <td className="right"><button className="link" onClick={() => removeLine(i)}>remove</button></td>
                  </tr>
                );
              })}
              {lines.length === 0 && <tr><td colSpan={6} className="muted">No items yet — add from the reorder list above or pick a product</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="field" style={{ marginTop: 16 }}>
          <label>Note (optional)</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Delivery instructions, PO number…" />
        </div>

        <div className="toolbar" style={{ justifyContent: 'space-between', marginTop: 8 }}>
          <div style={{ fontSize: 18 }}>Total: <strong>{money(total)}</strong></div>
          <div className="row" style={{ flex: '0 0 auto' }}>
            <button className="btn ghost" onClick={() => nav('/invoices')}>Cancel</button>
            <button className="btn" onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Create Invoice'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
