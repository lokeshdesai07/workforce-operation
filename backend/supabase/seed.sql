-- seed.sql
-- Local-dev seed. Run after migrations.
--
-- Creates one admin user and one demo worker so you can log in to both
-- the admin console (admin@example.com) and the mobile app
-- (worker@example.com).
--
-- Passwords are 'admin1234' and 'worker1234'. Change before sharing.

-- Admin
do $$
declare
  v_uid uuid;
begin
  select id into v_uid from auth.users where email = 'admin@example.com';
  if v_uid is null then
    v_uid := gen_random_uuid();
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at, raw_app_meta_data,
      raw_user_meta_data, is_super_admin,
      confirmation_token, recovery_token, email_change_token_new,
      email_change_token_current, email_change, phone_change,
      phone_change_token, reauthentication_token
    ) values (
      v_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'admin@example.com', crypt('admin1234', gen_salt('bf')),
      now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false,
      '', '', '', '', '', '', '', ''
    );
    insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), v_uid, jsonb_build_object('sub', v_uid::text, 'email','admin@example.com'),
            'email', v_uid::text, now(), now(), now());
  end if;
  insert into public.admins (id) values (v_uid) on conflict do nothing;
end $$;

-- Worker
do $$
declare
  v_uid uuid;
begin
  select id into v_uid from auth.users where email = 'worker@example.com';
  if v_uid is null then
    v_uid := gen_random_uuid();
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at, raw_app_meta_data,
      raw_user_meta_data, is_super_admin,
      confirmation_token, recovery_token, email_change_token_new,
      email_change_token_current, email_change, phone_change,
      phone_change_token, reauthentication_token
    ) values (
      v_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'worker@example.com', crypt('worker1234', gen_salt('bf')),
      now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false,
      '', '', '', '', '', '', '', ''
    );
    insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), v_uid, jsonb_build_object('sub', v_uid::text, 'email','worker@example.com'),
            'email', v_uid::text, now(), now(), now());
  end if;
  insert into public.workers (id, full_name, phone)
    values (v_uid, 'Demo Worker', '+1-555-0100')
    on conflict (id) do nothing;
end $$;
