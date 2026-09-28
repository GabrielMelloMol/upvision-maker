/** Sistema para a tela Sobre e o "Copiar informações" (sem dados pessoais). */
type UAData = { getHighEntropyValues?: (hints: string[]) => Promise<{ platform?: string; platformVersion?: string }> };

export async function systemName(nav: Navigator = navigator): Promise<string> {
  const ua = nav.userAgent;
  if (/Windows NT 10/.test(ua)) {
    // O user agent diz "Windows NT 10.0" nos dois; o WebView2 informa a versão real da plataforma (13+ = Windows 11).
    const data = (nav as Navigator & { userAgentData?: UAData }).userAgentData;
    const v = await data?.getHighEntropyValues?.(["platformVersion"]).catch(() => undefined);
    if (!v?.platformVersion) return "Windows 10/11";
    return Number(v.platformVersion.split(".")[0]) >= 13 ? "Windows 11" : "Windows 10";
  }
  if (/Windows/.test(ua)) return "Windows";
  if (/Mac OS X/.test(ua)) return "macOS";
  if (/Linux/.test(ua)) return "Linux";
  return "Sistema desconhecido";
}
