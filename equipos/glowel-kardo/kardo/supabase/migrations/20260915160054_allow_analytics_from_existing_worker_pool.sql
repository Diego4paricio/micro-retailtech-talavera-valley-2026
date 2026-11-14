-- The current PoA Hyperdrive connection is authenticated as the existing
-- worker-pool login. It may assume the analytics role, but every analytics
-- transaction explicitly uses SET LOCAL ROLE kardo_analytics. This avoids
-- shipping a second database password to Cloudflare. A dedicated
-- kardo_analytics_runtime login already exists for a future isolated pool.
grant kardo_analytics to kardo_publisher_runtime;
