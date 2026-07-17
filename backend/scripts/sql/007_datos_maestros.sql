INSERT INTO public."EstadosViajes" ("Nombre", "Descripcion", "Activo")
SELECT datos."Nombre", datos."Descripcion", datos."Activo"
FROM (
    VALUES
        ('borrador', 'Viaje en preparacion inicial.', TRUE),
        ('activo', 'Viaje vigente y operativo.', TRUE),
        ('finalizado', 'Viaje concluido.', TRUE),
        ('cancelado', 'Viaje cancelado.', TRUE)
) AS datos("Nombre", "Descripcion", "Activo")
WHERE NOT EXISTS (
    SELECT 1
    FROM public."EstadosViajes" ev
    WHERE ev."Nombre" = datos."Nombre"
);

INSERT INTO public."RolesParticipantes" ("Nombre", "Descripcion", "Activo")
SELECT datos."Nombre", datos."Descripcion", datos."Activo"
FROM (
    VALUES
        ('administrador', 'Usuario responsable del viaje.', TRUE),
        ('participante', 'Usuario invitado al viaje.', TRUE)
) AS datos("Nombre", "Descripcion", "Activo")
WHERE NOT EXISTS (
    SELECT 1
    FROM public."RolesParticipantes" rp
    WHERE rp."Nombre" = datos."Nombre"
);

INSERT INTO public."EstadosParticipaciones" ("Nombre", "Descripcion", "Activo")
SELECT datos."Nombre", datos."Descripcion", datos."Activo"
FROM (
    VALUES
        ('invitado', 'Invitacion pendiente de respuesta.', TRUE),
        ('aceptado', 'Participacion aceptada.', TRUE),
        ('rechazado', 'Invitacion rechazada.', TRUE),
        ('expulsado', 'Participante removido del viaje.', TRUE),
        ('salio', 'Participante abandono voluntariamente el viaje.', TRUE)
) AS datos("Nombre", "Descripcion", "Activo")
WHERE NOT EXISTS (
    SELECT 1
    FROM public."EstadosParticipaciones" ep
    WHERE ep."Nombre" = datos."Nombre"
);

INSERT INTO public."EstadosInvitaciones" ("Nombre", "Descripcion", "Activo")
SELECT datos."Nombre", datos."Descripcion", datos."Activo"
FROM (
    VALUES
        ('pendiente', 'Invitacion externa enviada y aun no aceptada.', TRUE),
        ('aceptada', 'Invitacion aceptada por una cuenta registrada.', TRUE),
        ('vencida', 'Invitacion expirada sin aceptacion.', TRUE),
        ('cancelada', 'Invitacion anulada por el administrador.', TRUE)
) AS datos("Nombre", "Descripcion", "Activo")
WHERE NOT EXISTS (
    SELECT 1
    FROM public."EstadosInvitaciones" ei
    WHERE ei."Nombre" = datos."Nombre"
);

INSERT INTO public."CategoriasGastos" ("Nombre", "Activo")
SELECT datos."Nombre", datos."Activo"
FROM (
    VALUES
        ('Comida y Bebida', TRUE), 
        ('Transporte', TRUE),   
        ('Alojamiento', TRUE),  
        ('Entretenimiento', TRUE),   
        ('Compras', TRUE),  
        ('Servicios', TRUE),  
        ('Otros', TRUE)         
) AS datos("Nombre", "Activo")
WHERE NOT EXISTS (
    SELECT 1
    FROM public."CategoriasGastos" cg
    WHERE cg."Nombre" = datos."Nombre"
);