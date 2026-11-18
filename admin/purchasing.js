// Suppliers & purchase orders. Drafts are editable; once placed an order is locked, and stock
// comes in only by receiving it. Each receipt is recorded once (retry-safe) and can never exceed
// what was ordered. Received cost updates each item's average cost.
/* global Admin, h, clear, tx, biMap, money, toCents, prettyDate, prettyDateTime, formatPhone, waHref, pill,
   demoBadge, friendlyError, toast, openForm, panelHead, dataTable, filterRow, registerModule,
   showDemo, newKey, supabaseClient, refreshSection, GROUPS */

const PO_STATUS = biMap({
  draft: ['Draft', 'Borrador'], ordered: ['Ordered', 'Pedida'], partially_received: ['Partly received', 'Recibida en parte'],
  received: ['Received', 'Recibida'], cancelled: ['Cancelled', 'Cancelada'],
});
let purchTab = 'orders';

function supplierForm(existing) {
  openForm({
    title: existing ? tx('Edit supplier', 'Editar proveedor') : tx('New supplier', 'Nuevo proveedor'),
    fields: [
      { name: 'name', label: tx('Company', 'Empresa'), required: true, full: true, value: existing?.name },
      { name: 'contact_name', label: tx('Contact person', 'Persona de contacto'), value: existing?.contact_name },
      { name: 'phone', label: tx('Phone', 'Teléfono'), type: 'tel', value: existing ? formatPhone(existing.phone) : '' },
      { name: 'email', label: tx('Email', 'Correo'), type: 'email', value: existing?.email },
      { name: 'website', label: tx('Website', 'Sitio web'), value: existing?.website },
      { name: 'notes', label: tx('Notes (account #, delivery days…)', 'Notas (núm. de cuenta, días de entrega…)'), type: 'textarea', full: true, value: existing?.notes },
      ...(existing ? [{ name: 'active', label: tx('Active', 'Activo'), type: 'checkbox', value: existing.active }] : []),
    ],
    onSubmit: async (v) => {
      const payload = { name: v.name, contact_name: v.contact_name, phone: v.phone, email: v.email, website: v.website, notes: v.notes };
      if (existing) payload.active = v.active;
      const { error } = existing
        ? await supabaseClient.from('suppliers').update(payload).eq('id', existing.id)
        : await supabaseClient.from('suppliers').insert(payload);
      if (error) throw error;
      toast(tx('Supplier saved', 'Proveedor guardado'));
      refreshSection();
    },
  });
}

async function newOrder(prefillItems) {
  const { data: suppliers } = await supabaseClient.from('suppliers').select('id, name').eq('active', true).order('name');
  if (!(suppliers || []).length) return toast(tx('Add a supplier first.', 'Agrega un proveedor primero.'), 'error');
  openForm({
    title: tx('New purchase order', 'Nueva orden de compra'),
    fields: [
      { name: 'supplier_id', label: tx('Supplier', 'Proveedor'), type: 'select', required: true, full: true, options: suppliers.map((s) => ({ value: s.id, label: s.name })) },
      { name: 'expected_on', label: tx('Expected delivery', 'Entrega esperada'), type: 'date' },
      { name: 'notes', label: tx('Notes', 'Notas'), type: 'textarea', full: true },
    ],
    submitLabel: tx('Create draft', 'Crear borrador'),
    onSubmit: async (v) => {
      const { data, error } = await supabaseClient.from('purchase_orders').insert({ supplier_id: v.supplier_id, expected_on: v.expected_on, notes: v.notes }).select('id').single();
      if (error) throw error;
      if (prefillItems?.length) {
        const { error: e2 } = await supabaseClient.from('purchase_order_items').insert(prefillItems.map((i) => ({ po_id: data.id, item_id: i.id, qty_ordered: i.qty, unit_cost_cents: i.cost_cents })));
        if (e2) throw e2;
      }
      setTimeout(() => openOrder(data.id), 0);
    },
  });
}

