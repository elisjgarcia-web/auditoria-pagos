# Auditoría y Pagos — versión instalable

Este repositorio contiene solamente el código de la aplicación. **No subir PDFs, respaldos JSON, cédulas ni datos bancarios**.

## Publicar
1. Subir el contenido de esta carpeta a la raíz del repositorio `auditoria-pagos` (el archivo debe llamarse `index.html`).
2. En GitHub: Settings → Pages → Build and deployment → Deploy from a branch → `main` → `/(root)` → Save.
3. Abrir `https://elisjgarcia-web.github.io/auditoria-pagos/` en Chrome de Android. Menú ⋮ → Instalar aplicación o Agregar a pantalla de inicio.

Los datos del sorteo se guardan localmente en el navegador/dispositivo. Mantener copias de respaldo: Android o el usuario pueden borrar datos de sitio.

La primera carga necesita internet para obtener PDF.js desde cdnjs; el service worker intenta guardarlo para usos posteriores. No hay sincronización con la nube.
