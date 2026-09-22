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
  cargarCatalogos();
  cargarInicio();
  cargarFiltros();
}

/* ---------------- menú de usuario ---------------- */

$('ubtn').addEventListener('click', e => { e.stopPropagation(); $('umenu').classList.toggle('hide'); });
document.addEventListener('click', () => $('umenu').classList.add('hide'));
$('umenu').addEventListener('click', async e => {
  const b = e.target.closest('[data-u]'); if (!b) return;
  if (b.dataset.u === 'salir') { await db.auth.signOut(); location.reload(); }
  else alert('Esta sección llega en una entrega posterior.');
});

/* ---------------- navegación ---------------- */

$('nav').addEventListener('click', e => {
  const b = e.target.closest('[data-t]'); if (!b || b.disabled) return;
  ir(b.dataset.t);
});

function ir(t) {
  TAB = t;
  document.querySelectorAll('#nav button[data-t]').forEach(x => x.setAttribute('aria-selected', String(x.dataset.t === t)));
  ['inicio', 'agenda', 'rutas', 'directorio'].forEach(k => $('v-' + k).classList.toggle('hide', k !== t));
  window.scrollTo({ top: 0 });
  if (t === 'directorio' && !$('lista').children.length) buscar(true);
  if (t === 'agenda') cargarAgenda();
  if (t === 'rutas') cargarRutas();
}

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

  const kpi = (n, t, cls, accion) =>
    `<div class="kpi ${cls || ''} ${accion ? 'click' : ''}" ${accion ? `data-k="${accion}"` : ''}>
       <b>${typeof n === 'string' ? n : num(n)}</b><span>${t}</span></div>`;

  $('kpis').innerHTML =
    kpi(`${k.citas_hechas}/${k.citas_hoy}`, 'citas de hoy visitadas') +
    kpi(k.urgentes, 'urgentes sin visitar', k.urgentes ? 'warn' : 'ok', 'urgentes') +
    kpi(k.visitas_semana, 'visitas esta semana') +
    kpi(k.visitas_mes, 'visitas este mes') +
    kpi(k.interesados, 'médicos interesados', 'ok', 'interesados') +
    kpi(k.sin_contactar, 'sin contactar', '', 'sin_contactar') +
    kpi(k.medicos, 'médicos en tu cartera', '', 'todos') +
    (PERFIL.rol === 'Administrador' && k.pendientes_unificar
      ? kpi(k.pendientes_unificar, 'pendientes de unificar', 'warn') : '');

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
  const k = e.target.closest('[data-k]');
  if (k) {
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
  if (!filas.length && F.pagina === 0) $('lista').innerHTML = '<div class="vacio">Ningún médico cumple estos filtros.</div>';
  else $('lista').insertAdjacentHTML('beforeend', filas.map(fila).join(''));

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
      ${c.lat ? `<div class="sm" style="margin-top:6px"><a href="https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lon}" target="_blank" rel="noopener">Cómo llegar</a></div>` : ''}
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
    motivo = prompt('Motivo para marcarlo como urgente (opcional):', '');
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
    const f = prompt('Nueva fecha (AAAA-MM-DD):', isoMas(hoyISO(), 1));
    if (!f) return;
    await escribir('estado_cita', { p_id: id, p_estado: 'Reprogramada', p_fecha: f });
    toast('Cita movida al ' + fechaCorta(f)); cargarAgenda(); return;
  }
});

/* ---------------- rutas y plan del día ---------------- */

let RUTAS = [], PLAN = null;

