import { invoke } from "@tauri-apps/api/core";

export type WindowStyle = { effect: "mica" | "sidebar" | "none"; overlayTitlebar: boolean };
const OPAQUE: WindowStyle = { effect: "none", overlayTitlebar: false };

/**
 * Pergunta ao Rust qual material nativo foi aplicado e marca o <html>:
 * data-vibrancy="mica|sidebar" deixa a janela transparente atrás da sidebar; sem atributo = fundos opacos (Windows 10, erro, navegador).
 */
export async function applyWindowStyle(root: HTMLElement = document.documentElement): Promise<WindowStyle> {
  const style = await invoke<WindowStyle>("window_style").catch(() => OPAQUE);
  if (style.effect !== "none") root.dataset.vibrancy = style.effect;
  if (style.overlayTitlebar) root.dataset.titlebar = "overlay";
  return style;
}
