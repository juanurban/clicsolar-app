/**
 * SunQuote — Dashboard Module
 */

async function renderDashboard() {
    const content = document.getElementById('app-content');
    showLoading(content);

    try {
        const stats = await API.get('/dashboard/stats');
        
        // Inline SVG Chart from design
        const svgChart = `
            <svg class="w-full h-full" viewBox="0 0 800 200">
                <defs>
                    <linearGradient id="chartGradient" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stop-color="#ffc800" stop-opacity="0.3"></stop>
                        <stop offset="100%" stop-color="#ffc800" stop-opacity="0"></stop>
                    </linearGradient>
                </defs>
                <path d="M0,150 Q100,140 200,160 T400,100 T600,120 T800,40" fill="none" stroke="#ffc800" stroke-linecap="round" stroke-width="4"></path>
                <path d="M0,150 Q100,140 200,160 T400,100 T600,120 T800,40 V200 H0 Z" fill="url(#chartGradient)"></path>
                <circle cx="200" cy="160" fill="#131313" r="4" stroke="#ffc800" stroke-width="2"></circle>
                <circle cx="400" cy="100" fill="#131313" r="4" stroke="#ffc800" stroke-width="2"></circle>
                <circle cx="600" cy="120" fill="#131313" r="4" stroke="#ffc800" stroke-width="2"></circle>
                <circle class="animate-pulse" cx="800" cy="40" fill="#ffc800" r="6"></circle>
            </svg>
        `;

        // Render recent activity
        const activityHtml = stats.recent_cotizaciones.map((c, i) => {
            const isLatest = i === 0;
            return `
            <div class="flex gap-4 items-start relative pb-6 ${i < stats.recent_cotizaciones.length - 1 ? 'border-l-2 border-surface-container-high' : ''} ml-2 pl-6">
                <div class="absolute -left-[9px] top-0 w-4 h-4 rounded-full ${isLatest ? 'bg-primary' : 'bg-on-surface-variant'} border-4 border-surface-container-low"></div>
                <div class="flex-1">
                    <div class="flex justify-between items-start">
                        <p class="text-on-surface font-label-bold text-label-bold">
                            Nueva cotización <span class="text-primary">${c.codigo}</span>
                        </p>
                        <span class="text-[10px] text-on-surface-variant uppercase font-label-bold">${timeAgo(c.fecha)}</span>
                    </div>
                    <p class="text-on-surface-variant text-label-sm font-label-sm mt-1">
                        ${c.cliente_nombre} • ${c.potencia_kwp}kWp • ${formatCurrency(c.total_inversion)}
                    </p>
                </div>
            </div>
            `;
        }).join('');

        content.innerHTML = `
            <div class="flex flex-col w-full p-4 lg:p-12 gap-8 fade-in max-w-7xl mx-auto">
                
                <!-- Header -->
                <section class="grid grid-cols-12 gap-8">
                    <div class="col-span-12 lg:col-span-8 flex flex-col gap-6">
                        <div class="flex items-end gap-4">
                            <h1 class="font-display-lg text-3xl lg:text-display-lg text-primary leading-none">Global Performance</h1>
                            <div class="h-px flex-1 bg-gradient-to-r from-outline-variant to-transparent mb-4 opacity-30 hidden md:block"></div>
                        </div>
                        <p class="font-body-lg text-body-lg text-on-surface-variant max-w-2xl">
                            Tu equipo comercial tiene <span class="text-primary font-label-bold">${stats.borradores} propuestas en borrador</span> 
                            y <span class="text-primary font-label-bold">${stats.enviadas} enviadas</span> esperando firma.
                        </p>
                    </div>
                    <div class="col-span-12 lg:col-span-4 flex justify-end items-start pt-2">
                        <button onclick="navigateTo('cotizador')" class="group relative overflow-hidden bg-primary text-on-primary px-8 py-4 rounded-xl font-label-bold text-label-bold flex items-center gap-3 shadow-xl hover:shadow-primary/20 transition-all active:scale-95 w-full md:w-auto justify-center">
                            <span class="relative z-10">NUEVA COTIZACIÓN</span>
                            <span class="material-symbols-outlined relative z-10 transition-transform group-hover:rotate-90">add</span>
                            <div class="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                        </button>
                    </div>
                </section>

                <!-- Metrics Grid -->
                <section class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    
                    <div class="bg-surface-container-low p-8 rounded-xl relative overflow-hidden group slide-up" style="animation-delay: 50ms;">
                        <div class="absolute top-0 left-0 w-1 h-full bg-primary opacity-50 group-hover:h-full transition-all"></div>
                        <div class="flex justify-between items-start mb-8">
                            <div class="p-3 bg-surface-container-high rounded-lg text-primary"><span class="material-symbols-outlined">description</span></div>
                        </div>
                        <h3 class="text-on-surface-variant font-label-bold text-label-bold uppercase tracking-widest mb-2">Cotizaciones Activas</h3>
                        <div class="flex items-baseline gap-3">
                            <span class="font-display-lg text-display-lg text-on-surface tabular-nums">${stats.total_cotizaciones}</span>
                            <span class="text-on-surface-variant font-body-md text-body-md">Totales</span>
                        </div>
                    </div>

                    <div class="bg-surface-container-low p-8 rounded-xl relative overflow-hidden group slide-up" style="animation-delay: 100ms;">
                        <div class="absolute top-0 left-0 w-1 h-full bg-primary opacity-50 group-hover:h-full transition-all"></div>
                        <div class="flex justify-between items-start mb-8">
                            <div class="p-3 bg-surface-container-high rounded-lg text-primary"><span class="material-symbols-outlined">bolt</span></div>
                        </div>
                        <h3 class="text-on-surface-variant font-label-bold text-label-bold uppercase tracking-widest mb-2">Energía Generada</h3>
                        <div class="flex items-baseline gap-3">
                            <span class="font-display-lg text-display-lg text-on-surface tabular-nums">${(stats.total_energy_kwh / 1000).toFixed(1)}</span>
                            <span class="text-on-surface-variant font-body-md text-body-md">MWh/año</span>
                        </div>
                    </div>

                    <div class="bg-surface-container-low p-8 rounded-xl relative overflow-hidden group slide-up" style="animation-delay: 150ms;">
                        <div class="absolute top-0 left-0 w-1 h-full bg-primary opacity-50 group-hover:h-full transition-all"></div>
                        <div class="flex justify-between items-start mb-8">
                            <div class="p-3 bg-surface-container-high rounded-lg text-primary"><span class="material-symbols-outlined">trending_up</span></div>
                            <div class="w-12 h-1 bg-surface-container-highest self-center rounded-full overflow-hidden">
                                <div class="bg-primary h-full" style="width: ${stats.conversion_rate}%"></div>
                            </div>
                        </div>
                        <h3 class="text-on-surface-variant font-label-bold text-label-bold uppercase tracking-widest mb-2">Tasa Conversión</h3>
                        <div class="flex items-baseline gap-3">
                            <span class="font-display-lg text-display-lg text-on-surface tabular-nums">${stats.conversion_rate}</span>
                            <span class="text-on-surface-variant font-body-md text-body-md">%</span>
                        </div>
                    </div>

                    <div class="bg-surface-container-low p-8 rounded-xl relative overflow-hidden group slide-up" style="animation-delay: 200ms;">
                        <div class="absolute top-0 left-0 w-1 h-full bg-primary opacity-50 group-hover:h-full transition-all"></div>
                        <div class="flex justify-between items-start mb-8">
                            <div class="p-3 bg-surface-container-high rounded-lg text-primary"><span class="material-symbols-outlined">payments</span></div>
                        </div>
                        <h3 class="text-on-surface-variant font-label-bold text-label-bold uppercase tracking-widest mb-2">Total Ingresos</h3>
                        <div class="flex items-baseline gap-3 truncate">
                            <span class="font-display-lg text-3xl xl:text-display-lg text-on-surface tabular-nums">${formatCurrency(stats.total_revenue).replace(',00', '')}</span>
                        </div>
                    </div>

                </section>

                <!-- Chart and Activity -->
                <div class="grid grid-cols-12 gap-8">
                    
                    <!-- Chart -->
                    <div class="col-span-12 xl:col-span-8 bg-surface-container-low rounded-xl p-8 shadow-sm slide-up" style="animation-delay: 250ms;">
                        <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
                            <div>
                                <h2 class="font-headline-md text-headline-md text-on-surface mb-2">Volumen de Cotizaciones</h2>
                                <p class="text-on-surface-variant font-label-sm text-label-sm uppercase tracking-wider">Actividad últimos 30 días</p>
                            </div>
                        </div>
                        <div class="w-full h-64 relative group">
                            ${svgChart}
                            <div class="absolute top-4 right-10 bg-surface-container-highest p-3 rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                <div class="text-label-sm font-label-sm text-on-surface-variant">Hoy</div>
                                <div class="text-headline-md font-headline-md text-primary">${stats.borradores} Borradores</div>
                            </div>
                        </div>
                    </div>

                    <!-- Activity -->
                    <div class="col-span-12 xl:col-span-4 flex flex-col gap-6">
                        <div class="bg-surface-container-low rounded-xl p-8 flex-1 slide-up" style="animation-delay: 300ms;">
                            <h2 class="font-headline-md text-headline-md text-on-surface mb-8">Actividad Reciente</h2>
                            <div class="space-y-6">
                                ${activityHtml || '<p class="text-on-surface-variant">No hay actividad reciente.</p>'}
                            </div>
                            <button onclick="navigateTo('propuestas')" class="w-full mt-8 py-4 rounded-lg border border-outline-variant text-on-surface-variant font-label-bold text-label-bold hover:bg-surface-container-high transition-colors">VER TODAS</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

    } catch (error) {
        content.innerHTML = `<div class="p-8 text-error">Error al cargar dashboard: ${error.message}</div>`;
    }
}
