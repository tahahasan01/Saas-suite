-- ============================================================================
-- Migration 0077 — POS devices: branch isolation and their own credential
-- (security review of 0076)
--
--  * pos_devices join branch isolation (D-03): a device belongs to its
--    register's branch.
--  * Each device gets a secret token (only its SHA-256 is stored, like other
--    tokens in app/tokens.py); a heartbeat must present it, so a user with
--    till access can't report another device's unsent sales.
-- ============================================================================

alter table pos_devices add column branch_id uuid, add column token_hash text;
update pos_devices d set branch_id = r.branch_id from pos_registers r where r.id = d.register_id;
call bos_branch_scope('pos_devices', true);
create unique index pos_devices_token_key on pos_devices (token_hash) where token_hash is not null;
