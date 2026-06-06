UPDATE public."Usuarios"
SET
    "Nombre" = 'Ticiana',
    "Apellido" = 'Gatica',
    "NombreUsuario" = 'andrea'
WHERE "Email" = 'andrea@cyanea.local';

INSERT INTO public."Usuarios" (
    "Email",
    "Nombre",
    "Apellido",
    "NombreUsuario",
    "FotoUrl",
    "Activo"
)
SELECT
    datos."Email",
    datos."Nombre",
    datos."Apellido",
    datos."NombreUsuario",
    datos."FotoUrl",
    datos."Activo"
FROM (
    VALUES
        ('luciano@cyanea.local', 'Luciano', 'Correa', 'luciano', NULL, TRUE),
        ('fatima@cyanea.local', 'Fatima', 'Chialva', 'fatima', NULL, TRUE),
        ('andrea@cyanea.local', 'Ticiana', 'Gatica', 'andrea', NULL, TRUE),
        ('lucia@cyanea.local', 'Lucia', 'Giampieri', 'lucia', NULL, TRUE),
        ('candela@cyanea.local', 'Candela', 'Paez', 'candela', NULL, TRUE)
) AS datos("Email", "Nombre", "Apellido", "NombreUsuario", "FotoUrl", "Activo")
WHERE NOT EXISTS (
    SELECT 1
    FROM public."Usuarios" u
    WHERE u."Email" = datos."Email"
);

INSERT INTO public."Viajes" (
    "Titulo",
    "Destino",
    "Descripcion",
    "FechaInicio",
    "FechaFin",
    "IdEstadoViaje",
    "Moneda",
    "IdAdministrador"
)
SELECT
    'Escapada a Cordoba',
    'Cordoba',
    'Viaje semilla para pruebas del MVP de participantes.',
    DATE '2026-07-18',
    DATE '2026-07-21',
    ev."IdEstadoViaje",
    'ARS',
    u."IdUsuario"
FROM public."Usuarios" u
JOIN public."EstadosViajes" ev
    ON ev."Nombre" = 'activo'
WHERE u."Email" = 'luciano@cyanea.local'
  AND NOT EXISTS (
      SELECT 1
      FROM public."Viajes" v
      WHERE v."Titulo" = 'Escapada a Cordoba'
  );

INSERT INTO public."ParticipantesViajes" (
    "IdViaje",
    "IdUsuario",
    "IdRolParticipante",
    "IdEstadoParticipacion",
    "FechaInvitacion",
    "FechaRespuesta",
    "FechaIncorporacion",
    "InvitadoPor"
)
SELECT
    v."IdViaje",
    u."IdUsuario",
    rp."IdRolParticipante",
    ep."IdEstadoParticipacion",
    NOW(),
    CASE
        WHEN ep."Nombre" IN ('aceptado', 'rechazado') THEN NOW()
        ELSE NULL
    END,
    CASE
        WHEN ep."Nombre" = 'aceptado' THEN NOW()
        ELSE NULL
    END,
    admin."IdUsuario"
FROM (
    VALUES
        ('luciano@cyanea.local', 'administrador', 'aceptado'),
        ('fatima@cyanea.local', 'participante', 'aceptado'),
        ('andrea@cyanea.local', 'participante', 'invitado')
) AS datos("Email", "Rol", "EstadoParticipacion")
JOIN public."Usuarios" u
    ON u."Email" = datos."Email"
JOIN public."Usuarios" admin
    ON admin."Email" = 'luciano@cyanea.local'
JOIN public."Viajes" v
    ON v."Titulo" = 'Escapada a Cordoba'
JOIN public."RolesParticipantes" rp
    ON rp."Nombre" = datos."Rol"
JOIN public."EstadosParticipaciones" ep
    ON ep."Nombre" = datos."EstadoParticipacion"
WHERE NOT EXISTS (
    SELECT 1
    FROM public."ParticipantesViajes" pv
    WHERE pv."IdViaje" = v."IdViaje"
      AND pv."IdUsuario" = u."IdUsuario"
);
