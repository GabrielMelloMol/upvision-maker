// @vitest-environment happy-dom
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import SuggestDialog from "../feedback/SuggestDialog";
import { renderWithApp, setupTauri } from "../test/harness";
import { useToast } from "../ui/Toast";
import DiagnosticsBlock from "./DiagnosticsBlock";
import { installErrorLogging, logError } from "./log";
import { fullReport, REPORT_LOG_CHARS, shortReport } from "./report";

const t = setupTauri();
const opened = () => {
  const urls: string[] = [];
  t.handlers["plugin:opener|open_url"] = (a) => void urls.push(String(a.url));
  return urls;
};

describe("registro de diagnóstico", () => {
  test("logError grava a linha sanitizada no registro do Rust", async () => {
    logError("teste", new Error("falhou para ana@x.com"));
    await waitFor(() => expect(t.log).toHaveLength(1));
    expect(t.log[0]).toMatch(/\[error\] teste: Error: falhou para <e-mail>/);
  });

  test("toast de erro também vai para o registro (é o que ela viu)", async () => {
    function Boom() {
      const toast = useToast();
      return <button onClick={() => toast("Não foi possível salvar: disco cheio", "error")}>boom</button>;
    }
    const user = userEvent.setup();
    renderWithApp(<Boom />);
    await user.click(screen.getByRole("button", { name: "boom" }));
    await waitFor(() => expect(t.log.some((l) => l.includes("[error] aviso: Não foi possível salvar: disco cheio"))).toBe(true));
  });

  test("erros não tratados e promessas rejeitadas são capturados", async () => {
    installErrorLogging(window);
    act(() => {
      window.dispatchEvent(new ErrorEvent("error", { error: new TypeError("x is undefined"), message: "x is undefined" }));
      const ev = new Event("unhandledrejection") as Event & { reason?: unknown };
      ev.reason = new Error("rede caiu");
      window.dispatchEvent(ev);
    });
    await waitFor(() => expect(t.log.join("\n")).toMatch(/janela: TypeError: x is undefined[\s\S]*promessa: Error: rede caiu/));
  });
});

describe("relatório", () => {
  const info = { version: "0.4.0", build: "2026-09-28", system: "Windows 11", log: "" };
  test("curto: descrição, versão/sistema e as últimas linhas, cortando do começo", () => {
    const log = Array.from({ length: 100 }, (_, i) => `2026-09-28T10:00:${String(i).padStart(2, "0")}Z [error] x: erro ${i}`).join("\n");
    const r = shortReport({ ...info, log, what: "O PDF não abre" });
    expect(r.startsWith("O PDF não abre\n\nUpVision Maker v0.4.0 (build 2026-09-28) · Windows 11")).toBe(true);
    expect(r).toContain("erro 99");
    expect(r).not.toContain("erro 10\n");
    expect(r.length).toBeLessThan(REPORT_LOG_CHARS + 200);
  });
  test("sem erros registrados diz isso", () => {
    expect(shortReport(info)).toContain("(nenhum erro registrado)");
    expect(fullReport(info)).toMatch(/^UpVision Maker v0\.4\.0 \(build 2026-09-28\) · Windows 11\nGerado em /);
  });
});

describe("DiagnosticsBlock", () => {
  test("Enviar diagnóstico abre o link com os últimos erros (sem dados pessoais)", async () => {
    const urls = opened();
    logError("backup", new Error("C:\\Users\\Ana\\OneDrive sem permissão"));
    await waitFor(() => expect(t.log).toHaveLength(1));
    const user = userEvent.setup();
    renderWithApp(<DiagnosticsBlock what="Backup não salva" />);
    await user.click(screen.getByRole("button", { name: "Enviar diagnóstico" }));
    await waitFor(() => expect(urls).toHaveLength(1));
    const u = new URL(urls[0]);
    expect(u.searchParams.get("title")).toBe("Diagnóstico: Backup não salva");
    expect(u.searchParams.get("labels")).toBe("diagnóstico");
    const body = u.searchParams.get("body")!;
    expect(body).toContain("Backup não salva");
    expect(body).toContain("C:\\Users\\<usuário>\\OneDrive sem permissão");
    expect(body).not.toContain("Ana");
  });

  test("Salvar registro completo grava o .txt", async () => {
    logError("x", "algo");
    await waitFor(() => expect(t.log).toHaveLength(1));
    const user = userEvent.setup();
    renderWithApp(<DiagnosticsBlock />);
    await user.click(screen.getByRole("button", { name: /Salvar registro completo/ }));
    await waitFor(() => expect([...t.files.keys()].some((p) => /upvision-diagnostico-\d{4}-\d{2}-\d{2}\.txt$/.test(p))).toBe(true));
    const txt = new TextDecoder().decode([...t.files.values()][0]);
    expect(txt).toMatch(/^UpVision Maker v0\.3\.0/);
    expect(txt).toContain("[error] x: algo");
  });

  test("falha ao abrir o link vira aviso", async () => {
    t.handlers["plugin:opener|open_url"] = () => {
      throw new Error("sem navegador");
    };
    const user = userEvent.setup();
    renderWithApp(<DiagnosticsBlock />);
    await user.click(screen.getByRole("button", { name: "Enviar diagnóstico" }));
    expect(await screen.findByText(/Não consegui abrir o diagnóstico: sem navegador/)).toBeInTheDocument();
  });

  test("aparece dentro de Sugerir ferramenta e usa o título digitado", async () => {
    const urls = opened();
    const user = userEvent.setup();
    renderWithApp(<SuggestDialog onClose={() => {}} />);
    await user.type(screen.getByLabelText("O que você queria que o app fizesse?"), "Travou ao salvar PDF");
    await user.click(screen.getByRole("button", { name: "Enviar diagnóstico" }));
    await waitFor(() => expect(urls).toHaveLength(1));
    expect(new URL(urls[0]).searchParams.get("title")).toBe("Diagnóstico: Travou ao salvar PDF");
  });
});
