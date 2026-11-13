-- Un único pozo por fecha, compartido entre teléfonos y resistente a reinicios.
begin;
create table if not exists privado_pagos.pozo_diario(
 fecha date primary key,source text not null,ronda integer not null check(ronda between 1 and 6),
 envio uuid,bolitas integer check(bolitas between 1 and 52),manual boolean not null default false,
 cartones integer[] not null,premio_ronda bigint not null check(premio_ronda>0),
 premio_pozo bigint not null check(premio_pozo>0),total bigint not null check(total>0),
 usuario uuid not null,creado timestamptz not null default now()
);
alter table privado_pagos.pozo_diario enable row level security;
revoke all on privado_pagos.pozo_diario from public,anon,authenticated;
create or replace function privado_pagos.pozo_resumen(p_fecha text)
returns jsonb language sql stable security definer set search_path='' as $$
 select case when privado_en_vivo.es_pagos() then (
 select jsonb_build_object('fecha',p.fecha,'source',p.source,'ronda',p.ronda,'envio',p.envio,
  'bolitas',p.bolitas,'manual',p.manual,'cartones',p.cartones,'premio_ronda',p.premio_ronda,
  'premio_pozo',p.premio_pozo,'total',p.total)
 from privado_pagos.pozo_diario p where to_char(p.fecha,'DD/MM/YYYY')=p_fecha) else null end
$$;
revoke all on function privado_pagos.pozo_resumen(text) from public,anon,authenticated;

