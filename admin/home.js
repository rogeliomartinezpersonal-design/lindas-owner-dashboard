// Home: today at a glance, per role. Every block has an explicit empty state, so "nothing to show"
// never looks like "failed to load".
/* global Admin, h, clear, tx, money, salonDateKey, addDays, prettyDate, timeToMinutes, minutesToTime,
   serviceLabel, staffLabel, pill, demoBadge, STATUS_TEXT, PAY_TEXT, friendlyError, emptyState,
   registerModule, hasRole, showDemo, showSection, supabaseClient, GROUPS */

function block(title, body, action) {
  return h('div', { class: 'card home-block' },
    h('div', { class: 'home-block-head' }, h('h3', { class: 'section-h', style: { margin: 0 } }, title), action || null),
    body);
}
function miniRow(left, right, onClick) {
  return h(onClick ? 'button' : 'div', { class: 'mini-row', type: onClick ? 'button' : null, onClick }, h('span', {}, left), h('span', { class: 'v' }, right));
}
function nowMinutesInSalon() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: Admin.settings.timezone, hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(new Date());
  const hh = Number(parts.find((p) => p.type === 'hour').value) % 24;
  return hh * 60 + Number(parts.find((p) => p.type === 'minute').value);
}
const plural = (n, en1, enN, es1, esN) => tx(n === 1 ? en1 : enN, n === 1 ? es1 : esN);

