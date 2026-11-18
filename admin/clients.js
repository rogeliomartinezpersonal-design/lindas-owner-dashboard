// Clients: the single client registry (app accounts + walk-ins). App-account rows are created and
// linked automatically by the database; walk-ins are added here. Clients are deactivated, never
// deleted, so their appointment and sales history stays intact.
/* global Admin, h, clear, tx, money, prettyDate, formatPhone, waHref, serviceLabel, pill, demoBadge,
   STATUS_TEXT, friendlyError, toast, openForm, panelHead, dataTable, registerModule, hasRole, showDemo,
   supabaseClient, refreshSection, salonDateKey, GROUPS */

let clientSearch = '';
let clientShowInactive = false;
Admin.clientDetailSections = Admin.clientDetailSections || []; // later stages add sections

function clientForm(existing) {
  openForm({
    title: existing ? tx('Edit client', 'Editar clienta') : tx('New client', 'Nueva clienta'),
    fields: [
      { name: 'full_name', label: tx('Full name', 'Nombre completo'), required: true, value: existing?.full_name, full: true },
      { name: 'phone', label: tx('Phone', 'Teléfono'), type: 'tel', value: existing ? formatPhone(existing.phone) : '' },
      { name: 'email', label: tx('Email', 'Correo'), type: 'email', value: existing?.email },
      { name: 'birthday', label: tx('Birthday', 'Cumpleaños'), type: 'date', value: existing?.birthday },
      { name: 'notes', label: tx('Notes (allergies, preferences…)', 'Notas (alergias, preferencias…)'), type: 'textarea', full: true, value: existing?.notes },
      ...(existing ? [{ name: 'active', label: tx('Active', 'Activa'), type: 'checkbox', value: existing.active }] : []),
      ...(existing?.profile_id ? [{ name: 'info', type: 'info', value: tx('Linked to an app account. Name changes in the app update this record automatically.', 'Vinculada a una cuenta de la app. Si cambia su nombre en la app, se actualiza aquí automáticamente.') }] : []),
    ],
    onSubmit: async (v) => {
      const payload = { full_name: v.full_name, phone: v.phone, email: v.email, birthday: v.birthday, notes: v.notes };
      if (existing) payload.active = v.active;
      const { error } = existing
        ? await supabaseClient.from('clients').update(payload).eq('id', existing.id)
        : await supabaseClient.from('clients').insert(payload);
      if (error) throw error;
      toast(existing ? tx('Client updated', 'Clienta actualizada') : tx('Client added', 'Clienta agregada'));
      refreshSection();
    },
  });
}

async function openClientDetail(client) {
  const overlay = h('div', { class: 'modal-overlay' });
  const body = h('div', {}, h('p', { class: 'muted' }, tx('Loading…', 'Cargando…')));
  overlay.appendChild(h('div', { class: 'modal modal-wide' },
    h('div', { class: 'modal-title-row' }, h('h2', {}, client.full_name, ' ', demoBadge(client)),
      h('button', { class: 'ghost small', onClick: () => overlay.remove() }, tx('Close', 'Cerrar'))),
    body));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);

  const { data: appts } = await supabaseClient.from('appointments')
    .select('id, appt_date, appt_time, service_id, status, payment_status, price_cents')
    .eq('client_id', client.id).order('appt_date', { ascending: false }).limit(50);
  clear(body);
  const wa = waHref(client.phone);
  body.appendChild(h('div', { class: 'detail-grid' },
    h('div', {}, h('small', {}, tx('Phone', 'Teléfono')), h('div', {}, client.phone ? formatPhone(client.phone) : '—', ' ', wa ? h('a', { href: wa, target: '_blank', rel: 'noopener' }, '💬 WhatsApp') : null)),
    h('div', {}, h('small', {}, tx('Email', 'Correo')), h('div', {}, client.email || '—')),
    h('div', {}, h('small', {}, tx('Birthday', 'Cumpleaños')), h('div', {}, client.birthday ? prettyDate(client.birthday, { month: 'long', day: 'numeric' }) : '—')),
    h('div', {}, h('small', {}, tx('App account', 'Cuenta en la app')), h('div', {}, client.profile_id ? tx('Yes', 'Sí') : tx('No (walk-in)', 'No (sin cuenta)')))));
  if (client.notes) body.appendChild(h('p', { class: 'note-box' }, client.notes));
  if (hasRole('owner', 'reception')) {
    body.appendChild(h('div', { class: 'btn-row' },
      h('button', { class: 'ghost small', onClick: () => { overlay.remove(); clientForm(client); } }, tx('Edit client', 'Editar clienta')),
      Admin.openAppointmentForm ? h('button', { class: 'small', onClick: () => { overlay.remove(); Admin.openAppointmentForm(null); } }, tx('Book appointment', 'Agendar cita')) : null));
  }
  body.appendChild(h('h3', { class: 'section-h' }, tx('Appointments', 'Citas')));
  body.appendChild(dataTable([
    { label: tx('Date', 'Fecha'), render: (a) => `${prettyDate(a.appt_date)} ${a.appt_time}` },
    { label: tx('Service', 'Servicio'), render: (a) => serviceLabel(a.service_id) },
    { label: tx('Status', 'Estado'), render: (a) => pill(a.status, STATUS_TEXT[a.status] || a.status) },
    { label: tx('Price', 'Precio'), num: true, render: (a) => money(a.price_cents) },
  ], appts || [], { empty: tx('No appointments yet.', 'Todavía no tiene citas.') }));
  for (const section of Admin.clientDetailSections) {
    try { await section(body, client); } catch (e) { body.appendChild(h('p', { class: 'error' }, friendlyError(e))); }
  }
}

