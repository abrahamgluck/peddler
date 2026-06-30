import { useEffect, useState } from 'react';
import { api, money } from '../api';
import type { Product } from '../types';

export default function Products() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [restock, setRestock] = useState<Product | null>(null);

  function load() {
    const q = new URLSearchParams();
    if (search) q.set('search', search);
    if (lowOnly) q.set('low', '1');
    api.get<Product[]>(`/products?${q}`).then(setProducts).catch(() => {});
  }
  useEffect(load, [search, lowOnly]);

  return (
    <div>
      <div className="page-head">
        <div><h1>Inventory</h1><p>Live stock across the warehouse</p></div>
      </div>

      <div className="toolbar">
        <input className="search" placeholder="Search name, SKU, category…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <label className="muted" style={{ display: 'flex', gap: 6, alignItems: 'center', width: 'auto' }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} /> Low stock only
        </label>
      </div>

      <div className="panel">
        <table>
          <thead>
            <tr><th>SKU</th><th>Product</th><th>Category</th><th className="num">Price</th><th className="num">Stock</th><th></th></tr>
          </thead>
          <tbody>
            {products.map((p) => {
              const low = p.stock <= p.reorder_level;
              return (
                <tr key={p.id}>
                  <td className="muted">{p.sku}</td>
                  <td>{p.name}</td>
                  <td>{p.category}</td>
                  <td className="num">{money(p.price)}</td>
                  <td className="num">{p.stock} {low && <span className="badge low">low</span>}</td>
                  <td className="right"><button className="btn ghost" onClick={() => setRestock(p)}>Restock</button></td>
                </tr>
              );
            })}
            {products.length === 0 && <tr><td colSpan={6} className="muted">No products found</td></tr>}
          </tbody>
        </table>
      </div>

      {restock && <RestockModal product={restock} onClose={() => setRestock(null)} onDone={() => { setRestock(null); load(); }} />}
    </div>
  );
}

function RestockModal({ product, onClose, onDone }: { product: Product; onClose: () => void; onDone: () => void }) {
  const [change, setChange] = useState('0');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError('');
    setBusy(true);
    try {
      await api.post(`/products/${product.id}/adjust`, { change: Number(change), reason: 'restock' });
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Adjust stock — {product.name}</h2>
        <p className="muted">Current stock: <strong>{product.stock}</strong>. Enter a positive number to add or negative to remove.</p>
        {error && <div className="error">{error}</div>}
        <div className="field">
          <label>Quantity change</label>
          <input type="number" value={change} onChange={(e) => setChange(e.target.value)} autoFocus />
        </div>
        <div className="row">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={submit} disabled={busy || Number(change) === 0}>Apply</button>
        </div>
      </div>
    </div>
  );
}
