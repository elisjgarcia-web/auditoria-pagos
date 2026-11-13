-- Envío explícito: usa únicamente capturas vigentes confirmadas en el servidor.
begin;
create or replace function privado_en_vivo.enviar_ruleta(p_fecha date,p_source text,p_maestro_id uuid,p_cantidad integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 j public.en_vivo_jornadas; m uuid; cortes jsonb; e record; cap jsonb; v jsonb;
 c bigint; cartas bigint[]; lista jsonb:='[]'::jsonb; faltan jsonb:='[]'::jsonb;
 nombre text; ci text; personas integer; malos integer; enviados integer:=0; r integer;
begin
 if auth.uid() is null or not privado_en_vivo.puede_enviar() then
  raise exception 'Tu correo no está autorizado' using errcode='42501';
 end if;
 lock table public.inscripciones in share mode;
 if p_source is null or p_source is distinct from privado_en_vivo.source_actual() or p_fecha is null
  or p_fecha not between (now() at time zone 'America/Caracas')::date-7 and (now() at time zone 'America/Caracas')::date+7 then
  raise exception 'El sorteo cambió. Actualiza antes de enviar' using errcode='22023';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('envivo:master:'||p_fecha||':'||p_source,0));
 select * into j from public.en_vivo_jornadas where fecha=p_fecha and source=p_source for update;
 if not found then raise exception 'Actualiza las rondas antes de enviar';end if;
 select maestro_id,revisiones into m,cortes from privado_en_vivo.cortes_reinicio where fecha=p_fecha and source=p_source;
 if m is distinct from p_maestro_id or p_cantidad is null or p_cantidad not in (5,6) or jsonb_array_length(j.rondas)<>p_cantidad then
  raise exception 'Otro equipo cambió la jornada. Pulsa Actualizar antes de enviar' using errcode='PT409';
 end if;
 for r in 1..p_cantidad loop
  select * into e from public.en_vivo_envios
   where fecha=p_fecha and source=p_source and ronda=r and revision>coalesce((cortes->>r::text)::integer,0)
   order by revision desc limit 1;
  if not found then faltan:=faltan||to_jsonb(r);continue;end if;
  cartas:=array[]::bigint[];
  if jsonb_typeof(e.capturas) is distinct from 'array' or jsonb_array_length(e.capturas)=0 then
   raise exception 'Revisa las capturas de la ronda %',r;
  end if;
  for cap in select value from jsonb_array_elements(e.capturas) loop
   if jsonb_typeof(cap->'cartones') is distinct from 'array' or jsonb_array_length(cap->'cartones')=0 then
    raise exception 'Faltan cartones en la ronda %',r;
   end if;
   for v in select value from jsonb_array_elements(cap->'cartones') loop
    if jsonb_typeof(v)<>'number' or v::text!~'^[0-9]{1,4}$' or v::text::bigint<1 then raise exception 'Cartón inválido';end if;
    c:=v::text::bigint;
    if c=any(cartas) then continue;end if;
    cartas:=array_append(cartas,c);
    select count(distinct regexp_replace(i.cedula,'[^0-9]','','g')),min(regexp_replace(i.cedula,'[^0-9]','','g')),min(trim(i.nombre)),
     count(*) filter(where coalesce(regexp_replace(i.cedula,'[^0-9]','','g'),'')='' or coalesce(trim(i.nombre),'')='')
     into personas,ci,nombre,malos from public.inscripciones i where i.estado='aprobado' and c=any(i.cartones);
    if personas<>1 or malos>0 then raise exception 'El cartón % no tiene un dueño aprobado único. Revisa la ronda %',c,r;end if;
    lista:=lista||jsonb_build_array(jsonb_build_object('name',nombre,'cedula',ci,'ticket',c::text,'round',r,'type',case when r=p_cantidad then 'final' else 'ronda' end));
   end loop;
  end loop;
  enviados:=enviados+1;
 end loop;
 if enviados=0 then raise exception 'Primero envía los ganadores de las rondas a Pagos';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('slot-rondas:'||p_source,0));
 insert into public.slot_rondas_excluidos(source_anchor,fecha,enviados_por,ganadores)
 values(p_source,p_fecha,auth.uid(),lista)
 on conflict(source_anchor) do update set fecha=excluded.fecha,enviados_por=excluded.enviados_por,ganadores=excluded.ganadores,enviados_en=now();
 return privado_slot_rondas.estado()||jsonb_build_object('rondasEnviadas',enviados,'rondasTotal',p_cantidad,'rondasPendientes',faltan);
end;
$$;
revoke all on function privado_en_vivo.enviar_ruleta(date,text,uuid,integer) from public,anon;
grant execute on function privado_en_vivo.enviar_ruleta(date,text,uuid,integer) to authenticated;
create or replace function public.en_vivo_enviar_ruleta(p_fecha date,p_source text,p_maestro_id uuid,p_cantidad integer)
returns jsonb language sql security invoker set search_path='' as $$
 select privado_en_vivo.enviar_ruleta(p_fecha,p_source,p_maestro_id,p_cantidad);
$$;
revoke all on function public.en_vivo_enviar_ruleta(date,text,uuid,integer) from public,anon;
grant execute on function public.en_vivo_enviar_ruleta(date,text,uuid,integer) to authenticated;
commit;
