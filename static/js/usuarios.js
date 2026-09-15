/**
 * SunQuote — Usuarios & Perfiles Module
 * User management and granular permission profile administration.
 */

const stateUsuarios = {
    tab: 'usuarios',  // 'usuarios' | 'perfiles'
    usuarios: [],
    perfiles: [],
    permisosDisponibles: [],
    gruposPermisos: {},
};

// Permission labels for display
const PERM_LABELS = {
    'dashboard.ver': 'Ver Dashboard',
    'cotizador.ver': 'Ver Cotizador',
    'cotizador.crear': 'Crear Cotizaciones',
    'cotizador.editar': 'Editar Cotizaciones',
    'cotizador.eliminar': 'Eliminar Cotizaciones',
    'cotizador.descargar_pdf': 'Descargar PDF',
    'clientes.ver': 'Ver Clientes',
    'clientes.crear': 'Crear Clientes',
    'clientes.editar': 'Editar Clientes',
    'clientes.eliminar': 'Eliminar Clientes',
    'inventario.ver': 'Ver Inventario',
    'inventario.crear': 'Crear Equipos',
    'inventario.editar': 'Editar Equipos',
    'inventario.eliminar': 'Eliminar Equipos',
    'propuestas.ver': 'Ver Propuestas',
    'propuestas.cambiar_estado': 'Cambiar Estado',
    'propuestas.eliminar': 'Eliminar Propuestas',
    'configuracion.ver': 'Ver Configuración',
    'configuracion.editar': 'Editar Configuración',
    'usuarios.ver': 'Ver Usuarios',
    'usuarios.crear': 'Crear Usuarios',
    'usuarios.editar': 'Editar Usuarios',
    'usuarios.eliminar': 'Eliminar Usuarios',
    'reportes.ver': 'Ver Reportes',
};

const MODULE_LABELS = {
    'dashboard': 'Dashboard',
    'cotizador': 'Cotizador',
    'clientes': 'Clientes',
    'inventario': 'Inventario',
    'propuestas': 'Propuestas',
    'configuracion': 'Configuración',
    'usuarios': 'Usuarios',
    'reportes': 'Reportes',
};

const MODULE_ICONS = {
    'dashboard': 'dashboard',
    'cotizador': 'calculate',
    'clientes': 'group',
    'inventario': 'inventory_2',
    'propuestas': 'description',
    'configuracion': 'settings',
    'usuarios': 'manage_accounts',
    'reportes': 'bar_chart',
};


async function renderUsuarios() {
    const content = document.getElementById('app-content');
    content.innerHTML = `<div class="flex items-center justify-center h-[60vh]"><div class="sq-spinner"></div></div>`;

    try {
        const [usuarios, perfiles, permisosRes] = await Promise.all([
            API.get('/usuarios'),
            API.get('/perfiles'),
            API.get('/permisos'),
        ]);
        stateUsuarios.usuarios = usuarios;
        stateUsuarios.perfiles = perfiles;
        stateUsuarios.permisosDisponibles = permisosRes.permisos;
        stateUsuarios.gruposPermisos = permisosRes.grupos;

        content.innerHTML = `
            <div class="flex flex-col w-full p-4 lg:p-12 gap-8 fade-in max-w-7xl mx-auto">
                <div class="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
                    <div class="flex flex-col gap-3">
                        <span class="font-label-bold text-label-bold text-primary tracking-widest uppercase">Administración</span>
                        <h1 class="font-display-lg text-display-lg text-on-surface">Usuarios y Perfiles</h1>
                    </div>
                    <div class="flex gap-3">
                        ${hasPermission('usuarios.crear') ? `
                        <button onclick="openModalCrearPerfil()" class="sq-btn sq-btn-secondary">
                            <span class="material-symbols-outlined">shield_person</span> Nuevo Perfil
                        </button>
                        <button onclick="openModalCrearUsuario()" class="sq-btn sq-btn-primary">
                            <span class="material-symbols-outlined">person_add</span> Nuevo Usuario
                        </button>` : ''}
                    </div>
                </div>

                <!-- Tabs -->
                <div class="flex gap-1 bg-surface-container-low rounded-xl p-1">
                    <button onclick="switchUsuariosTab('usuarios')" id="tab-usuarios"
                        class="flex-1 py-3 px-6 rounded-lg font-label-bold text-label-bold transition-all flex items-center justify-center gap-2 ${stateUsuarios.tab === 'usuarios' ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-container-high'}">
                        <span class="material-symbols-outlined text-[18px]">group</span> Usuarios
                        <span class="text-xs opacity-70">(${usuarios.length})</span>
                    </button>
                    <button onclick="switchUsuariosTab('perfiles')" id="tab-perfiles"
                        class="flex-1 py-3 px-6 rounded-lg font-label-bold text-label-bold transition-all flex items-center justify-center gap-2 ${stateUsuarios.tab === 'perfiles' ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-container-high'}">
                        <span class="material-symbols-outlined text-[18px]">shield</span> Perfiles
                        <span class="text-xs opacity-70">(${perfiles.length})</span>
                    </button>
                </div>

                <!-- Tab Content -->
                <div id="usuarios-tab-content"></div>
            </div>
        `;

        renderTabContent();
    } catch (e) {
        content.innerHTML = `<div class="p-8 text-error text-center">Error cargando usuarios: ${e.message}</div>`;
    }
}


