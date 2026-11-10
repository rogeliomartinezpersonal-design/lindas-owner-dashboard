const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------- i18n ----------
const STRINGS = {
  es: {
    brandSub: 'Panel de propietaria', logout: 'Cerrar sesión',
    tabLogin: 'Iniciar sesión', tabSignup: 'Crear cuenta',
    emailLabel: 'Correo', passwordLabel: 'Contraseña', enterBtn: 'Entrar',
    nameLabel: 'Tu nombre', phoneLabel: 'Tu teléfono',
    claimTitle: 'Acceso de propietaria',
    claimBody: 'Esta cuenta todavía no tiene acceso de propietaria. Ingresa el código de configuración (te lo dio quien instaló este panel) para activarlo una sola vez.',
    codeLabel: 'Código', claimBtn: 'Activar acceso',
    tabOverview: 'Resumen', tabDiscounts: 'Descuentos', tabMessages: 'Mensajes',
    statToday: 'Citas hoy', statWeek: 'Esta semana', statRevenue: 'Ingresos del mes', statCustomers: 'Clientas',
    chartApptsTitle: 'Citas — últimos 14 días', chartServicesTitle: 'Servicios más solicitados',
    today: 'Hoy', searchPlaceholder: 'Buscar por nombre o teléfono…',
    filterUpcoming: 'Próximas', filterDone: 'Completadas', filterCancelled: 'Canceladas', filterAll: 'Todas',
    refresh: 'Actualizar', viewAll: 'Ver todas', loading: 'Cargando…', noApptsInView: 'No hay citas en esta vista.',
    noDataYet: 'Todavía no hay datos suficientes.',
    discountsHeading: 'Descuentos', discountsHeadingSub: 'Códigos activos en la app ahora mismo. Los cambios aquí se reflejan al instante.',
    newDiscount: '+ Nuevo descuento', pctLabel: '% Desc.', titleEsLabel: 'Título (Español)', titleEnLabel: 'Título (English)',
    subEsLabel: 'Descripción (Español)', subEnLabel: 'Descripción (English)', expiresLabel: 'Vence (opcional)',
    themeLabel: 'Color', activeLabel: 'Activo', delete: 'Eliminar', cancelBtn: 'Cancelar', saveBtn: 'Guardar',
    noExpiration: 'Sin vencimiento', expiresPrefix: 'Expira',
    confirmDeleteDiscount: '¿Eliminar este descuento? Dejará de funcionar en la app de inmediato.',
    messagesHeading: 'Mensajes por WhatsApp',
    messagesHeadingSub: 'Cada envío abre WhatsApp con un chat real y el mensaje ya escrito — un clic por clienta, no hay envío masivo automático.',
    audienceLabel: 'Audiencia', audAll: 'Todas las clientas', audUpcoming: 'Con cita próxima',
    audLapsed: 'Inactivas 30+ días', audNearReward: 'Cerca de su premio',
    templatesLabel: 'Plantillas rápidas', template: 'Plantilla', messageLabel: 'Mensaje',
    nameHint: 'Usa {nombre} — se reemplaza por el nombre real de cada clienta.',
    recipientsLabel: 'Destinatarias', noRecipients: 'Nadie en esta audiencia todavía.', sendBtn: 'Enviar',
  },
  en: {
    brandSub: "Owner's panel", logout: 'Log out',
    tabLogin: 'Log in', tabSignup: 'Create account',
    emailLabel: 'Email', passwordLabel: 'Password', enterBtn: 'Enter',
    nameLabel: 'Your name', phoneLabel: 'Your phone',
    claimTitle: 'Owner access',
    claimBody: "This account doesn't have owner access yet. Enter the setup code (whoever installed this panel gave it to you) to activate it, once.",
    codeLabel: 'Code', claimBtn: 'Activate access',
    tabOverview: 'Overview', tabDiscounts: 'Discounts', tabMessages: 'Messages',
    statToday: "Today's appts", statWeek: 'This week', statRevenue: "Month's revenue", statCustomers: 'Customers',
    chartApptsTitle: 'Appointments — last 14 days', chartServicesTitle: 'Most-booked services',
    today: 'Today', searchPlaceholder: 'Search by name or phone…',
    filterUpcoming: 'Upcoming', filterDone: 'Completed', filterCancelled: 'Cancelled', filterAll: 'All',
    refresh: 'Refresh', viewAll: 'View all', loading: 'Loading…', noApptsInView: 'No appointments in this view.',
    noDataYet: 'Not enough data yet.',
    discountsHeading: 'Discounts', discountsHeadingSub: "Codes active in the app right now. Changes here take effect instantly.",
    newDiscount: '+ New discount', pctLabel: '% Off', titleEsLabel: 'Title (Spanish)', titleEnLabel: 'Title (English)',
    subEsLabel: 'Description (Spanish)', subEnLabel: 'Description (English)', expiresLabel: 'Expires (optional)',
    themeLabel: 'Color', activeLabel: 'Active', delete: 'Delete', cancelBtn: 'Cancel', saveBtn: 'Save',
    noExpiration: 'No expiration', expiresPrefix: 'Expires',
    confirmDeleteDiscount: 'Delete this discount? It will stop working in the app immediately.',
    messagesHeading: 'WhatsApp messages',
    messagesHeadingSub: "Each send opens a real WhatsApp chat with the message already written — one click per client, there's no automatic mass-send.",
    audienceLabel: 'Audience', audAll: 'All clients', audUpcoming: 'Have an upcoming appt',
    audLapsed: 'Inactive 30+ days', audNearReward: 'Close to their reward',
    templatesLabel: 'Quick templates', template: 'Template', messageLabel: 'Message',
    nameHint: 'Use {nombre} — it gets replaced with each client\'s real name.',
    recipientsLabel: 'Recipients', noRecipients: 'No one in this audience yet.', sendBtn: 'Send',
  },
};

