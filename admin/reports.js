// Reports (owner). All numbers come from report_* functions in the database, which use the same
// definitions as Finances, so they reconcile (checked by supabase/tests/stage7.test.mjs).
/* global Admin, h, clear, tx, biMap, money, salonDateKey, addDays, prettyDate, STATUS_TEXT, friendlyError,
   panelHead, dataTable, registerModule, showDemo, supabaseClient, refreshSection, serviceLabel, addonLabel, GROUPS */

let repFrom = null;
let repTo = null;
const SOURCE_TEXT = biMap({ app: ['App', 'App'], dashboard: ['Dashboard', 'Panel'], walk_in: ['Walk-in', 'Sin cita'], phone: ['Phone / WhatsApp', 'Teléfono / WhatsApp'], web: ['Website', 'Sitio web'] });
const KIND_TEXT = biMap({ service: ['Service', 'Servicio'], addon: ['Add-on', 'Extra'], product: ['Product', 'Producto'] });

// CSV with protection against spreadsheet formula injection (a client named "=HYPERLINK(...)").
function toCsv(rows, columns) {
  const cell = (v) => {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.map((c) => cell(c.label)).join(','), ...rows.map((r) => columns.map((c) => cell(c.csv ? c.csv(r) : r[c.key])).join(','))].join('\n');
}
function downloadCsv(name, rows, columns) {
  const blob = new Blob(['﻿' + toCsv(rows, columns)], { type: 'text/csv;charset=utf-8' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `${name}-${repFrom}-${repTo}.csv` });
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
const dollars = (c) => (Number(c) / 100).toFixed(2);
const itemName = (r) => (r.kind === 'service' ? serviceLabel(r.ref) : r.kind === 'addon' ? addonLabel(r.ref) : r.description);

function barChart(days) {
  const max = Math.max(1, ...days.map((d) => Number(d.net_cents)));
  const width = 640, height = 140, gap = 3;
  const barW = Math.max(2, (width - gap * (days.length - 1)) / days.length);
  const svgNs = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNs, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', '100%');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', tx('Net revenue per day', 'Ingresos netos por día'));
  const base = document.createElementNS(svgNs, 'line');
  Object.entries({ x1: 0, y1: height - 2, x2: width, y2: height - 2, class: 'chart-gridline' }).forEach(([k, v]) => base.setAttribute(k, v));
  svg.appendChild(base);
  days.forEach((d, i) => {
    const v = Math.max(0, Number(d.net_cents));
    const hgt = v === 0 ? 2 : Math.max(4, ((height - 10) * v) / max);
    const r = document.createElementNS(svgNs, 'rect');
    Object.entries({ x: (i * (barW + gap)).toFixed(1), y: (height - 2 - hgt).toFixed(1), width: barW.toFixed(1), height: hgt.toFixed(1), rx: 2, class: 'chart-bar' }).forEach(([k, val]) => r.setAttribute(k, val));
    const title = document.createElementNS(svgNs, 'title');
    title.textContent = `${prettyDate(d.day)}: ${money(d.net_cents)} ${tx('net', 'neto')} · ${d.sales_count} ${tx('sale(s)', 'venta(s)')}`;
    r.appendChild(title);
    svg.appendChild(r);
  });
  return h('div', { class: 'chart-svg-wrap' }, svg);
}

function section(title, csvName, rows, columns, extra) {
  return h('div', { class: 'report-block' },
    h('div', { class: 'panel-head sub-head' }, h('h3', { class: 'section-h' }, title),
      rows.length ? h('button', { class: 'ghost small', onClick: () => downloadCsv(csvName, rows, columns) }, tx('Download CSV', 'Descargar CSV')) : null),
    extra || null,
    dataTable(columns, rows, { empty: tx('No data in this period.', 'No hay datos en este periodo.') }));
}

