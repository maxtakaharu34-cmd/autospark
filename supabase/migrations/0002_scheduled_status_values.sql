-- Add approval-workflow states to scheduled_status.
-- MUST be a standalone migration: new enum values cannot be referenced in the
-- same transaction that adds them (see 0003 for the references).
alter type scheduled_status add value if not exists 'draft';
alter type scheduled_status add value if not exists 'pending_approval';
alter type scheduled_status add value if not exists 'approved';
alter type scheduled_status add value if not exists 'rejected';
