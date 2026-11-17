/** SunQuote — Importación y visualización del perfil energético horario. */

let perfilEnergeticoChart = null;

function formatPerfilDate(value) {
    if (!value) return '-';
    return new Date(String(value).replace(' ', 'T'))
        .toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

function renderPerfilEnergeticoSummary(profile) {
    const container = document.getElementById('perfil-energetico-summary');
    if (!container || !profile) return;
    const isReceipt = profile.hoja_origen === 'Recibo de energía' || Array.isArray(profile.historial_mensual);
    const monthly = isReceipt
        ? (profile.historial_mensual || profile.resumen_diario || [])
        : [];
    const monthlyValues = monthly.map(item => Number(item.consumo_kwh)).filter(value => Number.isFinite(value));
    const lastConsumption = monthlyValues[monthlyValues.length - 1] || Number(profile.consumo_mensual_estimado_kwh) || 0;
    // La fila del perfil no tiene columna de tarifa: se toma de la medición
    // guardada para que el resumen no muestre "$0,0 / kWh" al reabrir el cliente.
    const tariff = Number(profile.tarifa_kwh) || Number((profile.mediciones || [])[0]?.tarifa_kwh) || 0;
    container.innerHTML = `
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div class="bg-surface-container p-3 rounded-lg"><div class="text-xs text-on-surface-variant">Consumo promedio</div><div class="text-lg font-bold text-primary">${formatNumber(profile.consumo_mensual_estimado_kwh, 1)} kWh/mes</div></div>
            <div class="bg-surface-container p-3 rounded-lg"><div class="text-xs text-on-surface-variant">Último consumo</div><div class="text-lg font-bold text-on-surface">${formatNumber(lastConsumption, 1)} kWh</div></div>
            <div class="bg-surface-container p-3 rounded-lg"><div class="text-xs text-on-surface-variant">${isReceipt ? 'Tarifa energía' : 'Demanda máxima'}</div><div class="text-lg font-bold text-on-surface">${isReceipt ? `${formatNumber(tariff, 2)} / kWh` : `${formatNumber(profile.demanda_maxima_kw, 2)} kW`}</div></div>
            <div class="bg-surface-container p-3 rounded-lg"><div class="text-xs text-on-surface-variant">${isReceipt ? 'Meses cargados' : 'Mediciones'}</div><div class="text-lg font-bold text-on-surface">${formatNumber(isReceipt ? monthly.length : profile.numero_mediciones, 0)} ${isReceipt ? '' : 'h'}</div></div>
            <div class="bg-surface-container p-3 rounded-lg"><div class="text-xs text-on-surface-variant">Periodo</div><div class="text-sm font-bold text-on-surface">${formatPerfilDate(profile.fecha_inicio)} – ${formatPerfilDate(profile.fecha_fin)}</div></div>
        </div>
        <div class="mt-4 bg-surface-container p-4 rounded-xl">
            <div class="flex justify-between items-center mb-2"><span class="text-sm font-bold text-on-surface">${isReceipt ? 'Historial mensual del recibo' : 'Demanda promedio por hora'}</span><span class="text-xs text-on-surface-variant">${isReceipt ? 'kWh' : 'kW'}</span></div>
            <div class="h-40"><canvas id="perfil-energetico-chart"></canvas></div>
        </div>
        <div class="mt-3 p-3 rounded-lg bg-surface-container-low text-sm text-on-surface-variant">
            <span class="font-bold text-on-surface">Lectura:</span> ${isReceipt ? `promedio de ${formatNumber(profile.consumo_mensual_estimado_kwh, 1)} kWh/mes a partir de ${monthly.length} meses del recibo.${profile.promedio_seis_meses ? ` El recibo anuncia un promedio de los últimos 6 meses de ${formatNumber(profile.promedio_seis_meses, 0)} kWh.` : ''}` : (profile.produccion_total_kwh > 0 ? `se detectaron ${formatNumber(profile.produccion_total_kwh, 1)} kWh de producción.` : 'no se detectó producción solar en el archivo; se usará como perfil de demanda.')}
        </div>
        ${(profile.advertencias && profile.advertencias.length) ? `
        <div class="mt-3 p-3 rounded-lg bg-error/10 border border-error/30 text-sm text-on-surface">
            <div class="flex items-start gap-2">
                <span class="material-symbols-outlined text-error text-lg">warning</span>
                <div>
                    <div class="font-bold">Revisa la lectura del recibo</div>
                    <ul class="mt-1 list-disc list-inside text-on-surface-variant">${profile.advertencias.map(texto => `<li>${texto}</li>`).join('')}</ul>
                </div>
            </div>
        </div>` : ''}
    `;
    if (perfilEnergeticoChart) perfilEnergeticoChart.destroy();
    const canvas = document.getElementById('perfil-energetico-chart');
    if (canvas && typeof Chart === 'function' && Array.isArray(profile.perfil_horario)) {
        const chartLabels = isReceipt ? monthly.map(item => item.periodo || 'Mes') : profile.perfil_horario.map(item => `${String(item.hora).padStart(2, '0')}:00`);
        const chartData = isReceipt ? monthlyValues : profile.perfil_horario.map(item => item.promedio_kw);
        perfilEnergeticoChart = new Chart(canvas, {
            type: 'line',
            data: {
                labels: chartLabels,
                datasets: [{ label: isReceipt ? 'Consumo mensual' : 'Demanda promedio', data: chartData, borderColor: '#f4bf00', backgroundColor: 'rgba(244,191,0,.15)', fill: true, tension: .3, pointRadius: 3 }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#d2c5ab', maxTicksLimit: 12 } }, y: { beginAtZero: true, ticks: { color: '#d2c5ab' }, grid: { color: 'rgba(210,197,171,.12)' } } } }
        });
    }
}

function syncProfileFields(profile) {
    const monthly = Array.isArray(profile.historial_mensual) && profile.historial_mensual.length
        ? profile.historial_mensual
        : (Array.isArray(profile.resumen_diario) ? profile.resumen_diario : []);
    const mesesLeidos = monthly.filter(item => Number.isFinite(Number(item.consumo_kwh)));
    document.querySelectorAll('.h-historial').forEach((field, index) => {
        const item = mesesLeidos[index];
        field.value = item ? Number(item.consumo_kwh) : '';
        // La etiqueta deja de ser "Mes 1" y pasa a ser el mes que aparece en el
        // recibo: así el usuario sabe qué está corrigiendo.
        const etiqueta = document.querySelector(`.h-historial-label[data-indice="${index}"]`);
        if (etiqueta) etiqueta.textContent = item && item.periodo ? `${item.periodo} (del recibo)` : `Mes ${index + 1}`;
    });
    const promedio = Number(profile.consumo_promedio_kwh || profile.consumo_mensual_estimado_kwh);
    const consumo = document.getElementById('inp-consumo');
    if (consumo && Number.isFinite(promedio)) consumo.value = promedio.toFixed(1);
    if (typeof actualizarAvisoPromedio === 'function') actualizarAvisoPromedio();
}

async function initPerfilEnergeticoUpload(clienteId) {
    const input = document.getElementById('perfil-energetico-input');
    if (!input) return;
    const receiptInput = document.getElementById('recibo-energetico-input');
    // Aviso preventivo: sin OCR en el servidor, un recibo escaneado no puede
    // entregar los meses del gráfico; es mejor decirlo antes de que el usuario
    // interprete un solo número como el consumo mensual.
    fetch('/health', { credentials: 'same-origin' }).then(r => (r.ok ? r.json() : null))
        .then(health => {
            if (!health || health.receipt_ocr === 'ok' || health.receipt_ocr === 'unknown') return;
            const nota = document.getElementById('recibo-energetico-file-name');
            if (nota) nota.textContent = 'El servidor no puede leer gráficos de meses en recibos escaneados: verifica los valores tras analizar el PDF.';
        })
        .catch(() => {});
    try {
        const perfiles = await API.get(`/perfiles-energeticos/${clienteId}`);
        if (perfiles.length) {
            document.getElementById('perfil-energetico-file-name').textContent = perfiles[0].archivo_nombre;
            renderPerfilEnergeticoSummary(perfiles[0]);
            // El perfil guardado conserva la lectura original del recibo. Cuando el
            // cliente ya tiene meses escritos (el usuario los corrigió) esos campos
            // no se pueden pisar: al reabrir el modal volvía a aparecer el número
            // leído del PDF y parecía que la corrección no se había guardado.
            const mesesDelCliente = [...document.querySelectorAll('.h-historial')]
                .some(campo => String(campo.value || '').trim() !== '');
            if (!mesesDelCliente) syncProfileFields(perfiles[0]);
        }
    } catch (error) {
        console.error('Error cargando perfil energético:', error);
    }
    input.addEventListener('change', async () => {
        const file = input.files?.[0];
        if (!file) return;
        document.getElementById('perfil-energetico-file-name').textContent = file.name;
        const formData = new FormData();
        formData.append('file', file);
        showToast('Analizando perfil energético...', 'info');
        try {
            const response = await fetch(`/api/perfiles-energeticos/${clienteId}`, { method: 'POST', body: formData });
            const data = await response.json();
            if (!response.ok) throw new Error(data.detail || 'No se pudo analizar el archivo');
            renderPerfilEnergeticoSummary(data);
            const consumo = document.getElementById('inp-consumo');
            if (consumo) consumo.value = Number(data.consumo_mensual_estimado_kwh).toFixed(1);
            if (typeof actualizarAvisoPromedio === 'function') actualizarAvisoPromedio();
            // El Excel actualiza solo el perfil; el cliente debe guardarse con el
            // nuevo consumo, así que se marca el formulario como pendiente.
            clienteFormSucio = true;
            showToast(`Perfil analizado: ${Number(data.consumo_mensual_estimado_kwh).toFixed(1)} kWh/mes`, 'success');
            if (typeof fetchClientes === 'function') fetchClientes();
        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            input.value = '';
        }
    });

    window._receiptClienteId = clienteId;
    if (receiptInput) receiptInput.addEventListener('change', () => {
        const file = receiptInput.files?.[0];
        if (file) document.getElementById('recibo-energetico-file-name').textContent = file.name;
    });

    window.leerReciboEnergetico = async function () {
        const cid = window._receiptClienteId;
        const input = document.getElementById('recibo-energetico-input');
        const file = input?.files?.[0];
        if (!cid || !file) { showToast('Selecciona un recibo primero.', 'error'); return; }
        const mesesYaEscritos = [...document.querySelectorAll('.h-historial')]
            .some(campo => String(campo.value || '').trim() !== '');
        if (mesesYaEscritos && !confirm('El cliente ya tiene meses de consumo escritos. Analizar este recibo los reemplazará por los valores del PDF. ¿Continuar?')) {
            return;
        }
        document.getElementById('recibo-energetico-file-name').textContent = file.name;
        const formData = new FormData();
        formData.append('file', file);
        showToast('Leyendo recibo de energía...', 'info');
        try {
            const response = await fetch(`/api/perfiles-energeticos/recibo/${cid}`, { method: 'POST', body: formData });
            const data = await response.json();
            if (!response.ok) throw new Error(data.detail || 'No se pudo analizar el recibo');
            renderPerfilEnergeticoSummary(data);
            const consumo = document.getElementById('inp-consumo');
            const tarifa = document.querySelector('[name="costo_kwh"]');
            const promedio = Number(data.consumo_promedio_kwh || data.consumo_mensual_estimado_kwh || data.consumo_kwh_mes);
            if (consumo) consumo.value = promedio.toFixed(1);
            if (tarifa && Number(data.tarifa_kwh) > 0) tarifa.value = Number(data.tarifa_kwh).toFixed(2);
            syncProfileFields(data);
            if ((data.meses_leidos || 0) < 2) {
                if (typeof toggleHistorial === 'function') toggleHistorial(true);
                showToast('El recibo no entregó los meses: escríbelos abajo y pulsa "Guardar Cliente".', 'error');
            } else {
                showToast(`Recibo analizado: promedio ${promedio.toFixed(1)} kWh/mes con ${data.meses_leidos} meses.`, 'success');
            }
            if (typeof fetchClientes === 'function') fetchClientes();
        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            if (input) input.value = '';
        }
    };
}

/**
 * SunQuote — Cargas eléctricas de un sistema off-grid.
 *
 * Cada equipo declara potencia y horas de funcionamiento de día (con sol) y de
 * noche (sin sol). La suma de las 24 h es la energía diaria que el sistema debe
 * cubrir; con la energía nocturna se dimensiona el banco de baterías y con la
 * potencia simultánea, el inversor.
 */

const CARGAS_OFFGRID_DEFECTO = {
    voltaje_banco_v: 48,
    dias_autonomia: 1,
    profundidad_descarga_pct: 80,
    eficiencia_sistema_pct: 85,
    margen_inversor_pct: 25
};

function cargasOffgridNumero(valor, defecto = 0) {
    if (valor === null || valor === undefined || valor === '') return defecto;
    const numero = Number(String(valor).replace(',', '.'));
    return Number.isFinite(numero) ? numero : defecto;
}

function cargasOffgridLimitar(valor, minimo, maximo) {
    return Math.min(maximo, Math.max(minimo, valor));
}

function cargasOffgridRedondear(valor, decimales = 2) {
    const factor = 10 ** decimales;
    return Math.round(valor * factor) / factor;
}

// El formato global de la app fija un decimal; en una lista off-grid eso oculta
// consumos pequeños (una lámpara de 9 W son 0,36 kWh/día), así que aquí se elige
// la precisión de cada cifra.
function cargasOffgridFormatear(valor, decimales = 1) {
    return Number(valor || 0).toLocaleString('es-CO', {
        minimumFractionDigits: decimales,
        maximumFractionDigits: decimales
    });
}

function escaparAtributoOffgrid(valor) {
    return String(valor ?? '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// Acepta el objeto guardado ({ equipos, parametros }) o el arreglo de versiones
// anteriores, igual que el servidor.
function normalizarCargasOffgridCliente(cargas) {
    let data = cargas;
    while (typeof data === 'string') {
        try {
            const parsed = JSON.parse(data);
            if (parsed === data) break;
            data = parsed;
        } catch { break; }
    }
    const equipos = Array.isArray(data) ? data : (Array.isArray(data?.equipos) ? data.equipos : []);
    return {
        equipos: equipos.map(equipo => ({
            nombre: String(equipo?.nombre || '').trim(),
            cantidad: Math.max(1, cargasOffgridNumero(equipo?.cantidad, 1)),
            potencia_w: Math.max(0, cargasOffgridNumero(equipo?.potencia_w)),
            horas_dia: cargasOffgridLimitar(cargasOffgridNumero(equipo?.horas_dia), 0, 24),
            horas_noche: cargasOffgridLimitar(cargasOffgridNumero(equipo?.horas_noche), 0, 24),
            simultaneo: equipo?.simultaneo !== false
        })),
        parametros: {
            ...CARGAS_OFFGRID_DEFECTO,
            ...(Array.isArray(data) ? {} : (data?.parametros || {}))
        }
    };
}

function filaCargaOffgridHtml(carga = {}) {
    const equipo = {
        nombre: '',
        cantidad: 1,
        potencia_w: '',
        horas_dia: '',
        horas_noche: '',
        simultaneo: true,
        ...carga
    };
    return `
        <tr data-carga>
            <td><input type="text" class="sq-input sq-input-compact offgrid-nombre" placeholder="Ej. Nevera" style="min-width:140px" value="${escaparAtributoOffgrid(equipo.nombre)}" oninput="recalcularCargasOffgrid()"></td>
            <td><input type="number" min="1" step="1" class="sq-input sq-input-compact offgrid-cantidad" style="min-width:60px" value="${equipo.cantidad}" oninput="recalcularCargasOffgrid()"></td>
            <td><input type="number" min="0" step="any" class="sq-input sq-input-compact offgrid-potencia" style="min-width:85px" value="${equipo.potencia_w}" oninput="recalcularCargasOffgrid()"></td>
            <td><input type="number" min="0" max="24" step="any" class="sq-input sq-input-compact offgrid-horas-dia" style="min-width:70px" value="${equipo.horas_dia}" oninput="recalcularCargasOffgrid()"></td>
            <td><input type="number" min="0" max="24" step="any" class="sq-input sq-input-compact offgrid-horas-noche" style="min-width:70px" value="${equipo.horas_noche}" oninput="recalcularCargasOffgrid()"></td>
            <td class="offgrid-kwh font-bold text-primary whitespace-nowrap">-</td>
            <td class="text-center"><input type="checkbox" class="offgrid-simultaneo w-4 h-4" title="Puede estar encendido junto con los demás equipos marcados" ${equipo.simultaneo ? 'checked' : ''} onchange="recalcularCargasOffgrid()"></td>
            <td class="text-right"><button type="button" class="p-1 text-on-surface-variant hover:text-error" title="Quitar equipo" onclick="eliminarCargaOffgrid(this)"><span class="material-symbols-outlined text-lg">close</span></button></td>
        </tr>
    `;
}

function actualizarEstadoTablaOffgrid() {
    const hayFilas = !!document.querySelector('#offgrid-rows tr[data-carga]');
    const vacio = document.getElementById('offgrid-empty');
    if (vacio) vacio.classList.toggle('hidden', hayFilas);
}

function renderFilasCargasOffgrid(equipos = []) {
    const tbody = document.getElementById('offgrid-rows');
    if (!tbody) return;
    tbody.innerHTML = equipos.map(filaCargaOffgridHtml).join('');
    actualizarEstadoTablaOffgrid();
}

// Pinta la lista guardada del cliente (o una fila vacía si es un cliente nuevo)
// y deja los parámetros de cálculo en sus campos.
function renderCargasOffgrid(cargas) {
    const data = normalizarCargasOffgridCliente(cargas);
    renderFilasCargasOffgrid(data.equipos.length ? data.equipos : [{}]);
    const parametros = data.parametros;
    const asignar = (id, valor) => { const campo = document.getElementById(id); if (campo) campo.value = valor; };
    asignar('offgrid-voltaje', parametros.voltaje_banco_v);
    asignar('offgrid-autonomia', parametros.dias_autonomia);
    asignar('offgrid-dod', parametros.profundidad_descarga_pct);
    asignar('offgrid-eficiencia', parametros.eficiencia_sistema_pct);
    asignar('offgrid-margen', parametros.margen_inversor_pct);
    recalcularCargasOffgrid();
}

function agregarCargaOffgrid() {
    const tbody = document.getElementById('offgrid-rows');
    if (!tbody) return;
    tbody.insertAdjacentHTML('beforeend', filaCargaOffgridHtml({}));
    actualizarEstadoTablaOffgrid();
    recalcularCargasOffgrid();
}

function eliminarCargaOffgrid(boton) {
    const fila = boton.closest('tr[data-carga]');
    if (fila) fila.remove();
    actualizarEstadoTablaOffgrid();
    recalcularCargasOffgrid();
}

function leerCargasOffgrid() {
    const equipos = [...document.querySelectorAll('#offgrid-rows tr[data-carga]')].map(fila => {
        const campo = selector => fila.querySelector(selector);
        return {
            nombre: String(campo('.offgrid-nombre')?.value || '').trim(),
            cantidad: Math.max(1, cargasOffgridNumero(campo('.offgrid-cantidad')?.value, 1)),
            potencia_w: Math.max(0, cargasOffgridNumero(campo('.offgrid-potencia')?.value)),
            horas_dia: cargasOffgridLimitar(cargasOffgridNumero(campo('.offgrid-horas-dia')?.value), 0, 24),
            horas_noche: cargasOffgridLimitar(cargasOffgridNumero(campo('.offgrid-horas-noche')?.value), 0, 24),
            simultaneo: campo('.offgrid-simultaneo')?.checked ?? true
        };
    }).filter(equipo => equipo.nombre || equipo.potencia_w > 0);

    const parametros = {
        voltaje_banco_v: Math.max(1, cargasOffgridNumero(document.getElementById('offgrid-voltaje')?.value, 48)),
        dias_autonomia: Math.max(1, cargasOffgridNumero(document.getElementById('offgrid-autonomia')?.value, 1)),
        profundidad_descarga_pct: cargasOffgridLimitar(cargasOffgridNumero(document.getElementById('offgrid-dod')?.value, 80), 10, 100),
        eficiencia_sistema_pct: cargasOffgridLimitar(cargasOffgridNumero(document.getElementById('offgrid-eficiencia')?.value, 85), 10, 100),
        margen_inversor_pct: cargasOffgridLimitar(cargasOffgridNumero(document.getElementById('offgrid-margen')?.value, 25), 0, 100)
    };
    return { activo: equipos.length > 0, equipos, parametros };
}

function calcularCargasOffgrid(equipos, parametros) {
    let energiaDia = 0;
    let energiaNoche = 0;
    let potenciaInstalada = 0;
    let potenciaSimultanea = 0;

    for (const equipo of equipos) {
        const potenciaTotal = equipo.potencia_w * equipo.cantidad;
        energiaDia += potenciaTotal / 1000 * equipo.horas_dia;
        energiaNoche += potenciaTotal / 1000 * equipo.horas_noche;
        potenciaInstalada += potenciaTotal;
        if (equipo.simultaneo) potenciaSimultanea += potenciaTotal;
    }

    const energiaDiaria = energiaDia + energiaNoche;
    const rendimiento = (parametros.profundidad_descarga_pct / 100) * (parametros.eficiencia_sistema_pct / 100);
    const capacidadBanco = rendimiento > 0 ? (energiaNoche * parametros.dias_autonomia) / rendimiento : 0;

    return {
        energia_diaria_kwh: cargasOffgridRedondear(energiaDiaria),
        energia_dia_kwh: cargasOffgridRedondear(energiaDia),
        energia_noche_kwh: cargasOffgridRedondear(energiaNoche),
        consumo_mensual_kwh: cargasOffgridRedondear(energiaDiaria * 30, 1),
        potencia_instalada_w: cargasOffgridRedondear(potenciaInstalada, 1),
        potencia_simultanea_w: cargasOffgridRedondear(potenciaSimultanea, 1),
        potencia_inversor_w: cargasOffgridRedondear(potenciaSimultanea * (1 + parametros.margen_inversor_pct / 100), 1),
        capacidad_banco_kwh: cargasOffgridRedondear(capacidadBanco),
        capacidad_banco_ah: parametros.voltaje_banco_v > 0 ? cargasOffgridRedondear(capacidadBanco * 1000 / parametros.voltaje_banco_v, 1) : 0
    };
}

function recalcularCargasOffgrid() {
    const contenedor = document.getElementById('offgrid-resumen');
    if (!contenedor) return;

    // Energía de cada fila, incluso las que aún no tienen nombre.
    const filas = [...document.querySelectorAll('#offgrid-rows tr[data-carga]')];
    filas.forEach(fila => {
        const cantidad = Math.max(1, cargasOffgridNumero(fila.querySelector('.offgrid-cantidad')?.value, 1));
        const potencia = Math.max(0, cargasOffgridNumero(fila.querySelector('.offgrid-potencia')?.value));
        const horasDia = cargasOffgridLimitar(cargasOffgridNumero(fila.querySelector('.offgrid-horas-dia')?.value), 0, 24);
        const horasNoche = cargasOffgridLimitar(cargasOffgridNumero(fila.querySelector('.offgrid-horas-noche')?.value), 0, 24);
        const celda = fila.querySelector('.offgrid-kwh');
        if (celda) celda.textContent = potencia > 0 ? `${cargasOffgridFormatear(potencia * cantidad / 1000 * (horasDia + horasNoche), 2)}` : '-';
    });

    const { equipos, parametros } = leerCargasOffgrid();
    if (!equipos.length) {
        contenedor.innerHTML = `<p class="text-sm text-on-surface-variant">Completa la lista para calcular la energía diaria, el banco de baterías y el inversor.</p>`;
        return;
    }

    const r = calcularCargasOffgrid(equipos, parametros);
    const tarjeta = (titulo, valor, detalle) => `
        <div class="bg-surface-container p-3 rounded-lg">
            <div class="text-xs text-on-surface-variant">${titulo}</div>
            <div class="text-lg font-bold text-primary">${valor}</div>
            <div class="text-xs text-on-surface-variant mt-0.5">${detalle}</div>
        </div>`;

    contenedor.innerHTML = `
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
            ${tarjeta('Energía diaria (24 h)', `${cargasOffgridFormatear(r.energia_diaria_kwh, 2)} kWh`, `Día ${cargasOffgridFormatear(r.energia_dia_kwh, 2)} kWh · Noche ${cargasOffgridFormatear(r.energia_noche_kwh, 2)} kWh`)}
            ${tarjeta('Banco de baterías', `${cargasOffgridFormatear(r.capacidad_banco_kwh, 2)} kWh`, `${cargasOffgridFormatear(r.capacidad_banco_ah, 0)} Ah @ ${cargasOffgridFormatear(parametros.voltaje_banco_v, 0)} V · ${cargasOffgridFormatear(parametros.dias_autonomia, 0)} día(s)`)}
            ${tarjeta('Potencia simultánea', `${cargasOffgridFormatear(r.potencia_simultanea_w, 0)} W`, `Instalada ${cargasOffgridFormatear(r.potencia_instalada_w, 0)} W`)}
            ${tarjeta('Inversor recomendado', `${cargasOffgridFormatear(r.potencia_inversor_w / 1000, 2)} kW`, `Incluye ${cargasOffgridFormatear(parametros.margen_inversor_pct, 0)}% de margen`)}
        </div>
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-3">
            <p class="text-xs text-on-surface-variant">Banco = energía nocturna × autonomía ÷ (descarga máx. × eficiencia). Inversor = potencia simultánea + margen.</p>
            <button type="button" class="sq-btn sq-btn-secondary sq-btn-sm whitespace-nowrap" onclick="aplicarConsumoOffgrid()">
                <span class="material-symbols-outlined">sync</span> Usar ${cargasOffgridFormatear(r.consumo_mensual_kwh, 1)} kWh/mes como consumo
            </button>
        </div>
    `;
}

// Lleva la energía diaria × 30 al consumo mensual que usa el dimensionamiento
// solar, sin sobrescribirlo en silencio: solo cuando el usuario lo pide.
function aplicarConsumoOffgrid() {
    const { equipos, parametros } = leerCargasOffgrid();
    if (!equipos.length) return;
    const { consumo_mensual_kwh } = calcularCargasOffgrid(equipos, parametros);
    const campo = document.getElementById('inp-consumo');
    if (!campo) return;
    campo.value = Number(consumo_mensual_kwh).toFixed(1);
    if (typeof actualizarAvisoPromedio === 'function') actualizarAvisoPromedio();
    showToast(`Consumo mensual actualizado: ${cargasOffgridFormatear(consumo_mensual_kwh, 1)} kWh`, 'success');
}