let LANG = localStorage.getItem('lindas_dashboard_lang') === 'en' ? 'en' : 'es';
function t(key) {
  return STRINGS[LANG]?.[key] ?? STRINGS.es[key] ?? key;
}
function applyTranslations() {
  document.documentElement.lang = LANG;
  document.querySelectorAll('[data-i18n]').forEach((elm) => { elm.textContent = t(elm.dataset.i18n); });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((elm) => { elm.placeholder = t(elm.dataset.i18nPlaceholder); });
}

// Mirrors lib/content.ts's SERVICES/ADDONS (bilingual names + prices). Duplicated rather than
// imported since this is a standalone static site with no build step — if a service/add-on is
// added, renamed, or repriced in the app, update it here too.
const SERVICES = {
  classicmani: { es: 'Manicure Clásico', en: 'Classic Manicure', price: 25 },
  gel: { es: 'Manicure en Gel', en: 'Gel Manicure', price: 35 },
  spamani: { es: 'Manicure Spa', en: 'Spa Manicure', price: 45 },
  fillin: { es: 'Relleno de Acrílico', en: 'Acrylic Fill-In', price: 40 },
  fullacrylic: { es: 'Set Completo Acrílico', en: 'Full Set Acrylic', price: 55 },
  gelx: { es: 'Set Completo Gel-X', en: 'Full Set Gel-X', price: 65 },
  classicped: { es: 'Pedicura Clásica', en: 'Classic Pedicure', price: 35 },
  pedspa: { es: 'Pedicura Spa', en: 'Spa Pedicure', price: 50 },
  nailart: { es: 'Nail Art Personalizado', en: 'Custom Nail Art', price: 85 },
};
const ADDONS = {
  french: { es: 'Diseño Francés', en: 'French Tip', price: 10 },
  stones: { es: 'Piedras / Cristales', en: 'Rhinestones', price: 8 },
  colorchange: { es: 'Cambio de Color', en: 'Color Change', price: 20 },
  repair: { es: 'Reparación de Uña', en: 'Nail Repair', price: 8 },
};
const THEME_COLORS = {
  rose: ['#B4707C', '#8B7368'],
  mauve: ['#8B7368', '#6E5850'],
  gold: ['#C9A876', '#B4707C'],
  plum: ['#9B6B8C', '#6E5850'],
};
const TEMPLATES = {
  es: [
    "Hola {nombre} 💅 tenemos un descuento especial esta semana en Linda's Nail Studio, ¡reserva tu cita!",
    'Hola {nombre}, ya pasaron unas semanas desde tu última visita. ¿Agendamos tu relleno?',
    '¡Gracias por tu preferencia, {nombre}! Ya casi llegas a tu servicio gratis 🎉',
  ],
  en: [
    "Hi {nombre} 💅 we have a special discount this week at Linda's Nail Studio, book your spot!",
    "Hi {nombre}, it has been a few weeks since your last visit. Want to schedule your fill-in?",
    'Thanks for being a loyal client, {nombre}! You are almost at your free service 🎉',
  ],
};
const DOW = { es: ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'], en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] };
const DOW_SHORT = { es: ['D', 'L', 'M', 'M', 'J', 'V', 'S'], en: ['S', 'M', 'T', 'W', 'T', 'F', 'S'] };
const STATUS_LABEL = { es: { upcoming: 'Próxima', done: 'Completada', cancelled: 'Cancelada' }, en: { upcoming: 'Upcoming', done: 'Completed', cancelled: 'Cancelled' } };

function serviceName(id) { return SERVICES[id]?.[LANG] ?? id; }
function addonName(id) { return ADDONS[id]?.[LANG] ?? id; }
function locale() { return LANG === 'es' ? 'es-MX' : 'en-US'; }

// Every value below can originate from a customer-controlled row (profiles.username,
// appointments.service_id/addon_ids) with no server-side format constraint — never interpolate
// any of it into innerHTML without escaping first, even values that "look" safe today.
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

const el = (id) => document.getElementById(id);
const authView = el('authView');
const claimView = el('claimView');
const dashView = el('dashView');
const logoutBtn = el('logoutBtn');
const langToggle = el('langToggle');

let currentFilter = 'upcoming';
let selectedDate = null; // 'YYYY-MM-DD' or null
let calendarMonth = new Date();
calendarMonth.setDate(1);
let lastLoadedAppointments = [];
let discounts = [];
let allCustomers = [];
let editingDiscountCode = null;
let currentAudience = 'all';

function showOnly(view) {
  for (const v of [authView, claimView, dashView]) v.classList.add('hidden');
  view.classList.remove('hidden');
  logoutBtn.classList.toggle('hidden', view === authView);
  langToggle.classList.toggle('hidden', view === authView);
}

function showError(elId, message) {
  const node = el(elId);
  node.textContent = message;
  node.classList.remove('hidden');
}
function clearError(elId) {
  el(elId).classList.add('hidden');
}

function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function apptTotal(a) {
  const base = SERVICES[a.service_id]?.price ?? 0;
  const addons = (a.addon_ids ?? []).reduce((sum, id) => sum + (ADDONS[id]?.price ?? 0), 0);
  return base + addons;
}

function waLink(phone) {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return null;
  const withCountry = digits.length === 10 ? '1' + digits : digits;
  return `https://wa.me/${withCountry}`;
}

// ---------- Language toggle ----------
document.querySelectorAll('#langToggle .lang-opt').forEach((btn) => {
  if (btn.dataset.lang === LANG) btn.classList.add('active');
  else btn.classList.remove('active');
  btn.addEventListener('click', () => {
    LANG = btn.dataset.lang;
    localStorage.setItem('lindas_dashboard_lang', LANG);
    document.querySelectorAll('#langToggle .lang-opt').forEach((b) => b.classList.toggle('active', b === btn));
    refreshAllUI();
  });
});

function refreshAllUI() {
  applyTranslations();
  renderCalendar();
  renderStats(lastLoadedAppointments);
  renderAppointments(lastLoadedAppointments);
  renderApptsChart();
  renderServicesChart();
  renderDiscounts();
  renderTemplates();
  renderAudienceCounts();
  renderRecipients();
  updateSelectedDateBanner();
}

// ---------- Auth tabs ----------
el('tabLogin').addEventListener('click', () => {
  el('tabLogin').classList.add('active');
  el('tabSignup').classList.remove('active');
  el('loginForm').classList.remove('hidden');
  el('signupForm').classList.add('hidden');
});
el('tabSignup').addEventListener('click', () => {
  el('tabSignup').classList.add('active');
  el('tabLogin').classList.remove('active');
  el('signupForm').classList.remove('hidden');
  el('loginForm').classList.add('hidden');
});

el('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError('loginError');
  const email = el('loginEmail').value.trim();
  const password = el('loginPassword').value;
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) showError('loginError', error.message);
});

