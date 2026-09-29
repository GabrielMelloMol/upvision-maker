import { Smile } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";

/** Emojis comuns em brindes (um caractere só, todos na Noto Emoji). */
export const EMOJIS = [..."❤💖💕💙💚💛💜🖤⭐🌟✨🔥🌈☀🌙⚡🌸🌹🌻🌷🍀🌵🍎🍓🍕🎂🍰🍩☕🎈🎉🎁🎀🏆⚽🏀🎾🎮🎵🎸📚✏🎓💼🏠🚗✈⚓🐶🐱🐰🐻🐼🦊🦄🐝🦋🐟🐾😀😂😍😎🥰😉👍👑💎"];

type Props = { inputRef: RefObject<HTMLInputElement | HTMLTextAreaElement | null>; value: string; onChange: (v: string) => void };

/** Botão que abre uma grade de emojis e insere o escolhido no cursor do campo (o foco volta para o campo). */
export default function EmojiPicker({ inputRef, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!pop.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
      btn.current?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey, true);
    pop.current?.querySelector("button")?.focus();
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  function insert(emoji: string) {
    const el = inputRef.current;
    const start = el?.selectionStart ?? value.length, end = el?.selectionEnd ?? value.length;
    const max = el && el.maxLength > 0 ? el.maxLength : Infinity;
    const next = value.slice(0, start) + emoji + value.slice(end);
    if (next.length > max) return;
    onChange(next);
    const at = start + emoji.length;
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at, at);
    });
  }

  return (
    <span className="emoji-picker">
      <button ref={btn} type="button" className="ghost icon-only" aria-label="Inserir emoji" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Smile size={18} aria-hidden />
      </button>
      {open && (
        <div ref={pop} className="emoji-pop" role="dialog" aria-label="Emojis">
          {EMOJIS.map((em) => (
            <button key={em} type="button" className="ghost" aria-label={`Emoji ${em}`} onClick={() => insert(em)}>
              {em}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
