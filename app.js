/* ============================================================
   DLC OS 2.0 · Entrega 1: acceso, permisos, médicos y ficha
   ============================================================ */

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const CFG = window.DLC_CONFIG;
const db = window.supabase.createClient(CFG.url, CFG.anon, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'dlc-os-sesion' }
});

let PERFIL = null;
const F = { q: '', prov: '', muni: '', esp: '', est: '', orden: 'nombre', pagina: 0, total: 0 };
const PASO = 50;

/* ---------------- acceso ---------------- */

$('lform').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('lbtn'), msg = $('lmsg');
  btn.disabled = true; btn.textContent = 'Entrando…'; msg.textContent = '';
  const { error } = await db.auth.signInWithPassword({
    email: $('lu').value.trim(), password: $('lp').value
  });
  btn.disabled = false; btn.textContent = 'Entrar';
  if (error) {
    msg.textContent = error.message === 'Invalid login credentials'
      ? 'Correo o contraseña incorrectos.'
      : 'No se ha podido entrar: ' + error.message;
    return;
  }
  arrancar();
});

$('salir').addEventListener('click', async () => {
  await db.auth.signOut();
  location.reload();
});

async function arrancar() {
  const { data: { user } } = await db.auth.getUser();
  if (!user) { $('login').classList.remove('hide'); $('app').classList.add('hide'); return; }

  const { data: perfil, error } = await db.from('perfiles').select('*').eq('id', user.id).single();
  if (error || !perfil) {
    $('lmsg').textContent = 'Tu usuario existe pero no tiene perfil en la plataforma. Avisa a administración.';
    await db.auth.signOut();
    return;
  }
  if (!perfil.activo) {
    $('lmsg').textContent = 'Tu usuario está desactivado.';
    await db.auth.signOut();
    return;
  }

  PERFIL = perfil;
  $('login').classList.add('hide');
  $('app').classList.remove('hide');
  $('who').innerHTML = `<b>${esc(perfil.nombre)}</b> · ${esc(perfil.rol)}`;

  cargarInicio();
  cargarFiltros();
  buscar(true);
}

/* ---------------- navegación ---------------- */

document.querySelector('.nav').addEventListener('click', e => {
  const b = e.target.closest('[data-t]'); if (!b) return;
  document.querySelectorAll('.nav button').forEach(x => x.setAttribute('aria-selected', String(x === b)));
  $('vinicio').classList.toggle('hide', b.dataset.t !== 'inicio');
  $('vmedicos').classList.toggle('hide', b.dataset.t !== 'medicos');
});

/* ---------------- inicio ---------------- */

async function cargarInicio() {
  const { data, error } = await db.rpc('resumen_inicio');
  if (error) { $('kpis').innerHTML = `<p class="sm">No se ha podido cargar el resumen: ${esc(error.message)}</p>`; return; }
  const k = (n, t) => `<div class="kpi"><b>${Number(n).toLocaleString('es')}</b><span>${t}</span></div>`;
  $('kpis').innerHTML =
    k(data.medicos, 'médicos visibles para ti') +
    k(data.urgentes, 'urgentes sin visitar') +
    k(data.visitas_semana, 'visitas esta semana') +
    k(data.citas_hoy, 'citas hoy') +
    (PERFIL.rol === 'Administrador' ? k(data.pendientes_unificar, 'pendientes de unificar') : '');
}

/* ---------------- filtros ---------------- */

async function cargarFiltros(soloMunicipios) {
  const { data, error } = await db.rpc('opciones_filtros', { f_provincia: F.prov || null });
  if (error) return;
  const pon = (sel, lista, etiqueta, valor) => {
    const el = $(sel);
    el.innerHTML = `<option value="">${etiqueta}</option>` +
      lista.map(o => `<option value="${esc(o.v)}" ${valor === o.v ? 'selected' : ''}>${esc(o.v)} (${o.n})</option>`).join('');
  };
  if (!soloMunicipios) {
    pon('fprov', data.provincias, 'Todas las provincias', F.prov);
    pon('fesp', data.especialidades, 'Todas las especialidades', F.esp);
    pon('fest', data.estados, 'Todos los estados', F.est);
  }
  pon('fmuni', data.municipios, 'Todos los municipios', F.muni);
}

