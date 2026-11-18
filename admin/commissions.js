// Commissions. Rules live on the Team page (owner). Each completed sale line performed by a staff
// member stores the exact rule it used, so changing a rule never rewrites past pay. Returns
// reverse commissions proportionally. Payouts mark unpaid commissions as paid and are audited.
/* global Admin, h, clear, tx, biMap, money, salonDateKey, addDays, prettyDate, prettyDateTime, staffLabel,
   serviceLabel, pill, openForm, panelHead, dataTable, registerModule, newKey, toast,
   supabaseClient, refreshSection, GROUPS */

const APPLIES_TEXT = biMap({ all: ['Everything', 'Todo'], service: ['Services', 'Servicios'], addon: ['Add-ons', 'Extras'], product: ['Products', 'Productos'] });
const PAYOUT_METHODS = biMap({
  cash: ['Cash', 'Efectivo'], check: ['Check', 'Cheque'], zelle: ['Zelle', 'Zelle'], cashapp: ['Cash App', 'Cash App'], venmo: ['Venmo', 'Venmo'],
  paypal: ['PayPal', 'PayPal'], direct_deposit: ['Direct deposit', 'Depósito directo'], other: ['Other', 'Otro'],
});
const PAYOUT_KEYS = ['cash', 'check', 'zelle', 'cashapp', 'venmo', 'paypal', 'direct_deposit', 'other'];
let commFrom = null;
let commTo = null;

function ruleText(r) {
  const parts = [];
  if (r.rate_bp) parts.push(`${(r.rate_bp / 100).toFixed(r.rate_bp % 100 ? 2 : 0)}%`);
  if (r.flat_cents) parts.push(`${money(r.flat_cents)} ${tx('per unit', 'por pieza')}`);
  return parts.join(' + ');
}
function snapshotText(snap) {
  if (!snap || snap.rule === 'none') return tx('No rule', 'Sin regla');
  return `${snap.scope === 'personal' ? tx('Personal', 'Personal') : tx('Default', 'General')} · ${APPLIES_TEXT[snap.applies_to]}${snap.service_id ? ' (' + serviceLabel(snap.service_id) + ')' : ''} · ${ruleText(snap)}`;
}

function ruleForm(existing) {
  openForm({
    title: existing ? tx('Edit commission rule', 'Editar regla de comisión') : tx('New commission rule', 'Nueva regla de comisión'),
    intro: tx("The most specific rule wins: a person's rule for one service, then their rule for a type, then their general rule, then the same order for the salon default. Changes apply to future sales only.",
      'Gana la regla más específica: la de la persona para un servicio, luego su regla por tipo, luego su regla general, y después lo mismo para la regla general del salón. Los cambios solo aplican a ventas futuras.'),
    fields: [
      { name: 'staff_id', label: tx('Who', 'Quién'), type: 'select', value: existing?.staff_id || '',
        options: [{ value: '', label: tx('Everyone (salon default)', 'Todas (regla general)') }].concat(Admin.staff.filter((s) => s.active).map((s) => ({ value: s.id, label: s.display_name }))) },
      { name: 'applies_to', label: tx('Applies to', 'Aplica a'), type: 'select', value: existing?.applies_to || 'service',
        options: ['all', 'service', 'addon', 'product'].map((v) => ({ value: v, label: APPLIES_TEXT[v] })) },
      { name: 'service_id', label: tx('Only this service (optional)', 'Solo este servicio (opcional)'), type: 'select', value: existing?.service_id || '',
        options: [{ value: '', label: tx('All services', 'Todos los servicios') }].concat(Admin.services.map((s) => ({ value: s.id, label: serviceLabel(s.id) }))),
        hint: tx('Only used when "Applies to" is Services.', 'Solo se usa cuando "Aplica a" es Servicios.') },
      { name: 'rate_pct', label: tx('Percent of the line', 'Porcentaje de la línea'), type: 'number', min: 0, max: 100, step: '0.01', value: existing ? existing.rate_bp / 100 : 0 },
      { name: 'flat_cents', label: tx('Plus a flat amount per unit', 'Más un monto fijo por pieza'), type: 'money', value: existing?.flat_cents ?? 0 },
      { name: 'note', label: tx('Note', 'Nota'), full: true, value: existing?.note },
      ...(existing ? [{ name: 'active', label: tx('Active', 'Activa'), type: 'checkbox', value: existing.active }] : []),
    ],
    onSubmit: async (v) => {
      const payload = {
        staff_id: v.staff_id || null, applies_to: v.applies_to,
        service_id: v.applies_to === 'service' ? (v.service_id || null) : null,
        rate_bp: Math.round((v.rate_pct || 0) * 100), flat_cents: v.flat_cents || 0, note: v.note,
      };
      if (!payload.rate_bp && !payload.flat_cents) throw new Error(tx('Set a percent or a flat amount.', 'Pon un porcentaje o un monto fijo.'));
      if (existing) payload.active = v.active;
      const { error } = existing
        ? await supabaseClient.from('commission_rules').update(payload).eq('id', existing.id)
        : await supabaseClient.from('commission_rules').insert(payload);
      if (error) throw error.code === '23505' ? new Error(tx('There is already an active rule for exactly that person and scope. Edit that one instead.', 'Ya existe una regla activa para esa persona y alcance. Edita esa en su lugar.')) : error;
      toast(tx('Rule saved', 'Regla guardada'));
      refreshSection();
    },
  });
}