el('signupForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError('signupError');
  const email = el('signupEmail').value.trim();
  const password = el('signupPassword').value;
  const name = el('signupName').value.trim();
  const phone = el('signupPhone').value.trim();

  const { data, error } = await supabaseClient.auth.signUp({ email, password });
  if (error) return showError('signupError', error.message);
  if (!data.user) return showError('signupError', 'Could not create the account.');
  if (!data.session) {
    return showError('signupError', 'Account created, but email confirmation is required. Ask for "Confirm email" to be disabled in Supabase.');
  }

  const { error: profileError } = await supabaseClient
    .from('profiles')
    .insert({ id: data.user.id, phone, username: name });
  if (profileError) return showError('signupError', profileError.message);
});

logoutBtn.addEventListener('click', () => supabaseClient.auth.signOut());

// ---------- Owner claim ----------
el('claimForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError('claimError');
  const code = el('claimCode').value.trim();
  const { data, error } = await supabaseClient.rpc('claim_owner', { p_secret: code });
  if (error) return showError('claimError', error.message);
  if (!data) return showError('claimError', 'Incorrect code.');
  await routeCurrentSession();
});

// ---------- Dashboard tabs ----------
document.querySelectorAll('#dashTabs .dtab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#dashTabs .dtab').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.add('hidden'));
    const targetId = 'tab' + btn.dataset.tab.charAt(0).toUpperCase() + btn.dataset.tab.slice(1);
    el(targetId).classList.remove('hidden');
  });
});

