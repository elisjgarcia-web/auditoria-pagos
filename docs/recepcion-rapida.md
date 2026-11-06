# Menos esperas al abrir imágenes y traer consolaciones

- Presentadora muestra la imagen pegada antes de convertirla o guardarla. El envío permanece deshabilitado hasta que termine de guardarse. Se respetan los números escritos durante el procesamiento y se restaura la captura anterior si el guardado falla.
- Al abrir una ronda enviada, reutiliza los blobs locales que corresponden exactamente a sus rutas. Las imágenes faltantes se descargan con un máximo de tres solicitudes simultáneas y aparecen conforme llegan. Si una falla, las demás quedan disponibles para reintentar.
- Pagos descarga varias capturas de una ronda en paralelo, conservando el orden y los errores individuales.
- La sincronización aplica de nuevo el formulario solo cuando cambia su revisión, o cuando se necesita recuperar el estado tras un error. Las marcas de pago se siguen actualizando aunque no cambie el formulario. Se evita reconstruir rondas e imágenes cada diez segundos sin cambios.
- «Traer ganadores» de la ruleta sigue siendo manual. Cuando ya se pidieron los ganadores y Pagos está ocupado, la misma acción espera hasta diez segundos a que termine la sincronización local. No vuelve a consultar la ruleta en un bucle. Antes de aplicar se comprueban otra vez la fecha, el sorteo y los datos existentes para no pisar cambios.

Las verificaciones del servidor, la lectura OCR, los importes y los reinicios se conservan. Estas mejoras quitan trabajo repetido del cliente; no eliminan la latencia de conexión o del almacenamiento del dispositivo.
