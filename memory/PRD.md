# PRD Vivo — App de Elecciones Asamblea Delegados SES

## Problema original del usuario
"hagamos una app para elecciones de la Asamblea de Delegados del Sindicato de los Trabajadores del Sector Educativo de Santander SES, la aplicacion debe permitir a cada uno de los 300 delegados hacer un registro unico, las votaciones se realizan en vivo en la asamblea, antes de iniciar la asamblea se va haciendo la votacion de entre 15 y 20 puntos las votaciones se van haciendo punto por punto y los resultados deben verse en caliente"

## Decisiones y alcance confirmados
- Registro único contra padrón precargado de delegados.
- Opciones de voto: **Aprobado, No aprobado, Abstención y En blanco**.
- Visibilidad: detalle por delegado solo para la mesa directiva.
- Operación: un solo administrador.
- MVP: registro delegado + login + panel delegado + panel admin + resultados en vivo.

## Arquitectura y decisiones técnicas
- **Frontend**: React + Tailwind + Recharts + Sonner.
- **Backend**: FastAPI + Motor (MongoDB).
- **DB**: colecciones `delegates`, `admin_users`, `agenda_points`, `votes`.
- **Auth**: JWT con roles `delegate` y `admin`.
- **Tiempo real**: polling cada 2-3s para estado y resultados en caliente.
- **Seguridad aplicada**:
  - Secretos y credenciales admin movidos a `backend/.env` (`JWT_SECRET_KEY`, `DEFAULT_ADMIN_USERNAME`, `DEFAULT_ADMIN_PASSWORD`).
  - Eliminado endpoint público que exponía credenciales.

## Personas usuarias
1. **Delegado**: se registra una vez, inicia sesión y vota el punto activo.
2. **Administrador (mesa directiva)**: carga padrón, crea puntos, abre/cierra votaciones y monitorea resultados.
3. **Asistente/público**: visualiza resultados agregados en tiempo real sin detalle individual.

## Requisitos core (estáticos)
- Registro único por delegado validado por padrón.
- Votación en vivo punto por punto (15-20 puntos).
- Un voto por delegado por punto.
- Panel administrativo para control de sesión de votación.
- Resultados en caliente durante la asamblea.

## Implementación realizada (histórico)
### 2026-03-13
- Implementado backend completo de votación SES:
  - Auth delegado/admin.
  - Carga y resumen de padrón.
  - CRUD operativo de puntos (crear, abrir, cerrar, listar).
  - Voto único por punto/delegado con índice único Mongo.
  - Resultados públicos y resultados para mesa directiva con detalle por delegado.
  - Estado en vivo para pantalla de resultados.
- Implementado frontend completo:
  - `/` autenticación (registro + login delegado/admin).
  - `/delegado` voto en grid 2x2, estado del punto y conteo en caliente.
  - `/admin` carga de padrón, creación/gestión de puntos, monitoreo y tabla de votos individuales.
  - `/resultados` vista pública en vivo con gráfico y estado por punto.
- Mejoras de diseño aplicadas según guía:
  - Tipografías Chivo/Manrope/JetBrains Mono.
  - Estética suiza institucional de alto contraste.
  - Header sticky glassmorphism + indicadores live + microinteracciones.
- QA y correcciones:
  - Self-test con curl en endpoints críticos.
  - Validación visual con screenshots Playwright.
  - Corrección de warning de chart rendering en resultados.

### 2026-03-25
- Mejoras solicitadas para operación real en despliegue:
  - Nuevo asistente de **Configuración inicial** cuando no existe admin (`/api/public/bootstrap-status`, `/api/public/bootstrap-initialize`).
  - Creación inicial de administrador desde UI + carga inicial de votantes y preguntas.
  - Nueva carga masiva de preguntas por backend (`/api/admin/points/bulk`).
- Frontend admin ampliado para ingreso de preguntas por **3 métodos**:
  - Individual (formulario),
  - Masivo por texto,
  - Carga por archivo CSV/Excel.
- Frontend admin ampliado para votantes por CSV/Excel (además de texto).
- Parser de CSV reforzado para soportar campos entrecomillados con comas internas.
- Validación funcional completa (backend + frontend) sin bloqueos en reporte de pruebas.
- Ajuste UX: la pestaña "Configuración inicial" ahora se oculta automáticamente cuando el setup ya fue completado, evitando confusión; la edición de datos se hace desde "Mesa directiva".
- Funcionalidad nueva de difusión por punto:
  - Enlaces públicos por punto (`/resultados/punto/:pointId`) para compartir resultado al cierre de cada votación.
  - Botón en admin para copiar enlace público y abrir vista compartible.
  - Descarga de imagen (PNG) de resultado por punto para compartir en mensajería.
- Informe final de asamblea:
  - Nuevo endpoint admin consolidado `/api/admin/reports/final-data`.
  - Descarga de informe **PDF** y **CSV** desde panel de mesa directiva.
  - Incluye totales por punto y detalle de voto por delegado.
- Estandarización de opciones de respuesta visibles como selección numerada:
  - 1. Aprobado
  - 2. No aprobado
  - 3. Abstención
  - 4. Voto en blanco
- Protección de datos en credenciales de delegados:
  - Nuevos delegados cargados por mesa directiva reciben clave temporal automática = últimos 4 dígitos del documento.
  - Flujo opcional de cambio de clave en el panel del delegado (`/api/auth/change-password-delegate`).
  - Indicador de uso de clave temporal en login (`using_temporary_password`) para mostrar recomendación de cambio.
  - Instructivo general en PDF para delegados (sin exponer contraseñas individuales).
  - Compatibilidad mantenida: endpoint de registro de delegado permite actualizar clave cuando aún estaba en estado temporal.
  - Se agregó recuperación administrativa de acceso: restablecimiento de clave temporal por documento (`/api/admin/delegates/reset-password`) para casos de bloqueo de login/registro.
  - Simplificación UX solicitada: en frontend de delegados se dejó una sola opción de acceso "Iniciar sesión como delegado" (sin bloque de registro) bajo la política de clave temporal + cambio opcional.
  - Botón rápido visible en panel admin: "Recuperar acceso delegado" con desplazamiento directo al formulario de restablecimiento.

## Backlog priorizado
### P0 (siguiente iteración)
- Cambio seguro de contraseña admin desde UI protegida.
- Exportación oficial de acta de resultados por punto (PDF/CSV).
- Cierre total de asamblea (bloqueo global de votaciones).

### P1
- Auditoría avanzada (bitácora de acciones admin con trazabilidad).
- Búsqueda y filtros por delegado/punto en panel de mesa directiva.
- Temporizador configurable por punto de votación.

### P2
- WebSocket real (en lugar de polling) para actualización instantánea.
- Multi-admin con permisos granulares.
- Branding institucional configurable (logo/colores del sindicato).

## Próximas tareas recomendadas
1. Habilitar módulo de seguridad admin (cambio de contraseña y rotación periódica).
2. Agregar exportación de resultados para soporte legal de asamblea.
3. Preparar modo “sesión oficial” con bloqueo final y acta consolidada.
