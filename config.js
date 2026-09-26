/* DLC OS 2.0 · Conexión con la base de datos.
   La misma app sirve para los dos entornos: según la dirección desde la que se abre,
   se conecta a producción o al proyecto de pruebas. Las claves anon son públicas por diseño:
   la seguridad la aplican las reglas de la base. */
(function () {
  const ENTORNOS = {
    produccion: {
      url: 'https://bxivvtdcatceopruhnnc.supabase.co',
      anon: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ4aXZ2dGRjYXRjZW9wcnVobm5jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAxMTE2MjksImV4cCI6MjEwNTY4NzYyOX0.b4RGIlcKdWWHe6mUFjUGZ1KCfo7lN1DOCZlkfGF_a3U'
    },
    pruebas: {
      // Proyecto dlc-os-test
      url: 'https://ozcsaedtlrklfvkkludm.supabase.co',
      anon: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im96Y3NhZWR0bHJrbGZ2a2tsdWRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAyMTkxNDIsImV4cCI6MjEwNTc5NTE0Mn0.2RC4BrO-186cAGbOkIUqKNsNZkYF8uOfQ4QJHoQL4Zk'
    }
  };
  // Es pruebas si se abre desde apptest.… o desde el repositorio de pruebas en GitHub
  const esPruebas = /^apptest\./i.test(location.hostname) || /\/dlc-app-test\//i.test(location.pathname);
  const entorno = esPruebas ? 'pruebas' : 'produccion';
  const cfg = Object.assign({ version: '2.48.0', entorno }, ENTORNOS[entorno]);
  if (/^PEGA_/.test(cfg.url)) { cfg.sinConfigurar = true; cfg.url = 'https://entorno-sin-configurar.invalid'; cfg.anon = 'x'; }
  window.DLC_CONFIG = cfg;
})();
