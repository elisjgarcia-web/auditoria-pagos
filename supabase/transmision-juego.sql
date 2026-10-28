-- Preparado para revisión. NO ejecutar en producción sin autorización.
-- Depende de privado_resultados.publicadores_resultados, ya usado por ganadores.
begin;
create table public.transmision_juego (
 id smallint primary key check(id=1),
 video_id text check(video_id is null or video_id ~ '^[A-Za-z0-9_-]{11}$'),
 revision integer not null default 0 check(revision>=0),
 expira_en timestamptz,
 check((video_id is null)=(expira_en is null))
);
alter table public.transmision_juego enable row level security;
revoke all on public.transmision_juego from public,anon,authenticated;
grant select on public.transmision_juego to anon,authenticated;
create policy transmision_lectura on public.transmision_juego for select to anon,authenticated using(id=1);
insert into public.transmision_juego(id) values(1);
create function privado_resultados.guardar_transmision_juego_v1(p_video_id text,p_revision integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.transmision_juego;
begin
 if auth.uid() is null or not exists(select 1 from privado_resultados.publicadores_resultados p where p.usuario_id=auth.uid() and p.activo)
 then raise exception 'Usuario no autorizado' using errcode='42501';end if;
 if p_revision is null or p_revision<0 or (p_video_id is not null and p_video_id !~ '^[A-Za-z0-9_-]{11}$')
 then raise exception 'Datos de transmisión inválidos';end if;
 select * into strict r from public.transmision_juego where id=1 for update;
 if r.revision<>p_revision then raise exception 'La transmisión cambió. Consulta antes de reenviar.' using errcode='40001';end if;
 update public.transmision_juego set video_id=p_video_id,revision=revision+1,
 expira_en=case when p_video_id is null then null else now()+interval '18 hours' end where id=1 returning * into r;
 return jsonb_build_object('video_id',r.video_id,'revision',r.revision,'expira_en',r.expira_en);
end;$$;
revoke all on function privado_resultados.guardar_transmision_juego_v1(text,integer) from public,anon;
grant execute on function privado_resultados.guardar_transmision_juego_v1(text,integer) to authenticated;
create function public.guardar_transmision_juego_v1(p_video_id text,p_revision integer) returns jsonb
language sql security invoker set search_path='' as $$
 select privado_resultados.guardar_transmision_juego_v1(p_video_id,p_revision);
$$;
revoke all on function public.guardar_transmision_juego_v1(text,integer) from public,anon;
grant execute on function public.guardar_transmision_juego_v1(text,integer) to authenticated;
commit;
