# Mis favoritos

Lista pública personal para buscar productos, guardar favoritos para futuras compras y marcar los comprados. España/EUR. Edición, comentarios, favoritos, búsqueda en tiendas y comprobaciones manuales protegidos mediante una clave de administrador. Sin cuentas ni Google.

## Arquitectura

- Frontend modular sin framework: `index.html`, `web/`.
- API Node en Vercel: `api/`, lógica compartida en `lib/`.
- Supabase PostgreSQL mediante PostgREST, exclusivamente desde el servidor. Tablas privadas con RLS y sin permisos de acceso para roles anónimos/autenticados.
- Sesión aleatoria persistente de 365 días, renovada al abrir la app; caduca tras un año sin visitas. Contraseña nunca almacenada en localStorage, hash en base de datos, cookie HttpOnly/SameSite=Strict/Secure en producción. Logout revoca la sesión. La clave debe tener al menos 16 caracteres.
- Escrituras por registro; las ediciones usan `version` y devuelven 409 si otro dispositivo modificó el producto. Creación idempotente por tienda/producto/variante confirmados; URL normalizada como alternativa; comentarios idempotentes por UUID.
- Los precios manuales no se sobrescriben en la tarea diaria. «Actualizar precio» sí pide sustituirlos por el precio verificable de la tienda. El importe comprado se fija al marcar el producto como comprado; puede corregirse con un precio manual.

## Desarrollo y comprobaciones

Node 22 o superior y pnpm 10.33.2:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm test:stores
```

Para trabajar con Supabase, configura `.env.local` a partir de `.env.example` y ejecuta `pnpm dev`.

Para una base PostgreSQL local aislada, sin servicios externos:

```sh
LOCAL_DATABASE_PATH=work/local-db ADMIN_PASSWORD='una-clave-local-de-al-menos-16-caracteres' pnpm dev
```

`pnpm test` incluye pruebas del servidor y de la interfaz con DOM aislado, además de cola/cancelación, importaciones, variantes y migración. Estas pruebas de DOM no sustituyen la comprobación visual en un navegador.

La base local usa PGlite y el mismo SQL que Supabase. No está disponible en Vercel ni se incluye en el despliegue. No abras simultáneamente dos procesos sobre la misma base local.

`pnpm test:e2e` ejecuta escenarios de escritorio y móvil en Google Chrome instalado, con datos aislados. Las pruebas de búsqueda progresiva simulan demoras y fallos; `pnpm test:stores` comprueba las integraciones reales. Si el sandbox del equipo impide arrancar Chrome, ejecuta las pruebas de navegador desde un terminal normal. Los tests unitarios/API no necesitan navegador.

## Configuración de producción

1. Crear un proyecto Supabase gratuito dedicado, preferiblemente en una región europea próxima a la función de Vercel. Ejecutar `supabase/schema.sql` en su editor SQL.
2. Configurar en Vercel: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PASSWORD`, `CRON_SECRET`. Usar valores aleatorios independientes para las dos últimas. No incluir secretos en variables públicas ni en el cliente.
3. Conectar una base **distinta** para previews con escritura; nunca usar la base de producción para pruebas de edición.
4. `vercel.json` configura la compilación, cabeceras y una tarea diaria a las 06:00 UTC. En Hobby no hay garantía de minuto exacto. Confirmar que el plan permite 300 segundos para la función cron.
5. Verificar consulta pública, login, edición y logout en preview; después aplicar el procedimiento de migración antes de publicar.

Generación de secretos en un terminal privado:

