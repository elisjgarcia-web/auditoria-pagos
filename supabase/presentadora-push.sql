-- Private Web Push registration and durable delivery queue. Secrets are provisioned separately.
begin;
create schema if not exists privado_push;
revoke all on schema privado_push from public,anon,authenticated;
grant usage on schema privado_push to authenticated,service_role;
create table if not exists privado_push.config (
 id boolean primary key default true check(id),public_key text not null,private_key text not null,hook text not null
);
create table if not exists privado_push.dispositivos (
 id uuid primary key default gen_random_uuid(),usuario_id uuid not null references auth.users(id) on delete cascade,
 endpoint text not null check(length(endpoint)<=2048),p256dh text not null,auth text not null,
 activo boolean not null default true,actualizado_en timestamptz not null default now(),unique(usuario_id,endpoint)
);
create table if not exists privado_push.cola (
 id uuid primary key,payload jsonb not null,source text not null,fecha date not null,revision integer not null default 0,
 destino uuid references privado_push.dispositivos(id) on delete cascade,
 estado text not null default 'pendiente' check(estado in ('pendiente','enviando','completo')),
 intentos integer not null default 0,entregados uuid[] not null default '{}',
 proximo_en timestamptz not null default now(),lease_hasta timestamptz,
 creado_en timestamptz not null default now(),caduca_en timestamptz not null default now()+interval '15 minutes'
);
create index if not exists push_cola_pendiente on privado_push.cola(proximo_en) where estado<>'completo';
alter table privado_push.config enable row level security;
alter table privado_push.dispositivos enable row level security;
alter table privado_push.cola enable row level security;
revoke all on all tables in schema privado_push from public,anon,authenticated;

create or replace function privado_push.clave() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not privado_en_vivo.es_pagos() then raise exception 'Acceso a Pagos no autorizado' using errcode='42501';end if;
 return (select jsonb_build_object('publicKey',public_key) from privado_push.config where id);
