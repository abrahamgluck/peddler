import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money } from '../api';
import type { Invoice } from '../types';

const FILTERS = ['', 'open', 'partial', 'paid', 'void'];

export default function Invoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [status, setStatus] = useState('');

  useEffect(() => {
    const q = status ? `?status=${status}` : '';
    api.get<Invoice[]>(`/invoices${q}`).then(setInvoices).catch(() => {});
  }, [status]);

  return (
    <div>
      <div className="page-head">
        <div><h1>Invoices</h1><p>Sales orders and their payment status</p></div>
        <Link className="btn" to="/invoices/new">+ New Invoice</Link>
      </div>

      <div className="toolbar">
        {FILTERS.map((f) => (
          <button key={f || 'all'} className={'btn ' + (status === f ? '' : 'ghost')} onClick={() => setStatus(f)}>
            {f ? f[0].toUpperCase() + f.slice(1) : 'All'}
          </button>
        ))}
      </div>

      <div className="panel">
        <table>
          <thead>
            <tr><th>Invoice</th><th>Customer</th><th>Salesman</th><th>Status</th><th className="num">Total</th><th className="num">Balance</th></tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id}>
                <td><Link to={`/invoices/${inv.id}`}>{inv.number}</Link></td>
                <td>{inv.customer_name}</td>
                <td className="muted">{inv.salesman_name}</td>
                <td><span className={`badge ${inv.status}`}>{inv.status}</span></td>
                <td className="num">{money(inv.total)}</td>
                <td className="num">{money(inv.total - inv.paid)}</td>
              </tr>
            ))}
            {invoices.length === 0 && <tr><td colSpan={6} className="muted">No invoices</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
