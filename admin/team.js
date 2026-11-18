// Team & permissions (owner only). Roles: owner, reception, employee. A staff member gets a login
// by signing up on this dashboard and entering a one-time invite code generated here, so nobody
// can grant themselves a role. Staff are deactivated, never deleted. Every change is audited.
/* global Admin, h, clear, tx, biMap, formatPhone, pill, demoBadge, friendlyError, toast, openForm, panelHead,
   dataTable, registerModule, supabaseClient, refreshSection, loadReference, ROLE_TEXT, GROUPS */

const ROLE_HELP = biMap({
  owner: ['Everything, including finances, settings, refunds and the audit log.', 'Todo, incluyendo finanzas, configuración, reembolsos y el registro de cambios.'],
  reception: ['Agenda, clients, checkout, inventory counts and customer care. No finances, refunds or settings.', 'Agenda, clientas, cobro, conteos de inventario y atención a clientas. Sin finanzas, reembolsos ni configuración.'],
  employee: ['Their own assigned appointments and their own commissions only.', 'Solo sus propias citas asignadas y sus propias comisiones.'],
});
Admin.teamSections = Admin.teamSections || []; // stage 4 adds commission rules here

function staffForm(existing) {
  const isOwnerRow = existing?.role === 'owner';
  openForm({
    title: existing ? tx('Edit team member', 'Editar miembro del equipo') : tx('New team member', 'Nuevo miembro del equipo'),
    fields: [
      { name: 'display_name', label: tx('Name', 'Nombre'), required: true, value: existing?.display_name, full: true },
      isOwnerRow
        ? { name: 'role_info', type: 'info', value: tx("Owner access comes from the owner setup code and can't be changed here.", 'El acceso de propietaria viene del código de configuración y no se cambia aquí.') }
        : { name: 'role', label: tx('Role', 'Rol'), type: 'select', required: true, value: existing?.role || 'employee',
          options: [{ value: 'employee', label: ROLE_TEXT.employee }, { value: 'reception', label: ROLE_TEXT.reception }],
          hint: tx('Employee: own appointments only. Reception: front desk, no finances.', 'Empleada: solo sus citas. Recepción: mostrador, sin finanzas.') },
      { name: 'phone', label: tx('Phone', 'Teléfono'), type: 'tel', value: existing ? formatPhone(existing.phone) : '' },
      { name: 'hired_on', label: tx('Started on', 'Fecha de ingreso'), type: 'date', value: existing?.hired_on },
      { name: 'notes', label: tx('Notes (schedule, specialties…)', 'Notas (horario, especialidades…)'), type: 'textarea', full: true, value: existing?.notes },
      ...(existing && !isOwnerRow ? [{ name: 'active', label: tx('Active (can log in and be booked)', 'Activa (puede entrar y recibir citas)'), type: 'checkbox', value: existing.active }] : []),
    ],
    onSubmit: async (v) => {
      const payload = { display_name: v.display_name, phone: v.phone, hired_on: v.hired_on, notes: v.notes };
      if (!isOwnerRow) payload.role = v.role;
      if (existing && !isOwnerRow) payload.active = v.active;
      const { error } = existing
        ? await supabaseClient.from('staff_members').update(payload).eq('id', existing.id)
        : await supabaseClient.from('staff_members').insert(payload);
      if (error) throw error;
      toast(existing ? tx('Team member updated', 'Miembro actualizado') : tx('Team member added', 'Miembro agregado'));
      await loadReference();
      refreshSection();
    },
  });
}

async function createInvite(member) {
  const { data: code, error } = await supabaseClient.rpc('create_staff_invite', { p_staff_id: member.id });
  if (error) return toast(friendlyError(error), 'error');
  openForm({
    title: tx(`Invite code for ${member.display_name}`, `Código de invitación para ${member.display_name}`),
    intro: tx('This code is shown only once. It works one time and expires in 7 days.', 'Este código se muestra una sola vez. Sirve una vez y vence en 7 días.'),
    fields: [
      { name: 'code', type: 'info', value: h('div', { class: 'invite-code' }, code) },
      { name: 'steps', type: 'info', value: h('ol', { class: 'steps' },
        h('li', {}, tx('Send the code to them privately (in person or a direct message).', 'Envíale el código en privado (en persona o por mensaje directo).')),
        h('li', {}, tx('They open this dashboard, choose "Create account" and sign up with their own email.', 'Abre este panel, elige "Crear cuenta" y se registra con su propio correo.')),
        h('li', {}, tx('On the access screen, they enter this code.', 'En la pantalla de acceso, escribe este código.')),
        h('li', {}, tx(`They'll get ${ROLE_TEXT[member.role]} access.`, `Tendrá acceso de ${ROLE_TEXT[member.role]}.`))) },
    ],
    submitLabel: tx('Done', 'Listo'),
    onSubmit: async () => true,
  });
}

async function renderTeam(panel) {
  const { data, error } = await supabaseClient.from('staff_members').select('*').order('active', { ascending: false }).order('display_name');
  clear(panel);
  panel.appendChild(panelHead(tx('Team & permissions', 'Equipo y permisos'),
    tx('Who can use this dashboard and what each role can do. Permissions are enforced by the database, not just hidden here.',
      'Quién puede usar este panel y qué puede hacer cada rol. Los permisos los aplica la base de datos, no solo se ocultan aquí.'),
    h('button', { onClick: () => staffForm(null) }, tx('+ New team member', '+ Nuevo miembro'))));
  if (error) { panel.appendChild(h('p', { class: 'error' }, friendlyError(error))); return; }
  panel.appendChild(h('div', { class: 'role-cards' }, ['owner', 'reception', 'employee'].map((r) =>
    h('div', { class: 'role-card' }, h('strong', {}, ROLE_TEXT[r]), h('p', {}, ROLE_HELP[r])))));
  panel.appendChild(dataTable([
    { label: tx('Name', 'Nombre'), render: (s) => h('span', {}, s.display_name, ' ', demoBadge(s)) },
    { label: tx('Role', 'Rol'), render: (s) => ROLE_TEXT[s.role] },
    { label: tx('Login', 'Cuenta'), render: (s) => (s.user_id || s.role === 'owner' ? tx('Linked', 'Vinculada') : tx('Not yet', 'Pendiente')) },
    { label: tx('Status', 'Estado'), render: (s) => (s.active ? pill('done', tx('Active', 'Activa')) : pill('cancelled', tx('Inactive', 'Inactiva'))) },
    { label: '', render: (s) => h('div', { class: 'btn-row' },
      h('button', { class: 'ghost small', onClick: (e) => { e.stopPropagation(); staffForm(s); } }, tx('Edit', 'Editar')),
      !s.user_id && s.active && s.role !== 'owner' ? h('button', { class: 'small', onClick: (e) => { e.stopPropagation(); createInvite(s); } }, tx('Invite code', 'Código de invitación')) : null) },
  ], data || [], { empty: tx('No team members yet.', 'Todavía no hay miembros del equipo.') }));
  for (const section of Admin.teamSections) {
    try { await section(panel); } catch (e) { panel.appendChild(h('p', { class: 'error' }, friendlyError(e))); }
  }
}

registerModule('team', { label: ['Team & commissions', 'Equipo y comisiones'], group: GROUPS.business, roles: ['owner'], render: renderTeam });
