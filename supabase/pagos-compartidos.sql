begin;
create schema if not exists privado_pagos;
revoke all on schema privado_pagos from public,anon,authenticated;
grant usage on schema privado_pagos to authenticated;
create table if not exists privado_pagos.sesiones (
 source text primary key, estado jsonb, pagos jsonb not null default '{}',
 revision bigint not null default 0, form_revision bigint not null default 0,
 controlador uuid, controlador_usuario uuid, controlador_nombre text,
 vence timestamptz, actualizado timestamptz not null default now()
);
create table if not exists privado_pagos.eventos (
 id bigint generated always as identity primary key, source text not null,
 operacion uuid not null, usuario uuid not null, dispositivo text not null,
 accion text not null, detalle jsonb not null default '{}', fecha timestamptz not null default now(),
 unique(source,operacion)
);
create index if not exists pagos_eventos_source_id on privado_pagos.eventos(source,id desc);
alter table privado_pagos.sesiones enable row level security;
alter table privado_pagos.eventos enable row level security;
revoke all on all tables in schema privado_pagos from public,anon,authenticated;
create or replace function privado_pagos.sincronizar(a jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 u uuid:=auth.uid(); d uuid; op uuid; src text; actual text; accion text; nombre text;
 s privado_pagos.sesiones%rowtype; es_control boolean; k text; valor boolean; anterior boolean;
 nuevo jsonb; eventos jsonb; respuesta jsonb;
begin
 if u is null or not exists(select 1 from privado_resultados.publicadores_resultados where usuario_id=u and activo) then
  raise exception 'Acceso no autorizado' using errcode='42501';
 end if;
 if jsonb_typeof(a)<>'object' or octet_length(a::text)>100000 then raise exception 'Solicitud inválida'; end if;
 d:=(a->>'device')::uuid; op:=(a->>'op')::uuid;
 if d is null then raise exception 'Falta identificar el teléfono'; end if;
 src:=a->>'source'; accion:=a->>'action'; nombre:=left(trim(coalesce(a->>'label','Teléfono')),40);
 if nombre='' then nombre:='Teléfono';end if;
 select min(id)::text into actual from public.inscripciones;
 if src is null or actual is null or src<>actual then raise exception 'El sorteo cambió. Vuelve a conectar con los aprobados actuales.' using errcode='40001';end if;
 if accion='join' then insert into privado_pagos.sesiones(source) values(src) on conflict do nothing; end if;
 select * into s from privado_pagos.sesiones where source=src for update;
 if not found then raise exception 'Conecta primero este teléfono';end if;
 es_control:=s.controlador=d and s.controlador_usuario=u and s.vence>clock_timestamp();
 if accion in ('claim','save','payment','release') then
  if op is null then raise exception 'Falta identificar la operación';end if;
  if exists(select 1 from privado_pagos.eventos where source=src and operacion=op and usuario=u) then accion:='read';end if;
 end if;
 if accion='claim' then
  if s.controlador is not null and s.vence>clock_timestamp() and not es_control then
   raise exception 'Otro teléfono tiene el control. Debe liberarlo o esperar 45 segundos sin conexión.' using errcode='40001';end if;
  s.controlador:=d;s.controlador_usuario:=u;s.controlador_nombre:=nombre;s.vence:=clock_timestamp()+interval '45 seconds';es_control:=true;
  if s.estado is null then
   nuevo:=a->'state';
  end if;
 elsif accion='save' then
  if not es_control then raise exception 'Este teléfono no tiene el control' using errcode='42501';end if;
  if (a->>'formRevision')::bigint is distinct from s.form_revision then raise exception 'Hay cambios más recientes. Reconecta antes de editar.' using errcode='40001';end if;
  nuevo:=a->'state';
 elsif accion='payment' then
  if s.estado is null then raise exception 'Todavía no hay sorteo compartido';end if;
  k:=a->>'key';
  if k is null or length(k)>350 or not coalesce((s.estado->'paymentKeys') ? k,false) then raise exception 'El pago no corresponde a los premios actuales';end if;
  if jsonb_typeof(a->'value') is distinct from 'boolean' or jsonb_typeof(a->'previous') is distinct from 'boolean' then raise exception 'Estado de pago inválido';end if;
  valor:=(a->>'value')::boolean;anterior:=coalesce((s.pagos->>k)::boolean,false);
  if anterior is distinct from (a->>'previous')::boolean then raise exception 'Otro teléfono ya modificó este pago. Revisa el estado actualizado.' using errcode='40001';end if;
  s.pagos:=jsonb_set(s.pagos,array[k],to_jsonb(valor),true);s.revision:=s.revision+1;s.actualizado:=clock_timestamp();
 elsif accion='release' then
  if not es_control then raise exception 'Este teléfono no tiene el control' using errcode='42501';end if;
  s.controlador:=null;s.controlador_usuario:=null;s.vence:=null;es_control:=false;
 elsif accion not in ('read','join') then raise exception 'Operación desconocida';
 end if;
 if nuevo is not null then
  if jsonb_typeof(nuevo)<>'object' or jsonb_typeof(nuevo->'form') is distinct from 'object'
   or jsonb_typeof(nuevo->'paymentKeys') is distinct from 'array'
   or jsonb_array_length(nuevo->'paymentKeys')>1000 or octet_length(nuevo::text)>80000 then raise exception 'Datos del sorteo inválidos';end if;
  if exists(select 1 from jsonb_object_keys(nuevo) x where x not in ('form','top','paymentKeys')) then raise exception 'Campos del sorteo inválidos';end if;
  if exists(select 1 from jsonb_object_keys(nuevo->'form') x where x !~ '^(fechaSorteo|cartonesDia|cant|plantillaPremios|tasaCambio|usdGrupo[12]|usdFinal|usdConsol|usdPozo|escaleraInicio|escaleraPaso|escaleraModo|escaleraTotal|escaleraManual[1-6]|topUsd[1-3]|topBs[1-3]|premioPozo|cartonPozo|premioCon|cartonesCon|rondas)$') then raise exception 'Campos no compartibles';end if;
  if jsonb_typeof(nuevo->'form'->'rondas') is distinct from 'array' or jsonb_array_length(nuevo->'form'->'rondas')>6 then raise exception 'Rondas inválidas';end if;
  if exists(select 1 from jsonb_array_elements(nuevo->'form'->'rondas') r where jsonb_typeof(r)<>'object' or exists(select 1 from jsonb_object_keys(r) x where x not in ('i','nom','pre','car'))) then raise exception 'Rondas inválidas';end if;
  if exists(select 1 from jsonb_array_elements(nuevo->'paymentKeys') p where jsonb_typeof(p)<>'string' or length(p#>>'{}')>350) then raise exception 'Lista de pagos inválida';end if;
  if nuevo is distinct from s.estado then s.estado:=nuevo;s.form_revision:=s.form_revision+1;s.revision:=s.revision+1;s.actualizado:=clock_timestamp();end if;
 end if;
 if es_control then s.vence:=clock_timestamp()+interval '45 seconds';end if;
 update privado_pagos.sesiones set estado=s.estado,pagos=s.pagos,revision=s.revision,form_revision=s.form_revision,controlador=s.controlador,controlador_usuario=s.controlador_usuario,controlador_nombre=s.controlador_nombre,vence=s.vence,actualizado=s.actualizado where source=src;
 if accion in ('claim','save','payment','release') then
  insert into privado_pagos.eventos(source,operacion,usuario,dispositivo,accion,detalle)
   values(src,op,u,nombre,accion,case when accion='payment' then jsonb_build_object('pago',k,'pagado',valor) else jsonb_build_object('revision',s.form_revision) end);
 end if;
 select coalesce(jsonb_agg(x),'[]') into eventos from (select e.dispositivo,e.accion,e.detalle,e.fecha from privado_pagos.eventos e where e.source=src order by e.id desc limit 20) x;
 respuesta:=jsonb_build_object('source',src,'revision',s.revision,'formRevision',s.form_revision,'hasState',s.estado is not null,'controller',coalesce(es_control,false),'controllerLabel',s.controlador_nombre,'leaseActive',coalesce(s.vence>clock_timestamp(),false),'payments',s.pagos,'updatedAt',s.actualizado,'events',eventos);
 if (a->>'formRevision')::bigint is distinct from s.form_revision or accion='claim' then respuesta:=respuesta||jsonb_build_object('state',s.estado);end if;
 return respuesta;
end $$;
revoke all on function privado_pagos.sincronizar(jsonb) from public,anon,authenticated;
grant execute on function privado_pagos.sincronizar(jsonb) to authenticated;
create or replace function public.pagos_sincronizar(a jsonb) returns jsonb
language sql security invoker set search_path='' as $$select privado_pagos.sincronizar(a)$$;
revoke all on function public.pagos_sincronizar(jsonb) from public,anon;
grant execute on function public.pagos_sincronizar(jsonb) to authenticated;
commit;
