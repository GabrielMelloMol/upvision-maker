// Passo do release.yml: acrescenta ao CSP o host exato do Worker de sugestões (B28). Uso: FEEDBACK_URL=... node scripts/csp-host.ts
import { readFileSync, writeFileSync } from "node:fs";
import { cspWithFeedback } from "../src/qa/cspHost.ts";

const path = "src-tauri/tauri.conf.json";
const conf = JSON.parse(readFileSync(path, "utf8"));
conf.app.security.csp = cspWithFeedback(conf.app.security.csp, process.env.FEEDBACK_URL ?? "");
writeFileSync(path, `${JSON.stringify(conf, null, 2)}\n`);
console.log(`CSP: ${conf.app.security.csp.match(/connect-src[^;]*/)?.[0]}`);