// ---------- Overview controls ----------
el('refreshBtn').addEventListener('click', loadAppointments);
el('searchInput').addEventListener('input', () => renderAppointments(lastLoadedAppointments));

document.querySelectorAll('#statusFilters .filter').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#statusFilters .filter').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.status;
    renderAppointments(lastLoadedAppointments);
  });
});

el('clearDateBtn').addEventListener('click', () => {
  selectedDate = null;
  renderCalendar();
  updateSelectedDateBanner();
  renderAppointments(lastLoadedAppointments);
});

el('calPrev').addEventListener('click', () => {
  calendarMonth.setMonth(calendarMonth.getMonth() - 1);
  renderCalendar();
});
el('calNext').addEventListener('click', () => {
  calendarMonth.setMonth(calendarMonth.getMonth() + 1);
  renderCalendar();
});
el('calTodayBtn').addEventListener('click', () => {
  calendarMonth = new Date();
  calendarMonth.setDate(1);
  renderCalendar();
});

function updateSelectedDateBanner() {
  const banner = el('selectedDateBanner');
  if (selectedDate) {
    el('selectedDateText').textContent = (LANG === 'es' ? 'Mostrando: ' : 'Showing: ') + formatDateHeading(selectedDate);
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }
}

// ---------- Data loading ----------
async function loadAppointments() {
  el('dashError').classList.add('hidden');
  el('emptyMsg').classList.add('hidden');
  el('loadingMsg').classList.remove('hidden');
  el('apptList').innerHTML = '';

  const { data: appts, error } = await supabaseClient
    .from('appointments')
    .select('id, status, service_id, addon_ids, appt_date, appt_time, user_id')
    .order('appt_date', { ascending: true })
    .order('appt_time', { ascending: true });

  el('loadingMsg').classList.add('hidden');

  if (error) {
    showError('dashError', 'No se pudieron cargar las citas: ' + error.message);
    return;
  }

  const userIds = [...new Set((appts ?? []).map((a) => a.user_id))];
  let profileById = {};
  if (userIds.length > 0) {
    const { data: profiles } = await supabaseClient.from('profiles').select('id, username, phone').in('id', userIds);
    profileById = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]));
  }

  lastLoadedAppointments = (appts ?? []).map((a) => ({ ...a, customer: profileById[a.user_id] }));
  renderStats(lastLoadedAppointments);
  renderCalendar();
  renderAppointments(lastLoadedAppointments);
  renderApptsChart();
  renderServicesChart();
  renderAudienceCounts();
  renderRecipients();
}

async function loadCustomers() {
  const { data } = await supabaseClient.from('profiles').select('id, username, phone').eq('is_owner', false);
  allCustomers = data ?? [];
  renderAudienceCounts();
  renderRecipients();
}

async function loadDiscounts() {
  clearError('discountsError');
  const { data, error } = await supabaseClient.from('discounts').select('*').order('created_at', { ascending: false });
  if (error) {
    showError('discountsError', error.message);
    return;
  }
  discounts = data ?? [];
  renderDiscounts();
}

