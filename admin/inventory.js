// Inventory: retail products and service materials. Stock is a ledger in the database, so the
// on-hand number is always the sum of real movements (opening, receipts, sales, returns,
// materials used, counted adjustments). Adjustments always need a reason and are audited.
/* global Admin, h, clear, tx, biMap, money, prettyDateTime, demoBadge, friendlyError, toast,
   openForm, panelHead, dataTable, filterRow, registerModule, hasRole, showDemo, supabaseClient,
   refreshSection, serviceLabel, GROUPS */

// The app's shop list (lib/content.ts PRODUCTS): real products and prices, offered as a one-click
// import. Stock and cost start at 0 for the owner to fill in; nothing is made up.
const APP_PRODUCTS = [
  { key: 'p_topcoat', name: ['Sealing Top Coat', 'Top Coat Sellador'], price: 1400 },
  { key: 'p_pink', name: ['Gel Polish — Cameo Pink', 'Esmalte en Gel — Rosa Cameo'], price: 1600 },
  { key: 'p_trio', name: ['Mini Polish Set (x3)', 'Set Mini de Esmaltes (x3)'], price: 2200 },
  { key: 'p_glitter', name: ['Glitter Top Coat', 'Top Coat Glitter'], price: 1500 },
  { key: 'p_blue', name: ['Gel Polish — Crystal Blue', 'Esmalte en Gel — Azul Cristal'], price: 1600 },
  { key: 'p_oil', name: ['Cuticle Oil', 'Aceite para Cutícula'], price: 1200 },
];
const REASON_TEXT = biMap({
  opening: ['Opening stock', 'Inventario inicial'], purchase_receipt: ['Purchase received', 'Compra recibida'], sale: ['Sold', 'Vendido'],
  sale_return: ['Returned', 'Devuelto'], service_use: ['Used in service', 'Usado en servicio'], service_use_reversal: ['Service use reversed', 'Uso en servicio revertido'],
  adjustment: ['Adjustment / count', 'Ajuste / conteo'],
});
let invKind = 'all';

const qtyFmt = (n) => String(Number(n));

