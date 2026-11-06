# Traer el enlace de Presentadora

La presentadora debe actualizar la fecha/jornada y pulsar **Enviar enlace a Pagos**. En Pagos, junto al campo de YouTube, pulsar **Traer enlace de Presentadora**. El enlace se coloca directamente en el campo, sin buscar ni descargar capturas y sin un segundo botón para usarlo. Después puede copiarse el anuncio o confirmarse **Enviar transmisión a la página** para que lo vean los jugadores.

La nueva RPC `en_vivo_enlace_recibir` es de solo lectura, exclusiva del personal autorizado de Pagos. Devuelve únicamente el enlace y los metadatos de la fecha/sorteo actual. No reutiliza enlaces de otras jornadas ni anteriores al corte de un reinicio. Si todavía no se envió uno nuevo, se muestra un mensaje para que Presentadora actualice su jornada y lo reenvíe; el campo existente no se borra.

Los avisos de nuevas capturas también actualizan la vista del enlace recibido, sin publicar la transmisión automáticamente. No modifica compras, ganadores, importes ni pagos.
