// Settings (owner): currency, time zone, capacity, slot size, product tax, demo-data visibility,
// and the audit log (read-only, append-only in the database).
/* global Admin, h, clear, tx, biMap, money, prettyDateTime, staffLabel, friendlyError, toast, openForm, panelHead,
   dataTable, registerModule, supabaseClient, refreshSection, loadReference, GROUPS */

const AUDIT_ENTITY = biMap({
  staff_members: ['Team & permissions', 'Equipo y permisos'], salon_settings: ['Settings', 'Configuración'], services: ['Services', 'Servicios'],
  addons: ['Add-ons', 'Extras'], payments: ['Payments', 'Pagos'], refunds: ['Refunds', 'Reembolsos'], expenses: ['Expenses', 'Gastos'],
  inventory_items: ['Inventory', 'Inventario'], sales: ['Sales', 'Ventas'], purchase_orders: ['Purchasing', 'Compras'],
  commission_rules: ['Commission rules', 'Reglas de comisión'], profiles: ['Accounts', 'Cuentas'],
});
const AUDIT_KEYS = ['staff_members', 'salon_settings', 'services', 'addons', 'payments', 'refunds', 'expenses', 'inventory_items', 'sales', 'purchase_orders', 'commission_rules', 'profiles'];
const AUDIT_ACTION = biMap({
  insert: ['created', 'creó'], update: ['changed', 'cambió'], delete: ['deleted', 'borró'], stock_adjustment: ['stock adjustment', 'ajuste de inventario'],
  void_sale: ['voided sale', 'anuló venta'], receive_purchase: ['received delivery', 'recibió entrega'], commission_payout: ['commission payout', 'pago de comisión'],
  create_invite: ['created invite', 'creó invitación'], claim_invite: ['used invite', 'usó invitación'], grant_owner: ['granted owner', 'otorgó propietaria'],
});
let auditEntity = '';

function settingsForm(s) {
  const zones = (Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : ['America/Chicago', 'America/New_York', 'America/Denver', 'America/Los_Angeles'])
    .filter((z) => z.startsWith('America/') || z === s.timezone);
  openForm({
    title: tx('Salon settings', 'Configuración del salón'),
    fields: [
      { name: 'business_name', label: tx('Business name', 'Nombre del negocio'), required: true, full: true, value: s.business_name },
      { name: 'currency', label: tx('Currency', 'Moneda'), type: 'select', value: s.currency,
        options: ['USD', 'MXN', 'CAD', 'EUR'].map((c) => ({ value: c, label: c })), hint: tx("Display currency. Amounts aren't converted.", 'Moneda que se muestra. Los montos no se convierten.') },
      { name: 'timezone', label: tx('Time zone', 'Zona horaria'), type: 'select', value: s.timezone, options: zones.map((z) => ({ value: z, label: z.replace('_', ' ') })),
        hint: tx('Used for "today", reports and day boundaries.', 'Se usa para "hoy", los reportes y el cambio de día.') },
      { name: 'capacity', label: tx('Appointments at the same time', 'Citas al mismo tiempo'), type: 'number', min: 1, max: 50, required: true, value: s.capacity,
        hint: tx('Number of chairs / techs working at once.', 'Número de sillas / técnicas trabajando a la vez.') },
      { name: 'slot_minutes', label: tx('Booking grid (minutes)', 'Intervalo de horarios (minutos)'), type: 'select', value: s.slot_minutes, options: [5, 10, 15, 20, 30, 60].map((m) => ({ value: m, label: `${m} min` })) },
      { name: 'product_tax_pct', label: tx('Sales tax on products (%)', 'Impuesto sobre productos (%)'), type: 'number', min: 0, max: 50, step: '0.001', value: s.product_tax_bp / 100,
        hint: tx('Applied to retail products at checkout. Services are not taxed. Check your local rate.', 'Se aplica a productos al cobrar. Los servicios no llevan impuesto. Verifica la tasa local.') },
      { name: 'show_demo_data', label: tx('Show demo data (purple DEMO badges) and include it in reports', 'Mostrar datos de demostración (etiqueta morada DEMO) e incluirlos en reportes'), type: 'checkbox', value: s.show_demo_data },
    ],
    onSubmit: async (v) => {
      const { error } = await supabaseClient.from('salon_settings').update({
        business_name: v.business_name, currency: v.currency, timezone: v.timezone, capacity: v.capacity,
        slot_minutes: Number(v.slot_minutes), product_tax_bp: Math.round((v.product_tax_pct || 0) * 100), show_demo_data: v.show_demo_data,
      }).eq('id', true);
      if (error) throw error;
      await loadReference();
      toast(tx('Settings saved', 'Configuración guardada'));
      refreshSection();
    },
  });
}

