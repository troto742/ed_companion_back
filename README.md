# Elite Companion · Backend

API para convertir los eventos de **Elite Dangerous**, un simulador espacial, en un estado de partida que se puede consultar y visualizar en tiempo real.

El backend recibe telemetría de la nave y del comandante, mantiene su estado y envía los cambios al dashboard mediante Socket.IO. Forma parte de un proyecto full stack junto al [frontend Angular](https://github.com/troto742/ed_companion_front).

## Qué permite hacer

- Consultar el estado de la nave, combustible, carga y ubicación.
- Seguir rutas, misiones y proyectos de colonización a partir de los eventos recibidos.
- Importar rutas desde CSV o Excel y generar rutas mediante Spansh, también a partir de una configuración de nave.
- Buscar mercados de mercancías y obtener recomendaciones comerciales con datos de Ardent Insight.
- Mantener estados independientes por API key: cada usuario recibe los datos de su propio entorno.
- Guardar eventos, rutas y el último estado en PostgreSQL, o funcionar en memoria para una prueba local.

**Alcance:** esta API recibe eventos por HTTP; no lee por sí sola los archivos del juego. Para una partida real hace falta un cliente que envíe los eventos de Journal y Status. Para probar el proyecto no es necesario tener el juego abierto.

## Tecnologías y decisiones técnicas

| Tecnología | Uso en el proyecto |
| --- | --- |
| Node.js + TypeScript | Servidor y contratos tipados de eventos y estado. |
| Express | Endpoints HTTP y middlewares de autenticación y errores. |
| Socket.IO | Distribución de cambios a salas separadas por usuario. |
| Zod | Validación de los datos recibidos por la API. |
| PostgreSQL + `pg` | Persistencia opcional y gestión de API keys. |
| Multer, csv-parse y ExcelJS | Recepción y lectura de archivos de rutas. |
| Helmet y express-rate-limit | Cabeceras de seguridad y límites de peticiones en ingestión y rutas. |
| Docker + Jenkins | Empaquetado y pipeline de publicación y despliegue. |

La consulta HTTP proporciona el estado inicial y Socket.IO entrega los cambios posteriores. Así, el dashboard puede actualizarse sin consultar continuamente el servidor. La separación entre rutas, servicios y estado permite localizar la lógica de cada responsabilidad.

## Cómo funciona

```mermaid
flowchart LR
    Client[Cliente de telemetría] -->|Journal / Status por HTTP| API[API Express]
    API --> Store[Estado por API key]
    Store -->|Si se configura| DB[(PostgreSQL)]
    Store -->|Socket.IO| Dashboard[Dashboard Angular]
    Dashboard -->|Consulta inicial y acciones HTTP| API
```

`StateStore` procesa los eventos y descarta duplicados o eventos fuera de orden. `RuntimeRegistry` mantiene el estado de cada tenant, es decir, el entorno aislado de cada API key. Si una operación de persistencia falla, los endpoints de ingestión restauran el estado previo antes de propagar el error.

### Integración con SrvSurvey

**SrvSurvey** es una aplicación de escritorio de terceros para Elite Dangerous, desarrollada en .NET, que lee los archivos Journal y Status del juego y muestra overlays de ayuda para exploración, escaneos biológicos y navegación por superficie. En este workspace se ha adaptado para actuar también como cliente de telemetría del companion.

Para conectar ambos proyectos se implementó un contrato HTTP de ingestión que no formaba parte de la integración original. **SrvSurvey consume los endpoints del backend** y le envía los datos del juego; el backend los procesa y actualiza el dashboard mediante Socket.IO. Los cambios que permiten este flujo son:

- **Cliente HTTP en SrvSurvey:** `srvSurvey/SrvSurvey/net/EliteDangerousCompanion.cs` convierte los eventos del juego al formato `{ timestamp, eventType, data }`, adapta Status (combustible, carga, casco, escudos y ubicación) y envía JSON autenticado con `x-api-key`. También permite enviar lotes de eventos y registra errores HTTP sin interrumpir el procesamiento local del juego.
- **Conexión con el ciclo del juego:** `srvSurvey/SrvSurvey/game/Game.cs` inicializa el cliente, envía los nuevos eventos Journal y los cambios de Status, y reenvía información inicial de partida, nave y misiones para poblar el dashboard al arrancar.
- **Endpoints receptores en el backend:** [src/routes/ingestRoutes.ts](src/routes/ingestRoutes.ts) implementa `POST /api/ingest/journal`, `POST /api/ingest/status` y `POST /api/ingest/journal/batch`. Se registran en [src/index.ts](src/index.ts) con autenticación y límite de peticiones; validan los datos con Zod y los aplican al estado de la API key correspondiente, con persistencia opcional y emisión de cambios en tiempo real.

La URL y la clave se configuran en SrvSurvey mediante `eliteCompanionBackendUrl` y `eliteCompanionApiKey` de `Settings.cs`, o mediante las variables `ELITE_COMPANION_BACKEND_URL` y `ELITE_COMPANION_API_KEY` como alternativa. Para desarrollo local, usa `http://localhost:3000` y una clave aceptada por el backend. Sin URL explícita, el cliente utiliza `https://ecm.troto.es`; sin clave, no envía telemetría. Esta integración requiere la versión modificada de SrvSurvey incluida en el workspace.

## Arranque local

Necesitas **Node.js 22 y npm 10 o superior**. PostgreSQL es opcional. Ejecuta los comandos desde la raíz de este repositorio, la carpeta `backend` si usas el workspace completo.

```bash
npm ci
```

Crea un archivo `.env` con esta configuración mínima para una demostración local:

```dotenv
PORT=3000
API_KEY=dev-api-key
CORS_ORIGIN=http://localhost:4201
TENANT_MODE=api_key
DATABASE_URL=
ALLOW_ANY_API_KEY=false
```

`dev-api-key` es una clave de demostración. Dejar `DATABASE_URL` vacía permite empezar sin instalar una base de datos; los datos se perderán al reiniciar.

```bash
npm run dev
```

Servidor: `http://localhost:3000`. Comprueba que responde con `GET http://localhost:3000/health`.

### Activar PostgreSQL

Crea una base de datos y configura su conexión en `.env`, utilizando tus propias credenciales:

```dotenv
DATABASE_URL=postgres://USUARIO:CONTRASENA@localhost:5432/elite_companion
DATABASE_SSL=false
API_KEY_PEPPER=REEMPLAZAR_POR_UN_VALOR_PRIVADO_ESTABLE
ADMIN_API_KEY=REEMPLAZAR_POR_UNA_CLAVE_PRIVADA
BOOTSTRAP_API_KEYS=true
AUTO_PROVISION_DEFAULT_API_KEY=false
```

Mantén `API_KEY` del ejemplo local o define `API_KEYS` para cargar claves iniciales. Ejecuta las migraciones antes de arrancar el servidor:

```bash
npm run db:migrate
npm run dev
```

El pepper participa en el hash de las API keys almacenadas; cambiarlo invalida la comprobación de las claves existentes. Los endpoints administrativos requieren PostgreSQL y la cabecera `x-admin-key`.

### Configuración adicional

La lectura de variables está en [src/config.ts](src/config.ts).

| Variable | Para qué sirve |
| --- | --- |
| `API_KEYS` | Lista de claves iniciales separadas por comas. |
| `API_KEY_LABELS` | Etiquetas con formato `clave=nombre,otraClave=otroNombre`. |
| `DEFAULT_API_KEY` | Clave que se puede aprovisionar en DB cuando no hay claves activas. |
| `AUTO_PROVISION_DEFAULT_API_KEY` | Habilita ese aprovisionamiento; valor predeterminado: `true`. |
| `BOOTSTRAP_API_KEYS` | Carga las claves configuradas en PostgreSQL al arrancar; por defecto `true`. |
| `TENANT_MODE` | `api_key` separa los estados; `single` utiliza un estado compartido. |
| `COMMANDER_NAME` | Nombre base utilizado para la persistencia; por defecto `default`. |
| `CORS_ORIGIN` | Origen o lista de orígenes permitidos, separados por comas. |
| `INGEST_RATE_LIMIT_WINDOW_MS` | Ventana del límite de peticiones; por defecto `10000` ms. |
| `INGEST_RATE_LIMIT_MAX` | Máximo de peticiones por ventana; por defecto `200`. |
| `ALLOW_ANY_API_KEY` | Acepta claves arbitrarias si está activo; mantener `false` fuera de pruebas controladas. |

## Prueba rápida sin el juego

Con el servidor arrancado y la configuración local anterior, ejecuta este código con Node.js 22 desde una segunda terminal. Funciona en Bash y PowerShell:

```bash
node -e "fetch('http://localhost:3000/api/ingest/status', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': 'dev-api-key' }, body: JSON.stringify({ timestamp: new Date().toISOString(), starSystem: 'Sol', fuel: { main: 24 }, cargo: 8 }) }).then(async r => console.log(r.status, await r.json()))"
```

La respuesta esperada es HTTP `202` con `accepted: true`. Comprueba el estado:

```bash
node -e "fetch('http://localhost:3000/api/state', { headers: { 'x-api-key': 'dev-api-key' } }).then(r => r.json()).then(console.log)"
```

Si tienes el frontend abierto con la misma clave, verás actualizarse la ubicación, el combustible y la carga. Cada ejecución utiliza una fecha nueva para no reutilizar un evento antiguo.

## API principal

Salvo `/health` y las rutas administrativas, los endpoints de esta tabla requieren `x-api-key`.

| Método | Endpoint | Función |
| --- | --- | --- |
| GET | `/health` | Comprobar que el servidor responde. |
| GET | `/api/state` | Obtener el estado completo. |
| GET | `/api/whoami` | Consultar la identidad asociada a la clave. |
| POST | `/api/ingest/journal` | Enviar un evento con `timestamp`, `eventType` y `data`. |
| POST | `/api/ingest/status` | Enviar estado de nave o ubicación. |
| POST | `/api/ingest/journal/batch` | Enviar un array de eventos o un objeto `{ "events": [...] }`. |
| POST | `/api/route/upload` | Subir CSV/XLSX como `multipart/form-data`, campo `file`. |
| POST | `/api/route/spansh` | Generar una ruta con origen, destino y alcance de salto. |
| POST | `/api/route/spansh/exact` | Generar una ruta a partir de una configuración de nave. |
| GET | `/api/commodities/search` | Buscar mercados; requiere `sourceSystem` y `commodity`. |
| GET | `/api/trade/recommendations` | Consultar oportunidades comerciales; requiere `commodityId`. |
| GET / POST | `/api/admin/keys` | Listar o crear claves; requiere `x-admin-key`. |
| DELETE | `/api/admin/keys/:id` | Revocar una clave; requiere `x-admin-key`. |

Una ruta CSV mínima puede tener este contenido:

```csv
systemName,distance
Sol,0
Alpha Centauri,4.37
```

Los esquemas completos y sus límites están en [src/routes](src/routes).

Los clientes Socket.IO se autentican mediante `auth: { apiKey }`. El servidor emite `ShipUpdated`, `LocationUpdated`, `RouteUpdated`, `MissionUpdated`, `ColonizationUpdated` y `StateUpdated`; este último contiene el estado completo.

## Organización del código

```text
src/
├── index.ts         # Arranque, middlewares y conexión HTTP/Socket.IO
├── config.ts        # Lectura de configuración
├── routes/          # Endpoints y validación de peticiones
├── middleware/      # Autenticación y manejo de errores
├── state/           # Estado de partida y aislamiento por usuario
├── services/        # API keys, archivos e integraciones externas
├── domain/          # Motor de recomendaciones comerciales
├── useCases/        # Coordinación de las recomendaciones
├── db/              # Persistencia y ejecutor de migraciones
└── types/           # Contratos de eventos y estado
sql/migrations/      # Evolución del esquema PostgreSQL
```

## Compilación y despliegue

```bash
npm run build
npm start
```

La compilación genera `dist/`. Para ejecutar una imagen local con el `.env` de demostración:

```bash
docker build -t elite-companion-backend .
docker run --rm -p 3000:3000 --env-file .env elite-companion-backend
```

Si usas PostgreSQL desde Docker, la conexión debe apuntar a un host accesible desde el contenedor: `localhost` dentro del contenedor no es tu ordenador. Las migraciones deben ejecutarse antes del arranque; la imagen de producción no incluye `tsx`, necesario para `npm run db:migrate`.

El [Jenkinsfile](Jenkinsfile) define build, push a Docker Hub y despliegue remoto por SSH. Para reutilizarlo hay que adaptar el registro, las credenciales de Jenkins y el destino.

## Estado actual y siguientes mejoras

- No hay una suite automatizada de tests configurada. La prueba HTTP anterior permite verificar el flujo básico; la compilación comprueba los tipos.
- El estado activo vive en cada proceso. Escalar a varias réplicas requeriría coordinar ese estado y la distribución de eventos Socket.IO.
- Las funciones de rutas y comercio dependen de servicios externos y de la antigüedad de sus datos.
- Las siguientes mejoras serían pruebas de aislamiento y procesamiento de eventos, documentación OpenAPI y límites de tamaño para las subidas de archivos.

Antes de publicar o desplegar, utiliza secretos propios fuera del repositorio, desactiva el aprovisionamiento de claves de demostración y restringe CORS al frontend correspondiente.

La plantilla `backend/.env.example` del workspace (en este repositorio backend, `.env.example`) contiene placeholders que debes sustituir antes de usarla. El Compose del workspace carga `backend/.env`; ese archivo debe mantenerse fuera de Git. Los valores `dev-api-key` de las pruebas anteriores son solo datos de demostración local.
