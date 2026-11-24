import { FlexWidget, TextWidget } from 'react-native-android-widget';
import {
  TYPES, MONTHS, MSHORT, WD, pad, today0, wdIdx, isoWeek, semester, rel, niceDate, fmtMin, at, isPoint, clamp,
  nextOccurrence, upcomingDeadlines, occurrences, addDays, isCancelled, hpStatusLabel,
} from '../core';
import { catInk, liveBg, tint } from '../theme';

/* Widgets de l'écran d'accueil Android. Ils reprennent l'écran « Aujourd'hui » :
   mêmes jetons de couleur, mêmes libellés. Le rendu est figé entre deux mises à jour,
   donc tout ce qui est relatif (« Dans 35 min ») est calculé au moment du rendu. */

export const WIDGET_NAMES = ['AgendaNext', 'AgendaToday', 'AgendaFull'];

// Polices copiées dans l'APK par le plugin (nom du fichier sans extension).
const F = {
  thin: 'BricolageGrotesque_200ExtraLight',
  body: 'Geist_400Regular',
  medium: 'Geist_500Medium',
  semi: 'Geist_600SemiBold',
};

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const evUri = (o) => ({ uri: `agendammi://event?oid=${encodeURIComponent(o.oid)}` });

function Txt({ text, size = 12, font = F.body, color, lines = 1, style, scale = true, ...rest }) {
  return (
    <TextWidget
      text={text}
      maxLines={lines}
      truncate="END"
      allowFontScaling={scale}
      style={{ fontSize: size, fontFamily: font, color, ...style }}
      {...rest}
    />
  );
}

const Dot = ({ color, style }) => <FlexWidget style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color, ...style }} />;

function Root({ t, children, style }) {
  return (
    <FlexWidget
      clickAction="OPEN_APP"
      accessibilityLabel="Agend-A"
      style={{ width: 'match_parent', height: 'match_parent', backgroundColor: t.surface, borderRadius: 24, padding: 14, ...style }}
    >
      {children}
    </FlexWidget>
  );
}

/* ---------- Données ---------- */

/** Créneaux du jour à afficher : on garde le dernier passé pour le contexte, puis la suite. */
function todaySlice(list, now, max) {
  const firstLeft = list.findIndex((o) => (isPoint(o) ? at(o.date, o.s).getTime() : at(o.date, o.e).getTime()) > now && !o.ev.done && !isCancelled(o.ev));
  const start = firstLeft < 0 ? list.length : Math.max(0, firstLeft - 1);
  const shown = list.slice(start, start + max);
  return { shown, more: list.length - start - shown.length, allPast: firstLeft < 0 };
}

export function buildModel({ events, hidden }, now = Date.now()) {
  const d = today0();
  return {
    now, d,
    next: nextOccurrence(events, hidden, now),
    today: occurrences(events, d, addDays(d, 1), hidden),
    deadlines: upcomingDeadlines(events, 45, now),
  };
}

/* ---------- Éléments communs ---------- */

function SlotRow({ t, o, now }) {
  const c = t.cat[o.ev.type];
  const st = at(o.date, o.s).getTime(), en = at(o.date, o.e).getTime();
  const point = isPoint(o);
  const off = isCancelled(o.ev);
  const past = (point ? st : en) <= now || o.ev.done || off;
  const live = !off && !point && st <= now && now < en;
  const bg = live ? liveBg(t, c) : point ? t.surface : tint(c, past ? t.mixPast : t.mix, t.surface);
  const sub = live ? t.onLive : t.muted;
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={evUri(o)}
      accessibilityLabel={`${o.ev.title}, ${fmtMin(o.s)}`}
      style={{
        width: 'match_parent', height: 40, flexDirection: 'row', alignItems: 'center', flexGap: 9,
        paddingHorizontal: 9, borderRadius: 11, backgroundColor: bg,
        ...(point ? { borderWidth: 1, borderColor: t.line } : null),
      }}
    >
      <FlexWidget style={{ width: 38, flexDirection: 'column' }}>
        <Txt text={fmtMin(o.s)} size={11.5} font={F.semi} color={live ? t.onLive : past ? t.muted : catInk(t, c)} />
        <Txt text={point ? 'limite' : fmtMin(o.e)} size={10} color={sub} />
      </FlexWidget>
      <FlexWidget style={{ flex: 1, flexDirection: 'column' }}>
        <Txt text={o.ev.title} size={12.5} font={past ? F.medium : F.semi} color={live ? t.onLive : past ? t.muted : t.ink} />
        <Txt text={off ? `${hpStatusLabel(o.ev)}, ${o.ev.location || TYPES[o.ev.type].label}` : [TYPES[o.ev.type].label, o.ev.location].filter(Boolean).join(', ')} size={10.5} color={off ? t.danger : sub} />
      </FlexWidget>
      {live ? (
        <FlexWidget style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, backgroundColor: t.dark ? 'rgba(0, 0, 0, 0.18)' : 'rgba(255, 255, 255, 0.22)' }}>
          <Txt text="En cours" size={9.5} font={F.semi} color={t.onLive} />
        </FlexWidget>
      ) : null}
    </FlexWidget>
  );
}

