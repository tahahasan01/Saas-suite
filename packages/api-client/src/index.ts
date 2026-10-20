/* Typed views over the generated OpenAPI schema (src/schema.ts).
 *
 *   Schema<"ProductOut">                       a response or request model
 *   ResponseOf<"/pos/products", "get">         what a 200/201 returns
 *   BodyOf<"/pos/sales", "post">               the JSON body an endpoint takes
 *
 * The web app's `api<T>()` still takes T by hand for most calls; these types
 * let a call site say "whatever the server says this returns" instead, and a
 * backend change then breaks the build rather than the page. */
import type { components, paths } from "./schema";

export type { components, paths } from "./schema";

export type Schema<N extends keyof components["schemas"]> = components["schemas"][N];

type Ok<R> = R extends { 200: infer A } ? A : R extends { 201: infer B } ? B : never;
type Json<C> = C extends { content: { "application/json": infer J } } ? J : undefined;

export type ResponseOf<P extends keyof paths, M extends keyof paths[P]> =
  paths[P][M] extends { responses: infer R } ? Json<Ok<R>> : never;

export type BodyOf<P extends keyof paths, M extends keyof paths[P]> =
  paths[P][M] extends { requestBody?: infer B } ? Json<NonNullable<B>> : never;