async function cargarRutas() {
  $('v-rutas').innerHTML = `
    <div class="saludo"><div><h1>Rutas</h1><div class="fecha">Elige una ruta para planificar el día</div></div></div>
    <div class="card" id="rlista"><div class="skel"></div><div class="skel" style="width:60%"></div></div>
    <div id="rplan"></div>`;
  const { data, error } = await db.rpc('rutas_visibles');
  if (error) { $('rlista').innerHTML = `<div class="vacio">No se ha podido cargar: ${esc(error.message)}</div>`; return; }
  RUTAS = data || [];
  if (!RUTAS.length) {
    $('rlista').innerHTML = `<div class="vacio">Todavía no hay rutas creadas. El gestor de rutas llega en la próxima entrega;
      mientras tanto puedes planificar desde el Directorio con los filtros.</div>`;
    return;
  }
  $('rlista').innerHTML = `<h2>Tus rutas<span class="n">${RUTAS.length}</span></h2><div class="lista">${
    RUTAS.map(r => `<div class="item" style="cursor:default">
      <span class="ic ${r.tipo === 'Urgente' ? 'w' : ''}">${r.tipo === 'Urgente' ? '★' : '◉'}</span>
      <span class="tx"><b>${esc(r.nombre)}</b><span class="sm">${r.dinamica ? 'Por criterios' : r.n_fijos + ' médicos'} · ${r.visitados} visitados${r.desde ? ' desde ' + fechaCorta(r.desde) : ''}</span></span>
      <span class="acts" style="margin:0"><button class="btn" data-ruta="${r.id}">Planificar hoy</button></span>
    </div>`).join('')}</div>`;
}

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

  // Agrupamos por centro y ordenamos por cercanía desde el punto de salida
  const salida = (PERFIL.preferencias && PERFIL.preferencias.salida) || { nombre: 'Santpedor', lat: 41.7833, lon: 1.8414 };
  const paradas = {};
  conXY.forEach(m => {
    const k = (m.centro_nombre || 'Consulta') + '|' + (m.municipio || '');
    (paradas[k] = paradas[k] || { centro: m.centro_nombre || 'Consulta privada', municipio: m.municipio, dir: m.direccion, xy: [m.lat, m.lon], medicos: [] }).medicos.push(m);
  });

  let pos = [salida.lat, salida.lon], t = 9 * 60, libres = Object.values(paradas), orden = [];
  while (libres.length && t < 18 * 60 && orden.length < 12) {
    libres.sort((a, b) => km(pos, a.xy) - km(pos, b.xy));
    const p = libres.shift();
    const viaje = minutosEntre(pos, p.xy);
    const dura = 10 + 15 * Math.min(p.medicos.length, 6);
    if (t + viaje + dura > 18 * 60) break;
    orden.push({ ...p, llegada: t + viaje, fin: t + viaje + dura, viaje });
    t += viaje + dura; pos = p.xy;
  }

  PLAN = { rutaId, salida, paradas: orden, fin: t + minutosEntre(pos, [salida.lat, salida.lon]) };
  pintarPlan();
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}

function pintarPlan() {
  if (!PLAN) { $('rplan').innerHTML = ''; return; }
  const total = PLAN.paradas.reduce((n, p) => n + p.medicos.length, 0);
  const enlace = 'https://www.google.com/maps/dir/?api=1&origin=' + PLAN.salida.lat + ',' + PLAN.salida.lon +
    '&destination=' + PLAN.salida.lat + ',' + PLAN.salida.lon + '&travelmode=driving&waypoints=' +
    encodeURIComponent(PLAN.paradas.map(p => p.xy.join(',')).join('|'));

  $('rplan').innerHTML = `<div class="card">
    <h2>Plan de hoy<span class="n">${total} médicos</span></h2>
    <p class="sm">Salida de ${esc(PLAN.salida.nombre)} a las 09:00 · ${PLAN.paradas.length} paradas · vuelta sobre las ${hm(PLAN.fin)}</p>
    <div class="lista">${PLAN.paradas.map((p, i) => `<div class="item" style="cursor:default">
      <span class="ic">${i + 1}</span>
      <span class="tx"><b>${esc(p.centro)}</b>
        <span class="sm">${hm(p.llegada)}–${hm(p.fin)} · ${esc([p.dir, p.municipio].filter(Boolean).join(', '))} · ${p.medicos.length} ${p.medicos.length === 1 ? 'médico' : 'médicos'}</span>
        <span class="sm">${p.medicos.map(m => esc(m.nombre)).join(' · ')}</span></span>
    </div>`).join('')}</div>
    <div class="acts" style="padding:0 16px 16px">
      <a class="btn" href="${enlace}" target="_blank" rel="noopener">Abrir en Google Maps</a>
      <button class="btn sec" id="planag">Guardar en mi agenda</button>
      <button class="btn sec" id="plancerrar">Cerrar</button>
    </div></div>`;

  $('plancerrar').onclick = () => { PLAN = null; pintarPlan(); };
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
  const f = prompt('¿Para qué día? (AAAA-MM-DD)', hoyISO());
  if (!f) return;
  const r = await escribir('guardar_cita', { p: {
    medico_id: b.dataset.agendar, fecha: f, estado: 'Planificada', origen: 'Ficha',
    op_id: 'c-' + b.dataset.agendar + '-' + f
  }});
  if (r.error) { toast('No se ha podido: ' + r.error.message, true); return; }
  toast('Añadido a tu agenda el ' + fechaCorta(f));
  cargarInicio();
});


pintarConexion();
vaciarCola();
arrancar();