function SlotList({ t, m, max, showCount = true }) {
  const { shown, more, allPast } = todaySlice(m.today, m.now, max);
  if (!m.today.length || allPast) {
    const n = m.next;
    return (
      <FlexWidget style={{ flex: 1, width: 'match_parent', flexDirection: 'column', justifyContent: 'center', flexGap: 3 }}>
        <Txt text={m.today.length ? "Plus rien aujourd'hui" : 'Journée libre'} size={13} font={F.semi} color={t.ink} />
        {n ? (
          <FlexWidget clickAction="OPEN_URI" clickActionData={evUri(n)} style={{ flexDirection: 'row', alignItems: 'center', flexGap: 6 }}>
            <Dot color={t.cat[n.ev.type]} />
            <Txt text={`${cap(niceDate(n.date))} ${fmtMin(n.s)} · ${n.ev.title}`} size={11.5} color={t.muted} />
          </FlexWidget>
        ) : <Txt text="Rien de prévu ces 3 semaines." size={11.5} color={t.muted} />}
      </FlexWidget>
    );
  }
  return (
    <FlexWidget style={{ flex: 1, width: 'match_parent', flexDirection: 'column', flexGap: 5 }}>
      {shown.map((o) => <SlotRow key={o.oid} t={t} o={o} now={m.now} />)}
      {showCount && more > 0 ? <Txt text={`+${more} autre${more > 1 ? 's' : ''}`} size={11} color={t.muted} style={{ paddingLeft: 9 }} /> : null}
    </FlexWidget>
  );
}

/* ---------- Petit 2×2 : prochain événement ---------- */

export function NextWidget({ t, m, width }) {
  const n = m.next;
  if (!n) {
    return (
      <Root t={t} style={{ flexDirection: 'column' }}>
        <Txt text="Prochain" size={11.5} color={t.muted} />
        <FlexWidget style={{ flex: 1 }} />
        <Txt text="Rien de prévu" size={21} font={F.semi} color={t.ink} lines={2} style={{ letterSpacing: -0.03 }} />
        <Txt text="Les 3 prochaines semaines sont libres." size={11.5} color={t.muted} lines={2} />
      </Root>
    );
  }
  const st = at(n.date, n.s).getTime(), en = at(n.date, n.e).getTime();
  const point = isPoint(n);
  const ongoing = !point && m.now >= st;
  const big = ongoing ? `Fin dans ${rel(en - m.now)}` : point ? `Rendu dans ${rel(st - m.now)}` : `Dans ${rel(st - m.now)}`;
  const barW = Math.max(0, (width || 150) - 28);
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={evUri(n)}
      accessibilityLabel={`${big}, ${n.ev.title}`}
      style={{ width: 'match_parent', height: 'match_parent', backgroundColor: t.surface, borderRadius: 24, padding: 14, flexDirection: 'column' }}
    >
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', flexGap: 6 }}>
        <Dot color={t.cat[n.ev.type]} />
        <Txt text={`${ongoing ? 'En cours' : 'Prochain'}, ${TYPES[n.ev.type].label.toLowerCase()}`} size={11.5} color={t.muted} />
      </FlexWidget>
      <FlexWidget style={{ flex: 1 }} />
      <Txt text={big} size={21} font={F.semi} color={t.ink} lines={2} style={{ letterSpacing: -0.03 }} />
      <Txt text={n.ev.title} size={13.5} font={F.semi} color={t.ink} lines={2} style={{ marginTop: 4 }} />
      <Txt
        text={[`${ongoing ? '' : cap(niceDate(n.date)) + ' '}${fmtMin(n.s)}${point ? '' : '–' + fmtMin(n.e)}`, n.ev.location].filter(Boolean).join(' · ')}
        size={11.5} color={t.muted} style={{ marginTop: 3 }}
      />
      {ongoing ? (
        <FlexWidget style={{ width: barW, height: 3, borderRadius: 2, backgroundColor: t.line, marginTop: 10 }}>
          <FlexWidget style={{ width: Math.round(barW * clamp((m.now - st) / (en - st), 0, 1)), height: 3, borderRadius: 2, backgroundColor: t.ink }} />
        </FlexWidget>
      ) : null}
    </FlexWidget>
  );
}

/* ---------- Moyen 4×2 : la journée ---------- */

export function TodayWidget({ t, m, height }) {
  const max = clamp(Math.floor(((height || 150) - 28 + 5) / 45), 1, 5);
  const fits = m.today.length - todaySlice(m.today, m.now, max).shown.length;
  // Si tout ne tient pas, on libère une ligne pour « +N autres ».
  const rows = fits > 0 && max > 1 ? max - 1 : max;
  const n = m.today.length;
  return (
    <Root t={t} style={{ flexDirection: 'row', flexGap: 14, paddingLeft: 16 }}>
      <FlexWidget style={{ width: 78, height: 'match_parent', flexDirection: 'column' }}>
        <Txt text={pad(m.d.getDate())} size={52} font={F.thin} color={t.ink} scale={false} style={{ letterSpacing: -0.05 }} />
        <Txt text={WD[wdIdx(m.d)]} size={12.5} font={F.medium} color={t.ink} />
        <Txt text={`${MSHORT[m.d.getMonth()]} · S${isoWeek(m.d)}`} size={11} color={t.muted} />
        <FlexWidget style={{ flex: 1 }} />
        <Txt text={n ? `${n} aujourd'hui` : 'Rien'} size={11} color={t.muted} />
      </FlexWidget>
      <SlotList t={t} m={m} max={rows} />
    </Root>
  );
}