function payoutForm(staffId, net, from, to) {
  const key = newKey();
  openForm({
    title: tx(`Pay ${staffLabel(staffId)}`, `Pagar a ${staffLabel(staffId)}`),
    intro: tx(`Pays all unpaid commissions from ${prettyDate(from)} to ${prettyDate(to)}: ${money(net)}. Record it after you've actually paid.`,
      `Paga todas las comisiones pendientes del ${prettyDate(from)} al ${prettyDate(to)}: ${money(net)}. Regístralo después de pagar.`),
    fields: [
      { name: 'method', label: tx('Paid via', 'Pagado por'), type: 'select', value: 'cash', options: PAYOUT_KEYS.map((v) => ({ value: v, label: PAYOUT_METHODS[v] })) },
      { name: 'reference', label: tx('Reference (check #, transfer id)', 'Referencia (núm. de cheque, transferencia)') },
      { name: 'note', label: tx('Note', 'Nota'), full: true },
    ],
    submitLabel: tx(`Record payout of ${money(net)}`, `Registrar pago de ${money(net)}`),
    onSubmit: async (v) => {
      const { error } = await supabaseClient.rpc('record_commission_payout', { p_staff_id: staffId, p_period_start: from, p_period_end: to,
        p_method: v.method, p_reference: v.reference, p_note: v.note, p_idempotency_key: key });
      if (error) throw error;
      toast(tx('Payout recorded', 'Pago registrado'));
      refreshSection();
    },
  });
}

async function fetchCommissions(from, to, staffId) {
  // Query a window padded by 14h each side (covers any US time zone), then keep exact salon days.
  let q = supabaseClient.from('commissions').select('*, sale_items(description, sale_id, qty)')
    .gte('created_at', new Date(Date.parse(from + 'T00:00:00Z') - 14 * 3600e3).toISOString())
    .lte('created_at', new Date(Date.parse(to + 'T23:59:59Z') + 14 * 3600e3).toISOString())
    .order('created_at', { ascending: false }).limit(2000);
  if (staffId) q = q.eq('staff_id', staffId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).filter((c) => { const d = salonDateKey(new Date(c.created_at)); return d >= from && d <= to; });
}

function periodPicker() {
  const today = salonDateKey();
  commTo = commTo || today;
  commFrom = commFrom || today.slice(0, 8) + '01';
  const f = h('input', { type: 'date', value: commFrom, onChange: (e) => { commFrom = e.target.value; refreshSection(); } });
  const t = h('input', { type: 'date', value: commTo, onChange: (e) => { commTo = e.target.value; refreshSection(); } });
  return h('div', { class: 'date-nav' }, h('span', {}, tx('From', 'Del')), f, h('span', {}, tx('to', 'al')), t,
    h('button', { class: 'ghost small', onClick: () => { commFrom = today.slice(0, 8) + '01'; commTo = today; refreshSection(); } }, tx('This month', 'Este mes')),
    h('button', { class: 'ghost small', onClick: () => { commFrom = addDays(today, -13); commTo = today; refreshSection(); } }, tx('Last 14 days', 'Últimos 14 días')));
}

