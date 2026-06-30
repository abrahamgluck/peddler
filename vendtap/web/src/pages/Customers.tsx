import { useEffect, useState } from 'react';
import { api, money } from '../api';
import type { Customer } from '../types';

export default function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);

  function load() {
    const q = search ? `?search=${encodeURIComponent(search)}` : '';
    api.get<Customer[]>(`/customers${q}`).then(setCustomers).catch(() => {});
  }
  useEffect(load, [search]);

  return (
    <div>
      <div className="page-head">
        <div><h1>Customers</h1><p>Stores and accounts you sell to</p></div>
        <button className="btn" onClick={() => setAdding(true)}>+ New Customer</button>
      </div>

      <div className="toolbar">
        <input className="search" placeholder="Search customers…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="panel">
        <table>
          <thead>
            <tr><th>Name</th><th>Contact</th><th>Phone</th><th>Location</th><th className="num">Balance</th></tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id}>
                <td><strong>{c.name}</strong></td>
                <td>{c.contact}</td>
                <td>{c.phone}</td>
                <td className="muted">{c.address}</td>
                <td className="num">{money(c.balance)}</td>
              </tr>
            ))}
            {customers.length === 0 && <tr><td colSpan={5} className="muted">No customers found</td></tr>}
          </tbody>
        </table>
      </div>

      {adding && <CustomerModal onClose={() => setAdding(false)} onDone={() => { setAdding(false); load(); }} />}
    </div>
  );
}

function CustomerModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ name: '', contact: '', phone: '', email: '', address: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  async function submit() {
    setError('');
    setBusy(true);
    try {
      await api.post('/customers', form);
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>New Customer</h2>
        {error && <div className="error">{error}</div>}
        <div className="field"><label>Store name *</label><input value={form.name} onChange={set('name')} autoFocus /></div>
        <div className="row">
          <div className="field"><label>Contact</label><input value={form.contact} onChange={set('contact')} /></div>
          <div className="field"><label>Phone</label><input value={form.phone} onChange={set('phone')} /></div>
        </div>
        <div className="field"><label>Email</label><input value={form.email} onChange={set('email')} /></div>
        <div className="field"><label>Address</label><input value={form.address} onChange={set('address')} /></div>
        <div className="row">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={submit} disabled={busy || !form.name.trim()}>Save</button>
        </div>
      </div>
    </div>
  );
}