end;$$;
create or replace function privado_push.registrar(p_suscripcion jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare ep text:=p_suscripcion->>'endpoint';pk text:=p_suscripcion->'keys'->>'p256dh';ak text:=p_suscripcion->'keys'->>'auth';v_id uuid;
begin
 if not privado_en_vivo.es_pagos() then raise exception 'Acceso a Pagos no autorizado' using errcode='42501';end if;
 if ep is null or length(ep)>2048 or ep !~ '^https://(fcm[.]googleapis[.]com|updates[.]push[.]services[.]mozilla[.]com|web[.]push[.]apple[.]com|[a-zA-Z0-9-]+[.]notify[.]windows[.]com)/[^[:space:]#]+$'
  or pk is null or pk !~ '^[A-Za-z0-9_-]{87}=$|^[A-Za-z0-9_-]{87}$'
  or ak is null or ak !~ '^[A-Za-z0-9_-]{22}(==)?$' then raise exception 'Suscripción de notificaciones inválida' using errcode='22023';end if;
 insert into privado_push.dispositivos(usuario_id,endpoint,p256dh,auth) values(auth.uid(),ep,pk,ak)
 on conflict(usuario_id,endpoint) do update set p256dh=excluded.p256dh,auth=excluded.auth,activo=true,actualizado_en=now() returning id into v_id;
 return jsonb_build_object('id',v_id,'activo',true);
end;$$;
create or replace function privado_push.desactivar(p_endpoint text) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Inicia sesión' using errcode='42501';end if;
 update privado_push.dispositivos set activo=false where usuario_id=auth.uid() and endpoint=p_endpoint;return true;
end;$$;

create or replace function privado_push.despachar(p_id uuid default null) returns integer language plpgsql security definer set search_path='' as $$
declare e record;v_hook text;v_tiempo text;cuantos integer:=0;
begin
 select hook into v_hook from privado_push.config where id;
 if v_hook is null then return 0;end if;
 for e in select id from privado_push.cola where estado<>'completo' and intentos<8 and caduca_en>now() and proximo_en<=now()
  and (lease_hasta is null or lease_hasta<now()) and (p_id is null or id=p_id) order by creado_en limit 20
 loop
  begin
  v_tiempo:=floor(extract(epoch from now()))::bigint::text;
  perform net.http_post(url:='https://dbkixcpwirjwjvjintkr.supabase.co/functions/v1/presentadora-push',
   headers:=jsonb_build_object('Content-Type','application/json','x-push-time',v_tiempo,'x-push-signature',encode(extensions.hmac(e.id::text||':'||v_tiempo,v_hook,'sha256'),'hex')),body:=jsonb_build_object('id',e.id),timeout_milliseconds:=10000);
  cuantos:=cuantos+1;
  exception when others then raise warning 'No se pudo despachar push %',e.id;end;
 end loop;
 return cuantos;
end;$$;

create or replace function privado_push.encolar() returns trigger language plpgsql security definer set search_path='' as $$
declare ns jsonb;
begin
 -- This hook never blocks a presenter's submission if notification infrastructure fails.
 begin
  select coalesce(jsonb_agg(n),'[]'::jsonb) into ns from jsonb_array_elements(new.capturas) c cross join lateral jsonb_array_elements(c->'cartones') n;
  insert into privado_push.cola(id,payload,source,fecha,revision) values(new.id,jsonb_build_object('type','presentadora','ronda',new.ronda,'cartones',ns,'fecha',new.fecha,'envioId',new.id),new.source,new.fecha,new.revision) on conflict(id) do nothing;
  perform privado_push.despachar(new.id);
 exception when others then raise warning 'No se pudo encolar el aviso push del envio %',new.id;
 end;
 return new;
end;$$;
create trigger presentadora_push after insert on public.en_vivo_envios for each row execute function privado_push.encolar();

create or replace function privado_push.probar(p_endpoint text) returns jsonb language plpgsql security definer set search_path='' as $$
declare d uuid;v_id uuid:=gen_random_uuid();
begin
 if not privado_en_vivo.es_pagos() then raise exception 'Acceso a Pagos no autorizado' using errcode='42501';end if;
 select id into d from privado_push.dispositivos where usuario_id=auth.uid() and endpoint=p_endpoint and activo;
 if d is null then raise exception 'Activa primero las notificaciones en este dispositivo';end if;
 if exists(select 1 from privado_push.cola where destino=d and creado_en>now()-interval '30 seconds') then raise exception 'Espera 30 segundos antes de repetir la prueba';end if;
 insert into privado_push.cola(id,payload,source,fecha,destino) values(v_id,jsonb_build_object('type','test'),coalesce(privado_en_vivo.source_actual(),''),(now() at time zone 'America/Caracas')::date,d);
 perform privado_push.despachar(v_id);return jsonb_build_object('enviado',true);
end;$$;

create or replace function privado_push.tomar(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare e privado_push.cola%rowtype;destinos jsonb;v_corte integer;
begin
 select * into e from privado_push.cola where id=p_id for update;
 if not found or e.estado='completo' or e.caduca_en<=now() or e.intentos>=8 or e.proximo_en>now() or e.lease_hasta>now() then return null;end if;
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

create or replace function privado_push.finalizar(p_id uuid,p_enviados uuid[],p_caducados uuid[],p_reintentar boolean) returns boolean language plpgsql security definer set search_path='' as $$
begin
 update privado_push.dispositivos set activo=false where id=any(coalesce(p_caducados,'{}'::uuid[]));
 update privado_push.cola set entregados=coalesce((select array_agg(distinct n) from unnest(entregados||coalesce(p_enviados,'{}'::uuid[])||coalesce(p_caducados,'{}'::uuid[])) n),'{}'::uuid[]),
  estado=case when p_reintentar then 'pendiente' else 'completo' end,lease_hasta=null,proximo_en=now()+interval '30 seconds' * power(2,least(intentos,4))
 where id=p_id;
 return true;
end;$$;

create or replace function privado_push.autorizar(p_id uuid,p_tiempo text,p_firma text) returns jsonb language plpgsql security definer set search_path='' as $$
declare secret text;
begin
 if p_tiempo is null or p_tiempo !~ '^[0-9]{10}$' or p_firma is null or p_firma !~ '^[a-f0-9]{64}$' then return null;end if;
 if abs(extract(epoch from now())-p_tiempo::bigint)>90 then return null;end if;
 select hook into secret from privado_push.config where id;
 if secret is null or encode(extensions.hmac(p_id::text||':'||p_tiempo,secret,'sha256'),'hex') is distinct from p_firma then return null;end if;
 return privado_push.tomar(p_id);
end;$$;
create or replace function public.push_servidor_autorizar(p_id uuid,p_tiempo text,p_firma text) returns jsonb language sql security invoker set search_path='' as $$select privado_push.autorizar(p_id,p_tiempo,p_firma)$$;

-- Public API wrappers do not bypass permissions. Only the inner private implementations do.
create or replace function public.pagos_push_clave() returns jsonb language sql security invoker set search_path='' as $$select privado_push.clave()$$;
create or replace function public.pagos_push_guardar(p_suscripcion jsonb) returns jsonb language sql security invoker set search_path='' as $$select privado_push.registrar(p_suscripcion)$$;
create or replace function public.pagos_push_desactivar(p_endpoint text) returns boolean language sql security invoker set search_path='' as $$select privado_push.desactivar(p_endpoint)$$;
create or replace function public.pagos_push_probar(p_endpoint text) returns jsonb language sql security invoker set search_path='' as $$select privado_push.probar(p_endpoint)$$;
create or replace function public.push_servidor_tomar(p_id uuid) returns jsonb language sql security invoker set search_path='' as $$select privado_push.tomar(p_id)$$;
create or replace function public.push_servidor_finalizar(p_id uuid,p_enviados uuid[],p_caducados uuid[],p_reintentar boolean) returns boolean language sql security invoker set search_path='' as $$select privado_push.finalizar(p_id,p_enviados,p_caducados,p_reintentar)$$;
revoke all on all functions in schema privado_push from public,anon,authenticated;
grant execute on function privado_push.clave(),privado_push.registrar(jsonb),privado_push.desactivar(text),privado_push.probar(text) to authenticated;
grant execute on function privado_push.autorizar(uuid,text,text),privado_push.tomar(uuid),privado_push.finalizar(uuid,uuid[],uuid[],boolean) to service_role;
revoke all on function public.push_servidor_autorizar(uuid,text,text),public.pagos_push_clave(),public.pagos_push_guardar(jsonb),public.pagos_push_desactivar(text),public.pagos_push_probar(text),public.push_servidor_tomar(uuid),public.push_servidor_finalizar(uuid,uuid[],uuid[],boolean) from public,anon,authenticated;
grant execute on function public.pagos_push_clave(),public.pagos_push_guardar(jsonb),public.pagos_push_desactivar(text),public.pagos_push_probar(text) to authenticated;
grant execute on function public.push_servidor_autorizar(uuid,text,text),public.push_servidor_tomar(uuid),public.push_servidor_finalizar(uuid,uuid[],uuid[],boolean) to service_role;
commit;
