// Checkout & sales. There's no card processing: money is taken at the salon (cash, card terminal,
// Zelle…) and RECORDED here. A sale only counts as paid when recorded payments cover the total.
// Every money/stock change goes through database functions (open_sale, record_payment,
// complete_sale, refund_sale…), which enforce the rules and permissions server-side.
/* global Admin, h, clear, tx, biMap, money, toCents, prettyDate, prettyDateTime, salonDateKey,
   formatPhone, serviceLabel, addonLabel, staffLabel, pill, demoBadge, friendlyError, toast, openForm,
   emptyState, panelHead, dataTable, filterRow, registerModule, hasRole, showDemo, newKey,
   supabaseClient, refreshSection, GROUPS */

const METHOD_TEXT = biMap({
  cash: ['Cash', 'Efectivo'], card_terminal: ['Card (terminal)', 'Tarjeta (terminal)'], zelle: ['Zelle', 'Zelle'],
  cashapp: ['Cash App', 'Cash App'], venmo: ['Venmo', 'Venmo'], paypal: ['PayPal', 'PayPal'], check: ['Check', 'Cheque'],
  gift_card: ['Gift card', 'Tarjeta de regalo'], store_credit: ['Store credit', 'Saldo a favor'], other: ['Other', 'Otro'],
});
const PAYMENT_METHODS = ['cash', 'card_terminal', 'zelle', 'cashapp', 'venmo', 'paypal', 'check', 'gift_card', 'other'];
const REFUND_METHODS = PAYMENT_METHODS.concat('store_credit');
const SALE_STATUS = biMap({ open: ['Open', 'Abierta'], completed: ['Completed', 'Completada'], voided: ['Voided', 'Anulada'] });
let salesFilter = 'today';

// Service/add-on lines show the catalog name in the current language; products keep their name.
function lineLabel(i) {
  if (i.kind === 'service' && i.service_id) return serviceLabel(i.service_id);
  if (i.kind === 'addon' && i.addon_id) return addonLabel(i.addon_id);
  return i.description;
}

async function rpc(name, args) {
  const { data, error } = await supabaseClient.rpc(name, args);
  if (error) throw error;
  return data;
}

async function openCheckout(appt) {
  try {
    const saleId = await rpc('open_sale', { p_client_id: null, p_appointment_id: appt.id });
    openSaleModal(saleId);
  } catch (e) { toast(friendlyError(e), 'error'); }
}

function newSale() {
  supabaseClient.from('clients').select('id, full_name, phone').eq('active', true).order('full_name').then(({ data }) => {
    openForm({
      title: tx('New sale', 'Nueva venta'),
      intro: tx('For retail purchases or services without an appointment. To check out an appointment, use the button on it in the Agenda.',
        'Para ventas de productos o servicios sin cita. Para cobrar una cita, usa el botón en la Agenda.'),
      fields: [{ name: 'client_id', label: tx('Client (optional)', 'Clienta (opcional)'), type: 'select', full: true,
        options: [{ value: '', label: tx('No client / anonymous retail', 'Sin clienta / venta de mostrador') }].concat((data || []).map((c) => ({ value: c.id, label: `${c.full_name}${c.phone ? ' · ' + formatPhone(c.phone) : ''}` }))) }],
      submitLabel: tx('Start sale', 'Iniciar venta'),
      onSubmit: async (v) => {
        const id = await rpc('open_sale', { p_client_id: v.client_id || null, p_appointment_id: null });
        setTimeout(() => openSaleModal(id), 0);
      },
    });
  });
}