function switchUsuariosTab(tab) {
    stateUsuarios.tab = tab;
    // Update tab buttons
    const tabUsuarios = document.getElementById('tab-usuarios');
    const tabPerfiles = document.getElementById('tab-perfiles');
    if (tab === 'usuarios') {
        tabUsuarios.className = tabUsuarios.className.replace('text-on-surface-variant hover:bg-surface-container-high', 'bg-primary text-on-primary');
        tabPerfiles.className = tabPerfiles.className.replace('bg-primary text-on-primary', 'text-on-surface-variant hover:bg-surface-container-high');
    } else {
        tabPerfiles.className = tabPerfiles.className.replace('text-on-surface-variant hover:bg-surface-container-high', 'bg-primary text-on-primary');
        tabUsuarios.className = tabUsuarios.className.replace('bg-primary text-on-primary', 'text-on-surface-variant hover:bg-surface-container-high');
    }
    renderTabContent();
}


function renderTabContent() {
    const container = document.getElementById('usuarios-tab-content');
    if (stateUsuarios.tab === 'usuarios') {
        renderUsuariosTab(container);
    } else {
        renderPerfilesTab(container);
    }
}


// ══════════════════════════════════════════
//  USUARIOS TAB
// ══════════════════════════════════════════

function renderUsuariosTab(container) {
    const usuarios = stateUsuarios.usuarios;

    if (usuarios.length === 0) {
        container.innerHTML = `
            <div class="bg-surface-container-low rounded-xl p-16 text-center">
                <span class="material-symbols-outlined text-[64px] text-on-surface-variant mb-4">person_off</span>
                <p class="font-headline-md text-headline-md text-on-surface-variant">No hay usuarios</p>
            </div>`;
        return;
    }

    let rows = '';
    usuarios.forEach(u => {
        const initials = getInitials(u.nombre_completo);
        const statusClass = u.activo ? 'bg-success/20 text-success' : 'bg-error/20 text-error';
        const statusLabel = u.activo ? 'Activo' : 'Inactivo';
        const lastAccess = u.ultimo_acceso ? timeAgo(u.ultimo_acceso) : 'Nunca';

        rows += `
            <tr class="border-b border-outline-variant/20 hover:bg-surface-container-high/50 transition-colors">
                <td class="py-4 px-4">
                    <div class="flex items-center gap-3">
                        <div class="w-9 h-9 rounded-full bg-primary/20 text-primary flex items-center justify-center font-label-bold text-xs">${initials}</div>
                        <div>
                            <div class="font-label-bold text-on-surface">${u.nombre_completo}</div>
                            <div class="text-label-sm text-on-surface-variant">@${u.username}</div>
                        </div>
                    </div>
                </td>
                <td class="py-4 px-4 text-on-surface-variant text-sm">${u.correo || '-'}</td>
                <td class="py-4 px-4">
                    <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container-high text-on-surface-variant text-xs font-label-bold">
                        <span class="material-symbols-outlined text-[14px]">shield</span>${u.perfil_nombre}
                    </span>
                </td>
                <td class="py-4 px-4">
                    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-label-bold ${statusClass}">
                        <span class="w-1.5 h-1.5 rounded-full ${u.activo ? 'bg-success' : 'bg-error'}"></span>${statusLabel}
                    </span>
                </td>
                <td class="py-4 px-4 text-on-surface-variant text-sm">${lastAccess}</td>
                <td class="py-4 px-4 text-right">
                    ${hasPermission('usuarios.editar') ? `
                    <div class="flex items-center justify-end gap-1">
                        <button onclick="openModalEditarUsuario(${u.id})" class="p-2 rounded-lg hover:bg-surface-container-high text-on-surface-variant hover:text-primary transition-colors" title="Editar">
                            <span class="material-symbols-outlined text-[18px]">edit</span>
                        </button>
                        <button onclick="openModalCambiarPassword(${u.id}, '${u.username}')" class="p-2 rounded-lg hover:bg-surface-container-high text-on-surface-variant hover:text-primary transition-colors" title="Cambiar contraseña">
                            <span class="material-symbols-outlined text-[18px]">key</span>
                        </button>
                        ${hasPermission('usuarios.eliminar') ? `
                        <button onclick="eliminarUsuario(${u.id}, '${u.nombre_completo}')" class="p-2 rounded-lg hover:bg-error/10 text-on-surface-variant hover:text-error transition-colors" title="Eliminar">
                            <span class="material-symbols-outlined text-[18px]">delete</span>
                        </button>` : ''}
                    </div>` : ''}
                </td>
            </tr>`;
    });

    container.innerHTML = `
        <div class="bg-surface-container-low rounded-xl overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full">
                    <thead>
                        <tr class="border-b border-outline-variant/30">
                            <th class="text-left py-3 px-4 font-label-bold text-label-sm text-on-surface-variant uppercase tracking-wider">Usuario</th>
                            <th class="text-left py-3 px-4 font-label-bold text-label-sm text-on-surface-variant uppercase tracking-wider">Correo</th>
                            <th class="text-left py-3 px-4 font-label-bold text-label-sm text-on-surface-variant uppercase tracking-wider">Perfil</th>
                            <th class="text-left py-3 px-4 font-label-bold text-label-sm text-on-surface-variant uppercase tracking-wider">Estado</th>
                            <th class="text-left py-3 px-4 font-label-bold text-label-sm text-on-surface-variant uppercase tracking-wider">Último Acceso</th>
                            <th class="py-3 px-4"></th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        </div>`;
}


