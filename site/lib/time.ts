/**
 * The club's clock.
 *
 * Almost everything on screen is formatted in the viewer's own zone, which is
 * right: a coach reads their sessions where they stand. Two things cannot work
 * that way, because no viewer is present — the tournament export, whose times
 * are published in Norwegian local time, and the scheduled morning digest,
 * which runs on a server in UTC and has to decide which sessions count as
 * "today".
 */
export const CLUB_TIME_ZONE = "Europe/Oslo";
