const test = require('node:test');
const assert = require('node:assert/strict');
const { crear } = require('../sincronizacion.js');

test('detiene las lecturas rechazadas por fuente de sorteo antigua y permite reconectar', async () => {
  let llamadas = 0;
  let sorteoActualizado = false;
  let ultimoAviso = '';
  const state = { form: {}, top: false, paymentKeys: [] };
  const ctrl = crear({
    device: 'device-demo',
    label: () => 'Teléfono de prueba',
    uuid: () => 'uuid-operacion-demo',
    seed: () => state,
    snapshot: () => state,
    rpc: async args => {
      llamadas++;
      if (sorteoActualizado && args.source === '117679') {
        return { error: { message: 'El sorteo cambió. Vuelve a conectar con los aprobados actuales.' } };
      }
      return {
        error: null,
        data: {
          source: args.source, revision: 1, formRevision: 1,
          controller: true, hasState: false, payments: {}, events: []
        }
      };
    },
    apply: async () => {},
    backup: () => {},
    roles: () => {},
    payments: () => {},
    events: () => {},
    notice: str => { ultimoAviso = str; }
  });
  assert.equal(await ctrl.conectar('117679'), true);
  sorteoActualizado = true;
  await ctrl.leer();
  assert.equal(ctrl.estado().fuenteObsoleta, true);
  assert.match(ultimoAviso, /Actualizar aprobados/);
  const anteriores = llamadas;
  for (let i = 0; i < 20; i++) await ctrl.leer();
  assert.equal(llamadas, anteriores);
  assert.equal(await ctrl.conectar('117680'), true);
  assert.equal(ctrl.estado().fuenteObsoleta, false);
  assert.equal(ctrl.estado().online, true);
  await ctrl.leer();
  assert.equal(llamadas, anteriores + 2);
});
