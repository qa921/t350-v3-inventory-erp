-- M-T350-V3 restoration: account-safety guard.
-- Per the 2026-09-04 operations-trail note: any request that would delete or
-- deactivate the final active master must fail atomically and write an audit
-- event. Enforced here at the database layer (applies to direct SQL, REST and
-- service-role/edge-function paths alike); the admin-users edge function
-- repeats the check for a clean 409 response.

create or replace function t350_v3.other_active_masters_exist(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = t350_v3
as $$
  select exists (
    select 1
    from t350_v3.user_roles ur
    join t350_v3.profiles p on p.id = ur.user_id
    where ur.role = 'master'
      and p.is_active
      and ur.user_id <> p_user_id
  );
$$;

create or replace function t350_v3.guard_final_active_master()
returns trigger
language plpgsql
security definer
set search_path = t350_v3
as $$
declare
  v_target uuid;
  v_removing boolean := false;
begin
  if tg_table_name = 'profiles' then
    if tg_op = 'DELETE' then
      v_target := old.id;
      v_removing := true;
    elsif tg_op = 'UPDATE' then
      v_target := old.id;
      v_removing := (old.is_active and not new.is_active);
    end if;
  elsif tg_table_name = 'user_roles' then
    if tg_op = 'DELETE' then
      v_target := old.user_id;
      v_removing := (old.role = 'master');
    elsif tg_op = 'UPDATE' then
      v_target := old.user_id;
      v_removing := (old.role = 'master' and new.role <> 'master');
    end if;
  end if;

  if v_removing and v_target is not null then
    if exists (
         select 1
         from t350_v3.profiles p
         join t350_v3.user_roles ur on ur.user_id = p.id
         where p.id = v_target and p.is_active and ur.role = 'master'
       )
       and not t350_v3.other_active_masters_exist(v_target) then
      insert into t350_v3.audit_log (actor, action, entity, entity_id, detail)
      values (
        auth.uid(),
        'final_active_master_guard_blocked',
        tg_table_name,
        v_target::text,
        jsonb_build_object('operation', tg_op)
      );
      raise exception 'cannot remove the final active master user'
        using errcode = 'P0001';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_final_master_profiles on t350_v3.profiles;
create trigger trg_guard_final_master_profiles
  before delete or update of is_active on t350_v3.profiles
  for each row execute function t350_v3.guard_final_active_master();

drop trigger if exists trg_guard_final_master_user_roles on t350_v3.user_roles;
create trigger trg_guard_final_master_user_roles
  before delete or update of role on t350_v3.user_roles
  for each row execute function t350_v3.guard_final_active_master();

-- -------------------------------------------------------------------------
-- Append-only audit enforcement
-- -------------------------------------------------------------------------
create or replace function t350_v3.audit_log_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_log is append-only'
    using errcode = 'P0001';
end;
$$;

drop trigger if exists trg_audit_log_immutable on t350_v3.audit_log;
create trigger trg_audit_log_immutable
  before update or delete on t350_v3.audit_log
  for each row execute function t350_v3.audit_log_immutable();
