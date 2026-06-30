import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Truck } from '../types';

const STATUSES: Truck['status'][] = ['idle', 'loading', 'on_route'];

export default function Trucks() {
  const [trucks, setTrucks] = useState<Truck[]>([]);

  function load() {
    api.get<Truck[]>('/trucks').then(setTrucks).catch(() => {});
  }
  useEffect(load, []);

  async function setStatus(t: Truck, status: string) {
    await api.put(`/trucks/${t.id}`, { status });
    load();
  }

  return (
    <div>
      <div className="page-head">
        <div><h1>Trucks</h1><p>Delivery fleet and route status</p></div>
      </div>

      <div className="cards">
        {trucks.map((t) => (
          <div className="card" key={t.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: 16 }}>🚚 {t.name}</strong>
              <span className={`badge ${t.status}`}>{t.status.replace('_', ' ')}</span>
            </div>
            <p className="muted" style={{ margin: '8px 0' }}>Plate {t.plate || '—'} · Driver {t.driver_name || 'Unassigned'}</p>
            <div className="field">
              <label>Update status</label>
              <select value={t.status} onChange={(e) => setStatus(t, e.target.value)}>
                {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
              </select>
            </div>
          </div>
        ))}
        {trucks.length === 0 && <div className="muted">No trucks configured</div>}
      </div>
    </div>
  );
}