function describeAudit(r) {
  const d = r.details || {};
  if (r.action === 'update') return Object.entries(d).map(([k, v]) => `${k}: ${JSON.stringify(v?.from)} → ${JSON.stringify(v?.to)}`).join('; ');
  if (r.action === 'stock_adjustment') return `${d.delta > 0 ? '+' : ''}${d.delta} · ${d.note}`;
  if (r.action === 'insert' && r.entity === 'payments') return `${money(d.amount_cents)} ${d.method}${d.reference ? ' ref ' + d.reference : ''}`;
  if (r.action === 'insert' && r.entity === 'refunds') return `${money(d.amount_cents)} · ${d.reason}`;
  if (r.action === 'insert' && r.entity === 'expenses') return `${money(d.amount_cents)} · ${d.description}`;
  const s = JSON.stringify(d);
  return s.length > 160 ? s.slice(0, 160) + '…' : s;
}

async function renderSettings(panel) {
  await loadReference();
  const s = Admin.settings;
  let q = supabaseClient.from('audit_log').select('*').order('id', { ascending: false }).limit(200);
  if (auditEntity) q = q.eq('entity', auditEntity);
  const { data: audit, error } = await q;
  clear(panel);
  panel.appendChild(panelHead(tx('Settings', 'Configuración'), tx('Applies to the whole dashboard and to booking capacity in the app.', 'Aplica a todo el panel y a la capacidad de reservas en la app.'),
    h('button', { onClick: () => settingsForm(s) }, tx('Edit settings', 'Editar configuración'))));
  panel.appendChild(h('div', { class: 'card' },
    [[tx('Business name', 'Nombre del negocio'), s.business_name], [tx('Currency', 'Moneda'), s.currency], [tx('Time zone', 'Zona horaria'), s.timezone],
      [tx('Appointments at the same time', 'Citas al mismo tiempo'), String(s.capacity)], [tx('Booking grid', 'Intervalo de horarios'), `${s.slot_minutes} min`],
      [tx('Sales tax on products', 'Impuesto sobre productos'), `${(s.product_tax_bp / 100).toFixed(3).replace(/\.?0+$/, '')}%`],
      [tx('Demo data', 'Datos de demostración'), s.show_demo_data ? tx('Shown (and included in reports)', 'Visibles (e incluidos en reportes)') : tx('Hidden', 'Ocultos')]]
      .map(([k, v]) => h('div', { class: 'kv' }, h('span', {}, k), h('span', { class: 'v' }, v)))));

  const sel = h('select', { style: { maxWidth: '260px' }, 'aria-label': tx('Filter changes', 'Filtrar cambios'), onChange: (e) => { auditEntity = e.target.value; refreshSection(); } },
    h('option', { value: '' }, tx('All changes', 'Todos los cambios')), AUDIT_KEYS.map((v) => h('option', { value: v }, AUDIT_ENTITY[v])));
  sel.value = auditEntity;
  panel.appendChild(h('div', { class: 'panel-head sub-head' },
    h('div', {}, h('h3', { class: 'section-h' }, tx('Audit log', 'Registro de cambios')),
      h('p', { class: 'panel-sub' }, tx("Permissions, settings, prices, payments, refunds, expenses and stock adjustments. Entries can't be edited or deleted.", 'Permisos, configuración, precios, pagos, reembolsos, gastos y ajustes de inventario. Las entradas no se pueden editar ni borrar.'))),
    sel));
  if (error) { panel.appendChild(h('p', { class: 'error' }, friendlyError(error))); return; }
  const byUser = Object.fromEntries(Admin.staff.filter((m) => m.user_id).map((m) => [m.user_id, m.id]));
  panel.appendChild(dataTable([
    { label: tx('When', 'Cuándo'), render: (r) => prettyDateTime(r.at) },
    { label: tx('Who', 'Quién'), render: (r) => (r.actor_id ? (byUser[r.actor_id] ? staffLabel(byUser[r.actor_id]) : tx('Account ', 'Cuenta ') + r.actor_id.slice(0, 6)) : tx('System', 'Sistema')) },
    { label: tx('Area', 'Área'), render: (r) => AUDIT_ENTITY[r.entity] || r.entity },
    { label: tx('Action', 'Acción'), render: (r) => AUDIT_ACTION[r.action] || r.action.replace('_', ' ') },
    { label: tx('Details', 'Detalle'), render: describeAudit },
  ], audit || [], { empty: tx('No changes recorded yet.', 'Todavía no hay cambios registrados.') }));
}

registerModule('settings', { label: ['Settings & audit', 'Configuración y registro'], group: GROUPS.settings, roles: ['owner'], render: renderSettings });
