begin;
create or replace function privado_en_vivo.leer_enlace(p_fecha date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_source text;v_youtube text;v_actualizado timestamptz;
begin
 if not privado_en_vivo.es_pagos() then raise exception 'Acceso a Pagos no autorizado' using errcode='42501';end if;
 if p_fecha is null then raise exception 'Selecciona la fecha del sorteo';end if;
 v_source:=privado_en_vivo.source_actual();
 select j.youtube,j.youtube_actualizado_en into v_youtube,v_actualizado
 from public.en_vivo_jornadas j left join privado_en_vivo.cortes_reinicio c on c.fecha=j.fecha and c.source=j.source
 where j.fecha=p_fecha and j.source=v_source and (c.registrado_en is null or j.youtube_actualizado_en>c.registrado_en);
 return jsonb_build_object('fecha',p_fecha,'source',v_source,'youtube',v_youtube,'actualizado_en',v_actualizado);
end;$$;
revoke all on function privado_en_vivo.leer_enlace(date) from public,anon;
grant usage on schema privado_en_vivo to authenticated;
grant execute on function privado_en_vivo.leer_enlace(date) to authenticated;
create or replace function public.en_vivo_enlace_recibir(p_fecha date) returns jsonb language sql security invoker set search_path='' as $$select privado_en_vivo.leer_enlace(p_fecha)$$;
revoke all on function public.en_vivo_enlace_recibir(date) from public,anon;
grant execute on function public.en_vivo_enlace_recibir(date) to authenticated;
commit;