// Owner: rules + summary + payouts on the Team page.
(Admin.teamSections ||= []).push(async (panel) => {
  const [{ data: rules }, { data: payouts }] = await Promise.all([
    supabaseClient.from('commission_rules').select('*').order('active', { ascending: false }).order('created_at'),
    supabaseClient.from('commission_payouts').select('*').order('paid_at', { ascending: false }).limit(50),
  ]);
  panel.appendChild(h('div', { class: 'panel-head sub-head' },
    h('div', {}, h('h3', { class: 'section-h' }, tx('Commission rules', 'Reglas de comisión')),
      h('p', { class: 'panel-sub' }, tx('The rule used is saved on every sale line, so edits only affect future sales.', 'La regla aplicada se guarda en cada línea de venta, así que los cambios solo afectan ventas futuras.'))),
    h('button', { class: 'ghost small', onClick: () => ruleForm(null) }, tx('+ New rule', '+ Nueva regla'))));
  panel.appendChild(dataTable([
    { label: tx('Who', 'Quién'), render: (r) => (r.staff_id ? staffLabel(r.staff_id) : tx('Everyone (default)', 'Todas (general)')) },
    { label: tx('Applies to', 'Aplica a'), render: (r) => APPLIES_TEXT[r.applies_to] + (r.service_id ? ` · ${serviceLabel(r.service_id)}` : '') },
    { label: tx('Commission', 'Comisión'), render: ruleText },
    { label: tx('Status', 'Estado'), render: (r) => (r.active ? pill('done', tx('Active', 'Activa')) : pill('cancelled', tx('Inactive', 'Inactiva'))) },
  ], rules || [], { empty: tx('No commission rules yet. Without a rule, sales earn no commission.', 'Todavía no hay reglas. Sin una regla, las ventas no generan comisión.'), onRow: ruleForm }));

  panel.appendChild(h('h3', { class: 'section-h' }, tx('Commissions by person', 'Comisiones por persona')));
  panel.appendChild(periodPicker());
  const rows = await fetchCommissions(commFrom, commTo);
  const by = {};
  for (const c of rows) {
    const b = (by[c.staff_id] ||= { staff_id: c.staff_id, earned: 0, reversed: 0, unpaid: 0, lines: 0 });
    if (c.kind === 'earned') { b.earned += c.amount_cents; b.lines++; } else b.reversed += c.amount_cents;
    if (!c.payout_id) b.unpaid += c.amount_cents;
  }
  panel.appendChild(dataTable([
    { label: tx('Person', 'Persona'), render: (b) => staffLabel(b.staff_id) },
    { label: tx('Lines', 'Líneas'), num: true, render: (b) => String(b.lines) },
    { label: tx('Earned', 'Ganado'), num: true, render: (b) => money(b.earned) },
    { label: tx('Returns', 'Devoluciones'), num: true, render: (b) => money(b.reversed) },
    { label: tx('Unpaid', 'Pendiente'), num: true, render: (b) => money(b.unpaid) },
    { label: '', render: (b) => (b.unpaid > 0 ? h('button', { class: 'small', onClick: () => payoutForm(b.staff_id, b.unpaid, commFrom, commTo) }, tx('Record payout', 'Registrar pago')) : '—') },
  ], Object.values(by), { empty: tx('No commissions in this period.', 'No hay comisiones en este periodo.') }));

  panel.appendChild(h('h3', { class: 'section-h' }, tx('Payouts', 'Pagos de comisiones')));
  panel.appendChild(dataTable([
    { label: tx('Paid', 'Pagado'), render: (p) => prettyDateTime(p.paid_at) },
    { label: tx('Person', 'Persona'), render: (p) => staffLabel(p.staff_id) },
    { label: tx('Period', 'Periodo'), render: (p) => `${prettyDate(p.period_start)} – ${prettyDate(p.period_end)}` },
    { label: tx('Via', 'Forma'), render: (p) => (p.method ? PAYOUT_METHODS[p.method] : '—') },
    { label: tx('Amount', 'Monto'), num: true, render: (p) => money(p.amount_cents) },
  ], payouts || [], { empty: tx('No payouts recorded yet.', 'Todavía no hay pagos registrados.') }));
});

