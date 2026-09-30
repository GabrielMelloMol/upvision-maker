/** Trocar de tela a partir de um componente sem o `go` da página (ex.: botões dentro de ExportButtons, #99). O App escuta. */
export const NAVIGATE_EVENT = "upvision:navigate";
export const requestNavigate = (pageId: string) => window.dispatchEvent(new CustomEvent<string>(NAVIGATE_EVENT, { detail: pageId }));
