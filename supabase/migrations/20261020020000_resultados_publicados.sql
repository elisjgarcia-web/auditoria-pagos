-- Aplicar primero en una rama de desarrollo, después de respaldar esquema y datos.
begin;
create table public.publicadores_resultados (
 usuario_id uuid primary key references auth.users(id),
 activo boolean not null default true
);
alter table public.publicadores_resultados enable row level security;
revoke all on public.publicadores_resultados from public, anon, authenticated;

-- Sin FK a inscripciones, cartones o sorteos: los reinicios no se propagan aquí.
create table public.resultados_publicados (
 fecha date primary key,
 resultado jsonb not null,
 publicado_en timestamptz not null default now()
);
alter table public.resultados_publicados enable row level security;
revoke all on public.resultados_publicados from public, anon, authenticated;
grant select on public.resultados_publicados to anon, authenticated;
create policy resultados_lectura on public.resultados_publicados for select to anon, authenticated using (true);

create function public.resultados_inmutables() returns trigger
language plpgsql set search_path = '' as $$
begin raise exception 'Los resultados publicados son permanentes; no se pueden borrar ni modificar.'; end;
$$;
revoke all on function public.resultados_inmutables() from public, anon, authenticated;
create trigger proteger_resultados before update or delete on public.resultados_publicados
for each row execute function public.resultados_inmutables();
create trigger proteger_resultados_truncate before truncate on public.resultados_publicados
for each statement execute function public.resultados_inmutables();

create function public.publicar_resultados_v1(p_resultado jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
 f date; g jsonb; w jsonb; n int; pos int := 0; regulares int := 0;
 finales int := 0; consolaciones int := 0; pozos int := 0; cantidad int;
 c int; premio bigint; vistos int[]; anterior jsonb; aprobados int;
begin
 if auth.uid() is null or not exists (
  select 1 from public.publicadores_resultados where usuario_id=auth.uid() and activo
 ) then raise exception 'Usuario no autorizado para publicar' using errcode='42501'; end if;
 if p_resultado is null or jsonb_typeof(p_resultado)<>'object' or
    p_resultado - array['version','fecha','grupos'] <> '{}'::jsonb or
    p_resultado->'version' is distinct from '1'::jsonb or
    jsonb_typeof(p_resultado->'fecha') is distinct from 'string' or
    jsonb_typeof(p_resultado->'grupos') is distinct from 'array' or
    octet_length(p_resultado::text)>100000 then raise exception 'Contrato público inválido'; end if;
 if (p_resultado->>'fecha') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Fecha inválida'; end if;
 f := (p_resultado->>'fecha')::date;
 if f < date '2020-01-01' or f > date '2100-12-31' then raise exception 'Fecha fuera de rango'; end if;
 cantidad := jsonb_array_length(p_resultado->'grupos');
 if cantidad<2 or cantidad>8 then raise exception 'Cantidad de grupos inválida'; end if;
 for g in select value from jsonb_array_elements(p_resultado->'grupos') loop
  pos:=pos+1;
  if jsonb_typeof(g)<>'object' or g-array['tipo','orden','ganadores']<>'{}'::jsonb or
     jsonb_typeof(g->'tipo') is distinct from 'string' or
     jsonb_typeof(g->'orden') is distinct from 'number' or
     jsonb_typeof(g->'ganadores') is distinct from 'array' then raise exception 'Grupo inválido'; end if;
  if (g->>'orden') !~ '^\d+$' then raise exception 'Orden inválido'; end if;
  n:=(g->>'orden')::int;
  if g->>'tipo'='ronda' then
   if finales>0 or n<>pos or pos>5 then raise exception 'Rondas incompletas o fuera de orden'; end if;
   regulares:=regulares+1;
  elsif g->>'tipo'='final' then
   finales:=finales+1;
   if finales<>1 or n<>pos or pos<2 or pos>6 then raise exception 'Final inválido'; end if;
  elsif g->>'tipo'='consolacion' then
   consolaciones:=consolaciones+1;
   if finales<>1 or consolaciones<>1 or n<>0 then raise exception 'Consolación inválida'; end if;
  elsif g->>'tipo'='pozo' then
   pozos:=pozos+1;
   if finales<>1 or pozos<>1 or n<>0 then raise exception 'Pozo inválido'; end if;
  else raise exception 'Categoría inválida'; end if;
  if jsonb_array_length(g->'ganadores')<1 or jsonb_array_length(g->'ganadores')>100 then raise exception 'Cantidad de ganadores inválida'; end if;
  vistos:=array[]::int[];
  for w in select value from jsonb_array_elements(g->'ganadores') loop
   if jsonb_typeof(w)<>'object' or w-array['carton','premio_centimos']<>'{}'::jsonb or
      jsonb_typeof(w->'carton') is distinct from 'number' or
      jsonb_typeof(w->'premio_centimos') is distinct from 'number' then raise exception 'Ganador inválido'; end if;
   if (w->>'carton') !~ '^\d+$' or (w->>'premio_centimos') !~ '^\d+$' then raise exception 'Importes o cartones inválidos'; end if;
   c:=(w->>'carton')::int; premio:=(w->>'premio_centimos')::bigint;
   if c<1 or c>9999 or premio<1 or premio>100000000000 or c=any(vistos) then raise exception 'Cartón repetido o premio fuera de rango'; end if;
   vistos:=array_append(vistos,c);
  end loop;
 end loop;
 if finales<>1 or regulares<1 then raise exception 'Faltan rondas o cartón lleno final'; end if;
 -- Serializa publicaciones de la misma fecha; no sobrescribe resultados.
 perform pg_advisory_xact_lock(750075, f-date '2020-01-01');
 select resultado into anterior from public.resultados_publicados where fecha=f;
 if anterior is not null then
  if anterior=p_resultado then return jsonb_build_object('fecha',f,'ya_publicado',true); end if;
  raise exception 'La fecha ya tiene resultados publicados diferentes';
 end if;
 -- Verifica nuevamente el origen; no confía solamente en datos locales del navegador.
 for g in select value from jsonb_array_elements(p_resultado->'grupos') loop
  for w in select value from jsonb_array_elements(g->'ganadores') loop
   c:=(w->>'carton')::int;
   select count(*) into aprobados from public.inscripciones i
    where i.estado='aprobado' and to_jsonb(i.cartones) @> jsonb_build_array(c);
   if aprobados<>1 then raise exception 'El cartón % no tiene una compra aprobada única',c; end if;
  end loop;
 end loop;
 insert into public.resultados_publicados(fecha,resultado) values(f,p_resultado);
 return jsonb_build_object('fecha',f,'ya_publicado',false);
end;
$$;
revoke all on function public.publicar_resultados_v1(jsonb) from public, anon;
grant execute on function public.publicar_resultados_v1(jsonb) to authenticated;
commit;
