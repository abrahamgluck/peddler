import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money } from '../api';
import type { Dashboard as Stats, Invoice } from '../types';

interface TopProduct { id: number; name: string; qty: number; revenue: number; }

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<Invoice[]>([]);
  const [top, setTop] = useState<TopProduct[]>([]);

  useEffect(() => {
    api.get<Stats>('/reports/dashboard').then(setStats).catch(() => {});
    api.get<Invoice[]>('/invoices').then((r) => setRecent(r.slice(0, 6))).catch(() => {});
    api.get<TopProduct[]>('/reports/top-products').then(setTop).catch(() => {});
  }, []);

  const maxQty = Math.max(1, ...top.map((t) => t.qty));

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p>Live overview of sales, inventory, and collections</p>
        </div>
        <Link className="btn" to="/invoices/new">+ New Invoice</Link>
      </div>

      <div className="cards">
        <div className="card stat"><div className="label">Sales Today</div><div className="value">{money(stats?.todaySales ?? 0)}</div></div>
        <div className="card stat"><div className="label">Invoices Today</div><div className="value">{stats?.todayInvoices ?? 0}</div></div>
        <div className="card stat"><div className="label">Outstanding A/R</div><div className="value">{money(stats?.outstanding ?? 0)}</div></div>
        <div className="card stat"><div className="label">Low-stock Items</div><div className={'value' + ((stats?.lowStock ?? 0) > 0 ? ' alert' : '')}>{stats?.lowStock ?? 0}</div></div>
      </div>

      <div className="panel">
        <div className="panel-head">Recent Invoices <Link to="/invoices">View all →</Link></div>
        <table>
          <thead>
            <tr><th>Invoice</th><th>Customer</th><th>Status</th><th className="num">Total</th><th className="num">Balance</th></tr>
          </thead>
          <tbody>
            {recent.map((inv) => (
              <tr key={inv.id}>
                <td><Link to={`/invoices/${inv.id}`}>{inv.number}</Link></td>
                <td>{inv.customer_name}</td>
                <td><span className={`badge ${inv.status}`}>{inv.status}</span></td>
                <td className="num">{money(inv.total)}</td>
                <td className="num">{money(inv.total - inv.paid)}</td>
              </tr>
            ))}
            {recent.length === 0 && <tr><td colSpan={5} className="muted">No invoices yet</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <div className="panel-head">Top Selling Products</div>
        <div style={{ padding: '8px 18px 16px' }}>
          {top.map((t) => (
            <div className="bar-row" key={t.id}>
              <div className="name">{t.name}</div>
              <div className="bar-track"><div className="bar-fill" style={{ width: `${(t.qty / maxQty) * 100}%` }} /></div>
              <div style={{ width: 90 }} className="right">{t.qty} · {money(t.revenue)}</div>
            </div>
          ))}
          {top.length === 0 && <div className="muted">No sales recorded yet</div>}
        </div>
      </div>
    </div>
  );
}
