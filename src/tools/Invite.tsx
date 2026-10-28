import { join } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { useEffect, useMemo, useState } from "react";
import { estimateModels } from "../domain/estimate";
import { bambuProject } from "../geometry/bambuProject";
import { bedMm } from "../geometry/bed";
import { loadEmojiFont, loadFont, type FontId } from "../geometry/fonts";
import { buildInvite, buildInviteCard, DEFAULT_INVITE, PALETTES, paint, paletteOf, variations, type ButterflyMode, type InviteColors, type InviteInfo, type InviteParams } from "../geometry/invite/build";
import type { CardStyle, CardText } from "../geometry/invite/card";
import type { FlapShape, Hinge } from "../geometry/invite/envelope";
import { DENSITY_LABELS, PATTERN_LABELS, type LaceDensity, type LacePattern } from "../geometry/invite/lace";
import { parseNames } from "../geometry/keychain";
import { getManifold } from "../geometry/manifold";
import { INVITE_CARD_PROFILE, INVITE_LACE_PROFILE, INVITE_PIECES_PROFILE } from "../geometry/printProfile";
import { hasEmoji } from "../geometry/text";
import { write3mf } from "../geometry/threemf";
import type { Model } from "../geometry/types";
import Alert from "../ui/Alert";
import Dropzone from "../ui/Dropzone";
import ExportButtons from "../ui/ExportButtons";
import FontPicker from "../ui/FontPicker";
import LinesField from "../ui/LinesField";
import NumField, { inRange } from "../ui/NumField";
import Preview3D from "../ui/Preview3D";
import { formatDuration } from "../ui/parse";
import { slug } from "../ui/saveFile";
import Segmented from "../ui/Segmented";
import SeeAlso from "../ui/SeeAlso";
import { errorText, useToast } from "../ui/Toast";
import { useModelBuilder } from "../ui/useModelBuilder";
import ColorPick from "./ColorPick";
import { DESIGN_ACCEPT, designFromSvg, fileToCutSvg } from "./designInput";
import { clearHandoff } from "./handoff";
import { INVITE_PRESETS, type InvitePreset } from "./invitePresets";
import { bedWarnings } from "./models/bedCheck";
import ToolSessionBar from "./ToolSessionBar";
import { useToolState } from "./useToolState";

const FLAPS = [["triangle", "Triângulo"], ["round", "Arredondada"]] as const;
const HINGES = [["thin", "Dobradiça fina"], ["tulle", "Só o tule"]] as const;
const BUTTERFLY = [["relief", "Em relevo (colar)"], ["wings", "Asas levantadas"], ["none", "Sem borboleta"]] as const;
const TONES = [["3", "3 tons"], ["2", "2 tons"]] as const;
const STYLES = [["relief", "Em relevo"], ["inlay", "Embutido"]] as const;
const SHOWS = [["table", "Mesa (o que imprime)"], ["open", "Aberto (não imprime)"], ["closed", "Fechado (não imprime)"]] as const;
type Show = (typeof SHOWS)[number][0];
const COLOR_KEYS: [keyof InviteColors, string][] = [
  ["frame", "Moldura e hastes"], ["leaf", "Folhas"], ["flower", "Flores"], ["plate", "Cartão"], ["text", "Texto principal"], ["accent", "Texto de destaque"],
];

type State = {
  p: InviteParams;
  colors: InviteColors;
  text: CardText;
  nameFont: FontId;
  textFont: FontId;
  lace: { svg: string; name: string } | null;
  names: string;
  palettes: string[];
};

const initial = (): State => {
  clearHandoff();
  return { p: structuredClone(DEFAULT_INVITE), colors: { ...PALETTES[0].colors }, text: { name: "Amanda", title: "XV anos", phrase: "Uma noite cheia de glamour,\nbrilho e a minha ilustre presença", date: "06.12.26", place: "Palácio dos Lírios" }, nameFont: "playfair", textFont: "montserrat", lace: null, names: "", palettes: ["rosa", "lilas"] };
};