// ---------- Stats ----------
function renderStats(appts) {
  const todayKey = dateKey(new Date());
  const weekEnd = new Date();
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekEndKey = dateKey(weekEnd);
  const monthPrefix = todayKey.slice(0, 7);

  const todayCount = appts.filter((a) => a.status === 'upcoming' && a.appt_date === todayKey).length;
  const weekCount = appts.filter((a) => a.status === 'upcoming' && a.appt_date >= todayKey && a.appt_date <= weekEndKey).length;
  const monthRevenue = appts
    .filter((a) => a.status === 'done' && a.appt_date.startsWith(monthPrefix))
    .reduce((sum, a) => sum + apptTotal(a), 0);
  const customerCount = new Set(appts.map((a) => a.user_id)).size;

  el('statToday').textContent = todayCount;
  el('statWeek').textContent = weekCount;
  el('statRevenue').textContent = '$' + monthRevenue;
  el('statCustomers').textContent = customerCount;
}

// ---------- Charts ----------
function renderApptsChart() {
  const container = el('apptsChart');
  const days = [];
  const today = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(dateKey(d));
  }
  const counts = days.map((k) => lastLoadedAppointments.filter((a) => a.appt_date === k && a.status !== 'cancelled').length);
  const max = Math.max(1, ...counts);

  const width = 520, height = 130, padBottom = 4, barGap = 4;
  const barW = (width - barGap * (days.length - 1)) / days.length;
  const usableH = height - padBottom - 6;

  let bars = '';
  days.forEach((k, i) => {
    const x = i * (barW + barGap);
    const h = counts[i] === 0 ? 2 : Math.max(4, (usableH * counts[i]) / max);
    const y = height - padBottom - h;
    bars += `<rect class="chart-bar" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="2.5" data-i="${i}"></rect>`;
  });

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" width="100%" style="display:block; overflow: visible;">
      <line class="chart-gridline" x1="0" y1="${height - padBottom}" x2="${width}" y2="${height - padBottom}"></line>
      ${bars}
    </svg>
    <div class="chart-tooltip" id="apptsChartTooltip"></div>
  `;

  const tooltip = el('apptsChartTooltip');
  container.querySelectorAll('.chart-bar').forEach((bar, i) => {
    bar.addEventListener('mouseenter', () => {
      const [y, m, d] = days[i].split('-').map(Number);
      const label = new Date(y, m - 1, d).toLocaleDateString(locale(), { month: 'short', day: 'numeric' });
      tooltip.textContent = `${counts[i]} · ${label}`;
      tooltip.style.opacity = '1';
      const rect = bar.getBoundingClientRect();
      const wrapRect = container.getBoundingClientRect();
      tooltip.style.left = rect.left - wrapRect.left + rect.width / 2 + 'px';
      tooltip.style.top = rect.top - wrapRect.top + 'px';
    });
    bar.addEventListener('mouseleave', () => { tooltip.style.opacity = '0'; });
  });
}

function renderServicesChart() {
  const counts = {};
  for (const a of lastLoadedAppointments) {
    if (a.status === 'cancelled') continue;
    counts[a.service_id] = (counts[a.service_id] || 0) + 1;
  }
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const container = el('servicesChart');
  if (entries.length === 0) {
    container.innerHTML = `<p class="rank-empty">${t('noDataYet')}</p>`;
    return;
  }
  const max = entries[0][1];
  container.innerHTML = entries
    .map(
      ([id, count]) => `
    <div class="rank-row">
      <span class="rank-label">${escapeHtml(serviceName(id))}</span>
      <div class="rank-bar-track"><div class="rank-bar-fill" style="width:${(count / max) * 100}%"></div></div>
      <span class="rank-value">${count}</span>
    </div>`
    )
    .join('');
}

// ---------- Calendar ----------
function renderCalendar() {
  const grid = el('calGrid');
  grid.innerHTML = '';

  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const monthLabel = calendarMonth.toLocaleDateString(locale(), { month: 'long', year: 'numeric' });
  el('calMonthLabel').textContent = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);

  for (const d of DOW_SHORT[LANG]) {
    const cell = document.createElement('div');
    cell.className = 'cal-dow';
    cell.textContent = d;
    grid.appendChild(cell);
  }

  const countsByDate = {};
  for (const a of lastLoadedAppointments) {
    if (a.status === 'cancelled') continue;
    countsByDate[a.appt_date] = (countsByDate[a.appt_date] || 0) + 1;
  }

  const todayKey = dateKey(new Date());
  const startOffset = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  for (let i = 0; i < startOffset; i++) {
    const blank = document.createElement('div');
    blank.className = 'cal-day empty';
    grid.appendChild(blank);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const count = countsByDate[key];

    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'cal-day';
    if (key === todayKey) cell.classList.add('today');
    if (key === selectedDate) cell.classList.add('selected');
    cell.innerHTML = `${day}${count ? `<span class="cal-dot">${count > 9 ? '9+' : count}</span>` : ''}`;
    cell.addEventListener('click', () => {
      selectedDate = selectedDate === key ? null : key;
      renderCalendar();
      updateSelectedDateBanner();
      renderAppointments(lastLoadedAppointments);
    });
    grid.appendChild(cell);
  }
}

// ---------- Appointment list ----------
function renderAppointments(appts) {
  let filtered = currentFilter === 'all' ? appts : appts.filter((a) => a.status === currentFilter);
  if (selectedDate) filtered = filtered.filter((a) => a.appt_date === selectedDate);

  const q = el('searchInput').value.trim().toLowerCase();
  if (q) {
    filtered = filtered.filter((a) => {
      const name = (a.customer?.username || '').toLowerCase();
      const phone = (a.customer?.phone || '').toLowerCase();
      return name.includes(q) || phone.includes(q);
    });
  }

  const list = el('apptList');
  list.innerHTML = '';

  if (filtered.length === 0) {
    el('emptyMsg').classList.remove('hidden');
    return;
  }
  el('emptyMsg').classList.add('hidden');

  const byDate = new Map();
  for (const a of filtered) {
    if (!byDate.has(a.appt_date)) byDate.set(a.appt_date, []);
    byDate.get(a.appt_date).push(a);
  }

  for (const [date, dayAppts] of byDate) {
    const group = document.createElement('div');
    group.className = 'day-group';

    const heading = document.createElement('div');
    heading.className = 'day-heading';
    heading.textContent = formatDateHeading(date);
    group.appendChild(heading);

    for (const a of dayAppts) group.appendChild(renderApptCard(a));
    list.appendChild(group);
  }
}

function formatDateHeading(dateKeyStr) {
  const [y, m, d] = dateKeyStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${DOW[LANG][date.getDay()]} ${d}/${m}/${y}`;
}

