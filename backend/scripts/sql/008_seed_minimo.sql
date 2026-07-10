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
    "HashedPassword",
    "FotoUrl",
    "Activo",
    "EmailConfirmado"
)
SELECT
    datos."Email",
    datos."Nombre",
    datos."Apellido",
    datos."NombreUsuario",
    datos."HashedPassword",
    datos."FotoUrl",
    datos."Activo",
    datos."EmailConfirmado"
FROM (
    VALUES
        ('luciano@cyanea.local', 'Luciano', 'Correa', 'luciano', '$2b$12$CiCgb6dztiAFNBRxr9zGpeY1gyw3giI8.AicUkAbtMkPisYr7WtlG', NULL, TRUE, TRUE),
        ('fatima@cyanea.local', 'Fatima', 'Chialva', 'fatima', '$2b$12$6TvgLlpeykCxhSX30wLOpuNch/MjNahz2U4OTbzggWTwfPcyfcCce', NULL, TRUE, TRUE),
        ('andrea@cyanea.local', 'Ticiana', 'Gatica', 'andrea', '$2b$12$6TvgLlpeykCxhSX30wLOpuNch/MjNahz2U4OTbzggWTwfPcyfcCce', NULL, TRUE, TRUE),
        ('lucia@cyanea.local', 'Lucia', 'Giampieri', 'lucia', '$2b$12$6TvgLlpeykCxhSX30wLOpuNch/MjNahz2U4OTbzggWTwfPcyfcCce', NULL, TRUE, TRUE),
        ('candela@cyanea.local', 'Candela', 'Paez', 'candela', '$2b$12$6TvgLlpeykCxhSX30wLOpuNch/MjNahz2U4OTbzggWTwfPcyfcCce', NULL, TRUE, TRUE)
) AS datos("Email", "Nombre", "Apellido", "NombreUsuario", "HashedPassword", "FotoUrl", "Activo", "EmailConfirmado")
WHERE NOT EXISTS (
    SELECT 1
    FROM public."Usuarios" u
    WHERE u."Email" = datos."Email"
);

INSERT INTO public."Viajes" (
    "Titulo",
    "Descripcion",
    "FechaInicio",
    "FechaFin",
    "IdEstadoViaje",
    "Moneda",
    "IdAdministrador"
)
SELECT
    'Escapada a Cordoba',
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

INSERT INTO public."Destinos" ("Nombre", "Pais", "Lat", "Lng")
SELECT 'Cordoba', 'Argentina', -31.4201, -64.1888
WHERE NOT EXISTS (
    SELECT 1
    FROM public."Destinos" d
    WHERE d."Nombre" = 'Cordoba' AND d."Pais" = 'Argentina'
);

INSERT INTO public."DestinosViajes" ("IdViaje", "IdDestino")
SELECT v."IdViaje", d."IdDestino"
FROM public."Viajes" v
JOIN public."Destinos" d
    ON d."Nombre" = 'Cordoba' AND d."Pais" = 'Argentina'
WHERE v."Titulo" = 'Escapada a Cordoba'
    AND NOT EXISTS (
        SELECT 1
        FROM public."DestinosViajes" dv
        WHERE dv."IdViaje" = v."IdViaje" AND dv."IdDestino" = d."IdDestino"
    );

INSERT INTO public."DiasCronogramas" ("IdViaje", "Fecha", "IndiceDia")
SELECT v."IdViaje", d.fecha, d.indice
FROM public."Viajes" v
CROSS JOIN (
    VALUES 
        (DATE '2026-07-18', 1),
        (DATE '2026-07-19', 2),
        (DATE '2026-07-20', 3),
        (DATE '2026-07-21', 4)
) AS d(fecha, indice)
WHERE v."Titulo" = 'Escapada a Cordoba'
    AND NOT EXISTS (
        SELECT 1 
        FROM public."DiasCronogramas" dc 
        WHERE dc."IdViaje" = v."IdViaje"
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

INSERT INTO public."InvitacionesViajes" (
    "IdViaje",
    "EmailInvitado",
    "NombreInvitado",
    "TokenInvitacion",
    "FechaVencimiento",
    "IdEstadoInvitacion",
    "InvitadoPor",
    "IdUsuarioRegistrado"
)
SELECT
    v."IdViaje",
    'externo@ejemplo.com',
    'Invitado Demo',
    'seed-invitacion-externa-cyanea',
    NOW() + INTERVAL '7 days',
    ei."IdEstadoInvitacion",
    admin."IdUsuario",
    NULL
FROM public."Viajes" v
JOIN public."Usuarios" admin
    ON admin."Email" = 'luciano@cyanea.local'
JOIN public."EstadosInvitaciones" ei
    ON ei."Nombre" = 'pendiente'
WHERE v."Titulo" = 'Escapada a Cordoba'
    AND NOT EXISTS (
        SELECT 1
        FROM public."InvitacionesViajes" iv
        WHERE iv."IdViaje" = v."IdViaje"
            AND iv."EmailInvitado" = 'externo@ejemplo.com'
    );