async function openSaleModal(saleId) {
  const overlay = h('div', { class: 'modal-overlay' });
  const box = h('div', { class: 'modal modal-wide' });
  overlay.appendChild(box);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) { overlay.remove(); refreshSection(); } });
  document.body.appendChild(overlay);
  // One idempotency key per "record payment" attempt: a double-click or retry can't record twice.
  let paymentKey = newKey();

  async function draw() {
    clear(box).appendChild(h('p', { class: 'muted' }, tx('Loading…', 'Cargando…')));
    const [{ data: sale, error }, { data: items }, { data: payments }, { data: refunds }, { data: products }] = await Promise.all([
      supabaseClient.from('sales').select('*, clients(full_name, phone), appointments(appt_date, appt_time, status)').eq('id', saleId).single(),
      supabaseClient.from('sale_items').select('*').eq('sale_id', saleId).order('created_at'),
      supabaseClient.from('payments').select('*').eq('sale_id', saleId).order('received_at'),
      supabaseClient.from('refunds').select('*, refund_items(sale_item_id, qty, restock)').eq('sale_id', saleId).order('created_at'),
      supabaseClient.from('inventory_items').select('id, name, price_cents').eq('kind', 'retail').eq('active', true).order('name'),
    ]);
    clear(box);
    if (error) { box.appendChild(h('p', { class: 'error' }, friendlyError(error))); return; }
    const open = sale.status === 'open';
    const balance = sale.total_cents - sale.paid_cents;
    const close = () => { overlay.remove(); refreshSection(); };

    box.appendChild(h('div', { class: 'modal-title-row' },
      h('h2', {}, `${tx('Sale', 'Venta')} #${sale.number} `, pill(sale.status, SALE_STATUS[sale.status]), ' ', demoBadge(sale)),
      h('button', { class: 'ghost small', onClick: close }, tx('Close', 'Cerrar'))));
    box.appendChild(h('p', { class: 'panel-sub' },
      sale.clients ? `${sale.clients.full_name}${sale.clients.phone ? ' · ' + formatPhone(sale.clients.phone) : ''}` : tx('No client', 'Sin clienta'),
      sale.appointments ? ` · ${tx('Appointment', 'Cita')} ${prettyDate(sale.appointments.appt_date)} ${sale.appointments.appt_time}` : '',
      ` · ${tx('Opened', 'Abierta')} ${prettyDateTime(sale.created_at)}`));
    if (sale.void_reason) box.appendChild(h('div', { class: 'notice' }, h('strong', {}, tx('Voided', 'Anulada')), sale.void_reason));

    // Lines
    const refundedQty = {};
    for (const r of refunds || []) for (const ri of r.refund_items || []) refundedQty[ri.sale_item_id] = (refundedQty[ri.sale_item_id] || 0) + Number(ri.qty);
    box.appendChild(h('h3', { class: 'section-h' }, tx('Items', 'Artículos')));
    box.appendChild(dataTable([
      { label: tx('Item', 'Artículo'), render: (i) => h('span', {}, lineLabel(i), refundedQty[i.id] ? h('small', { class: 'sub' }, ` · ${refundedQty[i.id]} ${tx('returned', 'devuelto(s)')}`) : null) },
      { label: tx('Staff', 'Atendió'), render: (i) => (i.staff_id ? staffLabel(i.staff_id) : '—') },
      { label: tx('Qty', 'Cant.'), num: true, render: (i) => String(Number(i.qty)) },
      { label: tx('Price', 'Precio'), num: true, render: (i) => money(i.unit_price_cents) },
      { label: 'Total', num: true, render: (i) => money(i.line_total_cents) },
      ...(open ? [{ label: '', render: (i) => h('button', { class: 'ghost small danger-ghost', onClick: async () => {
        try { await rpc('remove_sale_item', { p_sale_item_id: i.id }); draw(); } catch (e) { toast(friendlyError(e), 'error'); }
      } }, tx('Remove', 'Quitar')) }] : []),
    ], items || [], { empty: tx('No items yet.', 'Todavía no hay artículos.') }));

    if (open) {
      const kindSel = h('select', {}, h('option', { value: 'service' }, tx('Service', 'Servicio')), h('option', { value: 'addon' }, tx('Add-on', 'Extra')), h('option', { value: 'product' }, tx('Product', 'Producto')));
      const refSel = h('select');
      const qty = h('input', { type: 'number', min: '1', step: '1', value: '1', style: { maxWidth: '80px' }, 'aria-label': tx('Quantity', 'Cantidad') });
      const price = h('input', { type: 'number', min: '0', step: '0.01', placeholder: tx('Price (default)', 'Precio (normal)'), style: { maxWidth: '130px' } });
      const staffSel = h('select', {}, h('option', { value: '' }, tx('No staff', 'Sin asignar')), Admin.staff.filter((s) => s.active).map((s) => h('option', { value: s.id }, s.display_name)));
      const fillRefs = () => {
        clear(refSel);
        const list = kindSel.value === 'service' ? Admin.services.filter((s) => s.active).map((s) => [s.id, `${serviceLabel(s.id)} · ${money(s.price_cents)}`])
          : kindSel.value === 'addon' ? Admin.addons.filter((a) => a.active).map((a) => [a.id, `${addonLabel(a.id)} · ${money(a.price_cents)}`])
            : (products || []).map((p) => [p.id, `${p.name} · ${money(p.price_cents)}`]);
        if (!list.length) refSel.appendChild(h('option', { value: '' }, kindSel.value === 'product' ? tx('No retail products in inventory yet', 'Todavía no hay productos en inventario') : tx('None', 'Ninguno')));
        for (const [v, l] of list) refSel.appendChild(h('option', { value: v }, l));
        staffSel.disabled = kindSel.value === 'product';
      };
      kindSel.addEventListener('change', fillRefs);
      fillRefs();
      box.appendChild(h('div', { class: 'add-line' }, kindSel, refSel, qty, price, staffSel,
        h('button', { class: 'small', onClick: async () => {
          if (!refSel.value) return;
          try {
            await rpc('add_sale_item', { p_sale_id: saleId, p_kind: kindSel.value, p_ref: refSel.value, p_qty: Number(qty.value || 1),
              p_unit_price_cents: price.value === '' ? null : toCents(price.value), p_staff_id: kindSel.value === 'product' ? null : (staffSel.value || null) });
            draw();
          } catch (e) { toast(friendlyError(e), 'error'); }
        } }, tx('Add', 'Agregar'))));
    }

    // Totals + payments
    const totals = h('div', { class: 'card' },
      h('div', { class: 'kv' }, h('span', {}, 'Subtotal'), h('span', { class: 'v' }, money(sale.subtotal_cents))),
      h('div', { class: 'kv' }, h('span', {}, tx('Discount', 'Descuento'), sale.discount_code ? ` (${sale.discount_code})` : ''), h('span', { class: 'v' }, '−', money(sale.discount_cents))),
      h('div', { class: 'kv' }, h('span', {}, tx('Product tax', 'Impuesto de productos')), h('span', { class: 'v' }, money(sale.tax_cents))),
      h('div', { class: 'kv total' }, h('span', {}, 'Total'), h('span', { class: 'v' }, money(sale.total_cents))),
      h('div', { class: 'kv' }, h('span', {}, tx('Paid (recorded)', 'Pagado (registrado)')), h('span', { class: 'v' }, money(sale.paid_cents))),
      sale.refunded_cents ? h('div', { class: 'kv neg' }, h('span', {}, tx('Refunded', 'Reembolsado')), h('span', { class: 'v' }, '−', money(sale.refunded_cents))) : null,
      open ? h('div', { class: 'kv total' }, h('span', {}, tx('Balance due', 'Saldo pendiente')), h('span', { class: 'v' }, money(balance))) : null);
    if (open) {
      const discAmt = h('input', { type: 'number', min: '0', step: '0.01', placeholder: tx('Amount $', 'Monto $') });
      const discCode = h('input', { type: 'text', placeholder: tx('or promo code', 'o código promocional') });
      totals.appendChild(h('div', { class: 'add-line' }, discAmt, discCode, h('button', { class: 'ghost small', onClick: async () => {
        try { await rpc('set_sale_discount', { p_sale_id: saleId, p_discount_cents: discAmt.value === '' ? 0 : toCents(discAmt.value), p_code: discCode.value || null }); draw(); } catch (e) { toast(friendlyError(e), 'error'); }
      } }, tx('Apply discount', 'Aplicar descuento'))));
    }

    const payBox = h('div', { class: 'card' }, h('h3', { class: 'section-h', style: { marginTop: 0 } }, tx('Payments', 'Pagos')));
    if (!(payments || []).length) payBox.appendChild(h('p', { class: 'rank-empty' }, tx('No payments recorded.', 'No hay pagos registrados.')));
    for (const p of payments || []) {
      payBox.appendChild(h('div', { class: 'kv' + (p.status === 'voided' ? ' voided' : '') },
        h('span', {}, METHOD_TEXT[p.method], p.kind === 'deposit' ? ` · ${tx('deposit', 'anticipo')}` : '', p.reference ? ` · ref ${p.reference}` : '',
          h('small', { class: 'sub' }, ' ', prettyDateTime(p.received_at)), p.status === 'voided' ? h('small', { class: 'sub' }, ` · ${tx('voided', 'anulado')}: ${p.void_reason}`) : null),
        h('span', { class: 'v' }, money(p.amount_cents),
          open && p.status === 'recorded' && hasRole('owner') ? h('button', { class: 'ghost small danger-ghost', style: { marginLeft: '8px' }, onClick: () => openForm({
            title: tx('Void payment', 'Anular pago'), intro: tx('The payment stays in history as voided.', 'El pago queda en el historial como anulado.'), danger: true, submitLabel: tx('Void payment', 'Anular pago'),
            fields: [{ name: 'reason', label: tx('Reason', 'Motivo'), required: true, full: true }],
            onSubmit: async (v) => { await rpc('void_payment', { p_payment_id: p.id, p_reason: v.reason }); draw(); },
          }) }, tx('Void', 'Anular')) : null)));
    }
    if (open && balance > 0) {
      const method = h('select', { 'aria-label': tx('Payment method', 'Forma de pago') }, PAYMENT_METHODS.map((k) => h('option', { value: k }, METHOD_TEXT[k])));
      const amount = h('input', { type: 'number', min: '0.01', step: '0.01', value: (balance / 100).toFixed(2), 'aria-label': tx('Amount', 'Monto') });
      const ref = h('input', { type: 'text', maxlength: '80', placeholder: tx('Receipt / transaction # (required unless cash)', 'Núm. de recibo / transacción (obligatorio salvo efectivo)') });
      const btn = h('button', { class: 'small', onClick: async () => {
        btn.disabled = true;
        try {
          await rpc('record_payment', { p_sale_id: saleId, p_method: method.value, p_amount_cents: toCents(amount.value), p_reference: ref.value || null, p_idempotency_key: paymentKey });
          paymentKey = newKey();
          toast(tx('Payment recorded', 'Pago registrado'));
          draw();
        } catch (e) {
          btn.disabled = false;
          toast(e.code === '23514' && !/card/i.test(e.message)
            ? tx('Add the receipt or transaction number as evidence (required for non-cash payments).', 'Agrega el número de recibo o transacción como comprobante (obligatorio si no es efectivo).')
            : friendlyError(e), 'error');
        }
      } }, tx('Record payment', 'Registrar pago'));
      payBox.appendChild(h('div', { class: 'pay-form' }, method, amount, ref, btn));
      payBox.appendChild(h('p', { class: 'hint' }, tx('Record money only after you have received it. Never type card numbers here.', 'Registra el dinero solo después de recibirlo. Nunca escribas números de tarjeta aquí.')));
    }
    box.appendChild(h('div', { class: 'grid-2', style: { marginTop: '16px' } }, totals, payBox));

    if ((refunds || []).length) {
      box.appendChild(h('h3', { class: 'section-h' }, tx('Refunds', 'Reembolsos')));
      box.appendChild(dataTable([
        { label: tx('When', 'Cuándo'), render: (r) => prettyDateTime(r.created_at) },
        { label: tx('Reason', 'Motivo'), key: 'reason' },
        { label: tx('Items', 'Artículos'), render: (r) => String((r.refund_items || []).length) },
        { label: tx('Method', 'Forma'), render: (r) => (r.method ? METHOD_TEXT[r.method] : '—') },
        { label: tx('Amount', 'Monto'), num: true, render: (r) => money(r.amount_cents) },
      ], refunds));
    }

    // Actions
    const actions = [];
    if (open) {
      actions.push(h('button', { class: 'ok', disabled: balance > 0 || !(items || []).length, title: balance > 0 ? tx('Record the full payment first', 'Registra el pago completo primero') : null,
        onClick: async () => {
          try { await rpc('complete_sale', { p_sale_id: saleId }); toast(tx('Sale completed', 'Venta completada')); draw(); } catch (e) { toast(friendlyError(e), 'error'); }
        } }, balance > 0 ? tx(`Complete (${money(balance)} due)`, `Completar (faltan ${money(balance)})`) : tx('Complete sale', 'Completar venta')));
      actions.push(h('button', { class: 'ghost danger-ghost', onClick: () => openForm({
        title: tx('Void sale', 'Anular venta'),
        intro: tx("Voided sales stay in history. Sales with recorded payments can't be voided until the owner voids those payments.", 'Las ventas anuladas quedan en el historial. Si tiene pagos registrados, la propietaria debe anularlos primero.'),
        danger: true, submitLabel: tx('Void sale', 'Anular venta'), fields: [{ name: 'reason', label: tx('Reason', 'Motivo'), required: true, full: true }],
        onSubmit: async (v) => { await rpc('void_sale', { p_sale_id: saleId, p_reason: v.reason }); draw(); },
      }) }, tx('Void sale', 'Anular venta')));
    }
    if (sale.status === 'completed' && hasRole('owner') && sale.refunded_cents < sale.paid_cents) {
      actions.push(h('button', { class: 'ghost', onClick: () => refundForm(sale, items || [], refundedQty, draw) }, tx('Refund / return', 'Reembolso / devolución')));
    }
    if (actions.length) box.appendChild(h('div', { class: 'btn-row', style: { marginTop: '16px', justifyContent: 'flex-end' } }, actions));
  }
  draw();
}

