# Avisos de nuevas capturas

En Pagos, pulsar **Activar avisos** y permitir las notificaciones del navegador. El botón **Probar sonido** permite comprobar el sonido y el aviso visual. Mantener Pagos abierto durante el sorteo. Se muestra el estado de la conexión junto al botón. Si indica que está desconectado, volver a pulsar **Activar avisos / reconectar**.

Cada nuevo envío de la presentadora dispara una alerta en pantalla, un sonido (si el navegador lo permite) y una notificación del sistema con la ronda y sus cartones. Las capturas se incorporan a Pagos solamente al pulsar **Traer capturas**. Esto no cambia el envío manual de premios entre ruleta y Pagos.

Se usa una única suscripción autenticada a INSERT de `public.en_vivo_envios`, que ya pertenece a `supabase_realtime`. Se conservan las políticas de acceso existentes. Se filtra por sorteo, se verifica la fecha y se comprueban los cortes de reinicio antes de avisar. Los IDs/revisiones guardados localmente evitan repetir alertas. No hay sondeos periódicos ni descarga de imágenes para emitir avisos. Al reconectar se comprueban envíos pendientes, y al cerrar sesión o cambiar de jornada se descarta la conexión anterior.

Al cerrar Pagos se cierra esta conexión: esta versión no instala un servicio de Web Push para notificar con la app cerrada. El navegador puede suspender una pestaña en un teléfono; al regresar se recuperan los avisos pendientes.
