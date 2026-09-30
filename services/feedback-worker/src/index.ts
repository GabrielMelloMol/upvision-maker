import { handle, type Env } from "./handler";

/** Ponto de entrada do Cloudflare Worker. Toda a lógica (e os testes) está em handler.ts. */
export default {
  fetch: (req: Request, env: Env) => handle(req, env),
};
