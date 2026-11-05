# Reinicio de ganadores excluidos

La lista de excluidos de consolación se vacía al iniciar otro sorteo desde Pagos (normal o maestro), mediante un trigger del corte de capturas. «Limpiar presentadora» también vacía esa misma lista mediante `slot_reiniciar_rondas`, antes de limpiar los borradores de la laptop. Repetir cualquiera de los reinicios es válido. No elimina compras, pagos, publicaciones ni el historial de sorteos de la ruleta.

La recepción de una ronda en Pagos solicita el envío automático de sus ganadores a la ruleta, incluso cuando quedan imágenes por recuperar. La lista visible en la ruleta se consulta únicamente con «Traer excluidos»; no hay sondeos ni consultas al regresar a la ventana o cambiar de premio. El botón evita consultas superpuestas. La comprobación del servidor antes de elegir ganador se conserva.

Instalación del servidor: `supabase/slot-reinicio-rondas.sql`. El script crea un endpoint autenticado con comprobación de permisos de Pagos/presentadora y de sorteo actual. No ejecuta un reinicio al instalarse.

Verificación: 14 pruebas dirigidas de cliente pasan. En servidor se verificaron reinicio repetido, rechazo de otro sorteo y usuario no autorizado, y el trigger de Pagos en transacciones con ROLLBACK. Los datos activos no se reiniciaron. Seis fallos de OCR/fixtures de la suite antigua en-vivo-ui/en-vivo.test también se reproducen en el commit anterior sin estos cambios.
