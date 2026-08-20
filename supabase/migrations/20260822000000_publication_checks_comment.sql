-- Agrega "comment" a publication_checks (Chequeo): las celdas de Mailchimp requieren
-- fecha + comentario, a diferencia del resto de redes que solo piden fecha. La fecha de
-- Mailchimp es decorativa (no dispara alerta naranja/rojo — ver checkStatus en
-- src/utils/chequeo.js, que trata la red 'Mailchimp' aparte), así que el comentario es
-- el dato realmente útil para esa celda.
alter table public.publication_checks
  add column if not exists comment text;
