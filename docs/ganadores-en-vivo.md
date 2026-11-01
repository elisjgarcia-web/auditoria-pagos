# Ganadores del en vivo

App de la presentadora: `presentadora/`. El acceso es por correo y código de Supabase, igual que en pagos. Un correo nuevo no puede enviar hasta que pagos lo autorice.

## Preparar cada sorteo

1. En pagos, cargar aprobados y revisar fecha, cantidad de rondas, nombres y premios.
2. Abrir **Ganadores del en vivo → Preparar acceso de la presentadora**, escribir su correo y pulsar **Preparar rondas y autorizar correo**. El mismo apartado permite retirar su acceso.
3. Copiar el enlace y compartirlo con la presentadora. Ella entra con el código de su propio correo.

La preparación guarda exclusivamente fecha, nombres de rondas y el identificador del sorteo actual en tablas nuevas. No modifica compras, cartones, precios ni la transmisión pública.

## Presentadora

Fecha → enlace de YouTube → ronda → Pegar captura → + Otro ganador → Enviar a pagos. Si no hay imagen en el portapapeles o el navegador impide leerla, el botón abre los archivos/fotos. Ctrl+V también funciona tras enfocar Pegar captura.

La lectura es local con Tesseract.js 6.0.1 (motor y datos desde sus CDN), sin subir imágenes a servicios de IA. Busca exclusivamente las etiquetas del premio/cartón: nunca toma las bolitas o la cuadrícula como ganadores. Si no puede leer, muestra un campo para escribir los cartones. Una captura puede identificar varios ganadores separados por comas. Siempre se revisa la imagen antes de enviar; no garantiza una lectura perfecta.

Se normaliza la captura a JPEG, máximo 1800×2600 y 8 MiB al subir. Se mantienen los borradores en IndexedDB, separados por usuario/fecha/sorteo/ronda. Las correcciones son nuevas revisiones. El identificador de reintento y las rutas se conservan; una respuesta incierta se consulta y permite reintentar sin editar el contenido.

## Pagos

Hay suscripción Realtime y consulta de respaldo cada 15 segundos. Los avisos visuales funcionan con la app abierta. **Activar avisos** habilita sonido y solicita permiso de notificaciones del navegador; no hay push con la app cerrada.

Una ronda vacía, con premio configurado, fecha/sorteo correctos y todos los cartones aprobados, se completa automáticamente con nombres, reparto del premio y las capturas de resultado. No inicia transferencias ni marca pagos como realizados. Si hay datos previos, falta premio, hay clientes ambiguos o un sorteo distinto, queda pendiente de revisión. Reemplazar una ronda requiere confirmación.

La importación mantiene la fecha, nombres de rondas y premios. Descarga antes de modificar, bloquea la sincronización local durante el cambio y recupera los controles anteriores si falla. Adjunta cada captura a sus cartones exactos mediante `ComprobantesPagos.recibirResultado`. Si el enlace de YouTube está vacío en pagos, se propone el recibido; no se publica automáticamente para los jugadores. Las capturas recibidas forman parte del resumen público del día cuando el operador lo revisa y lo publica.

## Aislamiento y permisos

- Tablas nuevas `en_vivo_jornadas`, `en_vivo_envios` y lista privada de correos. RLS y RPC invocadoras; escrituras autorizadas en esquema privado.
- Bucket privado `ganadores-en-vivo`; presentadora ve solo sus propios envíos y fotos, pagos ve todos. No se publican imágenes del en vivo directamente.
- Las rutas contienen usuario/fecha/UUID. Capturas inmutables; no se pueden borrar archivos de un envío registrado. Límite de 20 capturas por envío, 100 ganadores, 150 archivos por remitente/fecha y 100 revisiones por sorteo/fecha.
- CAS por ronda y bloqueo transaccional evitan sobrescribir el envío de otro equipo. El backend compara el sorteo actual antes de enviar/aplicar.
- No se añaden permisos para leer bancos, teléfonos, cédulas ni compras de clientes. No se llama a las funciones de reinicio ni se crean ganadores reales en las pruebas.

## Validación

Pruebas de parser OCR, entradas inválidas, varios ganadores, idempotencia, reintentos sin conexión, autorización/revocación, RLS con políticas antiguas amplias, archivos ajenos, versión obsoleta, cambio de sorteo, autocompletado, confirmación/cancelación y recuperación después de un fallo. En navegador se probó con sesión simulada y una captura ficticia cuyo cartón 738 fue leído por el motor real; el envío de la demo fue local, sin compras ni pagos reales.
