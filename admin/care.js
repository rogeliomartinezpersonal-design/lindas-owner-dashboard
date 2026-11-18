// Customer care: a log of notes, calls, WhatsApp conversations, feedback, complaints and follow-ups
// per client. Nothing is ever sent from here. WhatsApp links only open a chat for a person to
// write in. Complaints and follow-ups stay open until resolved; entries are never deleted or rewritten.
/* global Admin, h, clear, tx, biMap, salonDateKey, prettyDate, prettyDateTime, formatPhone, waHref, staffLabel, pill,
   demoBadge, friendlyError, toast, openForm, panelHead, dataTable, filterRow, emptyState, registerModule, showDemo,
   supabaseClient, refreshSection, GROUPS */

const CARE_KIND = biMap({
  note: ['Note', 'Nota'], call: ['Call', 'Llamada'], whatsapp: ['WhatsApp', 'WhatsApp'], feedback: ['Feedback', 'Comentario'],
  complaint: ['Complaint', 'Queja'], follow_up: ['Follow-up', 'Seguimiento'],
});
const CARE_KEYS = ['note', 'call', 'whatsapp', 'feedback', 'complaint', 'follow_up'];
let careFilter = 'open';

async function careForm(client) {
  let clients = null;
  if (!client) {
    const { data } = await supabaseClient.from('clients').select('id, full_name, phone').eq('active', true).order('full_name');
    clients = data || [];
  }
  openForm({
    title: client ? tx(`Log for ${client.full_name}`, `Registro para ${client.full_name}`) : tx('New care entry', 'Nueva entrada de atención'),
    intro: tx('Complaints and follow-ups stay open until resolved. Notes, calls and feedback are saved as records.', 'Las quejas y seguimientos quedan abiertos hasta resolverse. Las notas, llamadas y comentarios se guardan como registro.'),
    fields: [
      ...(client ? [] : [{ name: 'client_id', label: tx('Client', 'Clienta'), type: 'select', required: true, full: true,
        options: [{ value: '', label: tx('Choose…', 'Elige…') }].concat(clients.map((c) => ({ value: c.id, label: `${c.full_name}${c.phone ? ' · ' + formatPhone(c.phone) : ''}` }))) }]),
      { name: 'kind', label: tx('Type', 'Tipo'), type: 'select', value: 'note', options: CARE_KEYS.map((v) => ({ value: v, label: CARE_KIND[v] })) },
      { name: 'due_on', label: tx('Follow up by (optional)', 'Dar seguimiento antes de (opcional)'), type: 'date', hint: tx('Setting a date keeps it open as a to-do.', 'Si pones fecha, queda abierta como pendiente.') },
      { name: 'assigned_to', label: tx('Assigned to', 'Asignada a'), type: 'select', options: [{ value: '', label: tx('Anyone', 'Cualquiera') }].concat(Admin.staff.filter((s) => s.active).map((s) => ({ value: s.id, label: s.display_name }))) },
      { name: 'body', label: tx('What happened / what to do', 'Qué pasó / qué hacer'), type: 'textarea', required: true, full: true, max: 4000 },
    ],
    onSubmit: async (v) => {
      const { error } = await supabaseClient.from('client_interactions').insert({
        client_id: client ? client.id : v.client_id, kind: v.kind, body: v.body, due_on: v.due_on, assigned_to: v.assigned_to || null,
      });
      if (error) throw error;
      toast(tx('Saved', 'Guardado'));
      refreshSection();
    },
  });
}

function resolveForm(entry) {
  openForm({
    title: tx(`Resolve ${CARE_KIND[entry.kind].toLowerCase()}`, `Resolver ${CARE_KIND[entry.kind].toLowerCase()}`),
    fields: [{ name: 'resolution', label: tx('How it was resolved', 'Cómo se resolvió'), type: 'textarea', required: true, full: true }],
    submitLabel: tx('Mark resolved', 'Marcar como resuelta'),
    onSubmit: async (v) => {
      const { error } = await supabaseClient.from('client_interactions').update({ status: 'resolved', resolution: v.resolution }).eq('id', entry.id);
      if (error) throw error;
      toast(tx('Resolved', 'Resuelta'));
      refreshSection();
    },
  });
}

const careStatus = (s) => (s === 'open' ? tx('Open', 'Abierta') : tx('Resolved', 'Resuelta'));

