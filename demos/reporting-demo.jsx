import React, { useMemo, useState } from "react";

/* ============================================================
   FLEETIN — Rapports Chargeur (prototype interactif)
   - Rapport de mission (individuel)
   - Rapport mensuel de performance
   Toutes les durées et KPIs sont CALCULÉS à partir des timestamps
   (aucune durée saisie manuellement), conformément au cahier des charges.
   ============================================================ */

/* ---------- Design tokens ---------- */
const T = {
  ink: "#101823",
  inkSoft: "#4A5461",
  inkFaint: "#8A93A0",
  paper: "#F4F5F3",
  card: "#FFFFFF",
  line: "#E2E5E1",
  blue: "#14538C",
  blueSoft: "#EAF1F8",
  green: "#0B7A4B",
  greenSoft: "#E9F4EE",
  amber: "#A9660B",
  amberSoft: "#FBF1E0",
  red: "#B3261E",
  redSoft: "#FBEAE9",
  mono: "'IBM Plex Mono', ui-monospace, Menlo, monospace",
  sans: "'IBM Plex Sans', -apple-system, 'Segoe UI', sans-serif",
};

/* ---------- Helpers temps ---------- */
const ts = (s) => new Date(s).getTime();
const MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR;

function fmtDur(ms, { compact = false } = {}) {
  if (ms == null || isNaN(ms)) return "—";
  const sign = ms < 0 ? "-" : "";
  ms = Math.abs(ms);
  const d = Math.floor(ms / DAY);
  const h = Math.floor((ms % DAY) / HOUR);
  const m = Math.round((ms % HOUR) / MIN);
  if (d > 0) return `${sign}${d}j ${h}h${compact ? "" : ` ${m}m`}`;
  if (h > 0) return `${sign}${h}h ${String(m).padStart(2, "0")}m`;
  return `${sign}${m} min`;
}
const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
function fmtDT(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getDate()} ${MOIS[d.getMonth()]} — ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function fmtTime(iso) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`;
}

/* ---------- Étapes du cycle de vie ---------- */
const STAGES = [
  { key: "assigned",   label: "Mission assignée" },
  { key: "leftPickup", label: "Départ vers chargement" },
  { key: "arrPickup",  label: "Arrivée au chargement" },
  { key: "loadStart",  label: "Début chargement", resp: "Chargeur" },
  { key: "loadEnd",    label: "Fin chargement", resp: "Chargeur" },
  { key: "leftDrop",   label: "Départ vers livraison" },
  { key: "arrDrop",    label: "Arrivée à destination", resp: "Transporteur" },
  { key: "unloadStart",label: "Début déchargement", resp: "Client" },
  { key: "unloadEnd",  label: "Conteneur livré", resp: "Client" },
  { key: "emptyReady", label: "Vide prêt (fin dépotage)", resp: "Client" },
  { key: "emptyReturn",label: "Restitution du vide", resp: "Transporteur" },
  { key: "closed",     label: "Mission clôturée" },
];

/* ---------- Données de démonstration (Djibouti) ---------- */
const MISSIONS = [
  {
    id: "FLT-2481",
    container: "MSCU 457120-9",
    ctype: "40' HC",
    shipper: "Djibouti Trading Co.",
    pickup: "Terminal SGTD — Port de Djibouti",
    dropoff: "Entrepôt PK12 — Route de l'Éthiopie",
    truck: "DJ 4472 AB — Renault K440",
    driver: "A. Houssein",
    cargo: "Riz basmati — 26,4 t",
    line: "Ligne maritime : MSC",
    deadline: "2026-08-16T18:00:00",
    detentionRate: 90,
    events: {
      assigned:   "2026-08-12T08:35:00",
      leftPickup: "2026-08-12T09:02:00",
      arrPickup:  "2026-08-12T09:48:00",
      loadStart:  "2026-08-12T10:15:00",
      loadEnd:    "2026-08-12T11:32:00",
      leftDrop:   "2026-08-12T11:45:00",
      arrDrop:    "2026-08-12T15:20:00",
      unloadStart:"2026-08-12T15:42:00",
      unloadEnd:  "2026-08-12T16:12:00",
      emptyReady: "2026-08-14T11:22:00",
      emptyReturn:"2026-08-15T11:45:00",
      closed:     "2026-08-15T12:10:00",
    },
    responsibility: null,
  },
  {
    id: "FLT-2467",
    container: "CMAU 882341-0",
    ctype: "20' DV",
    shipper: "Djibouti Trading Co.",
    pickup: "Terminal DCT — Doraleh",
    dropoff: "Zone industrielle — Nagad",
    truck: "DJ 3918 CD — Mercedes Actros",
    driver: "M. Robleh",
    cargo: "Pièces détachées — 11,8 t",
    line: "Ligne maritime : CMA CGM",
    deadline: "2026-08-06T18:00:00",
    detentionRate: 90,
    events: {
      assigned:   "2026-08-03T07:50:00",
      leftPickup: "2026-08-03T08:20:00",
      arrPickup:  "2026-08-03T09:05:00",
      loadStart:  "2026-08-03T11:40:00",
      loadEnd:    "2026-08-03T12:31:00",
      leftDrop:   "2026-08-03T12:44:00",
      arrDrop:    "2026-08-03T14:55:00",
      unloadStart:"2026-08-03T15:30:00",
      unloadEnd:  "2026-08-03T16:05:00",
      emptyReady: "2026-08-07T14:35:00",
      emptyReturn:"2026-08-08T10:30:00",
      closed:     "2026-08-08T11:00:00",
    },
    responsibility: { party: "Client / Chargeur", reason: "Dépotage tardif", comment: "Magasin de destination saturé — dépotage démarré avec 2 jours de retard." },
  },
  {
    id: "FLT-2493",
    container: "MAEU 630115-4",
    ctype: "40' DV",
    shipper: "Djibouti Trading Co.",
    pickup: "Terminal SGTD — Port de Djibouti",
    dropoff: "Dépôt Ali Sabieh",
    truck: "DJ 5104 EF — Volvo FH",
    driver: "S. Waberi",
    cargo: "Farine de blé — 24,1 t",
    line: "Ligne maritime : Maersk",
    deadline: "2026-08-16T08:00:00",
    detentionRate: 90,
    events: {
      assigned:   "2026-08-13T06:40:00",
      leftPickup: "2026-08-13T07:05:00",
      arrPickup:  "2026-08-13T07:58:00",
      loadStart:  "2026-08-13T08:20:00",
      loadEnd:    "2026-08-13T09:26:00",
      leftDrop:   "2026-08-13T09:40:00",
      arrDrop:    "2026-08-13T14:52:00",
      unloadStart:"2026-08-13T15:25:00",
      unloadEnd:  "2026-08-13T16:02:00",
      emptyReady: "2026-08-15T09:10:00",
      emptyReturn: null,
      closed:     null,
    },
    responsibility: null,
  },
];

const NOW = ts("2026-08-15T14:30:00"); // horloge de la démo

/* ---------- Calculs automatiques ---------- */
function computeMission(m) {
  const e = m.events;
  const get = (k) => (e[k] ? ts(e[k]) : null);

  const timeline = STAGES.map((s, i) => {
    const t = get(s.key);
    let prev = null;
    for (let j = i - 1; j >= 0; j--) { if (get(STAGES[j].key)) { prev = get(STAGES[j].key); break; } }
    return { ...s, iso: e[s.key] || null, t, dur: t && prev != null && i > 0 ? t - prev : null };
  });

  const kpi = {
    total: get("closed") && get("assigned") ? get("closed") - get("assigned") : null,
    transit: get("arrDrop") && get("leftDrop") ? get("arrDrop") - get("leftDrop") : null,
    waitPickup: get("loadStart") && get("arrPickup") ? get("loadStart") - get("arrPickup") : null,
    loading: get("loadEnd") && get("loadStart") ? get("loadEnd") - get("loadStart") : null,
    waitDrop: get("unloadStart") && get("arrDrop") ? get("unloadStart") - get("arrDrop") : null,
    unloading: get("unloadEnd") && get("unloadStart") ? get("unloadEnd") - get("unloadStart") : null,
    depotage: get("emptyReady") && get("unloadEnd") ? get("emptyReady") - get("unloadEnd") : null,
  };
  kpi.waitTotal = kpi.waitPickup != null && kpi.waitDrop != null ? kpi.waitPickup + kpi.waitDrop : null;
  const transportSpan = get("unloadEnd") && get("assigned") ? get("unloadEnd") - get("assigned") : null;
  kpi.activePct = transportSpan && kpi.waitTotal != null ? Math.round(100 - (kpi.waitTotal / transportSpan) * 100) : null;

  // Restitution du vide
  const deadline = ts(m.deadline);
  const ret = get("emptyReturn");
  let retStatus, retDelta, detentionDays = 0, detentionFees = 0;
  if (ret) {
    retDelta = ret - deadline;
    retStatus = retDelta <= 0 ? "ontime" : "delayed";
    if (retDelta > 0) { detentionDays = Math.ceil(retDelta / DAY); detentionFees = detentionDays * m.detentionRate; }
  } else {
    retDelta = NOW - deadline;
    if (retDelta > 0) { retStatus = "delayed"; detentionDays = Math.ceil(retDelta / DAY); detentionFees = detentionDays * m.detentionRate; }
    else retStatus = deadline - NOW < 24 * HOUR ? "watch" : "pending";
  }

  // Statut global de mission
  let status = "ontime";
  if (retStatus === "delayed") status = "delayed";
  else if (retStatus === "watch" || (kpi.waitPickup != null && kpi.waitPickup > 2 * HOUR)) status = "attention";

  // Goulot : plus longue étape hors transit & dépotage ? On flague la plus longue étape "attente/opération"
  const opStages = timeline.filter((s) => s.dur != null && !["closed"].includes(s.key));
  const maxDur = Math.max(...opStages.map((s) => s.dur), 0);

  return { timeline, kpi, deadline, ret, retStatus, retDelta, detentionDays, detentionFees, status, maxDur };
}

/* ---------- Composants UI ---------- */
const STATUS_META = {
  ontime:    { label: "À L'HEURE", fg: T.green, bg: T.greenSoft },
  attention: { label: "ATTENTION", fg: T.amber, bg: T.amberSoft },
  delayed:   { label: "EN RETARD", fg: T.red, bg: T.redSoft },
  watch:     { label: "ÉCHÉANCE PROCHE", fg: T.amber, bg: T.amberSoft },
  pending:   { label: "EN COURS", fg: T.blue, bg: T.blueSoft },
};

function Badge({ status, big }) {
  const s = STATUS_META[status];
  return (
    <span style={{
      fontFamily: T.mono, fontSize: big ? 13 : 11, fontWeight: 600, letterSpacing: "0.08em",
      color: s.fg, background: s.bg, border: `1px solid ${s.fg}33`,
      padding: big ? "6px 12px" : "3px 9px", borderRadius: 4, whiteSpace: "nowrap",
    }}>{s.label}</span>
  );
}

function Card({ children, style }) {
  return <section style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 8, padding: "18px 20px", ...style }}>{children}</section>;
}
function SectionTitle({ children, right }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
      <h2 style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: T.inkSoft, margin: 0 }}>{children}</h2>
      {right}
    </div>
  );
}
function Field({ label, value, mono }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: T.inkFaint, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13.5, color: T.ink, fontFamily: mono ? T.mono : T.sans, fontWeight: mono ? 500 : 500, overflowWrap: "break-word" }}>{value}</div>
    </div>
  );
}
function KpiTile({ label, value, sub, accent }) {
  return (
    <div style={{ padding: "12px 14px", background: accent ? T.blueSoft : "#FAFBF9", border: `1px solid ${accent ? T.blue + "30" : T.line}`, borderRadius: 6 }}>
      <div style={{ fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: accent ? T.blue : T.inkFaint }}>{label}</div>
      <div style={{ fontFamily: T.mono, fontSize: 20, fontWeight: 600, color: accent ? T.blue : T.ink, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

/* ---------- Timeline (signature : registre du temps) ---------- */
function Timeline({ c }) {
  const done = c.timeline.filter((s) => s.t != null);
  return (
    <Card>
      <SectionTitle right={<span style={{ fontSize: 11, color: T.inkFaint }}>barres ∝ temps écoulé · <span style={{ color: T.amber, fontWeight: 600 }}>■</span> = étape la plus longue</span>}>
        Chronologie de la mission
      </SectionTitle>
      <div>
        {c.timeline.map((s, i) => {
          const isMax = s.dur != null && s.dur === c.maxDur && c.maxDur > 0;
          const pct = s.dur != null && c.maxDur > 0 ? Math.max(3, (s.dur / c.maxDur) * 100) : 0;
          const pendingRow = s.t == null;
          return (
            <div key={s.key} style={{
              display: "grid", gridTemplateColumns: "16px 1fr 118px", gap: 10, alignItems: "center",
              padding: "7px 0", borderBottom: i < c.timeline.length - 1 ? `1px solid ${T.line}` : "none",
              opacity: pendingRow ? 0.45 : 1,
            }}>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <span style={{
                  width: 9, height: 9, borderRadius: "50%",
                  background: pendingRow ? "transparent" : isMax ? T.amber : T.blue,
                  border: pendingRow ? `1.5px solid ${T.inkFaint}` : "none",
                }} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, fontWeight: isMax ? 600 : 500, color: T.ink }}>{s.label}</span>
                  {s.resp && !pendingRow && <span style={{ fontSize: 10, color: T.inkFaint, letterSpacing: "0.05em" }}>{s.resp}</span>}
                  {isMax && <span style={{ fontFamily: T.mono, fontSize: 9.5, color: T.amber, fontWeight: 600, letterSpacing: "0.08em" }}>ÉTAPE LA PLUS LONGUE</span>}
                </div>
                {s.dur != null && (
                  <div style={{ height: 4, background: "#F0F1EF", borderRadius: 2, marginTop: 5, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: isMax ? T.amber : T.blue + "99", borderRadius: 2 }} />
                  </div>
                )}
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: T.mono, fontSize: 12, color: T.ink }}>{pendingRow ? "en attente" : (i === 0 || new Date(s.iso).getDate() !== new Date(done[0].iso).getDate() ? fmtDT(s.iso) : fmtTime(s.iso))}</div>
                <div style={{ fontFamily: T.mono, fontSize: 11, color: isMax ? T.amber : T.inkFaint, fontWeight: isMax ? 600 : 400 }}>{s.dur != null ? `+ ${fmtDur(s.dur)}` : i === 0 ? "—" : ""}</div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ---------- Rapport de mission ---------- */
function MissionReport({ m }) {
  const c = useMemo(() => computeMission(m), [m]);
  const e = m.events;
  const retMeta = STATUS_META[c.retStatus];

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {/* Vue d'ensemble */}
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <div style={{ fontFamily: T.mono, fontSize: 12, color: T.inkFaint, letterSpacing: "0.06em" }}>RAPPORT DE MISSION</div>
            <h1 style={{ margin: "2px 0 0", fontSize: 24, fontWeight: 700, letterSpacing: "-0.01em", color: T.ink }}>
              {m.id} <span style={{ fontFamily: T.mono, fontWeight: 500, fontSize: 16, color: T.inkSoft }}>· {m.container}</span>
            </h1>
            <div style={{ fontSize: 13, color: T.inkSoft, marginTop: 3 }}>{m.pickup} → {m.dropoff}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <Badge status={c.status} big />
            <div style={{ marginTop: 10, fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: T.inkFaint }}>Temps total de mission</div>
            <div style={{ fontFamily: T.mono, fontSize: 26, fontWeight: 600, color: T.ink, lineHeight: 1.1 }}>{fmtDur(c.kpi.total, { compact: true }) ?? "—"}</div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "12px 18px", paddingTop: 14, borderTop: `1px solid ${T.line}` }}>
          <Field label="Chargeur" value={m.shipper} />
          <Field label="Conteneur" value={`${m.ctype} · ${m.line.replace("Ligne maritime : ", "")}`} />
          <Field label="Camion" value={m.truck} mono />
          <Field label="Chauffeur" value={m.driver} />
          <Field label="Marchandise" value={m.cargo} />
          <Field label="Début mission" value={fmtDate(e.assigned)} />
          <Field label="Livraison" value={fmtDate(e.unloadEnd)} />
          <Field label="Restitution vide" value={fmtDate(e.emptyReturn)} />
          <Field label="Clôture" value={fmtDate(e.closed)} />
        </div>
      </Card>

      <Timeline c={c} />

      {/* KPIs transport */}
      <Card>
        <SectionTitle>Performance transport</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
          <KpiTile label="Transit" value={fmtDur(c.kpi.transit)} />
          <KpiTile label="Attente au chargement" value={fmtDur(c.kpi.waitPickup)} />
          <KpiTile label="Chargement" value={fmtDur(c.kpi.loading)} />
          <KpiTile label="Attente à la livraison" value={fmtDur(c.kpi.waitDrop)} />
          <KpiTile label="Déchargement" value={fmtDur(c.kpi.unloading)} />
          <KpiTile label="Attente totale" value={fmtDur(c.kpi.waitTotal)} accent />
        </div>
        {c.kpi.activePct != null && (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: T.inkSoft, marginBottom: 5 }}>
              <span>Opérations actives : <b style={{ color: T.ink }}>{c.kpi.activePct}%</b></span>
              <span>Attente / inactif : <b style={{ color: T.ink }}>{100 - c.kpi.activePct}%</b></span>
            </div>
            <div style={{ height: 8, borderRadius: 4, overflow: "hidden", display: "flex" }}>
              <div style={{ width: `${c.kpi.activePct}%`, background: T.blue }} />
              <div style={{ flex: 1, background: "#D8DCD7" }} />
            </div>
          </div>
        )}
      </Card>

      {/* Restitution du conteneur */}
      <Card style={{ borderLeft: `3px solid ${retMeta.fg}` }}>
        <SectionTitle right={<Badge status={c.retStatus} />}>Restitution du conteneur vide</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px 18px" }}>
          <Field label="Conteneur livré" value={fmtDT(e.unloadEnd)} mono />
          <Field label="Vide prêt" value={fmtDT(e.emptyReady)} mono />
          <Field label="Durée de dépotage (client)" value={fmtDur(c.kpi.depotage)} mono />
          <Field label="Échéance de restitution" value={fmtDT(m.deadline)} mono />
          <Field label="Restitution réelle" value={c.ret ? fmtDT(e.emptyReturn) : "en attente"} mono />
          <Field
            label={c.ret ? (c.retDelta <= 0 ? "Marge avant échéance" : "Retard après échéance") : (c.retDelta > 0 ? "Dépassement en cours" : "Temps restant")}
            value={<span style={{ color: (c.ret ? c.retDelta > 0 : c.retDelta > 0) ? T.red : T.green, fontWeight: 600 }}>{fmtDur(Math.abs(c.retDelta))}</span>}
            mono
          />
        </div>
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px dashed ${T.line}`, display: "flex", gap: 26, flexWrap: "wrap" }}>
          <Field label="Détention" value={c.detentionDays > 0 ? <span style={{ color: T.red, fontWeight: 600 }}>Oui</span> : "Non"} />
          <Field label="Jours de détention" value={c.detentionDays} mono />
          <Field label="Frais de détention" value={<span style={{ color: c.detentionFees ? T.red : T.ink, fontWeight: 600 }}>{c.detentionFees} $</span>} mono />
          {c.detentionDays > 0 && <Field label="Tarif" value={`${m.detentionRate} $ / jour`} mono />}
        </div>
      </Card>

      {/* Responsabilité */}
      {m.responsibility && (
        <Card style={{ background: T.redSoft, borderColor: T.red + "33" }}>
          <SectionTitle>Responsabilité du retard</SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px 18px" }}>
            <Field label="Partie responsable" value={<b>{m.responsibility.party}</b>} />
            <Field label="Motif (catégorie)" value={m.responsibility.reason} />
            <Field label="Commentaire opérationnel" value={<span style={{ color: T.inkSoft }}>{m.responsibility.comment}</span>} />
          </div>
        </Card>
      )}

      {/* Exceptions */}
      <ExceptionsPanel m={m} c={c} />
    </div>
  );
}

