// Finances (owner only). Every figure comes from finance_summary() in the database, which counts
// each thing once: revenue at sale completion (deposits are cash received, not a second sale),
// inventory cost when used/sold (supplier payments are cash flow only), and commissions when
// earned (payouts are cash flow only). Management figures, not a tax filing.
/* global Admin, h, clear, tx, biMap, money, salonDateKey, addDays, prettyDate, pill, friendlyError, toast,
   openForm, panelHead, dataTable, registerModule, showDemo, newKey, supabaseClient, refreshSection, GROUPS */

const EXPENSE_CATEGORIES = biMap({
  rent: ['Rent', 'Renta'], utilities: ['Utilities', 'Servicios (luz, agua…)'], supplies: ['Supplies (not inventoried)', 'Insumos (fuera de inventario)'],
  inventory_purchase: ['Inventory purchase (supplier order)', 'Compra de inventario (orden a proveedor)'],
  payroll: ['Payroll / wages', 'Nómina / sueldos'], marketing: ['Marketing', 'Publicidad'], software: ['Software & subscriptions', 'Software y suscripciones'],
  fees: ['Card & bank fees', 'Comisiones de tarjeta y banco'], insurance: ['Insurance', 'Seguros'], maintenance: ['Maintenance & repairs', 'Mantenimiento y reparaciones'],
  taxes_licenses: ['Taxes & licenses', 'Impuestos y licencias'], other: ['Other', 'Otro'],
});
const EXPENSE_KEYS = ['rent', 'utilities', 'supplies', 'inventory_purchase', 'payroll', 'marketing', 'software', 'fees', 'insurance', 'maintenance', 'taxes_licenses', 'other'];
const EXPENSE_METHODS = biMap({ cash: ['Cash', 'Efectivo'], card: ['Card', 'Tarjeta'], bank_transfer: ['Bank transfer', 'Transferencia'], check: ['Check', 'Cheque'], zelle: ['Zelle', 'Zelle'], other: ['Other', 'Otro'] });
let finFrom = null;
let finTo = null;

async function expenseForm() {
  const [{ data: suppliers }, { data: pos }, { data: totals }] = await Promise.all([
    supabaseClient.from('suppliers').select('id, name').eq('active', true).order('name'),
    supabaseClient.from('purchase_orders').select('id, number, status, suppliers(name)').in('status', ['ordered', 'partially_received', 'received']).order('created_at', { ascending: false }).limit(50),
    supabaseClient.from('purchase_order_totals').select('*'),
  ]);
  const tot = Object.fromEntries((totals || []).map((t) => [t.po_id, t]));
  const key = newKey();
  const { inputs } = openForm({
    title: tx('Record expense', 'Registrar gasto'),
    intro: tx('Record money that has left the business. Paying a supplier for inventory: choose "Inventory purchase" and its order, so the cost is counted when stock is used, not twice. Commission payouts are recorded on the Team page, not here.',
      'Registra dinero que salió del negocio. Si pagas inventario a un proveedor, elige "Compra de inventario" y su orden, para que el costo se cuente al usarse y no dos veces. Los pagos de comisiones se registran en Equipo, no aquí.'),
    fields: [
      { name: 'category', label: tx('Category', 'Categoría'), type: 'select', required: true, value: 'rent', full: true,
        options: EXPENSE_KEYS.map((v) => ({ value: v, label: EXPENSE_CATEGORIES[v] })),
        onChange: (v, inp) => inp.purchase_order_id.closest('label').classList.toggle('hidden', v !== 'inventory_purchase') },
      { name: 'purchase_order_id', label: tx('Purchase order', 'Orden de compra'), type: 'select', full: true,
        options: [{ value: '', label: tx('Choose the order this pays for…', 'Elige la orden que se está pagando…') }].concat((pos || []).map((p) => ({ value: p.id, label: `${tx('PO', 'OC')} #${p.number} · ${p.suppliers?.name ?? ''} · ${money(tot[p.id]?.ordered_cents ?? 0)}` }))) },
      { name: 'description', label: tx('Description', 'Descripción'), required: true, full: true },
      { name: 'amount_cents', label: tx('Amount', 'Monto'), type: 'money', required: true },
      { name: 'spent_on', label: tx('Date', 'Fecha'), type: 'date', required: true, value: salonDateKey() },
      { name: 'method', label: tx('Paid with', 'Pagado con'), type: 'select', value: 'card', options: ['cash', 'card', 'bank_transfer', 'check', 'zelle', 'other'].map((v) => ({ value: v, label: EXPENSE_METHODS[v] })) },
      { name: 'reference', label: tx('Receipt / invoice # (optional)', 'Núm. de recibo / factura (opcional)'), hint: tx('Never a card number.', 'Nunca un número de tarjeta.') },
      { name: 'supplier_id', label: tx('Supplier (optional)', 'Proveedor (opcional)'), type: 'select', options: [{ value: '', label: '—' }].concat((suppliers || []).map((s) => ({ value: s.id, label: s.name }))) },
    ],
    onSubmit: async (v) => {
      if (!(v.amount_cents > 0)) throw new Error(tx('Enter an amount.', 'Escribe un monto.'));
      if (v.category === 'inventory_purchase' && !v.purchase_order_id) throw new Error(tx('Choose the purchase order this pays for.', 'Elige la orden de compra que se está pagando.'));
      const { error } = await supabaseClient.rpc('record_expense', {
        p_category: v.category, p_description: v.description, p_amount_cents: v.amount_cents, p_spent_on: v.spent_on,
        p_method: v.method, p_reference: v.reference, p_supplier_id: v.supplier_id || null,
        p_purchase_order_id: v.category === 'inventory_purchase' ? v.purchase_order_id : null, p_idempotency_key: key,
      });
      if (error) throw error;
      toast(tx('Expense recorded', 'Gasto registrado'));
      refreshSection();
    },
  });
  inputs.purchase_order_id.closest('label').classList.add('hidden');
}