async function openOrder(poId) {
  const overlay = h('div', { class: 'modal-overlay' });
  const box = h('div', { class: 'modal modal-wide' });
  overlay.appendChild(box);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) { overlay.remove(); refreshSection(); } });
  document.body.appendChild(overlay);
  let receiveKey = newKey();

  async function draw() {
    const [{ data: po, error }, { data: lines }, { data: receipts }, { data: items }] = await Promise.all([
      supabaseClient.from('purchase_orders').select('*, suppliers(name, phone, email)').eq('id', poId).single(),
      supabaseClient.from('purchase_order_items').select('*, inventory_items(name, unit)').eq('po_id', poId),
      supabaseClient.from('purchase_receipts').select('*, purchase_receipt_items(qty, po_item_id)').eq('po_id', poId).order('received_at'),
      supabaseClient.from('inventory_items').select('id, name, unit, cost_cents').eq('active', true).order('name'),
    ]);
    clear(box);
    if (error) { box.appendChild(h('p', { class: 'error' }, friendlyError(error))); return; }
    const draft = po.status === 'draft';
    const receivable = po.status === 'ordered' || po.status === 'partially_received';
    const total = (lines || []).reduce((s, l) => s + Math.round(Number(l.qty_ordered) * l.unit_cost_cents), 0);
    box.appendChild(h('div', { class: 'modal-title-row' },
      h('h2', {}, `${tx('PO', 'OC')} #${po.number} `, pill(po.status, PO_STATUS[po.status]), ' ', demoBadge(po)),
      h('button', { class: 'ghost small', onClick: () => { overlay.remove(); refreshSection(); } }, tx('Close', 'Cerrar'))));
    const wa = waHref(po.suppliers?.phone);
    box.appendChild(h('p', { class: 'panel-sub' }, po.suppliers?.name, po.expected_on ? ` · ${tx('expected', 'llega')} ${prettyDate(po.expected_on)}` : '',
      po.ordered_at ? ` · ${tx('ordered', 'pedida')} ${prettyDateTime(po.ordered_at)}` : '', ' ', wa ? h('a', { href: wa, target: '_blank', rel: 'noopener' }, tx('💬 WhatsApp supplier', '💬 WhatsApp al proveedor')) : null));
    if (po.cancel_reason) box.appendChild(h('div', { class: 'notice' }, po.cancel_reason));

    box.appendChild(dataTable([
      { label: tx('Item', 'Artículo'), render: (l) => l.inventory_items?.name ?? '—' },
      { label: tx('Ordered', 'Pedido'), num: true, render: (l) => `${Number(l.qty_ordered)} ${l.inventory_items?.unit ?? ''}` },
      { label: tx('Received', 'Recibido'), num: true, render: (l) => String(Number(l.qty_received)) },
      { label: tx('Unit cost', 'Costo unitario'), num: true, render: (l) => money(l.unit_cost_cents) },
      { label: tx('Line total', 'Total de línea'), num: true, render: (l) => money(Math.round(Number(l.qty_ordered) * l.unit_cost_cents)) },
      ...(draft ? [{ label: '', render: (l) => h('button', { class: 'ghost small danger-ghost', onClick: async () => {
        const { error: e } = await supabaseClient.from('purchase_order_items').delete().eq('id', l.id);
        if (e) toast(friendlyError(e), 'error'); else draw();
      } }, tx('Remove', 'Quitar')) }] : []),
    ], lines || [], { empty: tx('No lines yet.', 'Todavía no hay líneas.') }));
    box.appendChild(h('div', { class: 'kv total' }, h('span', {}, tx('Order total', 'Total de la orden')), h('span', { class: 'v' }, money(total))));

    if (draft) {
      const itemSel = h('select', {}, (items || []).map((i) => h('option', { value: i.id, dataset: { cost: i.cost_cents } }, i.name)));
      const qty = h('input', { type: 'number', min: '0.001', step: '0.001', placeholder: tx('Qty', 'Cant.') });
      const cost = h('input', { type: 'number', min: '0', step: '0.01', placeholder: tx('Unit cost $', 'Costo unitario $') });
      itemSel.addEventListener('change', () => { cost.value = (Number(itemSel.selectedOptions[0]?.dataset.cost || 0) / 100).toFixed(2); });
      itemSel.dispatchEvent(new Event('change'));
      box.appendChild(h('div', { class: 'add-line' }, itemSel, qty, cost, h('button', { class: 'small', onClick: async () => {
        if (!itemSel.value || !(Number(qty.value) > 0)) return toast(tx('Choose an item and a quantity.', 'Elige un artículo y una cantidad.'), 'error');
        const { error: e } = await supabaseClient.from('purchase_order_items').insert({ po_id: poId, item_id: itemSel.value, qty_ordered: Number(qty.value), unit_cost_cents: toCents(cost.value || 0) });
        if (e) toast(e.code === '23505' ? tx('That item is already on this order.', 'Ese artículo ya está en esta orden.') : friendlyError(e), 'error'); else draw();
      } }, tx('Add line', 'Agregar línea'))));
      if (!(items || []).length) box.appendChild(h('p', { class: 'hint' }, tx('Add items in Inventory first.', 'Primero agrega artículos en Inventario.')));
    }

    if ((receipts || []).length) {
      box.appendChild(h('h3', { class: 'section-h' }, tx('Deliveries received', 'Entregas recibidas')));
      box.appendChild(dataTable([
        { label: tx('When', 'Cuándo'), render: (r) => prettyDateTime(r.received_at) },
        { label: tx('Lines', 'Líneas'), num: true, render: (r) => String((r.purchase_receipt_items || []).length) },
        { label: tx('Note', 'Nota'), render: (r) => r.note || '—' },
      ], receipts));
    }

    const actions = [];
    if (draft) {
      actions.push(h('button', { onClick: async () => {
        const { error: e } = await supabaseClient.rpc('place_purchase_order', { p_po_id: poId });
        if (e) toast(friendlyError(e), 'error'); else { toast(tx('Order placed', 'Orden enviada')); draw(); }
      } }, tx('Place order', 'Enviar orden')));
    }
    if (receivable) {
      actions.push(h('button', { class: 'ok', onClick: () => {
        const open = (lines || []).filter((l) => Number(l.qty_received) < Number(l.qty_ordered));
        openForm({
          title: tx(`Receive delivery · PO #${po.number}`, `Recibir entrega · OC #${po.number}`),
          intro: tx('Enter what actually arrived. Stock is added once per delivery; you can receive the rest later.', 'Escribe lo que realmente llegó. El inventario se suma una vez por entrega; el resto se puede recibir después.'),
          fields: open.map((l) => {
            const left = Number(l.qty_ordered) - Number(l.qty_received);
            return { name: l.id, label: tx(`${l.inventory_items?.name} (up to ${left})`, `${l.inventory_items?.name} (hasta ${left})`), type: 'number', min: 0, max: left, step: '0.001', value: left };
          }).concat([{ name: '__note', label: tx('Note (invoice #, condition…)', 'Nota (núm. de factura, estado…)'), full: true }]),
          submitLabel: tx('Receive', 'Recibir'),
          onSubmit: async (v) => {
            const payload = open.map((l) => ({ po_item_id: l.id, qty: Number(v[l.id] || 0) })).filter((x) => x.qty > 0);
            const { error: e } = await supabaseClient.rpc('receive_purchase', { p_po_id: poId, p_lines: payload, p_note: v.__note, p_idempotency_key: receiveKey });
            if (e) throw e;
            receiveKey = newKey();
            toast(tx('Delivery received; stock updated', 'Entrega recibida; inventario actualizado'));
            draw();
          },
        });
      } }, tx('Receive delivery', 'Recibir entrega')));
    }
    if (po.status === 'partially_received') {
      actions.push(h('button', { class: 'ghost', onClick: () => openForm({
        title: tx('Close order', 'Cerrar orden'), intro: tx('Use when the rest will never arrive. What was received stays in stock.', 'Úsalo cuando el resto ya no va a llegar. Lo recibido se queda en inventario.'),
        fields: [{ name: 'reason', label: tx('Reason', 'Motivo'), required: true, full: true }], submitLabel: tx('Close order', 'Cerrar orden'),
        onSubmit: async (v) => { const { error: e } = await supabaseClient.rpc('close_purchase_order', { p_po_id: poId, p_reason: v.reason }); if (e) throw e; draw(); },
      }) }, tx("Close (rest won't arrive)", 'Cerrar (el resto no llegará)')));
    }
    if (draft || po.status === 'ordered') {
      actions.push(h('button', { class: 'ghost danger-ghost', onClick: () => openForm({
        title: tx('Cancel order', 'Cancelar orden'), intro: tx('The order stays in history as cancelled.', 'La orden queda en el historial como cancelada.'), danger: true,
        fields: [{ name: 'reason', label: tx('Reason', 'Motivo'), required: true, full: true }], submitLabel: tx('Cancel order', 'Cancelar orden'),
        onSubmit: async (v) => { const { error: e } = await supabaseClient.rpc('cancel_purchase_order', { p_po_id: poId, p_reason: v.reason }); if (e) throw e; draw(); },
      }) }, tx('Cancel order', 'Cancelar orden')));
    }
    if (actions.length) box.appendChild(h('div', { class: 'btn-row', style: { marginTop: '16px', justifyContent: 'flex-end' } }, actions));
  }
  draw();
}