// ══════════════════════════════════════════
//  PERFILES TAB
// ══════════════════════════════════════════

function renderPerfilesTab(container) {
    const perfiles = stateUsuarios.perfiles;

    let cards = '';
    perfiles.forEach(p => {
        const permCount = p.permisos.length;
        const totalPerms = stateUsuarios.permisosDisponibles.length;
        const pct = Math.round((permCount / totalPerms) * 100);

        // Group permissions for display
        let permBadges = '';
        const groups = {};
        p.permisos.forEach(perm => {
            const mod = perm.split('.')[0];
            if (!groups[mod]) groups[mod] = 0;
            groups[mod]++;
        });
        Object.entries(groups).forEach(([mod, count]) => {
            const total = (stateUsuarios.gruposPermisos[mod] || []).length;
            const icon = MODULE_ICONS[mod] || 'extension';
            permBadges += `
                <span class="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-surface-container-high text-on-surface-variant text-[11px] font-label-bold">
                    <span class="material-symbols-outlined text-[12px]">${icon}</span>
                    ${MODULE_LABELS[mod] || mod} <span class="text-primary">${count}/${total}</span>
                </span>`;
        });

        cards += `
            <div class="bg-surface-container-low rounded-xl p-6 border border-outline-variant/10 hover:border-primary/20 transition-all">
                <div class="flex items-start justify-between mb-4">
                    <div class="flex items-center gap-3">
                        <div class="p-2.5 rounded-lg ${p.es_sistema ? 'bg-primary/15 text-primary' : 'bg-surface-container-high text-on-surface-variant'}">
                            <span class="material-symbols-outlined">${p.es_sistema ? 'verified_user' : 'shield'}</span>
                        </div>
                        <div>
                            <h3 class="font-label-bold text-on-surface text-base flex items-center gap-2">
                                ${p.nombre}
                                ${p.es_sistema ? '<span class="text-[10px] px-2 py-0.5 rounded-full bg-primary/20 text-primary font-label-bold uppercase tracking-wider">Sistema</span>' : ''}
                            </h3>
                            <p class="text-on-surface-variant text-sm mt-0.5">${p.descripcion || 'Sin descripción'}</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-1">
                        ${hasPermission('usuarios.editar') ? `
                        <button onclick="openModalEditarPerfil(${p.id})" class="p-2 rounded-lg hover:bg-surface-container-high text-on-surface-variant hover:text-primary transition-colors" title="Editar">
                            <span class="material-symbols-outlined text-[18px]">edit</span>
                        </button>` : ''}
                        ${hasPermission('usuarios.eliminar') && !p.es_sistema ? `
                        <button onclick="eliminarPerfil(${p.id}, '${p.nombre}')" class="p-2 rounded-lg hover:bg-error/10 text-on-surface-variant hover:text-error transition-colors" title="Eliminar">
                            <span class="material-symbols-outlined text-[18px]">delete</span>
                        </button>` : ''}
                    </div>
                </div>

                <!-- Progress bar -->
                <div class="flex items-center gap-3 mb-3">
                    <div class="flex-1 h-1.5 bg-surface-container-high rounded-full overflow-hidden">
                        <div class="h-full bg-primary rounded-full transition-all" style="width: ${pct}%"></div>
                    </div>
                    <span class="text-xs text-on-surface-variant font-label-bold">${permCount}/${totalPerms}</span>
                </div>

                <!-- Permission badges -->
                <div class="flex flex-wrap gap-1.5">
                    ${permBadges}
                </div>

                <!-- User count -->
                <div class="mt-4 pt-3 border-t border-outline-variant/10 flex items-center gap-2 text-on-surface-variant text-xs">
                    <span class="material-symbols-outlined text-[14px]">group</span>
                    ${p.num_usuarios} usuario${p.num_usuarios !== 1 ? 's' : ''} asignado${p.num_usuarios !== 1 ? 's' : ''}
                </div>
            </div>`;
    });

    container.innerHTML = `<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">${cards}</div>`;
}