function signed(cents) { return (cents < 0 ? '−' : '') + money(Math.abs(cents)); }
function kv(label, cents, opts = {}) {
  return h('div', { class: 'kv' + (opts.total ? ' total' : '') + (opts.neg ? ' neg' : '') },
    h('span', {}, label, opts.hint ? h('small', { class: 'sub' }, ' ', opts.hint) : null),
    h('span', { class: 'v' }, opts.neg ? (cents ? '−' + money(Math.abs(cents)) : money(0)) : signed(cents)));
}

async function renderFinance(panel) {
  const today = salonDateKey();
  finTo = finTo || today;
  finFrom = finFrom || today.slice(0, 8) + '01';
  const [{ data: f, error }, { data: expenses }] = await Promise.all([
    supabaseClient.rpc('finance_summary', { p_from: finFrom, p_to: finTo, p_include_demo: showDemo() }),
    supabaseClient.from('expenses').select('*, suppliers(name), purchase_orders(number)').gte('spent_on', finFrom).lte('spent_on', finTo).order('spent_on', { ascending: false }),
  ]);
  clear(panel);
  panel.appendChild(panelHead(tx('Finances', 'Finanzas'), tx('Profit & loss and cash flow from recorded sales, payments, stock and expenses.', 'Ganancias y flujo de efectivo a partir de ventas, pagos, inventario y gastos registrados.'),
    h('button', { onClick: expenseForm }, tx('+ Record expense', '+ Registrar gasto'))));
  const fromIn = h('input', { type: 'date', value: finFrom, onChange: (e) => { finFrom = e.target.value; refreshSection(); } });
  const toIn = h('input', { type: 'date', value: finTo, onChange: (e) => { finTo = e.target.value; refreshSection(); } });
  const monthStart = (d) => d.slice(0, 8) + '01';
  const prevMonthEnd = addDays(monthStart(today), -1);
  panel.appendChild(h('div', { class: 'date-nav' }, h('span', {}, tx('From', 'Del')), fromIn, h('span', {}, tx('to', 'al')), toIn,
    h('button', { class: 'ghost small', onClick: () => { finFrom = monthStart(today); finTo = today; refreshSection(); } }, tx('This month', 'Este mes')),
    h('button', { class: 'ghost small', onClick: () => { finFrom = monthStart(prevMonthEnd); finTo = prevMonthEnd; refreshSection(); } }, tx('Last month', 'Mes pasado')),
    h('button', { class: 'ghost small', onClick: () => { finFrom = today.slice(0, 5) + '01-01'; finTo = today; refreshSection(); } }, tx('Year to date', 'En lo que va del año'))));
  if (error) { panel.appendChild(h('p', { class: 'error' }, friendlyError(error))); return; }

  panel.appendChild(h('div', { class: 'notice info' }, h('strong', {}, tx('Not a tax return.', 'No es una declaración de impuestos.')),
    tx('Management figures from recorded data. Not a tax return or accounting statement; tax collected is a liability, not income.',
      'Cifras de gestión a partir de los datos registrados. No es una declaración de impuestos ni un estado contable; el impuesto cobrado se debe, no es ingreso.'),
    showDemo() ? tx(' Demo data is INCLUDED because "show demo data" is on in Settings.', ' Los datos de demostración están INCLUIDOS porque "mostrar datos de demostración" está activo en Configuración.') : ''));

  panel.appendChild(h('div', { class: 'stats-row' },
    h('div', { class: 'stat-tile' }, h('span', { class: 'stat-value' }, money(f.net_revenue)), h('span', { class: 'stat-label' }, tx('Net revenue', 'Ingresos netos'))),
    h('div', { class: 'stat-tile' }, h('span', { class: 'stat-value' }, signed(f.gross_profit)), h('span', { class: 'stat-label' }, tx('Gross profit', 'Utilidad bruta'))),
    h('div', { class: 'stat-tile' + (f.operating_profit < 0 ? ' warn' : '') }, h('span', { class: 'stat-value' }, signed(f.operating_profit)), h('span', { class: 'stat-label' }, tx('Operating profit', 'Utilidad de operación'))),
    h('div', { class: 'stat-tile' + (f.net_cash < 0 ? ' warn' : '') }, h('span', { class: 'stat-value' }, signed(f.net_cash)), h('span', { class: 'stat-label' }, tx('Net cash', 'Efectivo neto')))));

  const pnl = h('div', { class: 'card' }, h('h3', { class: 'section-h', style: { marginTop: 0 } }, tx('Profit & loss', 'Estado de resultados')),
    kv(tx('Services', 'Servicios'), f.services_gross), kv(tx('Add-ons', 'Extras'), f.addons_gross), kv(tx('Products', 'Productos'), f.products_gross),
    kv(tx('Gross sales', 'Ventas brutas'), f.gross_sales, { total: true, hint: tx(`${f.sales_count} completed sale(s)`, `${f.sales_count} venta(s) completada(s)`) }),
    kv(tx('Discounts', 'Descuentos'), f.discounts, { neg: true }), kv(tx('Refunds', 'Reembolsos'), f.refunds, { neg: true }),
    kv(tx('Net revenue', 'Ingresos netos'), f.net_revenue, { total: true }),
    kv(tx('Cost of products sold', 'Costo de productos vendidos'), f.cogs_products, { neg: true, hint: tx('at average cost', 'a costo promedio') }),
    kv(tx('Materials used in services', 'Materiales usados en servicios'), f.cogs_materials, { neg: true }),
    kv(tx('Gross profit', 'Utilidad bruta'), f.gross_profit, { total: true }),
    kv(tx('Commissions earned', 'Comisiones generadas'), f.commissions_earned, { neg: true }),
    kv(tx('Operating expenses', 'Gastos de operación'), f.operating_expenses, { neg: true, hint: tx('excludes inventory purchases', 'sin compras de inventario') }),
    kv(tx('Operating profit', 'Utilidad de operación'), f.operating_profit, { total: true }),
    h('p', { class: 'hint' }, tx(`Sales tax collected (owed, not income): ${money(f.tax_collected)}`, `Impuesto cobrado (se debe, no es ingreso): ${money(f.tax_collected)}`)));

  const cash = h('div', { class: 'card' }, h('h3', { class: 'section-h', style: { marginTop: 0 } }, tx('Cash flow', 'Flujo de efectivo')),
    kv(tx('Payments received', 'Pagos recibidos'), f.payments_received, { hint: f.deposits_received ? tx(`incl. ${money(f.deposits_received)} in deposits`, `incl. ${money(f.deposits_received)} en anticipos`) : '' }),
    kv(tx('Refunds paid out', 'Reembolsos pagados'), f.refunds, { neg: true }),
    kv(tx('Cash in', 'Entradas'), f.cash_in, { total: true }),
    kv(tx('Operating expenses', 'Gastos de operación'), f.operating_expenses, { neg: true }),
    kv(tx('Inventory purchases paid', 'Compras de inventario pagadas'), f.inventory_purchases_paid, { neg: true }),
    kv(tx('Commission payouts', 'Pagos de comisiones'), f.commission_payouts, { neg: true }),
    kv(tx('Cash out', 'Salidas'), f.cash_out, { total: true }),
    kv(tx('Net cash', 'Efectivo neto'), f.net_cash, { total: true }),
    h('h3', { class: 'section-h' }, tx('Received by method', 'Recibido por forma de pago')),
    Object.keys(f.payments_by_method).length
      ? Object.entries(f.payments_by_method).map(([m, c]) => kv(Admin.METHOD_TEXT?.[m] ?? m, c))
      : h('p', { class: 'rank-empty' }, tx('No payments in this period.', 'No hay pagos en este periodo.')),
    h('div', { class: 'notice', style: { marginTop: '12px' } }, h('strong', {}, tx(`Deposits held now: ${money(f.deposits_held)}`, `Anticipos en resguardo: ${money(f.deposits_held)}`)),
      tx(`Paid in advance on ${f.open_sales_with_deposits} open sale(s). It becomes revenue when the visit is checked out, once.`,
        `Pagado por adelantado en ${f.open_sales_with_deposits} venta(s) abierta(s). Se vuelve ingreso una sola vez, al cobrar la cita.`)));
  panel.appendChild(h('div', { class: 'grid-2' }, pnl, cash));

  panel.appendChild(h('h3', { class: 'section-h' }, tx('Expenses in this period', 'Gastos del periodo')));
  panel.appendChild(dataTable([
    { label: tx('Date', 'Fecha'), render: (e) => prettyDate(e.spent_on) },
    { label: tx('Category', 'Categoría'), render: (e) => EXPENSE_CATEGORIES[e.category] },
    { label: tx('Description', 'Descripción'), render: (e) => h('span', {}, e.description, e.purchase_orders ? h('small', { class: 'sub' }, ` · ${tx('PO', 'OC')} #${e.purchase_orders.number}`) : null) },
    { label: tx('Status', 'Estado'), render: (e) => (e.status === 'voided' ? pill('voided', tx('Voided', 'Anulado')) : pill('recorded', tx('Recorded', 'Registrado'))) },
    { label: tx('Amount', 'Monto'), num: true, render: (e) => money(e.amount_cents) },
    { label: '', render: (e) => (e.status === 'recorded' ? h('button', { class: 'ghost small danger-ghost', onClick: () => openForm({
      title: tx('Void expense', 'Anular gasto'), intro: tx('The expense stays in history as voided and stops counting.', 'El gasto queda en el historial como anulado y deja de contar.'), danger: true, submitLabel: tx('Void', 'Anular'),
      fields: [{ name: 'reason', label: tx('Reason', 'Motivo'), required: true, full: true }],
      onSubmit: async (v) => { const { error: er } = await supabaseClient.rpc('void_expense', { p_expense_id: e.id, p_reason: v.reason }); if (er) throw er; refreshSection(); },
    }) }, tx('Void', 'Anular')) : (e.void_reason || '')) },
  ], (expenses || []).filter((e) => showDemo() || !e.is_demo), { empty: tx('No expenses recorded in this period.', 'No hay gastos registrados en este periodo.') }));
}

registerModule('finance', { label: ['Finances', 'Finanzas'], group: GROUPS.business, roles: ['owner'], render: renderFinance });
