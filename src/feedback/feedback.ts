export type Feedback = { title: string; description: string; imageName: string | null; appVersion: string; platform: string; kind?: "Sugestão" | "Diagnóstico" };

export const MAX_DESCRIPTION = 1500; // links mailto muito longos são cortados por alguns clientes de e-mail
const REPO_ISSUES = "https://github.com/GabrielMelloMol/upvision-maker/issues/new";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function body(f: Feedback): string {
  const lines = [f.description.trim().slice(0, MAX_DESCRIPTION), "", `Versão: ${f.appVersion} (${f.platform})`];
  if (f.imageName) lines.push("", `Anexe a imagem ${f.imageName} antes de enviar.`);
  return lines.join("\n");
}

/** Link para enviar a sugestão: e-mail pré-preenchido (se configurado no build) ou issue no GitHub. */
export function feedbackUrl(f: Feedback, email: string | undefined): string {
  const title = f.title.trim();
  if (email && EMAIL.test(email)) {
    const q = `subject=${encodeURIComponent(`[UpVision Maker] ${f.kind ?? "Sugestão"}: ${title}`)}&body=${encodeURIComponent(body(f))}`;
    return `mailto:${email}?${q}`;
  }
  const u = new URL(REPO_ISSUES);
  u.searchParams.set("title", `${f.kind ?? "Sugestão"}: ${title}`);
  u.searchParams.set("body", body(f));
  u.searchParams.set("labels", f.kind === "Diagnóstico" ? "diagnóstico" : "sugestão");
  return u.toString();
}
