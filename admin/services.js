// Services & add-ons as data (owner only). Ids are fixed once created because the mobile app books
// by id. Retire a service by turning off "Active" (or "Bookable in the app"), never by deleting.
// Note: the app's menu and prices come from its own build (lib/content.ts); a change here affects
// the dashboard, checkout and reports immediately, and the app only after content.ts is updated.
/* global Admin, h, clear, tx, money, pill, friendlyError, toast, openForm, panelHead, dataTable,
   registerModule, supabaseClient, refreshSection, loadReference, GROUPS */

Admin.serviceSections = Admin.serviceSections || []; // stage 2 adds materials per service

function slugify(s) { return (s || '').toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40); }

function itemForm(kind, existing) {
  const table = kind === 'service' ? 'services' : 'addons';
  const isService = kind === 'service';
  openForm({
    title: existing ? (isService ? tx('Edit service', 'Editar servicio') : tx('Edit add-on', 'Editar extra'))
      : (isService ? tx('New service', 'Nuevo servicio') : tx('New add-on', 'Nuevo extra')),
    fields: [
      { name: 'name_es', label: tx('Name (Spanish)', 'Nombre (español)'), required: true, value: existing?.name_es },
      { name: 'name_en', label: tx('Name (English)', 'Nombre (inglés)'), required: true, value: existing?.name_en },
      { name: 'price_cents', label: tx('Price', 'Precio'), type: 'money', required: true, value: existing?.price_cents },
      { name: 'duration_min', label: isService ? tx('Duration (min)', 'Duración (min)') : tx('Extra time (min)', 'Tiempo extra (min)'), type: 'number', required: isService,
        min: isService ? 5 : 0, max: 600, value: existing?.duration_min ?? (isService ? 30 : 0) },
      { name: 'sort_order', label: tx('Sort order', 'Orden'), type: 'number', value: existing?.sort_order ?? 0 },
      ...(isService ? [{ name: 'bookable_in_app', label: tx('Bookable in the app', 'Se puede reservar en la app'), type: 'checkbox', value: existing ? existing.bookable_in_app : false,
        hint: tx('New services only appear in the app after an app update. Leave off until then.', 'Los servicios nuevos solo aparecen en la app después de una actualización. Déjalo apagado hasta entonces.') }] : []),
      { name: 'active', label: tx('Active', 'Activo'), type: 'checkbox', value: existing ? existing.active : true },
      ...(existing ? [] : [{ name: 'info', type: 'info', value: tx("The id is generated from the English name and can't be changed later.", 'El identificador se genera del nombre en inglés y no se puede cambiar después.') }]),
    ],
    onSubmit: async (v) => {
      if (v.price_cents === null || Number.isNaN(v.price_cents)) throw new Error(tx('Enter a valid price.', 'Escribe un precio válido.'));
      const payload = { name_en: v.name_en, name_es: v.name_es, price_cents: v.price_cents, duration_min: v.duration_min ?? 0, sort_order: v.sort_order ?? 0, active: v.active };
      if (isService) payload.bookable_in_app = v.bookable_in_app;
      const { error } = existing
        ? await supabaseClient.from(table).update(payload).eq('id', existing.id)
        : await supabaseClient.from(table).insert({ ...payload, id: slugify(v.name_en) });
      if (error) throw error;
      toast(tx('Saved', 'Guardado'));
      await loadReference();
      refreshSection();
    },
  });
}

async function renderServices(panel) {
  await loadReference();
  clear(panel);
  panel.appendChild(panelHead(tx('Services & prices', 'Servicios y precios'),
    tx('Prices here drive checkout and reports. The mobile app shows the prices in its own build until the app is updated.',
      'Estos precios se usan para cobrar y en los reportes. La app muestra sus propios precios hasta que se actualice.'),
    h('button', { onClick: () => itemForm('service', null) }, tx('+ New service', '+ Nuevo servicio'))));
  const nameCol = (s) => h('span', {}, tx(s.name_en, s.name_es), h('small', { class: 'sub' }, ' ', tx(s.name_es, s.name_en)));
  const activeCol = (s) => (s.active ? pill('done', tx('Active', 'Activo')) : pill('cancelled', tx('Inactive', 'Inactivo')));
  panel.appendChild(dataTable([
    { label: tx('Service', 'Servicio'), render: nameCol },
    { label: tx('Price', 'Precio'), num: true, render: (s) => money(s.price_cents) },
    { label: tx('Duration', 'Duración'), num: true, render: (s) => `${s.duration_min} min` },
    { label: tx('In app', 'En la app'), render: (s) => (s.bookable_in_app ? tx('Yes', 'Sí') : 'No') },
    { label: tx('Status', 'Estado'), render: activeCol },
  ], Admin.services, { onRow: (s) => itemForm('service', s) }));

  panel.appendChild(h('div', { class: 'panel-head sub-head' }, h('h3', { class: 'section-h' }, tx('Add-ons', 'Extras')),
    h('button', { class: 'ghost small', onClick: () => itemForm('addon', null) }, tx('+ New add-on', '+ Nuevo extra'))));
  panel.appendChild(dataTable([
    { label: tx('Add-on', 'Extra'), render: nameCol },
    { label: tx('Price', 'Precio'), num: true, render: (s) => money(s.price_cents) },
    { label: tx('Extra time', 'Tiempo extra'), num: true, render: (s) => `${s.duration_min} min` },
    { label: tx('Status', 'Estado'), render: activeCol },
  ], Admin.addons, { onRow: (s) => itemForm('addon', s) }));

  for (const section of Admin.serviceSections) {
    try { await section(panel); } catch (e) { panel.appendChild(h('p', { class: 'error' }, friendlyError(e))); }
  }
}

registerModule('services', { label: ['Services & prices', 'Servicios y precios'], group: GROUPS.settings, roles: ['owner'], render: renderServices });
