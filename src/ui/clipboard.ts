/** Área de transferência do celular: guarda o último texto copiado e tenta usar a do navegador também. */
let memory = '';

export async function copyText(text: string): Promise<void> {
  memory = text;
  try { await navigator.clipboard?.writeText(text); } catch { /* sem permissão: ainda vale a cópia interna */ }
}

export async function pasteText(): Promise<string> {
  try {
    const t = await navigator.clipboard?.readText();
    if (t) return t;
  } catch { /* sem permissão */ }
  return memory;
}
