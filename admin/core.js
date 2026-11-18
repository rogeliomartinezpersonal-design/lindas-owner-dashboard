// Salon admin core: role-aware navigation, shared caches (settings, services, staff), bilingual
// text (ES/EN, following the dashboard's existing language toggle), formatting, and small UI
// building blocks used by every admin section (docs/admin/*.js).
//
// Security note: every element here is built with h(), which inserts text as text nodes, never
// as HTML. Customer-controlled values (names, notes, references) can't inject markup or script.
// Permissions shown in the UI are a convenience only: the database enforces them (RLS, triggers,
// SECURITY DEFINER functions in supabase/migrations/2026110910*).
/* global supabaseClient, LANG */

const Admin = {
  access: null,        // { role, staff_id, display_name }
  settings: null,      // salon_settings row
  services: [],
  addons: [],
  staff: [],
  modules: {},         // id -> { label: [en, es], roles, group: [en, es], render(panel) }
  order: [],
  current: null,
};

// ---------- Language ----------
// LANG lives in docs/app.js (the existing ES/EN toggle, Spanish by default).
function curLang() {
  try { return LANG === 'en' ? 'en' : 'es'; } catch { return 'es'; }
}
function tx(en, es) { return curLang() === 'es' ? es : en; }
function locale() { return curLang() === 'es' ? 'es-MX' : 'en-US'; }
// A label map whose entries are [english, spanish]; reading a key returns the current language.
function biMap(obj) {
  return new Proxy(obj, { get: (o, k) => (Array.isArray(o[k]) ? tx(o[k][0], o[k][1]) : o[k]) });
}
const labelOf = (pair) => (Array.isArray(pair) ? tx(pair[0], pair[1]) : pair);

// ---------- DOM ----------
function h(tag, attrs, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, String(v));
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    node.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}
function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

// ---------- Formatting ----------
function money(cents) {
  const currency = Admin.settings?.currency || 'USD';
  // narrowSymbol: "$60.16" in both languages (es-MX would otherwise print "USD 60.16").
  return new Intl.NumberFormat(locale(), { style: 'currency', currency, currencyDisplay: 'narrowSymbol' }).format((cents || 0) / 100);
}
function toCents(value) {
  const n = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}