function renderApptCard(a) {
  const card = document.createElement('div');
  card.className = 'appt-card';

  const addonNames = escapeHtml((a.addon_ids ?? []).map((id) => addonName(id)).join(', '));
  const customerName = escapeHtml(a.customer?.username ?? '—');
  const customerPhone = escapeHtml(a.customer?.phone ?? '');
  const wa = waLink(a.customer?.phone ?? '');
  const total = apptTotal(a);

  card.innerHTML = `
    <div class="appt-time">${escapeHtml(a.appt_time)}</div>
    <div class="appt-main">
      <div class="appt-service">${escapeHtml(serviceName(a.service_id))} · $${total}</div>
      <div class="appt-customer">
        <span>${customerName}${customerPhone ? ' · ' + customerPhone : ''}</span>
        ${wa ? `<a href="${wa}" target="_blank" rel="noopener" class="wa-link" title="WhatsApp">💬</a>` : ''}
      </div>
      ${addonNames ? `<div class="appt-addons">+ ${addonNames}</div>` : ''}
    </div>
    <div class="appt-actions">
      <span class="status-pill status-${escapeHtml(a.status)}">${escapeHtml(STATUS_LABEL[LANG][a.status])}</span>
    </div>
  `;

  if (a.status === 'upcoming') {
    const actions = card.querySelector('.appt-actions');
    const doneBtn = document.createElement('button');
    doneBtn.className = 'done';
    doneBtn.textContent = t('filterDone');
    doneBtn.addEventListener('click', () => updateStatus(a.id, 'done'));

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'cancel';
    cancelBtn.textContent = t('filterCancelled');
    cancelBtn.addEventListener('click', () => updateStatus(a.id, 'cancelled'));

    actions.appendChild(doneBtn);
    actions.appendChild(cancelBtn);
  }

  return card;
}