async function renderClients(panel) {
  let q = supabaseClient.from('clients').select('*').order('full_name');
  if (!clientShowInactive) q = q.eq('active', true);
  if (!showDemo()) q = q.eq('is_demo', false);
  const [{ data: clients, error }, { data: appts }] = await Promise.all([
    q,
    supabaseClient.from('appointments').select('client_id, status, appt_date'),
  ]);
  clear(panel);
  panel.appendChild(panelHead(tx('Clients', 'Clientas'),
    tx('App accounts are added automatically. Add walk-in clients here. Clients are deactivated, never deleted.',
      'Las cuentas de la app se agregan solas. Aquí agregas a las clientas sin cuenta. Las clientas se desactivan, nunca se borran.'),
    hasRole('owner', 'reception') ? h('button', { onClick: () => clientForm(null) }, tx('+ New client', '+ Nueva clienta')) : null));
  if (error) { panel.appendChild(h('p', { class: 'error' }, friendlyError(error))); return; }

  const today = salonDateKey();
  const stats = {};
  for (const a of appts || []) {
    const s = (stats[a.client_id] ||= { visits: 0, last: null, next: null, noShows: 0 });
    if (a.status === 'done') { s.visits++; if (!s.last || a.appt_date > s.last) s.last = a.appt_date; }
    if (a.status === 'no_show') s.noShows++;
    if (a.status === 'upcoming' && a.appt_date >= today && (!s.next || a.appt_date < s.next)) s.next = a.appt_date;
  }

  const search = h('input', { type: 'search', class: 'search-input', placeholder: tx('Search name, phone or email…', 'Buscar por nombre, teléfono o correo…'), value: clientSearch });
  const inactiveToggle = h('input', { type: 'checkbox' });
  inactiveToggle.checked = clientShowInactive;
  inactiveToggle.addEventListener('change', () => { clientShowInactive = inactiveToggle.checked; refreshSection(); });
  const listHost = h('div');
  panel.appendChild(h('div', { class: 'toolbar' }, search, h('label', { class: 'checkbox-row' }, inactiveToggle, h('span', {}, tx('Show inactive', 'Mostrar inactivas')))));
  panel.appendChild(listHost);

  function draw() {
    const term = clientSearch.toLowerCase().replace(/[()\s-]/g, '');
    const rows = (clients || []).filter((c) => !term
      || c.full_name.toLowerCase().replace(/\s/g, '').includes(term)
      || (c.phone || '').includes(term)
      || (c.email || '').includes(term));
    clear(listHost).appendChild(dataTable([
      { label: tx('Name', 'Nombre'), render: (c) => h('span', {}, c.full_name, ' ', demoBadge(c), c.active ? null : pill('cancelled', tx('Inactive', 'Inactiva'))) },
      { label: tx('Phone', 'Teléfono'), render: (c) => (c.phone ? formatPhone(c.phone) : '—') },
      { label: 'App', render: (c) => (c.profile_id ? tx('Yes', 'Sí') : '—') },
      { label: tx('Visits', 'Visitas'), num: true, render: (c) => String(stats[c.id]?.visits || 0) },
      { label: tx('Last visit', 'Última visita'), render: (c) => (stats[c.id]?.last ? prettyDate(stats[c.id].last) : '—') },
      { label: tx('Next', 'Próxima'), render: (c) => (stats[c.id]?.next ? prettyDate(stats[c.id].next) : '—') },
    ], rows, { empty: clientSearch ? tx('No clients match that search.', 'Ninguna clienta coincide con la búsqueda.') : tx('No clients yet.', 'Todavía no hay clientas.'), onRow: openClientDetail }));
  }
  search.addEventListener('input', () => { clientSearch = search.value; draw(); });
  draw();
}

registerModule('clients', { label: ['Clients', 'Clientas'], group: GROUPS.daily, roles: ['owner', 'reception'], render: renderClients });
Admin.openClientDetail = openClientDetail;
