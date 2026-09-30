let empresasState = [];

async function renderEmpresas() {
    const content = document.getElementById('app-content');
    if (!App.user?.es_superadmin) {
        content.innerHTML = '<div class="p-12 text-center text-error">Acceso exclusivo del superadmin.</div>';
        return;
    }
    content.innerHTML = '<div class="flex items-center justify-center h-[60vh]"><div class="sq-spinner"></div></div>';
    try {
        empresasState = await API.get('/empresas');
        content.innerHTML = `
            <div class="flex flex-col w-full p-4 lg:p-12 gap-8 fade-in max-w-7xl mx-auto">
                <div class="flex flex-col md:flex-row justify-between md:items-end gap-4">
                    <div>
                        <span class="font-label-bold text-primary tracking-widest uppercase">Administración global</span>
                        <h1 class="font-display-lg text-display-lg text-on-surface">Empresas</h1>
                        <p class="text-on-surface-variant mt-2">Cada empresa tiene su administrador y usuarios independientes.</p>
                    </div>
                    <button class="sq-btn sq-btn-primary" onclick="abrirCrearEmpresa()"><span class="material-symbols-outlined">add_business</span> Nueva empresa</button>
                </div>
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    ${empresasState.map(e => empresaCard(e)).join('')}
                </div>
            </div>`;
    } catch (error) { content.innerHTML = `<div class="p-12 text-center text-error">Error cargando empresas: ${error.message}</div>`; }
}