let temporizador;
$('q').addEventListener('input', e => {
  clearTimeout(temporizador);
  temporizador = setTimeout(() => { F.q = e.target.value.trim(); buscar(true); }, 300);
});

$('fprov').addEventListener('change', e => { F.prov = e.target.value; F.muni = ''; cargarFiltros(true); buscar(true); });
$('fmuni').addEventListener('change', e => { F.muni = e.target.value; buscar(true); });
$('fesp').addEventListener('change', e => { F.esp = e.target.value; buscar(true); });
$('fest').addEventListener('change', e => { F.est = e.target.value; buscar(true); });
$('forden').addEventListener('change', e => { F.orden = e.target.value; buscar(true); });

function pintarChips() {
  const c = [];
  if (F.q) c.push(['q', 'Búsqueda: ' + F.q]);
  if (F.prov) c.push(['prov', F.prov]);
  if (F.muni) c.push(['muni', F.muni]);
  if (F.esp) c.push(['esp', F.esp]);
  if (F.est) c.push(['est', F.est]);
  $('chips').innerHTML = c.map(([k, t]) => `<button class="chip" data-x="${k}">${esc(t)} ✕</button>`).join('');
}

$('chips').addEventListener('click', e => {
  const b = e.target.closest('[data-x]'); if (!b) return;
  const k = b.dataset.x;
  if (k === 'q') { F.q = ''; $('q').value = ''; }
  else { F[k] = ''; $('f' + k).value = ''; if (k === 'prov') { F.muni = ''; cargarFiltros(true); } }
  buscar(true);
});

/* ---------------- lista de médicos ---------------- */

async function buscar(reiniciar) {
  if (reiniciar) { F.pagina = 0; $('lista').innerHTML = ''; }
  $('cuenta').textContent = 'Buscando…';
  const t0 = performance.now();

  const { data, error } = await db.rpc('buscar_medicos', {
    q: F.q || null,
    f_provincia: F.prov || null,
    f_municipio: F.muni || null,
    f_estado: F.est || null,
    f_especialidad: F.esp || null,
    f_area: null,
    f_urgentes: false,
    f_mios: false,
    f_sin_visitar: false,
    orden: F.orden,
    lim: PASO,
    desplaz: F.pagina * PASO
  });

  if (error) {
    $('cuenta').textContent = 'No se ha podido buscar: ' + error.message;
    return;
  }

  F.total = data.total;
  const ms = Math.round(performance.now() - t0);
  $('cuenta').innerHTML = `<b>${data.total.toLocaleString('es')}</b> médicos · <span class="sm">respuesta en ${ms} ms</span>`;
  pintarChips();

  const filas = data.filas || [];
  if (!filas.length && F.pagina === 0) {
    $('lista').innerHTML = '<div class="vacio">Ningún médico cumple estos filtros.</div>';
  } else {
    $('lista').insertAdjacentHTML('beforeend', filas.map(fila).join(''));
  }
  const mostrados = (F.pagina * PASO) + filas.length;
  $('mas').classList.toggle('hide', mostrados >= data.total);
  $('mas').textContent = `Cargar ${Math.min(PASO, data.total - mostrados)} más (${mostrados.toLocaleString('es')} de ${data.total.toLocaleString('es')})`;
}

function fila(m) {
  const dias = ['L','M','X','J','V'];
  const d = m.dias || {};
  return `<button class="fila" data-id="${m.id}">
    <span>
      <span class="nm">${m.urgente ? '<span class="pill p-urg">Urgente</span> ' : ''}${esc(m.nombre)}</span>
      <span class="sm">${esc(m.especialidad || 'Sin especialidad')}</span>
    </span>
    <span>
      <span class="nm sm" style="font-weight:600;color:var(--ink)">${esc(m.centro_nombre || 'Consulta privada')}</span>
      <span class="sm">${esc([m.municipio, m.provincia].filter(Boolean).join(' · '))}</span>
    </span>
    <span class="col3">
      <span class="dias">${dias.map(k => `<span class="${d[k] ? 'on' : ''}">${k}</span>`).join('')}</span>
    </span>
    <span class="pill p-est">${esc(m.estado_comercial)}</span>
  </button>`;
}

