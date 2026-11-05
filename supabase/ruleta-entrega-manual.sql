CREATE OR REPLACE FUNCTION public.pagos_ruleta_consolacion()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_source text;
 v_items jsonb := '[]'::jsonb;
begin
 if not privado_en_vivo.es_pagos() then
  raise exception 'Acceso a Pagos no autorizado' using errcode = '42501';
 end if;
 select min(id)::text into v_source from public.inscripciones;
 if v_source is not null then
  with ultimos as (
   select s.id as session_id, s.created_at, w.value as winner, w.ordinality
   from (
    select id,created_at,state from public.slot_premios_sesiones
    where source_anchor=v_source
    order by created_at desc limit 40
   ) s
   cross join lateral jsonb_array_elements(s.state->'winners') with ordinality as w(value,ordinality)
   where jsonb_typeof(w.value)='object'
     and nullif(w.value->>'drawId','') is not null
     and coalesce(s.state->'paymentSubmission'->'drawIds','[]'::jsonb) ? (w.value->>'drawId')
   order by s.created_at desc,w.ordinality desc
   limit 500
  )
  select coalesce(jsonb_agg(jsonb_build_object(
   'drawId',winner->>'drawId',
   'ticket',winner->>'ticket',
   'prize',winner->>'prize',
   'prizeType',winner->>'prizeType',
   'sessionId',session_id,
   'createdAt',winner->>'date'
  ) order by created_at,ordinality),'[]'::jsonb)
  into v_items from ultimos;
 end if;
 return jsonb_build_object('source',v_source,'winners',v_items);
end;
$function$
