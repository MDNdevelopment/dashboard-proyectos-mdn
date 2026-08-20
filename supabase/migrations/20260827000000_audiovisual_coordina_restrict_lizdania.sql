-- 'audiovisual.coordina' (quién ve/usa Agendar, Declinar, Marcar realizada y puede
-- editar fecha/recurso/asistentes/lugar de una pauta) queda restringida a Lizdania
-- (coordinadora real de Audiovisual) + admins (bypass automático de user_can). Antes
-- incluía también a cualquier miembro del depto Audiovisual nivel≥2 y a dirección
-- nivel≥4, lo que hacía que perfiles de prueba (p. ej. un usuario nivel 1 con una regla
-- de usuario específica agregada temporalmente para testing en una migración anterior)
-- terminaran viendo botones de agendar/declinar que no les correspondían.
update public.module_permissions
set rules = '{"rules":[{"all":[{"type":"user","ids":["967bedeb-54fa-4da1-b975-bfc4745989d9"]}]}]}'::jsonb
where module_key = 'audiovisual.coordina';