// Staff: their own commissions.
async function renderMine(panel) {
  clear(panel);
  panel.appendChild(panelHead(tx('My commissions', 'Mis comisiones'), tx('Your commissions from completed sales, and the rule that was applied to each.', 'Tus comisiones de ventas completadas y la regla que se aplicó a cada una.')));
  if (!Admin.access.staff_id) { panel.appendChild(h('p', { class: 'muted' }, tx('Your login is not linked to a team member.', 'Tu cuenta no está vinculada a un miembro del equipo.'))); return; }
  panel.appendChild(periodPicker());
  const [rows, { data: payouts }] = await Promise.all([
    fetchCommissions(commFrom, commTo, Admin.access.staff_id),
    supabaseClient.from('commission_payouts').select('*').eq('staff_id', Admin.access.staff_id).order('paid_at', { ascending: false }).limit(24),
  ]);
  const earned = rows.filter((c) => c.kind === 'earned').reduce((s, c) => s + c.amount_cents, 0);
  const reversed = rows.filter((c) => c.kind === 'reversal').reduce((s, c) => s + c.amount_cents, 0);
  const unpaid = rows.filter((c) => !c.payout_id).reduce((s, c) => s + c.amount_cents, 0);
  panel.appendChild(h('div', { class: 'stats-row' },
    h('div', { class: 'stat-tile' }, h('span', { class: 'stat-value' }, money(earned)), h('span', { class: 'stat-label' }, tx('Earned', 'Ganado'))),
    h('div', { class: 'stat-tile' }, h('span', { class: 'stat-value' }, money(reversed)), h('span', { class: 'stat-label' }, tx('Returns', 'Devoluciones'))),
    h('div', { class: 'stat-tile' }, h('span', { class: 'stat-value' }, money(earned + reversed)), h('span', { class: 'stat-label' }, tx('Net', 'Neto'))),
    h('div', { class: 'stat-tile' }, h('span', { class: 'stat-value' }, money(unpaid)), h('span', { class: 'stat-label' }, tx('Not paid yet', 'Por pagar')))));
  panel.appendChild(dataTable([
    { label: tx('When', 'Cuándo'), render: (c) => prettyDateTime(c.created_at) },
    { label: tx('Item', 'Artículo'), render: (c) => c.sale_items?.description ?? '—' },
    { label: tx('Rule applied', 'Regla aplicada'), render: (c) => snapshotText(c.rule_snapshot) },
    { label: tx('Base', 'Base'), num: true, render: (c) => money(c.base_cents) },
    { label: tx('Commission', 'Comisión'), num: true, render: (c) => h('span', {}, money(c.amount_cents), c.kind === 'reversal' ? h('small', { class: 'sub' }, ' ', tx('return', 'devolución')) : null) },
    { label: tx('Paid', 'Pagada'), render: (c) => (c.payout_id ? tx('Yes', 'Sí') : 'No') },
  ], rows, { empty: tx('No commissions in this period.', 'No hay comisiones en este periodo.') }));
  panel.appendChild(h('h3', { class: 'section-h' }, tx('Payouts', 'Pagos')));
  panel.appendChild(dataTable([
    { label: tx('Paid', 'Pagado'), render: (p) => prettyDateTime(p.paid_at) },
    { label: tx('Period', 'Periodo'), render: (p) => `${prettyDate(p.period_start)} – ${prettyDate(p.period_end)}` },
    { label: tx('Amount', 'Monto'), num: true, render: (p) => money(p.amount_cents) },
  ], payouts || [], { empty: tx('No payouts yet.', 'Todavía no hay pagos.') }));
}

registerModule('mycommissions', { label: ['My commissions', 'Mis comisiones'], group: GROUPS.me, roles: ['employee', 'reception'], render: renderMine });
Admin.snapshotText = snapshotText;
