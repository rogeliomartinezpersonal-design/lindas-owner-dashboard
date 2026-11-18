// Shop orders: documented limitation. The mobile app's shop (app/shop.tsx) has no cart or checkout.
// Each product's button opens a WhatsApp chat with the salon, so no orders ever reach the
// database. Building order/reservation tables with nothing to feed them would only be fake UI.
// This page shows what IS real: stock of the products the app lists, and how to sell them.
/* global Admin, h, clear, tx, money, panelHead, dataTable, registerModule, supabaseClient, showSection, GROUPS */

async function renderShop(panel) {
  const [{ data: items }, { data: levels }] = await Promise.all([
    supabaseClient.from('inventory_items').select('id, name, price_cents, product_key, active').not('product_key', 'is', null).order('name'),
    supabaseClient.from('inventory_levels').select('*'),
  ]);
  const lvl = Object.fromEntries((levels || []).map((l) => [l.item_id, l]));
  clear(panel);
  panel.appendChild(panelHead(tx('Shop orders', 'Pedidos de la tienda'), tx('Products clients ask about from the app.', 'Productos por los que preguntan las clientas desde la app.'),
    h('button', { onClick: () => showSection('sales') }, tx('Sell a product', 'Vender un producto'))));
  panel.appendChild(h('div', { class: 'notice' },
    h('strong', {}, tx('The app has no online checkout, so there are no shop orders to manage yet.', 'La app no tiene pago en línea, así que todavía no hay pedidos que administrar.')),
    tx("In the app, each product's button opens a WhatsApp chat with the salon. When a client orders that way, ring it up in Checkout & sales: stock moves when the sale is completed, and the payment is recorded with its receipt number.",
      'En la app, el botón de cada producto abre un chat de WhatsApp con el salón. Cuando una clienta pide así, regístralo en Cobro y ventas: el inventario se descuenta al completar la venta y el pago se registra con su número de recibo.')));
  panel.appendChild(h('div', { class: 'notice info' },
    h('strong', {}, tx('What a real online shop would need (not built)', 'Lo que necesitaría una tienda en línea real (no está hecha)')),
    tx("A payment provider account in the owner's name (e.g. Stripe), an app update with a cart and checkout, and an orders table where payment status is separate from preparation/pickup status, with stock reserved on order and released if cancelled. The owner has chosen not to take online payments for now.",
      'Una cuenta de pagos a nombre de la propietaria (p. ej. Stripe), una actualización de la app con carrito y pago, y pedidos con el estado de pago separado del de preparación/entrega, apartando inventario al pedir y liberándolo si se cancela. Por ahora la propietaria decidió no cobrar en línea.')));
  panel.appendChild(h('h3', { class: 'section-h' }, tx('App products in stock', 'Productos de la app en existencia')));
  panel.appendChild(dataTable([
    { label: tx('Product', 'Producto'), key: 'name' },
    { label: tx('Price', 'Precio'), num: true, render: (i) => money(i.price_cents) },
    { label: tx('On hand', 'Existencia'), num: true, render: (i) => String(Number(lvl[i.id]?.on_hand ?? 0)) },
    { label: tx('Status', 'Estado'), render: (i) => (!i.active ? tx('Inactive', 'Inactivo') : Number(lvl[i.id]?.on_hand ?? 0) > 0 ? tx('Available', 'Disponible') : tx('Out of stock', 'Agotado')) },
  ], items || [], { empty: tx('The app\'s products aren\'t in inventory yet. Use "Import app products" in Inventory.', 'Los productos de la app todavía no están en el inventario. Usa "Importar productos de la app" en Inventario.') }));
}

registerModule('shop', { label: ['Shop orders', 'Pedidos de la tienda'], group: GROUPS.business, roles: ['owner', 'reception'], render: renderShop });