// ══════════════════════════════════════════
//  MODAL: CREAR / EDITAR USUARIO
// ══════════════════════════════════════════

function buildPerfilOptions(selectedId = null) {
    return stateUsuarios.perfiles.map(p =>
        `<option value="${p.id}" ${p.id === selectedId ? 'selected' : ''}>${p.nombre}</option>`
    ).join('');
}

function openModalCrearUsuario() {
    openModal(`
        <div class="p-8">
            <div class="flex items-center gap-4 mb-6">
                <div class="p-3 bg-primary/10 rounded-lg"><span class="material-symbols-outlined text-primary">person_add</span></div>
                <h3 class="font-headline-md text-headline-md text-on-surface">Nuevo Usuario</h3>
            </div>
            <form onsubmit="guardarUsuario(event)">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <div>
                        <label class="sq-label">Nombre Completo *</label>
                        <input type="text" name="nombre_completo" class="sq-input" required/>
                    </div>
                    <div>
                        <label class="sq-label">Nombre de Usuario *</label>
                        <input type="text" name="username" class="sq-input" required pattern="[a-zA-Z0-9._]+" title="Solo letras, números, puntos y guiones bajos"/>
                    </div>
                    <div>
                        <label class="sq-label">Correo Electrónico</label>
                        <input type="email" name="correo" class="sq-input"/>
                    </div>
                    <div>
                        <label class="sq-label">Perfil (Rol) *</label>
                        <select name="perfil_id" class="sq-input" required>${buildPerfilOptions()}</select>
                    </div>
                    <div>
                        <label class="sq-label">Contraseña *</label>
                        <input type="password" name="password" class="sq-input" required minlength="4"/>
                    </div>
                    <div>
                        <label class="sq-label">Estado</label>
                        <select name="activo" class="sq-input">
                            <option value="1">Activo</option>
                            <option value="0">Inactivo</option>
                        </select>
                    </div>
                </div>
                <div class="flex justify-end gap-3">
                    <button type="button" class="sq-btn sq-btn-secondary" onclick="closeModal()">Cancelar</button>
                    <button type="submit" class="sq-btn sq-btn-primary"><span class="material-symbols-outlined">save</span> Crear Usuario</button>
                </div>
            </form>
        </div>
    `);
}