$('mas').addEventListener('click', () => { F.pagina++; buscar(false); });

$('lista').addEventListener('click', e => {
  const b = e.target.closest('[data-id]'); if (b) abrirFicha(b.dataset.id);
});

/* ---------------- ficha ---------------- */

async function abrirFicha(id) {
  $('fbody').innerHTML = '<div class="cargando">Cargando ficha…</div>';
  $('ficha').showModal();
  const { data, error } = await db.rpc('ficha_medico', { p_id: id });
  if (error) { $('fbody').innerHTML = `<p class="sm">No se ha podido abrir: ${esc(error.message)}</p>`; return; }

  const m = data.medico, cons = data.consultas || [], vis = data.visitas || [], com = data.comerciales || [];
  const dias = ['L','M','X','J','V'];

  $('fbody').innerHTML = `
    <div class="fh">
      <div>
        <h2>${m.urgente ? '<span class="pill p-urg">Urgente</span> ' : ''}${esc(m.nombre)}</h2>
        <div class="sm">${esc(m.especialidad || '')}${m.area ? ' · ' + esc(m.area) : ''} · código ${esc(m.codigo)}</div>
      </div>
      <button class="x" id="fx" aria-label="Cerrar">✕</button>
    </div>
    <div class="blk">
      <h3>Estado</h3>
      <div><span class="pill p-est">${esc(m.estado_comercial)}</span>
        ${m.prioridad ? ' <span class="sm">· ' + esc(m.prioridad) + '</span>' : ''}</div>
      ${m.cuando_visitar ? `<div class="sm" style="margin-top:6px">Cuándo visitar: ${esc(m.cuando_visitar)}</div>` : ''}
      ${com.length ? `<div class="sm" style="margin-top:6px">Comercial: ${com.map(esc).join(', ')}</div>` : ''}
    </div>
    ${cons.map(c => `<div class="blk">
      <h3>${esc(c.centro_nombre || 'Consulta privada')}</h3>
      <div>${esc([c.direccion, c.cp, c.municipio].filter(Boolean).join(', ')) || '<span class="sm">Sin dirección</span>'}</div>
      ${c.telefono ? `<div class="sm">Teléfono: ${esc(c.telefono)}</div>` : ''}
      <div class="dias">${dias.map(k => `<span class="${(c.dias || {})[k] ? 'on' : ''}" title="${esc((c.dias || {})[k] || '')}">${k}</span>`).join('')}</div>
      ${dias.filter(k => (c.dias || {})[k]).map(k => `<div class="sm">${k}: ${esc(c.dias[k])}</div>`).join('')}
    </div>`).join('')}
    <div class="blk">
      <h3>Visitas</h3>
      ${vis.length ? vis.slice(0, 8).map(v => `<div style="padding:4px 0;border-top:1px solid var(--line)">
          <b>${esc(v.fecha)}</b> · ${esc((v.resultados || []).join(' + ') || 'Sin resultado')}
          ${v.nota ? `<div class="sm">${esc(v.nota)}</div>` : ''}</div>`).join('')
        : '<div class="sm">Todavía no hay visitas registradas.</div>'}
    </div>
    ${m.nota ? `<div class="blk"><h3>Nota</h3><div>${esc(m.nota)}</div></div>` : ''}
    ${m.contacto ? `<div class="blk"><h3>Contacto</h3><div>${esc(m.contacto)}</div></div>` : ''}
  `;
  $('fx').onclick = () => $('ficha').close();
}

$('ficha').addEventListener('click', e => { if (e.target.id === 'ficha') $('ficha').close(); });

/* ---------------- arranque ---------------- */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
arrancar();