async function renderReports(panel) {
  const today = salonDateKey();
  repTo = repTo || today;
  repFrom = repFrom || addDays(today, -29);
  const demo = showDemo();
  const args = { p_from: repFrom, p_to: repTo, p_include_demo: demo };
  const [byDay, byItem, byStaff, appts, top] = await Promise.all([
    supabaseClient.rpc('report_sales_by_day', args),
    supabaseClient.rpc('report_sales_by_item', args),
    supabaseClient.rpc('report_sales_by_staff', args),
    supabaseClient.rpc('report_appointments', args),
    supabaseClient.rpc('report_top_clients', { ...args, p_limit: 20 }),
  ]);
  clear(panel);
  panel.appendChild(panelHead(tx('Reports', 'Reportes'), tx('Sales, services, staff, appointments and clients. Same figures as Finances.', 'Ventas, servicios, equipo, citas y clientas. Las mismas cifras que Finanzas.')));
  const f = h('input', { type: 'date', value: repFrom, onChange: (e) => { repFrom = e.target.value; refreshSection(); } });
  const t = h('input', { type: 'date', value: repTo, onChange: (e) => { repTo = e.target.value; refreshSection(); } });
  panel.appendChild(h('div', { class: 'date-nav' }, h('span', {}, tx('From', 'Del')), f, h('span', {}, tx('to', 'al')), t,
    h('button', { class: 'ghost small', onClick: () => { repFrom = addDays(today, -6); repTo = today; refreshSection(); } }, tx('7 days', '7 días')),
    h('button', { class: 'ghost small', onClick: () => { repFrom = addDays(today, -29); repTo = today; refreshSection(); } }, tx('30 days', '30 días')),
    h('button', { class: 'ghost small', onClick: () => { repFrom = today.slice(0, 8) + '01'; repTo = today; refreshSection(); } }, tx('This month', 'Este mes'))));
  const firstError = [byDay, byItem, byStaff, appts, top].find((r) => r.error)?.error;
  if (firstError) { panel.appendChild(h('p', { class: 'error' }, friendlyError(firstError))); return; }

  const days = byDay.data || [];
  const net = days.reduce((s, d) => s + Number(d.net_cents), 0);
  const count = days.reduce((s, d) => s + Number(d.sales_count), 0);
  const apptRows = appts.data || [];
  const apptTotal = apptRows.reduce((s, r) => s + Number(r.appointments), 0);
  const noShows = apptRows.filter((r) => r.status === 'no_show').reduce((s, r) => s + Number(r.appointments), 0);
  const done = apptRows.filter((r) => r.status === 'done').reduce((s, r) => s + Number(r.appointments), 0);
  panel.appendChild(h('div', { class: 'stats-row' },
    h('div', { class: 'stat-tile' }, h('span', { class: 'stat-value' }, money(net)), h('span', { class: 'stat-label' }, tx('Net revenue', 'Ingresos netos'))),
    h('div', { class: 'stat-tile' }, h('span', { class: 'stat-value' }, String(count)), h('span', { class: 'stat-label' }, tx('Completed sales', 'Ventas completadas'))),
    h('div', { class: 'stat-tile' }, h('span', { class: 'stat-value' }, count ? money(Math.round(days.reduce((s, d) => s + Number(d.gross_cents) - Number(d.discount_cents), 0) / count)) : '—'), h('span', { class: 'stat-label' }, tx('Average sale', 'Venta promedio'))),
    h('div', { class: 'stat-tile' + (noShows ? ' warn' : '') }, h('span', { class: 'stat-value' }, apptTotal ? `${Math.round((noShows / Math.max(1, done + noShows)) * 100)}%` : '—'), h('span', { class: 'stat-label' }, tx('No-show rate', 'Tasa de inasistencia')))));

  panel.appendChild(section(tx('Sales by day', 'Ventas por día'), tx('sales-by-day', 'ventas-por-dia'), days, [
    { label: tx('Day', 'Día'), render: (d) => prettyDate(d.day), csv: (d) => d.day },
    { label: tx('Sales', 'Ventas'), num: true, key: 'sales_count' },
    { label: tx('Gross', 'Bruto'), num: true, render: (d) => money(d.gross_cents), csv: (d) => dollars(d.gross_cents) },
    { label: tx('Discounts', 'Descuentos'), num: true, render: (d) => money(d.discount_cents), csv: (d) => dollars(d.discount_cents) },
    { label: tx('Refunds', 'Reembolsos'), num: true, render: (d) => money(d.refund_cents), csv: (d) => dollars(d.refund_cents) },
    { label: tx('Net', 'Neto'), num: true, render: (d) => money(d.net_cents), csv: (d) => dollars(d.net_cents) },
    { label: tx('Payments in', 'Pagos recibidos'), num: true, render: (d) => money(d.payments_cents), csv: (d) => dollars(d.payments_cents) },
  ], h('div', { class: 'chart-card', style: { marginBottom: '12px' } }, barChart(days))));

  panel.appendChild(h('div', { class: 'grid-2' },
    section(tx('Services & products', 'Servicios y productos'), tx('sales-by-item', 'ventas-por-articulo'), byItem.data || [], [
      { label: tx('Item', 'Artículo'), render: itemName, csv: itemName },
      { label: tx('Type', 'Tipo'), render: (r) => KIND_TEXT[r.kind], csv: (r) => KIND_TEXT[r.kind] },
      { label: tx('Qty', 'Cant.'), num: true, render: (r) => String(Number(r.qty)), csv: (r) => Number(r.qty) },
      { label: tx('Gross', 'Bruto'), num: true, render: (r) => money(r.gross_cents), csv: (r) => dollars(r.gross_cents) },
    ]),
    section(tx('By staff', 'Por persona'), tx('sales-by-staff', 'ventas-por-persona'), byStaff.data || [], [
      { label: tx('Person', 'Persona'), key: 'display_name' },
      { label: tx('Lines', 'Líneas'), num: true, key: 'lines' },
      { label: tx('Gross', 'Bruto'), num: true, render: (r) => money(r.gross_cents), csv: (r) => dollars(r.gross_cents) },
      { label: tx('Commission', 'Comisión'), num: true, render: (r) => money(r.commission_cents), csv: (r) => dollars(r.commission_cents) },
    ])));

  panel.appendChild(h('div', { class: 'grid-2' },
    section(tx('Appointments (by appointment date)', 'Citas (por fecha de la cita)'), tx('appointments', 'citas'), apptRows, [
      { label: tx('Status', 'Estado'), render: (r) => STATUS_TEXT[r.status] || r.status, csv: (r) => STATUS_TEXT[r.status] || r.status },
      { label: tx('Booked via', 'Reservada por'), render: (r) => SOURCE_TEXT[r.source] || r.source, csv: (r) => SOURCE_TEXT[r.source] || r.source },
      { label: tx('Count', 'Cantidad'), num: true, key: 'appointments' },
      { label: tx('Booked value', 'Valor agendado'), num: true, render: (r) => money(r.booked_value_cents), csv: (r) => dollars(r.booked_value_cents) },
    ]),
    section(tx('Top clients', 'Mejores clientas'), tx('top-clients', 'mejores-clientas'), top.data || [], [
      { label: tx('Client', 'Clienta'), key: 'full_name' },
      { label: tx('Sales', 'Ventas'), num: true, key: 'sales' },
      { label: tx('Spent (net)', 'Gastado (neto)'), num: true, render: (r) => money(r.spent_cents), csv: (r) => dollars(r.spent_cents) },
      { label: tx('Last visit', 'Última visita'), render: (r) => (r.last_visit ? prettyDate(r.last_visit) : '—'), csv: (r) => r.last_visit || '' },
    ])));
}

registerModule('reports', { label: ['Reports', 'Reportes'], group: GROUPS.insights, roles: ['owner'], render: renderReports });
