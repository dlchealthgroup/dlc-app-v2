/* ============================================================
   DLC OS 2.0 · Entrega 2: inicio, navegación y directorio
   ============================================================ */

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const CFG = window.DLC_CONFIG;
const db = window.supabase.createClient(CFG.url, CFG.anon, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'dlc-os-sesion',
    // Bloqueo dentro de la pestaña: evita esperas largas cuando hay otra pestaña de la app abierta.
    lock: (() => { const colas = {}; return (nombre, t, fn) => {
      const run = (colas[nombre] || Promise.resolve()).then(() => fn());
      colas[nombre] = run.catch(() => {}); return run; }; })() }
});

let PERFIL = null, TAB = 'inicio';
const F = { q: '', prov: '', muni: '', esp: '', est: '', urg: false, orden: 'nombre', pagina: 0, total: 0 };
const PASO = 50;

const hoyISO = () => new Date().toISOString().slice(0, 10);
let fechaLarga = d => d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
const fechaCorta = s => { const d = new Date(s + 'T00:00:00'); return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }); };
const iniciales = n => String(n || '').split(/\s+/).slice(0, 2).map(x => x[0] || '').join('').toUpperCase();
const num = n => Number(n || 0).toLocaleString('es');

/* ---------------- acceso ---------------- */

$('lform').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('lbtn'), msg = $('lmsg');
  btn.disabled = true; btn.textContent = 'Entrando…'; msg.textContent = '';
  const { error } = await db.auth.signInWithPassword({ email: $('lu').value.trim(), password: $('lp').value });
  btn.disabled = false; btn.textContent = 'Entrar';
  if (error) {
    msg.textContent = error.message === 'Invalid login credentials'
      ? 'Correo o contraseña incorrectos.' : 'No se ha podido entrar: ' + error.message;
    return;
  }
  arrancar();
});

async function arrancar() {
  const { data: { user } } = await db.auth.getUser();
  if (!user) { $('login').classList.remove('hide'); $('app').classList.add('hide'); return; }

  const { data: perfil, error } = await db.from('perfiles').select('*').eq('id', user.id).single();
  if (error || !perfil || !perfil.activo) {
    $('lmsg').textContent = perfil && !perfil.activo
      ? 'Tu usuario está desactivado.'
      : 'Tu usuario no tiene perfil en la plataforma. Avisa a administración.';
    await db.auth.signOut();
    $('login').classList.remove('hide'); $('app').classList.add('hide');
    return;
  }

  PERFIL = perfil;
  $('login').classList.add('hide');
  $('app').classList.remove('hide');
  $('av').textContent = iniciales(perfil.nombre);
  $('uname').textContent = String(perfil.nombre).split(' ')[0];
  $('umnom').textContent = perfil.nombre;
  $('umrol').textContent = perfil.rol + ' · ' + perfil.email;
  if (perfil.rol === 'Administrador') document.querySelector('[data-u="adm"]').classList.remove('hide');

  const nombre = String(perfil.nombre).split(' ')[0];
  const h = new Date().getHours();
  $('hola').textContent = (h < 13 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches') + ', ' + nombre;
  $('hoyfecha').textContent = fechaLarga(new Date()).replace(/^./, c => c.toUpperCase());

  $('nuevoBtn').classList.toggle('hide', !puedeCrear());
  $('dupBtn').classList.toggle('hide', PERFIL.rol !== 'Administrador');
  {
    window.__dlDir = async fmt => {
      const { data } = await db.rpc('exportar_medicos', { q: F.q || null, f_provincia: F.prov || null,
        f_municipio: F.muni || null, f_estado: F.est || null, f_especialidad: F.esp || null, f_urgentes: !!F.urg });
      descargar(data || [], 'Exportacion_medicos', fmt);
    };
  }
  document.querySelectorAll('#nav [data-t="ventas"]').forEach(b => b.classList.toggle('hide', !veVentas()));
  cargarCatalogos();
  pintarRutaBarra();
  db.rpc('registrar_acceso', { p_evento: 'Entrada', p_agente: navigator.userAgent }).catch(() => {});
  cargarInicio();
  cargarFiltros();
}

/* ---------------- menú de usuario ---------------- */

$('ubtn').addEventListener('click', e => { e.stopPropagation(); $('umenu').classList.toggle('hide'); });
document.addEventListener('click', () => $('umenu').classList.add('hide'));
$('umenu').addEventListener('click', async e => {
  const b = e.target.closest('[data-u]'); if (!b) return;
  if (b.dataset.u === 'salir') {
    await db.rpc('registrar_acceso', { p_evento: 'Salida', p_agente: navigator.userAgent }).catch(() => {});
    await db.auth.signOut(); location.reload();
  }
  else if (b.dataset.u === 'cfg') ir('config');
  else if (b.dataset.u === 'pass') { /* lo gestiona el módulo de contraseñas */ }
  else if (b.dataset.u === 'adm') ir('admin');
});

/* ---------------- navegación ---------------- */

$('nav').addEventListener('click', e => {
  const b = e.target.closest('[data-t]'); if (!b || b.disabled) return;
  ir(b.dataset.t);
});

var ir = function (t) {
  TAB = t;
  document.querySelectorAll('#nav button[data-t]').forEach(x => x.setAttribute('aria-selected', String(x.dataset.t === t)));
  ['inicio', 'agenda', 'rutas', 'directorio', 'pacientes', 'productos', 'seguimiento', 'ventas', 'analitica', 'config', 'admin', 'duplicados'].forEach(k => $('v-' + k).classList.toggle('hide', k !== t));
  window.scrollTo({ top: 0 });
  if (t === 'directorio' && !$('lista').children.length) buscar(true);
  if (t === 'inicio') cargarInicio();
  if (t === 'agenda') cargarAgenda();
  if (t === 'rutas') cargarRutas();
  if (t === 'seguimiento') cargarSeguimiento();
  if (t === 'ventas') cargarVentas();
  if (t === 'analitica') cargarAnalitica();
  if (t === 'config') cargarConfig();
  if (t === 'admin') cargarAdmin();
  if (t === 'duplicados') cargarDuplicados();
  if (t === 'pacientes') cargarPacientes();
  if (t === 'productos') cargarProductosModulo();
};

/* ---------------- inicio ---------------- */

function tarjeta(el, titulo, n, items, pie, vacio) {
  el.innerHTML = `<h2>${titulo}${n != null ? `<span class="n">${num(n)}</span>` : ''}</h2>` +
    (items.length ? `<div class="lista">${items.join('')}</div>` : `<div class="vacio">${vacio}</div>`) +
    (pie && items.length ? pie : '');
}

const itemHTML = (id, ico, clase, titulo, sub) =>
  `<button class="item" data-id="${id}"><span class="ic ${clase || ''}">${ico}</span>
   <span class="tx"><b>${esc(titulo)}</b><span class="sm">${sub}</span></span></button>`;

async function cargarInicio() {
  ['c-agenda', 'c-acciones', 'c-urgentes', 'c-ultimas'].forEach(id =>
    $(id).innerHTML = '<div class="skel" style="width:40%"></div><div class="skel"></div><div class="skel" style="width:70%"></div>');

  const res = await rpcCache('panel_inicio', { lim: 6 }, 'inicio');
  const data = res.data;
  if (!data) { $('c-agenda').innerHTML = '<div class="vacio">Sin conexión y sin copia guardada todavía.</div>'; return; }
  const k = data.kpis;

  const kpi = (n, t, cls, accion, extra) =>
    `<div class="kpi ${cls || ''} ${accion ? 'click' : ''}" ${accion ? `data-k="${accion}"` : ''}>
       <b>${typeof n === 'string' ? n : num(n)}</b><span>${esc(t.charAt(0).toUpperCase() + t.slice(1))}</span>${extra || ''}</div>`;

  const cfg = kpiConfig().filter(x => x.on);
  $('kpis').innerHTML = cfg.map(x => {
    if (x.filtro) return `<div class="kpi click" data-kf="${esc(JSON.stringify(x.filtro))}"><b class="cont">…</b>
      <span>${esc(x.t || textoFiltro(x.filtro))}</span></div>`;
    const c = KPI_CAT.find(y => y.id === x.id);
    if (!kpiPermitido(c)) return '';
    return kpi(c.v(k), x.t || c.t, c.cls ? c.cls(k) : '', c.h);
  }).join('') + `<div class="kpi" style="display:grid;place-items:center;border-style:dashed">
      <button class="kcfg" data-k="cfgkpis">⚙ Personalizar indicadores</button></div>`;

  if (res.cache) avisoCache($('kpis'), res.fecha);

  document.querySelectorAll('#kpis [data-kf]').forEach(async el => {
    const n = await contarFiltro(JSON.parse(el.dataset.kf));
    const b = el.querySelector('.cont'); if (b) b.textContent = num(n);
  });

  tarjetaComision();
  tarjetasRuta();
  tarjeta($('c-agenda'), 'Tu agenda de hoy', data.agenda_hoy.length,
    data.agenda_hoy.map(a => itemHTML(a.medico_id, a.hora ? esc(a.hora).slice(0, 5) : '·',
      a.estado === 'Visitada' ? 'o' : '', a.nombre,
      `${esc(a.centro_nombre || '')} · <b style="color:${a.estado === 'Visitada' ? 'var(--ok)' : 'var(--navy)'}">${esc(a.estado)}</b>`)),
    '', 'No tienes citas para hoy. Planifica una ruta desde Rutas.');

  tarjeta($('c-acciones'), 'Próximas acciones', data.acciones.length,
    data.acciones.map(a => itemHTML(a.medico_id, '↻', a.proxima_fecha < hoyISO() ? 'w' : '', a.nombre,
      `<b style="color:${a.proxima_fecha < hoyISO() ? 'var(--warn)' : 'var(--navy)'}">${fechaCorta(a.proxima_fecha)}</b> · ${esc(a.proxima_accion || 'Seguimiento')}`)),
    '', 'Sin acciones pendientes en los próximos 7 días.');

  tarjeta($('c-urgentes'), 'Urgentes sin visitar', k.urgentes,
    data.urgentes.map(u => itemHTML(u.medico_id, '!', 'w', u.nombre,
      `${esc(u.especialidad || '')} · ${esc(u.centro_nombre || u.municipio || '')}`)),
    k.urgentes > 6 ? `<button class="verlo" data-k="urgentes">Ver los ${num(k.urgentes)} urgentes</button>` : '',
    'Todos los urgentes están visitados.');

  tarjeta($('c-ultimas'), 'Últimas visitas', null,
    data.ultimas_visitas.map(v => itemHTML(v.medico_id, '✓', 'o', v.nombre,
      `${fechaCorta(v.fecha)} · ${esc((v.resultados || []).join(' + ') || 'Sin resultado')}`)),
    '', 'Todavía no hay visitas registradas.');
}

$('v-inicio').addEventListener('click', e => {
  const kf = e.target.closest('[data-kf]');
  if (kf) { aplicarFiltroGuardado(JSON.parse(kf.dataset.kf)); return; }
  const k = e.target.closest('[data-k]');
  if (k) {
    if (k.dataset.k === 'cfgkpis') { abrirKpis(); return; }
    if (k.dataset.k === 'dups') { ir('duplicados'); return; }
    Object.assign(F, { q: '', prov: '', muni: '', esp: '', est: '', urg: false, orden: 'nombre' });
    if (k.dataset.k === 'urgentes') { F.urg = true; F.orden = 'urgentes'; }
    if (k.dataset.k === 'interesados') F.est = 'Interesado';
    if (k.dataset.k === 'sin_contactar') F.est = 'Sin contactar';
    $('q').value = ''; $('fest').value = F.est;
    ir('directorio'); buscar(true);
    return;
  }
  const it = e.target.closest('[data-id]');
  if (it) abrirFicha(it.dataset.id);
});

/* ---------------- filtros ---------------- */

async function cargarFiltros(soloMunicipios) {
  const { data, error } = await db.rpc('opciones_filtros', { f_provincia: F.prov || null });
  if (error) return;
  OPF = data;
  const pon = (sel, lista, etiqueta, valor) => {
    $(sel).innerHTML = `<option value="">${etiqueta}</option>` +
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
  temporizador = setTimeout(() => {
    // Solo filtra si ya estás en el directorio: desde otra pantalla espera a que elijas un resultado
    if (TAB !== 'directorio') return;
    F.q = e.target.value.trim();
    buscar(true);
  }, 300);
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
  if (F.urg) c.push(['urg', 'Solo urgentes']);
  $('chips').innerHTML = c.map(([k, t]) => `<button class="chip" data-x="${k}">${esc(t)} ✕</button>`).join('');
}

$('chips').addEventListener('click', e => {
  const b = e.target.closest('[data-x]'); if (!b) return;
  const k = b.dataset.x;
  if (k === 'q') { F.q = ''; $('q').value = ''; }
  else if (k === 'urg') F.urg = false;
  else { F[k] = ''; $('f' + k).value = ''; if (k === 'prov') { F.muni = ''; cargarFiltros(true); } }
  buscar(true);
});

/* ---------------- directorio ---------------- */

async function buscar(reiniciar) {
  if (typeof MODO_MAPA !== 'undefined' && MODO_MAPA && reiniciar) setTimeout(() => pintarMapa(), 10);
  if (reiniciar) F.pagina = 0;
  cargando($('lista'), 'Buscando médicos…');
  $('cuenta').textContent = 'Buscando…';
  const t0 = performance.now();

  const { data, error } = await db.rpc('buscar_medicos', {
    q: F.q || null, f_provincia: F.prov || null, f_municipio: F.muni || null,
    f_estado: F.est || null, f_especialidad: F.esp || null, f_area: null,
    f_urgentes: F.urg, f_mios: false, f_sin_visitar: false, f_comercial: F.com || null,
    orden: F.orden, lim: tamPagina(), desplaz: F.pagina * tamPagina()
  });

  if (error) { $('cuenta').textContent = 'No se ha podido buscar: ' + error.message; return; }

  F.total = data.total;
  const ms = Math.round(performance.now() - t0);
  $('cuenta').innerHTML = `<b>${num(data.total)}</b> médicos <span class="sm">· ${ms} ms</span>`;
  pintarChips();

  const filas = data.filas || [];
  if (!filas.length) { $('lista').innerHTML = '<div class="vacio">Ningún médico cumple estos filtros.</div>'; $('thead').innerHTML = ''; }
  else { cabeceraTabla(); $('lista').innerHTML = filas.map(filaTabla).join(''); }

  $('mas').classList.add('hide');
  paginador($('dirpag'), data.total, F.pagina, p => {
    F.pagina = p; buscar(false);
    $('tabla').scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, () => buscar(true));
}

function fila(m) {
  const d = m.dias || {};
  return `<button class="fila" data-id="${m.id}">
    <span><span class="nm">${m.urgente ? '<span class="pill p-urg">Urgente</span> ' : ''}${esc(m.nombre)}</span>
      <span class="sm">${esc(m.especialidad || 'Sin especialidad')}</span></span>
    <span class="c2"><span class="nm" style="font-size:13.5px">${esc(m.centro_nombre || 'Consulta privada')}</span>
      <span class="sm">${esc([m.municipio, m.provincia].filter(Boolean).join(' · '))}</span></span>
    <span class="c3"><span class="dias">${['L','M','X','J','V'].map(k => `<span class="${d[k] ? 'on' : ''}">${k}</span>`).join('')}</span></span>
    <span class="pill p-est">${esc(m.estado_comercial)}</span>
  </button>`;
}


$('lista').addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (b) abrirFicha(b.dataset.id); });

/* ---------------- ficha ---------------- */

async function abrirFicha(id) {
  FICHA_ID = id;
  $('fbody').innerHTML = '<div class="skel" style="width:50%"></div><div class="skel"></div><div class="skel" style="width:80%"></div>';
  $('ficha').showModal();
  const rf = await rpcCache('ficha_medico', { p_id: id }, 'ficha-' + id);
  const data = rf.data;
  if (!data || !data.medico) { $('fbody').innerHTML = '<p class="sm">Sin conexión y sin copia guardada de esta ficha.</p>'; return; }

  const m = data.medico, cons = data.consultas || [], vis = data.visitas || [], com = data.comerciales || [];
  const dias = ['L','M','X','J','V'];

  $('fbody').innerHTML = `${rf.cache ? '<div class="cacheaviso">Sin conexión · ficha guardada en este dispositivo</div>' : ''}
    <div class="fh">
      <div><h2>${m.urgente ? '<span class="pill p-urg">Urgente</span> ' : ''}${esc(m.nombre)}</h2>
        <div class="sm">${esc(m.especialidad || '')}${m.area ? ' · ' + esc(m.area) : ''} · código ${esc(m.codigo)}</div></div>
      <button class="x" id="fx" aria-label="Cerrar">✕</button>
    </div>
    ${(puedeRegistrar() || puedeEditarTipo(m.tipo)) ? `<div class="acts">
      ${puedeRegistrar() ? `<button class="btn" data-act="visita" data-id="${m.id}">Registrar visita</button>` : ''}
      ${puedeEditarTipo(m.tipo) ? `<button class="btn sec" data-act="editar" data-id="${m.id}">Editar ficha</button>` : ''}
      ${puedeEditarTipo(m.tipo) ? `<button class="btn ${m.urgente ? 'sec' : 'warn'}" data-act="urgente" data-id="${m.id}" data-urg="${m.urgente ? 1 : 0}">${m.urgente ? 'Quitar urgente' : 'Marcar urgente'}</button>` : ''}
      <button class="btn sec" data-agendar="${m.id}">+ Añadir a mi agenda</button>
    </div>` : ''}
    <div class="blk"><h3>Estado</h3>
      <div>${puedeEditar()
        ? `<select data-estado="${m.id}" style="max-width:240px">${ESTADOS.map(x => `<option ${x === m.estado_comercial ? 'selected' : ''}>${x}</option>`).join('')}</select>`
        : `<span class="pill p-est">${esc(m.estado_comercial)}</span>`}${m.prioridad ? ' <span class="sm">· ' + esc(m.prioridad) + '</span>' : ''}</div>
      ${m.urgente && m.urgente_motivo ? `<div class="sm" style="margin-top:6px">Urgente: ${esc(m.urgente_motivo)}</div>` : ''}
      ${m.cuando_visitar ? `<div class="sm" style="margin-top:6px">Cuándo visitar: ${esc(m.cuando_visitar)}</div>` : ''}
      ${com.length ? `<div class="sm" style="margin-top:6px">Comercial: ${com.map(esc).join(', ')}</div>` : ''}
      ${m.telefono ? `<div class="sm" style="margin-top:6px">Teléfono: ${esc(m.telefono)}</div>` : ''}
    </div>
    ${cons.map(c => `<div class="blk"><h3>${esc(c.centro_nombre || 'Consulta privada')}</h3>
      <div>${esc([c.direccion, c.cp, c.municipio].filter(Boolean).join(', ')) || '<span class="sm">Sin dirección</span>'}</div>
      ${c.telefono ? `<div class="sm">Teléfono: ${esc(c.telefono)}</div>` : ''}
      <div class="dias" style="margin-top:8px">${dias.map(k => `<span class="${(c.dias || {})[k] ? 'on' : ''}">${k}</span>`).join('')}</div>
      ${dias.filter(k => (c.dias || {})[k]).map(k => `<div class="sm">${k}: ${esc(c.dias[k])}</div>`).join('')}
      ${c.lat ? `<div class="sm" style="margin-top:6px"><a href="${enlaceNav([c.lat, c.lon])}" target="_blank" rel="noopener">Cómo llegar</a></div>` : ''}
    </div>`).join('')}
    <div class="blk"><h3>Visitas</h3>
      ${vis.length ? vis.slice(0, 10).map(v => `<div style="padding:7px 0;border-top:1px solid var(--line);display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
        <span><b>${fechaCorta(v.fecha)}</b> · ${esc((v.resultados || []).join(' + ') || 'Sin resultado')}
          ${v.muestras ? ` · ${v.muestras} muestras` : ''}
          ${v.nota ? `<div class="sm">${esc(v.nota)}</div>` : ''}
          ${v.proxima_fecha ? `<div class="sm">Próxima: ${fechaCorta(v.proxima_fecha)} · ${esc(v.proxima_accion || '')}</div>` : ''}</span>
        ${puedeRegistrar() ? `<button class="btn sec" data-editv='${esc(JSON.stringify(v))}' style="min-height:30px;padding:5px 9px;font-size:12.5px">Editar</button>` : ''}
      </div>`).join('') : '<div class="sm">Todavía no hay visitas registradas.</div>'}</div>
    ${m.nota ? `<div class="blk"><h3>Nota</h3><div>${esc(m.nota)}</div></div>` : ''}
    ${m.contacto ? `<div class="blk"><h3>Contacto</h3><div>${esc(m.contacto)}</div></div>` : ''}`;
  $('fx').onclick = () => $('ficha').close();
  $('fbody').querySelectorAll('[data-editv]').forEach(b => b.onclick = () => editarVisita(JSON.parse(b.dataset.editv), id));
}

$('ficha').addEventListener('click', e => { if (e.target.id === 'ficha') $('ficha').close(); });

/* ---------------- arranque ---------------- */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

/* ============================================================
   DLC OS 2.0 · Entrega 3: registrar visitas, editar fichas y altas
   ============================================================ */

const CAT = { RESULTADO: [], ESPECIALIDAD: [], AREA: [], MOTIVO_URGENCIA: [], FORMA_PAGO: [] };
const ESTADOS = ['Sin contactar', 'Presentado', 'Interesado', 'Prescribe', 'No interesado'];
const DIAS = ['L', 'M', 'X', 'J', 'V'];
const DIAN = { L: 'Lunes', M: 'Martes', X: 'Miércoles', J: 'Jueves', V: 'Viernes' };
const HM = ['09:00-13:00', '09:30-13:30', '10:00-14:00', '08:00-15:00'];
const HT = ['15:00-19:00', '16:00-19:00', '16:00-20:00', '17:00-20:00'];
let FICHA_ID = null;

const puedeEditar = () => PERFIL && (PERFIL.rol === 'Administrador' || ((PERFIL.areas || {}).M || 0) >= 2);
const puedeEditarTipo = t => PERFIL && (PERFIL.rol === 'Administrador' || ((PERFIL.areas || {})[t === 'Centro' ? 'C' : 'M'] || 0) >= 2);
const puedeCrearTipo = t => PERFIL && (PERFIL.rol === 'Administrador' || ((PERFIL.areas || {})[t === 'Centro' ? 'C' : 'M'] || 0) >= 3);
const puedeCrear = () => puedeCrearTipo('Persona') || puedeCrearTipo('Centro');
const puedeRegistrar = () => PERFIL && (PERFIL.rol === 'Administrador' || ((PERFIL.areas || {}).S || 0) >= 2);

let tToast;
function toast(msg, err) {
  const t = $('toast');
  t.textContent = msg; t.className = 'toast' + (err ? ' err' : '');
  clearTimeout(tToast); tToast = setTimeout(() => t.classList.add('hide'), 3200);
}

async function cargarCatalogos() {
  const claves = Object.keys(CAT);
  const res = await Promise.all(claves.map(k => db.rpc('catalogo', { p_clave: k })));
  claves.forEach((k, i) => { CAT[k] = res[i].data || []; });
}

/* ---------------- selector de días ---------------- */

function dpHTML(dias, idx) {
  const st = {};
  DIAS.forEach(k => {
    const t = String((dias || {})[k] || '');
    const r = /(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/.exec(t);
    st[k] = {
      M: /mañana/i.test(t) || (r && +r[1].slice(0, 2) < 14),
      T: /tarde/i.test(t) || (r && +r[1].slice(0, 2) >= 14),
      h: r ? r[1] + '-' + r[2] : ''
    };
  });
  const sel = (k, f) => `<select data-dh="${idx}|${k}|${f}"><option value="">Sin hora</option>${
    (f === 'M' ? HM : HT).map(x => `<option ${st[k].h === x ? 'selected' : ''}>${x.replace('-', ' - ')}</option>`).join('')}</select>`;
  return `<div class="dp" data-dp="${idx}">
    <div class="qk"><button type="button" data-qk="${idx}|lvm">L-V mañanas</button>
      <button type="button" data-qk="${idx}|lvt">L-V tardes</button>
      <button type="button" data-qk="${idx}|clr">Limpiar</button></div>
    ${DIAS.map(k => `<div class="dprow"><b>${DIAN[k].slice(0, 3)}</b>
      <div class="dpc"><button type="button" class="dpt" data-dt="${idx}|${k}|M" aria-pressed="${!!st[k].M}">${st[k].M ? '✓ ' : ''}Mañana</button>${st[k].M ? sel(k, 'M') : ''}</div>
      <div class="dpc"><button type="button" class="dpt" data-dt="${idx}|${k}|T" aria-pressed="${!!st[k].T}">${st[k].T ? '✓ ' : ''}Tarde</button>${st[k].T ? sel(k, 'T') : ''}</div>
    </div>`).join('')}</div>`;
}

function dpLeer(cont, idx) {
  const out = {};
  DIAS.forEach(k => {
    const partes = [];
    ['M', 'T'].forEach(f => {
      const b = cont.querySelector(`[data-dt="${idx}|${k}|${f}"]`);
      if (b && b.getAttribute('aria-pressed') === 'true') {
        const s = cont.querySelector(`[data-dh="${idx}|${k}|${f}"]`);
        const h = s && s.value ? ' ' + s.value.replace(/\s/g, '') : '';
        partes.push((f === 'M' ? 'Mañana' : 'Tarde') + h);
      }
    });
    if (partes.length) out[k] = partes.join('; ');
  });
  return out;
}

document.addEventListener('click', e => {
  const t = e.target.closest('[data-dt]');
  if (t) {
    const cont = t.closest('.dp'), [idx, k, f] = t.dataset.dt.split('|');
    const dias = dpLeer(cont.parentElement, idx);
    const st = dpEstado(cont, idx);
    st[k][f] = !st[k][f];
    repintarDp(cont, idx, st);
    return;
  }
  const q = e.target.closest('[data-qk]');
  if (q) {
    const cont = q.closest('.dp'), [idx, modo] = q.dataset.qk.split('|');
    const st = dpEstado(cont, idx);
    DIAS.forEach(k => {
      if (modo === 'clr') { st[k].M = st[k].T = false; st[k].h = { M: '', T: '' }; }
      if (modo === 'lvm') st[k].M = true;
      if (modo === 'lvt') st[k].T = true;
    });
    repintarDp(cont, idx, st);
  }
});

function dpEstado(cont, idx) {
  const st = {};
  DIAS.forEach(k => {
    st[k] = { M: false, T: false, h: { M: '', T: '' } };
    ['M', 'T'].forEach(f => {
      const b = cont.querySelector(`[data-dt="${idx}|${k}|${f}"]`);
      if (b) st[k][f] = b.getAttribute('aria-pressed') === 'true';
      const s = cont.querySelector(`[data-dh="${idx}|${k}|${f}"]`);
      if (s) st[k].h[f] = s.value;
    });
  });
  return st;
}

function repintarDp(cont, idx, st) {
  const dias = {};
  DIAS.forEach(k => {
    const p = [];
    if (st[k].M) p.push('Mañana' + (st[k].h.M ? ' ' + st[k].h.M.replace(/\s/g, '') : ''));
    if (st[k].T) p.push('Tarde' + (st[k].h.T ? ' ' + st[k].h.T.replace(/\s/g, '') : ''));
    if (p.length) dias[k] = p.join('; ');
  });
  cont.outerHTML = dpHTML(dias, idx);
}

/* ---------------- registrar visita ---------------- */

async function abrirVisita(id) {
  const { data, error } = await db.rpc('ficha_medico', { p_id: id });
  if (error) { toast('No se ha podido abrir: ' + error.message, true); return; }
  const m = data.medico, cons = data.consultas || [];
  const pos = CAT.RESULTADO.filter(r => r.extra !== 'neg'), neg = CAT.RESULTADO.filter(r => r.extra === 'neg');

  $('dbody').innerHTML = `
    <div class="fh"><div><h2>Registrar visita</h2><div class="sm">${esc(m.nombre)}</div></div>
      <button class="x" data-cerrar aria-label="Cerrar">✕</button></div>
    <div class="g2">
      <div><label for="vf">Fecha</label><input id="vf" type="date" value="${hoyISO()}"></div>
      <div><label for="vc">Centro de la visita</label><select id="vc">
        ${cons.map(c => `<option value="${c.id}">${esc(c.centro_nombre || 'Consulta privada')}${c.municipio ? ' · ' + esc(c.municipio) : ''}</option>`).join('')}
      </select></div>
    </div>
    <label>Resultado <span class="sm">· puedes marcar varios de "visita realizada"</span></label>
    <div class="opciones">${pos.map(r => `<button type="button" class="opt" data-res="${esc(r.valor)}" aria-pressed="false"><span class="mk"></span>${esc(r.valor)}</button>`).join('')}</div>
    <div class="opciones" style="margin-top:8px">${neg.map(r => `<button type="button" class="opt neg" data-res="${esc(r.valor)}" data-neg="1" aria-pressed="false"><span class="mk"></span>${esc(r.valor)}</button>`).join('')}</div>
    <div class="g2" style="margin-top:6px">
      <div><label for="vm">Muestras entregadas</label><input id="vm" type="number" min="0" max="99" value="0"></div>
      <div><label for="vpf">Próxima acción · fecha</label><input id="vpf" type="date"></div>
    </div>
    <label for="vpa">Próxima acción</label><input id="vpa" placeholder="p. ej. Llevar reporting">
    <label for="vn">Nota</label><textarea id="vn" rows="3"></textarea>
    <div class="acts" style="justify-content:flex-end">
      <button class="btn sec" data-cerrar>Cancelar</button>
      <button class="btn" id="vguardar">Guardar visita</button>
    </div>`;

  $('dbody').querySelectorAll('[data-res]').forEach(b => b.onclick = () => {
    const esNeg = b.dataset.neg === '1', on = b.getAttribute('aria-pressed') === 'true';
    $('dbody').querySelectorAll('[data-res]').forEach(x => {
      if (esNeg || x.dataset.neg === '1') x.setAttribute('aria-pressed', 'false');
    });
    b.setAttribute('aria-pressed', String(!on));
  });

  $('vguardar').onclick = async ev => {
    const res = [...$('dbody').querySelectorAll('[data-res][aria-pressed=true]')].map(b => b.dataset.res);
    if (!res.length) { toast('Elige al menos un resultado', true); return; }
    ev.target.disabled = true; ev.target.textContent = 'Guardando…';
    const { data: r, error: err } = await db.rpc('registrar_visita', { p: {
      medico_id: id, consulta_id: $('vc').value || null, fecha: $('vf').value,
      resultados: res, muestras: +$('vm').value || 0, nota: $('vn').value.trim(),
      proxima_accion: $('vpa').value.trim(), proxima_fecha: $('vpf').value || null,
      op_id: 'v-' + id + '-' + Date.now()
    }});
    ev.target.disabled = false; ev.target.textContent = 'Guardar visita';
    if (err) { toast('No se ha podido guardar: ' + err.message, true); return; }
    $('dlg').close();
    toast('Visita registrada' + (r && r.estado ? ' · estado: ' + r.estado : ''));
    cargarInicio();
    if (FICHA_ID === id) abrirFicha(id);
  };
  $('dlg').showModal();
}

/* ---------------- editar ficha y altas ---------------- */

function consHTML(c, i) {
  return `<div class="cons" data-cons="${i}">
    ${i > 0 ? `<button type="button" class="quitar" data-quitar="${i}">Quitar</button>` : ''}
    <input type="hidden" data-cid="${i}" value="${esc(c.id || '')}">
    <div class="g2">
      <div><label>Centro</label><input data-cf="${i}|centro_nombre" value="${esc(c.centro_nombre || '')}" placeholder="Nombre del centro o vacío si es privada"></div>
      <div><label>Municipio</label><input data-cf="${i}|municipio" value="${esc(c.municipio || '')}"></div>
    </div>
    <div class="g2">
      <div><label>Dirección</label><input data-cf="${i}|direccion" value="${esc(c.direccion || '')}"></div>
      <div><label>Código postal</label><input data-cf="${i}|cp" value="${esc(c.cp || '')}"></div>
    </div>
    <div class="g2">
      <div><label>Provincia</label><input data-cf="${i}|provincia" value="${esc(c.provincia || 'BARCELONA')}"></div>
      <div><label>Teléfono</label><input data-cf="${i}|telefono" value="${esc(c.telefono || '')}" inputmode="tel"></div>
    </div>
    <label>Días y horario</label>${dpHTML(c.dias || {}, i)}
  </div>`;
}

async function abrirEditor(id, tipo) {
  let m = { tipo: tipo || 'Persona', estado_comercial: 'Sin contactar' }, cons = [{}];
  if (id) {
    const { data, error } = await db.rpc('ficha_medico', { p_id: id });
    if (error) { toast('No se ha podido abrir: ' + error.message, true); return; }
    m = data.medico; cons = (data.consultas || []).length ? data.consultas : [{}];
  }
  const esCentro = m.tipo === 'Centro';
  const opts = (lista, v) => `<option value=""></option>` + lista.map(x =>
    `<option ${v === x.valor ? 'selected' : ''}>${esc(x.valor)}</option>`).join('');

  $('dbody').innerHTML = `
    <div class="fh"><div><h2>${id ? 'Editar ficha' : esCentro ? 'Nuevo centro' : 'Nuevo médico'}</h2>
      <div class="sm">${id ? esc(m.nombre) : esCentro ? 'Clínica, hospital o centro médico' : 'Profesional con sus consultas'}</div></div>
      <button class="x" data-cerrar aria-label="Cerrar">✕</button></div>
    <label for="en">${esCentro ? 'Nombre del centro' : 'Apellidos, Nombre'}</label>
    <input id="en" value="${esc(m.nombre || '')}" placeholder="${esCentro ? 'CLÍNICA SANT JORDI' : 'GARCIA LOPEZ, ANA'}" autocapitalize="characters">
    ${esCentro ? '' : `<div class="g2">
      <div><label for="ee">Especialidad</label><select id="ee">${opts(CAT.ESPECIALIDAD, m.especialidad)}</select></div>
      <div><label for="ea">Área</label><select id="ea">${opts(CAT.AREA, m.area)}</select></div></div>`}
    <div class="g2">
      <div><label for="et">Teléfono</label><input id="et" value="${esc(m.telefono || '')}" inputmode="tel"></div>
      <div><label for="em">Email</label><input id="em" type="email" value="${esc(m.email || '')}"></div>
    </div>
    <label for="ect">Contacto (secretaría, teléfono, email)</label><input id="ect" value="${esc(m.contacto || '')}">
    <label for="ecv">Cuándo visitar</label><input id="ecv" value="${esc(m.cuando_visitar || '')}" placeholder="p. ej. martes por la mañana">
    <label for="eno">Nota</label><textarea id="eno" rows="3">${esc(m.nota || '')}</textarea>
    <div id="econs">${cons.map(consHTML).join('')}</div>
    <div class="acts"><button type="button" class="btn sec" id="eadd">+ Añadir consulta</button></div>
    <div id="edup"></div>
    <div class="acts" style="justify-content:flex-end">
      <button class="btn sec" data-cerrar>Cancelar</button>
      <button class="btn" id="eguardar">${id ? 'Guardar cambios' : 'Crear'}</button>
    </div>`;

  $('eadd').onclick = () => {
    const i = $('econs').children.length;
    $('econs').insertAdjacentHTML('beforeend', consHTML({}, i));
  };
  $('econs').onclick = e => {
    const q = e.target.closest('[data-quitar]');
    if (q) q.closest('.cons').remove();
  };

  const recoger = () => {
    const consultas = [...$('econs').children].map(box => {
      const i = box.dataset.cons;
      const g = f => (box.querySelector(`[data-cf="${i}|${f}"]`) || {}).value || '';
      return {
        id: (box.querySelector(`[data-cid="${i}"]`) || {}).value || null,
        centro_nombre: g('centro_nombre').toUpperCase(), municipio: g('municipio').toUpperCase(),
        provincia: g('provincia').toUpperCase(), direccion: g('direccion'), cp: g('cp'),
        telefono: g('telefono'), dias: dpLeer(box, i)
      };
    });
    return {
      id: id || null, tipo: m.tipo,
      nombre: $('en').value.trim().toUpperCase(),
      especialidad: esCentro ? '' : ($('ee') || {}).value || '',
      area: esCentro ? '' : ($('ea') || {}).value || '',
      telefono: $('et').value.trim(), email: $('em').value.trim(),
      contacto: $('ect').value.trim(), cuando_visitar: $('ecv').value.trim(),
      nota: $('eno').value.trim(), estado_comercial: m.estado_comercial, consultas
    };
  };

  let avisado = false;
  $('eguardar').onclick = async ev => {
    const p = recoger();
    if (!p.nombre || p.nombre.length < 3) { toast('Escribe el nombre', true); return; }
    if (!id && !esCentro && p.nombre.indexOf(',') < 0) { toast('Escribe el nombre como APELLIDOS, NOMBRE', true); return; }

    if (!id && !avisado) {
      const { data: dup } = await db.rpc('duplicados_de', {
        p_nombre: p.nombre, p_tipo: p.tipo, p_municipio: (p.consultas[0] || {}).municipio || null
      });
      const altos = (dup || []).filter(d => d.pct >= 70);
      if (altos.length) {
        avisado = true;
        $('edup').innerHTML = `<div class="dupbox"><b>Puede que ya exista</b>
          <div class="sm">Si es la misma persona, cancela y abre su ficha. Si no lo es, vuelve a pulsar Crear.</div>
          ${altos.map(d => `<div class="l"><span><b>${esc(d.nombre)}</b><br><span class="sm">${esc(d.especialidad || '')} · ${esc(d.centro || '')} · ${esc(d.municipio || '')}</span></span>
            <span><b>${d.pct}%</b></span></div>`).join('')}</div>`;
        $('eguardar').textContent = 'Crear de todos modos';
        return;
      }
    }

    ev.target.disabled = true; ev.target.textContent = 'Guardando…';
    const { data, error } = await db.rpc('guardar_medico', { p });
    ev.target.disabled = false; ev.target.textContent = id ? 'Guardar cambios' : 'Crear';
    if (error) { toast('No se ha podido guardar: ' + error.message, true); return; }
    $('dlg').close();
    toast(id ? 'Ficha guardada' : 'Creado correctamente');
    buscar(true); cargarInicio();
    if (data && data.medico) abrirFicha(data.medico.id);
  };
  $('dlg').showModal();
}

/* ---------------- acciones desde la ficha ---------------- */

async function cambiarEstado(id, estado) {
  const { error } = await db.from('medicos').update({ estado_comercial: estado }).eq('id', id);
  if (error) { toast('No se ha podido cambiar: ' + error.message, true); return; }
  toast('Estado: ' + estado);
  buscar(true); cargarInicio();
}

async function alternarUrgente(id, esUrgente, nombre) {
  let motivo = null;
  if (!esUrgente) {
    motivo = await pedirTexto('Motivo (opcional). Puedes escribirlo o elegir uno:', '',
      { titulo: 'Marcar como urgente', ok: 'Marcar urgente', opciones: CAT.MOTIVO_URGENCIA.map(x => x.valor) });
    if (motivo === null) return;
  }
  const { error } = await db.from('medicos')
    .update({ urgente: !esUrgente, urgente_motivo: esUrgente ? null : (motivo || 'Marcado desde la app') })
    .eq('id', id);
  if (error) { toast('No se ha podido cambiar: ' + error.message, true); return; }
  toast(esUrgente ? 'Ya no es urgente' : 'Marcado como urgente');
  abrirFicha(id); buscar(true); cargarInicio();
}

/* ---------------- enganches ---------------- */

document.addEventListener('click', e => {
  if (e.target.closest('.x[data-cerrar]')) intentarCerrar($('dlg'));
  else if (e.target.closest('[data-cerrar]')) $('dlg').close();
  const a = e.target.closest('[data-act]');
  if (!a) return;
  const id = a.dataset.id;
  if (a.dataset.act === 'visita') abrirVisita(id);
  if (a.dataset.act === 'editar') abrirEditor(id);
  if (a.dataset.act === 'urgente') alternarUrgente(id, a.dataset.urg === '1');
});

document.addEventListener('change', e => {
  const s = e.target.closest('[data-estado]');
  if (s) cambiarEstado(s.dataset.estado, s.value);
});

$('dlg2').addEventListener('click', e => {
  if (e.target.closest('.x[data-cerrar2]')) intentarCerrar($('dlg2'));
  else if (e.target.closest('[data-cerrar2]')) $('dlg2').close();
});

$('nuevoBtn').addEventListener('click', () => {
  if (!puedeCrear()) { toast('No tienes permiso para crear fichas', true); return; }
  $('dbody').innerHTML = `
    <div class="fh"><div><h2>Crear nuevo</h2><div class="sm">¿Qué quieres dar de alta?</div></div>
      <button class="x" data-cerrar aria-label="Cerrar">✕</button></div>
    <div class="opciones" style="margin-top:10px">
      <button class="opt ${puedeCrearTipo('Persona') ? '' : 'hide'}" data-crear="Persona" style="flex-direction:column;align-items:flex-start;gap:4px;padding:16px">
        <b style="font-size:16px;color:var(--navy)">Médico</b><span class="sm">Profesional con sus consultas y horarios</span></button>
      <button class="opt ${puedeCrearTipo('Centro') ? '' : 'hide'}" data-crear="Centro" style="flex-direction:column;align-items:flex-start;gap:4px;padding:16px">
        <b style="font-size:16px;color:var(--navy)">Centro</b><span class="sm">Clínica, hospital o centro médico</span></button>
    </div>`;
  $('dbody').querySelectorAll('[data-crear]').forEach(b => b.onclick = () => abrirEditor(null, b.dataset.crear));
  $('dlg').showModal();
});



/* ============================================================
   DLC OS 2.0 · Entrega 4: agenda, rutas, plan del día y cola sin conexión
   ============================================================ */

/* ---------------- cola sin conexión ---------------- */

const COLA = 'dlc-cola';
const colaLeer = () => { try { return JSON.parse(localStorage.getItem(COLA) || '[]'); } catch (e) { return []; } };
const colaGuardar = c => localStorage.setItem(COLA, JSON.stringify(c));

function pintarConexion() {
  const n = colaLeer().length;
  const el = $('conex');
  if (!navigator.onLine) { el.className = 'conex off'; el.textContent = n ? `Sin conexión · ${n} ${n === 1 ? 'cambio' : 'cambios'} en espera` : 'Sin conexión'; }
  else if (n) { el.className = 'conex esp'; el.textContent = `Enviando ${n} ${n === 1 ? 'cambio' : 'cambios'}…`; }
  else { el.className = 'conex hide'; el.textContent = ''; }
}

/** Ejecuta una escritura; si no hay conexión, la guarda y la reenvía después. */
async function escribir(fn, payload, etiqueta) {
  if (!navigator.onLine) {
    colaGuardar(colaLeer().concat([{ fn, payload, etiqueta, t: Date.now() }]));
    pintarConexion();
    toast('Sin conexión: se enviará al recuperarla');
    return { offline: true };
  }
  const { data, error } = await db.rpc(fn, payload);
  if (error) {
    if (String(error.message || '').match(/fetch|network|Failed/i)) {
      colaGuardar(colaLeer().concat([{ fn, payload, etiqueta, t: Date.now() }]));
      pintarConexion();
      toast('Guardado en este dispositivo: se enviará luego');
      return { offline: true };
    }
    return { error };
  }
  return { data };
}

async function vaciarCola() {
  if (!navigator.onLine) return;
  let c = colaLeer();
  if (!c.length) return;
  const habia = c.length;
  pintarConexion();
  while (c.length) {
    const op = c[0];
    const { error } = await db.rpc(op.fn, op.payload);
    if (error && String(error.message || '').match(/fetch|network|Failed/i)) break;
    c = c.slice(1);
    colaGuardar(c);
  }
  pintarConexion();
  if (colaLeer().length < habia) { invalidarCache(); cargarInicio(); if (TAB === 'agenda') cargarAgenda(); }
}

window.addEventListener('online', () => { pintarConexion(); vaciarCola(); });
window.addEventListener('offline', pintarConexion);
setInterval(vaciarCola, 60000);

/* ---------------- agenda ---------------- */

let AG_MODO = 'dia', AG_FECHA = null;

const isoMas = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const lunesDe = iso => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
const EST_COL = { Planificada: 'var(--navy)', Visitada: 'var(--ok)', Pendiente: 'var(--warn)', Reprogramada: 'var(--sky)', Descartada: 'var(--muted)' };

async function cargarAgenda() {
  if (!AG_FECHA) AG_FECHA = hoyISO();
  const desde = AG_MODO === 'dia' ? AG_FECHA : lunesDe(AG_FECHA);
  const hasta = AG_MODO === 'dia' ? AG_FECHA : isoMas(desde, 6);
  // Si se vuelve a pintar la misma vista, se conserva lo que había mientras llegan los datos (sin parpadeo)
  const prev = $('agcuerpo');
  const clave = AG_MODO + '|' + desde + '|' + (typeof agUid === 'function' ? agUid() : '');
  const previo = prev && prev.dataset.modo === clave ? prev.innerHTML : null;

  $('v-agenda').innerHTML = `
    <div class="saludo"><div><h1>Agenda</h1><div class="fecha" id="agtit">…</div></div>
      <div class="acts" style="margin:0">
        <button class="btn sec" data-ag="ant">←</button>
        <button class="btn sec" data-ag="hoy">Hoy</button>
        <button class="btn sec" data-ag="sig">→</button>
        <button class="btn ${AG_MODO === 'dia' ? '' : 'sec'}" data-ag="dia">Día</button>
        <button class="btn ${AG_MODO === 'semana' ? '' : 'sec'}" data-ag="semana">Semana</button>
        <button class="btn ${AG_MODO === 'mes' ? '' : 'sec'}" data-ag="mes">Mes</button>
        <button class="btn" data-ag="nueva">+ Nueva cita</button>
      </div></div>
    <div class="card" id="agcuerpo" ${previo ? `data-modo="${esc(clave)}"` : ''}>${previo || '<div class="skel"></div><div class="skel" style="width:70%"></div><div class="skel" style="width:85%"></div>'}</div>
    <div class="card" id="agpend"></div>`;

  $('agtit').textContent = AG_MODO === 'dia'
    ? fechaLarga(new Date(AG_FECHA + 'T00:00:00')).replace(/^./, c => c.toUpperCase())
    : `Semana del ${fechaCorta(desde)} al ${fechaCorta(hasta)}`;

  if (AG_MODO === 'mes') { $('agtit').textContent = periodoTxt(AG_FECHA.slice(0, 7)); pintarMesAgenda(AG_FECHA.slice(0, 7)); return; }

  const [rc, rp] = await Promise.all([
    rpcCache('agenda_rango', { p_desde: desde, p_hasta: hasta, p_usuario: agUsuarioFiltro() }, 'agenda-' + desde),
    rpcCache('pendientes_ruta', {}, 'pendientes')
  ]);
  const citas = rc.data, pend = rp.data;
  if (!citas) { $('agcuerpo').innerHTML = '<div class="vacio">Sin conexión y sin copia guardada de estos días.</div>'; return; }
  if (rc.cache) avisoCache($('agcuerpo'), rc.fecha);

  const porDia = {};
  (citas || []).forEach(c => { (porDia[c.fecha] = porDia[c.fecha] || []).push(c); });
  const dias = AG_MODO === 'dia' ? [AG_FECHA] : Array.from({ length: 7 }, (_, i) => isoMas(desde, i));

  // «Tu día» y la semana en cuadrícula se pintan después con su propio formato
  if (AG_MODO !== 'dia' && AG_MODO !== 'semana') $('agcuerpo').innerHTML = dias.map(f => {
    const lista = porDia[f] || [];
    const hechas = lista.filter(c => c.estado === 'Visitada').length;
    return `<h2 style="padding:14px 16px 0">${fechaLarga(new Date(f + 'T00:00:00')).replace(/^./, c => c.toUpperCase())}
        ${lista.length ? `<span class="n">${hechas}/${lista.length}</span>` : ''}</h2>
      ${lista.length ? `<div class="lista">${lista.map(c => `
        <div class="item" style="cursor:default">
          <span class="ic" style="background:${EST_COL[c.estado]}20;color:${EST_COL[c.estado]}">${c.hora ? esc(c.hora).slice(0, 5) : '·'}</span>
          <span class="tx"><b>${c.urgente ? '<span class="pill p-urg">Urgente</span> ' : ''}${esc(c.nombre)}</b>
            <span class="sm">${esc(c.centro_nombre || '')} · <b style="color:${EST_COL[c.estado]}">${esc(c.estado)}</b>${PERFIL.rol === 'Administrador' && c.usuario ? ' · ' + esc(c.usuario) : ''}</span></span>
          <span class="acts" style="margin:0">
            <button class="btn sec" data-cita="ficha|${c.medico_id}">Ficha</button>
            ${c.estado !== 'Visitada' ? `<button class="btn sec" data-cita="visita|${c.medico_id}">Registrar</button>
              <button class="btn sec" data-cita="hora|${c.id}|${esc(c.hora || '')}">Hora</button>
              <button class="btn sec" data-cita="repro|${c.id}">Mover</button>
              <button class="btn sec" data-cita="desc|${c.id}">Descartar</button>
              ${c.fecha >= hoyISO() ? `<button class="btn sec dang" data-cita="borrar|${c.id}">Borrar</button>` : ''}` : ''}
          </span></div>`).join('')}</div>`
      : '<div class="vacio">Sin citas este día.</div>'}`;
  }).join('');

  const pendientes = pend || [];
  $('agpend').innerHTML = pendientes.length
    ? `<h2>Pendientes de rutas anteriores<span class="n">${pendientes.length}</span></h2>
       <p class="sm">Los planificaste y no se visitaron. Puedes moverlos a hoy o descartarlos.</p>
       <div class="lista">${pendientes.map(p => `<div class="item" style="cursor:default">
         <span class="ic w">!</span>
         <span class="tx"><b>${esc(p.nombre)}</b><span class="sm">${fechaCorta(p.fecha)} · ${esc(p.centro_nombre || '')}</span></span>
         <span class="acts" style="margin:0">
           <button class="btn sec" data-cita="hoy|${p.id}">Mover a hoy</button>
           <button class="btn sec" data-cita="desc|${p.id}">Descartar</button></span></div>`).join('')}</div>`
    : '';
}

document.addEventListener('click', async e => {
  const b = e.target.closest('[data-ag]');
  if (b) {
    const k = b.dataset.ag;
    if (k === 'hoy') AG_FECHA = hoyISO();
    if (k === 'ant') AG_FECHA = isoMas(AG_FECHA, AG_MODO === 'dia' ? -1 : AG_MODO === 'semana' ? -7 : -30);
    if (k === 'sig') AG_FECHA = isoMas(AG_FECHA, AG_MODO === 'dia' ? 1 : AG_MODO === 'semana' ? 7 : 30);
    if (k === 'dia' || k === 'semana' || k === 'mes') AG_MODO = k;
    if (k === 'nueva') { nuevaCita(null, AG_FECHA); return; }
    cargarAgenda();
    return;
  }
  const c = e.target.closest('[data-cita]');
  if (!c) return;
  const [acc, id, extra] = c.dataset.cita.split('|');
  if (acc === 'hora') return cambiarHoraCita(id, extra);
  if (acc === 'ficha') return abrirFicha(id);
  if (acc === 'visita') return abrirVisita(id);
  if (acc === 'desc') {
    const r = await escribir('estado_cita', { p_id: id, p_estado: 'Descartada' });
    if (r && r.error) { toast('No se ha podido descartar: ' + r.error.message, true); return; }
    toast('Cita descartada'); cargarAgenda(); cargarInicio(); return;
  }
  if (acc === 'borrar') {
    if (!await preguntar('La cita desaparece de la agenda.', { titulo: '¿Borrar la cita?', ok: 'Borrar', peligro: true })) return;
    const { data: r } = await db.rpc('borrar_cita', { p_id: id });
    if (r && r.ok === false) {
      toast(r.error === 'visitada' ? 'No se puede borrar una visita ya realizada'
        : r.error === 'pasada' ? 'Solo se pueden borrar citas futuras' : 'No se ha podido borrar', true);
      return;
    }
    toast('Cita borrada'); cargarAgenda(); cargarInicio(); return;
  }
  if (acc === 'hoy') {
    await escribir('estado_cita', { p_id: id, p_estado: 'Planificada', p_fecha: hoyISO() });
    toast('Movida a hoy'); cargarAgenda(); cargarInicio(); return;
  }
  if (acc === 'repro') {
    const f = await pedirFecha('¿A qué día la mueves?', isoMas(hoyISO(), 1), { titulo: 'Reprogramar cita', ok: 'Mover' });
    if (!f) return;
    await escribir('estado_cita', { p_id: id, p_estado: 'Reprogramada', p_fecha: f });
    toast('Cita movida al ' + fechaCorta(f)); cargarAgenda(); return;
  }
});

/* ---------------- rutas y plan del día ---------------- */

let RUTAS = [], PLAN = null;

document.addEventListener('click', e => {
  const b = e.target.closest('[data-ruta]');
  if (b) planificar(b.dataset.ruta, b);
});

/* distancia aproximada en km entre dos puntos */
function km(a, b) {
  if (!a || !b || a[0] == null || b[0] == null) return 0;   // sin punto de salida no hay desplazamiento que contar
  const R = 6371, r = Math.PI / 180;
  const dLat = (b[0] - a[0]) * r, dLon = (b[1] - a[1]) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
const minutosEntre = (a, b) => (!a || !b || a[0] == null || b[0] == null) ? 0 : Math.max(6, Math.round(km(a, b) / 40 * 60) + 5);
const hm = m => String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(Math.round(m) % 60).padStart(2, '0');

async function planificar(rutaId, btn) {
  const orig = btn.textContent; btn.disabled = true; btn.textContent = 'Calculando…';
  const { data, error } = await db.rpc('medicos_de_ruta', { p_id: rutaId });
  btn.disabled = false; btn.textContent = orig;
  if (error) { toast('No se ha podido planificar: ' + error.message, true); return; }
  const conXY = (data || []).filter(m => m.lat && m.lon);
  if (!conXY.length) { toast('Esta ruta no tiene médicos con ubicación', true); return; }
  construirPlan(conXY, rutaId, btn);
}

function pintarPlan() {
  if (!PLAN) { $('rplan').innerHTML = ''; return; }
  const total = PLAN.paradas.reduce((n, p) => n + p.medicos.length, 0);
  const ultima = PLAN.paradas[PLAN.paradas.length - 1];
  const enlace = enlaceNav(navActual() === 'google' && PLAN.salida.lat != null ? [PLAN.salida.lat, PLAN.salida.lon] : ultima.xy,
    navActual() === 'google' ? PLAN.paradas.map(p => p.xy) : null);

  $('rplan').innerHTML = `<div class="card">
    <h2>${PLAN.fecha && PLAN.fecha !== hoyISO() ? 'Plan para el ' + fechaLarga(new Date(PLAN.fecha + 'T00:00:00')) : 'Plan de hoy'}<span class="n">${total} ${total === 1 ? 'médico' : 'médicos'}</span></h2>
    <p class="sm">Salida de ${esc(PLAN.salida.nombre)} a las ${PLAN.inicio != null ? hm(PLAN.inicio) : PLANCFG().salida} · ${PLAN.paradas.length} ${PLAN.paradas.length === 1 ? 'parada' : 'paradas'} ·
      vuelta sobre las ${hm(PLAN.fin)} · <button class="kcfg" id="planhora">⚙ Cambiar horario</button></p>
    <div class="lista">${PLAN.paradas.map((p, i) => `<div class="item" style="cursor:default">
      <span class="ic">${i + 1}</span>
      <span class="tx"><b>${esc(p.centro)}</b>
        <span class="sm">${hm(p.llegada)}–${hm(p.fin)} · ${esc([p.dir, p.municipio].filter(Boolean).join(', '))} · ${p.medicos.length} ${p.medicos.length === 1 ? 'médico' : 'médicos'}</span>
        <span class="sm">${p.medicos.map(m => esc(m.nombre)).join(' · ')}</span></span>
      <span class="acts" style="margin:0"><a class="btn sec" href="${enlaceNav(p.xy)}" target="_blank" rel="noopener">Ir</a></span>
    </div>`).join('')}</div>
    <div id="planmapa" style="height:0;margin:0 16px;border-radius:12px;overflow:hidden"></div>
    <div class="acts" style="padding:12px 16px 16px">
      <button class="btn sec" id="planver">Ver la ruta en el mapa</button>
      <a class="btn" href="${enlace}" target="_blank" rel="noopener">Abrir en ${esc((NAVEGADORES.find(n => n[0] === navActual()) || [])[1] || 'el mapa')}</a>
      <button class="btn sec" id="planag">Guardar en mi agenda</button>
      ${!PLAN.fecha || PLAN.fecha === hoyISO() ? '<button class="btn" id="planempezar">▶ Empezar ruta</button>' : ''}
      <button class="btn sec" id="plancerrar">Cerrar</button>
    </div></div>`;

  $('plancerrar').onclick = () => { PLAN = null; pintarPlan(); };
  $('planver').onclick = e => { mapaDelPlan(); e.target.classList.add('hide'); };
  if ($('planhora')) $('planhora').onclick = abrirHorarioPlan;
  if ($('planempezar')) $('planempezar').onclick = () => empezarRuta();
  $('planag').onclick = async ev => {
    ev.target.disabled = true; ev.target.textContent = 'Guardando…';
    let n = 0;
    for (const p of PLAN.paradas) {
      for (const m of p.medicos) {
        await escribir('guardar_cita', { p: {
          medico_id: m.id, fecha: PLAN.fecha || hoyISO(), hora: hm(p.llegada), centro_nombre: p.centro,
          estado: 'Planificada', origen: 'Plan del día',
          op_id: 'c-' + m.id + '-' + (PLAN.fecha || hoyISO())
        }});
        n++;
      }
    }
    ev.target.disabled = false; ev.target.textContent = 'Guardar en mi agenda';
    toast(`${n} citas guardadas en tu agenda`);
    cargarInicio();
  };
}

/* ---------------- añadir cita desde la ficha ---------------- */

document.addEventListener('click', async e => {
  const b = e.target.closest('[data-agendar]');
  if (!b) return;
  const f = await pedirFecha('¿Qué día quieres visitarle?', hoyISO(), { titulo: 'Añadir a mi agenda', ok: 'Añadir' });
  if (!f) return;
  const r = await escribir('guardar_cita', { p: {
    medico_id: b.dataset.agendar, fecha: f, estado: 'Planificada', origen: 'Ficha',
    op_id: 'c-' + b.dataset.agendar + '-' + f
  }});
  if (r.error) { toast('No se ha podido: ' + r.error.message, true); return; }
  toast('Añadido a tu agenda el ' + fechaCorta(f));
  cargarInicio();
});



/* ============================================================
   DLC OS 2.0 · Entrega 5: configuración, gestor de rutas y usuarios
   ============================================================ */

let CFG_SEC = 'prefs', ADM_SEC = 'usuarios', USUARIOS = [], CATS = [];
const AREAS = [['H', 'Inicio'], ['G', 'Agenda'], ['R', 'Rutas'], ['M', 'Directorio (médicos)'], ['C', 'Centros'], ['S', 'Visitas'], ['V', 'Ventas y pacientes'], ['K', 'Configuración']];
const NIVELES = ['Sin acceso', 'Ver', 'Editar', 'Completo'];
const ROLES = ['Administrador', 'Dirección', 'Comercial', 'Televenta', 'Solo consulta', 'Medico'];
const puedeCatalogos = () => PERFIL && (PERFIL.rol === 'Administrador' || ((PERFIL.areas || {}).K || 0) >= 2);

/* ---------------- configuración ---------------- */

async function cargarConfig() {
  const secs = [['prefs', 'Mis preferencias']].concat(puedeCatalogos() ? [['cat', 'Clasificadores']] : []);
  if (CFG_SEC === 'rutas') CFG_SEC = 'prefs';
  $('v-config').innerHTML = `
    <div class="saludo"><div><h1>Configuración</h1><div class="fecha">Ajustes de tu cuenta y de la plataforma</div></div></div>
    <div class="subnav">${secs.map(([k, t]) => `<button data-cs="${k}" aria-pressed="${CFG_SEC === k}">${t}</button>`).join('')}</div>
    <div id="cfgcuerpo"></div>`;
  if (CFG_SEC === 'prefs') pintarPrefs();
  if (CFG_SEC === 'cat') pintarCatalogos();
}

document.addEventListener('click', e => {
  const b = e.target.closest('[data-cs]');
  if (b) { CFG_SEC = b.dataset.cs; cargarConfig(); }
  const a = e.target.closest('[data-as]');
  if (a) { ADM_SEC = a.dataset.as; cargarAdmin(); }
});

const punto = k => (PERFIL.preferencias || {})[k] || null;

function pintarPrefs() {
  const s = punto('salida') || { nombre: '', dir: '' };
  const l = punto('llegada');
  const caja = (k, x, titulo, sub) => `<div class="card" style="padding:16px">
    <h2 style="padding:0">${titulo}</h2><p class="sm" style="padding:0">${sub}</p>
    <div class="g2" style="margin-top:10px">
      <div><label>Nombre</label><input data-pn="${k}" value="${esc(x ? x.nombre || '' : '')}" placeholder="Casa, Oficina…"></div>
      <div><label>Dirección</label><input data-pd="${k}" value="${esc(x ? x.dir || '' : '')}" placeholder="Calle, número y población"></div>
    </div>
    <div class="sm" style="margin-top:8px" data-pe="${k}">${x && x.lat
      ? `<b style="color:var(--ok)">✓ Ubicado</b> ${esc(x.dir || '')}`
      : '<span style="color:var(--warn)">Sin ubicar: pulsa Buscar dirección</span>'}</div>
    <div class="acts"><button class="btn sec" data-pg="${k}">Buscar dirección</button>
      <button class="btn sec" data-pgps="${k}">Usar mi ubicación</button></div></div>`;

  $('cfgcuerpo').innerHTML = `
    <p class="sm">El punto de salida y el de llegada se usan para calcular el plan del día y los recorridos.</p>
    <div class="cols" style="grid-template-columns:1fr 1fr">
      ${caja('salida', s, 'Punto de salida', 'Dónde empiezas el día')}
      ${caja('llegada', l, 'Punto de llegada', 'Déjalo vacío para volver al punto de salida')}
    </div>
    <div class="card" style="padding:16px;margin-top:14px"><h2 style="padding:0">Navegación</h2>
      <p class="sm" style="padding:0">Con qué app se abren las rutas y los "cómo llegar".</p>
      <div style="max-width:260px;margin-top:8px">${selectorNav()}</div></div>
    ${bloquePlantillas()}
    <div class="acts" style="justify-content:flex-end"><button class="btn" id="pfguardar">Guardar preferencias</button></div>`;
  if ($('navsel')) $('navsel').onchange = e => cambiarNavegador(e.target.value);
  if ($('tplok')) $('tplok').onclick = guardarPlantillas;
  if ($('tplreset')) $('tplreset').onclick = () => {
    $('tplwa').value = TPL_DEF.wa; $('tplas').value = TPL_DEF.asunto; $('tplem').value = TPL_DEF.email;
    toast('Plantillas por defecto puestas: pulsa Guardar');
  };

  $('cfgcuerpo').querySelectorAll('[data-pg]').forEach(b => b.onclick = async () => {
    const k = b.dataset.pg, dir = $('cfgcuerpo').querySelector(`[data-pd="${k}"]`).value.trim();
    if (!dir) { toast('Escribe la dirección', true); return; }
    b.disabled = true; b.textContent = 'Buscando…';
    try {
      const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=es&q=' + encodeURIComponent(dir));
      const j = await r.json();
      b.disabled = false; b.textContent = 'Buscar dirección';
      if (!j.length) { toast('No se ha encontrado esa dirección', true); return; }
      b.dataset.lat = j[0].lat; b.dataset.lon = j[0].lon;
      $('cfgcuerpo').querySelector(`[data-pe="${k}"]`).innerHTML =
        `<b style="color:var(--ok)">✓ Ubicado</b> ${esc(j[0].display_name.split(',').slice(0, 3).join(','))}`;
      toast('Dirección encontrada');
    } catch (err) {
      b.disabled = false; b.textContent = 'Buscar dirección';
      toast('No se ha podido buscar la dirección', true);
    }
  });

  $('cfgcuerpo').querySelectorAll('[data-pgps]').forEach(b => b.onclick = () => {
    const k = b.dataset.pgps;
    if (!navigator.geolocation) { toast('Este dispositivo no tiene ubicación', true); return; }
    b.disabled = true; b.textContent = 'Localizando…';
    navigator.geolocation.getCurrentPosition(p => {
      b.disabled = false; b.textContent = 'Usar mi ubicación';
      const g = $('cfgcuerpo').querySelector(`[data-pg="${k}"]`);
      g.dataset.lat = p.coords.latitude.toFixed(6); g.dataset.lon = p.coords.longitude.toFixed(6);
      $('cfgcuerpo').querySelector(`[data-pd="${k}"]`).value = 'Mi ubicación';
      $('cfgcuerpo').querySelector(`[data-pe="${k}"]`).innerHTML = '<b style="color:var(--ok)">✓ Ubicado</b> desde el GPS';
      toast('Ubicación tomada');
    }, () => { b.disabled = false; b.textContent = 'Usar mi ubicación'; toast('No se ha podido obtener la ubicación', true); },
      { enableHighAccuracy: true, timeout: 15000 });
  });

  $('pfguardar').onclick = async ev => {
    const leer = k => {
      const n = $('cfgcuerpo').querySelector(`[data-pn="${k}"]`).value.trim();
      const d = $('cfgcuerpo').querySelector(`[data-pd="${k}"]`).value.trim();
      const g = $('cfgcuerpo').querySelector(`[data-pg="${k}"]`);
      const ant = punto(k) || (k === 'salida' ? s : null);
      const lat = g.dataset.lat ? +g.dataset.lat : (ant && ant.dir === d ? ant.lat : null);
      const lon = g.dataset.lon ? +g.dataset.lon : (ant && ant.dir === d ? ant.lon : null);
      return d ? { nombre: n || d, dir: d, lat, lon } : null;
    };
    const salida = leer('salida'), llegada = leer('llegada');
    if (!salida || !salida.lat) { toast('Ubica el punto de salida antes de guardar', true); return; }
    if (llegada && !llegada.lat) { toast('Ubica el punto de llegada o déjalo vacío', true); return; }
    ev.target.disabled = true; ev.target.textContent = 'Guardando…';
    const prefs = Object.assign({}, PERFIL.preferencias || {}, { salida, llegada });
    const { data, error } = await db.rpc('guardar_preferencias', { p: prefs });
    ev.target.disabled = false; ev.target.textContent = 'Guardar preferencias';
    if (error) { toast('No se ha podido guardar: ' + error.message, true); return; }
    PERFIL.preferencias = data || prefs;
    toast(`Guardado · sales de ${salida.nombre} y terminas en ${(llegada || salida).nombre}`);
    pintarPrefs();
  };
}

/* ---------------- gestor de rutas ---------------- */

/* ---------------- clasificadores ---------------- */

async function pintarCatalogos() {
  $('cfgcuerpo').innerHTML = '<div class="card"><div class="skel"></div><div class="skel" style="width:50%"></div></div>';
  const { data } = await db.rpc('catalogos_todos');
  CATS = data || [];
  const completo = PERFIL.rol === 'Administrador' || ((PERFIL.areas || {}).K || 0) >= 3;

  $('cfgcuerpo').innerHTML = `
    <p class="sm">Listas que usan todos los usuarios en fichas, visitas y filtros.</p>
    ${completo ? '<div class="acts"><button class="btn" id="cnuevo">+ Nuevo clasificador</button></div>' : ''}
    <div class="cols" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr))">
      ${CATS.map(c => `<div class="card" style="padding:16px">
        <h2 style="padding:0">${esc(c.nombre)}</h2>
        <p class="sm" style="padding:0">${c.valores.filter(v => v.activo).length} valores activos</p>
        <div class="lista" style="padding:8px 0 0">${c.valores.map(v => `<div class="item" style="cursor:default;padding:6px 8px">
          <span class="tx"><b style="${v.activo ? '' : 'opacity:.5;text-decoration:line-through'}">${esc(v.valor)}</b>
            ${v.extra ? `<span class="sm">${v.extra === 'neg' ? 'sin visita' : 'visita realizada'}</span>` : ''}</span>
          <span class="acts" style="margin:0">
            <button class="btn sec" data-vtog="${v.id}|${v.activo ? 0 : 1}">${v.activo ? 'Desactivar' : 'Activar'}</button>
            ${completo ? `<button class="btn sec" data-vdel="${v.id}">Eliminar</button>` : ''}</span></div>`).join('')}</div>
        <div class="acts"><input data-vnew="${c.id}" placeholder="Nuevo valor" style="flex:1;min-width:140px">
          <button class="btn sec" data-vadd="${c.id}">Añadir</button></div>
      </div>`).join('')}
    </div>`;

  $('cfgcuerpo').querySelectorAll('[data-vadd]').forEach(b => b.onclick = async () => {
    const inp = $('cfgcuerpo').querySelector(`[data-vnew="${b.dataset.vadd}"]`);
    if (!inp.value.trim()) return;
    const { error } = await db.rpc('guardar_valor', { p: { clasificador_id: b.dataset.vadd, valor: inp.value.trim() } });
    if (error) { toast('No se ha podido: ' + error.message, true); return; }
    toast('Valor añadido'); cargarCatalogos(); pintarCatalogos();
  });
  $('cfgcuerpo').querySelectorAll('[data-vtog]').forEach(b => b.onclick = async () => {
    const [id, activo] = b.dataset.vtog.split('|');
    await db.rpc('guardar_valor', { p: { id, activo: activo === '1' } });
    cargarCatalogos();
  pintarRutaBarra();
  db.rpc('registrar_acceso', { p_evento: 'Entrada', p_agente: navigator.userAgent }).catch(() => {}); pintarCatalogos();
  });
  $('cfgcuerpo').querySelectorAll('[data-vdel]').forEach(b => b.onclick = async () => {
    if (!await preguntar('Las fichas y visitas que ya lo usan lo conservan, pero dejará de aparecer en los desplegables.', { titulo: '¿Eliminar este valor?', ok: 'Eliminar', peligro: true })) return;
    const { data: r } = await db.rpc('borrar_valor', { p_id: b.dataset.vdel });
    if (r && r.ok === false) { toast('No tienes permiso', true); return; }
    toast('Valor eliminado'); cargarCatalogos(); pintarCatalogos();
  });
  const cn = $('cnuevo');
  if (cn) cn.onclick = async () => {
    const nombre = await pedirTexto('Nombre del clasificador', '', { titulo: 'Nuevo clasificador', placeholder: 'p. ej. Tipo de centro', ok: 'Siguiente' });
    if (!nombre) return;
    const valores = await pedirTexto('Valores separados por comas', '', { titulo: nombre, placeholder: 'Hospital, Clínica, Consulta privada', ok: 'Crear' });
    const { data: r } = await db.rpc('crear_clasificador', {
      p_nombre: nombre.trim(), p_valores: (valores || '').split(',').map(x => x.trim()).filter(Boolean)
    });
    if (r && r.ok === false) { toast('No tienes permiso', true); return; }
    toast('Clasificador creado'); pintarCatalogos();
  };
}

/* ---------------- administración de usuarios ---------------- */

async function cargarAdmin() {
  $('v-admin').innerHTML = `
    <div class="saludo"><div><h1>Administración</h1><div class="fecha">Usuarios, permisos, cartera y comisiones</div></div>
      <div class="acts" style="margin:0">${ADM_SEC === 'usuarios' ? '<button class="btn" id="unuevo">+ Nuevo usuario</button>' : ''}</div></div>
    <div class="subnav">
      <button data-as="usuarios" aria-pressed="${ADM_SEC === 'usuarios'}">Usuarios</button>
      <button data-as="comisiones" aria-pressed="${ADM_SEC === 'comisiones'}">Comisiones</button>
      <button data-as="accesos" aria-pressed="${ADM_SEC === 'accesos'}">Accesos</button>
      <button data-as="auditoria" aria-pressed="${ADM_SEC === 'auditoria'}">Auditoría</button></div>
    <div class="card" id="admcuerpo"><div class="skel"></div><div class="skel" style="width:60%"></div></div>`;
  if (ADM_SEC === 'comisiones') { pintarComisiones(); return; }
  if (ADM_SEC === 'accesos') { pintarAccesos(); return; }
  if (ADM_SEC === 'auditoria') { pintarAuditoria(); return; }
  if ($('unuevo')) $('unuevo').onclick = nuevoUsuario;

  const { data, error } = await db.rpc('usuarios_lista');
  if (error) { ($('admcuerpo') || document.createElement('div')).innerHTML = `<div class="vacio">No se ha podido cargar: ${esc(error.message)}</div>`; return; }
  USUARIOS = data || [];
  ($('admcuerpo') || document.createElement('div')).innerHTML = `<h2>Usuarios<span class="n">${USUARIOS.length}</span></h2>
    <div class="lista">${USUARIOS.map(u => `<div class="item" style="cursor:default">
      <span class="ic">${esc(iniciales(u.nombre))}</span>
      <span class="tx"><b>${esc(u.nombre)}${u.activo ? '' : ' <span class="sm">· desactivado</span>'}</b>
        <span class="sm">${esc(u.rol)} · ${esc(u.email || '')} · ${num(u.medicos)} médicos · ${num(u.visitas)} visitas</span></span>
      <span class="acts" style="margin:0">
        <button class="btn sec" data-uedit="${u.id}">Editar</button>
        <button class="btn sec" data-uver="${u.id}">Ver cartera</button>
        <button class="btn sec" data-ucart="${u.id}">Asignar</button>
        <button class="btn sec" data-upass="${u.id}">Contraseña</button>
        ${puedeSuplantar() && u.id !== PERFIL.id && u.rol !== 'Administrador' && u.activo ? `<button class="btn sec" data-ucomo="${u.id}" title="Ver la plataforma exactamente como esta persona">👤 Entrar como</button>` : ''}</span></div>`).join('')}</div>`;

  ($('admcuerpo') || document.createElement('div')).querySelectorAll('[data-uedit]').forEach(b => b.onclick = () => editarUsuario(b.dataset.uedit));
  ($('admcuerpo') || document.createElement('div')).querySelectorAll('[data-ucart]').forEach(b => b.onclick = () => asignarCartera(b.dataset.ucart));
  ($('admcuerpo') || document.createElement('div')).querySelectorAll('[data-uver]').forEach(b => b.onclick = () => verCartera(b.dataset.uver));
  ($('admcuerpo') || document.createElement('div')).querySelectorAll('[data-upass]').forEach(b => b.onclick = () =>
    restablecerPassword(USUARIOS.find(x => x.id === b.dataset.upass) || {}));
}

function editarUsuario(id) {
  const u = USUARIOS.find(x => x.id === id); if (!u) return;
  const areas = u.areas || {};
  $('dbody').innerHTML = `
    <div class="fh"><div><h2>${esc(u.nombre)}</h2><div class="sm">${esc(u.email || '')}</div></div>
      <button class="x" data-cerrar aria-label="Cerrar">✕</button></div>
    <div class="g2">
      <div><label for="un">Nombre</label><input id="un" value="${esc(u.nombre)}"></div>
      <div><label for="uu">Usuario</label><input id="uu" value="${esc(u.usuario)}"></div>
    </div>
    <div class="g2">
      <div><label for="ur">Rol</label><select id="ur">${ROLES.map(r => `<option ${r === u.rol ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
      <div><label for="ua">Estado</label><select id="ua">
        <option value="1" ${u.activo ? 'selected' : ''}>Activo</option>
        <option value="0" ${u.activo ? '' : 'selected'}>Desactivado</option></select></div>
    </div>
    <label>Permisos por área</label>
    ${AREAS.map(([k, t]) => `<div class="dprow" style="grid-template-columns:130px 1fr"><b>${t}</b>
      <select data-area="${k}">${NIVELES.map((n, i) => `<option value="${i}" ${(+areas[k] || 0) === i ? 'selected' : ''}>${n}</option>`).join('')}</select></div>`).join('')}
    <div id="ucomzona"></div>
    <div class="acts" style="justify-content:flex-end">
      <button class="btn sec" data-cerrar>Cancelar</button>
      <button class="btn" id="uguardar">Guardar</button>
    </div>`;

  $('ur').onchange = () => {
    const presetBase = {
      'Administrador': { H: 3, G: 3, R: 3, M: 3, C: 3, S: 3, V: 3, L: 3, P: 3, F: 3, A: 3, E: 1, Q: 3, K: 3, U: 3 },
      'Comercial': { H: 2, G: 2, R: 2, M: 2, C: 2, S: 2, V: 0, L: 0, P: 0, F: 0, A: 0, E: 0, Q: 0, K: 0, U: 0 },
      'Televenta': { H: 2, G: 1, R: 1, M: 2, C: 2, S: 1, V: 3, L: 3, P: 1, F: 2, A: 1, E: 1, Q: 1, K: 0, U: 0 },
      'Dirección': { H: 2, G: 2, R: 1, M: 1, C: 1, S: 1, V: 1, L: 1, P: 1, F: 1, A: 1, E: 1, Q: 1, K: 1, U: 0 },
      'Solo consulta': { H: 1, G: 1, R: 1, M: 1, C: 1, S: 1, V: 1, L: 1, P: 1, F: 0, A: 1, E: 0, Q: 1, K: 0, U: 0 },
      'Medico': { H: 1, G: 0, R: 0, M: 0, C: 0, S: 0, V: 0, L: 0, P: 0, F: 0, A: 0, E: 0, Q: 0, K: 0, U: 0 }
    };
    const preset = Object.assign({}, presetBase[$('ur').value] || {}, (AJUSTES.roles || {})[$('ur').value] || {});
    AREAS.forEach(([k]) => { const s = $('dbody').querySelector(`[data-area="${k}"]`); if (s) s.value = String(preset[k] || 0); });
  };

  panelComisionUsuario(u).then(html => { const z = $('ucomzona'); if (z) z.innerHTML = html; });

  $('uguardar').onclick = async ev => {
    const areasN = {};
    AREAS.forEach(([k]) => areasN[k] = +$('dbody').querySelector(`[data-area="${k}"]`).value);
    ev.target.disabled = true; ev.target.textContent = 'Guardando…';
    const { data: r, error } = await db.rpc('guardar_perfil', { p: {
      id, nombre: $('un').value.trim(), usuario: $('uu').value.trim(),
      rol: $('ur').value, activo: $('ua').value === '1', areas: areasN
    }});
    ev.target.disabled = false; ev.target.textContent = 'Guardar';
    if (error || (r && r.ok === false)) { toast('No se ha podido guardar', true); return; }
    if ($('ucom')) {
      // Solo se toca el esquema si cambia o si se elige otra fecha de efecto
      const modo = $('ucdm') ? $('ucdm').value : 'hoy';
      if ($('ucom').value !== ($('ucom').dataset.orig || '') || modo !== 'hoy') {
        const desde = modo === 'todo' ? '2000-01-01' : modo === 'fecha' ? ($('ucdf').value || hoyISO()) : hoyISO();
        await db.rpc('asignar_esquema', { p_usuario: id, p_esquema: $('ucom').value || null, p_quitar: !$('ucom').value, p_desde: desde });
      }
      await db.from('perfiles').update({ comision_ver: $('uverc').value }).eq('id', id);
    }
    $('dlg').close(); toast('Usuario guardado'); cargarAdmin();
  };
  $('dlg').showModal();
}

function nuevoUsuario() {
  $('dbody').innerHTML = `
    <div class="fh"><div><h2>Nuevo usuario</h2><div class="sm">Se crea con una contraseña temporal que deberá cambiar</div></div>
      <button class="x" data-cerrar aria-label="Cerrar">✕</button></div>
    <div class="g2">
      <div><label for="nn">Nombre</label><input id="nn" placeholder="Nombre y apellidos"></div>
      <div><label for="ne">Correo</label><input id="ne" type="email" placeholder="nombre@empresa.com"></div>
    </div>
    <div class="g2">
      <div><label for="nr">Rol</label><select id="nr">${ROLES.map(r => `<option ${r === 'Comercial' ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
      <div><label for="np">Contraseña temporal</label><input id="np" value="Tmp-${Math.random().toString(36).slice(2, 8)}"></div>
    </div>
    <div class="acts" style="justify-content:flex-end">
      <button class="btn sec" data-cerrar>Cancelar</button>
      <button class="btn" id="ncrear">Crear usuario</button></div>
    <div id="nmsg" class="sm" style="margin-top:10px"></div>`;

  $('ncrear').onclick = async ev => {
    const email = $('ne').value.trim(), pass = $('np').value, nombre = $('nn').value.trim();
    if (!email || !nombre || pass.length < 6) { toast('Completa nombre, correo y contraseña', true); return; }
    ev.target.disabled = true; ev.target.textContent = 'Creando…';
    // Cliente aparte para no tocar tu sesión actual
    const tmp = window.supabase.createClient(CFG.url, CFG.anon, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await tmp.auth.signUp({
      email, password: pass,
      options: { data: { nombre, usuario: email.split('@')[0] } }
    });
    ev.target.disabled = false; ev.target.textContent = 'Crear usuario';
    if (error) { $('nmsg').innerHTML = `<span style="color:var(--dang)">No se ha podido crear: ${esc(error.message)}</span>`; return; }
    if (data && data.user) {
      await db.rpc('guardar_perfil', { p: { id: data.user.id, nombre, usuario: email.split('@')[0], rol: $('nr').value } });
    }
    $('nmsg').innerHTML = `<b style="color:var(--ok)">Usuario creado.</b> Contraseña temporal: <b>${esc(pass)}</b>.
      Pásasela y que la cambie al entrar. Si Supabase tiene activada la confirmación por correo, deberá confirmarlo primero.`;
    cargarAdmin();
  };
  $('dlg').showModal();
}

async function asignarCartera(id) {
  const u = USUARIOS.find(x => x.id === id); if (!u) return;
  const { data: op } = await db.rpc('opciones_filtros', {});
  const sel = lista => '<option value=""></option>' + (lista || []).map(o => `<option>${esc(o.v)}</option>`).join('');
  $('dbody').innerHTML = `
    <div class="fh"><div><h2>Cartera de ${esc(u.nombre)}</h2>
      <div class="sm">Ahora tiene ${num(u.medicos)} médicos asignados</div></div>
      <button class="x" data-cerrar aria-label="Cerrar">✕</button></div>
    <p class="sm">Elige los filtros y asigna en bloque. Un médico puede tener varios comerciales.</p>
    <div class="g2">
      <div><label for="aprov">Provincia</label><select id="aprov">${sel(op.provincias)}</select></div>
      <div><label for="amuni">Municipio</label><select id="amuni">${sel(op.municipios)}</select></div>
    </div>
    <div class="g2">
      <div><label for="aesp">Especialidad</label><select id="aesp">${sel(op.especialidades)}</select></div>
      <div><label for="aest">Estado</label><select id="aest">${sel(op.estados)}</select></div>
    </div>
    <label class="opt" style="margin-top:10px"><input type="checkbox" id="aurg"> Solo urgentes</label>
    <div id="amsg" class="sm" style="margin-top:10px"></div>
    <div class="acts" style="justify-content:flex-end">
      <button class="btn sec" id="acont">Ver cuántos</button>
      <button class="btn sec" id="aquitar">Quitar</button>
      <button class="btn" id="aasignar">Asignar</button></div>`;

  const filtros = () => ({
    f_provincia: $('aprov').value || null, f_municipio: $('amuni').value || null,
    f_especialidad: $('aesp').value || null, f_estado: $('aest').value || null,
    f_urgentes: $('aurg').checked
  });
  const ids = async () => (await db.rpc('ids_filtrados', filtros())).data || [];

  $('acont').onclick = async () => { const l = await ids(); $('amsg').innerHTML = `<b>${num(l.length)}</b> médicos con estos filtros.`; };
  const aplicar = async (quitar, ev) => {
    const l = await ids();
    if (!l.length) { toast('Ningún médico con esos filtros', true); return; }
    if (!await preguntar(`Se van a ${quitar ? 'quitar' : 'asignar'} ${num(l.length)} médicos ${quitar ? 'de' : 'a'} ${u.nombre}.`, { titulo: quitar ? 'Quitar cartera' : 'Asignar cartera', ok: quitar ? 'Quitar' : 'Asignar', peligro: quitar })) return;
    ev.target.disabled = true;
    const { data: r, error } = await db.rpc('asignar_cartera', { p: { usuario_id: id, medicos: l, quitar } });
    ev.target.disabled = false;
    if (error || (r && r.ok === false)) { toast('No se ha podido: ' + ((error && error.message) || 'sin permiso'), true); return; }
    toast(`${num(r.filas)} médicos ${quitar ? 'retirados' : 'asignados'}`);
    $('dlg').close(); cargarAdmin();
  };
  $('aasignar').onclick = ev => aplicar(false, ev);
  $('aquitar').onclick = ev => aplicar(true, ev);
  $('dlg').showModal();
}



/* ============================================================
   DLC OS 2.0 · Entrega 6: seguimiento, duplicados, exportar y contraseñas
   ============================================================ */

let SEG = { estado: '', prov: '', muni: '', modo: 'todos', pagina: 0 };
let DUPS = null, PARES = null;

/* ---------------- seguimiento ---------------- */

async function cargarSeguimiento() {
  $('v-seguimiento').innerHTML = `
    <div class="saludo"><div><h1>Seguimiento</h1><div class="fecha">Cómo avanza cada médico</div></div>
      <div class="acts" style="margin:0">
</div></div>
    <div class="kpis" id="segkpis"><div class="skel"></div></div>
    <div class="panel">
      <div class="filtros">
        <div><label for="sest">Estado comercial</label><select id="sest"></select></div>
        <div><label for="sprov">Provincia</label><select id="sprov"></select></div>
        <div><label for="smuni">Municipio</label><select id="smuni"></select></div>
        <div><label for="smodo">Mostrar</label><select id="smodo">
          <option value="todos">Todos</option>
          <option value="visitados">Solo visitados</option>
          <option value="sin_visitar">Sin visitar</option>
          <option value="con_accion">Con próxima acción</option>
          <option value="atrasados">Acciones atrasadas</option>
        </select></div>
      </div>
      <div class="cuenta" id="scuenta">Cargando…</div>
      <div id="slista"><div class="cargador"><span class="spin"></span><span class="sm">Cargando el seguimiento…</span></div></div>
      <div id="spag"></div>
    </div>`;

  const { data: op } = await db.rpc('opciones_filtros', {});
  const pon = (id, lista, todo) => $(id).innerHTML = `<option value="">${todo}</option>` +
    (lista || []).map(o => `<option>${esc(o.v)}</option>`).join('');
  pon('sest', op.estados, 'Todos los estados');
  pon('sprov', op.provincias, 'Todas las provincias');
  pon('smuni', op.municipios, 'Todos los municipios');
  ['sest', 'sprov', 'smuni', 'smodo'].forEach(id => $(id).onchange = () => {
    SEG = { estado: $('sest').value, prov: $('sprov').value, muni: $('smuni').value, modo: $('smodo').value, pagina: 0 };
    listaSeguimiento(true);
  });
  window.__dlSeg = async fmt => {
    const { data } = await db.rpc('exportar_seguimiento', {
      f_estado: SEG.estado || null, f_provincia: SEG.prov || null, f_municipio: SEG.muni || null, f_modo: SEG.modo });
    descargar(data || [], 'Exportacion_seguimiento', fmt);
  };
  if ($('segdup')) $('segdup').onclick = () => ir('duplicados');


  const { data: r } = await db.rpc('resumen_seguimiento');
  if (r) {
    const pct = (a, b) => b ? Math.round(a / b * 100) + '%' : '0%';
    const emb = (r.embudo || []).map(e => `<div class="kpi"><b>${num(e.n)}</b><span>${esc(e.estado)}</span></div>`).join('');
    $('segkpis').innerHTML = emb +
      `<div class="kpi ok"><b>${num(r.visitados)}</b><span>médicos visitados</span></div>
       <div class="kpi"><b>${num(r.visitas_total)}</b><span>visitas registradas</span></div>
       <div class="kpi"><b>${num(r.muestras_total)}</b><span>muestras entregadas</span></div>
       <div class="kpi"><b>${pct(r.con_direccion, r.total)}</b><span>fichas con dirección</span></div>
       <div class="kpi"><b>${pct(r.con_dias, r.total)}</b><span>con días de consulta</span></div>`;
  }
  listaSeguimiento(true);
}

async function listaSeguimiento(reinicia) {
  if (reinicia) SEG.pagina = 0;
  cargando($('slista'), 'Cargando el seguimiento…');
  $('scuenta').textContent = 'Buscando…';
  const { data, error } = await db.rpc('seguimiento_lista', {
    f_estado: SEG.estado || null, f_provincia: SEG.prov || null, f_municipio: SEG.muni || null,
    f_modo: SEG.modo, lim: tamPagina(), desplaz: SEG.pagina * tamPagina()
  });
  if (error) { $('scuenta').textContent = 'No se ha podido cargar: ' + error.message; return; }
  $('scuenta').innerHTML = `<b>${num(data.total)}</b> médicos`;
  const filas = data.filas || [];
  if (!filas.length) { $('slista').innerHTML = '<div class="vacio">Nada que mostrar con estos filtros.</div>'; }
  else {
    $('slista').innerHTML = '';
    $('slista').insertAdjacentHTML('beforeend', filas.map(m => `
    <button class="fila" data-id="${m.id}">
      <span><span class="nm">${m.urgente ? '<span class="pill p-urg">Urgente</span> ' : ''}${esc(m.nombre)}</span>
        <span class="sm">${esc(m.especialidad || '')} · ${esc(m.centro_nombre || '')} ${esc(m.municipio || '')}</span></span>
      <span class="c2"><span class="sm">${m.ultima_visita ? 'Última: <b>' + fechaCorta(m.ultima_visita) + '</b> · ' + esc(m.ultimo_resultado || '') : 'Sin visitar'}</span>
        <span class="sm">${m.n_visitas} visitas${m.muestras ? ' · ' + m.muestras + ' muestras' : ''}</span></span>
      <span class="c3"><span class="sm">${m.proxima_fecha
        ? `<b style="color:${m.proxima_fecha < hoyISO() ? 'var(--warn)' : 'var(--navy)'}">${fechaCorta(m.proxima_fecha)}</b><br>${esc(m.proxima_accion || '')}
           <br><span class="acts" style="margin:4px 0 0"><button class="btn sec" data-acc="hecha|${m.id}" style="min-height:26px;padding:3px 8px;font-size:12px">Hecha</button>
           <button class="btn sec" data-acc="aplazar|${m.id}" style="min-height:26px;padding:3px 8px;font-size:12px">Aplazar</button></span>`
        : ''}</span></span>
      <span class="pill p-est">${esc(m.estado_comercial)}</span>
    </button>`).join(''));
  }
  paginador($('spag'), data.total, SEG.pagina, p => { SEG.pagina = p; listaSeguimiento(false); $('slista').scrollIntoView({ block: 'start', behavior: 'smooth' }); },
    () => listaSeguimiento(true));
  $('slista').onclick = async e => {
    const acc = e.target.closest('[data-acc]');
    if (acc) {
      e.stopPropagation();
      const [modo, mid] = acc.dataset.acc.split('|');
      let f = null;
      if (modo === 'aplazar') { f = await pedirFecha('¿Para cuándo la aplazas?', isoMas(hoyISO(), 7), { titulo: 'Aplazar acción', ok: 'Aplazar' }); if (!f) return; }
      const { data: r } = await db.rpc('resolver_accion', { p_medico: mid, p_modo: modo, p_fecha: f });
      if (r && r.ok === false) { toast('No se ha podido', true); return; }
      toast(modo === 'hecha' ? 'Acción marcada como hecha' : 'Acción aplazada');
      listaSeguimiento(true); cargarInicio();
      return;
    }
    const b = e.target.closest('[data-id]'); if (b) abrirFicha(b.dataset.id);
  };
}

/* ---------------- exportar ---------------- */

function aCSV(filas) {
  if (!filas.length) return '';
  const cols = Object.keys(filas[0]);
  const val = v => v == null ? '' : /[";\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
  return '\uFEFF' + [cols.join(';')].concat(filas.map(f => cols.map(c => val(f[c])).join(';'))).join('\n');
}

async function descargarCSV(btn) {
  btn.disabled = true; btn.textContent = 'Preparando…';
  const { data, error } = await db.rpc('exportar_medicos', {
    q: F.q || null, f_provincia: SEG.prov || F.prov || null, f_municipio: SEG.muni || F.muni || null,
    f_estado: SEG.estado || F.est || null, f_especialidad: F.esp || null, f_urgentes: !!F.urg
  });
  btn.disabled = false; btn.textContent = 'Descargar CSV';
  if (error) { toast('No se ha podido exportar: ' + error.message, true); return; }
  const csv = aCSV(data || []);
  if (!csv) { toast('No hay nada que exportar', true); return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = 'Medicos_' + hoyISO() + '.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  {const n=(data||[]).length;toast(`${num(n)} ${n === 1 ? 'médico exportado' : 'médicos exportados'}`);}
}

/* ---------------- duplicados ---------------- */

async function abrirDuplicados() {
  $('dbody').innerHTML = `<div class="fh"><div><h2>Duplicados</h2>
      <div class="sm">Fichas marcadas y búsqueda de parecidos en toda la base</div></div>
      <button class="x" data-cerrar aria-label="Cerrar">✕</button></div>
    <div class="acts"><button class="btn sec" id="dscan">Buscar parecidos (≥80%)</button>
      <button class="btn sec" id="dpend">Revisar pendientes</button></div>
    <div id="dcuerpo"><div class="skel"></div><div class="skel" style="width:60%"></div></div>`;
  $('dlg').showModal();

  $('dscan').onclick = async ev => {
    ev.target.disabled = true; ev.target.textContent = 'Buscando…';
    const { data } = await db.rpc('escanear_duplicados', { p_umbral: 80, p_tope: 100 });
    ev.target.disabled = false; ev.target.textContent = 'Buscar parecidos (≥80%)';
    PARES = data || [];
    pintarDuplicados();
  };

  $('dpend').onclick = () => revisarPendientes();
  const { data } = await db.rpc('duplicados_pendientes');
  DUPS = data || [];
  pintarDuplicados();
}

function pintarDuplicados() {
  const pend = (DUPS || []).map(d => `<div class="item" style="cursor:default">
      <span class="ic w">!</span>
      <span class="tx"><b>${esc(d.nombre)}</b><span class="sm">Código ${esc(d.codigo)} · ${esc(d.centro || '')} ${esc(d.municipio || '')}${d.duplicado_de ? ' · parecido a ' + esc(d.duplicado_de) : ''}</span></span>
      <span class="acts" style="margin:0"><button class="btn sec" data-dficha="${d.id}">Ver ficha</button></span></div>`).join('');

  const pares = (PARES || []).map(p => `<div class="item" style="cursor:default">
      <span class="ic">${p.pct}%</span>
      <span class="tx"><b>${esc(p.a_nombre)}</b><span class="sm">códigos ${esc(p.a_codigo)} y ${esc(p.b_codigo)} · ${esc(p.b_nombre)}</span></span>
      <span class="acts" style="margin:0"><button class="btn" data-unif="${p.a_id}|${p.b_id}">Comparar</button></span></div>`).join('');

  $('dcuerpo').innerHTML =
    `<h2 style="padding:8px 0 0">Pendientes de unificar<span class="n">${(DUPS || []).length}</span></h2>
     ${pend ? `<div class="lista">${pend}</div>` : '<div class="vacio">Ninguna ficha marcada.</div>'}
     ${PARES ? `<h2 style="padding:12px 0 0">Parecidos encontrados<span class="n">${PARES.length}</span></h2>
       ${pares ? `<div class="lista">${pares}</div>` : '<div class="vacio">Sin parejas por encima del 80%.</div>'}` : ''}`;

  $('dcuerpo').querySelectorAll('[data-dficha]').forEach(b => b.onclick = () => { $('dlg').close(); abrirFicha(b.dataset.dficha); });
  $('dcuerpo').querySelectorAll('[data-unif]').forEach(b => b.onclick = () => {
    const [a, c] = b.dataset.unif.split('|'); compararFichas(a, c);
  });
}

const CAMPOS_UNI = [['nombre', 'Nombre'], ['especialidad', 'Especialidad'], ['area', 'Área'],
  ['telefono', 'Teléfono'], ['email', 'Email'], ['contacto', 'Contacto'], ['nota', 'Nota'],
  ['estado_comercial', 'Estado comercial'], ['cuando_visitar', 'Cuándo visitar']];

async function compararFichas(idA, idB) {
  const [{ data: A }, { data: B }] = await Promise.all([
    db.rpc('ficha_medico', { p_id: idA }), db.rpc('ficha_medico', { p_id: idB })
  ]);
  const a = A.medico, b = B.medico;
  if (a.id === b.id) { toast('Es la misma ficha', true); return; }
  let queda = b.id;
  const eleccion = {};
  CAMPOS_UNI.forEach(([k]) => eleccion[k] = b[k] ? 'queda' : (a[k] ? 'va' : 'queda'));

  const pinta = () => {
    const va = queda === a.id ? b : a, qu = queda === a.id ? a : b;
    const dif = CAMPOS_UNI.filter(([k]) => (a[k] || '') !== (b[k] || ''));
    $('dbody').innerHTML = `
      <div class="fh"><div><h2>Unificar fichas</h2>
        <div class="sm">Elige cuál se conserva y con qué datos. Consultas, visitas, citas y cartera se juntan en la que quede.</div></div>
        <button class="x" data-cerrar aria-label="Cerrar">✕</button></div>
      <div class="opciones">
        ${[a, b].map(m => `<button class="opt" data-queda="${m.id}" aria-pressed="${queda === m.id}">
          <span class="mk"></span><span><b>${esc(m.nombre)}</b><br><span class="sm">Código ${esc(m.codigo)} · se conserva esta</span></span></button>`).join('')}
      </div>
      ${dif.length ? `<div style="margin-top:12px">${dif.map(([k, t]) => `
        <label>${t}</label>
        <div class="opciones">
          <button class="opt" data-campo="${k}|queda" aria-pressed="${eleccion[k] === 'queda'}"><span class="mk"></span>${esc(qu[k] || '(vacío)')}</button>
          <button class="opt" data-campo="${k}|va" aria-pressed="${eleccion[k] === 'va'}"><span class="mk"></span>${esc(va[k] || '(vacío)')}</button>
        </div>`).join('')}</div>` : '<p class="sm" style="margin-top:12px">Los datos principales coinciden.</p>'}
      <div class="acts" style="justify-content:flex-end">
        <button class="btn sec" data-cerrar>Cancelar</button>
        <button class="btn dang" id="uniok">Unificar</button></div>`;

    $('dbody').querySelectorAll('[data-queda]').forEach(x => x.onclick = () => { queda = x.dataset.queda; pinta(); });
    $('dbody').querySelectorAll('[data-campo]').forEach(x => x.onclick = () => {
      const [k, v] = x.dataset.campo.split('|'); eleccion[k] = v; pinta();
    });
    $('uniok').onclick = async ev => {
      const desaparece = queda === a.id ? b.id : a.id;
      if (!await preguntar(`Desaparece la ficha de ${queda === a.id ? b.nombre : a.nombre}.\nNo se puede deshacer desde la app.`, { titulo: '¿Unificar fichas?', ok: 'Unificar', peligro: true })) return;
      ev.target.disabled = true; ev.target.textContent = 'Unificando…';
      const { data: r, error } = await db.rpc('unificar_medicos', { p: { queda, va: desaparece, campos: eleccion } });
      ev.target.disabled = false; ev.target.textContent = 'Unificar';
      if (error || (r && r.ok === false)) { toast('No se ha podido unificar', true); return; }
      toast('Fichas unificadas');
      DUPS = null; PARES = (PARES || []).filter(p => p.a_id !== desaparece && p.b_id !== desaparece);
      abrirDuplicados();
      buscar(true); cargarInicio();
    };
  };
  pinta();
}

/* ---------------- contraseñas ---------------- */

$('lform').insertAdjacentHTML('beforeend',
  '<button type="button" id="lolv" style="border:0;background:none;color:var(--navy);font-weight:600;cursor:pointer;margin-top:10px;font-size:13.5px">He olvidado la contraseña</button>');

$('lolv').onclick = async () => {
  const email = $('lu').value.trim();
  if (!email) { $('lmsg').textContent = 'Escribe primero tu correo.'; return; }
  const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  $('lmsg').style.color = error ? 'var(--dang)' : 'var(--ok)';
  $('lmsg').textContent = error ? 'No se ha podido enviar: ' + error.message
    : 'Te hemos enviado un correo para crear una contraseña nueva.';
};

/* Si el usuario llega desde el correo de recuperación, pedimos la contraseña nueva. */
db.auth.onAuthStateChange(async (evento) => {
  if (evento !== 'PASSWORD_RECOVERY') return;
  $('dbody').innerHTML = `
    <div class="fh"><div><h2>Nueva contraseña</h2><div class="sm">Elige una de al menos 8 caracteres</div></div></div>
    <label for="np1">Contraseña</label><input id="np1" type="password">
    <label for="np2">Repítela</label><input id="np2" type="password">
    <div class="acts" style="justify-content:flex-end"><button class="btn" id="npok">Guardar</button></div>`;
  $('dlg').showModal();
  $('npok').onclick = async ev => {
    if ($('np1').value.length < 8 || $('np1').value !== $('np2').value) { toast('Revisa las contraseñas', true); return; }
    ev.target.disabled = true;
    const { error } = await db.auth.updateUser({ password: $('np1').value });
    ev.target.disabled = false;
    if (error) { toast('No se ha podido cambiar: ' + error.message, true); return; }
    $('dlg').close(); toast('Contraseña actualizada'); arrancar();
  };
});

/* Cambiar la contraseña desde el menú de usuario */
document.addEventListener('click', async e => {
  if (!e.target.closest('[data-u="pass"]')) return;
  const p1 = await pedirTexto('Escribe la contraseña nueva (mínimo 8 caracteres)', '', { titulo: 'Cambiar contraseña', tipo: 'password', ok: 'Guardar' });
  if (!p1) return;
  if (p1.length < 8) { toast('Demasiado corta', true); return; }
  const { error } = await db.auth.updateUser({ password: p1 });
  toast(error ? 'No se ha podido: ' + error.message : 'Contraseña actualizada', !!error);
});



/* ============================================================
   DLC OS 2.0 · Entrega 7: mapa, móvil y avisos de versión
   ============================================================ */

let MAPA = null, CAPA = null, MODO_MAPA = false, CAPA_RUTA = null;
const COL_ESTADO = {
  'Sin contactar': '#0E2F52', 'Presentado': '#2B6CB0', 'Interesado': '#B7791F',
  'Prescribe': '#12805C', 'No interesado': '#9B2C2C'
};

/* ---------------- barra inferior en móvil ---------------- */

$('bnav').addEventListener('click', e => {
  const b = e.target.closest('[data-t]');
  if (b) ir(b.dataset.t);
});

const irOriginal = ir;
ir = function (t) {
  irOriginal(t);
  document.querySelectorAll('#bnav [data-t]').forEach(x => x.setAttribute('aria-selected', String(x.dataset.t === t)));
};

/* ---------------- mapa ---------------- */

$('mapaBtn').addEventListener('click', () => {
  MODO_MAPA = !MODO_MAPA;
  $('mapaBtn').textContent = MODO_MAPA ? 'Ver lista' : 'Ver mapa';
  $('mapawrap').classList.toggle('hide', !MODO_MAPA);
  $('lista').classList.toggle('hide', MODO_MAPA);
  $('mas').classList.add('hide');
  $('dirpag').classList.toggle('hide', MODO_MAPA);
  if (MODO_MAPA) pintarMapa();
});



async function pintarMapa() {
  if (!window.L) { $('mapleg').textContent = 'El mapa necesita conexión.'; return; }
  $('mapleg').textContent = 'Cargando puntos…';

  const { data, error } = await db.rpc('mapa_medicos', {
    q: F.q || null, f_provincia: F.prov || null, f_municipio: F.muni || null,
    f_estado: F.est || null, f_especialidad: F.esp || null, f_urgentes: !!F.urg
  });
  if (error) { $('mapleg').textContent = 'No se ha podido cargar el mapa: ' + error.message; return; }

  if (!MAPA) {
    MAPA = L.map('mapa', { preferCanvas: true }).setView([41.6, 1.9], 9);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(MAPA);
  }
  if (CAPA) CAPA.remove();
  CAPA = L.layerGroup().addTo(MAPA);

  const puntos = data || [];
  puntos.forEach(m => {
    const col = m.urgente && !m.ultima_visita ? '#D97706' : (COL_ESTADO[m.estado] || '#0E2F52');
    L.circleMarker([m.lat, m.lon], {
      radius: m.urgente ? 7 : 5, color: '#fff', weight: 1.5, fillColor: col, fillOpacity: .92
    }).addTo(CAPA).bindPopup(
      `<b>${esc(m.nombre)}</b><br>${esc(m.especialidad || '')}<br>${esc(m.centro || '')} ${esc(m.municipio || '')}<br>
       <span style="color:${col};font-weight:700">${esc(m.estado)}</span><br>
       <a href="#" onclick="abrirFicha('${m.id}');return false">Abrir ficha</a>`);
  });

  if (puntos.length) MAPA.fitBounds(puntos.map(m => [m.lat, m.lon]), { padding: [30, 30] });
  setTimeout(() => MAPA.invalidateSize(), 60);

  $('mapleg').innerHTML =
    `<span><i style="background:#D97706"></i>Urgente sin visitar</span>` +
    Object.entries(COL_ESTADO).map(([k, c]) => `<span><i style="background:${c}"></i>${k}</span>`).join('') +
    `<span style="margin-left:auto"><b>${num(puntos.length)}</b> con ubicación de ${num(F.total)} encontrados</span>`;
}

/* ---------------- el plan del día, dibujado ---------------- */

function mapaDelPlan() {
  if (!PLAN || !window.L) return;
  const caja = $('planmapa');
  if (!caja) return;
  if (!caja.dataset.on) {
    caja.dataset.on = '1'; caja.style.height = 'min(55vh,460px)';
    const conSal = PLAN.salida.lat != null, centro = conSal ? [PLAN.salida.lat, PLAN.salida.lon] : PLAN.paradas[0].xy;
    const m = L.map('planmapa').setView(centro, 10);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m);
    const pin = (xy, txt, col) => L.marker(xy, { icon: L.divIcon({ className: 'mpin', html: `<span style="background:${col}">${txt}</span>`, iconSize: [24, 24], iconAnchor: [12, 12] }) }).addTo(m);
    if (conSal) pin([PLAN.salida.lat, PLAN.salida.lon], 'S', '#12805C').bindPopup('Salida · ' + esc(PLAN.salida.nombre));
    PLAN.paradas.forEach((p, i) => pin(p.xy, String(i + 1), '#0E2F52')
      .bindPopup(`<b>${i + 1}. ${esc(p.centro)}</b><br>${hm(p.llegada)}–${hm(p.fin)}<br>${p.medicos.map(x => esc(x.nombre)).join('<br>')}`));
    const linea = conSal ? [[PLAN.salida.lat, PLAN.salida.lon]].concat(PLAN.paradas.map(p => p.xy), [[PLAN.salida.lat, PLAN.salida.lon]]) : PLAN.paradas.map(p => p.xy);
    L.polyline(linea, { color: '#2B6CB0', weight: 3, dashArray: '6 6' }).addTo(m);
    m.fitBounds(linea, { padding: [30, 30] });
    setTimeout(() => m.invalidateSize(), 60);
  }
}

/* ---------------- aviso de versión nueva ---------------- */

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistration().then(reg => {
    if (!reg) return;
    reg.addEventListener('updatefound', () => {
      const nuevo = reg.installing;
      if (!nuevo) return;
      nuevo.addEventListener('statechange', () => {
        if (nuevo.state === 'installed' && navigator.serviceWorker.controller) $('nuevaver').classList.remove('hide');
      });
    });
    setInterval(() => reg.update().catch(() => {}), 15 * 60 * 1000);
  });
  $('actualizar').onclick = () => location.reload(true);
}



/* ============================================================
   DLC OS 2.0 · Entrega 8: ruta en curso, indicadores e filtros guardados
   ============================================================ */

/* ---------------- indicadores personalizables ---------------- */

const KPI_CAT = [
  { id: 'citas',        t: 'citas de hoy visitadas',   v: k => `${k.citas_hechas}/${k.citas_hoy}` },
  { id: 'urgentes',     t: 'urgentes sin visitar',     v: k => k.urgentes, cls: k => k.urgentes ? 'warn' : 'ok', h: 'urgentes' },
  { id: 'visitas_sem',  t: 'visitas esta semana',      v: k => k.visitas_semana },
  { id: 'visitas_mes',  t: 'visitas este mes',         v: k => k.visitas_mes },
  { id: 'interesados',  t: 'médicos interesados',      v: k => k.interesados, cls: () => 'ok', h: 'interesados' },
  { id: 'sin_contactar', t: 'sin contactar',           v: k => k.sin_contactar, h: 'sin_contactar' },
  { id: 'cartera',      t: 'médicos en tu cartera',    v: k => k.medicos, h: 'todos' },
  { id: 'dups',         t: 'pendientes de unificar',   v: k => k.pendientes_unificar, cls: () => 'warn', admin: true, h: 'dups' }
];
const KPI_DEF = ['citas', 'urgentes', 'visitas_sem', 'visitas_mes', 'interesados', 'sin_contactar', 'cartera', 'dups'];

const kpiConfig = () => {
  const p = (PERFIL.preferencias || {}).kpis;
  if (Array.isArray(p) && p.length) return p;
  return KPI_CAT.map(k => ({ id: k.id, on: KPI_DEF.includes(k.id), t: '' }));
};

async function guardarKpis(lista) {
  const prefs = Object.assign({}, PERFIL.preferencias || {}, { kpis: lista });
  const { data, error } = await db.rpc('guardar_preferencias', { p: prefs });
  if (error) { toast('No se ha podido guardar: ' + error.message, true); return false; }
  PERFIL.preferencias = data || prefs;
  return true;
}

/** Cuenta los médicos de un filtro guardado. */
async function contarFiltro(f) {
  const { data } = await db.rpc('buscar_medicos', {
    q: f.q || null, f_provincia: f.prov || null, f_municipio: f.muni || null,
    f_estado: f.est || null, f_especialidad: f.esp || null, f_area: null,
    f_urgentes: !!f.urg, f_mios: false, f_sin_visitar: !!f.sin, orden: 'nombre', lim: 1, desplaz: 0, f_comercial: f.com || null
  });
  return data ? data.total : 0;
}

function textoFiltro(f) {
  const p = [];
  if (f.urg) p.push('urgentes');
  if (f.sin) p.push('sin visitar');
  if (f.est) p.push(f.est);
  if (f.esp) p.push(f.esp);
  if (f.muni) p.push(f.muni); else if (f.prov) p.push(f.prov);
  if (f.q) p.push('“' + f.q + '”');
  return p.join(' · ') || 'todos los médicos';
}

function abrirKpis() {
  let D = kpiConfig().slice();
  KPI_CAT.forEach(k => { if (!D.some(x => x.id === k.id)) D.push({ id: k.id, on: false, t: '' }); });

  const pinta = () => {
    $('dbody').innerHTML = `
      <div class="fh"><div><h2>Personalizar indicadores</h2>
        <div class="sm">Elige cuáles ver en Inicio, ordénalos y cambia su texto si quieres</div></div>
        <button class="x" data-cerrar aria-label="Cerrar">✕</button></div>
      <div class="lista">${D.map((x, i) => {
        const k = KPI_CAT.find(y => y.id === x.id);
        if (k && k.admin && PERFIL.rol !== 'Administrador') return '';
        return `<div class="item" style="cursor:default;${x.on ? '' : 'opacity:.55'}">
          <input type="checkbox" data-kon="${i}" ${x.on ? 'checked' : ''} style="width:18px;height:18px;min-height:0">
          <span class="tx"><input data-kt="${i}" value="${esc(x.t)}" placeholder="${esc(k ? k.t : (x.filtro ? textoFiltro(x.filtro) : ''))}">
            ${x.filtro ? `<span class="sm">Filtro guardado · ${esc(textoFiltro(x.filtro))}</span>` : ''}</span>
          <span class="acts" style="margin:0">
            <button class="btn sec" data-kmv="${i}|-1">↑</button>
            <button class="btn sec" data-kmv="${i}|1">↓</button>
            ${x.filtro ? `<button class="btn sec" data-kdel="${i}">Eliminar</button>` : ''}</span></div>`;
      }).join('')}</div>
      <div class="acts" style="justify-content:flex-end">
        <button class="btn sec" id="kres">Restaurar</button>
        <button class="btn" id="kok">Guardar</button></div>`;

    const leer = () => {
      $('dbody').querySelectorAll('[data-kt]').forEach(i => D[+i.dataset.kt].t = i.value.trim());
      $('dbody').querySelectorAll('[data-kon]').forEach(i => D[+i.dataset.kon].on = i.checked);
    };
    $('dbody').querySelectorAll('[data-kmv]').forEach(b => b.onclick = () => {
      leer();
      const [i, dir] = b.dataset.kmv.split('|').map(Number);
      const j = i + dir; if (j < 0 || j >= D.length) return;
      [D[i], D[j]] = [D[j], D[i]]; pinta();
    });
    $('dbody').querySelectorAll('[data-kdel]').forEach(b => b.onclick = () => { leer(); D.splice(+b.dataset.kdel, 1); pinta(); });
    $('dbody').querySelectorAll('[data-kon]').forEach(c => c.onchange = () => { leer(); pinta(); });
    $('kres').onclick = () => { D = KPI_CAT.map(k => ({ id: k.id, on: KPI_DEF.includes(k.id), t: '' })); pinta(); };
    $('kok').onclick = async ev => {
      leer(); ev.target.disabled = true; ev.target.textContent = 'Guardando…';
      const ok = await guardarKpis(D.map(x => ({ id: x.id, on: x.on, t: x.t, ...(x.filtro ? { filtro: x.filtro } : {}) })));
      ev.target.disabled = false; ev.target.textContent = 'Guardar';
      if (!ok) return;
      $('dlg').close(); toast('Indicadores guardados'); cargarInicio();
    };
  };
  pinta();
  $('dlg').showModal();
}

/* ---------------- guardar el filtro actual como indicador ---------------- */

function filtroActual() {
  const f = {};
  if (F.q) f.q = F.q;
  if (F.prov) f.prov = F.prov;
  if (F.muni) f.muni = F.muni;
  if (F.esp) f.esp = F.esp;
  if (F.est) f.est = F.est;
  if (F.urg) f.urg = true;
  return f;
}

$('guardarFiltro').addEventListener('click', async ev => {
  const f = filtroActual();
  if (!Object.keys(f).length) { toast('Aplica algún filtro antes de guardarlo', true); return; }
  const nombre = await pedirTexto('Nombre del indicador', textoFiltro(f).slice(0, 40), { titulo: 'Guardar filtro', ok: 'Guardar' });
  if (nombre === null) return;
  ev.target.disabled = true;
  const lista = kpiConfig().concat([{ id: 'f:' + Date.now().toString(36), on: true, t: nombre.trim() || textoFiltro(f), filtro: f }]);
  const ok = await guardarKpis(lista);
  ev.target.disabled = false;
  if (ok) { toast('Guardado como indicador en Inicio'); cargarInicio(); }
});

function aplicarFiltroGuardado(f) {
  Object.assign(F, { q: '', prov: '', muni: '', esp: '', est: '', urg: false, orden: 'nombre', pagina: 0 });
  if (f.q) { F.q = f.q; $('q').value = f.q; }
  ['prov', 'muni', 'esp', 'est'].forEach(k => { if (f[k]) { F[k] = f[k]; const s = $('f' + k); if (s) s.value = f[k]; } });
  if (f.urg) F.urg = true;
  ir('directorio'); buscar(true);
}

/* ---------------- ruta en curso ---------------- */

const RKEY = () => 'dlc-ruta-' + (PERFIL ? PERFIL.id : '');
const rutaActiva = () => { try { return JSON.parse(localStorage.getItem(RKEY()) || 'null'); } catch (e) { return null; } };
const durTxt = ms => { const m = Math.floor(ms / 60000); return (m >= 60 ? Math.floor(m / 60) + ' h ' : '') + (m % 60) + ' min'; };

async function pintarRutaBarra() {
  const a = rutaActiva(), el = $('rutabar');
  if (!a) { el.classList.add('hide'); document.body.classList.remove('conruta'); return; }
  el.classList.remove('hide'); document.body.classList.add('conruta');

  let hechas = a.hechas || 0;
  if (navigator.onLine) {
    const { data } = await db.from('visitas').select('medico_id').eq('fecha', a.fecha);
    if (data) hechas = new Set(data.filter(v => a.codes.includes(v.medico_id)).map(v => v.medico_id)).size;
  }
  el.innerHTML = `<span>● <b>En ruta: ${esc(a.nombre)}</b> · <span class="rt">${durTxt(Date.now() - a.inicio)}</span> · ${hechas} de ${a.codes.length} visitados</span>
    <span class="acts" style="margin:0"><button class="btn sec" id="rbver">Ver ruta</button><button class="btn dang" id="rbfin">Finalizar</button></span>`;
  $('rbver').onclick = () => { ir('rutas'); if (PLAN) pintarPlan(); };
  $('rbfin').onclick = async () => {
    if (!await preguntar(`Tiempo: ${durTxt(Date.now() - a.inicio)}\nVisitados: ${hechas} de ${a.codes.length}\n\nNo se puede reanudar.`, { titulo: `¿Finalizar "${a.nombre}"?`, ok: 'Finalizar', peligro: true })) return;
    localStorage.removeItem(RKEY());
    pintarRutaBarra();
    toast(`Ruta finalizada · ${durTxt(Date.now() - a.inicio)} · ${hechas} de ${a.codes.length}`);
  };
}

function empezarRuta() {
  if (rutaActiva()) { toast('Ya tienes una ruta en curso. Finalízala antes de empezar otra.', true); return; }
  if (!PLAN) return;
  const codes = PLAN.paradas.flatMap(p => p.medicos.map(m => m.id));
  const nombre = (RUTAS.find(r => r.id === PLAN.rutaId) || {}).nombre || 'Ruta del día';
  localStorage.setItem(RKEY(), JSON.stringify({ nombre, inicio: Date.now(), fecha: hoyISO(), codes }));
  pintarRutaBarra();
  toast('Ruta iniciada. ¡Buena ruta!');
  const p = PLAN.paradas[0];
  if (p) window.open(enlaceNav(p.xy), '_blank', 'noopener');
}

setInterval(() => { if (rutaActiva()) pintarRutaBarra(); }, 60000);



/* ============================================================
   DLC OS 2.0 · Entrega 9: ventanas propias y columnas configurables
   ============================================================ */

/* ---------------- ventanas propias ---------------- */

function appVentana({ titulo, msg, ok, cancel, campo, opciones, peligro }) {
  return new Promise(res => {
    const d = $('mini');
    d.innerHTML = `<div class="fbox">
      <div class="fh"><h2>${esc(titulo || 'Confirmar')}</h2></div>
      ${msg ? `<p style="margin:0 0 10px;white-space:pre-line">${esc(msg)}</p>` : ''}
      ${campo ? `<input id="mcampo" type="${campo.tipo || 'text'}" value="${esc(campo.valor || '')}"
                   placeholder="${esc(campo.placeholder || '')}" ${campo.min ? `min="${campo.min}"` : ''}>` : ''}
      ${opciones && opciones.length ? `<div class="chips" style="padding:10px 0 0">${
        opciones.map(o => `<button type="button" class="chip" data-mop="${esc(o)}">${esc(o)}</button>`).join('')}</div>` : ''}
      <div class="acts" style="justify-content:flex-end">
        ${cancel === false ? '' : `<button class="btn sec" id="mno">${esc(cancel || 'Cancelar')}</button>`}
        <button class="btn ${peligro ? 'dang' : ''}" id="mok">${esc(ok || 'Aceptar')}</button></div></div>`;

    const fin = v => { d.close(); res(v); };
    $('mok').onclick = () => fin(campo ? ($('mcampo').value || '') : true);
    if ($('mno')) $('mno').onclick = () => fin(campo ? null : false);
    d.querySelectorAll('[data-mop]').forEach(b => b.onclick = () => { $('mcampo').value = b.dataset.mop; });
    d.onclick = e => { if (e.target === d) fin(campo ? null : false); };
    d.oncancel = e => { e.preventDefault(); fin(campo ? null : false); };
    d.showModal();
    setTimeout(() => { const i = $('mcampo'); if (i) { i.focus(); i.onkeydown = ev => { if (ev.key === 'Enter') fin(i.value); }; } else $('mok').focus(); }, 30);
  });
}

const preguntar = (msg, o = {}) => appVentana({ msg, titulo: o.titulo, ok: o.ok, peligro: o.peligro });
const pedirTexto = (msg, valor, o = {}) => appVentana({ msg, titulo: o.titulo, ok: o.ok || 'Guardar', campo: { valor, placeholder: o.placeholder, tipo: o.tipo }, opciones: o.opciones });
const pedirFecha = (msg, valor, o = {}) => appVentana({ msg, titulo: o.titulo || 'Elige la fecha', ok: o.ok || 'Aceptar', campo: { valor, tipo: 'date' } });

/* ---------------- tabla del directorio con columnas ---------------- */

const COLS = [
  { k: 'nombre', t: 'Médico', w: 250, fijo: true },
  { k: 'especialidad', t: 'Especialidad', w: 170 },
  { k: 'centro_nombre', t: 'Centro', w: 200 },
  { k: 'municipio', t: 'Municipio', w: 140 },
  { k: 'direccion', t: 'Dirección', w: 200 },
  { k: 'telefono', t: 'Teléfono', w: 130 },
  { k: 'dias', t: 'Días', w: 150 },
  { k: 'ultima_visita', t: 'Última visita', w: 130 },
  { k: 'estado_comercial', t: 'Estado', w: 150 }
];
const COLS_DEF = ['nombre', 'especialidad', 'centro_nombre', 'municipio', 'dias', 'estado_comercial'];
const colKey = () => 'dlc-cols-' + (PERFIL ? PERFIL.id : '');

function colsConfig() {
  try {
    const g = JSON.parse(localStorage.getItem(colKey()) || 'null');
    if (g && g.length) return g;
  } catch (e) {}
  return COLS.map(c => ({ k: c.k, on: COLS_DEF.includes(c.k), w: c.w }));
}
const colsGuardar = c => localStorage.setItem(colKey(), JSON.stringify(c));

function celda(m, k) {
  if (k === 'nombre') return `<span class="nm">${m.urgente ? '<span class="pill p-urg">Urgente</span> ' : ''}${esc(m.nombre)}</span>`;
  if (k === 'dias') return `<span class="dias">${['L','M','X','J','V'].map(d =>
    `<span class="${(m.dias || {})[d] ? 'on' : ''}" title="${esc((m.dias || {})[d] || '')}">${d}</span>`).join('')}</span>`;
  if (k === 'estado_comercial') return `<span class="pill p-est">${esc(m.estado_comercial)}</span>`;
  if (k === 'ultima_visita') return `<span class="sm">${m.ultima_visita ? fechaCorta(m.ultima_visita) : '—'}</span>`;
  if (k === 'telefono') return `<span class="sm">${esc(m.telefono || m.consulta_telefono || '')}</span>`;
  return `<span class="sm">${esc(m[k] || '')}</span>`;
}

function filaTabla(m) {
  const cfg = colsConfig().filter(c => c.on);
  return `<button class="trow" data-id="${m.id}">${cfg.map(c =>
    `<span class="tcell" style="width:${c.w}px;min-width:${c.w}px">${celda(m, c.k)}</span>`).join('')}</button>`;
}

function cabeceraTabla() {
  const cfg = colsConfig().filter(c => c.on);
  const ancho = cfg.reduce((n, c) => n + c.w, 0);
  $('thead').innerHTML = cfg.map(c => {
    const col = COLS.find(x => x.k === c.k) || { t: c.k };
    return `<span class="tcell th" style="width:${c.w}px;min-width:${c.w}px">${esc(col.t)}<i class="res" data-res="${c.k}"></i></span>`;
  }).join('');
  $('thead').style.minWidth = ancho + 'px';
  $('lista').style.minWidth = ancho + 'px';
  $('scrollhint').classList.toggle('hide', ancho <= $('tabla').clientWidth + 4);
}

/* arrastrar el borde de una columna */
let ARR = null;
document.addEventListener('pointerdown', e => {
  const h = e.target.closest('i.res[data-res]'); if (!h) return;   // solo el borde de una cabecera
  const cfg = colsConfig(), c = cfg.find(x => x.k === h.dataset.res);
  if (!c) return;
  e.preventDefault();
  ARR = { k: h.dataset.res, x0: e.clientX, w0: c.w, cfg };
  document.body.style.cursor = 'col-resize';
});
document.addEventListener('pointermove', e => {
  if (!ARR) return;
  const w = Math.max(80, Math.min(600, Math.round(ARR.w0 + (e.clientX - ARR.x0))));
  ARR.w = w;
  document.querySelectorAll(`.tcell`).forEach(() => {});
  const cfg = ARR.cfg.map(c => c.k === ARR.k ? { ...c, w } : c);
  colsGuardar(cfg);
  cabeceraTabla();
  document.querySelectorAll('#lista .trow').forEach(tr => {
    const vis = cfg.filter(c => c.on);
    [...tr.children].forEach((cel, i) => { if (vis[i]) { cel.style.width = vis[i].w + 'px'; cel.style.minWidth = vis[i].w + 'px'; } });
  });
});
document.addEventListener('pointerup', () => { if (ARR) { ARR = null; document.body.style.cursor = ''; } });

function abrirColumnas() {
  let D = colsConfig();
  const pinta = () => {
    $('dbody').innerHTML = `
      <div class="fh"><div><h2>Columnas</h2>
        <div class="sm">Elige cuáles ver y en qué orden. El ancho se ajusta arrastrando el borde de cada cabecera.</div></div>
        <button class="x" data-cerrar aria-label="Cerrar">✕</button></div>
      <div class="lista">${D.map((c, i) => {
        const col = COLS.find(x => x.k === c.k) || { t: c.k };
        return `<div class="item" style="cursor:default">
          <input type="checkbox" data-con="${i}" ${c.on ? 'checked' : ''} ${col.fijo ? 'disabled' : ''} style="width:18px;height:18px;min-height:0">
          <span class="tx"><b>${esc(col.t)}</b>${col.fijo ? '<span class="sm">siempre visible</span>' : ''}</span>
          <span class="acts" style="margin:0">
            <button class="btn sec" data-cmv="${i}|-1">↑</button>
            <button class="btn sec" data-cmv="${i}|1">↓</button></span></div>`;
      }).join('')}</div>
      <div class="acts" style="justify-content:flex-end">
        <button class="btn sec" id="cres">Restaurar</button>
        <button class="btn" id="cok">Guardar</button></div>`;

    const leer = () => $('dbody').querySelectorAll('[data-con]').forEach(i => { if (!i.disabled) D[+i.dataset.con].on = i.checked; });
    $('dbody').querySelectorAll('[data-cmv]').forEach(b => b.onclick = () => {
      leer(); const [i, dir] = b.dataset.cmv.split('|').map(Number);
      const j = i + dir; if (j < 0 || j >= D.length) return;
      [D[i], D[j]] = [D[j], D[i]]; pinta();
    });
    $('cres').onclick = () => { localStorage.removeItem(colKey()); D = colsConfig(); pinta(); };
    $('cok').onclick = () => {
      leer();
      if (!D.some(c => c.on)) { toast('Deja al menos una columna', true); return; }
      colsGuardar(D); $('dlg').close(); toast('Columnas guardadas'); buscar(true);
    };
  };
  pinta();
  $('dlg').showModal();
}

$('cercaBtn').addEventListener('click', e => cercaDeMi(e.target));
$('dupBtn').addEventListener('click', () => ir('duplicados'));
$('dirtools').addEventListener('click', () => abrirHerramientas('directorio'));
$('compartirBtn').addEventListener('click', compartirSemana);



/* ============================================================
   DLC OS 2.0 · Entrega 10: pedidos, unidades y analítica
   ============================================================ */

let PRODUCTOS = [], PEDIDOS = [], SIN_ATRIB = [];
const AN = { dim: 'medico', desde: '', hasta: '', canal: '', producto: '' };
// Crear o cambiar pedidos y pacientes: administración y televenta (el comercial solo consulta lo suyo)
const puedeVentas = () => PERFIL && (PERFIL.rol === 'Administrador' || (((PERFIL.areas || {}).V || 0) >= 2 && PERFIL.rol === 'Televenta'));
const veVentas = () => PERFIL && (PERFIL.rol === 'Administrador' || ((PERFIL.areas || {}).V || 0) >= 1 || PERFIL.rol === 'Comercial');

async function cargarProductos() {
  const { data } = await db.rpc('productos_lista');
  PRODUCTOS = data || [];
}

/* ---------------- pedidos ---------------- */

async function cargarVentas() {
  $('v-ventas').innerHTML = `
    <div class="saludo"><div><h1>Ventas</h1><div class="fecha">Pedidos y unidades atribuidas</div></div>
      <div class="acts" style="margin:0">
        ${puedeVentas() ? '<button class="btn" id="pednuevo">+ Nuevo pedido</button>' : ''}
        ${PERFIL.rol === 'Administrador' ? '<button class="btn sec" id="prodbtn">Productos</button>' : ''}
      </div></div>
    <div class="card" id="cardsinatr"></div>
    <div class="panel">
      <div class="filtros">
        <div><label for="pdesde">Desde</label><input id="pdesde" type="date"></div>
        <div><label for="phasta">Hasta</label><input id="phasta" type="date"></div>
        <div><label for="pcanal">Canal</label><select id="pcanal">
          <option value="">Todos</option><option value="paciente">Recomendación a paciente</option>
          <option value="centro">Venta a centro</option></select></div>
        <div><label for="pq">Buscar</label><input id="pq" placeholder="Médico, contacto o nº de pedido"></div>
      </div>
      <div class="cuenta" id="pcuenta">Cargando…</div>
      <div id="pedlista"></div>
    </div>`;

  if ($('pednuevo')) $('pednuevo').onclick = () => editorPedido();
  if ($('prodbtn')) $('prodbtn').onclick = editorProductos;
  ['pdesde', 'phasta', 'pcanal'].forEach(id => $(id).onchange = listaPedidos);
  let tq; $('pq').oninput = () => { clearTimeout(tq); tq = setTimeout(listaPedidos, 350); };
  await cargarProductos();
  listaPedidos();
  pintarSinAtribuir();
}

async function listaPedidos() {
  cargando($('pedlista'), 'Cargando pedidos…');
  const { data, error } = await db.rpc('pedidos_lista', {
    p_desde: $('pdesde').value || null, p_hasta: $('phasta').value || null,
    p_canal: $('pcanal').value || null, q: ($('pq') && $('pq').value.trim()) || null, lim: 200
  });
  if (error) { $('pcuenta').textContent = 'No se ha podido cargar: ' + error.message; return; }
  PEDIDOS = data || [];
  const unidades = PEDIDOS.reduce((n, p) => n + (p.unidades || 0), 0);
  $('pcuenta').innerHTML = `<b>${num(PEDIDOS.length)}</b> pedidos · <b>${num(unidades)}</b> unidades`;
  $('pedlista').innerHTML = PEDIDOS.length ? PEDIDOS.map(p => `
    <button class="fila" data-ped="${p.id}" style="grid-template-columns:minmax(0,1.4fr) minmax(0,1.4fr) auto auto;${p.estado === 'Anulado' ? 'opacity:.55' : ''}">
      <span><span class="nm">${esc(p.medico || p.centro || p.contacto || 'Sin atribuir')}</span>
        <span class="sm">${fechaCorta(p.fecha)} · ${p.canal === 'centro' ? 'Venta a centro' : 'Recomendación'}${p.comercial ? ' · ' + esc(p.comercial) : ''}</span></span>
      <span class="c2"><span class="sm">${esc(p.productos || '')}</span>
        <span class="sm">${p.numero ? 'Nº ' + esc(p.numero) : ''} ${esc(p.contacto || '')}</span></span>
      <span class="c3"><span class="pill p-est">${esc(p.estado)}</span></span>
      <span><b style="font-size:17px;color:var(--navy)">${num(p.unidades)}</b> <span class="sm">uds.</span></span>
    </button>`).join('') : '<div class="vacio">Todavía no hay pedidos registrados.</div>';
  $('pedlista').querySelectorAll('[data-ped]').forEach(b => b.onclick = () => verPedido(b.dataset.ped));
}

async function pintarSinAtribuir() {
  if (!$('cardsinatr')) return;
  const { data } = await db.rpc('lineas_sin_atribuir');
  if (!$('cardsinatr')) return;
  SIN_ATRIB = data || [];
  if (!SIN_ATRIB.length) { $('cardsinatr').innerHTML = ''; return; }
  $('cardsinatr').innerHTML = `<h2><span style="color:var(--warn)">Pedidos sin atribuir</span><span class="n">${SIN_ATRIB.length}</span></h2>
    <p class="sm">No hemos podido identificar al médico. Asígnalo y las métricas se corrigen solas.</p>
    <div class="lista">${SIN_ATRIB.map(l => `<div class="item" style="cursor:default">
      <span class="ic w">?</span>
      <span class="tx"><b>${esc(l.medico_texto || 'Sin indicar')}</b>
        <span class="sm">${fechaCorta(l.fecha)} · ${num(l.unidades)} uds. · ${esc(l.producto || '')} · ${esc(l.contacto || '')}</span></span>
      <span class="acts" style="margin:0"><button class="btn sec" data-atr="${l.id}|${esc(l.medico_texto || '')}">Atribuir</button></span>
    </div>`).join('')}</div>`;
  $('cardsinatr').querySelectorAll('[data-atr]').forEach(b => b.onclick = () => {
    const [id, texto] = b.dataset.atr.split('|'); atribuir(id, texto);
  });
}

async function atribuir(lineaId, texto) {
  const { data } = await db.rpc('resolver_medico', { p_texto: texto || '' });
  const cand = data || [];
  $('dbody').innerHTML = `
    <div class="fh"><div><h2>Atribuir a un médico</h2><div class="sm">Texto del pedido: ${esc(texto || '(vacío)')}</div></div>
      <button class="x" data-cerrar aria-label="Cerrar">✕</button></div>
    <label for="abusca">Buscar médico</label><input id="abusca" value="${esc(texto || '')}" placeholder="Código o nombre">
    <div id="acand" class="lista">${cand.map(c => `<button class="item" data-am="${c.id}">
      <span class="ic">${c.pct}%</span><span class="tx"><b>${esc(c.nombre)}</b><span class="sm">Código ${esc(c.codigo)}</span></span></button>`).join('')
      || '<div class="vacio">Sin coincidencias. Escribe otro nombre o código.</div>'}</div>`;

  const pintar = lista => {
    $('acand').innerHTML = lista.length ? lista.map(c => `<button class="item" data-am="${c.id}">
      <span class="ic">${c.pct}%</span><span class="tx"><b>${esc(c.nombre)}</b><span class="sm">Código ${esc(c.codigo)}</span></span></button>`).join('')
      : '<div class="vacio">Sin coincidencias.</div>';
    $('acand').querySelectorAll('[data-am]').forEach(b => b.onclick = async () => {
      const { data: r, error } = await db.rpc('atribuir_linea', { p_linea: lineaId, p_medico: b.dataset.am });
      if (error || (r && r.ok === false)) { toast('No se ha podido atribuir', true); return; }
      $('dlg').close(); toast('Atribuido'); pintarSinAtribuir(); listaPedidos();
    });
  };
  pintar(cand);
  let t;
  $('abusca').oninput = e => {
    clearTimeout(t);
    t = setTimeout(async () => {
      const { data: d2 } = await db.rpc('resolver_medico', { p_texto: e.target.value });
      pintar(d2 || []);
    }, 300);
  };
  $('dlg').showModal();
}

/* ---------------- alta de pedido ---------------- */

async function editorPedido(pedido) {
  let lineas = pedido && pedido.lineas && pedido.lineas.length
    ? pedido.lineas.map(l => ({ producto_id: l.producto_id, unidades: l.unidades, importe: l.importe, descuento: l.descuento || 0 }))
    : [{ producto_id: (PRODUCTOS[0] || {}).id || '', unidades: 1 }];
  let medico = pedido && pedido.lineas && pedido.lineas[0] && pedido.lineas[0].medico_id
    ? { id: pedido.lineas[0].medico_id, nombre: pedido.lineas[0].medico } : null;
  let contacto = pedido && pedido.contacto ? pedido.contacto : null;

  const pinta = () => {
    $('dbody').innerHTML = `
      <div class="fh"><div><h2>${pedido ? 'Editar pedido' : 'Nuevo pedido'}</h2><div class="sm">Las unidades se atribuyen al médico y a su comercial</div></div>
        <button class="x" data-cerrar aria-label="Cerrar">✕</button></div>
      <div class="g2">
        <div><label for="pfecha">Fecha</label><input id="pfecha" type="date" value="${hoyISO()}"></div>
        <div><label for="pcan">Canal</label><select id="pcan">
          <option value="paciente">Recomendación a paciente</option>
          <option value="centro">Venta a centro (con descuento)</option></select></div>
      </div>
      <div id="zonapac">
        <label for="pcont">Paciente o contacto</label>
        <div style="display:flex;gap:8px"><input id="pcont" placeholder="Busca por nombre o teléfono" value="${esc(contacto ? contacto.nombre : '')}" style="flex:1">
          <button type="button" class="btn sec" id="pcontnuevo">+ Nuevo</button></div>
        <div id="pcontcand" class="lista"></div>
        <label for="pmed">Médico que lo recomienda</label>
        <input id="pmed" placeholder="Código o nombre" value="${esc(medico ? medico.nombre : '')}">
        <div id="pmedcand" class="sm" style="margin-top:6px">${medico
          ? `<b style="color:var(--ok)">✓ ${esc(medico.nombre)}</b> · código ${esc(medico.codigo)}`
          : 'Escribe y elige de la lista. Si no aparece, el pedido queda pendiente de atribuir.'}</div>
      </div>
      <label>Líneas</label>
      <div id="plineas">${lineas.map((l, i) => {
        const pr = PRODUCTOS.find(p => p.id === l.producto_id) || {};
        return `<div class="g2" style="margin-bottom:8px;grid-template-columns:2fr .8fr 1fr .7fr auto">
        <select data-lp="${i}">${PRODUCTOS.map(p => `<option value="${p.id}" ${l.producto_id === p.id ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('')
          || '<option value="">Sin productos: créalos primero</option>'}</select>
        <input data-lu="${i}" type="number" min="1" value="${l.unidades}" placeholder="Unidades">
        <input data-li="${i}" type="number" step="0.01" min="0" value="${l.importe != null ? l.importe : (pr.precio ? (pr.precio * l.unidades).toFixed(2) : '')}" placeholder="Importe €">
        <input data-ld="${i}" type="number" step="1" min="0" max="100" value="${l.descuento || 0}" placeholder="% dto" title="Descuento de esta línea">
        ${lineas.length > 1 ? `<button type="button" class="btn sec" data-lx="${i}">✕</button>` : ''}</div>`; }).join('')}</div>
      <div class="acts"><button type="button" class="btn sec" id="plmas">+ Añadir línea</button></div>
      <div class="g2">
        <div><label for="ppago">Forma de pago</label><select id="ppago"><option value=""></option>
          ${(CAT.FORMA_PAGO || []).map(x => `<option ${pedido && pedido.pedido && pedido.pedido.forma_pago === x.valor ? 'selected' : ''}>${esc(x.valor)}</option>`).join('')}</select></div>
        <div><label for="pdto">Descuento general</label>
          <div style="display:flex;gap:6px"><input id="pdto" type="number" min="0" step="0.01" value="${pedido && pedido.pedido ? (pedido.pedido.descuento || 0) : 0}">
            <select id="pdtot" style="max-width:110px"><option value="porcentaje">%</option><option value="importe">€</option></select></div></div>
      </div>
      <div class="totbox" id="ptot"></div>
      <label for="pnota">Nota</label><input id="pnota">
      <div class="acts" style="justify-content:flex-end">
        <button class="btn sec" data-cerrar>Cancelar</button>
        <button class="btn" id="pguardar">Guardar pedido</button></div>`;

    const leer = () => lineas = [...$('plineas').children].map((d, i) => ({
      producto_id: d.querySelector(`[data-lp="${i}"]`).value,
      unidades: +d.querySelector(`[data-lu="${i}"]`).value || 1,
      importe: d.querySelector(`[data-li="${i}"]`) && d.querySelector(`[data-li="${i}"]`).value !== ''
        ? +d.querySelector(`[data-li="${i}"]`).value : null,
      descuento: d.querySelector(`[data-ld="${i}"]`) ? +d.querySelector(`[data-ld="${i}"]`).value || 0 : 0
    }));

    $('plmas').onclick = () => { leer(); lineas.push({ producto_id: (PRODUCTOS[0] || {}).id || '', unidades: 1 }); pinta(); };
    $('plineas').querySelectorAll('[data-lx]').forEach(b => b.onclick = () => { leer(); lineas.splice(+b.dataset.lx, 1); pinta(); });
    $('pcan').onchange = () => $('zonapac').classList.toggle('hide', $('pcan').value === 'centro');

    const totales = () => {
      leer();
      const base = lineas.reduce((n, l) => {
        const pr = PRODUCTOS.find(p => p.id === l.producto_id) || {};
        const imp = l.importe != null ? +l.importe : (pr.precio ? pr.precio * l.unidades : 0);
        return n + imp * (1 - (+l.descuento || 0) / 100);
      }, 0);
      const dto = $('pdtot').value === 'porcentaje' ? base * (+$('pdto').value || 0) / 100 : (+$('pdto').value || 0);
      const uds = lineas.reduce((n, l) => n + (+l.unidades || 0), 0);
      $('ptot').innerHTML = `<div><span>Unidades</span><b>${num(uds)}</b></div>
        <div><span>Base</span><b>${eur(base)}</b></div>
        ${dto ? `<div><span>Descuento</span><b>−${eur(dto)}</b></div>` : ''}
        <div class="tot"><span>Total</span><b>${eur(Math.max(0, base - dto))}</b></div>`;
    };
    ['pdto', 'pdtot'].forEach(id => { if ($(id)) $(id).oninput = totales; });
    $('plineas').oninput = totales;
    totales();

    let tc;
    if ($('pcont')) {
      $('pcont').oninput = e => {
        contacto = null;
        clearTimeout(tc);
        tc = setTimeout(async () => {
          const q = e.target.value.trim();
          if (q.length < 2) { $('pcontcand').innerHTML = ''; return; }
          const { data } = await db.rpc('contactos_lista', { q, lim: 6 });
          $('pcontcand').innerHTML = (data || []).map(x => `<button class="item" data-pc='${esc(JSON.stringify(x))}'>
            <span class="ic">👤</span><span class="tx"><b>${esc(x.nombre)}</b>
              <span class="sm">${esc(x.telefono || '')} · ${num(x.pedidos)} pedidos</span></span></button>`).join('')
            || '<div class="vacio">Sin coincidencias. Créalo con + Nuevo.</div>';
          $('pcontcand').querySelectorAll('[data-pc]').forEach(b => b.onclick = () => {
            contacto = JSON.parse(b.dataset.pc);
            $('pcont').value = contacto.nombre; $('pcontcand').innerHTML = '';
          });
        }, 300);
      };
      $('pcontnuevo').onclick = () => editorContacto({ nombre: $('pcont').value.trim() }, c => {
        contacto = c; $('pcont').value = c.nombre; $('pcontcand').innerHTML = '';
      });
    }

    let t;
    $('pmed').oninput = e => {
      clearTimeout(t);
      t = setTimeout(async () => {
        const { data } = await db.rpc('resolver_medico', { p_texto: e.target.value });
        const c = data || [];
        $('pmedcand').innerHTML = c.length
          ? c.map(x => `<button type="button" class="chip" data-pm='${esc(JSON.stringify(x))}'>${esc(x.nombre)} · ${x.pct}%</button>`).join(' ')
          : 'Sin coincidencias: quedará pendiente de atribuir.';
        $('pmedcand').querySelectorAll('[data-pm]').forEach(b => b.onclick = () => {
          medico = JSON.parse(b.dataset.pm); leer(); pinta();
        });
      }, 300);
    };

    $('pguardar').onclick = async ev => {
      leer();
      ev.target.disabled = true; ev.target.textContent = 'Guardando…';
      const { data: r, error } = await db.rpc('guardar_pedido', { p: {
        id: pedido && pedido.pedido ? pedido.pedido.id : null,
        fecha: $('pfecha').value, canal: $('pcan').value,
        medico_id: medico ? medico.id : null, medico_texto: $('pmed') ? $('pmed').value.trim() : '',
        contacto_id: contacto ? contacto.id : null, nota: $('pnota').value.trim(),
        forma_pago: $('ppago').value || null,
        descuento: +$('pdto').value || 0, descuento_tipo: $('pdtot').value,
        lineas: lineas.filter(l => l.producto_id), op_id: 'p-' + Date.now()
      }});
      ev.target.disabled = false; ev.target.textContent = 'Guardar pedido';
      if (error || (r && r.ok === false)) { toast('No se ha podido guardar: ' + ((error && error.message) || 'sin permiso'), true); return; }
      $('dlg').close();
      toast(medico ? 'Pedido guardado y atribuido' : 'Pedido guardado · pendiente de atribuir');
      listaPedidos(); pintarSinAtribuir();
    };
  };
  pinta();
  $('dlg').showModal();
}

/* ---------------- productos ---------------- */

async function editorProductos() {
  await cargarProductos();
  $('dbody').innerHTML = `
    <div class="fh"><div><h2>Productos</h2><div class="sm">Catálogo usado en pedidos, muestras y analítica</div></div>
      <button class="x" data-cerrar aria-label="Cerrar">✕</button></div>
    <div class="lista">${PRODUCTOS.map(p => `<div class="item" style="cursor:default">
      <span class="ic" style="${p.foto_url ? `background:url('${esc(p.foto_url)}') center/cover` : ''}">${p.foto_url ? '' : '◧'}</span><span class="tx"><b>${esc(p.nombre)}</b>
        <span class="sm">${esc(p.presentacion || '')}${p.precio ? ' · ' + eur(p.precio) + ' + ' + (p.iva || 0) + '% IVA' : ''}${p.referencia ? ' · ref. ' + esc(p.referencia) : ''}</span></span>
      <span class="acts" style="margin:0"><button class="btn sec" data-pdel="${p.id}">Desactivar</button></span></div>`).join('')
      || '<div class="vacio">Todavía no hay productos.</div>'}</div>
    <div class="g2" style="margin-top:12px">
      <div><label for="prn">Nombre</label><input id="prn" placeholder="Nombre del producto"></div>
      <div><label for="prp">Presentación</label><input id="prp" placeholder="Caja de 60 cápsulas"></div>
    </div>
    <div class="g2">
      <div><label for="prpr">Precio sin IVA</label><input id="prpr" type="number" step="0.01" min="0" placeholder="41,82"></div>
      <div><label for="priva">IVA (%)</label><input id="priva" type="number" min="0" max="21" value="10"></div>
    </div>
    <div class="g2">
      <div><label for="prref">Referencia</label><input id="prref"></div>
      <div><label for="prcb">Código de barras</label><input id="prcb"></div>
    </div>
    <label for="prfoto">Foto del producto</label><input id="prfoto" type="file" accept="image/*">
    <div class="acts" style="justify-content:flex-end"><button class="btn" id="pradd">Añadir producto</button></div>`;

  $('pradd').onclick = async ev => {
    if (!$('prn').value.trim()) { toast('Escribe el nombre', true); return; }
    ev.target.disabled = true;
    let foto_url = null;
    const f = $('prfoto').files && $('prfoto').files[0];
    if (f) {
      const ruta = 'p-' + Date.now() + '-' + f.name.replace(/[^a-zA-Z0-9.]/g, '');
      const { error: eu } = await db.storage.from('productos').upload(ruta, f, { upsert: true });
      if (!eu) foto_url = db.storage.from('productos').getPublicUrl(ruta).data.publicUrl;
      else toast('La foto no se ha podido subir: ' + eu.message, true);
    }
    const { data: r, error } = await db.rpc('guardar_producto', { p: { nombre: $('prn').value.trim(),
      presentacion: $('prp').value.trim(), precio: $('prpr').value, iva: +$('priva').value || 10,
      referencia: $('prref').value.trim(), codigo_barras: $('prcb').value.trim(),
      ...(foto_url ? { foto_url } : {}) } });
    ev.target.disabled = false;
    if (error || (r && r.ok === false)) { toast('No se ha podido crear', true); return; }
    toast('Producto añadido'); editorProductos();
  };
  $('dbody').querySelectorAll('[data-pdel]').forEach(b => b.onclick = async () => {
    await db.rpc('guardar_producto', { p: { id: b.dataset.pdel, activo: false } });
    toast('Producto desactivado'); editorProductos();
  });
  $('dlg').showModal();
}

/* ---------------- analítica ---------------- */

async function cargarAnalitica() {
  $('v-analitica').innerHTML = `
    <div class="saludo"><div><h1>Analítica</h1><div class="fecha">Unidades por médico, comercial, producto o zona</div></div>
      </div>
    <div class="panel">
      <div class="filtros">
        <div><label for="adim">Ver por</label><select id="adim">
          <option value="medico">Médico</option><option value="comercial">Comercial</option>
          <option value="producto">Producto</option><option value="municipio">Municipio</option>
          <option value="mes">Mes</option><option value="canal">Canal</option></select></div>
        <div><label for="adesde">Desde</label><input id="adesde" type="date"></div>
        <div><label for="ahasta">Hasta</label><input id="ahasta" type="date"></div>
        <div><label for="acanal">Canal</label><select id="acanal">
          <option value="">Todos</option><option value="paciente">Recomendación</option>
          <option value="centro">Venta a centro</option></select></div>
        <div><label for="amedida">Medida</label><select id="amedida">
          <option value="unidades">Unidades</option><option value="importe">Importe</option></select></div>
      </div>
      <div class="cuenta" id="acuenta">Calculando…</div>
      <div class="subnav" style="padding:12px 14px 0"><button data-avista="rank" aria-pressed="true">Ranking</button>
        <button data-avista="tabla" aria-pressed="false">Tabla por meses</button></div>
      <div id="aserie" style="padding:14px"></div>
      <div id="atabla"></div>
      <div id="atabla2"></div>
    </div>`;

  ['adim', 'adesde', 'ahasta', 'acanal', 'amedida'].forEach(id => $(id).onchange = () => { pintarAnalitica(); pintarTablaAnalitica(); });
  $('v-analitica').querySelectorAll('[data-avista]').forEach(b => b.onclick = () => {
    const tabla = b.dataset.avista === 'tabla';
    $('v-analitica').querySelectorAll('[data-avista]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    $('atabla').classList.toggle('hide', tabla); $('aserie').classList.toggle('hide', tabla);
    $('atabla2').classList.toggle('hide', !tabla);
    if (tabla) pintarTablaAnalitica();
  });
  $('atabla2').classList.add('hide');
  window.__dlAn = fmt => descargar(window.__ANTABLA || (window.__AN || []).map(f => ({ concepto: f.nombre, unidades: f.unidades })), 'Exportacion_unidades', fmt);
  pintarAnalitica();
}

async function pintarAnalitica() {
  $('acuenta').textContent = 'Calculando…';
  cargando($('atabla'), 'Calculando…');
  const { data, error } = await db.rpc('analitica_unidades', {
    p_dim: $('adim').value, p_desde: $('adesde').value || null, p_hasta: $('ahasta').value || null,
    p_canal: $('acanal').value || null, lim: 50
  });
  if (error) { $('acuenta').textContent = 'No se ha podido calcular: ' + error.message; return; }

  const filas = data.filas || [];
  window.__AN = filas;
  $('acuenta').innerHTML = `<b>${num(data.total)}</b> unidades · ${filas.length} ${$('adim').value === 'medico' ? 'médicos' : 'conceptos'}`;

  const serie = data.serie || [];
  if (serie.length > 1) {
    const max = Math.max(...serie.map(s => s.unidades));
    $('aserie').innerHTML = `<div style="display:flex;gap:6px;align-items:flex-end;height:120px">${
      serie.map(s => `<div style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:4px">
        <span class="sm">${num(s.unidades)}</span>
        <div style="width:100%;background:var(--sky);border-radius:6px 6px 0 0;height:${Math.round(s.unidades / max * 84)}px"></div>
        <span class="sm">${esc(s.mes.slice(5))}/${esc(s.mes.slice(2, 4))}</span></div>`).join('')}</div>`;
  } else $('aserie').innerHTML = '';

  const max = filas.length ? filas[0].unidades : 1;
  $('atabla').innerHTML = filas.length ? filas.map((f, i) => `
    <div class="fila" style="cursor:default;grid-template-columns:36px minmax(0,1fr) 120px auto">
      <span class="sm">${i + 1}</span>
      <span><span class="nm">${esc(f.nombre)}</span>
        <span style="display:block;height:5px;border-radius:3px;background:var(--sky-soft);margin-top:5px">
          <span style="display:block;height:5px;border-radius:3px;background:var(--sky);width:${Math.round(f.unidades / max * 100)}%"></span></span></span>
      <span class="sm">${Math.round(f.unidades / (data.total || 1) * 100)}% del total</span>
      <span><b style="font-size:17px;color:var(--navy)">${num(f.unidades)}</b> <span class="sm">uds.</span></span>
    </div>`).join('') : '<div class="vacio">Sin unidades en este periodo.</div>';
}



/* ============================================================
   DLC OS 2.0 · Entrega 11: comisiones
   ============================================================ */

let ESQUEMAS = [];
const eur = n => Number(n || 0).toLocaleString('es', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });
const periodoActual = () => hoyISO().slice(0, 7);
const periodoTxt = p => {
  const [a, m] = p.split('-');
  return ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][+m - 1] + ' ' + a;
};

/* ---------------- panel personal en Inicio ---------------- */

async function tarjetaComision() {
  const caja = $('c-comision');
  if (!caja) return;
  if (PERFIL.comision_ver === 'nada' || !PERFIL.comision_ver) { caja.innerHTML = ''; return; }

  const { data, error } = await db.rpc('comision_periodo', {});
  if (error || !data || data.ok === false) { caja.innerHTML = ''; return; }
  if (data.sin_esquema && !data.unidades) { caja.innerHTML = ''; return; }

  const verImporte = PERFIL.comision_ver === 'importe' && !data.sin_esquema;
  const sig = data.siguiente;
  caja.innerHTML = `<h2>Tu ${verImporte ? 'comisión' : 'actividad'} de ${periodoTxt(data.periodo)}</h2>
    <div class="kpis" style="padding:10px 16px 4px;margin:0">
      <div class="kpi"><b>${num(data.unidades)}</b><span>unidades atribuidas</span></div>
      ${verImporte ? `<div class="kpi ok"><b>${eur(data.importe)}</b><span>comisión acumulada</span></div>` : ''}
      ${verImporte && data.valor_unidad ? `<div class="kpi"><b>${eur(data.valor_unidad)}</b><span>por unidad en tu tramo</span></div>` : ''}
    </div>
    ${sig ? `<p class="sm" style="padding:0 16px 14px">
      Te faltan <b>${num(sig.faltan)}</b> unidades para el siguiente tramo${verImporte ? `, que pasaría a <b>${eur(sig.valor)}</b> por unidad, aplicado a todo el periodo` : ''}.</p>`
      : `<p class="sm" style="padding:0 16px 14px">${data.sin_esquema ? 'No tienes comisión asignada: estas unidades solo cuentan para las métricas.' : 'Estás en el tramo más alto.'}</p>`}`;
}

/* ---------------- esquemas de comisión (administración) ---------------- */

async function pintarComisiones() {
  ($('admcuerpo') || document.createElement('div')).innerHTML = '<div class="skel"></div><div class="skel" style="width:60%"></div>';
  const [{ data: esq }, { data: liq }] = await Promise.all([
    db.rpc('esquemas_lista'), db.rpc('liquidaciones_lista', { p_periodo: null })
  ]);
  ESQUEMAS = esq || [];

  ($('admcuerpo') || document.createElement('div')).innerHTML = `
    <h2>Esquemas de comisión<span class="n">${ESQUEMAS.length}</span></h2>
    <p class="sm">El tramo alcanzado se aplica a todas las unidades del periodo. Televenta suele ir con importe fijo por unidad.</p>
    <div class="lista">${ESQUEMAS.map(e => `<div class="item" style="cursor:default">
      <span class="ic">${e.calculo === 'fijo' ? '€' : '▤'}</span>
      <span class="tx"><b>${esc(e.nombre)}</b><span class="sm">
        ${e.atribucion === 'cierra' ? 'Por venta cerrada' : 'Por cartera'} ·
        ${e.calculo === 'fijo' ? eur(e.valor_fijo) + ' por unidad'
          : (e.tramos || []).map(t => `${t.desde_u}${t.hasta_u ? '-' + t.hasta_u : '+'}: ${eur(t.valor)}`).join(' · ') || 'sin tramos'}
        ${(e.personas || []).length ? ' · ' + e.personas.map(esc).join(', ') : ' · sin asignar'}</span></span>
      <span class="acts" style="margin:0"><button class="btn sec" data-esq="${e.id}">Editar</button></span></div>`).join('')
      || '<div class="vacio">Todavía no hay esquemas.</div>'}</div>
    <div class="acts" style="padding:0 16px 14px"><button class="btn" id="esqnuevo">+ Nuevo esquema</button></div>

    <h2>Liquidaciones</h2>
    <div class="acts" style="padding:0 16px">
      <input id="liqper" type="month" value="${periodoActual()}" style="max-width:190px">
      <button class="btn sec" id="liqcalc">Calcular el periodo</button></div>
    <div class="lista">${(liq || []).map(l => `<div class="item" style="cursor:default">
      <span class="ic ${l.estado === 'Pagada' ? 'o' : ''}">${l.estado === 'Borrador' ? '○' : '✓'}</span>
      <span class="tx"><b>${esc(l.nombre)}</b><span class="sm">${periodoTxt(l.periodo)} · ${num(l.unidades)} unidades · ${eur(l.importe)} · ${esc(l.estado)}</span></span>
      <span class="acts" style="margin:0">
        ${l.estado === 'Borrador' ? `<button class="btn sec" data-liq="${l.usuario_id}|${l.periodo}|Aprobada">Aprobar</button>` : ''}
        ${l.estado === 'Aprobada' ? `<button class="btn sec" data-liq="${l.usuario_id}|${l.periodo}|Pagada">Marcar pagada</button>` : ''}
      </span></div>`).join('') || '<div class="vacio">Sin liquidaciones todavía.</div>'}</div>`;

  $('esqnuevo').onclick = () => editorEsquema(null);
  ($('admcuerpo') || document.createElement('div')).querySelectorAll('[data-esq]').forEach(b => b.onclick = () => editorEsquema(b.dataset.esq));
  $('liqcalc').onclick = calcularLiquidaciones;
  ($('admcuerpo') || document.createElement('div')).querySelectorAll('[data-liq]').forEach(b => b.onclick = async () => {
    const [u, p, estado] = b.dataset.liq.split('|');
    if (!await preguntar(`La liquidación quedará ${estado === 'Aprobada' ? 'aprobada y congelada' : 'marcada como pagada'}.`,
      { titulo: '¿' + (estado === 'Aprobada' ? 'Aprobar' : 'Marcar pagada') + '?', ok: estado === 'Aprobada' ? 'Aprobar' : 'Marcar pagada' })) return;
    await db.rpc('liquidar', { p_usuario: u, p_periodo: p, p_estado: estado });
    toast('Liquidación ' + estado.toLowerCase()); pintarComisiones();
  });
}

async function calcularLiquidaciones() {
  const per = $('liqper').value;
  if (!per) return;
  const conEsquema = [];
  ESQUEMAS.forEach(e => (e.personas || []).forEach(n => {
    const u = USUARIOS.find(x => x.nombre === n);
    if (u && !conEsquema.includes(u.id)) conEsquema.push(u.id);
  }));
  if (!conEsquema.length) { toast('Ningún usuario tiene esquema asignado', true); return; }
  for (const u of conEsquema) await db.rpc('liquidar', { p_usuario: u, p_periodo: per, p_estado: 'Borrador' });
  toast(`${conEsquema.length === 1 ? 'Calculada 1 liquidación' : 'Calculadas ' + conEsquema.length + ' liquidaciones'} de ${periodoTxt(per)}`);
  pintarComisiones();
}

function editorEsquema(id) {
  const e = id ? ESQUEMAS.find(x => x.id === id) : null;
  let tramos = e && e.tramos && e.tramos.length ? e.tramos.slice() : [{ desde_u: 0, hasta_u: 100, valor: 1 }];
  let calc = e ? e.calculo : 'tramo_alcanzado';
  let fijoVal = e && e.valor_fijo ? e.valor_fijo : 1;

  const pinta = () => {
    const fijo = calc === 'fijo';
    $('dbody').innerHTML = `
      <div class="fh"><div><h2>${id ? 'Editar esquema' : 'Nuevo esquema'}</h2>
        <div class="sm">Define cómo se calcula la comisión y a quién se aplica</div></div>
        <button class="x" data-cerrar aria-label="Cerrar">✕</button></div>
      <label for="enom">Nombre</label><input id="enom" value="${esc(e ? e.nombre : '')}" placeholder="p. ej. Comercial zona norte">
      <div class="g2">
        <div><label for="eatr">Se cuenta por</label><select id="eatr">
          <option value="comercial" ${e && e.atribucion === 'comercial' ? 'selected' : ''}>Cartera del comercial</option>
          <option value="cierra" ${e && e.atribucion === 'cierra' ? 'selected' : ''}>Ventas que cierra (televenta)</option></select></div>
        <div><label for="ecalc">Cálculo</label><select id="ecalc">
          <option value="tramo_alcanzado" ${calc === 'tramo_alcanzado' ? 'selected' : ''}>Tramo alcanzado a todo el volumen</option>
          <option value="marginal" ${calc === 'marginal' ? 'selected' : ''}>Por tramos (cada unidad a su tramo)</option>
          <option value="fijo" ${calc === 'fijo' ? 'selected' : ''}>Importe fijo por unidad</option></select></div>
      </div>
      <div class="g2">
        <div><label for="ecan">Canal</label><select id="ecan">
          <option value="">Todos</option>
          <option value="paciente" ${e && e.canal === 'paciente' ? 'selected' : ''}>Solo recomendación</option>
          <option value="centro" ${e && e.canal === 'centro' ? 'selected' : ''}>Solo venta a centro</option></select></div>
        ${fijo ? `<div><label for="efijo">Euros por unidad</label><input id="efijo" type="number" step="0.01" min="0" value="${fijoVal}"></div>` : '<div></div>'}
      </div>
      ${fijo ? '' : `<label>Tramos <span class="sm">· deja vacío el "hasta" del último</span></label>
      <div id="etramos">${tramos.map((t, i) => `<div class="g2" style="margin-bottom:8px;grid-template-columns:1fr 1fr 1fr auto">
        <input data-td="${i}" type="number" min="0" value="${t.desde_u}" placeholder="Desde">
        <input data-th="${i}" type="number" min="0" value="${t.hasta_u == null ? '' : t.hasta_u}" placeholder="Hasta">
        <input data-tv="${i}" type="number" step="0.01" min="0" value="${t.valor}" placeholder="€/unidad">
        ${tramos.length > 1 ? `<button type="button" class="btn sec" data-tx="${i}">✕</button>` : ''}</div>`).join('')}</div>
      <div class="acts"><button type="button" class="btn sec" id="etmas">+ Añadir tramo</button></div>`}
      <div class="acts" style="justify-content:flex-end">
        <button class="btn sec" data-cerrar>Cancelar</button>
        <button class="btn" id="eguardaresq">${id ? 'Guardar' : 'Crear esquema'}</button></div>`;

    const leer = () => {
      if (fijo) return;
      tramos = [...$('etramos').children].map((d, i) => ({
        desde_u: +d.querySelector(`[data-td="${i}"]`).value || 0,
        hasta_u: d.querySelector(`[data-th="${i}"]`).value === '' ? null : +d.querySelector(`[data-th="${i}"]`).value,
        valor: +d.querySelector(`[data-tv="${i}"]`).value || 0
      }));
    };
    $('ecalc').onchange = () => { leer(); if ($('efijo')) fijoVal = $('efijo').value; calc = $('ecalc').value; pinta(); };
    if ($('etmas')) $('etmas').onclick = () => {
      leer();
      const ult = tramos[tramos.length - 1];
      tramos.push({ desde_u: (ult.hasta_u || ult.desde_u) + 1, hasta_u: null, valor: ult.valor });
      pinta();
    };
    $('dbody').querySelectorAll('[data-tx]').forEach(b => b.onclick = () => { leer(); tramos.splice(+b.dataset.tx, 1); pinta(); });
    personasEsquema(id);

    $('eguardaresq').onclick = async ev => {
      leer();
      if (!$('enom').value.trim()) { toast('Ponle un nombre', true); return; }
      ev.target.disabled = true; ev.target.textContent = 'Guardando…';
      const { data: r, error } = await db.rpc('guardar_esquema', { p: {
        id: id || null, nombre: $('enom').value.trim(), atribucion: $('eatr').value,
        calculo: calc, canal: $('ecan').value || null,
        valor_fijo: fijo ? $('efijo').value : null,
        ...(fijo ? {} : { tramos })
      }});
      ev.target.disabled = false; ev.target.textContent = id ? 'Guardar' : 'Crear esquema';
      if (error || (r && r.ok === false)) { toast('No se ha podido guardar', true); return; }
      $('dlg').close(); toast('Esquema guardado'); pintarComisiones();
    };
  };
  pinta();
  $('dlg').showModal();
}

/* ---------------- asignar esquema y visibilidad en el editor de usuario ---------------- */

async function panelComisionUsuario(u) {
  if (!ESQUEMAS.length) { const { data } = await db.rpc('esquemas_lista'); ESQUEMAS = data || []; }
  const actual = ESQUEMAS.find(e => (e.personas || []).includes(u.nombre));
  return `<label>Comisión</label>
    <div class="g2">
      <div><label class="sm" for="ucom">Esquema</label><select id="ucom">
        <option value="">Sin comisión</option>
        ${ESQUEMAS.map(e => `<option value="${e.id}" ${actual && actual.id === e.id ? 'selected' : ''}>${esc(e.nombre)}</option>`).join('')}
      </select></div>
      <div><label class="sm" for="uverc">Qué ve esa persona</label><select id="uverc">
        <option value="nada" ${u.comision_ver === 'nada' || !u.comision_ver ? 'selected' : ''}>Nada</option>
        <option value="unidades" ${u.comision_ver === 'unidades' ? 'selected' : ''}>Solo sus unidades</option>
        <option value="importe" ${u.comision_ver === 'importe' ? 'selected' : ''}>Unidades e importe</option>
      </select></div>
    </div>`;
}



/* ============================================================
   DLC OS 2.0 · Entrega 12 · Bloque A: rutas, plan y agenda
   ============================================================ */

let RSEC = 'mis', PROPUESTAS = null;
const PLANCFG = () => Object.assign({ salida: '09:00', visita: 15, tope: '18:00', parada: 10 },
  prefsActivas().plan || {});

/* ---------------- navegador de mapas ---------------- */

const NAVEGADORES = [['google', 'Google Maps'], ['apple', 'Apple Maps'], ['waze', 'Waze']];
const navActual = () => (PERFIL.preferencias || {}).navegador || 'google';

function enlaceNav(destino, paradas) {
  const n = navActual();
  const d = Array.isArray(destino) ? destino.join(',') : destino;
  if (n === 'waze') return 'https://waze.com/ul?ll=' + encodeURIComponent(d) + '&navigate=yes';
  if (n === 'apple') return 'https://maps.apple.com/?daddr=' + encodeURIComponent(d) + '&dirflg=d';
  const wp = paradas && paradas.length ? '&waypoints=' + encodeURIComponent(paradas.map(p => p.join(',')).join('|')) : '';
  return 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(d) + '&travelmode=driving' + wp;
}

async function cambiarNavegador(n) {
  const prefs = Object.assign({}, PERFIL.preferencias || {}, { navegador: n });
  const { data } = await db.rpc('guardar_preferencias', { p: prefs });
  PERFIL.preferencias = data || prefs;
  toast('Navegación con ' + (NAVEGADORES.find(x => x[0] === n) || [])[1]);
  if (PLAN) pintarPlan();
}

const selectorNav = () => `<select id="navsel" title="Navegador de mapas" style="max-width:160px">${
  NAVEGADORES.map(([v, t]) => `<option value="${v}" ${navActual() === v ? 'selected' : ''}>${t}</option>`).join('')}</select>`;

/* ---------------- pantalla de rutas ---------------- */

async function cargarRutas() {
  $('v-rutas').innerHTML = `
    <div class="saludo"><div><h1>Rutas</h1><div class="fecha">Crea, edita y planifica tus rutas</div></div>
      <div class="acts" style="margin:0"><button class="btn" id="rnueva">+ Nueva ruta</button></div></div>
    <div class="subnav">
      <button data-rs="inicio" aria-pressed="${RSEC === 'inicio'}">Resumen</button>
      <button data-rs="mis" aria-pressed="${RSEC === 'mis'}">Mis rutas</button>
      <button data-rs="prop" aria-pressed="${RSEC === 'prop'}">Propuestas automáticas</button>
    </div>
    <div id="rcuerpo"><div class="card"><div class="skel"></div><div class="skel" style="width:60%"></div></div></div>
    <div id="rplan"></div>`;

  $('rnueva').onclick = () => editorRuta(null);
  $('v-rutas').querySelectorAll('[data-rs]').forEach(b => b.onclick = () => { RSEC = b.dataset.rs; cargarRutas(); });

  if (RSEC === 'inicio') await resumenRutas(); else if (RSEC === 'mis') await listaRutas(); else await listaPropuestas();
  if (PLAN) pintarPlan();
}

async function listaRutas() {
  const { data, error } = await db.rpc('rutas_visibles');
  if (error) { $('rcuerpo').innerHTML = `<div class="card"><div class="vacio">No se ha podido cargar: ${esc(error.message)}</div></div>`; return; }
  RUTAS = data || [];
  if (!RUTAS.length) {
    $('rcuerpo').innerHTML = `<div class="card"><div class="vacio">
      Todavía no tienes rutas. Créala con <b>+ Nueva ruta</b>, con una lista de médicos concretos
      o por criterios que se recalculan solos.<br><br>
      También puedes usar las <b>propuestas automáticas</b> de la pestaña de al lado.</div></div>`;
    return;
  }
  $('rcuerpo').innerHTML = `<div class="card"><h2>Mis rutas<span class="n">${RUTAS.length}</span></h2>
    <div class="lista">${RUTAS.map(r => `<div class="item" style="cursor:default">
      <span class="ic ${r.tipo === 'Urgente' ? 'w' : ''}">${r.tipo === 'Urgente' ? '★' : '◉'}</span>
      <span class="tx"><b>${esc(r.nombre)}</b><span class="sm">
        ${r.dinamica ? 'Por criterios' : r.n_fijos + ' médicos'} · ${r.visitados} visitados${r.desde ? ' desde ' + fechaCorta(r.desde) : ''}
        ${r.mia ? '' : ' · de ' + esc(r.duenyo)}</span></span>
      <span class="acts" style="margin:0">
        <button class="btn" data-ruta="${r.id}">Planificar</button>
        <button class="btn sec" data-rver="${r.id}">Ver médicos</button>
        ${r.mia || PERFIL.rol === 'Administrador' ? `<button class="btn sec" data-redit="${r.id}">Editar</button>
          <button class="btn sec" data-rdup="${r.id}">Duplicar</button>
          <button class="btn sec" data-rdel="${r.id}">Eliminar</button>` : ''}</span></div>`).join('')}</div></div>`;

  $('rcuerpo').querySelectorAll('[data-redit]').forEach(b => b.onclick = () => editorRuta(b.dataset.redit));
  $('rcuerpo').querySelectorAll('[data-rver]').forEach(b => b.onclick = () => verMedicosRuta(b.dataset.rver));
  $('rcuerpo').querySelectorAll('[data-rdup]').forEach(b => b.onclick = () => duplicarRuta(b.dataset.rdup));
  $('rcuerpo').querySelectorAll('[data-rdel]').forEach(b => b.onclick = async () => {
    const r = RUTAS.find(x => x.id === b.dataset.rdel);
    if (!await preguntar(`Se elimina "${r.nombre}".\nLos médicos y sus visitas no se borran.`,
      { titulo: '¿Eliminar la ruta?', ok: 'Eliminar', peligro: true })) return;
    await db.rpc('guardar_ruta', { p: { id: r.id, activa: false } });
    toast('Ruta eliminada'); cargarRutas();
  });
}

async function duplicarRuta(id) {
  const r = RUTAS.find(x => x.id === id); if (!r) return;
  const nombre = await pedirTexto('Nombre de la copia', r.nombre + ' (copia)', { titulo: 'Duplicar ruta', ok: 'Duplicar' });
  if (!nombre) return;
  const { error } = await db.rpc('guardar_ruta', { p: {
    nombre, tipo: r.tipo, desde: hoyISO(), nota: r.nota,
    codigos: r.codigos || [], reglas: r.reglas || null, visible_para: r.visible_para || ''
  }});
  if (error) { toast('No se ha podido duplicar: ' + error.message, true); return; }
  toast('Ruta duplicada'); cargarRutas();
}

async function verMedicosRuta(id) {
  const r = RUTAS.find(x => x.id === id);
  $('dbody').innerHTML = '<div class="skel"></div><div class="skel" style="width:60%"></div>';
  $('dlg').showModal();
  const { data } = await db.rpc('medicos_de_ruta', { p_id: id });
  const lista = data || [];
  $('dbody').innerHTML = `
    <div class="fh"><div><h2>${esc(r.nombre)}</h2>
      <div class="sm">${lista.length} médicos · ${r.dinamica ? 'por criterios, se recalcula cada día' : 'lista fija'}</div></div>
      <button class="x" data-cerrar aria-label="Cerrar">✕</button></div>
    <div class="lista">${lista.map(m => `<button class="item" data-mficha="${m.id}">
      <span class="ic ${m.urgente ? 'w' : ''}">${m.urgente ? '!' : '·'}</span>
      <span class="tx"><b>${esc(m.nombre)}</b><span class="sm">${esc(m.especialidad || '')} · ${esc(m.centro_nombre || '')} ${esc(m.municipio || '')}</span></span>
    </button>`).join('') || '<div class="vacio">Ningún médico cumple ahora mismo los criterios.</div>'}</div>
    <div class="acts" style="justify-content:flex-end"><button class="btn" data-ruta="${id}">Planificar hoy</button></div>`;
  $('dbody').querySelectorAll('[data-mficha]').forEach(b => b.onclick = () => { $('dlg').close(); abrirFicha(b.dataset.mficha); });
}

/* ---------------- propuestas automáticas ---------------- */

async function listaPropuestas() {
  const { data, error } = await db.rpc('propuestas_rutas', { lim: 60 });
  if (error) { $('rcuerpo').innerHTML = `<div class="card"><div class="vacio">${esc(error.message)}</div></div>`; return; }
  PROPUESTAS = data;
  const dn = { L: 'lunes', M: 'martes', X: 'miércoles', J: 'jueves', V: 'viernes' }[data.dia] || 'hoy';
  const bloques = [
    ['hoy', '📅', `Pasan consulta ${dn}`, 'Con día de consulta conocido y sin visita reciente'],
    ['pendientes', '⏳', 'Pendientes de rutas anteriores', 'Planificados y no visitados'],
    ['urgentes', '❗', 'Urgentes sin visitar', 'Marcados como urgentes'],
    ['interesados', '🔥', 'Interesados sin visita en 20 días', 'Para no perder el interés'],
    ['sin_visitar', '🆕', 'Sin visitar nunca', 'Primeras visitas, agrupados por zona']
  ].filter(([k]) => (data[k] || []).length);

  $('rcuerpo').innerHTML = bloques.length ? `<div class="card">
    <h2>Propuestas de hoy</h2><p class="sm">Calculadas con tus datos. Planifícalas o guárdalas como ruta.</p>
    <div class="lista">${bloques.map(([k, ic, t, s]) => `<div class="item" style="cursor:default">
      <span class="ic">${ic}</span>
      <span class="tx"><b>${t}</b><span class="sm">${s} · <b>${num(data[k].length)}</b> médicos</span></span>
      <span class="acts" style="margin:0">
        <button class="btn" data-prop="${k}">Planificar</button>
        <button class="btn sec" data-propg="${k}|${esc(t)}">Guardar como ruta</button></span></div>`).join('')}</div></div>`
    : '<div class="card"><div class="vacio">Ahora mismo no hay propuestas: todo al día.</div></div>';

  $('rcuerpo').querySelectorAll('[data-prop]').forEach(b => b.onclick = e => planDesdeLista(PROPUESTAS[b.dataset.prop], b.dataset.prop, e.target));
  $('rcuerpo').querySelectorAll('[data-propg]').forEach(b => b.onclick = async () => {
    const [k, t] = b.dataset.propg.split('|');
    const nombre = await pedirTexto('Nombre de la ruta', t, { titulo: 'Guardar como ruta', ok: 'Guardar' });
    if (!nombre) return;
    const { error } = await db.rpc('guardar_ruta', { p: {
      nombre, tipo: k === 'urgentes' ? 'Urgente' : 'Normal', desde: hoyISO(),
      codigos: PROPUESTAS[k].map(m => m.id), reglas: null
    }});
    if (error) { toast('No se ha podido guardar: ' + error.message, true); return; }
    toast('Guardada como ruta fija'); RSEC = 'mis'; cargarRutas();
  });
}

/* ---------------- editor de ruta ---------------- */

async function editorRuta(id) {
  const r = id ? RUTAS.find(x => x.id === id) : null;
  let modo = r ? (r.dinamica ? 'crit' : 'lista') : 'lista';
  let codigos = r && r.codigos ? r.codigos.slice() : [];
  let medicos = [];
  let busca = '';
  let cab = { nombre: r ? r.nombre : '', tipo: r ? r.tipo : 'Normal', desde: (r && r.desde) || hoyISO() };
  const leerCab = () => { if ($('rn')) cab = { nombre: $('rn').value, tipo: $('rt').value, desde: $('rd').value }; };
  let op = { provincias: [], municipios: [], centros: [], especialidades: [], estados: [] };
  const g = Object.assign({}, (r && r.reglas) || {});

  cargando($('dbody'), 'Abriendo…');
  $('dlg').showModal();

  db.rpc('opciones_filtros', {}).then(({ data }) => { if (data) { op = data; if (modo === 'crit') pinta(); } });
  if (codigos.length) {
    db.rpc('medicos_por_ids', { p_ids: codigos }).then(({ data }) => { medicos = data || []; pinta(); });
  }

  const sel = (lista, v) => '<option value=""></option>' + (lista || []).map(o =>
    `<option ${v === o.v ? 'selected' : ''}>${esc(o.v)}</option>`).join('');

  const pinta = async () => {
    leerCab();
    $('dbody').innerHTML = `
      <div class="fh"><div><h2>${id ? 'Editar ruta' : 'Nueva ruta'}</h2>
        <div class="sm">Una lista fija de médicos, o criterios que se recalculan cada día</div></div>
        <button class="x" data-cerrar aria-label="Cerrar">✕</button></div>
      <label for="rn">Nombre</label><input id="rn" value="${esc(cab.nombre)}" placeholder="p. ej. Urgentes zona alta">
      <div class="g2">
        <div><label for="rt">Tipo</label><select id="rt">
          <option ${cab.tipo !== 'Urgente' ? 'selected' : ''}>Normal</option>
          <option ${cab.tipo === 'Urgente' ? 'selected' : ''}>Urgente</option></select></div>
        <div><label for="rd">Contar visitas desde</label><input id="rd" type="date" value="${esc(cab.desde)}"></div>
      </div>
      <label>Cómo se eligen los médicos</label>
      <div class="subnav" style="margin:6px 0 10px">
        <button type="button" data-rm="lista" aria-pressed="${modo === 'lista'}">Lista de médicos</button>
        <button type="button" data-rm="crit" aria-pressed="${modo === 'crit'}">Por criterios</button></div>

      ${modo === 'lista' ? `
        <div class="chips">${medicos.map(m => `<span class="chip">${esc(m.nombre)}
          <button type="button" data-rq="${m.id}" style="border:0;background:none;color:var(--dang);cursor:pointer;font-weight:700">✕</button></span>`).join('')
          || '<span class="sm">Todavía no has añadido médicos.</span>'}</div>
        <label for="rbusca">Añadir médicos</label>
        <input id="rbusca" value="${esc(busca)}" placeholder="Busca por nombre, centro o municipio" autocomplete="off">
        <div id="rres" class="lista"></div>`
      : `
        <div class="g2">
          <div><label for="cprov">Provincia</label><select id="cprov">${sel(op.provincias, g.provincia)}</select></div>
          <div><label for="cmuni">Municipio</label><select id="cmuni">${sel(op.municipios, g.municipio)}</select></div>
        </div>
        <div class="g2">
          <div><label for="ccen">Centro</label><select id="ccen">${sel(op.centros, g.centro)}</select></div>
          <div><label for="cesp">Especialidad</label><select id="cesp">${sel(op.especialidades, g.especialidad)}</select></div>
        </div>
        <div class="g2">
          <div><label for="cest">Estado comercial</label><select id="cest">${sel(op.estados, g.estado)}</select></div>
          <div><label for="cnav">Navegación de esta ruta</label>${selectorNav()}</div>
        </div>
        <div class="g2">
          <div><label for="csv">Sin visitar hace más de (días)</label><input id="csv" type="number" min="1" max="365" value="${g.sinVisita || ''}"></div>
          <div><label for="cdia">Pasan consulta</label><select id="cdia"><option value=""></option>
            ${DIAS.map(k => `<option value="${k}" ${g.dia === k ? 'selected' : ''}>${DIAN[k]}</option>`).join('')}</select></div>
        </div>
        <label class="opt" style="margin-top:10px"><input type="checkbox" id="curg" ${g.urgentes ? 'checked' : ''}> Solo urgentes</label>
        <div id="rprev" class="sm" style="margin-top:10px"></div>`}

      <div class="acts" style="justify-content:flex-end">
        <button class="btn sec" data-cerrar>Cancelar</button>
        ${modo === 'crit' ? '<button class="btn sec" id="rprob">Ver cuántos cumplen</button>' : ''}
        <button class="btn" id="rguardar">${id ? 'Guardar' : 'Crear ruta'}</button></div>`;

    $('dbody').querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { modo = b.dataset.rm; pinta(); });
    $('dbody').querySelectorAll('[data-rq]').forEach(b => b.onclick = () => {
      codigos = codigos.filter(c => c !== b.dataset.rq);
      medicos = medicos.filter(m => m.id !== b.dataset.rq);
      pinta();
    });

    if (modo === 'lista') {
      let t;
      const buscarMed = async q => {
        if (q.length < 2) { $('rres').innerHTML = ''; return; }
        const { data } = await db.rpc('buscar_medicos', { q, f_provincia: null, f_municipio: null, f_estado: null,
          f_especialidad: null, f_area: null, f_urgentes: false, f_mios: false, f_sin_visitar: false,
          orden: 'nombre', lim: 8, desplaz: 0 });
        const res = (data && data.filas || []).filter(m => !codigos.includes(m.id));
        $('rres').innerHTML = res.map(m => `<button class="item" data-radd='${esc(JSON.stringify({ id: m.id, nombre: m.nombre, especialidad: m.especialidad, centro_nombre: m.centro_nombre, municipio: m.municipio }))}'>
          <span class="ic">+</span><span class="tx"><b>${esc(m.nombre)}</b>
            <span class="sm">${esc(m.especialidad || '')} · ${esc(m.centro_nombre || '')} ${esc(m.municipio || '')}</span></span></button>`).join('')
          || '<div class="vacio">Sin coincidencias.</div>';
        $('rres').querySelectorAll('[data-radd]').forEach(b => b.onclick = () => {
          const m = JSON.parse(b.dataset.radd);
          codigos.push(m.id); medicos.push(m); busca = ''; pinta();
        });
      };
      $('rbusca').oninput = e => { busca = e.target.value; clearTimeout(t); t = setTimeout(() => buscarMed(e.target.value.trim()), 300); };
      if (busca) buscarMed(busca);
    } else {
      const reglas = () => {
        const o = {};
        if ($('cprov').value) o.provincia = $('cprov').value;
        if ($('cmuni').value) o.municipio = $('cmuni').value;
        if ($('cesp').value) o.especialidad = $('cesp').value;
        if ($('ccen') && $('ccen').value) o.centro = $('ccen').value;
        if ($('cest').value) o.estado = $('cest').value;
        if ($('csv').value) o.sinVisita = +$('csv').value;
        if ($('cdia').value) o.dia = $('cdia').value;
        if ($('curg').checked) o.urgentes = true;
        return o;
      };
      $('rprob').onclick = async ev => {
        ev.target.disabled = true;
        const rg = reglas();
        const { data } = await db.rpc('ids_filtrados', {
          f_provincia: rg.provincia || null, f_municipio: rg.municipio || null,
          f_estado: rg.estado || null, f_especialidad: rg.especialidad || null, f_urgentes: !!rg.urgentes });
        ev.target.disabled = false;
        $('rprev').innerHTML = `<b>${num((data || []).length)}</b> médicos cumplen ahora estos criterios${rg.sinVisita ? ', antes de aplicar los días sin visitar' : ''}.`;
      };
      $('dbody').__reglas = reglas;
      if ($('navsel')) $('navsel').onchange = e => cambiarNavegador(e.target.value);
    }

    $('rguardar').onclick = async ev => {
      if (!$('rn').value.trim()) { toast('Ponle un nombre a la ruta', true); return; }
      if (modo === 'lista' && !codigos.length) { toast('Añade al menos un médico', true); return; }
      ev.target.disabled = true; ev.target.textContent = 'Guardando…';
      const { error } = await db.rpc('guardar_ruta', { p: {
        id: id || null, nombre: $('rn').value.trim(), tipo: $('rt').value, desde: $('rd').value,
        visible_para: PERFIL.rol === 'Administrador' ? '*' : '',
        codigos: modo === 'lista' ? codigos : [],
        reglas: modo === 'crit' ? ($('dbody').__reglas ? $('dbody').__reglas() : {}) : null
      }});
      ev.target.disabled = false; ev.target.textContent = id ? 'Guardar' : 'Crear ruta';
      if (error) { toast('No se ha podido guardar: ' + error.message, true); return; }
      $('dlg').close(); toast('Ruta guardada'); RSEC = 'mis'; cargarRutas();
    };
  };
  pinta();
}

/* ---------------- plan del día con horario configurable ---------------- */

async function planDesdeLista(lista, nombre, btn) {
  const conXY = (lista || []).filter(m => m.lat && m.lon);
  if (!conXY.length) { toast('Ninguno de esos médicos tiene ubicación', true); return; }
  construirPlan(conXY, nombre, btn);
}

function construirPlan(conXY, rutaId, btn) {
  const cfg = PLANCFG();
  const salida = salidaUsuario();
  const paradas = {};
  conXY.forEach(m => {
    const k = (m.centro_nombre || 'Consulta') + '|' + (m.municipio || '');
    (paradas[k] = paradas[k] || { centro: m.centro_nombre || 'Consulta privada', municipio: m.municipio,
      dir: m.direccion, xy: [m.lat, m.lon], medicos: [] }).medicos.push(m);
  });

  const t0 = +cfg.salida.slice(0, 2) * 60 + +cfg.salida.slice(3), tope = +cfg.tope.slice(0, 2) * 60 + +cfg.tope.slice(3);
  let pos = [salida.lat, salida.lon], t = t0, libres = Object.values(paradas), orden = [];
  while (libres.length && t < tope && orden.length < 14) {
    libres.sort((a, b) => km(pos, a.xy) - km(pos, b.xy));
    const p = libres.shift();
    const viaje = minutosEntre(pos, p.xy);
    const dura = cfg.parada + cfg.visita * Math.min(p.medicos.length, 8);
    if (t + viaje + dura > tope) break;
    orden.push({ ...p, llegada: t + viaje, fin: t + viaje + dura, viaje });
    t += viaje + dura; pos = p.xy;
  }
  PLAN = { rutaId, salida, paradas: orden, fin: t + minutosEntre(pos, [salida.lat, salida.lon]), fecha: hoyISO() };
  pintarPlan();
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}

function abrirHorarioPlan() {
  const c = PLANCFG();
  $('dbody').innerHTML = `
    <div class="fh"><div><h2>Horario del plan</h2><div class="sm">Se guarda en tus preferencias</div></div>
      <button class="x" data-cerrar aria-label="Cerrar">✕</button></div>
    <div class="g2">
      <div><label for="hsal">Hora de salida</label><input id="hsal" type="time" value="${c.salida}"></div>
      <div><label for="htop">Vuelta como tarde</label><input id="htop" type="time" value="${c.tope}"></div>
    </div>
    <div class="g2">
      <div><label for="hvis">Minutos por médico</label><input id="hvis" type="number" min="5" max="60" value="${c.visita}"></div>
      <div><label for="hpar">Minutos fijos por parada</label><input id="hpar" type="number" min="0" max="40" value="${c.parada}"></div>
    </div>
    <div class="acts" style="justify-content:flex-end">
      <button class="btn sec" data-cerrar>Cancelar</button>
      <button class="btn" id="hok">Guardar y recalcular</button></div>`;
  $('hok').onclick = async ev => {
    ev.target.disabled = true;
    const plan = { salida: $('hsal').value, tope: $('htop').value, visita: +$('hvis').value || 15, parada: +$('hpar').value || 10 };
    const prefs = Object.assign({}, PERFIL.preferencias || {}, { plan });
    const { data } = await db.rpc('guardar_preferencias', { p: prefs });
    PERFIL.preferencias = data || prefs;
    $('dlg').close(); toast('Horario guardado');
    if (ULTIMO_PLAN) construirPlan(ULTIMO_PLAN.conXY, ULTIMO_PLAN.rutaId, null, ULTIMO_PLAN.opts);
    else if (PLAN && PLAN.rutaId) {
      if (typeof PLAN.rutaId === 'string' && PROPUESTAS && PROPUESTAS[PLAN.rutaId]) planDesdeLista(PROPUESTAS[PLAN.rutaId], PLAN.rutaId);
      else planificar(PLAN.rutaId, $('rnueva') || document.createElement('button'));
    }
  };
  $('dlg').showModal();
}



/* ============================================================
   DLC OS 2.0 · Entrega 13 · Bloque B: ficha, seguimiento y agenda
   ============================================================ */

let CERCA = null;

/* ---------------- editar y borrar visitas ---------------- */

async function editarVisita(v, medicoId) {
  const pos = CAT.RESULTADO.filter(r => r.extra !== 'neg'), neg = CAT.RESULTADO.filter(r => r.extra === 'neg');
  const marcados = v.resultados || [];
  $('dbody').innerHTML = `
    <div class="fh"><div><h2>Editar visita</h2><div class="sm">Registrada el ${fechaCorta(v.fecha)}</div></div>
      <button class="x" data-cerrar aria-label="Cerrar">✕</button></div>
    <div class="g2">
      <div><label for="evf">Fecha</label><input id="evf" type="date" value="${esc(v.fecha)}"></div>
      <div><label for="evm">Muestras</label><input id="evm" type="number" min="0" value="${v.muestras || 0}"></div>
    </div>
    <label>Resultado</label>
    <div class="opciones">${pos.map(r => `<button type="button" class="opt" data-res="${esc(r.valor)}"
      aria-pressed="${marcados.includes(r.valor)}"><span class="mk"></span>${esc(r.valor)}</button>`).join('')}</div>
    <div class="opciones" style="margin-top:8px">${neg.map(r => `<button type="button" class="opt neg" data-res="${esc(r.valor)}" data-neg="1"
      aria-pressed="${marcados.includes(r.valor)}"><span class="mk"></span>${esc(r.valor)}</button>`).join('')}</div>
    <div class="g2" style="margin-top:6px">
      <div><label for="evpa">Próxima acción</label><input id="evpa" value="${esc(v.proxima_accion || '')}"></div>
      <div><label for="evpf">Fecha</label><input id="evpf" type="date" value="${esc(v.proxima_fecha || '')}"></div>
    </div>
    <label for="evn">Nota</label><textarea id="evn" rows="3">${esc(v.nota || '')}</textarea>
    <div class="acts" style="justify-content:space-between">
      <button class="btn sec dang" id="evborrar">Borrar visita</button>
      <span class="acts" style="margin:0"><button class="btn sec" data-cerrar>Cancelar</button>
        <button class="btn" id="evok">Guardar</button></span></div>`;

  $('dbody').querySelectorAll('[data-res]').forEach(b => b.onclick = () => {
    const esNeg = b.dataset.neg === '1', on = b.getAttribute('aria-pressed') === 'true';
    $('dbody').querySelectorAll('[data-res]').forEach(x => { if (esNeg || x.dataset.neg === '1') x.setAttribute('aria-pressed', 'false'); });
    b.setAttribute('aria-pressed', String(!on));
  });

  $('evok').onclick = async ev => {
    const res = [...$('dbody').querySelectorAll('[data-res][aria-pressed=true]')].map(b => b.dataset.res);
    ev.target.disabled = true; ev.target.textContent = 'Guardando…';
    const { data: r, error } = await db.rpc('actualizar_visita', { p: {
      id: v.id, fecha: $('evf').value, resultados: res, muestras: +$('evm').value || 0,
      nota: $('evn').value.trim(), proxima_accion: $('evpa').value.trim(), proxima_fecha: $('evpf').value || ''
    }});
    ev.target.disabled = false; ev.target.textContent = 'Guardar';
    if (error || (r && r.ok === false)) { toast('No se ha podido guardar', true); return; }
    $('dlg').close(); toast('Visita actualizada'); abrirFicha(medicoId); cargarInicio();
  };

  $('evborrar').onclick = async () => {
    if (!await preguntar('La visita desaparece del historial del médico.\nQueda constancia en la auditoría.',
      { titulo: '¿Borrar la visita?', ok: 'Borrar', peligro: true })) return;
    const { data: r, error } = await db.rpc('borrar_visita', { p_id: v.id });
    if (error || (r && r.ok === false)) { toast('No se ha podido borrar', true); return; }
    $('dlg').close(); toast('Visita borrada'); abrirFicha(medicoId); cargarInicio();
  };
  $('dlg').showModal();
}

/* ---------------- cerca de mí ---------------- */

async function cercaDeMi(btn) {
  if (!navigator.geolocation) { toast('Este dispositivo no tiene ubicación', true); return; }
  btn.disabled = true; btn.textContent = 'Localizando…';
  navigator.geolocation.getCurrentPosition(async p => {
    const { data, error } = await db.rpc('medicos_cerca', {
      p_lat: p.coords.latitude, p_lon: p.coords.longitude, p_km: 10, lim: 100
    });
    btn.disabled = false; btn.textContent = 'Cerca de mí';
    if (error) { toast('No se ha podido buscar: ' + error.message, true); return; }
    CERCA = { lista: data || [], pos: [p.coords.latitude, p.coords.longitude] };
    pintarCerca();
  }, () => {
    btn.disabled = false; btn.textContent = 'Cerca de mí';
    toast('No se ha podido obtener tu ubicación. Revisa los permisos del navegador.', true);
  }, { enableHighAccuracy: true, timeout: 15000 });
}

function pintarCerca() {
  const l = CERCA.lista;
  $('thead').innerHTML = '';
  $('cuenta').innerHTML = `<b>${num(l.length)}</b> ${l.length === 1 ? 'médico' : 'médicos'} a menos de 10 km de ti
    <button class="kcfg" id="cercacerrar" style="margin-left:10px">Volver a la búsqueda</button>`;
  $('lista').innerHTML = l.length ? l.map(m => `<button class="trow" data-id="${m.id}" style="padding:10px 14px;gap:12px">
      <span class="tcell" style="width:70px;min-width:70px"><b style="color:var(--navy)">${m.km} km</b></span>
      <span class="tcell" style="flex:1;width:auto">
        <span class="nm">${m.urgente ? '<span class="pill p-urg">Urgente</span> ' : ''}${esc(m.nombre)}</span>
        <span class="sm">${esc(m.especialidad || '')} · ${esc(m.centro_nombre || '')} ${esc(m.municipio || '')}</span></span>
      <span class="tcell" style="width:140px;min-width:140px"><span class="pill p-est">${esc(m.estado_comercial)}</span></span>
    </button>`).join('') : '<div class="vacio">No hay médicos con ubicación a menos de 10 km.</div>';
  $('mas').classList.add('hide');
  $('cercacerrar').onclick = () => { CERCA = null; buscar(true); };
}

/* ---------------- agenda: crear cita, hora y mes ---------------- */

async function nuevaCita(medicoId, fecha) {
  let m = null;
  if (medicoId) {
    const { data } = await db.rpc('ficha_medico', { p_id: medicoId });
    m = data && data.medico;
  }
  $('dbody').innerHTML = `
    <div class="fh"><div><h2>Nueva cita</h2><div class="sm">Se añade a tu agenda</div></div>
      <button class="x" data-cerrar aria-label="Cerrar">✕</button></div>
    <label for="ncm">Médico</label>
    <input id="ncm" value="${esc(m ? m.nombre : '')}" placeholder="Busca por nombre, centro o municipio">
    <div id="nccand" class="lista"></div>
    <div class="g2">
      <div><label for="ncf">Día</label><input id="ncf" type="date" value="${esc(fecha || hoyISO())}"></div>
      <div><label for="nch">Hora</label><input id="nch" type="time"></div>
    </div>
    <label for="ncn">Nota</label><input id="ncn" placeholder="p. ej. llevar reporting">
    <div class="acts" style="justify-content:flex-end">
      <button class="btn sec" data-cerrar>Cancelar</button>
      <button class="btn" id="ncok">Añadir a la agenda</button></div>`;

  let elegido = m ? { id: m.id, nombre: m.nombre } : null;
  let t;
  $('ncm').oninput = e => {
    elegido = null;
    clearTimeout(t);
    t = setTimeout(async () => {
      const q = e.target.value.trim();
      if (q.length < 2) { $('nccand').innerHTML = ''; return; }
      const { data } = await db.rpc('buscar_medicos', { q, f_provincia: null, f_municipio: null, f_estado: null,
        f_especialidad: null, f_area: null, f_urgentes: false, f_mios: false, f_sin_visitar: false,
        orden: 'nombre', lim: 6, desplaz: 0 });
      const res = (data && data.filas) || [];
      $('nccand').innerHTML = res.map(x => `<button class="item" data-nc='${esc(JSON.stringify({ id: x.id, nombre: x.nombre, centro: x.centro_nombre }))}'>
        <span class="ic">+</span><span class="tx"><b>${esc(x.nombre)}</b>
          <span class="sm">${esc(x.especialidad || '')} · ${esc(x.centro_nombre || '')} ${esc(x.municipio || '')}</span></span></button>`).join('')
        || '<div class="vacio">Sin coincidencias.</div>';
      $('nccand').querySelectorAll('[data-nc]').forEach(b => b.onclick = () => {
        elegido = JSON.parse(b.dataset.nc);
        $('ncm').value = elegido.nombre; $('nccand').innerHTML = '';
      });
    }, 300);
  };

  $('ncok').onclick = async ev => {
    if (!elegido) { toast('Elige un médico de la lista', true); return; }
    ev.target.disabled = true;
    const r = await escribir('guardar_cita', { p: {
      medico_id: elegido.id, fecha: $('ncf').value, hora: $('nch').value || null,
      centro_nombre: elegido.centro || null, estado: 'Planificada', origen: 'Agenda',
      nota: $('ncn').value.trim(), op_id: 'c-' + elegido.id + '-' + $('ncf').value + '-' + Date.now()
    }});
    ev.target.disabled = false;
    if (r.error) { toast('No se ha podido: ' + r.error.message, true); return; }
    $('dlg').close(); toast('Cita añadida'); cargarAgenda(); cargarInicio();
  };
  $('dlg').showModal();
}

async function cambiarHoraCita(id, hora) {
  const h = await appVentana({ titulo: 'Hora de la cita', ok: 'Guardar', campo: { valor: hora || '', tipo: 'time' } });
  if (h === null) return;
  const { error } = await db.from('agenda').update({ hora: h || null }).eq('id', id);
  if (error) { toast('No se ha podido: ' + error.message, true); return; }
  toast('Hora actualizada'); cargarAgenda();
}

async function pintarMesAgenda(mes) {
  const { data } = await db.rpc('agenda_mes', { p_mes: mes, p_usuario: agUsuarioFiltro() });
  const porDia = {};
  (data || []).forEach(d => porDia[d.fecha] = d);
  const primero = new Date(mes + '-01T00:00:00');
  const dias = new Date(primero.getFullYear(), primero.getMonth() + 1, 0).getDate();
  const hueco = (primero.getDay() + 6) % 7;

  $('agcuerpo').innerHTML = `<h2 style="padding:14px 16px 0">${periodoTxt(mes)}</h2>
    <div class="mes">
      ${['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => `<span class="mesdow">${d}</span>`).join('')}
      ${Array.from({ length: hueco }, () => '<span></span>').join('')}
      ${Array.from({ length: dias }, (_, i) => {
        const f = mes + '-' + String(i + 1).padStart(2, '0');
        const d = porDia[f];
        return `<button class="mesdia ${f === hoyISO() ? 'hoy' : ''}" data-mesdia="${f}">
          <b>${i + 1}</b>${d ? `<span class="mespunto">${d.visitadas}/${d.citas}</span>` : ''}</button>`;
      }).join('')}
    </div>`;
  $('agcuerpo').querySelectorAll('[data-mesdia]').forEach(b => b.onclick = () => {
    AG_FECHA = b.dataset.mesdia; AG_MODO = 'dia'; cargarAgenda();
  });
  $('agpend').innerHTML = '';
}



/* ============================================================
   DLC OS 2.0 · Entrega 14 · Bloque C
   ============================================================ */

/* ---------------- spinner y descargas ---------------- */

const cargando = (el, texto) => { if (el) el.innerHTML =
  `<div class="cargador"><span class="spin"></span><span class="sm">${esc(texto || 'Cargando…')}</span></div>`; };

function menuDescarga(id, opciones) {
  return `<div class="dl-wrap"><button class="btn sec dl-btn" data-dl="${id}" title="Descargar">⭳</button>
    <div class="dl-menu hide" id="dlm-${id}">${opciones.map(o =>
      `<button data-dlo="${id}|${o.k}"><span>${o.ico}</span>${esc(o.t)}</button>`).join('')}</div></div>`;
}

document.addEventListener('click', e => {
  const o = e.target.closest('[data-dlo]');
  if (o) {
    const [id, fmt] = o.dataset.dlo.split('|');
    document.querySelectorAll('.dl-menu').forEach(m => m.classList.add('hide'));
    if (id === 'seg' && window.__dlSeg) window.__dlSeg(fmt);
    if (id === 'an' && window.__dlAn) window.__dlAn(fmt);
    if (id === 'dir' && window.__dlDir) window.__dlDir(fmt);
    return;
  }
  const b = e.target.closest('[data-dl]');
  document.querySelectorAll('.dl-menu').forEach(m => { if (!b || m.id !== 'dlm-' + b.dataset.dl) m.classList.add('hide'); });
  if (b) $('dlm-' + b.dataset.dl).classList.toggle('hide');
});

function aXLS(filas, titulo) {
  if (!filas.length) return '';
  const cols = Object.keys(filas[0]);
  const tr = f => '<tr>' + cols.map(c => `<td>${String(f[c] == null ? '' : f[c]).replace(/[<>&]/g, '')}</td>`).join('') + '</tr>';
  return `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body>
    <table border="1"><thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead>
    <tbody>${filas.map(tr).join('')}</tbody></table></body></html>`;
}

function descargar(filas, nombre, formato) {
  if (!filas || !filas.length) { toast('No hay nada que descargar', true); return; }
  const esXls = formato === 'xls';
  const cont = esXls ? aXLS(filas, nombre) : aCSV(filas);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([cont], { type: esXls ? 'application/vnd.ms-excel' : 'text/csv;charset=utf-8' }));
  a.download = nombre + '_' + hoyISO() + (esXls ? '.xls' : '.csv');
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast(`${num(filas.length)} ${filas.length === 1 ? 'fila descargada' : 'filas descargadas'}`);
}

/* ---------------- buscador global agrupado ---------------- */

let TGLOB, GPIDE = 0;
$('q').addEventListener('input', e => {
  clearTimeout(TGLOB);
  const q = e.target.value.trim();
  const caja = e.target.closest('.gsearch');
  if (q.length < 2) { $('gsug').classList.add('hide'); caja.classList.remove('buscando'); return; }
  caja.classList.add('buscando');
  $('gsug').innerHTML = '<div class="gload"><span class="spin"></span>Buscando…</div>';
  $('gsug').classList.remove('hide');
  const pide = ++GPIDE;
  TGLOB = setTimeout(async () => {
    const { data } = await db.rpc('buscar_global', { q, lim: 6 });
    if (pide !== GPIDE) return;            // ya hay una búsqueda más nueva
    caja.classList.remove('buscando');
    if (!data) { $('gsug').innerHTML = '<div class="gload">No se ha podido buscar. Revisa la conexión.</div>'; return; }
    const m = data.municipios || [], c = data.centros || [], me = data.medicos || [];
    if (!m.length && !c.length && !me.length) { $('gsug').innerHTML = `<div class="gload">Sin resultados para «${esc(q)}».</div>`; return; }
    $('gsug').innerHTML =
      (m.length ? `<div class="gsh">Municipios</div>` + m.map(x => `<button data-gm="${esc(x.valor)}">
        <span class="gic">📍</span><span><b>${esc(x.valor)}</b><span class="sm">${num(x.n)} médicos</span></span></button>`).join('') : '') +
      (c.length ? `<div class="gsh">Centros</div>` + c.map(x => `<button data-gc="${esc(x.valor)}">
        <span class="gic">🏥</span><span><b>${esc(x.valor)}</b><span class="sm">${esc(x.municipio || '')} · ${num(x.n)} médicos</span></span></button>`).join('') : '') +
      (me.length ? `<div class="gsh">Médicos${m.length || c.length ? ' que pasan consulta allí o coinciden' : ''}</div>` + me.map(x => `<button data-gme="${x.id}">
        <span class="gic">${x.urgente ? '❗' : '👤'}</span><span><b>${esc(x.nombre)}</b>
        <span class="sm">${esc(x.especialidad || '')} · ${esc(x.centro_nombre || '')} ${esc(x.municipio || '')}</span></span></button>`).join('') : '');
    $('gsug').classList.remove('hide');
  }, 250);
});

document.addEventListener('click', e => {
  if (!e.target.closest('.gsearch')) $('gsug').classList.add('hide');
  const gm = e.target.closest('[data-gm]'), gc = e.target.closest('[data-gc]'), gme = e.target.closest('[data-gme]');
  if (gm || gc) {
    Object.assign(F, { q: '', prov: '', muni: '', esp: '', est: '', urg: false, pagina: 0 });
    if (gm) { F.muni = gm.dataset.gm; if ($('fmuni')) $('fmuni').value = F.muni; }
    if (gc) { F.q = gc.dataset.gc; }
    $('q').value = ''; $('gsug').classList.add('hide');
    ir('directorio'); buscar(true);
  }
  if (gme) { $('gsug').classList.add('hide'); $('q').value = ''; abrirFicha(gme.dataset.gme); }
});

/* ---------------- ventas: detalle, edición y anulación ---------------- */

async function verPedido(id) {
  cargando($('dbody'), 'Abriendo el pedido…');
  $('dlg').showModal();
  const { data, error } = await db.rpc('pedido_detalle', { p_id: id });
  if (error) { $('dbody').innerHTML = `<div class="vacio">${esc(error.message)}</div>`; return; }
  const p = data.pedido, l = data.lineas || [], c = data.contacto;
  const uds = l.reduce((n, x) => n + x.unidades, 0);
  const imp = l.reduce((n, x) => n + (+x.importe || 0), 0);

  $('dbody').innerHTML = `
    <div class="fh"><div><h2>Pedido ${esc(p.numero || '')}</h2>
      <div class="sm">${fechaCorta(p.fecha)} · ${p.canal === 'centro' ? 'Venta a centro' : 'Recomendación'} · ${esc(p.estado)}</div></div>
      <button class="x" data-cerrar aria-label="Cerrar">✕</button></div>
    ${c ? `<div class="blk"><h3>Contacto</h3><div><b>${esc(c.nombre)}</b></div>
      <div class="sm">${esc(c.telefono || '')} ${esc(c.email || '')}</div>
      <div class="acts"><button class="btn sec" data-contacto="${c.id}">Ver historial del contacto</button></div></div>` : ''}
    <div class="blk"><h3>Líneas</h3>
      ${l.map(x => `<div style="display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-top:1px solid var(--line)">
        <span><b>${esc(x.producto || 'Sin producto')}</b>
          <div class="sm">${x.medico ? 'Médico: ' + esc(x.medico) : 'Sin atribuir'}${x.comercial ? ' · ' + esc(x.comercial) : ''}</div></span>
        <span style="text-align:right"><b>${num(x.unidades)}</b> uds.${x.importe ? `<div class="sm">${eur(x.importe)}</div>` : ''}</span>
      </div>`).join('') || '<div class="sm">Sin líneas.</div>'}
      <div style="display:flex;justify-content:space-between;padding-top:8px;border-top:2px solid var(--line);margin-top:6px">
        <b>Total</b><b>${num(uds)} uds.${imp ? ' · ' + eur(imp) : ''}</b></div></div>
    ${p.nota ? `<div class="blk"><h3>Nota</h3><div>${esc(p.nota)}</div></div>` : ''}
    <div class="acts" style="justify-content:flex-end">
      ${p.estado !== 'Anulado' && puedeVentas() ? `<button class="btn sec dang" id="pdanular">Anular pedido</button>
        <button class="btn sec" id="pdeditar">Editar</button>` : ''}
      <button class="btn sec" data-cerrar>Cerrar</button></div>`;

  const ct = $('dbody').querySelector('[data-contacto]');
  if (ct) ct.onclick = () => verContacto(ct.dataset.contacto);
  if ($('pdanular')) $('pdanular').onclick = async () => {
    const motivo = await pedirTexto('Motivo de la anulación (opcional)', '', { titulo: '¿Anular el pedido?', ok: 'Anular' });
    if (motivo === null) return;
    const { data: r } = await db.rpc('anular_pedido', { p_id: id, p_motivo: motivo || null });
    if (r && r.ok === false) { toast('No se ha podido anular', true); return; }
    $('dlg').close(); toast('Pedido anulado'); listaPedidos(); pintarSinAtribuir();
  };
  if ($('pdeditar')) $('pdeditar').onclick = () => editorPedido(data);
}

async function verContacto(id) {
  cargando($('dbody'), 'Cargando el contacto…');
  $('dlg').showModal();
  const { data } = await db.rpc('contacto_detalle', { p_id: id });
  if (!data || !data.contacto) { $('dbody').innerHTML = '<div class="vacio">No se ha encontrado.</div>'; return; }
  const c = data.contacto, ped = data.pedidos || [];
  $('dbody').innerHTML = `
    <div class="fh"><div><h2>${esc(c.nombre)}</h2>
      <div class="sm">${esc(c.telefono || '')} ${esc(c.email || '')} ${esc(c.municipio || '')}</div></div>
      <button class="x" data-cerrar aria-label="Cerrar">✕</button></div>
    <div class="kpis" style="margin:10px 0">
      <div class="kpi"><b>${num(ped.length)}</b><span>pedidos</span></div>
      <div class="kpi"><b>${num(data.total_unidades)}</b><span>unidades compradas</span></div></div>
    <div class="blk"><h3>Historial</h3>
      ${ped.map(p => `<div style="display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-top:1px solid var(--line)">
        <span><b>${fechaCorta(p.fecha)}</b> ${esc(p.productos || '')}
          <div class="sm">${p.medico ? 'Recomendado por ' + esc(p.medico) : 'Sin médico'} · ${esc(p.estado)}</div></span>
        <b>${num(p.unidades)} uds.</b></div>`).join('') || '<div class="sm">Sin pedidos.</div>'}</div>`;
}

/* ---------------- analítica en tabla ---------------- */

async function pintarTablaAnalitica() {
  const caja = $('atabla2');
  cargando(caja, 'Calculando la tabla…');
  const { data, error } = await db.rpc('analitica_tabla', {
    p_dim: $('adim').value === 'mes' ? 'producto' : $('adim').value,
    p_desde: $('adesde').value || null, p_hasta: $('ahasta').value || null,
    p_canal: $('acanal').value || null, p_medida: $('amedida') ? $('amedida').value : 'unidades', lim: 30
  });
  if (error) { caja.innerHTML = `<div class="vacio">${esc(error.message)}</div>`; return; }
  const meses = data.meses || [], filas = data.filas || [];
  if (!filas.length) { caja.innerHTML = '<div class="vacio">Sin datos en este periodo.</div>'; return; }
  const fmt = v => data.medida === 'importe' ? eur(v) : num(v);
  const totMes = {};
  filas.forEach(f => meses.forEach(m => totMes[m] = (totMes[m] || 0) + (+(f.meses || {})[m] || 0)));

  caja.innerHTML = `<div class="tabla"><div style="min-width:${180 + meses.length * 110}px">
    <div class="thead"><span class="tcell th" style="width:220px;min-width:220px">Concepto</span>
      ${meses.map(m => `<span class="tcell th" style="width:110px;min-width:110px;text-align:right">${esc(m.slice(5))}/${esc(m.slice(2, 4))}</span>`).join('')}
      <span class="tcell th" style="width:120px;min-width:120px;text-align:right">Total</span></div>
    ${filas.map(f => `<div class="trow" style="cursor:default">
      <span class="tcell" style="width:220px;min-width:220px"><b>${esc(f.nombre)}</b></span>
      ${meses.map(m => `<span class="tcell" style="width:110px;min-width:110px;text-align:right">${
        (f.meses || {})[m] ? fmt((f.meses || {})[m]) : '<span class="sm">·</span>'}</span>`).join('')}
      <span class="tcell" style="width:120px;min-width:120px;text-align:right"><b>${fmt(f.total)}</b></span></div>`).join('')}
    <div class="trow" data-fijo style="cursor:default;background:var(--bg)">
      <span class="tcell" style="width:220px;min-width:220px"><b>Total</b></span>
      ${meses.map(m => `<span class="tcell" style="width:110px;min-width:110px;text-align:right"><b>${fmt(totMes[m] || 0)}</b></span>`).join('')}
      <span class="tcell" style="width:120px;min-width:120px;text-align:right"><b>${fmt(filas.reduce((n, f) => n + (+f.total || 0), 0))}</b></span></div>
  </div></div>`;

  window.__ANTABLA = filas.map(f => {
    const o = { concepto: f.nombre };
    meses.forEach(m => o[m] = (f.meses || {})[m] || 0);
    o.total = f.total;
    return o;
  });
}



/* ============================================================
   DLC OS 2.0 · Entrega 15 · Bloque F
   ============================================================ */

/* ---------------- panel lateral de herramientas ---------------- */

let HERR_CTX = null;
function abrirHerramientas(contexto) {
  const d = $('tools');
  if (d.classList.contains('abierto') && HERR_CTX === contexto) { d.classList.remove('abierto'); return; }
  HERR_CTX = contexto;
  const filtrosDir = `
    <h3>Filtros</h3>
    <label>Provincia</label><select data-tf="prov">${optFiltro(OPF.provincias, F.prov, 'Todas las provincias')}</select>
    <label>Municipio</label><select data-tf="muni">${optFiltro(OPF.municipios, F.muni, 'Todos los municipios')}</select>
    <label>Especialidad</label><select data-tf="esp">${optFiltro(OPF.especialidades, F.esp, 'Todas las especialidades')}</select>
    <label>Estado comercial</label><select data-tf="est">${optFiltro(OPF.estados, F.est, 'Todos los estados')}</select>
    <label>Ordenar por</label><select data-tf="orden">
      <option value="nombre" ${F.orden === 'nombre' ? 'selected' : ''}>Nombre</option>
      <option value="urgentes" ${F.orden === 'urgentes' ? 'selected' : ''}>Urgentes primero</option>
      <option value="reciente" ${F.orden === 'reciente' ? 'selected' : ''}>Visita más reciente</option></select>
    <div class="acts"><button class="btn sec" id="tlimpiar">Limpiar filtros</button></div>
    <h3 style="margin-top:18px">Columnas</h3>
    <p class="sm">Arrastra el borde de cada cabecera para cambiar su ancho.</p>
    <div class="acts"><button class="btn sec" id="tcols">Elegir columnas</button></div>`;

  d.innerHTML = `<div class="tbox">
    <div class="fh"><h2>Herramientas</h2><button class="x" id="tclose" aria-label="Cerrar">✕</button></div>
    ${contexto === 'directorio' ? filtrosDir : ''}
  </div>`;
  d.classList.add('abierto');

  $('tclose').onclick = () => d.classList.remove('abierto');
  d.querySelectorAll('[data-tf]').forEach(s => s.onchange = () => {
    const k = s.dataset.tf;
    if (k === 'prov') { F.prov = s.value; F.muni = ''; cargarFiltros(); }
    else F[k] = s.value;
    buscar(true);
  });
  if ($('tlimpiar')) $('tlimpiar').onclick = () => {
    Object.assign(F, { q: '', prov: '', muni: '', esp: '', est: '', urg: false, orden: 'nombre', com: '' });
    if ($('fcom')) $('fcom').value = '';
    $('q').value = ''; buscar(true); d.classList.remove('abierto');
  };
  if ($('tcols')) $('tcols').onclick = () => { d.classList.remove('abierto'); abrirColumnas(); };
  d.querySelectorAll('[data-tdl]').forEach(b => b.onclick = () => {
    const fmt = b.dataset.tdl;
    d.classList.remove('abierto');
    if (contexto === 'directorio' && window.__dlDir) window.__dlDir(fmt);
    if (contexto === 'seguimiento' && window.__dlSeg) window.__dlSeg(fmt);
    if (contexto === 'analitica' && window.__dlAn) window.__dlAn(fmt);
  });
}

let OPF = { provincias: [], municipios: [], especialidades: [], estados: [], centros: [] };
const optFiltro = (lista, v, todo) => `<option value="">${todo}</option>` +
  (lista || []).map(o => `<option ${v === o.v ? 'selected' : ''}>${esc(o.v)} (${o.n})</option>`).join('');

/* ---------------- contactos: alta completa y buscador ---------------- */

function editorContacto(c, alGuardar) {
  c = c || {};
  $('dlg2body').innerHTML = `
    <div class="fh"><div><h2>${c.id ? 'Editar contacto' : 'Nuevo contacto'}</h2>
      <div class="sm">Datos de envío y facturación, como en un pedido normal</div></div>
      <button class="x" data-cerrar2 aria-label="Cerrar">✕</button></div>
    <div class="g2">
      <div><label for="konom">Nombre</label><input id="konom" value="${esc(c.nombre || '')}"></div>
      <div><label for="konif">NIF</label><input id="konif" value="${esc(c.nif || '')}"></div>
    </div>
    <label>Este contacto es…</label>
    <div class="subnav" style="margin:6px 0 10px"><button type="button" data-ktipo="Persona" aria-pressed="${(c.tipo || 'Persona') === 'Persona'}">Persona</button>
      <button type="button" data-ktipo="Empresa" aria-pressed="${c.tipo === 'Empresa'}">Empresa</button></div>
    <div class="g2">
      <div><label for="kodir">Dirección</label><input id="kodir" value="${esc(c.direccion || '')}"></div>
      <div><label for="kocp">Código postal</label><input id="kocp" value="${esc(c.cp || '')}"></div>
    </div>
    <div class="g2">
      <div><label for="komun">Población</label><input id="komun" value="${esc(c.municipio || '')}"></div>
      <div><label for="kopro">Provincia</label><input id="kopro" value="${esc(c.provincia || '')}"></div>
    </div>
    <div class="g2">
      <div><label for="kotel">Teléfono</label><input id="kotel" value="${esc(c.telefono || '')}" inputmode="tel"></div>
      <div><label for="komov">Móvil</label><input id="komov" value="${esc(c.movil || '')}" inputmode="tel"></div>
    </div>
    <div class="g2">
      <div><label for="komail">Email</label><input id="komail" type="email" value="${esc(c.email || '')}"></div>
      <div><label for="koemp">Empresa</label><input id="koemp" value="${esc(c.empresa || '')}"></div>
    </div>
    <label for="konota">Nota</label><input id="konota" value="${esc(c.nota || '')}">
    <div class="acts" style="justify-content:flex-end">
      <button class="btn sec" data-cerrar2>Cancelar</button>
      <button class="btn" id="kook">${c.id ? 'Guardar' : 'Crear contacto'}</button></div>`;

  let tipo = c.tipo || 'Persona';
  $('dlg2body').querySelectorAll('[data-ktipo]').forEach(b => b.onclick = () => {
    tipo = b.dataset.ktipo;
    $('dlg2body').querySelectorAll('[data-ktipo]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  });

  $('kook').onclick = async ev => {
    if (!$('konom').value.trim()) { toast('Escribe el nombre', true); return; }
    ev.target.disabled = true; ev.target.textContent = 'Guardando…';
    const { data: r, error } = await db.rpc('guardar_contacto', { p: {
      id: c.id || null, nombre: $('konom').value.trim(), nif: $('konif').value.trim(), tipo,
      direccion: $('kodir').value.trim(), cp: $('kocp').value.trim(), municipio: $('komun').value.trim(),
      provincia: $('kopro').value.trim(), telefono: $('kotel').value.trim(), movil: $('komov').value.trim(),
      email: $('komail').value.trim(), empresa: $('koemp').value.trim(), nota: $('konota').value.trim()
    }});
    ev.target.disabled = false; ev.target.textContent = c.id ? 'Guardar' : 'Crear contacto';
    if (error || (r && r.ok === false)) { toast('No se ha podido guardar', true); return; }
    $('dlg2').close(); toast('Contacto guardado');
    if (alGuardar) alGuardar(r.contacto);
  };
  $('dlg2').showModal();
}

/* ---------------- clasificadores por grupos ---------------- */

let CATS_ABIERTOS = {};

async function pintarCatalogos() {
  cargando($('cfgcuerpo'), 'Cargando los clasificadores…');
  const { data } = await db.rpc('catalogos_todos');
  CATS = data || [];
  const puedeEditar = PERFIL.rol === 'Administrador' || ((PERFIL.areas || {}).K || 0) >= 2;
  const completo = PERFIL.rol === 'Administrador' || ((PERFIL.areas || {}).K || 0) >= 3;

  const grupos = {};
  CATS.forEach(c => (grupos[c.grupo || 'General'] = grupos[c.grupo || 'General'] || []).push(c));

  $('cfgcuerpo').innerHTML = `
    <div class="dayhead2"><p class="sm">Listas que usan todos los usuarios en fichas, visitas, pedidos y filtros.
      ${puedeEditar ? '' : '<b>Tienes permiso de solo lectura.</b>'}</p>
      ${completo ? '<button class="btn" id="cnuevo">+ Nuevo clasificador</button>' : ''}</div>
    ${Object.entries(grupos).map(([g, lista]) => `
      <div class="grupo">
        <button class="grupoh" data-grupo="${esc(g)}">
          <span>${CATS_ABIERTOS[g] === false ? '▸' : '▾'} <b>${esc(g)}</b>
            <span class="sm">${lista.length} ${lista.length === 1 ? 'clasificador' : 'clasificadores'}</span></span></button>
        <div class="grupoc ${CATS_ABIERTOS[g] === false ? 'hide' : ''}">
          ${lista.map(c => `<button class="cat-card" data-cat="${c.id}">
            <span class="cat-h"><b>${esc(c.nombre)}</b>
              ${c.sistema ? '<span class="tagsis">del sistema</span>' : ''}
              ${puedeEditar ? '' : '<span class="tagro" title="Solo lectura">🔒</span>'}</span>
            <span class="sm">${c.n_activos} ${c.n_activos === 1 ? 'valor activo' : 'valores activos'}${c.descripcion ? ' · ' + esc(c.descripcion) : ''}</span>
            <span class="cat-v">${(c.valores || []).filter(v => v.activo).slice(0, 5).map(v => `<span class="chip">${esc(v.valor)}</span>`).join('')}
              ${c.n_activos > 5 ? `<span class="sm">+${c.n_activos - 5}</span>` : ''}</span>
          </button>`).join('')}
        </div></div>`).join('')}`;

  $('cfgcuerpo').querySelectorAll('[data-grupo]').forEach(b => b.onclick = () => {
    const g = b.dataset.grupo;
    CATS_ABIERTOS[g] = CATS_ABIERTOS[g] === false;
    pintarCatalogos();
  });
  $('cfgcuerpo').querySelectorAll('[data-cat]').forEach(b => b.onclick = () => abrirClasificador(b.dataset.cat));
  if ($('cnuevo')) $('cnuevo').onclick = () => nuevoClasificador();
}

function abrirClasificador(id) {
  const c = CATS.find(x => x.id === id); if (!c) return;
  const puedeEditar = PERFIL.rol === 'Administrador' || ((PERFIL.areas || {}).K || 0) >= 2;
  const completo = PERFIL.rol === 'Administrador' || ((PERFIL.areas || {}).K || 0) >= 3;

  const pinta = () => {
    $('dbody').innerHTML = `
      <div class="fh"><div><h2>${esc(c.nombre)}</h2>
        <div class="sm">Grupo ${esc(c.grupo || 'General')} · se usa en ${esc(c.ambito === 'pedido' ? 'pedidos' : c.ambito === 'visita' ? 'visitas' : 'fichas de médico')}
        ${puedeEditar ? '' : ' · <b>solo lectura</b>'}</div></div>
        <button class="x" data-cerrar aria-label="Cerrar">✕</button></div>
      <div class="lista">${(c.valores || []).map(v => `<div class="item" style="cursor:default">
        <span class="ic">${v.activo ? '●' : '○'}</span>
        <span class="tx"><b style="${v.activo ? '' : 'opacity:.5;text-decoration:line-through'}">${esc(v.valor)}</b>
          ${v.extra ? `<span class="sm">${v.extra === 'neg' ? 'sin visita' : 'visita realizada'}</span>` : ''}</span>
        ${puedeEditar ? `<span class="acts" style="margin:0">
          <button class="btn sec" data-vren="${v.id}|${esc(v.valor)}">Renombrar</button>
          <button class="btn sec" data-vtog="${v.id}|${v.activo ? 0 : 1}">${v.activo ? 'Desactivar' : 'Activar'}</button>
          ${completo ? `<button class="btn sec dang" data-vdel="${v.id}">Eliminar</button>` : ''}</span>` : ''}
      </div>`).join('') || '<div class="vacio">Sin valores todavía.</div>'}</div>
      ${puedeEditar ? `<div class="acts"><input id="cvnew" placeholder="Nuevo valor" style="flex:1;min-width:160px">
        ${c.clave === 'RESULTADO' ? `<select id="cvextra" style="max-width:170px"><option value="pos">Visita realizada</option><option value="neg">Sin visita</option></select>` : ''}
        <button class="btn" id="cvadd">Añadir</button></div>` : ''}
      ${completo && !c.sistema ? `<div class="acts" style="justify-content:flex-end;border-top:1px solid var(--line);padding-top:12px">
        <button class="btn sec dang" id="cdel">Eliminar clasificador</button></div>` : ''}`;

    const recarga = async () => {
      const { data } = await db.rpc('catalogos_todos');
      CATS = data || [];
      Object.assign(c, CATS.find(x => x.id === id) || c);
      pinta(); cargarCatalogos();
    };

    if ($('cvadd')) $('cvadd').onclick = async () => {
      const v = $('cvnew').value.trim(); if (!v) return;
      const { error } = await db.rpc('guardar_valor', { p: { clasificador_id: id, valor: v,
        extra: $('cvextra') ? $('cvextra').value : null } });
      if (error) { toast('No se ha podido añadir', true); return; }
      toast('Valor añadido'); recarga();
    };
    $('dbody').querySelectorAll('[data-vtog]').forEach(b => b.onclick = async () => {
      const [vid, activo] = b.dataset.vtog.split('|');
      await db.rpc('guardar_valor', { p: { id: vid, activo: activo === '1' } });
      recarga();
    });
    $('dbody').querySelectorAll('[data-vren]').forEach(b => b.onclick = async () => {
      const [vid, actual] = b.dataset.vren.split('|');
      const nuevo = await pedirTexto('Nuevo nombre', actual, { titulo: 'Renombrar valor', ok: 'Guardar' });
      if (!nuevo) return;
      await db.rpc('guardar_valor', { p: { id: vid, valor: nuevo } });
      toast('Renombrado'); recarga();
    });
    $('dbody').querySelectorAll('[data-vdel]').forEach(b => b.onclick = async () => {
      if (!await preguntar('Las fichas y visitas que ya lo usan lo conservan, pero dejará de aparecer.',
        { titulo: '¿Eliminar el valor?', ok: 'Eliminar', peligro: true })) return;
      const { data: r } = await db.rpc('borrar_valor', { p_id: b.dataset.vdel });
      if (r && r.ok === false) { toast('No tienes permiso', true); return; }
      toast('Eliminado'); recarga();
    });
    if ($('cdel')) $('cdel').onclick = async () => {
      if (!await preguntar(`Se elimina "${c.nombre}" y todos sus valores.`,
        { titulo: '¿Eliminar el clasificador?', ok: 'Eliminar', peligro: true })) return;
      const { data: r } = await db.rpc('borrar_clasificador', { p_id: id });
      if (r && r.ok === false) { toast(r.error === 'sistema' ? 'Los del sistema no se pueden eliminar' : 'Sin permiso', true); return; }
      $('dlg').close(); toast('Clasificador eliminado'); pintarCatalogos(); cargarCatalogos();
    };
  };
  pinta();
  $('dlg').showModal();
}

function nuevoClasificador() {
  let valores = [''];
  const grupos = [...new Set(CATS.map(c => c.grupo || 'General').concat(['Médicos', 'Visitas', 'Ventas', 'General']))];

  const pinta = () => {
    $('dbody').innerHTML = `
      <div class="fh"><div><h2>Nuevo clasificador</h2>
        <div class="sm">Una lista propia que podrás usar en fichas, visitas o pedidos</div></div>
        <button class="x" data-cerrar aria-label="Cerrar">✕</button></div>
      <div class="g2">
        <div><label for="ncn2">Nombre</label><input id="ncn2" placeholder="p. ej. Tipo de centro"></div>
        <div><label for="ncg">Grupo</label><select id="ncg">${grupos.map(g => `<option>${esc(g)}</option>`).join('')}</select></div>
      </div>
      <div class="g2">
        <div><label for="nca">¿Dónde se usa?</label><select id="nca">
          <option value="medico">En la ficha del médico</option>
          <option value="visita">Al registrar una visita</option>
          <option value="pedido">En los pedidos</option></select></div>
        <div><label for="ncd">Descripción</label><input id="ncd" placeholder="Para qué sirve"></div>
      </div>
      <label>Valores</label>
      <div id="ncv">${valores.map((v, i) => `<div class="g2" style="grid-template-columns:1fr auto;margin-bottom:6px">
        <input data-ncv="${i}" value="${esc(v)}" placeholder="Valor ${i + 1}">
        ${valores.length > 1 ? `<button type="button" class="btn sec" data-ncx="${i}">✕</button>` : ''}</div>`).join('')}</div>
      <div class="acts"><button type="button" class="btn sec" id="ncmas">+ Añadir valor</button></div>
      <div class="acts" style="justify-content:flex-end">
        <button class="btn sec" data-cerrar>Cancelar</button>
        <button class="btn" id="ncok2">Crear clasificador</button></div>`;

    const leer = () => valores = [...$('ncv').querySelectorAll('[data-ncv]')].map(i => i.value);
    $('ncmas').onclick = () => { leer(); valores.push(''); pinta(); };
    $('dbody').querySelectorAll('[data-ncx]').forEach(b => b.onclick = () => { leer(); valores.splice(+b.dataset.ncx, 1); pinta(); });
    $('ncok2').onclick = async ev => {
      leer();
      const nombre = $('ncn2').value.trim();
      if (!nombre) { toast('Ponle un nombre', true); return; }
      ev.target.disabled = true;
      const { data: r } = await db.rpc('crear_clasificador', { p: {
        nombre, grupo: $('ncg').value, ambito: $('nca').value, descripcion: $('ncd').value.trim(),
        valores: valores.map(v => v.trim()).filter(Boolean)
      }});
      ev.target.disabled = false;
      if (r && r.ok === false) { toast('No tienes permiso', true); return; }
      $('dlg').close(); toast('Clasificador creado'); pintarCatalogos(); cargarCatalogos();
    };
  };
  pinta();
  $('dlg').showModal();
}

/* ---------------- duplicados pendientes con su pareja ---------------- */

async function revisarPendientes() {
  cargando($('dbody'), 'Buscando pendientes…');
  $('dlg').showModal();
  const { data } = await db.rpc('duplicados_pendientes');
  const l = data || [];
  $('dbody').innerHTML = `
    <div class="fh"><div><h2>Pendientes de unificar</h2>
      <div class="sm">${l.length} fichas marcadas al darlas de alta</div></div>
      <button class="x" data-cerrar aria-label="Cerrar">✕</button></div>
    <div class="lista">${l.map(x => `<div class="item" style="cursor:default">
      <span class="ic w">${x.pct ? x.pct + '%' : '?'}</span>
      <span class="tx"><b>${esc(x.nombre)}</b>
        <span class="sm">Código ${esc(x.codigo)} · ${esc(x.centro || '')} ${esc(x.municipio || '')}</span>
        <span class="sm">${x.par_nombre ? 'Se parece a ' + esc(x.par_nombre) : 'Sin pareja identificada'}</span></span>
      <span class="acts" style="margin:0">
        ${x.par_id ? `<button class="btn" data-cmp="${x.id}|${x.par_id}">Comparar</button>` : ''}
        <button class="btn sec" data-dficha="${x.id}">Ver ficha</button></span></div>`).join('')
      || '<div class="vacio">No hay fichas pendientes de unificar.</div>'}</div>`;

  $('dbody').querySelectorAll('[data-cmp]').forEach(b => b.onclick = () => {
    const [a, c] = b.dataset.cmp.split('|'); compararFichas(a, c);
  });
  $('dbody').querySelectorAll('[data-dficha]').forEach(b => b.onclick = () => { $('dlg').close(); abrirFicha(b.dataset.dficha); });
}



/* ============================================================
   DLC OS 2.0 · Entrega 16 · Bloque D: Inicio y configuración
   ============================================================ */

/* ---------------- plantillas de mensajes ---------------- */

const TPL_DEF = {
  wa: `*Resumen de la semana* ({semana})

✅ Visitas: *{visitas}* a {medicos} médicos
{resultados}
📦 Muestras entregadas: *{muestras}*
📈 Unidades atribuidas: *{unidades}*

*Interesados o prescriben*
{interesados}

*Próximas acciones*
{proximas}`,
  asunto: 'Resumen semanal ({semana})',
  email: `Hola,

Te paso el resumen de la semana ({semana}):

- Visitas realizadas: {visitas}, a {medicos} médicos
{resultados}
- Muestras entregadas: {muestras}
- Unidades atribuidas: {unidades}

Interesados o prescriben:
{interesados}

Próximas acciones (7 días):
{proximas}

Un saludo,
{nombre}`
};
const TPL = () => Object.assign({}, TPL_DEF, (PERFIL.preferencias || {}).plantillas || {});
const rellenar = (t, v) => String(t || '').replace(/\{(\w+)\}/g, (m, k) => v[k] != null ? v[k] : m);

async function variablesSemana() {
  const { data } = await db.rpc('resumen_semana', {});
  if (!data) return null;
  return {
    semana: 'del ' + fechaCorta(data.desde) + ' al ' + fechaCorta(data.hasta),
    visitas: num(data.visitas), medicos: num(data.medicos), muestras: num(data.muestras),
    unidades: num(data.unidades), nombre: PERFIL.nombre,
    resultados: (data.resultados || []).map(r => `· ${r.resultado}: ${r.n}`).join('\n') || '· Sin visitas registradas',
    interesados: (data.interesados || []).map(i => `· ${i.nombre}${i.especialidad ? ' (' + i.especialidad + ')' : ''}`).join('\n') || '· Ninguno esta semana',
    proximas: (data.proximas || []).map(p => `· ${fechaCorta(p.proxima_fecha)} ${p.nombre}: ${p.proxima_accion || 'seguimiento'}`).join('\n') || '· Sin acciones programadas'
  };
}

let CANAL = 'wa';
async function compartirSemana() {
  cargando($('dbody'), 'Preparando el resumen…');
  $('dlg').showModal();
  const v = await variablesSemana();
  if (!v) { $('dbody').innerHTML = '<div class="vacio">No se ha podido preparar el resumen.</div>'; return; }

  const pinta = () => {
    const t = TPL();
    $('dbody').innerHTML = `
      <div class="fh"><div><h2>Compartir la semana</h2>
        <div class="sm">Edítalo antes de enviarlo. Las plantillas se cambian en Configuración → Mis preferencias</div></div>
        <button class="x" data-cerrar aria-label="Cerrar">✕</button></div>
      <div class="subnav" style="margin:6px 0 10px">
        <button data-canal="wa" aria-pressed="${CANAL === 'wa'}">WhatsApp</button>
        <button data-canal="email" aria-pressed="${CANAL === 'email'}">Email</button></div>
      ${CANAL === 'email' ? `<div class="g2">
        <div><label for="shto">Para</label><input id="shto" type="email" value="${esc(localStorage.getItem('dlc-shto') || '')}"></div>
        <div><label for="shsub">Asunto</label><input id="shsub" value="${esc(rellenar(t.asunto, v))}"></div></div>` : ''}
      <label for="shtxt">Mensaje</label>
      <textarea id="shtxt" rows="14" style="font:13.5px/1.5 ui-monospace,Menlo,Consolas,monospace">${esc(rellenar(CANAL === 'email' ? t.email : t.wa, v))}</textarea>
      <div class="acts" style="justify-content:flex-end">
        <button class="btn sec" id="shcopy">Copiar</button>
        <button class="btn" id="shsend">${CANAL === 'email' ? 'Abrir el correo' : 'Abrir WhatsApp'}</button></div>`;

    $('dbody').querySelectorAll('[data-canal]').forEach(b => b.onclick = () => { CANAL = b.dataset.canal; pinta(); });
    $('shcopy').onclick = async () => {
      const txt = (CANAL === 'email' ? $('shsub').value + '\n\n' : '') + $('shtxt').value;
      try { await navigator.clipboard.writeText(txt); toast('Copiado'); }
      catch (e) { $('shtxt').select(); toast('Selecciona y copia'); }
    };
    $('shsend').onclick = () => {
      if (CANAL === 'email') {
        const to = $('shto').value.trim();
        localStorage.setItem('dlc-shto', to);
        location.href = 'mailto:' + encodeURIComponent(to) + '?subject=' + encodeURIComponent($('shsub').value) +
          '&body=' + encodeURIComponent($('shtxt').value);
      } else window.open('https://wa.me/?text=' + encodeURIComponent($('shtxt').value), '_blank', 'noopener');
    };
  };
  pinta();
}

/* ---------------- recomendaciones y pendientes en Inicio ---------------- */

async function tarjetasRuta() {
  const cr = $('c-recom'), cp = $('c-pend');
  if (!cr) return;
  const { data } = await db.rpc('propuestas_rutas', { lim: 40 });
  if (!data) { cr.innerHTML = ''; return; }
  PROPUESTAS = data;
  const dn = { L: 'lunes', M: 'martes', X: 'miércoles', J: 'jueves', V: 'viernes' }[data.dia] || 'hoy';
  const bloques = [
    ['hoy', '📅', `Pasan consulta ${dn}`],
    ['urgentes', '❗', 'Urgentes sin visitar'],
    ['interesados', '🔥', 'Interesados sin visita en 20 días'],
    ['sin_visitar', '🆕', 'Sin visitar nunca']
  ].filter(([k]) => (data[k] || []).length);

  cr.innerHTML = bloques.length ? `<h2>Recomendaciones de rutas</h2>
    <p class="sm">Calculadas con tus datos de hoy. Al pulsar, se planifica la ruta.</p>
    <div class="lista">${bloques.map(([k, ic, t]) => `<button class="item" data-recruta="${k}">
      <span class="ic">${ic}</span><span class="tx"><b>${t}</b>
        <span class="sm">${num(data[k].length)} médicos con ubicación</span></span>
      <span class="rn">${num(data[k].length)}</span></button>`).join('')}</div>
    <button class="verlo" data-ir-rutas>Ver todas las rutas</button>` : '';

  cr.querySelectorAll('[data-recruta]').forEach(b => b.onclick = async e => {
    const k = b.dataset.recruta;
    ir('rutas');
    await new Promise(r => setTimeout(r, 60));   // esperamos a que exista la pantalla de rutas
    planDesdeLista(PROPUESTAS[k], k, e.currentTarget);
  });
  if (cr.querySelector('[data-ir-rutas]')) cr.querySelector('[data-ir-rutas]').onclick = () => ir('rutas');

  const pend = data.pendientes || [];
  if (cp) cp.innerHTML = pend.length ? `<h2><span style="color:var(--warn)">Pendientes de rutas anteriores</span>
      <span class="n">${pend.length}</span></h2>
    <p class="sm">Los planificaste y no se visitaron.</p>
    <div class="lista">${pend.slice(0, 5).map(m => `<button class="item" data-id="${m.id}">
      <span class="ic w">!</span><span class="tx"><b>${esc(m.nombre)}</b>
        <span class="sm">${esc(m.especialidad || '')} · ${esc(m.centro_nombre || m.municipio || '')}</span></span></button>`).join('')}</div>
    <button class="verlo" data-ir-agenda>Ver los ${pend.length} en Agenda</button>` : '';
  if (cp && cp.querySelector('[data-ir-agenda]')) cp.querySelector('[data-ir-agenda]').onclick = () => ir('agenda');
}

/* ---------------- plantillas en preferencias ---------------- */

function bloquePlantillas() {
  const t = TPL();
  return `<div class="card" style="padding:16px;margin-top:14px">
    <div class="dayhead2"><div><h2 style="padding:0">Mensajes del resumen semanal</h2>
      <p class="sm" style="padding:0">Variables: {semana} {visitas} {medicos} {muestras} {unidades} {resultados} {interesados} {proximas} {nombre}</p></div>
      <button class="btn sec" id="tplreset">Restaurar por defecto</button></div>
    <div class="g2" style="margin-top:10px">
      <div><label for="tplwa">WhatsApp</label><textarea id="tplwa" rows="12">${esc(t.wa)}</textarea></div>
      <div><label for="tplas">Email · asunto</label><input id="tplas" value="${esc(t.asunto)}">
        <label for="tplem">Email · mensaje</label><textarea id="tplem" rows="9">${esc(t.email)}</textarea></div>
    </div>
    <div class="acts" style="justify-content:flex-end"><button class="btn" id="tplok">Guardar plantillas</button></div>
  </div>`;
}

async function guardarPlantillas(ev) {
  ev.target.disabled = true; ev.target.textContent = 'Guardando…';
  const plantillas = { wa: $('tplwa').value, asunto: $('tplas').value, email: $('tplem').value };
  const prefs = Object.assign({}, PERFIL.preferencias || {}, { plantillas });
  const { data, error } = await db.rpc('guardar_preferencias', { p: prefs });
  ev.target.disabled = false; ev.target.textContent = 'Guardar plantillas';
  if (error) { toast('No se ha podido guardar: ' + error.message, true); return; }
  PERFIL.preferencias = data || prefs;
  toast('Plantillas guardadas');
}



/* ============================================================
   DLC OS 2.0 · Entrega 17 · Bloque E
   ============================================================ */

/* ---------------- copia local para consultar sin conexión ---------------- */

const CKEY = k => 'dlc-cache-' + (PERFIL ? PERFIL.id : '') + '-' + k;
const guardarCache = (k, d) => { try { localStorage.setItem(CKEY(k), JSON.stringify({ t: Date.now(), d })); } catch (e) {} };
const leerCache = k => { try { const x = JSON.parse(localStorage.getItem(CKEY(k)) || 'null'); return x ? x : null; } catch (e) { return null; } };

/** Llama a una función del servidor y guarda copia; sin conexión devuelve la última copia. */
async function rpcCache(fn, params, clave) {
  if (navigator.onLine) {
    const { data, error } = await db.rpc(fn, params);
    if (!error) { guardarCache(clave, data); return { data, cache: false }; }
  }
  const c = leerCache(clave);
  if (c) return { data: c.d, cache: true, fecha: c.t };
  return { data: null, cache: true };
}

function avisoCache(el, fecha) {
  if (!el) return;
  el.insertAdjacentHTML('afterbegin', `<div class="cacheaviso">Sin conexión · datos guardados
    ${fecha ? 'el ' + new Date(fecha).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</div>`);
}

/* ---------------- administración: secciones nuevas ---------------- */

async function pintarAccesos() {
  cargando($('admcuerpo'), 'Cargando los accesos…');
  const { data } = await db.rpc('accesos_lista', { p_usuario: null, lim: 200 });
  const l = data || [];
  ($('admcuerpo') || document.createElement('div')).innerHTML = `<h2>Accesos<span class="n">${l.length}</span></h2>
    <p class="sm">Últimas entradas y salidas de la plataforma.</p>
    <div class="lista">${l.map(a => `<div class="item" style="cursor:default">
      <span class="ic ${a.evento === 'Entrada' ? 'o' : ''}">${a.evento === 'Entrada' ? '→' : '←'}</span>
      <span class="tx"><b>${esc(a.usuario)}</b><span class="sm">${esc(a.evento)} ·
        ${new Date(a.creado_en).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
        ${a.agente ? ' · ' + esc(String(a.agente).slice(0, 60)) : ''}</span></span></div>`).join('')
      || '<div class="vacio">Todavía no hay accesos registrados.</div>'}</div>`;
}

async function pintarAuditoria() {
  cargando($('admcuerpo'), 'Cargando la auditoría…');
  const { data } = await db.rpc('auditoria_lista', { p_entidad: null, p_usuario: null, p_desde: null, lim: 200 });
  const l = data || [];
  const nombreEnt = { medicos: 'Médico', consultas: 'Consulta', visitas: 'Visita', agenda: 'Cita',
    rutas: 'Ruta', asignaciones: 'Cartera', pedidos: 'Pedido', perfiles: 'Usuario', productos: 'Producto' };

  ($('admcuerpo') || document.createElement('div')).innerHTML = `<h2>Auditoría<span class="n">${l.length}</span></h2>
    <p class="sm">Quién ha cambiado qué y cuándo. Se guarda automáticamente.</p>
    <div class="filtros" style="border:0;padding:0 0 10px">
      <div><label for="aent">Entidad</label><select id="aent"><option value="">Todas</option>
        ${Object.entries(nombreEnt).map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select></div></div>
    <div class="lista" id="audlista">${l.map(a => `<div class="item" style="cursor:default">
      <span class="ic ${a.accion === 'Baja' ? 'w' : a.accion === 'Alta' ? 'o' : ''}">${a.accion === 'Alta' ? '+' : a.accion === 'Baja' ? '−' : '✎'}</span>
      <span class="tx"><b>${esc(a.accion)} · ${esc(nombreEnt[a.entidad] || a.entidad)}</b>
        <span class="sm">${esc(a.usuario)} ·
          ${new Date(a.creado_en).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
        <span class="sm">${esc(resumenDetalle(a.detalle))}</span></span></div>`).join('')
      || '<div class="vacio">Sin movimientos registrados todavía.</div>'}</div>`;

  $('aent').onchange = async e => {
    cargando($('audlista'), 'Filtrando…');
    const { data: d2 } = await db.rpc('auditoria_lista', { p_entidad: e.target.value || null, p_usuario: null, p_desde: null, lim: 200 });
    const l2 = d2 || [];
    $('audlista').innerHTML = l2.map(a => `<div class="item" style="cursor:default">
      <span class="ic">${a.accion === 'Alta' ? '+' : a.accion === 'Baja' ? '−' : '✎'}</span>
      <span class="tx"><b>${esc(a.accion)} · ${esc(nombreEnt[a.entidad] || a.entidad)}</b>
        <span class="sm">${esc(a.usuario)} · ${new Date(a.creado_en).toLocaleString('es')}</span>
        <span class="sm">${esc(resumenDetalle(a.detalle))}</span></span></div>`).join('')
      || '<div class="vacio">Sin movimientos con ese filtro.</div>';
  };
}

function resumenDetalle(d) {
  if (!d) return '';
  if (d.nombre) return d.nombre;
  const campos = Object.keys(d).filter(k => Array.isArray(d[k])).slice(0, 4);
  if (!campos.length) return '';
  return campos.map(k => `${k}: ${String(d[k][0] ?? '—').slice(0, 20)} → ${String(d[k][1] ?? '—').slice(0, 20)}`).join(' · ');
}

/* ---------------- cartera y contraseña de un usuario ---------------- */

async function verCartera(id) {
  const u = USUARIOS.find(x => x.id === id) || {};
  cargando($('dbody'), 'Cargando la cartera…');
  $('dlg').showModal();
  const pinta = async q => {
    const { data } = await db.rpc('cartera_usuario', { p_usuario: id, q: q || null, lim: 500 });
    const l = data || [];
    $('dbody').innerHTML = `
      <div class="fh"><div><h2>Cartera de ${esc(u.nombre || '')}</h2>
        <div class="sm">${num(l.length)} médicos asignados</div></div>
        <button class="x" data-cerrar aria-label="Cerrar">✕</button></div>
      <input id="cbusca" value="${esc(q || '')}" placeholder="Buscar dentro de la cartera">
      <div class="lista" style="max-height:52vh;overflow:auto">${l.map(m => `<div class="item" style="cursor:default">
        <span class="ic ${m.urgente ? 'w' : ''}">${m.urgente ? '!' : '·'}</span>
        <span class="tx"><b>${esc(m.nombre)}</b><span class="sm">${esc(m.especialidad || '')} · ${esc(m.centro || '')} ${esc(m.municipio || '')}
          ${m.ultima_visita ? ' · última visita ' + fechaCorta(m.ultima_visita) : ' · sin visitar'}</span></span>
        <span class="acts" style="margin:0">
          <button class="btn sec" data-cficha="${m.id}">Ficha</button>
          <button class="btn sec dang" data-cquita="${m.id}">Quitar</button></span></div>`).join('')
        || '<div class="vacio">Sin médicos asignados.</div>'}</div>
      <div class="acts" style="justify-content:flex-end"><button class="btn sec" id="cmas">Asignar más médicos</button></div>`;

    let t;
    $('cbusca').oninput = e => { clearTimeout(t); t = setTimeout(() => pinta(e.target.value.trim()), 300); };
    $('dbody').querySelectorAll('[data-cficha]').forEach(b => b.onclick = () => { $('dlg').close(); abrirFicha(b.dataset.cficha); });
    $('dbody').querySelectorAll('[data-cquita]').forEach(b => b.onclick = async () => {
      if (!await preguntar('Dejará de verlo en su cartera. El histórico de visitas no cambia.',
        { titulo: '¿Quitar de la cartera?', ok: 'Quitar', peligro: true })) return;
      const { data: r } = await db.rpc('quitar_de_cartera', { p_usuario: id, p_medico: b.dataset.cquita });
      if (r && r.ok === false) { toast('No tienes permiso', true); return; }
      toast('Quitado de la cartera'); pinta(q); cargarAdmin();
    });
    $('cmas').onclick = () => { $('dlg').close(); asignarCartera(id); };
  };
  pinta('');
}

async function restablecerPassword(u) {
  if (!u.email) { toast('Ese usuario no tiene correo', true); return; }
  if (!await preguntar(`Se enviará a ${u.email} un correo para que cree una contraseña nueva.`,
    { titulo: '¿Restablecer la contraseña?', ok: 'Enviar correo' })) return;
  const { error } = await db.auth.resetPasswordForEmail(u.email, { redirectTo: location.origin + location.pathname });
  if (error) { toast('No se ha podido enviar: ' + error.message, true); return; }
  toast('Correo enviado a ' + u.email);
}



/* ============================================================
   DLC OS 2.0 · v2.17.0 · Velocidad, ventanas, paginación,
   duplicados, auditoría y ayudas
   ============================================================ */

/* ---------------- caché de peticiones ----------------
   Lo ya recibido se reutiliza durante unos segundos o minutos según el dato.
   Dos peticiones iguales a la vez se unifican en una sola.
   Cualquier escritura vacía la caché para que lo siguiente que se lea sea actual. */

const RPC_ORIG = db.rpc.bind(db);
const FROM_ORIG = db.from.bind(db);
const RPC_TTL = {                 // segundos
  panel_inicio: 60, propuestas_rutas: 120, comision_periodo: 120, resumen_duplicados: 600,
  agenda_rango: 60, agenda_mes: 60, pendientes_ruta: 60, rutas_visibles: 120,
  buscar_medicos: 60, buscar_global: 60, opciones_filtros: 600, mapa_medicos: 120,
  ficha_medico: 30, seguimiento_lista: 60, resumen_seguimiento: 120, resumen_semana: 120,
  catalogo: 900, catalogos_todos: 900, productos_lista: 600, usuarios_lista: 300,
  esquemas_lista: 300, liquidaciones_lista: 120, pedidos_lista: 60, contactos_lista: 60,
  analitica_tabla: 120, analitica_unidades: 120, cartera_usuario: 60, duplicados_pendientes: 30
};
const RPC_ESCRITURA = /^(actualizar_|anular_|aplazar_|asignar_|recibir_|movimiento_|atribuir_|borrar_|crear_|estado_cita|guardar_|liquidar|ordenar_|perfil_nuevo|quitar_|registrar_visita|resolver_accion|tocar|unificar_|descartar_)/;

const RC = new Map(), RC_VUELO = new Map();
let RC_EPOCA = 0;
const rcLS = k => 'dlc-rc-' + (PERFIL ? PERFIL.id : '') + '-' + k;
const rcCopia = r => ({ data: r.data == null ? r.data : JSON.parse(JSON.stringify(r.data)), error: r.error || null });

function invalidarCache() {
  RC.clear(); RC_VUELO.clear(); RC_EPOCA++;
  try { ESQUEMAS = []; } catch (e) {}          // listas guardadas en memoria que deben volver a pedirse
  try { Object.keys(localStorage).filter(k => k.startsWith('dlc-rc-')).forEach(k => localStorage.removeItem(k)); } catch (e) {}
}

// Las peticiones de Supabase no traen .catch ni .finally: se añaden para que el código que los usa no falle.
const conCatch = b => {
  if (b && typeof b.then === 'function' && typeof b.catch !== 'function') {
    b.catch = f => Promise.resolve(b).catch(f);
    b.finally = f => Promise.resolve(b).finally(f);
  }
  return b;
};
db.rpc = function (fn, params, opts) {
  if (RPC_ESCRITURA.test(fn)) { invalidarCache(); return conCatch(RPC_ORIG(fn, params, opts)); }
  const ttl = RPC_TTL[fn];
  if (!ttl || !navigator.onLine) return conCatch(RPC_ORIG(fn, params, opts));

  const k = fn + '|' + JSON.stringify(params || {});
  let e = RC.get(k);
  if (!e && ttl >= 300) {           // los datos que cambian poco se guardan también en el dispositivo
    try { e = JSON.parse(localStorage.getItem(rcLS(k)) || 'null'); if (e) RC.set(k, e); } catch (err) { e = null; }
  }
  if (e && Date.now() - e.t < ttl * 1000) return Promise.resolve(rcCopia(e.r));
  if (RC_VUELO.has(k)) return RC_VUELO.get(k).then(rcCopia);

  const epoca = RC_EPOCA;
  const p = Promise.resolve(RPC_ORIG(fn, params, opts)).then(r => {
    RC_VUELO.delete(k);
    if (!r.error && epoca === RC_EPOCA) {
      const x = { t: Date.now(), r: { data: r.data, error: null } };
      RC.set(k, x);
      if (ttl >= 300) { try { localStorage.setItem(rcLS(k), JSON.stringify(x)); } catch (err) {} }
    }
    return r;
  }, err => { RC_VUELO.delete(k); throw err; });
  RC_VUELO.set(k, p);
  return p.then(rcCopia);
};

db.from = function (tabla) {
  const q = FROM_ORIG(tabla);
  ['insert', 'update', 'upsert', 'delete'].forEach(m => {
    const f = q[m];
    if (typeof f === 'function') q[m] = (...a) => { invalidarCache(); return f.apply(q, a); };
  });
  return q;
};

/* ---------------- navegación: recordar de dónde venimos ---------------- */

let TAB_ANTERIOR = 'inicio';
const irV216 = ir;
ir = function (t) {
  if (t !== TAB) TAB_ANTERIOR = TAB;
  $('tools').classList.remove('abierto');
  irV216(t);
};

/* ---------------- inicio: un único cargador hasta tenerlo todo ---------------- */

let INI_LISTO = false, INI_EN_CURSO = null, INI_OTRA = false, DUP_RES = null;

function cargarInicio() {
  if (TAB !== 'inicio') return Promise.resolve();       // se cargará al entrar en Inicio
  if (INI_EN_CURSO) { INI_OTRA = true; return INI_EN_CURSO; }
  INI_OTRA = false;
  INI_EN_CURSO = pintarInicio().catch(err => console.error(err)).finally(() => {
    INI_EN_CURSO = null;
    if (INI_OTRA && TAB === 'inicio') cargarInicio();
  });
  return INI_EN_CURSO;
}

async function pintarInicio() {
  const sec = $('v-inicio');
  if (!$('iniload')) sec.insertAdjacentHTML('afterbegin',
    '<div class="cargador ini-loader" id="iniload"><span class="spin"></span><span class="sm">Preparando tu inicio…</span></div>');
  if (!$('inialerta')) sec.querySelector('.saludo').insertAdjacentHTML('afterend', '<div id="inialerta"></div>');
  if (!INI_LISTO) sec.classList.add('ini-cargando');

  const cfg = kpiConfig().filter(x => x.on);
  const esAdmin = PERFIL.rol === 'Administrador';
  const [res, cuentas] = await Promise.all([
    rpcCache('panel_inicio', { lim: 6 }, 'inicio'),
    Promise.all(cfg.map(x => x.filtro ? contarFiltro(x.filtro).catch(() => null) : null)),
    tarjetaComision().catch(() => {}),
    tarjetasRuta().catch(() => {})
  ]);

  const data = res.data;
  if (!data) {
    $('c-agenda').innerHTML = '<div class="vacio">Sin conexión y sin copia guardada todavía.</div>';
    sec.classList.remove('ini-cargando'); INI_LISTO = true;
    return;
  }
  const k = data.kpis;

  /* aviso de posibles duplicados: se calcula aparte para no retrasar el Inicio */
  const avisoDup = () => {
    const nPend = (DUP_RES && DUP_RES.pendientes) || k.pendientes_unificar || 0;
    const nPar = (DUP_RES && DUP_RES.parecidos) || 0;
    $('inialerta').innerHTML = esAdmin && (nPend || nPar) ? `<div class="alerta">
        <span>⚠ ${[nPend ? `${num(nPend)} ${nPend === 1 ? 'ficha pendiente' : 'fichas pendientes'} de unificar` : '',
                  nPar ? `${num(nPar)}${nPar >= 200 ? '+' : ''} ${nPar === 1 ? 'posible duplicado' : 'posibles duplicados'} por nombre` : '']
                  .filter(Boolean).join(' y ')}</span>
        <button class="btn" data-k="dups">Revisar duplicados</button></div>` : '';
  };
  avisoDup();
  if (esAdmin) db.rpc('resumen_duplicados').then(r => { DUP_RES = r.data || null; avisoDup(); }).catch(() => {});

  /* indicadores */
  const kpi = (n, t, cls, accion, ayuda) =>
    `<div class="kpi ${cls || ''} ${accion ? 'click' : ''}" ${accion ? `data-k="${accion}"` : ''}>
       ${ayuda ? `<button class="ai" data-ayuda-txt="${esc(ayuda)}" data-ayuda-tit="${esc(t)}" aria-label="Qué es">i</button>` : ''}
       <b>${typeof n === 'string' ? n : num(n)}</b><span>${esc(t.charAt(0).toUpperCase() + t.slice(1))}</span></div>`;

  $('kpis').innerHTML = cfg.map((x, i) => {
    if (x.filtro) return `<div class="kpi click" data-kf="${esc(JSON.stringify(x.filtro))}">
        <button class="ai" data-ayuda-txt="${esc(AYUDA_KPI.filtro + ' Filtro: ' + textoFiltro(x.filtro) + '.')}" data-ayuda-tit="${esc(x.t || 'Filtro guardado')}" aria-label="Qué es">i</button>
        <b class="cont">${cuentas[i] == null ? '—' : num(cuentas[i])}</b><span>${esc(x.t || textoFiltro(x.filtro))}</span></div>`;
    const c = KPI_CAT.find(y => y.id === x.id);
    if (!kpiPermitido(c)) return '';
    return kpi(c.v(k), x.t || c.t, c.cls ? c.cls(k) : '', c.h, AYUDA_KPI[c.id]);
  }).join('') + `<div class="kpi" style="display:grid;place-items:center;border-style:dashed">
      <button class="kcfg" data-k="cfgkpis">⚙ Personalizar indicadores</button></div>`;
  if (res.cache) avisoCache($('kpis'), res.fecha);

  tarjeta($('c-agenda'), 'Tu agenda de hoy', data.agenda_hoy.length,
    data.agenda_hoy.map(a => itemHTML(a.medico_id, a.hora ? esc(a.hora).slice(0, 5) : '·',
      a.estado === 'Visitada' ? 'o' : '', a.nombre,
      `${esc(a.centro_nombre || '')} · <b style="color:${a.estado === 'Visitada' ? 'var(--ok)' : 'var(--navy)'}">${esc(a.estado)}</b>`)),
    '', 'No tienes citas para hoy. Planifica una ruta desde Rutas.');

  tarjeta($('c-acciones'), 'Próximas acciones', data.acciones.length,
    data.acciones.map(a => itemHTML(a.medico_id, '↻', a.proxima_fecha < hoyISO() ? 'w' : '', a.nombre,
      `<b style="color:${a.proxima_fecha < hoyISO() ? 'var(--warn)' : 'var(--navy)'}">${fechaCorta(a.proxima_fecha)}</b> · ${esc(a.proxima_accion || 'Seguimiento')}`)),
    '', 'Sin acciones pendientes en los próximos 7 días.');

  tarjeta($('c-urgentes'), 'Urgentes sin visitar', k.urgentes,
    data.urgentes.map(u => itemHTML(u.medico_id, '!', 'w', u.nombre,
      `${esc(u.especialidad || '')} · ${esc(u.centro_nombre || u.municipio || '')}`)),
    k.urgentes > 6 ? `<button class="verlo" data-k="urgentes">Ver los ${num(k.urgentes)} urgentes</button>` : '',
    'Todos los urgentes están visitados.');

  tarjeta($('c-ultimas'), 'Últimas visitas', null,
    data.ultimas_visitas.map(v => itemHTML(v.medico_id, '✓', 'o', v.nombre,
      `${fechaCorta(v.fecha)} · ${esc((v.resultados || []).join(' + ') || 'Sin resultado')}`)),
    '', 'Todavía no hay visitas registradas.');

  ponerAyudas();
  sec.classList.remove('ini-cargando');
  INI_LISTO = true;
}

/* ---------------- ventanas y paneles: se cierran al pulsar fuera ---------------- */

let PTR_ABAJO = null, TRAGAR_CLIC = false;
document.addEventListener('click', e => {
  if (!TRAGAR_CLIC) return;
  TRAGAR_CLIC = false; e.preventDefault(); e.stopPropagation();
}, true);
document.addEventListener('pointerdown', e => {
  PTR_ABAJO = e.target;
  const t = $('tools');
  if (t.classList.contains('abierto') && !t.contains(e.target)
      && !e.target.closest('#dirtools, #segtools, #antools') && !document.querySelector('dialog[open]')) {
    t.classList.remove('abierto');
    TRAGAR_CLIC = true;              // el clic que cierra el panel no activa lo que hay debajo
  }
  const pop = document.querySelector('.aipop');
  if (pop && !pop.contains(e.target) && !e.target.closest('.ai')) pop.remove();
}, true);

// Solo cierra si el clic empieza y acaba fuera (así no se cierra al seleccionar texto y soltar fuera).
['ficha', 'dlg', 'dlg2'].forEach(id => {
  const d = $(id);
  d.addEventListener('click', e => { if (e.target === d && PTR_ABAJO === d) { if (id === 'ficha') d.close(); else intentarCerrar(d); } });
});

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  $('tools').classList.remove('abierto');
  const pop = document.querySelector('.aipop'); if (pop) pop.remove();
});

/* ---------------- paginación ---------------- */

const TAMKEY = () => 'dlc-tam-' + (PERFIL ? PERFIL.id : '');
const TAMANOS = [20, 50, 100];
function tamPagina() { const n = +localStorage.getItem(TAMKEY()); return TAMANOS.includes(n) ? n : 20; }
function fijarTam(n) { localStorage.setItem(TAMKEY(), String(n)); }

function pagHTML(total, pagina, tam) {
  const paginas = Math.max(1, Math.ceil(total / tam));
  const nums = [];
  for (let i = 0; i < paginas; i++) {
    if (i === 0 || i === paginas - 1 || Math.abs(i - pagina) <= 1) nums.push(i);
    else if (nums[nums.length - 1] !== '…') nums.push('…');
  }
  const desde = total ? pagina * tam + 1 : 0, hasta = Math.min(total, (pagina + 1) * tam);
  return `<div class="pag">
    <span>${num(desde)}–${num(hasta)} de ${num(total)}</span>
    <span class="pbtns">
      <button data-pg="${pagina - 1}" ${pagina <= 0 ? 'disabled' : ''} aria-label="Página anterior">‹</button>
      ${nums.map(n => n === '…' ? '<span class="sm">…</span>'
        : `<button data-pg="${n}" aria-current="${n === pagina}">${n + 1}</button>`).join('')}
      <button data-pg="${pagina + 1}" ${pagina >= paginas - 1 ? 'disabled' : ''} aria-label="Página siguiente">›</button>
    </span>
    <span class="ptam">Mostrar <select data-pgtam>${TAMANOS.map(n =>
      `<option value="${n}" ${n === tam ? 'selected' : ''}>${n}</option>`).join('')}</select></span></div>`;
}

/** Paginador para listas que se piden al servidor por páginas. */
function paginador(el, total, pagina, alCambiar, alCambiarTam) {
  if (!el) return;
  const tam = tamPagina();
  if (total <= TAMANOS[0]) { el.innerHTML = ''; return; }
  el.innerHTML = pagHTML(total, pagina, tam);
  el.querySelectorAll('[data-pg]').forEach(b => b.onclick = () => alCambiar(+b.dataset.pg));
  el.querySelector('[data-pgtam]').onchange = e => { fijarTam(+e.target.value); alCambiarTam(); };
}

/* Paginación automática de cualquier otra lista o tabla con más de 20 filas. */
const PAG_MEM = {};
const PAG_EXCLUIR = '.carsel, .picker, #lista, #slista, #kpis, .gsug, .umenu, .dl-menu, #tools, .opciones, .chips, .pag, #c-agenda, #c-acciones, #c-urgentes, #c-ultimas, #c-recom, #c-pend';

function paginarListas() {
  document.querySelectorAll('.pag[data-auto]').forEach(p => { if (!p.__lista || !p.__lista.isConnected) p.remove(); });
  const grupos = new Map();
  document.querySelectorAll('main .item, main .trow, dialog[open] .item, dialog[open] .trow').forEach(r => {
    const p = r.parentElement;
    if (!p || r.hasAttribute('data-fijo') || p.closest(PAG_EXCLUIR)) return;
    if (!grupos.has(p)) grupos.set(p, []);
    grupos.get(p).push(r);
  });
  grupos.forEach((filas, p) => {
    const tam = tamPagina();
    if (filas.length <= TAMANOS[0]) {
      if (p.__pagEl) { p.__pagEl.remove(); p.__pagEl = null; filas.forEach(f => f.style.display = ''); }
      return;
    }
    if (p.id && PAG_MEM[p.id] != null && p.__pagina == null) p.__pagina = PAG_MEM[p.id];   // listas que conservan la página
    else if (p.__pagFilas !== filas.length || p.__pagPrimera !== filas[0]) {
      if (!(p.id && PAG_MEM[p.id] != null)) p.__pagina = 0;
    }
    p.__pagFilas = filas.length; p.__pagPrimera = filas[0];
    const paginas = Math.ceil(filas.length / tam);
    if (p.__pagina >= paginas) p.__pagina = paginas - 1;
    if (p.id) PAG_MEM[p.id] = p.__pagina;
    const estado = [filas.length, p.__pagina, tam].join('|');
    if (p.__pagEl && p.__pagEl.isConnected && p.__pagEstado === estado) return;   // nada que cambiar
    p.__pagEstado = estado;
    filas.forEach((f, i) => { f.style.display = Math.floor(i / tam) === p.__pagina ? '' : 'none'; });
    if (!p.__pagEl || !p.__pagEl.isConnected) {
      p.__pagEl = document.createElement('div');
      p.__pagEl.setAttribute('data-auto', '');
      p.__pagEl.className = 'pag';
      p.__pagEl.__lista = p;
      p.insertAdjacentElement('afterend', p.__pagEl);
    }
    const tmp = document.createElement('div');
    tmp.innerHTML = pagHTML(filas.length, p.__pagina, tam);
    p.__pagEl.innerHTML = tmp.firstElementChild.innerHTML;
    p.__pagEl.querySelectorAll('[data-pg]').forEach(b => b.onclick = () => {
      p.__pagina = +b.dataset.pg; p.__pagEstado = null; paginarListas();
      const r = p.getBoundingClientRect();
      if (r.top < 0) p.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
    p.__pagEl.querySelector('[data-pgtam]').onchange = e => {
      fijarTam(+e.target.value);
      document.querySelectorAll('.pag[data-auto]').forEach(x => { if (x.__lista) x.__lista.__pagEstado = null; });
      paginarListas();
    };
  });
}

let T_OBS = null;
new MutationObserver(muts => {
  if (muts.every(m => m.target.nodeType === 1 && m.target.closest('.pag, .aipop'))) return;
  clearTimeout(T_OBS);
  T_OBS = setTimeout(() => { paginarListas(); ponerAyudas(); }, 40);
}).observe(document.body, { childList: true, subtree: true });

/* ---------------- duplicados: pantalla propia ---------------- */

let DUP_PEND = [], DUP_PARES = [], DUP_ACTUAL = null;

async function cargarDuplicados() {
  const v = $('v-duplicados');
  const puede = PERFIL.rol === 'Administrador' || ((PERFIL.areas || {}).M || 0) >= 3;
  v.innerHTML = `
    <div class="saludo"><div><h1>Duplicados</h1>
      <div class="fecha">Revisa fichas repetidas y unifícalas sin perder la lista</div></div>
      <div class="acts" style="margin:0">
        <button class="btn sec" id="dvolver">← Volver</button>
        <button class="btn sec" id="dbuscar">Volver a buscar parecidos</button></div></div>
    ${puede ? `<div class="dupgrid">
      <div><div class="card" id="dpendc"></div><div class="card" id="dparc"></div></div>
      <div class="card dupcmp" id="dcmp"><div class="vacio">Pulsa <b>Comparar</b> en una pareja para revisarla aquí.
        La lista sigue a la izquierda: al terminar, pasas a la siguiente.</div></div>
    </div>` : '<div class="card"><div class="vacio">Solo administración puede unificar fichas.</div></div>'}`;
  $('dvolver').onclick = () => ir(TAB_ANTERIOR && TAB_ANTERIOR !== 'duplicados' ? TAB_ANTERIOR : 'directorio');
  if (!puede) { $('dbuscar').classList.add('hide'); return; }
  $('dbuscar').onclick = () => { invalidarCache(); listasDuplicados(); };
  listasDuplicados();
}

async function listasDuplicados() {
  cargando($('dpendc'), 'Buscando fichas pendientes…');
  cargando($('dparc'), 'Buscando nombres parecidos…');
  const [rp, rs] = await Promise.all([db.rpc('duplicados_pendientes'), db.rpc('escanear_duplicados', { p_umbral: 80, p_tope: 200 })]);
  DUP_PEND = rp.data || [];
  DUP_PARES = rs.data || [];
  pintarListasDup();
}

function pintarListasDup() {
  if (!$('dpendc')) return;
  const sel = DUP_ACTUAL ? DUP_ACTUAL.join('|') : '';
  $('dpendc').innerHTML = `<h2>Pendientes de unificar<span class="n">${DUP_PEND.length}</span></h2>
    <p class="sm">Fichas marcadas como posible duplicado al darlas de alta.</p>
    <div class="lista" id="dpendl">${DUP_PEND.map(x => `<div class="item ${x.par_id && sel === x.id + '|' + x.par_id ? 'sel' : ''}" style="cursor:default">
      <span class="ic w">${x.pct ? x.pct + '%' : '?'}</span>
      <span class="tx"><b>${esc(x.nombre)}</b>
        <span class="sm">Código ${esc(x.codigo)} · ${esc(x.centro || '')} ${esc(x.municipio || '')}</span>
        <span class="sm">${x.par_nombre ? 'Se parece a ' + esc(x.par_nombre) : 'Sin pareja identificada'}</span></span>
      <span class="acts" style="margin:0">
        ${x.par_id ? `<button class="btn" data-dcmp="${x.id}|${x.par_id}">Comparar</button>
          <button class="btn sec" data-ddes="${x.id}|${x.par_id}">No es duplicado</button>` : ''}
        <button class="btn sec" data-dver="${x.id}">Ficha</button></span></div>`).join('')
      || '<div class="vacio">No hay fichas pendientes de unificar.</div>'}</div>`;

  $('dparc').innerHTML = `<h2>Nombres parecidos<span class="n">${DUP_PARES.length}</span></h2>
    <p class="sm">Parejas con un parecido del 80% o más. Si no son la misma persona, márcalas como distintas y no volverán a salir.</p>
    <div class="lista" id="dparl">${DUP_PARES.map(p => `<div class="item ${sel === p.a_id + '|' + p.b_id ? 'sel' : ''}" style="cursor:default">
      <span class="ic">${p.pct}%</span>
      <span class="tx"><b>${esc(p.a_nombre)}</b><span class="sm">${esc(p.b_nombre)} · códigos ${esc(p.a_codigo)} y ${esc(p.b_codigo)}</span></span>
      <span class="acts" style="margin:0">
        <button class="btn" data-dcmp="${p.a_id}|${p.b_id}">Comparar</button>
        <button class="btn sec" data-ddes="${p.a_id}|${p.b_id}">No son duplicados</button></span></div>`).join('')
      || '<div class="vacio">Sin parejas parecidas pendientes de revisar.</div>'}</div>`;
}

document.addEventListener('click', async e => {
  if (TAB !== 'duplicados') return;
  const c = e.target.closest('[data-dcmp]'), f = e.target.closest('[data-dver]'), d = e.target.closest('[data-ddes]');
  if (c) {
    DUP_ACTUAL = c.dataset.dcmp.split('|');
    $('v-duplicados').querySelectorAll('.item.sel').forEach(x => x.classList.remove('sel'));
    if (c.closest('.item')) c.closest('.item').classList.add('sel');
    compararEn($('dcmp'), DUP_ACTUAL[0], DUP_ACTUAL[1]);
    if (window.innerWidth <= 900) $('dcmp').scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
  if (f) abrirFicha(f.dataset.dver);
  if (d) {
    const [a, b] = d.dataset.ddes.split('|');
    d.disabled = true;
    const { data: r, error } = await db.rpc('descartar_duplicado', { p_a: a, p_b: b });
    if (error || (r && r.ok === false)) { d.disabled = false; toast('No se ha podido guardar', true); return; }
    const par = (p, x, y) => (p === x || p === y);
    DUP_PARES = DUP_PARES.filter(p => !(par(p.a_id, a, b) && par(p.b_id, a, b)));
    DUP_PEND = DUP_PEND.filter(p => !(par(p.id, a, b) && par(p.par_id, a, b)));
    if (DUP_ACTUAL && DUP_ACTUAL.includes(a) && DUP_ACTUAL.includes(b)) { DUP_ACTUAL = null; panelDupVacio('Marcadas como personas distintas.'); }
    pintarListasDup(); toast('Marcadas como distintas');
  }
});

function panelDupVacio(msg) {
  $('dcmp').innerHTML = `<div class="vacio">${esc(msg)} Elige la siguiente pareja de la lista.</div>`;
}

async function compararEn(el, idA, idB) {
  cargando(el, 'Cargando las dos fichas…');
  const [{ data: A }, { data: B }] = await Promise.all([
    db.rpc('ficha_medico', { p_id: idA }), db.rpc('ficha_medico', { p_id: idB })
  ]);
  if (!A || !B || !A.medico || !B.medico) { el.innerHTML = '<div class="vacio">Alguna de las dos fichas ya no existe.</div>'; return; }
  const a = A.medico, b = B.medico;
  const ctx = { A, B };
  let queda = b.id;
  const eleccion = {};
  CAMPOS_UNI.forEach(([k]) => eleccion[k] = b[k] ? 'queda' : (a[k] ? 'va' : 'queda'));
  const resumen = (m, x) => `${num((x.consultas || []).length)} consultas · ${num((x.visitas || []).length)} visitas`;

  const pinta = () => {
    const va = queda === a.id ? b : a, qu = queda === a.id ? a : b;
    const dif = CAMPOS_UNI.filter(([k]) => (a[k] || '') !== (b[k] || ''));
    el.innerHTML = `<div class="fbox">
      <div class="fh"><div><h2>Comparar fichas</h2>
        <div class="sm">Elige cuál se conserva y con qué datos. Consultas, visitas, citas y cartera se juntan en la que quede.</div></div>
        <button class="x" id="dcx" aria-label="Cerrar">✕</button></div>
      <div class="opciones">
        ${[[a, ctx.A], [b, ctx.B]].map(([m, x]) => `<button class="opt" data-queda="${m.id}" aria-pressed="${queda === m.id}">
          <span class="mk"></span><span><b>${esc(m.nombre)}</b><br>
          <span class="sm">Código ${esc(m.codigo)} · ${resumen(m, x)}</span><br>
          <span class="sm">${queda === m.id ? 'Se conserva esta' : 'Desaparece'}</span></span></button>`).join('')}
      </div>
      <div class="acts"><button class="btn sec" data-dver="${a.id}">Ver ficha de ${esc(a.codigo)}</button>
        <button class="btn sec" data-dver="${b.id}">Ver ficha de ${esc(b.codigo)}</button></div>
      ${dif.length ? `<div>${dif.map(([k, t]) => `
        <label>${t}</label>
        <div class="opciones">
          <button class="opt" data-campo="${k}|queda" aria-pressed="${eleccion[k] === 'queda'}"><span class="mk"></span>${esc(qu[k] || '(vacío)')}</button>
          <button class="opt" data-campo="${k}|va" aria-pressed="${eleccion[k] === 'va'}"><span class="mk"></span>${esc(va[k] || '(vacío)')}</button>
        </div>`).join('')}</div>` : '<p class="sm" style="margin-top:12px">Los datos principales coinciden.</p>'}
      <div class="acts" style="justify-content:flex-end">
        <button class="btn sec" data-ddes="${a.id < b.id ? a.id + '|' + b.id : b.id + '|' + a.id}">No son duplicados</button>
        <button class="btn dang" id="duniok">Unificar</button></div></div>`;

    $('dcx').onclick = () => { DUP_ACTUAL = null; $('v-duplicados').querySelectorAll('.item.sel').forEach(x => x.classList.remove('sel')); panelDupVacio(''); };
    el.querySelectorAll('[data-queda]').forEach(x => x.onclick = () => { queda = x.dataset.queda; pinta(); });
    el.querySelectorAll('[data-campo]').forEach(x => x.onclick = () => {
      const [k, v] = x.dataset.campo.split('|'); eleccion[k] = v; pinta();
    });
    $('duniok').onclick = async ev => {
      const desaparece = queda === a.id ? b.id : a.id;
      if (!await preguntar(`Desaparece la ficha de ${queda === a.id ? b.nombre : a.nombre}.\nNo se puede deshacer desde la app.`,
        { titulo: '¿Unificar fichas?', ok: 'Unificar', peligro: true })) return;
      ev.target.disabled = true; ev.target.textContent = 'Unificando…';
      const { data: r, error } = await db.rpc('unificar_medicos', { p: { queda, va: desaparece, campos: eleccion } });
      if (error || (r && r.ok === false)) { ev.target.disabled = false; ev.target.textContent = 'Unificar'; toast('No se ha podido unificar', true); return; }
      toast('Fichas unificadas');
      DUP_PARES = DUP_PARES.filter(p => p.a_id !== desaparece && p.b_id !== desaparece);
      DUP_PEND = DUP_PEND.filter(p => p.id !== desaparece && p.par_id !== desaparece);
      DUP_ACTUAL = null; pintarListasDup(); panelDupVacio('Fichas unificadas.');
      $('lista').innerHTML = '';                 // el directorio se recarga al volver
    };
  };
  pinta();
}

/* ---------------- auditoría con filtro por usuario ---------------- */

async function pintarAuditoria() {
  cargando($('admcuerpo'), 'Cargando la auditoría…');
  const nombreEnt = { medicos: 'Médico', consultas: 'Consulta', visitas: 'Visita', agenda: 'Cita',
    rutas: 'Ruta', asignaciones: 'Cartera', pedidos: 'Pedido', perfiles: 'Usuario', productos: 'Producto' };
  const { data: us } = await db.rpc('usuarios_lista');
  const usuarios = (us || []).slice().sort((x, y) => String(x.nombre).localeCompare(String(y.nombre), 'es'));

  ($('admcuerpo') || document.createElement('div')).innerHTML = `<h2>Auditoría<span class="n" id="audn">…</span></h2>
    <p class="sm">Quién ha cambiado qué y cuándo. Se guarda automáticamente.</p>
    <div class="filtros" style="border:0;padding:10px 16px">
      <div><label for="ausr">Usuario</label><select id="ausr"><option value="">Todos</option>
        ${usuarios.map(u => `<option value="${u.id}">${esc(u.nombre)}</option>`).join('')}</select></div>
      <div><label for="aent">Entidad</label><select id="aent"><option value="">Todas</option>
        ${Object.entries(nombreEnt).map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select></div>
      <div><label for="adesde">Desde</label><input id="adesde" type="date"></div></div>
    <div class="lista" id="audlista"></div>`;

  const pinta = async () => {
    cargando($('audlista'), 'Filtrando…');
    const { data } = await RPC_ORIG('auditoria_lista', {
      p_entidad: $('aent').value || null, p_usuario: $('ausr').value || null,
      p_desde: $('adesde').value || null, lim: 500 });
    const l = data || [];
    $('audn').textContent = num(l.length) + (l.length === 500 ? '+' : '');
    $('audlista').innerHTML = l.map(a => `<div class="item" style="cursor:default">
      <span class="ic ${a.accion === 'Baja' ? 'w' : a.accion === 'Alta' ? 'o' : ''}">${a.accion === 'Alta' ? '+' : a.accion === 'Baja' ? '−' : '✎'}</span>
      <span class="tx"><b>${esc(a.accion)} · ${esc(nombreEnt[a.entidad] || a.entidad)}</b>
        <span class="sm">${esc(a.usuario)} ·
          ${new Date(a.creado_en).toLocaleString('es', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
        <span class="sm">${esc(resumenDetalle(a.detalle))}</span></span></div>`).join('')
      || '<div class="vacio">Sin movimientos con estos filtros.</div>';
  };
  ['ausr', 'aent', 'adesde'].forEach(id => $(id).onchange = pinta);
  pinta();
}

/* ---------------- ayudas (i) en pantallas, tarjetas e indicadores ---------------- */

const AYUDA_KPI = {
  citas: 'Citas de hoy que ya están marcadas como visitadas, sobre el total de citas del día. Las descartadas no cuentan.',
  urgentes: 'Médicos marcados como urgentes que todavía no tienen ninguna visita. Pulsa para verlos en el Directorio.',
  visitas_sem: 'Visitas registradas desde el lunes de esta semana.',
  visitas_mes: 'Visitas registradas desde el día 1 de este mes.',
  interesados: 'Médicos en estado «Interesado». El siguiente paso es conseguir la primera pauta. Pulsa para verlos.',
  sin_contactar: 'Médicos a los que todavía no se ha presentado el producto. Pulsa para verlos.',
  cartera: 'Médicos que puedes ver: tu cartera asignada o, si eres de administración o televenta, toda la base.',
  dups: 'Fichas marcadas como posible duplicado al darlas de alta. Pulsa para revisarlas y unificarlas.',
  filtro: 'Indicador creado con «Guardar filtro» en el Directorio. Cuenta ahora mismo los médicos que cumplen ese filtro. Pulsa para ver la lista.'
};

const AYUDA = {
  inicio: ['Tu inicio', 'El resumen de tu día.', ['Pulsa un indicador para ver la lista de médicos que cuenta.',
    'Con «⚙ Personalizar indicadores» eliges cuáles ver y en qué orden, y añades filtros guardados.',
    '«Compartir la semana» prepara un resumen para WhatsApp o email con tus plantillas.']],
  ini_agenda: ['Tu agenda de hoy', 'Citas de hoy ordenadas por hora. En verde, las ya visitadas.',
    ['Para añadir citas, ve a Agenda o planifica una ruta.', 'Pulsa un médico para abrir su ficha y registrar la visita.']],
  ini_acciones: ['Próximas acciones', 'La próxima acción que quedó apuntada en la última visita de cada médico, para los próximos 7 días.',
    ['En naranja, las que ya han pasado de fecha.', 'Márcalas como hechas o aplázalas desde Seguimiento.']],
  ini_urgentes: ['Urgentes sin visitar', 'Médicos marcados como urgentes que aún no tienen ninguna visita.',
    ['El motivo de urgencia se ve en su ficha.', 'Desde Rutas puedes planificar una ruta solo con urgentes.']],
  ini_ultimas: ['Últimas visitas', 'Las visitas registradas más recientes, con su resultado.', []],
  ini_recom: ['Recomendaciones de rutas', 'Listas calculadas cada día con tus datos. Al pulsar una, se planifica la ruta del día.',
    ['«Pasan consulta hoy»: tienen consulta este día de la semana y no se visitan desde hace más de 14 días.',
     '«Interesados»: en estado Interesado y sin visita en 20 días.',
     'Solo entran médicos con ubicación: completar direcciones mejora las propuestas.']],
  ini_pend: ['Pendientes de rutas anteriores', 'Citas que planificaste y quedaron sin visitar.',
    ['Desde Agenda puedes moverlas a hoy, cambiarlas de fecha o descartarlas.']],
  ini_comision: ['Tu actividad del mes', 'Unidades atribuidas a tus médicos en el periodo.',
    ['El tramo alcanzado se aplica a todas las unidades del periodo, no solo a las que superan el tramo.',
     'Lo que se ve (unidades o importe) lo decide administración.']],
  agenda: ['Agenda', 'Tus citas por día, semana o mes.', ['«+ Nueva cita» crea una cita con un médico.',
    'En cada cita puedes cambiar la hora, moverla o descartarla.',
    'Al registrar la visita desde la ficha, la cita pasa a «Visitada».',
    'Abajo verás los pendientes de rutas anteriores para recolocarlos.']],
  rutas: ['Rutas', 'Crea rutas y conviértelas en el plan del día.', [
    '<b>Lista fija</b>: tú eliges los médicos. <b>Por criterios</b>: se rellena sola con los filtros (municipio, estado, días de consulta…).',
    '<b>Propuestas automáticas</b>: las mismas listas que ves en Inicio.',
    'El plan ordena las paradas por cercanía y calcula horas con tu horario: salida, minutos por visita, hora tope y minutos entre paradas.',
    'El navegador (Google Maps, Apple Maps o Waze) se elige en el plan o en Configuración.',
    'Al empezar la ruta aparece la barra verde con el tiempo en curso.',
    'Solo entran médicos con ubicación. Completar la dirección y los días de consulta mejora mucho las rutas.']],
  directorio: ['Directorio', 'Todos los médicos que puedes ver.', [
    'El buscador de arriba filtra por nombre, centro o municipio.',
    'El municipio y la provincia cuentan todas las consultas del médico, no solo la principal.',
    '«⋮» abre los filtros, las columnas y las descargas.',
    '«★ Guardar filtro» convierte los filtros actuales en un indicador de Inicio.',
    '«Cerca de mí» usa la ubicación del dispositivo.',
    'Al crear un médico o centro, la app avisa si ya existe uno parecido.']],
  seguimiento: ['Seguimiento', 'Cómo avanza cada médico.', [
    'Los indicadores de arriba muestran el embudo por estado comercial y la calidad de los datos.',
    '«Mostrar» filtra por visitados, sin visitar, con próxima acción o atrasados.',
    '«Hecha» cierra la próxima acción; «Aplazar» le pone otra fecha.',
    'Las descargas están en «⋮».']],
  ventas: ['Ventas', 'Pedidos y unidades atribuidas.', [
    'La venta a paciente se atribuye al médico indicado y al comercial que lo tenía asignado en ese momento.',
    'La venta a centro con descuento no cuenta como prescripción de ningún médico.',
    'Si un pedido no tiene médico reconocido, queda en la bandeja «sin atribuir» para asignarlo a mano.',
    'Solo televenta y administración crean o cambian pedidos.']],
  analitica: ['Analítica', 'Unidades o importe agrupados como elijas.', [
    'Elige la dimensión: médico, comercial, producto, municipio, mes o canal.',
    'La tabla por meses sirve para ver tendencias.',
    'Las descargas están en «⋮».']],
  config: ['Configuración', 'Ajustes de tu cuenta y de la plataforma.', [
    'Preferencias de salida y llegada: se usan para calcular las rutas.',
    'Navegador de mapas preferido.',
    'Plantillas del resumen semanal.',
    'Clasificadores: las opciones que aparecen al registrar visitas y en las fichas.']],
  admin: ['Administración', 'Usuarios, permisos y control.', [
    'Permisos por área: <b>Ver</b>, <b>Editar</b> o <b>Completo</b>. Se aplican en la base de datos, no solo en la pantalla.',
    'La cartera decide qué médicos ve cada comercial.',
    'Las comisiones se configuran por esquema y se asignan por persona.',
    'Accesos y auditoría registran entradas y cambios.']],
  duplicados: ['Duplicados', 'Fichas que pueden ser la misma persona.', [
    '<b>Pendientes</b>: marcadas al darlas de alta. <b>Nombres parecidos</b>: coincidencia del 80% o más.',
    'Al comparar eliges qué ficha queda y qué dato conservar de cada campo.',
    'Consultas, visitas, citas y cartera se juntan en la ficha que queda. No se puede deshacer desde la app.',
    '«No son duplicados» guarda la pareja como distinta y no vuelve a salir.']]
};

const ANCLAS_AYUDA = [
  ['#v-inicio .saludo h1', 'inicio'], ['#c-agenda > h2', 'ini_agenda'], ['#c-acciones > h2', 'ini_acciones'],
  ['#c-urgentes > h2', 'ini_urgentes'], ['#c-ultimas > h2', 'ini_ultimas'], ['#c-recom > h2', 'ini_recom'],
  ['#c-pend > h2', 'ini_pend'], ['#c-comision > h2', 'ini_comision'],
  ['#v-agenda .saludo h1', 'agenda'], ['#v-rutas .saludo h1', 'rutas'], ['#v-seguimiento .saludo h1', 'seguimiento'],
  ['#v-ventas .saludo h1', 'ventas'], ['#v-analitica .saludo h1', 'analitica'], ['#v-config .saludo h1', 'config'],
  ['#v-admin .saludo h1', 'admin'], ['#v-duplicados .saludo h1', 'duplicados']
];

function ponerAyudas() {
  ANCLAS_AYUDA.forEach(([sel, k]) => {
    const h = document.querySelector(sel);
    if (h && !h.querySelector(':scope > .ai')) h.insertAdjacentHTML('beforeend', `<button class="ai" data-ayuda="${k}" aria-label="Ayuda">i</button>`);
  });
  const dt = $('dirtools');
  if (dt && !(dt.previousElementSibling && dt.previousElementSibling.matches('.ai')))
    dt.insertAdjacentHTML('beforebegin', '<button class="ai ai-dir" data-ayuda="directorio" aria-label="Ayuda">i</button>');
}

document.addEventListener('click', e => {
  const b = e.target.closest('.ai');
  if (!b) return;
  e.preventDefault(); e.stopPropagation();
  const prev = document.querySelector('.aipop');
  if (prev) { const mismo = prev.__de === b; prev.remove(); if (mismo) return; }
  let tit, cuerpo;
  if (b.dataset.ayuda) {
    const [t, x, l] = AYUDA[b.dataset.ayuda] || ['Ayuda', '', []];
    tit = esc(t); cuerpo = esc(x) + (l.length ? `<ul>${l.map(i => `<li>${i}</li>`).join('')}</ul>` : '');
  } else { tit = esc(b.dataset.ayudaTit || 'Qué es'); cuerpo = esc(b.dataset.ayudaTxt || ''); }
  const pop = document.createElement('div');
  pop.className = 'aipop'; pop.__de = b;
  pop.innerHTML = `<b>${tit}</b>${cuerpo}`;
  document.body.appendChild(pop);
  const r = b.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
  let x = Math.min(window.innerWidth - w - 10, Math.max(10, r.left + r.width / 2 - w / 2));
  let y = r.bottom + 8; if (y + h > window.innerHeight - 10) y = Math.max(10, r.top - h - 8);
  pop.style.left = x + 'px'; pop.style.top = y + 'px';
}, true);


/* ============================================================
   DLC OS 2.0 · v2.18.0 · Arranque rápido, Inicio progresivo,
   pedidos con IVA y borrador, productos, pacientes y agenda
   ============================================================ */

Object.assign(RPC_TTL, { pacientes_lista: 30, comercial_de_medico: 60 });

/* ---------------- arranque: la app aparece al momento ----------------
   Si hay sesión guardada, se muestra la app con el último perfil conocido y se comprueba
   después. En la consola del navegador queda el tiempo de cada paso: [DLC OS] … ms */

const T0 = performance.now();
const marca = paso => console.info(`[App] ${paso} · ${Math.round(performance.now() - T0)} ms`);
const PKEY = 'dlc-perfil';
let APP_VISIBLE = false;

function mostrarApp(perfil) {
  PERFIL = perfil;
  $('bootsplash').classList.add('hide');
  $('login').classList.add('hide');
  $('app').classList.remove('hide');
  $('av').textContent = iniciales(perfil.nombre);
  $('uname').textContent = String(perfil.nombre).split(' ')[0];
  $('umnom').textContent = perfil.nombre;
  $('umrol').textContent = perfil.rol + ' · ' + perfil.email;
  document.querySelector('[data-u="adm"]').classList.toggle('hide', perfil.rol !== 'Administrador');
  const h = new Date().getHours();
  $('hola').textContent = (h < 13 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches') + ', ' + String(perfil.nombre).split(' ')[0];
  $('hoyfecha').textContent = fechaLarga(new Date()).replace(/^./, c => c.toUpperCase());
  $('nuevoBtn').classList.toggle('hide', !puedeCrear());
  $('dupBtn').classList.toggle('hide', perfil.rol !== 'Administrador');
  document.querySelectorAll('#nav [data-t="ventas"]').forEach(b => b.classList.toggle('hide', !veVentas()));
  if (!APP_VISIBLE) {
    APP_VISIBLE = true;
    cargarCatalogos();
    pintarRutaBarra();
    cargarInicio();
    cargarFiltros();
  }
}

function mostrarLogin(msg) {
  $('bootsplash').classList.add('hide');
  $('app').classList.add('hide');
  $('login').classList.remove('hide');
  if (msg) $('lmsg').textContent = msg;
  APP_VISIBLE = false;
}

async function arrancar() {
  marca('inicio del arranque');
  let guardado = null;
  try { guardado = JSON.parse(localStorage.getItem(PKEY) || 'null'); } catch (e) {}
  if (guardado && localStorage.getItem('dlc-os-sesion') && !APP_VISIBLE) {
    mostrarApp(guardado);
    marca('app visible con el perfil guardado');
  }

  const { data: { session } } = await db.auth.getSession();
  marca('sesión comprobada');
  if (!session) { localStorage.removeItem(PKEY); mostrarLogin(); return; }

  const { data: perfil, error } = await db.from('perfiles').select('*').eq('id', session.user.id).single();
  marca('perfil recibido');
  if (error || !perfil || !perfil.activo) {
    localStorage.removeItem(PKEY);
    await db.auth.signOut();
    mostrarLogin(perfil && !perfil.activo ? 'Tu usuario está desactivado.'
      : 'Tu usuario no tiene perfil en la plataforma. Avisa a administración.');
    return;
  }
  try { localStorage.setItem(PKEY, JSON.stringify(perfil)); } catch (e) {}
  const cambio = !guardado || JSON.stringify(guardado) !== JSON.stringify(perfil);
  if (!APP_VISIBLE) mostrarApp(perfil);
  else if (cambio) { mostrarApp(perfil); if (TAB === 'inicio') cargarInicio(); }
  db.rpc('registrar_acceso', { p_evento: 'Entrada', p_agente: navigator.userAgent }).catch(() => {});
}

/* ---------------- inicio: esqueleto y carga por partes ---------------- */

const skelCard = t => `<h2>${esc(t)}</h2><div class="skel" style="width:45%"></div><div class="skel"></div><div class="skel" style="width:70%"></div>`;

async function pintarInicio() {
  const sec = $('v-inicio');
  sec.classList.remove('ini-cargando');
  if (!$('inialerta')) sec.querySelector('.saludo').insertAdjacentHTML('afterend', '<div id="inialerta"></div>');
  const esAdmin = PERFIL.rol === 'Administrador';
  const cfg = kpiConfig().filter(x => x.on);

  // Cada bloque se pinta en cuanto llegan sus datos; mientras, se ve su esqueleto.
  const pComision = tarjetaComision().catch(() => {});
  const pRutas = tarjetasRuta().catch(() => {});
  const res = await rpcCache('panel_inicio', { lim: 6 }, 'inicio');
  marca('datos de Inicio recibidos');

  const data = res.data;
  if (!data) { $('c-agenda').innerHTML = '<h2>Tu agenda de hoy</h2><div class="vacio">Sin conexión y sin copia guardada todavía.</div>'; return; }
  const k = data.kpis;

  const avisoDup = () => {
    const nPend = (DUP_RES && DUP_RES.pendientes) || k.pendientes_unificar || 0;
    const nPar = (DUP_RES && DUP_RES.parecidos) || 0;
    $('inialerta').innerHTML = esAdmin && (nPend || nPar) ? `<div class="alerta">
        <span>⚠ ${[nPend ? `${num(nPend)} ${nPend === 1 ? 'ficha pendiente' : 'fichas pendientes'} de unificar` : '',
                  nPar ? `${num(nPar)}${nPar >= 200 ? '+' : ''} ${nPar === 1 ? 'posible duplicado' : 'posibles duplicados'} por nombre` : '']
                  .filter(Boolean).join(' y ')}</span>
        <button class="btn" data-k="dups">Revisar duplicados</button></div>` : '';
  };
  avisoDup();
  if (esAdmin) db.rpc('resumen_duplicados').then(r => { DUP_RES = r.data || null; avisoDup(); }).catch(() => {});

  const kpi = (n, t, cls, accion, ayuda) =>
    `<div class="kpi ${cls || ''} ${accion ? 'click' : ''}" ${accion ? `data-k="${accion}"` : ''}>
       ${ayuda ? `<button class="ai" data-ayuda-txt="${esc(ayuda)}" data-ayuda-tit="${esc(t)}" aria-label="Qué es">i</button>` : ''}
       <b>${typeof n === 'string' ? n : num(n)}</b><span>${esc(t.charAt(0).toUpperCase() + t.slice(1))}</span></div>`;

  $('kpis').innerHTML = cfg.map((x, i) => {
    if (x.filtro) return `<div class="kpi click" data-kf="${esc(JSON.stringify(x.filtro))}" data-kfi="${i}">
        <button class="ai" data-ayuda-txt="${esc(AYUDA_KPI.filtro + ' Filtro: ' + textoFiltro(x.filtro) + '.')}" data-ayuda-tit="${esc(x.t || 'Filtro guardado')}" aria-label="Qué es">i</button>
        <b class="cont"><span class="spin" style="width:18px;height:18px;border-width:2px;display:inline-block"></span></b><span>${esc(x.t || textoFiltro(x.filtro))}</span></div>`;
    const c = KPI_CAT.find(y => y.id === x.id);
    if (!kpiPermitido(c)) return '';
    return kpi(c.v(k), x.t || c.t, c.cls ? c.cls(k) : '', c.h, AYUDA_KPI[c.id]);
  }).join('');
  if (res.cache) avisoCache($('kpis'), res.fecha);
  cfg.forEach((x, i) => {
    if (!x.filtro) return;
    contarFiltro(x.filtro).then(n => {
      const b = document.querySelector(`#kpis [data-kfi="${i}"] .cont`); if (b) b.textContent = num(n);
    }).catch(() => {});
  });

  tarjeta($('c-agenda'), 'Tu agenda de hoy', data.agenda_hoy.length,
    data.agenda_hoy.map(a => itemHTML(a.medico_id, a.hora ? esc(a.hora).slice(0, 5) : '·',
      a.estado === 'Visitada' ? 'o' : '', a.nombre,
      `${esc(a.centro_nombre || '')} · <b style="color:${a.estado === 'Visitada' ? 'var(--ok)' : 'var(--navy)'}">${esc(a.estado)}</b>`)),
    '', 'No tienes citas para hoy. En Agenda tienes sugerencias para el día.');
  tarjeta($('c-acciones'), 'Próximas acciones', data.acciones.length,
    data.acciones.map(a => itemHTML(a.medico_id, '↻', a.proxima_fecha < hoyISO() ? 'w' : '', a.nombre,
      `<b style="color:${a.proxima_fecha < hoyISO() ? 'var(--warn)' : 'var(--navy)'}">${fechaCorta(a.proxima_fecha)}</b> · ${esc(a.proxima_accion || 'Seguimiento')}`)),
    '', 'Sin acciones pendientes en los próximos 7 días.');
  tarjeta($('c-urgentes'), 'Urgentes sin visitar', k.urgentes,
    data.urgentes.map(u => itemHTML(u.medico_id, '!', 'w', u.nombre,
      `${esc(u.especialidad || '')} · ${esc(u.centro_nombre || u.municipio || '')}`)),
    k.urgentes > 6 ? `<button class="verlo" data-k="urgentes">Ver los ${num(k.urgentes)} urgentes</button>` : '',
    'Todos los urgentes están visitados.');
  tarjeta($('c-ultimas'), 'Últimas visitas', null,
    data.ultimas_visitas.map(v => itemHTML(v.medico_id, '✓', 'o', v.nombre,
      `${fechaCorta(v.fecha)} · ${esc((v.resultados || []).join(' + ') || 'Sin resultado')}`)),
    '', 'Todavía no hay visitas registradas.');
  ponerAyudas();
  await Promise.all([pComision, pRutas]);
  marca('Inicio completo');
}

/* ---------------- cálculos de IVA ---------------- */

const r2 = n => Math.round((+n || 0) * 100) / 100;
const eurI = n => eur(r2(n));

/** Mismo cálculo que la base de datos: descuento de línea, descuento general y luego IVA. */
function totalesPedido(lineas, d, dt) {
  const ls = lineas.map(l => ({ b: (+l.importe || 0) * (1 - (+l.descuento || 0) / 100), iva: +l.iva || 0, u: +l.unidades || 0 }));
  const sb = ls.reduce((n, l) => n + l.b, 0);
  const k = !+d || !sb ? 1 : dt === 'importe' ? Math.max(0, 1 - d / sb) : Math.max(0, 1 - d / 100);
  const porIva = {};
  ls.forEach(l => { porIva[l.iva] = (porIva[l.iva] || 0) + l.b * k * l.iva / 100; });
  const iva = Object.values(porIva).reduce((n, x) => n + x, 0);
  return { unidades: ls.reduce((n, l) => n + l.u, 0), bruto: sb, descuento: sb * (1 - k), base: sb * k, iva, porIva, total: sb * k + iva };
}

function lineaDesglose(l) {
  const bruto = +l.importe || 0, base = bruto * (1 - (+l.descuento || 0) / 100), iva = base * (+l.iva || 0) / 100;
  return { bruto, base, iva, total: base + iva };
}

function bloqueTotales(t) {
  return `<div><span>Unidades</span><b>${num(t.unidades)}</b></div>
    ${t.descuento > 0.004 ? `<div><span>Suma de líneas</span><b>${eurI(t.bruto)}</b></div>` : ''}
    ${t.descuento > 0.004 ? `<div><span>Descuento general</span><b>−${eurI(t.descuento)}</b></div>` : ''}
    <div><span>Base imponible</span><b>${eurI(t.base)}</b></div>
    ${Object.keys(t.porIva).filter(k => t.porIva[k] > 0.004 || Object.keys(t.porIva).length === 1)
      .map(k => `<div><span>IVA ${k}%</span><b>${eurI(t.porIva[k])}</b></div>`).join('')}
    <div class="tot"><span>Total con IVA</span><b>${eurI(t.total)}</b></div>`;
}

/* ---------------- ventas: pedidos, pacientes y productos ---------------- */

let VSEC = 'pedidos';
const PAC = { q: '', medico: null, medicoNombre: '', pagina: 0 };
const pillEstado = e => `<span class="pill ${e === 'Borrador' ? 'p-bor' : e === 'Anulado' ? 'p-anu' : 'p-est'}">${esc(e === 'Confirmado' ? 'Validado' : e)}</span>`;

async function cargarVentas() {
  const esAdmin = PERFIL.rol === 'Administrador';
  const accion = VSEC === 'pedidos' ? (puedeVentas() ? '<button class="btn" id="pednuevo">+ Nuevo pedido</button>' : '')
    : VSEC === 'pacientes' ? (puedeVentas() ? '<button class="btn" id="pacnuevo">+ Nuevo paciente</button>' : '')
    : (esAdmin ? '<button class="btn" id="prodnuevo">+ Nuevo producto</button>' : '');
  $('v-ventas').innerHTML = `
    <div class="saludo"><div><h1>Ventas</h1><div class="fecha">Pedidos, pacientes y productos</div></div>
      <div class="acts" style="margin:0">${accion}</div></div>
    <div class="subnav">
      <button data-vs="pedidos" aria-pressed="${VSEC === 'pedidos'}">Pedidos</button>
      <button data-vs="pacientes" aria-pressed="${VSEC === 'pacientes'}">Pacientes</button>
      <button data-vs="productos" aria-pressed="${VSEC === 'productos'}">Productos</button>
      <button class="ai" data-ayuda="${VSEC === 'pedidos' ? 'ventas' : VSEC}" aria-label="Ayuda" style="align-self:center">i</button></div>
    <div id="vcuerpo"></div>`;
  $('v-ventas').querySelectorAll('[data-vs]').forEach(b => b.onclick = () => { VSEC = b.dataset.vs; cargarVentas(); });
  if ($('pednuevo')) $('pednuevo').onclick = () => editorPedido();
  if ($('pacnuevo')) $('pacnuevo').onclick = () => editorContacto({}, c => fichaPaciente(c.id));
  if ($('prodnuevo')) $('prodnuevo').onclick = () => editorProducto(null);
  await cargarProductos();
  if (VSEC === 'pacientes') return pintarPacientes();
  if (VSEC === 'productos') return pintarProductos();

  $('vcuerpo').innerHTML = `
    <div class="card" id="cardsinatr"></div>
    <div class="panel">
      <div class="filtros">
        <div><label for="pdesde">Desde</label><input id="pdesde" type="date"></div>
        <div><label for="phasta">Hasta</label><input id="phasta" type="date"></div>
        <div><label for="pcanal">Canal</label><select id="pcanal">
          <option value="">Todos</option><option value="paciente">Recomendación a paciente</option>
          <option value="centro">Venta a centro</option></select></div>
        <div><label for="pq">Buscar</label><input id="pq" placeholder="Médico, paciente o nº de pedido"></div>
      </div>
      <div class="cuenta" id="pcuenta">Cargando…</div>
      <div id="pedlista"></div>
    </div>`;
  ['pdesde', 'phasta', 'pcanal'].forEach(id => $(id).onchange = listaPedidos);
  let tq; $('pq').oninput = () => { clearTimeout(tq); tq = setTimeout(listaPedidos, 350); };
  listaPedidos();
  pintarSinAtribuir();
}

async function listaPedidos() {
  cargando($('pedlista'), 'Cargando pedidos…');
  const { data, error } = await db.rpc('pedidos_lista', {
    p_desde: $('pdesde').value || null, p_hasta: $('phasta').value || null,
    p_canal: $('pcanal').value || null, q: ($('pq') && $('pq').value.trim()) || null, lim: 500
  });
  if (error) { $('pcuenta').textContent = 'No se ha podido cargar: ' + error.message; return; }
  PEDIDOS = data || [];
  const validos = PEDIDOS.filter(p => p.estado !== 'Anulado' && p.estado !== 'Borrador');
  const bor = PEDIDOS.filter(p => p.estado === 'Borrador').length;
  $('pcuenta').innerHTML = `<b>${num(PEDIDOS.length)}</b> pedidos · <b>${num(validos.reduce((n, p) => n + (p.unidades || 0), 0))}</b> unidades validadas
    · <b>${eurI(validos.reduce((n, p) => n + (+p.total || 0), 0))}</b> con IVA${bor ? ` · <b style="color:var(--warn)">${bor}</b> en borrador` : ''}`;
  $('pedlista').innerHTML = PEDIDOS.length ? `<div>${PEDIDOS.map(p => `
    <button class="fila" data-ped="${p.id}" style="grid-template-columns:minmax(0,1.4fr) minmax(0,1.4fr) auto auto;${p.estado === 'Anulado' ? 'opacity:.55' : ''}">
      <span><span class="nm">${esc(p.contacto || p.centro || p.medico || 'Sin contacto')}</span>
        <span class="sm">${fechaCorta(p.fecha)} · ${p.canal === 'centro' ? 'Venta a centro' : 'Recomendación'}${p.medico ? ' · ' + esc(p.medico) : ' · sin médico'}${p.comercial ? ' · ' + esc(p.comercial) : ''}</span></span>
      <span class="c2"><span class="sm">${esc(p.productos || '')}</span>
        <span class="sm">${p.numero ? 'Nº ' + esc(p.numero) + ' · ' : ''}${num(p.unidades)} uds.</span></span>
      <span class="c3">${pillEstado(p.estado)}</span>
      <span style="text-align:right"><b style="font-size:16px;color:var(--navy)">${eurI(p.total)}</b>
        <span class="sm" style="display:block">base ${eurI(p.base)} · IVA ${eurI(p.iva)}</span></span>
    </button>`).join('')}</div>` : '<div class="vacio">Todavía no hay pedidos registrados.</div>';
  $('pedlista').querySelectorAll('[data-ped]').forEach(b => b.onclick = () => verPedido(b.dataset.ped));
}

/* ---------------- editor de pedido ---------------- */

async function editorPedido(pedido) {
  if (!PRODUCTOS.length) await cargarProductos();
  const ped = pedido && pedido.pedido ? pedido.pedido : null;
  if (ped && ped.estado !== 'Borrador') { toast('Un pedido validado no se puede editar. Anúlalo si hace falta.', true); return; }
  const prod = id => PRODUCTOS.find(p => p.id === id) || {};
  let lineas = pedido && pedido.lineas && pedido.lineas.length
    ? pedido.lineas.map(l => ({ producto_id: l.producto_id, producto: l.producto, unidades: l.unidades, importe: l.importe,
        descuento: l.descuento || 0, iva: l.iva != null ? +l.iva : prod(l.producto_id).iva,
        // Solo es manual si el importe no coincide con precio × unidades
        manual: prod(l.producto_id).precio == null || r2(prod(l.producto_id).precio * l.unidades) !== r2(l.importe) }))
    : [{ producto_id: productoPorDefecto(), unidades: 1, descuento: 0 }];
  let medico = pedido && pedido.medico ? pedido.medico
    : (pedido && pedido.lineas && pedido.lineas[0] && pedido.lineas[0].medico_id ? { id: pedido.lineas[0].medico_id, nombre: pedido.lineas[0].medico } : null);
  let contacto = pedido && pedido.contacto ? pedido.contacto : null;
  if (!medico && contacto && contacto.medico_id) medico = { id: contacto.medico_id, nombre: contacto.medico || 'Médico del paciente', codigo: contacto.medico_codigo || '' };
  const autoImporte = l => { const p = prod(l.producto_id); if (!l.manual && p.precio != null) l.importe = r2(p.precio * (+l.unidades || 0)); if (l.iva == null || !l.manualIva) l.iva = p.iva != null ? +p.iva : l.iva; };
  lineas.forEach(l => { if (l.importe == null) autoImporte(l); if (l.iva == null) l.iva = prod(l.producto_id).iva || 0; });
  // Datos del formulario que se conservan al repintar
  const form = { fecha: ped ? ped.fecha : hoyISO(), canal: ped ? ped.canal : 'paciente', forma_pago: ped ? ped.forma_pago : '',
    descuento: ped ? (ped.descuento || 0) : 0, descuento_tipo: ped ? ped.descuento_tipo : 'porcentaje', nota: ped ? ped.nota || '' : '',
    medico_texto: ped ? ped.medico_texto || '' : '',
    servicio_id: ped ? (ped.envio ? (ped.servicio_id || ((SERVICIOS[0] || {}).id) || '') : '') : ((SERVICIOS.find(x => x.por_defecto && x.activo) || {}).id || ''),
    envio: ped ? !!ped.envio : !!SERVICIOS.find(x => x.por_defecto && x.activo),
    envio_iva: ped && ped.envio ? +ped.envio_iva : +((SERVICIOS.find(x => x.por_defecto && x.activo) || {}).iva ?? 21),
    envio_con: ped && ped.envio ? r2(+ped.envio_base * (1 + (+ped.envio_iva || 0) / 100)) : +((SERVICIOS.find(x => x.por_defecto && x.activo) || {}).pvp || 0) };
  const leerForm = () => {
    if (!$('pfecha')) return;
    Object.assign(form, { fecha: $('pfecha').value, canal: $('pcan').value, forma_pago: $('ppago').value,
      descuento: $('pdto').value, descuento_tipo: $('pdtot').value, nota: $('pnota').value,
      envio: $('penv').checked, envio_con: +$('penvi').value || 0, envio_iva: +$('penvv').value || 0, servicio_id: $('pserv').value,
      medico_texto: $('pselmed') ? ($('pselmed').__texto || '') : form.medico_texto });
  };

  const pinta = () => {
    leerForm();
    $('dbody').innerHTML = `
      <div class="fh"><div><h2>${ped ? 'Editar borrador' : 'Nuevo pedido'}</h2>
        <div class="sm">Escribe los importes con IVA: la base y el IVA se calculan solos.</div></div>
        <button class="x" data-cerrar aria-label="Cerrar">✕</button></div>
      <div class="g2">
        <div><label for="pfecha">Fecha</label><input id="pfecha" type="date" value="${esc(form.fecha)}"></div>
        <div><label for="pcan">Canal</label><select id="pcan">
          <option value="paciente" ${form.canal !== 'centro' ? 'selected' : ''}>Recomendación a paciente</option>
          <option value="centro" ${form.canal === 'centro' ? 'selected' : ''}>Venta a centro (con descuento)</option></select></div>
      </div>
      <div id="zonapac" class="${form.canal === 'centro' ? 'hide' : ''}">
        <label>Paciente</label><div id="pselpac"></div>
        <label>Médico que lo recomienda</label><div id="pselmed"></div>
        <div class="sm" style="margin-top:4px">Si no lo encuentras, deja el nombre escrito: el pedido quedará pendiente de atribuir.</div>
      </div>
      <label>Líneas</label>
      <div id="plineas">${lineas.map((l, i) => `<div class="lin" data-li="${i}">
        <div class="lrow">
          <div><label>Producto</label><select data-f="producto_id">${opcionesProducto(l.producto_id, l.producto)}</select></div>
          <div><label>Unidades</label><input data-f="unidades" type="number" min="1" value="${l.unidades}"></div>
          <div><label>Importe con IVA</label><input data-f="importeiva" type="number" step="0.01" min="0" value="${l.importe != null ? r2(l.importe * (1 + (+l.iva || 0) / 100)) : ''}"></div>
          <div><label>% dto.</label><input data-f="descuento" type="number" step="1" min="0" max="100" value="${l.descuento || 0}"></div>
          <div>${lineas.length > 1 ? `<button type="button" class="btn sec" data-lx="${i}" aria-label="Quitar línea">✕</button>` : ''}</div>
        </div>
        <div class="ldes" data-des="${i}"></div></div>`).join('')}</div>
      <div class="acts" style="margin-top:0"><button type="button" class="btn sec" id="plmas">+ Añadir línea</button></div>
      <div class="g2">
        <div><label for="ppago">Forma de pago</label><select id="ppago"><option value=""></option>
          ${(CAT.FORMA_PAGO || []).map(x => `<option ${form.forma_pago === x.valor ? 'selected' : ''}>${esc(x.valor)}</option>`).join('')}</select></div>
        <div><label for="pdto">Descuento general</label>
          <div style="display:flex;gap:6px"><input id="pdto" type="number" min="0" step="0.01" value="${esc(form.descuento)}">
            <select id="pdtot" style="max-width:110px"><option value="porcentaje">%</option>
              <option value="importe" ${form.descuento_tipo === 'importe' ? 'selected' : ''}>€</option></select></div></div>
      </div>
      <div class="envbox">
        <label for="pserv" style="margin-top:0">Servicio</label>
        <select id="pserv"><option value="">Sin servicio</option>${SERVICIOS.filter(x => x.activo || x.id === form.servicio_id).map(x =>
          `<option value="${x.id}" ${form.servicio_id === x.id ? 'selected' : ''}>${esc(x.nombre)} · ${eurI(x.pvp || 0)} con IVA</option>`).join('')}</select>
        <input type="checkbox" id="penv" class="hide" ${form.envio ? 'checked' : ''}>
        <div class="g2 ${form.envio ? '' : 'hide'}" id="penvd">
          <div><label for="penvi">Importe del servicio con IVA (€)</label><input id="penvi" type="number" step="0.01" min="0" value="${esc(form.envio_con)}"></div>
          <div><label for="penvv">IVA del servicio (%)</label><input id="penvv" type="number" step="1" min="0" max="21" value="${esc(form.envio_iva)}"></div></div>
      </div>
      <div class="totbox" id="ptot"></div>
      <label for="pnota">Nota</label><input id="pnota" value="${esc(form.nota)}">
      <div class="acts" style="justify-content:flex-end">
        <button class="btn sec" data-cerrar>Cancelar</button>
        <button class="btn sec" id="pborr">Guardar borrador</button>
        <button class="btn" id="pvalid">Guardar y validar</button></div>`;

    const desglose = () => {
      lineas.forEach((l, i) => {
        const d = lineaDesglose(l), el = $('plineas').querySelector(`[data-des="${i}"]`);
        if (el) el.innerHTML = `<span>Base <b>${eurI(d.base)}</b></span><span>IVA ${num(l.iva || 0)}% <b>${eurI(d.iva)}</b></span><span>Total <b>${eurI(d.total)}</b></span>
          ${prod(l.producto_id).precio != null ? `<span>Precio unidad ${eurI(prod(l.producto_id).precio * (1 + (+prod(l.producto_id).iva || 0) / 100))} con IVA</span>` : ''}`;
      });
      $('penvd').classList.toggle('hide', !$('penv').checked);
      $('ptot').innerHTML = bloqueTotales(totalesPedido(lineas, +$('pdto').value || 0, $('pdtot').value,
        { on: $('penv').checked, con: +$('penvi').value || 0, iva: +$('penvv').value || 0,
          nombre: ((SERVICIOS.find(x => x.id === $('pserv').value) || {}).nombre) || 'Servicio' }));
    };

    $('plineas').oninput = $('plineas').onchange = e => {
      const box = e.target.closest('[data-li]'); if (!box) return;
      const l = lineas[+box.dataset.li], f = e.target.dataset.f;
      if (!f) return;
      l[f] = f === 'producto_id' ? e.target.value : (e.target.value === '' ? null : +e.target.value);
      if (f === 'importeiva') { l.importe = e.target.value === '' ? null : +e.target.value / (1 + (+l.iva || 0) / 100); delete l.importeiva; l.manual = true; }
      if (f === 'producto_id') { l.manual = false; l.iva = prod(l.producto_id).iva || 0; }
      if (f === 'producto_id' || f === 'unidades') {
        autoImporte(l);
        box.querySelector('[data-f="importeiva"]').value = l.importe != null ? r2(l.importe * (1 + (+l.iva || 0) / 100)) : '';
      }
      desglose();
    };
    $('plmas').onclick = () => { lineas.push({ producto_id: productoPorDefecto(), unidades: 1, descuento: 0 }); autoImporte(lineas[lineas.length - 1]); pinta(); };
    $('plineas').querySelectorAll('[data-lx]').forEach(b => b.onclick = () => { lineas.splice(+b.dataset.lx, 1); pinta(); });
    $('pcan').onchange = () => $('zonapac').classList.toggle('hide', $('pcan').value === 'centro');
    ['pdto', 'pdtot', 'penv', 'penvi', 'penvv'].forEach(id => $(id).oninput = $(id).onchange = desglose);
    $('pserv').onchange = () => {
      const sv = SERVICIOS.find(x => x.id === $('pserv').value);
      $('penv').checked = !!sv;
      if (sv) { $('penvi').value = r2(sv.pvp || 0); $('penvv').value = sv.iva != null ? sv.iva : 21; }
      desglose();
    };
    desglose();

    const montarMed = () => {
      $('pselmed').__texto = medico ? '' : form.medico_texto;
      selectorMedico($('pselmed'), { valor: medico, placeholder: 'Nombre, código, centro o municipio', alElegir: m => { medico = m; } });
    };
    selectorPaciente($('pselpac'), { valor: contacto, alElegir: c => {
      contacto = c;
      if (c && !medico && c.medico_id) { medico = { id: c.medico_id, nombre: c.medico, codigo: c.medico_codigo }; montarMed(); }
    } });
    montarMed();

    const guardar = async (estado, btn) => {
      if (!lineas.some(l => l.producto_id)) { toast('Añade al menos un producto', true); return; }
      if (estado === 'Confirmado' && !await preguntar('Una vez validado, el pedido cuenta en métricas y comisiones y ya no se puede editar ni eliminar: solo anular.',
        { titulo: '¿Validar el pedido?', ok: 'Validar' })) return;
      btn.disabled = true; const txt = btn.textContent; btn.textContent = 'Guardando…';
      const { data: r, error } = await db.rpc('guardar_pedido', { p: {
        id: ped ? ped.id : null, estado,
        fecha: $('pfecha').value, canal: $('pcan').value,
        medico_id: medico ? medico.id : null, medico_texto: medico ? '' : ($('pselmed').__texto || '').trim(),
        contacto_id: contacto ? contacto.id : null, nota: $('pnota').value.trim(),
        forma_pago: $('ppago').value || null,
        descuento: +$('pdto').value || 0, descuento_tipo: $('pdtot').value,
        envio: $('penv').checked, envio_con_iva: +$('penvi').value || 0, envio_iva: +$('penvv').value || 0, servicio_id: $('pserv').value || null,
        lineas: lineas.filter(l => l.producto_id).map(l => ({ producto_id: l.producto_id, unidades: l.unidades || 1,
          importe: l.importe, descuento: l.descuento || 0, iva: l.iva })),
        op_id: 'p-' + Date.now()
      }});
      btn.disabled = false; btn.textContent = txt;
      if (error || (r && r.ok === false)) {
        toast(r && r.error === 'validado' ? 'Ese pedido ya está validado y no se puede editar'
          : 'No se ha podido guardar: ' + ((error && error.message) || 'sin permiso'), true);
        return;
      }
      $('dlg').close();
      toast(estado === 'Borrador' ? 'Borrador guardado' : (medico ? 'Pedido validado y atribuido' : 'Pedido validado · pendiente de atribuir'));
      if (TAB === 'ventas') cargarVentas();
      if (TAB === 'pacientes') listaPacientes();
      if ($('ficha').open && FICHA_PAC) fichaPaciente(FICHA_PAC);
    };
    $('pborr').onclick = e => guardar('Borrador', e.target);
    $('pvalid').onclick = e => guardar('Confirmado', e.target);
  };
  pinta();
  $('dlg').showModal();
}

/* ---------------- detalle de pedido ---------------- */

async function verPedido(id) {
  cargando($('dbody'), 'Abriendo el pedido…');
  $('dlg').showModal();
  const { data, error } = await RPC_ORIG('pedido_detalle', { p_id: id });
  if (error || !data || !data.pedido) { $('dbody').innerHTML = `<div class="vacio">${esc(error ? error.message : 'No se ha encontrado el pedido.')}</div>`; return; }
  const p = data.pedido, l = data.lineas || [], c = data.contacto;
  const t = totalesPedido(l, +p.descuento || 0, p.descuento_tipo,
    { on: !!p.envio, con: r2(+p.envio_base * (1 + (+p.envio_iva || 0) / 100)), iva: +p.envio_iva || 0,
      nombre: ((SERVICIOS.find(x => x.id === p.servicio_id) || {}).nombre) || 'Envío' });
  const bor = p.estado === 'Borrador', anulado = p.estado === 'Anulado';

  $('dbody').innerHTML = `
    <div class="fh"><div><h2>Pedido ${esc(p.numero || '')} ${pillEstado(p.estado)}</h2>
      <div class="sm">${fechaCorta(p.fecha)} · ${p.canal === 'centro' ? 'Venta a centro' : 'Recomendación a paciente'}${p.forma_pago ? ' · ' + esc(p.forma_pago) : ''}</div></div>
      <button class="x" data-cerrar aria-label="Cerrar">✕</button></div>
    ${bor ? '<div class="cacheaviso" style="margin-top:10px">Borrador: todavía no cuenta en métricas ni en comisiones.</div>' : ''}
    ${c ? `<div class="blk"><h3>Paciente</h3><div><b>${esc(c.nombre)}</b></div>
      <div class="sm">${esc(c.telefono || c.movil || '')} ${esc(c.email || '')}</div>
      <div class="acts"><button class="btn sec" data-vpac="${c.id}">Ver ficha del paciente</button></div></div>` : ''}
    ${data.medico ? `<div class="blk"><h3>Médico</h3><div><b>${esc(data.medico.nombre)}</b> <span class="sm">· código ${esc(data.medico.codigo)}</span></div>
      ${l[0] && l[0].comercial ? `<div class="sm">Comercial: ${esc(l[0].comercial)}</div>` : ''}</div>` : ''}
    <div class="blk"><h3>Líneas</h3>
      ${l.map(x => { const d = lineaDesglose(x); return `<div style="display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-top:1px solid var(--line)">
        <span><b>${esc(x.producto || 'Sin producto')}</b> · ${num(x.unidades)} uds.
          <div class="sm">Base ${eurI(d.base)}${+x.descuento ? ` (dto. ${num(x.descuento)}%)` : ''} · IVA ${num(x.iva || 0)}% ${eurI(d.iva)}</div></span>
        <b style="white-space:nowrap">${eurI(d.total)}</b></div>`; }).join('') || '<div class="sm">Sin líneas.</div>'}
      <div class="totbox">${bloqueTotales(t)}</div></div>
    ${p.nota ? `<div class="blk"><h3>Nota</h3><div>${esc(p.nota)}</div></div>` : ''}
    <div class="acts" style="justify-content:flex-end">
      ${puedeVentas() && bor ? `<button class="btn sec dang" id="pdborrar">Eliminar borrador</button>
        <button class="btn sec" id="pdeditar">Editar</button>
        <button class="btn" id="pdvalidar">Validar pedido</button>` : ''}
      ${puedeVentas() && !bor && !anulado ? '<button class="btn sec dang" id="pdanular">Anular pedido</button>' : ''}
      <button class="btn sec" data-cerrar>Cerrar</button></div>`;

  const vp = $('dbody').querySelector('[data-vpac]');
  if (vp) vp.onclick = () => { $('dlg').close(); fichaPaciente(vp.dataset.vpac); };
  if ($('pdeditar')) $('pdeditar').onclick = () => editorPedido(data);
  if ($('pdborrar')) $('pdborrar').onclick = async () => {
    if (!await preguntar('El borrador desaparece por completo.', { titulo: '¿Eliminar el borrador?', ok: 'Eliminar', peligro: true })) return;
    const { data: r, error: e } = await db.rpc('borrar_pedido', { p_id: id });
    if (e || (r && r.ok === false)) { toast(r && r.error === 'validado' ? 'Solo se pueden eliminar borradores' : 'No se ha podido eliminar', true); return; }
    $('dlg').close(); toast('Borrador eliminado'); if (TAB === 'ventas') cargarVentas();
  };
  if ($('pdvalidar')) $('pdvalidar').onclick = async e => {
    if (!await preguntar('Una vez validado, el pedido cuenta en métricas y comisiones y ya no se puede editar ni eliminar: solo anular.',
      { titulo: '¿Validar el pedido?', ok: 'Validar' })) return;
    e.target.disabled = true;
    const { data: r, error: er } = await db.rpc('guardar_pedido', { p: {
      id, estado: 'Confirmado', fecha: p.fecha, canal: p.canal, contacto_id: p.contacto_id, centro_id: p.centro_id,
      medico_id: data.medico ? data.medico.id : null, medico_texto: p.medico_texto, nota: p.nota, forma_pago: p.forma_pago,
      descuento: p.descuento || 0, descuento_tipo: p.descuento_tipo,
      envio: !!p.envio, envio_con_iva: p.envio ? r2(+p.envio_base * (1 + (+p.envio_iva || 0) / 100)) : 0, envio_iva: p.envio_iva, servicio_id: p.servicio_id,
      lineas: l.map(x => ({ producto_id: x.producto_id, unidades: x.unidades, importe: x.importe, descuento: x.descuento, iva: x.iva })) } });
    e.target.disabled = false;
    if (er || (r && r.ok === false)) { toast('No se ha podido validar: ' + ((er && er.message) || (r && r.error) || ''), true); return; }
    toast('Pedido validado'); verPedido(id); if (TAB === 'ventas') cargarVentas();
  };
  if ($('pdanular')) $('pdanular').onclick = async () => {
    const motivo = await pedirTexto('Motivo de la anulación (opcional)', '', { titulo: '¿Anular el pedido?', ok: 'Anular' });
    if (motivo === null) return;
    const { data: r, error: er } = await db.rpc('anular_pedido', { p_id: id, p_motivo: motivo || null });
    if (er || (r && r.ok === false)) { toast('No se ha podido anular: ' + ((er && er.message) || (r && r.error) || ''), true); return; }
    $('dlg').close(); toast('Pedido anulado'); if (TAB === 'ventas') cargarVentas();
  };
}

/* ---------------- pacientes ---------------- */

let FICHA_PAC = null;

async function pintarPacientes() {
  $('vcuerpo').innerHTML = `
    <div class="panel">
      <div class="filtros">
        <div style="grid-column:span 2"><label for="pacq">Buscar</label>
          <input id="pacq" value="${esc(PAC.q)}" placeholder="Nombre, teléfono, email o NIF"></div>
        <div><label>Médico</label><div id="pacmed" style="min-height:44px;display:flex;align-items:center">${PAC.medico
          ? `<button class="chip" id="pacmedx">${esc(PAC.medicoNombre)} ✕</button>`
          : '<span class="sm">Todos · filtra desde la ficha de un médico</span>'}</div></div>
      </div>
      <div class="cuenta" id="paccuenta">Cargando…</div>
      <div id="paclista"></div>
      <div id="pacpag"></div>
    </div>`;
  let tq;
  $('pacq').oninput = e => { clearTimeout(tq); tq = setTimeout(() => { PAC.q = e.target.value.trim(); PAC.pagina = 0; listaPacientes(); }, 300); };
  if ($('pacmedx')) $('pacmedx').onclick = () => { PAC.medico = null; PAC.medicoNombre = ''; PAC.pagina = 0; pintarPacientes(); };
  listaPacientes();
}

async function listaPacientes() {
  cargando($('paclista'), 'Buscando pacientes…');
  const { data, error } = await db.rpc('pacientes_lista', { q: PAC.q || null, p_medico: PAC.medico,
    lim: tamPagina(), desplaz: PAC.pagina * tamPagina() });
  if (error) { $('paccuenta').textContent = 'No se ha podido cargar: ' + error.message; $('paclista').innerHTML = ''; return; }
  $('paccuenta').innerHTML = `<b>${num(data.total)}</b> pacientes`;
  const f = data.filas || [];
  $('paclista').innerHTML = f.length ? f.map(x => `
    <button class="fila pac" data-pac="${x.id}">
      <span><span class="nm">${esc(x.nombre)}</span>
        <span class="sm">${esc([x.telefono || x.movil, x.email, x.municipio].filter(Boolean).join(' · ') || 'Sin datos de contacto')}</span></span>
      <span class="c2"><span class="nm" style="font-size:13.5px">${x.medico ? esc(x.medico) : '<span class="sm">Sin médico asignado</span>'}</span>
        <span class="sm">${x.comercial ? 'Comercial: ' + esc(x.comercial) : ''}</span></span>
      <span class="c3"><span class="sm">${x.ultimo_pedido ? 'Último pedido ' + fechaCorta(x.ultimo_pedido) : 'Sin pedidos'}</span></span>
      <span style="text-align:right"><b style="font-size:16px;color:var(--navy)">${num(x.unidades)}</b> <span class="sm">uds.</span>
        <span class="sm" style="display:block">${num(x.pedidos)} pedidos</span></span>
    </button>`).join('') : '<div class="vacio">Ningún paciente con estos filtros.</div>';
  $('paclista').querySelectorAll('[data-pac]').forEach(b => b.onclick = () => fichaPaciente(b.dataset.pac));
  paginador($('pacpag'), data.total, PAC.pagina, p => { PAC.pagina = p; listaPacientes(); }, () => { PAC.pagina = 0; listaPacientes(); });
}

async function verContacto(id) { $('dlg').close(); fichaPaciente(id); }

async function fichaPaciente(id) {
  FICHA_PAC = id; FICHA_ID = null;
  $('fbody').innerHTML = '<div class="skel" style="width:50%"></div><div class="skel"></div><div class="skel" style="width:80%"></div>';
  if (!$('ficha').open) $('ficha').showModal();
  const { data } = await RPC_ORIG('contacto_detalle', { p_id: id });
  if (FICHA_PAC !== id) return;
  if (!data || !data.contacto) { $('fbody').innerHTML = '<div class="vacio">No se ha encontrado el paciente.</div>'; return; }
  const c = data.contacto, m = data.medico, ped = data.pedidos || [];
  const validos = ped.filter(p => p.estado !== 'Anulado' && p.estado !== 'Borrador');
  const puede = puedeVentas();

  $('fbody').innerHTML = `
    <div class="fh"><div><h2>${esc(c.nombre)}</h2><div class="sm">Paciente${c.nif ? ' · NIF ' + esc(c.nif) : ''}</div></div>
      <button class="x" id="fpx" aria-label="Cerrar">✕</button></div>
    ${puede ? `<div class="acts"><button class="btn" id="fpnped">+ Nuevo pedido</button>
      <button class="btn sec" id="fpedit">Editar datos</button></div>` : ''}
    <div class="kpis" style="margin:10px 0 0;grid-template-columns:repeat(3,1fr)">
      <div class="kpi"><b>${num(validos.length)}</b><span>pedidos</span></div>
      <div class="kpi"><b>${num(data.total_unidades)}</b><span>unidades</span></div>
      <div class="kpi"><b>${eurI(validos.reduce((n, p) => n + (+p.total || 0), 0))}</b><span>con IVA</span></div></div>
    <div class="blk"><h3>Médico que lo trata</h3>
      ${m ? `<div><button class="kcfg" data-fpmed="${m.id}" style="font-size:15px">${esc(m.nombre)}</button>
          <span class="sm"> · código ${esc(m.codigo)}${m.especialidad ? ' · ' + esc(m.especialidad) : ''}</span></div>
        <div class="sm">${m.comercial ? 'Comercial: ' + esc(m.comercial) : 'Sin comercial asignado'}</div>`
        : '<div class="sm">Sin médico asignado. Las unidades de este paciente no se atribuyen a nadie hasta que lo asignes.</div>'}
      ${puede ? `<label>${m ? 'Cambiar de médico' : 'Asignar médico'}</label><div id="fpsel"></div>
        ${m ? '<div class="acts"><button class="btn sec" id="fpmedquitar">Quitar médico</button></div>' : ''}` : ''}
    </div>
    <div class="blk"><h3>Contacto</h3>
      ${[['Teléfono', c.telefono], ['Móvil', c.movil], ['Email', c.email],
         ['Dirección', [c.direccion, c.cp, c.municipio, c.provincia].filter(Boolean).join(', ')], ['Nota', c.nota]]
        .filter(x => x[1]).map(([k, v]) => `<div class="sm"><b style="color:var(--ink)">${k}:</b> ${esc(v)}</div>`).join('')
        || '<div class="sm">Sin datos de contacto.</div>'}</div>
    <div class="blk"><h3>Pedidos</h3>
      ${ped.map(p => `<button class="item" data-fpped="${p.id}" style="padding:8px 4px">
        <span class="tx"><b>${fechaCorta(p.fecha)} · ${esc(p.productos || 'Sin productos')}</b>
          <span class="sm">${num(p.unidades)} uds. · ${eurI(p.total)} con IVA${p.medico ? ' · ' + esc(p.medico) : ''}</span></span>
        ${pillEstado(p.estado)}</button>`).join('') || '<div class="sm">Todavía no tiene pedidos.</div>'}</div>`;

  $('fpx').onclick = () => { FICHA_PAC = null; $('ficha').close(); };
  $('fbody').querySelectorAll('[data-fpped]').forEach(b => b.onclick = () => verPedido(b.dataset.fpped));
  const bm = $('fbody').querySelector('[data-fpmed]');
  if (bm) bm.onclick = () => { FICHA_PAC = null; abrirFicha(bm.dataset.fpmed); };
  if ($('fpnped')) $('fpnped').onclick = () => editorPedido({ contacto: Object.assign({}, c, m ? { medico: m.nombre, medico_codigo: m.codigo } : {}) });
  if ($('fpedit')) $('fpedit').onclick = () => editorContacto(c, () => fichaPaciente(id));
  const asignar = async medicoId => {
    const { data: r, error } = await db.rpc('asignar_medico_paciente', { p_contacto: id, p_medico: medicoId });
    if (error || (r && r.ok === false)) { toast('No se ha podido guardar', true); return; }
    toast(medicoId ? 'Médico asignado' : 'Médico quitado'); fichaPaciente(id);
    if (TAB === 'pacientes') listaPacientes();
  };
  if ($('fpmedquitar')) $('fpmedquitar').onclick = () => asignar(null);
  if ($('fpsel')) selectorMedico($('fpsel'), { valor: null, placeholder: 'Busca el médico por nombre, centro o municipio', alElegir: x => { if (x) asignar(x.id); } });
}

/* ---------------- productos ---------------- */

async function pintarProductos() {
  const esAdmin = PERFIL.rol === 'Administrador';
  cargando($('vcuerpo'), 'Cargando productos…');
  const { data } = await RPC_ORIG('productos_lista', { p_todos: esAdmin });
  const l = data || [];
  $('vcuerpo').innerHTML = `<div class="panel">
    <div class="cuenta"><b>${num(l.filter(p => p.activo).length)}</b> productos activos${l.some(p => !p.activo) ? ` · ${num(l.filter(p => !p.activo).length)} inactivos` : ''}</div>
    <div>${l.map(p => `<button class="fila prod" data-prod="${p.id}" style="${p.activo ? '' : 'opacity:.55'}">
      <span class="pfoto" style="${p.foto_url ? `background-image:url('${esc(p.foto_url)}')` : ''}">${p.foto_url ? '' : '◧'}</span>
      <span><span class="nm">${esc(p.nombre)}${p.activo ? '' : ' <span class="sm">· inactivo</span>'}</span>
        <span class="sm">${esc([p.presentacion, p.referencia ? 'ref. ' + p.referencia : ''].filter(Boolean).join(' · ') || 'Sin presentación')}</span></span>
      <span class="c2"><span class="sm">Sin IVA</span><b>${p.precio != null ? eurI(p.precio) : '—'}</b></span>
      <span><span class="sm">IVA</span><b style="display:block">${num(p.iva || 0)}%</b></span>
      <span style="text-align:right"><span class="sm">Con IVA</span><b style="display:block;font-size:16px;color:var(--navy)">${p.pvp != null ? eurI(p.pvp) : '—'}</b></span>
    </button>`).join('') || '<div class="vacio">Todavía no hay productos.</div>'}</div></div>`;
  $('vcuerpo').querySelectorAll('[data-prod]').forEach(b => b.onclick = () => editorProducto(l.find(p => p.id === b.dataset.prod)));
}

function editorProducto(p) {
  const esAdmin = PERFIL.rol === 'Administrador';
  p = p || { iva: 10, activo: true, unidades_envase: 1 };
  const ro = esAdmin ? '' : 'disabled';
  $('dbody').innerHTML = `
    <div class="fh"><div><h2>${p.id ? esc(p.nombre) : 'Nuevo producto'}</h2>
      <div class="sm">${esAdmin ? 'Escribe el precio sin IVA o con IVA: el otro se calcula solo.' : 'Solo administración puede cambiar productos.'}</div></div>
      <button class="x" data-cerrar aria-label="Cerrar">✕</button></div>
    <div style="display:flex;gap:14px;align-items:center;margin-top:8px">
      <span class="pfoto" id="prfprev" style="width:72px;height:72px;${p.foto_url ? `background-image:url('${esc(p.foto_url)}')` : ''}">${p.foto_url ? '' : '◧'}</span>
      ${esAdmin ? '<div style="flex:1"><label for="prfoto" style="margin-top:0">Foto</label><input id="prfoto" type="file" accept="image/*"></div>' : ''}</div>
    <div class="g2">
      <div><label for="prn">Nombre</label><input id="prn" value="${esc(p.nombre || '')}" ${ro}></div>
      <div><label for="prp">Presentación</label><input id="prp" value="${esc(p.presentacion || '')}" placeholder="Caja de 30 sobres" ${ro}></div></div>
    <div class="pvp">
      <div><label for="prpr">Precio sin IVA (€)</label><input id="prpr" type="number" step="0.01" min="0" value="${p.precio != null ? +(+p.precio).toFixed(4) : ''}" ${ro}></div>
      <div><label for="priva">IVA (%)</label><input id="priva" type="number" step="1" min="0" max="21" value="${p.iva != null ? p.iva : 10}" ${ro}></div>
      <div><label for="prpvp">Precio con IVA (€)</label><input id="prpvp" type="number" step="0.01" min="0" value="${p.precio != null ? r2(p.precio * (1 + (+p.iva || 0) / 100)) : ''}" ${ro}></div></div>
    <div class="g2">
      <div><label for="prref">Referencia</label><input id="prref" value="${esc(p.referencia || '')}" ${ro}></div>
      <div><label for="prcb">Código de barras</label><input id="prcb" value="${esc(p.codigo_barras || '')}" ${ro}></div></div>
    <div class="g2">
      <div><label for="prue">Unidades por envase</label><input id="prue" type="number" min="1" value="${p.unidades_envase || 1}" ${ro}></div>
      <div><label for="prco">Coste (€, sin IVA)</label><input id="prco" type="number" step="0.01" min="0" value="${p.coste != null ? p.coste : ''}" ${ro}></div></div>
    ${esAdmin && p.id ? `<label class="opt" style="margin-top:12px"><input type="checkbox" id="pract" ${p.activo ? 'checked' : ''}> Activo: aparece al crear pedidos</label>` : ''}
    <div class="acts" style="justify-content:flex-end">
      <button class="btn sec" data-cerrar>${esAdmin ? 'Cancelar' : 'Cerrar'}</button>
      ${esAdmin ? `<button class="btn" id="prok">${p.id ? 'Guardar' : 'Crear producto'}</button>` : ''}</div>`;
  $('dlg').showModal();
  if (!esAdmin) return;

  const iva = () => (+$('priva').value || 0) / 100;
  $('prpr').oninput = () => { $('prpvp').value = $('prpr').value === '' ? '' : r2(+$('prpr').value * (1 + iva())); };
  $('prpvp').oninput = () => { $('prpr').value = $('prpvp').value === '' ? '' : +(+$('prpvp').value / (1 + iva())).toFixed(4); };
  $('priva').oninput = () => { if ($('prpr').value !== '') $('prpvp').value = r2(+$('prpr').value * (1 + iva())); };
  $('prfoto').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    $('prfprev').style.backgroundImage = `url('${URL.createObjectURL(f)}')`; $('prfprev').textContent = '';
  };
  $('prok').onclick = async ev => {
    if (!$('prn').value.trim()) { toast('Escribe el nombre', true); return; }
    ev.target.disabled = true; ev.target.textContent = 'Guardando…';
    let foto_url;
    const f = $('prfoto').files && $('prfoto').files[0];
    if (f) {
      const ruta = 'p-' + Date.now() + '-' + f.name.replace(/[^a-zA-Z0-9.]/g, '');
      const { error: eu } = await db.storage.from('productos').upload(ruta, f, { upsert: true });
      if (!eu) foto_url = db.storage.from('productos').getPublicUrl(ruta).data.publicUrl;
      else toast('La foto no se ha podido subir: ' + eu.message, true);
    }
    const { data: r, error } = await db.rpc('guardar_producto', { p: {
      id: p.id || null, nombre: $('prn').value.trim(), presentacion: $('prp').value.trim(),
      precio: $('prpr').value, iva: $('priva').value, referencia: $('prref').value.trim(),
      codigo_barras: $('prcb').value.trim(), unidades_envase: $('prue').value, coste: $('prco').value,
      ...(foto_url ? { foto_url } : {}), ...($('pract') ? { activo: $('pract').checked } : {}) } });
    ev.target.disabled = false; ev.target.textContent = p.id ? 'Guardar' : 'Crear producto';
    if (error || (r && r.ok === false)) { toast('No se ha podido guardar: ' + ((error && error.message) || (r && r.error) || ''), true); return; }
    $('dlg').close(); toast(p.id ? 'Producto guardado' : 'Producto creado');
    await cargarProductos(); if (TAB === 'productos') pintarProductos();
  };
}

/* ---------------- ficha del médico: comercial y pacientes ---------------- */

abrirFicha = (orig => async function (id) {
  FICHA_PAC = null;
  await orig(id);
  if (FICHA_ID !== id || !$('fbody').querySelector('.fh')) return;
  const esAdmin = PERFIL.rol === 'Administrador';
  if (esAdmin) {
    $('fbody').insertAdjacentHTML('beforeend', `<div class="blk" id="fcomblk"><h3>Comercial asignado</h3>
      <div style="display:flex;gap:8px"><select id="fcomsel" style="flex:1"><option>Cargando…</option></select>
        <button class="btn sec" id="fcomok">Guardar</button></div>
      <div class="sm" style="margin-top:6px">Las ventas nuevas se atribuyen al comercial asignado en ese momento. Las anteriores no cambian.</div></div>`);
    const [{ data: us }, { data: act }] = await Promise.all([db.rpc('usuarios_lista'), RPC_ORIG('comercial_de_medico', { p_medico: id })]);
    if (FICHA_ID !== id || !$('fcomsel')) return;
    $('fcomsel').innerHTML = '<option value="">Sin comercial</option>' + (us || []).filter(u => u.activo && (u.rol === 'Comercial' || (act && act.id === u.id)))
      .map(u => `<option value="${u.id}" ${act && act.id === u.id ? 'selected' : ''}>${esc(u.nombre)} · ${esc(u.rol)}</option>`).join('');
    $('fcomok').onclick = async ev => {
      ev.target.disabled = true;
      const { data: r, error } = await db.rpc('asignar_comercial_medico', { p_medico: id, p_usuario: $('fcomsel').value || null });
      ev.target.disabled = false;
      if (error || (r && r.ok === false)) { toast('No se ha podido asignar', true); return; }
      toast('Comercial asignado'); abrirFicha(id);
    };
  }
  if (esAdmin || ((PERFIL.areas || {}).V || 0) >= 1) {
    const { data } = await db.rpc('pacientes_lista', { q: null, p_medico: id, lim: 5, desplaz: 0 });
    if (FICHA_ID !== id || !data || !data.total) return;
    $('fbody').insertAdjacentHTML('beforeend', `<div class="blk"><h3>Pacientes<span class="n" style="margin-left:6px">${num(data.total)}</span></h3>
      ${data.filas.map(x => `<button class="item" data-fmpac="${x.id}" style="padding:7px 4px"><span class="tx"><b>${esc(x.nombre)}</b>
        <span class="sm">${num(x.unidades)} uds. · ${num(x.pedidos)} pedidos${x.ultimo_pedido ? ' · último ' + fechaCorta(x.ultimo_pedido) : ''}</span></span></button>`).join('')}
      ${data.total > 5 ? `<button class="verlo" id="fmpactodos" style="border-radius:8px;margin-top:6px">Ver los ${num(data.total)} pacientes</button>` : ''}</div>`);
    $('fbody').querySelectorAll('[data-fmpac]').forEach(b => b.onclick = () => fichaPaciente(b.dataset.fmpac));
    const nombre = ($('fbody').querySelector('.fh h2') || {}).textContent || '';
    if ($('fmpactodos')) $('fmpactodos').onclick = () => {
      $('ficha').close(); Object.assign(PAC, { q: '', medico: id, medicoNombre: nombre.replace(/^Urgente\s*/, ''), pagina: 0 }); ir('pacientes');
    };
  }
})(abrirFicha);

/* ---------------- agenda: sugerencias para el día ---------------- */

cargarAgenda = (orig => async function () {
  await orig();
  if (TAB === 'agenda' && AG_MODO === 'dia' && AG_FECHA >= hoyISO()) sugerenciasAgenda();
})(cargarAgenda);

async function sugerenciasAgenda() {
  if (!$('agsug')) $('agcuerpo').insertAdjacentHTML('afterend', '<div class="card sug" id="agsug"></div>');
  const fecha = AG_FECHA, esHoy = fecha === hoyISO();
  $('agsug').innerHTML = skelCard(esHoy ? 'Sugerencias para hoy' : 'Sugerencias para este día');
  const [{ data: pr }, { data: pi }, { data: ya }, { data: toca }] = await Promise.all([
    db.rpc('propuestas_rutas', { lim: 40 }),
    rpcCache('panel_inicio', { lim: 6 }, 'inicio').then(r => ({ data: r.data })),
    rpcCache('agenda_rango', { p_desde: fecha, p_hasta: fecha, p_usuario: agUsuarioFiltro() }, 'agenda-' + fecha),
    db.rpc('toca_visitar', { p_usuario: agUid() === PERFIL.id && VE_TODO() ? null : agUid(), lim: 60 })
  ]);
  if (!$('agsug') || AG_FECHA !== fecha) return;
  const conCita = new Set((ya || []).map(c => c.medico_id));
  const libre = l => (l || []).filter(m => !conCita.has(m.id || m.medico_id));
  const acciones = libre((pi && pi.acciones) || []).filter(a => a.proxima_fecha <= fecha);
  const grupos = [
    esHoy ? ['hoy', 'Pasan consulta hoy y hace más de 14 días que no se visitan', libre(pr && pr.hoy)] : null,
    ['acciones', 'Acciones pendientes para este día o atrasadas', acciones.map(a => ({ id: a.medico_id, nombre: a.nombre, especialidad: a.especialidad, extra: (a.proxima_accion || 'Seguimiento') + ' · ' + fechaCorta(a.proxima_fecha) }))],
    ['toca', 'Les toca visita según su frecuencia objetivo', libre(toca).map(m => Object.assign({}, m, { extra: [m.estado_comercial, m.dias_sin_visita != null ? m.dias_sin_visita + ' días sin visita' : 'nunca visitado', m.municipio].filter(Boolean).join(' · ') }))],
    ['urgentes', 'Urgentes sin visitar', libre(pr && pr.urgentes)],
    ['interesados', 'Interesados sin visita en 20 días', libre(pr && pr.interesados)]
  ].filter(g => g && g[2].length);

  $('agsug').innerHTML = `<h2>${esHoy ? 'Sugerencias para hoy' : 'Sugerencias para ' + fechaCorta(fecha)}</h2>
    <p class="sm">Médicos que conviene ver. Añádelos a la agenda o planifica una ruta con ellos.</p>
    ${grupos.map(([k, t, l]) => `<h3>${esc(t)} <span>${l.some(m => m.lat) && k !== 'acciones'
        ? `<button class="btn sec" data-sgruta="${k}">Planificar ruta</button>` : ''}</span></h3>
      <div class="lista">${l.slice(0, 5).map(m => `<div class="item" style="cursor:default">
        <span class="ic ${k === 'urgentes' || k === 'acciones' ? 'w' : ''}">${k === 'hoy' ? '📅' : k === 'urgentes' ? '!' : k === 'acciones' ? '↻' : '🔥'}</span>
        <span class="tx"><b>${esc(m.nombre)}</b><span class="sm">${esc(m.extra || [m.especialidad, m.centro_nombre, m.municipio].filter(Boolean).join(' · '))}</span></span>
        <span class="acts" style="margin:0"><button class="btn sec" data-sgf="${m.id}">Ficha</button>
          <button class="btn sec" data-sgc="${m.id}">+ Cita</button></span></div>`).join('')}
        ${l.length > 5 ? `<div class="sm" style="padding:4px 10px 8px">y ${num(l.length - 5)} más</div>` : ''}</div>`).join('')
      || '<div class="vacio">No hay sugerencias: tu agenda está al día.</div>'}`;
  $('agsug').querySelectorAll('[data-sgf]').forEach(b => b.onclick = () => abrirFicha(b.dataset.sgf));
  $('agsug').querySelectorAll('[data-sgc]').forEach(b => b.onclick = () => nuevaCita(b.dataset.sgc, fecha));
  $('agsug').querySelectorAll('[data-sgruta]').forEach(b => b.onclick = async e => {
    const lista = libre(b.dataset.sgruta === 'toca' ? toca : pr[b.dataset.sgruta]);
    ir('rutas');
    await new Promise(r => setTimeout(r, 60));
    planDesdeLista(lista, b.dataset.sgruta, e.currentTarget);
  });
}

/* ---------------- ayudas nuevas ---------------- */

Object.assign(AYUDA, {
  ventas: ['Ventas', 'Pedidos, pacientes y productos.', [
    'Los pedidos se guardan como <b>borrador</b> (editable y se puede eliminar; no cuenta en métricas) o se <b>validan</b> (cuenta en métricas y comisiones; solo se puede anular).',
    'Los importes van sin IVA; el IVA de cada producto se suma aparte y se ve el total.',
    'La venta a paciente se atribuye al médico indicado y al comercial que lo tenía asignado en ese momento.',
    'La venta a centro con descuento no cuenta como prescripción de ningún médico.',
    'Si un pedido no tiene médico reconocido, queda en «sin atribuir» para asignarlo a mano.']],
  pacientes: ['Pacientes', 'Las personas que compran por recomendación de un médico.', [
    'Cada paciente puede tener un <b>médico que lo trata</b>: se asigna solo con su primer pedido o a mano desde su ficha.',
    'Desde la ficha ves sus pedidos, unidades e importe, y creas un pedido nuevo con el médico ya puesto.',
    'En la ficha de un médico verás sus pacientes.']],
  productos: ['Productos', 'El catálogo que se usa en pedidos, muestras y analítica.', [
    'Escribe el precio sin IVA o con IVA: el otro se calcula con el IVA del producto.',
    'Un producto inactivo no aparece al crear pedidos, pero se conserva en el histórico.']],
  agenda: ['Agenda', 'Tus citas por día, semana o mes.', [
    '«+ Nueva cita» crea una cita con un médico.',
    'En cada cita puedes cambiar la hora, moverla o descartarla.',
    'Al registrar la visita desde la ficha, la cita pasa a «Visitada».',
    'En la vista de día verás <b>sugerencias</b>: quién pasa consulta ese día, acciones pendientes, urgentes e interesados.']]
});
ANCLAS_AYUDA.push(['#agsug > h2', 'agenda']);


/* ============================================================
   DLC OS 2.0 · v2.19.0 · Selectores con tarjeta, rutas en curso,
   Pacientes y Productos como módulos, comerciales en el directorio,
   cambios sin guardar y protección de datos
   ============================================================ */

const VE_TODO = () => PERFIL && ['Administrador', 'Dirección', 'Televenta'].includes(PERFIL.rol);

/* ---------------- fechas y horas: todo el campo abre el selector ---------------- */

document.addEventListener('click', e => {
  const i = e.target.closest('input[type=date], input[type=time], input[type=month], input[type=week], input[type=datetime-local]');
  if (i && !i.disabled && !i.readOnly && typeof i.showPicker === 'function') { try { i.showPicker(); } catch (err) {} }
});

/* ---------------- protección de datos: sin descargas ---------------- */

function descargar() { toast('La descarga de datos está desactivada para proteger la información.', true); }
function menuDescarga() { return ''; }
async function descargarCSV() { descargar(); }
['__dlDir', '__dlSeg', '__dlAn'].forEach(k => { try { delete window[k]; } catch (e) { window[k] = undefined; } });

/* ---------------- buscador superior: se limpia al elegir ---------------- */

document.addEventListener('click', e => {
  if (!e.target.closest('#gsug [data-gm], #gsug [data-gc], #gsug [data-gme]')) return;
  setTimeout(() => {
    $('q').value = '';
    $('q').closest('.gsearch').classList.remove('buscando');
    $('q').blur();
  }, 0);
});

/* ---------------- ventanas con cambios sin guardar ---------------- */

['dlg', 'dlg2'].forEach(id => {
  const d = $(id);
  d.addEventListener('input', e => { if (!e.target.closest('[data-nosucio]')) d.dataset.sucio = '1'; });
  d.addEventListener('change', e => { if (!e.target.closest('[data-nosucio]')) d.dataset.sucio = '1'; });
  d.addEventListener('close', () => { delete d.dataset.sucio; });
  d.addEventListener('cancel', e => { e.preventDefault(); intentarCerrar(d); });
});

async function intentarCerrar(d) {
  if (d.dataset.sucio && !await preguntar('Si sales ahora perderás los cambios que has hecho.',
    { titulo: '¿Salir sin guardar?', ok: 'Salir sin guardar', peligro: true })) return;
  d.close();
}

/* ---------------- selector de médico (igual que el buscador principal) ---------------- */

const tarjetaMedico = m => `<div class="selcard"><span class="ic">👤</span>
  <span class="tx"><b>${esc(m.nombre)}</b>
    <span class="sm">${esc([m.especialidad, m.centro_nombre || m.centro, m.municipio].filter(Boolean).join(' · '))}</span>
    ${m.codigo ? `<span class="sm">Código ${esc(m.codigo)}</span>` : ''}</span>
  <button type="button" class="sx" aria-label="Quitar">✕</button></div>`;

function cerrarPickers(salvo) {
  document.querySelectorAll('.picker .gsug').forEach(g => { if (!salvo || !salvo.contains(g)) g.classList.add('hide'); });
}
document.addEventListener('pointerdown', e => { if (!e.target.closest('.picker')) cerrarPickers(); });

/**
 * Pinta en `el` un buscador de médicos. Al elegir, el campo se cambia por una tarjeta con ✕.
 * opciones: valor (médico elegido), alElegir(m | null), placeholder
 */
function selectorMedico(el, o) {
  let valor = o.valor || null;
  const pinta = () => {
    if (valor) {
      el.innerHTML = tarjetaMedico(valor);
      el.querySelector('.sx').onclick = () => { valor = null; el.__texto = ''; pinta(); o.alElegir && o.alElegir(null); setTimeout(() => { const i = el.querySelector('input'); if (i) i.focus(); }, 0); };
      return;
    }
    el.innerHTML = `<div class="picker"><input type="search" autocomplete="off" placeholder="${esc(o.placeholder || 'Busca por nombre, centro o municipio')}" value="${esc(el.__texto || '')}">
      <div class="gsug hide"></div></div>`;
    const caja = el.querySelector('.picker'), inp = caja.querySelector('input'), sug = caja.querySelector('.gsug');
    let t, pide = 0;
    const elegir = m => { valor = m; el.__texto = ''; pinta(); o.alElegir && o.alElegir(m); };
    const listaMedicos = async (titulo, params) => {
      caja.classList.add('buscando');
      sug.innerHTML = '<div class="gload"><span class="spin"></span>Buscando médicos…</div>'; sug.classList.remove('hide');
      const { data } = await db.rpc('buscar_medicos', Object.assign({ q: null, f_provincia: null, f_municipio: null, f_estado: null,
        f_especialidad: null, f_area: null, f_urgentes: false, f_mios: false, f_sin_visitar: false, orden: 'nombre', lim: 30, desplaz: 0 }, params));
      caja.classList.remove('buscando');
      const f = (data && data.filas) || [];
      sug.innerHTML = `<button type="button" class="gback" data-back>← Volver a los resultados</button>
        <div class="gsh">${esc(titulo)} · ${num(data ? data.total : 0)} médicos${data && data.total > 30 ? ' (se muestran 30)' : ''}</div>` +
        (f.map((m, i) => `<button type="button" data-pm="${i}"><span class="gic">${m.urgente ? '❗' : '👤'}</span>
          <span><b>${esc(m.nombre)}</b><span class="sm">${esc([m.especialidad, m.centro_nombre, m.municipio].filter(Boolean).join(' · '))}</span></span></button>`).join('')
          || '<div class="gload">Sin médicos.</div>');
      sug.querySelector('[data-back]').onclick = () => buscarTexto();
      sug.querySelectorAll('[data-pm]').forEach(b => b.onclick = () => elegir(f[+b.dataset.pm]));
    };
    const buscarTexto = () => {
      const q = inp.value.trim(); el.__texto = inp.value;
      clearTimeout(t);
      if (q.length < 2) { sug.classList.add('hide'); caja.classList.remove('buscando'); return; }
      caja.classList.add('buscando');
      sug.innerHTML = '<div class="gload"><span class="spin"></span>Buscando…</div>'; sug.classList.remove('hide');
      const n = ++pide;
      t = setTimeout(async () => {
        const { data } = await db.rpc('buscar_global', { q, lim: 6 });
        if (n !== pide) return;
        caja.classList.remove('buscando');
        if (!data) { sug.innerHTML = '<div class="gload">No se ha podido buscar. Revisa la conexión.</div>'; return; }
        const mu = data.municipios || [], ce = data.centros || [], me = data.medicos || [];
        if (!mu.length && !ce.length && !me.length) { sug.innerHTML = `<div class="gload">Sin resultados para «${esc(q)}».</div>`; return; }
        sug.innerHTML =
          (mu.length ? '<div class="gsh">Municipios</div>' + mu.map((x, i) => `<button type="button" data-pmu="${i}"><span class="gic">📍</span>
            <span><b>${esc(x.valor)}</b><span class="sm">${num(x.n)} médicos · ver la lista</span></span></button>`).join('') : '') +
          (ce.length ? '<div class="gsh">Centros</div>' + ce.map((x, i) => `<button type="button" data-pce="${i}"><span class="gic">🏥</span>
            <span><b>${esc(x.valor)}</b><span class="sm">${esc(x.municipio || '')} · ${num(x.n)} médicos · ver la lista</span></span></button>`).join('') : '') +
          (me.length ? '<div class="gsh">Médicos</div>' + me.map((x, i) => `<button type="button" data-pme="${i}"><span class="gic">${x.urgente ? '❗' : '👤'}</span>
            <span><b>${esc(x.nombre)}</b><span class="sm">${esc([x.especialidad, x.centro_nombre, x.municipio].filter(Boolean).join(' · '))}</span></span></button>`).join('') : '');
        sug.querySelectorAll('[data-pmu]').forEach(b => b.onclick = () => listaMedicos(mu[+b.dataset.pmu].valor, { f_municipio: mu[+b.dataset.pmu].valor }));
        sug.querySelectorAll('[data-pce]').forEach(b => b.onclick = () => listaMedicos(ce[+b.dataset.pce].valor, { q: ce[+b.dataset.pce].valor }));
        sug.querySelectorAll('[data-pme]').forEach(b => b.onclick = () => elegir(me[+b.dataset.pme]));
      }, 250);
    };
    inp.oninput = buscarTexto;
    inp.onfocus = () => { if (inp.value.trim().length >= 2 && sug.innerHTML) { cerrarPickers(caja); sug.classList.remove('hide'); } };
    inp.onkeydown = e => { if (e.key === 'Escape') { sug.classList.add('hide'); e.stopPropagation(); } };
  };
  pinta();
  el.__valor = () => valor;
}

/* ---------------- selector de paciente ---------------- */

const tarjetaPaciente = c => `<div class="selcard"><span class="ic">🧑</span>
  <span class="tx"><b>${esc(c.nombre)}</b>
    ${[c.direccion, [c.cp, c.municipio].filter(Boolean).join(' '), c.provincia].filter(Boolean).length
      ? `<span class="sm">📦 ${esc([c.direccion, [c.cp, c.municipio].filter(Boolean).join(' '), c.provincia].filter(Boolean).join(', '))}</span>`
      : '<span class="sm" style="color:var(--warn)">Sin dirección de entrega</span>'}
    <span class="sm">${esc([c.nif ? (c.tipo === 'Empresa' ? 'CIF ' : 'DNI ') + c.nif : 'Sin DNI', c.email, c.telefono || c.movil].filter(Boolean).join(' · '))}</span>
    ${c.medico ? `<span class="sm">Médico: ${esc(c.medico)}</span>` : ''}</span>
  <button type="button" class="sx" aria-label="Quitar">✕</button></div>`;

function selectorPaciente(el, o) {
  let valor = o.valor || null;
  const pinta = () => {
    if (valor) {
      el.innerHTML = tarjetaPaciente(valor);
      el.querySelector('.sx').onclick = () => { valor = null; pinta(); o.alElegir && o.alElegir(null); };
      return;
    }
    el.innerHTML = `<div style="display:flex;gap:8px"><div class="picker" style="flex:1">
        <input type="search" autocomplete="off" placeholder="Nombre, teléfono o DNI"><div class="gsug hide"></div></div>
      <button type="button" class="btn sec" data-pnuevo>+ Nuevo</button></div>`;
    const caja = el.querySelector('.picker'), inp = caja.querySelector('input'), sug = caja.querySelector('.gsug');
    let t, pide = 0;
    inp.oninput = () => {
      const q = inp.value.trim();
      clearTimeout(t);
      if (q.length < 2) { sug.classList.add('hide'); caja.classList.remove('buscando'); return; }
      caja.classList.add('buscando');
      sug.innerHTML = '<div class="gload"><span class="spin"></span>Buscando pacientes…</div>'; sug.classList.remove('hide');
      const n = ++pide;
      t = setTimeout(async () => {
        const { data } = await db.rpc('contactos_lista', { q, lim: 8 });
        if (n !== pide) return;
        caja.classList.remove('buscando');
        const l = data || [];
        sug.innerHTML = '<div class="gsh">Pacientes</div>' + (l.map((x, i) => `<button type="button" data-pc="${i}"><span class="gic">🧑</span>
          <span><b>${esc(x.nombre)}</b><span class="sm">${esc([x.telefono || x.movil, x.nif, x.municipio, x.medico].filter(Boolean).join(' · '))}</span></span></button>`).join('')
          || `<div class="gload">Sin coincidencias. Créalo con «+ Nuevo».</div>`);
        sug.querySelectorAll('[data-pc]').forEach(b => b.onclick = () => { valor = l[+b.dataset.pc]; pinta(); o.alElegir && o.alElegir(valor); });
      }, 250);
    };
    el.querySelector('[data-pnuevo]').onclick = () => editorContacto({ nombre: inp.value.trim() }, c => {
      valor = Object.assign({}, c); pinta(); o.alElegir && o.alElegir(valor);
    });
  };
  pinta();
}

/* ---------------- nueva cita con el selector de médico ---------------- */

async function nuevaCita(medicoId, fecha) {
  let elegido = null;
  if (medicoId) {
    const { data } = await db.rpc('ficha_medico', { p_id: medicoId });
    const m = data && data.medico, c = data && (data.consultas || [])[0];
    if (m) elegido = Object.assign({}, m, { centro_nombre: c ? c.centro_nombre : '', municipio: c ? c.municipio : '' });
  }
  $('dbody').innerHTML = `
    <div class="fh"><div><h2>Nueva cita</h2><div class="sm">Se añade a tu agenda</div></div>
      <button class="x" data-cerrar aria-label="Cerrar">✕</button></div>
    <label>Médico</label><div id="ncsel"></div>
    <div class="g2">
      <div><label for="ncf">Día</label><input id="ncf" type="date" value="${esc(fecha || hoyISO())}"></div>
      <div><label for="nch">Hora</label><input id="nch" type="time"></div>
    </div>
    <label for="ncn">Nota</label><input id="ncn" placeholder="p. ej. llevar reporting">
    <div class="acts" style="justify-content:flex-end">
      <button class="btn sec" data-cerrar>Cancelar</button>
      <button class="btn" id="ncok">Añadir a la agenda</button></div>`;
  selectorMedico($('ncsel'), { valor: elegido, alElegir: m => { elegido = m; } });
  $('ncok').onclick = async ev => {
    if (!elegido) { toast('Elige un médico', true); return; }
    const decision = await citaRepetida(elegido.id, $('ncf').value);
    if (!decision) return;
    ev.target.disabled = true;
    const r = await escribir('guardar_cita', { p: {
      medico_id: elegido.id, fecha: $('ncf').value, hora: $('nch').value || null,
      centro_nombre: elegido.centro_nombre || elegido.centro || null, estado: 'Planificada', origen: 'Agenda',
      usuario_id: TAB === 'agenda' && AG_VISTA ? AG_VISTA.id : null,
      nota: $('ncn').value.trim(), op_id: 'c-' + elegido.id + '-' + $('ncf').value + '-' + Date.now()
    }});
    ev.target.disabled = false;
    if (r.error) { toast('No se ha podido: ' + r.error.message, true); return; }
    $('dlg').close(); toast('Cita añadida'); if (TAB === 'agenda') cargarAgenda(); cargarInicio();
  };
  $('dlg').showModal();
}

/* ---------------- documento de identidad ---------------- */

const LETRAS_DNI = 'TRWAGMYFPDXBNJZSQVHLCKE';
function validarDoc(v, tipo) {
  v = (v || '').toUpperCase().replace(/[\s-]/g, '');
  if (!v) return { ok: true, v };
  if (tipo === 'Empresa') {
    const m = v.match(/^([ABCDEFGHJKLMNPQRSUVW])(\d{7})([0-9A-J])$/);
    if (!m) return { ok: false, v, msg: 'El CIF son una letra, 7 números y un dígito o letra de control (p. ej. B24920548).' };
    let a = 0, b = 0;
    m[2].split('').forEach((d, i) => { if (i % 2) a += +d; else { const x = 2 * d; b += Math.floor(x / 10) + x % 10; } });
    const c = (10 - (a + b) % 10) % 10, letra = 'JABCDEFGHI'[c];
    return (m[3] === String(c) || m[3] === letra) ? { ok: true, v } : { ok: false, v, msg: 'El dígito de control del CIF no es correcto.' };
  }
  let n = v;
  if (/^[XYZ]\d{7}[A-Z]$/.test(n)) n = 'XYZ'.indexOf(n[0]) + n.slice(1);
  if (!/^\d{8}[A-Z]$/.test(n)) return { ok: false, v, msg: 'El DNI son 8 números y una letra; el NIE, X, Y o Z seguida de 7 números y una letra.' };
  return LETRAS_DNI[+n.slice(0, 8) % 23] === n[8] ? { ok: true, v } : { ok: false, v, msg: 'La letra no corresponde a ese número.' };
}

/* ---------------- alta y edición de paciente ---------------- */

function editorContacto(c, alGuardar) {
  c = c || {};
  let tipo = c.tipo || 'Persona';
  let medico = c.medico_id ? { id: c.medico_id, nombre: c.medico || 'Médico asignado', codigo: c.medico_codigo || '' } : null;
  $('dlg2body').innerHTML = `
    <div class="fh"><div><h2>${c.id ? 'Editar paciente' : 'Nuevo paciente'}</h2>
      <div class="sm">Datos de entrega y facturación</div></div>
      <button class="x" data-cerrar2 aria-label="Cerrar">✕</button></div>
    <div class="subnav" style="margin:6px 0 4px"><button type="button" data-ktipo="Persona" aria-pressed="${tipo === 'Persona'}">Persona</button>
      <button type="button" data-ktipo="Empresa" aria-pressed="${tipo === 'Empresa'}">Empresa</button></div>
    <div class="g2">
      <div><label for="konom" id="konoml">${tipo === 'Empresa' ? 'Razón social' : 'Nombre y apellidos'}</label><input id="konom" value="${esc(c.nombre || '')}"></div>
      <div><label for="konif" id="konifl">${tipo === 'Empresa' ? 'CIF' : 'DNI o NIE'}</label>
        <input id="konif" value="${esc(c.nif || '')}" placeholder="${tipo === 'Empresa' ? 'B12345678' : '12345678Z'}" autocapitalize="characters">
        <div class="sm" id="konifm" style="margin-top:4px"></div></div>
    </div>
    <label>Médico que lo trata</label><div id="kosel"></div>
    <div class="sm" style="margin-top:4px">Las unidades de sus pedidos se atribuyen a este médico y a su comercial.</div>
    <div class="g2">
      <div><label for="kodir">Dirección de entrega</label><input id="kodir" value="${esc(c.direccion || '')}"></div>
      <div><label for="kocp">Código postal</label><input id="kocp" value="${esc(c.cp || '')}" inputmode="numeric"></div>
    </div>
    <div class="g2">
      <div><label for="komun">Población</label><input id="komun" value="${esc(c.municipio || '')}"></div>
      <div><label for="kopro">Provincia</label><input id="kopro" value="${esc(c.provincia || '')}"></div>
    </div>
    <div class="g2">
      <div><label for="kotel">Teléfono</label><input id="kotel" value="${esc(c.telefono || '')}" inputmode="tel"></div>
      <div><label for="komov">Móvil</label><input id="komov" value="${esc(c.movil || '')}" inputmode="tel"></div>
    </div>
    <div class="g2">
      <div><label for="komail">Email</label><input id="komail" type="email" value="${esc(c.email || '')}"></div>
      <div id="koempw" class="${tipo === 'Empresa' ? 'hide' : ''}"><label for="koemp">Empresa (si factura a una)</label><input id="koemp" value="${esc(c.empresa || '')}"></div>
    </div>
    <label for="konota">Nota</label><input id="konota" value="${esc(c.nota || '')}">
    <div class="acts" style="justify-content:flex-end">
      <button class="btn sec" id="kocancel">Cancelar</button>
      <button class="btn" id="kook">${c.id ? 'Guardar' : 'Crear paciente'}</button></div>`;

  selectorMedico($('kosel'), { valor: medico, alElegir: m => { medico = m; } });
  const revisaDoc = () => {
    const r = validarDoc($('konif').value, tipo);
    $('konifm').innerHTML = r.ok ? '' : `<span style="color:var(--danger)">${esc(r.msg)}</span>`;
    return r;
  };
  $('konif').oninput = revisaDoc;
  $('dlg2body').querySelectorAll('[data-ktipo]').forEach(b => b.onclick = () => {
    tipo = b.dataset.ktipo;
    $('dlg2body').querySelectorAll('[data-ktipo]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    $('konifl').textContent = tipo === 'Empresa' ? 'CIF' : 'DNI o NIE';
    $('konoml').textContent = tipo === 'Empresa' ? 'Razón social' : 'Nombre y apellidos';
    $('konif').placeholder = tipo === 'Empresa' ? 'B12345678' : '12345678Z';
    $('koempw').classList.toggle('hide', tipo === 'Empresa');
    if ($('konif').value) revisaDoc();
  });
  $('kocancel').onclick = () => $('dlg2').close();
  $('kook').onclick = async ev => {
    if (!$('konom').value.trim()) { toast('Escribe el nombre', true); return; }
    const doc = revisaDoc();
    if (!doc.ok) { toast(tipo === 'Empresa' ? 'Revisa el CIF' : 'Revisa el DNI o NIE', true); return; }
    ev.target.disabled = true; ev.target.textContent = 'Guardando…';
    const { data: r, error } = await db.rpc('guardar_contacto', { p: {
      id: c.id || null, nombre: $('konom').value.trim(), nif: doc.v, tipo,
      direccion: $('kodir').value.trim(), cp: $('kocp').value.trim(), municipio: $('komun').value.trim(),
      provincia: $('kopro').value.trim(), telefono: $('kotel').value.trim(), movil: $('komov').value.trim(),
      email: $('komail').value.trim(), empresa: tipo === 'Empresa' ? '' : $('koemp').value.trim(), nota: $('konota').value.trim(),
      medico_id: medico ? medico.id : null
    }});
    ev.target.disabled = false; ev.target.textContent = c.id ? 'Guardar' : 'Crear paciente';
    if (error || (r && r.ok === false)) { toast('No se ha podido guardar', true); return; }
    $('dlg2').close(); toast(c.id ? 'Paciente guardado' : 'Paciente creado');
    const res = Object.assign({}, r.contacto, medico ? { medico: medico.nombre, medico_codigo: medico.codigo } : {});
    if (alGuardar) alGuardar(res);
    if (TAB === 'pacientes') listaPacientes();
  };
  $('dlg2').showModal();
}

/* ---------------- módulos Pacientes y Productos ---------------- */

const vaciarModulos = salvo => ['v-pacientes', 'v-productos', 'v-ventas'].forEach(k => { if (k !== salvo) $(k).innerHTML = ''; });

async function cargarPacientes() {
  vaciarModulos('v-pacientes');
  $('v-pacientes').innerHTML = `
    <div class="saludo"><div><h1>Pacientes</h1><div class="fecha">Quién compra, qué médico lo trata y su historial</div></div>
      <div class="acts" style="margin:0">${puedeVentas() ? '<button class="btn" id="pacnuevo">+ Nuevo paciente</button>' : ''}</div></div>
    <div id="vcuerpo"></div>`;
  if ($('pacnuevo')) $('pacnuevo').onclick = () => editorContacto({}, c => fichaPaciente(c.id));
  pintarPacientes();
}

async function cargarProductosModulo() {
  const esAdmin = PERFIL.rol === 'Administrador';
  vaciarModulos('v-productos');
  $('v-productos').innerHTML = `
    <div class="saludo"><div><h1>Productos</h1><div class="fecha">Catálogo con precios sin IVA y con IVA</div></div>
      <div class="acts" style="margin:0">${esAdmin ? '<button class="btn" id="prodnuevo">+ Nuevo producto</button>' : ''}</div></div>
    <div id="vcuerpo"></div>`;
  if ($('prodnuevo')) $('prodnuevo').onclick = () => editorProducto(null);
  pintarProductos();
}

// Ventas queda solo con los pedidos
async function cargarVentas() {
  vaciarModulos('v-ventas');
  $('v-ventas').innerHTML = `
    <div class="saludo"><div><h1>Ventas</h1><div class="fecha">Pedidos y unidades atribuidas</div></div>
      <div class="acts" style="margin:0">${puedeVentas() ? '<button class="btn" id="pednuevo">+ Nuevo pedido</button>' : ''}</div></div>
    <div id="vcuerpo"></div>`;
  if ($('pednuevo')) $('pednuevo').onclick = () => editorPedido();
  await cargarProductos();
  $('vcuerpo').innerHTML = `
    <div class="card" id="cardsinatr"></div>
    <div class="panel">
      <div class="filtros">
        <div><label for="pdesde">Desde</label><input id="pdesde" type="date"></div>
        <div><label for="phasta">Hasta</label><input id="phasta" type="date"></div>
        <div><label for="pcanal">Canal</label><select id="pcanal">
          <option value="">Todos</option><option value="paciente">Recomendación a paciente</option>
          <option value="centro">Venta a centro</option></select></div>
        <div><label for="pq">Buscar</label><input id="pq" placeholder="Médico, paciente o nº de pedido"></div>
      </div>
      <div class="cuenta" id="pcuenta">Cargando…</div>
      <div id="pedlista"></div>
    </div>`;
  ['pdesde', 'phasta', 'pcanal'].forEach(id => $(id).onchange = listaPedidos);
  let tq; $('pq').oninput = () => { clearTimeout(tq); tq = setTimeout(listaPedidos, 350); };
  listaPedidos();
  pintarSinAtribuir();
}

// Visibilidad de los módulos nuevos según permisos
const mostrarAppV218 = mostrarApp;
mostrarApp = function (perfil) {
  mostrarAppV218(perfil);
  document.querySelectorAll('#nav [data-t="pacientes"], #nav [data-t="productos"]').forEach(b => b.classList.toggle('hide', !veVentas()));
  $('fcomwrap').classList.toggle('hide', !VE_TODO());
  if (VE_TODO()) cargarComerciales();
};

/* ---------------- directorio: comerciales ---------------- */

let COMS = [];
async function cargarComerciales() {
  const { data } = await db.from('perfiles').select('id,nombre,rol,activo').order('nombre');
  // Solo quien lleva cartera o agenda comercial (no Dirección, Solo consulta ni médicos)
  COMS = (data || []).filter(u => u.activo && !['Medico', 'Dirección', 'Solo consulta'].includes(u.rol));
  $('fcom').innerHTML = '<option value="">Todos</option><option value="ninguno">Sin comercial</option>' +
    COMS.map(u => `<option value="${u.id}" ${F.com === u.id ? 'selected' : ''}>${esc(u.nombre)}</option>`).join('');
}
$('fcom').addEventListener('change', e => { F.com = e.target.value; buscar(true); });

COLS.push({ k: 'comerciales', t: 'Comerciales', w: 190 });
function colsConfig() {
  let g = null;
  try { g = JSON.parse(localStorage.getItem(colKey()) || 'null'); } catch (e) {}
  if (!g || !g.length) g = COLS.map(c => ({ k: c.k, on: COLS_DEF.includes(c.k) || (c.k === 'comerciales' && VE_TODO()), w: c.w }));
  COLS.forEach(c => { if (!g.some(x => x.k === c.k)) g.push({ k: c.k, on: c.k === 'comerciales' && VE_TODO(), w: c.w }); });
  return g.filter(x => x.k !== 'comerciales' || VE_TODO());
}
function celda(m, k) {
  if (k === 'nombre') return `<span class="nm">${m.urgente ? '<span class="pill p-urg">Urgente</span> ' : ''}${esc(m.nombre)}</span>`;
  if (k === 'dias') return `<span class="dias">${['L', 'M', 'X', 'J', 'V'].map(d =>
    `<span class="${(m.dias || {})[d] ? 'on' : ''}" title="${esc((m.dias || {})[d] || '')}">${d}</span>`).join('')}</span>`;
  if (k === 'estado_comercial') return `<span class="pill p-est">${esc(m.estado_comercial)}</span>`;
  if (k === 'ultima_visita') return `<span class="sm">${m.ultima_visita ? fechaCorta(m.ultima_visita) : '—'}</span>`;
  if (k === 'telefono') return `<span class="sm">${esc(m.telefono || m.consulta_telefono || '')}</span>`;
  if (k === 'comerciales') {
    const c = m.comerciales || [];
    return `<span class="comchips">${c.length ? c.map(x => `<span>${esc(String(x.nombre).split(' ')[0])}</span>`).join('') : '<span class="sin">Sin asignar</span>'}</span>`;
  }
  return `<span class="sm">${esc(m[k] || '')}</span>`;
}

function filtroActual() {
  const f = {};
  ['q', 'prov', 'muni', 'esp', 'est', 'com'].forEach(k => { if (F[k]) f[k] = F[k]; });
  if (F.urg) f.urg = true;
  return f;
}
function textoFiltro(f) {
  const p = [];
  if (f.urg) p.push('urgentes');
  if (f.sin) p.push('sin visitar');
  if (f.est) p.push(f.est);
  if (f.esp) p.push(f.esp);
  if (f.muni) p.push(f.muni); else if (f.prov) p.push(f.prov);
  if (f.com) p.push(f.com === 'ninguno' ? 'sin comercial' : 'de ' + ((COMS.find(u => u.id === f.com) || {}).nombre || 'un comercial'));
  if (f.q) p.push('“' + f.q + '”');
  return p.length ? p.join(' · ') : 'Todos los médicos';
}
function aplicarFiltroGuardado(f) {
  Object.assign(F, { q: '', prov: '', muni: '', esp: '', est: '', com: '', urg: false, orden: 'nombre', pagina: 0 });
  if (f.q) { F.q = f.q; $('q').value = f.q; }
  ['prov', 'muni', 'esp', 'est', 'com'].forEach(k => { if (f[k]) { F[k] = f[k]; const s = $('f' + k); if (s) s.value = f[k]; } });
  if (f.urg) F.urg = true;
  ir('directorio'); buscar(true);
}

/* ---------------- ficha del médico: comercial en «Editar ficha» ---------------- */

abrirEditor = (orig => async function (id, tipo) {
  await orig(id, tipo);
  if (!id || PERFIL.rol !== 'Administrador' || !$('eguardar')) return;
  const acts = $('eguardar').closest('.acts');
  acts.insertAdjacentHTML('beforebegin', `<label for="ecom">Comercial asignado</label>
    <select id="ecom"><option>Cargando…</option></select>
    <div class="sm" style="margin-top:4px">Las ventas nuevas se atribuyen al comercial asignado en ese momento.</div>`);
  if (!COMS.length) await cargarComerciales();
  const { data: act } = await RPC_ORIG('comercial_de_medico', { p_medico: id });
  const antes = act ? act.id : '';
  $('ecom').innerHTML = '<option value="">Sin comercial</option>' + COMS.filter(u => u.rol === 'Comercial' || u.id === antes).map(u =>
    `<option value="${u.id}" ${u.id === antes ? 'selected' : ''}>${esc(u.nombre)} · ${esc(u.rol)}</option>`).join('');
  $('eguardar').addEventListener('click', async () => {
    const ahora = $('ecom') ? $('ecom').value : antes;
    if (ahora === antes) return;
    const { data: r } = await db.rpc('asignar_comercial_medico', { p_medico: id, p_usuario: ahora || null });
    if (r && r.ok === false) toast('No se ha podido cambiar el comercial', true);
  });
})(abrirEditor);

/* ---------------- administración: asignar cartera viendo la lista ---------------- */

async function asignarCartera(id) {
  const u = USUARIOS.find(x => x.id === id); if (!u) return;
  const { data: op } = await db.rpc('opciones_filtros', {});
  const sel = lista => '<option value=""></option>' + ((lista || []).map(o => `<option value="${esc(o.v)}">${esc(o.v)} (${o.n})</option>`).join(''));
  const fuera = new Set();
  let total = 0, pagina = 0;
  $('dbody').innerHTML = `<div data-nosucio>
    <div class="fh"><div><h2>Cartera de ${esc(u.nombre)}</h2>
      <div class="sm">Ahora tiene ${num(u.medicos)} médicos asignados</div></div>
      <button class="x" data-cerrar aria-label="Cerrar">✕</button></div>
    <p class="sm">Elige los filtros, revisa la lista y desmarca los que no quieras.</p>
    <div class="g2">
      <div><label for="aprov">Provincia</label><select id="aprov">${sel(op.provincias)}</select></div>
      <div><label for="amuni">Municipio</label><select id="amuni">${sel(op.municipios)}</select></div></div>
    <div class="g2">
      <div><label for="aesp">Especialidad</label><select id="aesp">${sel(op.especialidades)}</select></div>
      <div><label for="aest">Estado</label><select id="aest">${sel(op.estados)}</select></div></div>
    <label class="opt" style="margin-top:10px"><input type="checkbox" id="aurg"> Solo urgentes</label>
    <div id="amsg" class="cuenta" style="padding:10px 0 0"></div>
    <div id="alista"></div>
    <div class="acts" style="justify-content:flex-end">
      <button class="btn sec" id="aquitar">Quitar seleccionados</button>
      <button class="btn" id="aasignar">Asignar seleccionados</button></div></div>`;

  const filtros = () => ({ f_provincia: $('aprov').value || null, f_municipio: $('amuni').value || null,
    f_especialidad: $('aesp').value || null, f_estado: $('aest').value || null, f_urgentes: $('aurg').checked });
  const cuenta = () => {
    $('amsg').innerHTML = `<b>${num(total - fuera.size)}</b> seleccionados de ${num(total)} con estos filtros
      ${fuera.size ? ` · <button class="kcfg" id="atodos">volver a marcar todos</button>` : ''}`;
    if ($('atodos')) $('atodos').onclick = () => { fuera.clear(); pinta(); };
  };
  const pinta = async () => {
    cargando($('alista'), 'Buscando médicos…');
    const { data } = await db.rpc('buscar_medicos', Object.assign({ q: null, f_area: null, f_mios: false, f_sin_visitar: false,
      orden: 'nombre', lim: 50, desplaz: pagina * 50 }, filtros()));
    total = data ? data.total : 0;
    const f = (data && data.filas) || [];
    $('alista').innerHTML = `<div class="carsel">${f.map(m => `<label class="item" style="cursor:pointer;margin:0">
        <input type="checkbox" data-am="${m.id}" ${fuera.has(m.id) ? '' : 'checked'}>
        <span class="tx"><b>${esc(m.nombre)}</b><span class="sm">${esc([m.especialidad, m.centro_nombre, m.municipio].filter(Boolean).join(' · '))}</span></span>
        <span class="comchips">${(m.comerciales || []).map(x => `<span>${esc(String(x.nombre).split(' ')[0])}</span>`).join('') || '<span class="sin">Sin asignar</span>'}</span>
      </label>`).join('') || '<div class="vacio">Ningún médico con estos filtros.</div>'}</div><div id="apag"></div>`;
    $('alista').querySelectorAll('[data-am]').forEach(c => c.onchange = () => { if (c.checked) fuera.delete(c.dataset.am); else fuera.add(c.dataset.am); cuenta(); });
    $('apag').innerHTML = total > 50 ? pagHTML(total, pagina, 50).replace(/<span class="ptam">[\s\S]*?<\/span><\/div>$/, '</div>') : '';
    $('apag').querySelectorAll('[data-pg]').forEach(b => b.onclick = () => { pagina = +b.dataset.pg; pinta(); });
    cuenta();
  };
  ['aprov', 'amuni', 'aesp', 'aest', 'aurg'].forEach(k => $(k).onchange = () => { pagina = 0; fuera.clear(); pinta(); });

  const aplicar = async (quitar, ev) => {
    const ids = ((await db.rpc('ids_filtrados', filtros())).data || []).filter(x => !fuera.has(x));
    if (!ids.length) { toast('No hay ningún médico seleccionado', true); return; }
    if (!await preguntar(`Se van a ${quitar ? 'quitar' : 'asignar'} ${num(ids.length)} médicos ${quitar ? 'de' : 'a'} ${u.nombre}.`,
      { titulo: quitar ? 'Quitar cartera' : 'Asignar cartera', ok: quitar ? 'Quitar' : 'Asignar', peligro: quitar })) return;
    ev.target.disabled = true;
    const { data: r, error } = await db.rpc('asignar_cartera', { p: { usuario_id: id, medicos: ids, quitar } });
    ev.target.disabled = false;
    if (error || (r && r.ok === false)) { toast('No se ha podido: ' + ((error && error.message) || 'sin permiso'), true); return; }
    toast(`${num(r.filas)} médicos ${quitar ? 'retirados' : 'asignados'}${r.movidos ? ` · ${num(r.movidos)} salieron de otra cartera (cartera exclusiva)` : ''}`);
    $('dlg').close(); cargarAdmin();
  };
  $('aasignar').onclick = ev => aplicar(false, ev);
  $('aquitar').onclick = ev => aplicar(true, ev);
  $('dlg').showModal();
  pinta();
}

/* ---------------- rutas: plan desde ahora, ruta en curso, pausar y reanudar ---------------- */

const RPKEY = () => 'dlc-ruta-pausa-' + (PERFIL ? PERFIL.id : '');
const rutaPausada = () => { try { return JSON.parse(localStorage.getItem(RPKEY()) || 'null'); } catch (e) { return null; } };

function construirPlan(conXY, rutaId, btn) {
  const cfg = PLANCFG();
  const salida = salidaUsuario();
  const paradas = {};
  conXY.forEach(m => {
    const k = (m.centro_nombre || 'Consulta') + '|' + (m.municipio || '');
    (paradas[k] = paradas[k] || { centro: m.centro_nombre || 'Consulta privada', municipio: m.municipio,
      dir: m.direccion, xy: [m.lat, m.lon], medicos: [] }).medicos.push(m);
  });
  // Si ya ha pasado la hora de salida, el plan empieza ahora
  const ahora = new Date(), minAhora = ahora.getHours() * 60 + ahora.getMinutes();
  const salidaCfg = +cfg.salida.slice(0, 2) * 60 + +cfg.salida.slice(3), tope = +cfg.tope.slice(0, 2) * 60 + +cfg.tope.slice(3);
  const t0 = Math.max(salidaCfg, Math.ceil(minAhora / 5) * 5);
  let pos = [salida.lat, salida.lon], t = t0, libres = Object.values(paradas), orden = [];
  while (libres.length && t < tope && orden.length < 14) {
    libres.sort((a, b) => km(pos, a.xy) - km(pos, b.xy));
    const p = libres.shift();
    const viaje = minutosEntre(pos, p.xy);
    const dura = cfg.parada + cfg.visita * Math.min(p.medicos.length, 8);
    if (t + viaje + dura > tope) break;
    orden.push({ ...p, llegada: t + viaje, fin: t + viaje + dura, viaje });
    t += viaje + dura; pos = p.xy;
  }
  if (!orden.length) { toast(t0 >= tope ? 'Ya ha pasado tu hora tope de hoy. Cámbiala en «⚙ Cambiar horario».' : 'No cabe ninguna parada en tu horario.', true); return; }
  PLAN = { rutaId, salida, paradas: orden, fin: t + minutosEntre(pos, [salida.lat, salida.lon]), fecha: hoyISO(), inicio: t0 };
  if (TAB !== 'rutas') ir('rutas');
  pintarPlan();
  setTimeout(() => $('rplan') && $('rplan').scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
}

function empezarRuta() {
  if (rutaActiva()) { toast('Ya tienes una ruta en curso. Termínala o ponla en pausa antes de empezar otra.', true); return; }
  if (!PLAN) return;
  const nombre = (RUTAS.find(r => r.id === PLAN.rutaId) || {}).nombre || (typeof PLAN.rutaId === 'string' && PLAN.rutaId.length < 20 ? 'Propuesta: ' + PLAN.rutaId : 'Ruta del día');
  const paradas = PLAN.paradas.map(p => ({ centro: p.centro, municipio: p.municipio, dir: p.dir, xy: p.xy, llegada: p.llegada, fin: p.fin,
    medicos: p.medicos.map(m => ({ id: m.id, nombre: m.nombre, especialidad: m.especialidad, centro_nombre: m.centro_nombre,
      municipio: m.municipio, direccion: m.direccion, lat: m.lat, lon: m.lon })) }));
  localStorage.setItem(RKEY(), JSON.stringify({ nombre, rutaId: PLAN.rutaId, inicio: Date.now(), fecha: hoyISO(),
    codes: paradas.flatMap(p => p.medicos.map(m => m.id)), paradas }));
  localStorage.removeItem(RPKEY());
  PLAN = null;
  pintarRutaBarra();
  toast('Ruta iniciada. Registra cada visita desde la lista.');
  if (TAB === 'rutas') cargarRutas(); else ir('rutas');
}

async function visitadosDe(a) {
  if (!navigator.onLine) return new Set(a.hechosIds || []);
  const { data } = await db.from('visitas').select('medico_id').eq('fecha', a.fecha);
  return new Set((data || []).filter(v => a.codes.includes(v.medico_id)).map(v => v.medico_id));
}

/** Ventana con varias opciones; devuelve la clave elegida o null. */
function elegirOpcion(titulo, msg, botones) {
  return new Promise(res => {
    const d = $('mini');
    d.innerHTML = `<div class="fbox"><div class="fh"><h2>${esc(titulo)}</h2></div>
      <p style="margin:0 0 10px;white-space:pre-line">${esc(msg)}</p>
      <div class="acts" style="justify-content:flex-end;flex-wrap:wrap">${botones.map(b =>
        `<button class="btn ${b.cls || ''}" data-op="${b.k}">${esc(b.t)}</button>`).join('')}</div></div>`;
    const fin = v => { d.close(); res(v); };
    d.querySelectorAll('[data-op]').forEach(b => b.onclick = () => fin(b.dataset.op === 'no' ? null : b.dataset.op));
    d.oncancel = e => { e.preventDefault(); fin(null); };
    d.onclick = e => { if (e.target === d) fin(null); };
    d.showModal();
  });
}

async function terminarOPausar() {
  const a = rutaActiva(); if (!a) return;
  const hechos = await visitadosDe(a), pend = a.codes.length - hechos.size;
  const op = await elegirOpcion(`«${a.nombre}»`,
    `Tiempo: ${durTxt(Date.now() - a.inicio)} · Visitados: ${hechos.size} de ${a.codes.length}` +
    (pend ? `\n\nSi la pones en pausa, podrás reanudarla otro momento u otro día con los ${pend} pendientes: el horario y el orden se recalculan al reanudar.` : ''),
    [{ k: 'no', t: 'Seguir en ruta', cls: 'sec' }].concat(pend ? [{ k: 'pausa', t: 'Pausar y seguir otro día', cls: 'sec' }] : [])
      .concat([{ k: 'fin', t: 'Terminar ruta', cls: 'dang' }]));
  if (!op) return;
  if (op === 'pausa') {
    const pendientes = a.paradas.flatMap(p => p.medicos).filter(m => !hechos.has(m.id));
    localStorage.setItem(RPKEY(), JSON.stringify({ nombre: a.nombre, rutaId: a.rutaId, pausada: Date.now(), hechos: hechos.size, pendientes }));
    toast('Ruta en pausa. Reanúdala desde Rutas cuando quieras.');
  } else toast(`Ruta terminada · ${durTxt(Date.now() - a.inicio)} · ${hechos.size} de ${a.codes.length}`);
  localStorage.removeItem(RKEY());
  pintarRutaBarra();
  if (TAB === 'rutas') cargarRutas();
}

async function pintarRutaBarra() {
  const a = rutaActiva(), el = $('rutabar');
  if (!a) { el.classList.add('hide'); document.body.classList.remove('conruta'); return; }
  el.classList.remove('hide'); document.body.classList.add('conruta');
  const hechos = await visitadosDe(a);
  el.innerHTML = `<span>● <b>En ruta: ${esc(a.nombre)}</b> · <span class="rt">${durTxt(Date.now() - a.inicio)}</span> · ${hechos.size} de ${a.codes.length} visitados</span>
    <span class="acts" style="margin:0"><button class="btn sec" id="rbver">Ver ruta</button><button class="btn dang" id="rbfin">Terminar o pausar</button></span>`;
  $('rbver').onclick = () => { ir('rutas'); setTimeout(() => $('renc') && $('renc').scrollIntoView({ behavior: 'smooth' }), 100); };
  $('rbfin').onclick = terminarOPausar;
}

async function pintarRutaEnCurso() {
  if (TAB !== 'rutas') return;
  if (!$('renc')) $('v-rutas').querySelector('.saludo').insertAdjacentHTML('afterend', '<div id="renc"></div>');
  const a = rutaActiva(), pz = rutaPausada();
  if (!a && !pz) { $('renc').innerHTML = ''; return; }
  if (!a && pz) {
    $('renc').innerHTML = `<div class="card renc"><h2>Ruta en pausa: ${esc(pz.nombre)}<span class="n">${num(pz.pendientes.length)} pendientes</span></h2>
      <p class="sm">La pausaste el ${fechaCorta(new Date(pz.pausada).toISOString().slice(0, 10))} con ${num(pz.hechos)} visitados.
        Al reanudarla se recalculan el orden y las horas desde tu punto de salida y la hora actual.</p>
      <div class="acts" style="padding:0 16px 16px"><button class="btn" id="rpreanudar">Reanudar ruta</button>
        <button class="btn sec" id="rpdescartar">Descartar la pausa</button></div></div>`;
    $('rpreanudar').onclick = e => planDesdeLista(pz.pendientes, pz.rutaId || pz.nombre, e.target);
    $('rpdescartar').onclick = async () => {
      if (!await preguntar('La ruta guardada no cambia; solo se olvidan los pendientes de esta pausa.', { titulo: '¿Descartar la pausa?', ok: 'Descartar' })) return;
      localStorage.removeItem(RPKEY()); pintarRutaEnCurso();
    };
    return;
  }
  const hechos = await visitadosDe(a);
  $('renc').innerHTML = `<div class="card renc"><h2>En ruta: ${esc(a.nombre)}<span class="n">${hechos.size} de ${a.codes.length}</span></h2>
    <p class="sm">Empezaste hace ${durTxt(Date.now() - a.inicio)}. Registra cada visita al terminarla.</p>
    ${a.paradas.map((p, i) => `<div class="parada"><span>${i + 1}. ${esc(p.centro)} · ${hm(p.llegada)}–${hm(p.fin)}</span>
        <a class="btn sec" style="min-height:30px;padding:4px 10px;font-size:12px;text-transform:none;letter-spacing:0" href="${enlaceNav(p.xy)}" target="_blank" rel="noopener">Cómo llegar</a></div>
      <div class="lista">${p.medicos.map(m => `<div class="item" style="cursor:default">
        <span class="ic ${hechos.has(m.id) ? 'o' : ''}">${hechos.has(m.id) ? '✓' : '·'}</span>
        <span class="tx"><b>${esc(m.nombre)}</b><span class="sm">${esc(m.especialidad || '')}${hechos.has(m.id) ? ' · <b style="color:var(--ok)">visitado</b>' : ''}</span></span>
        <span class="acts" style="margin:0"><button class="btn sec" data-rvf="${m.id}">Ficha</button>
          ${hechos.has(m.id) ? '' : `<button class="btn" data-rvr="${m.id}">Registrar visita</button>`}</span></div>`).join('')}</div>`).join('')}
    <div class="acts" style="padding:12px 16px 16px"><button class="btn dang" id="rencfin">Terminar o pausar</button></div></div>`;
  $('renc').querySelectorAll('[data-rvf]').forEach(b => b.onclick = () => abrirFicha(b.dataset.rvf));
  $('renc').querySelectorAll('[data-rvr]').forEach(b => b.onclick = () => abrirVisita(b.dataset.rvr));
  $('rencfin').onclick = terminarOPausar;
}

cargarRutas = (orig => async function () { await orig(); pintarRutaEnCurso(); })(cargarRutas);

// Tras registrar una visita, se actualizan la barra y la lista de la ruta
$('dlg').addEventListener('close', () => {
  if (!rutaActiva()) return;
  setTimeout(() => { pintarRutaBarra(); pintarRutaEnCurso(); }, 400);
});

/* ---------------- ayudas actualizadas ---------------- */

Object.assign(AYUDA, {
  directorio: ['Directorio', 'Todos los médicos que puedes ver.', [
    'El buscador de arriba filtra por nombre, centro o municipio.',
    'El municipio y la provincia cuentan todas las consultas del médico, no solo la principal.',
    'Administración y televenta ven los comerciales de cada médico y pueden filtrar por comercial.',
    '«⋮» abre los filtros y las columnas.',
    '«★ Guardar filtro» convierte los filtros actuales en un indicador de Inicio.',
    '«Cerca de mí» usa la ubicación del dispositivo.']],
  seguimiento: ['Seguimiento', 'Cómo avanza cada médico.', [
    'Los indicadores de arriba muestran el embudo por estado comercial y la calidad de los datos.',
    '«Mostrar» filtra por visitados, sin visitar, con próxima acción o atrasados.',
    '«Hecha» cierra la próxima acción; «Aplazar» le pone otra fecha.']],
  analitica: ['Analítica', 'Unidades o importe agrupados como elijas.', [
    'Elige la dimensión: médico, comercial, producto, municipio, mes o canal.',
    'La tabla por meses sirve para ver tendencias.',
    'Los datos no se pueden descargar: se consultan solo dentro de la plataforma.']],
  rutas: ['Rutas', 'Crea rutas y conviértelas en el plan del día.', [
    '<b>Lista fija</b>: tú eliges los médicos. <b>Por criterios</b>: se rellena sola con los filtros.',
    'El plan ordena las paradas por cercanía y calcula las horas con tu horario. Si ya ha pasado tu hora de salida, empieza a contar desde ahora.',
    'Al pulsar <b>Empezar ruta</b> verás la lista de paradas con el botón <b>Registrar visita</b> en cada médico. «Cómo llegar» abre el navegador solo cuando tú lo pides.',
    '<b>Pausar</b> guarda los pendientes para seguir otro día; al reanudar se recalculan orden y horas.',
    'Solo entran médicos con ubicación. Completar la dirección y los días de consulta mejora mucho las rutas.']],
  pacientes: ['Pacientes', 'Las personas que compran por recomendación de un médico.', [
    'Cada paciente tiene un <b>médico que lo trata</b>: se elige al darlo de alta o se asigna solo con su primer pedido.',
    'Para una persona se pide el DNI o NIE; para una empresa, el CIF. La app comprueba que la letra o el control sean correctos.',
    'Desde la ficha ves sus pedidos y creas uno nuevo con el médico ya puesto.']],
  productos: ['Productos', 'El catálogo que se usa en pedidos, muestras y analítica.', [
    'Escribe el precio sin IVA o con IVA: el otro se calcula con el IVA del producto.',
    'Un producto inactivo no aparece al crear pedidos, pero se conserva en el histórico.']],
  ventas: ['Ventas', 'Pedidos y unidades atribuidas.', [
    'Los pedidos se guardan como <b>borrador</b> (editable y se puede eliminar; no cuenta en métricas) o se <b>validan</b> (cuenta en métricas y comisiones; solo se puede anular).',
    'Importes sin IVA; el IVA de cada producto se suma aparte.',
    'La venta a paciente se atribuye al médico indicado y al comercial que lo tenía asignado en ese momento.',
    'La venta a centro con descuento no cuenta como prescripción de ningún médico.']]
});
ANCLAS_AYUDA.push(['#v-pacientes .saludo h1', 'pacientes'], ['#v-productos .saludo h1', 'productos'], ['#renc .card > h2', 'rutas']);


/* ============================================================
   DLC OS 2.0 · v2.20.0 · Horario de rutas visible, tablas de
   pacientes y productos, envío en los pedidos
   ============================================================ */

/* ---------------- ajustes generales (envío) ---------------- */

let AJUSTES = {};
const envioCfg = () => Object.assign({ precio_con_iva: 0, iva: 21, por_defecto: false }, AJUSTES.envio || {});
async function cargarAjustes() {
  const { data } = await db.rpc('ajustes_lista');
  AJUSTES = data || {};
}
const mostrarAppV219 = mostrarApp;
mostrarApp = function (perfil) { mostrarAppV219(perfil); cargarAjustes(); };

/* ---------------- totales con envío ---------------- */

function totalesPedido(lineas, d, dt, env) {
  const ls = lineas.map(l => ({ b: (+l.importe || 0) * (1 - (+l.descuento || 0) / 100), iva: +l.iva || 0, u: +l.unidades || 0 }));
  const sb = ls.reduce((n, l) => n + l.b, 0);
  const k = !+d || !sb ? 1 : dt === 'importe' ? Math.max(0, 1 - d / sb) : Math.max(0, 1 - d / 100);
  const porIva = {};
  ls.forEach(l => { porIva[l.iva] = (porIva[l.iva] || 0) + l.b * k * l.iva / 100; });
  const t = { unidades: ls.reduce((n, l) => n + l.u, 0), bruto: sb, descuento: sb * (1 - k), baseProd: sb * k, porIva };
  // El envío se escribe con IVA; aquí se separa su base y su IVA
  t.envio = env && env.on ? { con: r2(env.con), iva: +env.iva || 0, base: (+env.con || 0) / (1 + (+env.iva || 0) / 100), nombre: env.nombre || 'Envío' } : null;
  if (t.envio) { t.envio.ivaImp = t.envio.con - t.envio.base; porIva[t.envio.iva] = (porIva[t.envio.iva] || 0) + t.envio.ivaImp; }
  t.base = t.baseProd + (t.envio ? t.envio.base : 0);
  t.iva = Object.values(porIva).reduce((n, x) => n + x, 0);
  t.total = t.base + t.iva;
  return t;
}

function bloqueTotales(t) {
  const tipos = Object.keys(t.porIva).sort((a, b) => a - b);
  return `<div><span>Unidades</span><b>${num(t.unidades)}</b></div>
    ${t.descuento > 0.004 ? `<div><span>Suma de líneas</span><b>${eurI(t.bruto)}</b></div>
      <div><span>Descuento general</span><b>−${eurI(t.descuento)}</b></div>` : ''}
    ${t.envio ? `<div><span>Productos sin IVA</span><b>${eurI(t.baseProd)}</b></div>
      <div><span>${esc(t.envio.nombre)} sin IVA</span><b>${eurI(t.envio.base)}</b></div>` : ''}
    <div><span>Base imponible</span><b>${eurI(t.base)}</b></div>
    ${tipos.filter(k => t.porIva[k] > 0.004 || tipos.length === 1).map(k => `<div><span>IVA ${k}%</span><b>${eurI(t.porIva[k])}</b></div>`).join('')}
    ${t.envio ? `<div class="sm" style="justify-content:flex-end"><span>Incluye ${esc(t.envio.nombre.toLowerCase())} de ${eurI(t.envio.con)} con IVA</span></div>` : ''}
    <div class="tot"><span>Total con IVA</span><b>${eurI(t.total)}</b></div>`;
}

/* ---------------- configuración del envío ---------------- */

function editorEnvio() {
  const c = envioCfg();
  $('dbody').innerHTML = `
    <div class="fh"><div><h2>Envío</h2><div class="sm">Importe que se propone al marcar «Incluir envío» en un pedido</div></div>
      <button class="x" data-cerrar aria-label="Cerrar">✕</button></div>
    <div class="pvp">
      <div><label for="evsin">Sin IVA (€)</label><input id="evsin" type="number" step="0.01" min="0" value="${r2(c.precio_con_iva / (1 + c.iva / 100))}"></div>
      <div><label for="eviva">IVA (%)</label><input id="eviva" type="number" step="1" min="0" max="21" value="${c.iva}"></div>
      <div><label for="evcon">Con IVA (€)</label><input id="evcon" type="number" step="0.01" min="0" value="${r2(c.precio_con_iva)}"></div></div>
    <p class="sm">El envío es un servicio: normalmente lleva el 21% de IVA. En cada pedido se puede cambiar el importe.</p>
    <label class="opt" style="margin-top:10px"><input type="checkbox" id="evdef" ${c.por_defecto ? 'checked' : ''}> Marcar «Incluir envío» por defecto en los pedidos nuevos</label>
    <div class="acts" style="justify-content:flex-end"><button class="btn sec" data-cerrar>Cancelar</button>
      <button class="btn" id="evok">Guardar</button></div>`;
  const iva = () => (+$('eviva').value || 0) / 100;
  $('evsin').oninput = () => { $('evcon').value = $('evsin').value === '' ? '' : r2(+$('evsin').value * (1 + iva())); };
  $('evcon').oninput = () => { $('evsin').value = $('evcon').value === '' ? '' : r2(+$('evcon').value / (1 + iva())); };
  $('eviva').oninput = () => { if ($('evsin').value !== '') $('evcon').value = r2(+$('evsin').value * (1 + iva())); };
  $('evok').onclick = async ev => {
    ev.target.disabled = true;
    const valor = { precio_con_iva: +$('evcon').value || 0, iva: +$('eviva').value || 0, por_defecto: $('evdef').checked };
    const { data: r, error } = await db.rpc('guardar_ajuste', { p_clave: 'envio', p_valor: valor });
    ev.target.disabled = false;
    if (error || (r && r.ok === false)) { toast('No se ha podido guardar', true); return; }
    AJUSTES.envio = valor; $('dlg').close(); toast('Envío guardado');
    if (TAB === 'productos') pintarProductos();
  };
  $('dlg').showModal();
}

/* ---------------- productos: tabla alineada ---------------- */

async function cargarProductosModulo() {
  const esAdmin = PERFIL.rol === 'Administrador';
  vaciarModulos('v-productos');
  $('v-productos').innerHTML = `
    <div class="saludo"><div><h1>Productos</h1><div class="fecha">Catálogo con precios sin IVA y con IVA</div></div>
      <div class="acts" style="margin:0">${esAdmin ? '<button class="btn sec" id="prodenvio">⚙ Envío</button><button class="btn" id="prodnuevo">+ Nuevo producto</button>' : ''}</div></div>
    <div id="vcuerpo"></div>`;
  if ($('prodnuevo')) $('prodnuevo').onclick = () => editorProducto(null);
  if ($('prodenvio')) $('prodenvio').onclick = editorEnvio;
  pintarProductos();
}

async function pintarProductos() {
  const esAdmin = PERFIL.rol === 'Administrador';
  cargando($('vcuerpo'), 'Cargando productos…');
  const [{ data }] = await Promise.all([RPC_ORIG('productos_lista', { p_todos: esAdmin }), cargarAjustes()]);
  const l = data || [], ev = envioCfg();
  $('vcuerpo').innerHTML = `<div class="panel">
    <div class="cuenta"><b>${num(l.filter(p => p.activo).length)}</b> ${l.filter(p => p.activo).length === 1 ? 'producto activo' : 'productos activos'}${l.some(p => !p.activo) ? ` · ${num(l.filter(p => !p.activo).length)} inactivos` : ''}
      · Envío: <b>${eurI(ev.precio_con_iva)}</b> con IVA${ev.por_defecto ? ' (se marca por defecto)' : ''}</div>
    <div class="dgrid-wrap"><div class="dgrid prods">
      <div class="dh"><span></span><span>Producto</span><span>Referencia</span><span class="num">Sin IVA</span><span class="num">IVA</span><span class="num">Con IVA</span><span>Estado</span></div>
      ${l.map(p => `<button class="dr" data-prod="${p.id}" style="${p.activo ? '' : 'opacity:.55'}">
        <span><span class="pfoto" style="${p.foto_url ? `background-image:url('${esc(p.foto_url)}')` : ''}">${p.foto_url ? '' : '◧'}</span></span>
        <span><b>${esc(p.nombre)}</b><span class="sm">${esc(p.presentacion || 'Sin presentación')}</span></span>
        <span class="sm">${esc(p.referencia || '—')}</span>
        <span class="num">${p.precio != null ? eurI(p.precio) : '—'}</span>
        <span class="num">${num(p.iva || 0)}%</span>
        <span class="num"><b>${p.pvp != null ? eurI(p.pvp) : '—'}</b></span>
        <span><span class="pill ${p.activo ? 'p-est' : 'p-anu'}">${p.activo ? 'Activo' : 'Inactivo'}</span></span>
      </button>`).join('') || '<div class="vacio">Todavía no hay productos.</div>'}
    </div></div></div>`;
  $('vcuerpo').querySelectorAll('[data-prod]').forEach(b => b.onclick = () => editorProducto(l.find(p => p.id === b.dataset.prod)));
}

/* ---------------- pacientes: tabla con todos los datos ---------------- */

async function listaPacientes() {
  cargando($('paclista'), 'Buscando pacientes…');
  const { data, error } = await db.rpc('pacientes_lista', { q: PAC.q || null, p_medico: PAC.medico,
    lim: tamPagina(), desplaz: PAC.pagina * tamPagina() });
  if (error) { $('paccuenta').textContent = 'No se ha podido cargar: ' + error.message; $('paclista').innerHTML = ''; return; }
  $('paccuenta').innerHTML = `<b>${num(data.total)}</b> ${data.total === 1 ? 'paciente' : 'pacientes'}`;
  const f = data.filas || [];
  const v = x => x ? esc(x) : '<span class="vac">—</span>';
  $('paclista').innerHTML = f.length ? `<div class="dgrid-wrap"><div class="dgrid pacs">
    <div class="dh"><span>Paciente</span><span>DNI / CIF</span><span>Teléfono</span><span>Email</span><span>Población</span>
      <span>Médico</span><span>Comercial</span><span class="num">Pedidos</span><span class="num">Uds.</span><span>Último pedido</span></div>
    ${f.map(x => `<button class="dr" data-pac="${x.id}">
      <span><b>${esc(x.nombre)}</b></span>
      <span>${v(x.nif)}</span>
      <span>${v(x.telefono || x.movil)}</span>
      <span class="corta">${v(x.email)}</span>
      <span>${v(x.municipio)}</span>
      <span class="corta">${x.medico ? esc(x.medico) : '<span class="vac">Sin asignar</span>'}</span>
      <span>${v(x.comercial)}</span>
      <span class="num">${num(x.pedidos)}</span>
      <span class="num"><b>${num(x.unidades)}</b></span>
      <span>${x.ultimo_pedido ? fechaCorta(x.ultimo_pedido) : '<span class="vac">—</span>'}</span>
    </button>`).join('')}</div></div>` : '<div class="vacio">Ningún paciente con estos filtros.</div>';
  $('paclista').querySelectorAll('[data-pac]').forEach(b => b.onclick = () => fichaPaciente(b.dataset.pac));
  paginador($('pacpag'), data.total, PAC.pagina, p => { PAC.pagina = p; listaPacientes(); }, () => { PAC.pagina = 0; listaPacientes(); });
}

/* ---------------- rutas: horario siempre a mano ---------------- */

let ULTIMO_PLAN = null;
const siguienteLaborable = () => {
  const d = new Date(); do { d.setDate(d.getDate() + 1); } while (d.getDay() === 0 || d.getDay() === 6);
  return d.toISOString().slice(0, 10);
};

function construirPlan(conXY, rutaId, btn, opts) {
  opts = opts || {};
  ULTIMO_PLAN = { conXY, rutaId, opts };
  const cfg = PLANCFG();
  const salida = salidaUsuario();
  const paradas = {};
  conXY.forEach(m => {
    const k = (m.centro_nombre || 'Consulta') + '|' + (m.municipio || '');
    (paradas[k] = paradas[k] || { centro: m.centro_nombre || 'Consulta privada', municipio: m.municipio,
      dir: m.direccion, xy: [m.lat, m.lon], medicos: [] }).medicos.push(m);
  });
  const ahora = new Date(), minAhora = ahora.getHours() * 60 + ahora.getMinutes();
  const salidaCfg = +cfg.salida.slice(0, 2) * 60 + +cfg.salida.slice(3), tope = +cfg.tope.slice(0, 2) * 60 + +cfg.tope.slice(3);
  const fecha = opts.manana ? siguienteLaborable() : hoyISO();
  // Hoy: si ya ha pasado la hora de salida, se empieza ahora. Otro día: desde la hora de salida.
  const t0 = opts.manana ? salidaCfg : Math.max(salidaCfg, Math.ceil(minAhora / 5) * 5);

  if (t0 >= tope) {
    elegirOpcion('Ya ha pasado tu horario de ruta de hoy',
      `Tu horario es de ${cfg.salida} a ${cfg.tope} y ahora son las ${hm(minAhora)}.\n\nPuedes planificar la ruta para el ${fechaLarga(new Date(siguienteLaborable() + 'T00:00:00'))} o cambiar tu horario.`,
      [{ k: 'no', t: 'Cancelar', cls: 'sec' }, { k: 'horario', t: '⚙ Cambiar horario', cls: 'sec' }, { k: 'manana', t: 'Planificar para mañana' }])
      .then(op => {
        if (op === 'horario') abrirHorarioPlan();
        if (op === 'manana') construirPlan(conXY, rutaId, btn, { manana: true });
      });
    return;
  }

  let pos = [salida.lat, salida.lon], t = t0, libres = Object.values(paradas), orden = [];
  while (libres.length && t < tope && orden.length < 14) {
    libres.sort((a, b) => km(pos, a.xy) - km(pos, b.xy));
    const p = libres.shift();
    const viaje = minutosEntre(pos, p.xy);
    const dura = cfg.parada + cfg.visita * Math.min(p.medicos.length, 8);
    if (t + viaje + dura > tope) break;
    orden.push({ ...p, llegada: t + viaje, fin: t + viaje + dura, viaje });
    t += viaje + dura; pos = p.xy;
  }
  if (!orden.length) {
    elegirOpcion('No cabe ninguna parada', `Con tu horario (${cfg.salida}–${cfg.tope}, ${cfg.visita} min por médico) no da tiempo a la primera parada desde ${salida.nombre}.`,
      [{ k: 'no', t: 'Cancelar', cls: 'sec' }, { k: 'horario', t: '⚙ Cambiar horario' }]).then(op => { if (op === 'horario') abrirHorarioPlan(); });
    return;
  }
  PLAN = { rutaId, salida, paradas: orden, fin: t + minutosEntre(pos, [salida.lat, salida.lon]), fecha, inicio: t0 };
  if (TAB !== 'rutas') ir('rutas');
  pintarPlan();
  setTimeout(() => $('rplan') && $('rplan').scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
}

cargarRutas = (orig => async function () {
  await orig();
  const acts = $('v-rutas').querySelector('.saludo .acts');
  if (acts && !$('rhorario')) {
    acts.insertAdjacentHTML('afterbegin', '<button class="btn sec" id="rhorario" title="Hora de salida, hora tope y minutos por visita">⚙ Horario de rutas</button>');
    $('rhorario').onclick = abrirHorarioPlan;
  }
  const c = PLANCFG();
  const sub = $('v-rutas').querySelector('.saludo .fecha');
  if (sub) sub.textContent = `Crea, edita y planifica tus rutas · Horario ${c.salida}–${c.tope}, ${c.visita} min por médico`;
})(cargarRutas);

/* ---------------- ayudas ---------------- */

AYUDA.rutas[2].splice(1, 1,
  'El plan ordena las paradas por cercanía y calcula las horas con tu horario. Si ya ha pasado tu hora de salida, empieza a contar desde ahora; si ya ha pasado tu hora tope, te propone planificar para mañana.',
  '<b>⚙ Horario de rutas</b> (arriba a la derecha) cambia la hora de salida, la hora tope y los minutos por médico y por parada.');
AYUDA.productos[2].push('<b>⚙ Envío</b> fija el importe del envío que se propone en los pedidos y si se marca por defecto.');
AYUDA.ventas[2].push('Si marcas <b>Incluir envío</b>, el importe (con IVA) se suma al total con su propio IVA. No lleva descuento ni cuenta como unidades.');


/* ============================================================
   DLC OS 2.0 · v2.21.0 · Periodos de fechas, ventas y analítica
   con totales, indicadores en tarjetas, ruta en curso reordenable
   ============================================================ */

const ICO = {
  gear: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  ojo: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
  ojoNo: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.9 17.9A10.1 10.1 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 5.1-5.9M9.9 4.2A9.1 9.1 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.2 3.2M14.1 14.1a3 3 0 1 1-4.2-4.2"/><line x1="1" y1="1" x2="23" y2="23"/></svg>',
  nav: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>',
  arriba: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="18 15 12 9 6 15"/></svg>',
  abajo: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>'
};

/* ---------------- periodos de fechas ---------------- */

const fechaLocal = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const PERIODOS = [['todo', 'Todo'], ['hoy', 'Hoy'], ['ayer', 'Ayer'], ['semana', 'Esta semana'], ['7d', 'Últimos 7 días'],
  ['mes', 'Mes actual'], ['mesant', 'Mes anterior'], ['tri', 'Trimestre actual'], ['triant', 'Trimestre anterior'],
  ['anio', 'Año actual'], ['anioant', 'Año anterior'], ['pers', 'Personalizado']];

function rangoPeriodo(k) {
  const h = new Date(); h.setHours(12, 0, 0, 0);
  const y = h.getFullYear(), m = h.getMonth(), q = Math.floor(m / 3);
  const D = (a, b, c) => fechaLocal(new Date(a, b, c, 12));
  const mas = n => { const d = new Date(h); d.setDate(d.getDate() + n); return fechaLocal(d); };
  switch (k) {
    case 'hoy': return [fechaLocal(h), fechaLocal(h)];
    case 'ayer': return [mas(-1), mas(-1)];
    case 'semana': return [mas(-((h.getDay() + 6) % 7)), fechaLocal(h)];
    case '7d': return [mas(-6), fechaLocal(h)];
    case 'mes': return [D(y, m, 1), D(y, m + 1, 0)];
    case 'mesant': return [D(y, m - 1, 1), D(y, m, 0)];
    case 'tri': return [D(y, q * 3, 1), D(y, q * 3 + 3, 0)];
    case 'triant': return [D(y, q * 3 - 3, 1), D(y, q * 3, 0)];
    case 'anio': return [D(y, 0, 1), D(y, 11, 31)];
    case 'anioant': return [D(y - 1, 0, 1), D(y - 1, 11, 31)];
    default: return [null, null];
  }
}

/** Selector de periodo. el.__rango() devuelve { desde, hasta } (null = sin límite). */
function montarPeriodo(el, o) {
  const clave = 'dlc-per-' + (o.id || el.id) + '-' + (PERFIL ? PERFIL.id : '');
  let v = localStorage.getItem(clave) || o.valor || 'mes';
  el.innerHTML = `<label>Periodo</label>
    <select data-per>${PERIODOS.map(([k, t]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
    <div class="perpers ${v === 'pers' ? '' : 'hide'}"><input type="date" data-pd aria-label="Desde"><span class="sm">a</span><input type="date" data-ph aria-label="Hasta"></div>
    <div class="sm perrango"></div>`;
  const s = el.querySelector('[data-per]'), d = el.querySelector('[data-pd]'), hh = el.querySelector('[data-ph]');
  const texto = () => {
    const r = el.__rango();
    el.querySelector('.perrango').textContent = v === 'pers' || v === 'todo' ? '' :
      (r.desde === r.hasta ? fechaCorta(r.desde) : `${fechaCorta(r.desde)} – ${fechaCorta(r.hasta)}`);
  };
  el.__rango = () => { if (v === 'pers') return { desde: d.value || null, hasta: hh.value || null }; const [a, b] = rangoPeriodo(v); return { desde: a, hasta: b }; };
  s.onchange = () => {
    v = s.value; localStorage.setItem(clave, v);
    el.querySelector('.perpers').classList.toggle('hide', v !== 'pers');
    if (v === 'pers' && !d.value) { const [a, b] = rangoPeriodo('mes'); d.value = a; hh.value = b; }
    texto(); o.alCambiar && o.alCambiar(el.__rango());
  };
  d.onchange = hh.onchange = () => { texto(); o.alCambiar && o.alCambiar(el.__rango()); };
  texto();
  return el.__rango;
}

/* ---------------- ventas: tabla con totales ---------------- */

async function cargarVentas() {
  vaciarModulos('v-ventas');
  $('v-ventas').innerHTML = `
    <div class="saludo"><div><h1>Ventas</h1><div class="fecha">Pedidos, unidades e importes</div></div>
      <div class="acts" style="margin:0">${puedeVentas() ? '<button class="btn" id="pednuevo">+ Nuevo pedido</button>' : ''}</div></div>
    <div id="vcuerpo">
      <div class="card" id="cardsinatr"></div>
      <div class="panel">
        <div class="filtros">
          <div id="pper"></div>
          <div><label for="pcanal">Canal</label><select id="pcanal">
            <option value="">Todos</option><option value="paciente">Recomendación a paciente</option>
            <option value="centro">Venta a centro</option></select></div>
          <div><label for="pestado">Estado</label><select id="pestado">
            <option value="">Todos</option><option value="Confirmado">Validados</option>
            <option value="Borrador">Borradores</option><option value="Anulado">Anulados</option></select></div>
          <div><label for="pq">Buscar</label><input id="pq" type="search" placeholder="Médico, paciente o nº de pedido"></div>
        </div>
        <div class="kpis vtot" id="ptotales"></div>
        <div id="pedlista"></div>
      </div>
    </div>`;
  if ($('pednuevo')) $('pednuevo').onclick = () => editorPedido();
  montarPeriodo($('pper'), { id: 'ventas', valor: 'mes', alCambiar: listaPedidos });
  ['pcanal', 'pestado'].forEach(id => $(id).onchange = listaPedidos);
  let tq; $('pq').oninput = () => { clearTimeout(tq); tq = setTimeout(listaPedidos, 350); };
  await cargarProductos();
  listaPedidos();
  pintarSinAtribuir();
}

async function listaPedidos() {
  if (!$('pedlista') || !$('pper')) return;   // se ha cambiado de pestaña mientras cargaba
  cargando($('pedlista'), 'Cargando pedidos…');
  if (!$('pcanal')) return;
  const r = $('pper').__rango();
  const { data, error } = await db.rpc('pedidos_lista', {
    p_desde: r.desde, p_hasta: r.hasta, p_canal: $('pcanal').value || null,
    q: ($('pq') && $('pq').value.trim()) || null, lim: 500
  });
  if (!$('pedlista') || !$('pestado')) return;   // ha cambiado la pantalla mientras llegaban los datos
  if (error) { $('pedlista').innerHTML = `<div class="vacio">No se ha podido cargar: ${esc(error.message)}</div>`; return; }
  const est = $('pestado').value;
  PEDIDOS = (data || []).filter(p => !est || p.estado === est);
  const val = PEDIDOS.filter(p => p.estado === 'Confirmado');
  const suma = k => val.reduce((n, p) => n + (+p[k] || 0), 0);
  const bor = (data || []).filter(p => p.estado === 'Borrador').length;
  $('ptotales').innerHTML = `
    <div class="kpi"><b>${num(val.length)}</b><span>Pedidos validados${bor ? ` · ${bor} en borrador` : ''}</span></div>
    <div class="kpi"><b>${num(suma('unidades'))}</b><span>Unidades</span></div>
    <div class="kpi"><b>${eurI(suma('base'))}</b><span>Base sin IVA</span></div>
    <div class="kpi"><b>${eurI(suma('iva'))}</b><span>IVA</span></div>
    <div class="kpi ok"><b>${eurI(suma('total'))}</b><span>Total con IVA</span></div>`;
  $('pedlista').innerHTML = PEDIDOS.length ? `<div class="dgrid-wrap"><div class="dgrid peds">
    <div class="dh"><span>Fecha</span><span>Paciente / centro</span><span>Médico</span><span>Comercial</span><span>Productos</span>
      <span class="num">Uds.</span><span class="num">Base</span><span class="num">IVA</span><span class="num">Total</span><span>Estado</span></div>
    ${PEDIDOS.map(p => `<button class="dr" data-ped="${p.id}" style="${p.estado === 'Anulado' ? 'opacity:.55' : ''}">
      <span>${fechaCorta(p.fecha)}${p.numero ? `<span class="sm">Nº ${esc(p.numero)}</span>` : ''}</span>
      <span><b>${esc(p.contacto || p.centro || '—')}</b><span class="sm">${p.canal === 'centro' ? 'Venta a centro' : 'Recomendación'}${p.envio ? ' · con envío' : ''}</span></span>
      <span>${p.medico ? esc(p.medico) : '<span class="vac">Sin atribuir</span>'}</span>
      <span>${p.comercial ? esc(p.comercial) : '<span class="vac">—</span>'}</span>
      <span class="sm">${esc(p.productos || '')}</span>
      <span class="num">${num(p.unidades)}</span>
      <span class="num">${eurI(p.base)}</span>
      <span class="num">${eurI(p.iva)}</span>
      <span class="num"><b>${eurI(p.total)}</b></span>
      <span>${pillEstado(p.estado)}</span></button>`).join('')}
    <div class="dr dtot"><span></span><span><b>Total validados</b></span><span></span><span></span><span></span>
      <span class="num"><b>${num(suma('unidades'))}</b></span><span class="num"><b>${eurI(suma('base'))}</b></span>
      <span class="num"><b>${eurI(suma('iva'))}</b></span><span class="num"><b>${eurI(suma('total'))}</b></span><span></span></div>
  </div></div>` : '<div class="vacio">No hay pedidos en este periodo.</div>';
  $('pedlista').querySelectorAll('[data-ped]').forEach(b => b.onclick = () => verPedido(b.dataset.ped));
}

/* ---------------- analítica con totales y filtros ---------------- */

let AN_MED = null;
async function cargarAnalitica() {
  if (!COMS.length && VE_TODO()) await cargarComerciales();
  await cargarProductos();
  $('v-analitica').innerHTML = `
    <div class="saludo"><div><h1>Analítica</h1><div class="fecha">Unidades e importes por médico, comercial, producto o zona</div></div></div>
    <div class="panel">
      <div class="filtros">
        <div id="aper"></div>
        <div><label for="adim">Ver por</label><select id="adim">
          <option value="medico">Médico</option><option value="comercial">Comercial</option>
          <option value="producto">Producto</option><option value="municipio">Municipio</option>
          <option value="mes">Mes</option><option value="canal">Canal</option></select></div>
        <div><label for="amedida">Ordenar por</label><select id="amedida">
          <option value="unidades">Unidades</option><option value="importe">Importe</option></select></div>
        <div><label for="acanal">Canal</label><select id="acanal">
          <option value="">Todos</option><option value="paciente">Recomendación</option>
          <option value="centro">Venta a centro</option></select></div>
        <div><label for="aprod">Producto</label><select id="aprod"><option value="">Todos</option>
          ${PRODUCTOS.map(p => `<option value="${p.id}">${esc(p.nombre)}</option>`).join('')}</select></div>
        ${VE_TODO() ? `<div><label for="acom">Comercial</label><select id="acom"><option value="">Todos</option>
          ${COMS.map(u => `<option value="${u.id}">${esc(u.nombre)}</option>`).join('')}</select></div>` : ''}
        <div style="grid-column:span 2"><label>Médico</label><div id="amed"></div></div>
        <input type="hidden" id="adesde"><input type="hidden" id="ahasta">
      </div>
      <div class="kpis vtot" id="atot"></div>
      <div id="aprods"></div>
      <div class="subnav" style="padding:12px 14px 0"><button data-avista="rank" aria-pressed="true">Ranking</button>
        <button data-avista="tabla" aria-pressed="false">Tabla por meses</button></div>
      <div id="aserie" style="padding:14px"></div>
      <div id="atabla"></div>
      <div id="atabla2" class="hide"></div>
    </div>`;
  const sinc = () => { const r = $('aper').__rango(); $('adesde').value = r.desde || ''; $('ahasta').value = r.hasta || ''; };
  montarPeriodo($('aper'), { id: 'analitica', valor: 'anio', alCambiar: () => { sinc(); refrescarAnalitica(); } });
  sinc();
  selectorMedico($('amed'), { valor: AN_MED, placeholder: 'Todos · busca un médico para ver sus ventas', alElegir: m => { AN_MED = m; refrescarAnalitica(); } });
  ['adim', 'acanal', 'amedida', 'aprod', 'acom'].forEach(id => { if ($(id)) $(id).onchange = refrescarAnalitica; });
  $('v-analitica').querySelectorAll('[data-avista]').forEach(b => b.onclick = () => {
    const tabla = b.dataset.avista === 'tabla';
    $('v-analitica').querySelectorAll('[data-avista]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    $('atabla').classList.toggle('hide', tabla); $('aserie').classList.toggle('hide', tabla);
    $('atabla2').classList.toggle('hide', !tabla);
    if (tabla) pintarTablaAnalitica();
  });
  pintarAnalitica();
}

function refrescarAnalitica() {
  pintarAnalitica();
  if (!$('atabla2').classList.contains('hide')) pintarTablaAnalitica();
}

async function pintarAnalitica() {
  cargando($('atabla'), 'Calculando…');
  $('atot').innerHTML = Array.from({ length: 4 }, () => '<div class="kpi ksk"><div class="skel" style="width:40%;height:24px;margin:2px 0 8px"></div><div class="skel" style="width:70%;margin:0"></div></div>').join('');
  const r = $('aper').__rango(), dim = $('adim').value, medida = $('amedida').value;
  const { data, error } = await db.rpc('analitica_v2', {
    p_dim: dim, p_desde: r.desde, p_hasta: r.hasta, p_canal: $('acanal').value || null,
    p_medico: AN_MED ? AN_MED.id : null, p_comercial: ($('acom') && $('acom').value) || null,
    p_producto: $('aprod').value || null, lim: 100 });
  if (error) { $('atabla').innerHTML = `<div class="vacio">No se ha podido calcular: ${esc(error.message)}</div>`; $('atot').innerHTML = ''; return; }
  const t = data.totales || {}, filas = (data.filas || []).slice().sort((a, b) => (+b[medida] || 0) - (+a[medida] || 0));
  const quien = [AN_MED ? AN_MED.nombre : '', $('acom') && $('acom').value ? $('acom').selectedOptions[0].textContent : '',
    $('aprod').value ? $('aprod').selectedOptions[0].textContent : ''].filter(Boolean).join(' · ');
  $('atot').innerHTML = `
    <div class="kpi"><b>${num(t.unidades)}</b><span>Unidades${quien ? ' · ' + esc(quien) : ''}</span></div>
    <div class="kpi ok"><b>${eurI(t.importe)}</b><span>Importe sin IVA</span></div>
    <div class="kpi"><b>${num(t.pedidos)}</b><span>Pedidos</span></div>
    <div class="kpi"><b>${num(t.medicos)}</b><span>Médicos que prescriben</span></div>`;
  const pp = data.por_producto || [];
  $('aprods').innerHTML = pp.length > 1 || (pp.length === 1 && dim !== 'producto') ? `<div class="dgrid-wrap"><div class="dgrid aprod">
    <div class="dh"><span>Por producto</span><span class="num">Unidades</span><span class="num">% uds.</span><span class="num">Importe</span></div>
    ${pp.map(p => `<div class="dr" style="cursor:default"><span><b>${esc(p.nombre)}</b></span><span class="num">${num(p.unidades)}</span>
      <span class="num">${Math.round(p.unidades / (t.unidades || 1) * 100)}%</span><span class="num">${eurI(p.importe)}</span></div>`).join('')}
  </div></div>` : '';

  const serie = data.serie || [];
  if (serie.length > 1) {
    const max = Math.max(...serie.map(s => +s[medida] || 0)) || 1;
    $('aserie').innerHTML = `<div style="display:flex;gap:6px;align-items:flex-end;height:130px">${serie.map(s => `
      <div style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:4px">
        <span class="sm">${medida === 'importe' ? eurI(s.importe).replace(',00', '') : num(s.unidades)}</span>
        <div style="width:100%;background:var(--sky);border-radius:6px 6px 0 0;height:${Math.round((+s[medida] || 0) / max * 84)}px"></div>
        <span class="sm">${esc(s.mes.slice(5))}/${esc(s.mes.slice(2, 4))}</span></div>`).join('')}</div>`;
  } else $('aserie').innerHTML = '';

  const tot = +t[medida] || 1;
  $('atabla').innerHTML = filas.length ? `<div class="dgrid-wrap"><div class="dgrid arank">
    <div class="dh"><span>#</span><span>${esc($('adim').selectedOptions[0].textContent)}</span><span class="num">Unidades</span>
      <span class="num">Importe</span><span class="num">Pedidos</span><span>Peso</span></div>
    ${filas.map((f, i) => `<div class="dr" style="cursor:default"><span class="sm">${i + 1}</span><span><b>${esc(f.nombre)}</b></span>
      <span class="num">${num(f.unidades)}</span><span class="num">${eurI(f.importe)}</span><span class="num">${num(f.pedidos)}</span>
      <span class="barra"><i style="width:${Math.round((+f[medida] || 0) / tot * 100)}%"></i><em>${Math.round((+f[medida] || 0) / tot * 100)}%</em></span></div>`).join('')}
    <div class="dr dtot"><span></span><span><b>Total</b></span><span class="num"><b>${num(t.unidades)}</b></span>
      <span class="num"><b>${eurI(t.importe)}</b></span><span class="num"><b>${num(t.pedidos)}</b></span><span></span></div>
  </div></div>` : '<div class="vacio">Sin ventas validadas con estos filtros.</div>';
}

/* ---------------- auditoría con periodo ---------------- */

async function pintarAuditoria() {
  cargando($('admcuerpo'), 'Cargando la auditoría…');
  const nombreEnt = { medicos: 'Médico', consultas: 'Consulta', visitas: 'Visita', agenda: 'Cita', rutas: 'Ruta',
    asignaciones: 'Cartera', pedidos: 'Pedido', perfiles: 'Usuario', productos: 'Producto', contactos: 'Paciente' };
  const { data: us } = await db.rpc('usuarios_lista');
  const usuarios = (us || []).slice().sort((x, y) => String(x.nombre).localeCompare(String(y.nombre), 'es'));
  ($('admcuerpo') || document.createElement('div')).innerHTML = `<h2>Auditoría<span class="n" id="audn">…</span></h2>
    <p class="sm">Quién ha cambiado qué y cuándo. Se guarda automáticamente.</p>
    <div class="filtros" style="border:0;padding:10px 16px">
      <div id="audper"></div>
      <div><label for="ausr">Usuario</label><select id="ausr"><option value="">Todos</option>
        ${usuarios.map(u => `<option value="${u.id}">${esc(u.nombre)}</option>`).join('')}</select></div>
      <div><label for="aent">Entidad</label><select id="aent"><option value="">Todas</option>
        ${Object.entries(nombreEnt).map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select></div></div>
    <div class="lista" id="audlista"></div>`;
  const pinta = async () => {
    cargando($('audlista'), 'Filtrando…');
    const r = $('audper').__rango();
    const { data } = await RPC_ORIG('auditoria_lista', { p_entidad: $('aent').value || null, p_usuario: $('ausr').value || null,
      p_desde: r.desde, lim: 500 });
    const l = (data || []).filter(a => !r.hasta || String(a.creado_en).slice(0, 10) <= r.hasta);
    $('audn').textContent = num(l.length) + (l.length === 500 ? '+' : '');
    $('audlista').innerHTML = l.map(a => `<div class="item" style="cursor:default">
      <span class="ic ${a.accion === 'Baja' ? 'w' : a.accion === 'Alta' ? 'o' : ''}">${a.accion === 'Alta' ? '+' : a.accion === 'Baja' ? '−' : '✎'}</span>
      <span class="tx"><b>${esc(a.accion)} · ${esc(nombreEnt[a.entidad] || a.entidad)}</b>
        <span class="sm">${esc(a.usuario)} · ${new Date(a.creado_en).toLocaleString('es', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
        <span class="sm">${esc(resumenDetalle(a.detalle))}</span></span></div>`).join('')
      || '<div class="vacio">Sin movimientos con estos filtros.</div>';
  };
  montarPeriodo($('audper'), { id: 'auditoria', valor: '7d', alCambiar: pinta });
  ['ausr', 'aent'].forEach(id => $(id).onchange = pinta);
  pinta();
}

/* ---------------- indicadores: configurador en tarjetas ---------------- */

function abrirKpis() {
  let D = kpiConfig().slice();
  KPI_CAT.forEach(k => { if (!D.some(x => x.id === k.id)) D.push({ id: k.id, on: false, t: '' }); });
  const esAdmin = PERFIL.rol === 'Administrador';
  const pinta = () => {
    $('dbody').innerHTML = `
      <div class="fh"><div><h2>Indicadores de Inicio</h2>
        <div class="sm">Pulsa el ojo para mostrar u ocultar. Ordénalos con las flechas y cambia el nombre si quieres.</div></div>
        <button class="x" data-cerrar aria-label="Cerrar">✕</button></div>
      <div class="kcards">${D.map((x, i) => {
        const k = KPI_CAT.find(y => y.id === x.id);
        if (!k && !x.filtro) return '';
        if (k && !kpiPermitido(k)) return '';
        const desc = x.filtro ? 'Filtro guardado del Directorio: ' + textoFiltro(x.filtro) + '.' : (AYUDA_KPI[x.id] || '');
        return `<div class="kcard ${x.on ? 'on' : ''}">
          <button type="button" class="kojo" data-kon="${i}" aria-pressed="${x.on}" title="${x.on ? 'Visible: pulsa para ocultar' : 'Oculto: pulsa para mostrar'}">${x.on ? ICO.ojo : ICO.ojoNo}</button>
          <div class="ktx"><input data-kt="${i}" value="${esc(x.t)}" placeholder="${esc(k ? k.t.charAt(0).toUpperCase() + k.t.slice(1) : textoFiltro(x.filtro))}" aria-label="Nombre del indicador">
            <span class="sm">${esc(desc)}</span></div>
          <div class="kord">
            <button type="button" class="kmv" data-kmv="${i}|-1" aria-label="Subir" ${i === 0 ? 'disabled' : ''}>${ICO.arriba}</button>
            <button type="button" class="kmv" data-kmv="${i}|1" aria-label="Bajar" ${i === D.length - 1 ? 'disabled' : ''}>${ICO.abajo}</button>
            ${x.filtro ? `<button type="button" class="kmv" data-kdel="${i}" aria-label="Eliminar" title="Eliminar">✕</button>` : ''}</div>
        </div>`;
      }).join('')}</div>
      <div class="acts" style="justify-content:flex-end">
        <button class="btn sec" id="kres">Restaurar</button>
        <button class="btn" id="kok">Guardar</button></div>`;
    const leer = () => $('dbody').querySelectorAll('[data-kt]').forEach(i => D[+i.dataset.kt].t = i.value.trim());
    $('dbody').querySelectorAll('[data-kon]').forEach(b => b.onclick = () => { leer(); D[+b.dataset.kon].on = !D[+b.dataset.kon].on; $('dlg').dataset.sucio = '1'; pinta(); });
    $('dbody').querySelectorAll('[data-kmv]').forEach(b => b.onclick = () => {
      leer(); const [i, dir] = b.dataset.kmv.split('|').map(Number), j = i + dir;
      if (j < 0 || j >= D.length) return; [D[i], D[j]] = [D[j], D[i]]; $('dlg').dataset.sucio = '1'; pinta();
    });
    $('dbody').querySelectorAll('[data-kdel]').forEach(b => b.onclick = () => { leer(); D.splice(+b.dataset.kdel, 1); $('dlg').dataset.sucio = '1'; pinta(); });
    $('kres').onclick = () => { D = KPI_CAT.map(k => ({ id: k.id, on: KPI_DEF.includes(k.id), t: '' })); $('dlg').dataset.sucio = '1'; pinta(); };
    $('kok').onclick = async ev => {
      leer(); ev.target.disabled = true; ev.target.textContent = 'Guardando…';
      const ok = await guardarKpis(D.map(x => ({ id: x.id, on: x.on, t: x.t, ...(x.filtro ? { filtro: x.filtro } : {}) })));
      ev.target.disabled = false; ev.target.textContent = 'Guardar';
      if (!ok) return;
      $('dlg').close(); toast('Indicadores guardados'); cargarInicio();
    };
  };
  pinta();
  $('dlg').showModal();
}

/* ---------------- ruta en curso: ficha al pulsar, acciones y orden ---------------- */

function recalcularRuta(a, hechos) {
  const cfg = PLANCFG(), sal = salidaUsuario();
  const ahora = new Date(), t0 = Math.ceil((ahora.getHours() * 60 + ahora.getMinutes()) / 5) * 5;
  let pos = [sal.lat, sal.lon], t = t0;
  a.paradas.forEach(p => {
    const hecha = p.medicos.every(m => hechos.has(m.id));
    if (hecha) { pos = p.xy; return; }
    const v = minutosEntre(pos, p.xy), dura = cfg.parada + cfg.visita * Math.min(p.medicos.filter(m => !hechos.has(m.id)).length, 8);
    p.llegada = t + v; p.fin = t + v + dura; t = p.fin; pos = p.xy;
  });
}

async function pintarRutaEnCurso() {
  if (TAB !== 'rutas') return;
  if (!$('renc')) $('v-rutas').querySelector('.saludo').insertAdjacentHTML('afterend', '<div id="renc"></div>');
  const a = rutaActiva(), pz = rutaPausada();
  if (!a && !pz) { $('renc').innerHTML = ''; return; }
  if (!a && pz) {
    $('renc').innerHTML = `<div class="card renc"><h2>Ruta en pausa: ${esc(pz.nombre)}<span class="n">${num(pz.pendientes.length)} pendientes</span></h2>
      <p class="sm">La pausaste el ${fechaCorta(fechaLocal(new Date(pz.pausada)))} con ${num(pz.hechos)} visitados.
        Al reanudarla se recalculan el orden y las horas desde tu punto de salida y la hora actual.</p>
      <div class="acts" style="padding:0 16px 16px"><button class="btn" id="rpreanudar">Reanudar ruta</button>
        <button class="btn sec" id="rpdescartar">Descartar la pausa</button></div></div>`;
    $('rpreanudar').onclick = e => planDesdeLista(pz.pendientes, pz.rutaId || pz.nombre, e.target);
    $('rpdescartar').onclick = async () => {
      if (!await preguntar('La ruta guardada no cambia; solo se olvidan los pendientes de esta pausa.', { titulo: '¿Descartar la pausa?', ok: 'Descartar' })) return;
      localStorage.removeItem(RPKEY()); pintarRutaEnCurso();
    };
    return;
  }
  const hechos = await visitadosDe(a);
  $('renc').innerHTML = `<div class="card renc"><h2>En ruta: ${esc(a.nombre)}<span class="n">${hechos.size} de ${a.codes.length}</span></h2>
    <p class="sm">Empezaste hace ${durTxt(Date.now() - a.inicio)}. Pulsa un médico para ver su ficha. Cambia el orden de las paradas con las flechas: las horas se recalculan.</p>
    ${a.paradas.map((p, i) => `<div class="parada">
        <span class="pord">
          <button class="kmv" data-rmv="${i}|-1" aria-label="Subir parada" ${i === 0 ? 'disabled' : ''}>${ICO.arriba}</button>
          <button class="kmv" data-rmv="${i}|1" aria-label="Bajar parada" ${i === a.paradas.length - 1 ? 'disabled' : ''}>${ICO.abajo}</button></span>
        <span class="ptit">${i + 1}. ${esc(p.centro)} · ${p.medicos.every(m => hechos.has(m.id)) ? '<b style="color:var(--ok)">✓ visitada</b>' : hm(p.llegada) + '–' + hm(p.fin)}${p.municipio ? ' · ' + esc(p.municipio) : ''}</span>
        <a class="icobtn" href="${enlaceNav(p.xy)}" target="_blank" rel="noopener" title="Cómo llegar" aria-label="Cómo llegar a ${esc(p.centro)}">${ICO.nav}</a></div>
      <div class="lista">${p.medicos.map(m => `<div class="item rmed" data-rvf="${m.id}" role="button" tabindex="0">
        <span class="ic ${hechos.has(m.id) ? 'o' : ''}">${hechos.has(m.id) ? '✓' : '·'}</span>
        <span class="tx"><b>${esc(m.nombre)}</b><span class="sm">${esc(m.especialidad || '')}${hechos.has(m.id) ? ' · <b style="color:var(--ok)">visitado</b>' : ''}</span></span>
        <span class="acts" style="margin:0">
          ${puedeEditar() ? `<button class="btn sec" data-rve="${m.id}">Editar ficha</button>` : ''}
          ${hechos.has(m.id) ? '' : `<button class="btn" data-rvr="${m.id}">Registrar visita</button>`}
          <button class="btn sec" data-rva="${m.id}">+ Agenda</button></span></div>`).join('')}</div>`).join('')}
    <div class="acts" style="padding:12px 16px 16px"><button class="btn dang" id="rencfin">Terminar o pausar</button></div></div>`;

  $('renc').querySelectorAll('[data-rvf]').forEach(el => {
    const abrir = e => { if (e.target.closest('button, a')) return; abrirFicha(el.dataset.rvf); };
    el.onclick = abrir; el.onkeydown = e => { if (e.key === 'Enter') abrir(e); };
  });
  $('renc').querySelectorAll('[data-rve]').forEach(b => b.onclick = () => abrirEditor(b.dataset.rve));
  $('renc').querySelectorAll('[data-rvr]').forEach(b => b.onclick = () => abrirVisita(b.dataset.rvr));
  $('renc').querySelectorAll('[data-rva]').forEach(b => b.onclick = () => nuevaCita(b.dataset.rva, hoyISO()));
  $('renc').querySelectorAll('[data-rmv]').forEach(b => b.onclick = () => {
    const [i, dir] = b.dataset.rmv.split('|').map(Number), j = i + dir;
    if (j < 0 || j >= a.paradas.length) return;
    [a.paradas[i], a.paradas[j]] = [a.paradas[j], a.paradas[i]];
    recalcularRuta(a, hechos);
    a.codes = a.paradas.flatMap(p => p.medicos.map(m => m.id));
    localStorage.setItem(RKEY(), JSON.stringify(a));
    pintarRutaEnCurso();
  });
  $('rencfin').onclick = terminarOPausar;
}

/* ---------------- ayudas ---------------- */

Object.assign(AYUDA, {
  analitica: ['Analítica', 'Unidades e importes de los pedidos validados.', [
    'Elige el <b>periodo</b> y la dimensión: médico, comercial, producto, municipio, mes o canal.',
    'Filtra por un <b>médico</b>, un <b>comercial</b> o un <b>producto</b> para ver sus totales y su reparto por producto.',
    'El importe es sin IVA y con el descuento de cada línea.',
    'Los datos no se pueden descargar: se consultan solo dentro de la plataforma.']]
});
AYUDA.inicio[2].splice(1, 1, 'El icono ⚙ junto a «Compartir la semana» abre los indicadores: el ojo los muestra u oculta y las flechas cambian el orden.');
AYUDA.ventas[2].push('Arriba tienes los totales del periodo (solo pedidos validados) y al final de la tabla, la suma.');


/* ============================================================
   DLC OS 2.0 · v2.24.0 · «Tu día»: la agenda del día es la ruta.
   Estados de cita, orden del día, jornada en curso
   ============================================================ */

/* ---------------- estados de cita ---------------- */

const CITA_ABIERTA = ['Planificada', 'Confirmada'];
Object.assign(EST_COL, { Planificada: 'var(--navy)', Confirmada: 'var(--sky)', Visitada: 'var(--ok)',
  'No estaba': 'var(--warn)', Aplazada: 'var(--muted)', Descartada: 'var(--muted)' });
const pillCita = e => `<span class="pill cest" style="background:${EST_COL[e] || 'var(--muted)'}1f;color:${EST_COL[e] || 'var(--muted)'}">${esc(e)}</span>`;

// La ruta en curso de versiones anteriores se sustituye por la jornada
try { Object.keys(localStorage).filter(k => k.startsWith('dlc-ruta-')).forEach(k => localStorage.removeItem(k)); } catch (e) {}

/* ---------------- jornada ---------------- */

const JKEY = () => 'dlc-jornada-' + (PERFIL ? PERFIL.id : '');
function jornadaActiva() {
  let j = null;
  try { j = JSON.parse(localStorage.getItem(JKEY()) || 'null'); } catch (e) {}
  if (j && j.fecha !== hoyISO()) { localStorage.removeItem(JKEY()); return null; }   // una jornada solo dura su día
  return j;
}

async function citasDelDia(fecha) {
  const r = await rpcCache('agenda_rango', { p_desde: fecha, p_hasta: fecha, p_usuario: PERFIL.id }, 'agenda-' + fecha);
  return r.data || [];
}

async function empezarJornada() {
  const citas = await citasDelDia(hoyISO());
  if (!citas.some(c => CITA_ABIERTA.includes(c.estado))) { toast('No tienes citas abiertas hoy. Añade citas o planifica una ruta.', true); return; }
  localStorage.setItem(JKEY(), JSON.stringify({ fecha: hoyISO(), inicio: Date.now() }));
  pintarRutaBarra();
  toast('Jornada iniciada');
  AG_MODO = 'dia'; AG_FECHA = hoyISO();
  if (TAB === 'agenda') cargarAgenda(); else ir('agenda');
}

async function terminarJornada() {
  const j = jornadaActiva(); if (!j) return;
  invalidarCache();
  const citas = await citasDelDia(hoyISO());
  const hechas = citas.filter(c => c.estado === 'Visitada').length;
  const abiertas = citas.filter(c => CITA_ABIERTA.includes(c.estado)).length;
  const ok = await preguntar(`Tiempo: ${durTxt(Date.now() - j.inicio)} · Visitadas: ${hechas} de ${citas.filter(c => c.estado !== 'Descartada').length}` +
    (abiertas ? `\n\nTe quedan ${abiertas} ${abiertas === 1 ? 'cita abierta' : 'citas abiertas'}: siguen en tu agenda y mañana aparecerán en «Pendientes de días anteriores» para moverlas.` : ''),
    { titulo: '¿Terminar la jornada?', ok: 'Terminar jornada' });
  if (!ok) return;
  localStorage.removeItem(JKEY());
  pintarRutaBarra();
  toast(`Jornada terminada · ${hechas} visitadas`);
  if (TAB === 'agenda') cargarAgenda();
  if (TAB === 'rutas') cargarRutas();
}

async function pintarRutaBarra() {
  const j = jornadaActiva(), el = $('rutabar');
  if (!j) { el.classList.add('hide'); document.body.classList.remove('conruta'); return; }
  el.classList.remove('hide'); document.body.classList.add('conruta');
  const citas = await citasDelDia(hoyISO());
  const hechas = citas.filter(c => c.estado === 'Visitada' || c.estado === 'No estaba').length;
  const total = citas.filter(c => !['Descartada', 'Aplazada'].includes(c.estado)).length;
  el.innerHTML = `<span>● <b>Jornada en curso</b> · <span class="rt">${durTxt(Date.now() - j.inicio)}</span> · ${hechas} de ${total} hechas</span>
    <span class="acts" style="margin:0"><button class="btn sec" id="rbver">Ver mi día</button><button class="btn dang" id="rbfin">Terminar</button></span>`;
  $('rbver').onclick = () => { AG_MODO = 'dia'; AG_FECHA = hoyISO(); ir('agenda'); };
  $('rbfin').onclick = terminarJornada;
}

/* ---------------- orden y horas estimadas ---------------- */

const minHora = h => h ? (+String(h).slice(0, 2) * 60 + +String(h).slice(3, 5)) : null;
const xyCita = c => c.lat != null && c.lon != null ? [+c.lat, +c.lon] : null;
const salidaUsuario = () => prefsActivas().salida || { nombre: 'la primera visita', lat: null, lon: null, falta: true };

/** Calcula la hora estimada de cada cita abierta siguiendo el orden actual. */
function estimarDia(citas, fecha) {
  const cfg = PLANCFG(), sal = salidaUsuario();
  const ahora = new Date(), minAhora = ahora.getHours() * 60 + ahora.getMinutes();
  let t = minHora(cfg.salida);
  if (fecha === hoyISO()) t = Math.max(t, Math.ceil(minAhora / 5) * 5);
  let pos = [sal.lat, sal.lon], anterior = null;
  const est = {};
  citas.forEach(c => {
    if (!CITA_ABIERTA.includes(c.estado)) { if (xyCita(c)) pos = xyCita(c); return; }
    const xy = xyCita(c);
    const mismoSitio = anterior && xy && anterior[0] === xy[0] && anterior[1] === xy[1];
    if (xy && !mismoSitio) { t += minutosEntre(pos, xy) + cfg.parada; pos = xy; }
    const fija = minHora(c.hora);
    if (fija != null && fija > t) t = fija;
    est[c.id] = t;
    t += cfg.visita;
    anterior = xy;
  });
  return { est, fin: t + minutosEntre(pos, [sal.lat, sal.lon]), tope: minHora(cfg.tope) };
}

/** Orden por cercanía: las citas con hora fija marcan el esqueleto; las demás se insertan donde menos desvío suman. */
function ordenarPorCercania(citas) {
  const sal = salidaUsuario(), s0 = [sal.lat, sal.lon];
  const cerradas = citas.filter(c => !CITA_ABIERTA.includes(c.estado));
  const abiertas = citas.filter(c => CITA_ABIERTA.includes(c.estado));
  const sinSitio = abiertas.filter(c => !xyCita(c));
  const fijas = abiertas.filter(c => xyCita(c) && c.hora).sort((a, b) => minHora(a.hora) - minHora(b.hora));
  const libres = abiertas.filter(c => xyCita(c) && !c.hora).sort((a, b) => km(s0, xyCita(a)) - km(s0, xyCita(b)));
  const seq = fijas.slice();
  libres.forEach(c => {
    const xy = xyCita(c);
    let mejor = 0, coste = Infinity;
    for (let i = 0; i <= seq.length; i++) {
      const prev = i === 0 ? s0 : xyCita(seq[i - 1]), next = i === seq.length ? null : xyCita(seq[i]);
      const d = km(prev, xy) + (next ? km(xy, next) - km(prev, next) : 0);
      if (d < coste) { coste = d; mejor = i; }
    }
    seq.splice(mejor, 0, c);
  });
  return cerradas.concat(seq, sinSitio);
}

async function guardarOrden(citas) {
  const { data: r, error } = await db.rpc('ordenar_citas', { p_ids: citas.map(c => c.id) });
  if (error || (r && r.ok === false)) { toast('No se ha podido guardar el orden', true); return false; }
  return true;
}

function proximoDiaConsulta(dias, desde) {
  const letras = 'DLMXJVS', claves = Object.keys(dias || {}).filter(k => (dias || {})[k]);
  const d = new Date((desde || hoyISO()) + 'T12:00:00');
  for (let i = 1; i <= 21; i++) {
    d.setDate(d.getDate() + 1);
    const l = letras[d.getDay()];
    if (l === 'D' || l === 'S') continue;
    if (!claves.length || claves.includes(l)) return fechaLocal(d);
  }
  return isoMas(desde || hoyISO(), 1);
}

/* ---------------- «Tu día» en la agenda ---------------- */

let TD_CITAS = [];

async function pintarTuDia() {
  const fecha = AG_FECHA, esHoy = fecha === hoyISO(), pasado = fecha < hoyISO();
  const r = await rpcCache('agenda_rango', { p_desde: fecha, p_hasta: fecha, p_usuario: agUsuarioFiltro() }, 'agenda-' + fecha);
  if (AG_FECHA !== fecha || AG_MODO !== 'dia') return;
  const todas = r.data || [];
  const mias = todas.filter(c => c.usuario_id === agUid());
  const otras = todas.filter(c => c.usuario_id !== agUid());
  TD_CITAS = mias;
  const { est, fin, tope } = estimarDia(mias, fecha);
  const j = jornadaActiva();
  const n = e => mias.filter(c => e.includes(c.estado)).length;
  const activas = mias.filter(c => !['Descartada', 'Aplazada'].includes(c.estado));
  const abiertas = n(CITA_ABIERTA);
  const pasaTope = abiertas && fin > tope;
  const conSitio = mias.filter(c => CITA_ABIERTA.includes(c.estado) && xyCita(c)).length;

  $('agcuerpo').innerHTML = `
    <div class="tdhead">
      <div><h2 style="padding:0">${esHoy ? 'Tu día' : pasado ? 'Lo que pasó este día' : 'Tu agenda de este día'}</h2>
        <div class="tdstats">
          <span><b>${num(activas.length)}</b> citas</span>
          <span><b style="color:var(--ok)">${n(['Visitada'])}</b> visitadas</span>
          ${n(['No estaba']) ? `<span><b style="color:var(--warn)">${n(['No estaba'])}</b> no estaban</span>` : ''}
          <span><b>${abiertas}</b> por hacer</span>
          ${abiertas && !pasado ? `<span>Fin estimado <b style="color:${pasaTope ? 'var(--warn)' : 'var(--navy)'}">${hm(fin)}</b>${pasaTope ? ' · pasa de tu hora tope' : ''}</span>` : ''}
        </div></div>
      <div class="acts" style="margin:0">
        ${!pasado && conSitio > 1 ? '<button class="btn sec" id="tdordenar" title="Ordena las citas abiertas para recorrer menos kilómetros. Las que tienen hora fija se respetan.">Ordenar por cercanía</button>' : ''}
        ${esHoy && !j && abiertas && agUid() === PERFIL.id ? '<button class="btn" id="tdempezar">▶ Empezar jornada</button>' : ''}
        ${esHoy && j && agUid() === PERFIL.id ? '<button class="btn dang" id="tdterminar">Terminar jornada</button>' : ''}
        ${pasado && abiertas ? '<button class="btn" id="tdrepro">Reprogramar pendientes</button>' : ''}
      </div>
    </div>
    ${esHoy && j ? `<div class="tdjornada">● Jornada en curso desde hace ${durTxt(Date.now() - j.inicio)}. Registra cada visita al terminarla.</div>` : ''}
    ${mias.length ? `<div class="lista tdlista">${mias.map((c, i) => {
      const abierta = CITA_ABIERTA.includes(c.estado);
      const hora = c.hora ? esc(String(c.hora).slice(0, 5)) : (abierta && est[c.id] != null && !pasado ? '~' + hm(est[c.id]) : '·');
      const idxAb = mias.filter(x => CITA_ABIERTA.includes(x.estado)).indexOf(c);
      return `<div class="item tdit ${abierta ? '' : 'cerrada'}" data-tdf="${c.medico_id}" role="button" tabindex="0">
        <span class="tdnum">${i + 1}</span>
        <span class="ic tdh" title="${c.hora ? 'Hora fijada' : 'Hora estimada según el orden'}" style="background:${EST_COL[c.estado]}1f;color:${EST_COL[c.estado]}">${hora}</span>
        <span class="tx"><b>${c.urgente ? '<span class="pill p-urg">Urgente</span> ' : ''}${esc(c.nombre)}</b>
          <span class="sm">${esc([c.centro_nombre, c.municipio].filter(Boolean).join(' · ') || 'Sin centro')}${!xyCita(c) && abierta ? ' · <span style="color:var(--warn)">sin ubicación</span>' : ''}</span>
          <span class="sm">${pillCita(c.estado)}${c.origen ? ' · ' + esc(c.origen) : ''}${c.nota ? ' · ' + esc(c.nota) : ''}</span>
          ${abierta && TD_INFO[c.id] && TD_INFO[c.id].aviso ? `<span class="sm tdaviso">⚠ ${esc(TD_INFO[c.id].aviso)}</span>`
            : abierta && TD_INFO[c.id] && TD_INFO[c.id].ventanas && TD_INFO[c.id].ventanas.length ? `<span class="sm tdvent">Consulta ${esc(txtVentanas(TD_INFO[c.id].ventanas))}${TD_INFO[c.id].espera ? ` · esperas ${TD_INFO[c.id].espera} min` : ''}</span>` : ''}</span>
        <span class="acts tdacts" style="margin:0">
          ${abierta && !pasado ? `
            <span class="tdord">
              <button class="kmv" data-td="sube|${c.id}" aria-label="Subir" ${idxAb <= 0 ? 'disabled' : ''}>${ICO.arriba}</button>
              <button class="kmv" data-td="baja|${c.id}" aria-label="Bajar" ${idxAb >= abiertas - 1 ? 'disabled' : ''}>${ICO.abajo}</button></span>` : ''}
          ${abierta ? `<button class="btn" data-td="visita|${c.id}">Registrar visita</button>` : ''}
          ${c.estado === 'No estaba' && !pasado ? `<button class="btn sec" data-td="nueva|${c.id}">Nueva cita</button>` : ''}
          <button class="btn sec tdmas" data-td="mas|${c.id}" aria-label="Más acciones">⋯</button>
        </span></div>`;
    }).join('')}</div>` : `<div class="vacio">${esHoy ? 'No tienes citas hoy. Planifica una ruta en Rutas o mira las sugerencias de abajo.' : 'Sin citas este día.'}</div>`}
    ${otras.length ? `<h3 class="tdotros">Citas de otras personas · ${otras.length}</h3>
      <div class="lista">${otras.map(c => `<div class="item" style="cursor:default"><span class="ic">${c.hora ? esc(String(c.hora).slice(0, 5)) : '·'}</span>
        <span class="tx"><b>${esc(c.nombre)}</b><span class="sm">${esc(c.usuario || '')} · ${pillCita(c.estado)}</span></span></div>`).join('')}</div>` : ''}`;

  if ($('tdempezar')) $('tdempezar').onclick = empezarJornada;
  if ($('tdterminar')) $('tdterminar').onclick = terminarJornada;
  if ($('tdrepro')) $('tdrepro').onclick = () => reprogramarCitas(mias.filter(c => CITA_ABIERTA.includes(c.estado)), 'Pendientes del ' + fechaCorta(fecha), 'Sin visitar ese día');
  if ($('tdordenar')) $('tdordenar').onclick = async () => {
    const nuevo = ordenarPorCercania(mias);
    const nf = ordenarPorCercania.fuera || 0;
    if (await guardarOrden(nuevo)) { toast(nf ? `Ordenadas · ${nf} no caben en su horario o en el tuyo y quedan al final` : 'Citas ordenadas por cercanía'); cargarAgenda(); }
  };
  $('agcuerpo').querySelectorAll('[data-tdf]').forEach(el => {
    const abrir = e => { if (e.target.closest('button, a, .tdmenu')) return; abrirFicha(el.dataset.tdf); };
    el.onclick = abrir; el.onkeydown = e => { if (e.key === 'Enter') abrir(e); };
  });
}

/* Menú «⋯» de cada cita */
function menuCita(boton, c) {
  document.querySelectorAll('.tdmenu').forEach(m => m.remove());
  const abierta = CITA_ABIERTA.includes(c.estado), futura = c.fecha >= hoyISO();
  const ops = [
    abierta && c.estado === 'Planificada' ? ['confirmar', 'Marcar como confirmada', 'Ya has hablado con la consulta'] : null,
    abierta && c.estado === 'Confirmada' ? ['desconfirmar', 'Quitar la confirmación', ''] : null,
    abierta ? ['noestaba', 'No estaba', 'Lo anota en su historial y te propone otra fecha'] : null,
    abierta ? ['hora', c.hora ? 'Cambiar la hora' : 'Fijar una hora', ''] : null,
    abierta ? ['aplazar', 'Aplazar a otro día', 'Queda como aplazada y se crea la cita nueva'] : null,
    xyCita(c) ? ['llegar', 'Cómo llegar', ''] : null,
    ['ficha', 'Ver ficha', ''],
    abierta ? ['descartar', 'Descartar', 'Ya no hace falta ir'] : null,
    futura && c.estado !== 'Visitada' ? ['borrar', 'Borrar la cita', 'Desaparece de la agenda'] : null
  ].filter(Boolean);
  const m = document.createElement('div');
  m.className = 'tdmenu'; m.__t = Date.now();
  m.innerHTML = ops.map(([k, t, s]) => `<button data-tdop="${k}" class="${k === 'borrar' || k === 'descartar' ? 'peligro' : ''}"><b>${esc(t)}</b>${s ? `<span>${esc(s)}</span>` : ''}</button>`).join('');
  document.body.appendChild(m);
  const r = boton.getBoundingClientRect();
  m.style.top = Math.min(window.innerHeight - m.offsetHeight - 10, r.bottom + 6) + 'px';
  m.style.left = Math.max(10, Math.min(window.innerWidth - m.offsetWidth - 10, r.right - m.offsetWidth)) + 'px';
  m.querySelectorAll('[data-tdop]').forEach(b => b.onclick = () => { m.remove(); accionCita(b.dataset.tdop, c); });
}
document.addEventListener('pointerdown', e => {
  if (!e.target.closest('.tdmenu, .tdmas')) document.querySelectorAll('.tdmenu').forEach(m => m.remove());
}, true);
// Se cierra al desplazarse, salvo en el primer instante (el propio toque puede mover un poco la página)
document.addEventListener('scroll', () => document.querySelectorAll('.tdmenu').forEach(m => { if (Date.now() - (m.__t || 0) > 400) m.remove(); }), true);

async function accionCita(k, c) {
  const refrescar = () => { cargarAgenda(); cargarInicio(); pintarRutaBarra(); };
  if (k === 'ficha') return abrirFicha(c.medico_id);
  if (k === 'llegar') return window.open(enlaceNav(xyCita(c)), '_blank', 'noopener');
  if (k === 'hora') return cambiarHoraCita(c.id, c.hora || '');
  if (k === 'confirmar' || k === 'desconfirmar' || k === 'descartar') {
    const estado = k === 'confirmar' ? 'Confirmada' : k === 'desconfirmar' ? 'Planificada' : 'Descartada';
    const r = await escribir('estado_cita', { p_id: c.id, p_estado: estado });
    if (r && r.error) { toast('No se ha podido cambiar', true); return; }
    toast(estado === 'Confirmada' ? 'Cita confirmada' : estado === 'Descartada' ? 'Cita descartada' : 'Confirmación quitada'); refrescar(); return;
  }
  if (k === 'borrar') {
    if (!await preguntar('La cita desaparece de la agenda.', { titulo: '¿Borrar la cita?', ok: 'Borrar', peligro: true })) return;
    const { data: r } = await db.rpc('borrar_cita', { p_id: c.id });
    if (r && r.ok === false) { toast(r.error === 'pasada' ? 'Solo se pueden borrar citas de hoy en adelante' : 'No se ha podido borrar', true); return; }
    toast('Cita borrada'); refrescar(); return;
  }
  if (k === 'aplazar') {
    const f = await pedirFecha('¿A qué día la pasas?', proximoDiaConsulta(c.dias, c.fecha),
      { titulo: 'Aplazar la cita', ok: 'Aplazar' });
    if (!f) return;
    const { data: r, error } = await db.rpc('aplazar_cita', { p_id: c.id, p_fecha: f, p_hora: null, p_origen: 'Aplazada' });
    if (error || (r && r.ok === false)) { toast('No se ha podido aplazar', true); return; }
    toast('Aplazada al ' + fechaCorta(f)); refrescar(); return;
  }
  if (k === 'noestaba') {
    const neg = (CAT.RESULTADO || []).filter(x => x.extra === 'neg');
    if (!neg.length) { toast('Falta un resultado negativo en Configuración → Clasificadores', true); return; }
    let res = neg[0].valor;
    if (neg.length > 1) {
      const op = await elegirOpcion('¿Qué ha pasado?', c.nombre, [{ k: 'no', t: 'Cancelar', cls: 'sec' }].concat(neg.map((x, i) => ({ k: 'n' + i, t: x.valor, cls: 'sec' }))));
      if (!op) return;
      res = neg[+op.slice(1)].valor;
    }
    const { error } = await db.rpc('registrar_visita', { p: { medico_id: c.medico_id, fecha: c.fecha, resultados: [res],
      op_id: 'v-' + c.medico_id + '-' + Date.now() } });
    if (error) { toast('No se ha podido guardar: ' + error.message, true); return; }
    toast('Anotado: ' + res);
    refrescar();
    return nuevaFechaTrasNoEstaba(c);
  }
  if (k === 'nueva') return nuevaFechaTrasNoEstaba(c);
}

async function nuevaFechaTrasNoEstaba(c) {
  const prop = proximoDiaConsulta(c.dias, c.fecha);
  const op = await elegirOpcion('¿Le buscamos otro día?', `${c.nombre}\n\nEl próximo día que pasa consulta es el ${fechaLarga(new Date(prop + 'T00:00:00'))}.`,
    [{ k: 'no', t: 'Ahora no', cls: 'sec' }, { k: 'otra', t: 'Elegir otra fecha', cls: 'sec' }, { k: 'prop', t: 'Cita el ' + fechaCorta(prop) }]);
  if (!op) return;
  let f = prop;
  if (op === 'otra') { f = await pedirFecha('¿Qué día?', prop, { titulo: 'Nueva cita', ok: 'Crear cita' }); if (!f) return; }
  const { data: r, error } = await db.rpc('guardar_cita', { p: { medico_id: c.medico_id, fecha: f, centro_nombre: c.centro_nombre,
    estado: 'Planificada', origen: 'No estaba el ' + fechaCorta(c.fecha), op_id: 'ne-' + c.id + '-' + f } });
  if (error || (r && r.ok === false)) { toast('No se ha podido crear la cita', true); return; }
  toast('Nueva cita el ' + fechaCorta(f)); cargarAgenda();
}

document.addEventListener('click', async e => {
  const b = e.target.closest('[data-td]');
  if (!b) return;
  e.stopPropagation();
  const [acc, id] = b.dataset.td.split('|');
  const c = TD_CITAS.find(x => x.id === id);
  if (!c) return;
  if (acc === 'mas') return menuCita(b, c);
  if (acc === 'visita') return abrirVisita(c.medico_id);
  if (acc === 'nueva') return nuevaFechaTrasNoEstaba(c);
  if (acc === 'sube' || acc === 'baja') {
    const ab = TD_CITAS.filter(x => CITA_ABIERTA.includes(x.estado)), i = ab.indexOf(c), j = acc === 'sube' ? i - 1 : i + 1;
    if (j < 0 || j >= ab.length) return;
    [ab[i], ab[j]] = [ab[j], ab[i]];
    const orden = TD_CITAS.filter(x => !CITA_ABIERTA.includes(x.estado)).concat(ab);
    if (await guardarOrden(orden)) cargarAgenda();
  }
});

// La vista de día de la agenda es «Tu día»
cargarAgenda = (orig => async function () {
  await orig();
  if (TAB === 'agenda' && AG_MODO === 'dia') await pintarTuDia();
})(cargarAgenda);

// Al cerrar una visita o una cita, se refresca el día
$('dlg').addEventListener('close', () => { if (TAB === 'agenda') setTimeout(() => { cargarAgenda(); pintarRutaBarra(); }, 350); });

// En la semana, «Mover» ahora aplaza (antes dejaba la cita en un estado que ya no existía)
document.addEventListener('click', async e => {
  const c = e.target.closest('[data-cita^="repro|"]');
  if (!c) return;
  e.stopImmediatePropagation(); e.preventDefault();
  const id = c.dataset.cita.split('|')[1];
  const f = await pedirFecha('¿A qué día la pasas?', isoMas(hoyISO(), 1), { titulo: 'Aplazar la cita', ok: 'Aplazar' });
  if (!f) return;
  const { data: r, error } = await db.rpc('aplazar_cita', { p_id: id, p_fecha: f, p_hora: null, p_origen: 'Aplazada' });
  if (error || (r && r.ok === false)) { toast('No se ha podido aplazar', true); return; }
  toast('Aplazada al ' + fechaCorta(f)); cargarAgenda();
}, true);

/* ---------------- rutas: el plan se convierte en la agenda del día ---------------- */

async function planAAgenda(plan) {
  const fecha = plan.fecha || hoyISO();
  const meds = plan.paradas.flatMap(p => p.medicos.map(m => ({ m, centro: p.centro, nota: p.nota || '' })));
  const existentes = await citasDelDia(fecha);
  const ids = [];
  let orden = existentes.length;
  for (const { m, centro, nota } of meds) {
    const ya = existentes.find(c => c.medico_id === m.id && CITA_ABIERTA.includes(c.estado));
    if (ya) { ids.push(ya.id); continue; }
    const { data: r, error } = await db.rpc('guardar_cita', { p: { medico_id: m.id, fecha, hora: null, centro_nombre: centro,
      estado: 'Planificada', origen: 'Ruta' + (typeof plan.rutaId === 'string' && plan.rutaId.length > 20 ? '' : ''), orden: ++orden, nota: nota || null,
      op_id: 'c-' + m.id + '-' + fecha } });
    if (error || !r || !r.ok) { toast('No se ha podido guardar alguna cita', true); return null; }
    ids.push(r.id);
  }
  // Orden: primero lo que ya había cerrado, después el orden del plan
  const cerradas = existentes.filter(c => !CITA_ABIERTA.includes(c.estado)).map(c => c.id);
  const abiertasPrevias = existentes.filter(c => CITA_ABIERTA.includes(c.estado) && !ids.includes(c.id)).map(c => c.id);
  await db.rpc('ordenar_citas', { p_ids: cerradas.concat(ids, abiertasPrevias) });
  invalidarCache();
  return { fecha, n: meds.length };
}

async function empezarRuta() {
  if (!PLAN) return;
  if (PLAN.fecha && PLAN.fecha !== hoyISO()) { toast('Este plan es para otro día: guárdalo en tu agenda.', true); return; }
  const r = await planAAgenda(PLAN);
  if (!r) return;
  PLAN = null;
  localStorage.setItem(JKEY(), JSON.stringify({ fecha: hoyISO(), inicio: Date.now() }));
  pintarRutaBarra();
  toast('Plan pasado a tu agenda · jornada iniciada');
  AG_MODO = 'dia'; AG_FECHA = hoyISO();
  ir('agenda');
}

pintarPlan = (orig => function () {
  orig();
  if ($('planag')) $('planag').onclick = async ev => {
    ev.target.disabled = true;
    const r = await planAAgenda(PLAN);
    ev.target.disabled = false;
    if (!r) return;
    toast(`${r.n} citas en tu agenda del ${fechaCorta(r.fecha)}`);
    AG_MODO = 'dia'; AG_FECHA = r.fecha; PLAN = null; ir('agenda');
  };
  if ($('planempezar')) { $('planempezar').textContent = '▶ Pasar a mi agenda y empezar'; $('planempezar').onclick = empezarRuta; }
  if ($('planag')) $('planag').textContent = 'Guardar en mi agenda';
})(pintarPlan);

// En Rutas, la ruta en curso se ve en «Tu día»
async function pintarRutaEnCurso() {
  if (TAB !== 'rutas') return;
  if (!$('renc')) $('v-rutas').querySelector('.saludo').insertAdjacentHTML('afterend', '<div id="renc"></div>');
  const j = jornadaActiva();
  $('renc').innerHTML = j ? `<div class="card renc"><h2>Jornada en curso</h2>
    <p class="sm">Empezaste hace ${durTxt(Date.now() - j.inicio)}. El orden, las horas y el registro de visitas están en tu agenda de hoy.</p>
    <div class="acts" style="padding:0 16px 16px"><button class="btn" id="rencver">Ver mi día</button>
      <button class="btn sec dang" id="rencfin">Terminar jornada</button></div></div>` : '';
  if (j) { $('rencver').onclick = () => { AG_MODO = 'dia'; AG_FECHA = hoyISO(); ir('agenda'); }; $('rencfin').onclick = terminarJornada; }
}

/* ---------------- ayudas ---------------- */

Object.assign(AYUDA, {
  agenda: ['Agenda y «Tu día»', 'Tus citas por día, semana o mes. La vista de día es tu ruta.', [
    'Las citas se ordenan como vas a visitarlas. <b>Ordenar por cercanía</b> calcula el recorrido más corto; las citas con hora fija se respetan. Las flechas cambian el orden a mano.',
    'La hora con «~» es una estimación según el orden, tu horario y los desplazamientos. Una hora sin «~» es una hora fijada.',
    '<b>Empezar jornada</b> activa la barra verde. Registra cada visita al terminarla: la cita pasa a <b>Visitada</b>.',
    'Estados: <b>Planificada</b> y <b>Confirmada</b> (abiertas); <b>Visitada</b>, <b>No estaba</b>, <b>Aplazada</b> y <b>Descartada</b> (cerradas).',
    '<b>No estaba</b> lo anota en su historial y te propone el próximo día que pasa consulta.',
    '<b>Aplazar</b> deja la cita como aplazada y crea la nueva, así se ve el cumplimiento real.',
    'Las citas abiertas de días anteriores aparecen abajo para moverlas a hoy.']],
  rutas: ['Rutas', 'Plantillas para llenar tu agenda.', [
    '<b>Lista fija</b>: tú eliges los médicos. <b>Por criterios</b>: se rellena sola con los filtros.',
    'Al planificar ves el orden y las horas estimadas. <b>Guardar en mi agenda</b> crea las citas de ese día; <b>Pasar a mi agenda y empezar</b> además inicia la jornada.',
    'Durante la jornada todo se hace desde <b>Agenda → Tu día</b>.',
    '<b>⚙ Horario de rutas</b> cambia la salida, la hora tope y los minutos por médico y por parada.',
    'Solo entran médicos con ubicación. Completar la dirección y los días de consulta mejora mucho las rutas.']]
});


/* ============================================================
   DLC OS 2.0 · v2.24.1 · Entorno de pruebas
   ============================================================ */

const EN_PRUEBAS = CFG.entorno === 'pruebas';
const RPC_ORIG_FROM = t => FROM_ORIG(t);

function pintarFranjaPruebas() {
  if (!EN_PRUEBAS) return;
  document.title = '[PRUEBAS] ' + document.title.replace(/^\[PRUEBAS\] /, '');
  const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = '#B45309';
  let f = $('franjapruebas');
  if (!f) {
    document.body.insertAdjacentHTML('afterbegin', '<div id="franjapruebas"></div>');
    document.body.classList.add('enpruebas');
    f = $('franjapruebas');
  }
  if (CFG.sinConfigurar) {
    f.innerHTML = '<b>ENTORNO DE PRUEBAS SIN CONFIGURAR</b> · Falta pegar la Project URL y la clave anon de pruebas en config.js';
    return;
  }
  const admin = PERFIL && PERFIL.rol === 'Administrador';
  f.innerHTML = `<span><b>ENTORNO DE PRUEBAS</b> · Nada de lo que hagas aquí afecta a los datos reales
      <button class="ai" data-ayuda="pruebas" aria-label="Qué es el entorno de pruebas">i</button>
      <span class="prpunto" id="prpunto"></span></span>
    ${admin ? `<span class="acts" style="margin:0">
      <button class="btn" id="prreset" title="Deshace todo lo hecho en pruebas y deja los datos como se cargaron de producción">↺ Volver a los datos de partida</button></span>` : ''}`;
  // Cuándo se guardó el punto de partida
  RPC_ORIG_FROM('entorno_pruebas').select('maestro_guardado_en, ultimo_reset').eq('id', 1).single().then(({ data }) => {
    const el = $('prpunto'); if (!el) return;
    const fmt = x => new Date(x).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    el.textContent = data && data.maestro_guardado_en ? '· Datos de partida: copia de producción del ' + fmt(data.maestro_guardado_en)
      : '· Faltan los datos de partida (ejecuta pruebas_punto_fijo.sql)';
    if (!(data && data.maestro_guardado_en)) el.classList.add('falta');
  });
  if (!admin) return;
  $('prreset').onclick = async () => {
    const txt = await pedirTexto('Se borrará todo lo que se haya creado o cambiado en pruebas (visitas, citas, pedidos, pacientes, cambios en fichas…) y los datos quedarán exactamente como se copiaron de producción.\n\nNo afecta a producción. Escribe VOLVER para confirmar.', '',
      { titulo: '¿Volver a los datos de partida?', ok: 'Volver a los datos de partida' });
    if (txt === null) return;
    if (txt.trim().toUpperCase() !== 'VOLVER') { toast('No se ha hecho nada: no coincide la palabra', true); return; }
    toast('Volviendo al punto de partida…');
    const { data: r, error } = await RPC_ORIG('pruebas_resetear', { p_confirmacion: 'RESTABLECER' });
    if (error || !r || !r.ok) {
      toast(r && r.error === 'sin_maestro' ? 'Faltan los datos de partida: hay que ejecutar pruebas_punto_fijo.sql' : 'No se ha podido: ' + ((error && error.message) || (r && r.error) || ''), true);
      return;
    }
    try { Object.keys(localStorage).filter(k => k.startsWith('dlc-rc-') || k.startsWith('dlc-jornada-')).forEach(k => localStorage.removeItem(k)); } catch (e) {}
    toast('Datos como al principio'); setTimeout(() => location.reload(), 600);
  };
}

AYUDA.pruebas = ['Entorno de pruebas', 'Una copia completa de la plataforma con su propia base de datos, para probar sin miedo.', [
  'Todo lo que hagas aquí (visitas, citas, pedidos, cambios en fichas…) se queda aquí: <b>producción no se toca</b>.',
  'Los <b>datos de partida</b> son una copia de producción. Son fijos: desde la app no se pueden cambiar, así que siempre se puede volver a ellos.',
  '<b>↺ Volver a los datos de partida</b> deshace todo lo hecho en pruebas y deja los datos exactamente como se copiaron. Úsalo al terminar una tanda de pruebas.',
  'Los usuarios son los mismos que en producción, con la contraseña común de pruebas.',
  'Para tener datos más recientes de producción se hace una nueva copia (lo preparo yo); esa copia pasa a ser los nuevos datos de partida.']];

if (EN_PRUEBAS) {
  pintarFranjaPruebas();
  const mostrarAppV2240 = mostrarApp;
  mostrarApp = function (perfil) { mostrarAppV2240(perfil); pintarFranjaPruebas(); };
}


/* ============================================================
   DLC OS 2.0 · v2.25.0 · Rutas y Agenda, bloque 2:
   horario de consulta en la planificación, reprogramación de lo
   no visitado y semana en cuadrícula
   ============================================================ */

/* ---------------- horarios de consulta ---------------- */

const LETRA_DIA = f => 'DLMXJVS'[new Date(f + 'T12:00:00').getDay()];
const txtMin = m => hm(m);

/**
 * Franjas de consulta de un médico en una fecha, en minutos.
 * null → no sabemos su horario (sin restricción) · [] → ese día no pasa consulta · [[ini, fin], …]
 */
function ventanasDe(dias, fecha) {
  const d = dias || {};
  if (!Object.keys(d).some(k => d[k])) return null;
  const t = d[LETRA_DIA(fecha)];
  if (!t) return [];
  const out = [];
  String(t).split(/[;,/]| y /i).forEach(parte => {
    const r = /(\d{1,2})(?:[:.h](\d{2}))?\s*[-–a]\s*(\d{1,2})(?:[:.h](\d{2}))?/.exec(parte);
    if (r) out.push([+r[1] * 60 + (+r[2] || 0), +r[3] * 60 + (+r[4] || 0)]);
    else if (/mañana/i.test(parte)) out.push([9 * 60, 14 * 60]);
    else if (/tarde/i.test(parte)) out.push([15 * 60, 20 * 60]);
  });
  return out.length ? out.sort((a, b) => a[0] - b[0]) : [[0, 24 * 60]];
}
const txtVentanas = v => v && v.length ? v.map(([a, b]) => `${txtMin(a)}–${txtMin(b)}`).join(' y ') : '';

/** Primer minuto en que se puede empezar la visita llegando a «llegada», o null si no hay hueco. */
function inicioPosible(it, llegada, dura) {
  if (it.fija != null) return llegada <= it.fija + 10 ? Math.max(llegada, it.fija) : null;
  if (!it.ventanas) return llegada;
  for (const [a, b] of it.ventanas) { const s = Math.max(llegada, a); if (s + dura <= b) return s; }
  return null;
}

/**
 * Ordena visitas respetando franjas de consulta y horas fijadas.
 * items: { id, xy, ventanas, fija, ref }. Devuelve { seq: [{it, llegada, ini, fin}], fuera: [{it, motivo}], fin }
 */
function programarVisitas(items, t0) {
  const cfg = PLANCFG(), sal = salidaUsuario(), tope = minHora(cfg.tope), dura = cfg.visita;
  let pos = [sal.lat, sal.lon], t = t0;
  const seq = [], fuera = [];
  let pend = [];
  items.forEach(it => {
    if (it.ventanas && !it.ventanas.length) fuera.push({ it, motivo: 'no pasa consulta este día' });
    else if (!it.xy) fuera.push({ it, motivo: 'sin ubicación' });
    else pend.push(it);
  });
  const llegadaA = (it, desde, tt, primera) => {
    const mismo = !primera && desde[0] === it.xy[0] && desde[1] === it.xy[1];
    return tt + (mismo ? 0 : minutosEntre(desde, it.xy) + cfg.parada);
  };
  while (pend.length) {
    let mejor = null;
    const fijas = pend.filter(x => x.fija != null).sort((a, b) => a.fija - b.fija);
    for (const it of pend) {
      const lleg = llegadaA(it, pos, t, !seq.length);
      const ini = inicioPosible(it, lleg, dura);
      if (ini == null || ini + dura > tope) continue;
      // No elegir algo que haga llegar tarde a la próxima cita con hora fijada
      if (it.fija == null && fijas.length) {
        const f = fijas[0];
        if (llegadaA(f, it.xy, ini + dura, false) > f.fija + 10) continue;
      }
      const coste = ini - t;
      if (!mejor || coste < mejor.coste) mejor = { it, lleg, ini, coste };
    }
    if (!mejor) break;
    seq.push({ it: mejor.it, llegada: mejor.lleg, ini: mejor.ini, fin: mejor.ini + dura });
    t = mejor.ini + dura; pos = mejor.it.xy;
    pend = pend.filter(x => x !== mejor.it);
  }
  pend.forEach(it => {
    const v = it.ventanas;
    fuera.push({ it, motivo: it.fija != null ? 'no llegas a la hora fijada'
      : v && v.every(([, b]) => b <= t) ? `su consulta (${txtVentanas(v)}) ya habrá acabado`
      : 'no cabe antes de tu hora tope' });
  });
  return { seq, fuera, fin: t + minutosEntre(pos, [sal.lat, sal.lon]) };
}

async function conHorarios(lista) {
  const faltan = lista.filter(m => !('dias' in m)).map(m => m.id);
  if (!faltan.length) return lista;
  const { data } = await db.rpc('horarios_medicos', { p_ids: faltan });
  const por = {}; (data || []).forEach(h => por[h.id] = h);
  return lista.map(m => por[m.id] ? Object.assign({}, m, { dias: por[m.id].dias || {} }) : m);
}

/* ---------------- plan de ruta con horarios ---------------- */

async function construirPlan(conXY, rutaId, btn, opts) {
  opts = opts || {};
  ULTIMO_PLAN = { conXY, rutaId, opts };
  const cfg = PLANCFG(), sal = salidaUsuario();
  const fecha = opts.manana ? siguienteLaborable() : hoyISO();
  const ahora = new Date(), minAhora = ahora.getHours() * 60 + ahora.getMinutes();
  const salidaCfg = minHora(cfg.salida), tope = minHora(cfg.tope);
  const t0 = opts.manana ? salidaCfg : Math.max(salidaCfg, Math.ceil(minAhora / 5) * 5);

  if (t0 >= tope) {
    const op = await elegirOpcion('Ya ha pasado tu horario de ruta de hoy',
      `Tu horario es de ${cfg.salida} a ${cfg.tope} y ahora son las ${hm(minAhora)}.\n\nPuedes planificar la ruta para el ${fechaLarga(new Date(siguienteLaborable() + 'T00:00:00'))} o cambiar tu horario.`,
      [{ k: 'no', t: 'Cancelar', cls: 'sec' }, { k: 'horario', t: '⚙ Cambiar horario', cls: 'sec' }, { k: 'manana', t: 'Planificar para mañana' }]);
    if (op === 'horario') abrirHorarioPlan();
    if (op === 'manana') construirPlan(conXY, rutaId, btn, { manana: true });
    return;
  }

  const meds = await conHorarios(conXY);
  const items = meds.map(m => ({ id: m.id, ref: m, xy: m.lat != null && m.lon != null ? [+m.lat, +m.lon] : null,
    ventanas: ventanasDe(m.dias, fecha), fija: null }));
  const { seq, fuera, fin } = programarVisitas(items, t0);

  if (!seq.length) {
    const noDia = fuera.filter(f => f.motivo === 'no pasa consulta este día').length;
    const op = await elegirOpcion('No cabe ninguna visita',
      (noDia === fuera.length ? `Ninguno de estos ${fuera.length} médicos pasa consulta el ${fechaLarga(new Date(fecha + 'T00:00:00'))}.`
        : `Con tu horario (${cfg.salida}–${cfg.tope}) y las horas de consulta no da tiempo a ninguna visita.`),
      [{ k: 'no', t: 'Cancelar', cls: 'sec' }, { k: 'horario', t: '⚙ Cambiar horario', cls: 'sec' }].concat(opts.manana ? [] : [{ k: 'manana', t: 'Probar para mañana' }]));
    if (op === 'horario') abrirHorarioPlan();
    if (op === 'manana') construirPlan(conXY, rutaId, btn, { manana: true });
    return;
  }

  // Visitas seguidas en el mismo sitio forman una parada
  const paradas = [];
  seq.forEach(s => {
    const m = Object.assign({}, s.it.ref, { horaPlan: s.ini, ventanas: s.it.ventanas });
    const ult = paradas[paradas.length - 1];
    if (ult && ult.xy[0] === s.it.xy[0] && ult.xy[1] === s.it.xy[1]) { ult.medicos.push(m); ult.fin = s.fin; }
    else paradas.push({ centro: m.centro_nombre || 'Consulta privada', municipio: m.municipio, dir: m.direccion,
      xy: s.it.xy, medicos: [m], llegada: s.ini, fin: s.fin });
  });
  PLAN = { rutaId, salida: sal, paradas, fin, fecha, inicio: t0, fuera: fuera.map(f => ({ m: f.it.ref, motivo: f.motivo })) };
  if (TAB !== 'rutas') ir('rutas');
  pintarPlan();
  setTimeout(() => $('rplan') && $('rplan').scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
}

pintarPlan = (orig => function () {
  orig();
  if (!PLAN || !$('rplan')) return;
  // Hora de cada médico y su franja de consulta
  $('rplan').querySelectorAll('.lista > .item').forEach((el, i) => {
    const p = PLAN.paradas[i]; if (!p) return;
    const linea = el.querySelectorAll('.tx .sm')[1];
    if (linea) linea.innerHTML = p.medicos.map(m => `<span class="pmed"><b>${m.horaPlan != null ? hm(m.horaPlan) : ''}</b> ${esc(m.nombre)}${
      m.ventanas && m.ventanas.length ? ` <span class="pvent">consulta ${txtVentanas(m.ventanas)}</span>` : ''}</span>`).join('');
  });
  const fuera = PLAN.fuera || [];
  if (fuera.length) {
    $('rplan').querySelector('.card .lista').insertAdjacentHTML('afterend', `<div class="planfuera">
      <h3>Se quedan fuera · ${fuera.length}</h3>
      <div class="lista">${fuera.slice(0, 30).map(f => `<div class="item" style="cursor:default">
        <span class="ic w">!</span><span class="tx"><b>${esc(f.m.nombre)}</b>
          <span class="sm">${esc(f.motivo)}${f.m.municipio ? ' · ' + esc(f.m.municipio) : ''}</span></span></div>`).join('')}
        ${fuera.length > 30 ? `<div class="sm" style="padding:6px 12px">y ${fuera.length - 30} más</div>` : ''}</div></div>`);
  }
})(pintarPlan);

/* ---------------- Tu día: horas estimadas respetando las consultas ---------------- */

let TD_INFO = {};

function estimarDia(citas, fecha) {
  const cfg = PLANCFG(), sal = salidaUsuario(), dura = cfg.visita;
  const ahora = new Date(), minAhora = ahora.getHours() * 60 + ahora.getMinutes();
  let t = minHora(cfg.salida);
  if (fecha === hoyISO()) t = Math.max(t, Math.ceil(minAhora / 5) * 5);
  let pos = [sal.lat, sal.lon], primera = true;
  const est = {};
  TD_INFO = {};
  citas.forEach(c => {
    const xy = xyCita(c);
    if (!CITA_ABIERTA.includes(c.estado)) { if (xy) pos = xy; return; }
    const it = { xy, ventanas: ventanasDe(c.dias, fecha), fija: minHora(c.hora) };
    let lleg = t;
    if (xy) { const mismo = !primera && pos[0] === xy[0] && pos[1] === xy[1]; lleg = t + (mismo ? 0 : minutosEntre(pos, xy) + cfg.parada); pos = xy; }
    primera = false;
    let ini = inicioPosible(it, lleg, dura);
    const info = { ventanas: it.ventanas };
    if (ini == null) {
      ini = it.fija != null ? Math.max(lleg, it.fija) : lleg;
      info.aviso = it.fija != null ? 'llegarías tarde a la hora fijada'
        : it.ventanas && !it.ventanas.length ? 'ese día no pasa consulta'
        : `fuera de su horario de consulta (${txtVentanas(it.ventanas)})`;
    } else if (ini > lleg + 5 && it.ventanas) info.espera = ini - lleg;
    est[c.id] = ini;
    TD_INFO[c.id] = info;
    t = ini + dura;
  });
  return { est, fin: t + minutosEntre(pos, [sal.lat, sal.lon]), tope: minHora(cfg.tope) };
}

function ordenarPorCercania(citas) {
  const fecha = (citas[0] && citas[0].fecha) || AG_FECHA;
  const cfg = PLANCFG(), ahora = new Date(), minAhora = ahora.getHours() * 60 + ahora.getMinutes();
  let t0 = minHora(cfg.salida);
  if (fecha === hoyISO()) t0 = Math.max(t0, Math.ceil(minAhora / 5) * 5);
  const cerradas = citas.filter(c => !CITA_ABIERTA.includes(c.estado));
  const abiertas = citas.filter(c => CITA_ABIERTA.includes(c.estado));
  const items = abiertas.map(c => ({ id: c.id, ref: c, xy: xyCita(c), ventanas: ventanasDe(c.dias, fecha), fija: minHora(c.hora) }));
  // Para ordenar no se descarta a nadie por la hora tope: se ordena todo lo posible
  const { seq, fuera } = programarVisitas(items, t0);
  ordenarPorCercania.fuera = fuera.length;
  return cerradas.concat(seq.map(s => s.it.ref), fuera.map(f => f.it.ref));
}

/* ---------------- reprogramar lo no visitado ---------------- */

async function reprogramarCitas(citas, titulo, texto) {
  if (!citas.length) return false;
  const conH = await conHorarios(citas.map(c => Object.assign({ id: c.medico_id }, 'dias' in c ? { dias: c.dias } : {})));
  const dias = {}; conH.forEach(h => dias[h.id] = h.dias || {});
  const base = hoyISO();
  const filas = citas.map(c => ({ c, fecha: proximoDiaConsulta(dias[c.medico_id], c.fecha > base ? c.fecha : base),
    horario: Object.keys(dias[c.medico_id] || {}).filter(k => (dias[c.medico_id] || {})[k]).join(' ') }));
  return new Promise(res => {
    $('dbody').innerHTML = `
      <div class="fh"><div><h2>${esc(titulo)}</h2><div class="sm">${esc(texto)}</div></div>
        <button class="x" data-cerrar aria-label="Cerrar">✕</button></div>
      <p class="sm">Te propongo el próximo día que cada médico pasa consulta. Cambia la fecha si quieres o desmarca los que no quieras mover.</p>
      <div class="lista reprog" data-nosucio>${filas.map((f, i) => `<div class="item" style="cursor:default">
        <input type="checkbox" data-rpi="${i}" checked aria-label="Mover">
        <span class="tx"><b>${esc(f.c.nombre)}</b>
          <span class="sm">${esc([f.c.centro_nombre, f.c.municipio].filter(Boolean).join(' · '))}${f.c.fecha < base ? ' · era el ' + fechaCorta(f.c.fecha) : ''}</span>
          <span class="sm">${f.horario ? 'Pasa consulta: ' + esc(f.horario) : 'Sin días de consulta conocidos'}</span></span>
        <input type="date" data-rpf="${i}" value="${f.fecha}" min="${base}"></div>`).join('')}</div>
      <div class="acts" style="justify-content:flex-end">
        <button class="btn sec" id="rpno">Dejarlas como están</button>
        <button class="btn" id="rpok">Mover las marcadas</button></div>`;
    const cerrar = v => { $('dlg').close(); res(v); };
    $('rpno').onclick = () => cerrar(false);
    $('rpok').onclick = async ev => {
      ev.target.disabled = true; ev.target.textContent = 'Moviendo…';
      let n = 0;
      for (let i = 0; i < filas.length; i++) {
        if (!$('dbody').querySelector(`[data-rpi="${i}"]`).checked) continue;
        const f = $('dbody').querySelector(`[data-rpf="${i}"]`).value; if (!f) continue;
        const { data: r } = await db.rpc('aplazar_cita', { p_id: filas[i].c.id, p_fecha: f, p_hora: null, p_origen: 'Reprogramada' });
        if (r && r.ok) n++;
      }
      toast(n ? `${n} ${n === 1 ? 'cita movida' : 'citas movidas'}` : 'No se ha movido ninguna');
      cerrar(n > 0);
      cargarAgenda(); cargarInicio(); pintarRutaBarra();
    };
    $('dlg').showModal();
  });
}

async function terminarJornada() {
  const j = jornadaActiva(); if (!j) return;
  invalidarCache();
  const citas = await citasDelDia(hoyISO());
  const hechas = citas.filter(c => c.estado === 'Visitada').length;
  const abiertas = citas.filter(c => CITA_ABIERTA.includes(c.estado));
  const ok = await preguntar(`Tiempo: ${durTxt(Date.now() - j.inicio)} · Visitadas: ${hechas} de ${citas.filter(c => !['Descartada', 'Aplazada'].includes(c.estado)).length}` +
    (abiertas.length ? `\n\nTe quedan ${abiertas.length} ${abiertas.length === 1 ? 'cita abierta' : 'citas abiertas'}. Al terminar te propongo a qué día moverlas.` : ''),
    { titulo: '¿Terminar la jornada?', ok: 'Terminar jornada' });
  if (!ok) return;
  localStorage.removeItem(JKEY());
  pintarRutaBarra();
  toast(`Jornada terminada · ${hechas} visitadas`);
  if (abiertas.length) await reprogramarCitas(abiertas, 'Lo que ha quedado pendiente hoy', `${abiertas.length} sin visitar`);
  if (TAB === 'agenda') cargarAgenda();
  if (TAB === 'rutas') cargarRutas();
}

/* ---------------- semana en cuadrícula ---------------- */

async function pintarSemanaAgenda() {
  const desde = lunesDe(AG_FECHA), hasta = isoMas(desde, 6);
  const todos = PERFIL.rol === 'Administrador';
  const r = await rpcCache('agenda_rango', { p_desde: desde, p_hasta: hasta, p_usuario: todos ? null : PERFIL.id }, 'agenda-' + desde);
  if (AG_MODO !== 'semana') return;
  const porDia = {};
  (r.data || []).forEach(c => (porDia[c.fecha] = porDia[c.fecha] || []).push(c));
  const dias = Array.from({ length: 7 }, (_, i) => isoMas(desde, i));
  $('agcuerpo').innerHTML = `<h2 style="padding:14px 16px 0">Semana del ${fechaCorta(desde)} al ${fechaCorta(hasta)}</h2>
    <div class="semwrap"><div class="mes sem">
      ${['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => `<span class="mesdow">${d}</span>`).join('')}
      ${dias.map(f => {
        const l = (porDia[f] || []).filter(c => !['Descartada', 'Aplazada'].includes(c.estado));
        const hechas = l.filter(c => c.estado === 'Visitada').length;
        const d = new Date(f + 'T12:00:00');
        return `<div class="mesdia semdia ${f === hoyISO() ? 'hoy' : ''} ${d.getDay() === 0 || d.getDay() === 6 ? 'finde' : ''}" data-semdia="${f}" role="button" tabindex="0">
          <div class="semcab"><b>${d.getDate()}</b>${l.length ? `<span class="mespunto">${hechas}/${l.length}</span>` : ''}
            ${f >= hoyISO() ? `<button class="semmas" data-semnueva="${f}" aria-label="Nueva cita el ${fechaCorta(f)}" title="Nueva cita">+</button>` : ''}</div>
          <div class="semcitas">${l.slice(0, 8).map(c => `<span class="semcita" data-semficha="${c.medico_id}" title="${esc(c.nombre)} · ${esc(c.estado)}"
              style="border-left-color:${EST_COL[c.estado] || 'var(--muted)'}">
              ${c.hora ? `<i>${esc(String(c.hora).slice(0, 5))}</i>` : ''}${esc(String(c.nombre).split(',')[0])}${todos && c.usuario_id !== PERFIL.id && c.usuario ? ` <em>${esc(iniciales(c.usuario))}</em>` : ''}</span>`).join('')}
            ${l.length > 8 ? `<span class="sm">y ${l.length - 8} más</span>` : ''}</div>
        </div>`;
      }).join('')}
    </div></div>`;
  $('agcuerpo').querySelectorAll('[data-semdia]').forEach(el => {
    const abrir = e => {
      if (e.target.closest('[data-semnueva]')) { nuevaCita(null, e.target.closest('[data-semnueva]').dataset.semnueva); return; }
      if (e.target.closest('[data-semficha]')) { abrirFicha(e.target.closest('[data-semficha]').dataset.semficha); return; }
      AG_FECHA = el.dataset.semdia; AG_MODO = 'dia'; cargarAgenda();
    };
    el.onclick = abrir; el.onkeydown = e => { if (e.key === 'Enter') abrir(e); };
  });
}

/* ---------------- enganches en la agenda ---------------- */

cargarAgenda = (orig => async function () {
  await orig();
  if (TAB !== 'agenda') return;
  if (AG_MODO === 'semana') await pintarSemanaAgenda();
  // Pendientes de días anteriores: reprogramar todas de una vez
  const pend = $('agpend');
  if (pend && pend.querySelector('h2') && !$('agrepro')) {
    pend.querySelector('p.sm').insertAdjacentHTML('afterend', '<div class="acts" style="padding:0 16px 8px"><button class="btn" id="agrepro">Reprogramar todas</button></div>');
    $('agrepro').onclick = async () => {
      const { data } = await RPC_ORIG('pendientes_ruta', {});
      reprogramarCitas(data || [], 'Pendientes de días anteriores', `${(data || []).length} sin visitar`);
    };
  }
})(cargarAgenda);

/* ---------------- ayudas ---------------- */

AYUDA.agenda[2].splice(1, 1,
  'La hora con «~» es una estimación según el orden, tu horario, los desplazamientos y el <b>horario de consulta</b> de cada médico: si llegas antes de que abra, cuenta la espera. Una hora sin «~» es una hora fijada.',
  'Si una cita queda fuera del horario de consulta del médico, se marca en naranja. <b>Ordenar por cercanía</b> tiene en cuenta esos horarios.');
AYUDA.agenda[2].push('Al <b>terminar la jornada</b>, lo no visitado se puede mover de golpe al próximo día que cada médico pasa consulta. Lo mismo con los pendientes de días anteriores.',
  'La vista de <b>semana</b> muestra los siete días en cuadrícula: pulsa un día para verlo, un médico para abrir su ficha o «+» para añadir una cita.');
AYUDA.rutas[2].splice(1, 1,
  'El plan respeta los <b>días y horas de consulta</b> de cada médico (los de su ficha): no te lo propone un día que no pasa consulta ni fuera de su horario. Los que no caben aparecen en «Se quedan fuera» con el motivo.');


/* ============================================================
   DLC OS 2.0 · v2.26.0 · Rutas y Agenda, bloques 3 y 4:
   planificador semanal, días bloqueados, frecuencia objetivo,
   supervisión del equipo y aviso de horario de consulta
   ============================================================ */

/* ---------------- qué agenda se está viendo ---------------- */

let AG_VISTA = null;   // { id, nombre, rol, preferencias } cuando administración mira la agenda de otra persona
function prefsActivas() { return (TAB === 'agenda' && AG_VISTA && AG_VISTA.preferencias) || PERFIL.preferencias || {}; }
function agUid() { return AG_VISTA ? AG_VISTA.id : PERFIL.id; }
function agUsuarioFiltro() {
  if (TAB === 'agenda' && AG_VISTA) return AG_VISTA.id;
  return PERFIL.rol === 'Administrador' ? null : PERFIL.id;
}

async function verAgendaDe(id) {
  if (!id || id === PERFIL.id) { AG_VISTA = null; cargarAgenda(); return; }
  const { data } = await RPC_ORIG('preferencias_de', { p_usuario: id });
  if (!data) { toast('No se ha podido abrir su agenda', true); return; }
  AG_VISTA = { id: data.id, nombre: data.nombre, rol: data.rol, preferencias: data.preferencias || {} };
  cargarAgenda();
}

/* ---------------- días bloqueados ---------------- */

async function bloqueadosSemana(desde, hasta) {
  const { data } = await RPC_ORIG('dias_bloqueados_rango', { p_desde: desde, p_hasta: hasta, p_usuario: agUid() });
  const b = {}; (data || []).forEach(x => b[x.fecha] = x.motivo || 'Día bloqueado');
  return b;
}

async function menuDiaSemana(boton, fecha, bloqueado) {
  document.querySelectorAll('.tdmenu').forEach(m => m.remove());
  const m = document.createElement('div');
  m.className = 'tdmenu'; m.__t = Date.now();
  m.innerHTML = [
    fecha >= hoyISO() ? ['nueva', 'Nueva cita', 'Añadir un médico a este día'] : null,
    ['ver', 'Ver el día', 'Abrirlo en «Tu día»'],
    fecha >= hoyISO() ? (bloqueado ? ['desbloquear', 'Desbloquear el día', 'Vuelve a estar disponible para planificar']
      : ['bloquear', 'Bloquear el día', 'Vacaciones, formación, congreso… El planificador no lo usará']) : null
  ].filter(Boolean).map(([k, t, s]) => `<button data-dmo="${k}"><b>${esc(t)}</b><span>${esc(s)}</span></button>`).join('');
  document.body.appendChild(m);
  const r = boton.getBoundingClientRect();
  m.style.top = Math.min(window.innerHeight - m.offsetHeight - 10, r.bottom + 6) + 'px';
  m.style.left = Math.max(10, Math.min(window.innerWidth - m.offsetWidth - 10, r.right - m.offsetWidth)) + 'px';
  m.querySelectorAll('[data-dmo]').forEach(b => b.onclick = async () => {
    m.remove();
    const k = b.dataset.dmo;
    if (k === 'nueva') return nuevaCita(null, fecha);
    if (k === 'ver') { AG_FECHA = fecha; AG_MODO = 'dia'; return cargarAgenda(); }
    let motivo = null;
    if (k === 'bloquear') {
      motivo = await pedirTexto('Motivo (opcional)', '', { titulo: 'Bloquear el ' + fechaCorta(fecha), ok: 'Bloquear' });
      if (motivo === null) return;
    }
    const { data: r2, error } = await RPC_ORIG('bloquear_dia', { p_fecha: fecha, p_motivo: motivo, p_usuario: agUid(), p_bloquear: k === 'bloquear' });
    if (error || (r2 && r2.ok === false)) { toast('No se ha podido cambiar', true); return; }
    toast(k === 'bloquear' ? 'Día bloqueado' : 'Día desbloqueado'); cargarAgenda();
  });
}

/* ---------------- semana: carga, bloqueos, arrastrar y planificador ---------------- */

let SEM_BORRADOR = null;   // propuesta del planificador aún sin guardar

async function pintarSemanaAgenda() {
  const desde = lunesDe(AG_FECHA), hasta = isoMas(desde, 6);
  const filtro = agUsuarioFiltro(), uid = agUid();
  const [r, bloq] = await Promise.all([
    rpcCache('agenda_rango', { p_desde: desde, p_hasta: hasta, p_usuario: filtro }, 'agenda-' + desde),
    bloqueadosSemana(desde, hasta)
  ]);
  if (AG_MODO !== 'semana') return;
  const porDia = {};
  (r.data || []).forEach(c => (porDia[c.fecha] = porDia[c.fecha] || []).push(c));
  const dias = Array.from({ length: 7 }, (_, i) => isoMas(desde, i));
  const borr = SEM_BORRADOR && SEM_BORRADOR.semana === desde && SEM_BORRADOR.uid === uid ? SEM_BORRADOR : null;
  const hayFuturo = dias.some(f => f >= hoyISO());
  const cfg = PLANCFG();

  $('agcuerpo').innerHTML = `
    <div class="semhead"><h2 style="padding:0">Semana del ${fechaCorta(desde)} al ${fechaCorta(hasta)}${AG_VISTA ? ` · ${esc(AG_VISTA.nombre)}` : ''}</h2>
      ${hayFuturo && !borr ? '<button class="btn" id="semplan">Planificar la semana</button>' : ''}</div>
    ${borr ? `<div class="semborr">
      <span><b>Propuesta sin guardar</b> · ${num(borr.total)} visitas nuevas en ${Object.keys(borr.dias).filter(f => borr.dias[f].length).length} días${borr.sinDia.length ? ` · ${borr.sinDia.length} sin día` : ''}</span>
      <span class="acts" style="margin:0"><button class="btn sec" id="semdescartar">Descartar</button><button class="btn" id="semguardar">Guardar en la agenda</button></span></div>` : ''}
    <div class="semwrap"><div class="mes sem">
      ${['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => `<span class="mesdow">${d}</span>`).join('')}
      ${dias.map(f => {
        const todas = (porDia[f] || []).filter(c => !['Descartada', 'Aplazada'].includes(c.estado));
        const mias = todas.filter(c => c.usuario_id === uid);
        const nuevas = borr ? (borr.dias[f] || []) : [];
        const hechas = todas.filter(c => c.estado === 'Visitada').length;
        const d = new Date(f + 'T12:00:00');
        const abiertas = mias.filter(c => CITA_ABIERTA.includes(c.estado));
        let carga = '';
        if ((abiertas.length || nuevas.length) && f >= hoyISO()) {
          const { fin, tope } = estimarDia(mias.concat(nuevas.map(n => Object.assign({ estado: 'Planificada' }, n.cita))), f);
          carga = `<span class="semcarga ${fin > tope ? 'pasa' : ''}" title="Hora de fin estimada${fin > tope ? ': pasa de la hora tope ' + cfg.tope : ''}">~${hm(fin)}</span>`;
        }
        return `<div class="mesdia semdia ${f === hoyISO() ? 'hoy' : ''} ${d.getDay() === 0 || d.getDay() === 6 ? 'finde' : ''} ${bloq[f] ? 'bloq' : ''}" data-semdia="${f}" role="button" tabindex="0">
          <div class="semcab"><b>${d.getDate()}</b>${todas.length ? `<span class="mespunto">${hechas}/${todas.length}</span>` : ''}${carga}
            <button class="semmas" data-semmenu="${f}" aria-label="Opciones del ${fechaCorta(f)}" title="Opciones del día">⋯</button></div>
          ${bloq[f] ? `<span class="sembloq">🚫 ${esc(bloq[f])}</span>` : ''}
          <div class="semcitas">${todas.slice(0, 9).map(c => {
            const mover = c.usuario_id === uid && CITA_ABIERTA.includes(c.estado) && c.fecha >= hoyISO();
            return `<span class="semcita" data-semficha="${c.medico_id}" ${mover ? `draggable="true" data-semcid="${c.id}"` : ''}
              title="${esc(c.nombre)} · ${esc(c.estado)}${mover ? ' · arrástrala a otro día para moverla' : ''}" style="border-left-color:${EST_COL[c.estado] || 'var(--muted)'}">
              ${c.hora ? `<i>${esc(String(c.hora).slice(0, 5))}</i>` : ''}${esc(String(c.nombre).split(',')[0])}${c.usuario_id !== uid && c.usuario ? ` <em>${esc(iniciales(c.usuario))}</em>` : ''}</span>`;
          }).join('')}
            ${nuevas.map(n => `<span class="semcita nueva" title="Propuesta: ${esc(n.m.nombre)}${n.ini != null ? ' · ~' + hm(n.ini) : ''}"><i>~${n.ini != null ? hm(n.ini) : ''}</i>${esc(String(n.m.nombre).split(',')[0])}</span>`).join('')}
            ${todas.length > 9 ? `<span class="sm">y ${todas.length - 9} más</span>` : ''}</div>
        </div>`;
      }).join('')}
    </div></div>
    ${borr && borr.sinDia.length ? `<div class="planfuera" style="margin:0 16px 16px"><h3>Se quedan sin día · ${borr.sinDia.length}</h3>
      <div class="lista">${borr.sinDia.slice(0, 25).map(x => `<div class="item" style="cursor:default"><span class="ic w">!</span>
        <span class="tx"><b>${esc(x.m.nombre)}</b><span class="sm">${esc(x.motivo)}${x.m.municipio ? ' · ' + esc(x.m.municipio) : ''}</span></span></div>`).join('')}
        ${borr.sinDia.length > 25 ? `<div class="sm" style="padding:6px 12px">y ${borr.sinDia.length - 25} más</div>` : ''}</div></div>` : ''}`;

  if ($('semplan')) $('semplan').onclick = () => planificarSemana(desde, dias, bloq, porDia);
  if ($('semdescartar')) $('semdescartar').onclick = () => { SEM_BORRADOR = null; cargarAgenda(); };
  if ($('semguardar')) $('semguardar').onclick = e => guardarBorradorSemana(e.target);

  $('agcuerpo').querySelectorAll('[data-semdia]').forEach(el => {
    const abrir = e => {
      const mm = e.target.closest('[data-semmenu]');
      if (mm) { menuDiaSemana(mm, mm.dataset.semmenu, !!bloq[mm.dataset.semmenu]); return; }
      if (e.target.closest('.semcita.nueva')) return;
      if (e.target.closest('[data-semficha]')) { abrirFicha(e.target.closest('[data-semficha]').dataset.semficha); return; }
      AG_FECHA = el.dataset.semdia; AG_MODO = 'dia'; cargarAgenda();
    };
    el.onclick = abrir; el.onkeydown = e => { if (e.key === 'Enter') abrir(e); };
    // Soltar una cita arrastrada
    el.ondragover = e => { if (e.dataTransfer.types.includes('text/cita')) { e.preventDefault(); el.classList.add('sobre'); } };
    el.ondragleave = () => el.classList.remove('sobre');
    el.ondrop = async e => {
      e.preventDefault(); el.classList.remove('sobre');
      const id = e.dataTransfer.getData('text/cita'), destino = el.dataset.semdia;
      const c = (r.data || []).find(x => x.id === id);
      if (!c || c.fecha === destino) return;
      if (destino < hoyISO()) { toast('No se puede mover a un día pasado', true); return; }
      const avisos = [];
      if (bloq[destino]) avisos.push(`ese día está bloqueado (${bloq[destino]})`);
      const v = ventanasDe(c.dias, destino);
      if (v && !v.length) avisos.push('ese día no pasa consulta');
      if (avisos.length && !await preguntar(`${c.nombre}: ${avisos.join(' y ')}.`, { titulo: '¿Moverla igualmente?', ok: 'Mover' })) return;
      const { data: rr, error } = await db.rpc('estado_cita', { p_id: id, p_estado: c.estado, p_fecha: destino });
      if (error || (rr && rr.ok === false)) { toast('No se ha podido mover', true); return; }
      toast('Movida al ' + fechaCorta(destino)); cargarAgenda();
    };
  });
  $('agcuerpo').querySelectorAll('[data-semcid]').forEach(ch => {
    ch.ondragstart = e => { e.dataTransfer.setData('text/cita', ch.dataset.semcid); e.dataTransfer.effectAllowed = 'move'; ch.classList.add('arrastrando'); };
    ch.ondragend = () => ch.classList.remove('arrastrando');
  });
}

/* Planificador: reparte médicos entre los días de la semana */
async function planificarSemana(desde, dias, bloq, porDia) {
  const libres = dias.filter(f => f >= hoyISO() && !bloq[f] && new Date(f + 'T12:00:00').getDay() % 6 !== 0);
  if (!libres.length) { toast('No quedan días laborables libres esta semana', true); return; }
  const { data: rutas } = await RPC_ORIG('rutas_visibles', {});
  const misRutas = (rutas || []).filter(x => !AG_VISTA || x.usuario_id === agUid() || x.visible_para === '*');
  $('dbody').innerHTML = `
    <div class="fh"><div><h2>Planificar la semana${AG_VISTA ? ' de ' + esc(AG_VISTA.nombre) : ''}</h2>
      <div class="sm">Reparte los médicos entre los días, cada uno un día que pase consulta y agrupados por zona</div></div>
      <button class="x" data-cerrar aria-label="Cerrar">✕</button></div>
    <label for="spfuente">¿A quién?</label>
    <select id="spfuente">
      <option value="toca">A quien le toca visita (según su frecuencia objetivo)</option>
      <option value="urgentes">Urgentes sin visitar</option>
      <option value="interesados">Interesados sin visita en 20 días</option>
      <option value="sin_visitar">Nunca visitados</option>
      ${misRutas.map(x => `<option value="ruta:${x.id}">Ruta: ${esc(x.nombre)}</option>`).join('')}
    </select>
    <label>Días</label>
    <div class="spdias">${dias.slice(0, 5).map(f => {
      const ok = libres.includes(f);
      return `<label class="opt ${ok ? '' : 'off'}" style="margin:0"><input type="checkbox" data-spd="${f}" ${ok ? 'checked' : 'disabled'}>
        ${DIAN[LETRA_DIA(f)].slice(0, 3)} ${new Date(f + 'T12:00:00').getDate()}${bloq[f] ? ' · bloqueado' : f < hoyISO() ? ' · pasado' : ''}</label>`;
    }).join('')}</div>
    <div class="g2">
      <div><label for="spmax">Máximo de visitas nuevas por día</label><input id="spmax" type="number" min="1" max="30" placeholder="Hasta la hora tope"></div>
      <div><label>Horario</label><div class="sm" style="padding-top:12px">${esc(PLANCFG().salida)}–${esc(PLANCFG().tope)} · ${PLANCFG().visita} min por médico</div></div>
    </div>
    <p class="sm">Las citas que ya hay en la agenda se respetan y cuentan para el tiempo de cada día. No se proponen médicos que ya tienen una cita abierta.</p>
    <div class="acts" style="justify-content:flex-end"><button class="btn sec" data-cerrar>Cancelar</button>
      <button class="btn" id="spok">Proponer reparto</button></div>`;
  $('dlg').showModal();
  $('spok').onclick = async ev => {
    const fuente = $('spfuente').value;
    const usar = [...$('dbody').querySelectorAll('[data-spd]:checked')].map(x => x.dataset.spd);
    if (!usar.length) { toast('Elige al menos un día', true); return; }
    const max = +$('spmax').value || null;
    ev.target.disabled = true; ev.target.textContent = 'Calculando…';
    let lista = [];
    if (fuente === 'toca') lista = (await db.rpc('toca_visitar', { p_usuario: agUid() === PERFIL.id && VE_TODO() ? null : agUid(), lim: 300 })).data || [];
    else if (fuente.startsWith('ruta:')) lista = (await db.rpc('medicos_de_ruta', { p_id: fuente.slice(5) })).data || [];
    else lista = ((await db.rpc('propuestas_rutas', { lim: 200 })).data || {})[fuente] || [];
    // Fuera los que ya tienen cita abierta
    const { data: futuras } = await RPC_ORIG('agenda_rango', { p_desde: hoyISO(), p_hasta: isoMas(hoyISO(), 60), p_usuario: agUid() });
    const conCita = new Set((futuras || []).filter(c => CITA_ABIERTA.includes(c.estado)).map(c => c.medico_id));
    lista = await conHorarios(lista.filter(m => !conCita.has(m.id)));
    // Aviso de visita reciente: fuera los que se han visto hace poco
    const av = avisoRevisita(); let recientes = [];
    if (av.on && lista.length) {
      const { data: rv } = await db.rpc('visitas_recientes', { p_ids: lista.map(m => m.id), p_desde: isoMas(hoyISO(), -av.dias), p_hasta: hoyISO() });
      const vistos = {}; (rv || []).filter(x => x.tipo === 'visita').forEach(x => { if (!vistos[x.medico_id] || x.fecha > vistos[x.medico_id].fecha) vistos[x.medico_id] = x; });
      recientes = lista.filter(m => vistos[m.id]).map(m => ({ m, motivo: `visitado el ${fechaCorta(vistos[m.id].fecha)}${vistos[m.id].usuario ? ' (' + vistos[m.id].usuario + ')' : ''}` }));
      lista = lista.filter(m => !vistos[m.id]);
    }
    SEM_BORRADOR = repartirSemana(lista, usar, porDia, max, desde);
    SEM_BORRADOR.sinDia = SEM_BORRADOR.sinDia.concat(recientes);
    ev.target.disabled = false; ev.target.textContent = 'Proponer reparto';
    $('dlg').close();
    if (!SEM_BORRADOR.total) toast('No cabe ninguna visita nueva con estos datos', true);
    pintarSemanaAgenda();
  };
}

function repartirSemana(lista, usar, porDia, max, desde) {
  const cfg = PLANCFG(), sal = salidaUsuario(), uid = agUid();
  let pend = lista.filter(m => m.lat != null && m.lon != null).map(m => ({ m, xy: [+m.lat, +m.lon] }));
  const sinDia = lista.filter(m => m.lat == null || m.lon == null).map(m => ({ m, motivo: 'sin ubicación' }));
  const out = { semana: desde, uid, dias: {}, sinDia, total: 0 };
  usar.forEach(f => {
    const ahora = new Date(), minAhora = ahora.getHours() * 60 + ahora.getMinutes();
    const t0 = f === hoyISO() ? Math.max(minHora(cfg.salida), Math.ceil(minAhora / 5) * 5) : minHora(cfg.salida);
    const disponibles = pend.filter(p => { const v = ventanasDe(p.m.dias, f); return !(v && !v.length); });
    if (!disponibles.length) { out.dias[f] = []; return; }
    // Semilla: el que menos días puede ir (y urgente antes), para no dejarlo sin hueco
    const nDias = p => usar.filter(g => { const v = ventanasDe(p.m.dias, g); return !(v && !v.length); }).length;
    disponibles.sort((a, b) => nDias(a) - nDias(b) || (b.m.urgente ? 1 : 0) - (a.m.urgente ? 1 : 0) || km([sal.lat, sal.lon], a.xy) - km([sal.lat, sal.lon], b.xy));
    const semilla = disponibles[0].xy;
    const cerca = disponibles.slice().sort((a, b) => km(semilla, a.xy) - km(semilla, b.xy)).slice(0, 40);
    const existentes = (porDia[f] || []).filter(c => c.usuario_id === uid && CITA_ABIERTA.includes(c.estado));
    const items = existentes.map(c => ({ id: c.id, ref: { existente: c }, xy: xyCita(c), ventanas: ventanasDe(c.dias, f), fija: minHora(c.hora) }))
      .concat(cerca.map(p => ({ id: p.m.id, ref: { p }, xy: p.xy, ventanas: ventanasDe(p.m.dias, f), fija: null })));
    const { seq } = programarVisitas(items, t0);
    let nuevas = seq.filter(s => s.it.ref.p);
    if (max) nuevas = nuevas.slice(0, max);
    const elegidos = new Set(nuevas.map(s => s.it.ref.p));
    out.dias[f] = seq.filter(s => s.it.ref.existente || elegidos.has(s.it.ref.p)).map(s => s.it.ref.existente
      ? { existente: s.it.ref.existente }
      : { m: s.it.ref.p.m, ini: s.ini, cita: { id: 'nueva-' + s.it.ref.p.m.id, fecha: f, dias: s.it.ref.p.m.dias, lat: s.it.ref.p.xy[0], lon: s.it.ref.p.xy[1] } });
    pend = pend.filter(p => !elegidos.has(p));
  });
  // Solo las nuevas cuentan en la vista; las existentes se guardan para respetar el orden al guardar
  out.orden = {};
  usar.forEach(f => { out.orden[f] = out.dias[f] || []; out.dias[f] = (out.dias[f] || []).filter(x => !x.existente); });
  out.total = usar.reduce((n, f) => n + out.dias[f].length, 0);
  pend.forEach(p => {
    const algun = usar.some(g => { const v = ventanasDe(p.m.dias, g); return !(v && !v.length); });
    sinDia.push({ m: p.m, motivo: algun ? 'no cabe en los días elegidos' : 'no pasa consulta ninguno de los días elegidos' });
  });
  return out;
}

async function guardarBorradorSemana(btn) {
  const b = SEM_BORRADOR; if (!b) return;
  btn.disabled = true; btn.textContent = 'Guardando…';
  let n = 0;
  for (const f of Object.keys(b.orden)) {
    const ids = [];
    for (const x of b.orden[f]) {
      if (x.existente) { ids.push(x.existente.id); continue; }
      const { data: r } = await db.rpc('guardar_cita', { p: { medico_id: x.m.id, fecha: f, hora: null,
        centro_nombre: x.m.centro_nombre || null, estado: 'Planificada', origen: 'Planificador semanal',
        usuario_id: b.uid !== PERFIL.id ? b.uid : null, op_id: 'ps-' + x.m.id + '-' + f } });
      if (r && r.ok) { ids.push(r.id); n++; }
    }
    if (ids.length) await db.rpc('ordenar_citas', { p_ids: ids });
  }
  SEM_BORRADOR = null;
  toast(`${n} citas guardadas en la agenda`);
  cargarAgenda(); cargarInicio();
}

/* ---------------- supervisión del equipo ---------------- */

async function pintarEquipo() {
  $('agcuerpo').innerHTML = `<div class="semhead"><h2 style="padding:0">Equipo y cumplimiento</h2>
      ${PERFIL.rol === 'Administrador' ? '<button class="btn sec" id="eqfrec">⚙ Frecuencia objetivo</button>' : ''}</div>
    <div class="filtros" style="border:0;padding:4px 16px 10px"><div id="eqper"></div></div>
    <div id="eqtabla"></div>`;
  if ($('agpend')) $('agpend').innerHTML = '';
  if ($('agsug')) $('agsug').remove();
  if ($('eqfrec')) $('eqfrec').onclick = editorFrecuencia;
  const pinta = async () => {
    cargando($('eqtabla'), 'Calculando…');
    const r = $('eqper').__rango();
    const { data, error } = await RPC_ORIG('supervision_equipo', { p_desde: r.desde || '2000-01-01', p_hasta: r.hasta || isoMas(hoyISO(), 365) });
    if (error) { $('eqtabla').innerHTML = `<div class="vacio">${esc(error.message)}</div>`; return; }
    const l = data || [];
    const pct = x => { const base = x.visitadas + x.no_estaba + x.aplazadas + x.sin_hacer; return base ? Math.round(x.visitadas / base * 100) : null; };
    $('eqtabla').innerHTML = l.length ? `<div class="dgrid-wrap"><div class="dgrid eq">
      <div class="dh"><span>Persona</span><span class="num">Cartera</span><span class="num">Citas</span><span class="num">Visitadas</span>
        <span class="num">No estaba</span><span class="num">Aplazadas</span><span class="num">Sin hacer</span><span>Cumplimiento</span>
        <span class="num">Visitas</span><span class="num">Les toca</span></div>
      ${l.map(x => { const p = pct(x); return `<button class="dr" data-eqver="${x.id}" title="Ver su agenda">
        <span><b>${esc(x.nombre)}</b><span class="sm">${esc(x.rol)}</span></span>
        <span class="num">${num(x.cartera)}</span><span class="num">${num(x.citas)}</span>
        <span class="num"><b style="color:var(--ok)">${num(x.visitadas)}</b></span><span class="num">${num(x.no_estaba)}</span>
        <span class="num">${num(x.aplazadas)}</span><span class="num" style="${x.sin_hacer ? 'color:var(--warn);font-weight:700' : ''}">${num(x.sin_hacer)}</span>
        <span>${p == null ? '<span class="vac">—</span>' : `<span class="barra"><i style="width:${p}%;${p < 60 ? 'background:var(--warn)' : ''}"></i><em>${p}%</em></span>`}</span>
        <span class="num">${num(x.visitas)}</span>
        <span class="num" style="${x.atrasados ? 'color:var(--warn);font-weight:700' : ''}">${num(x.atrasados)}</span></button>`; }).join('')}
    </div></div>
    <p class="sm" style="padding:10px 16px 14px"><b>Cumplimiento</b> = visitadas sobre las citas de días ya pasados (visitadas, no estaba, aplazadas y sin hacer).
      <b>Les toca</b> = médicos de su cartera que llevan más tiempo sin visita que su frecuencia objetivo. Pulsa una persona para ver su agenda.</p>`
      : '<div class="vacio">Sin actividad en este periodo.</div>';
    $('eqtabla').querySelectorAll('[data-eqver]').forEach(b => b.onclick = () => { AG_MODO = 'semana'; AG_FECHA = hoyISO(); verAgendaDe(b.dataset.eqver); });
  };
  montarPeriodo($('eqper'), { id: 'equipo', valor: 'semana', alCambiar: pinta });
  pinta();
}

async function editorFrecuencia() {
  await cargarAjustes();
  const f = Object.assign({ 'Sin contactar': 60, 'Presentado': 30, 'Interesado': 15, 'Prescribe': 30, 'No interesado': 0 }, AJUSTES.frecuencia || {});
  $('dbody').innerHTML = `
    <div class="fh"><div><h2>Frecuencia objetivo de visita</h2>
      <div class="sm">Cada cuántos días hay que visitar a un médico según su estado. 0 = no se exige.</div></div>
      <button class="x" data-cerrar aria-label="Cerrar">✕</button></div>
    ${Object.keys(f).map(k => `<div class="g2" style="align-items:center"><div><b>${esc(k)}</b></div>
      <div><input type="number" min="0" max="365" data-frec="${esc(k)}" value="${+f[k] || 0}" aria-label="Días para ${esc(k)}"></div></div>`).join('')}
    <p class="sm">Se usa en «A quien le toca visita» (planificador y sugerencias) y en la columna «Les toca» del equipo.</p>
    <div class="acts" style="justify-content:flex-end"><button class="btn sec" data-cerrar>Cancelar</button><button class="btn" id="frok">Guardar</button></div>`;
  $('dlg').showModal();
  $('frok').onclick = async () => {
    const v = {}; $('dbody').querySelectorAll('[data-frec]').forEach(i => v[i.dataset.frec] = Math.max(0, +i.value || 0));
    const { data: r, error } = await db.rpc('guardar_ajuste', { p_clave: 'frecuencia', p_valor: v });
    if (error || (r && r.ok === false)) { toast('No se ha podido guardar', true); return; }
    AJUSTES.frecuencia = v; $('dlg').close(); toast('Frecuencia guardada'); invalidarCache();
    if (AG_MODO === 'equipo') pintarEquipo();
  };
}

/* ---------------- cabecera de la agenda: de quién es y equipo ---------------- */

cargarAgenda = (orig => async function () {
  const modo = AG_MODO;
  if (modo === 'equipo') AG_MODO = 'semana';           // la base se pinta como semana y luego se sustituye
  await orig();
  AG_MODO = modo;
  if (TAB !== 'agenda') return;
  const acts = $('v-agenda').querySelector('.saludo .acts');
  if (acts && VE_TODO() && !$('agvista')) {
    if (!COMS.length) await cargarComerciales();
    acts.insertAdjacentHTML('afterbegin', `<select id="agvista" aria-label="Agenda de" title="Ver la agenda de otra persona">
        <option value="">Mi agenda</option>${COMS.filter(u => u.id !== PERFIL.id).map(u => `<option value="${u.id}" ${AG_VISTA && AG_VISTA.id === u.id ? 'selected' : ''}>${esc(u.nombre)}</option>`).join('')}</select>
      <button class="btn ${modo === 'equipo' ? '' : 'sec'}" data-ag="equipo">Equipo</button>`);
    $('agvista').onchange = e => verAgendaDe(e.target.value);
    if (modo === 'equipo') acts.querySelectorAll('[data-ag="semana"]').forEach(b => b.classList.add('sec'));
  }
  if (AG_VISTA && $('agtit')) $('agtit').textContent += ' · agenda de ' + AG_VISTA.nombre;
  if (modo === 'equipo') { $('agtit').textContent = 'Cumplimiento del equipo'; await pintarEquipo(); }
})(cargarAgenda);

document.addEventListener('click', e => {
  const b = e.target.closest('[data-ag="equipo"]');
  if (!b) return;
  e.stopImmediatePropagation();
  AG_MODO = 'equipo'; cargarAgenda();
}, true);

// Al salir de la agenda se vuelve a la propia
const irV2250 = ir;
ir = function (t) { if (t !== 'agenda') AG_VISTA = null; irV2250(t); };

/* ---------------- aviso: falta el horario de consulta ---------------- */

async function faltaHorario(id) {
  const { data } = await db.rpc('ficha_medico', { p_id: id });
  const cons = (data && data.consultas) || [];
  return data && data.medico && data.medico.tipo !== 'Centro' && !cons.some(c => c.dias && Object.keys(c.dias).some(k => c.dias[k]));
}

abrirFicha = (orig => async function (id) {
  await orig(id);
  if (FICHA_ID !== id || !$('fbody').querySelector('.fh')) return;
  if (!await faltaHorario(id) || FICHA_ID !== id || $('fhorario')) return;
  $('fbody').querySelector('.fh').insertAdjacentHTML('afterend', `<div class="avisoh" id="fhorario">
    <span>⚠ <b>Falta su horario de consulta.</b> Sin él, las rutas y el planificador no saben qué días y horas pasa consulta.</span>
    ${puedeEditar() ? '<button class="btn sec" id="fhcompletar">Completar horario</button>' : ''}</div>`);
  if ($('fhcompletar')) $('fhcompletar').onclick = () => abrirEditor(id);
})(abrirFicha);

abrirVisita = (orig => async function (id) {
  await orig(id);
  if (!$('vguardar') || !await faltaHorario(id) || $('vhorario')) return;
  const fh = $('dbody').querySelector('.fh');
  if (fh) fh.insertAdjacentHTML('afterend', `<div class="avisoh" id="vhorario"><span>⚠ Falta su horario de consulta. Aprovecha la visita para preguntarlo
    y complétalo después en <b>Editar ficha</b>.</span></div>`);
})(abrirVisita);

/* ---------------- ayudas ---------------- */

AYUDA.agenda[2].push(
  'En la <b>semana</b>: la hora con «~» junto al día es el fin estimado (en naranja si pasa de tu hora tope). Arrastra una cita a otro día para moverla. El menú «⋯» de cada día permite añadir una cita o <b>bloquear el día</b> (vacaciones, formación…).',
  '<b>Planificar la semana</b> reparte médicos entre los días libres: a quien le toca visita, urgentes, interesados, nunca visitados o una de tus rutas. Cada uno cae un día que pasa consulta y agrupado por zona. Revisa la propuesta y pulsa <b>Guardar en la agenda</b>.',
  'Administración y televenta pueden ver la agenda de otra persona con el selector de arriba, planificarle la semana y ver el <b>cumplimiento del equipo</b> con el botón «Equipo».');


/* ============================================================
   DLC OS 2.0 · v2.27.0 · Clasificadores con dato en las visitas,
   material comercial, Clientes con filtros, columnas en el panel
   lateral, mapa del plan y aviso de cita repetida
   ============================================================ */

Object.assign(RPC_TTL, { clasificadores_visita: 300, municipios_clientes: 300 });

/* ---------------- registrar visita con datos ---------------- */

const detTxt = v => (v.detalles || []).filter(d => !(d.clasificador === 'RESULTADO' && /muestra/i.test(d.valor)))
  .map(d => d.valor + (d.dato ? ' (' + d.dato + ')' : '')).join(', ');

function campoDato(v, k, valor) {
  const lab = esc(v.dato_etiqueta || (v.dato_tipo === 'numero' ? 'Cantidad' : 'Detalle'));
  if (v.dato_tipo === 'numero') return `<label class="datol">${lab}<input type="number" min="0" step="1" data-dato="${k}" value="${esc(valor || '')}" placeholder="0"></label>`;
  if (v.dato_tipo === 'lista') return `<label class="datol">${lab}<select data-dato="${k}"><option value=""></option>${(v.dato_opciones || [])
    .map(o => `<option ${o === valor ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`;
  return `<label class="datol">${lab}<input data-dato="${k}" value="${esc(valor || '')}" placeholder="Opcional"></label>`;
}

async function abrirVisita(id) {
  const [{ data, error }, { data: clas }] = await Promise.all([db.rpc('ficha_medico', { p_id: id }), db.rpc('clasificadores_visita')]);
  if (error) { toast('No se ha podido abrir: ' + error.message, true); return; }
  const m = data.medico, cons = data.consultas || [];
  const grupos = (clas || []).filter(c => (c.valores || []).length);
  const res = grupos.find(c => c.clave === 'RESULTADO') || { clave: 'RESULTADO', nombre: 'Resultado', valores: CAT.RESULTADO || [] };
  const otros = grupos.filter(c => c.clave !== 'RESULTADO');
  const idx = {};   // clave del botón → { clasificador, valor }
  const boton = (c, v, neg) => {
    const k = c.clave + '::' + v.valor; idx[k] = { c: c.clave, v };
    return `<span class="optw"><button type="button" class="opt ${neg ? 'neg' : ''}" data-vk="${esc(k)}" ${c.clave === 'RESULTADO' ? `data-res="${esc(v.valor)}"` : ''} ${neg ? 'data-neg="1"' : ''} aria-pressed="false">
      <span class="mk"></span>${esc(v.valor)}${v.dato_tipo ? ' <span class="datom">+ dato</span>' : ''}</button>
      ${v.dato_tipo ? `<span class="datobox hide" data-box="${esc(k)}">${campoDato(v, k)}</span>` : ''}</span>`;
  };

  $('dbody').innerHTML = `
    <div class="fh"><div><h2>Registrar visita</h2><div class="sm">${esc(m.nombre)}</div></div>
      <button class="x" data-cerrar aria-label="Cerrar">✕</button></div>
    <div class="g2">
      <div><label for="vf">Fecha</label><input id="vf" type="date" value="${hoyISO()}"></div>
      <div><label for="vc">Centro de la visita</label><select id="vc">
        ${cons.map(c => `<option value="${c.id}">${esc(c.centro_nombre || 'Consulta privada')}${c.municipio ? ' · ' + esc(c.municipio) : ''}</option>`).join('')}
      </select></div>
    </div>
    <label>Resultado <span class="sm">· puedes marcar varios de «visita realizada»</span></label>
    <div class="opciones">${res.valores.filter(v => v.extra !== 'neg').map(v => boton(res, v, false)).join('')}</div>
    <div class="opciones" style="margin-top:8px">${res.valores.filter(v => v.extra === 'neg').map(v => boton(res, v, true)).join('')}</div>
    ${otros.map(c => `<label>${esc(c.nombre)}${c.descripcion ? ` <span class="sm">· ${esc(c.descripcion)}</span>` : ''}</label>
      <div class="opciones">${c.valores.map(v => boton(c, v, false)).join('')}</div>`).join('')}
    <div class="g2" style="margin-top:6px">
      <div><label for="vpa">Próxima acción</label><input id="vpa" placeholder="p. ej. Llevar reporting"></div>
      <div><label for="vpf">Fecha de la próxima acción</label><input id="vpf" type="date"></div>
    </div>
    <label for="vn">Nota</label><textarea id="vn" rows="3"></textarea>
    <div class="acts" style="justify-content:flex-end">
      <button class="btn sec" data-cerrar>Cancelar</button>
      <button class="btn" id="vguardar">Guardar visita</button>
    </div>`;

  $('dbody').querySelectorAll('[data-vk]').forEach(b => b.onclick = () => {
    const k = b.dataset.vk, info = idx[k], on = b.getAttribute('aria-pressed') === 'true';
    if (info.c === 'RESULTADO') {
      const esNeg = b.dataset.neg === '1';
      $('dbody').querySelectorAll('[data-res]').forEach(x => {
        if ((esNeg || x.dataset.neg === '1') && x !== b) {
          x.setAttribute('aria-pressed', 'false');
          const bx = $('dbody').querySelector(`[data-box="${CSS.escape(x.dataset.vk)}"]`); if (bx) bx.classList.add('hide');
        }
      });
    }
    b.setAttribute('aria-pressed', String(!on));
    const box = $('dbody').querySelector(`[data-box="${CSS.escape(k)}"]`);
    if (box) { box.classList.toggle('hide', on); if (!on) { const i = box.querySelector('input, select'); if (i) setTimeout(() => i.focus(), 30); } }
  });

  $('vguardar').onclick = async ev => {
    const marcados = [...$('dbody').querySelectorAll('[data-vk][aria-pressed=true]')].map(b => b.dataset.vk);
    const resultados = marcados.filter(k => idx[k].c === 'RESULTADO').map(k => idx[k].v.valor);
    if (!resultados.length) { toast('Elige al menos un resultado', true); return; }
    const detalles = marcados.map(k => {
      const el = $('dbody').querySelector(`[data-dato="${CSS.escape(k)}"]`);
      const d = el ? el.value.trim() : '';
      return Object.assign({ clasificador: idx[k].c, valor: idx[k].v.valor }, d ? { dato: d } : {});
    });
    ev.target.disabled = true; ev.target.textContent = 'Guardando…';
    const { data: r, error: err } = await db.rpc('registrar_visita', { p: {
      medico_id: id, consulta_id: $('vc').value || null, fecha: $('vf').value,
      resultados, detalles, nota: $('vn').value.trim(),
      proxima_accion: $('vpa').value.trim(), proxima_fecha: $('vpf').value || null,
      op_id: 'v-' + id + '-' + Date.now()
    }});
    ev.target.disabled = false; ev.target.textContent = 'Guardar visita';
    if (err) { toast('No se ha podido guardar: ' + err.message, true); return; }
    $('dlg').close();
    toast('Visita registrada' + (r && r.estado ? ' · estado: ' + r.estado : ''));
    cargarInicio();
    if (FICHA_ID === id) abrirFicha(id);
  };
  $('dlg').showModal();
}

/* ---------------- clasificadores: configurar el dato de cada valor ---------------- */

function editorDato(v, alGuardar) {
  $('dlg2body').innerHTML = `
    <div class="fh"><div><h2>Dato de «${esc(v.valor)}»</h2>
      <div class="sm">Al marcar este valor en una visita, se pedirá además este dato</div></div>
      <button class="x" data-cerrar2 aria-label="Cerrar">✕</button></div>
    <label for="dtt">Qué dato pide</label>
    <select id="dtt"><option value="">Ninguno (solo se marca)</option>
      <option value="numero" ${v.dato_tipo === 'numero' ? 'selected' : ''}>Un número (p. ej. cantidad)</option>
      <option value="texto" ${v.dato_tipo === 'texto' ? 'selected' : ''}>Un texto libre</option>
      <option value="lista" ${v.dato_tipo === 'lista' ? 'selected' : ''}>Una opción de una lista</option></select>
    <div id="dtcfg">
      <label for="dte">Cómo se llama el dato</label><input id="dte" value="${esc(v.dato_etiqueta || '')}" placeholder="p. ej. Cantidad, A quién, Producto">
      <div id="dtlw"><label for="dtl">Opciones de la lista <span class="sm">· una por línea</span></label>
        <textarea id="dtl" rows="4">${esc((v.dato_opciones || []).join('\n'))}</textarea></div>
    </div>
    <div class="acts" style="justify-content:flex-end"><button class="btn sec" data-cerrar2>Cancelar</button><button class="btn" id="dtok">Guardar</button></div>`;
  const vis = () => { $('dtcfg').classList.toggle('hide', !$('dtt').value); $('dtlw').classList.toggle('hide', $('dtt').value !== 'lista'); };
  $('dtt').onchange = vis; vis();
  $('dtok').onclick = async () => {
    const tipo = $('dtt').value;
    const ops = $('dtl').value.split('\n').map(x => x.trim()).filter(Boolean);
    if (tipo === 'lista' && !ops.length) { toast('Escribe al menos una opción', true); return; }
    const { data: r, error } = await db.rpc('guardar_valor', { p: { id: v.id, dato_tipo: tipo, dato_etiqueta: tipo ? $('dte').value.trim() : '',
      dato_opciones: tipo === 'lista' ? ops : [] } });
    if (error || (r && r.ok === false)) { toast('No se ha podido guardar', true); return; }
    $('dlg2').close(); toast('Dato guardado'); alGuardar();
  };
  $('dlg2').showModal();
}

abrirClasificador = (orig => function (id) {
  orig(id);
  const c = CATS.find(x => x.id === id);
  const puede = PERFIL.rol === 'Administrador' || ((PERFIL.areas || {}).K || 0) >= 2;
  if (!c || !puede || !['visita'].includes(c.ambito) && c.clave !== 'RESULTADO') return;
  // Cada vez que se repinta la ventana, se añaden los botones de dato
  const decorar = () => {
    const items = $('dbody').querySelectorAll('.lista > .item');
    (c.valores || []).forEach((v, i) => {
      const it = items[i]; if (!it || it.querySelector('[data-vdato]')) return;
      const tx = it.querySelector('.tx');
      if (v.dato_tipo) tx.insertAdjacentHTML('beforeend', `<span class="sm">Pide: ${esc(v.dato_etiqueta || v.dato_tipo)}${v.dato_tipo === 'lista' ? ' (' + (v.dato_opciones || []).length + ' opciones)' : ''}</span>`);
      const acts = it.querySelector('.acts');
      if (acts) acts.insertAdjacentHTML('afterbegin', `<button class="btn sec" data-vdato="${v.id}">${v.dato_tipo ? 'Cambiar dato' : '+ Dato'}</button>`);
    });
    $('dbody').querySelectorAll('[data-vdato]').forEach(b => b.onclick = () => {
      const v = (c.valores || []).find(x => x.id === b.dataset.vdato);
      editorDato(v, async () => {
        const { data } = await db.rpc('catalogos_todos'); CATS = data || [];
        cargarCatalogos(); abrirClasificador(id);
      });
    });
    if (!$('dbody').querySelector('.datoinfo')) $('dbody').querySelector('.fh').insertAdjacentHTML('afterend',
      '<p class="sm datoinfo">Con <b>+ Dato</b>, al marcar ese valor en una visita se pedirá también una cantidad, un texto o una opción de una lista.</p>');
  };
  decorar();
  new MutationObserver((_, obs) => { if (!$('dlg').open) { obs.disconnect(); return; } decorar(); })
    .observe($('dbody'), { childList: true });
})(abrirClasificador);

/* ---------------- ficha: material y datos en el historial de visitas ---------------- */

abrirFicha = (orig => async function (id) {
  await orig(id);
  if (FICHA_ID !== id) return;
  // Material y datos bajo cada visita del historial
  $('fbody').querySelectorAll('[data-editv]').forEach(b => {
    let v; try { v = JSON.parse(b.dataset.editv); } catch (e) { return; }
    const t = detTxt(v); if (!t) return;
    const span = b.parentElement.querySelector(':scope > span');
    if (span && !span.querySelector('.vdet')) span.insertAdjacentHTML('beforeend', `<div class="sm vdet">📎 ${esc(t)}</div>`);
  });
})(abrirFicha);

/* ---------------- plan: mapa con su propio botón y «Descartar plan» ---------------- */

pintarPlan = (orig => function () {
  orig();
  if (!PLAN || !$('rplan')) return;
  const fuera = $('rplan').querySelector('.planfuera'), mapa = $('planmapa');
  if (fuera && mapa) mapa.insertAdjacentElement('afterend', fuera);
  if ($('plancerrar')) { $('plancerrar').textContent = '✕ Descartar plan'; $('plancerrar').title = 'Descarta este plan (la ruta guardada no cambia)'; }
  if ($('planver')) $('planver').onclick = () => {
    const m = $('planmapa');
    if (m.dataset.on && m.style.height !== '0px') {
      m.style.height = '0px'; m.style.marginTop = '0'; $('planver').textContent = 'Ver la ruta en el mapa';
    } else {
      mapaDelPlan(); m.style.height = 'min(55vh,460px)'; m.style.marginTop = '12px'; $('planver').textContent = 'Ocultar el mapa';
    }
  };
})(pintarPlan);

/* ---------------- columnas dentro del panel lateral ---------------- */

function abrirColumnas() {
  const d = $('tools');
  let D = colsConfig();
  const pinta = () => {
    d.innerHTML = `<div class="tbox">
      <div class="fh"><h2>Columnas</h2><button class="x" id="tclose" aria-label="Cerrar">✕</button></div>
      <button class="kcfg" id="tcvolver" style="margin:0 0 10px">← Volver a los filtros</button>
      <p class="sm">Marca las que quieres ver y ordénalas con las flechas. Se aplica al momento. El ancho se cambia arrastrando el borde de cada cabecera.</p>
      <div class="lista tcols">${D.map((c, i) => {
        const col = COLS.find(x => x.k === c.k) || { t: c.k };
        return `<label class="item" style="cursor:pointer;margin:0">
          <input type="checkbox" data-con="${i}" ${c.on ? 'checked' : ''} ${col.fijo ? 'disabled' : ''}>
          <span class="tx"><b>${esc(col.t)}</b>${col.fijo ? '<span class="sm">siempre visible</span>' : ''}</span>
          <span class="kord" style="flex-direction:row">
            <button type="button" class="kmv" data-cmv="${i}|-1" aria-label="Subir" ${i === 0 ? 'disabled' : ''}>${ICO.arriba}</button>
            <button type="button" class="kmv" data-cmv="${i}|1" aria-label="Bajar" ${i === D.length - 1 ? 'disabled' : ''}>${ICO.abajo}</button></span></label>`;
      }).join('')}</div>
      <div class="acts"><button class="btn sec" id="tcres">Restaurar las columnas</button></div></div>`;
    const aplicar = () => { colsGuardar(D); buscar(true); };
    $('tclose').onclick = () => d.classList.remove('abierto');
    $('tcvolver').onclick = () => { HERR_CTX = null; abrirHerramientas('directorio'); };
    d.querySelectorAll('[data-con]').forEach(i => i.onchange = () => {
      D[+i.dataset.con].on = i.checked;
      if (!D.some(c => c.on)) { i.checked = true; D[+i.dataset.con].on = true; toast('Deja al menos una columna', true); return; }
      aplicar();
    });
    d.querySelectorAll('[data-cmv]').forEach(b => b.onclick = e => {
      e.preventDefault();
      const [i, dir] = b.dataset.cmv.split('|').map(Number), j = i + dir;
      if (j < 0 || j >= D.length) return;
      [D[i], D[j]] = [D[j], D[i]]; aplicar(); pinta();
    });
    $('tcres').onclick = () => { localStorage.removeItem(colKey()); D = colsConfig(); buscar(true); pinta(); };
  };
  pinta();
  d.classList.add('abierto');
}

/* ---------------- Clientes (antes Pacientes): tipo y filtros ---------------- */

Object.assign(PAC, { tipo: '', pedidos: '', municipio: '' });

async function cargarPacientes() {
  vaciarModulos('v-pacientes');
  $('v-pacientes').innerHTML = `
    <div class="saludo"><div><h1>Clientes</h1><div class="fecha">Pacientes y empresas que compran: con qué médico y su historial</div></div>
      <div class="acts" style="margin:0">${puedeVentas() ? '<button class="btn" id="pacnuevo">+ Nuevo cliente</button>' : ''}</div></div>
    <div id="vcuerpo"></div>`;
  if ($('pacnuevo')) $('pacnuevo').onclick = () => editorContacto({}, c => fichaPaciente(c.id));
  pintarPacientes();
}

async function pintarPacientes() {
  const { data: munis } = await db.rpc('municipios_clientes');
  $('vcuerpo').innerHTML = `
    <div class="panel">
      <div class="filtros">
        <div><label for="pacq">Buscar</label><input id="pacq" type="search" value="${esc(PAC.q)}" placeholder="Nombre, teléfono, email, DNI o CIF"></div>
        <div><label for="pactipo">Tipo</label><select id="pactipo">
          <option value="">Todos</option><option value="Persona" ${PAC.tipo === 'Persona' ? 'selected' : ''}>Personas (pacientes)</option>
          <option value="Empresa" ${PAC.tipo === 'Empresa' ? 'selected' : ''}>Empresas</option></select></div>
        <div><label for="pacped">Pedidos</label><select id="pacped">
          <option value="">Todos</option><option value="con" ${PAC.pedidos === 'con' ? 'selected' : ''}>Con pedidos</option>
          <option value="sin" ${PAC.pedidos === 'sin' ? 'selected' : ''}>Sin pedidos</option></select></div>
        <div><label for="pacmun">Población</label><select id="pacmun"><option value="">Todas</option>
          ${(munis || []).map(x => `<option value="${esc(x.v)}" ${PAC.municipio === x.v ? 'selected' : ''}>${esc(x.v)} (${x.n})</option>`).join('')}</select></div>
        ${PAC.medico ? `<div><label>Médico</label><div style="min-height:44px;display:flex;align-items:center"><button class="chip" id="pacmedx">${esc(PAC.medicoNombre)} ✕</button></div></div>` : ''}
      </div>
      <div class="cuenta" id="paccuenta">Cargando…</div>
      <div id="paclista"></div>
      <div id="pacpag"></div>
    </div>`;
  let tq;
  $('pacq').oninput = e => { clearTimeout(tq); tq = setTimeout(() => { PAC.q = e.target.value.trim(); PAC.pagina = 0; listaPacientes(); }, 300); };
  $('pactipo').onchange = e => { PAC.tipo = e.target.value; PAC.pagina = 0; listaPacientes(); };
  $('pacped').onchange = e => { PAC.pedidos = e.target.value; PAC.pagina = 0; listaPacientes(); };
  $('pacmun').onchange = e => { PAC.municipio = e.target.value; PAC.pagina = 0; listaPacientes(); };
  if ($('pacmedx')) $('pacmedx').onclick = () => { PAC.medico = null; PAC.medicoNombre = ''; PAC.pagina = 0; pintarPacientes(); };
  listaPacientes();
}

async function listaPacientes() {
  cargando($('paclista'), 'Buscando clientes…');
  const { data, error } = await db.rpc('pacientes_lista', { q: PAC.q || null, p_medico: PAC.medico,
    lim: tamPagina(), desplaz: PAC.pagina * tamPagina(), p_tipo: PAC.tipo || null, p_pedidos: PAC.pedidos || null,
    p_municipio: PAC.municipio || null });
  if (error) { $('paccuenta').textContent = 'No se ha podido cargar: ' + error.message; $('paclista').innerHTML = ''; return; }
  $('paccuenta').innerHTML = `<b>${num(data.total)}</b> ${data.total === 1 ? 'cliente' : 'clientes'}`;
  const f = data.filas || [];
  const v = x => x ? esc(x) : '<span class="vac">—</span>';
  $('paclista').innerHTML = f.length ? `<div class="dgrid-wrap"><div class="dgrid pacs">
    <div class="dh"><span>Cliente</span><span>Tipo</span><span>DNI / CIF</span><span>Teléfono</span><span>Email</span><span>Población</span>
      <span>Médico</span><span>Comercial</span><span class="num">Pedidos</span><span class="num">Uds.</span><span>Último pedido</span></div>
    ${f.map(x => `<button class="dr" data-pac="${x.id}">
      <span><b>${esc(x.nombre)}</b></span>
      <span><span class="pill ${x.tipo === 'Empresa' ? 'p-emp' : 'p-per'}">${x.tipo === 'Empresa' ? 'Empresa' : 'Paciente'}</span></span>
      <span>${v(x.nif)}</span><span>${v(x.telefono || x.movil)}</span><span class="corta">${v(x.email)}</span><span>${v(x.municipio)}</span>
      <span class="corta">${x.medico ? esc(x.medico) : '<span class="vac">Sin asignar</span>'}</span><span>${v(x.comercial)}</span>
      <span class="num">${num(x.pedidos)}</span><span class="num"><b>${num(x.unidades)}</b></span>
      <span>${x.ultimo_pedido ? fechaCorta(x.ultimo_pedido) : '<span class="vac">—</span>'}</span>
    </button>`).join('')}</div></div>` : '<div class="vacio">Ningún cliente con estos filtros.</div>';
  $('paclista').querySelectorAll('[data-pac]').forEach(b => b.onclick = () => fichaPaciente(b.dataset.pac));
  paginador($('pacpag'), data.total, PAC.pagina, p => { PAC.pagina = p; listaPacientes(); }, () => { PAC.pagina = 0; listaPacientes(); });
}

document.querySelectorAll('#nav [data-t="pacientes"]').forEach(b => b.textContent = 'Clientes');

/* ---------------- nueva cita: aviso si ya tiene cita ese día ---------------- */

async function citaRepetida(medicoId, fecha) {
  const uid = TAB === 'agenda' && AG_VISTA ? AG_VISTA.id : PERFIL.id;
  const { data } = await RPC_ORIG('agenda_rango', { p_desde: fecha, p_hasta: fecha, p_usuario: uid });
  const ya = (data || []).find(c => c.medico_id === medicoId && CITA_ABIERTA.includes(c.estado));
  if (!ya) return 'nueva';
  const op = await elegirOpcion('Ya tiene una cita ese día',
    `${ya.nombre}\n${fechaLarga(new Date(fecha + 'T00:00:00'))}${ya.hora ? ' a las ' + String(ya.hora).slice(0, 5) : ''} · ${ya.estado}${ya.origen ? ' · ' + ya.origen : ''}\n\n¿Qué quieres hacer?`,
    [{ k: 'no', t: 'Cancelar', cls: 'sec' }, { k: 'dos', t: 'Mantener las dos', cls: 'sec' }, { k: 'sust', t: 'Quedarme solo con la nueva' }]);
  if (!op) return null;
  if (op === 'sust') {
    const { data: r } = await db.rpc('borrar_cita', { p_id: ya.id });
    if (r && r.ok === false) { toast('No se ha podido quitar la cita anterior', true); return null; }
  }
  return op;
}

/* ---------------- ayudas ---------------- */

Object.assign(AYUDA, {
  pacientes: ['Clientes', 'Pacientes (personas) y empresas que compran por recomendación de un médico.', [
    'La columna <b>Tipo</b> distingue pacientes y empresas. Filtra por tipo, si tienen pedidos o por población.',
    'Cada cliente tiene un <b>médico que lo trata</b>: se elige al darlo de alta o se asigna solo con su primer pedido.',
    'A una persona se le pide DNI o NIE; a una empresa, el CIF.']]
});
AYUDA.config = AYUDA.config || ['Configuración', '', []];
AYUDA.config[2].push('En <b>Clasificadores</b>, los de visitas (resultados, material comercial…) pueden pedir un <b>dato</b> al marcarse: una cantidad, un texto o una opción de una lista. Usa «+ Dato» en cada valor.');
AYUDA.agenda[2].push('Si añades una cita a un médico que ya tiene otra ese día, te avisa y eliges: mantener las dos o quedarte solo con la nueva.');


/* ============================================================
   DLC OS 2.0 · v2.28.0 · Móvil con todos los módulos, entrar como
   otro usuario, manual, alertas de cruce, cartera exclusiva, aviso
   de visita reciente, servicios, inicio de Rutas y un Inicio con más valor
   ============================================================ */

Object.assign(RPC_TTL, { alertas_mias: 60, alertas_cruce: 120, visitas_recientes: 30 });
let SERVICIOS = [];

async function cargarProductos() {
  const { data } = await db.rpc('productos_lista');
  const l = data || [];
  PRODUCTOS = l.filter(p => (p.tipo || 'producto') === 'producto');
  SERVICIOS = l.filter(p => p.tipo === 'servicio');
}

/* ---------------- móvil: los cuatro principales y «Más» ---------------- */

function pintarBnav() {
  const b = $('bnav'); if (!b) return;
  const principales = ['inicio', 'agenda', 'rutas', 'directorio'];
  const iconos = { inicio: '◉', agenda: '▤', rutas: '➤', directorio: '☰' };
  b.innerHTML = principales.map(t => `<button data-t="${t}" aria-selected="${TAB === t}"><span>${iconos[t]}</span>${esc((document.querySelector(`nav.main [data-t="${t}"]`) || {}).textContent || t)}</button>`).join('')
    + `<button id="bmasbtn" aria-selected="${!principales.includes(TAB)}"><span>⋯</span>Más</button>`;
  b.querySelectorAll('[data-t]').forEach(x => x.onclick = () => ir(x.dataset.t));
  $('bmasbtn').onclick = abrirMasMovil;
}

function abrirMasMovil() {
  const principales = ['inicio', 'agenda', 'rutas', 'directorio'];
  const mods = [...document.querySelectorAll('nav.main [data-t]')]
    .filter(x => !x.classList.contains('hide') && !x.disabled && !principales.includes(x.dataset.t))
    .map(x => [x.dataset.t, x.textContent.replace('Pronto', '').trim()]);
  const extra = [['manual', 'Manual de uso'], ['config', 'Configuración']].concat(PERFIL.rol === 'Administrador' ? [['admin', 'Administración']] : []);
  let s = $('bmas');
  if (!s) { document.body.insertAdjacentHTML('beforeend', '<div id="bmas" class="bmas hide"></div>'); s = $('bmas'); }
  s.innerHTML = `<div class="bmasbox"><div class="fh"><h2>Todos los módulos</h2><button class="x" id="bmasx" aria-label="Cerrar">✕</button></div>
    <div class="bmasgrid">${mods.concat(extra).map(([t, n]) => `<button data-bm="${t}" class="${TAB === t ? 'on' : ''}">${esc(n)}</button>`).join('')}</div></div>`;
  s.classList.remove('hide');
  $('bmasx').onclick = () => s.classList.add('hide');
  s.onclick = e => { if (e.target === s) s.classList.add('hide'); };
  s.querySelectorAll('[data-bm]').forEach(x => x.onclick = () => {
    s.classList.add('hide');
    if (x.dataset.bm === 'config') { ir('config'); return; }
    ir(x.dataset.bm);
  });
}

/* ---------------- entrar como otro usuario ---------------- */

const SKEY = 'dlc-suplantador';
const suplantando = () => { try { return JSON.parse(localStorage.getItem(SKEY) || 'null'); } catch (e) { return null; } };
const puedeSuplantar = () => PERFIL && (PERFIL.rol === 'Administrador' || ((PERFIL.areas || {}).U || 0) >= 3) && !suplantando();

function limpiarDatosLocales() {
  try { Object.keys(localStorage).filter(k => /^dlc-(rc-|perfil|jornada-)/.test(k)).forEach(k => localStorage.removeItem(k)); } catch (e) {}
}

async function entrarComo(id) {
  const u = (USUARIOS || []).find(x => x.id === id) || { nombre: 'esta persona' };
  if (!await preguntar(`Verás la plataforma exactamente como ${u.nombre}: su menú, sus permisos, su cartera y sus datos.\n\nLo que hagas quedará a su nombre, y la entrada queda anotada en la auditoría. Para volver, pulsa «Volver a mi sesión» en la barra morada.`,
    { titulo: `¿Entrar como ${u.nombre}?`, ok: 'Entrar como ' + String(u.nombre).split(' ')[0] })) return;
  pantallaCarga('Entrando como ' + u.nombre + '…');
  const { data: { session } } = await db.auth.getSession();
  if (!session) return;
  const { data, error } = await db.functions.invoke('impersonar', { body: { usuario_id: id } });
  if (error || !data || !data.ok) {
    const e = data && data.error;
    toast(e === 'administrador' ? 'No se puede entrar como otro administrador'
      : e === 'permiso' ? 'No tienes permiso para entrar como otra persona'
      : e === 'inactivo' ? 'Ese usuario está desactivado'
      : 'No se ha podido: ' + ((error && error.message) || e || 'la función «impersonar» no responde'), true);
    quitarCarga(); return;
  }
  localStorage.setItem(SKEY, JSON.stringify({ access_token: session.access_token, refresh_token: session.refresh_token,
    nombre: PERFIL.nombre, id: PERFIL.id, como: data.nombre, rol: data.rol, desde: Date.now() }));
  const { error: e2 } = await db.auth.verifyOtp({ token_hash: data.token_hash, type: 'magiclink' });
  if (e2) {
    localStorage.removeItem(SKEY);
    await db.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
    toast('No se ha podido abrir su sesión: ' + e2.message, true); quitarCarga(); return;
  }
  limpiarDatosLocales();
  location.reload();
}

async function volverAMiSesion() {
  const s = suplantando(); if (!s) return;
  const { error } = await db.auth.setSession({ access_token: s.access_token, refresh_token: s.refresh_token });
  localStorage.removeItem(SKEY);
  limpiarDatosLocales();
  if (error) { await db.auth.signOut(); toast('Tu sesión había caducado: vuelve a entrar', true); }
  location.reload();
}

function pintarBarraSuplantacion() {
  const s = suplantando();
  let b = $('barrasup');
  if (!s) { if (b) b.remove(); return; }
  if (!b) { document.body.insertAdjacentHTML('afterbegin', '<div id="barrasup"></div>'); b = $('barrasup'); }
  b.innerHTML = `<span>👤 <b>Estás dentro como ${esc(PERFIL ? PERFIL.nombre : s.como)}</b>${PERFIL ? ' · ' + esc(PERFIL.rol) : ''} · Ves lo mismo que esa persona y lo que hagas queda a su nombre</span>
    <button class="btn" id="supvolver">↩ Volver a mi sesión (${esc(String(s.nombre).split(' ')[0])})</button>`;
  $('supvolver').onclick = volverAMiSesion;
}

document.addEventListener('click', e => {
  const b = e.target.closest('[data-ucomo]');
  if (b) entrarComo(b.dataset.ucomo);
});

AREAS.push(['U', 'Entrar como otro usuario']);

/* ---------------- manual de uso ---------------- */

const NIVEL_TXT = ['Sin acceso', 'Ver', 'Editar', 'Completo'];
const nivelDe = a => PERFIL.rol === 'Administrador' ? 3 : ((PERFIL.areas || {})[a] || 0);

const MANUAL = [
  { id: 'inicio', t: 'Inicio', a: 'H', para: 'El resumen de tu día y de tu semana: indicadores, alertas, tu agenda de hoy y lo que conviene hacer.',
    hacer: [[1, 'Ver tus indicadores, tu semana, tus ventas del mes y las alertas'], [1, 'Personalizar qué indicadores ves (icono ⚙)'], [1, 'Compartir el resumen de la semana por WhatsApp o email']],
    config: ['Indicadores visibles y su orden (⚙ junto a «Compartir la semana»)'] },
  { id: 'agenda', t: 'Agenda y «Tu día»', a: 'G', para: 'Tus citas por día, semana o mes. La vista de día es tu ruta: orden, horas estimadas y registro de visitas.',
    hacer: [[1, 'Ver tu agenda'], [2, 'Crear, mover, aplazar, confirmar o descartar citas'], [2, 'Ordenar tu día por cercanía y empezar la jornada'], [2, 'Planificar la semana y bloquear días'],
      [3, 'Ver la agenda de otra persona y el cumplimiento del equipo (administración y televenta)']],
    config: ['Horario de rutas: salida, hora tope y minutos por visita (Rutas → ⚙ Horario de rutas)', 'Aviso de visita reciente (Configuración → Preferencias)', 'Frecuencia objetivo por estado (Agenda → Equipo, administración)'] },
  { id: 'rutas', t: 'Rutas', a: 'R', para: 'Plantillas de médicos para llenar tu agenda: listas fijas o por criterios, y propuestas automáticas.',
    hacer: [[1, 'Ver tus rutas y las propuestas'], [2, 'Crear y editar rutas, planificarlas y pasarlas a tu agenda']],
    config: ['Punto de salida y llegada (Configuración → Preferencias)', 'Horario de rutas (⚙ Horario de rutas)'] },
  { id: 'directorio', t: 'Directorio (médicos)', a: 'M', para: 'Todos los médicos que puedes ver: tu cartera o toda la base si eres de administración o televenta.',
    hacer: [[1, 'Buscar, filtrar y ver fichas'], [2, 'Editar fichas y horarios de consulta'], [3, 'Dar de alta médicos nuevos'], [3, 'Unificar duplicados (administración)']],
    config: ['Columnas visibles (⋯ → Elegir columnas)', 'Filtros guardados como indicadores de Inicio'] },
  { id: 'centros', t: 'Centros', a: 'C', para: 'Las fichas de clínicas, hospitales y centros.',
    hacer: [[1, 'Ver fichas de centros'], [2, 'Editarlas'], [3, 'Darlas de alta']], config: [] },
  { id: 'visitas', t: 'Visitas', a: 'S', para: 'El registro de cada visita: resultado, muestras, material entregado y próxima acción.',
    hacer: [[1, 'Ver el historial de visitas'], [2, 'Registrar y editar visitas']],
    config: ['Resultados y material comercial con su dato (Configuración → Clasificadores, «+ Dato»)'] },
  { id: 'ventas', t: 'Ventas, Clientes y Productos', a: 'V', para: 'Pedidos con IVA y servicios, clientes (pacientes y empresas) y el catálogo de productos y servicios.',
    hacer: [[1, 'Ver los pedidos y clientes de tus médicos'], [2, 'Crear, validar y anular pedidos; dar de alta clientes (televenta)'], [3, 'Todo lo anterior sobre toda la base']],
    config: ['Productos y servicios (solo administración)', 'Servicio propuesto por defecto en pedidos nuevos'] },
  { id: 'config', t: 'Configuración', a: 'K', para: 'Tus preferencias y las listas que usa toda la plataforma.',
    hacer: [[0, 'Cambiar tus preferencias de salida, llegada, navegador y avisos'], [1, 'Ver clasificadores'], [2, 'Añadir y editar valores de clasificadores'], [3, 'Crear clasificadores nuevos']], config: [] },
  { id: 'admin', t: 'Administración', a: null, para: 'Usuarios, permisos, carteras, comisiones, accesos y auditoría. Solo administración.',
    hacer: [[3, 'Crear y editar usuarios y sus permisos'], [3, 'Asignar carteras (exclusivas o no)'], [3, 'Configurar comisiones y liquidar'], [3, 'Entrar como otro usuario para ver lo que ve']],
    config: ['Cartera exclusiva: un médico en una sola cartera (Agenda → Equipo → ⚙ Reglas de cartera)'] }
];

const FAQ = [
  ['No veo un módulo', 'Depende de tus permisos. En la ficha de cada módulo de este manual ves tu nivel de acceso; si necesitas más, pídelo a administración.'],
  ['He registrado una visita por error', 'Abre la ficha del médico, busca la visita en el historial y pulsa «Editar»: puedes corregirla o borrarla.'],
  ['La hora estimada de una cita no cuadra', 'Revisa tu horario de rutas y el horario de consulta del médico en su ficha. La estimación cuenta desplazamientos, esperas y minutos por visita.'],
  ['Un médico no aparece en mis rutas', 'Solo entran médicos con ubicación y, si tiene horario de consulta, en sus días y horas. Revisa su ficha.'],
  ['¿Puedo usar la app sin conexión?', 'Sí: consulta lo último que viste y registra visitas; se envían solas al recuperar la conexión.'],
  ['¿Por qué no puedo descargar datos?', 'Por seguridad: los datos de médicos y ventas solo se consultan dentro de la plataforma.']
];

async function cargarManual() {
  const v = $('v-manual');
  const accesoTxt = s => s.a ? NIVEL_TXT[nivelDe(s.a)] : (PERFIL.rol === 'Administrador' ? 'Completo' : 'Sin acceso');
  const nivelSec = s => s.a ? nivelDe(s.a) : (PERFIL.rol === 'Administrador' ? 3 : 0);
  v.innerHTML = `
    <div class="saludo"><div><h1>Manual de uso</h1><div class="fecha">Qué hace cada parte, qué puedes hacer tú y dónde se configura</div></div></div>
    <div class="panel"><div class="filtros" style="grid-template-columns:1fr"><div><label for="manq">Buscar</label>
      <input id="manq" type="search" placeholder="Escribe lo que quieres hacer: aplazar una cita, bloquear un día, material…"></div></div></div>
    <div id="mancuerpo">${MANUAL.map(s => {
      const n = nivelSec(s), ay = AYUDA[s.id === 'visitas' ? 'agenda' : s.id === 'centros' ? 'directorio' : s.id] || null;
      return `<div class="card mansec" data-man="${s.id}">
        <div class="manh"><h2 style="padding:0">${esc(s.t)}</h2><span class="pill ${n >= 2 ? 'p-est' : n === 1 ? 'p-per' : 'p-anu'}">Tu acceso: ${accesoTxt(s)}</span></div>
        <p>${esc(s.para)}</p>
        <h3>Qué se puede hacer</h3>
        <ul class="manlist">${s.hacer.map(([req, txt]) => `<li class="${n >= req ? 'si' : 'no'}">${n >= req ? '✓' : '🔒'} ${esc(txt)}${n >= req ? '' : ` <span class="sm">· necesitas «${esc(s.a ? (AREAS.find(x => x[0] === s.a) || [])[1] || s.t : 'Administración')}» en ${NIVEL_TXT[req]}</span>`}</li>`).join('')}</ul>
        ${ay && ay[2] && ay[2].length ? `<h3>Cómo funciona</h3><ul class="manlist">${ay[2].map(x => `<li>${x}</li>`).join('')}</ul>` : ''}
        ${s.config.length ? `<h3>Dónde se configura</h3><ul class="manlist">${s.config.map(x => `<li>⚙ ${esc(x)}</li>`).join('')}</ul>` : ''}
      </div>`;
    }).join('')}
    <div class="card mansec" data-man="faq"><h2>Preguntas frecuentes</h2>
      ${FAQ.map(([q, r]) => `<details class="manfaq"><summary>${esc(q)}</summary><p>${esc(r)}</p></details>`).join('')}</div></div>`;
  $('manq').oninput = e => {
    const q = e.target.value.trim().toLowerCase();
    v.querySelectorAll('.mansec').forEach(c => {
      const ok = !q || c.textContent.toLowerCase().includes(q);
      c.classList.toggle('hide', !ok);
      c.querySelectorAll('li, details').forEach(li => li.classList.toggle('manhit', !!q && li.textContent.toLowerCase().includes(q)));
      if (q && ok) c.querySelectorAll('details').forEach(d => { if (d.textContent.toLowerCase().includes(q)) d.open = true; });
    });
  };
}

/* ---------------- navegación: manual y barra de suplantación ---------------- */

const irV2270 = ir;
ir = function (t) {
  if (t === 'manual') {
    irV2270('manual');
    document.querySelectorAll('main > section').forEach(s => s.classList.toggle('hide', s.id !== 'v-manual'));
    cargarManual();
  } else {
    $('v-manual').classList.add('hide');
    irV2270(t);
  }
  pintarBnav();
};

const mostrarAppV2270 = mostrarApp;
mostrarApp = function (perfil) {
  mostrarAppV2270(perfil);
  pintarBarraSuplantacion();
  pintarBnav();
  if (!$('manbtn')) {
    const ub = document.querySelector('[data-u="cfg"]');
    if (ub) ub.insertAdjacentHTML('beforebegin', '<button data-u="manual" id="manbtn">Manual de uso</button>');
  }
};
document.addEventListener('click', e => {
  if (e.target.closest('#manbtn')) { e.stopPropagation(); document.querySelectorAll('.umenu').forEach(m => m.classList.add('hide')); ir('manual'); }
}, true);

/* ---------------- reglas de cartera ---------------- */

async function editorReglasCartera() {
  await cargarAjustes();
  const excl = !AJUSTES.cartera || AJUSTES.cartera.exclusiva !== false;
  $('dbody').innerHTML = `
    <div class="fh"><div><h2>Reglas de cartera</h2><div class="sm">Cómo se reparten los médicos entre el equipo</div></div>
      <button class="x" data-cerrar aria-label="Cerrar">✕</button></div>
    <label class="opt" style="margin-top:10px"><input type="checkbox" id="rcexcl" ${excl ? 'checked' : ''}>
      <span><b>Cartera exclusiva</b><br><span class="sm">Un médico solo puede estar en la cartera de una persona. Al asignarlo a alguien, sale de la cartera de quien lo tuviera.</span></span></label>
    <p class="sm">Si la desactivas, un médico podrá estar en varias carteras y administración verá una alerta «Médicos en más de una cartera» en Inicio.</p>
    <div class="acts" style="justify-content:flex-end"><button class="btn sec" data-cerrar>Cancelar</button><button class="btn" id="rcok">Guardar</button></div>`;
  $('dlg').showModal();
  $('rcok').onclick = async () => {
    const { data: r, error } = await db.rpc('guardar_ajuste', { p_clave: 'cartera', p_valor: { exclusiva: $('rcexcl').checked } });
    if (error || (r && r.ok === false)) { toast('No se ha podido guardar', true); return; }
    AJUSTES.cartera = { exclusiva: $('rcexcl').checked }; $('dlg').close(); toast('Reglas guardadas');
  };
}

pintarEquipo = (orig => async function () {
  await orig();
  const h = $('agcuerpo').querySelector('.semhead');
  if (h && PERFIL.rol === 'Administrador' && !$('eqcart')) {
    h.insertAdjacentHTML('beforeend', '<button class="btn sec" id="eqcart">⚙ Reglas de cartera</button>');
    $('eqcart').onclick = editorReglasCartera;
  }
})(pintarEquipo);

/* ---------------- aviso de visita reciente ---------------- */

const avisoRevisita = () => Object.assign({ on: true, dias: 7 }, ((PERFIL.preferencias || {}).avisos || {}).revisita || {});

async function guardarAvisoRevisita(v) {
  const prefs = Object.assign({}, PERFIL.preferencias || {});
  prefs.avisos = Object.assign({}, prefs.avisos || {}, { revisita: v });
  const { data, error } = await db.rpc('guardar_preferencias', { p: prefs });
  if (error) { toast('No se ha podido guardar', true); return false; }
  PERFIL.preferencias = data || prefs;
  return true;
}

/** Visitas o citas de estos médicos cerca de la fecha (sin contar ese mismo día). */
async function recientesDe(ids, fecha) {
  const a = avisoRevisita(); if (!a.on || !ids.length) return {};
  const { data } = await db.rpc('visitas_recientes', { p_ids: ids, p_desde: isoMas(fecha, -(a.dias - 1)), p_hasta: isoMas(fecha, a.dias - 1) });
  const por = {};
  (data || []).filter(x => x.fecha !== fecha).forEach(x => (por[x.medico_id] = por[x.medico_id] || []).push(x));
  return por;
}
const txtReciente = l => l.map(x => `${x.tipo === 'visita' ? 'visitado' : 'cita'} el ${fechaCorta(x.fecha)}${x.usuario ? ' (' + x.usuario + ')' : ''}`).join(', ');

citaRepetida = (orig => async function (medicoId, fecha) {
  const r = await orig(medicoId, fecha);
  if (!r) return r;
  const por = await recientesDe([medicoId], fecha);
  const l = por[medicoId];
  if (!l || !l.length) return r;
  const op = await elegirOpcion('Ya se ha visto hace poco', `${txtReciente(l.slice(0, 3))}.\n\n¿Añades la cita igualmente?`,
    [{ k: 'no', t: 'Cancelar', cls: 'sec' }, { k: 'nomas', t: 'Sí, y no volver a avisarme', cls: 'sec' }, { k: 'si', t: 'Añadir igualmente' }]);
  if (!op) return null;
  if (op === 'nomas') { await guardarAvisoRevisita(Object.assign(avisoRevisita(), { on: false })); toast('Aviso desactivado. Puedes activarlo en Configuración → Preferencias'); }
  return r;
})(citaRepetida);

// Plan de ruta: marca a quien ya se ha visto hace poco y permite quitarlo
pintarPlan = (orig => function () {
  orig();
  if (!PLAN || !$('rplan') || PLAN.__recientes === undefined && !PLAN.__pedido) {
    if (PLAN && !PLAN.__pedido) {
      PLAN.__pedido = true;
      const ids = PLAN.paradas.flatMap(p => p.medicos.map(m => m.id));
      recientesDe(ids, PLAN.fecha || hoyISO()).then(por => { if (!PLAN) return; PLAN.__recientes = por; pintarPlan(); });
    }
    return;
  }
  const por = PLAN.__recientes || {};
  const ids = Object.keys(por);
  if (!ids.length) return;
  $('rplan').querySelectorAll('.pmed').forEach(el => {
    const m = PLAN.paradas.flatMap(p => p.medicos).find(x => el.textContent.includes(x.nombre));
    if (m && por[m.id] && !el.querySelector('.prec')) el.insertAdjacentHTML('beforeend', ` <span class="prec">⚠ ${esc(txtReciente(por[m.id].slice(0, 2)))}</span>`);
  });
  const card = $('rplan').querySelector('.card');
  if (card && !$('planrec')) {
    card.querySelector('h2').insertAdjacentHTML('afterend', `<div class="avisoh" id="planrec"><span>⚠ ${ids.length} ${ids.length === 1 ? 'médico del plan ya se ha' : 'médicos del plan ya se han'} visitado o tienen cita en los últimos ${avisoRevisita().dias} días.</span>
      <button class="btn sec" id="planquitar">Quitarlos del plan</button></div>`);
    $('planquitar').onclick = () => {
      const u = ULTIMO_PLAN; if (!u) return;
      construirPlan(u.conXY.filter(m => !ids.includes(m.id)), u.rutaId, null, u.opts);
    };
  }
})(pintarPlan);

// Preferencias: el aviso se puede activar, desactivar y ajustar
pintarPrefs = (orig => function () {
  orig();
  const acts = $('pfguardar') && $('pfguardar').closest('.acts');
  if (!acts || $('pfaviso')) return;
  const a = avisoRevisita();
  acts.insertAdjacentHTML('beforebegin', `<div class="blk" id="pfaviso"><h3>Avisos</h3>
    <label class="opt"><input type="checkbox" id="pfrev" ${a.on ? 'checked' : ''}>
      <span><b>Avisarme si un médico ya se ha visitado hace poco</b><br><span class="sm">Al añadir una cita, al planificar una ruta o la semana. Cuenta visitas y citas de cualquier persona.</span></span></label>
    <div class="g2"><div><label for="pfrevd">Cuántos días cuentan como «hace poco»</label><input id="pfrevd" type="number" min="1" max="60" value="${a.dias}"></div></div></div>`);
  const guardar = () => guardarAvisoRevisita({ on: $('pfrev').checked, dias: Math.max(1, +$('pfrevd').value || 7) }).then(ok => ok && toast('Aviso guardado'));
  $('pfrev').onchange = guardar; $('pfrevd').onchange = guardar;
})(pintarPrefs);

/* ---------------- servicios en Productos ---------------- */

let PSEC = 'productos';
async function cargarProductosModulo() {
  const esAdmin = PERFIL.rol === 'Administrador';
  vaciarModulos('v-productos');
  $('v-productos').innerHTML = `
    <div class="saludo"><div><h1>Productos</h1><div class="fecha">Catálogo de productos y servicios, con precios sin IVA y con IVA</div></div>
      <div class="acts" style="margin:0">${esAdmin ? `<button class="btn" id="prodnuevo">+ Nuevo ${PSEC === 'servicios' ? 'servicio' : 'producto'}</button>` : ''}</div></div>
    <div class="subnav"><button data-ps="productos" aria-pressed="${PSEC === 'productos'}">Productos</button>
      <button data-ps="servicios" aria-pressed="${PSEC === 'servicios'}">Servicios</button></div>
    <div id="vcuerpo"></div>`;
  $('v-productos').querySelectorAll('[data-ps]').forEach(b => b.onclick = () => { PSEC = b.dataset.ps; cargarProductosModulo(); });
  if ($('prodnuevo')) $('prodnuevo').onclick = () => PSEC === 'servicios' ? editorServicio(null) : editorProducto(null);
  if (PSEC === 'servicios') pintarServicios(); else pintarProductos();
}

async function pintarProductos() {
  const esAdmin = PERFIL.rol === 'Administrador';
  cargando($('vcuerpo'), 'Cargando productos…');
  const { data } = await RPC_ORIG('productos_lista', { p_todos: esAdmin });
  const l = (data || []).filter(p => (p.tipo || 'producto') === 'producto');
  $('vcuerpo').innerHTML = `<div class="panel">
    <div class="cuenta"><b>${num(l.filter(p => p.activo).length)}</b> ${l.filter(p => p.activo).length === 1 ? 'producto activo' : 'productos activos'}${l.some(p => !p.activo) ? ` · ${num(l.filter(p => !p.activo).length)} inactivos` : ''}</div>
    <div class="dgrid-wrap"><div class="dgrid prods">
      <div class="dh"><span></span><span>Producto</span><span>Referencia</span><span class="num">Sin IVA</span><span class="num">IVA</span><span class="num">Con IVA</span><span>Estado</span></div>
      ${l.map(p => `<button class="dr" data-prod="${p.id}" style="${p.activo ? '' : 'opacity:.55'}">
        <span><span class="pfoto" style="${p.foto_url ? `background-image:url('${esc(p.foto_url)}')` : ''}">${p.foto_url ? '' : '◧'}</span></span>
        <span><b>${esc(p.nombre)}</b><span class="sm">${esc(p.presentacion || 'Sin presentación')}</span></span>
        <span class="sm">${esc(p.referencia || '—')}</span><span class="num">${p.precio != null ? eurI(p.precio) : '—'}</span>
        <span class="num">${num(p.iva || 0)}%</span><span class="num"><b>${p.pvp != null ? eurI(p.pvp) : '—'}</b></span>
        <span><span class="pill ${p.activo ? 'p-est' : 'p-anu'}">${p.activo ? 'Activo' : 'Inactivo'}</span></span></button>`).join('') || '<div class="vacio">Todavía no hay productos.</div>'}
    </div></div></div>`;
  $('vcuerpo').querySelectorAll('[data-prod]').forEach(b => b.onclick = () => editorProducto(l.find(p => p.id === b.dataset.prod)));
}

async function pintarServicios() {
  const esAdmin = PERFIL.rol === 'Administrador';
  cargando($('vcuerpo'), 'Cargando servicios…');
  const { data } = await RPC_ORIG('productos_lista', { p_todos: esAdmin });
  const l = (data || []).filter(p => p.tipo === 'servicio');
  $('vcuerpo').innerHTML = `<div class="panel">
    <div class="cuenta"><b>${num(l.filter(p => p.activo).length)}</b> servicios activos · Un pedido puede llevar un servicio (envío, portes urgentes…), que se suma con su propio IVA.</div>
    <div class="dgrid-wrap"><div class="dgrid servs">
      <div class="dh"><span>Servicio</span><span class="num">Sin IVA</span><span class="num">IVA</span><span class="num">Con IVA</span><span>En pedidos nuevos</span><span>Estado</span></div>
      ${l.map(p => `<button class="dr" data-serv="${p.id}" style="${p.activo ? '' : 'opacity:.55'}">
        <span><b>${esc(p.nombre)}</b></span><span class="num">${p.precio != null ? eurI(p.precio) : '—'}</span>
        <span class="num">${num(p.iva || 0)}%</span><span class="num"><b>${p.pvp != null ? eurI(p.pvp) : '—'}</b></span>
        <span>${p.por_defecto ? '<span class="pill p-est">Se propone por defecto</span>' : '<span class="vac">—</span>'}</span>
        <span><span class="pill ${p.activo ? 'p-est' : 'p-anu'}">${p.activo ? 'Activo' : 'Inactivo'}</span></span></button>`).join('') || '<div class="vacio">Todavía no hay servicios.</div>'}
    </div></div></div>`;
  $('vcuerpo').querySelectorAll('[data-serv]').forEach(b => b.onclick = () => editorServicio(l.find(p => p.id === b.dataset.serv)));
}

function editorServicio(s) {
  const esAdmin = PERFIL.rol === 'Administrador';
  s = s || { iva: 21, activo: true };
  const ro = esAdmin ? '' : 'disabled';
  $('dbody').innerHTML = `
    <div class="fh"><div><h2>${s.id ? esc(s.nombre) : 'Nuevo servicio'}</h2>
      <div class="sm">Escribe el precio sin IVA o con IVA: el otro se calcula solo. En cada pedido se puede cambiar.</div></div>
      <button class="x" data-cerrar aria-label="Cerrar">✕</button></div>
    <label for="svn">Nombre</label><input id="svn" value="${esc(s.nombre || '')}" placeholder="p. ej. Envío, Envío urgente" ${ro}>
    <div class="pvp">
      <div><label for="svs">Sin IVA (€)</label><input id="svs" type="number" step="0.01" min="0" value="${s.precio != null ? +(+s.precio).toFixed(4) : ''}" ${ro}></div>
      <div><label for="svi">IVA (%)</label><input id="svi" type="number" step="1" min="0" max="21" value="${s.iva != null ? s.iva : 21}" ${ro}></div>
      <div><label for="svc">Con IVA (€)</label><input id="svc" type="number" step="0.01" min="0" value="${s.precio != null ? r2(s.precio * (1 + (+s.iva || 0) / 100)) : ''}" ${ro}></div></div>
    <label class="opt" style="margin-top:12px"><input type="checkbox" id="svdef" ${s.por_defecto ? 'checked' : ''} ${ro}> Proponerlo por defecto en los pedidos nuevos</label>
    ${s.id ? `<label class="opt" style="margin-top:8px"><input type="checkbox" id="svact" ${s.activo ? 'checked' : ''} ${ro}> Activo</label>` : ''}
    <div class="acts" style="justify-content:flex-end"><button class="btn sec" data-cerrar>${esAdmin ? 'Cancelar' : 'Cerrar'}</button>
      ${esAdmin ? `<button class="btn" id="svok">${s.id ? 'Guardar' : 'Crear servicio'}</button>` : ''}</div>`;
  $('dlg').showModal();
  if (!esAdmin) return;
  const iva = () => (+$('svi').value || 0) / 100;
  $('svs').oninput = () => { $('svc').value = $('svs').value === '' ? '' : r2(+$('svs').value * (1 + iva())); };
  $('svc').oninput = () => { $('svs').value = $('svc').value === '' ? '' : +(+$('svc').value / (1 + iva())).toFixed(4); };
  $('svi').oninput = () => { if ($('svs').value !== '') $('svc').value = r2(+$('svs').value * (1 + iva())); };
  $('svok').onclick = async () => {
    if (!$('svn').value.trim()) { toast('Escribe el nombre', true); return; }
    const { data: r, error } = await db.rpc('guardar_producto', { p: { id: s.id || null, tipo: 'servicio', nombre: $('svn').value.trim(),
      precio: $('svs').value, iva: $('svi').value, por_defecto: $('svdef').checked, ...($('svact') ? { activo: $('svact').checked } : {}) } });
    if (error || (r && r.ok === false)) { toast('No se ha podido guardar', true); return; }
    $('dlg').close(); toast(s.id ? 'Servicio guardado' : 'Servicio creado');
    await cargarProductos(); if (TAB === 'productos') pintarServicios();
  };
}

/* ---------------- Rutas: resumen como pantalla de entrada ---------------- */

RSEC = 'inicio';

async function resumenRutas() {
  const hoy = hoyISO();
  const [{ data: rutas }, { data: pr }, citasHoy] = await Promise.all([db.rpc('rutas_visibles'), db.rpc('propuestas_rutas', { lim: 60 }), citasDelDia(hoy)]);
  RUTAS = rutas || [];
  const j = jornadaActiva();
  const abiertas = citasHoy.filter(c => CITA_ABIERTA.includes(c.estado)).length;
  const hechas = citasHoy.filter(c => c.estado === 'Visitada').length;
  const grupos = [['hoy', '📅', 'Pasan consulta hoy', 'y no se visitan desde hace 14 días'], ['urgentes', '❗', 'Urgentes sin visitar', ''],
    ['interesados', '🔥', 'Interesados sin visita en 20 días', ''], ['sin_visitar', '🆕', 'Nunca visitados', 'con ubicación']];
  PROPUESTAS = pr || {};
  $('rcuerpo').innerHTML = `
    <div class="rgrid">
      <div class="card"><h2>Hoy</h2>
        ${j ? `<p><b style="color:var(--ok)">● Jornada en curso</b> · ${hechas} visitadas, ${abiertas} por hacer</p>`
          : (hechas + abiertas) ? `<p>Tienes <b>${hechas + abiertas}</b> citas hoy: ${hechas} visitadas y ${abiertas} por hacer.</p>`
          : '<p>No tienes citas hoy. Elige una propuesta o una de tus rutas y pásala a tu agenda.</p>'}
        <div class="acts"><button class="btn" id="rrdia">Ver mi día</button><button class="btn sec" id="rrsem">Planificar la semana</button></div></div>
      <div class="card"><h2>Propuestas para hoy</h2><p class="sm">Calculadas con tus datos. Al pulsar se prepara el plan.</p>
        <div class="lista">${grupos.map(([k, ic, t, s]) => { const n = ((pr || {})[k] || []).filter(m => m.lat).length; return `<button class="item" data-rrprop="${k}" ${n ? '' : 'disabled style="opacity:.5"'}>
          <span class="ic">${ic}</span><span class="tx"><b>${t}</b><span class="sm">${n} médicos${s ? ' ' + s : ''}</span></span><span class="n">${n}</span></button>`; }).join('')}</div></div>
      <div class="card"><h2>Mis rutas<span class="n">${RUTAS.length}</span></h2>
        ${RUTAS.length ? `<div class="lista">${RUTAS.slice(0, 6).map(r => `<button class="item" data-ruta="${r.id}"><span class="ic">➤</span>
          <span class="tx"><b>${esc(r.nombre)}</b><span class="sm">${r.tipo === 'criterios' ? 'Por criterios' : 'Lista fija'}${r.n != null ? ' · ' + num(r.n) + ' médicos' : ''}</span></span></button>`).join('')}</div>
          ${RUTAS.length > 6 ? '<button class="verlo" data-rs="mis">Ver todas</button>' : ''}`
        : `<div class="rguia"><p><b>Aún no tienes rutas.</b> Una ruta es una lista de médicos que visitas a menudo. Tres pasos:</p>
            <ol><li><b>+ Nueva ruta</b>: elige médicos concretos o unos criterios (municipio, estado, días de consulta).</li>
              <li><b>Planificar</b>: la app ordena las paradas y calcula las horas con tu horario.</li>
              <li><b>Guardar en mi agenda</b> o <b>Empezar</b>: el plan pasa a «Tu día».</li></ol>
            <div class="acts"><button class="btn" id="rrnueva">+ Crear mi primera ruta</button></div></div>`}</div>
    </div>`;
  $('rrdia').onclick = () => { AG_MODO = 'dia'; AG_FECHA = hoy; ir('agenda'); };
  $('rrsem').onclick = () => { AG_MODO = 'semana'; AG_FECHA = hoy; ir('agenda'); setTimeout(() => $('semplan') && $('semplan').click(), 900); };
  if ($('rrnueva')) $('rrnueva').onclick = () => editorRuta(null);
  $('rcuerpo').querySelectorAll('[data-rrprop]').forEach(b => b.onclick = () => planDesdeLista((pr || {})[b.dataset.rrprop] || [], b.dataset.rrprop, b));
  $('rcuerpo').querySelectorAll('[data-ruta]').forEach(b => b.onclick = () => planificar(b.dataset.ruta, b));
  $('rcuerpo').querySelectorAll('[data-rs]').forEach(b => b.onclick = () => { RSEC = b.dataset.rs; cargarRutas(); });
}

/* ---------------- Inicio: mi semana, ventas, alertas y equipo ---------------- */

pintarInicio = (orig => async function () {
  await orig();
  if (TAB !== 'inicio') return;
  if (!$('iniextra')) $('kpis').insertAdjacentHTML('afterend', '<div class="iniextra" id="iniextra"></div>');
  const cont = $('iniextra');
  const esTop = VE_TODO();
  const desde = lunesDe(hoyISO()), hoy = hoyISO();
  const mesIni = hoy.slice(0, 8) + '01', ant = new Date(mesIni + 'T12:00:00'); ant.setMonth(ant.getMonth() - 1);
  const antIni = fechaLocal(ant), antFin = isoMas(mesIni, -1);
  const antMismoDia = isoMas(antIni, +hoy.slice(8, 10) - 1) > antFin ? antFin : isoMas(antIni, +hoy.slice(8, 10) - 1);
  cont.innerHTML = ['Mi semana', 'Ventas del mes', 'Alertas'].concat(esTop ? ['Equipo esta semana'] : []).map(t => `<div class="card">${skelCard(t)}</div>`).join('');
  const [sem, v1, v0, mias, cruce, equipo, toca] = await Promise.all([
    RPC_ORIG('agenda_rango', { p_desde: desde, p_hasta: isoMas(desde, 6), p_usuario: PERFIL.id }).then(r => r.data || []),
    db.rpc('analitica_v2', { p_dim: 'producto', p_desde: mesIni, p_hasta: hoy }).then(r => (r.data || {}).totales || {}),
    db.rpc('analitica_v2', { p_dim: 'producto', p_desde: antIni, p_hasta: antMismoDia }).then(r => (r.data || {}).totales || {}),
    db.rpc('alertas_mias').then(r => r.data || []),
    esTop ? Promise.all([db.rpc('alertas_cruce', { p_dias: 30 }), puedeCompras() || VE_TODO() ? db.rpc('alertas_stock') : Promise.resolve({ data: [] })])
      .then(([a, b]) => (a.data || []).concat(b.data || [])) : Promise.resolve([]),
    esTop ? db.rpc('supervision_equipo', { p_desde: desde, p_hasta: isoMas(desde, 6) }).then(r => r.data || []) : Promise.resolve([]),
    db.rpc('toca_visitar', { p_usuario: PERFIL.id, lim: 300 }).then(r => (r.data || []).length)
  ]);
  if (TAB !== 'inicio' || !$('iniextra')) return;
  const pasadas = sem.filter(c => c.fecha < hoy && !['Descartada'].includes(c.estado));
  const cerradasOk = pasadas.filter(c => c.estado === 'Visitada').length;
  const cumple = pasadas.length ? Math.round(cerradasOk / pasadas.length * 100) : null;
  const semVis = sem.filter(c => c.estado === 'Visitada').length, semPend = sem.filter(c => CITA_ABIERTA.includes(c.estado) && c.fecha >= hoy).length;
  const delta = (a, b) => !b ? '' : `<span class="delta ${a >= b ? 'up' : 'down'}">${a >= b ? '▲' : '▼'} ${Math.abs(Math.round((a - b) / b * 100))}%</span>`;
  const alertas = cruce.map(x => Object.assign({ equipo: true }, x)).concat(mias);
  const eqTot = equipo.reduce((t, x) => { ['visitadas', 'no_estaba', 'aplazadas', 'sin_hacer', 'atrasados'].forEach(k => t[k] = (t[k] || 0) + (+x[k] || 0)); return t; }, {});
  const eqBase = (eqTot.visitadas || 0) + (eqTot.no_estaba || 0) + (eqTot.aplazadas || 0) + (eqTot.sin_hacer || 0);
  cont.innerHTML = `
    <div class="card"><h2>Mi semana</h2>
      <div class="minis"><div><b>${num(semVis)}</b><span>visitadas</span></div><div><b>${num(semPend)}</b><span>por hacer</span></div>
        <div><b style="${cumple != null && cumple < 60 ? 'color:var(--warn)' : ''}">${cumple == null ? '—' : cumple + '%'}</b><span>cumplimiento</span></div>
        <div><b style="${toca ? 'color:var(--warn)' : ''}">${num(toca)}</b><span>les toca visita</span></div></div>
      <div class="acts" style="padding:0 16px 14px"><button class="btn sec" data-inisem="semana">Ver mi semana</button>${toca ? '<button class="btn sec" data-inisem="plan">Planificarlos</button>' : ''}</div></div>
    <div class="card"><h2>Ventas del mes</h2>
      <div class="minis"><div><b>${num(v1.unidades || 0)}</b><span>unidades ${delta(+v1.unidades || 0, +v0.unidades || 0)}</span></div>
        ${verImportes() ? `<div><b>${eurI(v1.importe || 0)}</b><span>sin IVA ${delta(+v1.importe || 0, +v0.importe || 0)}</span></div>` : ''}
        <div><b>${num(v1.medicos || 0)}</b><span>médicos que prescriben</span></div></div>
      <p class="sm" style="padding:0 16px 14px">Comparado con los mismos días del mes anterior (${num(v0.unidades || 0)} unidades).</p></div>
    <div class="card"><h2>Alertas<span class="n">${alertas.reduce((n, a) => n + a.n, 0)}</span></h2>
      ${alertas.length ? `<div class="lista">${alertas.map((a, i) => `<details class="alerta2 ${a.gravedad || ''}">
        <summary><span class="an">${num(a.n)}</span> ${esc(a.titulo)}${a.equipo ? ' <span class="pill p-per">equipo</span>' : ''}</summary>
        <div>${(a.items || []).map(it => `<button class="item" ${a.tipo === 'pedido_sin_medico' ? `data-iniped="${it.id}"` : a.tipo === 'citas_sin_hacer' ? ''
          : ['stock_pedir', 'stock_minimo', 'caducidad', 'sin_lote'].includes(a.tipo) ? 'data-inistock="1"' : a.tipo === 'compra_retrasada' ? `data-inicomp="${it.id}"` : `data-inificha="${it.id}"`} style="padding:6px 8px">
          <span class="tx"><b>${esc(it.nombre)}</b><span class="sm">${esc(it.quien || '')}</span></span></button>`).join('')}
          ${a.n > (a.items || []).length ? `<div class="sm" style="padding:4px 8px">y ${num(a.n - a.items.length)} más</div>` : ''}</div></details>`).join('')}</div>`
        : '<div class="vacio">Todo en orden: no hay cruces ni pendientes.</div>'}</div>
    ${esTop ? `<div class="card"><h2>Equipo esta semana</h2>
      <div class="minis"><div><b>${eqBase ? Math.round((eqTot.visitadas || 0) / eqBase * 100) + '%' : '—'}</b><span>cumplimiento</span></div>
        <div><b>${num(eqTot.visitadas || 0)}</b><span>visitadas</span></div>
        <div><b style="${eqTot.sin_hacer ? 'color:var(--warn)' : ''}">${num(eqTot.sin_hacer || 0)}</b><span>sin hacer</span></div>
        <div><b style="${eqTot.atrasados ? 'color:var(--warn)' : ''}">${num(eqTot.atrasados || 0)}</b><span>les toca</span></div></div>
      <div class="acts" style="padding:0 16px 14px"><button class="btn sec" id="iniequipo">Ver el equipo</button></div></div>` : ''}`;
  cont.querySelectorAll('[data-inificha]').forEach(b => b.onclick = () => abrirFicha(b.dataset.inificha));
  cont.querySelectorAll('[data-iniped]').forEach(b => b.onclick = () => verPedido(b.dataset.iniped));
  cont.querySelectorAll('[data-inistock]').forEach(b => b.onclick = () => { PSEC = 'stock'; ir('productos'); });
  cont.querySelectorAll('[data-inicomp]').forEach(b => b.onclick = () => editorCompra(b.dataset.inicomp));
  cont.querySelectorAll('[data-inisem]').forEach(b => b.onclick = () => {
    AG_MODO = 'semana'; AG_FECHA = hoyISO(); ir('agenda');
    if (b.dataset.inisem === 'plan') setTimeout(() => $('semplan') && $('semplan').click(), 900);
  });
  if ($('iniequipo')) $('iniequipo').onclick = () => { AG_MODO = 'equipo'; ir('agenda'); };
})(pintarInicio);

/* ---------------- ayudas ---------------- */

Object.assign(AYUDA, {
  productos: ['Productos y servicios', 'El catálogo que se usa en pedidos, muestras y analítica.', [
    '<b>Productos</b>: lo que se vende. Escribe el precio sin IVA o con IVA: el otro se calcula solo.',
    '<b>Servicios</b>: envío, portes urgentes… Un pedido puede llevar un servicio, que se suma con su propio IVA y no cuenta como unidades.',
    'Marca un servicio como «por defecto» para que se proponga en los pedidos nuevos.',
    'Un producto o servicio inactivo no aparece al crear pedidos, pero se conserva en el histórico.']]
});
AYUDA.inicio[2].push('<b>Mi semana</b>, <b>Ventas del mes</b> y <b>Alertas</b> resumen lo importante. Administración y televenta ven además los cruces del equipo (médicos en dos carteras, visitas a médicos de otra cartera…) y el cumplimiento del equipo.');
AYUDA.rutas[2].unshift('La pestaña <b>Resumen</b> muestra tu día, las propuestas para hoy y tus rutas, con accesos directos a planificar.');


/* ============================================================
   DLC OS 2.0 · v2.29.0 · Pantalla de carga al cambiar de sesión,
   agenda sin parpadeos, más indicadores en Inicio y Analítica visual
   ============================================================ */

/* ---------------- pantalla de carga a pantalla completa ---------------- */

function pantallaCarga(msg) {
  let o = $('cargatotal');
  if (!o) { document.body.insertAdjacentHTML('beforeend', '<div id="cargatotal" class="cargatotal"></div>'); o = $('cargatotal'); }
  o.innerHTML = `<div><span class="spin"></span><b>${esc(msg)}</b><span class="sm">Un momento: se está cargando todo de nuevo</span></div>`;
  o.classList.remove('hide');
}
const quitarCarga = () => { const o = $('cargatotal'); if (o) o.classList.add('hide'); };



volverAMiSesion = (orig => async function () {
  const s = suplantando();
  pantallaCarga('Volviendo a tu sesión' + (s ? ', ' + String(s.nombre).split(' ')[0] : '') + '…');
  await orig();
})(volverAMiSesion);

/* ---------------- agenda: una sola transición al cambiar de vista ---------------- */

let ABRIR_PLAN_SEMANA = false;
cargarAgenda = (orig => async function () {
  await orig();
  const c = $('agcuerpo');
  if (c) c.dataset.modo = AG_MODO + '|' + (AG_MODO === 'dia' ? AG_FECHA : lunesDe(AG_FECHA || hoyISO())) + '|' + agUid();
  if (ABRIR_PLAN_SEMANA && AG_MODO === 'semana' && $('semplan')) { ABRIR_PLAN_SEMANA = false; $('semplan').click(); }
})(cargarAgenda);

// «Hoy» lleva siempre a «Tu día» de hoy (en el mes, al mes actual)
document.addEventListener('click', e => {
  const b = e.target.closest('#v-agenda [data-ag="hoy"]');
  if (!b) return;
  e.stopImmediatePropagation();
  AG_FECHA = hoyISO(); if (AG_MODO !== 'mes') AG_MODO = 'dia';
  cargarAgenda();
}, true);

// Desde Rutas: «Planificar la semana» abre el planificador cuando la semana ya está pintada
document.addEventListener('click', e => {
  const b = e.target.closest('#rrsem, [data-inisem="plan"]');
  if (!b) return;
  e.stopImmediatePropagation();
  ABRIR_PLAN_SEMANA = true; AG_MODO = 'semana'; AG_FECHA = hoyISO(); ir('agenda');
}, true);

/* ---------------- Inicio: más indicadores ---------------- */

const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
KPI_CAT.push(
  { id: 'uds_mes', t: 'unidades vendidas este mes', v: k => k.uds_mes, cls: k => k.uds_mes >= k.uds_mes_ant ? 'ok' : 'warn', h: 'x-analitica' },
  { id: 'importe_mes', t: 'ventas del mes sin IVA', v: k => eurI(k.importe_mes || 0).replace(',00', ''), h: 'x-analitica' },
  { id: 'prescriptores', t: 'médicos que han vendido este mes', v: k => k.prescriptores_mes, h: 'x-analitica' },
  { id: 'nuevos_presc', t: 'nuevos prescriptores este mes', v: k => k.nuevos_prescriptores, cls: k => k.nuevos_prescriptores ? 'ok' : '' },
  { id: 'activos_90', t: 'médicos con ventas en 90 días', v: k => k.activos_90 },
  { id: 'conversion', t: 'del embudo ya prescribe', v: k => pct(k.prescriben, k.en_embudo) + '%' },
  { id: 'visitas_7d', t: 'visitas en los últimos 7 días', v: k => k.visitas_7d },
  { id: 'citas_7d', t: 'citas tuyas en los próximos 7 días', v: k => k.citas_7d, h: 'x-semana' },
  { id: 'muestras_mes', t: 'muestras entregadas este mes', v: k => k.muestras_mes },
  { id: 'material_mes', t: 'entregas de material este mes', v: k => k.material_mes },
  { id: 'sin_visita_60', t: 'médicos sin visita en 60 días', v: k => k.sin_visita_60, cls: k => k.sin_visita_60 ? 'warn' : 'ok' },
  { id: 'sin_horario', t: 'fichas sin horario de consulta', v: k => k.sin_horario, cls: k => k.sin_horario ? 'warn' : 'ok' },
  { id: 'borradores', t: 'pedidos en borrador', v: k => k.borradores, cls: k => k.borradores ? 'warn' : '', h: 'x-ventas' }
);
Object.assign(AYUDA_KPI, {
  uds_mes: 'Unidades de los pedidos validados desde el día 1 de este mes. En verde si va por delante de los mismos días del mes anterior. Pulsa para ir a Analítica.',
  importe_mes: 'Importe sin IVA de los pedidos validados este mes (con el descuento de cada línea).',
  prescriptores: 'Médicos distintos a los que se ha atribuido alguna venta este mes.',
  nuevos_presc: 'Médicos cuya primera venta atribuida ha sido este mes: el mejor indicador de captación.',
  activos_90: 'Médicos con alguna venta atribuida en los últimos 90 días: tu base de prescriptores activos.',
  conversion: 'De los médicos ya presentados, interesados o prescriptores, qué parte prescribe. Mide cómo avanza el embudo.',
  visitas_7d: 'Visitas registradas en los últimos siete días, contando hoy.',
  citas_7d: 'Tus citas abiertas de hoy a los próximos seis días. Pulsa para ver tu semana.',
  muestras_mes: 'Muestras entregadas en las visitas de este mes.',
  material_mes: 'Veces que se ha entregado material comercial (dípticos, talonarios…) este mes.',
  sin_visita_60: 'Médicos que puedes ver y que no se visitan desde hace más de 60 días (o nunca).',
  sin_horario: 'Médicos sin días ni horas de consulta en su ficha. Sin ese dato, las rutas y el planificador no pueden ajustarse a su horario.',
  borradores: 'Pedidos guardados como borrador que todavía no cuentan en métricas ni comisiones. Pulsa para verlos.'
});
['uds_mes', 'prescriptores', 'citas_7d', 'sin_visita_60'].forEach(k => { if (!KPI_DEF.includes(k)) KPI_DEF.push(k); });

// Quien ya tenía indicadores guardados recibe los nuevos principales una vez (luego puede ocultarlos)
const mostrarAppV2280 = mostrarApp;
mostrarApp = function (perfil) {
  const p = perfil.preferencias || {};
  if (Array.isArray(p.kpis) && p.kpis.length) {
    ['uds_mes', 'prescriptores', 'citas_7d', 'sin_visita_60'].forEach(id => { if (!p.kpis.some(x => x.id === id)) p.kpis.push({ id, on: true, t: '' }); });
    KPI_CAT.forEach(k => { if (!p.kpis.some(x => x.id === k.id)) p.kpis.push({ id: k.id, on: false, t: '' }); });
  }
  mostrarAppV2280(perfil);
};

document.addEventListener('click', e => {
  const k = e.target.closest('#kpis [data-k^="x-"]');
  if (!k || e.target.closest('.ai')) return;
  e.stopImmediatePropagation();
  const a = k.dataset.k;
  if (a === 'x-analitica') ir('analitica');
  if (a === 'x-semana') { AG_MODO = 'semana'; AG_FECHA = hoyISO(); ir('agenda'); }
  if (a === 'x-ventas') ir('ventas');
}, true);

/* ---------------- Analítica: resumen visual ---------------- */

let ANSEC = 'resumen';
const MESES_C = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const mesTxt = m => MESES_C[+m.slice(5, 7) - 1] + ' ' + m.slice(2, 4);
function mesesEntre(d, h) {
  const out = []; const x = new Date(d.slice(0, 7) + '-01T12:00:00'), fin = new Date(h.slice(0, 7) + '-01T12:00:00');
  while (x <= fin && out.length < 36) { out.push(fechaLocal(x).slice(0, 7)); x.setMonth(x.getMonth() + 1); }
  return out;
}

function svgBarras(meses, a, b, etiquetas) {
  // a: barras (unidades), b: línea opcional (importe). El ancho se adapta a la pantalla y el alto es fijo.
  const caja = $('angraf'), W = Math.max(420, Math.min(1400, ((caja && caja.clientWidth) || 700) - 40)), H = 230, P = 34, n = meses.length || 1, bw = Math.max(6, (W - P * 2) / n * .62);
  const maxA = Math.max(1, ...a), maxB = Math.max(1, ...(b || [0]));
  const x = i => P + (W - P * 2) * (i + .5) / n;
  const ya = v => H - 26 - (H - 50) * v / maxA, yb = v => H - 26 - (H - 50) * v / maxB;
  return `<svg viewBox="0 0 ${W} ${H}" class="grafico" role="img" aria-label="${esc(etiquetas[0])} por mes">
    <line x1="${P}" y1="${H - 26}" x2="${W - P}" y2="${H - 26}" class="eje"/>
    ${a.map((v, i) => `<g><rect x="${x(i) - bw / 2}" y="${ya(v)}" width="${bw}" height="${H - 26 - ya(v)}" rx="4" class="barra1"><title>${mesTxt(meses[i])}: ${num(v)} ${etiquetas[0]}</title></rect>
      ${v ? `<text x="${x(i)}" y="${ya(v) - 5}" class="val">${num(v)}</text>` : ''}
      <text x="${x(i)}" y="${H - 8}" class="lab">${mesTxt(meses[i])}</text></g>`).join('')}
    ${b ? `<polyline points="${b.map((v, i) => `${x(i)},${yb(v)}`).join(' ')}" class="linea2"/>
      ${b.map((v, i) => `<circle cx="${x(i)}" cy="${yb(v)}" r="3.5" class="punto2"><title>${mesTxt(meses[i])}: ${eurI(v)}</title></circle>`).join('')}` : ''}
  </svg>
  <div class="leyenda"><span><i class="c1"></i>${esc(etiquetas[0])}</span>${b ? `<span><i class="c2"></i>${esc(etiquetas[1])}</span>` : ''}</div>`;
}

function svgDonut(items) {
  const tot = items.reduce((n, x) => n + x.v, 0) || 1, R = 70, C = 2 * Math.PI * R;
  const col = ['#0E2F52', '#2B6CB0', '#63A4E0', '#12805C', '#C2610F', '#8B5CF6', '#94A3B8'];
  let acc = 0;
  return `<div class="donutw"><svg viewBox="0 0 200 200" class="donut" role="img" aria-label="Reparto por producto">
    <circle cx="100" cy="100" r="${R}" class="fondo"/>
    ${items.map((x, i) => { const l = C * x.v / tot, s = `<circle cx="100" cy="100" r="${R}" stroke="${col[i % col.length]}" stroke-dasharray="${l} ${C - l}" stroke-dashoffset="${-acc}" class="arco"><title>${esc(x.n)}: ${num(x.v)} (${Math.round(x.v / tot * 100)}%)</title></circle>`; acc += l; return s; }).join('')}
    <text x="100" y="96" class="dn1">${num(tot)}</text><text x="100" y="116" class="dn2">unidades</text></svg>
    <div class="donutley">${items.map((x, i) => `<span><i style="background:${col[i % col.length]}"></i>${esc(x.n)} <b>${Math.round(x.v / tot * 100)}%</b></span>`).join('')}</div></div>`;
}

function barrasH(items, fmt) {
  const max = Math.max(1, ...items.map(x => x.v));
  return `<div class="barrash">${items.map((x, i) => `<div class="bh"><span class="bhn">${i + 1}. ${esc(x.n)}</span>
    <span class="bhb"><i style="width:${Math.max(2, x.v / max * 100)}%"></i></span><b>${fmt(x.v)}</b></div>`).join('')}</div>`;
}

const vacioGrafico = t => `<div class="gvacio"><span>📊</span><b>Aún no hay datos para este gráfico</b><span class="sm">${esc(t)}</span></div>`;

async function pintarResumenAnalitica() {
  const cuerpo = $('anres');
  cuerpo.innerHTML = `<div class="filtros" style="border:0;padding:0 0 12px"><div id="anper"></div></div>
    <div class="kpis vtot" id="ankpis">${Array.from({ length: 6 }, () => '<div class="kpi ksk"><div class="skel" style="width:40%;height:24px;margin:2px 0 8px"></div><div class="skel" style="width:70%;margin:0"></div></div>').join('')}</div>
    <div class="angrid" id="angraf"></div>`;
  const pinta = async () => {
    const r = $('anper').__rango();
    const hasta = r.hasta || hoyISO(), desde = r.desde || isoMas(hasta, -364);
    const dias = Math.round((new Date(hasta) - new Date(desde)) / 864e5) + 1;
    const antH = isoMas(desde, -1), antD = isoMas(antH, -(dias - 1));
    $('angraf').innerHTML = Array.from({ length: 4 }, () => `<div class="card">${skelCard('Cargando…')}</div>`).join('');
    const [act, ant, med, actv, emb] = await Promise.all([
      db.rpc('analitica_v2', { p_dim: 'producto', p_desde: desde, p_hasta: hasta, lim: 20 }).then(x => x.data || {}),
      db.rpc('analitica_v2', { p_dim: 'producto', p_desde: antD, p_hasta: antH, lim: 5 }).then(x => (x.data || {}).totales || {}),
      db.rpc('analitica_v2', { p_dim: 'medico', p_desde: desde, p_hasta: hasta, lim: 10 }).then(x => (x.data || {}).filas || []),
      db.rpc('actividad_mensual', { p_desde: desde, p_hasta: hasta }).then(x => x.data || []),
      db.rpc('embudo_comercial').then(x => x.data || {})
    ]);
    const t = act.totales || {};
    const d = (a, b) => !b ? '<span class="sm">sin datos del periodo anterior</span>'
      : `<span class="delta ${a >= b ? 'up' : 'down'}">${a >= b ? '▲' : '▼'} ${Math.abs(Math.round((a - b) / b * 100))}%</span> <span class="sm">vs periodo anterior</span>`;
    const kpi = (v, tit, ayuda, extra) => `<div class="kpi"><button class="ai" data-ayuda-txt="${esc(ayuda)}" data-ayuda-tit="${esc(tit)}" aria-label="Qué es">i</button>
      <b>${v}</b><span>${esc(tit)}</span>${extra ? `<span class="kx">${extra}</span>` : ''}</div>`;
    const visitas = actv.reduce((n, x) => n + x.visitas, 0);
    $('ankpis').innerHTML =
      kpi(num(t.unidades || 0), 'Unidades vendidas', 'Unidades de pedidos validados en el periodo.', d(+t.unidades || 0, +ant.unidades || 0)) +
      (verImportes() ? kpi(eurI(t.importe || 0), 'Ventas sin IVA', 'Importe sin IVA de los pedidos validados, con el descuento de cada línea.', d(+t.importe || 0, +ant.importe || 0)) : '') +
      kpi(num(t.pedidos || 0), 'Pedidos', 'Pedidos validados en el periodo.', d(+t.pedidos || 0, +ant.pedidos || 0)) +
      (verImportes() ? kpi(t.pedidos ? eurI(t.importe / t.pedidos) : '—', 'Ticket medio', 'Importe medio de cada pedido: ventas sin IVA entre número de pedidos.') : '') +
      kpi(num(t.medicos || 0), 'Médicos que prescriben', 'Médicos distintos con alguna venta atribuida en el periodo.', d(+t.medicos || 0, +ant.medicos || 0)) +
      kpi(visitas ? (Math.round((t.unidades || 0) / visitas * 10) / 10).toString().replace('.', ',') : '—', 'Unidades por visita', 'Unidades vendidas entre visitas registradas en el periodo. Indica cuánto rinde cada visita.');

    const meses = mesesEntre(desde, hasta);
    const serie = {}; (act.serie || []).forEach(s => serie[s.mes] = s);
    const vis = {}; actv.forEach(s => vis[s.mes] = s);
    const orden = ['Sin contactar', 'Presentado', 'Interesado', 'Prescribe'];
    const embTot = orden.reduce((n, k) => n + (+emb[k] || 0), 0);
    $('angraf').innerHTML = `
      <div class="card ancard ancha"><h2>Evolución de las ventas</h2>
        ${(t.unidades || 0) ? svgBarras(meses, meses.map(m => (serie[m] || {}).unidades || 0), verImportes() ? meses.map(m => +((serie[m] || {}).importe || 0)) : null, ['Unidades', 'Importe sin IVA'])
          : vacioGrafico('Cuando haya pedidos validados verás aquí las unidades (barras) y el importe (línea) de cada mes.')}
        <p class="leer"><b>Cómo leerlo:</b> cada barra son las unidades vendidas en el mes y la línea, el importe. Si la línea sube más que las barras, se vende a mejor precio (menos descuento o productos de más valor).</p></div>
      <div class="card ancard"><h2>Reparto por producto</h2>
        ${(act.por_producto || []).length ? svgDonut((act.por_producto || []).slice(0, 6).map(x => ({ n: x.nombre, v: x.unidades })))
          : vacioGrafico('Verás qué parte de las unidades corresponde a cada producto.')}
        <p class="leer"><b>Cómo leerlo:</b> el porcentaje de unidades de cada producto en el periodo. Sirve para ver de qué depende la facturación.</p></div>
      <div class="card ancard"><h2>Médicos que más prescriben</h2>
        ${med.filter(x => x.clave !== 'sin').length ? barrasH(med.filter(x => x.clave !== 'sin').map(x => ({ n: x.nombre, v: x.unidades })), num) : vacioGrafico('Aparecerán los 10 médicos con más unidades atribuidas.')}
        <p class="leer"><b>Cómo leerlo:</b> los diez médicos con más unidades atribuidas. Son los que conviene cuidar: visitas frecuentes, material y seguimiento.</p></div>
      <div class="card ancard"><h2>Embudo comercial</h2>
        ${embTot ? `<div class="embudo">${orden.map((k, i) => { const v = +emb[k] || 0, ant2 = i ? (+emb[orden[i - 1]] || 0) : 0;
          return `<div class="emb"><span class="embn">${esc(k)}</span><span class="embb"><i style="width:${Math.max(3, v / embTot * 100)}%"></i></span><b>${num(v)}</b>
            ${i ? `<span class="sm">${ant2 ? pct(v, ant2 + v) + '% avanza' : ''}</span>` : '<span class="sm"></span>'}</div>`; }).join('')}
          ${emb['No interesado'] ? `<div class="sm" style="margin-top:6px">No interesados: ${num(emb['No interesado'])}</div>` : ''}</div>`
          : vacioGrafico('Verás cuántos médicos hay en cada estado comercial.')}
        <p class="leer"><b>Cómo leerlo:</b> cuántos médicos hay en cada estado. El porcentaje indica qué parte ha pasado a ese estado respecto al anterior. El objetivo es que la barra de «Prescribe» crezca.</p></div>
      <div class="card ancard ancha"><h2>Actividad y resultados</h2>
        ${actv.length || (t.unidades || 0) ? svgBarras(meses, meses.map(m => (vis[m] || {}).visitas || 0), meses.map(m => (serie[m] || {}).unidades || 0), ['Visitas', 'Unidades vendidas'])
          : vacioGrafico('Verás las visitas de cada mes junto a las unidades vendidas.')}
        <p class="leer"><b>Cómo leerlo:</b> las barras son las visitas registradas y la línea, las unidades vendidas. Si las visitas suben y las ventas no, conviene revisar a quién se visita y con qué mensaje.</p></div>`;
  };
  montarPeriodo($('anper'), { id: 'analitica-resumen', valor: 'anio', alCambiar: pinta });
  pinta();
}

cargarAnalitica = (orig => async function () {
  await orig();
  const v = $('v-analitica'), panel = v.querySelector('.panel');
  if (!panel) return;
  v.querySelector('.saludo').insertAdjacentHTML('afterend', `<div class="subnav" id="ansub">
    <button data-ansec="resumen" aria-pressed="${ANSEC === 'resumen'}">Resumen</button>
    <button data-ansec="explorar" aria-pressed="${ANSEC === 'explorar'}">Explorar datos</button></div>
    <div id="anres" class="${ANSEC === 'resumen' ? '' : 'hide'}"></div>`);
  panel.classList.toggle('hide', ANSEC === 'resumen');
  v.querySelectorAll('[data-ansec]').forEach(b => b.onclick = () => {
    ANSEC = b.dataset.ansec;
    v.querySelectorAll('[data-ansec]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    $('anres').classList.toggle('hide', ANSEC !== 'resumen'); panel.classList.toggle('hide', ANSEC === 'resumen');
    if (ANSEC === 'resumen' && !$('ankpis')) pintarResumenAnalitica();
  });
  if (ANSEC === 'resumen') pintarResumenAnalitica();
})(cargarAnalitica);

AYUDA.analitica[2].unshift('<b>Resumen</b>: indicadores con la comparación frente al periodo anterior y gráficos explicados (evolución, productos, médicos, embudo y actividad). <b>Explorar datos</b>: ranking y tablas con filtros por médico, comercial y producto.');


/* ============================================================
   DLC OS 2.0 · v2.30.0 · Pedidos (Ventas, Compras y Proveedores)
   y Stock por lotes con trazabilidad
   ============================================================ */

Object.assign(RPC_TTL, { stock_resumen: 30, compras_lista: 30, proveedores_lista: 60, almacenes_lista: 60, alertas_stock: 60 });

const puedeCompras = () => PERFIL && (PERFIL.rol === 'Administrador' || ((PERFIL.areas || {}).V || 0) >= 3);
let PEDSEC = 'ventas', PROVEEDORES = [], ALMACENES = [];
async function cargarProveedores() { const { data } = await db.rpc('proveedores_lista'); PROVEEDORES = data || []; }
async function cargarAlmacenes() { const { data } = await db.rpc('almacenes_lista'); ALMACENES = data || []; }
const pillCompra = e => `<span class="pill ${e === 'Recibido' ? 'p-est' : e === 'Cancelado' ? 'p-anu' : e === 'Borrador' ? 'p-bor' : 'p-per'}">${esc(e)}</span>`;

/* ---------------- módulo Pedidos ---------------- */

cargarVentas = (orig => async function () {
  await orig();
  const v = $('v-ventas');
  v.querySelector('.saludo h1').firstChild.textContent = 'Pedidos';
  v.querySelector('.saludo .fecha').textContent = 'Ventas, compras y proveedores';
  v.querySelector('.saludo').insertAdjacentHTML('afterend', `<div class="subnav" id="pedsub">
    <button data-pedsec="ventas" aria-pressed="${PEDSEC === 'ventas'}">Ventas</button>
    <button data-pedsec="compras" aria-pressed="${PEDSEC === 'compras'}">Compras</button>
    <button data-pedsec="proveedores" aria-pressed="${PEDSEC === 'proveedores'}">Proveedores</button></div>`);
  v.querySelectorAll('[data-pedsec]').forEach(b => b.onclick = () => { PEDSEC = b.dataset.pedsec; cargarVentas(); });
  if (PEDSEC === 'ventas') return;
  const acts = v.querySelector('.saludo .acts');
  acts.innerHTML = puedeCompras() ? (PEDSEC === 'compras' ? '<button class="btn" id="compnueva">+ Nuevo pedido de compra</button>'
    : '<button class="btn" id="provnuevo">+ Nuevo proveedor</button>') : '';
  if ($('compnueva')) $('compnueva').onclick = () => editorCompra(null);
  if ($('provnuevo')) $('provnuevo').onclick = () => editorProveedor(null);
  if (PEDSEC === 'compras') pintarCompras(); else pintarProveedores();
})(cargarVentas);

/* ---------------- compras ---------------- */

async function pintarCompras() {
  cargando($('vcuerpo'), 'Cargando compras…');
  const { data, error } = await db.rpc('compras_lista');
  if (error) { $('vcuerpo').innerHTML = `<div class="vacio">${esc(error.message)}</div>`; return; }
  const l = data || [];
  const abiertas = l.filter(c => ['Enviado', 'En tránsito', 'Recibido parcial'].includes(c.estado));
  $('vcuerpo').innerHTML = `<div class="panel">
    <div class="kpis vtot">
      <div class="kpi"><b>${num(abiertas.length)}</b><span>Pedidos de compra en curso</span></div>
      <div class="kpi"><b>${num(abiertas.reduce((n, c) => n + (c.unidades - c.recibidas), 0))}</b><span>Unidades en camino</span></div>
      <div class="kpi ${l.some(c => c.retrasada) ? 'warn' : ''}"><b>${num(l.filter(c => c.retrasada).length)}</b><span>Con retraso</span></div>
      <div class="kpi"><b>${eurI(l.filter(c => c.estado !== 'Cancelado' && c.fecha >= hoyISO().slice(0, 4) + '-01-01').reduce((n, c) => n + (+c.importe || 0), 0))}</b><span>Comprado este año (sin IVA)</span></div>
    </div>
    ${l.length ? `<div class="dgrid-wrap"><div class="dgrid comps">
      <div class="dh"><span>Número</span><span>Proveedor</span><span>Productos</span><span>Fecha</span><span>Llegada prevista</span>
        <span class="num">Unidades</span><span class="num">Importe</span><span>Estado</span></div>
      ${l.map(c => `<button class="dr" data-comp="${c.id}">
        <span><b>${esc(c.numero)}</b></span><span>${esc(c.proveedor || '—')}</span><span class="sm">${esc(c.productos || '')}</span>
        <span>${fechaCorta(c.fecha)}</span>
        <span style="${c.retrasada ? 'color:var(--danger);font-weight:700' : ''}">${c.fecha_prevista ? fechaCorta(c.fecha_prevista) + (c.retrasada ? ' · retraso' : '') : '—'}</span>
        <span class="num">${c.recibidas && c.recibidas < c.unidades ? `${num(c.recibidas)}/` : ''}${num(c.unidades)}</span>
        <span class="num">${eurI(c.importe)}</span><span>${pillCompra(c.estado)}</span></button>`).join('')}
    </div></div>` : `<div class="vacio">Todavía no hay pedidos de compra.${puedeCompras() ? ' Crea el primero con «+ Nuevo pedido de compra».' : ''}</div>`}</div>`;
  $('vcuerpo').querySelectorAll('[data-comp]').forEach(b => b.onclick = () => editorCompra(b.dataset.comp));
}

async function editorCompra(id) {
  await Promise.all([cargarProductos(), cargarProveedores(), cargarAlmacenes()]);
  let det = null;
  if (id) det = (await RPC_ORIG('compra_detalle', { p_id: id })).data;
  const c = det ? det.compra : { estado: 'Borrador', fecha: hoyISO(), portes: 0 };
  const editable = puedeCompras() && ['Borrador', 'Enviado', 'En tránsito'].includes(c.estado);
  let lineas = det ? det.lineas.map(l => Object.assign({}, l)) : [{ producto_id: (PRODUCTOS[0] || {}).id, unidades: 1, coste_unitario: (PRODUCTOS[0] || {}).coste }];
  const pinta = () => {
    $('dbody').innerHTML = `
      <div class="fh"><div><h2>${id ? 'Pedido de compra ' + esc(c.numero) : 'Nuevo pedido de compra'} ${id ? pillCompra(c.estado) : ''}</h2>
        <div class="sm">${id ? 'Creado el ' + fechaCorta(c.fecha) : 'Se numera solo al guardarlo'}</div></div>
        <button class="x" data-cerrar aria-label="Cerrar">✕</button></div>
      <div class="g2">
        <div><label for="cpprov">Proveedor</label><select id="cpprov" ${editable ? '' : 'disabled'}>
          ${PROVEEDORES.filter(p => p.activo || p.id === c.proveedor_id).map(p => `<option value="${p.id}" data-plazo="${p.plazo_dias || 90}" ${p.id === c.proveedor_id ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('')}</select></div>
        <div class="g2" style="margin:0">
          <div><label for="cpfecha">Fecha</label><input id="cpfecha" type="date" value="${esc(c.fecha || hoyISO())}" ${editable ? '' : 'disabled'}></div>
          <div><label for="cpprev">Llegada prevista</label><input id="cpprev" type="date" value="${esc(c.fecha_prevista || '')}" ${editable ? '' : 'disabled'}></div></div>
      </div>
      <label>Productos</label>
      <div id="cplin">${lineas.map((l, i) => `<div class="lin"><div class="lrow cprow">
        <div><label>Producto</label><select data-cl="${i}|producto_id" ${editable ? '' : 'disabled'}>${PRODUCTOS.map(p => `<option value="${p.id}" ${p.id === l.producto_id ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('')}</select></div>
        <div><label>Unidades</label><input type="number" min="1" data-cl="${i}|unidades" value="${l.unidades}" ${editable ? '' : 'disabled'}></div>
        <div><label>Coste unidad sin IVA</label><input type="number" step="0.0001" min="0" data-cl="${i}|coste_unitario" value="${l.coste_unitario != null ? l.coste_unitario : ''}" ${editable ? '' : 'disabled'}></div>
        <div>${id ? `<label>Recibidas</label><div class="cprec">${num(l.recibidas || 0)} de ${num(l.unidades)}</div>` : ''}</div>
        <div>${editable && lineas.length > 1 ? `<button type="button" class="btn sec" data-clx="${i}" aria-label="Quitar">✕</button>` : ''}</div></div></div>`).join('')}</div>
      ${editable ? '<div class="acts" style="margin-top:0"><button type="button" class="btn sec" id="cpmas">+ Añadir producto</button></div>' : ''}
      <div class="g2">
        <div><label for="cpport">Portes sin IVA (€)</label><input id="cpport" type="number" step="0.01" min="0" value="${c.portes || 0}" ${editable ? '' : 'disabled'}></div>
        <div><label for="cpnota">Nota</label><input id="cpnota" value="${esc(c.nota || '')}" ${editable ? '' : 'disabled'}></div></div>
      <div class="totbox" id="cptot"></div>
      ${det && det.lotes.length ? `<div class="blk"><h3>Lotes recibidos</h3>${det.lotes.map(lo => `<div class="sm">📦 <b>${esc(lo.producto)}</b> · lote ${esc(lo.numero_lote)} · ${num(lo.unidades)} uds${lo.caducidad ? ' · caduca ' + fechaCorta(lo.caducidad) : ''}</div>`).join('')}</div>` : ''}
      <div class="acts" style="justify-content:flex-end;flex-wrap:wrap">
        <button class="btn sec" data-cerrar>Cerrar</button>
        ${puedeCompras() && id && !['Recibido', 'Cancelado'].includes(c.estado) ? '<button class="btn sec dang" id="cpcancel">Cancelar pedido</button>' : ''}
        ${editable ? `<button class="btn sec" id="cpguardar">${c.estado === 'Borrador' ? 'Guardar borrador' : 'Guardar cambios'}</button>` : ''}
        ${puedeCompras() && c.estado === 'Borrador' ? '<button class="btn sec" id="cpenviar">Marcar como enviado</button>' : ''}
        ${puedeCompras() && c.estado === 'Enviado' ? '<button class="btn sec" id="cptransito">En tránsito</button>' : ''}
        ${puedeCompras() && id && ['Enviado', 'En tránsito', 'Recibido parcial'].includes(c.estado) ? '<button class="btn" id="cprecibir">📦 Recibir mercancía</button>' : ''}
      </div>`;
    const total = () => {
      const base = lineas.reduce((n, l) => n + (+l.unidades || 0) * (+l.coste_unitario || 0), 0) + (+$('cpport').value || 0);
      $('cptot').innerHTML = `<div><span>Unidades</span><b>${num(lineas.reduce((n, l) => n + (+l.unidades || 0), 0))}</b></div>
        <div class="tot"><span>Importe sin IVA (con portes)</span><b>${eurI(base)}</b></div>`;
    };
    total();
    if (!editable) { bind(); return; }
    $('cplin').oninput = $('cplin').onchange = e => {
      const [i, k] = (e.target.dataset.cl || '').split('|'); if (!k) return;
      lineas[+i][k] = k === 'producto_id' ? e.target.value : +e.target.value;
      if (k === 'producto_id') { const p = PRODUCTOS.find(x => x.id === e.target.value); if (p && p.coste != null) { lineas[+i].coste_unitario = p.coste; pinta(); return; } }
      total();
    };
    $('cpport').oninput = total;
    $('cpmas').onclick = () => { lineas.push({ producto_id: (PRODUCTOS[0] || {}).id, unidades: 1, coste_unitario: (PRODUCTOS[0] || {}).coste }); pinta(); };
    $('cplin').querySelectorAll('[data-clx]').forEach(b => b.onclick = () => { lineas.splice(+b.dataset.clx, 1); pinta(); });
    $('cpprov').onchange = () => { if (!$('cpprev').value) $('cpprev').value = isoMas($('cpfecha').value || hoyISO(), +$('cpprov').selectedOptions[0].dataset.plazo || 90); };
    if (!$('cpprev').value && $('cpprov').value) $('cpprov').onchange();
    bind();
  };
  const guardar = async estado => {
    if (!$('cpprov').value) { toast('Elige el proveedor (créalo antes en la pestaña Proveedores)', true); return false; }
    const { data: r, error } = await db.rpc('guardar_compra', { p: { id: id || null, proveedor_id: $('cpprov').value, fecha: $('cpfecha').value,
      fecha_prevista: $('cpprev').value, estado: estado || c.estado, portes: $('cpport').value, nota: $('cpnota').value.trim(),
      lineas: lineas.filter(l => l.producto_id && +l.unidades > 0).map(l => ({ producto_id: l.producto_id, unidades: +l.unidades, coste_unitario: l.coste_unitario })) } });
    if (error || (r && r.ok === false)) { toast('No se ha podido guardar: ' + ((error && error.message) || r.error), true); return false; }
    toast(`Pedido de compra ${r.numero} guardado`); $('dlg').close(); if (TAB === 'ventas') cargarVentas(); return true;
  };
  const bind = () => {
    if ($('cpguardar')) $('cpguardar').onclick = () => guardar();
    if ($('cpenviar')) $('cpenviar').onclick = () => guardar('Enviado');
    if ($('cptransito')) $('cptransito').onclick = async () => {
      const { error } = await db.rpc('guardar_compra', { p: { id, proveedor_id: c.proveedor_id, fecha: c.fecha, fecha_prevista: c.fecha_prevista, estado: 'En tránsito', portes: c.portes, nota: c.nota } });
      if (error) { toast('No se ha podido', true); return; } toast('Marcado en tránsito'); $('dlg').close(); cargarVentas();
    };
    if ($('cpcancel')) $('cpcancel').onclick = async () => {
      if (!await preguntar('El pedido de compra queda cancelado. Lo ya recibido se mantiene en stock.', { titulo: '¿Cancelar el pedido de compra?', ok: 'Cancelar pedido', peligro: true })) return;
      await db.rpc('guardar_compra', { p: { id, proveedor_id: c.proveedor_id, fecha: c.fecha, fecha_prevista: c.fecha_prevista, estado: 'Cancelado', portes: c.portes, nota: c.nota } });
      toast('Pedido de compra cancelado'); $('dlg').close(); cargarVentas();
    };
    if ($('cprecibir')) $('cprecibir').onclick = () => recibirCompra(id, det);
  };
  pinta();
  $('dlg').showModal();
}

function recibirCompra(id, det) {
  const pend = det.lineas.filter(l => l.unidades > l.recibidas);
  const central = ALMACENES.find(a => a.tipo === 'central') || ALMACENES[0] || {};
  $('dbody').innerHTML = `
    <div class="fh"><div><h2>Recibir mercancía · ${esc(det.compra.numero)}</h2>
      <div class="sm">Anota cada lote con su caducidad. Si llega en varios lotes, usa «+ Otro lote».</div></div>
      <button class="x" data-cerrar aria-label="Cerrar">✕</button></div>
    <div id="rclin">${pend.map((l, i) => `<div class="lin" data-rl="${l.id}">
      <b>${esc(l.producto)}</b> <span class="sm">· pendientes ${num(l.unidades - l.recibidas)} de ${num(l.unidades)}</span>
      <div class="rclotes">${loteRecepcion(l, l.unidades - l.recibidas, central.id)}</div>
      <button type="button" class="kcfg" data-rlmas="${l.id}">+ Otro lote de este producto</button></div>`).join('')}</div>
    <div class="acts" style="justify-content:flex-end"><button class="btn sec" data-cerrar>Cancelar</button><button class="btn" id="rcok">Registrar la entrada</button></div>`;
  $('rclin').querySelectorAll('[data-rlmas]').forEach(b => b.onclick = () => {
    const l = pend.find(x => x.id === b.dataset.rlmas);
    b.previousElementSibling.insertAdjacentHTML('beforeend', loteRecepcion(l, '', central.id));
  });
  $('rcok').onclick = async ev => {
    const filas = [...$('rclin').querySelectorAll('.rcl')].map(f => ({
      linea_id: f.closest('[data-rl]').dataset.rl, unidades: +f.querySelector('[data-r=u]').value || 0,
      numero_lote: f.querySelector('[data-r=lote]').value.trim(), caducidad: f.querySelector('[data-r=cad]').value,
      fecha_fabricacion: f.querySelector('[data-r=fab]').value, almacen_id: f.querySelector('[data-r=alm]').value })).filter(x => x.unidades > 0);
    if (!filas.length) { toast('Indica las unidades recibidas', true); return; }
    if (filas.some(x => !x.numero_lote)) { toast('Cada entrada necesita su número de lote', true); return; }
    if (filas.some(x => !x.caducidad) && !await preguntar('Hay lotes sin fecha de caducidad. Sin ella no se pueden avisar ni ordenar las salidas por caducidad.', { titulo: '¿Registrar sin caducidad?', ok: 'Registrar igualmente' })) return;
    ev.target.disabled = true;
    const { data: r, error } = await db.rpc('recibir_compra', { p_compra: id, p_lineas: filas });
    if (error || (r && r.ok === false)) { ev.target.disabled = false; toast('No se ha podido: ' + ((error && error.message) || r.error), true); return; }
    $('dlg').close(); toast(r.pendientes ? `Entrada registrada · quedan ${num(r.pendientes)} unidades por llegar` : 'Pedido recibido completo');
    cargarVentas();
  };
}
function loteRecepcion(l, uds, almId) {
  return `<div class="g2 rcl">
    <div class="g2" style="margin:0"><div><label>Unidades</label><input type="number" min="0" data-r="u" value="${uds}"></div>
      <div><label>Nº de lote</label><input data-r="lote" placeholder="p. ej. L2609"></div></div>
    <div class="g2" style="margin:0"><div><label>Caducidad</label><input type="date" data-r="cad"></div>
      <div><label>Fabricación</label><input type="date" data-r="fab"></div></div>
    <div><label>Almacén</label><select data-r="alm">${ALMACENES.filter(a => a.activo).map(a => `<option value="${a.id}" ${a.id === almId ? 'selected' : ''}>${esc(a.nombre)}</option>`).join('')}</select></div></div>`;
}

/* ---------------- proveedores ---------------- */

async function pintarProveedores() {
  cargando($('vcuerpo'), 'Cargando proveedores…');
  await cargarProveedores();
  $('vcuerpo').innerHTML = `<div class="panel">${PROVEEDORES.length ? `<div class="dgrid-wrap"><div class="dgrid provs">
    <div class="dh"><span>Proveedor</span><span>NIF</span><span>Contacto</span><span class="num">Plazo</span><span class="num">Compras</span><span>Última compra</span><span>Estado</span></div>
    ${PROVEEDORES.map(p => `<button class="dr" data-prov="${p.id}" style="${p.activo ? '' : 'opacity:.55'}">
      <span><b>${esc(p.nombre)}</b><span class="sm">${esc([p.municipio, p.pais].filter(Boolean).join(' · '))}</span></span>
      <span>${esc(p.nif || '—')}</span><span class="sm">${esc([p.contacto, p.email, p.telefono].filter(Boolean).join(' · ') || '—')}</span>
      <span class="num">${num(p.plazo_dias || 0)} días</span><span class="num">${num(p.compras)}</span>
      <span>${p.ultima_compra ? fechaCorta(p.ultima_compra) : '—'}</span>
      <span><span class="pill ${p.activo ? 'p-est' : 'p-anu'}">${p.activo ? 'Activo' : 'Inactivo'}</span></span></button>`).join('')}
  </div></div>` : '<div class="vacio">Todavía no hay proveedores.</div>'}</div>`;
  $('vcuerpo').querySelectorAll('[data-prov]').forEach(b => b.onclick = () => editorProveedor(PROVEEDORES.find(p => p.id === b.dataset.prov)));
}

function editorProveedor(p) {
  p = p || { activo: true, plazo_dias: 90, pais: 'España' };
  const ro = puedeCompras() ? '' : 'disabled';
  const f = (k, t, extra) => `<div><label for="pv_${k}">${t}</label><input id="pv_${k}" value="${esc(p[k] != null ? p[k] : '')}" ${extra || ''} ${ro}></div>`;
  $('dbody').innerHTML = `
    <div class="fh"><div><h2>${p.id ? esc(p.nombre) : 'Nuevo proveedor'}</h2><div class="sm">Datos para pedidos de compra, lotes y contabilidad</div></div>
      <button class="x" data-cerrar aria-label="Cerrar">✕</button></div>
    <div class="g2">${f('nombre', 'Nombre o razón social')}${f('nif', 'NIF / CIF')}</div>
    <div class="g2">${f('contacto', 'Persona de contacto')}${f('email', 'Email', 'type="email"')}</div>
    <div class="g2">${f('telefono', 'Teléfono')}${f('direccion', 'Dirección')}</div>
    <div class="g2">${f('cp', 'Código postal')}${f('municipio', 'Población')}</div>
    <div class="g2">${f('provincia', 'Provincia')}${f('pais', 'País')}</div>
    <div class="g2">${f('plazo_dias', 'Plazo de entrega habitual (días)', 'type="number" min="0"')}${f('forma_pago', 'Forma de pago')}</div>
    <div class="g2">${f('condiciones', 'Condiciones (pedido mínimo, portes…)')}${f('cuenta_contable', 'Cuenta contable', 'placeholder="400xxxxx"')}</div>
    <label for="pv_nota">Nota</label><input id="pv_nota" value="${esc(p.nota || '')}" ${ro}>
    ${p.id ? `<label class="opt" style="margin-top:10px"><input type="checkbox" id="pv_activo" ${p.activo ? 'checked' : ''} ${ro}> Activo</label>` : ''}
    <div class="acts" style="justify-content:flex-end"><button class="btn sec" data-cerrar>Cerrar</button>${puedeCompras() ? `<button class="btn" id="pvok">${p.id ? 'Guardar' : 'Crear proveedor'}</button>` : ''}</div>`;
  $('dlg').showModal();
  if (!$('pvok')) return;
  $('pvok').onclick = async () => {
    const v = { id: p.id || null };
    ['nombre', 'nif', 'contacto', 'email', 'telefono', 'direccion', 'cp', 'municipio', 'provincia', 'pais', 'plazo_dias', 'forma_pago', 'condiciones', 'cuenta_contable', 'nota']
      .forEach(k => v[k] = $('pv_' + k).value.trim());
    if ($('pv_activo')) v.activo = $('pv_activo').checked;
    if (!v.nombre) { toast('Escribe el nombre', true); return; }
    const { data: r, error } = await db.rpc('guardar_proveedor', { p: v });
    if (error || (r && r.ok === false)) { toast('No se ha podido guardar', true); return; }
    $('dlg').close(); toast(p.id ? 'Proveedor guardado' : 'Proveedor creado'); await cargarProveedores();
    if (TAB === 'ventas' && PEDSEC === 'proveedores') pintarProveedores();
  };
}

/* ---------------- Productos: pestaña «Stock y lotes» ---------------- */

cargarProductosModulo = (orig => async function () {
  await orig();
  const sn = $('v-productos').querySelector('.subnav');
  if (sn && !sn.querySelector('[data-ps="stock"]')) {
    sn.insertAdjacentHTML('beforeend', `<button data-ps="stock" aria-pressed="${PSEC === 'stock'}">Stock y lotes</button>`);
    sn.querySelector('[data-ps="stock"]').onclick = () => { PSEC = 'stock'; cargarProductosModulo(); };
  }
  if (PSEC === 'stock') {
    const acts = $('v-productos').querySelector('.saludo .acts');
    acts.innerHTML = puedeCompras() ? '<button class="btn sec" id="stalm">Almacenes</button><button class="btn sec" id="stmue">⚙ Muestras</button><button class="btn" id="stini">+ Entrada de stock</button>' : '';
    if ($('stalm')) $('stalm').onclick = editorAlmacenes;
    if ($('stmue')) $('stmue').onclick = editorMuestras;
    if ($('stini')) $('stini').onclick = () => movimientoStock(null, 'inicial');
    pintarStock();
  }
})(cargarProductosModulo);

const estadoStock = s => {
  if (s.stock <= 0) return ['Sin stock', 'p-anu'];
  if (s.stock_minimo != null && s.stock < s.stock_minimo) return ['Bajo mínimo', 'p-bor'];
  if (s.dias_cobertura != null && s.dias_cobertura <= s.plazo_dias + 14 && !s.en_camino) return ['Pedir ya', 'p-bor'];
  return ['Correcto', 'p-est'];
};
const cadClase = f => !f ? '' : f < hoyISO() ? 'cad-pasada' : f <= isoMas(hoyISO(), 90) ? 'cad-pronto' : '';

async function pintarStock() {
  cargando($('vcuerpo'), 'Calculando el stock…');
  await cargarAlmacenes();
  const { data, error } = await RPC_ORIG('stock_resumen', {});
  if (error) { $('vcuerpo').innerHTML = `<div class="vacio">${esc(error.message)}</div>`; return; }
  const l = (data || []).filter(s => s.activo || s.stock);
  $('vcuerpo').innerHTML = `<div class="panel">
    <div class="cuenta">Stock calculado con todas las entradas y salidas: compras, ventas validadas, muestras, ajustes y traspasos. Las ventas salen primero del lote que caduca antes.</div>
    <div class="dgrid-wrap"><div class="dgrid stock">
      <div class="dh"><span>Producto</span><span class="num">Stock</span><span>Por almacén</span><span>Próxima caducidad</span><span>Cobertura</span><span class="num">En camino</span><span>Estado</span></div>
      ${l.map(s => { const [et, ec] = estadoStock(s); return `<button class="dr" data-stk="${s.id}">
        <span><b>${esc(s.nombre)}</b><span class="sm">${esc(s.presentacion || '')}${s.sin_lote ? ` · <span style="color:var(--warn)">${num(-s.sin_lote)} uds vendidas sin lote</span>` : ''}</span></span>
        <span class="num"><b>${num(s.stock)}</b></span>
        <span class="sm">${(s.por_almacen || []).map(a => `${esc(a.almacen)}: ${num(a.unidades)}`).join(' · ') || '—'}</span>
        <span class="${cadClase(s.proxima_caducidad)}">${s.proxima_caducidad ? fechaCorta(s.proxima_caducidad) : '—'}</span>
        <span class="sm">${s.dias_cobertura != null ? `${num(s.dias_cobertura)} días · proveedor ${num(s.plazo_dias)}` : 'Sin ventas en 90 días'}</span>
        <span class="num">${s.en_camino ? num(s.en_camino) + (s.llegada ? `<span class="sm">${fechaCorta(s.llegada)}</span>` : '') : '—'}</span>
        <span><span class="pill ${ec}">${et}</span></span></button>`; }).join('') || '<div class="vacio">Sin productos.</div>'}
    </div></div></div>`;
  $('vcuerpo').querySelectorAll('[data-stk]').forEach(b => b.onclick = () => fichaStock(l.find(s => s.id === b.dataset.stk)));
}

async function fichaStock(s) {
  await cargarProveedores();
  const [et, ec] = estadoStock(s);
  $('dbody').innerHTML = `
    <div class="fh"><div><h2>${esc(s.nombre)} <span class="pill ${ec}">${et}</span></h2>
      <div class="sm">${num(s.stock)} unidades · consumo medio ${String(s.consumo_diario).replace('.', ',')} al día${s.dias_cobertura != null ? ` · cubre ${num(s.dias_cobertura)} días` : ''}</div></div>
      <button class="x" data-cerrar aria-label="Cerrar">✕</button></div>
    ${puedeCompras() ? `<div class="g2">
      <div><label for="stmin">Stock mínimo (aviso)</label><input id="stmin" type="number" min="0" value="${s.stock_minimo != null ? s.stock_minimo : ''}" placeholder="Sin mínimo"></div>
      <div><label for="stprov">Proveedor habitual</label><select id="stprov"><option value="">—</option>${PROVEEDORES.map(p => `<option value="${p.id}" ${p.nombre === s.proveedor ? 'selected' : ''}>${esc(p.nombre)} · ${num(p.plazo_dias)} días</option>`).join('')}</select></div></div>` : ''}
    <div class="blk"><h3>Lotes</h3>
      ${(s.lotes || []).length ? `<div class="lista">${s.lotes.map(lo => `<div class="item" style="cursor:default">
        <span class="ic ${cadClase(lo.caducidad) === 'cad-pasada' ? 'w' : ''}">📦</span>
        <span class="tx"><b>Lote ${esc(lo.numero_lote)} · ${num(lo.unidades)} uds</b>
          <span class="sm"><span class="${cadClase(lo.caducidad)}">${lo.caducidad ? 'Caduca el ' + fechaCorta(lo.caducidad) : 'Sin caducidad'}</span>${lo.fecha_fabricacion ? ' · fabricado el ' + fechaCorta(lo.fecha_fabricacion) : ''} · ${esc(lo.almacen)}${lo.proveedor ? ' · ' + esc(lo.proveedor) : ''}</span></span>
        <span class="acts" style="margin:0"><button class="btn sec" data-traz="${lo.id}">Trazabilidad</button>
          ${puedeCompras() ? `<button class="btn sec" data-aju="${lo.id}|${lo.almacen_id}">Ajustar</button>${ALMACENES.filter(a => a.activo).length > 1 ? `<button class="btn sec" data-tras="${lo.id}|${lo.almacen_id}">Traspasar</button>` : ''}` : ''}</span></div>`).join('')}</div>`
        : '<div class="sm">Sin lotes con stock.</div>'}</div>
    <div class="acts" style="justify-content:flex-end">
      <button class="btn sec" data-cerrar>Cerrar</button>
      ${puedeCompras() ? '<button class="btn sec" id="stent">+ Entrada o lote</button><button class="btn" id="stgu">Guardar mínimo y proveedor</button>' : ''}</div>`;
  $('dlg').showModal();
  $('dbody').querySelectorAll('[data-traz]').forEach(b => b.onclick = () => trazabilidad(b.dataset.traz));
  $('dbody').querySelectorAll('[data-aju]').forEach(b => { const [lo, al] = b.dataset.aju.split('|'); b.onclick = () => movimientoStock(s, 'ajuste', lo, al); });
  $('dbody').querySelectorAll('[data-tras]').forEach(b => { const [lo, al] = b.dataset.tras.split('|'); b.onclick = () => movimientoStock(s, 'traspaso', lo, al); });
  if ($('stent')) $('stent').onclick = () => movimientoStock(s, 'inicial');
  if ($('stgu')) $('stgu').onclick = async () => {
    const { error } = await db.from('productos').update({ stock_minimo: $('stmin').value === '' ? null : +$('stmin').value, proveedor_id: $('stprov').value || null }).eq('id', s.id);
    if (error) { toast('No se ha podido guardar', true); return; }
    $('dlg').close(); toast('Guardado'); pintarStock();
  };
}

async function trazabilidad(loteId) {
  const { data } = await RPC_ORIG('trazabilidad_lote', { p_lote: loteId });
  const lo = (data && data.lote) || {}, m = (data && data.movimientos) || [];
  const tipos = { inicial: 'Stock inicial', entrada_compra: 'Entrada por compra', salida_venta: 'Venta', anulacion_venta: 'Anulación de venta',
    salida_muestra: 'Muestra en visita', ajuste: 'Ajuste de inventario', traspaso_salida: 'Traspaso (sale)', traspaso_entrada: 'Traspaso (entra)', devolucion: 'Devolución' };
  $('dlg2body').innerHTML = `
    <div class="fh"><div><h2>Trazabilidad · lote ${esc(lo.numero_lote || '')}</h2>
      <div class="sm">${esc(lo.producto || '')}${lo.caducidad ? ' · caduca el ' + fechaCorta(lo.caducidad) : ''}${lo.proveedor ? ' · ' + esc(lo.proveedor) : ''}${lo.compra ? ' · compra ' + esc(lo.compra) : ''}</div></div>
      <button class="x" data-cerrar2 aria-label="Cerrar">✕</button></div>
    <p class="sm">Todas las entradas y salidas de este lote. Ante una alerta sanitaria, aquí están los clientes a los que llegó.</p>
    <div class="dgrid-wrap"><div class="dgrid traz">
      <div class="dh"><span>Fecha</span><span>Movimiento</span><span class="num">Uds.</span><span>Cliente</span><span>Médico</span><span>Almacén</span></div>
      ${m.map(x => `<div class="dr" style="cursor:default"><span>${fechaCorta(String(x.fecha).slice(0, 10))}</span><span>${esc(tipos[x.tipo] || x.tipo)}${x.pedido ? `<span class="sm">Pedido ${esc(x.pedido)}</span>` : ''}</span>
        <span class="num" style="color:${x.unidades < 0 ? 'var(--danger)' : 'var(--ok)'}"><b>${x.unidades > 0 ? '+' : ''}${num(x.unidades)}</b></span>
        <span>${esc(x.cliente || '—')}${x.telefono ? `<span class="sm">${esc(x.telefono)}</span>` : ''}</span><span class="sm">${esc(x.medico || '—')}</span><span class="sm">${esc(x.almacen)}</span></div>`).join('')
        || '<div class="vacio">Sin movimientos.</div>'}</div></div>
    <div class="acts" style="justify-content:flex-end"><button class="btn sec" data-cerrar2>Cerrar</button></div>`;
  $('dlg2').showModal();
}

async function movimientoStock(s, tipo, loteId, almId) {
  await Promise.all([cargarProductos(), cargarAlmacenes(), cargarProveedores()]);
  const tit = tipo === 'inicial' ? 'Entrada de stock' : tipo === 'ajuste' ? 'Ajuste de inventario' : 'Traspaso entre almacenes';
  $('dlg2body').innerHTML = `
    <div class="fh"><div><h2>${tit}</h2><div class="sm">${tipo === 'inicial' ? 'Stock inicial o una entrada sin pedido de compra, con su lote' : tipo === 'ajuste' ? 'Suma o resta unidades de este lote (recuento, rotura, caducado…)' : 'Mueve unidades de este lote a otro almacén, por ejemplo al maletín de un comercial'}</div></div>
      <button class="x" data-cerrar2 aria-label="Cerrar">✕</button></div>
    ${tipo === 'inicial' ? `<div class="g2">
      <div><label for="mvp">Producto</label><select id="mvp">${PRODUCTOS.map(p => `<option value="${p.id}" ${s && p.id === s.id ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('')}</select></div>
      <div><label for="mva">Almacén</label><select id="mva">${ALMACENES.filter(a => a.activo).map(a => `<option value="${a.id}">${esc(a.nombre)}</option>`).join('')}</select></div></div>
      <div class="g2"><div><label for="mvl">Nº de lote</label><input id="mvl" placeholder="p. ej. L2609"></div>
        <div><label for="mvpr">Proveedor</label><select id="mvpr"><option value="">—</option>${PROVEEDORES.map(p => `<option value="${p.id}">${esc(p.nombre)}</option>`).join('')}</select></div></div>
      <div class="g2"><div><label for="mvc">Caducidad</label><input id="mvc" type="date"></div><div><label for="mvf">Fabricación</label><input id="mvf" type="date"></div></div>` : ''}
    ${tipo === 'traspaso' ? `<label for="mvd">Almacén de destino</label><select id="mvd">${ALMACENES.filter(a => a.activo && a.id !== almId).map(a => `<option value="${a.id}">${esc(a.nombre)}</option>`).join('')}</select>` : ''}
    <div class="g2"><div><label for="mvu">${tipo === 'ajuste' ? 'Unidades (+ suma, − resta)' : 'Unidades'}</label><input id="mvu" type="number" ${tipo === 'ajuste' ? '' : 'min="1"'}></div>
      <div><label for="mvn">Motivo o nota</label><input id="mvn" placeholder="${tipo === 'ajuste' ? 'Recuento, rotura, caducado…' : 'Opcional'}"></div></div>
    <div class="acts" style="justify-content:flex-end"><button class="btn sec" data-cerrar2>Cancelar</button><button class="btn" id="mvok">Registrar</button></div>`;
  $('dlg2').showModal();
  $('mvok').onclick = async () => {
    const n = +$('mvu').value;
    if (!n) { toast('Indica las unidades', true); return; }
    if (tipo === 'inicial' && !$('mvl').value.trim()) { toast('Indica el número de lote', true); return; }
    const p = tipo === 'inicial'
      ? { tipo, producto_id: $('mvp').value, almacen_id: $('mva').value, numero_lote: $('mvl').value.trim(), caducidad: $('mvc').value, fecha_fabricacion: $('mvf').value, proveedor_id: $('mvpr').value, unidades: n, nota: $('mvn').value.trim() }
      : { tipo, producto_id: s.id, lote_id: loteId, almacen_id: almId, destino_id: $('mvd') ? $('mvd').value : null, unidades: n, nota: $('mvn').value.trim() };
    const { data: r, error } = await db.rpc('movimiento_manual', { p });
    if (error || (r && r.ok === false)) { toast('No se ha podido: ' + ((error && error.message) || r.error), true); return; }
    $('dlg2').close(); $('dlg').close(); toast('Movimiento registrado'); if (TAB === 'productos') pintarStock();
  };
}

async function editorAlmacenes() {
  await cargarAlmacenes(); if (!COMS.length) await cargarComerciales();
  const pinta = () => {
    $('dbody').innerHTML = `
      <div class="fh"><div><h2>Almacenes</h2><div class="sm">El central y, si quieres, un «maletín» por comercial para sus muestras</div></div>
        <button class="x" data-cerrar aria-label="Cerrar">✕</button></div>
      <div class="lista">${ALMACENES.map(a => `<div class="item" style="cursor:default"><span class="ic">${a.tipo === 'central' ? '🏢' : '💼'}</span>
        <span class="tx"><b>${esc(a.nombre)}</b><span class="sm">${a.tipo === 'central' ? 'Almacén central' : 'Maletín de ' + esc(a.usuario || '—')} · ${num(a.unidades)} uds${a.activo ? '' : ' · inactivo'}</span></span></div>`).join('')}</div>
      <h3 style="margin-top:14px">Nuevo maletín de comercial</h3>
      <div class="g2"><div><label for="almu">Comercial</label><select id="almu">${COMS.map(u => `<option value="${u.id}">${esc(u.nombre)}</option>`).join('')}</select></div>
        <div><label>&nbsp;</label><button class="btn" id="almok">Crear maletín</button></div></div>
      <p class="sm">Pasa unidades del central a un maletín con «Traspasar» en la ficha del producto. Si las muestras restan stock, salen del maletín de quien registra la visita.</p>`;
    $('almok').onclick = async () => {
      const u = COMS.find(x => x.id === $('almu').value);
      const { error } = await db.rpc('guardar_almacen', { p: { nombre: 'Maletín ' + String(u.nombre).split(' ')[0], tipo: 'maletin', usuario_id: u.id } });
      if (error) { toast('No se ha podido crear', true); return; }
      toast('Maletín creado'); await cargarAlmacenes(); pinta();
    };
  };
  pinta(); $('dlg').showModal();
}

async function editorMuestras() {
  await Promise.all([cargarAjustes(), cargarProductos()]);
  const m = Object.assign({ producto_id: null, restar_stock: false }, AJUSTES.muestras || {});
  $('dbody').innerHTML = `
    <div class="fh"><div><h2>Muestras y stock</h2><div class="sm">Qué pasa con el stock cuando se registran muestras en una visita</div></div>
      <button class="x" data-cerrar aria-label="Cerrar">✕</button></div>
    <label class="opt" style="margin-top:10px"><input type="checkbox" id="murest" ${m.restar_stock ? 'checked' : ''}>
      <span><b>Restar las muestras del stock</b><br><span class="sm">Salen del maletín de quien registra la visita o, si no tiene, del almacén central, por lote y caducidad.</span></span></label>
    <label for="muprod">Producto de las muestras</label><select id="muprod"><option value="">—</option>${PRODUCTOS.map(p => `<option value="${p.id}" ${p.id === m.producto_id ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('')}</select>
    <div class="acts" style="justify-content:flex-end"><button class="btn sec" data-cerrar>Cancelar</button><button class="btn" id="muok">Guardar</button></div>`;
  $('dlg').showModal();
  $('muok').onclick = async () => {
    if ($('murest').checked && !$('muprod').value) { toast('Elige el producto de las muestras', true); return; }
    const { error } = await db.rpc('guardar_ajuste', { p_clave: 'muestras', p_valor: { producto_id: $('muprod').value || null, restar_stock: $('murest').checked } });
    if (error) { toast('No se ha podido guardar', true); return; }
    $('dlg').close(); toast('Guardado');
  };
}

/* ---------------- nombre del módulo en el menú y ayudas ---------------- */

document.querySelectorAll('[data-t="ventas"]').forEach(b => { if (b.closest('nav.main')) b.textContent = 'Pedidos'; });
Object.assign(AYUDA, {
  ventas: ['Pedidos', 'Ventas, compras y proveedores.', [
    '<b>Ventas</b>: pedidos de clientes. En borrador no cuentan; al validarlos cuentan en métricas y comisiones y <b>salen del stock</b>, primero del lote que caduca antes.',
    '<b>Compras</b>: pedidos a proveedores. Borrador → Enviado → En tránsito → Recibido. Al recibir se anota cada lote con su caducidad y entra en el stock.',
    '<b>Proveedores</b>: datos, plazo de entrega y cuenta contable. El plazo se usa para avisar de cuándo hay que pedir.',
    'La venta a paciente se atribuye al médico indicado y a su comercial; la venta a centro no cuenta como prescripción.']]
});
AYUDA.productos[2].push('<b>Stock y lotes</b>: stock por almacén y lote, caducidades, cobertura según el ritmo de venta, trazabilidad de cada lote (a qué clientes llegó), entradas, ajustes y traspasos a los maletines.');
MANUAL.forEach(s => { if (s.id === 'ventas') { s.t = 'Pedidos, Clientes y Productos'; s.para = 'Pedidos de venta y de compra, proveedores, clientes, productos, servicios y stock por lotes.'; s.hacer.push([3, 'Crear pedidos de compra, recibir mercancía por lotes, ajustar stock y gestionar proveedores y almacenes']); } });


/* ============================================================
   DLC OS 2.0 · v2.31.0 · Facturación: facturas desde pedidos,
   series y numeración, rectificativas, cobros, PDF y VeriFactu preparado
   ============================================================ */

Object.assign(RPC_TTL, { facturas_lista: 20, series_lista: 60, eventos_facturacion_lista: 20 });
let FSEC = 'facturas';
const puedeFacturar = () => PERFIL && (PERFIL.rol === 'Administrador' || (VE_TODO() && ((PERFIL.areas || {}).V || 0) >= 2));
const pillCobro = e => `<span class="pill ${e === 'Cobrada' ? 'p-est' : e === 'Vencida' ? 'p-anu' : 'p-bor'}">${esc(e)}</span>`;

/* ---------------- navegación ---------------- */

const irV2300 = ir;
ir = function (t) {
  if (t === 'facturacion') {
    irV2300('facturacion');
    document.querySelectorAll('main > section').forEach(s => s.classList.toggle('hide', s.id !== 'v-facturacion'));
    cargarFacturacion();
  } else {
    if ($('v-facturacion')) $('v-facturacion').classList.add('hide');
    irV2300(t);
  }
};
const mostrarAppV2300 = mostrarApp;
mostrarApp = function (perfil) {
  mostrarAppV2300(perfil);
  document.querySelectorAll('[data-t="facturacion"]').forEach(b => b.classList.toggle('hide', !VE_TODO()));
};

/* ---------------- módulo ---------------- */

async function cargarFacturacion() {
  const admin = PERFIL.rol === 'Administrador';
  const secs = [['facturas', 'Facturas'], ['series', 'Series y numeración']].concat(admin ? [['empresa', 'Datos fiscales'], ['verifactu', 'VeriFactu'], ['registro', 'Registro']] : []);
  if (!secs.some(s => s[0] === FSEC)) FSEC = 'facturas';
  $('v-facturacion').innerHTML = `
    <div class="saludo"><div><h1>Facturación</h1><div class="fecha">Facturas emitidas desde los pedidos, rectificativas y cobros</div></div>
      <div class="acts" style="margin:0"></div></div>
    <div class="subnav">${secs.map(([k, t]) => `<button data-fsec="${k}" aria-pressed="${FSEC === k}">${t}</button>`).join('')}</div>
    <div id="fcuerpo"></div>`;
  $('v-facturacion').querySelectorAll('[data-fsec]').forEach(b => b.onclick = () => { FSEC = b.dataset.fsec; cargarFacturacion(); });
  if (FSEC === 'facturas') pintarFacturas();
  if (FSEC === 'series') pintarSeries();
  if (FSEC === 'empresa') pintarEmpresa();
  if (FSEC === 'verifactu') pintarVerifactu();
  if (FSEC === 'registro') pintarRegistro();
}

async function pintarFacturas() {
  $('fcuerpo').innerHTML = `<div class="panel">
    <div class="filtros">
      <div id="fper"></div>
      <div><label for="fq">Buscar</label><input id="fq" type="search" placeholder="Número, cliente o NIF"></div>
      <div><label for="fcob">Cobro</label><select id="fcob"><option value="">Todos</option><option>Pendiente</option><option>Vencida</option><option>Cobrada</option></select></div>
    </div>
    <div class="kpis vtot" id="ftot"></div>
    <div id="flista"></div></div>`;
  let tq;
  const pinta = async () => {
    cargando($('flista'), 'Cargando facturas…');
    const r = $('fper').__rango();
    const { data, error } = await db.rpc('facturas_lista', { p_desde: r.desde, p_hasta: r.hasta, q: $('fq').value.trim() || null, p_cobro: $('fcob').value || null });
    if (!$('flista')) return;
    if (error) { $('flista').innerHTML = `<div class="vacio">${esc(error.message)}</div>`; return; }
    const l = data || [];
    const sum = (arr, k) => arr.reduce((n, x) => n + (+x[k] || 0), 0);
    const pend = l.filter(x => x.estado_cobro !== 'Cobrada'), venc = l.filter(x => x.estado_cobro === 'Vencida');
    $('ftot').innerHTML = `
      <div class="kpi"><b>${eurI(sum(l, 'total'))}</b><span>Facturado con IVA · ${num(l.length)} facturas</span></div>
      <div class="kpi"><b>${eurI(sum(l, 'base'))}</b><span>Base imponible</span></div>
      <div class="kpi"><b>${eurI(sum(l, 'cuota_iva'))}</b><span>IVA repercutido</span></div>
      <div class="kpi"><b>${eurI(sum(pend, 'total') - sum(pend, 'cobrado'))}</b><span>Pendiente de cobro · ${num(pend.length)}</span></div>
      <div class="kpi ${venc.length ? 'warn' : ''}"><b>${eurI(sum(venc, 'total') - sum(venc, 'cobrado'))}</b><span>Vencido · ${num(venc.length)}</span></div>`;
    const tamF = tamPagina(); FACPAG = Math.min(FACPAG, Math.max(0, Math.ceil(l.length / tamF) - 1));
    const lp = l.slice(FACPAG * tamF, FACPAG * tamF + tamF);
    $('flista').innerHTML = l.length ? `<div class="dgrid-wrap"><div class="dgrid facts">
      <div class="dh"><span>Número</span><span>Fecha</span><span>Cliente</span><span>NIF</span><span class="num">Base</span><span class="num">IVA</span><span class="num">Total</span><span>Vencimiento</span><span>Cobro</span></div>
      ${lp.map(f => `<button class="dr" data-fac="${f.id}">
        <span><b>${esc(f.numero)}</b>${f.rectifica ? `<span class="sm">rectifica ${esc(f.rectifica)}</span>` : f.rectificada_por ? `<span class="sm">rectificada: ${esc(f.rectificada_por)}</span>` : ''}</span>
        <span>${fechaCorta(f.fecha)}</span><span class="corta">${esc(f.cliente || '—')}</span><span class="sm">${esc(f.nif || '—')}</span>
        <span class="num">${eurI(f.base)}</span><span class="num">${eurI(f.cuota_iva)}</span><span class="num"><b>${eurI(f.total)}</b></span>
        <span class="${f.estado_cobro === 'Vencida' ? 'cad-pasada' : ''}">${f.vencimiento ? fechaCorta(f.vencimiento) : '—'}</span>
        <span>${pillCobro(f.estado_cobro)}</span></button>`).join('')}</div></div>`
      : '<div class="vacio">No hay facturas con estos filtros. Las facturas se emiten desde un pedido validado (Pedidos → Ventas → abrir el pedido → «Emitir factura»).</div>';
    $('flista').querySelectorAll('[data-fac]').forEach(b => b.onclick = () => verFactura(b.dataset.fac));
    $('flista').insertAdjacentHTML('beforeend', '<div id="fpag"></div>');
    paginador($('fpag'), l.length, FACPAG, p => { FACPAG = p; pinta(); }, () => { FACPAG = 0; pinta(); });
  };
  montarPeriodo($('fper'), { id: 'facturas', valor: 'mes', alCambiar: pinta });
  $('fq').oninput = () => { clearTimeout(tq); tq = setTimeout(() => { FACPAG = 0; pinta(); }, 300); };
  $('fcob').onchange = () => { FACPAG = 0; pinta(); };
  pinta();
}

async function verFactura(id) {
  const { data } = await RPC_ORIG('factura_detalle', { p_id: id });
  if (!data || !data.factura) { toast('No se ha podido abrir la factura', true); return; }
  const f = data.factura, cob = data.cobros || [], vf = data.verifactu || {};
  const pendiente = +(f.total - f.cobrado).toFixed(2);
  const estado = f.total === 0 || Math.abs(f.cobrado) >= Math.abs(f.total) ? 'Cobrada' : (f.vencimiento < hoyISO() ? 'Vencida' : 'Pendiente');
  $('dbody').innerHTML = `
    <div class="fh"><div><h2>${f.rectifica_id ? 'Rectificativa' : 'Factura'} ${esc(f.numero)} ${pillCobro(estado)}</h2>
      <div class="sm">${fechaLarga(new Date(f.fecha + 'T00:00:00'))}${f.vencimiento ? ' · vence el ' + fechaCorta(f.vencimiento) : ''}${f.forma_pago ? ' · ' + esc(f.forma_pago) : ''}</div></div>
      <button class="x" data-cerrar aria-label="Cerrar">✕</button></div>
    ${data.rectifica ? `<div class="avisoh"><span>Rectifica la factura <b>${esc(data.rectifica.numero)}</b> · Motivo: ${esc(f.motivo_rectificacion || '')}</span><button class="btn sec" data-vfac="${data.rectifica.id}">Ver original</button></div>` : ''}
    ${(data.rectificativas || []).length ? `<div class="avisoh"><span>Rectificada por ${data.rectificativas.map(r => `<b>${esc(r.numero)}</b> (${eurI(r.total)} · ${esc(r.motivo || '')})`).join(', ')}</span></div>` : ''}
    <div class="g2">
      <div class="blk"><h3>Cliente</h3><b>${esc(f.cliente.nombre || '')}</b><div class="sm">${esc(f.cliente.nif || 'Sin NIF')}</div>
        <div class="sm">${esc([f.cliente.direccion, f.cliente.cp, f.cliente.municipio, f.cliente.provincia].filter(Boolean).join(', '))}</div></div>
      <div class="blk"><h3>Emisor</h3><b>${esc(f.emisor.razon_social || '')}</b><div class="sm">${esc(f.emisor.nif || '')}</div>
        <div class="sm">${esc([f.emisor.direccion, f.emisor.cp, f.emisor.municipio].filter(Boolean).join(', '))}</div></div></div>
    <div class="dgrid-wrap"><div class="dgrid flin">
      <div class="dh"><span>Concepto</span><span class="num">Uds.</span><span class="num">Precio</span><span class="num">Dto.</span><span class="num">IVA</span><span class="num">Base</span></div>
      ${f.lineas.map(l => `<div class="dr" style="cursor:default"><span>${esc(l.descripcion)}</span><span class="num">${num(l.unidades)}</span>
        <span class="num">${eurI(l.precio)}</span><span class="num">${l.descuento ? num(l.descuento) + '%' : '—'}</span><span class="num">${num(l.iva)}%</span><span class="num"><b>${eurI(l.base)}</b></span></div>`).join('')}</div></div>
    <div class="totbox">${f.desglose_iva.map(d => `<div><span>Base al ${num(d.iva)}%</span><b>${eurI(d.base)}</b></div><div><span>IVA ${num(d.iva)}%</span><b>${eurI(d.cuota)}</b></div>`).join('')}
      <div class="tot"><span>Total</span><b>${eurI(f.total)}</b></div></div>
    <div class="blk"><h3>Cobros</h3>
      ${cob.length ? cob.map(c => `<div class="sm" style="display:flex;justify-content:space-between;gap:8px;padding:4px 0">
        <span>${fechaCorta(c.fecha)} · ${esc(c.forma_pago || '')}${c.nota ? ' · ' + esc(c.nota) : ''}</span><b>${eurI(c.importe)}</b>
        ${PERFIL.rol === 'Administrador' ? `<button class="kcfg" data-bcob="${c.id}">Quitar</button>` : ''}</div>`).join('') : '<div class="sm">Sin cobros registrados.</div>'}
      ${pendiente ? `<div class="sm" style="margin-top:4px">Pendiente: <b>${eurI(pendiente)}</b></div>` : ''}</div>
    ${f.huella ? `<div class="blk"><h3>Registro de facturación</h3><div class="sm mono">Huella: ${esc(f.huella.slice(0, 32))}…</div>
      <div class="sm">VeriFactu: ${esc((f.verifactu || {}).estado || 'No aplica')}</div></div>` : ''}
    <div class="acts" style="justify-content:flex-end;flex-wrap:wrap">
      <button class="btn sec" data-cerrar>Cerrar</button>
      ${f.pedido_id ? '<button class="btn sec" id="fvped">Ver pedido</button>' : ''}
      ${puedeFacturar() && !f.rectifica_id ? '<button class="btn sec dang" id="fvrect">Rectificar</button>' : ''}
      ${puedeFacturar() && pendiente ? '<button class="btn sec" id="fvcob">Registrar cobro</button>' : ''}
      <button class="btn" id="fvpdf">Ver e imprimir</button></div>`;
  $('dlg').showModal();
  $('dbody').querySelectorAll('[data-vfac]').forEach(b => b.onclick = () => verFactura(b.dataset.vfac));
  $('dbody').querySelectorAll('[data-bcob]').forEach(b => b.onclick = async () => {
    if (!await preguntar('Se quita este cobro de la factura.', { titulo: '¿Quitar el cobro?', ok: 'Quitar', peligro: true })) return;
    await db.rpc('borrar_cobro', { p_id: b.dataset.bcob }); verFactura(id); refrescarFacturas();
  });
  if ($('fvped')) $('fvped').onclick = () => verPedido(f.pedido_id);
  if ($('fvpdf')) $('fvpdf').onclick = () => imprimirFactura(f, vf, data.rectifica && data.rectifica.numero);
  if ($('fvcob')) $('fvcob').onclick = () => cobroFactura(f, pendiente);
  if ($('fvrect')) $('fvrect').onclick = () => rectificarFactura(f);
}
const refrescarFacturas = () => { if (TAB === 'facturacion' && FSEC === 'facturas' && $('flista')) pintarFacturas(); };

function cobroFactura(f, pendiente) {
  $('dlg2body').innerHTML = `
    <div class="fh"><div><h2>Registrar cobro · ${esc(f.numero)}</h2><div class="sm">Pendiente: ${eurI(pendiente)}</div></div>
      <button class="x" data-cerrar2 aria-label="Cerrar">✕</button></div>
    <div class="g2"><div><label for="cbi">Importe (€)</label><input id="cbi" type="number" step="0.01" value="${pendiente}"></div>
      <div><label for="cbf">Fecha</label><input id="cbf" type="date" value="${hoyISO()}"></div></div>
    <div class="g2"><div><label for="cbp">Forma de pago</label><select id="cbp">${(CAT.FORMA_PAGO || []).map(x => `<option ${x.valor === f.forma_pago ? 'selected' : ''}>${esc(x.valor)}</option>`).join('')}</select></div>
      <div><label for="cbn">Nota</label><input id="cbn" placeholder="Opcional"></div></div>
    <div class="acts" style="justify-content:flex-end"><button class="btn sec" data-cerrar2>Cancelar</button><button class="btn" id="cbok">Registrar</button></div>`;
  $('dlg2').showModal();
  $('cbok').onclick = async () => {
    const imp = +$('cbi').value; if (!imp) { toast('Indica el importe', true); return; }
    const { data: r, error } = await db.rpc('registrar_cobro', { p_factura: f.id, p_importe: imp, p_fecha: $('cbf').value, p_forma: $('cbp').value, p_nota: $('cbn').value.trim() || null });
    if (error || (r && r.ok === false)) { toast('No se ha podido registrar', true); return; }
    $('dlg2').close(); toast('Cobro registrado'); verFactura(f.id); refrescarFacturas();
  };
}

function rectificarFactura(f) {
  $('dlg2body').innerHTML = `
    <div class="fh"><div><h2>Rectificar ${esc(f.numero)}</h2><div class="sm">Se emite una factura rectificativa en negativo. La original no se toca.</div></div>
      <button class="x" data-cerrar2 aria-label="Cerrar">✕</button></div>
    <label for="rfm">Motivo</label><input id="rfm" placeholder="p. ej. Devolución de una caja rota, error en el precio…">
    <label>Qué se rectifica</label>
    <div class="opciones" style="grid-template-columns:1fr 1fr"><label class="opt"><input type="radio" name="rft" value="total" checked> Toda la factura</label>
      <label class="opt"><input type="radio" name="rft" value="parcial"> Solo algunas unidades</label></div>
    <div id="rflin" class="hide">${f.lineas.map((l, i) => `<div class="g2" style="align-items:center"><div>${esc(l.descripcion)} <span class="sm">(${num(l.unidades)} uds)</span></div>
      <div><input type="number" min="0" max="${l.unidades}" data-rfi="${i}" value="0" aria-label="Unidades a rectificar"></div></div>`).join('')}</div>
    ${f.pedido_id ? '<label class="opt" style="margin-top:10px"><input type="checkbox" id="rfan"> Anular también el pedido (las unidades vuelven al stock y dejan de contar en métricas)</label>' : ''}
    <div class="acts" style="justify-content:flex-end"><button class="btn sec" data-cerrar2>Cancelar</button><button class="btn dang" id="rfok">Emitir rectificativa</button></div>`;
  $('dlg2').showModal();
  $('dlg2body').querySelectorAll('[name=rft]').forEach(r => r.onchange = () => {
    const parcial = $('dlg2body').querySelector('[name=rft]:checked').value === 'parcial';
    $('rflin').classList.toggle('hide', !parcial); if ($('rfan')) { $('rfan').disabled = parcial; if (parcial) $('rfan').checked = false; }
  });
  $('rfok').onclick = async ev => {
    const motivo = $('rfm').value.trim(); if (!motivo) { toast('Escribe el motivo', true); return; }
    const parcial = $('dlg2body').querySelector('[name=rft]:checked').value === 'parcial';
    const lineas = parcial ? [...$('dlg2body').querySelectorAll('[data-rfi]')].map(i => ({ indice: +i.dataset.rfi, unidades: +i.value || 0 })).filter(x => x.unidades > 0) : null;
    if (parcial && !lineas.length) { toast('Indica las unidades a rectificar', true); return; }
    ev.target.disabled = true;
    const { data: r, error } = await db.rpc('rectificar_factura', { p_factura: f.id, p_motivo: motivo, p_lineas: lineas });
    if (error || (r && r.ok === false)) { ev.target.disabled = false; toast('No se ha podido: ' + ((error && error.message) || r.error), true); return; }
    if ($('rfan') && $('rfan').checked) await db.rpc('anular_pedido', { p_id: f.pedido_id, p_motivo: 'Rectificativa ' + r.numero + ': ' + motivo });
    $('dlg2').close(); toast('Rectificativa ' + r.numero + ' emitida'); verFactura(r.id); refrescarFacturas();
  };
}

/* ---------------- ver e imprimir (PDF desde el navegador) ---------------- */

function imprimirFactura(f, vf, rectificaNum) {
  const e = f.emisor || {}, c = f.cliente || {};
  const conQR = (f.verifactu || {}).activo;
  const eur = v => (Math.round(v * 100) / 100).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  const w = window.open('', '_blank');
  if (!w) { toast('Permite las ventanas emergentes para ver la factura', true); return; }
  w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(f.numero)}</title>
    <style>
      body{font:13px/1.45 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1c2733;margin:0;padding:36px 42px}
      h1{font-size:22px;margin:0;color:#0E2F52} .top{display:flex;justify-content:space-between;gap:20px;align-items:flex-start}
      .marca{font-size:20px;font-weight:800;color:#0E2F52;letter-spacing:.02em} .sm{color:#5b6b7b;font-size:12px}
      .cajas{display:flex;gap:18px;margin:22px 0} .caja{flex:1;border:1px solid #dbe3ea;border-radius:10px;padding:12px 14px}
      .caja h3{margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#5b6b7b}
      table{width:100%;border-collapse:collapse;margin-top:6px} th{font-size:11px;text-transform:uppercase;color:#5b6b7b;text-align:left;border-bottom:2px solid #0E2F52;padding:7px 6px}
      td{border-bottom:1px solid #e6ecf1;padding:8px 6px} .n{text-align:right;white-space:nowrap}
      .tot{margin-left:auto;width:300px;margin-top:14px} .tot div{display:flex;justify-content:space-between;padding:4px 0}
      .tot .g{border-top:2px solid #0E2F52;margin-top:4px;padding-top:8px;font-size:16px;font-weight:800;color:#0E2F52}
      .pie{margin-top:28px;font-size:11.5px;color:#5b6b7b;border-top:1px solid #e6ecf1;padding-top:12px}
      .qr{display:flex;gap:12px;align-items:center;margin-top:18px} .qr div{font-size:11px;color:#5b6b7b}
      .rect{background:#fff4e5;border:1px solid #f0c48a;border-radius:8px;padding:8px 12px;margin-top:14px}
      @media print{body{padding:18px 22px}.noimp{display:none}}
    </style></head><body>
    <div class="noimp" style="text-align:right;margin-bottom:12px"><button onclick="print()" style="padding:9px 16px;border-radius:8px;border:0;background:#0E2F52;color:#fff;font-weight:700;cursor:pointer">Imprimir o guardar en PDF</button></div>
    <div class="top"><div><div class="marca">${esc(e.razon_social || nombreApp())}</div>
      <div class="sm">${esc(e.nif || '')}<br>${esc([e.direccion, e.cp, e.municipio, e.provincia].filter(Boolean).join(', '))}<br>${esc([e.telefono, e.email].filter(Boolean).join(' · '))}</div></div>
      <div style="text-align:right"><h1>${f.rectifica_id ? 'Factura rectificativa' : 'Factura'}</h1><div style="font-size:16px;font-weight:700">${esc(f.numero)}</div>
        <div class="sm">Fecha: ${esc(f.fecha.split('-').reverse().join('/'))}${f.vencimiento && !f.rectifica_id ? '<br>Vencimiento: ' + esc(f.vencimiento.split('-').reverse().join('/')) : ''}</div></div></div>
    ${f.rectifica_id ? `<div class="rect">Rectifica la factura <b>${esc(rectificaNum || '')}</b> · Motivo: ${esc(f.motivo_rectificacion || '')}</div>` : ''}
    <div class="cajas"><div class="caja"><h3>Cliente</h3><b>${esc(c.nombre || '')}</b><br>${esc(c.nif || '')}<br>${esc([c.direccion, c.cp, c.municipio, c.provincia, c.pais].filter(Boolean).join(', '))}</div>
      <div class="caja"><h3>Pago</h3>${esc(f.forma_pago || '—')}${e.iban ? '<br>IBAN: ' + esc(e.iban) : ''}</div></div>
    <table><thead><tr><th>Concepto</th><th class="n">Uds.</th><th class="n">Precio</th><th class="n">Dto.</th><th class="n">IVA</th><th class="n">Importe</th></tr></thead>
      <tbody>${f.lineas.map(l => `<tr><td>${esc(l.descripcion)}</td><td class="n">${l.unidades}</td><td class="n">${eur(l.precio)}</td>
        <td class="n">${l.descuento ? l.descuento + '%' : ''}</td><td class="n">${l.iva}%</td><td class="n">${eur(l.base)}</td></tr>`).join('')}</tbody></table>
    <div class="tot">${f.desglose_iva.map(d => `<div><span>Base imponible ${d.iva}%</span><span>${eur(d.base)}</span></div><div><span>IVA ${d.iva}%</span><span>${eur(d.cuota)}</span></div>`).join('')}
      <div class="g"><span>Total</span><span>${eur(f.total)}</span></div></div>
    ${conQR ? `<div class="qr"><span id="qr"></span><div><b>VERI*FACTU</b><br>Factura verificable en la sede electrónica de la AEAT</div></div>` : ''}
    <div class="pie">${esc(e.pie || '')}${e.registro ? '<br>' + esc(e.registro) : ''}</div>
    ${conQR ? `<script src="${new URL('qrcode.js', location.href).href}"><\/script>
      <script>try{var q=qrcode(0,'M');q.addData(${JSON.stringify(f.qr_url || '')});q.make();document.getElementById('qr').innerHTML=q.createSvgTag(3,0);}catch(e){}<\/script>` : ''}
    </body></html>`);
  w.document.close();
}

/* ---------------- series ---------------- */

async function pintarSeries() {
  cargando($('fcuerpo'), 'Cargando series…');
  const { data } = await RPC_ORIG('series_lista', {});
  const l = data || [], admin = PERFIL.rol === 'Administrador';
  $('fcuerpo').innerHTML = `<div class="panel">
    <div class="cuenta">Cada serie numera sus facturas de forma correlativa. Para continuar la numeración de otro programa, pon en «Siguiente número» el que toca.
      ${admin ? '<button class="btn sec" id="sernueva" style="margin-left:8px">+ Nueva serie</button>' : ''}</div>
    <div class="dgrid-wrap"><div class="dgrid sers">
      <div class="dh"><span>Serie</span><span>Tipo</span><span>Formato</span><span>Próximo número</span><span>Última emitida</span><span class="num">Emitidas</span><span>Reinicio anual</span></div>
      ${l.map(s => `<button class="dr" data-ser="${s.id}"><span><b>${esc(s.codigo)}</b><span class="sm">${esc(s.nombre)}${s.por_defecto ? ' · por defecto' : ''}${s.activa ? '' : ' · inactiva'}</span></span>
        <span>${esc(s.tipo === 'ordinaria' ? 'Facturas' : s.tipo === 'rectificativa' ? 'Rectificativas' : 'Simplificadas')}</span><span class="mono">${esc(s.formato)}</span>
        <span><b>${esc(s.proximo)}</b></span><span>${esc(s.ultima || '—')}</span><span class="num">${num(s.emitidas)}</span><span>${s.reinicio_anual ? 'Sí' : 'No'}</span></button>`).join('')}
    </div></div>
    <p class="sm" style="padding:10px 16px">Formato: <b>{S}</b> código de la serie · <b>{AAAA}</b> o <b>{AA}</b> año · <b>{NNNN}</b> número con tantas cifras como «N». Ejemplo: {S}{AA}{NNNN} → F260408.</p></div>`;
  $('fcuerpo').querySelectorAll('[data-ser]').forEach(b => b.onclick = () => editorSerie(l.find(s => s.id === b.dataset.ser)));
  if ($('sernueva')) $('sernueva').onclick = () => editorSerie(null);
}

function editorSerie(s) {
  const admin = PERFIL.rol === 'Administrador', ro = admin ? '' : 'disabled';
  s = s || { codigo: '', nombre: '', tipo: 'ordinaria', formato: '{S}{AA}{NNNN}', siguiente: 1, anio: +hoyISO().slice(0, 4), reinicio_anual: true };
  $('dbody').innerHTML = `
    <div class="fh"><div><h2>${s.id ? 'Serie ' + esc(s.codigo) : 'Nueva serie'}</h2><div class="sm">Próximo número: <b id="serprev"></b></div></div>
      <button class="x" data-cerrar aria-label="Cerrar">✕</button></div>
    <div class="g2"><div><label for="sec">Código</label><input id="sec" value="${esc(s.codigo)}" ${s.id ? 'disabled' : ro} placeholder="p. ej. F, CN, W"></div>
      <div><label for="sen">Nombre</label><input id="sen" value="${esc(s.nombre)}" ${ro}></div></div>
    <div class="g2"><div><label for="set">Tipo</label><select id="set" ${s.id ? 'disabled' : ro}>
        <option value="ordinaria" ${s.tipo === 'ordinaria' ? 'selected' : ''}>Facturas</option><option value="rectificativa" ${s.tipo === 'rectificativa' ? 'selected' : ''}>Rectificativas</option>
        <option value="simplificada" ${s.tipo === 'simplificada' ? 'selected' : ''}>Simplificadas (tickets)</option></select></div>
      <div><label for="sef">Formato</label><input id="sef" value="${esc(s.formato)}" ${ro}></div></div>
    <div class="g2"><div><label for="ses">Siguiente número</label><input id="ses" type="number" min="1" value="${s.siguiente}" ${ro}></div>
      <div><label for="sea">Año de la numeración</label><input id="sea" type="number" value="${s.anio}" ${ro}></div></div>
    <label class="opt" style="margin-top:10px"><input type="checkbox" id="ser" ${s.reinicio_anual ? 'checked' : ''} ${ro}> Volver a empezar desde 1 cada año</label>
    <label class="opt" style="margin-top:8px"><input type="checkbox" id="sed" ${s.por_defecto ? 'checked' : ''} ${ro}> Serie por defecto para su tipo</label>
    ${s.id ? `<label class="opt" style="margin-top:8px"><input type="checkbox" id="seac" ${s.activa !== false ? 'checked' : ''} ${ro}> Activa</label>` : ''}
    <div class="acts" style="justify-content:flex-end"><button class="btn sec" data-cerrar>Cerrar</button>${admin ? '<button class="btn" id="seok">Guardar</button>' : ''}</div>`;
  $('dlg').showModal();
  const prev = () => {
    const cod = $('sec').value.trim().toUpperCase() || 'X', a = +$('sea').value || 2026, n = +$('ses').value || 1;
    let r = $('sef').value.replace('{S}', cod).replace('{AAAA}', a).replace('{AA}', String(a % 100).padStart(2, '0'));
    r = r.replace(/\{(N+)\}/, (m, g) => String(n).padStart(g.length, '0'));
    $('serprev').textContent = r;
  };
  ['sec', 'sef', 'ses', 'sea'].forEach(k => $(k).oninput = prev); prev();
  if (!$('seok')) return;
  $('seok').onclick = async () => {
    const { data: r, error } = await db.rpc('guardar_serie', { p: { id: s.id || null, codigo: $('sec').value.trim(), nombre: $('sen').value.trim(), tipo: $('set').value,
      formato: $('sef').value.trim(), siguiente: +$('ses').value, anio: +$('sea').value, reinicio_anual: $('ser').checked, por_defecto: $('sed').checked,
      ...($('seac') ? { activa: $('seac').checked } : {}) } });
    if (error || (r && r.ok === false)) { toast(r && r.error === 'numero_usado' ? `Ese número ya se ha usado: el último emitido es el ${r.ultimo}` : 'No se ha podido guardar', true); return; }
    $('dlg').close(); toast('Serie guardada'); pintarSeries();
  };
}

/* ---------------- datos fiscales y preferencias de facturación ---------------- */

async function pintarEmpresa() {
  await cargarAjustes();
  const e = AJUSTES.empresa || {}, c = Object.assign({ vencimiento_dias: 15, forma_pago: '', emitir_al_validar: false }, AJUSTES.facturacion || {});
  const f = (k, t, extra) => `<div><label for="em_${k}">${t}</label><input id="em_${k}" value="${esc(e[k] || '')}" ${extra || ''}></div>`;
  $('fcuerpo').innerHTML = `<div class="card" style="padding:16px 18px">
    <h2 style="padding:0 0 8px">Datos fiscales del emisor</h2><p class="sm">Aparecen en cada factura. Las facturas ya emitidas conservan los datos con los que se emitieron.</p>
    <div class="g2">${f('razon_social', 'Razón social')}${f('nif', 'NIF')}</div>
    <div class="g2">${f('direccion', 'Dirección')}${f('cp', 'Código postal')}</div>
    <div class="g2">${f('municipio', 'Población')}${f('provincia', 'Provincia')}</div>
    <div class="g2">${f('telefono', 'Teléfono')}${f('email', 'Email', 'type="email"')}</div>
    <div class="g2">${f('iban', 'IBAN para transferencias')}${f('registro', 'Datos registrales (Registro Mercantil)')}</div>
    <label for="em_pie">Pie de factura</label><textarea id="em_pie" rows="2" placeholder="Condiciones, protección de datos…">${esc(e.pie || '')}</textarea>
    <h2 style="padding:18px 0 8px">Al emitir</h2>
    <div class="g2"><div><label for="fcv">Días hasta el vencimiento</label><input id="fcv" type="number" min="0" value="${+c.vencimiento_dias || 0}"></div>
      <div><label for="fcf">Forma de pago si el pedido no la indica</label><select id="fcf"><option value="">—</option>${(CAT.FORMA_PAGO || []).map(x => `<option ${x.valor === c.forma_pago ? 'selected' : ''}>${esc(x.valor)}</option>`).join('')}</select></div></div>
    <label class="opt" style="margin-top:10px"><input type="checkbox" id="fce" ${c.emitir_al_validar ? 'checked' : ''}>
      <span><b>Emitir la factura automáticamente al validar un pedido</b><br><span class="sm">Si no, se emite a mano desde el pedido con «Emitir factura».</span></span></label>
    <div class="acts" style="justify-content:flex-end"><button class="btn" id="emok">Guardar</button></div></div>`;
  $('emok').onclick = async () => {
    const emp = {}; ['razon_social', 'nif', 'direccion', 'cp', 'municipio', 'provincia', 'telefono', 'email', 'iban', 'registro', 'pie'].forEach(k => emp[k] = $('em_' + k).value.trim());
    emp.pais = e.pais || 'España';
    if (!emp.razon_social || !emp.nif) { toast('La razón social y el NIF son obligatorios', true); return; }
    const [a, b] = await Promise.all([
      db.rpc('guardar_ajuste', { p_clave: 'empresa', p_valor: emp }),
      db.rpc('guardar_ajuste', { p_clave: 'facturacion', p_valor: { vencimiento_dias: +$('fcv').value || 0, forma_pago: $('fcf').value, emitir_al_validar: $('fce').checked } })]);
    if (a.error || b.error) { toast('No se ha podido guardar', true); return; }
    AJUSTES.empresa = emp; toast('Datos guardados');
  };
}

/* ---------------- VeriFactu (solo administración) ---------------- */

async function pintarVerifactu() {
  await cargarAjustes();
  const v = Object.assign({ activo: false, modalidad: 'verifactu', entorno: 'pruebas' }, AJUSTES.verifactu || {});
  const { data: cad } = await RPC_ORIG('verificar_cadena', {});
  $('fcuerpo').innerHTML = `<div class="card" style="padding:16px 18px">
    <div class="manh"><h2 style="padding:0">VeriFactu</h2><span class="pill ${v.activo ? 'p-est' : 'p-anu'}">${v.activo ? 'Activado' : 'Desactivado'}</span></div>
    <p>Sistema de la Ley Antifraude (Real Decreto 1007/2023). Mientras esté desactivado, la app ya prepara cada factura como exige el reglamento, pero no muestra el QR ni la envía a Hacienda.</p>
    <h3>Ya preparado en cada factura</h3>
    <ul class="manlist"><li>✓ Numeración correlativa por serie, sin huecos</li><li>✓ Facturas inalterables: no se pueden modificar ni borrar; se corrigen con rectificativas</li>
      <li>✓ Huella encadenada de cada factura con la anterior (${num((cad || {}).facturas || 0)} facturas · ${(cad || {}).rotas ? `<b style="color:var(--danger)">${num(cad.rotas)} eslabones rotos desde ${esc(cad.primera_rota)}</b>` : 'cadena íntegra'})</li>
      <li>✓ Dirección de verificación para el código QR</li><li>✓ Registro de eventos del sistema (pestaña Registro)</li></ul>
    <h3>Pendiente para el envío a Hacienda</h3>
    <ul class="manlist"><li>🔒 Certificado digital de la empresa y conexión con los servicios de la AEAT. Se configurará cuando se decida activar VeriFactu.</li></ul>
    <h3>Configuración</h3>
    <label class="opt"><input type="checkbox" id="vfa" ${v.activo ? 'checked' : ''}>
      <span><b>Activar VeriFactu</b><br><span class="sm">Las facturas nuevas llevarán el QR y la leyenda «VERI*FACTU» y quedarán pendientes de envío a la AEAT.</span></span></label>
    <div class="g2"><div><label for="vfm">Modalidad</label><select id="vfm"><option value="verifactu" ${v.modalidad === 'verifactu' ? 'selected' : ''}>VeriFactu (envío de cada factura)</option>
        <option value="no_verifactu" ${v.modalidad === 'no_verifactu' ? 'selected' : ''}>No VeriFactu (registro firmado, sin envío)</option></select></div>
      <div><label for="vfe">Entorno</label><select id="vfe"><option value="pruebas" ${v.entorno === 'pruebas' ? 'selected' : ''}>Pruebas de la AEAT</option>
        <option value="produccion" ${v.entorno === 'produccion' ? 'selected' : ''}>Producción</option></select></div></div>
    <div class="acts" style="justify-content:flex-end"><button class="btn" id="vfok">Guardar</button></div></div>`;
  $('vfok').onclick = async () => {
    const nuevo = { activo: $('vfa').checked, modalidad: $('vfm').value, entorno: $('vfe').value };
    if (nuevo.activo !== v.activo && !await preguntar(nuevo.activo
      ? 'Las facturas que se emitan a partir de ahora llevarán el QR y la leyenda VERI*FACTU. El envío a la AEAT necesitará el certificado de la empresa.'
      : 'Las facturas nuevas dejarán de llevar el QR y la leyenda VERI*FACTU. Las ya emitidas no cambian.',
      { titulo: nuevo.activo ? '¿Activar VeriFactu?' : '¿Desactivar VeriFactu?', ok: nuevo.activo ? 'Activar' : 'Desactivar' })) return;
    const { error } = await db.rpc('guardar_ajuste', { p_clave: 'verifactu', p_valor: nuevo });
    if (error) { toast('No se ha podido guardar', true); return; }
    AJUSTES.verifactu = nuevo; toast('Guardado · queda anotado en el registro'); pintarVerifactu();
  };
}

async function pintarRegistro() {
  cargando($('fcuerpo'), 'Cargando el registro…');
  const { data } = await RPC_ORIG('eventos_facturacion_lista', { lim: 200 });
  const l = data || [];
  $('fcuerpo').innerHTML = `<div class="panel"><div class="cuenta">Todo lo que ocurre en la facturación queda anotado: emisiones, rectificaciones, cobros y cambios de configuración.</div>
    <div class="dgrid-wrap"><div class="dgrid evs"><div class="dh"><span>Fecha y hora</span><span>Evento</span><span>Factura</span><span>Persona</span><span>Detalle</span></div>
    ${l.map(e => `<div class="dr" style="cursor:default"><span>${new Date(e.fecha).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}</span><span><b>${esc(e.tipo)}</b></span>
      <span>${esc(e.numero || '—')}</span><span>${esc(e.usuario || '—')}</span><span class="sm mono corta">${esc(JSON.stringify(e.detalle || {}).slice(0, 140))}</span></div>`).join('') || '<div class="vacio">Sin eventos.</div>'}
    </div></div></div>`;
}

/* ---------------- desde el pedido: emitir o ver la factura ---------------- */

async function emitirFacturaPedido(pedidoId) {
  const { data: pd } = await RPC_ORIG('pedido_detalle', { p_id: pedidoId });
  const cli = pd && pd.contacto;
  const aviso = !cli ? '\n\n⚠ El pedido no tiene cliente: la factura saldrá sin destinatario. Para una factura completa, asigna antes un cliente con su NIF.'
    : !cli.nif ? `\n\n⚠ ${cli.nombre} no tiene DNI o CIF en su ficha: conviene añadirlo antes para una factura completa.` : '';
  if (!await preguntar('Se emite la factura con el número siguiente de la serie. Una vez emitida no se puede modificar ni borrar: si hay un error se corrige con una rectificativa.' + aviso,
    { titulo: '¿Emitir la factura?', ok: 'Emitir factura' })) return null;
  const { data: r, error } = await db.rpc('emitir_factura', { p_pedido: pedidoId });
  if (error || (r && r.ok === false)) {
    toast(r && r.error === 'ya_facturado' ? 'Este pedido ya tiene la factura ' + r.numero : r && r.error === 'no_validado' ? 'Solo se facturan pedidos validados' : 'No se ha podido emitir: ' + ((error && error.message) || (r && r.error)), true);
    return null;
  }
  toast('Factura ' + r.numero + ' emitida');
  return r;
}

verPedido = (orig => async function (id) {
  await orig(id);
  if (!VE_TODO() || !$('dlg').open) return;
  const acts = $('dbody').querySelector('.acts:last-of-type'); if (!acts) return;
  const { data } = await RPC_ORIG('pedido_detalle', { p_id: id });
  const p = data && data.pedido; if (!p) return;
  const { data: fs } = await RPC_ORIG('facturas_lista', { q: null, lim: 1000 });
  const fac = (fs || []).filter(f => f.pedido_id === id);
  if (fac.length) {
    acts.insertAdjacentHTML('afterbegin', fac.map(f => `<button class="btn sec" data-pvfac="${f.id}">🧾 ${esc(f.numero)}</button>`).join(''));
    acts.querySelectorAll('[data-pvfac]').forEach(b => b.onclick = () => verFactura(b.dataset.pvfac));
  } else if (p.estado === 'Confirmado' && puedeFacturar()) {
    acts.insertAdjacentHTML('afterbegin', '<button class="btn" id="pvemitir">🧾 Emitir factura</button>');
    $('pvemitir').onclick = async () => { const r = await emitirFacturaPedido(id); if (r) verFactura(r.id); };
  }
})(verPedido);

// Emisión automática al validar, si está configurada
const RPC_V2300 = db.rpc;
db.rpc = function (fn, params, opts) {
  const b = RPC_V2300.call(db, fn, params, opts);
  if (fn !== 'guardar_pedido' || !params || !params.p || params.p.estado === 'Borrador') return b;
  return conCatch(Promise.resolve(b).then(async res => {
    try {
      if (!res.error && res.data && res.data.ok && res.data.estado !== 'Borrador' && (AJUSTES.facturacion || {}).emitir_al_validar && puedeFacturar()) {
        const { data: f } = await RPC_ORIG('emitir_factura', { p_pedido: res.data.id });
        if (f && f.ok) setTimeout(() => toast('Factura ' + f.numero + ' emitida'), 900);
      }
    } catch (e) {}
    return res;
  }));
};

/* ---------------- ayudas ---------------- */

AYUDA.facturacion = ['Facturación', 'Facturas emitidas desde los pedidos, rectificativas y cobros.', [
  'La factura se emite desde un pedido validado (<b>🧾 Emitir factura</b> en el pedido) o sola al validarlo, si está configurado en Datos fiscales.',
  'Cada serie numera de forma correlativa y puede continuar la numeración de tu programa anterior (indica el siguiente número al configurarla).',
  'Una factura emitida no se puede modificar ni borrar. Si hay un error, <b>Rectificar</b> emite una rectificativa en negativo, total o por unidades, y puede anular el pedido para devolver el stock.',
  'Registra los cobros (total o parcial). El estado pasa a Cobrada, Pendiente o Vencida según el vencimiento.',
  '<b>Ver e imprimir</b> abre la factura lista para imprimir o guardar en PDF.',
  'VeriFactu está preparado (huella encadenada, QR y registro de eventos) y se activa solo desde administración.']];
MANUAL.push({ id: 'facturacion', t: 'Facturación', a: 'V', para: 'Facturas desde pedidos validados, rectificativas, cobros, series y VeriFactu.',
  hacer: [[1, 'Ver facturas y cobros (administración y televenta)'], [2, 'Emitir facturas, rectificar y registrar cobros'], [3, 'Configurar series, datos fiscales y VeriFactu (administración)']],
  config: ['Series y numeración', 'Datos fiscales, vencimiento y emisión automática', 'VeriFactu (solo administración)'] });


/* ============================================================
   DLC OS 2.0 · v2.32.0 · Ayudas del horario de rutas y mejoras en móvil
   (mapa con botón de cerrar, «Cerca de mí» paginado, panel lateral
   por encima del mapa y ventanas mejor ajustadas)
   ============================================================ */

/* ---------------- horario de rutas con explicaciones ---------------- */

abrirHorarioPlan = (orig => function () {
  orig();
  const ayuda = {
    hsal: 'A qué hora sales. La primera visita se calcula desde aquí o desde ahora, si esa hora ya ha pasado.',
    htop: 'Hora tope para volver. No se planifican visitas que te hagan volver más tarde; si el día se pasa, se marca en naranja.',
    hvis: 'Lo que dura de media cada visita con un médico, dentro de la consulta.',
    hpar: 'Tiempo extra cada vez que llegas a un sitio nuevo: aparcar, entrar, esperar en recepción. Si ves a varios médicos en el mismo centro, se cuenta una sola vez.'
  };
  Object.entries(ayuda).forEach(([id, t]) => { const i = $(id); if (i && !i.parentElement.querySelector('.ayudah')) i.insertAdjacentHTML('afterend', `<span class="sm ayudah">${esc(t)}</span>`); });
  const fh = $('dbody').querySelector('.fh');
  if (fh && !$('horinfo')) fh.insertAdjacentHTML('afterend', `<p class="sm" id="horinfo">Con estos datos se calculan las horas estimadas de tus rutas, de «Tu día» y del planificador semanal. Los desplazamientos entre visitas se estiman por la distancia.</p>`);
})(abrirHorarioPlan);

/* ---------------- mapa del directorio: botón de cerrar siempre visible ---------------- */

(function () {
  const w = $('mapawrap');
  if (w && !$('mapacerrar')) {
    w.style.position = 'relative';
    w.insertAdjacentHTML('afterbegin', '<button class="mapacerrar" id="mapacerrar" aria-label="Cerrar el mapa">✕ Cerrar mapa</button>');
    $('mapacerrar').onclick = () => { if (MODO_MAPA) $('mapaBtn').click(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  }
})();

/* ---------------- «Cerca de mí» con paginación ---------------- */

function pintarCerca() {
  const l = CERCA.lista, tam = tamPagina(), pag = CERCA.pagina || 0;
  const vista = l.slice(pag * tam, pag * tam + tam);
  $('thead').innerHTML = '';
  $('cuenta').innerHTML = `<b>${num(l.length)}</b> ${l.length === 1 ? 'médico' : 'médicos'} a menos de 10 km de ti
    <button class="kcfg" id="cercacerrar" style="margin-left:10px">Volver a la búsqueda</button>`;
  $('lista').innerHTML = vista.length ? vista.map(m => `<button class="trow" data-id="${m.id}" style="padding:10px 14px;gap:12px">
      <span class="tcell" style="width:70px;min-width:70px"><b style="color:var(--navy)">${m.km} km</b></span>
      <span class="tcell" style="flex:1;width:auto">
        <span class="nm">${m.urgente ? '<span class="pill p-urg">Urgente</span> ' : ''}${esc(m.nombre)}</span>
        <span class="sm">${esc(m.especialidad || '')} · ${esc(m.centro_nombre || '')} ${esc(m.municipio || '')}</span></span>
      <span class="tcell cercaest"><span class="pill p-est">${esc(m.estado_comercial)}</span></span>
    </button>`).join('') : '<div class="vacio">No hay médicos con ubicación a menos de 10 km.</div>';
  $('mas').classList.add('hide');
  $('dirpag').classList.remove('hide');
  paginador($('dirpag'), l.length, pag, p => { CERCA.pagina = p; pintarCerca(); window.scrollTo({ top: 0, behavior: 'smooth' }); },
    () => { CERCA.pagina = 0; pintarCerca(); });
  $('cercacerrar').onclick = () => { CERCA = null; buscar(true); };
}


/* ============================================================
   DLC OS 2.0 · v2.33.0 · Rol «Dirección»
   ============================================================ */

MANUAL.unshift({ id: 'roles', t: 'Roles del equipo', a: null, para: 'Qué ve y qué puede hacer cada rol. Los permisos de cada persona se pueden ajustar en Administración → Usuarios.',
  hacer: [[0, 'Administrador: todo, incluida la gestión de usuarios, permisos, configuración, facturación y VeriFactu'],
    [0, 'Dirección: ve toda la actividad del equipo (agendas, cumplimiento, ventas, facturación, analítica); por defecto consulta sin modificar'],
    [0, 'Televenta: ve toda la base, crea y valida pedidos, da de alta clientes, emite facturas y registra cobros'],
    [0, 'Comercial: su cartera, su agenda y rutas, sus visitas y las ventas y clientes de sus médicos'],
    [0, 'Solo consulta: ve sin modificar lo que le permitan sus permisos']], config: ['Permisos por persona: Administración → Usuarios → Editar'] });


/* ============================================================
   DLC OS 2.0 · v2.34.0 · Permisos por módulo e indicadores, zonas de
   los comerciales, operativa de pedidos, registro de llamadas,
   comisiones con fecha de efecto, varios meses en la agenda y
   «Calidad del dato»
   ============================================================ */

Object.assign(RPC_TTL, { operativa_pendiente: 20, llamadas_lista: 20, llamadas_resumen: 30, calidad_datos: 60, zonas_resumen: 120 });

/* ---------------- permisos nuevos ---------------- */

(function () {
  const i = AREAS.findIndex(a => a[0] === 'V');
  AREAS[i][1] = 'Pedidos (ventas y compras)';
  AREAS.splice(i + 1, 0, ['L', 'Clientes'], ['P', 'Productos y stock'], ['F', 'Facturación'], ['A', 'Analítica'],
    ['E', 'Importes de ventas'], ['Q', 'Calidad del dato']);
})();
const nivelDe2 = a => !PERFIL ? 0 : PERFIL.rol === 'Administrador' ? 3 : +((PERFIL.areas || {})[a] || 0);
const verImportes = () => nivelDe2('E') >= 1;

// Qué permiso abre cada módulo
const MODULO_AREA = { inicio: 'H', agenda: 'G', rutas: 'R', directorio: 'M', pacientes: 'L', productos: 'P', seguimiento: 'Q',
  ventas: 'V', analitica: 'A', facturacion: 'F' };
const puedeModulo = t => {
  if (!PERFIL) return false;
  if (t === 'facturacion' && !VE_TODO()) return false;
  const a = MODULO_AREA[t];
  return !a || nivelDe2(a) >= 1;
};
function aplicarPermisosMenu() {
  document.querySelectorAll('nav.main [data-t]').forEach(b => {
    if (b.dataset.t in MODULO_AREA) b.classList.toggle('hide', !puedeModulo(b.dataset.t));
  });
  if (typeof pintarBnav === 'function') pintarBnav();
}
const irV2330 = ir;
ir = function (t) {
  if (t in MODULO_AREA && !puedeModulo(t)) { toast('No tienes permiso para ese módulo', true); t = puedeModulo('inicio') ? 'inicio' : 'agenda'; }
  irV2330(t);
};
const mostrarAppV2330 = mostrarApp;
mostrarApp = function (perfil) { mostrarAppV2330(perfil); aplicarPermisosMenu(); };

/* ---------------- indicadores con su categoría y permiso ---------------- */

const KPI_CATEGORIA = {
  citas: 'Agenda', citas_7d: 'Agenda', urgentes: 'Cartera', interesados: 'Cartera', sin_contactar: 'Cartera', cartera: 'Cartera',
  sin_visita_60: 'Cartera', sin_horario: 'Calidad del dato', dups: 'Calidad del dato', visitas_sem: 'Actividad', visitas_mes: 'Actividad',
  visitas_7d: 'Actividad', muestras_mes: 'Actividad', material_mes: 'Actividad', uds_mes: 'Ventas (unidades)', prescriptores: 'Ventas (unidades)',
  nuevos_presc: 'Ventas (unidades)', activos_90: 'Ventas (unidades)', conversion: 'Cartera', importe_mes: 'Ventas (importes)', borradores: 'Pedidos'
};
const KPI_PERMISO = { importe_mes: ['E', 1], borradores: ['V', 1], dups: ['Q', 1], sin_horario: ['M', 1] };
function kpiPermitido(c) {
  if (!c) return false;
  if (c.admin && PERFIL.rol !== 'Administrador') return false;
  const r = KPI_PERMISO[c.id];
  return !r || nivelDe2(r[0]) >= r[1];
}

/* ---------------- zonas de cada comercial ---------------- */

let PROV_CCAA = null;
async function bloqueZonas(u) {
  if (!PROV_CCAA) {
    const [{ data: pc }, { data: rz }] = await Promise.all([db.from('provincias_ccaa').select('provincia,comunidad'), db.rpc('zonas_resumen')]);
    const cuenta = {}; (rz || []).forEach(x => cuenta[x.provincia] = x.medicos);
    PROV_CCAA = {};
    (pc || []).forEach(x => (PROV_CCAA[x.comunidad] = PROV_CCAA[x.comunidad] || []).push({ p: x.provincia, n: cuenta[x.provincia] || 0 }));
  }
  const { data: yo } = await db.from('perfiles').select('zonas').eq('id', u.id).single();
  const sel = new Set((yo && yo.zonas) || []);
  const bonito = p => p.charAt(0) + p.slice(1).toLowerCase();
  return `<div class="blk" id="uzonas"><h3>Zona de trabajo</h3>
    <p class="sm">Marca las provincias de su zona. Al guardar, los médicos de esas provincias que no tengan comercial entran en su cartera, y los que se den de alta después entran solos. Solo verá los médicos de su cartera.</p>
    <div class="zonas">${Object.keys(PROV_CCAA).sort().map(cc => {
      const ps = PROV_CCAA[cc].filter((x, i, a) => a.findIndex(y => y.n === x.n && bonito(y.p).slice(0, 4) === bonito(x.p).slice(0, 4)) === i || x.n);
      return `<details ${ps.some(x => sel.has(x.p)) ? 'open' : ''}><summary><label onclick="event.stopPropagation()"><input type="checkbox" data-zcc="${esc(cc)}" ${ps.every(x => sel.has(x.p)) ? 'checked' : ''}> ${esc(cc)}</label>
        <span class="sm">${num(ps.reduce((n, x) => n + x.n, 0))} médicos</span></summary>
        <div class="zprov">${ps.map(x => `<label><input type="checkbox" data-zp="${esc(x.p)}" data-zpc="${esc(cc)}" ${sel.has(x.p) ? 'checked' : ''}> ${esc(bonito(x.p))} <span class="sm">${num(x.n)}</span></label>`).join('')}</div></details>`;
    }).join('')}</div>
    <div class="acts" style="margin-top:8px"><button class="btn sec" id="uzok">Guardar zona y asignar sus médicos</button></div></div>`;
}

editarUsuario = (orig => async function (id) {
  await orig(id);
  const u = (USUARIOS || []).find(x => x.id === id);
  if (!u || !$('dlg').open) return;
  // Comisión: desde cuándo se aplica el esquema (el selector se pinta un momento después)
  for (let i = 0; i < 30 && !$('ucom') && $('dlg').open; i++) await new Promise(r => setTimeout(r, 100));
  const ucom = $('ucom');
  if (ucom && !$('ucdesde')) {
    ucom.dataset.orig = ucom.value;
    ucom.closest('.g2').insertAdjacentHTML('afterend', `<div class="g2" id="ucdesde">
      <div><label class="sm" for="ucdm">Se aplica</label><select id="ucdm">
        <option value="hoy">A partir de hoy</option><option value="todo">A todo su histórico (hacia atrás)</option><option value="fecha">A partir de una fecha concreta</option></select></div>
      <div><label class="sm" for="ucdf">Fecha</label><input id="ucdf" type="date" value="${hoyISO()}" disabled></div></div>
      <div class="sm" id="uchist"></div>`);
    $('ucdm').onchange = () => { $('ucdf').disabled = $('ucdm').value !== 'fecha'; };
    const { data: h } = await RPC_ORIG('historial_esquemas', { p_usuario: id });
    if ((h || []).length && $('uchist')) $('uchist').innerHTML = 'Historial: ' + h.map(x => `${esc(x.esquema)} desde ${fechaCorta(x.desde)}${x.hasta ? ' hasta ' + fechaCorta(x.hasta) : ''}`).join(' · ');
  }
  // Zona, solo para comerciales
  if (u.rol === 'Comercial' && !$('uzonas')) {
    const html = await bloqueZonas(u);
    const ref = $('ucomzona') || $('dbody').querySelector('.acts:last-of-type');
    if (ref && $('dlg').open) ref.insertAdjacentHTML('beforebegin', html);
    $('dbody').querySelectorAll('[data-zcc]').forEach(c => c.onchange = () =>
      $('dbody').querySelectorAll(`[data-zpc="${CSS.escape(c.dataset.zcc)}"]`).forEach(x => x.checked = c.checked));
    if ($('uzok')) $('uzok').onclick = async ev => {
      const zonas = [...$('dbody').querySelectorAll('[data-zp]:checked')].map(x => x.dataset.zp);
      ev.target.disabled = true;
      const { data: r, error } = await db.rpc('asignar_zona', { p_usuario: id, p_zonas: zonas });
      ev.target.disabled = false;
      if (error || (r && r.ok === false)) { toast('No se ha podido guardar la zona', true); return; }
      toast(`Zona guardada · ${num(r.asignados)} médicos nuevos en su cartera${r.en_otra_cartera ? ` · ${num(r.en_otra_cartera)} de su zona están en otra cartera` : ''}`);
    };
  }
})(editarUsuario);

/* ---------------- operativa de los pedidos ---------------- */

const OPS = [['pago', 'Pago recibido', 'pago_estado', '💳'], ['paquete', 'Paquete preparado', 'paquete_en', '📦'],
  ['email_factura', 'Email con la factura enviado', 'email_factura_en', '🧾'], ['email_pago', 'Email con los datos de pago enviado', 'email_pago_en', '✉️']];
const opHecho = (p, k) => k === 'pago' ? p.pago_estado === 'Cobrado' : !!p[OPS.find(o => o[0] === k)[2]];

function textoEmailPago(p, total, cliente) {
  const e = AJUSTES.empresa || {};
  return `Hola${cliente ? ' ' + String(cliente).split(' ')[0] : ''}:\n\nGracias por tu pedido${p.numero ? ' ' + p.numero : ''}. Para completarlo, haz una transferencia con estos datos:\n\n` +
    `Importe: ${eurI(total || 0)}\nBeneficiario: ${e.razon_social || nombreApp()}\nIBAN: ${e.iban || '(añade el IBAN en Facturación → Datos fiscales)'}\nConcepto: ${p.numero || 'Pedido'} ${cliente || ''}\n\n` +
    `En cuanto recibamos el pago preparamos el envío.\n\nUn saludo,\n${e.razon_social || nombreApp()}${e.telefono ? '\n' + e.telefono : ''}`;
}

verPedido = (orig => async function (id) {
  await orig(id);
  if (!$('dlg').open || !(VE_TODO() || PERFIL.rol === 'Administrador')) return;
  const { data } = await RPC_ORIG('pedido_detalle', { p_id: id });
  const p = data && data.pedido; if (!p || p.estado !== 'Confirmado' || $('pdops')) return;
  await cargarAjustes();
  const cli = data.contacto || {}, total = +((data.totales || {}).total || 0);
  const puede = VE_TODO() && nivelDe2('V') >= 2;
  const acts = $('dbody').querySelector('.acts:last-of-type');
  acts.insertAdjacentHTML('beforebegin', `<div class="blk" id="pdops"><h3>Operativa</h3>
    ${OPS.map(([k, t]) => `<label class="opchk ${opHecho(p, k) ? 'on' : ''}"><input type="checkbox" data-op="${k}" ${opHecho(p, k) ? 'checked' : ''} ${puede ? '' : 'disabled'}>
      <span>${esc(t)}${k === 'pago' && p.forma_pago ? ` <span class="sm">· ${esc(p.forma_pago)}${/reembolso/i.test(p.forma_pago) ? ' (se cobra al entregar)' : ''}</span>` : ''}</span></label>`).join('')}
    <div class="acts" style="margin:6px 0 0">
      ${cli.email ? `<a class="btn sec" id="pdmailpago" data-ped="${id}" href="mailto:${esc(cli.email)}?subject=${encodeURIComponent('Datos para el pago de tu pedido ' + (p.numero || ''))}&body=${encodeURIComponent(textoEmailPago(p, total, cli.nombre))}">✉️ Preparar email con los datos de pago</a>` : '<span class="sm">El cliente no tiene email en su ficha.</span>'}
    </div></div>`);
  $('dbody').querySelectorAll('[data-op]').forEach(c => c.onchange = async () => {
    const { data: r, error } = await db.rpc('marcar_operativa', { p_pedido: id, p_campo: c.dataset.op, p_hecho: c.checked });
    if (error || (r && r.ok === false)) { c.checked = !c.checked; toast('No se ha podido guardar', true); return; }
    c.closest('.opchk').classList.toggle('on', c.checked);
    toast(c.checked ? (c.dataset.op === 'pago' ? 'Pago validado' + (p.factura_id ? ' · cobro anotado en la factura' : '') : 'Hecho') : 'Desmarcado');
    if (TAB === 'ventas' && PEDSEC === 'ventas') pintarOperativa();
  });
  if ($('pdmailpago')) $('pdmailpago').addEventListener('click', () => setTimeout(async () => {
    if (await preguntar('¿Has enviado el email con los datos de pago?', { titulo: 'Email de pago', ok: 'Sí, marcar como enviado' })) {
      await db.rpc('marcar_operativa', { p_pedido: id, p_campo: 'email_pago', p_hecho: true }); verPedido(id);
    }
  }, 800));
})(verPedido);

async function pintarOperativa() {
  let c = $('operativa');
  if (!c) { const ref = $('vcuerpo'); if (!ref) return; ref.insertAdjacentHTML('beforebegin', '<div class="card" id="operativa"></div>'); c = $('operativa'); }
  const { data } = await RPC_ORIG('operativa_pendiente', {});
  const d = data || {};
  const tot = ['pago', 'paquete', 'email_factura', 'email_pago'].reduce((n, k) => n + (d[k] || []).length, 0);
  if (!$('operativa')) return;
  c.innerHTML = `<h2>Por hacer en los pedidos<span class="n">${tot}</span></h2>
    ${tot ? `<div class="opgrid">${[['pago', '💳 Pagos por validar'], ['paquete', '📦 Paquetes por preparar'], ['email_factura', '🧾 Facturas por enviar'], ['email_pago', '✉️ Datos de pago por enviar']].map(([k, t]) =>
      `<details class="opcol"><summary><b>${num((d[k] || []).length)}</b> ${t}</summary>
        <div class="lista">${(d[k] || []).slice(0, 30).map(p => `<button class="item" data-opped="${p.id}" style="padding:6px 8px"><span class="tx"><b>${esc(p.cliente)}</b>
          <span class="sm">${esc(p.numero || 'Sin número')} · ${fechaCorta(p.fecha)}${verImportes() ? ' · ' + eurI(p.total || 0) : ''}${p.forma_pago ? ' · ' + esc(p.forma_pago) : ''}</span></span></button>`).join('') || '<div class="sm" style="padding:6px">Nada pendiente</div>'}</div></details>`).join('')}</div>`
      : '<div class="vacio" style="padding:10px 16px">Todo al día: pagos validados, paquetes preparados y emails enviados.</div>'}`;
  c.querySelectorAll('[data-opped]').forEach(b => b.onclick = () => verPedido(b.dataset.opped));
}

/* ---------------- Pedidos: pestaña «Llamadas» ---------------- */

cargarVentas = (orig => async function () {
  if (PEDSEC === 'llamadas' && !VE_TODO()) PEDSEC = 'ventas';
  const sec = PEDSEC;
  if (sec === 'llamadas') PEDSEC = 'compras';     // la base pinta la cabecera; luego se sustituye
  await orig();
  PEDSEC = sec;
  const sub = $('pedsub');
  if (sub && VE_TODO() && !sub.querySelector('[data-pedsec="llamadas"]')) {
    sub.insertAdjacentHTML('beforeend', `<button data-pedsec="llamadas" aria-pressed="${PEDSEC === 'llamadas'}">Llamadas</button>`);
    sub.querySelector('[data-pedsec="llamadas"]').onclick = () => { PEDSEC = 'llamadas'; cargarVentas(); };
  }
  if (sub) sub.querySelectorAll('[data-pedsec]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.pedsec === PEDSEC)));
  if (PEDSEC === 'ventas' && VE_TODO()) pintarOperativa();
  if (PEDSEC === 'llamadas') {
    const acts = $('v-ventas').querySelector('.saludo .acts');
    acts.innerHTML = '<button class="btn" id="llnueva">+ Registrar llamada</button>';
    $('llnueva').onclick = () => editorLlamada(null);
    pintarLlamadas();
  }
})(cargarVentas);

async function catLlamadas() {
  for (const k of ['MOTIVO_LLAMADA', 'RESULTADO_LLAMADA']) {
    if (!(CAT[k] || []).length) { const { data } = await db.rpc('catalogo', { p_clave: k }); CAT[k] = data || []; }
  }
}
async function pintarLlamadas() {
  await catLlamadas();
  $('vcuerpo').innerHTML = `<div class="panel">
    <div class="filtros"><div id="llper"></div>
      <div><label for="llq">Buscar</label><input id="llq" type="search" placeholder="Nombre, teléfono o médico"></div>
      <div><label for="llres">Resultado</label><select id="llres"><option value="">Todos</option>${(CAT.RESULTADO_LLAMADA || []).map(x => `<option>${esc(x.valor)}</option>`).join('')}</select></div></div>
    <div class="kpis vtot" id="lltot"></div>
    <div class="angrid" id="llres2" style="margin:0 0 14px"></div>
    <div id="lllista"></div></div>`;
  let tq;
  const pinta = async () => {
    const r = $('llper').__rango();
    const [{ data: l }, { data: s }] = await Promise.all([
      db.rpc('llamadas_lista', { p_desde: r.desde, p_hasta: r.hasta, q: $('llq').value.trim() || null, p_resultado: $('llres').value || null }),
      db.rpc('llamadas_resumen', { p_desde: r.desde, p_hasta: r.hasta })]);
    if (!$('lllista')) return;
    const res = s || {}, lista = l || [];
    $('lltot').innerHTML = `<div class="kpi"><b>${num(res.total || 0)}</b><span>Llamadas</span></div>
      <div class="kpi"><b>${num(res.con_pedido || 0)}</b><span>Acaban en pedido</span></div>
      <div class="kpi"><b>${res.total ? Math.round(res.con_pedido / res.total * 100) + '%' : '—'}</b><span>Conversión</span></div>`;
    $('llres2').innerHTML = `<div class="card ancard"><h2>Cómo terminan</h2>${(res.por_resultado || []).length ? barrasH(res.por_resultado.map(x => ({ n: x.resultado, v: x.n })), num) : vacioGrafico('Registra llamadas para ver cómo terminan.')}
        <p class="leer"><b>Cómo leerlo:</b> si pesan «El precio no le convence» o «Solo quería información», conviene revisar el argumentario o las condiciones.</p></div>
      <div class="card ancard"><h2>De qué médico vienen</h2>${(res.por_medico || []).length ? `<div class="barrash">${res.por_medico.map((x, i) => `<div class="bh"><span class="bhn">${i + 1}. ${esc(x.medico)}</span>
          <span class="bhb"><i style="width:${Math.max(3, x.n / res.por_medico[0].n * 100)}%"></i></span><b>${num(x.pedidos)}/${num(x.n)}</b></div>`).join('')}</div>` : vacioGrafico('Verás qué médicos generan llamadas y cuántas acaban en pedido.')}
        <p class="leer"><b>Cómo leerlo:</b> pedidos sobre llamadas por médico. Un médico con muchas llamadas y pocos pedidos es una oportunidad de seguimiento.</p></div>`;
    const tamL = tamPagina(); LLPAG = Math.min(LLPAG, Math.max(0, Math.ceil(lista.length / tamL) - 1));
    const lvis = lista.slice(LLPAG * tamL, LLPAG * tamL + tamL);
    $('lllista').innerHTML = lista.length ? `<div class="dgrid-wrap"><div class="dgrid llam">
      <div class="dh"><span>Fecha</span><span>Quién llama</span><span>Médico</span><span>Motivo</span><span>Resultado</span><span>Próximo paso</span><span>Atendió</span></div>
      ${lvis.map(x => `<button class="dr" data-ll="${x.id}"><span>${new Date(x.fecha).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}<span class="sm">${esc(x.direccion || '')}</span></span>
        <span><b>${esc(x.nombre || x.cliente || '—')}</b><span class="sm">${esc(x.telefono || '')}</span></span><span class="corta">${esc(x.medico || x.medico_texto || '—')}</span>
        <span class="sm">${esc(x.motivo || '—')}</span><span>${esc(x.resultado || '—')}${x.pedido ? `<span class="sm">Pedido ${esc(x.pedido)}</span>` : ''}</span>
        <span class="sm">${x.proxima_fecha ? fechaCorta(x.proxima_fecha) + ' · ' : ''}${esc(x.proxima_accion || '')}</span><span class="sm">${esc(x.usuario || '')}</span></button>`).join('')}</div></div>`
      : '<div class="vacio">Sin llamadas en este periodo. Regístralas con «+ Registrar llamada», aunque no acaben en pedido: así se puede analizar por qué.</div>';
    $('lllista').querySelectorAll('[data-ll]').forEach(b => b.onclick = () => editorLlamada(lista.find(x => x.id === b.dataset.ll)));
    $('lllista').insertAdjacentHTML('beforeend', '<div id="llpag"></div>');
    paginador($('llpag'), lista.length, LLPAG, p => { LLPAG = p; pinta(); }, () => { LLPAG = 0; pinta(); });
  };
  montarPeriodo($('llper'), { id: 'llamadas', valor: 'mes', alCambiar: pinta });
  $('llq').oninput = () => { clearTimeout(tq); tq = setTimeout(pinta, 300); };
  $('llres').onchange = pinta;
  pinta();
}

async function editorLlamada(l) {
  await catLlamadas();
  l = l || { direccion: 'Entrante', fecha: new Date().toISOString() };
  let medico = l.medico_id ? { id: l.medico_id, nombre: l.medico } : null;
  const f = new Date(l.fecha), local = new Date(f.getTime() - f.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const opts = (cat, v) => `<option value=""></option>${(CAT[cat] || []).map(x => `<option ${x.valor === v ? 'selected' : ''}>${esc(x.valor)}</option>`).join('')}`;
  $('dbody').innerHTML = `
    <div class="fh"><div><h2>${l.id ? 'Llamada' : 'Registrar llamada'}</h2><div class="sm">Aunque no acabe en pedido: sirve para medir por qué no se convierte</div></div>
      <button class="x" data-cerrar aria-label="Cerrar">✕</button></div>
    <div class="g2"><div><label for="llf">Fecha y hora</label><input id="llf" type="datetime-local" value="${local}"></div>
      <div><label for="lld">Tipo</label><select id="lld"><option ${l.direccion === 'Entrante' ? 'selected' : ''}>Entrante</option><option ${l.direccion === 'Saliente' ? 'selected' : ''}>Saliente</option></select></div></div>
    <div class="g2"><div><label for="lln">Nombre de quien llama</label><input id="lln" value="${esc(l.nombre || '')}" placeholder="Paciente o persona interesada"></div>
      <div><label for="llt">Teléfono</label><input id="llt" value="${esc(l.telefono || '')}" inputmode="tel"></div></div>
    <label>Médico que lo recomienda</label><div id="llmed"></div>
    <div class="g2"><div><label for="llm">Motivo</label><select id="llm">${opts('MOTIVO_LLAMADA', l.motivo)}</select></div>
      <div><label for="llr">Resultado</label><select id="llr">${opts('RESULTADO_LLAMADA', l.resultado)}</select></div></div>
    <div class="g2"><div><label for="llpa">Próximo paso</label><input id="llpa" value="${esc(l.proxima_accion || '')}" placeholder="p. ej. Llamar cuando cobre"></div>
      <div><label for="llpf">Fecha del próximo paso</label><input id="llpf" type="date" value="${esc(l.proxima_fecha || '')}"></div></div>
    <label for="llno">Nota</label><textarea id="llno" rows="2">${esc(l.nota || '')}</textarea>
    <div class="acts" style="justify-content:flex-end"><button class="btn sec" data-cerrar>Cancelar</button>
      ${!l.id ? '<button class="btn sec" id="llped">Guardar y crear pedido</button>' : ''}<button class="btn" id="llok">Guardar</button></div>`;
  $('dlg').showModal();
  $('llmed').__texto = medico ? '' : (l.medico_texto || '');
  selectorMedico($('llmed'), { valor: medico, placeholder: 'Nombre, código, centro o municipio', alElegir: m => { medico = m; } });
  const guardar = async () => {
    const { data: r, error } = await db.rpc('guardar_llamada', { p: { id: l.id || null, fecha: new Date($('llf').value).toISOString(), direccion: $('lld').value,
      nombre: $('lln').value.trim(), telefono: $('llt').value.trim(), medico_id: medico ? medico.id : null,
      medico_texto: medico ? '' : ($('llmed').__texto || '').trim(), motivo: $('llm').value, resultado: $('llr').value,
      proxima_accion: $('llpa').value.trim(), proxima_fecha: $('llpf').value, nota: $('llno').value.trim(), pedido_id: l.pedido_id || null } });
    if (error || (r && r.ok === false)) { toast('No se ha podido guardar', true); return null; }
    return r.id;
  };
  $('llok').onclick = async () => { if (await guardar()) { $('dlg').close(); toast('Llamada registrada'); if (TAB === 'ventas' && PEDSEC === 'llamadas') pintarLlamadas(); } };
  if ($('llped')) $('llped').onclick = async () => {
    if (!$('llr').value) $('llr').value = 'Pedido hecho';
    const lid = await guardar(); if (!lid) return;
    $('dlg').close(); toast('Llamada registrada · crea ahora el pedido');
    PEDSEC = 'ventas'; ir('ventas'); setTimeout(() => $('pednuevo') && $('pednuevo').click(), 900);
  };
}

/* ---------------- Inicio: operativa pendiente para televenta y administración ---------------- */

pintarInicio = (orig => async function () {
  await orig();
  if (TAB !== 'inicio' || !$('iniextra') || !(VE_TODO() && nivelDe2('V') >= 1)) return;
  const { data } = await RPC_ORIG('operativa_pendiente', {});
  const d = data || {}, n = k => (d[k] || []).length;
  if (!(n('pago') + n('paquete') + n('email_factura') + n('email_pago')) || $('iniops')) return;
  $('iniextra').insertAdjacentHTML('afterbegin', `<div class="card" id="iniops"><h2>Operativa de pedidos</h2>
    <div class="minis"><div><b style="${n('pago') ? 'color:var(--warn)' : ''}">${num(n('pago'))}</b><span>pagos por validar</span></div>
      <div><b>${num(n('paquete'))}</b><span>paquetes por preparar</span></div>
      <div><b>${num(n('email_factura') + n('email_pago'))}</b><span>emails por enviar</span></div></div>
    <div class="acts" style="padding:0 16px 14px"><button class="btn sec" id="iniopsver">Ver en Pedidos</button></div></div>`);
  $('iniopsver').onclick = () => { PEDSEC = 'ventas'; ir('ventas'); };
})(pintarInicio);

/* ---------------- Agenda: ver varios meses ---------------- */

let AG_MESES = 1;
cargarAgenda = (orig => async function () {
  await orig();
  if (TAB !== 'agenda' || AG_MODO !== 'mes') return;
  const acts = $('v-agenda').querySelector('.saludo .acts');
  if (acts && !$('agmeses')) {
    acts.insertAdjacentHTML('beforeend', `<select id="agmeses" aria-label="Meses a la vista" title="Meses a la vista">
      ${[1, 2, 3, 6].map(n => `<option value="${n}" ${AG_MESES === n ? 'selected' : ''}>${n} ${n === 1 ? 'mes' : 'meses'}</option>`).join('')}</select>`);
    $('agmeses').onchange = e => { AG_MESES = +e.target.value; cargarAgenda(); };
  }
  if (AG_MESES <= 1) return;
  const base = AG_FECHA.slice(0, 7), bloques = [];
  for (let i = 0; i < AG_MESES; i++) {
    const d = new Date(base + '-01T12:00:00'); d.setMonth(d.getMonth() + i);
    await pintarMesAgenda(fechaLocal(d).slice(0, 7));
    const w = document.createElement('div'); w.className = 'mesbloque';
    while ($('agcuerpo').firstChild) w.appendChild($('agcuerpo').firstChild);
    bloques.push(w);
  }
  bloques.forEach(w => $('agcuerpo').appendChild(w));
  $('agcuerpo').classList.add('varios');
  const fin = new Date(base + '-01T12:00:00'); fin.setMonth(fin.getMonth() + AG_MESES - 1);
  $('agtit').textContent = periodoTxt(base) + ' – ' + periodoTxt(fechaLocal(fin).slice(0, 7));
})(cargarAgenda);

/* ---------------- «Seguimiento» pasa a «Calidad del dato» ---------------- */

document.querySelectorAll('[data-t="seguimiento"]').forEach(b => { if (b.closest('nav.main')) b.textContent = 'Calidad del dato'; });
cargarSeguimiento = (orig => async function () {
  await orig();
  const v = $('v-seguimiento');
  v.querySelector('.saludo h1').firstChild.textContent = 'Calidad del dato';
  v.querySelector('.saludo .fecha').textContent = 'Fichas completas, datos que faltan y avance de cada médico';
  const { data: q } = await RPC_ORIG('calidad_datos', {});
  if (!q || $('calidad')) return;
  const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
  const item = (n, t, h) => `<div class="kpi ${n ? 'warn' : 'ok'}"><button class="ai" data-ayuda-txt="${esc(h)}" data-ayuda-tit="${esc(t)}" aria-label="Qué es">i</button><b>${num(n)}</b><span>${esc(t)}</span></div>`;
  v.querySelector('.saludo').insertAdjacentHTML('afterend', `<div class="card" id="calidad" style="padding-bottom:6px">
    <div class="manh" style="padding:14px 16px 0"><h2 style="padding:0">Fichas completas: ${pct(q.completas, q.total)}%</h2><span class="sm">${num(q.completas)} de ${num(q.total)} médicos</span></div>
    <div class="barra" style="margin:8px 16px 10px"><i style="width:${pct(q.completas, q.total)}%"></i></div>
    <div class="kpis" style="padding:0 16px 10px">
      ${item(q.sin_ubicacion, 'sin ubicación', 'Sin coordenadas en ninguna consulta: no entran en rutas ni en el mapa.')}
      ${item(q.sin_horario, 'sin horario de consulta', 'Sin días ni horas de consulta: las rutas no pueden ajustarse a su horario.')}
      ${item(q.sin_especialidad, 'sin especialidad', 'Sin especialidad en la ficha: no se pueden filtrar ni analizar por especialidad.')}
      ${item(q.sin_contacto, 'sin teléfono ni email', 'No hay forma de contactar con ellos fuera de la visita.')}
      ${item(q.sin_provincia, 'sin provincia', 'Sin provincia no se pueden asignar por zona a un comercial.')}
      ${item(q.sin_comercial, 'sin comercial', 'Médicos que no están en ninguna cartera.')}
      ${item(q.duplicados, 'pendientes de unificar', 'Fichas marcadas como posibles duplicados.')}
    </div>
    <p class="sm" style="padding:0 16px 10px">Una ficha completa tiene ubicación, horario, especialidad y teléfono o email. Debajo, el avance de cada médico.</p></div>`);
})(cargarSeguimiento);

/* ---------------- ayudas y manual ---------------- */

AYUDA.seguimiento = ['Calidad del dato', 'Qué parte de la base está completa y qué falta, y el avance comercial de cada médico.', [
  'Arriba, el porcentaje de fichas completas y cuántas fichas no tienen ubicación, horario, especialidad, contacto, provincia o comercial.',
  'Debajo, cada médico con su estado, visitas y próxima acción, con filtros para localizar los atrasados.']];
MANUAL.forEach(s => {
  if (s.id === 'ventas') s.hacer.push([1, 'Operativa de cada pedido: pago recibido, paquete preparado y emails enviados (televenta)'], [1, 'Registro de llamadas de televenta, con motivo, resultado y médico del que viene']);
  if (s.id === 'admin') s.hacer.push([3, 'Zona de cada comercial por provincias; los médicos nuevos de su zona entran solos en su cartera'], [3, 'Esquema de comisión con fecha de efecto: hoy, todo el histórico o una fecha concreta']);
});
MANUAL.push({ id: 'permisos', t: 'Permisos por módulo', a: null, para: 'Cada módulo se abre con su permiso; si no lo tienes, no aparece en el menú.',
  hacer: [[0, 'Clientes, Productos y stock, Facturación, Analítica y Calidad del dato tienen su propio permiso'],
    [0, '«Importes de ventas» decide si se ven euros o solo unidades en Inicio, Analítica y listados']], config: ['Administración → Usuarios → Editar'] });


/* ============================================================
   DLC OS 2.0 · v2.35.0 · Pedidos paginados y guardados en el dispositivo,
   factura en PDF como la de Holded y envío por email con el PDF adjunto,
   manual renovado y punto de salida sin valor por defecto
   ============================================================ */

Object.assign(RPC_TTL, { pedidos_pagina: 30 });

/* ---------------- punto de salida: cada persona configura el suyo ---------------- */

function avisoSinSalida(el) {
  if (prefsActivas().salida || !el || el.querySelector('.sinsalida')) return;
  el.insertAdjacentHTML('afterbegin', `<div class="avisoh sinsalida"><span>📍 <b>Aún no has configurado tu punto de salida.</b> Las horas se calculan desde la primera visita, sin el desplazamiento inicial.</span>
    <button class="btn sec" data-irprefs>Configurarlo</button></div>`);
}
document.addEventListener('click', e => { if (e.target.closest('[data-irprefs]')) { CFG_SEC = 'prefs'; ir('config'); } });

/* ---------------- Pedidos → Ventas: por páginas y guardado en el dispositivo ---------------- */

let PEDPAG = 0;
async function listaPedidos() {
  if (!$('pedlista') || !$('pper') || !$('pcanal')) return;
  const r = $('pper').__rango();
  if (!$('popf') && $('pestado')) {
    $('pestado').closest('div').insertAdjacentHTML('afterend', `<div><label for="popf">Operativa</label><select id="popf">
      <option value="">Todo</option><option value="pago">Pago por validar</option><option value="paquete">Paquete por preparar</option><option value="email">Factura por enviar</option></select></div>`);
    $('popf').onchange = () => { PEDPAG = 0; listaPedidos(); };
  }
  const params = { p_desde: r.desde, p_hasta: r.hasta, p_canal: $('pcanal').value || null, q: ($('pq') && $('pq').value.trim()) || null,
    p_estado: $('pestado').value || null, p_operativa: ($('popf') && $('popf').value) || null, lim: tamPagina(), desplaz: PEDPAG * tamPagina() };
  const clave = 'pedidos-' + JSON.stringify(params);
  if (!$('pedlista').querySelector('.dgrid')) cargando($('pedlista'), 'Cargando pedidos…');
  const res = await rpcCache('pedidos_pagina', params, clave);
  if (!$('pedlista') || !$('pestado')) return;
  if (!res.data) { $('pedlista').innerHTML = `<div class="vacio">No se ha podido cargar${res.error ? ': ' + esc(res.error.message) : ''}.</div>`; return; }
  const d = res.data, s = d.resumen || {}, imp = verImportes();
  PEDIDOS = d.filas || [];
  $('ptotales').innerHTML = `
    <div class="kpi"><b>${num(s.pedidos || 0)}</b><span>Pedidos validados${s.borradores ? ` · ${s.borradores} en borrador` : ''}</span></div>
    <div class="kpi"><b>${num(s.unidades || 0)}</b><span>Unidades</span></div>
    ${imp ? `<div class="kpi"><b>${eurI(s.base || 0)}</b><span>Base sin IVA</span></div>
    <div class="kpi"><b>${eurI(s.iva || 0)}</b><span>IVA</span></div>
    <div class="kpi ok"><b>${eurI(s.total || 0)}</b><span>Total con IVA</span></div>` : ''}`;
  const ico = p => p.estado !== 'Confirmado' ? '' : `<span class="opico" title="Pago ${p.pago_estado === 'Cobrado' ? 'recibido' : 'pendiente'} · Paquete ${p.paquete_en ? 'preparado' : 'por preparar'}${p.factura ? ' · Factura ' + (p.email_factura_en ? 'enviada' : 'por enviar') : ''}">
      <i class="${p.pago_estado === 'Cobrado' ? 'ok' : 'no'}">💳</i><i class="${p.paquete_en ? 'ok' : 'no'}">📦</i>${p.factura ? `<i class="${p.email_factura_en ? 'ok' : 'no'}">🧾</i>` : ''}</span>`;
  $('pedlista').innerHTML = PEDIDOS.length ? `<div class="dgrid-wrap"><div class="dgrid peds2 ${imp ? '' : 'sinimp'}">
    <div class="dh"><span>Fecha</span><span>Cliente</span><span>Médico</span><span>Comercial</span><span>Productos</span>
      <span class="num">Uds.</span>${imp ? '<span class="num">Base</span><span class="num">Total</span>' : ''}<span>Estado</span><span>Operativa</span></div>
    ${PEDIDOS.map(p => `<button class="dr" data-ped="${p.id}" style="${p.estado === 'Anulado' ? 'opacity:.55' : ''}">
      <span>${fechaCorta(p.fecha)}${p.factura || p.numero ? `<span class="sm">${esc(p.factura || p.numero)}</span>` : ''}</span>
      <span><b>${esc(p.contacto || p.centro || p.medico_texto || '—')}</b><span class="sm">${p.canal === 'centro' ? 'Venta a centro' : 'Recomendación'}${p.forma_pago ? ' · ' + esc(p.forma_pago) : ''}</span></span>
      <span class="corta">${p.medico ? esc(p.medico) : '<span class="vac">Sin atribuir</span>'}</span>
      <span>${p.comercial ? esc(p.comercial) : '<span class="vac">—</span>'}</span>
      <span class="sm corta">${esc(p.productos || '')}</span><span class="num">${num(p.unidades)}</span>
      ${imp ? `<span class="num">${eurI(p.base)}</span><span class="num"><b>${eurI(p.total)}</b></span>` : ''}
      <span>${pillEstado(p.estado)}</span><span>${ico(p)}</span></button>`).join('')}
  </div></div>` : '<div class="vacio">No hay pedidos con estos filtros.</div>';
  if (!$('pedpag')) $('pedlista').insertAdjacentHTML('afterend', '<div id="pedpag"></div>');
  paginador($('pedpag'), d.total, PEDPAG, p => { PEDPAG = p; listaPedidos(); $('pedlista').scrollIntoView({ block: 'start' }); }, () => { PEDPAG = 0; listaPedidos(); });
  if (res.cache) avisoCache($('pedlista'), res.fecha);
  $('pedlista').querySelectorAll('[data-ped]').forEach(b => b.onclick = () => verPedido(b.dataset.ped));
}
// Cualquier cambio de filtro vuelve a la primera página
document.addEventListener('change', e => { if (e.target.closest('#pper, #pcanal, #pestado')) PEDPAG = 0; }, true);
document.addEventListener('input', e => { if (e.target.id === 'pq') PEDPAG = 0; }, true);

/* ---------------- paginación también en facturas y llamadas ---------------- */

function paginarRejilla(cont, filas, pagKey, pintaFila, cabecera, clase) {
  const tam = tamPagina(), pag = Math.min(window[pagKey] || 0, Math.max(0, Math.ceil(filas.length / tam) - 1));
  window[pagKey] = pag;
  cont.innerHTML = `<div class="dgrid-wrap"><div class="dgrid ${clase}">${cabecera}${filas.slice(pag * tam, pag * tam + tam).map(pintaFila).join('')}</div></div><div class="pagz"></div>`;
  paginador(cont.querySelector('.pagz'), filas.length, pag, p => { window[pagKey] = p; paginarRejilla(cont, filas, pagKey, pintaFila, cabecera, clase); }, () => { window[pagKey] = 0; paginarRejilla(cont, filas, pagKey, pintaFila, cabecera, clase); });
}
let FACPAG = 0, LLPAG = 0;

/* ---------------- factura en PDF (mismo formato que Holded) ---------------- */

let LOGO_DATA = null;
async function logoData() {
  if (LOGO_DATA) return LOGO_DATA;
  try {
    const b = await (await fetch(new URL('logo.png', location.href).href)).blob();
    LOGO_DATA = await new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); });
  } catch (e) { LOGO_DATA = null; }
  return LOGO_DATA;
}
async function imagenData(url) {
  try { const b = await (await fetch(url)).blob(); return await new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); }); }
  catch (e) { return null; }
}
async function cargarJsPDF() {
  if (window.jspdf) return window.jspdf.jsPDF;
  await new Promise((ok, ko) => { const s = document.createElement('script'); s.src = new URL('jspdf.umd.min.js', location.href).href; s.onload = ok; s.onerror = ko; document.head.appendChild(s); });
  return window.jspdf.jsPDF;
}
async function cargarQR() {
  if (window.qrcode) return window.qrcode;
  await new Promise((ok, ko) => { const s = document.createElement('script'); s.src = new URL('qrcode.js', location.href).href; s.onload = ok; s.onerror = ko; document.head.appendChild(s); });
  return window.qrcode;
}

async function facturaPDF(f, rectificaNum) {
  const JsPDF = await cargarJsPDF();
  if (!PRODUCTOS.length) await cargarProductos();
  const doc = new JsPDF({ unit: 'mm', format: 'a4' });
  const e = f.emisor || {}, c = f.cliente || {};
  const gris = [110, 118, 126], negro = [28, 39, 51], claro = [238, 240, 242];
  const eur = v => (Math.round((+v || 0) * 100) / 100).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '€';
  const fecha = x => x ? x.split('-').reverse().join('/') : '';
  // Logo en su círculo
  const logo = await logoData();
  if (logo && LOGO_CIRC) doc.addImage(logo, 'PNG', 17, 19, 34, 34);
  else { doc.setFillColor(236, 240, 245); doc.circle(34, 36, 15, 'F'); if (logo) doc.addImage(logo, 'PNG', 22.5, 31.5, 23, 9.2); }
  // Título y número
  doc.setFont('helvetica', 'normal'); doc.setTextColor(...negro); doc.setFontSize(f.rectifica_id ? 22 : 28);
  doc.text(f.rectifica_id ? 'FACTURA RECTIFICATIVA' : 'FACTURA', 192, 36, { align: 'right' });
  doc.setFontSize(14); doc.setTextColor(...gris); doc.text(f.numero, 192, 44, { align: 'right' });
  // Fechas y referencia
  doc.setFontSize(9.5); let y = 70;
  const fila = (etq, val, x, yy) => { doc.setTextColor(...gris); doc.text(etq, x, yy); doc.setTextColor(...negro); doc.text(val || '', x + doc.getTextWidth(etq) + 1.2, yy); };
  fila('Fecha:', fecha(f.fecha), 18, y);
  fila('Fecha vencimiento:', f.rectifica_id ? '' : fecha(f.vencimiento), 18, y + 4.6);
  const dirCli = [c.direccion, [c.municipio, c.cp ? '(' + c.cp + ')' : '', c.provincia, c.pais].filter(Boolean).join(', ').replace(', (', ' (')].filter(Boolean);
  if (dirCli.length) { fila('Ref:', dirCli[0], 18, y + 13.8); if (dirCli[1]) { doc.setTextColor(...negro); doc.text(dirCli[1], 18, y + 18.4); } }
  if (f.rectifica_id) { doc.setTextColor(...gris); doc.text('Rectifica la factura ' + (rectificaNum || '') + (f.motivo_rectificacion ? ' · ' + f.motivo_rectificacion : ''), 18, y + 25, { maxWidth: 80 }); }
  // Cliente
  doc.setFont('helvetica', 'bold'); doc.setTextColor(...negro); doc.text(c.nombre || '', 110, y);
  doc.setFont('helvetica', 'normal');
  [c.nif, ...dirCli, c.email].filter(Boolean).forEach((t, i) => doc.text(String(t), 110, y + 4.6 * (i + 1)));
  // Tabla
  y = 104;
  const col = { con: 46, pre: 110, uds: 138, sub: 162, iva: 173, tot: 192 };
  doc.setFillColor(...claro); doc.rect(42, y, 150, 11, 'F'); doc.rect(18, y, 22.5, 11, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.8); doc.setTextColor(...negro);
  doc.text('CONCEPTO', col.con, y + 7); doc.text('PRECIO', col.pre, y + 7, { align: 'right' }); doc.text('UNIDADES', col.uds, y + 7, { align: 'right' });
  doc.text('SUBTOTAL', col.sub, y + 7, { align: 'right' }); doc.text('IVA', col.iva, y + 7, { align: 'right' }); doc.text('TOTAL', col.tot, y + 7, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); y += 11;
  for (const l of f.lineas) {
    const p = PRODUCTOS.find(x => x.nombre && l.descripcion && l.descripcion.toLowerCase().startsWith(x.nombre.toLowerCase()));
    const img = p && p.foto_url ? await imagenData(p.foto_url) : null;
    const alto = img ? 20 : 11;
    if (y + alto > 250) { doc.addPage(); y = 20; }
    if (img) { try { doc.addImage(img, 20, y + 3, 18, 13); } catch (er) {} }
    const lineasDesc = doc.splitTextToSize(l.descripcion || '', col.pre - col.con - 22);
    doc.text(lineasDesc, col.con, y + 7);
    doc.text(eur(l.precio), col.pre, y + 7, { align: 'right' }); doc.text(String(l.unidades), col.uds, y + 7, { align: 'right' });
    doc.text(eur(l.base), col.sub, y + 7, { align: 'right' }); doc.text((+l.iva || 0) + '%', col.iva, y + 7, { align: 'right' });
    doc.text(eur((+l.base || 0) * (1 + (+l.iva || 0) / 100)), col.tot, y + 7, { align: 'right' });
    y += Math.max(alto, 5 + lineasDesc.length * 4.6);
    doc.setDrawColor(226, 230, 234); doc.line(18, y, 192, y);
  }
  // Totales
  y += 10; doc.setFontSize(9.5);
  const tot = (etq, val, negrita) => { doc.setTextColor(...gris); doc.text(etq, 150, y, { align: 'right' }); doc.setTextColor(...negro);
    doc.setFont('helvetica', negrita ? 'bold' : 'normal'); doc.text(val, 190, y, { align: 'right' }); doc.setFont('helvetica', 'normal'); y += 7; };
  tot('Base imponible', eur(f.base));
  (f.desglose_iva || []).filter(d => +d.cuota).forEach(d => tot('IVA ' + d.iva + '%', eur(d.cuota)));
  if (!(f.desglose_iva || []).some(d => +d.cuota)) tot('IVA', eur(0));
  doc.setFillColor(...claro); doc.rect(152, y - 5, 40, 9, 'F'); tot('Total', eur(f.total), true);
  // Forma de pago
  y += 4;
  if (f.forma_pago) { doc.setTextColor(...gris); doc.text('Forma de pago: ', 18, y); doc.setTextColor(...negro); doc.text(f.forma_pago + (/transfer/i.test(f.forma_pago) && e.iban ? ' · IBAN ' + e.iban : ''), 18 + doc.getTextWidth('Forma de pago: '), y); }
  // QR VeriFactu, si está activo
  if ((f.verifactu || {}).activo && f.qr_url) {
    try {
      const QR = await cargarQR(), q = QR(0, 'M'); q.addData(f.qr_url); q.make();
      const n = q.getModuleCount(), tam = 26 / n, x0 = 18, y0 = 238;
      doc.setFillColor(0, 0, 0);
      for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (q.isDark(r, k)) doc.rect(x0 + k * tam, y0 + r * tam, tam, tam, 'F');
      doc.setFontSize(8.5); doc.setTextColor(...negro); doc.setFont('helvetica', 'bold'); doc.text('VERI*FACTU', 48, y0 + 10);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(...gris); doc.text('Factura verificable en la sede electrónica de la AEAT', 48, y0 + 15);
    } catch (er) {}
  }
  // Pie
  const pies = doc.getNumberOfPages();
  for (let i = 1; i <= pies; i++) {
    doc.setPage(i); doc.setDrawColor(226, 230, 234); doc.line(18, 276, 192, 276);
    doc.setFontSize(8.3); doc.setTextColor(...gris);
    doc.text(`${e.razon_social || nombreApp()} | NIF: ${e.nif || ''} | ${[e.direccion, [e.cp, e.municipio].filter(Boolean).join(' '), e.pais || 'España'].filter(Boolean).join(', ')}`, 105, 281, { align: 'center' });
    if (e.telefono) doc.text('Atención al cliente: ' + e.telefono, 105, 285, { align: 'center' });
    doc.text(e.web || '', 105, 289, { align: 'center' });
    if (e.pie) doc.text(doc.splitTextToSize(e.pie, 170), 105, 293, { align: 'center' });
    doc.text(i + '/' + pies, 192, 289, { align: 'right' });
  }
  return doc;
}
const nombrePDF = f => `${f.numero}_${String((f.cliente || {}).nombre || 'cliente').replace(/[^\p{L}\p{N} ]/gu, '').trim().replace(/\s+/g, '_')}.pdf`;

async function descargarFacturaPDF(f, rn) {
  const doc = await facturaPDF(f, rn); doc.save(nombrePDF(f));
  await db.from('eventos_facturacion').insert({ tipo: 'PDF descargado', factura_id: f.id, detalle: {} }).then(() => {}, () => {});
}

async function enviarFacturaEmail(f, rn) {
  await cargarAjustes();
  const e = AJUSTES.empresa || {}, c = f.cliente || {};
  const saludo = c.nombre ? String(c.nombre).split(' ')[0] : '';
  $('dlg2body').innerHTML = `
    <div class="fh"><div><h2>Enviar ${esc(f.numero)} por email</h2><div class="sm">La factura va adjunta en PDF</div></div>
      <button class="x" data-cerrar2 aria-label="Cerrar">✕</button></div>
    <label for="efp">Para</label><input id="efp" type="email" value="${esc(c.email || '')}" placeholder="email del cliente">
    <label for="efa">Asunto</label><input id="efa" value="${esc(`Tu factura ${f.numero} · ${e.razon_social || nombreApp()}`)}">
    <label for="eft">Mensaje</label><textarea id="eft" rows="7">${esc(`Hola${saludo ? ' ' + saludo : ''}:\n\nTe adjuntamos la factura ${f.numero} de tu pedido, por un importe de ${eurI(f.total)}.\n\nGracias por tu confianza. Para cualquier consulta, estamos a tu disposición${e.telefono ? ' en el ' + e.telefono : ''}.\n\nUn saludo,\n${e.razon_social || nombreApp()}`)}</textarea>
    <div class="adjunto">📎 ${esc(nombrePDF(f))}</div>
    <div class="acts" style="justify-content:flex-end;flex-wrap:wrap"><button class="btn sec" data-cerrar2>Cancelar</button>
      <button class="btn" id="efok">Enviar</button></div>`;
  $('dlg2').showModal();
  $('efok').onclick = async ev => {
    const para = $('efp').value.trim(); if (!/\S+@\S+\.\S+/.test(para)) { toast('Escribe un email válido', true); return; }
    ev.target.disabled = true; ev.target.textContent = 'Preparando el PDF…';
    const doc = await facturaPDF(f, rn), b64 = doc.output('datauristring').split(',')[1];
    ev.target.textContent = 'Enviando…';
    let { data, error } = await db.functions.invoke('enviar_email', { body: { para, asunto: $('efa').value.trim(), texto: $('eft').value,
      adjuntos: [{ nombre: nombrePDF(f), base64: b64, tipo: 'application/pdf' }], factura_id: f.id, pedido_id: f.pedido_id, marca: 'email_factura' } });
    // Si la función responde con error, su motivo viene en el cuerpo de la respuesta
    if (error && error.context && typeof error.context.json === 'function') { try { data = await error.context.json(); } catch (x) {} }
    ev.target.disabled = false; ev.target.textContent = 'Enviar';
    if (!error && data && data.ok) { $('dlg2').close(); toast('Factura enviada a ' + para); return; }
    // Sin envío directo configurado: se ofrece compartir el PDF o descargarlo y adjuntarlo
    const sinSmtp = data && data.error === 'sin_smtp';
    const archivo = new File([doc.output('blob')], nombrePDF(f), { type: 'application/pdf' });
    const compartir = navigator.canShare && navigator.canShare({ files: [archivo] });
    $('dlg2body').innerHTML = `<div class="fh"><div><h2>${sinSmtp ? 'El envío directo aún no está configurado' : 'No se ha podido enviar'}</h2>
      <div class="sm">${sinSmtp ? 'Falta conectar el correo de la empresa (lo prepara administración).' : esc((error && error.message) || (data && data.error) || '')}</div></div>
      <button class="x" data-cerrar2 aria-label="Cerrar">✕</button></div>
      <p>Puedes enviarla desde tu correo con el PDF adjunto:</p>
      <div class="acts" style="flex-wrap:wrap">${compartir ? '<button class="btn" id="efsh">Compartir el PDF (correo, WhatsApp…)</button>' : ''}
        <button class="btn ${compartir ? 'sec' : ''}" id="efdl">⬇ Descargar el PDF</button>
        <a class="btn sec" href="mailto:${esc(para)}?subject=${encodeURIComponent($('efa') ? $('efa').value : f.numero)}&body=${encodeURIComponent('Adjuntamos la factura ' + f.numero + '.')}">Abrir mi correo</a></div>
      <label class="opt" style="margin-top:12px"><input type="checkbox" id="efmarca"> Ya la he enviado: marcar el pedido como «Email con la factura enviado»</label>
      <div class="acts" style="justify-content:flex-end"><button class="btn sec" data-cerrar2>Cerrar</button></div>`;
    if ($('efsh')) $('efsh').onclick = () => navigator.share({ files: [archivo], title: f.numero, text: 'Factura ' + f.numero }).catch(() => {});
    $('efdl').onclick = () => doc.save(nombrePDF(f));
    $('efmarca').onchange = async ev2 => { if (ev2.target.checked && f.pedido_id) { await db.rpc('marcar_operativa', { p_pedido: f.pedido_id, p_campo: 'email_factura', p_hecho: true }); toast('Marcado como enviado'); } };
  };
}

verFactura = (orig => async function (id) {
  await orig(id);
  const acts = $('dbody').querySelector('.acts:last-of-type');
  if (!acts || !$('fvpdf')) return;
  const { data } = await RPC_ORIG('factura_detalle', { p_id: id });
  const f = data && data.factura; if (!f) return;
  const rn = data.rectifica && data.rectifica.numero;
  $('fvpdf').textContent = 'Ver';
  $('fvpdf').classList.add('sec');
  $('fvpdf').insertAdjacentHTML('afterend', `<button class="btn sec" id="fvdl">⬇ PDF</button>${puedeFacturar() ? '<button class="btn" id="fvmail">✉️ Enviar por email</button>' : ''}`);
  $('fvdl').onclick = () => descargarFacturaPDF(f, rn);
  if ($('fvmail')) $('fvmail').onclick = () => enviarFacturaEmail(f, rn);
  // «Ver» abre el mismo PDF que se envía
  $('fvpdf').onclick = async () => { const doc = await facturaPDF(f, rn); window.open(doc.output('bloburl'), '_blank'); };
})(verFactura);

/* ---------------- email con los datos de pago: envío directo si está configurado ---------------- */

document.addEventListener('click', async e => {
  const a = e.target.closest('#pdmailpago');
  if (!a) return;
  e.preventDefault(); e.stopImmediatePropagation();
  const href = new URL(a.href.replace(/^mailto:/, 'http://x/?to=').replace('?subject', '&subject'));
  const para = decodeURIComponent(href.searchParams.get('to') || ''), asunto = href.searchParams.get('subject') || '', texto = href.searchParams.get('body') || '';
  const { data, error } = await db.functions.invoke('enviar_email', { body: { para, asunto, texto, pedido_id: a.dataset.ped || null, marca: 'email_pago' } });
  if (!error && data && data.ok) { toast('Email con los datos de pago enviado'); return; }
  location.href = a.href;   // sin envío directo: se abre el correo del dispositivo
}, true);

/* ---------------- datos fiscales: web de la empresa para el pie de la factura ---------------- */

pintarEmpresa = (orig => async function () {
  await orig();
  if ($('em_web')) return;
  const e = AJUSTES.empresa || {};
  $('em_email').closest('.g2').insertAdjacentHTML('afterend', `<div class="g2"><div><label for="em_web">Web</label><input id="em_web" value="${esc(e.web || '')}" placeholder="www.tuempresa.com"></div><div></div></div>`);
  const ok = $('emok').onclick;
  $('emok').onclick = async () => { await ok(); AJUSTES.empresa = Object.assign({}, AJUSTES.empresa, { web: $('em_web').value.trim() });
    await db.rpc('guardar_ajuste', { p_clave: 'empresa', p_valor: AJUSTES.empresa }); };
})(pintarEmpresa);

/* ---------------- manual de uso renovado ---------------- */

const ICONOS_MANUAL = { roles: '👥', inicio: '🏠', agenda: '📅', rutas: '🧭', directorio: '🩺', centros: '🏥', visitas: '📝', ventas: '🛒',
  config: '⚙️', admin: '🛡️', facturacion: '🧾', permisos: '🔐' };
const PRIMEROS_PASOS = {
  Comercial: [['📍', 'Configura tu punto de salida', 'Configuración → Preferencias. Con él se calculan las horas de tus rutas.', 'config'],
    ['📅', 'Planifica tu semana', 'Agenda → Semana → «Planificar la semana». Reparte a tus médicos por días.', 'agenda'],
    ['▶', 'Empieza la jornada', 'Agenda → Tu día → «Empezar jornada» y registra cada visita al terminarla.', 'agenda']],
  Televenta: [['🛒', 'Crea y valida pedidos', 'Pedidos → Ventas → «+ Nuevo pedido». Al validarlo sale del stock.', 'ventas'],
    ['📞', 'Registra cada llamada', 'Pedidos → Llamadas. Aunque no acabe en pedido: así se ve por qué.', 'ventas'],
    ['✅', 'Cierra la operativa', 'Valida el pago, prepara el paquete y envía la factura desde el pedido.', 'ventas']],
  default: [['🏠', 'Revisa Inicio', 'Indicadores, alertas y tu semana de un vistazo.', 'inicio'],
    ['👥', 'Mira el equipo', 'Agenda → Equipo: cumplimiento de cada persona.', 'agenda'],
    ['📊', 'Analiza los resultados', 'Analítica → Resumen, con gráficos explicados.', 'analitica']]
};

async function cargarManual() {
  const v = $('v-manual');
  const accesoTxt = s => s.a ? NIVEL_TXT[nivelDe2(s.a)] : (PERFIL.rol === 'Administrador' ? 'Completo' : '—');
  const nivelSec = s => s.a ? nivelDe2(s.a) : (PERFIL.rol === 'Administrador' ? 3 : (s.id === 'roles' || s.id === 'permisos') ? 1 : 0);
  const modulos = Object.keys(MODULO_AREA).filter(puedeModulo).length;
  const pasos = PRIMEROS_PASOS[PERFIL.rol] || PRIMEROS_PASOS.default;
  v.innerHTML = `
    <div class="manhero">
      <div><h1>Manual de uso</h1><p>Todo lo que puedes hacer en la plataforma, explicado para tu perfil.</p>
        <div class="manchips"><span>👤 ${esc(PERFIL.nombre)}</span><span>🎫 ${esc(PERFIL.rol)}</span><span>🧩 ${num(modulos)} módulos disponibles</span></div></div>
      <div class="manbusca"><input id="manq" type="search" placeholder="¿Qué quieres hacer? Aplazar una cita, bloquear un día, emitir una factura…" aria-label="Buscar en el manual"></div>
    </div>
    <h2 class="mantit">Primeros pasos</h2>
    <div class="manpasos">${pasos.map(([ic, t, d, m], i) => `<button class="manpaso" data-mira="${m}"><span class="mpn">${i + 1}</span><span class="mpi">${ic}</span><b>${esc(t)}</b><span>${esc(d)}</span></button>`).join('')}</div>
    <h2 class="mantit">Por módulo</h2>
    <div class="mangrid">${MANUAL.map(s => {
      const n = nivelSec(s);
      return `<button class="mancard ${n ? '' : 'bloq'}" data-mansec="${s.id}"><span class="mci">${ICONOS_MANUAL[s.id] || '📘'}</span>
        <b>${esc(s.t)}</b><span class="mcd">${esc(s.para)}</span><span class="pill ${n >= 2 ? 'p-est' : n === 1 ? 'p-per' : 'p-anu'}">${n ? 'Tu acceso: ' + accesoTxt(s) : 'Sin acceso'}</span></button>`;
    }).join('')}</div>
    <div id="mandet"></div>
    <h2 class="mantit">Preguntas frecuentes</h2>
    <div class="card manfaqs">${FAQ.map(([q, r]) => `<details class="manfaq"><summary>${esc(q)}</summary><p>${esc(r)}</p></details>`).join('')}</div>`;
  const abrir = id => {
    const s = MANUAL.find(x => x.id === id); if (!s) return;
    const n = nivelSec(s), ay = AYUDA[id === 'visitas' ? 'agenda' : id === 'centros' ? 'directorio' : id] || null;
    v.querySelectorAll('.mancard').forEach(c => c.classList.toggle('on', c.dataset.mansec === id));
    $('mandet').innerHTML = `<div class="card mandet"><div class="manh"><h2 style="padding:0">${ICONOS_MANUAL[id] || '📘'} ${esc(s.t)}</h2>
        ${MODULO_AREA[id] && puedeModulo(id) ? `<button class="btn sec" data-mira="${id}">Abrir ${esc(s.t)}</button>` : ''}</div>
      <p>${esc(s.para)}</p>
      <div class="mancols"><div><h3>Qué se puede hacer</h3><ul class="manlist">${s.hacer.map(([req, txt]) => `<li class="${n >= req ? 'si' : 'no'}"><span>${n >= req ? '✓' : '🔒'}</span><span>${esc(txt)}${n >= req ? '' : ` <em>· requiere ${esc(s.a ? (AREAS.find(x => x[0] === s.a) || [])[1] || s.t : 'Administración')} en «${NIVEL_TXT[req]}»</em>`}</span></li>`).join('')}</ul></div>
        ${ay && ay[2] && ay[2].length ? `<div><h3>Cómo funciona</h3><ul class="manlist">${ay[2].map(x => `<li><span>•</span><span>${x}</span></li>`).join('')}</ul></div>` : ''}</div>
      ${s.config.length ? `<h3>Dónde se configura</h3><div class="mancfg">${s.config.map(x => `<span>⚙ ${esc(x)}</span>`).join('')}</div>` : ''}</div>`;
    $('mandet').scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  v.querySelectorAll('[data-mansec]').forEach(b => b.onclick = () => abrir(b.dataset.mansec));
  v.onclick = e => { const m = e.target.closest('[data-mira]'); if (m && puedeModulo(m.dataset.mira)) { if (m.dataset.mira === 'config') CFG_SEC = 'prefs'; ir(m.dataset.mira); } };
  $('manq').oninput = e => {
    const q = e.target.value.trim().toLowerCase();
    if (!q) { v.querySelectorAll('.mancard').forEach(c => c.classList.remove('hide')); return; }
    let primera = null;
    v.querySelectorAll('.mancard').forEach(c => {
      const s = MANUAL.find(x => x.id === c.dataset.mansec), ay = AYUDA[s.id] || [];
      const txt = [s.t, s.para, ...s.hacer.map(h => h[1]), ...s.config, ...(ay[2] || [])].join(' ').toLowerCase();
      const ok = txt.includes(q); c.classList.toggle('hide', !ok); if (ok && !primera) primera = s.id;
    });
    v.querySelectorAll('.manfaq').forEach(d => { const ok = d.textContent.toLowerCase().includes(q); d.open = ok; });
    if (primera) abrir(primera);
  };
}

/* ---------------- ayudas ---------------- */

AYUDA.facturacion[2].push('<b>⬇ PDF</b> descarga la factura en PDF, lista para enviar. <b>✉️ Enviar por email</b> la manda al cliente con el PDF adjunto desde el correo de la empresa.');
AYUDA.ventas[2].push('El listado va por páginas y se guarda en el dispositivo: si vuelves a él, aparece al momento mientras se actualiza. Filtra por operativa para ver pagos por validar, paquetes por preparar o facturas por enviar.');

// Aviso de punto de salida en el plan y en «Tu día»
pintarPlan = (orig => function () { orig(); if (PLAN && $('rplan')) avisoSinSalida($('rplan').querySelector('.card')); })(pintarPlan);
cargarAgenda = (orig => async function () { await orig(); if (TAB === 'agenda' && AG_MODO === 'dia' && !AG_VISTA) avisoSinSalida($('agcuerpo')); })(cargarAgenda);


/* ============================================================
   DLC OS 2.0 · v2.36.0 · Identidad visual, selectores propios de fecha,
   hora y número, espacio del médico con avisos, alertas en ventana,
   asignación de comisiones con fecha desde Comisiones y restablecer
   pruebas solo para la persona responsable
   ============================================================ */

Object.assign(RPC_TTL, { informe_medico: 60, mis_notificaciones: 20, asignaciones_esquema_lista: 30 });

/* ---------------- selectores propios: fecha, hora y número ---------------- */

const MESES_L = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
let SELPOP = null, LOGO_CIRC = false;
function cerrarSelector() { if (SELPOP) { SELPOP.remove(); SELPOP = null; } }
function colocarPop(pop, ref) {
  const r = ref.getBoundingClientRect(), alto = pop.offsetHeight, ancho = pop.offsetWidth;
  const abajo = window.innerHeight - r.bottom > alto + 12 || r.top < alto + 12;
  pop.style.top = (abajo ? r.bottom + 6 : r.top - alto - 6) + 'px';
  pop.style.left = Math.max(8, Math.min(window.innerWidth - ancho - 8, r.left)) + 'px';
}
// Con una ventana abierta, solo se puede pulsar lo que está dentro: el selector se coloca en ella
const capaSelector = inp => inp.closest('dialog[open]') || [...document.querySelectorAll('dialog[open]')].pop() || document.body;
function emitir(inp) { inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true })); }

function abrirCalendario(inp) {
  cerrarSelector();
  let ver = inp.value ? new Date(inp.value + 'T12:00:00') : new Date();
  const min = inp.min || null, max = inp.max || null;
  const pop = document.createElement('div'); pop.className = 'selpop cal'; SELPOP = pop; pop.__t = Date.now();
  const pinta = () => {
    const y = ver.getFullYear(), m = ver.getMonth(), primero = new Date(y, m, 1), hueco = (primero.getDay() + 6) % 7, dias = new Date(y, m + 1, 0).getDate();
    const hoy = hoyISO();
    let celdas = '';
    for (let i = 0; i < hueco; i++) celdas += '<span></span>';
    for (let d = 1; d <= dias; d++) {
      const f = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const fuera = (min && f < min) || (max && f > max);
      celdas += `<button type="button" data-cd="${f}" class="${f === inp.value ? 'sel' : ''} ${f === hoy ? 'hoy' : ''}" ${fuera ? 'disabled' : ''}>${d}</button>`;
    }
    pop.innerHTML = `<div class="calh"><button type="button" data-cm="-1" aria-label="Mes anterior">‹</button><b>${MESES_L[m]} ${y}</b><button type="button" data-cm="1" aria-label="Mes siguiente">›</button></div>
      <div class="calg">${['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(x => `<i>${x}</i>`).join('')}${celdas}</div>
      <div class="calp"><button type="button" data-cq="hoy">Hoy</button>${inp.required ? '' : '<button type="button" data-cq="borrar">Borrar</button>'}</div>`;
    colocarPop(pop, inp.closest('.selw') || inp);
  };
  pop.addEventListener('pointerdown', () => { pop.__t = Date.now(); });
  pop.addEventListener('click', e => {
    e.stopPropagation();
    const d = e.target.closest('[data-cd]'), mv = e.target.closest('[data-cm]'), q = e.target.closest('[data-cq]');
    if (d) { inp.value = d.dataset.cd; emitir(inp); cerrarSelector(); }
    if (mv) { ver = new Date(ver.getFullYear(), ver.getMonth() + +mv.dataset.cm, 1); pinta(); }
    if (q) { inp.value = q.dataset.cq === 'hoy' ? hoyISO() : ''; emitir(inp); cerrarSelector(); }
  });
  $('seldlg') ? $('seldlg').appendChild(pop) : capaSelector(inp).appendChild(pop); pinta();
}

function abrirReloj(inp) {
  cerrarSelector();
  const [h0, m0] = (inp.value || '09:00').split(':').map(Number);
  let h = isNaN(h0) ? 9 : h0, m = isNaN(m0) ? 0 : m0;
  const pop = document.createElement('div'); pop.className = 'selpop reloj'; SELPOP = pop; pop.__t = Date.now();
  const pinta = () => {
    pop.innerHTML = `<div class="rjh"><b>${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}</b></div>
      <div class="rjt">Hora</div><div class="rjg">${Array.from({ length: 24 }, (_, i) => `<button type="button" data-rh="${i}" class="${i === h ? 'sel' : ''}">${String(i).padStart(2, '0')}</button>`).join('')}</div>
      <div class="rjt">Minutos</div><div class="rjg m">${[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map(i => `<button type="button" data-rm="${i}" class="${i === m ? 'sel' : ''}">${String(i).padStart(2, '0')}</button>`).join('')}</div>
      <div class="calp"><button type="button" data-rq="ok" class="okb">Aceptar</button>${inp.required ? '' : '<button type="button" data-rq="borrar">Borrar</button>'}</div>`;
    colocarPop(pop, inp.closest('.selw') || inp);
  };
  pop.addEventListener('click', e => {
    e.stopPropagation();
    const a = e.target.closest('[data-rh]'), b = e.target.closest('[data-rm]'), q = e.target.closest('[data-rq]');
    if (a) { h = +a.dataset.rh; pinta(); }
    if (b) { m = +b.dataset.rm; pinta(); }
    if (q) { inp.value = q.dataset.rq === 'ok' ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` : ''; emitir(inp); cerrarSelector(); }
  });
  $('seldlg') ? $('seldlg').appendChild(pop) : capaSelector(inp).appendChild(pop); pinta();
}

function valorVisible(inp) {
  const w = inp.closest('.selw'), sp = w && w.querySelector('.selval'); if (!sp) return;
  const v = inp.value;
  if (!v) { sp.textContent = inp.type === 'date' ? 'Elige una fecha' : 'Elige una hora'; sp.classList.add('vacio'); return; }
  sp.classList.remove('vacio');
  if (inp.type === 'time') { sp.textContent = v.slice(0, 5); return; }
  const d = new Date(v + 'T12:00:00');
  sp.textContent = isNaN(d) ? v : d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}
// Cada campo de fecha, hora o número se mejora al aparecer en pantalla
function mejorarCampos(raiz) {
  (raiz || document).querySelectorAll('input[type=date]:not([data-sel]), input[type=time]:not([data-sel]), input[type=number]:not([data-sel])').forEach(inp => {
    inp.dataset.sel = '1';
    if (inp.closest('.selpop')) return;
    if (inp.type === 'number') {
      if (inp.closest('.lrow') && inp.offsetWidth && inp.offsetWidth < 70) return;
      const w = document.createElement('span'); w.className = 'numw';
      inp.parentNode.insertBefore(w, inp); w.appendChild(inp);
      w.insertAdjacentHTML('afterbegin', '<button type="button" class="nb" data-nd="-1" aria-label="Menos" tabindex="-1">−</button>');
      w.insertAdjacentHTML('beforeend', '<button type="button" class="nb" data-nd="1" aria-label="Más" tabindex="-1">+</button>');
      if (inp.disabled) w.classList.add('dis');
      return;
    }
    const w = document.createElement('span'); w.className = 'selw ' + (inp.type === 'date' ? 'fecha' : 'hora');
    inp.parentNode.insertBefore(w, inp); w.appendChild(inp);
    w.insertAdjacentHTML('beforeend', `<span class="selico" aria-hidden="true">${inp.type === 'date' ? '📅' : '🕒'}</span>`);
    inp.dataset.ro = inp.readOnly ? '1' : '';
    inp.readOnly = true; inp.setAttribute('inputmode', 'none');
    // Se muestra el valor en formato español, sin depender del idioma del navegador
    w.insertAdjacentHTML('afterbegin', '<span class="selval"></span>');
    const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    Object.defineProperty(inp, 'value', { configurable: true, get() { return desc.get.call(this); }, set(v) { desc.set.call(this, v); valorVisible(this); } });
    inp.addEventListener('change', () => valorVisible(inp)); inp.addEventListener('input', () => valorVisible(inp));
    valorVisible(inp);
  });
}
document.addEventListener('click', e => {
  const nb = e.target.closest('.numw .nb');
  if (nb) {
    const inp = nb.parentNode.querySelector('input'); if (inp.disabled || inp.readOnly) return;
    const paso = +inp.step || 1, v = (+inp.value || 0) + paso * +nb.dataset.nd;
    let n = v; if (inp.min !== '' && n < +inp.min) n = +inp.min; if (inp.max !== '' && n > +inp.max) n = +inp.max;
    inp.value = paso < 1 ? n.toFixed(String(paso).split('.')[1].length) : n; emitir(inp); return;
  }
  const s = e.target.closest('.selw');
  if (s) {
    const inp = s.querySelector('input'); if (inp.disabled || inp.dataset.ro === '1') return;
    e.preventDefault(); inp.type === 'date' ? abrirCalendario(inp) : abrirReloj(inp); return;
  }
  if (!e.target.closest('.selpop')) cerrarSelector();
}, true);
// El calendario del sistema no se abre: se usa el propio
document.addEventListener('mousedown', e => { const i = e.target.closest('.selw input'); if (i) e.preventDefault(); }, true);
document.addEventListener('keydown', e => {
  const i = e.target.closest && e.target.closest('.selw input');
  if (i && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); i.type === 'date' ? abrirCalendario(i) : abrirReloj(i); }
  if (e.key === 'Escape') cerrarSelector();
});
document.addEventListener('scroll', e => { if (SELPOP && Date.now() - (SELPOP.__t || 0) > 500 && !(e.target.closest && e.target.closest('.selpop'))) cerrarSelector(); }, true);
new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) mejorarCampos(n); })
  .observe(document.body, { childList: true, subtree: true });
['dlg', 'dlg2', 'ficha', 'mini'].forEach(id => { const d = $(id); if (d) d.addEventListener('close', cerrarSelector); });
mejorarCampos(document);

/* ---------------- alertas: el detalle se abre en una ventana ---------------- */

document.addEventListener('click', e => {
  const s = e.target.closest('#iniextra details.alerta2 > summary');
  if (!s) return;
  e.preventDefault(); e.stopPropagation();
  const det = s.parentElement, items = [...det.querySelectorAll(':scope > div > .item')];
  const titulo = s.textContent.replace(/\s+/g, ' ').trim();
  $('dbody').innerHTML = `<div class="fh"><div><h2>${esc(titulo.replace(/^\d+\s*/, ''))}</h2><div class="sm">${num(items.length)} ${items.length === 1 ? 'caso' : 'casos'}${det.querySelector('.sm:last-child') && /más/.test(det.lastElementChild.textContent) ? ' · ' + esc(det.lastElementChild.textContent) : ''}</div></div>
    <button class="x" data-cerrar aria-label="Cerrar">✕</button></div>
    <input id="alq" type="search" placeholder="Buscar en la lista" style="margin:6px 0 8px">
    <div class="lista alertlist" id="allista"></div><div id="alpag"></div>`;
  let pag = 0;
  const pinta = () => {
    const q = $('alq').value.trim().toLowerCase(), f = items.filter(x => !q || x.textContent.toLowerCase().includes(q)), tam = 12;
    $('allista').innerHTML = ''; f.slice(pag * tam, pag * tam + tam).forEach(x => $('allista').appendChild(x.cloneNode(true)));
    $('allista').querySelectorAll('[data-inificha]').forEach(b => b.onclick = () => { $('dlg').close(); abrirFicha(b.dataset.inificha); });
    $('allista').querySelectorAll('[data-iniped]').forEach(b => b.onclick = () => verPedido(b.dataset.iniped));
    $('allista').querySelectorAll('[data-inistock]').forEach(b => b.onclick = () => { $('dlg').close(); PSEC = 'stock'; ir('productos'); });
    $('allista').querySelectorAll('[data-inicomp]').forEach(b => b.onclick = () => editorCompra(b.dataset.inicomp));
    paginador($('alpag'), f.length, pag, p => { pag = p; pinta(); }, () => { pag = 0; pinta(); });
  };
  $('alq').oninput = () => { pag = 0; pinta(); };
  pinta(); $('dlg').showModal();
}, true);

/* ---------------- comisiones: asignar esquema con fecha desde Comisiones ---------------- */

pintarComisiones = (orig => async function () {
  await orig();
  const c = $('admcuerpo'); if (!c || $('asigesq')) return;
  const { data } = await RPC_ORIG('asignaciones_esquema_lista', {});
  const l = data || [];
  c.insertAdjacentHTML('afterbegin', `<div class="card" id="asigesq" style="padding:16px 18px">
    <div class="manh"><h2 style="padding:0">Quién cobra con cada esquema</h2><button class="btn" id="asignueva">+ Asignar esquema</button></div>
    <p class="sm">Al asignar eliges desde cuándo se aplica: a partir de hoy, a todo el histórico de esa persona o desde una fecha concreta, pasada o futura. Cada liquidación usa el esquema vigente en ese mes.</p>
    ${l.length ? `<div class="dgrid-wrap"><div class="dgrid asigs"><div class="dh"><span>Persona</span><span>Esquema</span><span>Desde</span><span>Hasta</span><span>Estado</span></div>
      ${l.map(x => `<div class="dr" style="cursor:default"><span><b>${esc(x.persona)}</b><span class="sm">${esc(x.rol)}</span></span><span>${esc(x.esquema)}</span>
        <span>${x.desde <= '2000-01-01' ? 'Todo el histórico' : fechaCorta(x.desde)}</span><span>${x.hasta ? fechaCorta(x.hasta) : '—'}</span>
        <span><span class="pill ${x.vigente ? 'p-est' : x.desde > hoyISO() ? 'p-per' : 'p-anu'}">${x.vigente ? 'Vigente' : x.desde > hoyISO() ? 'Programado' : 'Terminado'}</span></span></div>`).join('')}</div></div>`
      : '<div class="vacio">Nadie tiene todavía un esquema asignado.</div>'}</div>`);
  $('asignueva').onclick = async () => {
    if (!COMS.length) await cargarComerciales();
    if (!ESQUEMAS.length) { const { data: e } = await db.rpc('esquemas_lista'); ESQUEMAS = e || []; }
    $('dbody').innerHTML = `<div class="fh"><div><h2>Asignar esquema de comisión</h2><div class="sm">Sustituye al que tuviera esa persona desde la fecha elegida</div></div>
        <button class="x" data-cerrar aria-label="Cerrar">✕</button></div>
      <div class="g2"><div><label for="aep">Persona</label><select id="aep">${COMS.map(u => `<option value="${u.id}">${esc(u.nombre)} · ${esc(u.rol)}</option>`).join('')}</select></div>
        <div><label for="aee">Esquema</label><select id="aee"><option value="">Sin comisión</option>${ESQUEMAS.map(e => `<option value="${e.id}">${esc(e.nombre)}</option>`).join('')}</select></div></div>
      <label>Se aplica</label>
      <div class="opciones" style="grid-template-columns:repeat(3,1fr)">
        <label class="opt"><input type="radio" name="aem" value="hoy" checked> A partir de hoy</label>
        <label class="opt"><input type="radio" name="aem" value="todo"> A todo el histórico</label>
        <label class="opt"><input type="radio" name="aem" value="fecha"> Desde una fecha</label></div>
      <div id="aefw" class="hide"><label for="aef">Fecha (puede ser pasada o futura)</label><input id="aef" type="date" value="${hoyISO()}"></div>
      <div class="avisoh" id="aeinfo"><span>Las ventas desde hoy se liquidarán con este esquema.</span></div>
      <div class="acts" style="justify-content:flex-end"><button class="btn sec" data-cerrar>Cancelar</button><button class="btn" id="aeok">Asignar</button></div>`;
    $('dlg').showModal();
    const info = () => {
      const m = $('dbody').querySelector('[name=aem]:checked').value;
      $('aefw').classList.toggle('hide', m !== 'fecha');
      $('aeinfo').querySelector('span').textContent = m === 'todo' ? 'Todas sus ventas, también las pasadas, se liquidarán con este esquema. Las liquidaciones ya cerradas no cambian.'
        : m === 'fecha' ? ($('aef').value < hoyISO() ? 'Las ventas desde esa fecha (pasada) se recalcularán con este esquema en las liquidaciones abiertas.' : 'Se aplicará automáticamente a partir de esa fecha; hasta entonces sigue el esquema actual.')
        : 'Las ventas desde hoy se liquidarán con este esquema.';
    };
    $('dbody').querySelectorAll('[name=aem]').forEach(r => r.onchange = info); $('aef').onchange = info;
    $('aeok').onclick = async () => {
      const m = $('dbody').querySelector('[name=aem]:checked').value;
      const desde = m === 'todo' ? '2000-01-01' : m === 'fecha' ? $('aef').value : hoyISO();
      const { data: r, error } = await db.rpc('asignar_esquema', { p_usuario: $('aep').value, p_esquema: $('aee').value || null, p_quitar: !$('aee').value, p_desde: desde });
      if (error || (r && r.ok === false)) { toast('No se ha podido asignar', true); return; }
      $('dlg').close(); toast('Esquema asignado'); ESQUEMAS = []; pintarComisiones();
    };
  };
})(pintarComisiones);

/* ---------------- entorno de pruebas: solo restablece la persona responsable ---------------- */

if (EN_PRUEBAS) {
  pintarFranjaPruebas = (orig => async function () {
    orig();
    const b = $('prreset'); if (!b) return;
    const { data: puede, error } = await RPC_ORIG('pruebas_puede_restablecer', {});
    if (error) return;               // proyecto sin el ajuste: se mantiene como estaba
    if (!puede) { b.remove(); return; }
    b.onclick = async () => {
      const txt = await pedirTexto('Se borrará todo lo creado o cambiado en pruebas y los datos quedarán como se copiaron de producción.\n\nEscribe VOLVER para confirmar.', '', { titulo: '¿Volver a los datos de partida?', ok: 'Volver a los datos de partida' });
      if (txt === null) return;
      if (txt.trim().toUpperCase() !== 'VOLVER') { toast('No se ha hecho nada: no coincide la palabra', true); return; }
      pantallaCarga('Volviendo a los datos de partida…');
      const { data: r, error: e2 } = await RPC_ORIG('pruebas_resetear_responsable', { p_confirmacion: 'RESTABLECER' });
      if (e2 || !r || !r.ok) { quitarCarga(); toast('No se ha podido: ' + ((e2 && e2.message) || (r && r.error) || ''), true); return; }
      limpiarDatosLocales(); location.reload();
    };
  })(pintarFranjaPruebas);
}

/* ---------------- espacio del médico ---------------- */

const ES_MEDICO = () => PERFIL && PERFIL.rol === 'Medico';

async function cargarInforme() {
  const v = $('v-informe');
  v.innerHTML = `<div class="medhero"><div><div class="sm" style="color:rgba(255,255,255,.8)">Tu informe de prescripción</div><h1 id="mdnom">…</h1><div id="mdesp" class="sm" style="color:rgba(255,255,255,.85)"></div></div>
      <div class="medper"><div id="mdper"></div></div></div>
    <div id="mdcuerpo"><div class="card">${skelCard('Cargando tu informe…')}</div></div>`;
  const pinta = async () => {
    const r = $('mdper').__rango();
    const { data: d } = await RPC_ORIG('informe_medico', { p_desde: r.desde, p_hasta: r.hasta });
    if (!d || !d.ok) { $('mdcuerpo').innerHTML = `<div class="card"><div class="vacio">Tu usuario todavía no está vinculado a tu ficha de médico. Avisa a la empresa para activarlo.</div></div>`; return; }
    $('mdnom').textContent = d.medico.nombre; $('mdesp').textContent = d.medico.especialidad || '';
    const top = d.posicion && d.posicion <= 3 ? 'Top 3' : d.posicion && d.posicion <= 5 ? 'Top 5' : d.posicion && d.posicion <= 10 ? 'Top 10' : null;
    const ll = d.llamadas || {}, conv = ll.total ? Math.round(ll.con_pedido / ll.total * 100) : null;
    const meses = mesesEntre(d.desde, d.hasta), serie = {}; (d.serie || []).forEach(s => serie[s.mes] = s);
    $('mdcuerpo').innerHTML = `
      <div class="kpis vtot mdk">
        <div class="kpi"><b>${num(d.unidades)}</b><span>unidades pautadas</span></div>
        <div class="kpi"><b>${num(d.pautas)}</b><span>pautas (pedidos)</span></div>
        <div class="kpi"><b>${num(d.pacientes)}</b><span>pacientes</span></div>
        <div class="kpi"><b>${num(d.repiten)}</b><span>pacientes que repiten</span></div>
        <div class="kpi ${top ? 'ok' : ''}"><b>${top ? '🏆 ' + top : d.posicion ? 'Nº ' + d.posicion : '—'}</b><span>${d.posicion ? `de ${num(d.prescriptores)} prescriptores` : 'sin pautas en el periodo'}</span></div>
      </div>
      <div class="angrid">
        <div class="card ancard ancha"><h2>Tus pautas mes a mes</h2>
          ${d.unidades ? svgBarras(meses, meses.map(m => (serie[m] || {}).unidades || 0), meses.map(m => (serie[m] || {}).pautas || 0), ['Unidades', 'Pautas'])
            : vacioGrafico('Cuando tus pacientes hagan su pedido, verás aquí la evolución.')}
          <p class="leer">Cada barra son las unidades pautadas en el mes y la línea, el número de pautas.${d.ultima_pauta ? ' Última pauta: ' + fechaCorta(d.ultima_pauta) + '.' : ''}</p></div>
        <div class="card ancard"><h2>Qué pautas</h2>
          ${(d.productos || []).length ? svgDonut(d.productos.map(x => ({ n: x.nombre, v: x.unidades }))) : vacioGrafico('Aparecerá el reparto por producto.')}</div>
        <div class="card ancard"><h2>Llamadas de tus pacientes</h2>
          <div class="minis"><div><b>${num(ll.total || 0)}</b><span>llamadas</span></div><div><b>${conv == null ? '—' : conv + '%'}</b><span>acaban en pedido</span></div></div>
          ${(ll.por_resultado || []).length ? barrasH(ll.por_resultado.map(x => ({ n: x.resultado, v: x.n })), num) : '<p class="sm" style="padding:0 16px">Todavía no hay llamadas registradas de pacientes que vengan de tu parte.</p>'}
          <p class="leer">Pacientes que llaman a la empresa de tu parte. Si muchos llaman por dudas o por precio, podemos darte material para explicarlo en consulta.</p></div>
      </div>
      <p class="sm" style="text-align:center;margin:18px 0">Por confidencialidad no se muestran datos de tus pacientes ni importes.</p>`;
  };
  montarPeriodo($('mdper'), { id: 'informe', valor: 'anio', alCambiar: pinta });
  pinta();
}

async function pintarAvisos() {
  const b = $('mdavisos'); if (!b) return;
  const { data } = await RPC_ORIG('mis_notificaciones', { lim: 30 });
  const n = (data && data.sin_leer) || 0;
  b.innerHTML = `🔔${n ? `<span class="nb2">${n > 9 ? '9+' : n}</span>` : ''}`;
  b.onclick = async () => {
    const l = (data && data.lista) || [];
    $('dbody').innerHTML = `<div class="fh"><div><h2>Avisos</h2><div class="sm">Cada vez que se registra una pauta a tu nombre</div></div><button class="x" data-cerrar aria-label="Cerrar">✕</button></div>
      <div class="lista">${l.map(x => `<div class="item ${x.leida_en ? '' : 'nuevo'}" style="cursor:default"><span class="ic">💊</span>
        <span class="tx"><b>${esc(x.titulo)}</b><span class="sm">${esc(x.cuerpo || '')} · ${new Date(x.creado_en).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}</span></span></div>`).join('') || '<div class="vacio">Sin avisos todavía.</div>'}</div>`;
    $('dlg').showModal();
    if (n) { await db.rpc('leer_notificaciones'); pintarAvisos(); }
  };
}

const mostrarAppV2350 = mostrarApp;
mostrarApp = function (perfil) {
  mostrarAppV2350(perfil);
  document.body.classList.toggle('modo-medico', perfil.rol === 'Medico');
  if (perfil.rol !== 'Medico') return;
  document.querySelectorAll('nav.main [data-t]').forEach(b => b.classList.add('hide'));
  let bi = document.querySelector('nav.main [data-t="informe"]');
  if (!bi) { document.querySelector('nav.main .in').insertAdjacentHTML('afterbegin', '<button data-t="informe" aria-selected="true">Mi informe</button>'); bi = document.querySelector('nav.main [data-t="informe"]'); bi.onclick = () => ir('informe'); }
  bi.classList.remove('hide');
  if (!$('mdavisos')) $('ubtn').insertAdjacentHTML('beforebegin', '<button class="mdavisos" id="mdavisos" aria-label="Avisos"></button>');
  pintarAvisos();
  if ($('q')) $('q').closest('.gsearch').classList.add('hide');
  setTimeout(() => ir('informe'), 0);
};
const irV2350 = ir;
ir = function (t) {
  if (ES_MEDICO() && !['informe', 'manual', 'config'].includes(t)) t = 'informe';
  if (t === 'informe') {
    irV2350('informe');
    document.querySelectorAll('main > section').forEach(s => s.classList.toggle('hide', s.id !== 'v-informe'));
    document.querySelectorAll('nav.main [data-t]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.t === 'informe')));
    cargarInforme();
    return;
  }
  if ($('v-informe')) $('v-informe').classList.add('hide');
  irV2350(t);
};
if (typeof pintarBnav === 'function') pintarBnav = (orig => function () {
  if (ES_MEDICO()) { const b = $('bnav'); if (b) b.innerHTML = '<button data-t="informe" aria-selected="true"><span>◉</span>Mi informe</button>'; if (b) b.firstChild.onclick = () => ir('informe'); return; }
  orig();
})(pintarBnav);

// Vincular un usuario de tipo Médico con su ficha (Administración → Usuarios → Editar)
editarUsuario = (orig => async function (id) {
  await orig(id);
  const u = (USUARIOS || []).find(x => x.id === id);
  if (!u || u.rol !== 'Medico' || !$('dlg').open || $('umedw')) return;
  const { data: pf } = await db.from('perfiles').select('medico_id').eq('id', id).single();
  let medico = null;
  if (pf && pf.medico_id) { const { data: fm } = await db.rpc('ficha_medico', { p_id: pf.medico_id }); if (fm && fm.medico) medico = { id: fm.medico.id, nombre: fm.medico.nombre }; }
  const ref = $('dbody').querySelector('.acts:last-of-type');
  ref.insertAdjacentHTML('beforebegin', `<div class="blk" id="umedw"><h3>Ficha de médico vinculada</h3>
    <p class="sm">Este usuario verá solo el informe de este médico y recibirá un aviso con cada pauta a su nombre. Sin importes ni datos de pacientes.</p>
    <div id="umedsel"></div><div class="acts" style="margin-top:8px"><button class="btn sec" id="umedok">Guardar vínculo</button>
    ${medico ? `<button class="btn sec" id="umedver">Ver su informe</button>` : ''}</div></div>`);
  selectorMedico($('umedsel'), { valor: medico, placeholder: 'Busca su ficha', alElegir: m => { medico = m; } });
  $('umedok').onclick = async () => {
    const { data: r, error } = await db.rpc('vincular_medico', { p_usuario: id, p_medico: medico ? medico.id : null });
    if (error || (r && r.ok === false)) { toast('No se ha podido guardar', true); return; }
    toast(medico ? 'Vinculado con ' + medico.nombre : 'Vínculo quitado');
  };
  if ($('umedver')) $('umedver').onclick = async () => {
    const { data: d } = await RPC_ORIG('informe_medico', { p_medico: medico.id });
    toast(`${medico.nombre}: ${num(d.unidades)} unidades, ${num(d.pautas)} pautas este año${d.posicion ? ' · Nº ' + d.posicion : ''}`);
  };
})(editarUsuario);

MANUAL.push({ id: 'medico', t: 'Espacio del médico', a: null, para: 'Los médicos con usuario ven su informe de prescripción y reciben un aviso con cada pauta a su nombre.',
  hacer: [[3, 'Crear el usuario con el rol «Medico» y vincularlo a su ficha (Administración → Usuarios → Editar)']],
  config: ['El médico ve unidades, pautas, pacientes (solo el número), su posición entre los prescriptores y las llamadas de sus pacientes. Nunca importes ni nombres.'] });
ICONOS_MANUAL.medico = '🩺';

/* ---------------- factura en PDF con el logo circular ---------------- */

logoData = (orig => async function () {
  if (LOGO_DATA) return LOGO_DATA;
  const x = await imagenData(new URL('logo-circulo.png', location.href).href);
  if (x && x.startsWith('data:image')) { LOGO_DATA = x; LOGO_CIRC = true; return x; }
  return orig();
})(logoData);


/* ============================================================
   DLC OS 2.0 · v2.36.1 · Móvil: tamaño estable al abrir y solo vertical
   ============================================================ */

// Donde el sistema lo permite (Android instalada), se bloquea la orientación vertical
try { if (screen.orientation && screen.orientation.lock && matchMedia('(display-mode: standalone)').matches) screen.orientation.lock('portrait').catch(() => {}); } catch (e) {}
// Si algún campo dejó la pantalla ampliada, al salir de él se vuelve al tamaño normal
document.addEventListener('focusout', () => {
  if (window.visualViewport && visualViewport.scale > 1.01) window.scrollTo(window.scrollX, window.scrollY);
}, true);


/* ============================================================
   DLC OS 2.0 · v2.37.0 · Experiencia móvil ordenada y fluida,
   navegación sin rebotes (solo vale la última petición), configuración
   unificada, buscador del manual, alertas legibles, compartir por
   WhatsApp con el menú del sistema y unidades por periodo en la ficha
   ============================================================ */

const ES_MOVIL = () => matchMedia('(max-width: 760px)').matches;

/* ---------------- navegación: cada cambio de módulo descarta lo pendiente ---------------- */

let NAV_CTRL = new AbortController(), NAV_GEN = 0;
const irV2361 = ir;
ir = function (t) {
  NAV_CTRL.abort(); NAV_CTRL = new AbortController(); NAV_GEN++;
  cerrarSelector && cerrarSelector();
  irV2361(t);
};
// Las consultas de lectura de un módulo que ya no está en pantalla se descartan: nunca pintan ni devuelven la vista
const TURNOS = {};
const pedirTurno = k => (TURNOS[k] = (TURNOS[k] || 0) + 1);
const esMiTurno = (k, t) => TURNOS[k] === t;
const SOLO_ULTIMA = new Set(['pedidos_pagina', 'facturas_lista', 'llamadas_lista', 'pacientes_lista', 'analitica_tabla', 'compras_lista', 'stock_resumen']);
const RPC_V2361 = db.rpc;
db.rpc = function (fn, params, opts) {
  const b = RPC_V2361.call(db, fn, params, opts);
  // En los listados, si se vuelve a pedir antes de terminar, solo vale la última petición
  if (SOLO_ULTIMA.has(fn)) {
    const t = pedirTurno(fn), gen0 = NAV_GEN;
    return conCatch(new Promise(res => Promise.resolve(b).then(r => { if (esMiTurno(fn, t) && gen0 === NAV_GEN) res(r); }, () => {})));
  }
  if (!(fn in RPC_TTL)) return b;
  const gen = NAV_GEN, señal = NAV_CTRL.signal;
  try { if (b && typeof b.abortSignal === 'function') b.abortSignal(señal); } catch (e) {}
  return conCatch(new Promise(res => Promise.resolve(b).then(r => { if (gen === NAV_GEN) res(r); }, () => {})));
};
// Y ninguna pantalla puede aparecer si no es la del módulo actual
new MutationObserver(ms => {
  for (const m of ms) {
    const s = m.target;
    if (s.parentElement && s.parentElement.tagName === 'MAIN' && s.id !== 'v-' + TAB && !s.classList.contains('hide')) s.classList.add('hide');
  }
}).observe(document.querySelector('main'), { attributes: true, attributeFilter: ['class'], subtree: true });


/* ---------------- selectores de fecha y hora en su propia capa (nunca se cortan) ---------------- */

(function () {
  if (!$('seldlg')) document.body.insertAdjacentHTML('beforeend', '<dialog id="seldlg" class="seldlg"></dialog>');
  const d = $('seldlg');
  d.addEventListener('click', e => { if (e.target === d) cerrarSelector(); });
  d.addEventListener('cancel', e => { e.preventDefault(); cerrarSelector(); });
})();
cerrarSelector = function () {
  if (SELPOP) { SELPOP.remove(); SELPOP = null; }
  const d = $('seldlg'); if (d && d.open) d.close();
};
colocarPop = function (pop, ref) {
  const d = $('seldlg');
  if (!d.open) d.showModal();
  if (ES_MOVIL()) { d.classList.add('hoja'); d.style.top = ''; d.style.left = ''; return; }
  d.classList.remove('hoja');
  const r = ref.getBoundingClientRect(), alto = d.offsetHeight, ancho = d.offsetWidth;
  const abajo = window.innerHeight - r.bottom > alto + 12 || r.top < alto + 12;
  d.style.top = Math.max(8, abajo ? r.bottom + 6 : r.top - alto - 6) + 'px';
  d.style.left = Math.max(8, Math.min(window.innerWidth - ancho - 8, r.left)) + 'px';
};

/* ---------------- rendimiento: los campos se mejoran por lotes ---------------- */

let MEJ_PEND = new Set(), MEJ_RAF = 0;
mejorarCampos = (orig => function (raiz) {
  if (!raiz || raiz === document) return orig(raiz);
  if (raiz.nodeType !== 1 || !raiz.querySelector && raiz.tagName !== 'INPUT') return;
  MEJ_PEND.add(raiz);
  if (MEJ_RAF) return;
  MEJ_RAF = requestAnimationFrame(() => {
    MEJ_RAF = 0; const l = [...MEJ_PEND]; MEJ_PEND.clear();
    l.forEach(n => { if (n.isConnected && (n.tagName === 'INPUT' ? n.parentNode : n.querySelector('input[type=date],input[type=time],input[type=number]'))) orig(n.tagName === 'INPUT' ? n.parentNode : n); });
  });
})(mejorarCampos);

/* ---------------- barra de herramientas ordenada en el móvil ---------------- */

const MODOS_AG = ['dia', 'semana', 'mes', 'equipo'];
function ordenarCabeceraMovil(sec) {
  if (!ES_MOVIL() || !sec) return;
  const sal = sec.querySelector(':scope > .saludo'); if (!sal || sal.dataset.movil) return;
  const acts = sal.querySelector('.acts'); if (!acts) return;
  sal.dataset.movil = '1';
  const hijos = [...acts.children];
  // Acción principal «+ …» como botón flotante
  const principal = hijos.find(b => b.tagName === 'BUTTON' && !b.classList.contains('sec') && /^\s*\+/.test(b.textContent));
  if (principal) {
    principal.classList.add('fab'); principal.setAttribute('aria-label', principal.textContent.replace('+', '').trim());
    principal.dataset.txt = principal.textContent.replace('+', '').trim(); principal.textContent = '+';
    sec.appendChild(principal);
  }
  // Agenda: modos en un selector segmentado y la navegación junto a la fecha
  const modos = hijos.filter(b => MODOS_AG.includes(b.dataset.ag));
  if (modos.length) {
    const seg = document.createElement('div'); seg.className = 'segm';
    modos.forEach(b => { b.classList.remove('btn', 'sec'); b.classList.toggle('on', b.dataset.ag === AG_MODO); seg.appendChild(b); });
    sal.after(seg);
    const nav = hijos.filter(b => ['ant', 'hoy', 'sig'].includes(b.dataset.ag));
    if (nav.length) {
      const fila = document.createElement('div'); fila.className = 'agnavm';
      nav.forEach(b => { b.classList.add('chip'); fila.appendChild(b); });
      const ant = fila.querySelector('[data-ag=ant]'), sig = fila.querySelector('[data-ag=sig]');
      if (ant) ant.textContent = '‹'; if (sig) sig.textContent = '›';
      seg.after(fila);
    }
  }
  // El resto, como fila de controles compactos del mismo tamaño
  // Se mantiene la fila aunque quede vacía: otras partes añaden controles después (vista de agenda, equipo…)
  acts.classList.add('chips'); [...acts.children].forEach(b => b.classList.add('chip'));
}
const ORDENAR_EN = { agenda: 'v-agenda', rutas: 'v-rutas', productos: 'v-productos', ventas: 'v-ventas', analitica: 'v-analitica',
  facturacion: 'v-facturacion', config: 'v-config', admin: 'v-admin', pacientes: 'v-pacientes', seguimiento: 'v-seguimiento', duplicados: 'v-duplicados' };
new MutationObserver(() => { if (ORDENAR_EN[TAB]) ordenarCabeceraMovil($(ORDENAR_EN[TAB])); })
  .observe(document.querySelector('main'), { childList: true, subtree: true });
window.addEventListener('resize', () => { if (!ES_MOVIL()) document.querySelectorAll('.fab').forEach(f => { f.textContent = '+ ' + (f.dataset.txt || ''); f.classList.remove('fab'); }); });

/* ---------------- agenda: sin recargar la página en cada acción ---------------- */

cargarAgenda = (orig => async function () {
  const y = window.scrollY, mismo = TAB === 'agenda' && $('agcuerpo') && $('agcuerpo').children.length;
  await orig();
  if (mismo && TAB === 'agenda') window.scrollTo(0, y);
})(cargarAgenda);

/* ---------------- menú «Más» del móvil con el mismo estilo ---------------- */

const ICO_MOD = { inicio: '◉', agenda: '▤', rutas: '➤', directorio: '☰', pacientes: '👥', productos: '📦', seguimiento: '✔︎', ventas: '🛒',
  analitica: '📊', facturacion: '🧾', informe: '◉' };
abrirMasMovil = function () {
  const principales = ['inicio', 'agenda', 'rutas', 'directorio'];
  const mods = [...document.querySelectorAll('nav.main [data-t]')]
    .filter(x => !x.classList.contains('hide') && !x.disabled && !principales.includes(x.dataset.t))
    .map(x => [x.dataset.t, x.textContent.replace('Pronto', '').trim()]);
  let s = $('bmas');
  if (!s) { document.body.insertAdjacentHTML('beforeend', '<div id="bmas" class="bmas hide"></div>'); s = $('bmas'); }
  s.innerHTML = `<div class="bmasbox"><div class="bmasasa" aria-hidden="true"></div>
    <div class="bmasgrid">${mods.map(([t, n]) => `<button data-bm="${t}" class="${TAB === t ? 'on' : ''}"><span>${ICO_MOD[t] || '•'}</span>${esc(n)}</button>`).join('')}</div>
    <div class="sm" style="text-align:center;margin-top:8px">Configuración, manual y administración, en tu nombre arriba</div></div>`;
  s.classList.remove('hide');
  requestAnimationFrame(() => s.classList.add('abierto'));
  const cerrar = () => { s.classList.remove('abierto'); setTimeout(() => s.classList.add('hide'), 180); };
  s.onclick = e => { if (e.target === s) cerrar(); };
  s.querySelectorAll('[data-bm]').forEach(x => x.onclick = () => { cerrar(); ir(x.dataset.bm); });
};
pintarBnav = (orig => function () { orig(); const m = $('bmasbtn'); if (m) m.onclick = abrirMasMovil; })(pintarBnav);

/* ---------------- Inicio: tarjeta de bienvenida con lo importante de hoy ---------------- */

async function vistazoHoy() {
  const sal = document.querySelector('#v-inicio .saludo'); if (!sal) return;
  const acts = sal.querySelector('.acts');
  if (acts && !acts.dataset.ico) {
    acts.dataset.ico = '1'; acts.classList.add('icoacts');
    const cb = $('compartirBtn');
    if (cb) { cb.innerHTML = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>';
      cb.classList.add('icoonly'); cb.title = 'Compartir la semana'; cb.setAttribute('aria-label', 'Compartir la semana'); }
  }
  let v = $('vistazo');
  if (!v) { sal.firstElementChild.insertAdjacentHTML('beforeend', '<div id="vistazo" class="vistazo"></div>'); v = $('vistazo'); }
  if (ES_MEDICO()) return;
  const citas = await citasDelDia(hoyISO());
  const abiertas = citas.filter(c => CITA_ABIERTA.includes(c.estado)).sort((a, b) => (a.orden || 0) - (b.orden || 0) || String(a.hora || '').localeCompare(String(b.hora || '')));
  const hechas = citas.filter(c => c.estado === 'Visitada').length, prox = abiertas[0];
  if (!$('vistazo')) return;
  v.innerHTML = citas.length
    ? `<span><b>${num(citas.length)}</b> ${citas.length === 1 ? 'cita' : 'citas'} hoy · <b>${num(hechas)}</b> visitadas</span>
       ${prox ? `<span class="prox">Próxima: <b>${esc(prox.medico || prox.nombre || '')}</b>${prox.hora ? ' · ' + String(prox.hora).slice(0, 5) : ''}</span>` : '<span class="prox">Día completado ✓</span>'}`
    : `<span>Hoy no tienes citas.</span> <button class="lnk" data-irplan>Planifica tu día</button>`;
  const b = v.querySelector('[data-irplan]'); if (b) b.onclick = () => ir('rutas');
}
pintarInicio = (orig => async function () {
  await orig();
  if (TAB !== 'inicio') return;
  // El aviso de duplicados ya está como indicador: se quita el cartel repetido
  document.querySelectorAll('#v-inicio .avisoh').forEach(a => { if (/unificar|duplicad/i.test(a.textContent)) a.remove(); });
  vistazoHoy();
  indicadoresCompletos();
})(pintarInicio);

// Indicadores con icono, explicación breve y, cuando se puede, comparación
const KPI_ICO = { citas: '📅', urgentes: '⚠️', visitas_sem: '📝', visitas_mes: '🗓️', interesados: '✨', sin_contactar: '📇', cartera: '🩺', dups: '🧩',
  sin_visita_60: '⏳', sin_horario: '🕘', uds_mes: '📦', prescriptores: '💊', nuevos_presc: '🌱', activos_90: '🔁', conversion: '📈',
  importe_mes: '€', borradores: '✏️', muestras_mes: '🎁', material_mes: '📚', citas_7d: '📆', visitas_7d: '🧭' };
const KPI_TXT = { citas: 'Visitadas de las citas de hoy', urgentes: 'Médicos marcados urgentes sin visita', visitas_sem: 'Registradas de lunes a hoy',
  visitas_mes: 'Registradas en el mes', interesados: 'En estado «Interesado»', sin_contactar: 'Todavía sin primera visita', cartera: 'Asignados a ti',
  dups: 'Fichas por revisar', uds_mes: 'Cajas validadas en el mes', prescriptores: 'Con alguna venta este mes', nuevos_presc: 'Primera venta este mes',
  activos_90: 'Con ventas en 90 días', conversion: 'Visitados que ya prescriben', importe_mes: 'Base sin IVA del mes', borradores: 'Pedidos sin validar',
  sin_visita_60: 'Hace más de 60 días', sin_horario: 'Sin días de consulta', muestras_mes: 'Entregadas este mes', material_mes: 'Entregado este mes',
  citas_7d: 'Programadas los próximos 7 días', visitas_7d: 'En los últimos 7 días' };
function indicadoresCompletos() {
  const cfg = kpiConfig().filter(c => c.on);
  const cards = [...document.querySelectorAll('#kpis .kpi')];
  cards.forEach((k, i) => {
    const c = cfg[i]; if (!c || k.dataset.comp) return;
    k.dataset.comp = '1';
    k.insertAdjacentHTML('afterbegin', `<span class="kico" aria-hidden="true">${KPI_ICO[c.id] || '•'}</span>`);
    if (KPI_TXT[c.id]) k.insertAdjacentHTML('beforeend', `<em class="kdesc">${esc(KPI_TXT[c.id])}</em>`);
  });
}

/* ---------------- alertas: ventana clara, con qué significa y qué hacer ---------------- */

const EXPLICA_ALERTA = [
  [/sin comercial/i, 'Ventas de médicos que no están en la cartera de ningún comercial: nadie cobra comisión por ellas.', 'Asigna un comercial desde la ficha del médico.'],
  [/más de una cartera/i, 'El mismo médico aparece en la cartera de varias personas.', 'Deja una sola persona desde Administración → Usuarios → Asignar.'],
  [/otra cartera|otro comercial/i, 'Un comercial ha visitado médicos que lleva otra persona.', 'Revisa si hay que cambiar la cartera o coordinar las visitas.'],
  [/dos personas|14 días/i, 'Dos personas han visitado al mismo médico en pocos días.', 'Coordina quién lo lleva para no repetir visitas.'],
  [/sin médico|sin atribuir/i, 'Pedidos validados que no tienen médico: no cuentan como prescripción.', 'Ábrelos y asigna el médico que lo recomendó.'],
  [/stock|caduc/i, 'Productos con pocas unidades o lotes próximos a caducar.', 'Revisa el stock y prepara un pedido de compra.'],
  [/compra|recepci/i, 'Pedidos de compra pendientes de recibir.', 'Registra la recepción cuando llegue la mercancía.']
];
document.addEventListener('click', e => {
  const s = e.target.closest('#iniextra details.alerta2 > summary'); if (!s) return;
  e.preventDefault(); e.stopImmediatePropagation();
  const det = s.parentElement, items = [...det.querySelectorAll(':scope > div > .item, :scope .lista > .item')];
  const titulo = s.textContent.replace(/\s+/g, ' ').replace(/^\s*\d+\s*/, '').replace(/\bequipo\b\s*$/, '').trim();
  const exp = EXPLICA_ALERTA.find(x => x[0].test(titulo)) || [null, 'Casos que conviene revisar.', 'Pulsa cada uno para abrirlo.'];
  items.forEach(x => { x.dataset.alclave = claveAlerta(titulo, x); });
  $('dbody').innerHTML = `<div class="fh"><div><h2>${esc(titulo)}</h2><div class="sm">${num(items.length)} ${items.length === 1 ? 'caso' : 'casos'}</div></div>
    <button class="x" data-cerrar aria-label="Cerrar">✕</button></div>
    <div class="alinfo"><div><b>Qué significa</b><span>${esc(exp[1])}</span></div><div><b>Qué hacer</b><span>${esc(exp[2])}</span></div></div>
    ${items.length > 8 ? '<input id="alq" type="search" placeholder="Buscar en la lista" style="margin:10px 0 4px">' : ''}
    <div class="alcards" id="allista"></div><div id="alpag"></div>`;
  let pag = 0;
  const pinta = () => {
    const q = ($('alq') ? $('alq').value : '').trim().toLowerCase(), f = items.filter(x => !q || x.textContent.toLowerCase().includes(q)), tam = 10;
    $('allista').innerHTML = f.slice(pag * tam, pag * tam + tam).map((x, i) => {
      const tit = (x.querySelector('.tx b') || x.querySelector('b') || x).textContent.trim();
      const sub = [...x.querySelectorAll('.tx .sm, .sm')].map(y => y.textContent.trim()).filter(Boolean)[0] || '';
      const cant = (x.querySelector(':scope > b, .n, .cnt') || {}).textContent || '';
      const acc = x.dataset.inificha ? ['Abrir ficha', 'inificha', x.dataset.inificha] : x.dataset.iniped ? ['Abrir pedido', 'iniped', x.dataset.iniped]
        : x.dataset.inistock ? ['Ver stock', 'inistock', x.dataset.inistock] : x.dataset.inicomp ? ['Abrir compra', 'inicomp', x.dataset.inicomp] : null;
      return `<div class="alcard" data-clave="${esc(claveAlerta(titulo, x))}" data-titulo="${esc(titulo)}"><div class="alc1"><b>${esc(tit)}</b>${cant && cant !== tit ? `<span class="pill p-per">${esc(cant)}</span>` : ''}</div>
        ${sub && sub !== tit ? `<div class="sm">${esc(sub)}</div>` : ''}
        <div class="alacts">${acc ? `<button class="btn sec" data-alacc="${acc[1]}" data-id="${acc[2]}">${acc[0]}</button>` : ''}<button class="btn sec" data-aloc="menu">Ocultar…</button></div>
        <div class="alocmenu hide"><span class="sm">Ocultar este caso:</span><button class="kcfg" data-aloc="7">7 días</button><button class="kcfg" data-aloc="30">30 días</button><button class="kcfg" data-aloc="siempre">Para siempre</button></div></div>`;
    }).join('') || '<div class="vacio">Sin coincidencias.</div>';
    $('allista').querySelectorAll('[data-alacc]').forEach(b => b.onclick = () => {
      const id = b.dataset.id;
      if (b.dataset.alacc === 'inificha') { $('dlg').close(); abrirFicha(id); }
      if (b.dataset.alacc === 'iniped') verPedido(id);
      if (b.dataset.alacc === 'inistock') { $('dlg').close(); PSEC = 'stock'; ir('productos'); }
      if (b.dataset.alacc === 'inicomp') editorCompra(id);
    });
    paginador($('alpag'), f.length, pag, p => { pag = p; pinta(); }, () => { pag = 0; pinta(); });
  };
  if ($('alq')) $('alq').oninput = () => { pag = 0; pinta(); };
  pinta(); $('dlg').showModal();
}, true);

/* ---------------- compartir la semana: con el menú del sistema ---------------- */

async function enviarPorWhatsapp(texto) {
  if (navigator.share) {
    try { await navigator.share({ text: texto }); toast('Elige WhatsApp y el contacto o grupo'); return; }
    catch (e) { if (e && e.name === 'AbortError') return; }
  }
  // Sin menú del sistema: se abre WhatsApp en la misma ventana (sin dejar una pantalla en blanco)
  location.href = 'https://wa.me/?text=' + encodeURIComponent(texto);
}
document.addEventListener('click', e => {
  const b = e.target.closest('#shsend'); if (!b || !$('shtxt') || $('shto')) return;
  e.preventDefault(); e.stopImmediatePropagation();
  enviarPorWhatsapp($('shtxt').value);
}, true);
new MutationObserver(() => {
  const b = $('shsend');
  if (b && !$('shto') && !b.dataset.wa) {
    b.dataset.wa = '1'; b.textContent = 'Enviar por WhatsApp…';
    b.closest('.acts').insertAdjacentHTML('beforebegin', '<p class="sm" style="margin:8px 0 0">Se abre el menú para compartir: elige WhatsApp y después el contacto o el grupo. Si prefieres, cópialo y pégalo tú.</p>');
  }
}).observe(document.body, { childList: true, subtree: true });

/* ---------------- asignar comercial: solo perfiles de tipo Comercial ---------------- */

new MutationObserver(() => {
  ['fcomsel', 'ecom'].forEach(id => {
    const s = $(id); if (!s || s.dataset.soloCom || s.options.length < 2) return;
    s.dataset.soloCom = '1';
    [...s.options].forEach(o => { if (o.value && !/· Comercial$/.test(o.textContent) && !o.selected) o.remove(); });
    [...s.options].forEach(o => o.textContent = o.textContent.replace(/ · Comercial$/, ''));
  });
}).observe(document.body, { childList: true, subtree: true });

/* ---------------- ficha del médico: unidades por periodo ---------------- */

abrirFicha = (orig => async function (id, ...r) {
  await orig(id, ...r);
  if (FICHA_ID !== id || !$('fbody') || $('fundades')) return;
  const { data: u } = await RPC_ORIG('unidades_medico', { p_medico: id });
  if (!u || FICHA_ID !== id || $('fundades')) return;
  const max = Math.max(1, ...(u.meses || []).map(m => m.unidades));
  const bloque = `<div class="blk" id="fundades"><h3>Unidades pautadas</h3>
    <div class="uper">${[['Hoy', u.hoy], ['Semana', u.semana], ['Mes', u.mes], ['Trimestre', u.trimestre], ['Año', u.anio], ['Total', u.total]]
      .map(([t, v]) => `<div><b>${num(v)}</b><span>${t}</span></div>`).join('')}</div>
    <div class="spark" title="Últimos 12 meses">${(u.meses || []).map(m => `<i style="height:${Math.round(m.unidades / max * 100)}%" title="${periodoTxt(m.mes)}: ${num(m.unidades)}"></i>`).join('')}</div>
    <div class="sm">${u.total ? `${num(u.pautas)} pautas · última el ${fechaCorta(u.ultima)} · barras: últimos 12 meses` : 'Todavía sin pautas registradas.'}</div></div>`;
  const ref = $('fbody').querySelector('.blk:nth-of-type(2)') || $('fbody').lastElementChild;
  ref.insertAdjacentHTML('beforebegin', bloque);
})(abrirFicha);

/* ---------------- Analítica: la tabla mensual explicada ---------------- */

pintarTablaAnalitica = (orig => async function () {
  await orig();
  const caja = $('atabla2'); if (!caja || !caja.querySelector('.thead')) return;
  const dim = $('adim') ? $('adim').selectedOptions[0].textContent.toLowerCase() : 'concepto';
  const med = $('amedida') && $('amedida').value === 'importe' ? 'importe sin IVA' : 'unidades vendidas';
  caja.insertAdjacentHTML('afterbegin', `<div class="tabinfo"><b>Tabla mensual de ${esc(med)} por ${esc(dim.replace(/^por /, ''))}</b>
    <span>Cada fila es un ${esc(dim.replace(/^por /, ''))} y cada columna un mes del periodo elegido. La última columna suma la fila y la última fila suma cada mes. «·» = sin ventas ese mes. Cuanto más intenso el azul, más alto el valor.</span></div>`);
  caja.querySelectorAll('.thead .tcell.th').forEach(c => { const m = c.textContent.match(/^(\d{2})\/(\d{2})$/); if (m) c.textContent = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][+m[1] - 1] + ' ' + m[2]; });
  const filas = [...caja.querySelectorAll('.trow:not([data-fijo])')], vals = [];
  filas.forEach(f => [...f.children].slice(1, -1).forEach(c => vals.push(parseFloat(c.textContent.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '')) || 0)));
  const max = Math.max(1, ...vals);
  filas.forEach(f => [...f.children].slice(1, -1).forEach(c => {
    const v = parseFloat(c.textContent.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '')) || 0;
    if (v) c.style.background = `rgba(46,134,201,${(0.08 + v / max * 0.42).toFixed(2)})`;
  }));
})(pintarTablaAnalitica);

/* ---------------- Manual: buscador con resultados directos ---------------- */

cargarManual = (orig => async function () {
  await orig();
  const q = $('manq'); if (!q) return;
  q.insertAdjacentHTML('afterend', '<div class="manres hide" id="manres"></div>');
  const quitar = s => String(s).replace(/<[^>]+>/g, '');
  const norm = s => quitar(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const indice = [];
  MANUAL.forEach(s => {
    indice.push({ sec: s.id, mod: s.t, txt: s.para });
    s.hacer.forEach(h => indice.push({ sec: s.id, mod: s.t, txt: h[1] }));
    (s.config || []).forEach(c => indice.push({ sec: s.id, mod: s.t, txt: 'Dónde se configura: ' + c }));
    const ay = AYUDA[s.id]; if (ay && ay[2]) ay[2].forEach(x => indice.push({ sec: s.id, mod: s.t, txt: quitar(x) }));
  });
  FAQ.forEach(([p, r]) => indice.push({ sec: null, mod: 'Pregunta frecuente', txt: p + ' — ' + r }));
  q.oninput = () => {
    const t = norm(q.value.trim()), res = $('manres');
    document.querySelectorAll('.mancard').forEach(c => c.classList.remove('hide'));
    if (t.length < 2) { res.classList.add('hide'); return; }
    const palabras = t.split(/\s+/);
    const hits = indice.filter(x => palabras.every(p => norm(x.txt + ' ' + x.mod).includes(p))).slice(0, 12);
    res.classList.remove('hide');
    res.innerHTML = hits.length ? hits.map(h => {
      let txt = esc(quitar(h.txt)); palabras.forEach(p => { txt = txt.replace(new RegExp('(' + p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'), '<mark>$1</mark>'); });
      return `<button class="manhit" ${h.sec ? `data-mansec2="${h.sec}"` : ''}><span class="mhm">${esc(h.mod)}</span><span>${txt}</span></button>`;
    }).join('') : `<div class="manhit">No hay resultados para «${esc(q.value)}». Prueba con otra palabra: cita, ruta, pedido, factura…</div>`;
    res.querySelectorAll('[data-mansec2]').forEach(b => b.onclick = () => { res.classList.add('hide'); const c = document.querySelector(`.mancard[data-mansec="${b.dataset.mansec2}"]`); if (c) c.click(); });
  };
})(cargarManual);

/* ---------------- Configuración: todo en un único sitio ---------------- */

cargarConfig = async function () {
  const admin = PERFIL.rol === 'Administrador';
  const grupos = [
    ['Tu cuenta', [
      ['prefs', '📍', 'Mis preferencias', 'Punto de salida, navegación, plantillas y jornada', () => { $('cfgcuerpo').innerHTML = ''; pintarPrefs(); }],
      ['horario', '🕘', 'Horario de las rutas', 'Hora de salida, vuelta y tiempos por visita', () => abrirHorarioPlan()],
      ['kpis', '📊', 'Indicadores de Inicio', 'Qué indicadores ves y en qué orden', () => abrirKpis()]]],
    ['Base de datos', puedeCatalogos() ? [
      ['cat', '🏷️', 'Clasificadores', 'Listas de valores: especialidades, motivos, formas de pago…', () => { $('cfgcuerpo').innerHTML = ''; pintarCatalogos(); }]] : []],
    ['Equipo y cartera', admin ? [
      ['usuarios', '👥', 'Usuarios y permisos', 'Altas, roles, permisos por módulo y zonas', () => { ADM_SEC = 'usuarios'; ir('admin'); }],
      ['reglas', '🧭', 'Reglas de cartera', 'Cartera exclusiva y cómo se asignan los médicos', () => editorReglasCartera()],
      ['frec', '🔁', 'Frecuencia de visita', 'Cada cuánto hay que visitar a cada médico', () => editorFrecuencia()],
      ['comis', '€', 'Comisiones', 'Esquemas y quién cobra con cada uno', () => { ADM_SEC = 'comisiones'; ir('admin'); }]] : []],
    ['Stock', admin || nivelDe2('P') >= 3 ? [
      ['alm', '🏬', 'Almacenes', 'Central y almacenes de cada comercial', () => editorAlmacenes()],
      ['mues', '🎁', 'Material y muestras', 'Qué se entrega en las visitas y si descuenta stock', () => editorMuestras()]] : []],
    ['Facturación', admin ? [
      ['fiscal', '🏢', 'Datos fiscales', 'Emisor, IBAN, pie, vencimiento y emisión automática', () => { $('cfgcuerpo').innerHTML = '<div id="fcuerpo"></div>'; pintarEmpresa(); }],
      ['series', '#️⃣', 'Series y numeración', 'Formato y siguiente número de cada serie', () => { $('cfgcuerpo').innerHTML = '<div id="fcuerpo"></div>'; pintarSeries(); }],
      ['vf', '🔐', 'VeriFactu', 'Activación y estado del registro', () => { $('cfgcuerpo').innerHTML = '<div id="fcuerpo"></div>'; pintarVerifactu(); }]] : []]
  ].filter(g => g[1].length);
  const todas = grupos.flatMap(g => g[1]);
  if (!todas.some(x => x[0] === CFG_SEC)) CFG_SEC = 'prefs';
  $('v-config').innerHTML = `
    <div class="saludo"><div><h1>Configuración</h1><div class="fecha">Todos los ajustes de tu cuenta y de la plataforma, en un solo sitio</div></div></div>
    <div class="cfghub">
      <nav class="cfgnav">${grupos.map(([g, l]) => `<div class="cfgg"><h3>${esc(g)}</h3>${l.map(([k, ic, t, d]) =>
        `<button data-cfg="${k}" class="${CFG_SEC === k ? 'on' : ''}"><span class="ci">${ic}</span><span><b>${esc(t)}</b><em>${esc(d)}</em></span></button>`).join('')}</div>`).join('')}</nav>
      <div id="cfgcuerpo" class="cfgcuerpo"></div></div>`;
  let inicial = true;
  const abrir = k => {
    const it = todas.find(x => x[0] === k); if (!it) return;
    const panel = ['prefs', 'cat', 'fiscal', 'series', 'vf'].includes(k);
    if (panel) { CFG_SEC = k; document.querySelectorAll('[data-cfg]').forEach(b => b.classList.toggle('on', b.dataset.cfg === k)); }
    it[4]();
    if (panel && ES_MOVIL() && !inicial) setTimeout(() => $('cfgcuerpo').scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };
  document.querySelectorAll('[data-cfg]').forEach(b => b.onclick = () => abrir(b.dataset.cfg));
  abrir(['prefs', 'cat', 'fiscal', 'series', 'vf'].includes(CFG_SEC) ? CFG_SEC : 'prefs');
  inicial = false;
};

/* ---------------- Administración en el móvil: cada persona como tarjeta ---------------- */

new MutationObserver(() => {
  if (TAB !== 'admin' || !ES_MOVIL() || ADM_SEC !== 'usuarios') return;
  document.querySelectorAll('#admcuerpo .lista > .item').forEach(it => {
    if (it.dataset.movil) return; it.dataset.movil = '1';
    const acts = it.querySelector('.acts'); if (!acts) return;
    acts.classList.add('hide');
    it.insertAdjacentHTML('beforeend', '<button class="btn sec umas" aria-label="Acciones">Gestionar</button>');
    it.querySelector('.umas').onclick = () => {
      const nombre = it.querySelector('.tx b').textContent;
      $('dbody').innerHTML = `<div class="fh"><div><h2>${esc(nombre)}</h2><div class="sm">${esc(it.querySelector('.tx .sm').textContent)}</div></div>
        <button class="x" data-cerrar aria-label="Cerrar">✕</button></div>
        <div class="accsheet">${[...acts.querySelectorAll('button')].map((b, i) => `<button class="btn sec" data-accn="${i}">${b.innerHTML}</button>`).join('')}</div>`;
      $('dlg').showModal();
      $('dbody').querySelectorAll('[data-accn]').forEach(x => x.onclick = () => { const o = acts.querySelectorAll('button')[+x.dataset.accn]; $('dlg').close(); setTimeout(() => o.click(), 50); });
    };
  });
}).observe(document.querySelector('main'), { childList: true, subtree: true });


/* ============================================================
   DLC OS 2.0 · v2.38.0 · Llamada → cliente → pedido en un solo flujo,
   seguimientos de quien no compra, análisis por comercial, personas
   del esquema de comisión dentro del propio esquema, producto habitual
   en los pedidos nuevos y selector de fecha junto a su campo
   ============================================================ */

Object.assign(RPC_TTL, { llamadas_seguimiento: 20 });

/* ---------------- pedidos: producto habitual y líneas siempre con su producto ---------------- */

function productoPorDefecto() {
  const lista = PRODUCTOS.filter(p => p.tipo !== 'servicio');
  const hab = localStorage.getItem('dlc-prod-habitual');
  return (lista.find(p => p.id === hab) || lista[0] || {}).id || '';
}
function opcionesProducto(id, nombre) {
  const lista = PRODUCTOS.filter(p => p.tipo !== 'servicio' || p.id === id);
  const falta = id && !lista.some(p => p.id === id);
  return (falta ? `<option value="${id}" selected>${esc(nombre || 'Producto del pedido')}</option>` : '') +
    lista.map(p => `<option value="${p.id}" ${p.id === id ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('')
    || '<option value="">Sin productos: créalos primero</option>';
}
// Se recuerda el producto del último pedido guardado para proponerlo en el siguiente
const RPC_V2370 = db.rpc;
db.rpc = function (fn, params, opts) {
  const b = RPC_V2370.call(db, fn, params, opts);
  if (fn !== 'guardar_pedido') return b;
  try { const l = ((params || {}).p || {}).lineas || []; if (l[0] && l[0].producto_id) localStorage.setItem('dlc-prod-habitual', l[0].producto_id); } catch (e) {}
  if (!LLAMADA_PEND) return b;
  // Pedido creado desde una llamada: queda enlazado con ella
  return conCatch(Promise.resolve(b).then(async res => {
    if (!res.error && res.data && res.data.ok && res.data.id && LLAMADA_PEND) {
      await RPC_ORIG('vincular_llamada_pedido', { p_llamada: LLAMADA_PEND, p_pedido: res.data.id });
      LLAMADA_PEND = null; toast('Pedido enlazado con la llamada');
    }
    return res;
  }));
};
let LLAMADA_PEND = null;

/* ---------------- selector de fecha: siempre junto a su campo ---------------- */

colocarPop = (orig => function (pop, ref) {
  const d = $('seldlg');
  d.style.right = 'auto'; d.style.bottom = 'auto';
  orig(pop, ref);
})(colocarPop);

/* ---------------- llamadas: cliente, médico, resultado y pedido en un flujo ---------------- */

async function buscarClientes(q) {
  const t = q.trim().replace(/[,()]/g, ' ');
  if (t.length < 2) return [];
  const { data } = await db.from('contactos').select('id,nombre,telefono,movil,email,nif,medico_id')
    .or(`nombre.ilike.%${t}%,telefono.ilike.%${t}%,movil.ilike.%${t}%,nif.ilike.%${t}%`).limit(8);
  return data || [];
}

editorLlamada = async function (l, previa) {
  await catLlamadas();
  l = l || { direccion: 'Entrante', fecha: new Date().toISOString() };
  let cliente = l.contacto_id ? { id: l.contacto_id, nombre: l.cliente || l.nombre } : null, nuevo = !cliente && !l.id;
  let medico = l.medico_id ? { id: l.medico_id, nombre: l.medico } : null;
  const f = new Date(l.fecha), local = new Date(f.getTime() - f.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const chips = (cat, v, attr) => (CAT[cat] || []).map(x => `<button type="button" class="chipsel ${x.valor === v ? 'on' : ''} ${x.extra === 'neg' ? 'neg' : x.extra === 'pos' ? 'pos' : ''}" ${attr}="${esc(x.valor)}">${esc(x.valor)}</button>`).join('');
  $('dbody').innerHTML = `
    <div class="fh"><div><h2>${l.id ? 'Llamada' : previa ? 'Seguimiento de la llamada' : 'Registrar llamada'}</h2>
      <div class="sm">${previa ? 'Vuelves a llamar a ' + esc(previa.cliente || previa.nombre || '') : 'Aunque no acabe en pedido: así se ve por qué no compran'}</div></div>
      <button class="x" data-cerrar aria-label="Cerrar">✕</button></div>
    <div class="llpaso"><span class="lln">1</span><b>Quién llama</b>
      <div class="segm2"><button type="button" data-lmodo="exist" class="${nuevo ? '' : 'on'}">Cliente existente</button><button type="button" data-lmodo="nuevo" class="${nuevo ? 'on' : ''}">Cliente nuevo</button></div>
      <div id="llcli"></div></div>
    <div class="llpaso"><span class="lln">2</span><b>Médico que lo recomienda</b><div id="llmed"></div>
      <div class="sm" style="margin-top:4px">Si no está en la base, escribe su nombre: se guarda igualmente para las métricas.</div></div>
    <div class="llpaso"><span class="lln">3</span><b>Motivo</b><div class="chipsw" id="llmot">${chips('MOTIVO_LLAMADA', l.motivo, 'data-lm')}</div></div>
    <div class="llpaso"><span class="lln">4</span><b>Resultado</b><div class="chipsw" id="llres">${chips('RESULTADO_LLAMADA', l.resultado, 'data-lr')}</div>
      <div id="llseg" class="${!l.resultado || l.resultado === 'Pedido hecho' ? 'hide' : ''}">
        <div class="sm" style="margin:8px 0 4px">¿Cuándo volver a llamar?</div>
        <div class="chipsw">${[['Mañana', 1], ['En 3 días', 3], ['En una semana', 7], ['En un mes', 30]].map(([t, d]) => `<button type="button" class="chipsel" data-ld="${d}">${t}</button>`).join('')}</div>
        <div class="g2" style="margin-top:6px"><div><input id="llpf" type="date" value="${esc(l.proxima_fecha || '')}"></div>
          <div><input id="llpa" value="${esc(l.proxima_accion || '')}" placeholder="p. ej. Enviarle el precio por WhatsApp"></div></div></div></div>
    <details class="llmas"><summary>Más detalles</summary>
      <div class="g2"><div><label for="llf">Fecha y hora</label><input id="llf" type="datetime-local" value="${local}"></div>
        <div><label for="lld">Tipo</label><select id="lld"><option ${l.direccion === 'Entrante' ? 'selected' : ''}>Entrante</option><option ${l.direccion === 'Saliente' || previa ? 'selected' : ''}>Saliente</option></select></div></div>
      <label for="llno">Nota</label><textarea id="llno" rows="2">${esc(l.nota || '')}</textarea></details>
    <div class="acts" style="justify-content:flex-end;flex-wrap:wrap"><button class="btn sec" data-cerrar>Cancelar</button>
      <button class="btn sec" id="llok">Guardar</button>${l.pedido_id ? '' : '<button class="btn" id="llped">🛒 Guardar y crear pedido</button>'}</div>`;
  $('dlg').showModal();
  let motivo = l.motivo || '', resultado = l.resultado || '';
  const pintaCli = () => {
    const c = $('llcli');
    if (nuevo) {
      c.innerHTML = `<div class="g2"><div><input id="lcn" placeholder="Nombre y apellidos" value="${esc(l.nombre || '')}"></div>
        <div><input id="lct" placeholder="Teléfono" inputmode="tel" value="${esc(l.telefono || '')}"></div></div>
        <div class="g2"><div><input id="lce" type="email" placeholder="Email (para la factura)"></div><div><input id="lcd" placeholder="DNI (opcional)"></div></div>
        <div class="sm">Si hace el pedido, se da de alta como cliente con su médico.</div>`;
    } else if (cliente) {
      c.innerHTML = `<div class="clisel"><span><b>${esc(cliente.nombre)}</b><span class="sm">${esc(cliente.tel || cliente.telefono || '')}</span></span><button type="button" class="btn sec" id="lccambia">Cambiar</button></div>`;
      $('lccambia').onclick = () => { cliente = null; pintaCli(); };
    } else {
      c.innerHTML = `<input id="lcq" type="search" placeholder="Nombre, teléfono o DNI" autocomplete="off"><div class="lista" id="lcres"></div>`;
      let tq;
      $('lcq').oninput = () => { clearTimeout(tq); tq = setTimeout(async () => {
        const r = await buscarClientes($('lcq').value);
        $('lcres').innerHTML = r.map(x => `<button type="button" class="item" data-lcid="${x.id}"><span class="tx"><b>${esc(x.nombre)}</b><span class="sm">${esc([x.movil || x.telefono, x.nif].filter(Boolean).join(' · '))}</span></span></button>`).join('')
          || ($('lcq').value.trim().length > 1 ? '<div class="sm" style="padding:6px">No existe: usa «Cliente nuevo».</div>' : '');
        $('lcres').querySelectorAll('[data-lcid]').forEach(b => b.onclick = async () => {
          const x = r.find(y => y.id === b.dataset.lcid); cliente = { id: x.id, nombre: x.nombre, tel: x.movil || x.telefono };
          if (x.medico_id && !medico) { const { data: m } = await db.from('medicos').select('id,nombre').eq('id', x.medico_id).single(); if (m) { medico = m; pintaMed(); } }
          pintaCli();
        });
      }, 250); };
    }
  };
  const pintaMed = () => { $('llmed').innerHTML = ''; $('llmed').__texto = medico ? '' : (l.medico_texto || ''); selectorMedico($('llmed'), { valor: medico, placeholder: 'Nombre, código, centro o municipio', alElegir: m => { medico = m; } }); };
  pintaCli(); pintaMed();
  $('dbody').querySelectorAll('[data-lmodo]').forEach(b => b.onclick = () => { nuevo = b.dataset.lmodo === 'nuevo'; if (!nuevo) cliente = null;
    $('dbody').querySelectorAll('[data-lmodo]').forEach(x => x.classList.toggle('on', x === b)); pintaCli(); });
  $('llmot').onclick = e => { const b = e.target.closest('[data-lm]'); if (!b) return; motivo = motivo === b.dataset.lm ? '' : b.dataset.lm;
    $('llmot').querySelectorAll('[data-lm]').forEach(x => x.classList.toggle('on', x.dataset.lm === motivo)); };
  const pasoRes = $('llres').closest('.llpaso');
  pasoRes.onclick = e => {
    const d = e.target.closest('[data-ld]');
    if (d) { const f2 = new Date(); f2.setDate(f2.getDate() + +d.dataset.ld); $('llpf').value = fechaLocal(f2); pasoRes.querySelectorAll('[data-ld]').forEach(x => x.classList.toggle('on', x === d)); return; }
    const b = e.target.closest('[data-lr]'); if (!b) return; resultado = resultado === b.dataset.lr ? '' : b.dataset.lr;
    $('llres').querySelectorAll('[data-lr]').forEach(x => x.classList.toggle('on', x.dataset.lr === resultado));
    $('llseg').classList.toggle('hide', !resultado || resultado === 'Pedido hecho');
  };
  const guardar = async conPedido => {
    const datosNuevo = nuevo && $('lcn') ? { nombre: $('lcn').value.trim(), telefono: $('lct').value.trim(), email: $('lce').value.trim(), nif: $('lcd').value.trim() } : null;
    if (conPedido && !cliente && !(datosNuevo && datosNuevo.nombre)) { toast('Indica el cliente: búscalo o escribe su nombre', true); return null; }
    const { data: r, error } = await db.rpc('guardar_llamada', { p: { id: l.id || null, fecha: $('llf').value ? new Date($('llf').value).toISOString() : null,
      direccion: $('lld').value, nombre: datosNuevo ? datosNuevo.nombre : (cliente ? cliente.nombre : l.nombre || ''), telefono: datosNuevo ? datosNuevo.telefono : (cliente ? cliente.tel || '' : l.telefono || ''),
      contacto_id: cliente ? cliente.id : null, cliente_nuevo: conPedido ? datosNuevo : null, medico_id: medico ? medico.id : null,
      medico_texto: medico ? '' : ($('llmed').__texto || '').trim(), motivo, resultado: conPedido ? (resultado || 'Pedido hecho') : resultado,
      proxima_accion: $('llpa') ? $('llpa').value.trim() : '', proxima_fecha: resultado && resultado !== 'Pedido hecho' && !conPedido ? ($('llpf').value || '') : '',
      nota: $('llno').value.trim(), pedido_id: l.pedido_id || null, llamada_origen: previa ? previa.id : null } });
    if (error || (r && r.ok === false)) { toast('No se ha podido guardar' + (error ? ': ' + error.message : ''), true); return null; }
    return r;
  };
  $('llok').onclick = async () => { const r = await guardar(false); if (!r) return; $('dlg').close(); toast('Llamada registrada'); if (TAB === 'ventas' && PEDSEC === 'llamadas') pintarLlamadas(); };
  if ($('llped')) $('llped').onclick = async () => {
    const r = await guardar(true); if (!r) return;
    LLAMADA_PEND = r.id;
    let cli = null;
    if (r.contacto_id) { const { data: c } = await db.from('contactos').select('id,nombre,nif,email,telefono,movil,medico_id').eq('id', r.contacto_id).single(); cli = c; }
    $('dlg').close();
    await editorPedido({ contacto: cli ? Object.assign(cli, { medico: medico ? medico.nombre : '' }) : null, medico: medico ? { id: medico.id, nombre: medico.nombre } : null });
  };
};

// Pestaña Llamadas: seguimientos pendientes arriba y análisis ampliado
pintarLlamadas = (orig => async function () {
  await orig();
  const { data: seg } = await RPC_ORIG('llamadas_seguimiento', {});
  const l = seg || [], hoy = hoyISO();
  if (!$('lltot')) return;
  if (l.length && !$('llsegs')) {
    $('lltot').insertAdjacentHTML('beforebegin', `<div class="card" id="llsegs"><h2>Llamadas por hacer<span class="n">${l.length}</span></h2>
      <p class="sm" style="padding:0 16px">Clientes que no compraron y a los que quedaste en volver a llamar.</p>
      <div class="lista">${l.slice(0, 20).map(x => `<div class="item" style="cursor:default">
        <span class="ic" style="${x.proxima_fecha < hoy ? 'background:#FDECEC;color:var(--dang)' : x.proxima_fecha === hoy ? 'background:#FFF4E5;color:var(--warn)' : ''}">📞</span>
        <span class="tx"><b>${esc(x.cliente || x.nombre || 'Sin nombre')}</b>
          <span class="sm">${x.proxima_fecha < hoy ? '<b style="color:var(--dang)">Atrasada · </b>' : x.proxima_fecha === hoy ? '<b style="color:var(--warn)">Hoy · </b>' : fechaCorta(x.proxima_fecha) + ' · '}${esc(x.resultado || '')}${x.proxima_accion ? ' · ' + esc(x.proxima_accion) : ''}${x.medico ? ' · de ' + esc(x.medico) : ''}</span></span>
        <span class="acts" style="margin:0;flex-wrap:nowrap">${(x.tel_cliente || x.telefono) ? `<a class="btn sec" href="tel:${esc(x.tel_cliente || x.telefono)}">Llamar</a>` : ''}
          <button class="btn" data-llseg="${x.id}">Registrar</button><button class="btn sec" data-llok="${x.id}" title="Ya no hace falta">✓</button></span></div>`).join('')}</div></div>`);
    $('llsegs').querySelectorAll('[data-llseg]').forEach(b => b.onclick = () => { const x = l.find(y => y.id === b.dataset.llseg);
      editorLlamada({ direccion: 'Saliente', fecha: new Date().toISOString(), contacto_id: x.contacto_id, cliente: x.cliente, nombre: x.nombre, telefono: x.telefono, medico_id: x.medico_id, medico: x.medico, motivo: 'Seguimiento de televenta' }, x); });
    $('llsegs').querySelectorAll('[data-llok]').forEach(b => b.onclick = async () => { await db.rpc('marcar_seguimiento', { p_id: b.dataset.llok, p_hecho: true }); toast('Seguimiento cerrado'); pintarLlamadas(); });
  }
  // Se espera a que la pestaña termine de pintar su análisis para añadir el resto
  for (let i = 0; i < 40 && $('llres2') && $('llres2').children.length < 2; i++) await new Promise(r => setTimeout(r, 100));
  const r = $('llper').__rango();
  const { data: s } = await RPC_ORIG('llamadas_resumen', { p_desde: r.desde, p_hasta: r.hasta });
  if (!s || !$('llres2') || $('llcom')) return;
  $('llres2').insertAdjacentHTML('beforeend', `
    <div class="card ancard" id="llcom"><h2>Por comercial del médico</h2>${(s.por_comercial || []).length ? `<div class="barrash">${s.por_comercial.map(x => `<div class="bh"><span class="bhn">${esc(x.comercial)}</span>
        <span class="bhb"><i style="width:${Math.max(3, x.n / s.por_comercial[0].n * 100)}%"></i></span><b>${num(x.pedidos)}/${num(x.n)}</b></div>`).join('')}</div>` : vacioGrafico('Aparecerá cuando haya llamadas con médico.')}
      <p class="leer"><b>Cómo leerlo:</b> pedidos sobre llamadas de pacientes que vienen de médicos de cada comercial. Mide el volumen que genera el trabajo de cada zona.</p></div>
    <div class="card ancard"><h2>Por qué no compran</h2>${(s.no_compra || []).length ? barrasH(s.no_compra.map(x => ({ n: x.resultado, v: x.n })), num) : vacioGrafico('Sin llamadas sin compra en el periodo.')}
      <p class="leer"><b>Qué hacer:</b> «Precio» pide revisar condiciones o argumentario; «Se lo piensa» y «Pagará más tarde» deben tener seguimiento programado (${num(s.seguimientos || 0)} pendientes).</p></div>`);
})(pintarLlamadas);

// Accesos a «Registrar llamada» desde Pedidos (ventas) y desde la ficha del cliente
cargarVentas = (orig => async function () {
  await orig();
  if (!VE_TODO() || PEDSEC !== 'ventas') return;
  const acts = $('v-ventas').querySelector('.saludo .acts');
  if (acts && !$('pedllam')) {
    acts.insertAdjacentHTML('afterbegin', '<button class="btn sec" id="pedllam">📞 Registrar llamada</button>');
    $('pedllam').onclick = () => editorLlamada(null);
  }
})(cargarVentas);

// Inicio: llamadas de seguimiento para hoy (televenta y administración)
pintarInicio = (orig => async function () {
  await orig();
  if (TAB !== 'inicio' || !VE_TODO() || !$('iniextra') || $('inillam')) return;
  const { data } = await RPC_ORIG('llamadas_seguimiento', {});
  const hoy = hoyISO(), pend = (data || []).filter(x => x.proxima_fecha <= hoy);
  if (!pend.length || $('inillam')) return;
  $('iniextra').insertAdjacentHTML('afterbegin', `<div class="card" id="inillam"><h2>Llamadas para hoy<span class="n">${pend.length}</span></h2>
    <p class="sm" style="padding:0 16px">Clientes a los que quedaste en volver a llamar${pend.some(x => x.proxima_fecha < hoy) ? ', algunas atrasadas' : ''}.</p>
    <div class="acts" style="padding:0 16px 14px"><button class="btn sec" id="inillamver">Ver llamadas</button></div></div>`);
  $('inillamver').onclick = () => { PEDSEC = 'llamadas'; ir('ventas'); };
})(pintarInicio);

/* ---------------- comisiones: quién cobra, dentro del propio esquema ---------------- */

pintarComisiones = (orig => async function () {
  await orig();
  const a = $('asigesq'); if (a) a.remove();      // ya no va fuera: se gestiona dentro de cada esquema
})(pintarComisiones);

async function personasEsquema(id) {
  const ref = $('eguardaresq') && $('eguardaresq').closest('.acts');
  if (!ref || $('esqpers')) return;
  if (!id) { ref.insertAdjacentHTML('beforebegin', '<div class="blk" id="esqpers"><h3>Quién cobra con este esquema</h3><p class="sm">Guarda el esquema y después podrás asignarlo a las personas.</p></div>'); return; }
  ref.insertAdjacentHTML('beforebegin', '<div class="blk" id="esqpers"><h3>Quién cobra con este esquema</h3><div id="esqlista" class="sm">Cargando…</div></div>');
  if (!COMS.length) await cargarComerciales();
  const pinta = async () => {
    const { data } = await db.rpc('asignaciones_esquema_lista');
    const l = (data || []).filter(x => x.esquema_id === id), hoy = hoyISO(), admin = PERFIL.rol === 'Administrador';
    if (!$('esqlista')) return;
    $('esqlista').innerHTML = `${l.length ? `<div class="esqfilas">${l.map(x => {
      const est = x.vigente ? ['Vigente', 'p-est'] : x.desde > hoy ? ['Programado', 'p-per'] : ['Terminado', 'p-anu'];
      return `<div class="esqfila"><span class="candado" title="Guardado: no se puede modificar">🔒</span>
        <span class="ef1"><b>${esc(x.persona)}</b><span class="sm">${x.desde <= '2000-01-01' ? 'Todo el histórico' : 'Desde ' + fechaCorta(x.desde)}${x.hasta ? ' hasta ' + fechaCorta(x.hasta) : ''}</span></span>
        <span class="pill ${est[1]}">${est[0]}</span>
        ${admin && x.vigente ? `<button type="button" class="kcfg" data-efin="${x.usuario_id}">Terminar hoy</button>` : ''}
        ${admin && x.desde > hoy ? `<button type="button" class="kcfg" data-equi="${x.usuario_id}" data-edesde="${x.desde}">Anular</button>` : ''}</div>`;
    }).join('')}</div>` : '<p class="sm">Nadie cobra todavía con este esquema.</p>'}
    ${admin ? `<div class="esqadd"><select id="eap"><option value="">Añadir persona…</option>${COMS.filter(u => ['Comercial', 'Televenta'].includes(u.rol)).map(u => `<option value="${u.id}">${esc(u.nombre)}</option>`).join('')}</select>
      <select id="eadm"><option value="hoy">desde hoy</option><option value="todo">todo su histórico</option><option value="fecha">desde una fecha…</option></select>
      <span id="eadfw" class="hide"><input id="eadf" type="date" value="${hoy}"></span>
      <button type="button" class="btn sec" id="eaok">Asignar</button></div>
      <p class="sm" style="margin-top:6px">Una vez guardada, la asignación queda bloqueada 🔒. Para cambiarla, asigna otro esquema: el anterior termina el día antes.</p>` : ''}`;
    if (!admin) return;
    $('eadm').onchange = () => $('eadfw').classList.toggle('hide', $('eadm').value !== 'fecha');
    $('eaok').onclick = async () => {
      if (!$('eap').value) { toast('Elige la persona', true); return; }
      const m = $('eadm').value, desde = m === 'todo' ? '2000-01-01' : m === 'fecha' ? $('eadf').value : hoy;
      const quien = COMS.find(u => u.id === $('eap').value).nombre;
      if (!await preguntar(`${quien} cobrará con este esquema ${m === 'todo' ? 'en todo su histórico' : 'desde el ' + fechaCorta(desde)}. Si tenía otro, termina el día antes. Una vez guardado no se puede modificar.`, { titulo: '¿Asignar el esquema?', ok: 'Asignar' })) return;
      const { data: r, error } = await db.rpc('asignar_esquema', { p_usuario: $('eap').value, p_esquema: id, p_quitar: false, p_desde: desde });
      if (error || (r && r.ok === false)) { toast('No se ha podido asignar', true); return; }
      toast('Asignado a ' + quien); ESQUEMAS = []; pinta();
    };
    $('esqlista').querySelectorAll('[data-efin]').forEach(b => b.onclick = async () => {
      if (!await preguntar('Dejará de cobrar con este esquema a partir de mañana.', { titulo: '¿Terminar hoy?', ok: 'Terminar', peligro: true })) return;
      const d = new Date(); d.setDate(d.getDate() + 1);
      await db.rpc('asignar_esquema', { p_usuario: b.dataset.efin, p_esquema: null, p_quitar: true, p_desde: fechaLocal(d) }); pinta();
    });
    $('esqlista').querySelectorAll('[data-equi]').forEach(b => b.onclick = async () => {
      if (!await preguntar('Se anula la asignación programada.', { titulo: '¿Anular?', ok: 'Anular', peligro: true })) return;
      await db.rpc('asignar_esquema', { p_usuario: b.dataset.equi, p_esquema: null, p_quitar: true, p_desde: b.dataset.edesde }); pinta();
    });
  };
  pinta();
}

// En la ficha de la persona solo se informa: el esquema se gestiona en Comisiones
editarUsuario = (orig => async function (id) {
  await orig(id);
  for (let i = 0; i < 30 && !$('ucom') && $('dlg').open; i++) await new Promise(r => setTimeout(r, 100));
  const s = $('ucom'); if (!s || $('ucominfo')) return;
  const g = s.closest('.g2') || s.parentElement;
  const txt = s.selectedOptions[0] && s.value ? s.selectedOptions[0].textContent : 'Sin comisión';
  g.classList.add('hide'); if ($('ucdesde')) $('ucdesde').classList.add('hide'); if ($('uchist')) $('uchist').classList.add('hide');
  g.insertAdjacentHTML('afterend', `<div class="avisoh" id="ucominfo"><span>Comisión: <b>${esc(txt)}</b>. Se asigna dentro de cada esquema en Administración → Comisiones.</span></div>`);
})(editarUsuario);


/* ============================================================
   DLC OS 2.0 · v2.39.0 · Paradas del plan con ficha y nota,
   configuración completa en el panel (sin ventanas ni saltos),
   VeriFactu explicado, manual con explicación antes de ir,
   preferencias con contexto y limpieza para que no se acumule lentitud
   ============================================================ */

/* ---------------- rendimiento: memoria y mapas ---------------- */

// Caché del dispositivo con tope: se guardan las 60 consultas más recientes
(function limpiarCacheLocal() {
  try {
    const k = Object.keys(localStorage).filter(x => x.startsWith('dlc-rc-'));
    if (k.length > 60) {
      k.map(x => { let t = 0; try { t = JSON.parse(localStorage.getItem(x)).t || 0; } catch (e) {} return [x, t]; })
        .sort((a, b) => a[1] - b[1]).slice(0, k.length - 60).forEach(([x]) => localStorage.removeItem(x));
    }
  } catch (e) {}
  setTimeout(limpiarCacheLocal, 10 * 60 * 1000);
})();
// Cada mapa se libera cuando su pantalla desaparece (antes quedaban vivos en memoria)
if (window.L && L.map) {
  const MAPAS = new Set(), crear = L.map;
  L.map = function (el, o) {
    const c = typeof el === 'string' ? document.getElementById(el) : el;
    if (c && c.__mapa) { try { c.__mapa.remove(); } catch (e) {} MAPAS.delete(c.__mapa); }
    const m = crear.call(L, el, o); if (c) c.__mapa = m; MAPAS.add(m); return m;
  };
  setInterval(() => MAPAS.forEach(m => { const c = m.getContainer && m.getContainer(); if (!c || !c.isConnected) { try { m.remove(); } catch (e) {} MAPAS.delete(m); } }), 30000);
}

/* ---------------- plan: cada parada con la ficha y una nota ---------------- */

pintarPlan = (orig => function () {
  orig();
  if (!PLAN || !$('rplan')) return;
  const items = $('rplan').querySelectorAll('.lista > .item');
  PLAN.paradas.forEach((p, i) => {
    const it = items[i]; if (!it || it.dataset.ext) return;
    it.dataset.ext = '1';
    const tx = it.querySelector('.tx'), meds = tx.querySelectorAll('.sm')[1];
    if (meds) meds.innerHTML = p.medicos.map(m => `<button type="button" class="lnkmed" data-pfm="${m.id}" title="Abrir la ficha">${esc(m.nombre)}</button>`).join('');
    if (p.nota) tx.insertAdjacentHTML('beforeend', `<span class="sm notapar">📝 ${esc(p.nota)}</span>`);
    const acts = it.querySelector('.acts');
    acts.insertAdjacentHTML('afterbegin', `${p.medicos.length === 1 ? `<button class="btn sec" data-pfm="${p.medicos[0].id}">Ficha</button>` : ''}<button class="btn sec" data-pnota="${i}">${p.nota ? 'Editar nota' : 'Nota'}</button>`);
  });
  $('rplan').querySelectorAll('[data-pfm]').forEach(b => b.onclick = () => abrirFicha(b.dataset.pfm));
  $('rplan').querySelectorAll('[data-pnota]').forEach(b => b.onclick = async () => {
    const p = PLAN.paradas[+b.dataset.pnota];
    const t = await pedirTexto('Se guardará en la cita de cada médico de esta parada al pasar el plan a tu agenda.', p.nota || '', { titulo: 'Nota para ' + p.centro, ok: 'Guardar nota' });
    if (t === null) return; p.nota = t.trim(); pintarPlan();
  });
})(pintarPlan);

/* ---------------- Configuración: todo se muestra en el panel de la derecha ---------------- */

let PANEL_ACTIVO = null;
function salirPanel() {
  if (!PANEL_ACTIVO) return;
  if (PANEL_ACTIVO.tipo === 'dbody') { const p = document.querySelector('#cfgcuerpo [data-panel]#dbody'); if (p) p.id = ''; const r = $('dbody-modal'); if (r) r.id = 'dbody'; }
  if (PANEL_ACTIVO.tipo === 'admin') { const p = document.querySelector('#cfgcuerpo [data-panel]#v-admin'); if (p) p.id = ''; const r = $('v-admin-real'); if (r) r.id = 'v-admin'; }
  PANEL_ACTIVO = null;
}
// Las pantallas que se abrían en ventana se pintan dentro del panel
function panelDeVentana(fn) {
  salirPanel();
  const r = $('dbody'); r.id = 'dbody-modal';
  $('cfgcuerpo').innerHTML = '<div id="dbody" data-panel="1" class="cfgpanel card"></div>';
  PANEL_ACTIVO = { tipo: 'dbody', refrescar: () => panelDeVentana(fn) };
  fn();
}
function panelDeModulo(sec) {
  salirPanel();
  const r = $('v-admin'); r.id = 'v-admin-real';
  $('cfgcuerpo').innerHTML = '<div id="v-admin" data-panel="1" class="cfgpanel cfgmod"></div>';
  PANEL_ACTIVO = { tipo: 'admin' };
  ADM_SEC = sec; cargarAdmin();
}
(function () {
  const d = $('dlg'), abrir = d.showModal.bind(d), cerrar = d.close.bind(d);
  d.showModal = function () { if (PANEL_ACTIVO && PANEL_ACTIVO.tipo === 'dbody') return; abrir(); };
  d.close = function (v) {
    if (PANEL_ACTIVO && PANEL_ACTIVO.tipo === 'dbody' && !d.open) { const f = PANEL_ACTIVO.refrescar; setTimeout(() => PANEL_ACTIVO && f && f(), 60); return; }
    cerrar(v);
  };
})();
const irV2380 = ir;
ir = function (t) { if (t !== 'config') salirPanel(); irV2380(t); };

cargarConfig = async function () {
  salirPanel();
  const admin = PERFIL.rol === 'Administrador';
  const V = fn => () => panelDeVentana(fn), M = s => () => panelDeModulo(s), P = fn => () => { salirPanel(); $('cfgcuerpo').innerHTML = fn === 'fac' ? '<div id="fcuerpo"></div>' : ''; };
  const grupos = [
    ['Tu cuenta', [
      ['prefs', '👤', 'Mi perfil y preferencias', 'Tus datos, accesos, punto de salida, navegación y plantillas', () => { P()(); pintarPrefs(); }],
      ['horario', '🕘', 'Horario de las rutas', 'Hora de salida, vuelta y tiempos por visita', V(abrirHorarioPlan)],
      ['kpis', '📊', 'Indicadores de Inicio', 'Qué indicadores ves y en qué orden', V(abrirKpis)]]],
    ['Base de datos', puedeCatalogos() ? [
      ['cat', '🏷️', 'Clasificadores', 'Listas de valores: especialidades, motivos, formas de pago…', () => { P()(); pintarCatalogos(); }]] : []],
    ['Equipo y cartera', admin ? [
      ['usuarios', '👥', 'Usuarios y permisos', 'Altas, roles, permisos por módulo y zonas', M('usuarios')],
      ['reglas', '🧭', 'Reglas de cartera', 'Cartera exclusiva y cómo se asignan los médicos', V(editorReglasCartera)],
      ['frec', '🔁', 'Frecuencia de visita', 'Cada cuánto hay que visitar a cada médico', V(editorFrecuencia)],
      ['comis', '€', 'Comisiones', 'Esquemas y quién cobra con cada uno', M('comisiones')],
      ['accesos', '🔐', 'Accesos y auditoría', 'Entradas a la plataforma y cambios registrados', M('accesos')]] : []],
    ['Stock', admin || nivelDe2('P') >= 3 ? [
      ['alm', '🏬', 'Almacenes', 'Central y almacenes de cada comercial', V(editorAlmacenes)],
      ['mues', '🎁', 'Material y muestras', 'Qué se entrega en las visitas y si descuenta stock', V(editorMuestras)]] : []],
    ['Facturación', admin ? [
      ['fiscal', '🏢', 'Datos fiscales', 'Emisor, IBAN, pie, vencimiento y emisión automática', () => { P('fac')(); pintarEmpresa(); }],
      ['series', '#️⃣', 'Series y numeración', 'Formato y siguiente número de cada serie', () => { P('fac')(); pintarSeries(); }],
      ['vf', '🛡️', 'VeriFactu', 'Qué es, qué está preparado y cómo se activa', () => { P('fac')(); pintarVerifactu(); }]] : []]
  ].filter(g => g[1].length);
  const todas = grupos.flatMap(g => g[1]);
  if (!todas.some(x => x[0] === CFG_SEC)) CFG_SEC = 'prefs';
  $('v-config').innerHTML = `
    <div class="saludo"><div><h1>Configuración</h1><div class="fecha">Todos los ajustes de tu cuenta y de la plataforma, en un solo sitio</div></div></div>
    <div class="cfghub">
      <nav class="cfgnav">${grupos.map(([g, l]) => `<div class="cfgg"><h3>${esc(g)}</h3>${l.map(([k, ic, t, d]) =>
        `<button data-cfg="${k}" class="${CFG_SEC === k ? 'on' : ''}"><span class="ci">${ic}</span><span><b>${esc(t)}</b><em>${esc(d)}</em></span></button>`).join('')}</div>`).join('')}</nav>
      <div id="cfgcuerpo" class="cfgcuerpo"></div></div>`;
  let inicial = true;
  const abrir = k => {
    const it = todas.find(x => x[0] === k); if (!it) return;
    CFG_SEC = k; document.querySelectorAll('[data-cfg]').forEach(b => b.classList.toggle('on', b.dataset.cfg === k));
    it[4]();
    if (ES_MOVIL() && !inicial) setTimeout(() => $('cfgcuerpo').scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  };
  document.querySelectorAll('[data-cfg]').forEach(b => b.onclick = () => abrir(b.dataset.cfg));
  abrir(CFG_SEC); inicial = false;
};

/* ---------------- Mi perfil: contexto de la persona ---------------- */

pintarPrefs = (orig => async function () {
  await orig();
  if (!$('cfgcuerpo') || $('miperfil')) return;
  const mods = Object.keys(MODULO_AREA).filter(puedeModulo);
  const nombres = { inicio: 'Inicio', agenda: 'Agenda', rutas: 'Rutas', directorio: 'Directorio', pacientes: 'Clientes', productos: 'Productos', seguimiento: 'Calidad del dato',
    ventas: 'Pedidos', analitica: 'Analítica', facturacion: 'Facturación' };
  $('cfgcuerpo').insertAdjacentHTML('afterbegin', `<div class="card miperfil" id="miperfil">
    <div class="mpcab"><span class="mpav">${esc(iniciales(PERFIL.nombre))}</span>
      <div><h2 style="padding:0;margin:0">${esc(PERFIL.nombre)}</h2><div class="sm">${esc(PERFIL.email || '')}</div>
        <div class="mpchips"><span class="pill p-est">${esc(PERFIL.rol)}</span>${verImportes() ? '<span class="pill p-per">Ve importes</span>' : '<span class="pill p-anu">Solo unidades</span>'}</div></div></div>
    <div class="mpgrid">
      <div><b>Tus módulos</b><div class="mpmods">${mods.map(m => `<span>${ICO_MOD[m] || '•'} ${esc(nombres[m] || m)}</span>`).join('')}</div></div>
      <div id="mpextra"><b>Tu actividad</b><div class="sm">Cargando…</div></div>
    </div>
    <p class="sm" style="margin:10px 0 0">Tus permisos los gestiona administración. Debajo, las preferencias que puedes cambiar tú.</p></div>`);
  const seguro = x => Promise.resolve(x).then(r => r || {}, () => ({}));
  const [{ data: k }, { data: h }, { data: yo }] = await Promise.all([seguro(RPC_ORIG('panel_inicio', {})),
    seguro(RPC_ORIG('historial_esquemas', { p_usuario: PERFIL.id })), seguro(db.from('perfiles').select('zonas').eq('id', PERFIL.id).single())]);
  if (!$('mpextra')) return;
  const kk = (k && (k.kpis || k)) || {}, esq = (h || []).find(x => !x.hasta);
  $('mpextra').innerHTML = `<b>Tu actividad</b><ul class="mplist">
    ${kk.medicos != null ? `<li>🩺 <b>${num(kk.medicos)}</b> médicos en tu cartera</li>` : ''}
    ${kk.visitas_mes != null ? `<li>📝 <b>${num(kk.visitas_mes)}</b> visitas este mes</li>` : ''}
    ${yo && yo.zonas && yo.zonas.length ? `<li>📍 Zona: ${esc(yo.zonas.map(z => z.charAt(0) + z.slice(1).toLowerCase()).join(', '))}</li>` : ''}
    ${esq ? `<li>€ Comisión: ${esc(esq.esquema)}</li>` : ''}</ul>`;
})(pintarPrefs);

/* ---------------- VeriFactu: explicado y claro ---------------- */

pintarVerifactu = async function () {
  await cargarAjustes();
  const v = Object.assign({ activo: false, modalidad: 'verifactu', entorno: 'pruebas' }, AJUSTES.verifactu || {});
  const [{ data: cad }, { data: evs }] = await Promise.all([RPC_ORIG('verificar_cadena', {}), RPC_ORIG('eventos_facturacion_lista', { lim: 1 })]);
  const c = cad || {}, ok = !c.rotas;
  $('fcuerpo').innerHTML = `
    <div class="vfhero ${v.activo ? 'on' : ''}">
      <div class="vfico">🛡️</div>
      <div><h2>VeriFactu ${v.activo ? '<span class="pill p-est">Activado</span>' : '<span class="pill p-per">Preparado · desactivado</span>'}</h2>
        <p>Sistema de la Agencia Tributaria para que las facturas no se puedan alterar y se puedan verificar. La plataforma ya emite cada factura cumpliendo sus requisitos; solo falta conectar el envío cuando decidáis activarlo.</p></div></div>
    <div class="vfpasos">
      <div class="vfpaso hecho"><span>✓</span><b>1 · Facturas preparadas</b><em>Numeración sin huecos, facturas inalterables y rectificativas.</em></div>
      <div class="vfpaso hecho"><span>✓</span><b>2 · Registro encadenado</b><em>${num(c.facturas || 0)} facturas con huella · ${ok ? 'cadena íntegra' : 'revisar desde ' + esc(c.primera_rota || '')}.</em></div>
      <div class="vfpaso ${v.activo ? 'hecho' : ''}"><span>${v.activo ? '✓' : '3'}</span><b>3 · QR y leyenda</b><em>${v.activo ? 'Las facturas nuevas llevan QR y «VERI*FACTU».' : 'Se añaden al activarlo.'}</em></div>
      <div class="vfpaso pend"><span>🔒</span><b>4 · Envío a Hacienda</b><em>Requiere el certificado digital de la empresa. Se configura al activarlo.</em></div>
    </div>
    <div class="vfgrid">
      <div class="card vfcard"><h3>Qué hace cada factura</h3><ul class="manlist">
        <li><span>🔢</span><span>Recibe el siguiente número de su serie: no puede haber huecos ni repetidos.</span></li>
        <li><span>🔗</span><span>Guarda una <b>huella</b> que la encadena con la anterior: si alguien cambiara una factura, la cadena lo delataría.</span></li>
        <li><span>🧾</span><span>No se puede modificar ni borrar: los errores se corrigen con una <b>rectificativa</b>.</span></li>
        <li><span>📋</span><span>Todo queda en el <b>registro de eventos</b>: emisiones, cobros, envíos y cambios de configuración${evs && evs[0] ? ` (último: ${esc(evs[0].tipo)} el ${new Date(evs[0].fecha).toLocaleDateString('es-ES')})` : ''}.</span></li></ul></div>
      <div class="card vfcard"><h3>Configuración</h3>
        <label class="vfswitch"><input type="checkbox" id="vfa" ${v.activo ? 'checked' : ''}><span class="sw"></span>
          <span><b>Activar VeriFactu</b><br><span class="sm">Las facturas nuevas llevarán el QR y la leyenda. Las ya emitidas no cambian.</span></span></label>
        <label>Modalidad</label>
        <div class="vfmodos">
          <label class="vfmodo"><input type="radio" name="vfm" value="verifactu" ${v.modalidad === 'verifactu' ? 'checked' : ''}><b>VeriFactu</b><span>Cada factura se envía a Hacienda al emitirla. La más sencilla de mantener.</span></label>
          <label class="vfmodo"><input type="radio" name="vfm" value="no_verifactu" ${v.modalidad === 'no_verifactu' ? 'checked' : ''}><b>No VeriFactu</b><span>Las facturas se firman y se guardan; Hacienda puede pedirlas cuando quiera.</span></label></div>
        <label for="vfe">Entorno</label><select id="vfe"><option value="pruebas" ${v.entorno === 'pruebas' ? 'selected' : ''}>Pruebas de la Agencia Tributaria</option><option value="produccion" ${v.entorno === 'produccion' ? 'selected' : ''}>Producción</option></select>
        <div class="acts" style="justify-content:flex-end"><button class="btn" id="vfok">Guardar</button></div></div>
    </div>`;
  $('vfok').onclick = async () => {
    const nuevo = { activo: $('vfa').checked, modalidad: document.querySelector('[name=vfm]:checked').value, entorno: $('vfe').value };
    if (nuevo.activo !== v.activo && !await preguntar(nuevo.activo ? 'Las facturas que se emitan a partir de ahora llevarán el QR y la leyenda VERI*FACTU. El envío a Hacienda necesitará el certificado de la empresa.' : 'Las facturas nuevas dejarán de llevar el QR. Las ya emitidas no cambian.',
      { titulo: nuevo.activo ? '¿Activar VeriFactu?' : '¿Desactivar VeriFactu?', ok: nuevo.activo ? 'Activar' : 'Desactivar' })) return;
    const { error } = await db.rpc('guardar_ajuste', { p_clave: 'verifactu', p_valor: nuevo });
    if (error) { toast('No se ha podido guardar', true); return; }
    AJUSTES.verifactu = nuevo; toast('Guardado · queda anotado en el registro'); pintarVerifactu();
  };
};

/* ---------------- Manual: se explica antes de llevarte a ningún sitio ---------------- */

const CFG_DE_MODULO = { agenda: 'horario', rutas: 'horario', admin: 'usuarios', facturacion: 'fiscal', inicio: 'kpis', config: 'prefs', directorio: 'cat', ventas: 'cat', permisos: 'usuarios', medico: 'usuarios', roles: 'usuarios' };
function infoManual(id, paso) {
  const s = MANUAL.find(x => x.id === id);
  if (!s && !paso) return;
  if (paso) {
    const [ic, t, d, m] = paso;
    $('dbody').innerHTML = `<div class="fh"><div><h2>${ic} ${esc(t)}</h2><div class="sm">Primeros pasos</div></div><button class="x" data-cerrar aria-label="Cerrar">✕</button></div>
      <p>${esc(d)}</p>${(MANUAL.find(x => x.id === m) || {}).para ? `<p class="sm">${esc(MANUAL.find(x => x.id === m).para)}</p>` : ''}
      <div class="acts" style="justify-content:flex-end"><button class="btn sec" data-cerrar>Ahora no</button>
        ${m === 'config' || puedeModulo(m) ? `<button class="btn" id="mangoir">Llévame</button>` : ''}</div>`;
    $('dlg').showModal();
    if ($('mangoir')) $('mangoir').onclick = () => { $('dlg').close(); if (m === 'config') CFG_SEC = 'prefs'; ir(m); };
    return;
  }
  const n = s.a ? nivelDe2(s.a) : (PERFIL.rol === 'Administrador' ? 3 : 1);
  const ay = AYUDA[id === 'visitas' ? 'agenda' : id === 'centros' ? 'directorio' : id] || null;
  const destino = MODULO_AREA[id] || ['manual', 'config'].includes(id) ? id : null;
  const cfg = CFG_DE_MODULO[id];
  $('dbody').innerHTML = `<div class="fh"><div><h2>${ICONOS_MANUAL[id] || '📘'} ${esc(s.t)}</h2><div class="sm">${esc(s.para)}</div></div><button class="x" data-cerrar aria-label="Cerrar">✕</button></div>
    <h3 class="mansub">Qué puedes hacer</h3><ul class="manlist">${s.hacer.map(([req, txt]) => `<li class="${n >= req ? 'si' : 'no'}"><span>${n >= req ? '✓' : '🔒'}</span><span>${esc(txt)}</span></li>`).join('')}</ul>
    ${ay && ay[2] && ay[2].length ? `<h3 class="mansub">Cómo funciona</h3><ul class="manlist">${ay[2].map(x => `<li><span>•</span><span>${x}</span></li>`).join('')}</ul>` : ''}
    ${s.config.length ? `<h3 class="mansub">Dónde se configura</h3><div class="mancfg">${s.config.map(x => `<span>⚙ ${esc(x)}</span>`).join('')}</div>` : ''}
    <div class="acts" style="justify-content:flex-end;flex-wrap:wrap;margin-top:14px"><button class="btn sec" data-cerrar>Cerrar</button>
      ${cfg && (PERFIL.rol === 'Administrador' || ['horario', 'kpis', 'prefs'].includes(cfg)) ? `<button class="btn sec" id="manircfg">Ir a su configuración</button>` : ''}
      ${destino && destino !== 'manual' && (destino === 'config' || puedeModulo(destino)) ? `<button class="btn" id="manirmod">Abrir ${esc(s.t)}</button>` : ''}</div>`;
  $('dlg').showModal();
  if ($('manirmod')) $('manirmod').onclick = () => { $('dlg').close(); ir(destino); };
  if ($('manircfg')) $('manircfg').onclick = () => { $('dlg').close(); CFG_SEC = cfg; ir('config'); };
}
cargarManual = (orig => async function () {
  await orig();
  const v = $('v-manual');
  v.onclick = e => {
    const m = e.target.closest('[data-mira]'); if (!m) return;
    const i = [...v.querySelectorAll('.manpaso')].indexOf(m.closest('.manpaso'));
    const pasos = PRIMEROS_PASOS[PERFIL.rol] || PRIMEROS_PASOS.default;
    if (i >= 0 && pasos[i]) infoManual(null, pasos[i]);
  };
  v.querySelectorAll('.mancard').forEach(c => c.onclick = () => infoManual(c.dataset.mansec));
  if ($('mandet')) $('mandet').remove();
  const res = $('manres');
  if (res) res.addEventListener('click', e => { const b = e.target.closest('[data-mansec2]'); if (b) { e.stopImmediatePropagation(); res.classList.add('hide'); infoManual(b.dataset.mansec2); } }, true);
})(cargarManual);
document.addEventListener('click', e => { const r = $('manres'); if (r && !e.target.closest('.manbusca')) r.classList.add('hide'); });


/* ============================================================
   DLC OS 2.0 · v2.40.0 · Pantallas y ventanas que aparecen completas
   (con indicador de carga mientras llegan los datos), alertas que se
   pueden ocultar y recuperar, acceso y cierre de sesión sin menú y
   confirmación al volver a los datos de partida
   ============================================================ */

Object.assign(RPC_TTL, { mis_alertas_descartadas: 30 });

/* ---------------- carga en bloque ---------------- */

verPedido = (orig => async function (...a) {
  const d = $('dlg'); d.classList.add('cargando'); const s = setTimeout(() => d.classList.remove('cargando'), 8000);
  try { return await orig.apply(this, a); } finally { clearTimeout(s); requestAnimationFrame(() => d.classList.remove('cargando')); }
})(verPedido);
verFactura = (orig => async function (...a) {
  const d = $('dlg'); d.classList.add('cargando'); const s = setTimeout(() => d.classList.remove('cargando'), 8000);
  try { return await orig.apply(this, a); } finally { clearTimeout(s); requestAnimationFrame(() => d.classList.remove('cargando')); }
})(verFactura);
editarUsuario = (orig => async function (...a) {
  const d = $('dlg'); d.classList.add('cargando'); const s = setTimeout(() => d.classList.remove('cargando'), 8000);
  try { return await orig.apply(this, a); } finally { clearTimeout(s); requestAnimationFrame(() => d.classList.remove('cargando')); }
})(editarUsuario);
abrirFicha = (orig => async function (...a) {
  const d = $('ficha'); d.classList.add('cargando'); const s = setTimeout(() => d.classList.remove('cargando'), 8000);
  try { return await orig.apply(this, a); } finally { clearTimeout(s); requestAnimationFrame(() => d.classList.remove('cargando')); }
})(abrirFicha);
abrirVisita = (orig => async function (...a) {
  const d = $('dlg'); d.classList.add('cargando'); const s = setTimeout(() => d.classList.remove('cargando'), 8000);
  try { return await orig.apply(this, a); } finally { clearTimeout(s); requestAnimationFrame(() => d.classList.remove('cargando')); }
})(abrirVisita);

// Módulos: al entrar, la pantalla se muestra entera cuando han llegado todos sus datos (el menú se ve siempre)
let PEND = 0;
const RPC_V2390 = db.rpc;
db.rpc = function (fn, params, opts) {
  const b = RPC_V2390.call(db, fn, params, opts);
  // Se cuentan las consultas (no las que guardan o cambian datos)
  if (/^(guardar|registrar|marcar|asignar|emitir|borrar|eliminar|anular|vincular|descartar|restaurar|leer|validar|ordenar|aplazar|bloquear|desbloquear|recibir|rectificar|unificar|cambiar|crear|pruebas)_/.test(fn)) return b;
  PEND++; let hecho = false; const fin = () => { if (!hecho) { hecho = true; PEND = Math.max(0, PEND - 1); } };
  Promise.resolve(b).then(fin, fin); setTimeout(fin, 8000);
  return b;
};
const irV2390 = ir;
ir = function (t) {
  document.querySelectorAll('main > section.cargando').forEach(s => s.classList.remove('cargando'));
  PEND = 0;
  irV2390(t);
  const sec = $('v-' + t); if (!sec || ES_MEDICO()) return;
  sec.classList.add('cargando');
  const t0 = Date.now(); let quietos = 0;
  const w = setInterval(() => {
    if (TAB !== t) { clearInterval(w); sec.classList.remove('cargando'); return; }
    quietos = PEND === 0 ? quietos + 1 : 0;
    if ((quietos >= 3 && Date.now() - t0 > 300) || Date.now() - t0 > 8000) { clearInterval(w); requestAnimationFrame(() => sec.classList.remove('cargando')); }
  }, 80);
};

/* ---------------- alertas: ocultar y recuperar ---------------- */

let ALERTAS_OCULTAS = null;
const tituloAlerta = s => s.textContent.replace(/\s+/g, ' ').replace(/^\s*\d+\s*/, '').replace(/\bequipo\b\s*$/, '').trim();
const normAl = t => String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').slice(0, 60);
function claveAlerta(titulo, x) {
  const id = x.dataset.inificha || x.dataset.iniped || x.dataset.inistock || x.dataset.inicomp;
  return normAl(titulo) + ':' + (id || normAl((x.querySelector('.tx b') || x).textContent));
}
async function cargarOcultas(forzar) {
  if (ALERTAS_OCULTAS && !forzar) return ALERTAS_OCULTAS;
  const { data } = await RPC_ORIG('mis_alertas_descartadas', {});
  ALERTAS_OCULTAS = data || [];
  return ALERTAS_OCULTAS;
}
async function filtrarAlertasInicio() {
  const caja = $('iniextra'); if (!caja) return;
  const ocultas = new Set((await cargarOcultas()).map(x => x.clave));
  let total = 0;
  caja.querySelectorAll('details.alerta2').forEach(det => {
    const sum = det.querySelector(':scope > summary'), tit = tituloAlerta(sum);
    const items = [...det.querySelectorAll(':scope > div > .item, :scope .lista > .item')];
    items.forEach(x => { if (ocultas.has(claveAlerta(tit, x))) x.remove(); });
    const quedan = det.querySelectorAll(':scope > div > .item, :scope .lista > .item').length;
    if (!quedan && items.length) { det.remove(); return; }
    const nEl = [...sum.querySelectorAll('span, b')].find(e => /^\d+$/.test(e.textContent.trim()));
    if (nEl && items.length) nEl.textContent = quedan;
    total += quedan || 0;
  });
  const card = caja.querySelector('details.alerta2') ? caja.querySelector('details.alerta2').closest('.card') : null;
  const n = card && card.querySelector('h2 .n'); if (n) n.textContent = card.querySelectorAll('details.alerta2').length;
  if (ALERTAS_OCULTAS.length && card && !card.querySelector('.alocultas')) {
    card.insertAdjacentHTML('beforeend', `<button class="kcfg alocultas" style="margin:4px 16px 12px">Ver alertas ocultas (${ALERTAS_OCULTAS.length})</button>`);
    card.querySelector('.alocultas').onclick = verOcultas;
  }
}
async function verOcultas() {
  const l = await cargarOcultas(true);
  $('dbody').innerHTML = `<div class="fh"><div><h2>Alertas ocultas</h2><div class="sm">Las que ocultaste. Al recuperarlas vuelven a aparecer en Inicio si siguen pasando.</div></div>
    <button class="x" data-cerrar aria-label="Cerrar">✕</button></div>
    <div class="alcards">${l.map(x => `<div class="alcard"><div class="alc1"><b>${esc(x.detalle || x.clave)}</b>
      <span class="pill ${x.hasta ? 'p-per' : 'p-anu'}">${x.hasta ? 'Hasta ' + fechaCorta(x.hasta) : 'Para siempre'}</span></div>
      <div class="sm">${esc(x.titulo || '')}</div><button class="btn sec" data-alrec="${esc(x.clave)}">Recuperar</button></div>`).join('') || '<div class="vacio">No tienes alertas ocultas.</div>'}</div>`;
  $('dlg').showModal();
  $('dbody').querySelectorAll('[data-alrec]').forEach(b => b.onclick = async () => {
    await db.rpc('restaurar_alerta', { p_clave: b.dataset.alrec }); b.closest('.alcard').remove(); ALERTAS_OCULTAS = null; toast('Recuperada');
    if (TAB === 'inicio') cargarInicio();
  });
}
pintarInicio = (orig => async function () { await orig(); if (TAB === 'inicio') await filtrarAlertasInicio(); })(pintarInicio);

// Ocultar desde la ventana de la alerta
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-aloc]'); if (!b) return;
  const card = b.closest('.alcard');
  if (b.dataset.aloc === 'menu') {
    card.querySelector('.alocmenu').classList.toggle('hide'); return;
  }
  const dias = b.dataset.aloc === 'siempre' ? null : +b.dataset.aloc;
  const { error } = await db.rpc('descartar_alerta', { p_clave: card.dataset.clave, p_dias: dias, p_titulo: card.dataset.titulo, p_detalle: card.querySelector('.alc1 b').textContent });
  if (error) { toast('No se ha podido ocultar', true); return; }
  ALERTAS_OCULTAS = null;
  card.remove(); toast(dias ? `Oculta ${dias} días` : 'Oculta para siempre');
  filtrarAlertasInicio();
});

/* ---------------- acceso y cierre de sesión: sin menú ---------------- */

mostrarLogin = (orig => function (...a) { document.body.classList.add('sin-sesion'); return orig.apply(this, a); })(mostrarLogin);
mostrarApp = (orig => function (...a) { document.body.classList.remove('sin-sesion'); return orig.apply(this, a); })(mostrarApp);
if (!PERFIL) document.body.classList.add('sin-sesion');

/* ---------------- pruebas: volver a los datos de partida con confirmación ---------------- */

if (EN_PRUEBAS) {
  pintarFranjaPruebas = (orig => async function () {
    await orig();
    await new Promise(r => setTimeout(r, 50));
    const b = $('prreset'); if (!b) return;
    b.onclick = async () => {
      if (!await preguntar('Se borrará todo lo creado o cambiado en el entorno de pruebas y los datos volverán a como se copiaron de producción. No se puede deshacer.',
        { titulo: '¿Seguro que quieres volver a los datos de partida?', ok: 'Sí, volver', cancelar: 'No', peligro: true })) return;
      pantallaCarga('Volviendo a los datos de partida…');
      let { data: r, error } = await RPC_ORIG('pruebas_resetear_responsable', { p_confirmacion: 'RESTABLECER' });
      if (error && /pruebas_resetear_responsable|PGRST202|not find/i.test(error.message || '')) ({ data: r, error } = await RPC_ORIG('pruebas_resetear', { p_confirmacion: 'RESTABLECER' }));
      if (error || !r || !r.ok) { quitarCarga(); toast(r && r.error === 'permiso' ? 'Solo la persona responsable del entorno puede hacerlo' : 'No se ha podido: ' + ((error && error.message) || (r && r.error) || ''), true); return; }
      limpiarDatosLocales(); location.reload();
    };
  })(pintarFranjaPruebas);
  if ($('prreset')) pintarFranjaPruebas();
}


/* ============================================================
   v2.41.0 · Marca propia de cada empresa, planes contratables,
   Usuarios renovado, Roles y permisos, configuración sin redundancias
   (Administración se integra en Configuración), acceso de médicos
   desde su ficha y menú «Más» como extensión de la barra
   ============================================================ */

Object.assign(RPC_TTL, { usuarios_resumen: 30, plan_uso: 60 });

/* ---------------- marca de la empresa ---------------- */

let MARCA = (() => { try { return JSON.parse(localStorage.getItem('app-marca')) || {}; } catch (e) { return {}; } })();
const nombreApp = () => MARCA.nombre || 'Mi empresa';
function aplicarMarca() {
  const n = nombreApp();
  document.title = n;
  document.querySelectorAll('meta[name="apple-mobile-web-app-title"]').forEach(m => m.content = n);
  const logo = MARCA.logo;
  document.querySelectorAll('header .logo, .lbox img, #bootsplash img').forEach(i => { if (logo) i.src = logo; i.alt = n; });
  const h = document.querySelector('.lbox h1'); if (h) h.textContent = n;
  const g = document.querySelector('#girar span:last-child'); if (g) g.textContent = n + ' se usa en vertical.';
}
aplicarMarca();
Promise.resolve(RPC_ORIG('marca_publica', {})).then(r => {
  if (r && r.data) { MARCA = Object.assign({}, MARCA, r.data); try { localStorage.setItem('app-marca', JSON.stringify(MARCA)); } catch (e) {} aplicarMarca(); }
}, () => {});
// El logo de la empresa también en las facturas
logoData = (orig => async function () {
  if (MARCA.logo && (AJUSTES.marca || {}).logo_factura !== false) { LOGO_DATA = MARCA.logo; LOGO_CIRC = true; return MARCA.logo; }
  return orig();
})(logoData);

async function pintarMarca() {
  await cargarAjustes();
  const m = Object.assign({ nombre: nombreApp(), logo: null, logo_factura: true }, AJUSTES.marca || {});
  let logo = m.logo;
  $('cfgcuerpo').innerHTML = `<div class="card cfgpanel"><h2 style="padding:0 0 4px">Marca de la empresa</h2>
    <p class="sm">Así se ve la plataforma para todo tu equipo: en la pantalla de acceso, arriba en cada pantalla, en la app del móvil y en las facturas.</p>
    <div class="marcaed"><div class="marcaprev"><img id="mklogo" src="${esc(logo || 'logo-app.png')}" alt=""><b id="mknomp">${esc(m.nombre)}</b></div>
      <div><label for="mknom">Nombre de la plataforma</label><input id="mknom" value="${esc(m.nombre)}" placeholder="p. ej. Acme Comercial">
        <label>Logo o imagen de perfil</label>
        <div class="acts" style="margin:0"><label class="btn sec" for="mkfile" style="margin:0">Subir imagen</label><input id="mkfile" type="file" accept="image/*" class="hide">
          ${logo ? '<button class="btn sec" id="mkquitar">Quitar</button>' : ''}</div>
        <div class="sm" style="margin-top:4px">Se adapta a un círculo. Mejor una imagen cuadrada, con el logo centrado.</div>
        <label class="opt" style="margin-top:10px"><input type="checkbox" id="mkfac" ${m.logo_factura !== false ? 'checked' : ''}> Usar también en las facturas</label></div></div>
    <div class="acts" style="justify-content:flex-end"><button class="btn" id="mkok">Guardar</button></div></div>`;
  $('mknom').oninput = () => $('mknomp').textContent = $('mknom').value || 'Mi empresa';
  $('mkfile').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    const img = new Image(); img.src = URL.createObjectURL(f); await img.decode();
    const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
    const lado = Math.min(img.width, img.height); x.drawImage(img, (img.width - lado) / 2, (img.height - lado) / 2, lado, lado, 0, 0, 256, 256);
    logo = c.toDataURL('image/png'); $('mklogo').src = logo;
  };
  if ($('mkquitar')) $('mkquitar').onclick = () => { logo = null; $('mklogo').src = 'logo-app.png'; };
  $('mkok').onclick = async () => {
    const v = { nombre: $('mknom').value.trim() || 'Mi empresa', logo, logo_factura: $('mkfac').checked };
    const { error } = await db.rpc('guardar_ajuste', { p_clave: 'marca', p_valor: v });
    if (error) { toast('No se ha podido guardar', true); return; }
    AJUSTES.marca = v; MARCA = { nombre: v.nombre, logo: v.logo }; localStorage.setItem('app-marca', JSON.stringify(MARCA)); LOGO_DATA = null;
    aplicarMarca(); toast('Marca guardada');
  };
}

/* ---------------- planes ---------------- */

const PLANES = [
  { id: 'esencial', nombre: 'Esencial', precio: 149, incluidos: 5, bloque: [5, 99], medicos: 0,
    para: 'Equipos pequeños que quieren ordenar sus visitas',
    modulos: ['inicio', 'agenda', 'rutas', 'directorio', 'seguimiento'],
    ventajas: ['Directorio de médicos y centros', 'Agenda, «Tu día» y registro de visitas', 'Rutas optimizadas y planificación semanal', 'Calidad del dato y duplicados', 'App móvil instalable'] },
  { id: 'profesional', nombre: 'Profesional', precio: 349, incluidos: 10, bloque: [5, 149], medicos: 0,
    para: 'Equipos que venden y quieren medir resultados',
    modulos: ['inicio', 'agenda', 'rutas', 'directorio', 'seguimiento', 'ventas', 'pacientes', 'productos', 'analitica'],
    ventajas: ['Todo lo de Esencial', 'Pedidos, clientes y registro de llamadas', 'Productos y stock por lotes', 'Analítica y ranking de prescriptores', 'Comisiones por tramos'] },
  { id: 'avanzado', nombre: 'Avanzado', precio: 649, incluidos: 20, bloque: [10, 249], medicos: 50,
    para: 'Empresas con facturación propia y varios equipos',
    modulos: ['inicio', 'agenda', 'rutas', 'directorio', 'seguimiento', 'ventas', 'pacientes', 'productos', 'analitica', 'facturacion'],
    ventajas: ['Todo lo de Profesional', 'Facturación con VeriFactu y cobros', 'Compras, proveedores y trazabilidad', 'Zonas, supervisión del equipo y alertas', 'Espacio del médico (hasta 50 médicos)'] },
  { id: 'premium', nombre: 'Premium', precio: 1190, incluidos: 40, bloque: [10, 249], medicos: null,
    para: 'Redes comerciales grandes que lo quieren todo',
    modulos: ['inicio', 'agenda', 'rutas', 'directorio', 'seguimiento', 'ventas', 'pacientes', 'productos', 'analitica', 'facturacion'],
    ventajas: ['Todo lo de Avanzado', 'Espacio del médico sin límite', 'Entrar como otro usuario y auditoría completa', 'Puesta en marcha y migración de datos incluidas', 'Soporte prioritario'] }
];
let PLAN_ACTUAL = { plan: 'premium' };
const planDe = id => PLANES.find(p => p.id === id) || PLANES[3];
const planIncluye = mod => !(mod in MODULO_AREA) || planDe(PLAN_ACTUAL.plan).modulos.includes(mod);
const planMinimo = mod => PLANES.find(p => p.modulos.includes(mod));
Promise.resolve(RPC_ORIG('plan_uso', {})).then(r => { if (r && r.data && r.data.plan) { PLAN_ACTUAL = r.data.plan; if (PERFIL) aplicarPermisosMenu(); } }, () => {});

// Los módulos que no entran en el plan se ven con candado y explican cómo conseguirlos
const puedeModuloV2400 = puedeModulo;
aplicarPermisosMenu = (orig => function () {
  orig();
  document.querySelectorAll('nav.main [data-t]').forEach(b => {
    const t = b.dataset.t; if (!(t in MODULO_AREA)) return;
    const bloqueado = puedeModuloV2400(t) && !planIncluye(t);
    b.classList.toggle('bloq', bloqueado);
    if (bloqueado) { b.classList.remove('hide'); if (!b.querySelector('.cand')) b.insertAdjacentHTML('beforeend', '<span class="cand">🔒</span>'); }
    else { const c = b.querySelector('.cand'); if (c) c.remove(); }
  });
})(aplicarPermisosMenu);
function avisoPlan(mod) {
  const p = planMinimo(mod), n = (document.querySelector(`nav.main [data-t="${mod}"]`) || {}).textContent || mod;
  $('dbody').innerHTML = `<div class="fh"><div><h2>🔒 ${esc(n.replace('🔒', '').trim())}</h2><div class="sm">No está incluido en tu plan ${esc(planDe(PLAN_ACTUAL.plan).nombre)}</div></div>
    <button class="x" data-cerrar aria-label="Cerrar">✕</button></div>
    <p>Está disponible desde el plan <b>${esc(p ? p.nombre : 'Premium')}</b>${p ? ` (${eurI(p.precio)}/mes, ${p.incluidos} usuarios incluidos)` : ''}.</p>
    ${p ? `<ul class="manlist">${p.ventajas.map(v => `<li><span>✓</span><span>${esc(v)}</span></li>`).join('')}</ul>` : ''}
    <div class="acts" style="justify-content:flex-end"><button class="btn sec" data-cerrar>Ahora no</button>${PERFIL.rol === 'Administrador' ? '<button class="btn" id="vplan">Ver planes</button>' : ''}</div>`;
  $('dlg').showModal();
  if ($('vplan')) $('vplan').onclick = () => { $('dlg').close(); CFG_SEC = 'plan'; ir('config'); };
}

async function pintarPlan2() {
  const { data } = await RPC_ORIG('plan_uso', {});
  const d = data || {}, act = planDe((d.plan || {}).plan), bloques = +((d.plan || {}).bloques_extra || 0);
  const maxU = act.incluidos + bloques * act.bloque[0], enlaces = ((d.pagos || {}).enlaces) || {};
  const pct = Math.min(100, Math.round((d.usuarios || 0) / maxU * 100));
  $('cfgcuerpo').innerHTML = `<div class="card cfgpanel">
    <div class="planact"><div><div class="sm">Tu plan</div><h2 style="padding:0;margin:2px 0">${esc(act.nombre)} <span class="pill ${(d.plan || {}).estado === 'activo' ? 'p-est' : 'p-per'}">${esc((d.plan || {}).estado || 'activo')}</span></h2>
      <div class="sm">${eurI(act.precio)}/mes · ${act.incluidos} usuarios incluidos${bloques ? ` + ${bloques} ${bloques === 1 ? 'bloque' : 'bloques'} de ${act.bloque[0]}` : ''}</div></div>
      <div class="planuso"><b>${num(d.usuarios || 0)} / ${num(maxU)}</b><span>usuarios activos</span><div class="barra"><i style="width:${pct}%"></i></div>
        ${act.medicos !== 0 ? `<span class="sm">${num(d.medicos || 0)}${act.medicos ? ' / ' + act.medicos : ''} médicos con acceso</span>` : ''}</div></div></div>
    <div class="planes">${PLANES.map(p => `<div class="plan ${p.id === act.id ? 'actual' : ''} ${p.id === 'avanzado' ? 'dest' : ''}">
      ${p.id === 'avanzado' ? '<span class="plancinta">El más elegido</span>' : ''}
      <h3>${esc(p.nombre)}</h3><div class="sm">${esc(p.para)}</div>
      <div class="planprecio"><b>${eurI(p.precio)}</b><span>/mes</span></div>
      <div class="sm">${p.incluidos} usuarios incluidos · +${p.bloque[0]} usuarios por ${eurI(p.bloque[1])}/mes</div>
      <ul class="manlist">${p.ventajas.map(v => `<li><span>✓</span><span>${esc(v)}</span></li>`).join('')}</ul>
      ${p.id === act.id ? '<button class="btn sec" disabled>Tu plan actual</button>'
        : `<button class="btn ${p.id === 'avanzado' ? '' : 'sec'}" data-contratar="${p.id}">${PLANES.indexOf(p) > PLANES.indexOf(act) ? 'Mejorar a ' : 'Cambiar a '}${esc(p.nombre)}</button>`}
    </div>`).join('')}</div>
    <div class="card cfgpanel"><h3 style="margin-top:0">Cómo funciona</h3><ul class="manlist">
      <li><span>💳</span><span>Pago mensual con tarjeta o domiciliación. Con pago anual, dos meses gratis.</span></li>
      <li><span>👥</span><span>Cada plan incluye un número de usuarios; si el equipo crece, se añaden bloques de usuarios sin cambiar de plan.</span></li>
      <li><span>🩺</span><span>Los médicos con acceso a su informe no cuentan como usuarios.</span></li>
      <li><span>🔄</span><span>Se puede cambiar de plan en cualquier momento; el cambio se aplica al confirmarse el pago.</span></li></ul>
      <div class="acts"><button class="btn sec" id="plbloque">+ Añadir un bloque de ${act.bloque[0]} usuarios (${eurI(act.bloque[1])}/mes)</button></div></div>`;
  const contratar = clave => {
    if (enlaces[clave]) { window.open(enlaces[clave], '_blank', 'noopener'); return; }
    location.href = `mailto:${encodeURIComponent((d.pagos || {}).contacto || '')}?subject=${encodeURIComponent('Contratación: ' + clave)}&body=${encodeURIComponent('Empresa: ' + nombreApp() + '\nQuiero: ' + clave)}`;
  };
  $('cfgcuerpo').querySelectorAll('[data-contratar]').forEach(b => b.onclick = () => contratar(b.dataset.contratar));
  $('plbloque').onclick = () => contratar('bloque-' + act.id);
}

// No se puede superar el número de usuarios del plan
nuevoUsuario = (orig => function (pre) {
  const act = planDe(PLAN_ACTUAL.plan), maxU = act.incluidos + (+PLAN_ACTUAL.bloques_extra || 0) * act.bloque[0];
  const activos = (USUARIOS || []).filter(u => u.activo && u.rol !== 'Medico').length;
  orig();
  $('ne').placeholder = 'nombre@empresa.com';
  $('np').value = 'Tmp-' + Math.random().toString(36).slice(2, 8);
  // Rol «Medico»: se elige un médico del directorio, no se crea uno nuevo
  $('nr').insertAdjacentHTML('afterend', '');
  $('nr').closest('.g2').insertAdjacentHTML('afterend', `<div id="nmedw" class="hide"><label>Médico del directorio</label><div id="nmed"></div>
    <div class="sm" style="margin-top:4px">Tendrá acceso solo a su informe y a sus avisos. No cuenta como usuario del plan.</div></div>`);
  let medico = pre && pre.medico ? pre.medico : null;
  selectorMedico($('nmed'), { valor: medico, placeholder: 'Busca al médico', alElegir: async m => {
    medico = m;
    const { data: f } = await db.rpc('ficha_medico', { p_id: m.id });
    if (f && f.medico) { if (!$('nn').value) $('nn').value = f.medico.nombre; if (!$('ne').value && f.medico.email) $('ne').value = f.medico.email; }
  } });
  const ver = () => $('nmedw').classList.toggle('hide', $('nr').value !== 'Medico');
  $('nr').addEventListener('change', ver);
  if (pre && pre.medico) { $('nr').value = 'Medico'; $('nn').value = pre.nombre || ''; $('ne').value = pre.email || ''; ver(); }
  const crear = $('ncrear').onclick;
  $('ncrear').onclick = async ev => {
    if ($('nr').value !== 'Medico' && activos >= maxU) { toast(`Tu plan ${act.nombre} permite ${maxU} usuarios. Añade un bloque en Configuración → Plan.`, true); return; }
    if ($('nr').value === 'Medico' && !medico) { toast('Elige el médico del directorio', true); return; }
    await crear(ev);
    if ($('nr').value === 'Medico' && medico && /Usuario creado/.test($('nmsg').textContent)) {
      const { data: u } = await db.from('perfiles').select('id').eq('email', $('ne').value.trim()).single();
      if (u) { await db.rpc('vincular_medico', { p_usuario: u.id, p_medico: medico.id }); $('nmsg').insertAdjacentHTML('beforeend', ` Vinculado a <b>${esc(medico.nombre)}</b>.`); }
    }
    if (TAB === 'config' && CFG_SEC === 'usuarios') pintarUsuarios2();
  };
})(nuevoUsuario);

// Desde la ficha del médico: darle acceso a su espacio
abrirFicha = (orig => async function (id, ...r) {
  await orig(id, ...r);
  if (PERFIL.rol !== 'Administrador' || FICHA_ID !== id || !$('fbody') || $('facceso')) return;
  const { data: us } = await RPC_ORIG('usuarios_resumen', {});
  const ya = (us || []).find(u => u.medico_id === id);
  $('fbody').insertAdjacentHTML('beforeend', `<div class="blk" id="facceso"><h3>Acceso a la plataforma</h3>
    ${ya ? `<p class="sm">Tiene acceso como <b>${esc(ya.email || '')}</b>${ya.activo ? '' : ' (desactivado)'}: ve su informe y recibe un aviso con cada pauta.</p>`
      : `<p class="sm">Puede tener acceso a su informe de prescripción y recibir un aviso con cada pauta a su nombre. No verá importes ni datos de pacientes.</p>
         <button class="btn sec" id="fdaracc">Dar acceso</button>`}</div>`);
  if ($('fdaracc')) $('fdaracc').onclick = async () => {
    const { data: f } = await db.rpc('ficha_medico', { p_id: id });
    $('ficha').close(); nuevoUsuario({ medico: { id, nombre: f.medico.nombre }, nombre: f.medico.nombre, email: f.medico.email || '' });
  };
})(abrirFicha);

/* ---------------- Usuarios renovado ---------------- */

let USR_F = { q: '', rol: '', est: 'activos' };
async function pintarUsuarios2() {
  const { data } = await RPC_ORIG('usuarios_resumen', {});
  const todos = data || []; USUARIOS = todos.map(u => Object.assign({ medicos: u.cartera, visitas: u.visitas_mes }, u));
  const act = planDe(PLAN_ACTUAL.plan), maxU = act.incluidos + (+PLAN_ACTUAL.bloques_extra || 0) * act.bloque[0];
  const activos = todos.filter(u => u.activo && u.rol !== 'Medico');
  const hace30 = Date.now() - 30 * 864e5;
  const inactivos = activos.filter(u => !u.ultima_actividad || new Date(u.ultima_actividad).getTime() < hace30).length;
  const porRol = {}; activos.forEach(u => porRol[u.rol] = (porRol[u.rol] || 0) + 1);
  const pinta = () => {
    const q = USR_F.q.toLowerCase();
    const l = todos.filter(u => (!q || (u.nombre + ' ' + (u.email || '')).toLowerCase().includes(q)) && (!USR_F.rol || u.rol === USR_F.rol)
      && (USR_F.est === 'todos' || (USR_F.est === 'activos' ? u.activo : !u.activo)));
    $('usrl').innerHTML = l.map(u => {
      const mods = Object.keys(MODULO_AREA).filter(m => u.rol === 'Administrador' || +((u.areas || {})[MODULO_AREA[m]] || 0) >= 1);
      const reciente = u.ultima_actividad ? new Date(u.ultima_actividad) : null;
      return `<button class="usrcard ${u.activo ? '' : 'off'}" data-usr="${u.id}">
        <span class="usrav" style="background:${u.rol === 'Administrador' ? 'var(--grad)' : u.rol === 'Medico' ? 'linear-gradient(135deg,#0F6E4C,#12805C)' : u.rol === 'Televenta' ? 'linear-gradient(135deg,#7C3AED,#A855F7)' : 'linear-gradient(135deg,#1E6FB8,#5BB4E5)'}">${esc(iniciales(u.nombre))}</span>
        <span class="usrtx"><b>${esc(u.nombre)}</b><span class="sm">${esc(u.email || '')}</span>
          <span class="usrchips"><span class="pill p-est">${esc(u.rol)}</span>${u.activo ? '' : '<span class="pill p-anu">Desactivado</span>'}
            ${u.rol === 'Medico' ? `<span class="pill p-per">${esc(u.medico || 'Sin ficha')}</span>` : `<span class="sm">${mods.length} módulos</span>`}</span></span>
        <span class="usrdat">${u.rol !== 'Medico' ? `<span><b>${num(u.cartera)}</b> en cartera</span><span><b>${num(u.visitas_mes)}</b> visitas mes</span>` : ''}
          <span class="sm">${reciente ? 'Activo ' + fechaCorta(reciente.toISOString().slice(0, 10)) : 'Sin actividad'}</span></span></button>`;
    }).join('') || '<div class="vacio">Nadie con estos filtros.</div>';
    $('usrl').querySelectorAll('[data-usr]').forEach(b => b.onclick = () => detalleUsuario(todos.find(u => u.id === b.dataset.usr)));
  };
  $('cfgcuerpo').innerHTML = `<div class="cfgpanel">
    <div class="kpis vtot" style="margin-bottom:12px">
      <div class="kpi"><b>${num(activos.length)} / ${num(maxU)}</b><span>usuarios del plan ${esc(act.nombre)}</span></div>
      ${Object.entries(porRol).map(([r, n]) => `<div class="kpi"><b>${num(n)}</b><span>${esc(r)}</span></div>`).join('')}
      <div class="kpi ${inactivos ? 'warn' : 'ok'}"><b>${num(inactivos)}</b><span>sin actividad en 30 días</span></div>
      <div class="kpi"><b>${num(todos.filter(u => u.rol === 'Medico' && u.activo).length)}</b><span>médicos con acceso</span></div></div>
    <div class="card" style="padding:14px 16px">
      <div class="usrbar"><input id="usrq" type="search" placeholder="Buscar por nombre o email" value="${esc(USR_F.q)}">
        <select id="usrrol"><option value="">Todos los roles</option>${ROLES.map(r => `<option ${USR_F.rol === r ? 'selected' : ''}>${r}</option>`).join('')}</select>
        <select id="usrest"><option value="activos" ${USR_F.est === 'activos' ? 'selected' : ''}>Activos</option><option value="inactivos" ${USR_F.est === 'inactivos' ? 'selected' : ''}>Desactivados</option><option value="todos" ${USR_F.est === 'todos' ? 'selected' : ''}>Todos</option></select>
        <button class="btn" id="usrnuevo">+ Nuevo usuario</button></div>
      <div id="usrl" class="usrlista"></div></div></div>`;
  $('usrq').oninput = () => { USR_F.q = $('usrq').value; pinta(); };
  $('usrrol').onchange = () => { USR_F.rol = $('usrrol').value; pinta(); };
  $('usrest').onchange = () => { USR_F.est = $('usrest').value; pinta(); };
  $('usrnuevo').onclick = () => nuevoUsuario();
  pinta();
}
function detalleUsuario(u) {
  const mods = Object.keys(MODULO_AREA).map(m => [m, u.rol === 'Administrador' ? 3 : +((u.areas || {})[MODULO_AREA[m]] || 0)]);
  const nombres = { inicio: 'Inicio', agenda: 'Agenda', rutas: 'Rutas', directorio: 'Directorio', pacientes: 'Clientes', productos: 'Productos', seguimiento: 'Calidad del dato', ventas: 'Pedidos', analitica: 'Analítica', facturacion: 'Facturación' };
  $('dbody').innerHTML = `<div class="fh"><div class="usrcab"><span class="usrav grande">${esc(iniciales(u.nombre))}</span>
      <div><h2>${esc(u.nombre)}</h2><div class="sm">${esc(u.email || '')} · ${esc(u.rol)}${u.activo ? '' : ' · desactivado'}</div></div></div>
    <button class="x" data-cerrar aria-label="Cerrar">✕</button></div>
    <div class="usrgrid">
      <div class="blk"><h3>Qué puede ver y hacer</h3><div class="usrperm">${mods.map(([m, n]) => `<span class="${n ? 'si' : 'no'}">${n ? '✓' : '—'} ${esc(nombres[m])}<em>${esc(NIVEL_TXT[n])}</em></span>`).join('')}</div>
        <div class="sm" style="margin-top:6px">${+((u.areas || {}).E || 0) >= 1 || u.rol === 'Administrador' ? 'Ve importes de ventas' : 'Solo ve unidades'}</div></div>
      <div class="blk"><h3>Actividad</h3>${u.rol === 'Medico' ? `<p class="sm">Vinculado a: <b>${esc(u.medico || 'sin ficha')}</b></p>` : `
        <div class="uper" style="grid-template-columns:repeat(2,1fr)"><div><b>${num(u.cartera)}</b><span>médicos en cartera</span></div><div><b>${num(u.visitas_mes)}</b><span>visitas este mes</span></div></div>
        ${u.zonas && u.zonas.length ? `<div class="sm">📍 Zona: ${esc(u.zonas.map(z => z.charAt(0) + z.slice(1).toLowerCase()).join(', '))}</div>` : ''}`}
        <div class="sm">Última actividad: ${u.ultima_actividad ? new Date(u.ultima_actividad).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' }) : 'ninguna registrada'}</div></div></div>
    <div class="accsheet usracc">
      <button class="btn" data-uacc="editar">✏️ Editar rol, permisos y zona</button>
      ${u.rol !== 'Medico' ? '<button class="btn sec" data-uacc="cartera">🩺 Asignar cartera</button>' : ''}
      <button class="btn sec" data-uacc="pass">🔑 Cambiar contraseña</button>
      ${typeof puedeSuplantar === 'function' && puedeSuplantar() && u.id !== PERFIL.id && u.rol !== 'Administrador' && u.activo ? '<button class="btn sec" data-uacc="como">👤 Entrar como esta persona</button>' : ''}</div>`;
  $('dlg').showModal();
  $('dbody').querySelectorAll('[data-uacc]').forEach(b => b.onclick = () => {
    const a = b.dataset.uacc;
    if (a === 'editar') editarUsuario(u.id);
    if (a === 'cartera') { $('dlg').close(); asignarCartera(u.id); }
    if (a === 'pass') { $('dlg').close(); restablecerPassword(u); }
    if (a === 'como') { $('dlg').close(); entrarComo(u.id); }
  });
}

/* ---------------- Roles y permisos ---------------- */

const ROLES_BASE = {
  'Administrador': { H: 3, G: 3, R: 3, M: 3, C: 3, S: 3, V: 3, L: 3, P: 3, F: 3, A: 3, E: 1, Q: 3, K: 3, U: 3 },
  'Dirección': { H: 2, G: 2, R: 1, M: 1, C: 1, S: 1, V: 1, L: 1, P: 1, F: 1, A: 1, E: 1, Q: 1, K: 1, U: 0 },
  'Comercial': { H: 2, G: 2, R: 2, M: 2, C: 2, S: 2, V: 0, L: 0, P: 0, F: 0, A: 0, E: 0, Q: 0, K: 0, U: 0 },
  'Televenta': { H: 2, G: 1, R: 1, M: 2, C: 2, S: 1, V: 3, L: 3, P: 1, F: 2, A: 1, E: 1, Q: 1, K: 0, U: 0 },
  'Solo consulta': { H: 1, G: 1, R: 1, M: 1, C: 1, S: 1, V: 1, L: 1, P: 1, F: 0, A: 1, E: 0, Q: 1, K: 0, U: 0 }
};
const QUE_ABRE = { H: 'Inicio: indicadores, alertas y resumen', G: 'Agenda, citas y «Tu día»', R: 'Rutas y planificador', M: 'Directorio y fichas de médicos',
  C: 'Centros y sus datos', S: 'Registro de visitas', V: 'Pedidos: ventas, compras y llamadas', L: 'Clientes (pacientes y empresas)', P: 'Productos, servicios y stock',
  F: 'Facturación, cobros y rectificativas', A: 'Analítica y rankings', E: 'Importes en euros (si no, solo unidades)', Q: 'Calidad del dato y duplicados',
  K: 'Clasificadores y listas de valores', U: 'Entrar como otra persona' };
const plantillaRol = r => Object.assign({}, ROLES_BASE[r] || {}, (AJUSTES.roles || {})[r] || {});
async function pintarRoles() {
  await cargarAjustes();
  const roles = Object.keys(ROLES_BASE);
  $('cfgcuerpo').innerHTML = `<div class="card cfgpanel"><h2 style="padding:0 0 4px">Roles y permisos</h2>
    <p class="sm">Cada rol tiene una plantilla de permisos que se aplica al dar de alta a una persona o al cambiarle el rol. Después se puede ajustar persona a persona en Usuarios. Los médicos con acceso solo ven su informe.</p>
    <div class="nivleg">${NIVEL_TXT.map((t, i) => `<span class="nv${i}"><b>${esc(t)}</b>${['No ve el módulo ni aparece en el menú', 'Lo ve, pero no cambia nada', 'Crea y edita lo suyo', 'Todo, incluido borrar y configurar'][i]}</span>`).join('')}</div>
    <div class="dgrid-wrap"><table class="rolmat"><thead><tr><th>Permiso</th>${roles.map(r => `<th>${esc(r)}</th>`).join('')}</tr></thead>
      <tbody>${AREAS.map(([k, n]) => `<tr><td><b>${esc(n)}</b><span class="sm">${esc(QUE_ABRE[k] || '')}</span></td>
        ${roles.map(r => `<td><select data-rol="${esc(r)}" data-ar="${k}" class="nvsel" ${r === 'Administrador' ? 'disabled' : ''}>${NIVEL_TXT.map((t, i) => `<option value="${i}" ${+(plantillaRol(r)[k] || 0) === i ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></td>`).join('')}</tr>`).join('')}</tbody></table></div>
    <div class="acts" style="justify-content:flex-end;flex-wrap:wrap"><button class="btn sec" id="rolrest">Volver a los valores recomendados</button><button class="btn" id="rolok">Guardar plantillas</button></div></div>`;
  const colorea = () => $('cfgcuerpo').querySelectorAll('.nvsel').forEach(s => s.className = 'nvsel nv' + s.value);
  $('cfgcuerpo').addEventListener('change', colorea); colorea();
  const leer = () => { const o = {}; $('cfgcuerpo').querySelectorAll('[data-rol]:not([disabled])').forEach(s => { (o[s.dataset.rol] = o[s.dataset.rol] || {})[s.dataset.ar] = +s.value; }); return o; };
  $('rolrest').onclick = async () => { await db.rpc('guardar_ajuste', { p_clave: 'roles', p_valor: {} }); AJUSTES.roles = {}; toast('Valores recomendados'); pintarRoles(); };
  $('rolok').onclick = async () => {
    const v = leer(); const { error } = await db.rpc('guardar_ajuste', { p_clave: 'roles', p_valor: v });
    if (error) { toast('No se ha podido guardar', true); return; }
    AJUSTES.roles = v;
    if (await preguntar('Las plantillas se usan en las altas y cambios de rol. ¿Quieres aplicarlas también ahora a todas las personas que ya tienen esos roles? Se sustituirán sus permisos actuales.', { titulo: '¿Aplicar a las personas actuales?', ok: 'Aplicar a todos' })) {
      let n = 0; for (const [r, a] of Object.entries(v)) { const { data: x } = await db.rpc('aplicar_plantilla_rol', { p_rol: r, p_areas: a }); n += (x && x.personas) || 0; }
      toast(`Plantillas guardadas y aplicadas a ${n} personas`);
    } else toast('Plantillas guardadas');
  };
}

/* ---------------- Configuración única (Administración queda integrada) ---------------- */

const CFG_ADMIN = { usuarios: 'usuarios', comisiones: 'comis', accesos: 'accesos', auditoria: 'auditoria' };
const irV2400 = ir;
ir = function (t) {
  if (t === 'admin') { CFG_SEC = CFG_ADMIN[ADM_SEC] || 'usuarios'; t = 'config'; }
  irV2400(t);
};
document.querySelectorAll('[data-u="adm"]').forEach(b => b.classList.add('hide'));
mostrarApp = (orig => function (p) { orig(p); document.querySelectorAll('[data-u="adm"]').forEach(b => b.classList.add('hide')); aplicarMarca(); })(mostrarApp);
// Dentro de Configuración no se repiten menús interiores
panelDeModulo = (orig => function (sec) {
  orig(sec);
  const quitar = () => { const p = document.querySelector('#cfgcuerpo .cfgmod'); if (p) p.querySelectorAll('.subnav').forEach(s => s.remove()); };
  quitar(); setTimeout(quitar, 300); setTimeout(quitar, 1200);
})(panelDeModulo);
cargarConfig = (orig => async function () {
  await orig();
  const nav = document.querySelector('.cfgnav'); if (!nav) return;
  const admin = PERFIL.rol === 'Administrador';
  // Usuarios renovado, roles, auditoría, marca y plan
  const usr = nav.querySelector('[data-cfg="usuarios"]');
  if (usr) {
    usr.insertAdjacentHTML('afterend', `<button data-cfg="roles"><span class="ci">🛡️</span><span><b>Roles y permisos</b><em>Qué ve y qué puede hacer cada rol</em></span></button>`);
    const acc = nav.querySelector('[data-cfg="accesos"]');
    if (acc) { acc.querySelector('b').textContent = 'Accesos'; acc.querySelector('em').textContent = 'Quién ha entrado y cuándo';
      acc.insertAdjacentHTML('afterend', `<button data-cfg="auditoria"><span class="ci">📜</span><span><b>Auditoría</b><em>Cambios registrados en la plataforma</em></span></button>`); }
  }
  if (admin) nav.insertAdjacentHTML('beforeend', `<div class="cfgg"><h3>Empresa</h3>
    <button data-cfg="marca"><span class="ci">🎨</span><span><b>Marca y logo</b><em>Nombre de la plataforma y logo de la empresa</em></span></button>
    <button data-cfg="plan"><span class="ci">💳</span><span><b>Plan y suscripción</b><em>Tu plan, usuarios y cómo ampliar</em></span></button></div>`);
  const acciones = { usuarios: () => { salirPanel(); pintarUsuarios2(); }, roles: () => { salirPanel(); pintarRoles(); }, auditoria: () => panelDeModulo('auditoria'),
    marca: () => { salirPanel(); pintarMarca(); }, plan: () => { salirPanel(); pintarPlan2(); } };
  nav.querySelectorAll('[data-cfg]').forEach(b => {
    if (!acciones[b.dataset.cfg]) return;
    b.onclick = () => { CFG_SEC = b.dataset.cfg; nav.querySelectorAll('[data-cfg]').forEach(x => x.classList.toggle('on', x === b)); acciones[b.dataset.cfg]();
      if (ES_MOVIL()) setTimeout(() => $('cfgcuerpo').scrollIntoView({ behavior: 'smooth', block: 'start' }), 80); };
  });
  if (acciones[CFG_SEC]) { nav.querySelectorAll('[data-cfg]').forEach(x => x.classList.toggle('on', x.dataset.cfg === CFG_SEC)); acciones[CFG_SEC](); }
})(cargarConfig);

/* ---------------- menú «Más» del móvil: continuación de la barra ---------------- */

abrirMasMovil = (orig => function () {
  orig();
  const s = $('bmas'); if (!s) return;
  s.querySelectorAll('.bmasbox > .sm').forEach(x => x.remove());
  s.querySelectorAll('[data-bm]').forEach(b => { const t = b.dataset.bm; if (!planIncluye(t)) { b.classList.add('bloq'); b.onclick = () => { s.classList.add('hide'); avisoPlan(t); }; } });
  document.body.classList.add('masabierto');
  const obs = new MutationObserver(() => { if (s.classList.contains('hide')) { document.body.classList.remove('masabierto'); obs.disconnect(); } });
  obs.observe(s, { attributes: true, attributeFilter: ['class'] });
})(abrirMasMovil);

// Intentar entrar en un módulo que no incluye el plan
const irV2401 = ir;
ir = function (t) {
  if (t in MODULO_AREA && PERFIL && puedeModuloV2400(t) && !planIncluye(t)) { avisoPlan(t); return; }
  irV2401(t);
};


/* ============================================================
   v2.42.0 · Notificaciones para todos y configurables, Mi perfil,
   Rutas y Mensajes como apartados propios, Material de visita y
   Almacenes explicados, controles compactos en Configuración,
   navegación de Configuración sin desplazarse y alta con resumen
   ============================================================ */

/* ---------------- notificaciones ---------------- */

const TIPOS_NOTIF = [
  ['pauta', '💊', 'Pautas a mi nombre', 'Cada vez que se registra una pauta con tu nombre', ['Medico']],
  ['venta_cartera', '🛒', 'Ventas de mi cartera', 'Cuando se valida una venta de un médico que llevas', ['Comercial']],
  ['cartera', '🩺', 'Cambios en mi cartera', 'Cuando te asignan médicos nuevos', ['Comercial']],
  ['cruce', '🔁', 'Visitas de otros a mi cartera', 'Cuando otra persona visita a un médico que llevas', ['Comercial']],
  ['pedido_validado', '📦', 'Pedidos validados', 'Cada pedido que se valida (menos los tuyos)', ['Administrador', 'Dirección', 'Televenta']]
];
const tiposDeMiRol = () => TIPOS_NOTIF.filter(t => t[4].includes(PERFIL.rol));
let NOTIF_N = 0;
async function refrescarCampana() {
  if (!PERFIL || document.body.classList.contains('sin-sesion')) return;
  const { data } = await RPC_ORIG('mis_notificaciones', { lim: 30 });
  const d = data || {}; NOTIF_N = d.sin_leer || 0;
  let b = $('mdavisos');
  if (!b) { const u = $('ubtn'); if (!u) return; u.insertAdjacentHTML('beforebegin', '<button class="mdavisos" id="mdavisos" aria-label="Notificaciones"></button>'); b = $('mdavisos'); }
  b.innerHTML = `🔔${NOTIF_N ? `<span class="nb2">${NOTIF_N > 9 ? '9+' : NOTIF_N}</span>` : ''}`;
  b.onclick = () => panelNotificaciones(d.lista || []);
}
pintarAvisos = refrescarCampana;
function irEnlace(e) {
  if (!e) return;
  const [t, id] = String(e).split(':');
  if (t === 'ficha' && id) abrirFicha(id); else if (t === 'pedido' && id) verPedido(id);
  else if (t === 'informe') ir('informe'); else if (t === 'directorio') ir('directorio');
}
function panelNotificaciones(l) {
  const ico = t => (TIPOS_NOTIF.find(x => x[0] === t) || [])[1] || '🔔';
  $('dbody').innerHTML = `<div class="fh"><div><h2>Notificaciones</h2><div class="sm">${NOTIF_N ? NOTIF_N + ' sin leer' : 'Estás al día'}</div></div>
    <button class="x" data-cerrar aria-label="Cerrar">✕</button></div>
    <div class="notlista">${l.map(x => `<button class="notit ${x.leida_en ? '' : 'nuevo'}" data-nid="${x.id}" data-nen="${esc(x.enlace || '')}">
      <span class="ic">${ico(x.tipo)}</span><span class="tx"><b>${esc(x.titulo)}</b><span class="sm">${esc(x.cuerpo || '')}</span>
      <span class="sm">${new Date(x.creado_en).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}</span></span></button>`).join('') || '<div class="vacio">No tienes notificaciones.</div>'}</div>
    <div class="acts" style="justify-content:space-between;flex-wrap:wrap"><button class="btn sec" id="notcfg">⚙ Elegir qué notificaciones recibo</button>
      ${NOTIF_N ? '<button class="btn sec" id="notleer">Marcar todas como leídas</button>' : ''}</div>`;
  $('dlg').showModal();
  $('dbody').querySelectorAll('[data-nid]').forEach(b => b.onclick = async () => {
    await db.rpc('leer_notificacion', { p_id: b.dataset.nid }); $('dlg').close(); irEnlace(b.dataset.nen); refrescarCampana();
  });
  if ($('notleer')) $('notleer').onclick = async () => { await db.rpc('leer_notificaciones'); $('dlg').close(); refrescarCampana(); };
  $('notcfg').onclick = () => { $('dlg').close(); CFG_SEC = 'notif'; ir('config'); };
}
setInterval(refrescarCampana, 60000);
mostrarApp = (orig => function (p) { orig(p); setTimeout(refrescarCampana, 800); })(mostrarApp);

function pintarNotif() {
  const pref = (PERFIL.preferencias || {}).notif || {}, tipos = tiposDeMiRol();
  $('cfgcuerpo').innerHTML = `<div class="card cfgpanel"><h2 style="padding:0 0 4px">Notificaciones</h2>
    <p class="sm">Te llegan a la campana 🔔 de arriba. Elige cuáles quieres recibir.</p>
    ${tipos.length ? `<div class="notcfg">${tipos.map(([k, ic, t, d]) => `<label class="vfswitch"><input type="checkbox" data-nt="${k}" ${pref[k] === false ? '' : 'checked'}><span class="sw"></span>
      <span><b>${ic} ${esc(t)}</b><br><span class="sm">${esc(d)}</span></span></label>`).join('')}</div>` : '<div class="vacio">Tu perfil no tiene notificaciones disponibles todavía.</div>'}</div>`;
  $('cfgcuerpo').querySelectorAll('[data-nt]').forEach(c => c.onchange = async () => {
    const notif = Object.assign({}, (PERFIL.preferencias || {}).notif || {}, { [c.dataset.nt]: c.checked });
    const prefs = Object.assign({}, PERFIL.preferencias || {}, { notif });
    const { data, error } = await db.rpc('guardar_preferencias', { p: prefs });
    if (error) { toast('No se ha podido guardar', true); c.checked = !c.checked; return; }
    PERFIL.preferencias = data || prefs; toast(c.checked ? 'Activada' : 'Desactivada');
  });
}

/* ---------------- Mi perfil ---------------- */

function pintarPerfil() {
  const pr = PERFIL.preferencias || {};
  const inicios = [['inicio', 'Inicio'], ['agenda', 'Agenda'], ['rutas', 'Rutas'], ['directorio', 'Directorio'], ['ventas', 'Pedidos']].filter(([k]) => puedeModulo(k));
  $('cfgcuerpo').innerHTML = `<div id="perfilcab"></div>
    <div class="card cfgpanel"><h2 style="padding:0 0 8px">Mis datos</h2>
      <div class="g2"><div><label for="pfn">Nombre visible</label><input id="pfn" value="${esc(PERFIL.nombre)}"></div>
        <div><label for="pft">Teléfono</label><input id="pft" inputmode="tel" value="${esc(pr.telefono || '')}" placeholder="Para que el equipo pueda llamarte"></div></div>
      <div class="g2"><div><label for="pfi">Al entrar, abrir</label><select id="pfi">${inicios.map(([k, t]) => `<option value="${k}" ${(pr.inicio || 'inicio') === k ? 'selected' : ''}>${t}</option>`).join('')}</select></div><div></div></div>
      <div class="acts" style="justify-content:flex-end"><button class="btn" id="pfok">Guardar</button></div></div>
    <div class="card cfgpanel"><h2 style="padding:0 0 8px">Contraseña</h2>
      <div class="g2"><div><label for="pfp1">Nueva contraseña</label><input id="pfp1" type="password" autocomplete="new-password"></div>
        <div><label for="pfp2">Repítela</label><input id="pfp2" type="password" autocomplete="new-password"></div></div>
      <div class="acts" style="justify-content:flex-end"><button class="btn sec" id="pfpok">Cambiar contraseña</button></div></div>`;
  // Tarjeta de contexto (datos, accesos y actividad)
  const tmp = $('cfgcuerpo'); const guard = tmp.innerHTML;
  $('pfok').onclick = async () => {
    const nombre = $('pfn').value.trim(); if (!nombre) { toast('El nombre no puede quedar vacío', true); return; }
    const prefs = Object.assign({}, pr, { telefono: $('pft').value.trim(), inicio: $('pfi').value });
    const [a, b] = await Promise.all([db.rpc('guardar_preferencias', { p: prefs }), db.from('perfiles').update({ nombre }).eq('id', PERFIL.id)]);
    if (a.error) { toast('No se ha podido guardar', true); return; }
    PERFIL.preferencias = a.data || prefs; if (!b.error) { PERFIL.nombre = nombre; $('uname').textContent = nombre.split(' ')[0]; $('av').textContent = iniciales(nombre); }
    toast('Datos guardados');
  };
  $('pfpok').onclick = async () => {
    const p1 = $('pfp1').value, p2 = $('pfp2').value;
    if (p1.length < 8) { toast('Mínimo 8 caracteres', true); return; } if (p1 !== p2) { toast('No coinciden', true); return; }
    const { error } = await db.auth.updateUser({ password: p1 });
    if (error) { toast('No se ha podido cambiar: ' + error.message, true); return; }
    $('pfp1').value = $('pfp2').value = ''; toast('Contraseña cambiada');
  };
  // Se reutiliza la tarjeta de perfil con accesos y actividad
  const caja = document.createElement('div'); caja.id = 'cfgcuerpo-tmp';
  pintarPrefsPerfil();
}
async function pintarPrefsPerfil() {
  // La tarjeta #miperfil la genera el envoltorio de pintarPrefs: se pinta en un contenedor aparte y se mueve
  const real = $('cfgcuerpo'); real.id = 'cfgcuerpo-real';
  const t = document.createElement('div'); t.id = 'cfgcuerpo'; t.style.display = 'none'; document.body.appendChild(t);
  try { await pintarPrefs(); } catch (e) {}
  const mp = t.querySelector('#miperfil'); t.remove(); real.id = 'cfgcuerpo';
  if (mp && $('perfilcab')) $('perfilcab').replaceWith(mp);
}
// Al entrar, se abre el módulo elegido
mostrarApp = (orig => function (p) {
  const primera = !APP_VISIBLE; orig(p);
  const ini = (p.preferencias || {}).inicio;
  if (primera && ini && ini !== 'inicio' && puedeModulo(ini)) setTimeout(() => ir(ini), 50);
})(mostrarApp);

/* ---------------- Rutas y desplazamientos · Mensajes ---------------- */

async function pintarPrefsParte(parte) {
  await pintarPrefs();
  const c = $('cfgcuerpo'); if (!c) return;
  if ($('miperfil')) $('miperfil').remove();
  const tpl = $('tplok') ? $('tplok').closest('.card, .blk, div[id]') : null;
  const plantillas = tpl && tpl.closest('#cfgcuerpo > *');
  if (parte === 'rutas') {
    if (plantillas) plantillas.remove();
    c.querySelectorAll(':scope > p.sm').forEach(p => p.remove());
    c.insertAdjacentHTML('afterbegin', '<div class="card cfgpanel"><h2 style="padding:0 0 4px">Rutas y desplazamientos</h2><p class="sm">Desde dónde sales, dónde terminas y con qué app se abre la navegación. El horario de las rutas está en su propio apartado.</p></div>');
  } else {
    [...c.children].forEach(x => { if (x !== plantillas) x.remove(); });
    c.insertAdjacentHTML('afterbegin', '<div class="card cfgpanel"><h2 style="padding:0 0 4px">Mensajes</h2><p class="sm">Plantillas del resumen semanal que envías por WhatsApp o email. Las variables entre llaves se rellenan solas.</p></div>');
  }
}

/* ---------------- Material de visita ---------------- */

async function pintarMaterial() {
  await Promise.all([cargarAjustes(), cargarProductos()]);
  const m = Object.assign({ producto_id: null, restar_stock: false }, AJUSTES.muestras || {});
  const { data: clas } = await db.rpc('clasificadores_visita');
  const mat = (clas || []).find(c => c.clave === 'MATERIAL');
  const { data: cid } = await db.from('clasificadores').select('id').eq('clave', 'MATERIAL').maybeSingle();
  const { data: vals } = cid ? await db.from('valores_clasificador').select('id,valor,activo,dato_tipo').eq('clasificador_id', cid.id).order('orden') : { data: [] };
  $('cfgcuerpo').innerHTML = `
    <div class="card cfgpanel"><h2 style="padding:0 0 4px">Material de visita</h2>
      <p class="sm">Todo lo que un comercial puede dejar en una visita. Al registrar la visita se marca qué se entregó y cuánto, y queda en la ficha del médico y en Analítica (material por comercial, por médico y por mes).</p>
      <div class="mattipos"><div><b>💊 Muestras de producto</b><span>Unidades de un producto del catálogo. Pueden descontarse del stock.</span></div>
        <div><b>📚 Material promocional</b><span>Dípticos, talonarios de recomendación, flyers, tarjetas… Se cuentan, pero no descuentan stock.</span></div></div></div>
    <div class="card cfgpanel"><h2 style="padding:0 0 4px">💊 Muestras de producto</h2>
      <div class="g2"><div><label for="muprod">Producto que se entrega como muestra</label><select id="muprod"><option value="">— Ninguno —</option>${PRODUCTOS.filter(p => p.tipo !== 'servicio').map(p => `<option value="${p.id}" ${p.id === m.producto_id ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('')}</select></div><div></div></div>
      <label class="vfswitch" style="margin-top:10px"><input type="checkbox" id="murest" ${m.restar_stock ? 'checked' : ''}><span class="sw"></span>
        <span><b>Descontar las muestras del stock</b><br><span class="sm">Salen del maletín de quien registra la visita (o del almacén central si no tiene), empezando por el lote que caduca antes. Así sabes cuántas muestras quedan y a quién llegó cada lote.</span></span></label>
      <div class="acts" style="justify-content:flex-end"><button class="btn" id="muok">Guardar</button></div></div>
    <div class="card cfgpanel"><h2 style="padding:0 0 4px">📚 Material promocional</h2>
      <p class="sm">Lo que aparece para marcar al registrar una visita. «Pide cantidad» hace que se indique cuántas unidades se dejaron.</p>
      <div class="matlista">${(vals || []).map(v => `<div class="matfila ${v.activo ? '' : 'off'}"><b>${esc(v.valor)}</b><span class="sm">${v.dato_tipo === 'numero' ? 'Pide cantidad' : 'Solo se marca'}</span>
        <label class="vfswitch mini"><input type="checkbox" data-mact="${v.id}" ${v.activo ? 'checked' : ''}><span class="sw"></span><span class="sm">${v.activo ? 'Activo' : 'Oculto'}</span></label></div>`).join('') || '<div class="sm">Todavía no hay material.</div>'}</div>
      <div class="matadd"><input id="matn" placeholder="Nuevo material, p. ej. Póster para consulta"><label class="opt" style="margin:0"><input type="checkbox" id="matq" checked> Pide cantidad</label>
        <button class="btn sec" id="matok" ${cid ? '' : 'disabled'}>Añadir</button></div></div>`;
  $('muok').onclick = async () => {
    if ($('murest').checked && !$('muprod').value) { toast('Elige el producto de las muestras', true); return; }
    const { error } = await db.rpc('guardar_ajuste', { p_clave: 'muestras', p_valor: { producto_id: $('muprod').value || null, restar_stock: $('murest').checked } });
    if (error) { toast('No se ha podido guardar', true); return; } AJUSTES.muestras = { producto_id: $('muprod').value || null, restar_stock: $('murest').checked }; toast('Guardado');
  };
  $('cfgcuerpo').querySelectorAll('[data-mact]').forEach(c => c.onchange = async () => { await db.rpc('guardar_valor', { p: { id: c.dataset.mact, activo: c.checked } }); toast(c.checked ? 'Visible en las visitas' : 'Oculto en las visitas'); cargarCatalogos(); pintarMaterial(); });
  $('matok').onclick = async () => {
    const v = $('matn').value.trim(); if (!v) return;
    const { error } = await db.rpc('guardar_valor', { p: Object.assign({ clasificador_id: cid.id, valor: v }, $('matq').checked ? { dato_tipo: 'numero', dato_etiqueta: 'Unidades' } : {}) });
    if (error) { toast('No se ha podido: ' + error.message, true); return; } toast('Añadido'); cargarCatalogos(); pintarMaterial();
  };
}

/* ---------------- Almacenes ---------------- */

async function pintarAlmacenes2() {
  await cargarAlmacenes(); if (!COMS.length) await cargarComerciales();
  const { data: st } = await RPC_ORIG('stock_resumen', {});
  const sinMaletin = COMS.filter(u => u.rol === 'Comercial' && !ALMACENES.some(a => a.usuario_id === u.id));
  $('cfgcuerpo').innerHTML = `
    <div class="card cfgpanel"><h2 style="padding:0 0 4px">Almacenes</h2>
      <p class="sm">Dónde está físicamente tu stock. Cada unidad está en un almacén y en un lote, así sabes qué hay, dónde y cuándo caduca.</p>
      <div class="mattipos"><div><b>🏢 Almacén central</b><span>Donde entra la mercancía al recibir las compras y de donde salen los pedidos.</span></div>
        <div><b>💼 Maletín de comercial</b><span>Las muestras que lleva cada comercial. Se reponen traspasando desde el central y se descuentan al registrar visitas.</span></div></div></div>
    <div class="card cfgpanel"><h2 style="padding:0 0 8px">Tus almacenes</h2>
      <div class="almgrid">${ALMACENES.map(a => `<div class="almc"><span class="ic">${a.tipo === 'central' ? '🏢' : '💼'}</span>
        <b>${esc(a.nombre)}</b><span class="sm">${a.tipo === 'central' ? 'Almacén central' : 'Maletín de ' + esc(a.usuario || '—')}${a.activo ? '' : ' · inactivo'}</span>
        <span class="almu"><b>${num(a.unidades || 0)}</b> unidades</span></div>`).join('')}</div>
      ${sinMaletin.length ? `<div class="avisoh" style="margin-top:12px"><span>${sinMaletin.length === 1 ? esc(sinMaletin[0].nombre) + ' no tiene' : sinMaletin.length + ' comerciales no tienen'} maletín: sus muestras saldrán del almacén central.</span></div>` : ''}
      <div class="matadd" style="margin-top:12px"><select id="almu">${COMS.filter(u => u.rol === 'Comercial').map(u => `<option value="${u.id}">${esc(u.nombre)}</option>`).join('')}</select>
        <button class="btn sec" id="almok">Crear maletín</button></div>
      <p class="sm" style="margin-top:8px">Para pasar unidades del central a un maletín: Productos → Stock → abre el producto → «Traspasar».${Array.isArray(st) && st.length ? '' : ''}</p></div>`;
  $('almok').onclick = async () => {
    const u = COMS.find(x => x.id === $('almu').value); if (!u) return;
    const { error } = await db.rpc('guardar_almacen', { p: { nombre: 'Maletín ' + String(u.nombre).split(' ')[0], tipo: 'maletin', usuario_id: u.id } });
    if (error) { toast('No se ha podido crear', true); return; } toast('Maletín creado'); pintarAlmacenes2();
  };
}

/* ---------------- Configuración: apartados y navegación ---------------- */

cargarConfig = (orig => async function () {
  if (CFG_SEC === 'prefs') CFG_SEC = 'perfil';
  const sec = CFG_SEC;
  if (['perfil', 'rutas', 'mensajes', 'notif'].includes(sec)) CFG_SEC = 'prefs';
  await orig();
  CFG_SEC = sec;
  const nav = document.querySelector('.cfgnav'); if (!nav) return;
  const pref = nav.querySelector('[data-cfg="prefs"]');
  if (pref) {
    pref.dataset.cfg = 'perfil'; pref.querySelector('b').textContent = 'Mi perfil'; pref.querySelector('em').textContent = 'Tus datos, contraseña y qué abrir al entrar';
    pref.insertAdjacentHTML('afterend', `<button data-cfg="notif"><span class="ci">🔔</span><span><b>Notificaciones</b><em>Qué avisos quieres recibir</em></span></button>
      <button data-cfg="rutas"><span class="ci">📍</span><span><b>Rutas y desplazamientos</b><em>Punto de salida y llegada, y app de navegación</em></span></button>`);
    const hor = nav.querySelector('[data-cfg="horario"]'); if (hor) nav.querySelector('[data-cfg="rutas"]').after(hor);
    const kp = nav.querySelector('[data-cfg="kpis"]'); if (kp) kp.insertAdjacentHTML('afterend', `<button data-cfg="mensajes"><span class="ci">💬</span><span><b>Mensajes</b><em>Plantillas del resumen semanal</em></span></button>`);
  }
  const mues = nav.querySelector('[data-cfg="mues"]'); if (mues) { mues.querySelector('b').textContent = 'Material de visita'; mues.querySelector('em').textContent = 'Muestras y material promocional que se entrega'; }
  const acc = { perfil: pintarPerfil, notif: pintarNotif, rutas: () => pintarPrefsParte('rutas'), mensajes: () => pintarPrefsParte('mensajes'), mues: pintarMaterial, alm: pintarAlmacenes2 };
  const abrir = b => {
    CFG_SEC = b.dataset.cfg; nav.querySelectorAll('[data-cfg]').forEach(x => x.classList.toggle('on', x === b));
    // El contenido aparece a la vista, sin tener que desplazarse
    const hub = document.querySelector('.cfghub');
    if (hub) { const y = ES_MOVIL() ? $('cfgcuerpo').getBoundingClientRect().top + scrollY - 70 : hub.getBoundingClientRect().top + scrollY - 90; if (Math.abs(scrollY - y) > 40) scrollTo({ top: Math.max(0, y), behavior: 'smooth' }); }
  };
  nav.querySelectorAll('[data-cfg]').forEach(b => {
    const previo = b.onclick;
    b.onclick = () => { if (acc[b.dataset.cfg]) { salirPanel(); abrir(b); acc[b.dataset.cfg](); } else { if (previo) previo(); abrir(b); } };
  });
  const act = nav.querySelector(`[data-cfg="${CFG_SEC}"]`);
  if (act && acc[CFG_SEC]) { nav.querySelectorAll('[data-cfg]').forEach(x => x.classList.toggle('on', x === act)); salirPanel(); acc[CFG_SEC](); }
  else if (act) nav.querySelectorAll('[data-cfg]').forEach(x => x.classList.toggle('on', x === act));
})(cargarConfig);

/* ---------------- alta de usuario: resumen al terminar ---------------- */

nuevoUsuario = (orig => function (pre) {
  orig(pre);
  const crear = $('ncrear').onclick;
  $('ncrear').onclick = async ev => {
    const datos = { nombre: $('nn').value.trim(), email: $('ne').value.trim(), pass: $('np').value, rol: $('nr').value };
    await crear(ev);
    const ok = /Usuario creado/.test($('nmsg') ? $('nmsg').textContent : '');
    if (!ok) return;
    const vinc = ($('nmsg').textContent.match(/Vinculado a (.+)\./) || [])[1];
    delete $('dlg').dataset.sucio;
    const url = location.origin + location.pathname;
    const texto = `Hola ${datos.nombre.split(' ')[0]}, ya tienes acceso a ${nombreApp()}.\nEntra en ${url}\nUsuario: ${datos.email}\nContraseña temporal: ${datos.pass}\nCámbiala al entrar (Configuración → Mi perfil).`;
    $('dbody').innerHTML = `<div class="fh"><div><h2>✓ Usuario creado</h2><div class="sm">Pásale estos datos para que entre</div></div><button class="x" data-cerrar aria-label="Cerrar">✕</button></div>
      <div class="usrok"><div><span>Nombre</span><b>${esc(datos.nombre)}</b></div><div><span>Rol</span><b>${esc(datos.rol)}</b></div>
        <div><span>Usuario</span><b>${esc(datos.email)}</b></div><div><span>Contraseña temporal</span><b class="mono">${esc(datos.pass)}</b></div>
        ${vinc ? `<div><span>Médico vinculado</span><b>${esc(vinc)}</b></div>` : ''}<div><span>Dirección</span><b>${esc(url)}</b></div></div>
      <p class="sm">Si la confirmación por correo está activada, primero deberá confirmar su email.</p>
      <div class="acts" style="justify-content:flex-end;flex-wrap:wrap"><button class="btn sec" id="usrcop">Copiar los datos</button><button class="btn" data-cerrar>Hecho</button></div>`;
    delete $('dlg').dataset.sucio;
    $('usrcop').onclick = async () => { try { await navigator.clipboard.writeText(texto); toast('Copiado: pégalo en un mensaje'); } catch (e) { toast('No se ha podido copiar', true); } };
  };
})(nuevoUsuario);


/* ============================================================
   v2.43.0 · Idiomas por persona (castellano, inglés, alemán,
   francés e italiano), precios alineados con el mercado, paquete
   ampliado de notificaciones, logo neutro y ayudas «i» renovadas
   ============================================================ */

/* ---------------- logo: el de la empresa o uno neutro ---------------- */

const LOGO_NEUTRO = 'logo-app.png';
aplicarMarca = (orig => function () {
  orig();
  if (!MARCA.logo) document.querySelectorAll('header .logo, .lbox img, #bootsplash img').forEach(i => { i.src = LOGO_NEUTRO; });
})(aplicarMarca);
aplicarMarca();
// En la factura solo va el logo si la empresa ha subido el suyo
logoData = async function () { if (MARCA.logo && (AJUSTES.marca || {}).logo_factura !== false) { LOGO_DATA = MARCA.logo; LOGO_CIRC = true; return MARCA.logo; } return null; };

/* ---------------- planes alineados con el mercado ---------------- */

PLANES.splice(0, PLANES.length,
  { id: 'esencial', nombre: 'Esencial', precio: 29, incluidos: 2, bloque: [1, 10], medicos: 0, para: 'Para empezar a ordenar las visitas',
    modulos: ['inicio', 'agenda', 'rutas', 'directorio', 'seguimiento'],
    ventajas: ['Directorio de médicos y centros', 'Agenda, «Tu día» y registro de visitas', 'Rutas optimizadas y planificación semanal', 'App móvil instalable'] },
  { id: 'profesional', nombre: 'Profesional', precio: 59, incluidos: 4, bloque: [1, 10], medicos: 0, para: 'Para equipos que venden y miden',
    modulos: ['inicio', 'agenda', 'rutas', 'directorio', 'seguimiento', 'ventas', 'pacientes', 'productos', 'analitica'],
    ventajas: ['Todo lo de Esencial', 'Pedidos, clientes y llamadas', 'Productos y stock por lotes', 'Analítica, ranking y comisiones'] },
  { id: 'avanzado', nombre: 'Avanzado', precio: 99, incluidos: 7, bloque: [1, 10], medicos: 25, para: 'Con facturación y varios comerciales',
    modulos: ['inicio', 'agenda', 'rutas', 'directorio', 'seguimiento', 'ventas', 'pacientes', 'productos', 'analitica', 'facturacion'],
    ventajas: ['Todo lo de Profesional', 'Facturación con VeriFactu y cobros', 'Compras, proveedores y trazabilidad', 'Zonas, supervisión y espacio del médico (25)'] },
  { id: 'premium', nombre: 'Premium', precio: 179, incluidos: 15, bloque: [1, 8], medicos: null, para: 'Redes comerciales completas',
    modulos: ['inicio', 'agenda', 'rutas', 'directorio', 'seguimiento', 'ventas', 'pacientes', 'productos', 'analitica', 'facturacion'],
    ventajas: ['Todo lo de Avanzado', 'Espacio del médico sin límite', 'Entrar como otro usuario y auditoría', 'Soporte prioritario y ayuda con la migración'] });
pintarPlan2 = (orig => async function () {
  await orig();
  const c = $('cfgcuerpo'); if (!c) return;
  // Textos del modelo por usuario (en lugar de bloques)
  c.querySelectorAll('.plan .sm').forEach(s => { s.textContent = s.textContent.replace(/\+1 usuarios por (.+?)\/mes/, 'usuario extra: $1/mes'); });
  const b = $('plbloque'); if (b) b.textContent = b.textContent.replace(/Añadir un bloque de 1 usuarios \((.+)\)/, 'Añadir un usuario extra ($1)');
  c.querySelectorAll('.manlist li span:last-child').forEach(li => {
    if (/bloques de usuarios/.test(li.textContent)) li.textContent = 'Cada plan incluye usuarios; si el equipo crece, se añaden usuarios sueltos sin cambiar de plan.';
    if (/dos meses gratis/.test(li.textContent)) li.textContent = 'Pago mensual con tarjeta o domiciliación, sin permanencia.';
  });
  const act = c.querySelector('.planact .sm'); if (act) act.textContent = act.textContent.replace(/ \+ (\d+) bloques? de 1/, ' + $1 extra');
})(pintarPlan2);

/* ---------------- notificaciones ampliadas ---------------- */

TIPOS_NOTIF.push(
  ['citas_hoy', '📅', 'Mis citas de hoy', 'Al empezar el día, cuántas citas tienes', ['Comercial', 'Administrador', 'Dirección', 'Televenta']],
  ['sin_visitar', '⏳', 'Médicos sin visitar', 'Los lunes, médicos de tu cartera con más de 60 días sin visita', ['Comercial']],
  ['cliente_nuevo', '🧑‍⚕️', 'Pacientes nuevos de mi cartera', 'Cuando se da de alta un cliente que viene de un médico tuyo', ['Comercial']],
  ['pago_recibido', '💳', 'Pagos de mis pedidos', 'Cuando se valida el pago de un pedido que creaste', ['Comercial', 'Televenta', 'Administrador']],
  ['borrador_nuevo', '✏️', 'Pedidos en borrador', 'Cuando alguien deja un pedido pendiente de validar', ['Administrador', 'Televenta']],
  ['seguimientos_hoy', '📞', 'Llamadas de seguimiento', 'Al empezar el día, las llamadas que tocan hoy', ['Administrador', 'Televenta']],
  ['pagos_pendientes', '⌛', 'Pagos pendientes', 'Al empezar el día, pedidos con el pago pendiente hace más de una semana', ['Administrador', 'Televenta']],
  ['facturas_vencidas', '🧾', 'Facturas vencidas', 'Al empezar el día, facturas vencidas sin cobrar', ['Administrador', 'Dirección', 'Televenta']],
  ['stock_minimo', '📉', 'Stock bajo', 'Cuando un producto baja de su stock mínimo', ['Administrador', 'Dirección']],
  ['lotes_caducan', '⚠️', 'Lotes que caducan', 'Al empezar el día, lotes que caducan en 30 días', ['Administrador', 'Dirección']],
  ['compra_recibida', '🚚', 'Mercancía recibida', 'Cuando se registra la recepción de una compra', ['Administrador', 'Dirección']],
  ['rectificativa', '↩️', 'Facturas rectificativas', 'Cada rectificativa que se emite', ['Administrador', 'Dirección']],
  ['duplicado', '🧩', 'Posibles duplicados', 'Cuando una ficha se marca como posible duplicado', ['Administrador']],
  ['usuario_nuevo', '👤', 'Usuarios nuevos', 'Cuando se da de alta una persona', ['Administrador']],
  ['esquema', '€', 'Mi comisión', 'Cuando te asignan un esquema de comisión', ['Comercial', 'Televenta', 'Dirección']]);
irEnlace = (orig => function (e) {
  const [t] = String(e || '').split(':');
  if (t === 'agenda') { AG_MODO = 'dia'; AG_FECHA = hoyISO(); ir('agenda'); }
  else if (t === 'llamadas') { PEDSEC = 'llamadas'; ir('ventas'); }
  else if (t === 'ventas') { PEDSEC = 'ventas'; ir('ventas'); }
  else if (t === 'stock') { PSEC = 'stock'; ir('productos'); }
  else if (t === 'facturacion') ir('facturacion');
  else if (t === 'duplicados') ir('duplicados');
  else orig(e);
})(irEnlace);
// Resumen del día: se genera la primera vez que se abre la plataforma cada día
mostrarApp = (orig => function (p) {
  orig(p);
  if (p.rol !== 'Medico') setTimeout(() => Promise.resolve(RPC_ORIG('avisos_del_dia', {})).then(r => { if (r && r.data && r.data.nuevo) refrescarCampana(); }, () => {}), 1500);
})(mostrarApp);
// Configuración de notificaciones agrupada
pintarNotif = (orig => function () {
  orig();
  const c = $('cfgcuerpo').querySelector('.notcfg'); if (!c) return;
  const al = ['citas_hoy', 'seguimientos_hoy', 'pagos_pendientes', 'facturas_vencidas', 'lotes_caducan', 'sin_visitar'];
  const labels = [...c.children];
  const dia = labels.filter(l => al.includes(l.querySelector('[data-nt]').dataset.nt));
  if (dia.length) { c.insertAdjacentHTML('beforeend', '<h3 class="mansub">Resumen al empezar el día</h3>'); dia.forEach(l => c.appendChild(l)); }
  if (labels.length > dia.length) c.insertAdjacentHTML('afterbegin', '<h3 class="mansub" style="margin-top:0">Al momento</h3>');
})(pintarNotif);

/* ---------------- idiomas ---------------- */

const IDIOMAS = [['es', 'Castellano'], ['en', 'English'], ['de', 'Deutsch'], ['fr', 'Français'], ['it', 'Italiano']];
const LOCALES = { es: 'es-ES', en: 'en-GB', de: 'de-DE', fr: 'fr-FR', it: 'it-IT' };
// [castellano, inglés, alemán, francés, italiano]
const I18N = [
  ['Inicio', 'Home', 'Start', 'Accueil', 'Home'], ['Agenda', 'Calendar', 'Kalender', 'Agenda', 'Agenda'], ['Rutas', 'Routes', 'Routen', 'Itinéraires', 'Percorsi'],
  ['Directorio', 'Directory', 'Verzeichnis', 'Annuaire', 'Rubrica'], ['Clientes', 'Customers', 'Kunden', 'Clients', 'Clienti'], ['Productos', 'Products', 'Produkte', 'Produits', 'Prodotti'],
  ['Calidad del dato', 'Data quality', 'Datenqualität', 'Qualité des données', 'Qualità dei dati'], ['Pedidos', 'Orders', 'Bestellungen', 'Commandes', 'Ordini'],
  ['Analítica', 'Analytics', 'Analysen', 'Analyses', 'Analisi'], ['Facturación', 'Invoicing', 'Rechnungen', 'Facturation', 'Fatturazione'], ['Más', 'More', 'Mehr', 'Plus', 'Altro'],
  ['Mi informe', 'My report', 'Mein Bericht', 'Mon rapport', 'Il mio report'], ['Configuración', 'Settings', 'Einstellungen', 'Paramètres', 'Impostazioni'],
  ['Manual de uso', 'User guide', 'Handbuch', 'Guide d’utilisation', 'Manuale'], ['Cerrar sesión', 'Sign out', 'Abmelden', 'Se déconnecter', 'Esci'],
  ['Cambiar contraseña', 'Change password', 'Passwort ändern', 'Changer le mot de passe', 'Cambia password'],
  ['Guardar', 'Save', 'Speichern', 'Enregistrer', 'Salva'], ['Cancelar', 'Cancel', 'Abbrechen', 'Annuler', 'Annulla'], ['Cerrar', 'Close', 'Schließen', 'Fermer', 'Chiudi'],
  ['Editar', 'Edit', 'Bearbeiten', 'Modifier', 'Modifica'], ['Eliminar', 'Delete', 'Löschen', 'Supprimer', 'Elimina'], ['Buscar', 'Search', 'Suchen', 'Rechercher', 'Cerca'],
  ['Añadir', 'Add', 'Hinzufügen', 'Ajouter', 'Aggiungi'], ['Volver', 'Back', 'Zurück', 'Retour', 'Indietro'], ['Hoy', 'Today', 'Heute', 'Aujourd’hui', 'Oggi'],
  ['Día', 'Day', 'Tag', 'Jour', 'Giorno'], ['Semana', 'Week', 'Woche', 'Semaine', 'Settimana'], ['Mes', 'Month', 'Monat', 'Mois', 'Mese'], ['Equipo', 'Team', 'Team', 'Équipe', 'Team'],
  ['Aceptar', 'OK', 'OK', 'OK', 'OK'], ['Borrar', 'Clear', 'Leeren', 'Effacer', 'Cancella'], ['Sí', 'Yes', 'Ja', 'Oui', 'Sì'], ['No', 'No', 'Nein', 'Non', 'No'],
  ['Entrar', 'Sign in', 'Anmelden', 'Se connecter', 'Accedi'], ['Correo', 'Email', 'E-Mail', 'E-mail', 'Email'], ['Contraseña', 'Password', 'Passwort', 'Mot de passe', 'Password'],
  ['He olvidado la contraseña', 'I forgot my password', 'Passwort vergessen', 'Mot de passe oublié', 'Ho dimenticato la password'], ['Bienvenido', 'Welcome', 'Willkommen', 'Bienvenue', 'Benvenuto'],
  ['Buscar médico, centro o municipio', 'Search doctor, centre or town', 'Arzt, Zentrum oder Ort suchen', 'Rechercher médecin, centre ou ville', 'Cerca medico, centro o comune'],
  ['Tu día', 'Your day', 'Dein Tag', 'Votre journée', 'La tua giornata'], ['Alertas', 'Alerts', 'Warnungen', 'Alertes', 'Avvisi'], ['Mi semana', 'My week', 'Meine Woche', 'Ma semaine', 'La mia settimana'],
  ['Ventas del mes', 'Sales this month', 'Umsatz des Monats', 'Ventes du mois', 'Vendite del mese'], ['Operativa de pedidos', 'Order operations', 'Bestellabwicklung', 'Suivi des commandes', 'Gestione ordini'],
  ['Notificaciones', 'Notifications', 'Benachrichtigungen', 'Notifications', 'Notifiche'], ['Idioma', 'Language', 'Sprache', 'Langue', 'Lingua'],
  ['Tu cuenta', 'Your account', 'Dein Konto', 'Votre compte', 'Il tuo account'], ['Mi perfil', 'My profile', 'Mein Profil', 'Mon profil', 'Il mio profilo'],
  ['Rutas y desplazamientos', 'Routes and travel', 'Routen und Fahrten', 'Itinéraires et déplacements', 'Percorsi e spostamenti'], ['Horario de las rutas', 'Route schedule', 'Routenzeiten', 'Horaires des itinéraires', 'Orari dei percorsi'],
  ['Indicadores de Inicio', 'Home indicators', 'Start-Kennzahlen', 'Indicateurs d’accueil', 'Indicatori della home'], ['Mensajes', 'Messages', 'Nachrichten', 'Messages', 'Messaggi'],
  ['Base de datos', 'Database', 'Datenbank', 'Base de données', 'Database'], ['Clasificadores', 'Lists', 'Listen', 'Listes', 'Elenchi'], ['Equipo y cartera', 'Team and portfolio', 'Team und Portfolio', 'Équipe et portefeuille', 'Team e portafoglio'],
  ['Usuarios y permisos', 'Users and permissions', 'Benutzer und Rechte', 'Utilisateurs et droits', 'Utenti e permessi'], ['Roles y permisos', 'Roles and permissions', 'Rollen und Rechte', 'Rôles et droits', 'Ruoli e permessi'],
  ['Reglas de cartera', 'Portfolio rules', 'Portfolio-Regeln', 'Règles de portefeuille', 'Regole del portafoglio'], ['Frecuencia de visita', 'Visit frequency', 'Besuchshäufigkeit', 'Fréquence des visites', 'Frequenza delle visite'],
  ['Comisiones', 'Commissions', 'Provisionen', 'Commissions', 'Provvigioni'], ['Accesos', 'Sign-ins', 'Anmeldungen', 'Connexions', 'Accessi'], ['Auditoría', 'Audit log', 'Protokoll', 'Journal d’audit', 'Registro attività'],
  ['Stock', 'Stock', 'Bestand', 'Stock', 'Magazzino'], ['Almacenes', 'Warehouses', 'Lager', 'Entrepôts', 'Magazzini'], ['Material de visita', 'Visit materials', 'Besuchsmaterial', 'Matériel de visite', 'Materiale di visita'],
  ['Datos fiscales', 'Tax details', 'Steuerdaten', 'Données fiscales', 'Dati fiscali'], ['Series y numeración', 'Series and numbering', 'Serien und Nummerierung', 'Séries et numérotation', 'Serie e numerazione'],
  ['Empresa', 'Company', 'Unternehmen', 'Entreprise', 'Azienda'], ['Marca y logo', 'Brand and logo', 'Marke und Logo', 'Marque et logo', 'Marchio e logo'], ['Plan y suscripción', 'Plan and subscription', 'Tarif und Abo', 'Offre et abonnement', 'Piano e abbonamento'],
  ['Mis datos', 'My details', 'Meine Daten', 'Mes données', 'I miei dati'], ['Nombre visible', 'Display name', 'Anzeigename', 'Nom affiché', 'Nome visualizzato'], ['Teléfono', 'Phone', 'Telefon', 'Téléphone', 'Telefono'],
  ['Al entrar, abrir', 'Open on sign-in', 'Beim Start öffnen', 'Ouvrir à la connexion', 'Apri all’accesso'], ['Nueva contraseña', 'New password', 'Neues Passwort', 'Nouveau mot de passe', 'Nuova password'],
  ['Repítela', 'Repeat it', 'Wiederholen', 'Répétez-le', 'Ripetila'], ['Punto de salida', 'Starting point', 'Startpunkt', 'Point de départ', 'Punto di partenza'], ['Punto de llegada', 'End point', 'Zielpunkt', 'Point d’arrivée', 'Punto di arrivo'],
  ['Navegación', 'Navigation', 'Navigation', 'Navigation', 'Navigazione'], ['Nombre', 'Name', 'Name', 'Nom', 'Nome'], ['Dirección', 'Address', 'Adresse', 'Adresse', 'Indirizzo'],
  ['Buscar dirección', 'Find address', 'Adresse suchen', 'Chercher l’adresse', 'Cerca indirizzo'], ['Usar mi ubicación', 'Use my location', 'Meinen Standort verwenden', 'Utiliser ma position', 'Usa la mia posizione'],
  ['Guardar preferencias', 'Save preferences', 'Einstellungen speichern', 'Enregistrer', 'Salva preferenze'], ['Nuevo usuario', 'New user', 'Neuer Benutzer', 'Nouvel utilisateur', 'Nuovo utente'],
  ['+ Nuevo usuario', '+ New user', '+ Neuer Benutzer', '+ Nouvel utilisateur', '+ Nuovo utente'], ['+ Nueva cita', '+ New appointment', '+ Neuer Termin', '+ Nouveau rendez-vous', '+ Nuovo appuntamento'],
  ['+ Nuevo pedido', '+ New order', '+ Neue Bestellung', '+ Nouvelle commande', '+ Nuovo ordine'], ['+ Nuevo cliente', '+ New customer', '+ Neuer Kunde', '+ Nouveau client', '+ Nuovo cliente'],
  ['Registrar visita', 'Log visit', 'Besuch erfassen', 'Enregistrer la visite', 'Registra visita'], ['Editar ficha', 'Edit record', 'Datensatz bearbeiten', 'Modifier la fiche', 'Modifica scheda'],
  ['Marcar urgente', 'Mark urgent', 'Als dringend markieren', 'Marquer urgent', 'Segna urgente'], ['+ Añadir a mi agenda', '+ Add to my calendar', '+ Zu meinem Kalender', '+ Ajouter à mon agenda', '+ Aggiungi alla mia agenda'],
  ['Estado', 'Status', 'Status', 'Statut', 'Stato'], ['Visitas', 'Visits', 'Besuche', 'Visites', 'Visite'], ['Comercial asignado', 'Assigned rep', 'Zuständiger Vertreter', 'Commercial assigné', 'Agente assegnato'],
  ['Unidades pautadas', 'Units prescribed', 'Verordnete Einheiten', 'Unités prescrites', 'Unità prescritte'], ['Empezar jornada', 'Start day', 'Tag beginnen', 'Commencer la journée', 'Inizia la giornata'],
  ['Ordenar por cercanía', 'Sort by distance', 'Nach Entfernung sortieren', 'Trier par proximité', 'Ordina per vicinanza'], ['Ventas', 'Sales', 'Verkäufe', 'Ventes', 'Vendite'],
  ['Compras', 'Purchases', 'Einkäufe', 'Achats', 'Acquisti'], ['Proveedores', 'Suppliers', 'Lieferanten', 'Fournisseurs', 'Fornitori'], ['Llamadas', 'Calls', 'Anrufe', 'Appels', 'Chiamate'],
  ['Resumen', 'Summary', 'Übersicht', 'Résumé', 'Riepilogo'], ['Explorar', 'Explore', 'Erkunden', 'Explorer', 'Esplora'], ['Facturas', 'Invoices', 'Rechnungen', 'Factures', 'Fatture'],
  ['Mis rutas', 'My routes', 'Meine Routen', 'Mes itinéraires', 'I miei percorsi'], ['Propuestas automáticas', 'Suggested routes', 'Vorgeschlagene Routen', 'Itinéraires proposés', 'Percorsi suggeriti'],
  ['Todos los módulos', 'All modules', 'Alle Module', 'Tous les modules', 'Tutti i moduli'], ['Gira el móvil', 'Rotate your phone', 'Handy drehen', 'Tournez votre téléphone', 'Ruota il telefono'],
  ['Estás al día', 'You’re all caught up', 'Alles erledigt', 'Vous êtes à jour', 'Sei aggiornato'], ['Marcar todas como leídas', 'Mark all as read', 'Alle als gelesen markieren', 'Tout marquer comme lu', 'Segna tutte come lette'],
  ['citas de hoy visitadas', 'today’s visits done', 'heutige Besuche erledigt', 'visites du jour faites', 'visite di oggi fatte'], ['urgentes sin visitar', 'urgent, not visited', 'dringend, nicht besucht', 'urgents non visités', 'urgenti non visitati'],
  ['visitas esta semana', 'visits this week', 'Besuche diese Woche', 'visites cette semaine', 'visite questa settimana'], ['visitas este mes', 'visits this month', 'Besuche diesen Monat', 'visites ce mois-ci', 'visite questo mese'],
  ['médicos interesados', 'interested doctors', 'interessierte Ärzte', 'médecins intéressés', 'medici interessati'], ['sin contactar', 'not contacted', 'nicht kontaktiert', 'non contactés', 'non contattati'],
  ['médicos en tu cartera', 'doctors in your portfolio', 'Ärzte in deinem Portfolio', 'médecins de votre portefeuille', 'medici nel tuo portafoglio'], ['pendientes de unificar', 'pending merge', 'zusammenzuführen', 'à fusionner', 'da unire']
];
let IDIOMA = 'es', MAPA_I18N = null;
const SALUDOS = { en: ['Good morning', 'Good afternoon', 'Good evening'], de: ['Guten Morgen', 'Guten Tag', 'Guten Abend'], fr: ['Bonjour', 'Bon après-midi', 'Bonsoir'], it: ['Buongiorno', 'Buon pomeriggio', 'Buonasera'] };
function prepararIdioma(id) {
  IDIOMA = LOCALES[id] ? id : 'es'; document.documentElement.lang = IDIOMA;
  const i = IDIOMAS.findIndex(x => x[0] === IDIOMA);
  MAPA_I18N = null; if (i <= 0) return;
  MAPA_I18N = new Map();
  const may = t => t.charAt(0).toUpperCase() + t.slice(1), min = t => t.charAt(0).toLowerCase() + t.slice(1);
  I18N.forEach(r => { MAPA_I18N.set(r[0], r[i]); MAPA_I18N.set(min(r[0]), min(r[i])); MAPA_I18N.set(may(r[0]), may(r[i])); });
}
function traducirTexto(t) {
  if (!MAPA_I18N) return null;
  const k = t.trim(); if (!k || k.length > 90) return null;
  const v = MAPA_I18N.get(k); if (v) return t.replace(k, v);
  const m = k.match(/^(Buenos días|Buenas tardes|Buenas noches), (.+)$/);
  if (m && SALUDOS[IDIOMA]) return t.replace(k, SALUDOS[IDIOMA][['Buenos días', 'Buenas tardes', 'Buenas noches'].indexOf(m[1])] + ', ' + m[2]);
  return null;
}
function traducir(raiz) {
  if (!MAPA_I18N || !raiz) return;
  const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT, { acceptNode: n => n.parentElement && n.parentElement.closest('script,style,textarea,[data-notr]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
  const nodos = []; while (w.nextNode()) nodos.push(w.currentNode);
  nodos.forEach(n => { const v = traducirTexto(n.nodeValue); if (v != null && v !== n.nodeValue) n.nodeValue = v; });
  (raiz.querySelectorAll ? raiz.querySelectorAll('[placeholder],[title],[aria-label]') : []).forEach(e => ['placeholder', 'title', 'aria-label'].forEach(a => {
    const x = e.getAttribute(a); if (!x) return; const v = traducirTexto(x); if (v != null && v !== x) e.setAttribute(a, v);
  }));
}
let TR_PEND = new Set(), TR_RAF = 0;
new MutationObserver(ms => {
  if (!MAPA_I18N) return;
  ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) TR_PEND.add(n); else if (n.nodeType === 3 && n.parentElement) TR_PEND.add(n.parentElement); }));
  if (TR_RAF) return;
  TR_RAF = requestAnimationFrame(() => { TR_RAF = 0; const l = [...TR_PEND]; TR_PEND.clear(); l.forEach(n => n.isConnected && traducir(n)); });
}).observe(document.body, { childList: true, subtree: true });
// Fechas en el idioma elegido
fechaLarga = (orig => function (d) { return IDIOMA === 'es' ? orig(d) : new Date(d).toLocaleDateString(LOCALES[IDIOMA], { weekday: 'long', day: 'numeric', month: 'long' }); })(fechaLarga);
function aplicarIdioma(id) {
  prepararIdioma(id);
  try { localStorage.setItem('app-idioma', IDIOMA); } catch (e) {}
  if (MAPA_I18N) traducir(document.body);
}
prepararIdioma((() => { try { return localStorage.getItem('app-idioma') || 'es'; } catch (e) { return 'es'; } })());
if (MAPA_I18N) traducir(document.body);
mostrarApp = (orig => function (p) {
  const id = (p.preferencias || {}).idioma || 'es';
  if (id !== IDIOMA) { if (IDIOMA !== 'es' && id === 'es') { try { localStorage.setItem('app-idioma', 'es'); } catch (e) {} location.reload(); return; } prepararIdioma(id); }
  orig(p); if (MAPA_I18N) traducir(document.body);
})(mostrarApp);
// Selector de idioma en Mi perfil
pintarPerfil = (orig => function () {
  orig();
  const g = $('pfi') && $('pfi').closest('.g2'); if (!g) return;
  const vacio = g.children[1];
  vacio.innerHTML = `<label for="pfl">Idioma</label><select id="pfl" data-notr>${IDIOMAS.map(([k, n]) => `<option value="${k}" ${IDIOMA === k ? 'selected' : ''}>${n}</option>`).join('')}</select>`;
  $('pfl').onchange = async () => {
    const id = $('pfl').value;
    const prefs = Object.assign({}, PERFIL.preferencias || {}, { idioma: id });
    const { data, error } = await db.rpc('guardar_preferencias', { p: prefs });
    if (error) { toast('No se ha podido guardar', true); return; }
    PERFIL.preferencias = data || prefs;
    try { localStorage.setItem('app-idioma', id); } catch (e) {}
    // Al volver al castellano se recarga para recuperar los textos originales
    if (id === 'es') { location.reload(); return; }
    aplicarIdioma(id); toast('✓');
  };
})(pintarPerfil);


// Barra inferior del móvil y barra de «Entrar como» desde el primer momento
pintarBnav();

pintarConexion();
vaciarCola();
arrancar();
