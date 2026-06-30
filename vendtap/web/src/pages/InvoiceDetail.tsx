import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, money } from '../api';
import type { Invoice } from '../types';

export default function InvoiceDetail() {
  const { id } = useParams();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [payOpen, setPayOpen] = useState(false);

  function load() {
    api.get<Invoice>(`/invoices/${id}`).then(setInvoice).catch(() => {});
  }
  useEffect(load, [id]);

  if (!invoice) return <div className="loading">Loading…</div>;
  const balance = invoice.total - invoice.paid;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{invoice.number} <span className={`badge ${invoice.status}`}>{invoice.status}</span></h1>
          <p><Link to="/invoices">← Invoices</Link> · {new Date(invoice.created_at).toLocaleString()}</p>
        </div>
        <div className="row" style={{ flex: '0 0 auto' }}>
          {invoice.status !== 'void' && invoice.status !== 'paid' && (
            <button className="btn" onClick={() => setPayOpen(true)}>Record Payment</button>
          )}
          {invoice.status !== 'void' && (
            <button className="btn danger" onClick={async () => { if (confirm('Void this invoice? Stock will be restored.')) { await api.post(`/invoices/${invoice.id}/void`); load(); } }}>Void</button>
          )}
        </div>
      </div>

      <div className="cards">
        <div className="card stat"><div className="label">Customer</div><div className="value" style={{ fontSize: 18 }}>{invoice.customer_name}</div></div>
        <div className="card stat"><div className="label">Total</div><div className="value">{money(invoice.total)}</div></div>
        <div className="card stat"><div className="label">Paid</div><div className="value">{money(invoice.paid)}</div></div>
        <div className="card stat"><div className="label">Balance</div><div className={'value' + (balance > 0 ? ' alert' : '')}>{money(balance)}</div></div>
      </div>

      <div className="panel">
        <div className="panel-head">Line Items</div>
        <table>
          <thead><tr><th>Product</th><th className="num">Qty</th><th className="num">Price</th><th className="num">Total</th></tr></thead>
          <tbody>
            {invoice.items?.map((it) => (
              <tr key={it.id}>
                <td>{it.description}</td>
                <td className="num">{it.quantity}</td>
                <td className="num">{money(it.price)}</td>
                <td className="num">{money(it.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <div className="panel-head">Payments</div>
        <table>
          <thead><tr><th>Date</th><th>Method</th><th>Received by</th><th className="num">Amount</th></tr></thead>
          <tbody>
            {invoice.payments?.map((p) => (
              <tr key={p.id}>
                <td>{new Date(p.created_at).toLocaleString()}</td>
                <td style={{ textTransform: 'capitalize' }}>{p.method}</td>
                <td className="muted">{p.received_by_name}</td>
                <td className="num">{money(p.amount)}</td>
              </tr>
            ))}
            {(!invoice.payments || invoice.payments.length === 0) && <tr><td colSpan={4} className="muted">No payments recorded</td></tr>}
          </tbody>
        </table>
      </div>

      {payOpen && <PaymentModal invoice={invoice} onClose={() => setPayOpen(false)} onDone={() => { setPayOpen(false); load(); }} />}
    </div>
  );
}

function PaymentModal({ invoice, onClose, onDone }: { invoice: Invoice; onClose: () => void; onDone: () => void }) {
  const balance = invoice.total - invoice.paid;
  const [amount, setAmount] = useState(String(balance.toFixed(2)));
  const [method, setMethod] = useState('cash');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError('');
    setBusy(true);
    try {
      await api.post(`/payments/invoice/${invoice.id}`, { amount: Number(amount), method });
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Record Payment</h2>
        <p className="muted">Outstanding balance: <strong>{money(balance)}</strong></p>
        {error && <div className="error">{error}</div>}
        <div className="field"><label>Amount</label><input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></div>
        <div className="field">
          <label>Method</label>
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="cash">Cash</option><option value="card">Card</option>
            <option value="check">Check</option><option value="transfer">Transfer</option>
          </select>
        </div>
        <div className="row">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={submit} disabled={busy || Number(amount) <= 0}>Save Payment</button>
        </div>
      </div>
    </div>
  );
}
