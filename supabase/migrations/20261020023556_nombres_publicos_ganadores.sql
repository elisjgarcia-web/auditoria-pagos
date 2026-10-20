begin;
-- Nombres autorizados por el propietario. Los premios publicados permanecen intactos.
create table public.nombres_resultados_publicados (
 fecha date not null references public.resultados_publicados(fecha),
 carton integer not null check(carton between 1 and 9999),
 nombre text not null check(length(btrim(nombre)) between 1 and 200),
 primary key(fecha,carton)
);
alter table public.nombres_resultados_publicados enable row level security;
revoke all on public.nombres_resultados_publicados from public,anon,authenticated;
grant select on public.nombres_resultados_publicados to anon,authenticated;
create policy nombres_lectura on public.nombres_resultados_publicados for select to anon,authenticated using(true);
create trigger proteger_nombres before update or delete on public.nombres_resultados_publicados
for each row execute function privado_resultados.resultados_inmutables();
create trigger proteger_nombres_truncate before truncate on public.nombres_resultados_publicados
for each statement execute function privado_resultados.resultados_inmutables();

create function privado_resultados.capturar_nombres_resultado() returns trigger
language plpgsql security invoker set search_path='' as $$
declare c integer; nombre text; cantidad integer;
begin
 for c in select distinct (w->>'carton')::integer
 from jsonb_array_elements(new.resultado->'grupos') g,
 lateral jsonb_array_elements(g->'ganadores') w loop
  select count(*),min(btrim(i.nombre)) into cantidad,nombre
  from public.inscripciones i where i.estado='aprobado' and to_jsonb(i.cartones) @> jsonb_build_array(c);
  if cantidad<>1 or nombre is null or length(nombre)=0 then
   raise exception 'No se pudo verificar el nombre del cartón %',c;
  end if;
  insert into public.nombres_resultados_publicados(fecha,carton,nombre) values(new.fecha,c,nombre);
 end loop;
 return new;
end;
$$;
revoke all on function privado_resultados.capturar_nombres_resultado() from public,anon,authenticated;
create trigger guardar_nombres_resultado after insert on public.resultados_publicados
for each row execute function privado_resultados.capturar_nombres_resultado();

create view public.resultados_publicos_con_nombres with(security_invoker=true) as
select r.fecha,r.publicado_en,r.resultado||jsonb_build_object('nombres',coalesce((
 select jsonb_object_agg(n.carton::text,n.nombre) from public.nombres_resultados_publicados n where n.fecha=r.fecha
),'{}'::jsonb)) as resultado from public.resultados_publicados r;
revoke all on public.resultados_publicos_con_nombres from public,anon,authenticated;
grant select on public.resultados_publicos_con_nombres to anon,authenticated;
commit;
