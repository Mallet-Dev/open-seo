import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../../src/db/d1/schema.ts";
import { count } from "./trace.ts";
const original = env.DB;
const unwrapped = new WeakMap<D1PreparedStatement, D1PreparedStatement>();
function statement(raw: D1PreparedStatement, sql: string): D1PreparedStatement {
  const wrapped = new Proxy(raw, {
    get(target, key) {
      const value: unknown = Reflect.get(target, key, target);
      if (key === "bind")
        return (...args: unknown[]) => statement(target.bind(...args), sql);
      if (
        ["all", "run", "raw", "first"].includes(String(key)) &&
        typeof value === "function"
      )
        return (...args: unknown[]) => {
          count(String(key), sql);
          const result: unknown = Reflect.apply(value, target, args);
          return result;
        };
      if (typeof value === "function")
        return () => {
          throw Error("Uncounted D1 statement method " + String(key));
        };
      return value;
    },
  });
  unwrapped.set(wrapped, raw);
  return wrapped;
}
const database = new Proxy(original, {
  get(target, key) {
    if (key === "prepare")
      return (sql: string) => statement(target.prepare(sql), sql);
    if (key === "batch")
      return (items: D1PreparedStatement[]) => {
        count("batch", "", items.length);
        return target.batch(items.map((item) => unwrapped.get(item) ?? item));
      };
    const value: unknown = Reflect.get(target, key, target);
    if (typeof value === "function")
      return () => {
        throw Error("Uncounted D1 database method " + String(key));
      };
    return value;
  },
});
export const d1Db = drizzle(database, { schema });