```sh
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

Para revocar todas las sesiones: `delete from admin_sessions;`. Cambiar la clave de acceso y revocar sesiones conjuntamente si se sospecha una filtración.

## Migración de Blob

La app nueva no usa Blob. Se conserva `@vercel/blob` únicamente para respaldar los datos anteriores.

1. Con `BLOB_READ_WRITE_TOKEN` configurado: `pnpm migrate:backup`. Guarda un JSON fechado y una copia de trabajo en `work/backups/`, con permisos privados y fuera de Git/despliegues. No borra ni modifica Blob.
2. Ensayar con una base aislada: `LOCAL_DATABASE_PATH=work/migration-test pnpm migrate:import`. El importador preserva nombres, categorías, imágenes y comentarios, usa IDs deterministas, evita duplicados y comprueba el contenido importado.
3. Para el corte definitivo, impedir nuevas escrituras en la app antigua (por ejemplo, despliegue temporal de mantenimiento que devuelva 503 a las mutaciones), generar un **nuevo respaldo final** y ejecutar el importador contra Supabase de producción.
4. No habilitar la nueva app hasta que el importador confirme los recuentos y las pruebas públicas/admin pasen. Guardar respaldo privado y referencia del despliegue anterior.
5. Retirar las rutas antiguas sin protección. Solo después de verificar el corte, retirar el archivo público de Blob. Su eliminación no forma parte del script automático.
6. Si fuera necesario volver atrás, exportar primero cualquier cambio nuevo de Postgres; no restaurar una versión antigua sobre datos nuevos. Mantener la app en solo lectura mientras se reconcilian.

Los favoritos antiguos eran índices de un array en cada navegador. No se pueden importar con certeza después de borrados o cambios de orden: la interfaz avisa para volver a marcarlos, sin arriesgar asignarlos a otro producto.

## Tiendas y límites conocidos

- Northdeco y noo.ma: `GET /search/suggest.json` y `/products/<handle>.js`, con EUR comprobado mediante `/cart.js`. Precios de producto en céntimos; sugerencias en unidades monetarias. Variante seleccionada por `variant`.
- Sklum y The Masie: `https://api.empathy.co/search/v1/query/{sklum|themasie}/search`. Título/URL/imagen en `shopTitle`, `shopUrl`, `shopImageUrl`; combinaciones en `renderData.c`, precio público `p["3"]`, selección `sC`/`id_c`.
- Benuta: `https://ac.cnstrc.com/search/<consulta>` con la clave pública española que publica su web. `response.results[].data` y `variations[]` contienen imágenes, moneda y precios de tamaño. No se usa el precio del padre ni su stock como prueba de una talla concreta.
- Sweeek: `https://api.sensefuel.live/5633de4b-cd11-4225-8670-59acbd7de54c/search/products`, usando su clave pública de Sensefuel y IDs aleatorios por consulta. `products[].variants` identifica artículo, color, enlace, imagen, precio EUR y disponibilidad. Por enlace, el HTML incluye la oferta de la URL dentro de `ProductGroup`.
- Habitat y JYSK: búsqueda externa; importación HTML mediante JSON-LD y Open Graph, conservando datos parciales.
- La Redoute y Rugvista: registradas con alternativa externa y carga manual; las consultas directas iniciales devolvieron 403. No se anuncia API operativa.
- Amazon y otras tiendas: guardado manual y consulta del HTML público cuando sea accesible. Un fallo de extracción no impide guardar el enlace.

Cada tienda de búsqueda tiene un módulo en `lib/adapters/`. Solo se comparten transporte, normalización y helpers de los proveedores comunes. La pantalla administrativa «Tiendas» separa capacidades de búsqueda e importación y muestra comprobaciones, duración y errores.

### Importación y datos persistidos

Al pegar un enlace se consulta tras 500 ms; se pueden corregir nombre, imagen, variante, cantidad y organización antes de guardar. Las respuestas anteriores se cancelan e ignoran. La imagen se previsualiza y sus errores no bloquean el guardado.

Las consultas emiten una referencia UUID a `import_candidates`, privada y válida durante 24 horas. Al guardar, el servidor recupera de ella los identificadores, precio, fuente y fecha; ignora precios automáticos enviados por el navegador. Producto y primera observación se guardan en una transacción. Si la referencia caduca, el formulario conserva sus datos y permite consultar de nuevo o guardar manualmente. La caché de búsqueda dura 15 minutos; una referencia de importación no extiende la frescura del precio.

`supabase/schema.sql` es repetible y añade identidades sin cambiar UUIDs. Ejecutar después `node --env-file=<entorno> scripts/migrate-identities.mjs` para completar únicamente identidades verificadas mediante la tienda; informa conflictos sin fusionar ni borrar productos. El respaldo previo debe incluir productos, comentarios e historial. `scripts/verify-migration.mjs <respaldo.json>` verifica que todos sus IDs siguen presentes.

Las integraciones públicas no son contratos de API: pueden cambiar. Los errores de una tienda no bloquean las demás y nunca borran un precio válido. No se esquivan captchas ni se contratan proveedores de extracción. El precio final, disponibilidad, envío y cupones se comprueban en la tienda; importes «desde» no equivalen a una variante elegida.

Para añadir una tienda, ampliar `STORES` y las operaciones `searchStore`/`getProduct`, comprobar respuestas reales y añadir fixtures/pruebas antes de habilitar `search`.

## Operación

- Lista y presupuesto: hasta 1.000 productos en esta versión. Precios desconocidos excluidos del total y señalados explícitamente.
- Búsqueda: hasta tres peticiones simultáneas por tienda seleccionada, caché de 15 minutos, límite compartido de 140 peticiones/minuto. Respuestas antiguas canceladas/ignoradas.
- Cron: cuatro comprobaciones simultáneas, hasta 1.000 productos activos, presupuesto de 230 segundos, lease de 5 minutos para evitar solapamientos. Devuelve `updated`, `failed` y `pending`; revisar pendientes si crece la colección.
- Comprobaciones: lease por producto de 120 segundos, tiempos máximos por consulta, historial diario idempotente y conservación del último precio en caso de error.
- Logs estructurados de solicitudes y base de datos con estado y duración; no incluyen claves ni cuerpos. Revisar errores 5xx, 429 y resultado del cron en Vercel.
- Los planes gratuitos tienen cuotas y pueden suspender proyectos inactivos. No se promete disponibilidad continua ni frecuencia exacta.
