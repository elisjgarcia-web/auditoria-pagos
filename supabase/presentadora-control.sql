-- Controles limitados al en vivo: no conceden acceso a compras ni a pagos.
begin;
create or replace function privado_en_vivo.cambiar_cantidad(
 p_fecha date,p_source text,p_cantidad integer,p_rondas_anteriores jsonb,p_maestro_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 j public.en_vivo_jornadas;
 s privado_pagos.sesiones;
 m uuid;
 cortes jsonb;
 nombres jsonb;
 nuevas jsonb := '[]'::jsonb;
 fila jsonb;
 n integer;
 n_pagos integer;
 i integer;
begin
 if auth.uid() is null or not privado_en_vivo.puede_enviar() then
  raise exception 'Tu correo no está autorizado' using errcode='42501';
 end if;
 if p_cantidad is null or p_cantidad not in (5,6) or p_fecha is null
  or p_fecha not between (now() at time zone 'America/Caracas')::date-7 and (now() at time zone 'America/Caracas')::date+7
  or p_source is null or p_source is distinct from privado_en_vivo.source_actual() then
  raise exception 'Revisa la fecha y el sorteo actual' using errcode='22023';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('envivo:master:'||p_fecha||':'||p_source,0));
 select * into j from public.en_vivo_jornadas where fecha=p_fecha and source=p_source for update;
 if not found then raise exception 'Actualiza las rondas de esta fecha antes de cambiarlas';end if;
 select maestro_id,revisiones into m,cortes from privado_en_vivo.cortes_reinicio where fecha=p_fecha and source=p_source;
 if m is distinct from p_maestro_id or j.rondas is distinct from p_rondas_anteriores then
  raise exception 'Otro equipo cambió la jornada. Pulsa Actualizar antes de cambiar las rondas' using errcode='PT409';
 end if;
 n:=jsonb_array_length(j.rondas);
 if n=p_cantidad then return jsonb_build_object('fecha',p_fecha,'source',p_source,'rondas',j.rondas);end if;
 -- La quinta posición cambia de significado. Nunca renombrar capturas o ganadores existentes.
 if exists(select 1 from public.en_vivo_envios e where e.fecha=p_fecha and e.source=p_source and e.ronda>=5
  and e.revision>coalesce((cortes->>e.ronda::text)::integer,0)) then
  raise exception 'La quinta ronda o el lleno final ya tiene capturas enviadas. Conserva las rondas actuales hasta terminar y reiniciar';
 end if;
 select * into s from privado_pagos.sesiones where source=p_source for update;
 if found then
  n_pagos:=(s.estado->'form'->>'cant')::integer;
  if n_pagos not in (5,6) then raise exception 'Revisa la cantidad de rondas en Pagos';end if;
  if s.estado->'form'->>'fechaSorteo' is distinct from to_char(p_fecha,'DD/MM/YYYY') then
   raise exception 'La fecha de Pagos no coincide. Actualiza antes de cambiar las rondas';
  end if;
  if exists(select 1 from jsonb_array_elements(s.estado->'form'->'rondas') r
    where (r->>'i')::integer>=5 and nullif(trim(r->>'car'),'') is not null) then
   raise exception 'Pagos ya tiene ganadores en la quinta ronda o el lleno final. Conserva las rondas actuales hasta terminar y reiniciar';
  end if;
 end if;
 nombres:=(j.rondas- (n-1));
 if p_cantidad=6 then nombres:=nombres||jsonb_build_array('5TA RONDA');else nombres:=nombres-4;end if;
 nombres:=nombres||jsonb_build_array(j.rondas->>(n-1));
 if s.source is not null then
  for i in 1..p_cantidad loop
   select value into fila from jsonb_array_elements(s.estado->'form'->'rondas')
    where (value->>'i')::integer=case when i=p_cantidad then n_pagos else i end;
   if p_cantidad=6 and n_pagos=5 and i=5 then fila:=jsonb_build_object('pre','','car','');end if;
   fila:=coalesce(fila,jsonb_build_object('pre','','car',''))||jsonb_build_object('i',i,'nom',nombres->>(i-1));
   nuevas:=nuevas||jsonb_build_array(fila);
  end loop;
  update privado_pagos.sesiones set
   estado=jsonb_set(jsonb_set(jsonb_set(estado,'{form,cant}',to_jsonb(p_cantidad::text)),'{form,rondas}',nuevas),'{form,plantillaPremios}','"personal"'::jsonb),
   revision=revision+1,form_revision=form_revision+1,actualizado=now()
   where source=p_source;
 end if;
 update public.en_vivo_jornadas set rondas=nombres where fecha=p_fecha and source=p_source;
 return jsonb_build_object('fecha',p_fecha,'source',p_source,'rondas',nombres);
