-- Ejecutar exclusivamente en una rama de desarrollo sin datos de producción.
-- Todas las inserciones y eliminaciones de esta prueba se deshacen con ROLLBACK.
begin;
insert into public.configuracion(clave,valore) values('total_cartones','100') on conflict(clave) do update set valore=excluded.valore;
insert into public.inscripciones(nombre,cartones,estado) values('PRUEBA SINTÉTICA',array[1,2,3]::bigint[],'aprobado');
do $$
declare u uuid:=gen_random_uuid();p jsonb;respuesta jsonb;bloqueado boolean;
begin
 insert into auth.users(id,email,email_confirmed_at) values(u,'prueba-resultados@example.invalid',now());
 p:='{"version":1,"fecha":"2099-01-01","grupos":[{"tipo":"ronda","orden":1,"ganadores":[{"carton":1,"premio_centimos":1000}]},{"tipo":"final","orden":2,"ganadores":[{"carton":2,"premio_centimos":2000}]},{"tipo":"consolacion","orden":0,"ganadores":[{"carton":3,"premio_centimos":500}]},{"tipo":"pozo","orden":0,"ganadores":[{"carton":2,"premio_centimos":500}]}]}'::jsonb;
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 bloqueado:=false;begin perform public.publicar_resultados_v1(p);exception when insufficient_privilege then bloqueado:=true;end;
 if not bloqueado then raise exception 'FALLÓ: publicó sin autorización';end if;
 insert into privado_resultados.publicadores_resultados(usuario_id) values(u);
 perform set_config('role','authenticated',true);
 bloqueado:=false;begin perform public.publicar_resultados_v1(p||'{"nombre":"NO PUBLICAR"}');exception when raise_exception then bloqueado:=true;end;
 if not bloqueado then raise exception 'FALLÓ: aceptó campos privados';end if;
 respuesta:=public.publicar_resultados_v1(p);
 if respuesta->>'ya_publicado'<>'false' then raise exception 'FALLÓ: primera publicación';end if;
 respuesta:=public.publicar_resultados_v1(p);
 if respuesta->>'ya_publicado'<>'true' then raise exception 'FALLÓ: reintento';end if;
 bloqueado:=false;begin perform public.publicar_resultados_v1(jsonb_set(p,'{grupos,0,ganadores,0,premio_centimos}','2000'));exception when raise_exception then bloqueado:=true;end;
 if not bloqueado then raise exception 'FALLÓ: sobrescribió una fecha';end if;
 bloqueado:=false;begin delete from public.resultados_publicados;exception when insufficient_privilege then bloqueado:=true;end;
 if not bloqueado then raise exception 'FALLÓ: permitió borrar como usuario';end if;
 perform set_config('role','postgres',true);
 delete from public.inscripciones;
 if (select count(*) from public.resultados_publicados where fecha=date '2099-01-01')<>1 then raise exception 'FALLÓ: reinicio eliminó publicación';end if;
 bloqueado:=false;begin delete from public.resultados_publicados;exception when raise_exception then bloqueado:=true;end;
 if not bloqueado then raise exception 'FALLÓ: permitió borrar como administrador';end if;
 perform set_config('role','anon',true);
 if (select count(*) from public.resultados_publicados where fecha=date '2099-01-01')<>1 then raise exception 'FALLÓ: lectura pública';end if;
 bloqueado:=false;begin perform public.publicar_resultados_v1(p);exception when insufficient_privilege then bloqueado:=true;end;
 if not bloqueado then raise exception 'FALLÓ: publicó como anónimo';end if;
 bloqueado:=false;begin perform 1 from public.ganadores;exception when insufficient_privilege then bloqueado:=true;end;
 if not bloqueado then raise exception 'FALLÓ: acceso anónimo a la tabla antigua';end if;
 perform set_config('role','postgres',true);
end;
$$;
select 'APROBADO: autorización, privacidad, publicación, reintentos, conflicto, reinicio y lectura pública' as resultado;
rollback;
