---
paths:
  - "site/lib/{session,exercises,warmup}*.ts"
  - "site/app/sessions/**"
  - "site/components/{session-*,live-session,warmup-dialog}.tsx"
  - "site/supabase/**"
---

# Session lifecycle

`draft → published → in_progress → completed`. The ways back are `undo_session_start` (in progress → published) and `reopen_session` (completed → published); `copy_session` starts a new draft from a plan in any state, leaving the record of the run (`started_at`, `completed_at`) behind. The UI's Drafts/Upcoming/Past tabs are derived, not stored — see `deriveSessionTab` in `lib/session.ts` (in progress is always upcoming, completed always past, and a published plan is past once `startsAt + plannedDurationMinutes` has gone by). `validatePublish` gates publishing client-side, and `publish_session` plus `validate_session_publish_transition` re-check it in the DB — so the client can be overruled, which is why `publishSession` rolls back. Starting is one step with no setup — Grep holds no player data (decision 12), so there is no attendance or draw. Once `start_session(uuid)` succeeds, `prevent_in_progress_session_changes` locks the plan's rows, and keeps a completed plan locked too; each transition RPC lifts the lock for its own session for one transaction through `plannr.unlocked_session`. Dates are stored in UTC.

Session items (and warm-up routine items) **copy** the exercise's display data (title, description, media, thumbnail) at insert time, but the library wins on screen: `resolveSessionDisplay` / `resolveWarmupRoutineDisplay` in `lib/exercises.ts` overlay the current exercise as the provider hands `sessions` and `warmupRoutines` to consumers. Nothing is rewritten in the database, so the stored copy is the fallback once an exercise is archived or deleted, and an `in_progress` session stays locked. `durationMinutes` and `coachingNotes` belong to the plan; the title of a linked item is therefore read-only in the builder and the warm-up dialog.
