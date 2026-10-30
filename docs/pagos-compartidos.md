# Pagos compartidos entre teléfonos

Cada dispositivo entra con el acceso autorizado existente y pulsa **Conectar / actualizar este teléfono**. La conexión usa los aprobados actuales y el ancla del bingo. No sustituye ni crea compras ni hace transferencias.

El dispositivo que pulsa **Tomar control de ganadores y premios** se convierte en principal. Si todavía no hay trabajo compartido, confirma que desea compartir el formulario que tiene abierto. Si ya existe, recibe la versión compartida. Los demás consultan y marcan pagos. Para cambiar de principal, el primero libera el control; si pierde conexión, el relevo se permite al vencer su permiso de 45 segundos. Cada teléfono consulta cambios cada tres segundos mientras está visible. Las pestañas suspendidas muestran su último estado hasta volver a conectarse.

Se comparten configuración, ganadores por cartón, claves de premios y estados de pago. Las fichas y datos bancarios se siguen leyendo de las compras aprobadas, no se duplican en la tabla de sincronización. El acceso se limita a los publicadores autorizados actuales, con funciones privadas y una envoltura invoker. No hay acceso directo a las tablas para clientes.

Las ediciones usan versión del formulario y un único principal con permiso temporal; los pagos usan comparación del estado anterior por clave, de modo que marcar premios diferentes no sobrescribe otros pagos. Las operaciones tienen UUID y registro por dispositivo/hora. Ante fallo de conexión no se repiten cambios a ciegas: se guarda un borrador local de los cambios del principal y se consulta la versión del servidor antes de continuar. Si había un corte, el formulario vuelve a la versión confirmada. Los borradores solo guardan el formulario compartido, no credenciales ni datos de Pago Móvil.

Los cambios de premio, monto, nombre o cartón generan otra clave de pago. Una marca previa no se hereda a un premio diferente. El historial conserva las marcas anteriores. Al reiniciar el bingo, el ancla cambia y no se heredan formularios ni pagos anteriores. **Nuevo sorteo** en la app mantiene su comportamiento local; para compartir un bingo nuevo se desconecta el teléfono y se conecta después de cargar los aprobados del bingo nuevo.

Las versiones antiguas y los teléfonos desconectados siguen siendo locales; hay que actualizar y conectar cada dispositivo que participe. El estado de conexión siempre aparece en el bloque **Teléfonos conectados**. Marcar PAGADO solo registra una confirmación manual, nunca ejecuta un pago bancario.

Pruebas: tests/sincronizacion-database.test.cjs y tests/sincronizacion-dom.test.cjs; cubren permisos de Postgres reales, dos clientes, control y relevo, escritura concurrente, marcas, reintentos, aislamiento del bingo, recuperación de fallos y la interfaz de consulta.