function careRow(e, today) {
  const overdue = e.status === 'open' && e.due_on && e.due_on < today;
  const wa = waHref(e.clients?.phone);
  return h('div', { class: 'appt-card care-card' + (overdue ? ' overdue' : '') },
    h('div', { class: 'appt-main' },
      h('div', { class: 'appt-service' }, CARE_KIND[e.kind], ' · ', e.clients?.full_name ?? '—', ' ', demoBadge(e)),
      h('div', { class: 'appt-notes' }, e.body),
      e.resolution ? h('div', { class: 'appt-meta' }, tx('Resolved', 'Resuelta'), ': ', e.resolution) : null,
      h('div', { class: 'appt-meta' },
        h('span', {}, prettyDateTime(e.created_at)),
        e.due_on ? h('span', {}, ` · ${tx('due', 'vence')} `, prettyDate(e.due_on)) : null,
        e.assigned_to ? h('span', {}, ' · ', staffLabel(e.assigned_to)) : null,
        wa ? h('a', { href: wa, target: '_blank', rel: 'noopener', class: 'wa-link' }, ' 💬 ', tx('Open WhatsApp', 'Abrir WhatsApp')) : null)),
    h('div', { class: 'appt-actions' },
      h('div', { class: 'pill-row' }, overdue ? pill('warn', tx('Overdue', 'Vencida')) : null, pill(e.status, careStatus(e.status))),
      e.status === 'open' ? h('button', { class: 'small ok', onClick: () => resolveForm(e) }, tx('Resolve', 'Resolver')) : null));
}

async function renderCare(panel) {
  let q = supabaseClient.from('client_interactions').select('*, clients(full_name, phone)').order('created_at', { ascending: false }).limit(200);
  if (careFilter === 'open') q = q.eq('status', 'open');
  if (careFilter === 'complaints') q = q.eq('kind', 'complaint');
  if (!showDemo()) q = q.eq('is_demo', false);
  const { data, error } = await q;
  clear(panel);
  panel.appendChild(panelHead(tx('Customer care', 'Atención a clientas'),
    tx('Notes, calls, complaints and follow-ups. Nothing is sent automatically; WhatsApp links just open a chat.', 'Notas, llamadas, quejas y seguimientos. Nada se envía solo; los enlaces de WhatsApp solo abren el chat.'),
    h('button', { onClick: () => careForm(null) }, tx('+ New entry', '+ Nueva entrada'))));
  panel.appendChild(filterRow(careFilter, [['open', 'Open to-dos', 'Pendientes'], ['complaints', 'Complaints', 'Quejas'], ['all', 'Recent activity', 'Actividad reciente']],
    (k) => { careFilter = k; refreshSection(); }));
  if (error) { panel.appendChild(h('p', { class: 'error' }, friendlyError(error))); return; }
  const today = salonDateKey();
  const rows = (data || []).sort((a, b) => (careFilter === 'open' ? (a.due_on || '9999').localeCompare(b.due_on || '9999') : 0));
  if (!rows.length) {
    panel.appendChild(emptyState(careFilter === 'open' ? tx('No open follow-ups or complaints. 🎉', 'No hay seguimientos ni quejas pendientes. 🎉') : tx('Nothing logged yet.', 'Todavía no hay registros.')));
    return;
  }
  panel.appendChild(h('div', {}, rows.map((e) => careRow(e, today))));
}

registerModule('care', { label: ['Customer care', 'Atención a clientas'], group: GROUPS.daily, roles: ['owner', 'reception'], render: renderCare });
Admin.careForm = careForm;

// Care history on the client detail.
(Admin.clientDetailSections ||= []).push(async (body, client) => {
  const { data } = await supabaseClient.from('client_interactions').select('*').eq('client_id', client.id).order('created_at', { ascending: false }).limit(30);
  body.appendChild(h('div', { class: 'panel-head sub-head' }, h('h3', { class: 'section-h' }, tx('Customer care', 'Atención')),
    h('button', { class: 'ghost small', onClick: () => careForm(client) }, tx('+ Log', '+ Registrar'))));
  body.appendChild(dataTable([
    { label: tx('When', 'Cuándo'), render: (e) => prettyDateTime(e.created_at) },
    { label: tx('Type', 'Tipo'), render: (e) => CARE_KIND[e.kind] },
    { label: tx('Details', 'Detalle'), render: (e) => e.body },
    { label: tx('Status', 'Estado'), render: (e) => pill(e.status, careStatus(e.status)) },
  ], data || [], { empty: tx('Nothing logged for this client.', 'No hay registros para esta clienta.') }));
});
