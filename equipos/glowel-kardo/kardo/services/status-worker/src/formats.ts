import { FormatRegistry } from "@sinclair/typebox";

// TypeBox's `Value.Check` fails any `format` it does not know. The incident
// set the Staff API pushes uses `uuid` and `date-time` (same approach as the
// Publisher's design-formats.ts).
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dateTimePattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;

if (!FormatRegistry.Has("uuid")) {
  FormatRegistry.Set("uuid", (value) => uuidPattern.test(value));
}
if (!FormatRegistry.Has("date-time")) {
  FormatRegistry.Set(
    "date-time",
    (value) => dateTimePattern.test(value) && !Number.isNaN(Date.parse(value)),
  );
}
