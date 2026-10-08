import type { ApplicationRow } from "./events";
import type { Db } from "./tailored";

/** Every application with its event counts, newest first. */
export async function loadApplications(db: Db | undefined): Promise<ApplicationRow[]> {
  if (!db) return [];
  const { results } = await db
    .prepare(
      `SELECT a.slug, a.company, a.role, a.status, a.published_at, a.followed_up_at,
         COALESCE(SUM(e.type = 'human'), 0)                   AS human_opens,
         COALESCE(SUM(e.type = 'open' AND e.scanner = 1), 0)  AS scanner_opens,
         MAX(CASE WHEN e.type = 'human' THEN e.ts END)        AS last_human,
         MIN(CASE WHEN e.type = 'human' THEN e.ts END)        AS first_human,
         COALESCE(SUM(e.type = 'fit_viewed'), 0)              AS fit_views,
         COALESCE(SUM(e.type = 'cv_download'), 0)             AS cv_downloads,
         COALESCE(SUM(e.type = 'case_click'), 0)              AS case_clicks,
         COALESCE(SUM(e.type = 'elevator'), 0)                AS elevator_uses
       FROM applications a LEFT JOIN events e ON e.slug = a.slug
       GROUP BY a.slug ORDER BY a.published_at DESC`,
    )
    .bind()
    .all<ApplicationRow>();
  return results;
}
