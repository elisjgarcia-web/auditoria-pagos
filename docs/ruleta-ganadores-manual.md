# Ganadores de la ruleta a Pagos

1. En la ruleta, pulsar «Enviar ganadores a pagos» después de sacar los premios de dinero.
2. En Pagos, abrir Consolación y pulsar «Traer ganadores».
3. Si sale otro ganador, volver a enviar y traer. Repetir la operación no genera pagos duplicados.

Los cartones gratis no se envían como premios en dinero. Solo se muestran en Pagos los giros que se enviaron expresamente. La consulta no se ejecuta al abrir, cambiar de ventana, recibir conexión ni por intervalos. Si Pagos está ocupado, el botón avisa y permite reintentar manualmente. Se conservan las validaciones de fecha, sorteo, aprobados, exclusiones y conflictos con consolaciones ya configuradas.

El servidor guarda la lista de drawIds enviados en `slot_premios_sesiones.state.paymentSubmission`. La acción autenticada `send-payments` obtiene los ganadores del servidor, valida el sorteo actual y usa control de versión. La RPC de Pagos filtra por esa lista. No se eliminan compras ni registros de pagos al instalar el cambio.
