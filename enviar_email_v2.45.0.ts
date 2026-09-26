// Edge Function «enviar_email» · App v2.45.0
// Envía emails con el correo que cada empresa configura en la plataforma (Configuración → Correo y firma),
// con su firma corporativa en HTML. La contraseña se lee de la tabla protegida «secretos».
// Solo pueden usarla administración y televenta (o dirección) con Pedidos en «Editar» o más.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const resp = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });
const esc = (t: string) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function htmlCorreo(texto: string, firma: Record<string, string>, marca: Record<string, string>, color: string) {
  const cuerpo = esc(texto).split(/\n{2,}/).map(p => `<p style="margin:0 0 14px">${p.replace(/\n/g, '<br>')}</p>`).join('');
  const lineas = [firma.nombre && `<b style="color:${color};font-size:15px">${esc(firma.nombre)}</b>`, firma.cargo && esc(firma.cargo),
    firma.empresa && `<b>${esc(firma.empresa)}</b>`, [firma.telefono, firma.telefono2].filter(Boolean).map(esc).join(' · '),
    firma.web && `<a href="${esc(/^https?:/.test(firma.web) ? firma.web : 'https://' + firma.web)}" style="color:${color};text-decoration:none">${esc(firma.web)}</a>`,
    firma.direccion && esc(firma.direccion)].filter(Boolean).join('<br>');
  const logo = firma.logo !== 'no' && marca.logo ? `<td style="padding-right:14px;vertical-align:top"><img src="cid:logo" width="64" height="64" style="border-radius:50%;display:block" alt=""></td>` : '';
  return `<!doctype html><html><body style="margin:0;background:#f4f7fa;font-family:Arial,Helvetica,sans-serif;color:#1c2733">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7fa;padding:24px 0"><tr><td align="center">
  <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden">
    <tr><td style="height:5px;background:${color}"></td></tr>
    <tr><td style="padding:26px 28px 8px;font-size:14.5px;line-height:1.55">${cuerpo}</td></tr>
    <tr><td style="padding:10px 28px 22px"><table role="presentation" cellspacing="0" cellpadding="0" style="border-top:1px solid #e3e9ef;padding-top:14px;font-size:13px;line-height:1.5;color:#4a5a6a"><tr>${logo}<td style="vertical-align:top">${lineas}</td></tr></table></td></tr>
    ${firma.aviso ? `<tr><td style="padding:0 28px 22px;font-size:10.5px;line-height:1.45;color:#8a97a5">${esc(firma.aviso).replace(/\n/g, '<br>')}</td></tr>` : ''}
  </table></td></tr></table></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const url = Deno.env.get('SUPABASE_URL')!, anon = Deno.env.get('SUPABASE_ANON_KEY')!, servicio = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const quien = createClient(url, anon, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
    const { data: { user } } = await quien.auth.getUser();
    if (!user) return resp({ ok: false, error: 'sin_sesion' }, 401);
    const admin = createClient(url, servicio, { auth: { persistSession: false } });
    const { data: yo } = await admin.from('perfiles').select('id, rol, activo, areas').eq('id', user.id).single();
    const puede = yo && yo.activo && (yo.rol === 'Administrador' || (['Televenta', 'Dirección'].includes(yo.rol) && Number((yo.areas ?? {}).V ?? 0) >= 2));
    if (!puede) return resp({ ok: false, error: 'permiso' }, 403);

    // Configuración de la empresa: primero la de la plataforma y, si no hay, la de las variables del servidor
    const { data: aj } = await admin.from('ajustes').select('clave, valor').in('clave', ['correo', 'marca']);
    const cfg = (aj ?? []).find(x => x.clave === 'correo')?.valor ?? {};
    const marca = (aj ?? []).find(x => x.clave === 'marca')?.valor ?? {};
    const { data: sec } = await admin.from('secretos').select('valor').eq('clave', 'smtp_clave').maybeSingle();
    const host = cfg.host || Deno.env.get('SMTP_HOST'), puerto = Number(cfg.puerto || Deno.env.get('SMTP_PORT') || 465);
    const usuario = cfg.usuario || Deno.env.get('SMTP_USER'), clave = sec?.valor || Deno.env.get('SMTP_PASS');
    const de = cfg.remitente_email ? `${cfg.remitente_nombre || marca.nombre || ''} <${cfg.remitente_email}>`.trim() : (Deno.env.get('SMTP_FROM') ?? usuario);
    if (!host || !usuario || !clave) return resp({ ok: false, error: 'sin_smtp' }, 503);

    const body = await req.json();
    const { prueba } = body;
    let { para, asunto, texto, adjuntos = [], factura_id, pedido_id, marca: marcaOp } = body;
    if (prueba) { para = para || user.email; asunto = 'Prueba de correo · ' + (marca.nombre || ''); texto = 'Hola:\n\nEste es un correo de prueba. Si lo estás leyendo, el correo de la plataforma está bien configurado.\n\nAsí verán tus clientes la firma.'; }
    if (!para || !asunto) return resp({ ok: false, error: 'datos' }, 400);

    const color = cfg.color || '#15528F';
    const html = htmlCorreo(texto ?? '', cfg.firma ?? {}, marca, color);
    const extra: { filename: string; content: string; encoding: string; contentType: string; cid?: string }[] = [];
    if ((cfg.firma ?? {}).logo !== 'no' && typeof marca.logo === 'string' && marca.logo.startsWith('data:image/png;base64,')) {
      extra.push({ filename: 'logo.png', content: marca.logo.split(',')[1], encoding: 'base64', contentType: 'image/png', cid: 'logo' });
    }
    const cliente = new SMTPClient({ connection: { hostname: host, port: puerto, tls: (cfg.seguridad || (puerto === 465 ? 'ssl' : 'starttls')) === 'ssl', auth: { username: usuario, password: clave } } });
    await cliente.send({
      from: de, to: para, subject: asunto, content: texto ?? '', html,
      attachments: [...adjuntos.map((a: { nombre: string; base64: string; tipo?: string }) => ({ filename: a.nombre, content: a.base64, encoding: 'base64', contentType: a.tipo ?? 'application/pdf' })), ...extra],
    });
    await cliente.close();

    if (factura_id) await admin.from('eventos_facturacion').insert({ tipo: 'Email enviado', factura_id, usuario_id: yo.id, detalle: { para, asunto } });
    if (pedido_id && (marcaOp === 'email_factura' || marcaOp === 'email_pago')) {
      await admin.from('pedidos').update({ [marcaOp === 'email_factura' ? 'email_factura_en' : 'email_pago_en']: new Date().toISOString() }).eq('id', pedido_id);
    }
    return resp({ ok: true });
  } catch (e) {
    const m = String(e);
    return resp({ ok: false, error: /auth|535|534|Username and Password/i.test(m) ? 'credenciales' : /connect|ECONN|timed out|dns/i.test(m) ? 'conexion' : m }, 500);
  }
});