end;
$$;
revoke all on function privado_en_vivo.cambiar_cantidad(date,text,integer,jsonb,uuid) from public,anon;
grant execute on function privado_en_vivo.cambiar_cantidad(date,text,integer,jsonb,uuid) to authenticated;
create or replace function public.en_vivo_cambiar_cantidad(p_fecha date,p_source text,p_cantidad integer,p_rondas_anteriores jsonb,p_maestro_id uuid)
returns jsonb language sql security invoker set search_path='' as $$
 select privado_en_vivo.cambiar_cantidad(p_fecha,p_source,p_cantidad,p_rondas_anteriores,p_maestro_id);
$$;
revoke all on function public.en_vivo_cambiar_cantidad(date,text,integer,jsonb,uuid) from public,anon;
grant execute on function public.en_vivo_cambiar_cantidad(date,text,integer,jsonb,uuid) to authenticated;

create or replace function privado_en_vivo.reiniciar_presentadora(p_fecha date,p_source text,p_maestro_id uuid,p_reinicio uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m uuid; revisiones jsonb;
begin
 if auth.uid() is null or not privado_en_vivo.puede_enviar() then
  raise exception 'Tu correo no está autorizado para reiniciar Presentadora' using errcode='42501';
 end if;
 if p_reinicio is null or p_fecha is null
  or p_fecha not between (now() at time zone 'America/Caracas')::date-7 and (now() at time zone 'America/Caracas')::date+7
  or p_source is null or p_source is distinct from privado_en_vivo.source_actual() then
  raise exception 'El sorteo cambió. Actualiza antes de reiniciar' using errcode='22023';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('envivo:master:'||p_fecha||':'||p_source,0));
 perform 1 from public.en_vivo_jornadas where fecha=p_fecha and source=p_source for update;
 if not found then raise exception 'Actualiza la fecha y las rondas antes de reiniciar';end if;
 select maestro_id into m from privado_en_vivo.cortes_reinicio where fecha=p_fecha and source=p_source;
 if m=p_reinicio then return public.en_vivo_cortes(p_fecha);end if;
 if m is distinct from p_maestro_id then
  raise exception 'Otro equipo ya reinició. Pulsa Actualizar antes de continuar' using errcode='PT409';
 end if;
 select coalesce(jsonb_object_agg(ronda::text,revision),'{}'::jsonb) into revisiones
 from (select ronda,max(revision) revision from public.en_vivo_envios where fecha=p_fecha and source=p_source group by ronda) e;
 insert into privado_en_vivo.cortes_reinicio(fecha,source,revisiones,registrado_en,registrado_por,maestro_id,maestro_en)
 values(p_fecha,p_source,revisiones,now(),auth.uid(),p_reinicio,now())
 on conflict(fecha,source) do update set revisiones=excluded.revisiones,registrado_en=excluded.registrado_en,
  registrado_por=excluded.registrado_por,maestro_id=excluded.maestro_id,maestro_en=excluded.maestro_en;
 update public.en_vivo_jornadas set youtube=null,youtube_actualizado_en=null where fecha=p_fecha and source=p_source;
 return public.en_vivo_cortes(p_fecha);
end;
$$;
revoke all on function privado_en_vivo.reiniciar_presentadora(date,text,uuid,uuid) from public,anon;
grant execute on function privado_en_vivo.reiniciar_presentadora(date,text,uuid,uuid) to authenticated;
create or replace function public.en_vivo_reiniciar_presentadora(p_fecha date,p_source text,p_maestro_id uuid,p_reinicio uuid)
returns jsonb language sql security invoker set search_path='' as $$
 select privado_en_vivo.reiniciar_presentadora(p_fecha,p_source,p_maestro_id,p_reinicio);
$$;
revoke all on function public.en_vivo_reiniciar_presentadora(date,text,uuid,uuid) from public,anon;
grant execute on function public.en_vivo_reiniciar_presentadora(date,text,uuid,uuid) to authenticated;
commit;
