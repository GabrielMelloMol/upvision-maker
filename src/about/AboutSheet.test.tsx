// @vitest-environment happy-dom
import { act, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import App from "../App";
import { renderWithApp, setupTauri } from "../test/harness";
import { ToastProvider } from "../ui/Toast";
import { systemName } from "./system";
import { trackSave } from "../tools/pendingSaves";
import { FOCUS_RECHECK_MS, RECHECK_MS, useUpdates } from "./useUpdates";

vi.mock("../ui/viewerScene", () => ({ createViewer: () => ({ setModels() {}, dispose() {} }) }));

const t = setupTauri();
const rel = (v: string, body = "") => ({ tag_name: `v${v}`, name: `v${v}`, draft: false, prerelease: false, body, html_url: `https://x/v${v}`, published_at: "2026-10-01T00:00:00Z" });
const UPDATE = { rid: 1, currentVersion: "0.3.0", version: "0.5.0", date: null, body: null, rawJson: {} };
const seenIntro = () => t.db.execute("INSERT INTO secrets (key, value) VALUES ('onboarding_done', '1'), ('last_seen_version', '0.3.0')");
const wrapper = ({ children }: { children: React.ReactNode }) => <ToastProvider>{children}</ToastProvider>;

describe("versão e Sobre", () => {
  test("rodapé mostra a versão; clicar abre Sobre com versão, build e 'Em dia'", async () => {
    await seenIntro();
    const user = userEvent.setup();
    renderWithApp(<App />);
    const v = await screen.findByRole("button", { name: /Versão 0\.3\.0: abrir Sobre/ });
    await user.click(v);
    const sheet = await screen.findByRole("dialog", { name: "Sobre o UpVision Maker" });
    expect(within(sheet).getByText("v0.3.0")).toBeInTheDocument();
    expect(within(sheet).getByText(/Build de/)).toBeInTheDocument();
    expect(await within(sheet).findByText("Em dia: você tem a versão mais recente.")).toBeInTheDocument();
  });

  test("2 versões atrás: selo na barra lateral, contagem, o que está perdendo e 'Atualizar agora'", async () => {
    await seenIntro();
    t.releases = [rel("0.5.0", "- **Backup automático**\n- Sobre com versão"), rel("0.4.0", "- Catálogo de impressoras"), rel("0.3.0"), { ...rel("0.6.0"), draft: true }];
    t.handlers["plugin:updater|check"] = () => UPDATE;
    t.handlers["plugin:updater|download_and_install"] = () => null;
    t.handlers["plugin:process|restart"] = () => null;
    const user = userEvent.setup();
    renderWithApp(<App />);
    const v = await screen.findByRole("button", { name: /atualização disponível: abrir Sobre/ });
    expect(v).toHaveTextContent("Atualização disponível");
    await user.click(v);
    const sheet = await screen.findByRole("dialog", { name: "Sobre o UpVision Maker" });
    expect(within(sheet).getByRole("status")).toHaveTextContent("Você está 2 versões atrás (v0.3.0 → v0.5.0)");
    expect(within(sheet).getByText("Backup automático")).toBeInTheDocument();
    expect(within(sheet).getByText("Catálogo de impressoras")).toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: "Atualizar agora" }));
    await waitFor(() => expect(t.calls).toContain("plugin:process|restart"));
  });

  test("API do GitHub fora do ar: cai no updater e mostra só 'nova versão', sem número", async () => {
    await seenIntro();
    t.releases = null;
    t.handlers["plugin:updater|check"] = () => UPDATE;
    const user = userEvent.setup();
    renderWithApp(<App />);
    await user.click(await screen.findByRole("button", { name: /abrir Sobre/ }));
    expect(await screen.findByText("Nova versão v0.5.0 disponível.", { selector: ".about-status span" })).toBeInTheDocument();
  });

  test("sem internet nas duas fontes: 'Sem internet'; verificar de novo refaz a busca", async () => {
    await seenIntro();
    t.releases = null;
    t.handlers["plugin:updater|check"] = () => {
      throw new Error("offline");
    };
    const user = userEvent.setup();
    renderWithApp(<App />);
    await user.click(await screen.findByRole("button", { name: /abrir Sobre/ }));
    const sheet = await screen.findByRole("dialog", { name: "Sobre o UpVision Maker" });
    expect(await within(sheet).findByText("Sem internet para procurar atualizações.")).toBeInTheDocument();
    t.releases = [rel("0.3.0")];
    t.handlers["plugin:updater|check"] = () => null;
    await user.click(within(sheet).getByRole("button", { name: "Verificar atualizações" }));
    expect(await within(sheet).findByText("Em dia: você tem a versão mais recente.")).toBeInTheDocument();
  });

  test("Copiar informações leva versão, build e sistema", async () => {
    await seenIntro();
    const user = userEvent.setup(); // o user-event instala um clipboard de teste
    renderWithApp(<App />);
    await user.click(await screen.findByRole("button", { name: /abrir Sobre/ }));
    await user.click(await screen.findByRole("button", { name: "Copiar informações" }));
    expect(await screen.findByText(/Informações copiadas/)).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toMatch(/^UpVision Maker v0\.3\.0 \(build \d{4}-\d{2}-\d{2}\)\n/);
  });
});