function openModalEditarUsuario(id) {
    const u = stateUsuarios.usuarios.find(x => x.id === id);
    if (!u) return;

    openModal(`
        <div class="p-8">
            <div class="flex items-center gap-4 mb-6">
                <div class="p-3 bg-primary/10 rounded-lg"><span class="material-symbols-outlined text-primary">edit</span></div>
                <h3 class="font-headline-md text-headline-md text-on-surface">Editar Usuario</h3>
            </div>
            <form onsubmit="actualizarUsuario(event, ${id})">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <div>
                        <label class="sq-label">Nombre Completo</label>
                        <input type="text" name="nombre_completo" class="sq-input" value="${u.nombre_completo}" required/>
                    </div>
                    <div>
                        <label class="sq-label">Usuario</label>
                        <input type="text" class="sq-input" value="@${u.username}" disabled/>
                    </div>
                    <div>
                        <label class="sq-label">Correo Electrónico</label>
                        <input type="email" name="correo" class="sq-input" value="${u.correo || ''}"/>
                    </div>
                    <div>
                        <label class="sq-label">Perfil (Rol)</label>
                        <select name="perfil_id" class="sq-input">${buildPerfilOptions(u.perfil_id)}</select>
                    </div>
                    <div>
                        <label class="sq-label">Estado</label>
                        <select name="activo" class="sq-input">
                            <option value="1" ${u.activo ? 'selected' : ''}>Activo</option>
                            <option value="0" ${!u.activo ? 'selected' : ''}>Inactivo</option>
                        </select>
                    </div>
                </div>
                <div class="flex justify-end gap-3">
                    <button type="button" class="sq-btn sq-btn-secondary" onclick="closeModal()">Cancelar</button>
                    <button type="submit" class="sq-btn sq-btn-primary"><span class="material-symbols-outlined">save</span> Guardar Cambios</button>
                </div>
            </form>
        </div>
    `);
}


async function guardarUsuario(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {
        username: fd.get('username'),
        password: fd.get('password'),
        nombre_completo: fd.get('nombre_completo'),
        correo: fd.get('correo') || '',
        perfil_id: parseInt(fd.get('perfil_id')),
        activo: parseInt(fd.get('activo')),
    };
    try {
        await API.post('/usuarios', body);
        closeModal();
        showToast('Usuario creado exitosamente', 'success');
        renderUsuarios();
    } catch (err) {
        showToast(err.message, 'error');
    }
}


async function actualizarUsuario(e, id) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {
        nombre_completo: fd.get('nombre_completo'),
        correo: fd.get('correo') || '',
        perfil_id: parseInt(fd.get('perfil_id')),
        activo: parseInt(fd.get('activo')),
    };
    try {
        await API.put(`/usuarios/${id}`, body);
        closeModal();
        showToast('Usuario actualizado', 'success');
        renderUsuarios();
    } catch (err) {
        showToast(err.message, 'error');
    }
}


function openModalCambiarPassword(id, username) {
    openModal(`
        <div class="p-8">
            <div class="flex items-center gap-4 mb-6">
                <div class="p-3 bg-primary/10 rounded-lg"><span class="material-symbols-outlined text-primary">key</span></div>
                <div>
                    <h3 class="font-headline-md text-headline-md text-on-surface">Cambiar Contraseña</h3>
                    <p class="text-on-surface-variant text-sm">@${username}</p>
                </div>
            </div>
            <form onsubmit="cambiarPassword(event, ${id})">
                <div class="mb-6">
                    <label class="sq-label">Nueva Contraseña</label>
                    <input type="password" name="password" class="sq-input" required minlength="4" placeholder="Mínimo 4 caracteres"/>
                </div>
                <div class="flex justify-end gap-3">
                    <button type="button" class="sq-btn sq-btn-secondary" onclick="closeModal()">Cancelar</button>
                    <button type="submit" class="sq-btn sq-btn-primary"><span class="material-symbols-outlined">save</span> Cambiar</button>
                </div>
            </form>
        </div>
    `);
}

async function cambiarPassword(e, id) {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
        await API.put(`/usuarios/${id}/password`, { password: fd.get('password') });
        closeModal();
        showToast('Contraseña actualizada', 'success');
    } catch (err) {
        showToast(err.message, 'error');
    }
}


