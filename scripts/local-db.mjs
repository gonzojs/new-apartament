import { setDevelopmentDatabase } from "../lib/db.js";
// Isolated PostgreSQL engine for development/tests, never imported on Vercel.
import { PGlite } from "@electric-sql/pglite";
import { readFile, mkdir } from "node:fs/promises";
let connection;
export async function localConnection() {
  if (!connection) {
    connection = (async () => {
      const path = process.env.LOCAL_DATABASE_PATH || "memory://";
      if (path !== "memory://") await mkdir(path, { recursive: true });
      const pg = new PGlite(path);
      await pg.exec(
        (
          await readFile(
            new URL("../supabase/schema.sql", import.meta.url),
            "utf8",
          )
        ).replace("create extension if not exists pgcrypto;", ""),
      );
      return pg;
    })();
  }
  return connection;
}
const tables = new Set([
  "products",
  "comments",
  "price_history",
  "admin_sessions",
  "rate_limits",
  "leases",
  "search_cache",
  "import_candidates",
  "store_health",
]);
const identifier = (s) => {
  if (!/^[a-z_]+$/.test(s)) throw new Error("Invalid SQL identifier");
  return `"${s}"`;
};
export async function localDb(
  path,
  { method = "GET", body, prefer = "return=representation" } = {},
) {
  const pg = await localConnection();
  const u = new URL(path, "http://local/");
  if (u.pathname.startsWith("/rpc/")) {
    const name = u.pathname.slice(5);
    if (
      !["take_rate", "acquire_lease", "save_product", "capture_price"].includes(
        name,
      )
    )
      throw new Error("Unknown function");
    const args = Object.entries(body);
    const values = args.map(([, v]) =>
      typeof v === "object" && v !== null ? JSON.stringify(v) : v,
    );
    const result = await pg.query(
      `select ${identifier(name)}(${args.map(([k], i) => `${identifier(k)} => $${i + 1}`).join(",")}) as value`,
      values,
    );
    return result.rows[0].value;
  }
  const table = u.pathname.slice(1);
  if (!tables.has(table)) throw new Error("Unknown table");
  const params = [],
    conditions = [];
  const bind = (v) => {
    params.push(v);
    return `$${params.length}`;
  };
  function condition(key, value) {
    const dot = value.indexOf("."),
      op = value.slice(0, dot),
      v = value.slice(dot + 1),
      field = identifier(key);
    if (op === "is" && v === "null") return `${field} is null`;
    if (op === "in")
      return `${field} in (${v.slice(1, -1).split(",").map(bind).join(",")})`;
    const operators = { eq: "=", neq: "<>", lt: "<", gt: ">" };
    if (!operators[op]) throw new Error("Unsupported filter");
    return `${field}${operators[op]}${bind(v)}`;
  }
  for (const [k, v] of u.searchParams) {
    if (["select", "limit", "order", "on_conflict"].includes(k)) continue;
    if (k === "or") {
      conditions.push(
        "(" +
          v
            .slice(1, -1)
            .split(",")
            .map((s) => {
              const d = s.indexOf(".");
              return condition(s.slice(0, d), s.slice(d + 1));
            })
            .join(" or ") +
          ")",
      );
    } else conditions.push(condition(k, v));
  }
  const where = conditions.length ? " where " + conditions.join(" and ") : "";
  if (method === "GET") {
    const fields = (u.searchParams.get("select") || "*")
      .split(",")
      .map((s) => (s === "*" ? "*" : identifier(s)))
      .join(",");
    let sql = `select ${fields} from ${identifier(table)}${where}`;
    if (u.searchParams.has("order")) {
      sql +=
        " order by " +
        u.searchParams
          .get("order")
          .split(",")
          .map((s) => {
            const [field, dir, nulls] = s.split(".");
            return `${identifier(field)} ${dir === "desc" ? "desc" : "asc"} ${nulls === "nullsfirst" ? "nulls first" : nulls === "nullslast" ? "nulls last" : ""}`;
          })
          .join(",");
    }
    sql += ` limit ${Math.min(2000, Number(u.searchParams.get("limit") || 1000))}`;
    return (await pg.query(sql, params)).rows;
  }
  if (method === "PATCH") {
    const assignments = Object.entries(body).map(
      ([key, value]) => `${identifier(key)}=${bind(value)}`,
    );
    return (
      await pg.query(
        `update ${identifier(table)} set ${assignments.join(",")}${where} returning *`,
        params,
      )
    ).rows;
  }
  if (method === "DELETE")
    return (
      await pg.query(
        `delete from ${identifier(table)}${where} returning *`,
        params,
      )
    ).rows;
  if (method === "POST") {
    const rows = Array.isArray(body) ? body : [body];
    let output = [];
    for (const row of rows) {
      const keys = Object.keys(row),
        values = Object.values(row).map((v) =>
          v && typeof v === "object" ? JSON.stringify(v) : v,
        );
      let sql = `insert into ${identifier(table)} (${keys.map(identifier).join(",")}) values (${keys.map((_, i) => "$" + (i + 1)).join(",")})`;
      const conflict = u.searchParams.get("on_conflict");
      if (conflict) {
        sql += ` on conflict (${identifier(conflict)}) `;
        sql += prefer.includes("merge-duplicates")
          ? "do update set " +
            keys
              .filter((k) => k !== conflict)
              .map((k) => `${identifier(k)}=excluded.${identifier(k)}`)
              .join(",")
          : "do nothing";
      }
      output.push(...(await pg.query(sql + " returning *", values)).rows);
    }
    return output;
  }
  throw new Error("Unsupported local method");
}

setDevelopmentDatabase(localDb);