function refundForm(sale, items, refundedQty, after) {
  const left = sale.paid_cents - sale.refunded_cents;
  const fields = [];
  for (const i of items) {
    const remaining = Number(i.qty) - (refundedQty[i.id] || 0);
    if (remaining <= 0) continue;
    fields.push({ name: 'qty_' + i.id, label: tx(`Return: ${lineLabel(i)} (max ${remaining})`, `Devolver: ${lineLabel(i)} (máx. ${remaining})`), type: 'number', min: 0, max: remaining, value: 0 });
    if (i.kind === 'product') fields.push({ name: 'restock_' + i.id, label: tx(`Put ${lineLabel(i)} back in stock (not damaged)`, `Regresar ${lineLabel(i)} al inventario (no está dañado)`), type: 'checkbox', value: true });
  }
  fields.push(
    { name: 'amount', label: tx(`Money back (max ${money(left)})`, `Dinero a devolver (máx. ${money(left)})`), type: 'money', value: 0 },
    { name: 'method', label: tx('Refunded via', 'Devuelto por'), type: 'select', value: 'cash', options: REFUND_METHODS.map((v) => ({ value: v, label: METHOD_TEXT[v] })) },
    { name: 'reference', label: tx('Reference (optional)', 'Referencia (opcional)'), hint: tx('Terminal refund receipt #, never a card number.', 'Núm. de recibo del reembolso; nunca un número de tarjeta.') },
    { name: 'reason', label: tx('Reason', 'Motivo'), required: true, full: true },
  );
  const key = newKey();
  openForm({
    title: tx(`Refund sale #${sale.number}`, `Reembolsar venta #${sale.number}`),
    intro: tx("Returned products can go back into stock. Services and materials already used are not restocked. Money back can't exceed what was paid.",
      'Los productos devueltos pueden regresar al inventario. Los servicios y materiales ya usados no. El dinero devuelto no puede superar lo pagado.'),
    fields, submitLabel: tx('Issue refund', 'Registrar reembolso'), danger: true, wide: true,
    onSubmit: async (v) => {
      const lines = items.filter((i) => Number(v['qty_' + i.id]) > 0)
        .map((i) => ({ sale_item_id: i.id, qty: Number(v['qty_' + i.id]), restock: i.kind === 'product' ? !!v['restock_' + i.id] : false }));
      await rpc('refund_sale', { p_sale_id: sale.id, p_items: lines, p_amount_cents: v.amount || 0, p_method: (v.amount || 0) > 0 ? v.method : null,
        p_reference: v.reference, p_reason: v.reason, p_idempotency_key: key });
      toast(tx('Refund recorded', 'Reembolso registrado'));
      after();
    },
  });
}