describe("useUpdates", () => {
  test("verifica sozinho a cada 1 h com o app aberto (#155)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderHook(() => useUpdates(), { wrapper });
    await waitFor(() => expect(t.calls.filter((c) => c === "plugin:updater|check")).toHaveLength(1));
    await act(async () => vi.advanceTimersByTime(RECHECK_MS));
    await waitFor(() => expect(t.calls.filter((c) => c === "plugin:updater|check")).toHaveLength(2));
    vi.useRealTimers();
  });

  test("ao voltar para a janela checa de novo, mas só se passaram 30 min (#155)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const checks = () => t.calls.filter((c) => c === "plugin:updater|check").length;
    renderHook(() => useUpdates(), { wrapper });
    await waitFor(() => expect(checks()).toBe(1));
    await act(async () => void window.dispatchEvent(new Event("focus")));
    expect(checks()).toBe(1); // acabou de checar
    await act(async () => vi.setSystemTime(Date.now() + FOCUS_RECHECK_MS));
    await act(async () => void window.dispatchEvent(new Event("focus")));
    await waitFor(() => expect(checks()).toBe(2));
    vi.useRealTimers();
  });

  test("versão nova com o app em segundo plano: notificação do sistema, uma vez por versão (#155)", async () => {
    localStorage.clear();
    const shown: string[] = [];
    vi.stubGlobal("Notification", class {
      static permission = "granted";
      constructor(title: string, o: { body: string }) {
        shown.push(`${title}: ${o.body}`);
      }
    });
    t.handlers["plugin:notification|is_permission_granted"] = () => true;
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    t.handlers["plugin:updater|check"] = () => UPDATE;
    const { result, unmount } = renderHook(() => useUpdates(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("available"));
    await waitFor(() => expect(shown).toEqual(["UpVision Maker: Nova versão 0.5.0 disponível. Abra o app para ver as novidades e atualizar."]));
    unmount();
    const again = renderHook(() => useUpdates(), { wrapper });
    await waitFor(() => expect(again.result.current.status).toBe("available"));
    expect(shown).toHaveLength(1); // a mesma versão não avisa de novo
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test("atualizar grava os rascunhos pendentes antes de reiniciar (#155)", async () => {
    t.handlers["plugin:updater|check"] = () => UPDATE;
    t.handlers["plugin:updater|download_and_install"] = () => null;
    t.handlers["plugin:process|restart"] = () => null;
    const saved: string[] = [];
    trackSave("tool:keychain", async () => void saved.push("keychain"));
    const { result } = renderHook(() => useUpdates(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("available"));
    await act(() => result.current.install());
    expect(saved).toEqual(["keychain"]);
    expect(t.calls.indexOf("plugin:process|restart")).toBeGreaterThan(-1);
  });

  test("formulário com campo digitado e não salvo: pergunta antes de reiniciar; Esperar não reinicia (M6)", async () => {
    t.handlers["plugin:updater|check"] = () => UPDATE;
    t.handlers["plugin:updater|download_and_install"] = () => null;
    t.handlers["plugin:process|restart"] = () => null;
    const { result } = renderHook(() => useUpdates(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("available"));
    document.body.innerHTML = "<main class='page'><input id='obs'></main>";
    const field = document.getElementById("obs") as HTMLInputElement;
    field.value = "obs do pedido";
    field.dispatchEvent(new Event("input", { bubbles: true }));
    t.askAnswer = false; // "Esperar"
    await act(() => result.current.install());
    expect(t.calls).toContain("plugin:dialog|message");
    expect(t.calls).not.toContain("plugin:process|restart");
    t.askAnswer = true; // "Atualizar mesmo assim"
    await act(() => result.current.install());
    expect(t.calls).toContain("plugin:process|restart");
    document.body.innerHTML = "";
  });

  test("sem nada digitado e sem formulário aberto, atualiza direto, sem perguntar (M6)", async () => {
    t.handlers["plugin:updater|check"] = () => UPDATE;
    t.handlers["plugin:updater|download_and_install"] = () => null;
    t.handlers["plugin:process|restart"] = () => null;
    const { result } = renderHook(() => useUpdates(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("available"));
    await act(() => result.current.install());
    expect(t.calls).not.toContain("plugin:dialog|message");
    expect(t.calls).toContain("plugin:process|restart");
  });

  test("falha ao instalar volta para 'disponível' com a mensagem", async () => {
    t.handlers["plugin:updater|check"] = () => UPDATE;
    t.handlers["plugin:updater|download_and_install"] = () => {
      throw new Error("sem espaço");
    };
    const { result } = renderHook(() => useUpdates(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("available"));
    await act(() => result.current.install());
    expect(result.current.status).toBe("available");
    expect(result.current.error).toBe("Falha ao atualizar: sem espaço");
  });
});

describe("systemName", () => {
  const nav = (ua: string, platformVersion?: string) =>
    ({ userAgent: ua, userAgentData: platformVersion === undefined ? undefined : { getHighEntropyValues: async () => ({ platformVersion }) } }) as unknown as Navigator;
  test.each([
    [nav("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/130", "15.0.0"), "Windows 11"],
    [nav("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/130", "10.0.0"), "Windows 10"],
    [nav("Mozilla/5.0 (Windows NT 10.0; Win64; x64)"), "Windows 10/11"],
    [nav("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit"), "macOS"],
    [nav("Mozilla/5.0 (X11; Linux x86_64)"), "Linux"],
  ])("%#", async (n, name) => {
    expect(await systemName(n)).toBe(name);
  });
});