type View = { envelope: Model; card: Model; pieces: Model[]; open: Model[]; closed: Model[]; info: InviteInfo; pauses: number[] };

const shiftModel = (m: Model, dx: number, dy: number): Model => ({ ...m, parts: m.parts.map((q) => ({ ...q, mesh: { ...q.mesh, positions: q.mesh.positions.map((v, i) => (i % 3 === 0 ? v + dx : i % 3 === 1 ? v + dy : v)) } })) });
const g = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} g`;
const mmText = (n: number) => n.toFixed(1).replace(".", ",");
const TABLE_GAP = 22;

export default function Invite() {
  const tool = useToolState<State>("invite", initial, { label: "Convite envelope" });
  const toast = useToast();
  const s = tool.state;
  const { p } = s;
  const env = p.env;
  const field = tool.field;
  const setEnv = <K extends keyof InviteParams["env"]>(key: K) => (v: InviteParams["env"][K]) => tool.set((cur) => ({ ...cur, p: { ...cur.p, env: { ...cur.p.env, [key]: v } } }), `env.${String(key)}`);
  const setP = <K extends keyof InviteParams>(key: K) => (v: InviteParams[K]) => tool.set((cur) => ({ ...cur, p: { ...cur.p, [key]: v } }), `p.${String(key)}`);
  const setCard = <K extends keyof InviteParams["card"]>(key: K) => (v: InviteParams["card"][K]) => tool.set((cur) => ({ ...cur, p: { ...cur.p, card: { ...cur.p.card, [key]: v } } }), `card.${String(key)}`);
  const setPieces = <K extends keyof InviteParams["pieces"]>(key: K) => (v: InviteParams["pieces"][K]) => tool.set((cur) => ({ ...cur, p: { ...cur.p, pieces: { ...cur.p.pieces, [key]: v } } }), `pieces.${String(key)}`);
  const setText = (key: keyof CardText) => (v: string) => tool.set((cur) => ({ ...cur, text: { ...cur.text, [key]: v } }), `text.${key}`);
  const setColor = (key: keyof InviteColors) => (v: string) => tool.set((cur) => ({ ...cur, colors: { ...cur.colors, [key]: v } }), `color.${key}`);
  const [fileError, setFileError] = useState<string | null>(null);
  const [show, setShow] = useState<Show>("table");
  const [saving, setSaving] = useState(false);
  useEffect(clearHandoff, []);

  const valid =
    inRange(env.w, 70, 200) && inRange(env.h, 50, 160) && inRange(env.frame, 2, 8) && inRange(env.gap, 1, 4) && inRange(env.thickness, 0.8, 2.4) && inRange(env.thicknessNoTulle, 1, 3) &&
    inRange(env.tuleAt, 0.4, Math.max(0.4, env.thickness - 0.4)) && inRange(p.card.plate, 0.8, 3) && inRange(p.card.relief, 0.4, 1.2) && inRange(p.pieces.butterflySpan, 10, 80) && inRange(p.pieces.flowerR, 4, 30);
  const vars = useMemo(() => variations(parseNames(s.names), s.palettes), [s.names, s.palettes]);

  async function loadFonts() {
    const name = await loadFont(s.nameFont);
    const text = await loadFont(s.textFont);
    const emoji = Object.values(s.text).some(hasEmoji) ? await loadEmojiFont() : undefined;
    return { name, text, emoji };
  }
  async function onLace(f: File) {
    setFileError(null);
    try {
      const r = await fileToCutSvg(f, { cutout: false });
      field("lace")({ svg: r.svg, name: f.name });
      setEnv("pattern")("custom");
    } catch (e) {
      setFileError(errorText(e));
    }
  }
  function applyPreset(pr: InvitePreset) {
    tool.set(
      (cur) => ({
        ...cur,
        text: pr.text,
        nameFont: pr.nameFont as FontId,
        textFont: pr.textFont as FontId,
        colors: { ...paletteOf(pr.palette).colors },
        names: pr.names ?? "",
        palettes: pr.palettes ?? cur.palettes,
        p: { ...cur.p, butterfly: pr.butterfly, pieces: { ...cur.p.pieces, flowers: pr.flowers }, env: { ...cur.p.env, pattern: pr.pattern, density: pr.density } },
      }),
      "preset",
    );
  }

  const { models, warnings, view, pauses, busy, error } = useModelBuilder<View>(async () => {
    if (!valid) return null;
    const M = await getManifold();
    const fonts = await loadFonts();
    const lace = p.env.pattern === "custom" && s.lace ? await designFromSvg(s.lace.svg, 100, false) : null;
    try {
      const out = buildInvite(M, p, s.colors, s.text, fonts, lace?.cs ?? null);
      const warn = [...out.warnings];
      if (p.env.pattern === "custom" && !s.lace) warn.push("Envie o SVG da renda para usar o padrão próprio (por enquanto usei as flores e folhas).");
      warn.push(...bedWarnings([out.envelope], warn));
      const cardX = out.info.spread.w / 2 + TABLE_GAP + out.info.card.w / 2;
      const table = [out.envelope, shiftModel(out.cardPreview, cardX, 0), ...out.pieces.map((m) => shiftModel(m, cardX, -(out.info.card.h / 2 + TABLE_GAP)))];
      if (cardX + out.info.card.w / 2 > bedMm() / 2 + out.info.spread.w / 2) warn.push("O envelope aberto e o cartão não cabem juntos na mesa: salve cada um num arquivo (já saem separados).");
      return { models: table, warnings: warn, pauses: out.pauses, view: { envelope: out.envelope, card: out.card, pieces: out.pieces, open: out.open, closed: out.closed, info: out.info, pauses: out.pauses } };
    } finally {
      lace?.cs.delete();
    }
  }, [s, valid]);

  const est = useMemo(
    () => (view ? { envelope: estimateModels([view.envelope], INVITE_LACE_PROFILE), card: estimateModels([view.card], INVITE_CARD_PROFILE), pieces: view.pieces.length ? estimateModels(view.pieces, INVITE_PIECES_PROFILE) : null } : null),
    [view],
  );
  const info = view?.info;
  const shown = show === "open" && view ? view.open : show === "closed" && view ? view.closed : models;

  /** Todas as variações: o envelope e as peças só mudam de cor; o cartão leva o nome. Uma pasta, quatro arquivos por pessoa. */
  async function saveAll() {
    if (!view || !vars.length) return;
    setSaving(true);
    try {
      const dir = await open({ directory: true, multiple: false, title: "Pasta para as variações" });
      if (typeof dir !== "string") return;
      const M = await getManifold();
      const fonts = await loadFonts();
      let noBambu = false;
      for (const v of vars) {
        const colors = v.palette.colors;
        const envelope = paint([view.envelope], colors, p.tones)[0];
        const pieces = paint(view.pieces, colors, p.tones);
        const card = buildInviteCard(M, p, colors, { ...s.text, name: v.name }, fonts).card;
        const base = slug(`${v.name}-${v.palette.id}`);
        await writeFile(await join(dir, `${base}-envelope.3mf`), write3mf([envelope], { pauses: view.pauses, profile: INVITE_LACE_PROFILE }));
        // o projeto do Bambu precisa do Bambu Studio instalado: sem ele, os outros arquivos saem do mesmo jeito
        try {
          await writeFile(await join(dir, `${base}-envelope-bambu.3mf`), await bambuProject([envelope], view.pauses, INVITE_LACE_PROFILE));
        } catch {
          noBambu = true;
        }
        await writeFile(await join(dir, `${base}-cartao.3mf`), write3mf([card], { profile: INVITE_CARD_PROFILE }));
        if (pieces.length) await writeFile(await join(dir, `${base}-pecas.3mf`), write3mf(pieces, { profile: INVITE_PIECES_PROFILE }));
      }
      toast(noBambu ? `${vars.length} convites salvos em ${dir} (envelope, cartão e peças de cada um). Não consegui gerar o projeto do Bambu Studio: ele não está instalado ou não respondeu; no Bambu, abra o envelope pelo botão da tela.` : `${vars.length} convites salvos em ${dir} (envelope, projeto do Bambu, cartão e peças de cada um).`);
      void tool.exported(`variacoes-${vars.length}`);
    } catch (e) {
      toast(`Não foi possível salvar: ${errorText(e)}`, "error");
    } finally {
      setSaving(false);
    }
  }

  const label = slug(s.text.name || "convite");
  const wingsNeedTulle = p.butterfly === "wings" && !env.tulle;

  return (
    <div className="page">
      <h1>Convite envelope</h1>
      <p className="lead">Renda sobre tule, abas de envelope e cartão transparente.</p>
      <SeeAlso items={[{ label: "Imagem em SVG", page: "svg" }, { label: "Carimbo seco", page: "stamp" }]} />
      <ToolSessionBar tool={tool} />
      <div className="tool-layout">
        <div className="controls">
          <div className="card stack">
            <h3>Modelo pronto</h3>
            <div className="row wrap">
              {INVITE_PRESETS.map((pr) => (
                <button key={pr.id} type="button" title={pr.hint} onClick={() => applyPreset(pr)}>
                  {pr.label}
                </button>
              ))}
            </div>
            <span className="hint">Preenche texto, renda, cores e borboleta; depois é só ajustar.</span>
          </div>
          <div className="card stack">
            <h3>Envelope</h3>
            <div className="grid two">
              <NumField label="Largura do corpo" value={env.w} onChange={setEnv("w")} min={70} max={200} step={1} />
              <NumField label="Altura do corpo" value={env.h} onChange={setEnv("h")} min={50} max={160} step={1} />
              <NumField label="Moldura" value={env.frame} onChange={setEnv("frame")} min={2} max={8} step={0.5} />
              <NumField label="Vão da dobra" value={env.gap} onChange={setEnv("gap")} min={1} max={4} step={0.2} />
            </div>
            <span className="field-label">Formato das abas</span>
            <Segmented label="Formato das abas" value={env.flap} options={FLAPS} onChange={(v: FlapShape) => setEnv("flap")(v)} full />
            <span className="field-label">Linha de dobra</span>
            <Segmented label="Linha de dobra" value={env.hinge} options={HINGES} onChange={(v: Hinge) => setEnv("hinge")(v)} full />
            <span className="hint">Fina: uma tira de 0,4 mm nas primeiras camadas faz a dobradiça. Só o tule: as abas ficam separadas e o tecido é a dobra.</span>
            {info && <span className="hint">Aberto, o envelope ocupa {mmText(info.spread.w)} × {mmText(info.spread.h)} mm (cabe na mesa de {bedMm()} mm se for menor que ela).</span>}
          </div>
          <div className="card stack">
            <h3>Renda</h3>
            <label>
              Padrão
              <select value={env.pattern} onChange={(e) => setEnv("pattern")(e.target.value as LacePattern)}>
                {PATTERN_LABELS.map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </label>
            {env.pattern !== "custom" && (
              <>
                <span className="field-label">Densidade da renda</span>
                <Segmented label="Densidade da renda" value={env.density} options={DENSITY_LABELS} onChange={(v: LaceDensity) => setEnv("density")(v)} full />
                <span className="hint">Delicada deixa o tule à mostra; Cheia cobre quase tudo de filigrana, como nas rendas de verdade. Os fios têm 0,5 mm: deixe ligado "Detectar paredes finas".</span>
              </>
            )}
            {env.pattern === "custom" && (
              <Dropzone accept={DESIGN_ACCEPT} label={s.lace ? s.lace.name : "Renda própria: SVG ou imagem"} hint="A renda precisa ter partes ligadas; o app liga as soltas" onFile={onLace} />
            )}
            {fileError && <Alert kind="error">{fileError}</Alert>}
            {env.pattern !== "custom" && (
              <button type="button" className="link" onClick={() => setEnv("seed")(env.seed + 1)}>
                Outra renda do mesmo padrão
              </button>
            )}
            <label className="check">
              <input type="checkbox" checked={env.tulle} onChange={(e) => setEnv("tulle")(e.target.checked)} /> Imprimir sobre tule (o arquivo pausa na camada certa)
            </label>
            {env.tulle ? (
              <div className="grid two">
                <NumField label="Espessura da renda" value={env.thickness} onChange={setEnv("thickness")} min={0.8} max={2.4} step={0.2} />
                <NumField label="Altura em que o tule entra" value={env.tuleAt} onChange={setEnv("tuleAt")} min={0.4} max={Math.max(0.4, env.thickness - 0.4)} step={0.2} hint="Camadas de baixo, antes da pausa" />
              </div>
            ) : (
              <NumField label="Espessura da renda (sem tule)" value={env.thicknessNoTulle} onChange={setEnv("thicknessNoTulle")} min={1} max={3} step={0.2} hint="Mais grossa: tudo fica ligado à moldura" />
            )}
          </div>
          <div className="card stack">
            <h3>Cores</h3>
            <div className="row wrap">
              {PALETTES.map((pl) => (
                <button key={pl.id} type="button" onClick={() => tool.set((cur) => ({ ...cur, colors: { ...pl.colors } }), "palette")}>
                  {pl.label}
                </button>
              ))}
            </div>
            <Segmented label="Tons da renda" value={String(p.tones)} options={TONES} onChange={(v) => setP("tones")(v === "2" ? 2 : 3)} full />
            <div className="row wrap">
              {COLOR_KEYS.map(([key, l]) => (
                <ColorPick key={key} label={l} value={s.colors[key]} onChange={setColor(key)} />
              ))}
            </div>
            <span className="hint">Com 2 tons as flores usam a cor das folhas. Na impressão, multicor (AMS) ou troca de filamento na pausa do tule.</span>
          </div>
          <div className="card stack">
            <h3>Borboleta e flores</h3>
            <Segmented label="Borboleta" value={p.butterfly} options={BUTTERFLY} onChange={(v: ButterflyMode) => setP("butterfly")(v)} full />
            {wingsNeedTulle && <Alert kind="warn">Asas levantadas precisam do tule (as asas soltas ficam presas nele): vou usar a borboleta em relevo.</Alert>}
            {p.butterfly === "wings" && env.tulle && <NumField label="Abertura das asas" value={env.wingSpan} onChange={setEnv("wingSpan")} min={16} max={60} step={2} />}
            {p.butterfly === "relief" && (
              <div className="grid two">
                <NumField label="Borboletas" value={p.pieces.butterflies} onChange={setPieces("butterflies")} min={0} max={4} step={1} />
                <NumField label="Abertura da borboleta" value={p.pieces.butterflySpan} onChange={setPieces("butterflySpan")} min={16} max={80} step={2} />
              </div>
            )}
            <div className="grid two">
              <NumField label="Flores em relevo" value={p.pieces.flowers} onChange={setPieces("flowers")} min={0} max={6} step={1} />
              <NumField label="Tamanho da flor" value={p.pieces.flowerR} onChange={setPieces("flowerR")} min={5} max={24} step={1} unit="mm (raio)" />
            </div>
            <span className="hint">As peças em relevo saem num arquivo à parte, para colar. As asas levantadas saem planas no próprio envelope, sobre o tule, para dobrar.</span>
          </div>
          <div className="card stack">
            <h3>Cartão transparente</h3>
            <label>
              Nome
              <input value={s.text.name} maxLength={40} onChange={(e) => setText("name")(e.target.value)} />
            </label>
            <FontPicker value={s.nameFont} onChange={field("nameFont")} sample={s.text.name} label="Fonte do nome" />
            <label>
              Título (XV anos, casamento, batizado…)
              <input value={s.text.title} maxLength={40} onChange={(e) => setText("title")(e.target.value)} />
            </label>
            <LinesField label="Frase (Enter para nova linha)" value={s.text.phrase} onChange={setText("phrase")} rows={3} maxLength={120} />
            <div className="grid two">
              <label>
                Data
                <input value={s.text.date} maxLength={24} onChange={(e) => setText("date")(e.target.value)} />
              </label>
              <label>
                Local
                <input value={s.text.place} maxLength={48} onChange={(e) => setText("place")(e.target.value)} />
              </label>
            </div>
            <FontPicker value={s.textFont} onChange={field("textFont")} sample={s.text.title} label="Fonte do resto do texto" />
            <Segmented label="Texto no cartão" value={p.card.style} options={STYLES} onChange={(v: CardStyle) => setCard("style")(v)} full />
            <label className="check">
              <input type="checkbox" checked={p.card.caps} onChange={(e) => setCard("caps")(e.target.checked)} /> Nome, título e local em maiúsculas
            </label>
            {info && <span className="hint">O cartão sai com {mmText(info.card.w)} × {mmText(info.card.h)} mm: cabe dentro da moldura com 1 mm de folga.</span>}
          </div>
          <div className="card stack">
            <h3>Variações para as damas</h3>
            <label>
              Nomes (um por linha)
              <textarea value={s.names} rows={3} onChange={(e) => field("names")(e.target.value)} />
            </label>
            <span className="field-label">Paletas (repetem na ordem dos nomes)</span>
            <div className="row wrap">
              {PALETTES.map((pl) => {
                const on = s.palettes.includes(pl.id);
                return (
                  <label key={pl.id} className="check">
                    <input type="checkbox" checked={on} onChange={() => field("palettes")(on ? s.palettes.filter((x) => x !== pl.id) : [...s.palettes, pl.id])} /> {pl.label}
                  </label>
                );
              })}
            </div>
            {vars.length > 0 && (
              <ul className="plain" aria-label="Variações">
                {vars.map((v, i) => (
                  <li key={`${v.name}-${i}`}>{v.name}: {v.palette.label}</li>
                ))}
              </ul>
            )}
            <button type="button" className="action" disabled={!view || busy || saving || vars.length === 0} onClick={saveAll}>
              {saving ? "Salvando…" : `Salvar as ${vars.length || ""} variações`.replace("  ", " ")}
            </button>
            <span className="hint">Cada pessoa leva um envelope (3MF com a pausa e projeto do Bambu), o cartão com o nome e as peças. Só mudam as cores e o nome.</span>
          </div>
          <div className="card stack">
            <h3>Envelope (PLA{env.tulle ? ", com pausa do tule" : ""})</h3>
            <ExportButtons models={view ? [view.envelope] : []} name={`convite-envelope-${label}`} busy={busy} pauses={pauses} profile={INVITE_LACE_PROFILE} onSaved={tool.exported} />
          </div>
          <div className="card stack">
            <h3>Cartão (PETG transparente)</h3>
            <ExportButtons models={view ? [view.card] : []} name={`convite-cartao-${label}`} busy={busy} profile={INVITE_CARD_PROFILE} onSaved={tool.exported} />
          </div>
          {(view?.pieces.length ?? 0) > 0 && (
            <div className="card stack">
              <h3>Borboleta e flores (para colar)</h3>
              <ExportButtons models={view?.pieces ?? []} name={`convite-pecas-${label}`} busy={busy} profile={INVITE_PIECES_PROFILE} onSaved={tool.exported} />
            </div>
          )}
        </div>
        <div className="preview-col">
          <Segmented label="O que mostrar" value={show} options={SHOWS} onChange={setShow} full />
          <Preview3D models={shown} busy={busy} busyText="Gerando envelope, renda e cartão…" error={error} emptyText={!valid ? "Corrija os campos em vermelho para ver o convite." : "Escolha um modelo pronto para ver o convite."} />
          {show !== "table" && <Alert kind="info">{show === "open" ? "Prévia do envelope com as abas quase planas e o cartão saindo um pouco. O cartão aparece em vidro escuro para o texto branco dar para ler." : "Prévia do envelope fechado, com as abas dobradas sobre o cartão e as peças em relevo coladas. Não vai para o arquivo: o que imprime está em Mesa."}</Alert>}
          {warnings.map((w) => (
            <Alert key={w} kind="warn">{w}</Alert>
          ))}
          {info && (
            <section className="card stack" aria-label="Resumo do convite">
              <h3>{env.tulle ? "A pausa do tule" : "Sem tule"}</h3>
              {info.tuleLayer !== null && info.tuleZ !== null && info.pauseZ !== null ? (
                <p>
                  O arquivo pausa depois da camada <strong>{info.tuleLayer}</strong> (Z = {mmText(info.tuleZ)} mm): <strong>coloque o tule agora</strong>. A renda tem {mmText(info.height)} mm no total; a parte de cima prende o tecido.
                </p>
              ) : (
                <p>Renda de {mmText(info.height)} mm, sem pausa: imprima direto. {info.bridged > 0 ? `${info.bridged} pedaço(s) solto(s) foram ligados à moldura.` : "Tudo já está ligado à moldura."}</p>
              )}
              <h3>Peso e tempo de cada peça</h3>
              <ul className="plain">
                <li>Envelope: {est?.envelope ? `≈ ${g(est.envelope.grams)} · ≈ ${formatDuration(est.envelope.seconds / 60)}` : "—"}</li>
                <li>Cartão: {est?.card ? `≈ ${g(est.card.grams)} · ≈ ${formatDuration(est.card.seconds / 60)}` : "—"}</li>
                {est?.pieces && <li>Borboleta e flores: ≈ {g(est.pieces.grams)} · ≈ {formatDuration(est.pieces.seconds / 60)}</li>}
              </ul>
            </section>
          )}
          <section className="card stack" aria-label="Passo a passo no tule">
            <h3>{env.tulle ? "Passo a passo no tule" : "Passo a passo sem tule"}</h3>
            {env.tulle ? (
              <ol>
                <li>Compre tule fino (nylon ou poliéster, o "tule ilusão"), claro ou transparente. Corte um pedaço uns 3 cm maior que o envelope aberto ({info ? `${mmText(info.spread.w)} × ${mmText(info.spread.h)} mm` : "a cruz inteira"}).</li>
                <li>Limpe a mesa e imprima o envelope em PLA (bico 0,4; mesa a 55 °C; bico a 210 °C). O arquivo já traz a pausa{info?.tuleLayer ? ` depois da camada ${info.tuleLayer}` : ""}.</li>
                <li>Na pausa, estique o tule por cima da impressão, sem rugas, e prenda as pontas na mesa com fita, fora da área da renda. Alise com a mão e retome.</li>
                <li>As camadas de cima caem sobre o tule e o prendem entre a renda de baixo e a de cima. Se o bico enroscar no tecido, ligue a elevação nas viagens (Z hop de 0,4 mm).</li>
                <li>Tire da mesa, corte o tule que sobrou rente à moldura e dobre as abas pela linha de dobra.</li>
                <li>Cole a borboleta e as flores em relevo com cola instantânea em gel. Coloque o cartão dentro do envelope.</li>
              </ol>
            ) : (
              <ol>
                <li>Imprima o envelope em PLA, direto, sem pausa e sem tule: a renda mais grossa já fica inteira.</li>
                <li>Dobre as abas pela linha de dobra (a dobradiça fina de 0,4 mm aguenta poucas dobras em PLA: dobre devagar).</li>
                <li>Cole a borboleta e as flores em relevo com cola instantânea em gel. Coloque o cartão dentro do envelope.</li>
              </ol>
            )}
            <span className="hint">Temperaturas e tempos são de referência: teste primeiro com um pedaço de tule de sobra.</span>
          </section>
        </div>
      </div>
    </div>
  );
}