function eliminarUsuario(id, nombre) {
    confirmAction(`¿Eliminar al usuario "${nombre}"? Esta acción no se puede deshacer.`, async () => {
        try {
            await API.delete(`/usuarios/${id}`);
            showToast('Usuario eliminado', 'success');
            renderUsuarios();
        } catch (err) {
            showToast(err.message, 'error');
        }
    });
}


// ══════════════════════════════════════════
//  MODAL: CREAR / EDITAR PERFIL
// ══════════════════════════════════════════

function buildPermisosCheckboxes(selectedPermisos = []) {
    const groups = stateUsuarios.gruposPermisos;
    let html = '';

    Object.entries(groups).forEach(([mod, perms]) => {
        const allChecked = perms.every(p => selectedPermisos.includes(p));
        const icon = MODULE_ICONS[mod] || 'extension';
        const label = MODULE_LABELS[mod] || mod;

        html += `
            <div class="bg-surface-container-high/50 rounded-lg p-4 mb-3">
                <label class="flex items-center gap-3 cursor-pointer mb-3 group">
                    <input type="checkbox" class="perm-group-toggle accent-[#ffc800] w-4 h-4 cursor-pointer" data-module="${mod}"
                        ${allChecked ? 'checked' : ''} onchange="togglePermisoGroup('${mod}', this.checked)"/>
                    <span class="material-symbols-outlined text-[18px] ${allChecked ? 'text-primary' : 'text-on-surface-variant'}">${icon}</span>
                    <span class="font-label-bold text-on-surface group-hover:text-primary transition-colors">${label}</span>
                    <span class="ml-auto text-xs text-on-surface-variant">${perms.filter(p => selectedPermisos.includes(p)).length}/${perms.length}</span>
                </label>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-1 ml-7">
                    ${perms.map(p => `
                        <label class="flex items-center gap-2 py-1 px-2 rounded hover:bg-surface-container-high cursor-pointer text-sm">
                            <input type="checkbox" name="permisos" value="${p}" class="perm-check accent-[#ffc800] w-3.5 h-3.5 cursor-pointer" data-module="${mod}"
                                ${selectedPermisos.includes(p) ? 'checked' : ''} onchange="updateGroupToggle('${mod}')"/>
                            <span class="text-on-surface-variant">${PERM_LABELS[p] || p}</span>
                        </label>
                    `).join('')}
                </div>
            </div>`;
    });

    return html;
}


function togglePermisoGroup(mod, checked) {
    document.querySelectorAll(`.perm-check[data-module="${mod}"]`).forEach(cb => {
        cb.checked = checked;
    });
}

function updateGroupToggle(mod) {
    const checks = document.querySelectorAll(`.perm-check[data-module="${mod}"]`);
    const toggle = document.querySelector(`.perm-group-toggle[data-module="${mod}"]`);
    if (toggle) {
        toggle.checked = Array.from(checks).every(cb => cb.checked);
    }
}

function selectAllPermisos(checked) {
    document.querySelectorAll('.perm-check').forEach(cb => cb.checked = checked);
    document.querySelectorAll('.perm-group-toggle').forEach(cb => cb.checked = checked);
}


function openModalCrearPerfil() {
    openModal(`
        <div class="p-8">
            <div class="flex items-center gap-4 mb-6">
                <div class="p-3 bg-primary/10 rounded-lg"><span class="material-symbols-outlined text-primary">shield_person</span></div>
                <h3 class="font-headline-md text-headline-md text-on-surface">Nuevo Perfil</h3>
            </div>
            <form onsubmit="guardarPerfil(event)">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <div>
                        <label class="sq-label">Nombre del Perfil *</label>
                        <input type="text" name="nombre" class="sq-input" required placeholder="Ej: Supervisor"/>
                    </div>
                    <div>
                        <label class="sq-label">Descripción</label>
                        <input type="text" name="descripcion" class="sq-input" placeholder="Descripción breve del rol"/>
                    </div>
                </div>

                <div class="mb-4">
                    <div class="flex items-center justify-between mb-3">
                        <label class="sq-label mb-0">Permisos</label>
                        <div class="flex gap-2">
                            <button type="button" onclick="selectAllPermisos(true)" class="text-xs text-primary hover:underline">Seleccionar todos</button>
                            <span class="text-on-surface-variant">|</span>
                            <button type="button" onclick="selectAllPermisos(false)" class="text-xs text-on-surface-variant hover:underline">Deseleccionar</button>
                        </div>
                    </div>
                    <div class="max-h-[40vh] overflow-y-auto pr-2">
                        ${buildPermisosCheckboxes([])}
                    </div>
                </div>

                <div class="flex justify-end gap-3">
                    <button type="button" class="sq-btn sq-btn-secondary" onclick="closeModal()">Cancelar</button>
                    <button type="submit" class="sq-btn sq-btn-primary"><span class="material-symbols-outlined">save</span> Crear Perfil</button>
                </div>
            </form>
        </div>
    `, '3xl');
}


