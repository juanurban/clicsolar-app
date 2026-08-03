/**
 * SunQuote — Core Application
 * SPA Router, API helpers, utilities, and global state.
 */

// ── Global State ──
const App = {
    currentPage: 'dashboard',
    config: {},
    user: null,
    permisos: [],
    // Cambiar si el frontend y backend se alojan en servidores distintos (Ej. Render)
    API_BASE_URL: '', // Dejar vacío para despliegues en el mismo dominio o VPS
};

// ══════════════════════════════════════════
//  API HELPERS
// ══════════════════════════════════════════

async function api(endpoint, options = {}) {
    const url = `${App.API_BASE_URL}/api${endpoint}`;
    const config = {
        headers: { 'Content-Type': 'application/json' },
        ...options,
    };
    if (config.body && typeof config.body === 'object') {
        config.body = JSON.stringify(config.body);
    }
    try {
        const response = await fetch(url, config);
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.detail || 'Error en la solicitud');
        }
        return data;
    } catch (error) {
        console.error(`API Error [${endpoint}]:`, error);
        throw error;
    }
}

const API = {
    get: (endpoint) => api(endpoint),
    post: (endpoint, body) => api(endpoint, { method: 'POST', body }),
    put: (endpoint, body) => api(endpoint, { method: 'PUT', body }),
    delete: (endpoint) => api(endpoint, { method: 'DELETE' }),
};

// ══════════════════════════════════════════
//  FORMAT UTILITIES
// ══════════════════════════════════════════

