-- The managed Postgres login is the connection identity used by the Publisher.
-- It must explicitly assume the restricted runtime role for every transaction.
grant kardo_publisher to postgres;
