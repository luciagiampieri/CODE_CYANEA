# Inventario de tablas por módulo

El modelo de dominio de Cyanea se organiza en once módulos. Cada tabla tiene un único propietario; los DER de otros módulos pueden mostrarla como referencia externa sin duplicar su diccionario. La cobertura se contrastó con el esquema PostgreSQL local en Alembic `b0bcca3ac886`, con corte de código `616ec79`, el 14 de noviembre de 2026.

## Cobertura por módulo

| Módulo | Tablas propias | Columnas | FK salientes | Documento |
|---|---|---|---|---|
| 1 usuarios autenticacion preferencias | 6 | 74 | 5 | [Diccionario y DER](modulo-01-usuarios-autenticacion-preferencias/diccionario-datos.md) |
| 2 viajes destinos participantes | 10 | 70 | 17 | [Diccionario y DER](modulo-02-viajes-destinos-participantes/diccionario-datos.md) |
| 3 itinerario traslados rutas | 7 | 54 | 15 | [Diccionario y DER](modulo-03-itinerario-traslados-rutas/diccionario-datos.md) |
| 4 planificacion asistencia inteligente | 8 | 62 | 13 | [Diccionario y DER](modulo-04-planificacion-asistencia-inteligente/diccionario-datos.md) |
| 5 votaciones | 3 | 24 | 8 | [Diccionario y DER](modulo-05-votaciones/diccionario-datos.md) |
| 6 gastos liquidaciones | 8 | 48 | 15 | [Diccionario y DER](modulo-06-gastos-liquidaciones/diccionario-datos.md) |
| 7 documentos informacion viaje | 3 | 25 | 5 | [Diccionario y DER](modulo-07-documentos-informacion-viaje/diccionario-datos.md) |
| 8 tareas checklist | 4 | 21 | 9 | [Diccionario y DER](modulo-08-tareas-checklist/diccionario-datos.md) |
| 9 planes suscripciones pagos | 7 | 51 | 6 | [Diccionario y DER](modulo-09-planes-suscripciones-pagos/diccionario-datos.md) |
| 10 notificaciones recordatorios | 3 | 22 | 4 | [Diccionario y DER](modulo-10-notificaciones-recordatorios/diccionario-datos.md) |
| 11 administracion auditoria monitoreo | 7 | 56 | 10 | [Diccionario y DER](modulo-11-administracion-auditoria-monitoreo/diccionario-datos.md) |
| **Total** | **66** | **507** | **107** | |

Cada carpeta conserva `der-resumido.puml`, `der-fisico.puml`, sus SVG y `diccionario-datos.md`. Las columnas y FK se cuentan únicamente en su tabla propietaria. Los índices, CHECK y asociaciones compuestas se detallan en cada documento.

## Propiedad de cada tabla

