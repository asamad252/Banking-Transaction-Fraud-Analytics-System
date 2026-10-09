// Frame shared by every chart: title, what it shows, an optional legend, and a
// switch to the same numbers as a table (so no value is hover-only).
import { useState } from 'react';
import Icon from '../ui/Icon.jsx';

export default function ChartCard({ title, subtitle, legend, table, children, className = '' }) {
  const [view, setView] = useState('chart');

  return (
    <section className={`card chart-card ${className}`}>
      <header className="chart-head">
        <div>
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {table && (
          <button
            type="button"
            className="button button-ghost button-sm"
            onClick={() => setView(view === 'chart' ? 'table' : 'chart')}
            aria-pressed={view === 'table'}
          >
            <Icon name={view === 'chart' ? 'table' : 'chart'} size={15} />
            {view === 'chart' ? 'Show table' : 'Show chart'}
          </button>
        )}
      </header>

      {view === 'chart' ? (
        <>
          {legend && <div className="legend">{legend}</div>}
          {children}
        </>
      ) : (
        <div className="table-scroll chart-table">
          <table className="data-table">
            <thead>
              <tr>
                {table.columns.map((column) => (
                  <th key={column.key} className={column.numeric ? 'num' : ''}>{column.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, i) => (
                <tr key={i}>
                  {table.columns.map((column) => (
                    <td key={column.key} className={column.numeric ? 'num' : ''}>
                      {column.format ? column.format(row[column.key], row) : row[column.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {table.note && <p className="table-note">{table.note}</p>}
        </div>
      )}
    </section>
  );
}

export function LegendItem({ shape = 'rect', color, children }) {
  return (
    <span className="legend-item">
      <span className={`legend-key legend-${shape}`} style={{ '--key': color }} aria-hidden="true" />
      {children}
    </span>
  );
}

/** Floating readout positioned inside a chart's wrapper. */
export function ChartTip({ x, y, width, children }) {
  if (x === null || x === undefined) return null;
  const flip = x > width - 190;
  return (
    <div
      className="chart-tip"
      style={{ left: x, top: y, transform: `translate(${flip ? 'calc(-100% - 12px)' : '12px'}, -50%)` }}
      role="presentation"
    >
      {children}
    </div>
  );
}
