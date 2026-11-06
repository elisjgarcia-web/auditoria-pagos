-- Run before presentadora-push.sql: pg_net is required by the dispatcher.
create extension if not exists pg_net with schema extensions;
-- Webhook requests carry a short-lived signature bound to the event ID.
-- No private key or long-lived hook secret is placed in the HTTP request queue.
-- Run after presentadora-push.sql and after provisioning/deploying the sender.
select cron.schedule('andino-presentadora-push','* * * * *',
 $cmd$select privado_push.despachar(); delete from privado_push.cola where creado_en<now()-interval '7 days';$cmd$);