function openModalEditarPerfil(id) {
    const p = stateUsuarios.perfiles.find(x => x.id === id);
    if (!p) return;

    openModal(`
        <div class="p-8">
            <div class="flex items-center gap-4 mb-6">
                <div class="p-3 bg-primary/10 rounded-lg"><span class="material-symbols-outlined text-primary">edit</span></div>
                <div>
                    <h3 class="font-headline-md text-headline-md text-on-surface">Editar Perfil</h3>
                    ${p.es_sistema ? '<span class="text-[10px] px-2 py-0.5 rounded-full bg-primary/20 text-primary font-label-bold uppercase tracking-wider">Perfil de Sistema</span>' : ''}
                </div>
            </div>
            <form onsubmit="actualizarPerfil(event, ${id})">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <div>
                        <label class="sq-label">Nombre del Perfil</label>
                        <input type="text" name="nombre" class="sq-input" value="${p.nombre}" ${p.es_sistema ? 'disabled' : ''} required/>
                    </div>
                    <div>
                        <label class="sq-label">Descripción</label>
                        <input type="text" name="descripcion" class="sq-input" value="${p.descripcion || ''}"/>
                    </div>
                </div>

                <div class="mb-4">
                    <div class="flex items-center justify-between mb-3">
                        <label class="sq-label mb-0">Permisos</label>
                        <div class="flex gap-2">
                            <button type="button" onclick="selectAllPermisos(true)" class="text-xs text-primary hover:underline">Seleccionar todos</button>
                            <span class="text-on-surface-variant">|</span>
                            <button type="button" onclick="selectAllPermisos(false)" class="text-xs text-on-surface-variant hover:underline">Deseleccionar</button>
                        </div>
                    </div>
                    <div class="max-h-[40vh] overflow-y-auto pr-2">
                        ${buildPermisosCheckboxes(p.permisos)}
                    </div>
                </div>

                <div class="flex justify-end gap-3">
                    <button type="button" class="sq-btn sq-btn-secondary" onclick="closeModal()">Cancelar</button>
                    <button type="submit" class="sq-btn sq-btn-primary"><span class="material-symbols-outlined">save</span> Guardar Cambios</button>
                </div>
            </form>
        </div>
    `, '3xl');
}


async function guardarPerfil(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const permisos = fd.getAll('permisos');
    try {
        await API.post('/perfiles', {
            nombre: fd.get('nombre'),
            descripcion: fd.get('descripcion') || '',
            permisos: permisos,
        });
        closeModal();
        showToast('Perfil creado exitosamente', 'success');
        renderUsuarios();
    } catch (err) {
        showToast(err.message, 'error');
    }
}


async function actualizarPerfil(e, id) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const permisos = fd.getAll('permisos');
    const body = {
        descripcion: fd.get('descripcion') || '',
        permisos: permisos,
    };
    // Only include name if not disabled (non-system profile)
    const nameInput = e.target.querySelector('input[name="nombre"]');
    if (nameInput && !nameInput.disabled) {
        body.nombre = fd.get('nombre');
    }
    try {
        await API.put(`/perfiles/${id}`, body);
        closeModal();
        showToast('Perfil actualizado', 'success');
        // Refresh current user perms in case their own profile was changed
        await checkAuth();
        renderUsuarios();
    } catch (err) {
        showToast(err.message, 'error');
    }
}


function eliminarPerfil(id, nombre) {
    confirmAction(`¿Eliminar el perfil "${nombre}"? Solo se puede eliminar si no tiene usuarios asignados.`, async () => {
        try {
            await API.delete(`/perfiles/${id}`);
            showToast('Perfil eliminado', 'success');
            renderUsuarios();
        } catch (err) {
            showToast(err.message, 'error');
        }
    });
}