/* ---------- Grand 4×4 : journée + rendus ---------- */

function DeadlineRow({ t, o, now, first }) {
  const rem = at(o.date, o.s).getTime() - now;
  const urgent = rem < 864e5;
  const dd = Math.floor(rem / 864e5), hh = Math.max(0, Math.floor(rem / 36e5));
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={evUri(o)}
      style={{
        width: 'match_parent', height: 38, flexDirection: 'row', alignItems: 'center', flexGap: 9, paddingHorizontal: 2,
        ...(first ? null : { borderTopWidth: 1, borderColor: t.line }),
      }}
    >
      <Dot color={t.cat[o.ev.type]} />
      <FlexWidget style={{ flex: 1, flexDirection: 'column' }}>
        <Txt text={o.ev.title} size={12.5} font={F.semi} color={t.ink} />
        <Txt text={`${cap(niceDate(o.date))} à ${fmtMin(o.s)}`} size={10.5} color={t.muted} />
      </FlexWidget>
      <Txt text={dd >= 1 ? `J-${dd}` : `${hh} h`} size={11.5} font={F.semi} color={urgent ? t.danger : t.muted} />
      {o.ev.type === 'rendu' ? (
        <FlexWidget
          clickAction="MARK_DONE"
          clickActionData={{ id: o.ev.id }}
          accessibilityLabel={`Marquer ${o.ev.title} comme rendu`}
          style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: t.line }}
        />
      ) : null}
    </FlexWidget>
  );
}

const Section = ({ t, left, right }) => (
  <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', justifyContent: 'space-between' }}>
    <Txt text={left} size={11} font={F.medium} color={t.muted} />
    <Txt text={right} size={11} color={t.muted} />
  </FlexWidget>
);

export function FullWidget({ t, m, height }) {
  // Hauteur utile : marges 32, en-tête 34, 4 espacements de 10, deux titres de section.
  const avail = (height || 300) - 32 - 34 - 40 - 30;
  // La journée passe d'abord (3 lignes au plus), les rendus prennent le reste (1 à 3).
  const { shown, allPast } = todaySlice(m.today, m.now, 3);
  const want = !m.today.length || allPast ? 1 : shown.length;
  const max = clamp(Math.min(want, Math.floor((avail - 38 + 5) / 45)), 1, 3);
  const dls = m.deadlines.slice(0, clamp(Math.floor((avail - max * 45) / 38), 1, 3));
  const n = m.today.length;
  return (
    <Root t={t} style={{ flexDirection: 'column', flexGap: 10, padding: 16 }}>
      <FlexWidget style={{ width: 'match_parent', height: 34, flexDirection: 'row', alignItems: 'center', flexGap: 9 }}>
        <Txt text={pad(m.d.getDate())} size={34} font={F.thin} color={t.ink} scale={false} />
        <FlexWidget style={{ flex: 1, flexDirection: 'column' }}>
          <Txt text={`${WD[wdIdx(m.d)]} ${m.d.getDate()} ${MONTHS[m.d.getMonth()]}`} size={13} font={F.medium} color={t.ink} />
          <Txt text={`Semaine ${isoWeek(m.d)} · ${semester(m.d)}`} size={11} color={t.muted} />
        </FlexWidget>
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: 'agendammi://new' }}
          accessibilityLabel="Ajout rapide"
          style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: t.surface2, alignItems: 'center', justifyContent: 'center' }}
        >
          <Txt text="+" size={19} font={F.medium} color={t.ink} scale={false} />
        </FlexWidget>
      </FlexWidget>
      <Section t={t} left="Aujourd'hui" right={n ? `${n} événement${n > 1 ? 's' : ''}` : ''} />
      <SlotList t={t} m={m} max={max} showCount={false} />
      <Section t={t} left="Rendus et évaluations" right={m.deadlines.length ? `${m.deadlines.length} à venir` : ''} />
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'column' }}>
        {dls.length
          ? dls.map((o, i) => <DeadlineRow key={o.oid} t={t} o={o} now={m.now} first={!i} />)
          : <Txt text="Aucun rendu dans les 45 prochains jours." size={11.5} color={t.muted} style={{ paddingVertical: 10 }} />}
      </FlexWidget>
    </Root>
  );
}

export function renderAgendaWidget(name, t, m, info = {}) {
  const p = { t, m, width: info.width, height: info.height };
  if (name === 'AgendaNext') return <NextWidget {...p} />;
  if (name === 'AgendaToday') return <TodayWidget {...p} />;
  return <FullWidget {...p} />;
}
