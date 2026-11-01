begin;
create schema privado_en_vivo;
revoke all on schema privado_en_vivo from public;
grant usage on schema privado_en_vivo to anon,authenticated;
create table privado_en_vivo.presentadoras(email text primary key check(email=lower(trim(email))),activo boolean not null default true);
alter table privado_en_vivo.presentadoras enable row level security;
revoke all on privado_en_vivo.presentadoras from public,anon,authenticated;
create function privado_en_vivo.es_pagos() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from privado_resultados.publicadores_resultados where usuario_id=auth.uid() and activo)
$$;
create function privado_en_vivo.puede_enviar() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (privado_en_vivo.es_pagos() or exists(select 1 from privado_en_vivo.presentadoras where email=lower(auth.jwt()->>'email') and activo))
$$;
create function privado_en_vivo.source_actual() returns text language sql stable security definer set search_path='' as $$select min(id)::text from public.inscripciones$$;
create table public.en_vivo_jornadas(fecha date not null,source text not null,rondas jsonb not null,primary key(fecha,source),creado_en timestamptz not null default now());
create table public.en_vivo_envios(id uuid primary key,fecha date not null,source text not null,ronda integer not null check(ronda between 1 and 6),revision integer not null check(revision>0),creado_por uuid not null,youtube text not null,capturas jsonb not null,aplicado boolean not null default false,creado_en timestamptz not null default now(),unique(fecha,source,ronda,revision),foreign key(fecha,source) references public.en_vivo_jornadas(fecha,source));
create index en_vivo_envios_fecha_source on public.en_vivo_envios(fecha,source,ronda,revision desc);
alter table public.en_vivo_jornadas enable row level security;
alter table public.en_vivo_envios enable row level security;
revoke all on public.en_vivo_jornadas,public.en_vivo_envios from public,anon,authenticated;
grant select on public.en_vivo_jornadas,public.en_vivo_envios to authenticated;
create policy en_vivo_jornadas_leer on public.en_vivo_jornadas for select to authenticated using((select privado_en_vivo.puede_enviar()));
create policy en_vivo_envios_leer on public.en_vivo_envios for select to authenticated using((select privado_en_vivo.es_pagos()) or (creado_por=(select auth.uid()) and (select privado_en_vivo.puede_enviar())));

