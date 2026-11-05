-- Reset only the current exclusion list; purchase/payment/history records stay intact.
begin;
create or replace function privado_slot_rondas.reiniciar(p_source text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not privado_en_vivo.puede_enviar() then
  raise exception 'Usuario no autorizado para reiniciar ganadores' using errcode='42501';
 end if;
 lock table public.inscripciones in share mode;
 if p_source is null or p_source is distinct from privado_en_vivo.source_actual() then
  raise exception 'El sorteo cambió. Actualiza antes de reiniciar' using errcode='22023';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('slot-rondas:'||p_source,0));
 delete from public.slot_rondas_excluidos where source_anchor=p_source;
 return jsonb_build_object('source',p_source,'sent',false,'people',0,'winners','[]'::jsonb);
end;
$$;
revoke all on function privado_slot_rondas.reiniciar(text) from public,anon;
grant usage on schema privado_slot_rondas to authenticated;
grant execute on function privado_slot_rondas.reiniciar(text) to authenticated;
create or replace function public.slot_reiniciar_rondas(p_source text)
returns jsonb language sql security invoker set search_path='' as $$
 select privado_slot_rondas.reiniciar(p_source);
$$;
revoke all on function public.slot_reiniciar_rondas(text) from public,anon;
grant execute on function public.slot_reiniciar_rondas(text) to authenticated;
create or replace function privado_slot_rondas.limpiar_al_reiniciar_pagos()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 -- The existing reset RPC validates the Payments identity and current source.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('slot-rondas:'||new.source,0));
 delete from public.slot_rondas_excluidos where source_anchor=new.source;
 return new;
end;
$$;
revoke all on function privado_slot_rondas.limpiar_al_reiniciar_pagos() from public,anon,authenticated;
drop trigger if exists limpiar_excluidos_slot on privado_en_vivo.cortes_reinicio;
create trigger limpiar_excluidos_slot after insert or update on privado_en_vivo.cortes_reinicio
for each row execute function privado_slot_rondas.limpiar_al_reiniciar_pagos();
commit;
