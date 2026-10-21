import { HttpError } from "./db.js";
export const uuid = (value) => {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value || "",
    )
  )
    throw new HttpError(400, "Identificador inválido.");
  return value;
};
export function body(req) {
  if (
    !req.body ||
    typeof req.body !== "object" ||
    Array.isArray(req.body) ||
    JSON.stringify(req.body).length > 20000
  )
    throw new HttpError(400, "Datos inválidos.");
  return req.body;
}
export const query = (req) => new URL(req.url, "http://local").searchParams;
export function endpoint(fn) {
  return async (req, res) => {
    const started = Date.now();
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    try {
      await fn(req, res);
    } catch (e) {
      res
        .status(e.status || 500)
        .json({
          error: e.status
            ? e.message
            : "No se pudo completar la operación. Inténtalo de nuevo.",
        });
    } finally {
      console.info(
        JSON.stringify({
          event: "request",
          path: req.url.split("?")[0],
          method: req.method,
          status: res.statusCode,
          ms: Date.now() - started,
        }),
      );
    }
  };
}
export function method(req, ...allowed) {
  if (!allowed.includes(req.method))
    throw new HttpError(405, "Método no permitido.");
}
