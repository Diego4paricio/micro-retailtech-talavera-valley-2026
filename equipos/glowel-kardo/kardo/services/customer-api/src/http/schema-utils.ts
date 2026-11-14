/**
 * Workaround for a schema-composition bug upstream in `@kardo/contracts`:
 * `Type.Optional(x)` (TypeBox) builds its result as `{ ...x, [OptionalKind]:
 * 'Optional' }` — a *shallow clone* — so every call site that wraps the same
 * `$id`-bearing schema (e.g. `Type.Optional(ExperienceTargetsSchema)`,
 * called once per Experience type variant) produces a distinct object that
 * still carries that `$id`. Fastify's route compiler walks a route's schema
 * tree looking for `$id`s to register for reuse, and throws
 * (`"reference '<id>' resolves to more than one schema"`) the moment it
 * finds two non-identical objects claiming the same id — which happens here
 * purely from `CreateExperienceSchema`'s own 8 variants, before any other
 * route is even involved.
 *
 * `packages/contracts` is out of scope to edit here, so this sanitizes a
 * schema *as consumed* for route registration: every `$id` below the
 * top level is stripped, leaving one canonical (inlined) shape per route.
 * `$id` carries no validation semantics by itself (AJV only needs it when
 * something else `$ref`s it, which none of these schemas do), so this
 * changes nothing about what a request/response is allowed to look like —
 * it only removes the metadata Fastify was tripping over. The top-level
 * `$id` is kept so the route's own schema still gets a sensible name in the
 * generated OpenAPI document.
 */
export function stripNestedSchemaIds<T>(schema: T): T {
  const plain = JSON.parse(JSON.stringify(schema)) as unknown;
  stripIds(plain, true);
  return plain as T;
}

function stripIds(node: unknown, isTop: boolean): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) stripIds(item, false);
    return;
  }
  const obj = node as Record<string, unknown>;
  if (!isTop) delete obj.$id;
  for (const value of Object.values(obj)) stripIds(value, false);
}