create or replace function privado_pagos.sumar_pozo(a jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare
 p jsonb:=a->'pozo';f date;src text:=a->>'source';r integer;env uuid;bolas integer;
 manual boolean:=coalesce((a->'pozo'->>'manual')::boolean,false);
 s privado_pagos.sesiones;fila jsonb;nuevas jsonb;base bigint;extra bigint;total bigint;ns integer[];corte integer;
 ganador privado_pagos.pozo_diario;
begin
 if auth.uid() is null or not privado_en_vivo.es_pagos() then raise exception 'Acceso no autorizado' using errcode='42501';end if;
 f:=(p->>'fecha')::date;r:=(p->>'ronda')::integer;env:=(p->>'envio')::uuid;bolas:=(p->>'bolitas')::integer;
 if f is null or f not between (now() at time zone 'America/Caracas')::date-7 and (now() at time zone 'America/Caracas')::date+1
  or src is null or src is distinct from privado_en_vivo.source_actual() or r is null or r not between 1 and 6
  or (not manual and (bolas is null or bolas not between 1 and 52 or env is null)) then
  raise exception 'Revisa el sorteo, la ronda y el límite de 52 bolitas' using errcode='22023';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pozo-dia:'||f,0));
 select * into ganador from privado_pagos.pozo_diario where fecha=f;
 if found then
  if ganador.source=src and ganador.ronda=r and (manual or ganador.envio=env) then return;end if;
  raise exception 'El pozo ya se ganó el % en la ronda %. Solo se puede ganar una vez por día',f,ganador.ronda using errcode='PT409';
 end if;
 select * into s from privado_pagos.sesiones where source=src for update;
 if not found or s.estado->'form'->>'fechaSorteo' is distinct from to_char(f,'DD/MM/YYYY') then raise exception 'Conecta Pagos y revisa la fecha';end if;
 if s.form_revision is distinct from (a->>'formRevision')::bigint then raise exception 'Otro teléfono guardó cambios. Actualiza antes de sumar el pozo' using errcode='40001';end if;
 select value into fila from jsonb_array_elements(s.estado->'form'->'rondas') where (value->>'i')::integer=r;
 if fila is null or nullif(trim(fila->>'car'),'') is null then raise exception 'Primero prepara los ganadores de la ronda';end if;
 if fila->>'pre' is distinct from p->>'premioRonda' or s.estado->'form'->>'premioPozo' is distinct from p->>'premioPozo' then raise exception 'Cambió el premio. Espera la sincronización y vuelve a traer la captura';end if;
 if not manual and nullif(trim(s.estado->'form'->>'cartonPozo'),'') is not null then raise exception 'Ya hay un pozo manual. Revisa antes de sumar otro premio';end if;
 if coalesce(fila->>'pre','') !~ '^[0-9.,]+$' or coalesce(s.estado->'form'->>'premioPozo','') !~ '^[0-9.,]+$' then raise exception 'Configura los premios en Bs';end if;
 base:=round(replace(replace(fila->>'pre','.',''),',','.')::numeric);
 extra:=round(replace(replace(s.estado->'form'->>'premioPozo','.',''),',','.')::numeric);total:=base+extra;
 if base<=0 or extra<=0 or total>1000000000 then raise exception 'Configura el monto de la ronda y del pozo en Bs';end if;
 if fila->>'car' !~ '^\s*[0-9]{1,4}(\s*[,;]\s*[0-9]{1,4})*\s*$' then raise exception 'Revisa los cartones';end if;
 select array_agg(v::integer order by v::integer) into ns from regexp_split_to_table(fila->>'car','\s*[,;]\s*') v;
 if exists(select 1 from unnest(ns) n where n not between 1 and 9999)
  or cardinality(ns)<>(select count(distinct n) from unnest(ns) n)
  or exists(select 1 from unnest(ns) n where (select count(*) from public.inscripciones i where i.estado='aprobado' and n=any(i.cartones))<>1) then raise exception 'Revisa los aprobados de la ronda';end if;
 if not manual then
  if not exists(select 1 from public.en_vivo_envios e where e.id=env and e.source=src and e.fecha=f and e.ronda=r) then raise exception 'El envío no corresponde a la ronda';end if;
  select coalesce((revisiones->>r::text)::integer,0) into corte from privado_en_vivo.cortes_reinicio where fecha=f and source=src;
  if (select revision from public.en_vivo_envios where id=env)<=coalesce(corte,0)
   or (select id from public.en_vivo_envios where fecha=f and source=src and ronda=r order by revision desc limit 1) is distinct from env then raise exception 'Las capturas cambiaron o fueron reiniciadas';end if;
  if ns is distinct from (select array_agg((n#>>'{}')::integer order by (n#>>'{}')::integer) from public.en_vivo_envios e,jsonb_array_elements(e.capturas) c,jsonb_array_elements(c->'cartones') n where e.id=env) then raise exception 'Los cartones no coinciden con el envío';end if;
 end if;
 if exists(select 1 from jsonb_each_text(s.pagos) x where x.value='true' and x.key like 'pagosBtns'||r||'|%') then raise exception 'La ronda ya tiene pagos realizados. Revisa el pago antes de combinarlo';end if;
 insert into privado_pagos.pozo_diario(fecha,source,ronda,envio,bolitas,manual,cartones,premio_ronda,premio_pozo,total,usuario)
 values(f,src,r,env,case when manual then null else bolas end,manual,ns,base,extra,total,auth.uid());
 select jsonb_agg(case when (v->>'i')::integer=r then jsonb_set(v,'{pre}',to_jsonb(total::text)) else v end order by ord)
 into nuevas from jsonb_array_elements(s.estado->'form'->'rondas') with ordinality t(v,ord);
 update privado_pagos.sesiones set estado=jsonb_set(jsonb_set(estado,'{form,rondas}',nuevas),'{form,cartonPozo}','""'::jsonb),
  revision=revision+1,form_revision=form_revision+1,actualizado=now() where source=src;
end;
$$;
revoke all on function privado_pagos.sumar_pozo(jsonb) from public,anon,authenticated;

create or replace function privado_pagos.conservar_pozo() returns trigger language plpgsql security definer set search_path='' as $$
declare p privado_pagos.pozo_diario;f jsonb;anterior jsonb;ns integer[];
begin
 select * into p from privado_pagos.pozo_diario where source=new.source and to_char(fecha,'DD/MM/YYYY')=new.estado->'form'->>'fechaSorteo';
 if not found then return new;end if;
 if nullif(trim(new.estado->'form'->>'cartonPozo'),'') is not null then raise exception 'El pozo de hoy ya fue entregado; no se puede generar otro pago del pozo';end if;
 -- Un reinicio limpia la pantalla, pero conserva el registro diario del pozo.
 if not exists(select 1 from jsonb_array_elements(new.estado->'form'->'rondas') v where nullif(trim(v->>'car'),'') is not null)
  and nullif(trim(new.estado->'form'->>'cartonesCon'),'') is null then return new;end if;
 select value into anterior from jsonb_array_elements(old.estado->'form'->'rondas') where (value->>'i')::integer=p.ronda;
 -- Tras un reinicio se pueden preparar otras rondas, conservando el pozo agotado.
 if anterior is null or coalesce(anterior->>'pre','') !~ '^[0-9.,]+$' then return new;end if;
 if replace(replace(anterior->>'pre','.',''),',','.')::numeric<>p.total then return new;end if;
 select value into f from jsonb_array_elements(new.estado->'form'->'rondas') where (value->>'i')::integer=p.ronda;
 if f is null or replace(replace(f->>'pre','.',''),',','.')::numeric<>p.total then raise exception 'Esta ronda ya incluye el pozo. Conserva su premio total';end if;
 select array_agg(v::integer order by v::integer) into ns from regexp_split_to_table(f->>'car','\s*[,;]\s*') v;
 if ns is distinct from p.cartones or nullif(trim(new.estado->'form'->>'cartonPozo'),'') is not null then raise exception 'El pozo ya está incluido en la ronda ganadora; no se puede generar otro pago del pozo';end if;
 return new;
end;
$$;
revoke all on function privado_pagos.conservar_pozo() from public,anon,authenticated;
create or replace trigger conservar_pozo_diario before update of estado on privado_pagos.sesiones for each row execute function privado_pagos.conservar_pozo();

create or replace function privado_pagos.sincronizar_con_pozo(a jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare respuesta jsonb;f text;
begin
 if auth.uid() is null or not privado_en_vivo.es_pagos() then raise exception 'Acceso no autorizado' using errcode='42501';end if;
 if a->>'action'='pozo' then
  perform privado_pagos.sumar_pozo(a);
  respuesta:=privado_pagos.sincronizar(jsonb_set(a,'{action}','"read"'::jsonb));
 else respuesta:=privado_pagos.sincronizar(a);end if;
 select estado->'form'->>'fechaSorteo' into f from privado_pagos.sesiones where source=respuesta->>'source';
 return respuesta||jsonb_build_object('pozo',privado_pagos.pozo_resumen(f));
end;
$$;
revoke all on function privado_pagos.sincronizar_con_pozo(jsonb) from public,anon;
grant execute on function privado_pagos.sincronizar_con_pozo(jsonb) to authenticated;
create or replace function public.pagos_sincronizar(a jsonb) returns jsonb language sql security invoker set search_path='' as $$select privado_pagos.sincronizar_con_pozo(a)$$;
revoke all on function public.pagos_sincronizar(jsonb) from public,anon;
grant execute on function public.pagos_sincronizar(jsonb) to authenticated;
commit;
