-- PREPARADO, NO APLICADO. Independiente de compras, reservas, pagos y reinicios del sorteo.
begin;
create schema if not exists privado_premios;
revoke all on schema privado_premios from public;
grant usage on schema privado_premios to anon, authenticated;
create function privado_premios.puede_publicar() returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from privado_resultados.publicadores_resultados where usuario_id=auth.uid() and activo)
$$;
revoke all on function privado_premios.puede_publicar() from public;
grant execute on function privado_premios.puede_publicar() to anon, authenticated;

create table public.premios_pagados (
 fecha date primary key, revision bigint not null check(revision>0), publicado boolean not null default false,
 actualizado_en timestamptz not null default now()
);
create table public.premios_pagados_imagenes (
 fecha date not null references public.premios_pagados(fecha), orden integer not null check(orden between 1 and 30),
 ronda text not null check(length(ronda) between 1 and 40), titulo text not null check(length(titulo) between 1 and 80),
 ruta text not null unique, miniatura text not null unique, ancho integer not null check(ancho between 1 and 12000), alto integer not null check(alto between 1 and 12000),
 ganadores jsonb not null check(jsonb_typeof(ganadores)='array'), primary key(fecha,orden), unique(fecha,ronda)
);
alter table public.premios_pagados enable row level security;
alter table public.premios_pagados_imagenes enable row level security;
revoke all on public.premios_pagados,public.premios_pagados_imagenes from public,anon,authenticated;
grant select on public.premios_pagados,public.premios_pagados_imagenes to anon,authenticated;
create policy premios_fechas_lectura on public.premios_pagados for select to anon,authenticated
 using(publicado or (select privado_premios.puede_publicar()));
create policy premios_imagenes_lectura on public.premios_pagados_imagenes for select to anon,authenticated
 using(exists(select 1 from public.premios_pagados p where p.fecha=premios_pagados_imagenes.fecha and p.publicado) or (select privado_premios.puede_publicar()));

create function privado_premios.imagen_visible(p_ruta text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.premios_pagados_imagenes i join public.premios_pagados p using(fecha) where p.publicado and (i.ruta=p_ruta or i.miniatura=p_ruta))
$$;
revoke all on function privado_premios.imagen_visible(text) from public;
grant execute on function privado_premios.imagen_visible(text) to anon,authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('premios-pagados','premios-pagados',false,8388608,array['image/jpeg']);
-- Objetos inmutables. Las políticas restrictivas aíslan este bucket de políticas antiguas amplias.
create policy premios_storage_leer on storage.objects for select to anon,authenticated
 using(bucket_id='premios-pagados' and (privado_premios.imagen_visible(name) or (select privado_premios.puede_publicar())));
create policy premios_storage_insertar on storage.objects for insert to authenticated
 with check(bucket_id='premios-pagados' and (select privado_premios.puede_publicar()) and name ~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}/[0-9a-f-]{36}/[0-9a-f-]{36}(-mini)?[.]jpg$');
create policy premios_storage_borrar on storage.objects for delete to authenticated
 using(bucket_id='premios-pagados' and (select privado_premios.puede_publicar()) and not privado_premios.imagen_visible(name));
create policy premios_storage_limite_leer on storage.objects as restrictive for select to anon,authenticated
 using(bucket_id<>'premios-pagados' or privado_premios.imagen_visible(name) or (select privado_premios.puede_publicar()));