function empresaCard(e) {
    const fecha = e.created_at ? new Date(e.created_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
    const tieneDatos = (e.clientes_count || 0) + (e.cotizaciones_count || 0) + (e.proyectos_count || 0) > 0;
    return `
        <div class="bg-surface-container-low rounded-xl p-6 border ${e.activo ? 'border-outline-variant/20' : 'border-error/30 opacity-90'}">
            <div class="flex justify-between gap-4">
                <div>
                    <h2 class="font-headline-md text-on-surface">${e.nombre}</h2>
                    <p class="text-sm text-on-surface-variant mt-1">NIT: ${e.nit || '—'}</p>
                    ${fecha ? `<p class="text-xs text-on-surface-variant mt-1">Creada: ${fecha}</p>` : ''}
                </div>
                <span class="h-fit text-xs px-3 py-1 rounded-full ${e.activo ? 'bg-success/20 text-success' : 'bg-error/20 text-error'}">${e.activo ? 'Activa' : 'Inactiva'}</span>
            </div>
            <div class="grid grid-cols-4 gap-3 mt-6 text-sm">
                <div class="bg-surface-container-high rounded-lg p-3 text-center"><b>${e.usuarios_count || 0}</b><br><span class="text-on-surface-variant">Usuarios</span></div>
                <div class="bg-surface-container-high rounded-lg p-3 text-center"><b>${e.clientes_count || 0}</b><br><span class="text-on-surface-variant">Clientes</span></div>
                <div class="bg-surface-container-high rounded-lg p-3 text-center"><b>${e.cotizaciones_count || 0}</b><br><span class="text-on-surface-variant">Cotizaciones</span></div>
                <div class="bg-surface-container-high rounded-lg p-3 text-center"><b>${e.proyectos_count || 0}</b><br><span class="text-on-surface-variant">Proyectos</span></div>
            </div>
            <div class="flex flex-wrap justify-end gap-2 mt-6 pt-4 border-t border-outline-variant/20">
                <button class="sq-btn sq-btn-secondary text-sm" onclick="abrirEditarEmpresa(${e.id})"><span class="material-symbols-outlined text-base">edit</span> Editar</button>
                <button class="sq-btn sq-btn-secondary text-sm" onclick="cambiarEstadoEmpresa(${e.id}, ${e.activo ? 0 : 1})"><span class="material-symbols-outlined text-base">${e.activo ? 'pause_circle' : 'play_circle'}</span> ${e.activo ? 'Desactivar' : 'Activar'}</button>
                <button class="sq-btn sq-btn-danger text-sm" ${tieneDatos ? 'disabled title="Tiene datos de negocio: desactívela en lugar de eliminarla"' : ''} onclick="eliminarEmpresa(${e.id})"><span class="material-symbols-outlined text-base">delete</span> Eliminar</button>
            </div>
        </div>`;
}

function abrirCrearEmpresa() {
    openModal(`
        <div class="p-8"><h2 class="font-headline-md text-on-surface mb-6">Crear empresa y administrador</h2>
        <form onsubmit="crearEmpresa(event)" class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="md:col-span-2"><label class="sq-label">Nombre de la empresa *</label><input name="nombre" class="sq-input" required></div>
            <div><label class="sq-label">NIT</label><input name="nit" class="sq-input"></div>
            <div><label class="sq-label">Nombre completo del administrador *</label><input name="admin_nombre" class="sq-input" required></div>
            <div><label class="sq-label">Usuario administrador *</label><input name="admin_username" class="sq-input" required pattern="[a-zA-Z0-9._]+"></div>
            <div><label class="sq-label">Correo</label><input name="admin_correo" type="email" class="sq-input"></div>
            <div><label class="sq-label">Contraseña *</label><input name="admin_password" type="password" minlength="8" class="sq-input" required></div>
            <div class="md:col-span-2 flex justify-end gap-3 mt-4"><button type="button" class="sq-btn sq-btn-ghost" onclick="closeModal()">Cancelar</button><button class="sq-btn sq-btn-primary">Crear empresa</button></div>
        </form></div>`);
}

async function crearEmpresa(event) {
    event.preventDefault();
    const fd = new FormData(event.target);
    try {
        await API.post('/empresas', { nombre: fd.get('nombre'), nit: fd.get('nit'), admin: { nombre_completo: fd.get('admin_nombre'), username: fd.get('admin_username'), correo: fd.get('admin_correo'), password: fd.get('admin_password') } });
        closeModal(); showToast('Empresa y administrador creados', 'success'); renderEmpresas();
    } catch (error) { showToast(error.message, 'error'); }
}

function abrirEditarEmpresa(id) {
    const e = empresasState.find(item => item.id === id);
    if (!e) return;
    openModal(`
        <div class="p-8"><h2 class="font-headline-md text-on-surface mb-6">Editar empresa</h2>
        <form onsubmit="guardarEdicionEmpresa(event, ${id})" class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="md:col-span-2"><label class="sq-label">Nombre de la empresa *</label><input name="nombre" class="sq-input" value="${(e.nombre || '').replace(/"/g, '&quot;')}" required></div>
            <div><label class="sq-label">NIT</label><input name="nit" class="sq-input" value="${(e.nit || '')}"></div>
            <div><label class="sq-label">Estado</label>
                <select name="activo" class="sq-input">
                    <option value="1" ${e.activo ? 'selected' : ''}>Activa</option>
                    <option value="0" ${!e.activo ? 'selected' : ''}>Inactiva</option>
                </select>
            </div>
            <p class="md:col-span-2 text-xs text-on-surface-variant">El nombre corto del sidebar, el logo y demás branding se editan en Configuración.</p>
            <div class="md:col-span-2 flex justify-end gap-3 mt-4"><button type="button" class="sq-btn sq-btn-ghost" onclick="closeModal()">Cancelar</button><button class="sq-btn sq-btn-primary">Guardar cambios</button></div>
        </form></div>`);
}

async function guardarEdicionEmpresa(event, id) {
    event.preventDefault();
    const fd = new FormData(event.target);
    try {
        await API.put(`/empresas/${id}`, { nombre: fd.get('nombre'), nit: fd.get('nit') || '', activo: Number(fd.get('activo')) });
        closeModal(); showToast('Empresa actualizada', 'success'); renderEmpresas();
    } catch (error) { showToast(error.message, 'error'); }
}

async function cambiarEstadoEmpresa(id, activo) {
    const e = empresasState.find(item => item.id === id);
    if (!e) return;
    try {
        await API.put(`/empresas/${id}`, { activo });
        showToast(activo ? `"${e.nombre}" activada` : `"${e.nombre}" desactivada`, 'success');
        renderEmpresas();
    } catch (error) { showToast(error.message, 'error'); }
}

function eliminarEmpresa(id) {
    const e = empresasState.find(item => item.id === id);
    if (!e) return;
    confirmAction(
        `¿Eliminar permanentemente la empresa "${e.nombre}" y sus usuarios? Esta acción no se puede deshacer. Sólo es posible si no tiene clientes, cotizaciones, proyectos ni perfiles energéticos.`,
        async () => {
            try {
                await API.delete(`/empresas/${id}`);
                showToast('Empresa eliminada', 'success');
                renderEmpresas();
            } catch (error) { showToast(error.message, 'error'); }
        }
    );
}
