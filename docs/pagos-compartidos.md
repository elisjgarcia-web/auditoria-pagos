# Sincronización automática de pagos

Al abrir o refrescar la app con una sesión autorizada, se cargan los aprobados actuales y el trabajo compartido del bingo. Si no hay sesión, se usa la verificación de acceso habitual. Todos los teléfonos autorizados pueden editar ganadores y premios, consultar y marcar pagos. No hay nombres de dispositivos, botones de conexión ni control principal. Cada pestaña mantiene un identificador técnico privado para el registro de cambios.

La app consulta novedades cada tres segundos mientras está visible y guarda las ediciones automáticamente. Un sorteo compartido existente siempre tiene prioridad sobre una copia local antigua al abrir. La primera apertura puede crear el documento compartido con el formulario del día; si el formulario local tiene otra fecha, conserva las configuraciones pero no hereda los ganadores del día anterior. La creación es atómica: si dos teléfonos abren a la vez, solo el primero inicializa el documento, el segundo carga lo existente.

Todos los guardados verifican la revisión del formulario. Si dos dispositivos editan sobre la misma versión, el primero se confirma y el segundo recibe un aviso, conserva un borrador local y carga la versión más reciente antes de volver a editar. No se reenvían cambios antiguos automáticamente tras un corte de conexión. Los pagos se guardan por clave y por estado anterior, de manera independiente. Marcar un pago solo registra la confirmación manual, no ejecuta transferencias.

Las compras, reservas, fichas y datos bancarios permanecen en sus tablas existentes. La sincronización guarda configuración, cartones ganadores y claves/estados de premios. El acceso requiere la lista existente de publicadores autorizados. Las tablas privadas tienen RLS y ningún acceso directo para clientes; se accede por una función privada y una envoltura invoker en public.

El documento queda vinculado al ancla del bingo actual. El reinicio del bingo no hereda el documento del anterior. Las llamadas antiguas de tomar/liberar control se admiten para facilitar la actualización de aplicaciones abiertas, pero ya no reservan la edición a ningún equipo. Se debe actualizar la app en todos los teléfonos para ver la interfaz simplificada.

Pruebas: tests/sincronizacion-database.test.cjs y tests/sincronizacion-dom.test.cjs cubren permisos, apertura simultánea, dos editores, revisión e idempotencia, pagos independientes, pérdida de conexión, protección frente a datos antiguos, interfaz automática y omisión de datos bancarios en el estado compartido.