async function renderSales(panel) {
  const today = salonDateKey();
  let q = supabaseClient.from('sales').select('*, clients(full_name)').order('created_at', { ascending: false }).limit(200);
  if (salesFilter === 'open') q = q.eq('status', 'open');
  else if (salesFilter === 'today') q = q.gte('created_at', new Date(Date.now() - 36 * 3600e3).toISOString());
  else if (salesFilter === 'week') q = q.gte('created_at', new Date(Date.now() - 8 * 86400e3).toISOString());
  if (!showDemo()) q = q.eq('is_demo', false);
  const { data, error } = await q;
  clear(panel);
  panel.appendChild(panelHead(tx('Checkout & sales', 'Cobro y ventas'),
    tx('Money is taken at the salon and recorded here. A sale is paid only when recorded payments cover it. Deposits are payments on the same sale.',
      'El dinero se cobra en el salón y se registra aquí. Una venta solo está pagada cuando los pagos registrados la cubren. Los anticipos son pagos de la misma venta.'),
    h('button', { onClick: newSale }, tx('+ New sale', '+ Nueva venta'))));
  panel.appendChild(filterRow(salesFilter, [['today', 'Today', 'Hoy'], ['open', 'Open (incl. deposits)', 'Abiertas (con anticipos)'], ['week', 'Last 7 days', 'Últimos 7 días'], ['all', 'Recent 200', 'Últimas 200']],
    (k) => { salesFilter = k; refreshSection(); }));
  if (error) { panel.appendChild(h('p', { class: 'error' }, friendlyError(error))); return; }
  let rows = data || [];
  if (salesFilter === 'today') rows = rows.filter((s) => (s.completed_at ? salonDateKey(new Date(s.completed_at)) : salonDateKey(new Date(s.created_at))) === today || s.status === 'open');
  panel.appendChild(dataTable([
    { label: '#', render: (s) => h('span', {}, String(s.number), ' ', demoBadge(s)) },
    { label: tx('When', 'Cuándo'), render: (s) => prettyDateTime(s.completed_at || s.created_at) },
    { label: tx('Client', 'Clienta'), render: (s) => s.clients?.full_name ?? '—' },
    { label: tx('Status', 'Estado'), render: (s) => pill(s.status, SALE_STATUS[s.status]) },
    { label: 'Total', num: true, render: (s) => money(s.total_cents) },
    { label: tx('Paid', 'Pagado'), num: true, render: (s) => money(s.paid_cents - s.refunded_cents) },
    { label: tx('Due', 'Pendiente'), num: true, render: (s) => (s.status === 'open' ? money(s.total_cents - s.paid_cents) : '—') },
  ], rows, { empty: salesFilter === 'today' ? tx('No sales yet today.', 'Todavía no hay ventas hoy.') : tx('No sales in this view.', 'No hay ventas en esta vista.'), onRow: (s) => openSaleModal(s.id) }));
}