async function updateStatus(id, status) {
  const { error } = await supabaseClient.from('appointments').update({ status }).eq('id', id);
  if (error) {
    showError('dashError', 'No se pudo actualizar: ' + error.message);
    return;
  }
  await loadAppointments();
}

// ---------- Discounts ----------
function renderDiscounts() {
  const list = el('discountsList');
  list.innerHTML = '';
  for (const d of discounts) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'discount-card' + (d.active ? '' : ' inactive');
    const colors = THEME_COLORS[d.theme] ?? THEME_COLORS.rose;
    card.style.background = `linear-gradient(135deg, ${colors[0]}, ${colors[1]})`;
    const title = escapeHtml(LANG === 'es' ? d.title_es : d.title_en);
    const sub = escapeHtml(LANG === 'es' ? d.sub_es : d.sub_en);
    card.innerHTML = `
      <div class="discount-pct">${d.pct}% OFF</div>
      <div class="discount-title">${title}</div>
      <div class="discount-sub">${sub}</div>
      <div class="discount-foot">
        <span class="discount-code">${escapeHtml(d.code)}</span>
        <span class="discount-exp">${formatExpiry(d.expires_at)}</span>
      </div>
    `;
    card.addEventListener('click', () => openDiscountModal(d));
    list.appendChild(card);
  }
  const addCard = document.createElement('button');
  addCard.type = 'button';
  addCard.className = 'discount-add-card';
  addCard.textContent = t('newDiscount');
  addCard.addEventListener('click', () => openDiscountModal(null));
  list.appendChild(addCard);
}

function formatExpiry(expiresAt) {
  if (!expiresAt) return t('noExpiration');
  const [y, m, d] = expiresAt.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return t('expiresPrefix') + ' ' + date.toLocaleDateString(locale(), { month: 'short', day: 'numeric', year: 'numeric' });
}

function openDiscountModal(discount) {
  editingDiscountCode = discount ? discount.code : null;
  el('discountModalTitle').textContent = discount ? discount.code : t('newDiscount');
  el('dCode').value = discount?.code ?? '';
  el('dCode').disabled = !!discount;
  el('dPct').value = discount?.pct ?? '';
  el('dTitleEs').value = discount?.title_es ?? '';
  el('dTitleEn').value = discount?.title_en ?? '';
  el('dSubEs').value = discount?.sub_es ?? '';
  el('dSubEn').value = discount?.sub_en ?? '';
  el('dExpires').value = discount?.expires_at ?? '';
  el('dTheme').value = discount?.theme ?? 'rose';
  el('dActive').checked = discount ? discount.active : true;
  el('deleteDiscountBtn').classList.toggle('hidden', !discount);
  clearError('discountFormError');
  el('discountModal').classList.remove('hidden');
}

function closeDiscountModal() {
  el('discountModal').classList.add('hidden');
}

el('newDiscountBtn').addEventListener('click', () => openDiscountModal(null));
el('cancelDiscountBtn').addEventListener('click', closeDiscountModal);
el('discountModal').addEventListener('click', (e) => {
  if (e.target.id === 'discountModal') closeDiscountModal();
});

el('discountForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError('discountFormError');
  const payload = {
    pct: parseInt(el('dPct').value, 10),
    title_es: el('dTitleEs').value.trim(),
    title_en: el('dTitleEn').value.trim(),
    sub_es: el('dSubEs').value.trim(),
    sub_en: el('dSubEn').value.trim(),
    expires_at: el('dExpires').value || null,
    theme: el('dTheme').value,
    active: el('dActive').checked,
  };

  const { error } = editingDiscountCode
    ? await supabaseClient.from('discounts').update(payload).eq('code', editingDiscountCode)
    : await supabaseClient.from('discounts').insert({ ...payload, code: el('dCode').value.trim().toUpperCase() });

  if (error) return showError('discountFormError', error.message);
  closeDiscountModal();
  await loadDiscounts();
});

el('deleteDiscountBtn').addEventListener('click', async () => {
  if (!editingDiscountCode) return;
  if (!confirm(t('confirmDeleteDiscount'))) return;
  const { error } = await supabaseClient.from('discounts').delete().eq('code', editingDiscountCode);
  if (error) return showError('discountFormError', error.message);
  closeDiscountModal();
  await loadDiscounts();
});

