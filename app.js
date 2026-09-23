/* ============================================================
   DLC OS 2.0 · Entrega 2: inicio, navegación y directorio
   ============================================================ */

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const CFG = window.DLC_CONFIG;
const db = window.supabase.createClient(CFG.url, CFG.anon, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'dlc-os-sesion' }
});

let PERFIL = null, TAB = 'inicio';
const F = { q: '', prov: '', muni: '', esp: '', est: '', urg: false, orden: 'nombre', pagina: 0, total: 0 };
const PASO = 50;

const hoyISO = () => new Date().toISOString().slice(0, 10);
const fechaLarga = d => d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
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
  document.querySelectorAll('#nav [data-t="ventas"]').forEach(b => b.classList.toggle('hide', !veVentas()));
  cargarCatalogos();
  pintarRutaBarra();
  cargarInicio();
  cargarFiltros();
}

/* ---------------- menú de usuario ---------------- */

$('ubtn').addEventListener('click', e => { e.stopPropagation(); $('umenu').classList.toggle('hide'); });
document.addEventListener('click', () => $('umenu').classList.add('hide'));
$('umenu').addEventListener('click', async e => {
  const b = e.target.closest('[data-u]'); if (!b) return;
  if (b.dataset.u === 'salir') { await db.auth.signOut(); location.reload(); }
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
  ['inicio', 'agenda', 'rutas', 'directorio', 'seguimiento', 'ventas', 'analitica', 'config', 'admin'].forEach(k => $('v-' + k).classList.toggle('hide', k !== t));
  window.scrollTo({ top: 0 });
  if (t === 'directorio' && !$('lista').children.length) buscar(true);
  if (t === 'agenda') cargarAgenda();
  if (t === 'rutas') cargarRutas();
  if (t === 'seguimiento') cargarSeguimiento();
  if (t === 'ventas') cargarVentas();
  if (t === 'analitica') cargarAnalitica();
  if (t === 'config') cargarConfig();
  if (t === 'admin') cargarAdmin();
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

  const { data, error } = await db.rpc('panel_inicio', { lim: 6 });
  if (error) { $('c-agenda').innerHTML = `<div class="vacio">No se ha podido cargar: ${esc(error.message)}</div>`; return; }
  const k = data.kpis;

  const kpi = (n, t, cls, accion, extra) =>
    `<div class="kpi ${cls || ''} ${accion ? 'click' : ''}" ${accion ? `data-k="${accion}"` : ''}>
       <b>${typeof n === 'string' ? n : num(n)}</b><span>${esc(t.charAt(0).toUpperCase() + t.slice(1))}</span>${extra || ''}</div>`;

  const cfg = kpiConfig().filter(x => x.on);
  $('kpis').innerHTML = cfg.map(x => {
    if (x.filtro) return `<div class="kpi click" data-kf="${esc(JSON.stringify(x.filtro))}"><b class="cont">…</b>
      <span>${esc(x.t || textoFiltro(x.filtro))}</span></div>`;
    const c = KPI_CAT.find(y => y.id === x.id);
    if (!c || (c.admin && PERFIL.rol !== 'Administrador')) return '';
    return kpi(c.v(k), x.t || c.t, c.cls ? c.cls(k) : '', c.h);
  }).join('') + `<div class="kpi" style="display:grid;place-items:center;border-style:dashed">
      <button class="kcfg" data-k="cfgkpis">⚙ Personalizar indicadores</button></div>`;

  document.querySelectorAll('#kpis [data-kf]').forEach(async el => {
    const n = await contarFiltro(JSON.parse(el.dataset.kf));
    const b = el.querySelector('.cont'); if (b) b.textContent = num(n);
  });

  tarjetaComision();
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
    F.q = e.target.value.trim();
    if (TAB !== 'directorio') ir('directorio');
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
  if (reiniciar) { F.pagina = 0; $('lista').innerHTML = ''; }
  $('cuenta').textContent = 'Buscando…';
  const t0 = performance.now();

  const { data, error } = await db.rpc('buscar_medicos', {
    q: F.q || null, f_provincia: F.prov || null, f_municipio: F.muni || null,
    f_estado: F.est || null, f_especialidad: F.esp || null, f_area: null,
    f_urgentes: F.urg, f_mios: false, f_sin_visitar: false,
    orden: F.orden, lim: PASO, desplaz: F.pagina * PASO
  });

  if (error) { $('cuenta').textContent = 'No se ha podido buscar: ' + error.message; return; }

  F.total = data.total;
  const ms = Math.round(performance.now() - t0);
  $('cuenta').innerHTML = `<b>${num(data.total)}</b> médicos <span class="sm">· ${ms} ms</span>`;
  pintarChips();

  const filas = data.filas || [];
  if (!filas.length && F.pagina === 0) { $('lista').innerHTML = '<div class="vacio">Ningún médico cumple estos filtros.</div>'; $('thead').innerHTML = ''; }
  else { if (F.pagina === 0) cabeceraTabla(); $('lista').insertAdjacentHTML('beforeend', filas.map(filaTabla).join('')); }

  const mostrados = F.pagina * PASO + filas.length;
  $('mas').classList.toggle('hide', mostrados >= data.total);
  $('mas').textContent = `Cargar más (${num(mostrados)} de ${num(data.total)})`;
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

$('mas').addEventListener('click', () => { F.pagina++; buscar(false); });
$('lista').addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (b) abrirFicha(b.dataset.id); });