registerModule('sales', { label: ['Checkout & sales', 'Cobro y ventas'], group: GROUPS.daily, roles: ['owner', 'reception'], render: renderSales });
Admin.openCheckout = openCheckout;
Admin.openSaleModal = openSaleModal;
Admin.METHOD_TEXT = METHOD_TEXT;

// Purchases on the client detail.
(Admin.clientDetailSections ||= []).push(async (body, client) => {
  if (!hasRole('owner', 'reception')) return;
  const { data } = await supabaseClient.from('sales').select('id, number, status, total_cents, completed_at, created_at')
    .eq('client_id', client.id).neq('status', 'voided').order('created_at', { ascending: false }).limit(30);
  body.appendChild(h('h3', { class: 'section-h' }, tx('Purchases', 'Compras')));
  body.appendChild(dataTable([
    { label: '#', key: 'number' },
    { label: tx('When', 'Cuándo'), render: (s) => prettyDateTime(s.completed_at || s.created_at) },
    { label: tx('Status', 'Estado'), render: (s) => pill(s.status, SALE_STATUS[s.status]) },
    { label: 'Total', num: true, render: (s) => money(s.total_cents) },
  ], data || [], { empty: tx('No purchases yet.', 'Todavía no tiene compras.'), onRow: (s) => openSaleModal(s.id) }));
});
