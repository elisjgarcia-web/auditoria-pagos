# Enviar ganadores a la ruleta

Carga los aprobados actuales, registra todos los cartones de cada ronda y del lleno final, y pulsa **Enviar / actualizar ganadores en la ruleta** debajo de las rondas. Si una ronda tiene varios ganadores, sepáralos con coma como siempre. No se necesita registrar los montos para este envío.

El recuadro confirma cuántas personas quedan excluidas de los 10 USD y permite consultar los nombres, cartones y rondas enviados. Al cambiar las rondas, vuelve a pulsar Enviar / actualizar. Este envío reemplaza la lista previa del mismo bingo y no publica el resumen oficial de ganadores.

La ruleta excluye todos los cartones de esas personas, usando la cédula del registro. No usa la cédula de Pago Móvil. Siguen participando por 1 cartón gratis. Si no se enviaron ganadores, la ruleta advierte y permite girar. No se modifican compras, pagos ni reservas.

Backend: SQL slot-rondas.sql en bingoandino/bingoandino75; RPC slot_estado_rondas (lectura pública sin datos personales/bancarios) y slot_enviar_rondas (solo publicador autorizado). El origen queda vinculado a la última carga de aprobados; los reinicios concurrentes se rechazan en el servidor. Los datos históricos no se usan para otro bingo. El sitio y el slot siguen con sus accesos existentes.

## Desde Presentadora

Debajo del panel de la ronda está **🎰 Enviar ganadores a la ruleta**. Primero envía las capturas de las rondas a Pagos; luego pulsa este botón antes de sacar la consolación. Incluye todos los cartones de las capturas vigentes de cada ronda, aunque haya varios ganadores, sin esperar a que Pagos los haya recibido en su formulario. Confirma personas excluidas y rondas enviadas; si faltan rondas o corriges un ganador, vuelve a pulsarlo después de enviar las capturas.

El servidor deriva la lista desde los envíos actuales, valida los dueños aprobados y reemplaza la lista de exclusión del sorteo. No incluye borradores ni capturas archivadas por un reinicio, y rechaza solicitudes de una jornada anterior. Mantiene los permisos de la presentadora y la regla existente: excluir a la persona de consolación, sin quitarla de los cartones gratis.