// ---------- Messages / WhatsApp ----------
function computeCustomerStats() {
  const byUser = {};
  for (const cust of allCustomers) {
    byUser[cust.id] = { id: cust.id, name: cust.username, phone: cust.phone, doneCount: 0, upcoming: null, lastVisit: null };
  }
  for (const a of lastLoadedAppointments) {
    const entry = byUser[a.user_id];
    if (!entry) continue;
    if (a.status === 'done') {
      entry.doneCount += 1;
      if (!entry.lastVisit || a.appt_date > entry.lastVisit) entry.lastVisit = a.appt_date;
    }
    if (a.status === 'upcoming') {
      if (!entry.upcoming || a.appt_date < entry.upcoming) entry.upcoming = a.appt_date;
    }
  }
  return Object.values(byUser);
}

function audienceFilter(stats, audience) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffKey = dateKey(cutoff);
  switch (audience) {
    case 'upcoming':
      return stats.filter((s) => s.upcoming);
    case 'lapsed':
      return stats.filter((s) => !s.upcoming && (!s.lastVisit || s.lastVisit < cutoffKey));
    case 'nearReward':
      return stats.filter((s) => s.doneCount > 0 && s.doneCount % 10 >= 7);
    default:
      return stats;
  }
}

function renderAudienceCounts() {
  const stats = computeCustomerStats();
  el('audCountAll').textContent = stats.length;
  el('audCountUpcoming').textContent = audienceFilter(stats, 'upcoming').length;
  el('audCountLapsed').textContent = audienceFilter(stats, 'lapsed').length;
  el('audCountNearReward').textContent = audienceFilter(stats, 'nearReward').length;
}

document.querySelectorAll('#audienceGrid .audience-opt').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#audienceGrid .audience-opt').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentAudience = btn.dataset.audience;
    renderRecipients();
  });
});

function renderTemplates() {
  const row = el('templateRow');
  row.innerHTML = '';
  TEMPLATES[LANG].forEach((tmpl, i) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'tmpl-chip';
    chip.textContent = t('template') + ' ' + (i + 1);
    chip.addEventListener('click', () => {
      el('msgDraft').value = tmpl;
      renderRecipients();
    });
    row.appendChild(chip);
  });
}

el('msgDraft').addEventListener('input', renderRecipients);

function renderRecipients() {
  const stats = computeCustomerStats();
  const filtered = audienceFilter(stats, currentAudience).filter((s) => s.phone);
  const list = el('recipientsList');
  list.innerHTML = '';
  el('recipientsHeading').textContent = `${t('recipientsLabel')} (${filtered.length})`;

  if (filtered.length === 0) {
    list.innerHTML = `<p class="rank-empty">${t('noRecipients')}</p>`;
    return;
  }

  const draft = el('msgDraft').value;
  for (const s of filtered) {
    const personalized = draft.replace(/\{nombre\}|\{name\}/gi, s.name || '');
    const link = waLink(s.phone);
    const row = document.createElement('div');
    row.className = 'recipient-row';
    row.innerHTML = `
      <div class="recipient-info">
        <div class="recipient-name">${escapeHtml(s.name)}</div>
        <div class="recipient-meta">${escapeHtml(s.phone)}</div>
      </div>
      ${link ? `<a class="recipient-send" href="${link}?text=${encodeURIComponent(personalized)}" target="_blank" rel="noopener">💬 ${escapeHtml(t('sendBtn'))}</a>` : ''}
    `;
    list.appendChild(row);
  }
}

// ---------- Routing based on session/owner status ----------
async function routeCurrentSession() {
  const { data: sessionData } = await supabaseClient.auth.getSession();
  const session = sessionData.session;

  if (!session) {
    showOnly(authView);
    return;
  }

  const { data: profile, error } = await supabaseClient
    .from('profiles')
    .select('is_owner')
    .eq('id', session.user.id)
    .single();

  if (error || !profile?.is_owner) {
    showOnly(claimView);
    return;
  }

  showOnly(dashView);
  await Promise.all([loadAppointments(), loadCustomers(), loadDiscounts()]);
  renderTemplates();
}

applyTranslations();
supabaseClient.auth.onAuthStateChange(() => routeCurrentSession());
routeCurrentSession();