| Tabla | Módulo propietario |
|---|---|
| AccionesAsistenteViaje | [4](modulo-04-planificacion-asistencia-inteligente/diccionario-datos.md) |
| ActividadesItinerario | [3](modulo-03-itinerario-traslados-rutas/diccionario-datos.md) |
| AuditoriaAccesosBackoffice | [11](modulo-11-administracion-auditoria-monitoreo/diccionario-datos.md) |
| AuditoriaPlanes | [11](modulo-11-administracion-auditoria-monitoreo/diccionario-datos.md) |
| AuditoriaSuspensionesUsuarios | [11](modulo-11-administracion-auditoria-monitoreo/diccionario-datos.md) |
| AuditoriaTerminos | [11](modulo-11-administracion-auditoria-monitoreo/diccionario-datos.md) |
| CategoriasChecklist | [8](modulo-08-tareas-checklist/diccionario-datos.md) |
| CategoriasDocumentos | [7](modulo-07-documentos-informacion-viaje/diccionario-datos.md) |
| CategoriasGastos | [6](modulo-06-gastos-liquidaciones/diccionario-datos.md) |
| Checklists | [8](modulo-08-tareas-checklist/diccionario-datos.md) |
| ConfiguracionesMonitoreoIA | [11](modulo-11-administracion-auditoria-monitoreo/diccionario-datos.md) |
| Destinos | [2](modulo-02-viajes-destinos-participantes/diccionario-datos.md) |
| DestinosViajes | [2](modulo-02-viajes-destinos-participantes/diccionario-datos.md) |
| DiasCronogramas | [3](modulo-03-itinerario-traslados-rutas/diccionario-datos.md) |
| DocumentosChecklists | [8](modulo-08-tareas-checklist/diccionario-datos.md) |
| DocumentosViajes | [7](modulo-07-documentos-informacion-viaje/diccionario-datos.md) |
| EnlacesInvitacionViajes | [2](modulo-02-viajes-destinos-participantes/diccionario-datos.md) |
| EscaneosComprobantes | [6](modulo-06-gastos-liquidaciones/diccionario-datos.md) |
| EstadosInvitaciones | [2](modulo-02-viajes-destinos-participantes/diccionario-datos.md) |
| EstadosNotificacionesPasarela | [9](modulo-09-planes-suscripciones-pagos/diccionario-datos.md) |
| EstadosPagosSuscripciones | [9](modulo-09-planes-suscripciones-pagos/diccionario-datos.md) |
| EstadosParticipaciones | [2](modulo-02-viajes-destinos-participantes/diccionario-datos.md) |
| EstadosSugerenciasActividades | [4](modulo-04-planificacion-asistencia-inteligente/diccionario-datos.md) |
| EstadosSuscripciones | [9](modulo-09-planes-suscripciones-pagos/diccionario-datos.md) |
| EstadosTransferenciasLiquidaciones | [6](modulo-06-gastos-liquidaciones/diccionario-datos.md) |
| EstadosViajes | [2](modulo-02-viajes-destinos-participantes/diccionario-datos.md) |
| Gastos | [6](modulo-06-gastos-liquidaciones/diccionario-datos.md) |
| InteresesPlanificacion | [4](modulo-04-planificacion-asistencia-inteligente/diccionario-datos.md) |
| InvitacionesViajes | [2](modulo-02-viajes-destinos-participantes/diccionario-datos.md) |
| ItemsRepositorioViaje | [7](modulo-07-documentos-informacion-viaje/diccionario-datos.md) |
| LiquidacionesViajes | [6](modulo-06-gastos-liquidaciones/diccionario-datos.md) |
| LugaresInteres | [3](modulo-03-itinerario-traslados-rutas/diccionario-datos.md) |
| LugaresInteresViajes | [3](modulo-03-itinerario-traslados-rutas/diccionario-datos.md) |
| Monedas | [6](modulo-06-gastos-liquidaciones/diccionario-datos.md) |
| Notificaciones | [10](modulo-10-notificaciones-recordatorios/diccionario-datos.md) |
| NotificacionesPasarela | [9](modulo-09-planes-suscripciones-pagos/diccionario-datos.md) |
| PagosSuscripciones | [9](modulo-09-planes-suscripciones-pagos/diccionario-datos.md) |
| ParticipantesGastos | [6](modulo-06-gastos-liquidaciones/diccionario-datos.md) |
| ParticipantesViajes | [2](modulo-02-viajes-destinos-participantes/diccionario-datos.md) |
| Planes | [9](modulo-09-planes-suscripciones-pagos/diccionario-datos.md) |
| PreferenciasPlanificacion | [4](modulo-04-planificacion-asistencia-inteligente/diccionario-datos.md) |
| PreferenciasPlanificacionIntereses | [4](modulo-04-planificacion-asistencia-inteligente/diccionario-datos.md) |
| Propuestas | [5](modulo-05-votaciones/diccionario-datos.md) |
| RecordatoriosActividadesNotificados | [10](modulo-10-notificaciones-recordatorios/diccionario-datos.md) |
| ResponsablesChecklist | [8](modulo-08-tareas-checklist/diccionario-datos.md) |
| RitmosViajes | [4](modulo-04-planificacion-asistencia-inteligente/diccionario-datos.md) |
| RolesParticipantes | [2](modulo-02-viajes-destinos-participantes/diccionario-datos.md) |
| RolesSistema | [1](modulo-01-usuarios-autenticacion-preferencias/diccionario-datos.md) |
| RutasDiarias | [3](modulo-03-itinerario-traslados-rutas/diccionario-datos.md) |
| SesionesBackoffice | [1](modulo-01-usuarios-autenticacion-preferencias/diccionario-datos.md) |
| SolicitudesConfirmacionEmail | [1](modulo-01-usuarios-autenticacion-preferencias/diccionario-datos.md) |
| SolicitudesIA | [11](modulo-11-administracion-auditoria-monitoreo/diccionario-datos.md) |
| SolicitudesRecuperacionPassword | [1](modulo-01-usuarios-autenticacion-preferencias/diccionario-datos.md) |
| SolicitudesSugerenciasActividades | [4](modulo-04-planificacion-asistencia-inteligente/diccionario-datos.md) |
| SugerenciasActividades | [4](modulo-04-planificacion-asistencia-inteligente/diccionario-datos.md) |
| SuscripcionesUsuarios | [9](modulo-09-planes-suscripciones-pagos/diccionario-datos.md) |
| TiposTramosTraslados | [3](modulo-03-itinerario-traslados-rutas/diccionario-datos.md) |
| TokensPushUsuarios | [10](modulo-10-notificaciones-recordatorios/diccionario-datos.md) |
| TokensRecuperacionPassword | [1](modulo-01-usuarios-autenticacion-preferencias/diccionario-datos.md) |
| TramosTrasladosViajes | [3](modulo-03-itinerario-traslados-rutas/diccionario-datos.md) |
| TransferenciasLiquidaciones | [6](modulo-06-gastos-liquidaciones/diccionario-datos.md) |
| Usuarios | [1](modulo-01-usuarios-autenticacion-preferencias/diccionario-datos.md) |
| VersionesTerminos | [11](modulo-11-administracion-auditoria-monitoreo/diccionario-datos.md) |
| Viajes | [2](modulo-02-viajes-destinos-participantes/diccionario-datos.md) |
| Votaciones | [5](modulo-05-votaciones/diccionario-datos.md) |
| Votos | [5](modulo-05-votaciones/diccionario-datos.md) |

## Tabla técnica fuera del dominio

`alembic_version` registra la revisión de migraciones. Se excluye de los DER funcionales y de las 66 tablas de dominio; no es una entidad de negocio. No se identificaron otras tablas físicas sin asignación ni tablas con más de un módulo propietario.