function formatCurrency(value, decimals = 0) {
    if (value === null || value === undefined) return '$0';
    return '$' + Number(value).toLocaleString('es-CO', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

function formatNumber(value, decimals = 0) {
    if (value === null || value === undefined) return '0';
    return Number(value).toLocaleString('es-CO', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatShortDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-CO', { month: 'short', day: 'numeric', year: '2-digit' });
}

function timeAgo(dateStr) {
    if (!dateStr) return '';
    const now = new Date();
    const d = new Date(dateStr);
    const diff = Math.floor((now - d) / 1000);
    if (diff < 60) return 'Ahora';
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
    return formatShortDate(dateStr);
}

function getInitials(name) {
    if (!name) return '??';
    return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

function getStatusBadge(estado) {
    const map = {
        'borrador': { class: 'sq-badge-draft', label: 'BORRADOR' },
        'enviada': { class: 'sq-badge-sent', label: 'ENVIADA' },
        'firmada': { class: 'sq-badge-signed', label: 'FIRMADA' },
        'rechazada': { class: 'sq-badge-rejected', label: 'RECHAZADA' },
    };
    const s = map[estado] || map['borrador'];
    return `<span class="sq-badge ${s.class}"><span class="sq-badge-dot"></span>${s.label}</span>`;
}

// ══════════════════════════════════════════
//  TOAST NOTIFICATIONS
// ══════════════════════════════════════════

function showToast(message, type = 'info', duration = 4000) {
    const container = document.getElementById('toast-container');
    const icons = { success: 'check_circle', error: 'error', info: 'info' };
    const toast = document.createElement('div');
    toast.className = `sq-toast sq-toast-${type}`;
    toast.innerHTML = `
        <span class="material-symbols-outlined" style="font-size:20px">${icons[type] || 'info'}</span>
        <span style="flex:1">${message}</span>
        <button onclick="this.parentElement.remove()" style="background:none;border:none;color:#9b9078;cursor:pointer">
            <span class="material-symbols-outlined" style="font-size:18px">close</span>
        </button>
    `;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'toastOut 0.3s ease-in forwards';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// ══════════════════════════════════════════
//  MODAL SYSTEM
// ══════════════════════════════════════════

function openModal(html, maxWidth = '2xl') {
    const container = document.getElementById('modal-container');
    const content = document.getElementById('modal-content');
    content.className = `absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-surface-container rounded-xl shadow-2xl max-h-[90vh] overflow-y-auto w-[95vw] max-w-${maxWidth}`;
    content.innerHTML = html;
    container.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    const container = document.getElementById('modal-container');
    container.classList.add('hidden');
    document.body.style.overflow = '';
}

// ══════════════════════════════════════════
//  SIDEBAR & NAVIGATION
// ══════════════════════════════════════════

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    sidebar.classList.toggle('-translate-x-full');
    overlay.classList.toggle('hidden');
}

function updateActiveNav(page) {
    document.querySelectorAll('.nav-link').forEach(link => {
        const isActive = link.dataset.page === page;
        if (isActive) {
            link.classList.add('bg-primary-container', 'text-on-primary-container');
            link.classList.remove('text-on-surface-variant', 'hover:bg-surface-container-high', 'hover:text-on-surface');
        } else {
            link.classList.remove('bg-primary-container', 'text-on-primary-container');
            link.classList.add('text-on-surface-variant', 'hover:bg-surface-container-high', 'hover:text-on-surface');
        }
    });
}

// ══════════════════════════════════════════
//  SPA ROUTER
// ══════════════════════════════════════════

const routes = {
    'dashboard': () => renderDashboard(),
    'cotizador': () => renderCotizador(),
    'clientes': () => renderClientes(),
    'inventario': () => renderInventario(),
    'propuestas': () => renderPropuestas(),
    'configuracion': () => renderConfiguracion(),
    'usuarios': () => renderUsuarios(),
};

function navigateTo(page) {
    window.location.hash = '#' + page;
}

async function handleRoute() {
    const hash = window.location.hash.replace('#', '') || 'dashboard';
    const page = hash.split('/')[0];
    App.currentPage = page;
    updateActiveNav(page);

    // Close mobile sidebar
    const sidebar = document.getElementById('sidebar');
    if (!sidebar.classList.contains('-translate-x-full') && window.innerWidth < 1024) {
        toggleSidebar();
    }

    const content = document.getElementById('app-content');
    content.innerHTML = `<div class="flex items-center justify-center h-[60vh]"><div class="sq-spinner"></div></div>`;

    const routeFn = routes[page];
    if (routeFn) {
        try {
            await routeFn();
        } catch (error) {
            console.error('Route error:', error);
            content.innerHTML = `
                <div class="flex flex-col items-center justify-center h-[60vh] text-on-surface-variant">
                    <span class="material-symbols-outlined text-[64px] mb-4">error_outline</span>
                    <p class="font-headline-md text-headline-md">Error al cargar</p>
                    <p class="mt-2">${error.message}</p>
                </div>`;
        }
    } else {
        content.innerHTML = `
            <div class="flex flex-col items-center justify-center h-[60vh] text-on-surface-variant">
                <span class="material-symbols-outlined text-[64px] mb-4">explore_off</span>
                <p class="font-headline-md text-headline-md">Página no encontrada</p>
            </div>`;
    }
}

// ══════════════════════════════════════════
//  LOADING HELPER
// ══════════════════════════════════════════

function showLoading(container) {
    if (typeof container === 'string') container = document.getElementById(container);
    if (container) {
        container.innerHTML = `<div class="flex items-center justify-center py-12"><div class="sq-spinner"></div></div>`;
    }
}

// ══════════════════════════════════════════
//  CONFIRM DIALOG
// ══════════════════════════════════════════

function confirmAction(message, onConfirm) {
    openModal(`
        <div class="p-8">
            <div class="flex items-center gap-4 mb-6">
                <div class="p-3 bg-error/10 rounded-lg">
                    <span class="material-symbols-outlined text-error">warning</span>
                </div>
                <h3 class="font-headline-md text-headline-md text-on-surface">Confirmar acción</h3>
            </div>
            <p class="text-on-surface-variant mb-8">${message}</p>
            <div class="flex justify-end gap-3">
                <button class="sq-btn sq-btn-secondary" onclick="closeModal()">Cancelar</button>
                <button class="sq-btn sq-btn-danger" id="confirm-action-btn">Eliminar</button>
            </div>
        </div>
    `);
    document.getElementById('confirm-action-btn').addEventListener('click', () => {
        closeModal();
        onConfirm();
    });
}

// ══════════════════════════════════════════
//  BRANDING (from config)
// ══════════════════════════════════════════

async function updateBranding() {
    try {
        const res = await API.get('/configuracion');
        App.config = res;
        const logoUrl = res.empresa_logo?.valor || '/static/img/logo.svg';
        const nombre = res.empresa_nombre?.valor || 'SunQuote';
        const version = 'v2.4';

        const logoImg = document.getElementById('app-logo-img');
        const brandName = document.getElementById('app-brand-name');
        const footerBrand = document.getElementById('app-footer-brand');
        const title = document.querySelector('title');
        const favicon = document.querySelector('link[rel="icon"]');

        if (logoImg) logoImg.src = logoUrl;
        if (brandName) brandName.textContent = nombre;
        if (footerBrand) footerBrand.textContent = `${nombre} ${version}`;
        if (title) title.textContent = `${nombre} — Cotizador Solar FV`;
        if (favicon && logoUrl !== '/static/img/logo.svg') {
            favicon.href = logoUrl;
        }
    } catch {
        // Use defaults on error
    }
}

// ══════════════════════════════════════════
//  AUTHENTICATION
// ══════════════════════════════════════════

async function checkAuth() {
    try {
        const res = await fetch(`${App.API_BASE_URL}/api/auth/me`);
        if (!res.ok) throw new Error('No autenticado');
        const data = await res.json();
        App.user = data;
        App.permisos = data.permisos || [];
        return true;
    } catch {
        App.user = null;
        App.permisos = [];
        return false;
    }
}

function hasPermission(perm) {
    return App.permisos.includes(perm);
}

async function doLogout() {
    try {
        await fetch(`${App.API_BASE_URL}/api/auth/logout`, { method: 'POST' });
    } catch {}
    window.location.href = '/login';
}

function updateSidebarForPermissions() {
    // Map of page -> required permission
    const permMap = {
        'dashboard': 'dashboard.ver',
        'cotizador': 'cotizador.ver',
        'clientes': 'clientes.ver',
        'inventario': 'inventario.ver',
        'propuestas': 'propuestas.ver',
        'configuracion': 'configuracion.ver',
        'usuarios': 'usuarios.ver',
    };

    document.querySelectorAll('.nav-link').forEach(link => {
        const page = link.dataset.page;
        const perm = permMap[page];
        if (perm && !hasPermission(perm)) {
            link.style.display = 'none';
        } else {
            link.style.display = '';
        }
    });

    // Update user info in sidebar
    const userName = document.getElementById('sidebar-user-name');
    const userRole = document.getElementById('sidebar-user-role');
    const userInitials = document.getElementById('sidebar-user-initials');
    if (App.user) {
        if (userName) userName.textContent = App.user.nombre_completo;
        if (userRole) userRole.textContent = App.user.perfil_nombre;
        if (userInitials) userInitials.textContent = getInitials(App.user.nombre_completo);
    }
}

// ══════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════

window.addEventListener('hashchange', handleRoute);
document.addEventListener('DOMContentLoaded', async () => {
    // Check auth first
    const isAuth = await checkAuth();
    if (!isAuth) {
        window.location.href = '/login';
        return;
    }

    await updateBranding();
    updateSidebarForPermissions();
    handleRoute();
});
