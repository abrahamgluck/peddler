import { useEffect, useState } from 'react';
import { api, money } from '../api';

interface SalesRow { bucket: string; invoices: number; sales: number; collected: number; }
const PERIODS = ['daily', 'weekly', 'monthly'] as const;

export default function Reports() {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>('daily');
  const [rows, setRows] = useState<SalesRow[]>([]);

  useEffect(() => {
    api.get<SalesRow[]>(`/reports/sales?period=${period}`).then(setRows).catch(() => {});
  }, [period]);

  const maxSales = Math.max(1, ...rows.map((r) => r.sales));
  const totalSales = rows.reduce((s, r) => s + r.sales, 0);
  const totalCollected = rows.reduce((s, r) => s + r.collected, 0);

  return (
    <div>
      <div className="page-head">
        <div><h1>Sales Reports</h1><p>Sales and collections over time</p></div>
      </div>

      <div className="toolbar">
        {PERIODS.map((p) => (
          <button key={p} className={'btn ' + (period === p ? '' : 'ghost')} onClick={() => setPeriod(p)}>
            {p[0].toUpperCase() + p.slice(1)}
          </button>
        ))}
      </div>

      <div className="cards">
        <div className="card stat"><div className="label">Total Sales (shown)</div><div className="value">{money(totalSales)}</div></div>
        <div className="card stat"><div className="label">Total Collected</div><div className="value">{money(totalCollected)}</div></div>
        <div className="card stat"><div className="label">Periods</div><div className="value">{rows.length}</div></div>
      </div>

      <div className="panel">
        <div className="panel-head">{period[0].toUpperCase() + period.slice(1)} breakdown</div>
        <table>
          <thead><tr><th>Period</th><th className="num">Invoices</th><th className="num">Sales</th><th className="num">Collected</th><th style={{ width: '30%' }}></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.bucket}>
                <td>{r.bucket}</td>
                <td className="num">{r.invoices}</td>
                <td className="num">{money(r.sales)}</td>
                <td className="num">{money(r.collected)}</td>
                <td><div className="bar-track"><div className="bar-fill" style={{ width: `${(r.sales / maxSales) * 100}%` }} /></div></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="muted">No sales data</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
