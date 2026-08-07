const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Mirrors lib/content.ts's SERVICES/ADDONS Spanish names. Duplicated rather than imported since
// this is a standalone static site with no build step — if a service/add-on is added or renamed
// in the app, update it here too.
const SERVICE_NAMES = {
  classicmani: 'Manicure Clásico',
  gel: 'Manicure en Gel',
  spamani: 'Manicure Spa',
  fillin: 'Relleno de Acrílico',
  fullacrylic: 'Set Completo Acrílico',
  gelx: 'Set Completo Gel-X',
  classicped: 'Pedicura Clásica',
  pedspa: 'Pedicura Spa',
  nailart: 'Nail Art Personalizado',
};
const ADDON_NAMES = {
  french: 'Diseño Francés',
  stones: 'Piedras / Cristales',
  colorchange: 'Cambio de Color',
  repair: 'Reparación de Uña',
};
const DOW = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const STATUS_LABEL = { upcoming: 'Próxima', done: 'Completada', cancelled: 'Cancelada' };

const el = (id) => document.getElementById(id);
const authView = el('authView');
const claimView = el('claimView');
const dashView = el('dashView');
const logoutBtn = el('logoutBtn');

let currentFilter = 'upcoming';

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
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) showError('loginError', 'No se pudo iniciar sesión: ' + error.message);
});

el('signupForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError('signupError');
  const email = el('signupEmail').value.trim();
  const password = el('signupPassword').value;
  const name = el('signupName').value.trim();
  const phone = el('signupPhone').value.trim();

  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return showError('signupError', error.message);
  if (!data.user) return showError('signupError', 'No se pudo crear la cuenta.');
  if (!data.session) {
    return showError(
      'signupError',
      'Cuenta creada, pero falta confirmar el correo. Pide que se desactive "Confirm email" en Supabase.'
    );
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .insert({ id: data.user.id, phone, username: name });
  if (profileError) return showError('signupError', profileError.message);
});

logoutBtn.addEventListener('click', () => supabase.auth.signOut());

// ---------- Owner claim ----------
el('claimForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError('claimError');
  const code = el('claimCode').value.trim();
  const { data, error } = await supabase.rpc('claim_owner', { p_secret: code });
  if (error) return showError('claimError', error.message);
  if (!data) return showError('claimError', 'Código incorrecto.');
  await routeCurrentSession();
});

// ---------- Dashboard ----------
el('refreshBtn').addEventListener('click', loadAppointments);
document.querySelectorAll('#statusFilters .filter').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#statusFilters .filter').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.status;
    renderAppointments(lastLoadedAppointments);
  });
});

let lastLoadedAppointments = [];

async function loadAppointments() {
  el('dashError').classList.add('hidden');
  el('emptyMsg').classList.add('hidden');
  el('loadingMsg').classList.remove('hidden');
  el('apptList').innerHTML = '';

  const { data: appts, error } = await supabase
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
    const { data: profiles } = await supabase.from('profiles').select('id, username, phone').in('id', userIds);
    profileById = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]));
  }

  lastLoadedAppointments = (appts ?? []).map((a) => ({ ...a, customer: profileById[a.user_id] }));
  renderAppointments(lastLoadedAppointments);
}

function renderAppointments(appts) {
  const filtered = currentFilter === 'all' ? appts : appts.filter((a) => a.status === currentFilter);
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

function formatDateHeading(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${DOW[date.getDay()]} ${d}/${m}/${y}`;
}

function renderApptCard(a) {
  const card = document.createElement('div');
  card.className = 'appt-card';

  const addonNames = (a.addon_ids ?? []).map((id) => ADDON_NAMES[id] ?? id).join(', ');
  const customerName = a.customer?.username ?? '—';
  const customerPhone = a.customer?.phone ?? '—';

  card.innerHTML = `
    <div class="appt-time">${a.appt_time}</div>
    <div class="appt-main">
      <div class="appt-service">${SERVICE_NAMES[a.service_id] ?? a.service_id}</div>
      <div class="appt-customer">${customerName} · ${customerPhone}</div>
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
  const { error } = await supabase.from('appointments').update({ status }).eq('id', id);
  if (error) {
    showError('dashError', 'No se pudo actualizar: ' + error.message);
    return;
  }
  await loadAppointments();
}

// ---------- Routing based on session/owner status ----------
async function routeCurrentSession() {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;

  if (!session) {
    showOnly(authView);
    return;
  }

  const { data: profile, error } = await supabase
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

supabase.auth.onAuthStateChange(() => routeCurrentSession());
routeCurrentSession();