create policy premios_storage_limite_insertar on storage.objects as restrictive for insert to anon,authenticated
 with check(bucket_id<>'premios-pagados' or ((select privado_premios.puede_publicar()) and name ~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}/[0-9a-f-]{36}/[0-9a-f-]{36}(-mini)?[.]jpg$'));
create policy premios_storage_no_reemplazar on storage.objects as restrictive for update to anon,authenticated
 using(bucket_id<>'premios-pagados') with check(bucket_id<>'premios-pagados');
create policy premios_storage_limite_borrar on storage.objects as restrictive for delete to anon,authenticated
 using(bucket_id<>'premios-pagados' or ((select privado_premios.puede_publicar()) and not privado_premios.imagen_visible(name)));

create function privado_premios.publicar(p_fecha date,p_revision bigint,p_imagenes jsonb,p_confirmado boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare anterior bigint; imagen jsonb; ganador jsonb; n integer:=0; archivo record; ruta text; mini text;
begin
 if not privado_premios.puede_publicar() then raise exception 'No autorizado para publicar comprobantes' using errcode='42501'; end if;
 if p_fecha is null or p_fecha<'2020-01-01' or p_fecha>'2100-12-31' or p_revision is null or p_revision<0 then raise exception 'Fecha o revisión inválida'; end if;
 if p_confirmado is distinct from true then raise exception 'Revisa las imágenes cubiertas antes de publicar'; end if;
 if jsonb_typeof(p_imagenes) is distinct from 'array' or jsonb_array_length(p_imagenes) not between 1 and 30 or octet_length(p_imagenes::text)>150000 then raise exception 'Lista de comprobantes inválida'; end if;
 perform pg_advisory_xact_lock(hashtextextended('premios-pagados:'||p_fecha::text,0));
 select revision into anterior from public.premios_pagados where fecha=p_fecha for update;
 if coalesce(anterior,0)<>p_revision then raise exception 'La publicación cambió. Genera otra vista previa.' using errcode='40001'; end if;
 for imagen in select value from jsonb_array_elements(p_imagenes) loop
  if jsonb_typeof(imagen)<>'object' or imagen-array['ronda','titulo','ruta','miniatura','ancho','alto','ganadores']<>'{}'::jsonb or
   jsonb_typeof(imagen->'ronda') is distinct from 'string' or (imagen->>'ronda') !~ '^[A-Za-z0-9_-]{1,40}$' or
   jsonb_typeof(imagen->'titulo') is distinct from 'string' or length(trim(imagen->>'titulo')) not between 1 and 80 or (imagen->>'titulo') ~ '[[:cntrl:]]' or
   jsonb_typeof(imagen->'ancho') is distinct from 'number' or (imagen->>'ancho') !~ '^[0-9]+$' or
   jsonb_typeof(imagen->'alto') is distinct from 'number' or (imagen->>'alto') !~ '^[0-9]+$' or
   (imagen->>'ancho')::numeric not between 1 and 12000 or (imagen->>'alto')::numeric not between 1 and 12000 or (imagen->>'ancho')::numeric*(imagen->>'alto')::numeric>16000000 or
   jsonb_typeof(imagen->'ruta') is distinct from 'string' or jsonb_typeof(imagen->'miniatura') is distinct from 'string' or
   jsonb_typeof(imagen->'ganadores') is distinct from 'array' or jsonb_array_length(imagen->'ganadores') not between 1 and 100 then raise exception 'Comprobante inválido'; end if;
  ruta:=imagen->>'ruta';mini:=imagen->>'miniatura';
  if ruta !~ ('^'||p_fecha::text||'/[0-9a-f-]{36}/[0-9a-f-]{36}[.]jpg$') or mini<>replace(ruta,'.jpg','-mini.jpg') then raise exception 'Ruta de imagen inválida'; end if;
  for ganador in select value from jsonb_array_elements(imagen->'ganadores') loop
   if jsonb_typeof(ganador)<>'object' or ganador-array['nombre','carton']<>'{}'::jsonb or
    jsonb_typeof(ganador->'nombre') is distinct from 'string' or length(trim(ganador->>'nombre')) not between 1 and 160 or (ganador->>'nombre') ~ '[[:cntrl:]]' or
    jsonb_typeof(ganador->'carton') is distinct from 'string' or length(ganador->>'carton')>25 then raise exception 'Datos públicos del ganador inválidos'; end if;
  end loop;
  for archivo in select name,metadata from storage.objects where bucket_id='premios-pagados' and name in(ruta,mini) loop
   if archivo.metadata->>'mimetype' is distinct from 'image/jpeg' or coalesce((archivo.metadata->>'size')::bigint,0) not between 1 and 8388608 then raise exception 'Formato o tamaño de imagen inválido'; end if;
  end loop;
  if (select count(*) from storage.objects where bucket_id='premios-pagados' and name in(ruta,mini))<>2 then raise exception 'Falta una imagen. Reintenta la publicación.'; end if;
 end loop;
 insert into public.premios_pagados(fecha,revision,publicado) values(p_fecha,1,true)
 on conflict(fecha) do update set revision=premios_pagados.revision+1,publicado=true,actualizado_en=now();
 delete from public.premios_pagados_imagenes where fecha=p_fecha;
 for imagen in select value from jsonb_array_elements(p_imagenes) loop
  n:=n+1;
  insert into public.premios_pagados_imagenes(fecha,orden,ronda,titulo,ruta,miniatura,ancho,alto,ganadores)
   values(p_fecha,n,imagen->>'ronda',trim(imagen->>'titulo'),imagen->>'ruta',imagen->>'miniatura',(imagen->>'ancho')::integer,(imagen->>'alto')::integer,imagen->'ganadores');
 end loop;
 return jsonb_build_object('fecha',p_fecha,'revision',coalesce(anterior,0)+1,'imagenes',n,'publicado',true);
end $$;
revoke all on function privado_premios.publicar(date,bigint,jsonb,boolean) from public,anon;
grant execute on function privado_premios.publicar(date,bigint,jsonb,boolean) to authenticated;
create function public.premios_pagados_publicar_v1(p_fecha date,p_revision bigint,p_imagenes jsonb,p_confirmado boolean default false) returns jsonb
language sql security invoker set search_path='' as $$select privado_premios.publicar(p_fecha,p_revision,p_imagenes,p_confirmado)$$;
revoke all on function public.premios_pagados_publicar_v1(date,bigint,jsonb,boolean) from public,anon;
grant execute on function public.premios_pagados_publicar_v1(date,bigint,jsonb,boolean) to authenticated;

create function privado_premios.retirar(p_fecha date,p_revision bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actual bigint;
begin
 if not privado_premios.puede_publicar() then raise exception 'No autorizado' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('premios-pagados:'||p_fecha::text,0));
 select revision into actual from public.premios_pagados where fecha=p_fecha for update;
 if actual is null or actual<>p_revision then raise exception 'La publicación cambió. Consulta otra vez.' using errcode='40001'; end if;
 update public.premios_pagados set publicado=false,revision=revision+1,actualizado_en=now() where fecha=p_fecha;
 return jsonb_build_object('fecha',p_fecha,'revision',actual+1,'publicado',false);
end $$;
revoke all on function privado_premios.retirar(date,bigint) from public,anon;
grant execute on function privado_premios.retirar(date,bigint) to authenticated;
create function public.premios_pagados_retirar_v1(p_fecha date,p_revision bigint) returns jsonb
language sql security invoker set search_path='' as $$select privado_premios.retirar(p_fecha,p_revision)$$;
revoke all on function public.premios_pagados_retirar_v1(date,bigint) from public,anon;
grant execute on function public.premios_pagados_retirar_v1(date,bigint) to authenticated;
commit;
