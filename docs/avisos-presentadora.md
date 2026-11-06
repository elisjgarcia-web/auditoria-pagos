# Notificaciones push de la presentadora

1. Actualizar la aplicación de Pagos y verificar el acceso.
2. Pulsar **Activar avisos** y permitir las notificaciones del navegador.
3. Pulsar **Probar notificación**: el servidor envía la prueba únicamente a ese dispositivo. Puede dejarse Pagos en segundo plano para comprobar la recepción.

El registro se hace en cada teléfono o computadora. La suscripción se recupera al volver a entrar y se cancela al cerrar sesión. Los avisos push pueden llegar aunque la página no esté abierta, siempre que el navegador y el sistema permitan las notificaciones. En iPhone/iPad puede ser necesario abrir la aplicación instalada en la pantalla de inicio. Un cierre forzado del navegador, la falta de conexión o ajustes del sistema pueden impedir o retrasar la entrega.

Si el navegador no admite Push, siguen disponibles las alertas en tiempo real mientras Pagos permanece abierto. Las capturas continúan incorporándose manualmente con **Traer capturas**. No cambia el envío manual entre ruleta y Pagos.

## Servidor

- `supabase/presentadora-push.sql` crea registros privados de dispositivos, RPC autenticadas y una cola duradera.
- Un trigger de INSERT en `en_vivo_envios` encola el aviso. `pg_net` solicita el envío a `presentadora-push` después de confirmar la transacción. Un fallo de notificaciones no bloquea la captura.
- Un trabajo de `pg_cron` revisa pendientes cada minuto. Los envíos inmediatos no esperan al trabajo. Se conservan los destinos ya entregados, se desactivan los caducados y se reintentan fallos transitorios. Los avisos vencen a los 15 minutos.
- Cada solicitud lleva una firma HMAC-SHA-256 vinculada al evento y con una validez de 90 segundos. El servidor la valida antes de acceder a suscripciones. La clave privada VAPID y el secreto permanecen en `privado_push.config`, sin permisos para usuarios ni clientes anónimos. El código no contiene secretos. Las RPC de servidor son exclusivas de `service_role`.
- Los endpoints se restringen a proveedores de Push conocidos. Solo usuarios autorizados de Pagos pueden registrar dispositivos; solo dispositivos de usuarios todavía autorizados reciben avisos.
- La notificación contiene ronda y cartones, sin imágenes, datos bancarios o datos personales. El service worker muestra el aviso sin necesitar una pestaña abierta.

La infraestructura se documenta en `supabase/presentadora-push-infra.sql`; las solicitudes de `pg_net` solo contienen una firma breve y vinculada al evento, nunca claves privadas ni el secreto del webhook. Las claves se generan y se aprovisionan fuera del repositorio. Instalar `pg_net` antes del SQL; después de aprovisionar la configuración y desplegar la Edge Function, programar `privado_push.despachar()` cada minuto y limpiar cola con más de siete días. No recrear la clave VAPID al actualizar: se invalidarían las suscripciones existentes.
