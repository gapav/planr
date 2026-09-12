-- One-time cutover cleanup for the passwordless invitation flow.
--
-- These rows were created before Grep could mint and deliver its own magic
-- links. Remove only invitations that have never been accepted so the app
-- starts the new flow with an empty pending list. Existing Auth users,
-- profiles, memberships, and accepted invitation history are left untouched.
--
-- This deletion is intentional and irreversible: apply it only after
-- 202609020027_passwordless_team_invitations.sql.
delete from public.team_invitations
where accepted_at is null;

notify pgrst, 'reload schema';