function ExceptionsPanel({ m, c }) {
  const ex = [];
  if (c.kpi.waitPickup != null && c.kpi.waitPickup > 2 * HOUR) ex.push({ lvl: "attention", txt: `Attente excessive au chargement : ${fmtDur(c.kpi.waitPickup)} (seuil : 2h)` });
  if (c.kpi.depotage != null && c.kpi.depotage > 3 * DAY) ex.push({ lvl: "attention", txt: `Dépotage long : ${fmtDur(c.kpi.depotage)}` });
  if (c.retStatus === "watch") ex.push({ lvl: "attention", txt: `Échéance de restitution dans ${fmtDur(Math.abs(c.retDelta))} — restitution non planifiée` });
  if (c.detentionDays > 0) ex.push({ lvl: "delayed", txt: `Détention déclenchée : ${c.detentionDays} j · ${c.detentionFees} $` });
  if (ex.length === 0) return null;
  return (
    <Card>
      <SectionTitle>Exceptions signalées</SectionTitle>
      <div style={{ display: "grid", gap: 8 }}>
        {ex.map((x, i) => (
          <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13, color: T.ink }}>
            <Badge status={x.lvl} /> {x.txt}
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ---------- Rapport mensuel ---------- */
const MONTHLY = {
  period: "Juillet 2026",
  shipper: "Djibouti Trading Co.",
  core: { total: 42, done: 39, inProgress: 3, onTime: 33, avgMission: 27.9 * HOUR, avgTransit: 4.6 * HOUR, avgWait: 1.9 * HOUR },
  containers: { delivered: 39, ready: 38, returned: 36, avgDepotage: 1.8 * DAY, avgReturn: 6.4 * HOUR, onTimeReturns: 31, lateReturns: 5 },
  detention: { cases: 5, days: 11, fees: 990 },
  stages: [
    { label: "Attente chargement", ms: 1.7 * HOUR },
    { label: "Chargement", ms: 58 * MIN },
    { label: "Transit", ms: 4.6 * HOUR },
    { label: "Attente livraison", ms: 1.4 * HOUR },
    { label: "Déchargement", ms: 47 * MIN },
    { label: "Dépotage (client)", ms: 1.8 * DAY },
    { label: "Restitution du vide", ms: 6.4 * HOUR },
  ],
  responsibility: [
    { party: "Client / Chargeur", pct: 55, cases: 3, days: 7, fees: 630 },
    { party: "Transporteur", pct: 25, cases: 1, days: 2, fees: 180 },
    { party: "Port / Terminal", pct: 10, cases: 1, days: 2, fees: 180 },
    { party: "Fleetin", pct: 10, cases: 0, days: 0, fees: 0 },
  ],
  trend: { label: "Temps moyen de mission", weeks: [30.2, 28.7, 27.9, 26.4], unit: "h", delta: -12.6 },
  trendReturns: { label: "Taux de restitution à l'heure", weeks: [78, 82, 86, 89], unit: "%", delta: +11 },
};

function pctBar(v, max, color) {
  return (
    <div style={{ height: 6, background: "#F0F1EF", borderRadius: 3, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${(v / max) * 100}%`, background: color, borderRadius: 3 }} />
    </div>
  );
}

function MonthlyReport() {
  const d = MONTHLY;
  const complRate = Math.round((d.core.done / d.core.total) * 100);
  const onTimeRate = Math.round((d.core.onTime / d.core.done) * 100);
  const onTimeReturnRate = Math.round((d.containers.onTimeReturns / d.containers.returned) * 100);
  const maxStage = Math.max(...d.stages.map((s) => s.ms));

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
          <div>
            <div style={{ fontFamily: T.mono, fontSize: 12, color: T.inkFaint, letterSpacing: "0.06em" }}>RAPPORT MENSUEL DE PERFORMANCE</div>
            <h1 style={{ margin: "2px 0 0", fontSize: 24, fontWeight: 700, color: T.ink }}>{d.shipper}</h1>
            <div style={{ fontSize: 13, color: T.inkSoft }}>{d.period} · généré automatiquement par Fleetin</div>
          </div>
          <Badge status={onTimeRate >= 80 ? "ontime" : "attention"} big />
        </div>
      </Card>

      {/* KPIs exécutifs */}
      <Card>
        <SectionTitle>Indicateurs principaux</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
          <KpiTile label="Missions" value={d.core.total} sub={`${d.core.done} terminées · ${d.core.inProgress} en cours`} />
          <KpiTile label="Taux de complétion" value={`${complRate}%`} />
          <KpiTile label="Missions à l'heure" value={`${onTimeRate}%`} sub={`${d.core.onTime} / ${d.core.done}`} accent />
          <KpiTile label="Temps moyen mission" value={fmtDur(d.core.avgMission, { compact: true })} />
          <KpiTile label="Transit moyen" value={fmtDur(d.core.avgTransit)} />
          <KpiTile label="Attente moyenne" value={fmtDur(d.core.avgWait)} />
        </div>
      </Card>

      {/* Temps moyen par étape */}
      <Card>
        <SectionTitle right={<span style={{ fontSize: 11, color: T.inkFaint }}>où le temps est consommé</span>}>Temps moyen par étape opérationnelle</SectionTitle>
        <div style={{ display: "grid", gap: 9 }}>
          {d.stages.map((s) => {
            const isMax = s.ms === maxStage;
            return (
              <div key={s.label} style={{ display: "grid", gridTemplateColumns: "170px 1fr 76px", gap: 10, alignItems: "center" }}>
                <span style={{ fontSize: 12.5, color: isMax ? T.ink : T.inkSoft, fontWeight: isMax ? 600 : 400 }}>{s.label}</span>
                {pctBar(s.ms, maxStage, isMax ? T.amber : T.blue + "99")}
                <span style={{ fontFamily: T.mono, fontSize: 12, textAlign: "right", color: isMax ? T.amber : T.ink, fontWeight: isMax ? 600 : 400 }}>{fmtDur(s.ms, { compact: true })}</span>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 10, fontSize: 11.5, color: T.inkSoft }}>
          Le <b style={{ color: T.amber }}>dépotage client</b> est le principal consommateur de temps du cycle conteneur.
        </div>
      </Card>

      {/* Conteneurs */}
      <Card>
        <SectionTitle>Performance conteneurs</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
          <KpiTile label="Livrés" value={d.containers.delivered} />
          <KpiTile label="Vides restitués" value={d.containers.returned} sub={`${d.containers.lateReturns} en retard`} />
          <KpiTile label="Restitution à l'heure" value={`${onTimeReturnRate}%`} accent />
          <KpiTile label="Dépotage moyen" value={fmtDur(d.containers.avgDepotage, { compact: true })} />
          <KpiTile label="Restitution moyenne" value={fmtDur(d.containers.avgReturn)} />
        </div>
      </Card>

      {/* Détention */}
      <Card style={{ borderLeft: `3px solid ${d.detention.cases ? T.red : T.green}` }}>
        <SectionTitle>Détention</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 16 }}>
          <KpiTile label="Cas de détention" value={d.detention.cases} />
          <KpiTile label="Jours de détention" value={d.detention.days} />
          <KpiTile label="Frais totaux" value={<span style={{ color: T.red }}>{d.detention.fees} $</span>} />
          <KpiTile label="Moyenne / cas" value={`${(d.detention.days / d.detention.cases).toFixed(1)} j`} />
        </div>
        <div style={{ fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: T.inkFaint, marginBottom: 8 }}>Analyse de responsabilité</div>
        <div style={{ display: "grid", gap: 8 }}>
          {d.responsibility.map((r) => (
            <div key={r.party} style={{ display: "grid", gridTemplateColumns: "150px 1fr 44px", gap: 10, alignItems: "center" }}>
              <span style={{ fontSize: 12.5, color: T.inkSoft }}>{r.party}</span>
              {pctBar(r.pct, 100, r.party.startsWith("Client") ? T.red + "AA" : T.inkFaint + "77")}
              <span style={{ fontFamily: T.mono, fontSize: 12, textAlign: "right", color: T.ink }}>{r.pct}%</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ color: T.inkFaint, textAlign: "left" }}>
                <th style={{ padding: "6px 8px 6px 0", fontWeight: 500 }}>Partie</th>
                <th style={{ padding: "6px 8px", fontWeight: 500, textAlign: "right" }}>Incidents</th>
                <th style={{ padding: "6px 8px", fontWeight: 500, textAlign: "right" }}>Jours</th>
                <th style={{ padding: "6px 0 6px 8px", fontWeight: 500, textAlign: "right" }}>Impact</th>
              </tr>
            </thead>
            <tbody>
              {d.responsibility.map((r) => (
                <tr key={r.party} style={{ borderTop: `1px solid ${T.line}` }}>
                  <td style={{ padding: "7px 8px 7px 0", color: T.ink }}>{r.party}</td>
                  <td style={{ padding: "7px 8px", textAlign: "right", fontFamily: T.mono }}>{r.cases}</td>
                  <td style={{ padding: "7px 8px", textAlign: "right", fontFamily: T.mono }}>{r.days}</td>
                  <td style={{ padding: "7px 0 7px 8px", textAlign: "right", fontFamily: T.mono, color: r.fees ? T.red : T.inkSoft }}>{r.fees} $</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Tendances */}
      <Card>
        <SectionTitle>Tendances du mois</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 18 }}>
          {[d.trend, d.trendReturns].map((t) => {
            const max = Math.max(...t.weeks);
            const good = t.label.includes("Taux") ? t.delta > 0 : t.delta < 0;
            return (
              <div key={t.label}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                  <span style={{ fontSize: 12.5, color: T.inkSoft }}>{t.label}</span>
                  <span style={{ fontFamily: T.mono, fontSize: 12.5, fontWeight: 600, color: good ? T.green : T.red }}>
                    {t.delta > 0 ? "↑" : "↓"} {Math.abs(t.delta)}%
                  </span>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "flex-end", height: 72 }}>
                  {t.weeks.map((w, i) => (
                    <div key={i} style={{ flex: 1, textAlign: "center" }}>
                      <div style={{ fontFamily: T.mono, fontSize: 10.5, color: T.ink, marginBottom: 3 }}>{w}{t.unit}</div>
                      <div style={{ height: (w / max) * 46, background: i === t.weeks.length - 1 ? T.blue : T.blue + "55", borderRadius: "3px 3px 0 0" }} />
                      <div style={{ fontSize: 10, color: T.inkFaint, marginTop: 3 }}>S{i + 1}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

/* ---------- Application ---------- */
export default function FleetinReports() {
  const [tab, setTab] = useState("mission");
  const [mid, setMid] = useState(MISSIONS[0].id);
  const mission = MISSIONS.find((m) => m.id === mid);
  const statuses = useMemo(() => Object.fromEntries(MISSIONS.map((m) => [m.id, computeMission(m).status])), []);

  return (
    <div style={{ minHeight: "100vh", background: T.paper, fontFamily: T.sans, color: T.ink }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        button { font-family: inherit; cursor: pointer; }
        @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
      `}</style>

      {/* Barre supérieure */}
      <header style={{ background: T.ink, color: "#fff", padding: "0 20px" }}>
        <div style={{ maxWidth: 860, margin: "0 auto", display: "flex", alignItems: "center", gap: 18, height: 52, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: "0.02em" }}>Fleetin</span>
          <span style={{ fontSize: 11.5, color: "#9AA6B5", letterSpacing: "0.06em" }}>PORTAIL CHARGEUR · RAPPORTS</span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
            {[["mission", "Rapport de mission"], ["monthly", "Rapport mensuel"]].map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} style={{
                background: tab === k ? T.blue : "transparent", color: tab === k ? "#fff" : "#B9C2CE",
                border: "none", borderRadius: 5, padding: "7px 13px", fontSize: 12.5, fontWeight: 600,
              }}>{l}</button>
            ))}
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 860, margin: "0 auto", padding: "18px 16px 40px" }}>
        {tab === "mission" && (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
              {MISSIONS.map((m) => (
                <button key={m.id} onClick={() => setMid(m.id)} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  background: mid === m.id ? T.card : "transparent",
                  border: `1px solid ${mid === m.id ? T.blue : T.line}`,
                  borderRadius: 6, padding: "7px 12px", fontSize: 12.5, fontWeight: 600, color: T.ink,
                }}>
                  <span style={{ fontFamily: T.mono }}>{m.id}</span>
                  <Badge status={statuses[m.id]} />
                </button>
              ))}
            </div>
            <MissionReport m={mission} />
          </>
        )}
        {tab === "monthly" && <MonthlyReport />}
        <footer style={{ marginTop: 22, fontSize: 11, color: T.inkFaint, textAlign: "center" }}>
          Données de démonstration · toutes les durées et KPIs sont calculés automatiquement à partir des timestamps de mission · horloge de démo : 15 août 2026, 14:30
        </footer>
      </main>
    </div>
  );
}
