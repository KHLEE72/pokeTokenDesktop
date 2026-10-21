import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { version } from '../../../package.json';
import { Snapshot, Settings, POKEMON, DisplayChoice, PetMotion, PetInputTrace, EGG_TYPES, FAMILIES, EggType, GameAction, GameState, Companion } from '../../shared/model';
import { activePet, appearanceId, appearancePhase, candyCount, CANDY_XP, dexChoices, discoveredSpecies, evolutionOptions, finalPhase, isGrowing, speciesId, threshold, waitingForEvolution } from '../../shared/game';
import { usePetDialogue } from './pet-dialogue';
import { HomeHonors, LeagueCollection } from './league-ui';
import { UpdateSettings, UpdateHint } from './updates-ui';
import { PixelIcon, PixelIconKind } from './pixel-icons';
import { ACHIEVEMENTS, BallId, ballInfo, ballUnlocked, themeInfo } from '../../shared/rewards';
import { BallIcon } from './balls';
import { Achievements, BallPicker, ThemePicker } from './rewards-ui';
import './style.css';
import './theme.css';
import './appearance.css';
import './rewards.css';
import './i18n.css';
import './dex.css';
import './forms.css';
import { FORM_BY_ID, FORMS, GENERATIONS } from '../../shared/catalog';
import { appearanceCollection } from '../../shared/mega';
import { Egg, Sprite } from './sprites';
import { FormCollection, MegaPicker } from './forms-ui';
import { RARITIES, Rarity, speciesRarity } from '../../shared/rarity';
import { RarityBadge } from './rarity-badge';
import { DexSort, sortDex } from '../../shared/dex';
import { EvolutionHistory } from './evolution-history';
import { LANGUAGES, Language, ballName, eggName as localizedEggName, localeFor, localizeMessage, pokemonMatches, pokemonName, themeName, typeName } from '../../shared/i18n';
import { LanguageContext, SnapshotContext, useI18n, useSnapshot } from './i18n';

const names = { claude: 'Claude Code', codex: 'Codex' };
const labels = ['부화', '첫 번째 진화', '최종 진화', '성장 완료'];
const DEX_PAGE_SIZE = 9;
type DexStatus = 'all' | 'discovered' | 'undiscovered' | 'growing' | 'complete' | 'active';
const dexStatuses: {value: DexStatus;label: string;}[] = [
{ value: 'all', label: '모든 상태' }, { value: 'discovered', label: '발견' },
{ value: 'undiscovered', label: '미발견' }, { value: 'growing', label: '성장 중' },
{ value: 'complete', label: '진화 완료' }, { value: 'active', label: '함께하는 중' }];