function itemForm(existing) {
  openForm({
    title: existing ? tx('Edit item', 'Editar artículo') : tx('New inventory item', 'Nuevo artículo de inventario'),
    fields: [
      { name: 'name', label: tx('Name', 'Nombre'), required: true, full: true, value: existing?.name },
      { name: 'kind', label: tx('Type', 'Tipo'), type: 'select', value: existing?.kind || 'retail',
        options: [{ value: 'retail', label: tx('Retail product (sold to clients)', 'Producto de venta (para clientas)') }, { value: 'material', label: tx('Material (used in services)', 'Material (se usa en servicios)') }] },
      { name: 'sku', label: tx('SKU (optional)', 'SKU (opcional)'), value: existing?.sku },
      { name: 'unit', label: tx('Unit', 'Unidad'), value: existing?.unit || tx('unit', 'pieza'), hint: tx('e.g. unit, bottle, box, ml', 'p. ej. pieza, frasco, caja, ml') },
      { name: 'cost_cents', label: tx('Unit cost', 'Costo unitario'), type: 'money', value: existing?.cost_cents ?? 0, hint: tx('Updated automatically when purchases are received.', 'Se actualiza solo al recibir compras.') },
      { name: 'price_cents', label: tx('Selling price (retail)', 'Precio de venta (productos)'), type: 'money', value: existing?.price_cents },
      { name: 'reorder_level', label: tx('Reorder when at or below', 'Volver a pedir al llegar a'), type: 'number', min: 0, step: '0.001', value: existing ? Number(existing.reorder_level) : 0 },
      { name: 'product_key', label: tx('Matches app product', 'Corresponde al producto de la app'), type: 'select', value: existing?.product_key || '',
        options: [{ value: '', label: tx('— none —', '— ninguno —') }].concat(APP_PRODUCTS.map((p) => ({ value: p.key, label: tx(p.name[0], p.name[1]) }))) },
      ...(existing ? [{ name: 'active', label: tx('Active', 'Activo'), type: 'checkbox', value: existing.active }]
        : [{ name: 'opening', label: tx('Opening stock (counted now)', 'Inventario inicial (contado ahora)'), type: 'number', min: 0, step: '0.001', value: 0 }]),
    ],
    onSubmit: async (v) => {
      const payload = { name: v.name, kind: v.kind, sku: v.sku, unit: v.unit || 'unit', cost_cents: v.cost_cents ?? 0,
        price_cents: v.price_cents, reorder_level: v.reorder_level ?? 0, product_key: v.product_key || null };
      if (payload.kind === 'retail' && (payload.price_cents === null || Number.isNaN(payload.price_cents))) throw new Error(tx('Retail products need a selling price.', 'Los productos de venta necesitan precio.'));
      if (existing) {
        payload.active = v.active;
        const { error } = await supabaseClient.from('inventory_items').update(payload).eq('id', existing.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabaseClient.from('inventory_items').insert(payload).select('id').single();
        if (error) throw error;
        if (v.opening > 0) {
          const { error: e2 } = await supabaseClient.rpc('set_opening_stock', { p_item_id: data.id, p_qty: v.opening });
          if (e2) throw e2;
        }
      }
      toast(tx('Saved', 'Guardado'));
      refreshSection();
    },
  });
}

function countForm(item, onHand) {
  openForm({
    title: tx(`Count: ${item.name}`, `Conteo: ${item.name}`),
    intro: tx(`The system shows ${qtyFmt(onHand)} ${item.unit}. Enter what you physically counted; the difference is recorded as an adjustment.`,
      `El sistema indica ${qtyFmt(onHand)} ${item.unit}. Escribe lo que contaste físicamente; la diferencia se registra como ajuste.`),
    fields: [
      { name: 'counted', label: tx('Counted quantity', 'Cantidad contada'), type: 'number', min: 0, step: '0.001', required: true, value: qtyFmt(onHand) },
      { name: 'note', label: tx('Reason / note', 'Motivo / nota'), required: true, value: tx('Physical count', 'Conteo físico'), full: true },
    ],
    onSubmit: async (v) => {
      const { error } = await supabaseClient.rpc('count_stock', { p_item_id: item.id, p_counted: v.counted, p_note: v.note });
      if (error) throw error;
      toast(tx('Count saved', 'Conteo guardado'));
      refreshSection();
    },
  });
}

function adjustForm(item) {
  openForm({
    title: tx(`Adjust: ${item.name}`, `Ajustar: ${item.name}`),
    intro: tx('Use for breakage, samples, theft or corrections. Use a negative number to remove stock.', 'Para roturas, muestras, robo o correcciones. Usa un número negativo para restar.'),
    fields: [
      { name: 'delta', label: tx('Change (+/−)', 'Cambio (+/−)'), type: 'number', step: '0.001', required: true },
      { name: 'note', label: tx('Reason', 'Motivo'), required: true, full: true },
    ],
    onSubmit: async (v) => {
      const { error } = await supabaseClient.rpc('adjust_stock', { p_item_id: item.id, p_delta: v.delta, p_note: v.note });
      if (error) throw error;
      toast(tx('Adjustment recorded', 'Ajuste registrado'));
      refreshSection();
    },
  });
}

async function historyModal(item) {
  const { data } = await supabaseClient.from('stock_movements').select('*').eq('item_id', item.id).order('created_at', { ascending: false }).limit(100);
  const overlay = h('div', { class: 'modal-overlay' });
  overlay.appendChild(h('div', { class: 'modal modal-wide' },
    h('div', { class: 'modal-title-row' }, h('h2', {}, item.name), h('button', { class: 'ghost small', onClick: () => overlay.remove() }, tx('Close', 'Cerrar'))),
    dataTable([
      { label: tx('When', 'Cuándo'), render: (m) => prettyDateTime(m.created_at) },
      { label: tx('What', 'Movimiento'), render: (m) => REASON_TEXT[m.reason] || m.reason },
      { label: tx('Qty', 'Cant.'), num: true, render: (m) => (Number(m.qty) > 0 ? '+' : '') + qtyFmt(m.qty) },
      { label: tx('Note', 'Nota'), render: (m) => m.note || '—' },
    ], data || [], { empty: tx('No movements yet.', 'Todavía no hay movimientos.') })));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

async function importAppProducts(existing) {
  const have = new Set(existing.map((i) => i.product_key).filter(Boolean));
  const missing = APP_PRODUCTS.filter((p) => !have.has(p.key));
  if (!missing.length) return toast(tx('All app products are already in inventory.', 'Todos los productos de la app ya están en el inventario.'));
  const { error } = await supabaseClient.from('inventory_items').insert(missing.map((p) => ({
    name: tx(p.name[0], p.name[1]), kind: 'retail', price_cents: p.price, cost_cents: 0, product_key: p.key,
  })));
  if (error) return toast(friendlyError(error), 'error');
  toast(tx(`Imported ${missing.length} product(s). Count stock and set costs next.`, `Se importaron ${missing.length} producto(s). Ahora cuenta las existencias y pon los costos.`));
  refreshSection();
}

async function renderInventory(panel) {
  let q = supabaseClient.from('inventory_items').select('*').order('name');
  if (!showDemo()) q = q.eq('is_demo', false);
  const [{ data: items, error }, { data: levels }] = await Promise.all([q, supabaseClient.from('inventory_levels').select('*')]);
  clear(panel);
  const owner = hasRole('owner');
  panel.appendChild(panelHead(tx('Inventory', 'Inventario'),
    tx('On-hand quantities are the sum of real stock movements. Counts and adjustments always need a reason.', 'Las existencias son la suma de los movimientos reales. Los conteos y ajustes siempre llevan un motivo.'),
    owner ? h('button', { class: 'ghost', onClick: () => importAppProducts(items || []) }, tx('Import app products', 'Importar productos de la app')) : null,
    owner ? h('button', { onClick: () => itemForm(null) }, tx('+ New item', '+ Nuevo artículo')) : null));
  if (error) { panel.appendChild(h('p', { class: 'error' }, friendlyError(error))); return; }
  const lvl = Object.fromEntries((levels || []).map((l) => [l.item_id, l]));
  const all = items || [];
  const low = all.filter((i) => i.active && lvl[i.id]?.needs_reorder);
  const value = all.filter((i) => i.active).reduce((s, i) => s + Number(lvl[i.id]?.value_cents || 0), 0);
  panel.appendChild(h('div', { class: 'stats-row' },
    h('div', { class: 'stat-tile' }, h('span', { class: 'stat-value' }, String(all.filter((i) => i.active).length)), h('span', { class: 'stat-label' }, tx('Active items', 'Artículos activos'))),
    h('div', { class: 'stat-tile' + (low.length ? ' warn' : '') }, h('span', { class: 'stat-value' }, String(low.length)), h('span', { class: 'stat-label' }, tx('Need reorder', 'Por pedir'))),
    h('div', { class: 'stat-tile' }, h('span', { class: 'stat-value' }, money(Math.round(value))), h('span', { class: 'stat-label' }, tx('Stock value (at cost)', 'Valor del inventario (a costo)'))),
    h('div', { class: 'stat-tile' }, h('span', { class: 'stat-value' }, String(all.filter((i) => i.kind === 'material').length)), h('span', { class: 'stat-label' }, tx('Materials', 'Materiales')))));
  panel.appendChild(filterRow(invKind, [['all', 'All', 'Todos'], ['retail', 'Retail', 'Productos'], ['material', 'Materials', 'Materiales'], ['low', 'Need reorder', 'Por pedir'], ['inactive', 'Inactive', 'Inactivos']],
    (k) => { invKind = k; refreshSection(); }));
  const rows = all.filter((i) => (invKind === 'inactive' ? !i.active : i.active)
    && (invKind === 'all' || invKind === 'inactive' || (invKind === 'low' ? lvl[i.id]?.needs_reorder : i.kind === invKind)));
  if (!all.length) {
    panel.appendChild(h('div', { class: 'empty-state' },
      h('p', {}, tx('No inventory yet.', 'Todavía no hay inventario.')),
      h('p', {}, owner ? tx('Start by importing the products already listed in the app, or add items manually.', 'Empieza importando los productos que ya aparecen en la app, o agrégalos a mano.')
        : tx("The owner hasn't added inventory items yet.", 'La propietaria todavía no ha agregado artículos.'))));
    return;
  }
  panel.appendChild(dataTable([
    { label: tx('Item', 'Artículo'), render: (i) => h('span', {}, i.name, ' ', demoBadge(i), i.sku ? h('small', { class: 'sub' }, ` ${i.sku}`) : null) },
    { label: tx('Type', 'Tipo'), render: (i) => (i.kind === 'retail' ? tx('Retail', 'Producto') : tx('Material', 'Material')) },
    { label: tx('On hand', 'Existencia'), num: true, render: (i) => h('span', {}, `${qtyFmt(lvl[i.id]?.on_hand ?? 0)} ${i.unit}`, lvl[i.id]?.needs_reorder && i.active ? h('span', { class: 'pill pill-warn', style: { marginLeft: '6px' } }, tx('Low', 'Bajo')) : null) },
    { label: tx('Cost', 'Costo'), num: true, render: (i) => money(i.cost_cents) },
    { label: tx('Price', 'Precio'), num: true, render: (i) => (i.price_cents === null ? '—' : money(i.price_cents)) },
    { label: '', render: (i) => h('div', { class: 'btn-row' },
      h('button', { class: 'ghost small', onClick: () => countForm(i, Number(lvl[i.id]?.on_hand ?? 0)) }, tx('Count', 'Contar')),
      h('button', { class: 'ghost small', onClick: () => adjustForm(i) }, tx('Adjust', 'Ajustar')),
      h('button', { class: 'ghost small', onClick: () => historyModal(i) }, tx('History', 'Historial')),
      owner ? h('button', { class: 'ghost small', onClick: () => itemForm(i) }, tx('Edit', 'Editar')) : null) },
  ], rows, { empty: tx('Nothing in this view.', 'No hay nada en esta vista.') }));
}

registerModule('inventory', { label: ['Inventory', 'Inventario'], group: GROUPS.daily, roles: ['owner', 'reception'], render: renderInventory });

// Materials per service, on the Services & prices page.
(Admin.serviceSections ||= []).push(async (panel) => {
  const [{ data: recipes }, { data: materials }] = await Promise.all([
    supabaseClient.from('service_materials').select('*'),
    supabaseClient.from('inventory_items').select('id, name, unit, kind, active').eq('active', true).order('name'),
  ]);
  const items = Object.fromEntries((materials || []).map((m) => [m.id, m]));
  panel.appendChild(h('div', { class: 'panel-head sub-head' },
    h('div', {}, h('h3', { class: 'section-h' }, tx('Materials used per service', 'Materiales que usa cada servicio')),
      h('p', { class: 'panel-sub' }, tx('Deducted from inventory once per completed visit. Checking out the same visit never deducts again.', 'Se descuentan del inventario una vez por cita completada. Cobrar la misma cita no los descuenta otra vez.'))),
    h('button', { class: 'ghost small', onClick: () => openForm({
      title: tx('Add material to a service', 'Agregar material a un servicio'),
      fields: [
        { name: 'service_id', label: tx('Service', 'Servicio'), type: 'select', required: true, options: Admin.services.map((s) => ({ value: s.id, label: serviceLabel(s.id) })) },
        { name: 'item_id', label: tx('Material', 'Material'), type: 'select', required: true,
          options: (materials || []).map((m) => ({ value: m.id, label: `${m.name} (${m.unit})${m.kind === 'retail' ? ' · ' + tx('retail', 'producto') : ''}` })) },
        { name: 'qty', label: tx('Quantity per service', 'Cantidad por servicio'), type: 'number', min: 0.001, step: '0.001', required: true },
      ],
      onSubmit: async (v) => {
        const { error } = await supabaseClient.from('service_materials').upsert({ service_id: v.service_id, item_id: v.item_id, qty: v.qty });
        if (error) throw error;
        toast(tx('Saved', 'Guardado'));
        refreshSection();
      },
    }) }, tx('+ Add material', '+ Agregar material'))));
  panel.appendChild(dataTable([
    { label: tx('Service', 'Servicio'), render: (r) => serviceLabel(r.service_id) },
    { label: tx('Material', 'Material'), render: (r) => items[r.item_id]?.name ?? tx('Inactive item', 'Artículo inactivo') },
    { label: tx('Per service', 'Por servicio'), num: true, render: (r) => `${qtyFmt(r.qty)} ${items[r.item_id]?.unit ?? ''}` },
    { label: '', render: (r) => h('button', { class: 'ghost small danger-ghost', onClick: async () => {
      const { error } = await supabaseClient.from('service_materials').delete().eq('service_id', r.service_id).eq('item_id', r.item_id);
      if (error) return toast(friendlyError(error), 'error');
      refreshSection();
    } }, tx('Remove', 'Quitar')) },
  ], recipes || [], { empty: tx('No materials linked yet. Add inventory items of type "Material" first.', 'Todavía no hay materiales vinculados. Primero agrega artículos de tipo "Material".') }));
});
