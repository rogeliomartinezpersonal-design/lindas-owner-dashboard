const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Mirrors lib/content.ts's SERVICES/ADDONS (Spanish names + prices). Duplicated rather than
// imported since this is a standalone static site with no build step — if a service/add-on is
// added, renamed, or repriced in the app, update it here too.
const SERVICES = {
  classicmani: { name: 'Manicure Clásico', price: 25 },
  gel: { name: 'Manicure en Gel', price: 35 },
  spamani: { name: 'Manicure Spa', price: 45 },
  fillin: { name: 'Relleno de Acrílico', price: 40 },
  fullacrylic: { name: 'Set Completo Acrílico', price: 55 },
  gelx: { name: 'Set Completo Gel-X', price: 65 },
  classicped: { name: 'Pedicura Clásica', price: 35 },
  pedspa: { name: 'Pedicura Spa', price: 50 },
  nailart: { name: 'Nail Art Personalizado', price: 85 },
};
const ADDONS = {
  french: { name: 'Diseño Francés', price: 10 },
  stones: { name: 'Piedras / Cristales', price: 8 },
  colorchange: { name: 'Cambio de Color', price: 20 },
  repair: { name: 'Reparación de Uña', price: 8 },
};
const DOW = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DOW_SHORT = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const STATUS_LABEL = { upcoming: 'Próxima', done: 'Completada', cancelled: 'Cancelada' };

const el = (id) => document.getElementById(id);
const authView = el('authView');
const claimView = el('claimView');
const dashView = el('dashView');
const logoutBtn = el('logoutBtn');

let currentFilter = 'upcoming';
let selectedDate = null; // 'YYYY-MM-DD' or null
let calendarMonth = new Date();
calendarMonth.setDate(1);
let lastLoadedAppointments = [];

function showOnly(view) {
  for (const v of [authView, claimView, dashView]) v.classList.add('hidden');
  view.classList.remove('hidden');
  logoutBtn.classList.toggle('hidden', view === authView);
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
  if (error) showError('loginError', 'No se pudo iniciar sesión: ' + error.message);
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
  if (!data.user) return showError('signupError', 'No se pudo crear la cuenta.');
  if (!data.session) {
    return showError(
      'signupError',
      'Cuenta creada, pero falta confirmar el correo. Pide que se desactive "Confirm email" en Supabase.'
    );
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
  if (!data) return showError('claimError', 'Código incorrecto.');
  await routeCurrentSession();
});

// ---------- Dashboard controls ----------
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
    el('selectedDateText').textContent = 'Mostrando: ' + formatDateHeading(selectedDate);
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

// ---------- Calendar ----------
function renderCalendar() {
  const grid = el('calGrid');
  grid.innerHTML = '';

  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const monthLabel = calendarMonth.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
  el('calMonthLabel').textContent = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);

  for (const d of DOW_SHORT) {
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
  return `${DOW[date.getDay()]} ${d}/${m}/${y}`;
}

function renderApptCard(a) {
  const card = document.createElement('div');
  card.className = 'appt-card';

  const addonNames = (a.addon_ids ?? []).map((id) => ADDONS[id]?.name ?? id).join(', ');
  const customerName = a.customer?.username ?? '—';
  const customerPhone = a.customer?.phone ?? '';
  const wa = waLink(customerPhone);
  const total = apptTotal(a);
  const serviceName = SERVICES[a.service_id]?.name ?? a.service_id;

  card.innerHTML = `
    <div class="appt-time">${a.appt_time}</div>
    <div class="appt-main">
      <div class="appt-service">${serviceName} · $${total}</div>
      <div class="appt-customer">
        <span>${customerName}${customerPhone ? ' · ' + customerPhone : ''}</span>
        ${wa ? `<a href="${wa}" target="_blank" rel="noopener" class="wa-link" title="Enviar WhatsApp">💬</a>` : ''}
      </div>
      ${addonNames ? `<div class="appt-addons">+ ${addonNames}</div>` : ''}
    </div>
    <div class="appt-actions">
      <span class="status-pill status-${a.status}">${STATUS_LABEL[a.status]}</span>
    </div>
  `;

  if (a.status === 'upcoming') {
    const actions = card.querySelector('.appt-actions');
    const doneBtn = document.createElement('button');
    doneBtn.className = 'done';
    doneBtn.textContent = 'Completada';
    doneBtn.addEventListener('click', () => updateStatus(a.id, 'done'));

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'cancel';
    cancelBtn.textContent = 'Cancelar';
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
  await loadAppointments();
}

supabaseClient.auth.onAuthStateChange(() => routeCurrentSession());
routeCurrentSession();
