// Agenda: day view of appointments with capacity-aware booking. Overlaps beyond capacity are
// rejected by the database (appointments_capacity_check), so the time picker greys out full slots
// using the same get_taken_slots() the mobile app uses, and any race is caught on save.
/* global Admin, h, clear, tx, money, salonDateKey, addDays, prettyDate, timeToMinutes, minutesToTime,
   formatPhone, waHref, serviceLabel, addonLabel, staffLabel, pill, demoBadge, STATUS_TEXT, PAY_TEXT,
   friendlyError, toast, openForm, confirmAction, emptyState, panelHead, registerModule, hasRole,
   showDemo, supabaseClient, refreshSection, GROUPS */

let agendaDate = null;

async function fetchClientsForPicker() {
  let q = supabaseClient.from('clients').select('id, full_name, phone, is_demo').eq('active', true).order('full_name');
  if (!showDemo()) q = q.eq('is_demo', false);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function fillTimeOptions(select, date, keep, durationMin) {
  const { data: taken } = await supabaseClient.rpc('get_taken_slots', { p_date: date });
  const takenSet = new Set((taken || []).map((r) => r.appt_time));
  const step = Admin.settings.slot_minutes || 30;
  clear(select);
  for (let m = 8 * 60; m <= 20 * 60; m += step) {
    const t = minutesToTime(m);
    // A slot is offered if nothing at capacity covers it for the service's length; the database
    // re-checks the full duration on save anyway.
    let full = takenSet.has(t) && t !== keep;
    if (!full && durationMin) {
      for (let k = m; k < m + durationMin; k += step) if (takenSet.has(minutesToTime(k)) && minutesToTime(k) !== keep) full = true;
    }
    const opt = h('option', { value: t, disabled: full }, full ? `${t} — ${tx('full', 'ocupado')}` : t);
    if (t === keep) opt.selected = true;
    select.appendChild(opt);
  }
}

function serviceOptions(includeInactiveId) {
  return Admin.services.filter((s) => s.active || s.id === includeInactiveId)
    .map((s) => ({ value: s.id, label: `${serviceLabel(s.id)} · ${money(s.price_cents)} · ${s.duration_min} min` }));
}
function staffOptions(current) {
  return [{ value: '', label: tx('Unassigned', 'Sin asignar') }].concat(
    Admin.staff.filter((s) => s.active || s.id === current).map((s) => ({ value: s.id, label: s.display_name })));
}
function durationOf(serviceId, addonIds) {
  const s = Admin.services.find((x) => x.id === serviceId);
  return (s?.duration_min || 30) + (addonIds || []).reduce((n, id) => n + (Admin.addons.find((a) => a.id === id)?.duration_min || 0), 0);
}
const SOURCE_OPTIONS = () => [
  { value: 'walk_in', label: tx('Walk-in', 'Sin cita (walk-in)') }, { value: 'phone', label: tx('Phone / WhatsApp', 'Teléfono / WhatsApp') },
  { value: 'dashboard', label: tx('Dashboard', 'Panel') }, { value: 'app', label: 'App' }, { value: 'web', label: tx('Website', 'Sitio web') },
];
const SOURCE_SHORT = { walk_in: ['walk-in', 'walk-in'], phone: ['phone', 'teléfono'], dashboard: ['dashboard', 'panel'], web: ['website', 'sitio web'], app: ['app', 'app'] };

async function openAppointmentForm(existing) {
  const clients = await fetchClientsForPicker();
  const date = existing?.appt_date || agendaDate;
  const { inputs } = openForm({
    title: existing ? tx('Edit appointment', 'Editar cita') : tx('New appointment', 'Nueva cita'),
    wide: true,
    fields: [
      existing
        ? { name: 'client_info', type: 'info', value: `${tx('Client', 'Clienta')}: ${existing.clients?.full_name ?? '—'}` }
        : {
          name: 'client_id', label: tx('Client', 'Clienta'), type: 'select', required: true, full: true,
          options: [{ value: '', label: tx('Choose a client…', 'Elige una clienta…') }, { value: '__new', label: tx('+ New walk-in client', '+ Nueva clienta (sin cuenta)') }]
            .concat(clients.map((c) => ({ value: c.id, label: `${c.full_name}${c.phone ? ' · ' + formatPhone(c.phone) : ''}${c.is_demo ? ' (demo)' : ''}` }))),
          onChange: (v, inp) => {
            inp.new_name.closest('label').classList.toggle('hidden', v !== '__new');
            inp.new_phone.closest('label').classList.toggle('hidden', v !== '__new');
          },
        },
      ...(existing ? [] : [
        { name: 'new_name', label: tx('New client name', 'Nombre de la nueva clienta') },
        { name: 'new_phone', label: tx('New client phone', 'Teléfono de la nueva clienta'), type: 'tel' },
      ]),
      { name: 'service_id', label: tx('Service', 'Servicio'), type: 'select', required: true, full: true, value: existing?.service_id, options: serviceOptions(existing?.service_id),
        onChange: () => refreshTimes() },
      { name: 'addon_ids', label: tx('Add-ons', 'Extras'), type: 'checks', value: existing?.addon_ids || [],
        options: Admin.addons.filter((a) => a.active || (existing?.addon_ids || []).includes(a.id)).map((a) => ({ value: a.id, label: `${addonLabel(a.id)} (+${money(a.price_cents)})` })) },
      { name: 'appt_date', label: tx('Date', 'Fecha'), type: 'date', required: true, value: date, onChange: () => refreshTimes() },
      { name: 'appt_time', label: tx('Time', 'Hora'), type: 'select', required: true, options: [] },
      { name: 'staff_id', label: tx('Staff', 'Atiende'), type: 'select', value: existing?.staff_id || '', options: staffOptions(existing?.staff_id) },
      { name: 'source', label: tx('Booked via', 'Reservada por'), type: 'select', value: existing?.source || 'walk_in', options: SOURCE_OPTIONS() },
      { name: 'duration_min', label: tx('Duration (min)', 'Duración (min)'), type: 'number', min: 5, max: 720, value: existing?.duration_min,
        hint: tx('Leave empty to use the service length.', 'Déjalo vacío para usar la duración del servicio.') },
      { name: 'notes', label: tx('Notes', 'Notas'), type: 'textarea', full: true, value: existing?.notes },
    ],
    submitLabel: existing ? tx('Save changes', 'Guardar cambios') : tx('Book appointment', 'Agendar cita'),
    onSubmit: async (v) => {
      const payload = {
        service_id: v.service_id, addon_ids: v.addon_ids, appt_date: v.appt_date, appt_time: v.appt_time,
        staff_id: v.staff_id || null, source: v.source, notes: v.notes, duration_min: v.duration_min ?? null,
      };
      if (existing) {
        if (payload.duration_min === null) delete payload.duration_min;
        const { error } = await supabaseClient.from('appointments').update(payload).eq('id', existing.id);
        if (error) throw error;
        toast(tx('Appointment updated', 'Cita actualizada'));
      } else {
        let clientId = v.client_id;
        if (clientId === '__new') {
          if (!v.new_name) throw new Error(tx("Enter the new client's name.", 'Escribe el nombre de la nueva clienta.'));
          const { data, error } = await supabaseClient.from('clients').insert({ full_name: v.new_name, phone: v.new_phone }).select('id').single();
          if (error) throw error;
          clientId = data.id;
        }
        if (!clientId) throw new Error(tx('Choose a client.', 'Elige una clienta.'));
        const { error } = await supabaseClient.from('appointments').insert({ ...payload, client_id: clientId });
        if (error) throw error;
        toast(tx('Appointment booked', 'Cita agendada'));
      }
      agendaDate = v.appt_date;
      refreshSection();
    },
  });
  if (!existing) {
    inputs.new_name.closest('label').classList.add('hidden');
    inputs.new_phone.closest('label').classList.add('hidden');
  }
  function refreshTimes() {
    const addons = inputs.addon_ids.checks.filter((c) => c.checked).map((c) => c.value);
    fillTimeOptions(inputs.appt_time, inputs.appt_date.value, existing && inputs.appt_date.value === existing.appt_date ? existing.appt_time : null,
      durationOf(inputs.service_id.value, addons));
  }
  inputs.addon_ids.checks.forEach((c) => c.addEventListener('change', refreshTimes));
  refreshTimes();
}

async function setStatus(appt, patch, message) {
  const { error } = await supabaseClient.from('appointments').update(patch).eq('id', appt.id);
  if (error) return toast(friendlyError(error), 'error');
  toast(message);
  refreshSection();
}

function cancelAppointment(appt) {
  openForm({
    title: tx('Cancel appointment', 'Cancelar cita'),
    intro: tx('The appointment stays in history as cancelled and its slot opens up again.', 'La cita queda en el historial como cancelada y el horario se libera.'),
    fields: [{ name: 'reason', label: tx('Reason', 'Motivo'), type: 'textarea', full: true }],
    submitLabel: tx('Cancel appointment', 'Cancelar cita'), danger: true,
    onSubmit: async (v) => {
      const { error } = await supabaseClient.from('appointments').update({ status: 'cancelled', cancel_reason: v.reason }).eq('id', appt.id);
      if (error) throw error;
      toast(tx('Appointment cancelled', 'Cita cancelada'));
      refreshSection();
    },
  });
}

function apptCard(a) {
  const start = timeToMinutes(a.appt_time);
  const end = minutesToTime(start + (a.duration_min || 0));
  const manager = hasRole('owner', 'reception');
  const mine = a.staff_id && a.staff_id === Admin.access.staff_id;
  const actions = [];
  if (a.status === 'upcoming' && (manager || mine)) {
    if (!a.checked_in_at) actions.push(h('button', { class: 'small ghost', onClick: () => setStatus(a, { checked_in_at: new Date().toISOString() }, tx('Checked in', 'Llegada registrada')) }, tx('Check in', 'Llegó')));
    actions.push(h('button', { class: 'small ok', onClick: () => setStatus(a, { status: 'done' }, tx('Marked completed', 'Marcada como completada')) }, tx('Complete', 'Completar')));
    actions.push(h('button', { class: 'small ghost', onClick: async () => {
      if (await confirmAction(tx('Mark this client as a no-show?', '¿Marcar que la clienta no asistió?'), tx('Mark no-show', 'No asistió'))) setStatus(a, { status: 'no_show' }, tx('Marked no-show', 'Marcada como no asistió'));
    } }, tx('No-show', 'No asistió')));
  }
  if (manager && a.status === 'upcoming') {
    actions.push(h('button', { class: 'small ghost', onClick: () => openAppointmentForm(a) }, tx('Edit', 'Editar')));
    actions.push(h('button', { class: 'small ghost danger-ghost', onClick: () => cancelAppointment(a) }, tx('Cancel', 'Cancelar')));
  }
  if (manager && a.status !== 'cancelled' && Admin.openCheckout && !['paid', 'refunded', 'partially_refunded'].includes(a.payment_status)) {
    actions.push(h('button', { class: 'small', onClick: () => Admin.openCheckout(a) },
      a.status === 'upcoming' ? tx('Deposit / checkout', 'Anticipo / cobrar') : tx('Checkout', 'Cobrar')));
  }
  const wa = waHref(a.clients?.phone);
  const src = SOURCE_SHORT[a.source] || [a.source, a.source];
  return h('div', { class: 'appt-card agenda-card agenda-' + a.status },
    h('div', { class: 'appt-time' }, a.appt_time, h('small', {}, `– ${end}`)),
    h('div', { class: 'appt-main' },
      h('div', { class: 'appt-service' }, serviceLabel(a.service_id), ' · ', money(a.price_cents), ' ', demoBadge(a)),
      h('div', { class: 'appt-customer' },
        h('span', {}, a.clients?.full_name ?? '—', a.clients?.phone ? ' · ' + formatPhone(a.clients.phone) : ''),
        wa ? h('a', { href: wa, target: '_blank', rel: 'noopener', class: 'wa-link', title: tx('Open WhatsApp', 'Abrir WhatsApp') }, '💬') : null),
      a.addon_ids?.length ? h('div', { class: 'appt-addons' }, '+ ', a.addon_ids.map(addonLabel).join(', ')) : null,
      h('div', { class: 'appt-meta' },
        h('span', {}, tx('Staff', 'Atiende'), ': ', a.staff_id ? staffLabel(a.staff_id) : tx('Unassigned', 'Sin asignar')),
        a.checked_in_at && a.status === 'upcoming' ? h('span', { class: 'pill pill-info' }, tx('Checked in', 'Ya llegó')) : null,
        h('span', {}, ' · ', tx(src[0], src[1]))),
      a.notes ? h('div', { class: 'appt-notes' }, a.notes) : null,
      a.cancel_reason ? h('div', { class: 'appt-notes' }, tx('Cancelled', 'Cancelada'), ': ', a.cancel_reason) : null),
    h('div', { class: 'appt-actions' },
      h('div', { class: 'pill-row' }, pill(a.status, STATUS_TEXT[a.status] || a.status), pill('pay-' + a.payment_status, PAY_TEXT[a.payment_status] || a.payment_status)),
      actions));
}

async function renderAgenda(panel) {
  agendaDate = agendaDate || salonDateKey();
  let q = supabaseClient.from('appointments')
    .select('*, clients(full_name, phone, is_demo)')
    .eq('appt_date', agendaDate)
    .order('appt_time');
  if (!showDemo()) q = q.eq('is_demo', false);
  const { data, error } = await q;
  clear(panel);
  const manager = hasRole('owner', 'reception');
  const cap = Admin.settings.capacity;
  panel.appendChild(panelHead(tx('Agenda', 'Agenda'),
    tx(`Capacity: ${cap} appointment${cap > 1 ? 's' : ''} at a time. Visit status and payment status are tracked separately.`,
      `Capacidad: ${cap} cita${cap > 1 ? 's' : ''} a la vez. El estado de la cita y el del pago se llevan por separado.`),
    manager ? h('button', { onClick: () => openAppointmentForm(null) }, tx('+ New appointment', '+ Nueva cita')) : null));

  const dateInput = h('input', { type: 'date', value: agendaDate, onChange: (e) => { agendaDate = e.target.value; refreshSection(); } });
  panel.appendChild(h('div', { class: 'date-nav' },
    h('button', { class: 'icon-btn', 'aria-label': tx('Previous day', 'Día anterior'), onClick: () => { agendaDate = addDays(agendaDate, -1); refreshSection(); } }, '‹'),
    dateInput,
    h('button', { class: 'icon-btn', 'aria-label': tx('Next day', 'Día siguiente'), onClick: () => { agendaDate = addDays(agendaDate, 1); refreshSection(); } }, '›'),
    h('button', { class: 'ghost small', onClick: () => { agendaDate = salonDateKey(); refreshSection(); } }, tx('Today', 'Hoy')),
    h('strong', { class: 'date-nav-label' }, prettyDate(agendaDate, { weekday: 'long', month: 'long', day: 'numeric' }))));

  if (error) { panel.appendChild(h('p', { class: 'error' }, friendlyError(error))); return; }
  // appt_time is text ("1:00 PM"), so sort by real clock time, not alphabetically.
  const rows = (data || []).sort((x, y) => timeToMinutes(x.appt_time) - timeToMinutes(y.appt_time));
  const active = rows.filter((a) => a.status !== 'cancelled');
  panel.appendChild(h('div', { class: 'stats-row' },
    h('div', { class: 'stat-tile' }, h('span', { class: 'stat-value' }, String(active.filter((a) => a.status === 'upcoming').length)), h('span', { class: 'stat-label' }, tx('Upcoming', 'Próximas'))),
    h('div', { class: 'stat-tile' }, h('span', { class: 'stat-value' }, String(rows.filter((a) => a.status === 'done').length)), h('span', { class: 'stat-label' }, tx('Completed', 'Completadas'))),
    h('div', { class: 'stat-tile' }, h('span', { class: 'stat-value' }, String(rows.filter((a) => a.status === 'no_show' || a.status === 'cancelled').length)), h('span', { class: 'stat-label' }, tx('No-show / cancelled', 'No asistió / canceladas'))),
    h('div', { class: 'stat-tile' }, h('span', { class: 'stat-value' }, money(active.reduce((s, a) => s + (a.price_cents || 0), 0))), h('span', { class: 'stat-label' }, tx('Booked value', 'Valor agendado')))));

  if (!rows.length) {
    panel.appendChild(emptyState(hasRole('employee') ? tx('No appointments assigned to you on this day.', 'No tienes citas asignadas este día.') : tx('No appointments on this day.', 'No hay citas este día.'),
      manager ? h('button', { class: 'ghost', onClick: () => openAppointmentForm(null) }, tx('Book one', 'Agendar una')) : null));
    return;
  }
  panel.appendChild(h('div', { class: 'agenda-list' }, rows.map(apptCard)));
}

registerModule('agenda', { label: ['Agenda', 'Agenda'], group: GROUPS.daily, roles: ['owner', 'reception', 'employee'], render: renderAgenda });
Admin.openAppointmentForm = openAppointmentForm;
