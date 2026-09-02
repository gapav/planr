-- A finished workout leaves the live view and becomes a locked record.
-- The value is added on its own so the transaction can commit before
-- 202609020010 uses it.
alter type public.session_status add value if not exists 'completed';