async function renderPurchasing(panel) {
  clear(panel);
  panel.appendChild(panelHead(tx('Suppliers & purchasing', 'Proveedores y compras'), tx('Place orders with suppliers and receive deliveries into inventory.', 'Haz pedidos a proveedores y recibe las entregas en el inventario.'),
    h('button', { class: 'ghost', onClick: () => supplierForm(null) }, tx('+ Supplier', '+ Proveedor')),
    h('button', { onClick: () => newOrder() }, tx('+ Purchase order', '+ Orden de compra'))));
  panel.appendChild(filterRow(purchTab, [['orders', 'Purchase orders', 'Órdenes de compra'], ['suppliers', 'Suppliers', 'Proveedores'], ['reorder', 'Reorder suggestions', 'Sugerencias de pedido']],
    (k) => { purchTab = k; refreshSection(); }));

  if (purchTab === 'suppliers') {
    let q = supabaseClient.from('suppliers').select('*').order('active', { ascending: false }).order('name');
    if (!showDemo()) q = q.eq('is_demo', false);
    const { data, error } = await q;
    if (error) return panel.appendChild(h('p', { class: 'error' }, friendlyError(error)));
    panel.appendChild(dataTable([
      { label: tx('Supplier', 'Proveedor'), render: (s) => h('span', {}, s.name, ' ', demoBadge(s), s.active ? null : pill('cancelled', tx('Inactive', 'Inactivo'))) },
      { label: tx('Contact', 'Contacto'), render: (s) => s.contact_name || '—' },
      { label: tx('Phone', 'Teléfono'), render: (s) => (s.phone ? formatPhone(s.phone) : '—') },
      { label: tx('Email', 'Correo'), render: (s) => s.email || '—' },
    ], data || [], { empty: tx('No suppliers yet.', 'Todavía no hay proveedores.'), onRow: supplierForm }));
    return;
  }

  if (purchTab === 'reorder') {
    const [{ data: items }, { data: levels }] = await Promise.all([
      supabaseClient.from('inventory_items').select('*').eq('active', true).order('name'),
      supabaseClient.from('inventory_levels').select('*'),
    ]);
    const lvl = Object.fromEntries((levels || []).map((l) => [l.item_id, l]));
    const low = (items || []).filter((i) => lvl[i.id]?.needs_reorder && Number(i.reorder_level) > 0);
    panel.appendChild(h('p', { class: 'panel-sub', style: { marginBottom: '10px' } },
      tx('Items at or below their reorder level (set a reorder level on an item in Inventory to include it).', 'Artículos en o por debajo de su nivel para volver a pedir (configúralo en cada artículo del Inventario).')));
    panel.appendChild(dataTable([
      { label: tx('Item', 'Artículo'), key: 'name' },
      { label: tx('On hand', 'Existencia'), num: true, render: (i) => String(Number(lvl[i.id]?.on_hand ?? 0)) },
      { label: tx('Reorder at', 'Pedir al llegar a'), num: true, render: (i) => String(Number(i.reorder_level)) },
      { label: tx('Last cost', 'Último costo'), num: true, render: (i) => money(i.cost_cents) },
    ], low, { empty: tx('Nothing needs reordering right now.', 'No hay nada por pedir ahora.') }));
    if (low.length) {
      panel.appendChild(h('div', { class: 'btn-row', style: { marginTop: '12px' } }, h('button', { onClick: () => newOrder(low.map((i) => ({
        id: i.id, cost_cents: i.cost_cents, qty: Math.max(1, Math.ceil(Number(i.reorder_level) * 2 - Number(lvl[i.id]?.on_hand ?? 0))),
      }))) }, tx('Draft an order with these', 'Crear un borrador con estos'))));
    }
    return;
  }

  let q = supabaseClient.from('purchase_orders').select('*, suppliers(name)').order('created_at', { ascending: false }).limit(100);
  if (!showDemo()) q = q.eq('is_demo', false);
  const [{ data, error }, { data: totals }] = await Promise.all([q, supabaseClient.from('purchase_order_totals').select('*')]);
  if (error) return panel.appendChild(h('p', { class: 'error' }, friendlyError(error)));
  const tot = Object.fromEntries((totals || []).map((t) => [t.po_id, t]));
  panel.appendChild(dataTable([
    { label: tx('PO', 'OC'), render: (p) => h('span', {}, `#${p.number}`, ' ', demoBadge(p)) },
    { label: tx('Supplier', 'Proveedor'), render: (p) => p.suppliers?.name ?? '—' },
    { label: tx('Status', 'Estado'), render: (p) => pill(p.status, PO_STATUS[p.status]) },
    { label: tx('Expected', 'Llega'), render: (p) => (p.expected_on ? prettyDate(p.expected_on) : '—') },
    { label: 'Total', num: true, render: (p) => money(tot[p.id]?.ordered_cents ?? 0) },
    { label: tx('Received', 'Recibido'), num: true, render: (p) => money(tot[p.id]?.received_cents ?? 0) },
  ], data || [], { empty: tx('No purchase orders yet.', 'Todavía no hay órdenes de compra.'), onRow: (p) => openOrder(p.id) }));
}

registerModule('purchasing', { label: ['Purchasing', 'Compras'], group: GROUPS.business, roles: ['owner', 'reception'], render: renderPurchasing });