/* ---------------- ficha ---------------- */

async function abrirFicha(id) {
  FICHA_ID = id;
  $('fbody').innerHTML = '<div class="skel" style="width:50%"></div><div class="skel"></div><div class="skel" style="width:80%"></div>';
  $('ficha').showModal();
  const { data, error } = await db.rpc('ficha_medico', { p_id: id });
  if (error) { $('fbody').innerHTML = `<p class="sm">No se ha podido abrir: ${esc(error.message)}</p>`; return; }

  const m = data.medico, cons = data.consultas || [], vis = data.visitas || [], com = data.comerciales || [];
  const dias = ['L','M','X','J','V'];

  $('fbody').innerHTML = `
    <div class="fh">
      <div><h2>${m.urgente ? '<span class="pill p-urg">Urgente</span> ' : ''}${esc(m.nombre)}</h2>
        <div class="sm">${esc(m.especialidad || '')}${m.area ? ' · ' + esc(m.area) : ''} · código ${esc(m.codigo)}</div></div>
      <button class="x" id="fx" aria-label="Cerrar">✕</button>
    </div>
    ${(puedeRegistrar() || puedeEditar()) ? `<div class="acts">
      ${puedeRegistrar() ? `<button class="btn" data-act="visita" data-id="${m.id}">Registrar visita</button>` : ''}
      ${puedeEditar() ? `<button class="btn sec" data-act="editar" data-id="${m.id}">Editar ficha</button>` : ''}
      ${puedeEditar() ? `<button class="btn ${m.urgente ? 'sec' : 'warn'}" data-act="urgente" data-id="${m.id}" data-urg="${m.urgente ? 1 : 0}">${m.urgente ? 'Quitar urgente' : 'Marcar urgente'}</button>` : ''}
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
      ${vis.length ? vis.slice(0, 8).map(v => `<div style="padding:6px 0;border-top:1px solid var(--line)">
        <b>${fechaCorta(v.fecha)}</b> · ${esc((v.resultados || []).join(' + ') || 'Sin resultado')}
        ${v.nota ? `<div class="sm">${esc(v.nota)}</div>` : ''}</div>`).join('')
        : '<div class="sm">Todavía no hay visitas registradas.</div>'}</div>
    ${m.nota ? `<div class="blk"><h3>Nota</h3><div>${esc(m.nota)}</div></div>` : ''}
    ${m.contacto ? `<div class="blk"><h3>Contacto</h3><div>${esc(m.contacto)}</div></div>` : ''}`;
  $('fx').onclick = () => $('ficha').close();
}

$('ficha').addEventListener('click', e => { if (e.target.id === 'ficha') $('ficha').close(); });

/* ---------------- arranque ---------------- */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

/* ============================================================
   DLC OS 2.0 · Entrega 3: registrar visitas, editar fichas y altas
   ============================================================ */

const CAT = { RESULTADO: [], ESPECIALIDAD: [], AREA: [], MOTIVO_URGENCIA: [] };
const ESTADOS = ['Sin contactar', 'Presentado', 'Interesado', 'Prescribe', 'No interesado'];
const DIAS = ['L', 'M', 'X', 'J', 'V'];
const DIAN = { L: 'Lunes', M: 'Martes', X: 'Miércoles', J: 'Jueves', V: 'Viernes' };
const HM = ['09:00-13:00', '09:30-13:30', '10:00-14:00', '08:00-15:00'];
const HT = ['15:00-19:00', '16:00-19:00', '16:00-20:00', '17:00-20:00'];
let FICHA_ID = null;

const puedeEditar = () => PERFIL && (PERFIL.rol === 'Administrador' || ((PERFIL.areas || {}).M || 0) >= 2);
const puedeCrear = () => PERFIL && (PERFIL.rol === 'Administrador' || ((PERFIL.areas || {}).M || 0) >= 3);
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
  if (e.target.closest('[data-cerrar]')) $('dlg').close();
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

$('dlg').addEventListener('click', e => { if (e.target.id === 'dlg') $('dlg').close(); });

$('nuevoBtn').addEventListener('click', () => {
  if (!puedeCrear()) { toast('No tienes permiso para crear fichas', true); return; }
  $('dbody').innerHTML = `
    <div class="fh"><div><h2>Crear nuevo</h2><div class="sm">¿Qué quieres dar de alta?</div></div>
      <button class="x" data-cerrar aria-label="Cerrar">✕</button></div>
    <div class="opciones" style="margin-top:10px">
      <button class="opt" data-crear="Persona" style="flex-direction:column;align-items:flex-start;gap:4px;padding:16px">
        <b style="font-size:16px;color:var(--navy)">Médico</b><span class="sm">Profesional con sus consultas y horarios</span></button>
      <button class="opt" data-crear="Centro" style="flex-direction:column;align-items:flex-start;gap:4px;padding:16px">
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
  pintarConexion();
  while (c.length) {
    const op = c[0];
    const { error } = await db.rpc(op.fn, op.payload);
    if (error && String(error.message || '').match(/fetch|network|Failed/i)) break;
    c = c.slice(1);
    colaGuardar(c);
  }
  pintarConexion();
  if (!colaLeer().length) { cargarInicio(); if (TAB === 'agenda') cargarAgenda(); }
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

  $('v-agenda').innerHTML = `
    <div class="saludo"><div><h1>Agenda</h1><div class="fecha" id="agtit">…</div></div>
      <div class="acts" style="margin:0">
        <button class="btn sec" data-ag="ant">←</button>
        <button class="btn sec" data-ag="hoy">Hoy</button>
        <button class="btn sec" data-ag="sig">→</button>
        <button class="btn ${AG_MODO === 'dia' ? '' : 'sec'}" data-ag="dia">Día</button>
        <button class="btn ${AG_MODO === 'semana' ? '' : 'sec'}" data-ag="semana">Semana</button>
      </div></div>
    <div class="card" id="agcuerpo"><div class="skel"></div><div class="skel" style="width:70%"></div></div>
    <div class="card" id="agpend"></div>`;

  $('agtit').textContent = AG_MODO === 'dia'
    ? fechaLarga(new Date(AG_FECHA + 'T00:00:00')).replace(/^./, c => c.toUpperCase())
    : `Semana del ${fechaCorta(desde)} al ${fechaCorta(hasta)}`;

  const [{ data: citas, error }, { data: pend }] = await Promise.all([
    db.rpc('agenda_rango', { p_desde: desde, p_hasta: hasta, p_usuario: PERFIL.rol === 'Administrador' ? null : PERFIL.id }),
    db.rpc('pendientes_ruta')
  ]);

  if (error) { $('agcuerpo').innerHTML = `<div class="vacio">No se ha podido cargar: ${esc(error.message)}</div>`; return; }

  const porDia = {};
  (citas || []).forEach(c => { (porDia[c.fecha] = porDia[c.fecha] || []).push(c); });
  const dias = AG_MODO === 'dia' ? [AG_FECHA] : Array.from({ length: 7 }, (_, i) => isoMas(desde, i));

  $('agcuerpo').innerHTML = dias.map(f => {
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
              <button class="btn sec" data-cita="repro|${c.id}">Mover</button>
              <button class="btn sec" data-cita="desc|${c.id}">Descartar</button>` : ''}
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
    if (k === 'ant') AG_FECHA = isoMas(AG_FECHA, AG_MODO === 'dia' ? -1 : -7);
    if (k === 'sig') AG_FECHA = isoMas(AG_FECHA, AG_MODO === 'dia' ? 1 : 7);
    if (k === 'dia' || k === 'semana') AG_MODO = k;
    cargarAgenda();
    return;
  }
  const c = e.target.closest('[data-cita]');
  if (!c) return;
  const [acc, id] = c.dataset.cita.split('|');
  if (acc === 'ficha') return abrirFicha(id);
  if (acc === 'visita') return abrirVisita(id);
  if (acc === 'desc') {
    await escribir('estado_cita', { p_id: id, p_estado: 'Descartada' });
    toast('Cita descartada'); cargarAgenda(); cargarInicio(); return;
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
  const R = 6371, r = Math.PI / 180;
  const dLat = (b[0] - a[0]) * r, dLon = (b[1] - a[1]) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
const minutosEntre = (a, b) => Math.max(6, Math.round(km(a, b) / 40 * 60) + 5);
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
  const enlace = enlaceNav(navActual() === 'google' ? [PLAN.salida.lat, PLAN.salida.lon] : ultima.xy,
    navActual() === 'google' ? PLAN.paradas.map(p => p.xy) : null);

  $('rplan').innerHTML = `<div class="card">
    <h2>Plan de hoy<span class="n">${total} ${total === 1 ? 'médico' : 'médicos'}</span></h2>
    <p class="sm">Salida de ${esc(PLAN.salida.nombre)} a las ${PLANCFG().salida} · ${PLAN.paradas.length} ${PLAN.paradas.length === 1 ? 'parada' : 'paradas'} ·
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
      <button class="btn" id="planempezar">▶ Empezar ruta</button>
      <button class="btn sec" id="plancerrar">Cerrar</button>
    </div></div>`;

  $('plancerrar').onclick = () => { PLAN = null; pintarPlan(); };
  $('planver').onclick = e => { mapaDelPlan(); e.target.classList.add('hide'); };
  if ($('planhora')) $('planhora').onclick = abrirHorarioPlan;
  $('planempezar').onclick = () => empezarRuta();
  $('planag').onclick = async ev => {
    ev.target.disabled = true; ev.target.textContent = 'Guardando…';
    let n = 0;
    for (const p of PLAN.paradas) {
      for (const m of p.medicos) {
        await escribir('guardar_cita', { p: {
          medico_id: m.id, fecha: hoyISO(), hora: hm(p.llegada), centro_nombre: p.centro,
          estado: 'Planificada', origen: 'Plan del día',
          op_id: 'c-' + m.id + '-' + hoyISO()
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
const AREAS = [['H', 'Inicio'], ['G', 'Agenda'], ['R', 'Rutas'], ['M', 'Directorio'], ['S', 'Visitas'], ['V', 'Ventas'], ['K', 'Configuración']];
const NIVELES = ['Sin acceso', 'Ver', 'Editar', 'Completo'];
const ROLES = ['Administrador', 'Comercial', 'Televenta', 'Solo consulta', 'Medico'];
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
  const s = punto('salida') || { nombre: 'Santpedor', dir: 'Santpedor', lat: 41.7833, lon: 1.8414 };
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
    <div class="acts" style="justify-content:flex-end"><button class="btn" id="pfguardar">Guardar preferencias</button></div>`;
  if ($('navsel')) $('navsel').onchange = e => cambiarNavegador(e.target.value);

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
  pintarRutaBarra(); pintarCatalogos();
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
      <button data-as="comisiones" aria-pressed="${ADM_SEC === 'comisiones'}">Comisiones</button></div>
    <div class="card" id="admcuerpo"><div class="skel"></div><div class="skel" style="width:60%"></div></div>`;
  if (ADM_SEC === 'comisiones') { pintarComisiones(); return; }
  $('unuevo').onclick = nuevoUsuario;

  const { data, error } = await db.rpc('usuarios_lista');
  if (error) { $('admcuerpo').innerHTML = `<div class="vacio">No se ha podido cargar: ${esc(error.message)}</div>`; return; }
  USUARIOS = data || [];
  $('admcuerpo').innerHTML = `<h2>Usuarios<span class="n">${USUARIOS.length}</span></h2>
    <div class="lista">${USUARIOS.map(u => `<div class="item" style="cursor:default">
      <span class="ic">${esc(iniciales(u.nombre))}</span>
      <span class="tx"><b>${esc(u.nombre)}${u.activo ? '' : ' <span class="sm">· desactivado</span>'}</b>
        <span class="sm">${esc(u.rol)} · ${esc(u.email || '')} · ${num(u.medicos)} médicos · ${num(u.visitas)} visitas</span></span>
      <span class="acts" style="margin:0">
        <button class="btn sec" data-uedit="${u.id}">Editar</button>
        <button class="btn sec" data-ucart="${u.id}">Cartera</button></span></div>`).join('')}</div>`;

  $('admcuerpo').querySelectorAll('[data-uedit]').forEach(b => b.onclick = () => editarUsuario(b.dataset.uedit));
  $('admcuerpo').querySelectorAll('[data-ucart]').forEach(b => b.onclick = () => asignarCartera(b.dataset.ucart));
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
    const preset = {
      'Administrador': { H: 3, G: 3, R: 3, M: 3, S: 3, V: 3, K: 3 },
      'Comercial': { H: 2, G: 2, R: 2, M: 2, S: 2, V: 1, K: 0 },
      'Televenta': { H: 2, G: 1, R: 1, M: 2, S: 1, V: 3, K: 0 },
      'Solo consulta': { H: 1, G: 1, R: 1, M: 1, S: 1, V: 1, K: 0 },
      'Medico': { H: 1, G: 0, R: 0, M: 0, S: 0, V: 0, K: 0 }
    }[$('ur').value] || {};
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
      await db.rpc('asignar_esquema', { p_usuario: id, p_esquema: $('ucom').value || null, p_quitar: !$('ucom').value });
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
      <div><label for="ne">Correo</label><input id="ne" type="email" placeholder="nombre@dlchealthgroup.com"></div>
    </div>
    <div class="g2">
      <div><label for="nr">Rol</label><select id="nr">${ROLES.map(r => `<option ${r === 'Comercial' ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
      <div><label for="np">Contraseña temporal</label><input id="np" value="DLC-${Math.random().toString(36).slice(2, 8)}"></div>
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
        ${PERFIL.rol === 'Administrador' ? '<button class="btn sec" id="segdup">Duplicados</button>' : ''}
        <button class="btn sec" id="segcsv">Descargar CSV</button></div></div>
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
      <div id="slista"></div>
      <button class="mas hide" id="smas">Cargar más</button>
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
  $('segcsv').onclick = ev => descargarCSV(ev.target);
  if ($('segdup')) $('segdup').onclick = () => { DUPS = null; abrirDuplicados(); };

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
  if (reinicia) { SEG.pagina = 0; $('slista').innerHTML = ''; }
  $('scuenta').textContent = 'Buscando…';
  const { data, error } = await db.rpc('seguimiento_lista', {
    f_estado: SEG.estado || null, f_provincia: SEG.prov || null, f_municipio: SEG.muni || null,
    f_modo: SEG.modo, lim: 100, desplaz: SEG.pagina * 100
  });
  if (error) { $('scuenta').textContent = 'No se ha podido cargar: ' + error.message; return; }
  $('scuenta').innerHTML = `<b>${num(data.total)}</b> médicos`;
  const filas = data.filas || [];
  if (!filas.length && SEG.pagina === 0) { $('slista').innerHTML = '<div class="vacio">Nada que mostrar con estos filtros.</div>'; }
  else $('slista').insertAdjacentHTML('beforeend', filas.map(m => `
    <button class="fila" data-id="${m.id}">
      <span><span class="nm">${m.urgente ? '<span class="pill p-urg">Urgente</span> ' : ''}${esc(m.nombre)}</span>
        <span class="sm">${esc(m.especialidad || '')} · ${esc(m.centro_nombre || '')} ${esc(m.municipio || '')}</span></span>
      <span class="c2"><span class="sm">${m.ultima_visita ? 'Última: <b>' + fechaCorta(m.ultima_visita) + '</b> · ' + esc(m.ultimo_resultado || '') : 'Sin visitar'}</span>
        <span class="sm">${m.n_visitas} visitas${m.muestras ? ' · ' + m.muestras + ' muestras' : ''}</span></span>
      <span class="c3"><span class="sm">${m.proxima_fecha
        ? `<b style="color:${m.proxima_fecha < hoyISO() ? 'var(--warn)' : 'var(--navy)'}">${fechaCorta(m.proxima_fecha)}</b><br>${esc(m.proxima_accion || '')}`
        : ''}</span></span>
      <span class="pill p-est">${esc(m.estado_comercial)}</span>
    </button>`).join(''));
  const most = SEG.pagina * 100 + filas.length;
  $('smas').classList.toggle('hide', most >= data.total);
  $('smas').onclick = () => { SEG.pagina++; listaSeguimiento(false); };
  $('slista').onclick = e => { const b = e.target.closest('[data-id]'); if (b) abrirFicha(b.dataset.id); };
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
  a.download = 'DLC_medicos_' + hoyISO() + '.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  {const n=(data||[]).length;toast(`${num(n)} ${n === 1 ? 'médico exportado' : 'médicos exportados'}`);}
}

/* ---------------- duplicados ---------------- */

async function abrirDuplicados() {
  $('dbody').innerHTML = `<div class="fh"><div><h2>Duplicados</h2>
      <div class="sm">Fichas marcadas y búsqueda de parecidos en toda la base</div></div>
      <button class="x" data-cerrar aria-label="Cerrar">✕</button></div>
    <div class="acts"><button class="btn sec" id="dscan">Buscar parecidos (≥80%)</button></div>
    <div id="dcuerpo"><div class="skel"></div><div class="skel" style="width:60%"></div></div>`;
  $('dlg').showModal();

  $('dscan').onclick = async ev => {
    ev.target.disabled = true; ev.target.textContent = 'Buscando…';
    const { data } = await db.rpc('escanear_duplicados', { p_umbral: 80, p_tope: 100 });
    ev.target.disabled = false; ev.target.textContent = 'Buscar parecidos (≥80%)';
    PARES = data || [];
    pintarDuplicados();
  };

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
  $('mas').classList.toggle('hide', MODO_MAPA || F.total <= 50);
  if (MODO_MAPA) pintarMapa();
});

$('csvBtn').addEventListener('click', ev => descargarCSV(ev.target));

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
    const m = L.map('planmapa').setView([PLAN.salida.lat, PLAN.salida.lon], 10);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m);
    const pin = (xy, txt, col) => L.marker(xy, { icon: L.divIcon({ className: 'mpin', html: `<span style="background:${col}">${txt}</span>`, iconSize: [24, 24], iconAnchor: [12, 12] }) }).addTo(m);
    pin([PLAN.salida.lat, PLAN.salida.lon], 'S', '#12805C').bindPopup('Salida · ' + esc(PLAN.salida.nombre));
    PLAN.paradas.forEach((p, i) => pin(p.xy, String(i + 1), '#0E2F52')
      .bindPopup(`<b>${i + 1}. ${esc(p.centro)}</b><br>${hm(p.llegada)}–${hm(p.fin)}<br>${p.medicos.map(x => esc(x.nombre)).join('<br>')}`));
    const linea = [[PLAN.salida.lat, PLAN.salida.lon]].concat(PLAN.paradas.map(p => p.xy), [[PLAN.salida.lat, PLAN.salida.lon]]);
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
  { id: 'dups',         t: 'pendientes de unificar',   v: k => k.pendientes_unificar, cls: () => 'warn', admin: true }
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
    f_urgentes: !!f.urg, f_mios: false, f_sin_visitar: !!f.sin, orden: 'nombre', lim: 1, desplaz: 0
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
  const h = e.target.closest('[data-res]'); if (!h) return;
  e.preventDefault();
  const cfg = colsConfig(), c = cfg.find(x => x.k === h.dataset.res);
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

$('colsBtn').addEventListener('click', abrirColumnas);



/* ============================================================
   DLC OS 2.0 · Entrega 10: pedidos, unidades y analítica
   ============================================================ */

let PRODUCTOS = [], PEDIDOS = [], SIN_ATRIB = [];
const AN = { dim: 'medico', desde: '', hasta: '', canal: '', producto: '' };
const puedeVentas = () => PERFIL && (PERFIL.rol === 'Administrador' || ((PERFIL.areas || {}).V || 0) >= 2);
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
      </div>
      <div class="cuenta" id="pcuenta">Cargando…</div>
      <div id="pedlista"></div>
    </div>`;

  if ($('pednuevo')) $('pednuevo').onclick = () => editorPedido();
  if ($('prodbtn')) $('prodbtn').onclick = editorProductos;
  ['pdesde', 'phasta', 'pcanal'].forEach(id => $(id).onchange = listaPedidos);
  await cargarProductos();
  listaPedidos();
  pintarSinAtribuir();
}

async function listaPedidos() {
  const { data, error } = await db.rpc('pedidos_lista', {
    p_desde: $('pdesde').value || null, p_hasta: $('phasta').value || null,
    p_canal: $('pcanal').value || null, lim: 200
  });
  if (error) { $('pcuenta').textContent = 'No se ha podido cargar: ' + error.message; return; }
  PEDIDOS = data || [];
  const unidades = PEDIDOS.reduce((n, p) => n + (p.unidades || 0), 0);
  $('pcuenta').innerHTML = `<b>${num(PEDIDOS.length)}</b> pedidos · <b>${num(unidades)}</b> unidades`;
  $('pedlista').innerHTML = PEDIDOS.length ? PEDIDOS.map(p => `
    <div class="fila" style="cursor:default;grid-template-columns:minmax(0,1.4fr) minmax(0,1.4fr) auto auto">
      <span><span class="nm">${esc(p.medico || p.centro || p.contacto || 'Sin atribuir')}</span>
        <span class="sm">${fechaCorta(p.fecha)} · ${p.canal === 'centro' ? 'Venta a centro' : 'Recomendación'}${p.comercial ? ' · ' + esc(p.comercial) : ''}</span></span>
      <span class="c2"><span class="sm">${esc(p.productos || '')}</span>
        <span class="sm">${p.numero ? 'Nº ' + esc(p.numero) : ''} ${esc(p.contacto || '')}</span></span>
      <span class="c3"><span class="pill p-est">${esc(p.estado)}</span></span>
      <span><b style="font-size:17px;color:var(--navy)">${num(p.unidades)}</b> <span class="sm">uds.</span></span>
    </div>`).join('') : '<div class="vacio">Todavía no hay pedidos registrados.</div>';
}

async function pintarSinAtribuir() {
  const { data } = await db.rpc('lineas_sin_atribuir');
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

async function editorPedido() {
  let lineas = [{ producto_id: (PRODUCTOS[0] || {}).id || '', unidades: 1 }];
  let medico = null;

  const pinta = () => {
    $('dbody').innerHTML = `
      <div class="fh"><div><h2>Nuevo pedido</h2><div class="sm">Las unidades se atribuyen al médico y a su comercial</div></div>
        <button class="x" data-cerrar aria-label="Cerrar">✕</button></div>
      <div class="g2">
        <div><label for="pfecha">Fecha</label><input id="pfecha" type="date" value="${hoyISO()}"></div>
        <div><label for="pcan">Canal</label><select id="pcan">
          <option value="paciente">Recomendación a paciente</option>
          <option value="centro">Venta a centro (con descuento)</option></select></div>
      </div>
      <div id="zonapac">
        <label for="pmed">Médico que lo recomienda</label>
        <input id="pmed" placeholder="Código o nombre" value="${esc(medico ? medico.nombre : '')}">
        <div id="pmedcand" class="sm" style="margin-top:6px">${medico
          ? `<b style="color:var(--ok)">✓ ${esc(medico.nombre)}</b> · código ${esc(medico.codigo)}`
          : 'Escribe y elige de la lista. Si no aparece, el pedido queda pendiente de atribuir.'}</div>
        <div class="g2" style="margin-top:10px">
          <div><label for="pcnom">Paciente (nombre)</label><input id="pcnom"></div>
          <div><label for="pctel">Teléfono</label><input id="pctel" inputmode="tel"></div>
        </div>
      </div>
      <label>Líneas</label>
      <div id="plineas">${lineas.map((l, i) => `<div class="g2" style="margin-bottom:8px">
        <select data-lp="${i}">${PRODUCTOS.map(p => `<option value="${p.id}" ${l.producto_id === p.id ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('')
          || '<option value="">Sin productos: créalos primero</option>'}</select>
        <div style="display:flex;gap:8px"><input data-lu="${i}" type="number" min="1" value="${l.unidades}" placeholder="Unidades">
          ${lineas.length > 1 ? `<button type="button" class="btn sec" data-lx="${i}">✕</button>` : ''}</div>
      </div>`).join('')}</div>
      <div class="acts"><button type="button" class="btn sec" id="plmas">+ Añadir línea</button></div>
      <label for="pnota">Nota</label><input id="pnota">
      <div class="acts" style="justify-content:flex-end">
        <button class="btn sec" data-cerrar>Cancelar</button>
        <button class="btn" id="pguardar">Guardar pedido</button></div>`;

    const leer = () => lineas = [...$('plineas').children].map((d, i) => ({
      producto_id: d.querySelector(`[data-lp="${i}"]`).value,
      unidades: +d.querySelector(`[data-lu="${i}"]`).value || 1
    }));

    $('plmas').onclick = () => { leer(); lineas.push({ producto_id: (PRODUCTOS[0] || {}).id || '', unidades: 1 }); pinta(); };
    $('plineas').querySelectorAll('[data-lx]').forEach(b => b.onclick = () => { leer(); lineas.splice(+b.dataset.lx, 1); pinta(); });
    $('pcan').onchange = () => $('zonapac').classList.toggle('hide', $('pcan').value === 'centro');

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
      let contacto_id = null;
      if ($('pcan').value === 'paciente' && $('pcnom').value.trim()) {
        const { data: c } = await db.from('contactos')
          .insert({ nombre: $('pcnom').value.trim().toUpperCase(), telefono: $('pctel').value.trim() })
          .select('id').single();
        contacto_id = c ? c.id : null;
      }
      const { data: r, error } = await db.rpc('guardar_pedido', { p: {
        fecha: $('pfecha').value, canal: $('pcan').value,
        medico_id: medico ? medico.id : null, medico_texto: $('pmed') ? $('pmed').value.trim() : '',
        contacto_id, nota: $('pnota').value.trim(),
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
      <span class="ic">◧</span><span class="tx"><b>${esc(p.nombre)}</b>
        <span class="sm">${esc(p.presentacion || '')} ${p.referencia ? '· ref. ' + esc(p.referencia) : ''}</span></span>
      <span class="acts" style="margin:0"><button class="btn sec" data-pdel="${p.id}">Desactivar</button></span></div>`).join('')
      || '<div class="vacio">Todavía no hay productos.</div>'}</div>
    <div class="g2" style="margin-top:12px">
      <div><label for="prn">Nombre</label><input id="prn" placeholder="Nombre del producto"></div>
      <div><label for="prp">Presentación</label><input id="prp" placeholder="Caja de 30 cápsulas"></div>
    </div>
    <div class="acts" style="justify-content:flex-end"><button class="btn" id="pradd">Añadir producto</button></div>`;

  $('pradd').onclick = async ev => {
    if (!$('prn').value.trim()) { toast('Escribe el nombre', true); return; }
    ev.target.disabled = true;
    const { data: r, error } = await db.rpc('guardar_producto', { p: { nombre: $('prn').value.trim(), presentacion: $('prp').value.trim() } });
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
      <div class="acts" style="margin:0"><button class="btn sec" id="ancsv">Descargar CSV</button></div></div>
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
      </div>
      <div class="cuenta" id="acuenta">Calculando…</div>
      <div id="aserie" style="padding:14px"></div>
      <div id="atabla"></div>
    </div>`;
  ['adim', 'adesde', 'ahasta', 'acanal'].forEach(id => $(id).onchange = pintarAnalitica);
  $('ancsv').onclick = () => {
    const filas = (window.__AN || []).map(f => ({ concepto: f.nombre, unidades: f.unidades }));
    if (!filas.length) { toast('Nada que exportar', true); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([aCSV(filas)], { type: 'text/csv;charset=utf-8' }));
    a.download = 'DLC_unidades_' + hoyISO() + '.csv'; a.click();
    toast('Descargado');
  };
  pintarAnalitica();
}

async function pintarAnalitica() {
  $('acuenta').textContent = 'Calculando…';
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
  $('admcuerpo').innerHTML = '<div class="skel"></div><div class="skel" style="width:60%"></div>';
  const [{ data: esq }, { data: liq }] = await Promise.all([
    db.rpc('esquemas_lista'), db.rpc('liquidaciones_lista', { p_periodo: null })
  ]);
  ESQUEMAS = esq || [];

  $('admcuerpo').innerHTML = `
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
  $('admcuerpo').querySelectorAll('[data-esq]').forEach(b => b.onclick = () => editorEsquema(b.dataset.esq));
  $('liqcalc').onclick = calcularLiquidaciones;
  $('admcuerpo').querySelectorAll('[data-liq]').forEach(b => b.onclick = async () => {
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
  (PERFIL.preferencias || {}).plan || {});

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
      <div class="acts" style="margin:0">${selectorNav()}
        <button class="btn" id="rnueva">+ Nueva ruta</button></div></div>
    <div class="subnav">
      <button data-rs="mis" aria-pressed="${RSEC === 'mis'}">Mis rutas</button>
      <button data-rs="prop" aria-pressed="${RSEC === 'prop'}">Propuestas automáticas</button>
    </div>
    <div id="rcuerpo"><div class="card"><div class="skel"></div><div class="skel" style="width:60%"></div></div></div>
    <div id="rplan"></div>`;

  $('rnueva').onclick = () => editorRuta(null);
  $('navsel').onchange = e => cambiarNavegador(e.target.value);
  $('v-rutas').querySelectorAll('[data-rs]').forEach(b => b.onclick = () => { RSEC = b.dataset.rs; cargarRutas(); });

  if (RSEC === 'mis') await listaRutas(); else await listaPropuestas();
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
  const { data: op } = await db.rpc('opciones_filtros', {});
  const g = Object.assign({}, (r && r.reglas) || {});

  if (codigos.length) {
    const { data } = await db.rpc('medicos_por_ids', { p_ids: codigos });
    medicos = data || [];
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
          <div><label for="cesp">Especialidad</label><select id="cesp">${sel(op.especialidades, g.especialidad)}</select></div>
          <div><label for="cest">Estado comercial</label><select id="cest">${sel(op.estados, g.estado)}</select></div>
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
  $('dlg').showModal();
}

/* ---------------- plan del día con horario configurable ---------------- */

async function planDesdeLista(lista, nombre, btn) {
  const conXY = (lista || []).filter(m => m.lat && m.lon);
  if (!conXY.length) { toast('Ninguno de esos médicos tiene ubicación', true); return; }
  construirPlan(conXY, nombre, btn);
}

function construirPlan(conXY, rutaId, btn) {
  const cfg = PLANCFG();
  const salida = (PERFIL.preferencias || {}).salida || { nombre: 'Santpedor', lat: 41.7833, lon: 1.8414 };
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
    if (PLAN && PLAN.rutaId) {
      if (typeof PLAN.rutaId === 'string' && PROPUESTAS && PROPUESTAS[PLAN.rutaId]) planDesdeLista(PROPUESTAS[PLAN.rutaId], PLAN.rutaId);
      else planificar(PLAN.rutaId, $('rnueva') || document.createElement('button'));
    }
  };
  $('dlg').showModal();
}


pintarConexion();
vaciarCola();
arrancar();