const growingAppearance = (pet: Companion, phase: number): boolean => pet.phase === phase && pet.phase < finalPhase(pet);
const normalizeSearch = (value: string): string => value.normalize('NFKC').replace(/\s/g, '').toLowerCase();
const eggName = (egg: Companion, language: Language): string => localizedEggName(egg.eggType, language);
const eggProgress = (egg: Companion, pace: Settings['pace']): number => Math.min(100, Math.max(0, egg.xp / threshold(0, pace) * 100));
function useLiveSnapshot(): Snapshot | null {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  useEffect(() => {const unsubscribe = window.desktop.onSnapshot(setSnapshot);void window.desktop.getSnapshot().then(setSnapshot);return unsubscribe;}, []);
  return snapshot;
}
function Pet(): React.JSX.Element | null {const { language, t } = useI18n();
  const snapshot = useSnapshot();
  const [motion, setMotion] = useState<PetMotion>({ direction: 1, state: 'idle', tilt: 0, impact: 0 });
  const { speech, greet } = usePetDialogue(snapshot, motion);
  const [reaction, setReaction] = useState(0);
  const [transition, setTransition] = useState<'summon' | 'recall' | null>(null);
  const previousBallMode = useRef<boolean | null>(null);
  useEffect(() => {
    if (!snapshot) return;
    const inBall = Boolean(snapshot.settings.inBall);
    const previous = previousBallMode.current;
    previousBallMode.current = inBall;
    if (previous === null || previous === inBall) return;
    setTransition(inBall ? 'recall' : 'summon');
    const timer = setTimeout(() => setTransition(null), 650);
    return () => clearTimeout(timer);
  }, [snapshot?.settings.inBall]);
  const down = useRef<{pointerId: number;target: HTMLDivElement;} | null>(null);
  const motionRef = useRef(motion);motionRef.current = motion;
  const trace = (value: PetInputTrace): void => window.desktop.tracePetInput({ ...value, pressed: Boolean(down.current), motion: motionRef.current.state });
  const captureError = (error: unknown): PetInputTrace['error'] => error instanceof DOMException && ['NotFoundError', 'InvalidStateError'].includes(error.name) ? error.name as PetInputTrace['error'] : 'Other';
  useEffect(() => {
    const eventTrace = (event: Event): void => {
      const e = event as PointerEvent,character = e.target instanceof Element ? e.target.closest('.pet-character') : null;
      const pressed = down.current;
      trace({ event: event.type as PetInputTrace['event'], pointerId: e.pointerId, button: e.button, buttons: e.buttons, x: e.clientX, y: e.clientY,
        onCharacter: Boolean(character), trusted: event.isTrusted, captured: pressed?.target.hasPointerCapture(pressed.pointerId) ?? false });
    };
    const events = ['pointerdown', 'pointerup', 'pointercancel', 'gotpointercapture', 'lostpointercapture', 'mousedown', 'mouseup', 'click', 'contextmenu', 'dragstart'];
    for (const name of events) window.addEventListener(name, eventTrace, true);
    const beat = (event: 'ready' | 'heartbeat'): void => trace({ event, width: innerWidth, height: innerHeight, dpr: devicePixelRatio, visible: document.visibilityState === 'visible', focused: document.hasFocus(), captured: down.current?.target.hasPointerCapture(down.current.pointerId) ?? false });
    const error = (event: ErrorEvent): void => trace({ event: 'runtime.error', line: event.lineno, column: event.colno });
    const rejection = (): void => trace({ event: 'runtime.rejection' });
    window.addEventListener('error', error);window.addEventListener('unhandledrejection', rejection);
    beat('ready');const timer = setInterval(() => beat('heartbeat'), 5000);
    return () => {clearInterval(timer);for (const name of events) window.removeEventListener(name, eventTrace, true);window.removeEventListener('error', error);window.removeEventListener('unhandledrejection', rejection);};
  }, []);
  useEffect(() => window.desktop.onMotion(setMotion), []);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const unsubscribe = window.desktop.onPetting(() => {
      setReaction((value) => value + 1);
      clearTimeout(timer);timer = setTimeout(() => setReaction(0), 850);
    });
    return () => {unsubscribe();clearTimeout(timer);};
  }, []);
  useEffect(() => {
    const reset = (): void => {
      trace({ event: 'reset' });
      const pressed = down.current;
      down.current = null;
      setReaction(0);
      try {if (pressed?.target.hasPointerCapture(pressed.pointerId)) pressed.target.releasePointerCapture(pressed.pointerId);}
      catch (error) {trace({ event: 'capture.release-failed', error: captureError(error) });}
    };
    const unsubscribeReset = window.desktop.onInteractionReset(reset);
    const move = (event: PointerEvent): void => {
      if (!down.current || event.pointerId !== down.current.pointerId) return;
      if (event.pointerType === 'mouse' && !(event.buttons & 1)) {up(event);return;}
      // Native DIP cursor coordinates distinguish a petting click from a drag.
      // DOM screenX/screenY can change units when crossing different DPI screens.
      window.desktop.drag('move');
    };
    const up = (event: PointerEvent): void => {
      if (!down.current || event.pointerId !== down.current.pointerId) return;
      trace({ event: 'handler.up', pointerId: event.pointerId, buttons: event.buttons });
      window.desktop.drag('release');
      down.current = null;
      // Pointer capture ends after pointerup. Keep the character interactive until
      // its real pointerleave arrives as the window starts falling.
      window.desktop.pointer(true);
    };
    window.addEventListener('pointermove', move);window.addEventListener('pointerup', up);
    const cancel = (event: PointerEvent): void => {
      if (!down.current || event.pointerId !== down.current.pointerId) return;
      trace({ event: 'handler.cancel', pointerId: event.pointerId, buttons: event.buttons });
      window.desktop.drag('cancel');
      down.current = null;window.desktop.pointer(false);
    };
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('lostpointercapture', cancel);
    return () => {
      unsubscribeReset();reset();
      window.removeEventListener('pointermove', move);window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);window.removeEventListener('lostpointercapture', cancel);
    };
  }, []);
  if (!snapshot) return null;
  const inBall = Boolean(snapshot.settings.inBall),ball = activePet(snapshot.game).ball ?? 'poke';
  return <div className={`pet-surface ${inBall ? 'ball-resting' : ''} ${transition ? `ball-${transition}` : ''}`} data-in-ball={inBall} style={{ '--pet-size': `${inBall ? 40 : snapshot.settings.size}px`, '--ball-effect': ballInfo(ball).effect } as React.CSSProperties}>
    {speech && !inBall && <div key={`${speech.text}-${speech.until}`} className="pet-bubble" data-dialogue={speech.event} aria-live="polite">
      <span>{speech.text}</span>{speech.summary && <small>{speech.summary}</small>}
    </div>}
    <div className={`pet-character ${motion.state === 'held' ? 'held' : ''}`} data-motion={motion.state} data-surface={motion.surfaceId ?? undefined}
    style={{ transform: `scaleX(${-motion.direction})`, '--facing': -motion.direction } as React.CSSProperties}
    title={inBall ? t("클릭해서 볼에서 꺼내기 · 드래그해서 옮기기") : undefined}
    onPointerEnter={() => {window.desktop.pointer(true);greet();}}
    onPointerLeave={() => {if (!down.current) window.desktop.pointer(false);}}
    onPointerDown={(event) => {
      if (event.button !== 0) return;
      trace({ event: 'handler.down', pointerId: event.pointerId, buttons: event.buttons });
      if (down.current) {trace({ event: 'stale.press', pointerId: down.current.pointerId });window.desktop.drag('cancel');down.current = null;}
      setReaction(0);
      down.current = { pointerId: event.pointerId, target: event.currentTarget };
      // An invalid Chromium pointer ID must not abort the press before IPC.
      // The window follows the native cursor; window-level up/move still
      // finishes the press if native pointer capture cannot be established.
      try {event.currentTarget.setPointerCapture(event.pointerId);}
      catch (error) {trace({ event: 'capture.failed', pointerId: event.pointerId, error: captureError(error) });}
      window.desktop.drag('start');
    }}
    onContextMenu={(event) => {event.preventDefault();window.desktop.petMenu();}}>
      <span className="pet-shadow" aria-hidden="true" />
      <div className={`pet-motion state-${motion.state} ${speech?.event === 'growth' ? 'celebrating' : ''} ${reaction ? 'petted' : ''}`} style={{
        '--sway': `${motion.tilt * -motion.direction}deg`, '--land-wide': 1 + motion.impact * 0.22,
        '--land-flat': 1 - motion.impact * 0.26, '--land-hop': `${4 + motion.impact * 7}px`
      } as React.CSSProperties}>{inBall ? <BallIcon ball={ball} /> : <Sprite id={appearanceId(snapshot.game)} shiny={activePet(snapshot.game).shiny} eggType={activePet(snapshot.game).eggType} />}</div>
      {transition && <span className="ball-burst" aria-hidden="true"><i /><i /><i /><i /><i /><i /></span>}
      {reaction > 0 && !inBall && <span key={reaction} className="pet-affection" aria-hidden="true"><i>♥</i><i>✦</i><i>♥</i></span>}
      {motion.state === 'landing' && <span className="pet-dust" aria-hidden="true"><i /><i /><i /><i /></span>}
    </div>
  </div>;
}
function EggSelection({ game, pace, busy, act }: {game: GameState;pace: Settings['pace'];busy: boolean;act: (action: GameAction) => void;}): React.JSX.Element {const { language, t } = useI18n();
  const legacy = game.pets.find((p) => p.phase === 0 && p.eggType === null);
  const eggs = game.pets.filter((p) => p.phase === 0);
  const choices: {key: string;eggType: EggType | null;egg: Companion | undefined;name: string;}[] = EGG_TYPES.map((type) => ({
    key: type.id, eggType: type.id, egg: eggs.find((egg) => egg.eggType === type.id), name: localizedEggName(type.id, language)
  }));
  if (legacy) choices.push({ key: 'legacy', eggType: null, egg: legacy, name: t("기존 알") });
  choices.sort((a, b) => {
    return Number(b.egg?.id === game.activeId) - Number(a.egg?.id === game.activeId) || Number(Boolean(b.egg)) - Number(Boolean(a.egg)) || (b.egg?.xp ?? 0) - (a.egg?.xp ?? 0);
  });
  return <section className="collection-panel"><div className="panel-heading"><h3>{t("알 선택하기")}</h3><p>{t("알이나 포켓몬을 바꿔도 부화 진행률은 그대로 보관됩니다. 새 알을 선택하면 0%부터 키워요.")}</p></div>
    <div className="egg-grid">{choices.map((choice) => {
        const { egg } = choice,active = egg?.id === game.activeId;
        return <button key={choice.key} className={`egg-choice ${egg ? 'stored' : ''} ${active ? 'selected' : ''}`} data-egg-type={choice.key} aria-label={choice.eggType === null ? t("기존 알 이어 키우기") : t`${choice.name} 선택`} disabled={busy || active} onClick={() => act(choice.eggType === null ? { type: 'select', petId: egg!.id, phase: 0 } : { type: 'egg', eggType: choice.eggType })}>
        <span className="egg-choice-status">{active ? t("부화 중") : egg ? t("보관 중") : t("새 알")}</span>
        <Egg type={choice.eggType} /><strong>{choice.name}</strong>
        {egg ? <EggGrowth egg={egg} pace={pace} /> : <span className="egg-not-started">{t("새로 키울 수 있는 알")}</span>}
        <span className="egg-choice-action">{active ? t("함께하는 중") : egg ? t("이어 키우기") : t("새 알 선택")}</span>
      </button>;
      })}</div>
  </section>;
}
function EggGrowth({ egg, pace }: {egg: Companion;pace: Settings['pace'];}): React.JSX.Element {const { language, t } = useI18n();
  const progress = eggProgress(egg, pace),value = progress.toFixed(1);
  return <div className="egg-growth"><span>{t("부화 진행률 ")}<strong>{value}%</strong></span><div className="egg-progress-track" role="progressbar" aria-label={t`${eggName(egg, language)} 부화 진행률`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Number(value)} aria-valuetext={`${value}%`}><div style={{ width: `${progress}%` }} /></div></div>;
}
function EggStorage({ game, pace, busy, act }: {game: GameState;pace: Settings['pace'];busy: boolean;act: (action: GameAction) => void;}): React.JSX.Element {const { language, t } = useI18n();
  const eggs = game.pets.filter((p) => p.phase === 0).sort((a, b) => Number(b.id === game.activeId) - Number(a.id === game.activeId) || b.xp - a.xp);
  const current = eggs.find((egg) => egg.id === game.activeId),stored = eggs.filter((egg) => egg.id !== game.activeId);
  return <details className="egg-drawer"><summary>
    <div className="egg-drawer-heading"><span className="egg-drawer-icon" aria-hidden="true"><Egg type={current ? current.eggType : stored[0]?.eggType} /></span><div><h3>{t("알 보관함")}</h3><p>{t`보관 중인 알 ${stored.length}개 · 부화 중 ${current ? 1 : 0}개`}</p></div><span className="egg-drawer-toggle">{t("알 선택하기 ")}<span aria-hidden="true">⌄</span></span></div>
    {eggs.length > 0 ? <div className="egg-preview" aria-label={t("알 보관 현황")}>{eggs.slice(0, 3).map((egg) => <span key={egg.id} className={`egg-preview-item ${egg.id === game.activeId ? 'incubating' : ''}`} data-egg-id={egg.id} title={egg.id === game.activeId ? t("부화 중") : t("보관 중")}><span aria-hidden="true"><Egg type={egg.eggType} /></span><span>{eggName(egg, language)}</span><strong>{eggProgress(egg, pace).toFixed(1)}%</strong></span>)}{eggs.length > 3 && <span className="egg-preview-more">{t`+${eggs.length - 3}개 더 보기`}</span>}</div> : <p className="egg-preview-empty">{t("보관 중인 알이 없어요. 새 알을 선택해보세요.")}</p>}
  </summary><EggSelection game={game} pace={pace} busy={busy} act={act} /></details>;
}
function CandyBox({ game, pace, busy, act, compact = false }: {game: GameState;pace: Settings['pace'];busy: boolean;act: (action: GameAction) => void;compact?: boolean;}): React.JSX.Element {const { language, t } = useI18n();
  const [amount, setAmount] = useState(1),count = candyCount(game),pet = activePet(game),canFeed = isGrowing(game) && pet.phase > 0 && !waitingForEvolution(pet, pace);
  const next = canFeed ? Math.ceil((threshold(pet.phase, pace) - pet.xp) / CANDY_XP) : 0;
  return <section className="collection-panel candy-box"><div><h3><PixelIcon kind="candy" /><span>{t("경험치사탕 ")}<span className="candy-quantity" data-testid="candy-count">{count.toLocaleString(localeFor(language))}</span>{t("개")}</span></h3><p>{t`1개 = 10만 XP · 다음 사탕까지 ${(CANDY_XP - game.candyTokens % CANDY_XP).toLocaleString(localeFor(language))} 토큰`}</p>
    {(!compact || !canFeed) && <p>{pet.phase === 0 ? t("알은 토큰으로만 부화해요.") : canFeed ? t("토큰으로 자동 성장하며 사탕으로도 키울 수 있어요.") : compact ? t("새 토큰은 사탕으로 쌓여요.") : t("완성한 모습이에요. 새 토큰은 사탕으로 쌓입니다.")}</p>}</div>
    <div className="candy-actions"><label>{t("먹일 개수 ")}<input aria-label={t("먹일 사탕 개수")} type="number" min="1" max={Math.max(1, count)} value={Math.min(amount, Math.max(1, count))} disabled={busy || !canFeed || !count} onChange={(e) => setAmount(Math.max(1, Math.floor(Number(e.target.value) || 1)))} /></label>
      <button className="button primary" disabled={busy || !canFeed || !count} onClick={() => act({ type: 'candy', count: Math.min(amount, count) })}>{t("사탕 먹이기")}</button>
      {(!compact||canFeed)&&<button className="button subtle" disabled={busy || !canFeed || count < next} onClick={() => act({ type: 'candy', count: next })}>{t("다음 진화까지")}</button>}
    </div></section>;
}
function DexCard({ snapshot, game, pace, p, shiny, status, busy, act, showForms }: {snapshot: Snapshot;game: GameState;pace: Settings['pace'];p: typeof POKEMON[number];shiny: boolean;status: DexStatus;busy: boolean;act: (action: GameAction) => void;showForms:(species:number)=>void;}): React.JSX.Element {const { language, t } = useI18n();
  const phase=(c:Companion):number=>appearancePhase(c,p.id);
  const [chosen, setChosen] = useState(''),choices = dexChoices(game, p.id, shiny).filter((c) => status === 'growing' ? growingAppearance(c, phase(c)) : status === 'complete' ? !growingAppearance(c, phase(c)) : status === 'active' ? c.id === game.activeId && game.displayPhase === phase(c) : true);
  const pet = choices.find((c) => c.id === chosen) ?? choices.find((c) => c.id === game.activeId && game.displayPhase === phase(c)) ?? choices[0];
  const active = pet?.id === game.activeId && game.displayPhase === phase(pet) && appearanceId(game)===p.id,growing = pet && growingAppearance(pet, phase(pet));
  return <article className={`dex-card ${pet ? '' : 'locked'} ${active ? 'dex-selected' : ''}`} data-species={p.id} data-rarity={speciesRarity(p.id)} data-variant={shiny ? 'shiny' : 'normal'}><span className="dex-number">No. {String(p.id).padStart(3, '0')} {shiny ? t("✦ 이로치") : ''}<span className="dex-species-tags">{t`${p.generation}세대`}</span><RarityBadge rarity={speciesRarity(p.id)}/></span>
    {pet ? <Sprite id={p.id} shiny={shiny} /> : <div className="locked-placeholder">?</div>}<h3>{pet ? pokemonName(p.id, language) : t("아직 만나지 못했어요")}</h3>
    <div className="type-badges">{p.types.map((type) => <span key={type} style={{ background: EGG_TYPES.find((t) => t.id === type)?.color }}>{typeName(type, language)}</span>)}</div>
    <div className="dex-card-actions">
      <span className="dex-badge">{pet ? growing ? waitingForEvolution(pet, pace) ? t("진화 대기 · 목표 선택") : t`자동 성장 · ${(pet.xp / threshold(pet.phase, pace) * 100).toFixed(1)}%` : t("진화 완료 · 사탕 적립") : t("미발견")}</span>
      {choices.length > 1 && <select aria-label={t`${pokemonName(p.id, language)} 개체 선택`} value={pet.id} onChange={(e) => setChosen(e.target.value)}>{choices.map((c, i) => <option key={c.id} value={c.id}>{t`${i + 1}번째 친구 · ${growingAppearance(c, phase(c)) ? t`${(c.xp / threshold(c.phase, pace) * 100).toFixed(1)}% 성장` : t("이 모습의 진화 완료")}`}</option>)}</select>}
      {pet && <BallPicker pet={pet} snapshot={snapshot} busy={busy} act={act} label={t`${pokemonName(p.id, language)} ${choices.indexOf(pet) + 1}번째 친구의 볼 선택`} />}
      <button className="button primary" aria-label={t`${shiny ? t("이로치 ") : ''}${pokemonName(p.id, language)} 선택`} disabled={busy || !pet || active} onClick={() => act({ type: 'select', petId: pet.id, phase: phase(pet) })}>{active ? t("함께하는 중") : pet ? t("함께하기") : t("부화해서 만나기")}</button>
      {FORMS.some(f=>f.speciesId===p.id)&&<button className="text-button dex-forms-link" onClick={()=>showForms(p.id)}>{t('다른 모습 · 메가진화')}</button>}
    </div>
  </article>;
}
function DexPagination({ page, pages, position, onChange }: {page: number;pages: number;position: 'top' | 'bottom';onChange: (page: number) => void;}): React.JSX.Element {const { language, t } = useI18n();
  const start = Math.max(2, Math.min(page - 1, pages - 3));
  const pageNumbers = pages <= 7 ? Array.from({ length: pages }, (_, i) => i + 1) : [1, start, start + 1, start + 2, pages];
  return <nav className={`dex-pagination dex-pagination-${position}`} aria-label={t`도감 ${position === 'top' ? t("위쪽") : t("아래쪽")} 페이지 이동`}>
    <div className="dex-page-controls">
      <button aria-label={t("이전 페이지")} disabled={page === 1} onClick={() => onChange(page - 1)}>{t("← 이전")}</button>
      <div className="dex-page-numbers">{pageNumbers.map((n, i) => <React.Fragment key={n}>{i > 0 && n - pageNumbers[i - 1] > 1 && <span aria-hidden="true">…</span>}<button className={n === page ? 'current' : ''} aria-label={t`${n}페이지`} aria-current={n === page ? 'page' : undefined} disabled={n === page} onClick={() => onChange(n)}>{n}</button></React.Fragment>)}</div>
      <button aria-label={t("다음 페이지")} disabled={page === pages} onClick={() => onChange(page + 1)}>{t("다음 →")}</button>
    </div>
    <select aria-label={t("이동할 도감 페이지")} value={page} disabled={pages === 1} onChange={(e) => onChange(Number(e.target.value))}>{Array.from({ length: pages }, (_, i) => <option key={i + 1} value={i + 1}>{t`${i + 1} / ${pages} 페이지`}</option>)}</select>
  </nav>;
}
function App(): React.JSX.Element {const { language, t } = useI18n();const format = (v: number): string => new Intl.NumberFormat(localeFor(language), { notation: 'compact', maximumFractionDigits: 1 }).format(v);
  const snapshot = useSnapshot();
  const [tab, setTab] = useState('home');
  const [error, setError] = useState<string | null>(null);
  const [displays, setDisplays] = useState<DisplayChoice[]>([]);
  const [busy, setBusy] = useState(false);
  const [newRewards, setNewRewards] = useState<BallId[]>([]);
  const seenRewards = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!snapshot?.lastScan) return;
    const unlocked = ACHIEVEMENTS.filter((a) => ballUnlocked(snapshot.rewards, a.ball)).map((a) => a.ball);
    const previous = seenRewards.current;
    seenRewards.current = new Set(unlocked);
    if (!previous) return;
    const added = unlocked.filter((ball) => !previous.has(ball));
    if (added.length) setNewRewards(added);
  }, [snapshot?.rewards]);
  useEffect(() => {if (!newRewards.length) return;const timer = setTimeout(() => setNewRewards([]), 6500);return () => clearTimeout(timer);}, [newRewards]);
  const [shinyDex, setShinyDex] = useState(false);
  const [dexView, setDexView] = useState<'collection' | 'history' | 'forms'>('collection');
  const [formSpecies,setFormSpecies]=useState<number|null>(null);
  const [dexSearch, setDexSearch] = useState('');
  const [dexGeneration, setDexGeneration] = useState<number | 'all'>('all');
  const [dexRarity, setDexRarity] = useState<Rarity | 'all'>('all');
  const [dexType, setDexType] = useState<EggType | 'all'>('all');
  const [dexStatus, setDexStatus] = useState<DexStatus>('all');
  const [dexPage, setDexPage] = useState(1);
  const dexToolbar = useRef<HTMLElement>(null);
  useEffect(() => setDexPage(1), [language, snapshot?.settings.dexSort]);
  const dexViewKeys = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const views=['collection','history','forms'] as const,current=views.indexOf(dexView);
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : event.key==='ArrowLeft'?(current+2)%3:event.key==='ArrowRight'?(current+1)%3:-1;
    if (index < 0) return;
    event.preventDefault();setDexView(views[index]);
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[index]?.focus();
  };
  const resetDexFilters = (): void => {setDexSearch('');setDexGeneration('all');setDexRarity('all');setDexType('all');setDexStatus('all');setDexPage(1);};
  useEffect(() => window.desktop.onNavigate(setTab), []);
  useEffect(() => {if (tab === 'settings') void window.desktop.getDisplays().then(setDisplays);}, [tab, language]);
  useEffect(() => {const theme = snapshot?.settings.theme ?? 'light';document.documentElement.dataset.theme = theme;document.documentElement.dataset.palette = themeInfo(theme).dark ? 'dark' : 'light';}, [snapshot?.settings.theme]);
  const run = async (action: () => Promise<unknown>): Promise<void> => {
    setError(null);setBusy(true);
    try {await action();} catch (e) {setError(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : t("작업을 완료하지 못했습니다."));} finally {setBusy(false);}
  };
  const update = (patch: Partial<Settings>): void => {void run(() => window.desktop.updateSettings(patch));};
  const act = (action: GameAction): void => {void run(() => window.desktop.gameAction(action));};
  if (!snapshot) return <main className="loading"><Egg /><p>{t("작은 친구를 깨우는 중…")}</p></main>;
  const { game, settings } = snapshot;
  const pet = activePet(game),growing = isGrowing(game),discovered = discoveredSpecies(game);
  const waiting = waitingForEvolution(pet, settings.pace) && growing,branches = growing ? evolutionOptions(pet) : [];
  const id = appearanceId(game),name = id ? `${pet.shiny ? t("✦ 이로치 ") : ''}${pokemonName(id, language)}` : localizedEggName(pet.eggType, language);
  const showForms=(species:number):void=>{setFormSpecies(species);setDexView('forms');setTab('dex');};
  const formCollection=appearanceCollection(game),formCount=new Set([...formCollection.owned,...formCollection.ownedShiny]).size,currentForm=id?FORM_BY_ID.get(id):undefined;
  const goal = growing ? threshold(pet.phase, settings.pace) : 0,progress = goal ? Math.min(100, pet.xp / goal * 100) : 100;
  const today = snapshot.usage.claude.today + snapshot.usage.codex.today;
  const all = snapshot.usage.claude.all + snapshot.usage.codex.all;
  const connected = snapshot.roots.filter((r) => r.state === 'connected').length;
  const query = normalizeSearch(dexSearch),numberQuery = query.replace(/^(?:no\.?|#)/, '');
  const filteredPokemon = tab === 'dex' ? sortDex(POKEMON.filter((p) => {
    if (query && !pokemonMatches(p.id, query) && !(/^\d+$/.test(numberQuery) && p.id === Number(numberQuery))) return false;
    if (dexGeneration !== 'all' && p.generation !== dexGeneration) return false;
    if (dexRarity !== 'all' && speciesRarity(p.id) !== dexRarity) return false;
    if (dexType !== 'all' && !p.types.some((type) => type === dexType)) return false;
    if (dexStatus === 'all') return true;
    const choices = dexChoices(game, p.id, shinyDex);
    if (dexStatus === 'discovered') return choices.length > 0;
    if (dexStatus === 'undiscovered') return choices.length === 0;
    if (dexStatus === 'growing') return choices.some((c) => growingAppearance(c, appearancePhase(c,p.id)));
    if (dexStatus === 'complete') return choices.some((c) => !growingAppearance(c, appearancePhase(c,p.id)));
    if (dexStatus === 'active') return choices.some((c) => c.id === game.activeId && game.displayPhase === appearancePhase(c,p.id));
    return true;
  }), settings.dexSort, game, shinyDex, language) : [];
  const hasDexFilters = Boolean(dexSearch || dexGeneration !== 'all' || dexRarity !== 'all' || dexType !== 'all' || dexStatus !== 'all');
  const dexPages = Math.max(1, Math.ceil(filteredPokemon.length / DEX_PAGE_SIZE)),currentDexPage = Math.min(dexPage, dexPages);
  const dexStart = (currentDexPage - 1) * DEX_PAGE_SIZE,pagePokemon = filteredPokemon.slice(dexStart, dexStart + DEX_PAGE_SIZE);
  const changeDexPage = (page: number): void => {
    setDexPage(Math.max(1, Math.min(page, dexPages)));
    requestAnimationFrame(() => dexToolbar.current?.scrollIntoView({ block: 'start' }));
  };
  return <div className="app-shell" data-theme={settings.theme} data-palette={themeInfo(settings.theme).dark ? 'dark' : 'light'}>
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark"><PixelIcon kind="ball" /></span><div>PokeToken<span>{t("DESKTOP ADVENTURE")}</span></div></div>
      <nav aria-label={t("주 메뉴")}>{[['home', 'ball', t("현재 펫 · 사용량")], ['dex', 'dex', t("나의 도감")], ['achievements', 'trophy', t("업적 · 볼 컬렉션")], ['league','trophy',t('배지 · 리그 칭호')], ['settings', 'settings', t("설정")]].map(([key, icon, text]) => <button key={key} data-tab={key} className={tab === key ? 'nav-active' : ''} onClick={() => setTab(key)}><PixelIcon kind={icon as PixelIconKind} />{t(text)}</button>)}</nav>
      <div className="sidebar-bottom"><span className={`status-dot ${connected ? 'online' : ''}`} />{snapshot.scanning ? t("사용량 확인 중") : connected ? t("로그 연결됨") : t("로그 연결 대기")}<p>{t("평소처럼 코딩하세요.")}<br />{t("작은 친구가 함께 자랍니다.")}</p><small>{t`v${version} · 내 컴퓨터에 저장`}</small></div>
    </aside>
    <UpdateHint open={()=>setTab('settings')}/>
    <main className={`workspace ${tab === 'home' ? 'workspace-home' : ''}`}>
      <header className="topbar">{tab==='home'?<div className="topbar-honors"><HomeHonors snapshot={snapshot} open={()=>setTab('league')}/></div>:<span className="eyebrow"><span className="console-light" aria-hidden="true" />{t("POKETOKEN / TRAINER'S LOG")}</span>}<div className="topbar-actions"><button className="theme-button" disabled={busy} aria-label={settings.theme === 'dark' ? t("라이트 모드로 변경") : settings.theme === 'light' ? t("보라시티 다크 모드로 변경") : t("화면 테마 선택")} title={themeName(settings.theme, language)} onClick={() => settings.theme === 'light' || settings.theme === 'dark' ? update({ theme: settings.theme === 'dark' ? 'light' : 'dark' }) : setTab('settings')}><PixelIcon kind={themeInfo(settings.theme).dark ? 'moon' : 'sun'} /><span>{themeName(settings.theme, language)}</span></button><span className="date">{new Date().toLocaleDateString(localeFor(language), { month: 'long', day: 'numeric', weekday: 'short' })}</span></div></header>
      {error && <div className="error-banner" role="alert">{localizeMessage(error, language)}<button onClick={() => setError(null)}>{t("닫기")}</button></div>}
      {tab === 'home' && <section className="home-page" aria-label={t("현재 펫과 사용량")}>
        <div className="page-heading"><div><h1>{t("오늘도, 함께 성장해요")}<span>✦</span></h1><p>{t("코딩에 쓴 토큰이 작은 친구의 경험치가 됩니다.")}</p></div><button className="button subtle" disabled={busy || snapshot.scanning} onClick={() => void run(() => window.desktop.refresh())}>{snapshot.scanning ? t("확인 중…") : t("↻ 새로고침")}</button></div>
        <div className="home-grid">
          <section className="companion-card"><div className="card-top"><span className="pill">{pet.phase === 0 ? t("부화를 기다리는 중") : waiting ? t("진화 목표를 기다리는 중") : growing ? t`성장 단계 ${pet.phase} / ${finalPhase(pet)}` : t("경험치사탕을 모으는 중")}</span><button className="companion-dex-link" title={t`나의 도감 ${discovered.length} / ${POKEMON.length}종 · 이로치 ${game.ownedShiny.length}종`} onClick={() => currentForm?showForms(currentForm.speciesId):setTab('dex')}><PixelIcon kind="dex" />{currentForm?<>{t('모습 ')}{formCount}/{FORMS.length}</>:<>{t("도감 ")}{discovered.length}/{POKEMON.length}</>} →</button></div>
            <div className="habitat"><div className="cloud cloud-one" /><div className="cloud cloud-two" /><div className="sun" /><div className="hill hill-one" /><div className="hill hill-two" /><div className="ground" /><div className="habitat-sprite"><Sprite id={id} shiny={pet.shiny} eggType={pet.eggType} /></div><span className="grass grass-one"><PixelIcon kind="grass" /></span><span className="grass grass-two"><PixelIcon kind="grass" /></span></div>
            <div className="companion-description"><h2 title={name}>{name}</h2>{pet.phase > 0 ? <div className="companion-customization"><BallPicker pet={pet} snapshot={snapshot} busy={busy} act={act} /><MegaPicker snapshot={snapshot} busy={busy} act={act} openShop={()=>showForms(speciesId(game)!)}/></div> : <p>{t("어떤 친구가 태어날까요?")}</p>}</div>
            <div className="growth"><div><strong><span className="exp-label">EXP</span>{branches.length > 1 ? <select className={`evolution-target ${waiting ? 'awaiting-target' : ''}`} aria-label={t("진화 목표")} value={pet.evolutionTarget ?? ''} disabled={busy} onChange={(e) => act({ type: 'target', speciesId: e.target.value ? Number(e.target.value) : null })}><option value="">{t("진화 목표 선택")}</option>{branches.map((id) => <option key={id} value={id}>{pokemonName(id, language)}{(pet.shiny ? game.ownedShiny : game.owned).includes(id) ? t(" · 도감 등록") : ''}</option>)}</select> : growing ? t`${t(labels[pet.phase])}까지` : t("이 모습의 진화 완료")}</strong><span>{progress.toFixed(1)}%</span></div><div className="progress-track" role="progressbar" aria-label={t("현재 펫 성장 진행률")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Number(progress.toFixed(1))}><div style={{ width: `${progress}%` }} /></div><p>{waiting ? <span>{t("목표를 고르면 진화해요 · 새 토큰은 사탕으로")}</span> : growing ? <><span>{format(pet.xp)} / {format(goal)} XP</span><span>{t`${format(Math.max(0, goal - pet.xp))} XP 남음`}</span></> : <span>{t("알 또는 성장 중인 포켓몬을 고르면 자동 성장을 이어갑니다.")}</span>}</p></div>
            <div className="companion-actions"><button className="button primary" disabled={busy} onClick={() => update({ visible: !settings.visible })}>{settings.visible ? t("데스크톱 펫 숨기기") : t("데스크톱 펫 보이기")}</button>{pet.phase > 0 && <button className="button subtle" disabled={busy} onClick={() => update({ inBall: !settings.inBall, visible: true })}>{settings.inBall ? t("볼에서 꺼내기") : t("볼에 넣기")}</button>}<button className="button icon-button" disabled={busy} title={settings.paused ? t("다시 걷기") : t("이동 일시정지")} aria-label={settings.paused ? t("다시 걷기") : t("이동 일시정지")} onClick={() => update({ paused: !settings.paused })}>{settings.paused ? '▷' : 'Ⅱ'}</button></div>
          </section>
          <div className="right-column"><section className="stat-card today-card"><span className="small-label">{t("TODAY'S TOKENS")}</span><h2>{format(today)}<small>{t("토큰")}</small></h2><p>{t("오늘의 코딩이 남긴 발자국")}</p><div className="provider-breakdown"><span><i className="provider-dot claude" />Claude Code <strong>{format(snapshot.usage.claude.today)}</strong></span><span><i className="provider-dot codex" />Codex <strong>{format(snapshot.usage.codex.today)}</strong></span></div></section>
            <CandyBox game={game} pace={settings.pace} busy={busy} act={act} compact />
          </div>
        </div>
        <section className="activity-strip"><div><PixelIcon kind="token" /><div><span>{t("전체 로컬 사용량")}</span><strong>{t`${format(all)} 토큰`}</strong></div></div><div><PixelIcon kind="xp" /><div><span>{t("연결 후 얻은 경험치")}</span><strong>{format(game.tokensEarned)} XP</strong></div></div><div><PixelIcon kind="trophy" /><div><span>{t("성장을 마친 친구")}</span><strong>{t`${game.captures.length} 마리`}</strong></div></div></section>
        <EggStorage game={game} pace={settings.pace} busy={busy} act={act} />
        <footer className="home-footer"><span title={localizeMessage(snapshot.notice, language) || undefined}>{snapshot.notice ? `✦ ${localizeMessage(snapshot.notice, language)}` : t("새로 쓰는 토큰으로 성장합니다. 기존 기록은 사용량에만 표시됩니다.")}</span><small>{snapshot.lastScan ? t`${new Date(snapshot.lastScan).toLocaleTimeString(localeFor(language), { hour: '2-digit', minute: '2-digit' })} 확인` : t("첫 기록을 확인하는 중")}</small></footer>
      </section>}
      {tab === 'dex' && <>
        <div className="page-heading"><div><h1>{t("나의 작은 도감")}</h1><p>{t`${FAMILIES.length}개 진화 계열 · ${discovered.length} / ${POKEMON.length}종 발견 · 이로치 ${game.ownedShiny.length}종`}</p></div>{dexView === 'collection' && <div className="segmented"><button className={!shinyDex ? 'selected' : ''} aria-pressed={!shinyDex} onClick={() => {setShinyDex(false);setDexPage(1);}}>{t("일반 도감")}</button><button className={shinyDex ? 'selected' : ''} aria-pressed={shinyDex} onClick={() => {setShinyDex(true);setDexPage(1);}}>{t("✦ 이로치 도감")}</button></div>}</div>
        <div className="dex-views" role="tablist" onKeyDown={dexViewKeys} aria-label={t("도감 보기")}><button id="dex-collection-tab" className={`button ${dexView === 'collection' ? 'primary' : 'subtle'}`} role="tab" tabIndex={dexView === 'collection' ? 0 : -1} aria-selected={dexView === 'collection'} aria-controls="dex-collection" onClick={() => setDexView('collection')}>{t("포켓몬 도감")}</button><button id="dex-history-tab" className={`button ${dexView === 'history' ? 'primary' : 'subtle'}`} role="tab" tabIndex={dexView === 'history' ? 0 : -1} aria-selected={dexView === 'history'} aria-controls="dex-history" onClick={() => setDexView('history')}>{t("최종 진화 기록")}<span>{game.captures.length}</span></button><button id="dex-forms-tab" className={`button ${dexView==='forms'?'primary':'subtle'}`} role="tab" tabIndex={dexView==='forms'?0:-1} aria-selected={dexView==='forms'} aria-controls="dex-forms" onClick={()=>{setFormSpecies(null);setDexView('forms');}}>{t('모습 · 메가진화')}</button></div>
        {dexView === 'collection' ? <div role="tabpanel" id="dex-collection" aria-labelledby="dex-collection-tab">
        <section ref={dexToolbar} className="dex-toolbar" aria-label={t("도감 검색 및 필터")}>
          <div className="dex-filter-controls">
            <div className="dex-search"><svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg><input type="search" aria-label={t("포켓몬 이름 또는 도감 번호 검색")} placeholder={t("이름 또는 도감 번호 검색")} value={dexSearch} onChange={(e) => {setDexSearch(e.target.value);setDexPage(1);}} />{dexSearch && <button aria-label={t("검색어 지우기")} onClick={() => {setDexSearch('');setDexPage(1);}}>×</button>}</div>
            <label className="dex-filter">{t("세대")}<select aria-label={t("도감 세대 필터")} value={dexGeneration} onChange={(e) => {setDexGeneration(e.target.value === 'all' ? 'all' : Number(e.target.value));setDexPage(1);}}><option value="all">{t("모든 세대")}</option>{GENERATIONS.map((generation) => <option key={generation} value={generation}>{t`${generation}세대`}</option>)}</select></label>
            <label className="dex-filter">{t("타입")}<select aria-label={t("도감 타입 필터")} value={dexType} onChange={(e) => {setDexType(e.target.value as EggType | 'all');setDexPage(1);}}><option value="all">{t("모든 타입")}</option>{EGG_TYPES.map((type) => <option key={type.id} value={type.id}>{typeName(type.id, language)}</option>)}</select></label>
            <label className="dex-filter">{t("상태")}<select aria-label={t("도감 상태 필터")} value={dexStatus} onChange={(e) => {setDexStatus(e.target.value as DexStatus);setDexPage(1);}}>{dexStatuses.map((status) => <option key={status.value} value={status.value}>{t(status.label)}</option>)}</select></label>
            <label className="dex-filter">{t("분류")}<select aria-label={t("도감 분류 필터")} value={dexRarity} onChange={e=>{setDexRarity(e.target.value as Rarity|'all');setDexPage(1);}}><option value="all">{t("모든 분류")}</option>{RARITIES.map(r=><option key={r.id} value={r.id}>{t(r.name)}</option>)}</select></label>
            <label className="dex-filter">{t("정렬")}<select aria-label={t("도감 정렬")} value={settings.dexSort} disabled={busy} onChange={(e) => {setDexPage(1);update({ dexSort: e.target.value as DexSort });}}><option value="number">{t("번호순")}</option><option value="name">{t("이름순")}</option><option value="acquired">{t("획득순 · 최근 먼저")}</option></select></label>
          </div>
          <div className="dex-filter-summary"><p role="status" aria-live="polite"><strong>{t`전체 ${filteredPokemon.length}종`}</strong>{filteredPokemon.length > 0 && t` 중 ${dexStart + 1}–${dexStart + pagePokemon.length}종`} · {shinyDex ? t("이로치") : t("일반")}{t(" 도감")}</p><button className="text-button" disabled={!hasDexFilters} onClick={resetDexFilters}>{t("필터 초기화")}</button></div>
          {filteredPokemon.length > 0 && <DexPagination page={currentDexPage} pages={dexPages} position="top" onChange={changeDexPage} />}
        </section>
        {filteredPokemon.length ? <><div className="dex-grid">{pagePokemon.map((p) => <DexCard key={`${p.id}:${shinyDex}:${dexStatus}`} snapshot={snapshot} game={game} pace={settings.pace} p={p} shiny={shinyDex} status={dexStatus} busy={busy} act={act} showForms={showForms} />)}</div><DexPagination page={currentDexPage} pages={dexPages} position="bottom" onChange={changeDexPage} /></> : <div className="dex-empty"><span aria-hidden="true">⌕</span><h3>{t("조건에 맞는 친구가 없어요")}</h3><p>{t("검색어를 바꾸거나 타입·상태 필터를 풀어보세요.")}</p><button className="button subtle" onClick={resetDexFilters}>{t("전체 도감 보기")}</button></div>}
        </div> : dexView==='forms'?<FormCollection snapshot={snapshot} busy={busy} act={act} selectedSpecies={formSpecies} clearSpecies={()=>setFormSpecies(null)}/>:<EvolutionHistory game={game} />}
      </>}
      {tab === 'achievements' && <Achievements snapshot={snapshot} busy={busy} update={update} navigate={setTab} />}
      {tab === 'league' && <LeagueCollection snapshot={snapshot} busy={busy} save={display=>run(()=>window.desktop.setLeagueDisplay(display))}/>}
      {tab === 'settings' && <>
        <UpdateSettings/>
        <div className="page-heading"><div><h1>{t("함께하는 방식")}</h1><p>{t("성장 속도와 데스크톱 펫을 내 취향에 맞춰보세요.")}</p></div></div>
        <section className="settings-card language-settings"><h3>{t("언어")}</h3><div className="setting-row"><div><strong>{t("표시 언어")}</strong><p>{t("메뉴, 대사와 포켓몬 이름에 바로 적용됩니다.")}</p></div><select aria-label={t("표시 언어")} value={settings.language} disabled={busy} onChange={(e) => update({ language: e.target.value as Language })}>{LANGUAGES.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div></section>
        <ThemePicker snapshot={snapshot} busy={busy} update={update} navigate={setTab} />
        <section className="settings-card"><h3>{t("성장과 모습")}</h3><div className="setting-row"><div><strong>{t("성장 속도")}</strong><p>{t("변경해도 지금까지의 단계 진행률은 유지됩니다.")}</p></div><div className="segmented">{[['fast', t("빠름")], ['normal', t("기본")], ['slow', t("느림")]].map(([key, text]) => <button key={key} disabled={busy} className={settings.pace === key ? 'selected' : ''} onClick={() => update({ pace: key as Settings['pace'] })}>{t(text)}</button>)}</div></div>
          <div className="setting-row"><div><strong>{t("캐릭터 크기")}</strong><p>{t("화면 위에 보이는 친구의 크기")}</p></div><div className="segmented">{([96, 128, 192] as const).map((size) => <button key={size} disabled={busy} className={settings.size === size ? 'selected' : ''} onClick={() => update({ size })}>{size}px</button>)}</div></div>
          <div className="setting-row"><div><strong>{t("함께할 화면")}</strong><p>{t("모니터가 분리되면 기본 화면으로 돌아옵니다.")}</p></div><select aria-label={t("함께할 화면")} value={displays.some((d) => d.id === settings.displayId) ? settings.displayId! : ''} onChange={(e) => update({ displayId: e.target.value || null })}><option value="">{t("기본 화면")}</option>{displays.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</select></div>
          <div className="setting-row"><div><strong>{t("컴퓨터를 켜면 함께 시작")}</strong><p>{t("로그인할 때 앱을 자동으로 실행합니다.")}</p></div><button disabled={busy} role="switch" aria-checked={settings.autoStart} aria-label={t("자동 시작")} className={`toggle ${settings.autoStart ? 'on' : ''}`} onClick={() => update({ autoStart: !settings.autoStart })}><span /></button></div>
        </section>
        <section className="settings-card"><h3>{t("토큰 사용 기록 연결")}</h3><p className="section-help">{t("기본 폴더를 자동으로 찾습니다. 다른 위치나 WSL에 있는 기록은 폴더를 추가하세요.")}</p>
          {(['claude', 'codex'] as const).map((provider) => <div className="provider-settings" key={provider}><div className="provider-title"><strong><i className={`provider-dot ${provider}`} />{names[provider]}</strong><button className="button subtle" disabled={busy} onClick={() => void run(async () => {
                const path = await window.desktop.chooseFolder(provider);
                if (path) await window.desktop.updateSettings({ roots: { ...settings.roots, [provider]: [...new Set([...settings.roots[provider], path])] } });
              })}>{t("+ 폴더 추가")}</button></div>
            {snapshot.roots.filter((r) => r.provider === provider).map((r) => <div className="root-row" key={r.path}><span className={`status-dot ${r.state === 'connected' ? 'online' : r.state === 'error' ? 'warning' : ''}`} /><div><code>{r.path}</code><small>{r.state === 'connected' ? t`${r.files}개 로그 연결됨${r.skipped ? t` · 불완전한 기록 ${r.skipped}개 건너뜀` : ''}` : r.state === 'missing' ? t("폴더가 아직 없습니다. 기록이 생기면 자동으로 연결됩니다.") : localizeMessage(r.error, language)}</small></div>{settings.roots[provider].includes(r.path) && <button className="remove-button" aria-label={t`${r.path} 연결 제거`} onClick={() => update({ roots: { ...settings.roots, [provider]: settings.roots[provider].filter((p) => p !== r.path) } })}>×</button>}</div>)}
            {!snapshot.roots.some((r) => r.provider === provider) && <p className="empty-root">{t("연결할 로그 폴더를 추가해주세요.")}</p>}
          </div>)}
          <p className="privacy-note">{t("⌂ 기록은 내 컴퓨터에서 처리합니다. 대화 내용과 인증 정보는 저장하거나 전송하지 않습니다.")}<br />{t("새 폴더의 기존 기록은 경험치에 소급 적용되지 않습니다.")}</p>
        </section>
      </>}
    </main>
    {newRewards.length > 0 && <div className="reward-toast" role="status" aria-live="polite"><BallIcon ball={newRewards[0]} /><div><strong>{t`${newRewards.map((ball) => ballName(ball, language)).join(' · ')} 획득!`}</strong><span>{t("볼과 화면 테마를 사용할 수 있어요.")}</span></div><button onClick={() => {setTab('achievements');setNewRewards([]);}}>{t("업적 보기")}</button><button aria-label={t("획득 알림 닫기")} onClick={() => setNewRewards([])}>×</button></div>}
  </div>;
}
const view = new URLSearchParams(location.search).get('view');
document.body.classList.toggle('pet-body', view === 'pet');
document.documentElement.classList.toggle('pet-html', view === 'pet');
function LocalizedRoot(): React.JSX.Element {
  const snapshot = useLiveSnapshot();
  const language = snapshot?.settings.language ?? 'en';
  useEffect(() => {document.documentElement.lang = language;}, [language]);
  return <SnapshotContext.Provider value={snapshot}><LanguageContext.Provider value={language}>{view === 'pet' ? <Pet /> : <App />}</LanguageContext.Provider></SnapshotContext.Provider>;
}
createRoot(document.getElementById('root')!).render(<LocalizedRoot />);