function tz() { return Admin.settings?.timezone || 'America/Chicago'; }
// Calendar date (YYYY-MM-DD) in the salon's time zone, not the browser's.
function salonDateKey(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz(), year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}
function prettyDate(key, opts = { weekday: 'short', month: 'short', day: 'numeric' }) {
  if (!key) return '—';
  const [y, m, d] = key.split('-').map(Number);
  const s = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale(), { ...opts, timeZone: 'UTC' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function prettyDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(locale(), { timeZone: tz(), month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function timeToMinutes(t) {
  const m = /^(\d{1,2}):(\d{2}) (AM|PM)$/.exec(t || '');
  if (!m) return 0;
  return ((Number(m[1]) % 12) + (m[3] === 'PM' ? 12 : 0)) * 60 + Number(m[2]);
}
function minutesToTime(min) {
  const h24 = Math.floor(min / 60) % 24;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(min % 60).padStart(2, '0')} ${h24 >= 12 ? 'PM' : 'AM'}`;
}
function formatPhone(p) {
  const d = (p || '').replace(/\D/g, '');
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : (p || '');
}
function waHref(phone, text) {
  const d = (phone || '').replace(/\D/g, '');
  if (!d) return null;
  return `https://wa.me/${d.length === 10 ? '1' + d : d}${text ? '?text=' + encodeURIComponent(text) : ''}`;
}
function serviceLabel(id) { const s = Admin.services.find((x) => x.id === id); return s ? tx(s.name_en, s.name_es) : id; }
function addonLabel(id) { const a = Admin.addons.find((x) => x.id === id); return a ? tx(a.name_en, a.name_es) : id; }
function staffLabel(id) { return Admin.staff.find((s) => s.id === id)?.display_name ?? '—'; }
function newKey() { return (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()) + Math.random(); }

const STATUS_TEXT = biMap({ upcoming: ['Upcoming', 'Próxima'], done: ['Completed', 'Completada'], cancelled: ['Cancelled', 'Cancelada'], no_show: ['No-show', 'No asistió'] });
const PAY_TEXT = biMap({
  unpaid: ['Unpaid', 'Sin pagar'], deposit: ['Deposit', 'Anticipo'], partial: ['Partly paid', 'Pago parcial'], paid: ['Paid', 'Pagada'],
  refunded: ['Refunded', 'Reembolsada'], partially_refunded: ['Part refunded', 'Reembolso parcial'],
});
const ROLE_TEXT = biMap({ owner: ['Owner', 'Propietaria'], reception: ['Reception', 'Recepción'], employee: ['Employee', 'Empleada'] });
function pill(kind, text) { return h('span', { class: `pill pill-${kind}` }, text); }
function demoBadge(row) { return row?.is_demo ? h('span', { class: 'pill pill-demo', title: tx('Demo data — not real', 'Datos de demostración — no reales') }, 'DEMO') : null; }

// ---------- Errors ----------
// Database functions raise English messages; show them in the current language, with money
// amounts (stored in cents) formatted.
const ERROR_PATTERNS = [
  [/payment_required: (\d+)/, (m) => tx(`Record the full payment first: ${money(+m[1])} still due.`, `Registra el pago completo primero: faltan ${money(+m[1])}.`)],
  [/more than the (\d+) still due/, (m) => tx(`That's more than the ${money(+m[1])} still due.`, `Es más de lo que falta por cobrar (${money(+m[1])}).`)],
  [/only ([\d.]+) of "(.+)" in stock/, (m) => tx(`Only ${Number(m[1])} of "${m[2]}" in stock. Count inventory before selling more.`, `Solo hay ${Number(m[1])} de "${m[2]}" en existencia. Haz un conteo de inventario antes de vender más.`)],
  [/refund exceeds what was paid \((\d+) left/, (m) => tx(`The refund is more than what was paid (${money(+m[1])} left to refund).`, `El reembolso supera lo pagado (quedan ${money(+m[1])} por reembolsar).`)],
  [/cannot return/, () => tx('You can\'t return more units than were sold.', 'No se pueden devolver más unidades de las vendidas.')],
  [/a reason is required/, () => tx('A reason is required.', 'Se requiere un motivo.')],
  [/sale is \w+ and can no longer be changed/, () => tx('This sale is closed and can no longer be changed.', 'Esta venta ya está cerrada y no se puede cambiar.')],
  [/discount code is not active/, () => tx('That discount code is not active.', 'Ese código de descuento no está activo.')],
  [/discount must be between/, () => tx('The discount must be between 0 and the subtotal.', 'El descuento debe estar entre 0 y el subtotal.')],
  [/would leave more paid than the total/, () => tx('That would leave more paid than the total. The owner must void a payment first.', 'Eso dejaría pagado más que el total. La propietaria debe anular un pago primero.')],
  [/add at least one (item|line) first/, () => tx('Add at least one item first.', 'Agrega al menos un artículo primero.')],
  [/this sale has recorded payments/, () => tx('This sale has recorded payments; the owner must void them first.', 'Esta venta tiene pagos registrados; la propietaria debe anularlos primero.')],
  [/only completed sales can be refunded/, () => tx('Only completed sales can be refunded.', 'Solo se pueden reembolsar ventas completadas.')],
  [/nothing to refund/, () => tx('Choose items to return or an amount to refund.', 'Elige artículos a devolver o un monto a reembolsar.')],
  [/cannot receive/, () => tx('You can\'t receive more than was ordered.', 'No se puede recibir más de lo que se pidió.')],
  [/only placed orders can be received/, () => tx('Only placed orders can be received.', 'Solo se pueden recibir órdenes ya enviadas.')],
  [/nothing to receive/, () => tx('Enter at least one quantity received.', 'Ingresa al menos una cantidad recibida.')],
  [/lines can only change while the order is a draft/, () => tx('Lines can only change while the order is a draft.', 'Las líneas solo se pueden cambiar mientras la orden es borrador.')],
  [/only draft orders can be placed/, () => tx('Only draft orders can be placed.', 'Solo se pueden enviar órdenes en borrador.')],
  [/only draft or ordered/, () => tx('Orders with deliveries received can\'t be cancelled; close them instead.', 'Las órdenes con entregas recibidas no se pueden cancelar; ciérralas en su lugar.')],
  [/nothing to pay for that period/, () => tx('There are no unpaid commissions in that period.', 'No hay comisiones pendientes en ese periodo.')],
  [/would exceed its total/, () => tx('Payments for this order would exceed its total.', 'Los pagos de esta orden superarían su total.')],
  [/service_not_bookable/, () => tx('That service isn\'t available for booking.', 'Ese servicio no está disponible para reservar.')],
  [/unknown or inactive/, () => tx('That item is unknown or inactive.', 'Ese artículo no existe o está inactivo.')],
  [/already linked to a staff member/, () => tx('This login is already linked to a team member.', 'Esta cuenta ya está vinculada a un miembro del equipo.')],
  [/already has a login/, () => tx('This team member already has a login.', 'Este miembro del equipo ya tiene una cuenta.')],
  [/time zone/, () => tx('Unknown time zone.', 'Zona horaria desconocida.')],
  [/an appointment needs a client/, () => tx('Choose a client.', 'Elige una clienta.')],
  [/unknown add-on/, () => tx('Unknown add-on.', 'Extra desconocido.')],
  [/already voided|not found or already voided/, () => tx('Already voided.', 'Ya estaba anulado.')],
  [/adjustment must change the quantity/, () => tx('The adjustment must change the quantity.', 'El ajuste debe cambiar la cantidad.')],
  [/item already has stock history/, () => tx('This item already has stock history; use a count instead.', 'Este artículo ya tiene historial; usa un conteo.')],
  [/care entries are kept as written/, () => tx('Entries are kept as written; add a new entry instead.', 'Las entradas se guardan tal como se escribieron; agrega una nueva.')],
];
function friendlyError(error) {
  if (!error) return '';
  const msg = error.message || String(error);
  if (error.code === '23505') {
    if (msg.includes('staff_double_booked')) return tx('That staff member already has an appointment at that time.', 'Esa persona del equipo ya tiene una cita a esa hora.');
    if (msg.includes('slot_unavailable')) return tx('That time overlaps other appointments and the salon is at capacity. Pick another time.', 'Ese horario se cruza con otras citas y el salón está lleno. Elige otra hora.');
    return tx('That already exists (duplicate).', 'Eso ya existe (duplicado).');
  }
  if (error.code === '42501') return tx("You don't have permission to do that.", 'No tienes permiso para hacer eso.');
  if (error.code === 'PGRST202') return tx('The database has not been updated for this feature yet.', 'La base de datos todavía no está actualizada para esta función.');
  if (error.code === '23514' && /card/.test(msg)) return tx('That looks like a card number. Never store card numbers; use the receipt number.', 'Eso parece un número de tarjeta. Nunca guardes números de tarjeta; usa el número de recibo.');
  for (const [re, fn] of ERROR_PATTERNS) {
    const m = re.exec(msg);
    if (m) return fn(m);
  }
  return msg;
}

// ---------- Toast ----------
function toast(message, kind = 'ok') {
  let host = document.getElementById('adminToastHost');
  if (!host) {
    host = h('div', { id: 'adminToastHost', class: 'toast-host', 'aria-live': 'polite' });
    document.body.appendChild(host);
  }
  const node = h('div', { class: `toast toast-${kind}` }, message);
  host.appendChild(node);
  setTimeout(() => node.remove(), kind === 'error' ? 6000 : 3200);
}

// ---------- Modal forms ----------
// fields: [{ name, label, type: text|number|money|date|time|select|textarea|checkbox|checks|info,
//            value, options: [{value,label,disabled}], required, min, max, step, hint, full }]
function openForm({ title, intro, fields, submitLabel, danger, onSubmit, wide }) {
  const overlay = h('div', { class: 'modal-overlay' });
  const errorP = h('p', { class: 'error hidden' });
  const inputs = {};

  const fieldNodes = fields.map((f) => {
    if (f.type === 'info') return h('div', { class: 'form-info' }, f.value);
    if (f.type === 'checkbox') {
      const input = h('input', { type: 'checkbox', name: f.name });
      input.checked = !!f.value;
      inputs[f.name] = input;
      return h('label', { class: 'checkbox-row' }, input, h('span', {}, f.label));
    }
    if (f.type === 'checks') {
      const boxes = (f.options || []).map((o) => {
        const cb = h('input', { type: 'checkbox', value: o.value });
        cb.checked = (f.value || []).includes(o.value);
        return h('label', { class: 'checkbox-row' }, cb, h('span', {}, o.label));
      });
      inputs[f.name] = { checks: boxes.map((b) => b.querySelector('input')) };
      return h('fieldset', { class: 'checks' }, h('legend', {}, f.label), boxes);
    }
    let input;
    if (f.type === 'select') {
      input = h('select', { name: f.name, required: f.required });
      for (const o of f.options || []) {
        const opt = h('option', { value: o.value, disabled: o.disabled }, o.label);
        if (String(o.value) === String(f.value ?? '')) opt.selected = true;
        input.appendChild(opt);
      }
    } else if (f.type === 'textarea') {
      input = h('textarea', { name: f.name, rows: 3, maxlength: f.max || 2000 });
      input.value = f.value ?? '';
    } else {
      const type = f.type === 'money' ? 'number' : f.type || 'text';
      input = h('input', {
        type, name: f.name, required: f.required, min: f.type === 'money' ? 0 : f.min, max: f.max,
        step: f.type === 'money' ? '0.01' : f.step, placeholder: f.placeholder, autocomplete: 'off',
      });
      input.value = f.type === 'money' && f.value !== undefined && f.value !== null ? (f.value / 100).toFixed(2) : (f.value ?? '');
    }
    inputs[f.name] = input;
    if (f.onChange) input.addEventListener('change', () => f.onChange(input.value, inputs));
    return h('label', { class: f.full ? 'full' : null }, h('span', {}, f.label + (f.required ? ' *' : '')), input,
      f.hint ? h('small', { class: 'hint' }, f.hint) : null);
  });

  function values() {
    const out = {};
    for (const f of fields) {
      const input = inputs[f.name];
      if (!input) continue;
      if (f.type === 'checkbox') out[f.name] = input.checked;
      else if (f.type === 'checks') out[f.name] = input.checks.filter((c) => c.checked).map((c) => c.value);
      else if (f.type === 'money') out[f.name] = input.value === '' ? null : toCents(input.value);
      else if (f.type === 'number') out[f.name] = input.value === '' ? null : Number(input.value);
      else out[f.name] = input.value.trim() === '' ? null : input.value.trim();
    }
    return out;
  }

  const submitBtn = h('button', { type: 'submit', class: danger ? 'danger' : null }, submitLabel || tx('Save', 'Guardar'));
  const form = h('form', {
    class: 'admin-form',
    onSubmit: async (e) => {
      e.preventDefault();
      errorP.classList.add('hidden');
      submitBtn.disabled = true;
      try {
        const result = await onSubmit(values(), inputs);
        if (result !== false) overlay.remove();
      } catch (err) {
        errorP.textContent = friendlyError(err);
        errorP.classList.remove('hidden');
      } finally {
        submitBtn.disabled = false;
      }
    },
  },
  h('div', { class: 'form-grid' }, fieldNodes),
  errorP,
  h('div', { class: 'modal-actions' }, h('span'),
    h('div', { class: 'modal-actions-right' },
      h('button', { type: 'button', class: 'ghost', onClick: () => overlay.remove() }, tx('Cancel', 'Cancelar')),
      submitBtn)));

  overlay.appendChild(h('div', { class: 'modal' + (wide ? ' modal-wide' : ''), role: 'dialog', 'aria-label': title },
    h('h2', {}, title), intro ? h('p', { class: 'panel-sub', style: { marginBottom: '14px' } }, intro) : null, form));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  const first = form.querySelector('input:not([type=checkbox]), select, textarea');
  if (first) first.focus();
  return { overlay, inputs };
}

function confirmAction(message, label) {
  return new Promise((resolve) => {
    const overlay = h('div', { class: 'modal-overlay' });
    const done = (v) => { overlay.remove(); resolve(v); };
    overlay.appendChild(h('div', { class: 'modal' },
      h('p', { class: 'confirm-text' }, message),
      h('div', { class: 'modal-actions' }, h('span'),
        h('div', { class: 'modal-actions-right' },
          h('button', { type: 'button', class: 'ghost', onClick: () => done(false) }, tx('Back', 'Volver')),
          h('button', { type: 'button', onClick: () => done(true) }, label || tx('Confirm', 'Confirmar'))))));
    document.body.appendChild(overlay);
  });
}

// ---------- Tables / empty states / headers ----------
function dataTable(columns, rows, { empty, onRow } = {}) {
  if (!rows.length) return emptyState(empty || tx('Nothing here yet.', 'Todavía no hay nada aquí.'));
  return h('div', { class: 'table-wrap' },
    h('table', { class: 'data-table' },
      h('thead', {}, h('tr', {}, columns.map((c) => h('th', { class: c.num ? 'num' : null }, c.label)))),
      h('tbody', {}, rows.map((r) => h('tr', { class: onRow ? 'clickable' : null, onClick: onRow ? () => onRow(r) : null },
        columns.map((c) => h('td', { class: c.num ? 'num' : null, 'data-label': c.label }, c.render ? c.render(r) : (r[c.key] ?? '—'))))))));
}
function emptyState(text, action) {
  return h('div', { class: 'empty-state' }, h('p', {}, text), action || null);
}
function panelHead(title, sub, ...actions) {
  return h('div', { class: 'panel-head' },
    h('div', {}, h('h2', {}, title), sub ? h('p', { class: 'panel-sub' }, sub) : null),
    actions.filter(Boolean).length ? h('div', { class: 'panel-actions' }, actions) : null);
}
function statTile(value, label, opts = {}) {
  return h('div', { class: 'stat-tile' + (opts.warn ? ' warn' : '') }, h('span', { class: 'stat-value' }, value), h('span', { class: 'stat-label' }, label));
}
function filterRow(current, options, onPick) {
  return h('div', { class: 'filters', style: { marginBottom: '12px' } },
    options.map(([k, en, es]) => h('button', { class: 'filter' + (current === k ? ' active' : ''), onClick: () => onPick(k) }, tx(en, es))));
}
function loadingNode() { return h('p', { class: 'muted' }, tx('Loading…', 'Cargando…')); }

// ---------- Shared data ----------
async function loadReference() {
  const [settings, services, addons, staff] = await Promise.all([
    supabaseClient.from('salon_settings').select('*').maybeSingle(),
    supabaseClient.from('services').select('*').order('sort_order'),
    supabaseClient.from('addons').select('*').order('sort_order'),
    supabaseClient.from('staff_members').select('*').order('display_name'),
  ]);
  Admin.settings = settings.data || { currency: 'USD', timezone: 'America/Chicago', capacity: 1, slot_minutes: 30, product_tax_bp: 0, show_demo_data: false };
  Admin.services = services.data || [];
  Admin.addons = addons.data || [];
  Admin.staff = staff.data || [];
}
function showDemo() { return !!Admin.settings?.show_demo_data; }
function hasRole(...roles) { return roles.includes(Admin.access?.role); }

// ---------- Navigation ----------
function registerModule(id, def) {
  Admin.modules[id] = def;
  if (!Admin.order.includes(id)) Admin.order.push(id);
}

const GROUPS = {
  daily: ['Daily', 'Día a día'], business: ['Business', 'Negocio'], insights: ['Insights', 'Análisis'],
  marketing: ['Marketing', 'Marketing'], settings: ['Settings', 'Configuración'], me: ['Me', 'Mi cuenta'],
};
// Built-in sections that already existed (panels live in index.html, logic in app.js).
const LEGACY = {
  overview: { label: ['Overview', 'Resumen'], group: GROUPS.insights, roles: ['owner'], panel: 'tabOverview' },
  discounts: { label: ['Discounts', 'Descuentos'], group: GROUPS.marketing, roles: ['owner'], panel: 'tabDiscounts' },
  messages: { label: ['WhatsApp', 'WhatsApp'], group: GROUPS.marketing, roles: ['owner'], panel: 'tabMessages' },
};
const NAV_ORDER = ['home', 'agenda', 'clients', 'sales', 'inventory', 'care', 'purchasing', 'team', 'finance',
  'shop', 'reports', 'overview', 'discounts', 'messages', 'services', 'settings', 'mycommissions'];

function buildNav() {
  const nav = document.getElementById('adminNav');
  clear(nav);
  const role = Admin.access.role;
  const items = NAV_ORDER.map((id) => [id, Admin.modules[id] || LEGACY[id]]).filter(([, d]) => d && d.roles.includes(role));
  let lastGroup = null;
  for (const [id, def] of items) {
    const group = def.group ? labelOf(def.group) : null;
    if (group && group !== lastGroup) {
      nav.appendChild(h('span', { class: 'nav-group' }, group));
      lastGroup = group;
    }
    nav.appendChild(h('button', { type: 'button', class: 'nav-item' + (id === Admin.current ? ' active' : ''), dataset: { section: id }, onClick: () => showSection(id) }, labelOf(def.label)));
  }
  const sel = document.getElementById('adminNavSelect');
  clear(sel);
  for (const [id, def] of items) sel.appendChild(h('option', { value: id }, (def.group ? labelOf(def.group) + ' · ' : '') + labelOf(def.label)));
  if (Admin.current) sel.value = Admin.current;
  sel.onchange = () => showSection(sel.value);
  updateRoleBadge();
}
function updateRoleBadge() {
  const a = Admin.access;
  if (!a) return;
  document.getElementById('roleBadge').textContent = `${a.display_name || ''}${a.display_name ? ' · ' : ''}${ROLE_TEXT[a.role]}`;
}

function showSection(id) {
  const def = Admin.modules[id] || LEGACY[id];
  if (!def || !def.roles.includes(Admin.access.role)) return;
  Admin.current = id;
  document.querySelectorAll('#adminNav .nav-item').forEach((b) => b.classList.toggle('active', b.dataset.section === id));
  document.getElementById('adminNavSelect').value = id;
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.add('hidden'));
  let panel;
  if (def.panel) {
    panel = document.getElementById(def.panel);
  } else {
    panel = document.getElementById('panel-' + id);
    if (!panel) {
      panel = h('div', { id: 'panel-' + id, class: 'tab-panel' });
      document.getElementById('adminPanels').appendChild(panel);
    }
    clear(panel).appendChild(loadingNode());
    Promise.resolve(def.render(panel)).catch((e) => {
      clear(panel).appendChild(h('p', { class: 'error' }, friendlyError(e)));
    });
  }
  panel.classList.remove('hidden');
  try { localStorage.setItem('lindas_admin_section', id); } catch { /* storage may be blocked */ }
  window.scrollTo({ top: 0 });
}
function refreshSection() { if (Admin.current) showSection(Admin.current); }

// Called by docs/app.js when the ES/EN toggle changes.
function refreshAdminLanguage() {
  if (!Admin.access) return;
  buildNav();
  refreshSection();
}

async function startAdmin(access) {
  Admin.access = access;
  await loadReference();
  buildNav();
  const allowed = (id) => { const d = Admin.modules[id] || LEGACY[id]; return d && d.roles.includes(access.role); };
  let start = NAV_ORDER.find(allowed);
  try {
    const saved = localStorage.getItem('lindas_admin_section');
    if (saved && allowed(saved)) start = saved;
  } catch { /* ignore */ }
  if (start) showSection(start);
}
