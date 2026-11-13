-- Consulta limitada de identidad; no devuelve datos bancarios ni modifica ganadores.
begin;
create or replace function privado_en_vivo.identificar_cartones(p_fecha date,p_source text,p_cartones integer[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare resultado jsonb;
begin
 if auth.uid() is null or not privado_en_vivo.puede_enviar() then
  raise exception 'Tu correo no está autorizado' using errcode='42501';
 end if;
 if p_source is null or p_source is distinct from privado_en_vivo.source_actual()
  or p_fecha is null or not exists(select 1 from public.en_vivo_jornadas where fecha=p_fecha and source=p_source) then
  raise exception 'El sorteo cambió o la fecha no está preparada. Actualiza las rondas' using errcode='22023';
 end if;
 if p_cartones is null or cardinality(p_cartones) not between 1 and 100
  or exists(select 1 from unnest(p_cartones) n where n is null or n not between 1 and 9999)
  or (select count(distinct n) from unnest(p_cartones) n)<>cardinality(p_cartones) then
  raise exception 'Revisa los números de cartón' using errcode='22023';
 end if;
 select jsonb_agg(jsonb_build_object('carton',n,'nombre',case when coincidencias=1 then nombre else null end,
  'estado',case when coincidencias=0 then 'no_encontrado' when coincidencias>1 then 'ambiguo' else 'aprobado' end) order by orden)
 into resultado from (
  select t.n,t.orden,count(i.id) coincidencias,min(nullif(trim(i.nombre),'')) nombre
  from unnest(p_cartones) with ordinality t(n,orden)
  left join public.inscripciones i on i.estado='aprobado' and t.n=any(i.cartones)
  group by t.n,t.orden
 ) datos;
 return jsonb_build_object('fecha',p_fecha,'source',p_source,'ganadores',resultado);
end;
$$;
revoke all on function privado_en_vivo.identificar_cartones(date,text,integer[]) from public,anon;
grant execute on function privado_en_vivo.identificar_cartones(date,text,integer[]) to authenticated;
create or replace function public.en_vivo_identificar_cartones(p_fecha date,p_source text,p_cartones integer[])
returns jsonb language sql security invoker set search_path='' as $$
 select privado_en_vivo.identificar_cartones(p_fecha,p_source,p_cartones);
$$;
revoke all on function public.en_vivo_identificar_cartones(date,text,integer[]) from public,anon;
grant execute on function public.en_vivo_identificar_cartones(date,text,integer[]) to authenticated;
commit;
