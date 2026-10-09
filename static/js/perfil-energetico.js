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
            <span class="font-bold text-on-surface">Lectura:</span> ${isReceipt ? `promedio de ${formatNumber(profile.consumo_mensual_estimado_kwh, 1)} kWh/mes a partir de ${monthly.length} meses del recibo.` : (profile.produccion_total_kwh > 0 ? `se detectaron ${formatNumber(profile.produccion_total_kwh, 1)} kWh de producción.` : 'no se detectó producción solar en el archivo; se usará como perfil de demanda.')}
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

    if (receiptInput) receiptInput.addEventListener('change', async () => {
        const file = receiptInput.files?.[0];
        if (!file) return;
        document.getElementById('recibo-energetico-file-name').textContent = file.name;
        const formData = new FormData();
        formData.append('file', file);
        showToast('Leyendo recibo de energía...', 'info');
        try {
            const response = await fetch(`/api/perfiles-energeticos/recibo/${clienteId}`, { method: 'POST', body: formData });
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
                showToast('No se leyeron los meses del gráfico: escríbelos abajo y pulsa "Guardar Cliente".', 'error');
            } else {
                showToast(`Recibo analizado: promedio ${promedio.toFixed(1)} kWh/mes con ${data.meses_leidos} meses.`, 'success');
            }
            if (typeof fetchClientes === 'function') fetchClientes();
        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            receiptInput.value = '';
        }
    });
}