async function renderHome(panel) {
  const today = salonDateKey();
  const tomorrow = addDays(today, 1);
  const manager = hasRole('owner', 'reception');
  const greetName = Admin.access.display_name ? `, ${Admin.access.display_name.split(' ')[0]}` : '';

  let apptQ = supabaseClient.from('appointments').select('*, clients(full_name, phone)').in('appt_date', [today, tomorrow]).order('appt_time');
  if (!showDemo()) apptQ = apptQ.eq('is_demo', false);
  const queries = [apptQ];
  if (manager) {
    const startIso = new Date(Date.now() - 30 * 3600e3).toISOString();
    queries.push(
      supabaseClient.from('payments').select('amount_cents, received_at, kind, is_demo').eq('status', 'recorded').gte('received_at', startIso),
      supabaseClient.from('sales').select('id, paid_cents, total_cents, appointment_id, is_demo').eq('status', 'open'),
      supabaseClient.from('client_interactions').select('id, kind, due_on, body, clients(full_name)').eq('status', 'open').order('due_on'),
      supabaseClient.from('inventory_levels').select('item_id, on_hand, needs_reorder'),
      supabaseClient.from('inventory_items').select('id, name, reorder_level, active'),
    );
  } else {
    const monthStart = today.slice(0, 8) + '01';
    queries.push(supabaseClient.from('commissions').select('amount_cents, created_at').eq('staff_id', Admin.access.staff_id || '00000000-0000-0000-0000-000000000000')
      .gte('created_at', new Date(Date.parse(monthStart + 'T00:00:00Z') - 14 * 3600e3).toISOString()));
  }
  const results = await Promise.all(queries);
  clear(panel);
  const err = results.find((r) => r.error)?.error;
  const nowMin = nowMinutesInSalon();
  const greeting = nowMin < 720 ? tx('Good morning', 'Buenos días') : nowMin < 1080 ? tx('Good afternoon', 'Buenas tardes') : tx('Good evening', 'Buenas noches');
  panel.appendChild(h('div', { class: 'home-hello' },
    h('h2', {}, `${greeting}${greetName}`),
    h('p', { class: 'panel-sub' }, prettyDate(today, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }))));
  if (err) { panel.appendChild(h('p', { class: 'error' }, friendlyError(err))); return; }

  const appts = (results[0].data || []).sort((x, y) => timeToMinutes(x.appt_time) - timeToMinutes(y.appt_time));
  const todays = appts.filter((a) => a.appt_date === today);
  const live = todays.filter((a) => a.status !== 'cancelled');
  const remaining = todays.filter((a) => a.status === 'upcoming');
  const next = remaining.filter((a) => timeToMinutes(a.appt_time) + (a.duration_min || 0) > nowMin);
  const tomorrowCount = appts.filter((a) => a.appt_date === tomorrow && a.status === 'upcoming').length;

  if (!manager) {
    const monthStart = today.slice(0, 8) + '01';
    const comm = (results[1].data || []).filter((c) => salonDateKey(new Date(c.created_at)) >= monthStart).reduce((s, c) => s + c.amount_cents, 0);
    panel.appendChild(h('div', { class: 'stats-row' },
      h('div', { class: 'stat-tile' }, h('span', { class: 'stat-value' }, String(remaining.length)), h('span', { class: 'stat-label' }, tx('Still to do today', 'Pendientes hoy'))),
      h('div', { class: 'stat-tile' }, h('span', { class: 'stat-value' }, String(todays.filter((a) => a.status === 'done').length)), h('span', { class: 'stat-label' }, tx('Done today', 'Terminadas hoy'))),
      h('div', { class: 'stat-tile' }, h('span', { class: 'stat-value' }, String(tomorrowCount)), h('span', { class: 'stat-label' }, tx('Tomorrow', 'Mañana'))),
      h('div', { class: 'stat-tile' }, h('span', { class: 'stat-value' }, money(comm)), h('span', { class: 'stat-label' }, tx('My commissions this month', 'Mis comisiones del mes')))));
    panel.appendChild(block(tx('My next clients', 'Mis próximas clientas'),
      next.length ? h('div', {}, next.slice(0, 8).map((a) => miniRow(`${a.appt_time} · ${a.clients?.full_name ?? '—'}`, serviceLabel(a.service_id))))
        : emptyState(todays.length ? tx("You're done for today. 🎉", 'Terminaste por hoy. 🎉') : tx('No appointments assigned to you today.', 'No tienes citas asignadas hoy.')),
      h('button', { class: 'ghost small', onClick: () => showSection('agenda') }, tx('Open agenda', 'Abrir agenda'))));
    return;
  }

  const [, paysRes, openRes, careRes, lvlRes, itemsRes] = results;
  const paysToday = (paysRes.data || []).filter((p) => (showDemo() || !p.is_demo) && salonDateKey(new Date(p.received_at)) === today);
  const received = paysToday.reduce((s, p) => s + p.amount_cents, 0);
  const openSales = (openRes.data || []).filter((s) => showDemo() || !s.is_demo);
  const held = openSales.reduce((s, x) => s + x.paid_cents, 0);
  panel.appendChild(h('div', { class: 'stats-row' },
    h('div', { class: 'stat-tile' }, h('span', { class: 'stat-value' }, `${remaining.length}/${live.length}`), h('span', { class: 'stat-label' }, tx('Appointments left today', 'Citas pendientes hoy'))),
    h('div', { class: 'stat-tile' }, h('span', { class: 'stat-value' }, money(received)), h('span', { class: 'stat-label' }, tx(`Received today (${paysToday.length})`, `Cobrado hoy (${paysToday.length})`))),
    h('div', { class: 'stat-tile' }, h('span', { class: 'stat-value' }, money(held)), h('span', { class: 'stat-label' }, tx('Deposits / partial held', 'Anticipos / parciales'))),
    h('div', { class: 'stat-tile' }, h('span', { class: 'stat-value' }, String(tomorrowCount)), h('span', { class: 'stat-label' }, tx('Booked tomorrow', 'Citas mañana')))));

  // Next up
  const nextBody = next.length
    ? h('div', {}, next.slice(0, 8).map((a) => h('div', { class: 'mini-row' },
      h('span', {}, h('strong', {}, a.appt_time), ` – ${minutesToTime(timeToMinutes(a.appt_time) + (a.duration_min || 0))} · ${a.clients?.full_name ?? '—'} · ${serviceLabel(a.service_id)}`,
        a.staff_id ? h('small', { class: 'sub' }, ` · ${staffLabel(a.staff_id)}`) : null, ' ', demoBadge(a)),
      h('span', { class: 'pill-row' }, a.checked_in_at ? pill('info', tx('Checked in', 'Ya llegó')) : null, pill('pay-' + a.payment_status, PAY_TEXT[a.payment_status]),
        Admin.openCheckout ? h('button', { class: 'small', onClick: () => Admin.openCheckout(a) }, tx('Checkout', 'Cobrar')) : null))))
    : emptyState(live.length ? tx('Everyone for today has been seen. 🎉', 'Ya se atendió a todas las de hoy. 🎉') : tx('No appointments today.', 'No hay citas hoy.'),
      h('button', { class: 'ghost small', onClick: () => Admin.openAppointmentForm && Admin.openAppointmentForm(null) }, tx('Book a walk-in', 'Agendar sin cita')));

  // Needs attention
  const open = tx('Open', 'Abrir');
  const attention = [];
  for (const a of todays.filter((x) => x.status === 'done' && ['unpaid', 'deposit', 'partial'].includes(x.payment_status))) {
    attention.push(h('div', { class: 'mini-row' }, h('span', {}, '💳 ', tx('Completed but not fully paid: ', 'Completada pero sin pagar completo: '), a.clients?.full_name ?? '—', ` (${a.appt_time})`),
      Admin.openCheckout ? h('button', { class: 'small', onClick: () => Admin.openCheckout(a) }, tx('Checkout', 'Cobrar')) : null));
  }
  const pastDue = todays.filter((x) => x.status === 'upcoming' && timeToMinutes(x.appt_time) + (x.duration_min || 0) + 30 < nowMin);
  for (const a of pastDue) {
    attention.push(miniRow(`⏰ ${tx('Still marked upcoming', 'Sigue como próxima')}: ${a.clients?.full_name ?? '—'} (${a.appt_time}). ${tx('Complete or mark no-show.', 'Complétala o marca que no asistió.')}`, '', () => showSection('agenda')));
  }
  const dueCare = (careRes.data || []).filter((c) => c.due_on && c.due_on <= today);
  if (dueCare.length) attention.push(miniRow(`📞 ${dueCare.length} ${plural(dueCare.length, 'follow-up / complaint due', 'follow-ups / complaints due', 'seguimiento / queja pendiente', 'seguimientos / quejas pendientes')}`, open, () => showSection('care')));
  const lvl = Object.fromEntries((lvlRes.data || []).map((l) => [l.item_id, l]));
  const low = (itemsRes.data || []).filter((i) => i.active && Number(i.reorder_level) > 0 && lvl[i.id]?.needs_reorder);
  if (low.length) attention.push(miniRow(`📦 ${low.length} ${plural(low.length, 'item at or below reorder level', 'items at or below reorder level', 'artículo por pedir', 'artículos por pedir')}: ${low.slice(0, 3).map((i) => i.name).join(', ')}${low.length > 3 ? '…' : ''}`, open, () => showSection('inventory')));
  const openNoAppt = openSales.filter((s) => !s.appointment_id);
  if (openNoAppt.length) attention.push(miniRow(`🧾 ${openNoAppt.length} ${plural(openNoAppt.length, 'open sale not linked to an appointment (finish or void)', 'open sales not linked to an appointment (finish or void)', 'venta abierta sin cita (termínala o anúlala)', 'ventas abiertas sin cita (termínalas o anúlalas)')}`, open, () => showSection('sales')));

  panel.appendChild(h('div', { class: 'grid-2' },
    block(tx('Next up', 'Siguientes'), nextBody, h('button', { class: 'ghost small', onClick: () => showSection('agenda') }, tx('Agenda', 'Agenda'))),
    block(tx('Needs attention', 'Requiere atención'), attention.length ? h('div', {}, attention) : emptyState(tx('Nothing needs attention right now.', 'No hay nada pendiente por ahora.')))));

  // Today's status breakdown
  const counts = {};
  for (const a of todays) counts[a.status] = (counts[a.status] || 0) + 1;
  panel.appendChild(block(tx('Today by status', 'Hoy por estado'),
    todays.length ? h('div', { class: 'pill-row', style: { justifyContent: 'flex-start' } },
      Object.entries(counts).map(([st, n]) => pill(st, `${STATUS_TEXT[st] || st}: ${n}`)))
      : emptyState(tx('No appointments booked for today yet.', 'Todavía no hay citas para hoy.'))));
}

registerModule('home', { label: ['Home', 'Inicio'], group: GROUPS.daily, roles: ['owner', 'reception', 'employee'], render: renderHome });
