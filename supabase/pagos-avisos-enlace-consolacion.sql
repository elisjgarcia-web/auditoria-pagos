begin;
-- These hooks add notifications only after a successful submission. They never
-- change winners, payments or the public transmission, and failures stay isolated.
create or replace function privado_push.encolar_enlace() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_id uuid:=gen_random_uuid();
begin
 begin
  if new.source is distinct from privado_en_vivo.source_actual()
   or new.fecha<>(now() at time zone 'America/Caracas')::date
   or nullif(new.youtube,'') is null or new.youtube_actualizado_en is null then return new;end if;
  if tg_op='UPDATE' and new.youtube is not distinct from old.youtube then return new;end if;
  insert into privado_push.cola(id,payload,source,fecha) values(v_id,
   jsonb_build_object('type','youtube','fecha',new.fecha,'source',new.source,'actualizado_en',new.youtube_actualizado_en,'enlace_hash',md5(new.youtube)),new.source,new.fecha);
  perform privado_push.despachar(v_id);
 exception when others then raise warning 'No se pudo encolar el aviso del enlace';end;
 return new;
end;$$;

create or replace function privado_push.encolar_consolacion() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_ids jsonb;v_prev jsonb:='[]';v_fecha date:=(now() at time zone 'America/Caracas')::date;
begin
 begin
  if new.source_anchor is distinct from privado_en_vivo.source_actual() then return new;end if;
  if tg_op='UPDATE' then v_prev:=coalesce(old.state->'paymentSubmission'->'drawIds','[]');end if;
  if jsonb_typeof(new.state->'paymentSubmission'->'drawIds') is distinct from 'array' then return new;end if;
  select jsonb_agg(distinct w->>'drawId' order by w->>'drawId') into v_ids
  from jsonb_array_elements(new.state->'winners') w
  where w->>'prizeType'='consolation' and nullif(w->>'drawId','') is not null
   and (new.state->'paymentSubmission'->'drawIds') ? (w->>'drawId')
   and not(v_prev ? (w->>'drawId'))
   and ((w->>'date')::timestamptz at time zone 'America/Caracas')::date=v_fecha;
  if v_ids is null then return new;end if;
  -- Same explicitly submitted winners cannot enqueue twice when the slot saves again.
  v_id:=overlay(overlay(md5('consolacion:'||new.id::text||':'||v_ids::text) placing '4' from 13 for 1) placing '8' from 17 for 1)::uuid;
  insert into privado_push.cola(id,payload,source,fecha) values(v_id,
   jsonb_build_object('type','consolacion','cantidad',jsonb_array_length(v_ids),'fecha',v_fecha,'source',new.source_anchor,'sessionId',new.id,'drawIds',v_ids),new.source_anchor,v_fecha)
   on conflict(id) do nothing;
  perform privado_push.despachar(v_id);
 exception when others then raise warning 'No se pudo encolar el aviso de consolacion';end;
 return new;
end;$$;
revoke all on function privado_push.encolar_enlace(),privado_push.encolar_consolacion() from public,anon,authenticated;
drop trigger if exists pagos_push_enlace on public.en_vivo_jornadas;
create trigger pagos_push_enlace after insert or update of youtube,youtube_actualizado_en on public.en_vivo_jornadas for each row execute function privado_push.encolar_enlace();
drop trigger if exists pagos_push_consolacion on public.slot_premios_sesiones;
create trigger pagos_push_consolacion after insert or update of state on public.slot_premios_sesiones for each row execute function privado_push.encolar_consolacion();
create or replace function privado_push.tomar(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare e privado_push.cola%rowtype;destinos jsonb;v_corte integer;
begin
 select * into e from privado_push.cola where id=p_id for update;
 if not found or e.estado='completo' or e.caduca_en<=now() or e.intentos>=8 or e.proximo_en>now() or e.lease_hasta>now() then return null;end if;
 if e.payload->>'type' in ('youtube','consolacion') then
  if e.source is distinct from privado_en_vivo.source_actual()
   or e.fecha<>(now() at time zone 'America/Caracas')::date then
   update privado_push.cola set estado='completo' where id=p_id;return null;
  end if;
  if e.payload->>'type'='youtube' and not exists(
   select 1 from public.en_vivo_jornadas j left join privado_en_vivo.cortes_reinicio c on c.fecha=j.fecha and c.source=j.source
   where j.fecha=e.fecha and j.source=e.source and nullif(j.youtube,'') is not null
    and j.youtube_actualizado_en>=(e.payload->>'actualizado_en')::timestamptz and md5(j.youtube)=e.payload->>'enlace_hash'
    and (c.registrado_en is null or j.youtube_actualizado_en>c.registrado_en)
  ) then update privado_push.cola set estado='completo' where id=p_id;return null;end if;
  if e.payload->>'type'='consolacion' and not exists(
   select 1 from public.slot_premios_sesiones s where s.id=(e.payload->>'sessionId')::uuid and s.source_anchor=e.source
    and (s.state->'paymentSubmission'->'drawIds') @> (e.payload->'drawIds')
    and not exists(select 1 from jsonb_array_elements_text(e.payload->'drawIds') n
     where not exists(select 1 from jsonb_array_elements(s.state->'winners') w where w->>'drawId'=n.value and w->>'prizeType'='consolation'))
  ) then update privado_push.cola set estado='completo' where id=p_id;return null;end if;
 end if;
 if e.payload->>'type'='presentadora' then
  select coalesce((revisiones->>(e.payload->>'ronda'))::integer,0) into v_corte from privado_en_vivo.cortes_reinicio where fecha=e.fecha and source=e.source;
  if e.source is distinct from privado_en_vivo.source_actual() or e.revision<=coalesce(v_corte,0) then
   update privado_push.cola set estado='completo' where id=p_id;return null;
  end if;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'endpoint',d.endpoint,'keys',jsonb_build_object('p256dh',d.p256dh,'auth',d.auth))),'[]'::jsonb) into destinos
 from privado_push.dispositivos d where d.activo and (e.destino is null or d.id=e.destino) and not(d.id=any(e.entregados)) and exists(select 1 from privado_resultados.publicadores_resultados p where p.usuario_id=d.usuario_id and p.activo);
 update privado_push.cola set estado='enviando',lease_hasta=now()+interval '90 seconds',intentos=intentos+1 where id=p_id;
 return jsonb_build_object('id',e.id,'payload',e.payload,'destinos',destinos,'vapid',(select jsonb_build_object('publicKey',public_key,'privateKey',private_key,'subject','https://bingoandino75.com') from privado_push.config where id));
end;$$;

commit;