create function privado_en_vivo.configurar(p_fecha date,p_rondas jsonb,p_email text default null,p_activo boolean default true) returns jsonb language plpgsql security definer set search_path='' as $$
declare src text; r jsonb; i int:=0;
begin
 if not privado_en_vivo.es_pagos() then raise exception 'Solo pagos puede preparar el acceso' using errcode='42501';end if;
 if p_fecha is null or p_fecha not between current_date-7 and current_date+7 then raise exception 'Revisa la fecha del sorteo';end if;
 if jsonb_typeof(p_rondas) is distinct from 'array' or jsonb_array_length(p_rondas) not between 5 and 6 then raise exception 'Configura 5 o 6 rondas';end if;
 for r in select value from jsonb_array_elements(p_rondas) loop
  i:=i+1;if jsonb_typeof(r) is distinct from 'string' or length(trim(r#>>'{}')) not between 1 and 80 then raise exception 'Nombre de ronda inválido';end if;
 end loop;
 src:=privado_en_vivo.source_actual();if src is null then raise exception 'Primero carga el sorteo y sus compras';end if;
 if nullif(trim(p_email),'') is not null then
  if length(p_email)>254 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'Revisa el correo de la presentadora';end if;
  insert into privado_en_vivo.presentadoras(email,activo) values(lower(trim(p_email)),p_activo) on conflict(email) do update set activo=excluded.activo;
 end if;
 insert into public.en_vivo_jornadas(fecha,source,rondas) values(p_fecha,src,p_rondas) on conflict(fecha,source) do update set rondas=excluded.rondas;
 return jsonb_build_object('fecha',p_fecha,'source',src,'rondas',p_rondas);
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('ganadores-en-vivo','ganadores-en-vivo',false,8388608,array['image/jpeg']);
create function privado_en_vivo.subida_permitida(p_ruta text) returns boolean language plpgsql stable security definer set search_path='' as $$
declare fecha_text text;
begin
 if not privado_en_vivo.puede_enviar() or p_ruta !~ '^[0-9a-f-]{36}/20[0-9]{2}-[0-9]{2}-[0-9]{2}/[0-9a-f-]{36}[.]jpg$' or split_part(p_ruta,'/',1)<>auth.uid()::text then return false;end if;
 fecha_text:=split_part(p_ruta,'/',2);
 return exists(select 1 from public.en_vivo_jornadas j where j.fecha::text=fecha_text and j.source=privado_en_vivo.source_actual()) and (select count(*) from storage.objects where bucket_id='ganadores-en-vivo' and name like auth.uid()::text||'/'||fecha_text||'/%')<150;
end $$;
create function privado_en_vivo.objeto_referenciado(p_ruta text) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.en_vivo_envios e, jsonb_array_elements(e.capturas) c where c->>'ruta'=p_ruta)$$;
create policy en_vivo_storage_leer on storage.objects for select to authenticated using(bucket_id='ganadores-en-vivo' and ((select privado_en_vivo.es_pagos()) or ((select privado_en_vivo.puede_enviar()) and split_part(name,'/',1)=(select auth.uid())::text)));
create policy en_vivo_storage_subir on storage.objects for insert to authenticated with check(bucket_id='ganadores-en-vivo' and privado_en_vivo.subida_permitida(name));
create policy en_vivo_storage_borrar on storage.objects for delete to authenticated using(bucket_id='ganadores-en-vivo' and (select privado_en_vivo.puede_enviar()) and split_part(name,'/',1)=(select auth.uid())::text and not privado_en_vivo.objeto_referenciado(name));
create policy en_vivo_storage_limite_leer on storage.objects as restrictive for select to anon,authenticated using(bucket_id<>'ganadores-en-vivo' or ((select privado_en_vivo.es_pagos()) or ((select privado_en_vivo.puede_enviar()) and split_part(name,'/',1)=(select auth.uid())::text)));
create policy en_vivo_storage_limite_subir on storage.objects as restrictive for insert to anon,authenticated with check(bucket_id<>'ganadores-en-vivo' or privado_en_vivo.subida_permitida(name));
create policy en_vivo_storage_no_actualizar on storage.objects as restrictive for update to anon,authenticated using(bucket_id<>'ganadores-en-vivo') with check(bucket_id<>'ganadores-en-vivo');
create policy en_vivo_storage_limite_borrar on storage.objects as restrictive for delete to anon,authenticated using(bucket_id<>'ganadores-en-vivo' or ((select privado_en_vivo.puede_enviar()) and split_part(name,'/',1)=(select auth.uid())::text and not privado_en_vivo.objeto_referenciado(name)));

create function privado_en_vivo.enviar(p_id uuid,p_fecha date,p_source text,p_ronda integer,p_revision integer,p_youtube text,p_capturas jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actual integer; vieja public.en_vivo_envios; c jsonb; n jsonb; lista integer[]:='{}'; archivo storage.objects; src text; rondas jsonb;
begin
 if not privado_en_vivo.puede_enviar() then raise exception 'Tu correo no está autorizado para enviar capturas' using errcode='42501';end if;
 src:=privado_en_vivo.source_actual();if p_source is distinct from src or src is null then raise exception 'El sorteo cambió. Vuelve a cargar la fecha.';end if;
 select * into vieja from public.en_vivo_envios where id=p_id;
 if found then
  if vieja.creado_por=auth.uid() and vieja.fecha=p_fecha and vieja.source=p_source and vieja.ronda=p_ronda and vieja.youtube=p_youtube and vieja.capturas=p_capturas then return to_jsonb(vieja);end if;
  raise exception 'Este envío ya existe con otros datos';
 end if;
 select j.rondas into rondas from public.en_vivo_jornadas j where j.fecha=p_fecha and j.source=p_source;
 if rondas is null or p_ronda is null or p_ronda not between 1 and jsonb_array_length(rondas) or p_revision is null or p_revision<0 then raise exception 'Fecha o ronda no preparada por pagos';end if;
 if p_youtube is null or p_youtube !~ '^https://www[.]youtube[.]com/watch[?]v=[A-Za-z0-9_-]{11}$' then raise exception 'Revisa el enlace de YouTube';end if;
 if jsonb_typeof(p_capturas) is distinct from 'array' or jsonb_array_length(p_capturas) not between 1 and 20 or octet_length(p_capturas::text)>30000 then raise exception 'Adjunta entre 1 y 20 capturas';end if;
 perform pg_advisory_xact_lock(hashtextextended('envivo:'||p_fecha||':'||p_source||':'||p_ronda,0));
 select coalesce(max(e.revision),0) into actual from public.en_vivo_envios e where e.fecha=p_fecha and e.source=p_source and e.ronda=p_ronda;
 if actual<>p_revision then raise exception 'Otro equipo actualizó esta ronda. Vuelve a cargar antes de enviar.' using errcode='40001';end if;
 if (select count(*) from public.en_vivo_envios where fecha=p_fecha and source=p_source)>=100 then raise exception 'Límite diario de envíos alcanzado';end if;
 for c in select value from jsonb_array_elements(p_capturas) loop
  if jsonb_typeof(c) is distinct from 'object' or c-array['ruta','cartones']<>'{}'::jsonb or jsonb_typeof(c->'ruta') is distinct from 'string' or jsonb_typeof(c->'cartones') is distinct from 'array' or jsonb_array_length(c->'cartones') not between 1 and 100 then raise exception 'Captura inválida';end if;
  if c->>'ruta' !~ ('^'||auth.uid()::text||'/'||p_fecha::text||'/[0-9a-f-]{36}[.]jpg$') then raise exception 'La captura no pertenece a esta fecha y usuario';end if;
  select * into archivo from storage.objects where bucket_id='ganadores-en-vivo' and name=c->>'ruta';
  if not found or archivo.metadata->>'mimetype' is distinct from 'image/jpeg' or coalesce((archivo.metadata->>'size')::bigint,0) not between 1 and 8388608 then raise exception 'Falta subir una captura JPEG válida';end if;
  for n in select value from jsonb_array_elements(c->'cartones') loop
   if jsonb_typeof(n) is distinct from 'number' or n::text !~ '^[0-9]{1,4}$' or (n::text)::int not between 1 and 9999 then raise exception 'Revisa los cartones ganadores';end if;
   if (n::text)::int=any(lista) then raise exception 'Hay cartones repetidos entre las capturas';end if;
   lista:=array_append(lista,(n::text)::int);
  end loop;
 end loop;
 if cardinality(lista)>100 then raise exception 'Demasiados ganadores';end if;
 insert into public.en_vivo_envios(id,fecha,source,ronda,revision,creado_por,youtube,capturas) values(p_id,p_fecha,p_source,p_ronda,actual+1,auth.uid(),p_youtube,p_capturas) returning * into vieja;
 return to_jsonb(vieja);
end $$;
create function privado_en_vivo.aplicar(p_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare e public.en_vivo_envios;
begin
 if not privado_en_vivo.es_pagos() then raise exception 'Solo pagos puede confirmar la recepción' using errcode='42501';end if;
 select * into e from public.en_vivo_envios where id=p_id;
 if found then perform pg_advisory_xact_lock(hashtextextended('envivo:'||e.fecha||':'||e.source||':'||e.ronda,0));end if;
 select * into e from public.en_vivo_envios where id=p_id for update;
 if not found or e.source is distinct from privado_en_vivo.source_actual() then raise exception 'El envío no pertenece al sorteo actual';end if;
 if exists(select 1 from public.en_vivo_envios where fecha=e.fecha and source=e.source and ronda=e.ronda and revision>e.revision) then raise exception 'Hay una versión más reciente de esta ronda';end if;
 update public.en_vivo_envios set aplicado=true where id=p_id;
 return true;
end $$;
create function privado_en_vivo.contexto(p_fecha date) returns jsonb language sql stable security definer set search_path='' as $$
 select case when privado_en_vivo.puede_enviar() then jsonb_build_object('source',privado_en_vivo.source_actual(),'pagos',privado_en_vivo.es_pagos(),'jornada',(select to_jsonb(j) from public.en_vivo_jornadas j where j.fecha=p_fecha and j.source=privado_en_vivo.source_actual()),'envios',coalesce((select jsonb_agg(to_jsonb(e) order by e.ronda) from (select distinct on(ronda) * from public.en_vivo_envios where fecha=p_fecha and source=privado_en_vivo.source_actual() and (privado_en_vivo.es_pagos() or creado_por=auth.uid()) order by ronda,revision desc) e),'[]'::jsonb)) else null end
$$;
create function public.en_vivo_contexto(p_fecha date) returns jsonb language sql security invoker set search_path='' as $$select privado_en_vivo.contexto(p_fecha)$$;
-- API pública invocadora; toda la autorización y las escrituras se quedan en el esquema privado.
create function public.en_vivo_configurar(p_fecha date,p_rondas jsonb,p_email text default null,p_activo boolean default true) returns jsonb language sql security invoker set search_path='' as $$select privado_en_vivo.configurar(p_fecha,p_rondas,p_email,p_activo)$$;
create function public.en_vivo_enviar(p_id uuid,p_fecha date,p_source text,p_ronda integer,p_revision integer,p_youtube text,p_capturas jsonb) returns jsonb language sql security invoker set search_path='' as $$select privado_en_vivo.enviar(p_id,p_fecha,p_source,p_ronda,p_revision,p_youtube,p_capturas)$$;
create function public.en_vivo_aplicar(p_id uuid) returns boolean language sql security invoker set search_path='' as $$select privado_en_vivo.aplicar(p_id)$$;
revoke all on all functions in schema privado_en_vivo from public,anon;
grant execute on all functions in schema privado_en_vivo to authenticated;
grant execute on function privado_en_vivo.es_pagos(),privado_en_vivo.puede_enviar(),privado_en_vivo.subida_permitida(text) to anon;
revoke all on function public.en_vivo_contexto(date) from public,anon;
grant execute on function public.en_vivo_contexto(date) to authenticated;
revoke all on function public.en_vivo_configurar(date,jsonb,text,boolean),public.en_vivo_enviar(uuid,date,text,integer,integer,text,jsonb),public.en_vivo_aplicar(uuid) from public,anon;
grant execute on function public.en_vivo_configurar(date,jsonb,text,boolean),public.en_vivo_enviar(uuid,date,text,integer,integer,text,jsonb),public.en_vivo_aplicar(uuid) to authenticated;
do $$begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then alter publication supabase_realtime add table public.en_vivo_envios;end if;
end$$;
commit;
