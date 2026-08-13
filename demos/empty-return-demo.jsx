import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  LayoutDashboard, Repeat, ArrowLeftRight, Link2, Users, Package, Truck,
  Clock, AlertTriangle, CheckCircle2, Circle, ChevronDown, ChevronRight,
  Search, ArrowRight, RotateCcw, ShieldCheck, FileText, MapPin, Timer,
  ListChecks, X, Zap, CornerDownLeft
} from "lucide-react";

/* ================= Constantes métier ================= */

const H = 3600e3;
const NOW0 = Date.now();

const STATUSES = {
  unloading:   { label: "Déchargement",        dot: "bg-slate-400",  chip: "bg-slate-100 text-slate-700 border-slate-200" },
  empty_ready: { label: "Vide prêt",           dot: "bg-sky-500",    chip: "bg-sky-50 text-sky-800 border-sky-200" },
  preparing:   { label: "Préparation du plein", dot: "bg-violet-500", chip: "bg-violet-50 text-violet-800 border-violet-200" },
  ready:       { label: "Prêt à dispatcher",   dot: "bg-teal-600",   chip: "bg-teal-50 text-teal-800 border-teal-200" },
  in_progress: { label: "Cycle en cours",      dot: "bg-blue-600",   chip: "bg-blue-50 text-blue-800 border-blue-200" },
  completed:   { label: "Cycle terminé",       dot: "bg-emerald-600", chip: "bg-emerald-50 text-emerald-800 border-emerald-200" },
};

const RISKS = {
  safe:      { label: "Safe",      cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  watch:     { label: "Watch",     cls: "bg-amber-50 text-amber-800 border-amber-300" },
  critical:  { label: "Critical",  cls: "bg-orange-50 text-orange-800 border-orange-300" },
  at_risk:   { label: "At risk",   cls: "bg-red-50 text-red-700 border-red-300" },
  overdue:   { label: "Overdue",   cls: "bg-red-700 text-white border-red-800 animate-pulse" },
  protected: { label: "Protected", cls: "bg-teal-700 text-white border-teal-800" },
};

const MILESTONES = [
  "Plein précédent livré", "Déchargement commencé", "Vide prêt",
  "Mission pleine sélectionnée", "Booking confirmé", "Documents vérifiés",
  "Cycle assigné", "Camion dispatché", "Vide collecté", "Arrivée au hub",
  "Vide restitué", "Preuve de restitution uploadée", "Nouveau plein collecté",
  "Preuve de pickup uploadée", "Nouveau plein livré", "Cycle terminé",
];

const CHECKLIST = [
  "Mission pleine sélectionnée", "Même Location ID confirmé", "Même transporteur confirmé",
  "Camion / châssis compatible", "Deadline de restitution saisie", "Risque deadline acceptable",
  "Autorisation de restitution prête", "Référence de restitution prête",
  "Booking nouveau plein confirmé", "Delivery Order uploadé", "N° conteneur plein confirmé",
  "Type de conteneur confirmé", "Release du plein confirmée", "Fenêtre de pickup confirmée",
  "Docs port / terminal uploadés", "Transporteur informé & camion assigné",
];

const DL_STATUS = {
  verified:   { label: "Deadline vérifiée",     cls: "text-emerald-700" },
  unverified: { label: "Deadline non vérifiée", cls: "text-amber-700" },
  missing:    { label: "Deadline manquante",    cls: "text-red-700" },
};

/* ================= Données mock ================= */

const HUB = "Terminal Hub Principal (configurable)";

const INITIAL_RECORDS = [
  {
    id: "ER-101", container: "TCLU1111111", type: "40HC", line: "Maersk",
    client: "Société Alpha Import", locationId: "LOC-A", locationName: "Entrepôt Alpha — Zone Sud",
    transporter: "TransAfrica Logistics", truck: "TRK-012",
    emptyReadyAt: NOW0 - 96 * H, deadline: NOW0 - 60 * H, deadlineStatus: "verified",
    predictedGateIn: NOW0 - 82 * H, returnedAt: NOW0 - 81 * H,
    status: "completed", chainId: "CHN-001", cycleId: "CYC-0001", seq: 1,
    nextFull: { container: "MSKU2222222", type: "40HC" },
    milestone: 16, checklist: Array(16).fill(true), exception: null,
  },
  {
    id: "ER-105", container: "MSKU2222222", type: "40HC", line: "Maersk",
    client: "Société Alpha Import", locationId: "LOC-A", locationName: "Entrepôt Alpha — Zone Sud",
    transporter: "TransAfrica Logistics", truck: "TRK-014",
    emptyReadyAt: NOW0 - 20 * H, deadline: NOW0 + 30 * H, deadlineStatus: "verified",
    predictedGateIn: NOW0 - 2.5 * H, returnedAt: NOW0 - 2 * H,
    status: "in_progress", chainId: "CHN-001", cycleId: "CYC-0002", seq: 2,
    nextFull: { container: "CMAU3333333", type: "40HC" },
    milestone: 12, checklist: Array(16).fill(true), exception: null,
  },
  {
    id: "ER-106", container: "MSCU4433221", type: "20GP", line: "MSC",
    client: "Beta Trading", locationId: "LOC-B", locationName: "Plateforme Beta — Zone Franche",
    transporter: "RedSea Freight", truck: null,
    emptyReadyAt: NOW0 - 3 * H, deadline: NOW0 + 14 * H, deadlineStatus: "verified",
    predictedGateIn: NOW0 + 4 * H, returnedAt: null,
    status: "empty_ready", chainId: null, cycleId: null, seq: null,
    nextFull: null, milestone: 3, checklist: Array(16).fill(false), exception: null,
  },
  {
    id: "ER-107", container: "CMAU9988776", type: "40HC", line: "CMA CGM",
    client: "Gamma Distribution", locationId: "LOC-C", locationName: "Dépôt Gamma — RN1",
    transporter: "TransAfrica Logistics", truck: null,
    emptyReadyAt: null, deadline: NOW0 + 70 * H, deadlineStatus: "unverified",
    predictedGateIn: NOW0 + 12 * H, returnedAt: null,
    status: "unloading", chainId: null, cycleId: null, seq: null,
    nextFull: null, milestone: 2, checklist: Array(16).fill(false), exception: null,
  },
  {
    id: "ER-108", container: "HLXU1212121", type: "40HC", line: "Hapag-Lloyd",
    client: "Beta Trading", locationId: "LOC-B", locationName: "Plateforme Beta — Zone Franche",
    transporter: "RedSea Freight", truck: null,
    emptyReadyAt: NOW0 - 10 * H, deadline: NOW0 + 5 * H, deadlineStatus: "verified",
    predictedGateIn: NOW0 + 6.5 * H, returnedAt: null,
    status: "empty_ready", chainId: null, cycleId: null, seq: null,
    nextFull: null, milestone: 3, checklist: Array(16).fill(false),
    exception: "Retour à vide obligatoire",
  },
  {
    id: "ER-109", container: "MSKU7070707", type: "20GP", line: "Maersk",
    client: "Delta Négoce", locationId: "LOC-D", locationName: "Hub logistique Delta",
    transporter: "Horizon Transit", truck: "TRK-233",
    emptyReadyAt: NOW0 - 8 * H, deadline: NOW0 + 5.5 * H, deadlineStatus: "verified",
    predictedGateIn: NOW0 + 1.5 * H, returnedAt: null,
    status: "ready", chainId: "CHN-002", cycleId: "CYC-0004", seq: 1,
    nextFull: { container: "ONEU5544332", type: "20GP" },
    milestone: 7, checklist: Array(16).fill(true), exception: null,
  },
  {
    id: "ER-110", container: "ONEU3434343", type: "40HC", line: "ONE",
    client: "Société Alpha Import", locationId: "LOC-A", locationName: "Entrepôt Alpha — Zone Sud",
    transporter: "Horizon Transit", truck: null,
    emptyReadyAt: NOW0 - 30 * H, deadline: NOW0 - 7 * H, deadlineStatus: "verified",
    predictedGateIn: NOW0 + 3 * H, returnedAt: null,
    status: "empty_ready", chainId: null, cycleId: null, seq: null,
    nextFull: null, milestone: 3, checklist: Array(16).fill(false),
    exception: "Deadline dépassée",
  },
  {
    id: "ER-111", container: "MSCU6161616", type: "20GP", line: "MSC",
    client: "Gamma Distribution", locationId: "LOC-C", locationName: "Dépôt Gamma — RN1",
    transporter: "RedSea Freight", truck: null,
    emptyReadyAt: null, deadline: null, deadlineStatus: "missing",
    predictedGateIn: NOW0 + 20 * H, returnedAt: null,
    status: "unloading", chainId: null, cycleId: null, seq: null,
    nextFull: null, milestone: 2, checklist: Array(16).fill(false),
    exception: "Deadline manquante",
  },
];

const INITIAL_MISSIONS = [
  {
    id: "FM-210", container: "MSCU8811223", type: "20GP", line: "MSC",
    client: "Beta Trading", locationId: "LOC-B", locationName: "Plateforme Beta — Zone Franche",
    pickupHub: HUB, pickupAt: NOW0 + 6 * H, window: "08:00 – 12:00",
    doStatus: "verified", booking: "confirmed", release: "confirmed",
  },
  {
    id: "FM-211", container: "HLXU6600441", type: "40HC", line: "Hapag-Lloyd",
    client: "Beta Trading", locationId: "LOC-B", locationName: "Plateforme Beta — Zone Franche",
    pickupHub: HUB, pickupAt: NOW0 + 10 * H, window: "13:00 – 17:00",
    doStatus: "pending", booking: "pending", release: "pending",
  },
  {
    id: "FM-212", container: "MSKU5522110", type: "20GP", line: "Maersk",
    client: "Epsilon SARL", locationId: "LOC-E", locationName: "Zone Epsilon — Port Sec",
    pickupHub: HUB, pickupAt: NOW0 + 9 * H, window: "09:00 – 13:00",
    doStatus: "verified", booking: "confirmed", release: "pending",
  },
  {
    id: "FM-213", container: "CMAU7788990", type: "40HC", line: "CMA CGM",
    client: "Société Alpha Import", locationId: "LOC-A", locationName: "Entrepôt Alpha — Zone Sud",
    pickupHub: HUB, pickupAt: NOW0 + 8 * H, window: "10:00 – 14:00",
    doStatus: "verified", booking: "confirmed", release: "confirmed",
  },
];

/* ================= Helpers ================= */

function riskOf(r, now) {
  if (r.returnedAt && r.deadline && r.returnedAt <= r.deadline) return { key: "protected", ...RISKS.protected };
  if (!r.deadline) return null;
  if (now > r.deadline && !r.returnedAt) return { key: "overdue", ...RISKS.overdue };
  const slack = r.deadline - (r.predictedGateIn ?? now);
  if (slack < 0) return { key: "at_risk", ...RISKS.at_risk };
  if (slack < 6 * H) return { key: "critical", ...RISKS.critical };
  if (slack < 12 * H) return { key: "watch", ...RISKS.watch };
  return { key: "safe", ...RISKS.safe };
}

function slackOf(r, now) {
  if (!r.deadline) return null;
  return r.deadline - (r.returnedAt ?? r.predictedGateIn ?? now);
}

function fmtDur(ms) {
  if (ms == null) return "—";
  const neg = ms < 0; const a = Math.abs(ms);
  const hh = Math.floor(a / H); const mm = Math.floor((a % H) / 60000);
  return `${neg ? "−" : "+"}${hh}h${String(mm).padStart(2, "0")}`;
}

function fmtDT(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }) + " " +
    d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

const Mono = ({ children, className = "" }) => (
  <span className={`font-mono tracking-tight ${className}`}>{children}</span>
);

const Badge = ({ risk }) => risk ? (
  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-semibold ${risk.cls}`}>
    <Timer size={11} /> {risk.label}
  </span>
) : <span className="text-xs text-slate-400">—</span>;

const StatusChip = ({ status }) => {
  const s = STATUSES[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-xs font-medium ${s.chip}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} /> {s.label}
    </span>
  );
};

/* Élément signature : la paire du cycle (vide ↩ / plein →) */
const CyclePair = ({ empty, full, small }) => (
  <div className={`inline-flex items-stretch rounded-lg overflow-hidden border border-slate-300 ${small ? "text-[11px]" : "text-xs"}`}>
    <div className="flex items-center gap-1 bg-slate-800 text-slate-100 px-2 py-1">
      <CornerDownLeft size={11} className="text-slate-400" />
      <Mono>{empty}</Mono>
    </div>
    <div className="flex items-center gap-1 bg-teal-700 text-white px-2 py-1">
      <ArrowRight size={11} className="text-teal-200" />
      <Mono>{full || "à sélectionner"}</Mono>
    </div>
  </div>
);

/* ================= Application ================= */

export default function App() {
  const [records, setRecords] = useState(INITIAL_RECORDS);
  const [missions, setMissions] = useState(INITIAL_MISSIONS);
  const [view, setView] = useState("dashboard");
  const [expanded, setExpanded] = useState(null);
  const [filters, setFilters] = useState({ q: "", status: "all", risk: "all" });
  const [matchSel, setMatchSel] = useState("ER-106");
  const [sameLocOnly, setSameLocOnly] = useState(true);
  const [now, setNow] = useState(NOW0);
  const [toast, setToast] = useState(null);
  const counters = useRef({ cycle: 5, chain: 3, er: 120 });

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const notify = (msg) => { setToast(msg); setTimeout(() => setToast(null), 4200); };
  const upd = (id, patch) => setRecords(rs => rs.map(r => r.id === id ? { ...r, ...(typeof patch === "function" ? patch(r) : patch) } : r));

  /* ---------- Actions métier ---------- */

  const markEmptyReady = (id) => {
    upd(id, { status: "empty_ready", milestone: 3, emptyReadyAt: Date.now() });
    notify("Vide prêt confirmé — tâche « Préparer la prochaine mission pleine » créée pour Operations.");
  };

  const markStandalone = (id) => {
    upd(id, { exception: "Retour à vide obligatoire" });
    notify("Cutoff sécurité atteint : retour à vide standalone requis. Le matching est arrêté pour ce conteneur.");
  };

  const createCycle = (recId, mission) => {
    const rec = records.find(r => r.id === recId);
    const cycleId = `CYC-${String(counters.current.cycle++).padStart(4, "0")}`;
    const existing = records.find(r => r.chainId && r.transporter === rec.transporter && r.locationId === rec.locationId && r.status !== "completed" && r.id !== recId);
    const prevSeq = records.filter(r => r.chainId && r.transporter === rec.transporter && r.locationId === rec.locationId).length;
    const chainId = existing ? existing.chainId : `CHN-${String(counters.current.chain++).padStart(3, "0")}`;
    const checklist = CHECKLIST.map((_, i) => {
      if (i === 0) return true;
      if (i === 1) return mission.locationId === rec.locationId;
      if (i === 2) return true;
      if (i === 4) return !!rec.deadline;
      if (i === 5) return ["safe", "watch"].includes(riskOf(rec, now)?.key);
      if (i === 8) return mission.booking === "confirmed";
      if (i === 9) return mission.doStatus === "verified";
      if (i === 10 || i === 11) return true;
      if (i === 12) return mission.release === "confirmed";
      return false;
    });
    upd(recId, {
      status: "preparing", milestone: 4, cycleId, chainId, seq: prevSeq + 1,
      nextFull: { container: mission.container, type: mission.type, missionId: mission.id, client: mission.client },
      checklist,
    });
    setMissions(ms => ms.filter(m => m.id !== mission.id));
    setView("cycles"); setExpanded(recId); setFilters({ q: "", status: "all", risk: "all" });
    notify(`Cycle ${cycleId} créé dans la chaîne ${chainId} — sélection manuelle confirmée par Operations.`);
  };

  const toggleCheck = (id, i) => upd(id, r => ({ checklist: r.checklist.map((v, j) => j === i ? !v : v) }));

  const confirmCycle = (id) => {
    upd(id, { status: "ready", milestone: 7 });
    notify("Checklist complète — cycle prêt à dispatcher.");
  };

  const dispatch = (id) => {
    upd(id, r => ({ status: "in_progress", milestone: 8, truck: r.truck || "TRK-108" }));
    notify("Camion dispatché — le cycle est en cours d'exécution.");
  };

  const advance = (id) => {
    const rec = records.find(r => r.id === id);
    const m = rec.milestone + 1;
    if (m >= 16) {
      upd(id, { milestone: 16, status: "completed" });
      const nid = `ER-${counters.current.er++}`;
      const spawned = {
        id: nid, container: rec.nextFull.container, type: rec.nextFull.type, line: rec.line,
        client: rec.client, locationId: rec.locationId, locationName: rec.locationName,
        transporter: rec.transporter, truck: null,
        emptyReadyAt: null, deadline: null, deadlineStatus: "missing",
        predictedGateIn: Date.now() + 18 * H, returnedAt: null,
        status: "unloading", chainId: null, cycleId: null, seq: null,
        nextFull: null, milestone: 2, checklist: Array(16).fill(false),
        exception: "Deadline manquante",
      };
      setRecords(rs => [...rs.map(r => r.id === id ? { ...r, milestone: 16, status: "completed" } : r), spawned]);
      notify(`Cycle ${rec.cycleId} terminé — boucle : nouvel enregistrement ${nid} créé pour ${rec.nextFull.container} (statut Déchargement, deadline à saisir).`);
      return;
    }
    const patch = { milestone: m };
    if (m === 11) patch.returnedAt = Date.now();
    upd(id, patch);
    notify(`Jalon atteint : ${MILESTONES[m - 1]}${m === 11 ? " — deadline protégée, horodatage + GPS capturés." : ""}`);
  };

  /* ---------- Données dérivées ---------- */

  const kpis = useMemo(() => ({
    empty_ready: records.filter(r => r.status === "empty_ready" && !r.exception).length,
    assigned: records.filter(r => ["ready", "in_progress"].includes(r.status)).length,
    standalone: records.filter(r => r.exception === "Retour à vide obligatoire").length,
    critical: records.filter(r => ["critical", "at_risk"].includes(riskOf(r, now)?.key) && r.status !== "completed").length,
    overdue: records.filter(r => riskOf(r, now)?.key === "overdue").length,
  }), [records, now]);

  const filtered = records.filter(r => {
    const risk = riskOf(r, now)?.key;
    if (filters.status !== "all" && r.status !== filters.status) return false;
    if (filters.risk !== "all") {
      if (filters.risk === "crit" && !["critical", "at_risk"].includes(risk)) return false;
      else if (filters.risk !== "crit" && risk !== filters.risk) return false;
    }
    if (filters.q) {
      const q = filters.q.toLowerCase();
      const hay = [r.container, r.nextFull?.container, r.client, r.transporter, r.cycleId, r.chainId, r.locationId, r.line, r.type].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => (slackOf(a, now) ?? Infinity) - (slackOf(b, now) ?? Infinity));

  const chains = useMemo(() => {
    const map = {};
    records.filter(r => r.chainId).forEach(r => { (map[r.chainId] = map[r.chainId] || []).push(r); });
    return Object.entries(map).map(([id, cs]) => ({ id, cycles: cs.sort((a, b) => a.seq - b.seq) }));
  }, [records]);

  const transporters = useMemo(() => {
    const map = {};
    records.forEach(r => {
      const t = (map[r.transporter] = map[r.transporter] || { name: r.transporter, total: 0, done: 0, active: 0, onTime: 0, withDl: 0, standalone: 0, longest: 0, containers: new Set() });
      t.containers.add(r.container);
      if (r.cycleId) {
        t.total++;
        if (r.status === "completed") {
          t.done++;
          if (r.deadline) { t.withDl++; if (r.returnedAt && r.returnedAt <= r.deadline) t.onTime++; }
        } else t.active++;
        t.longest = Math.max(t.longest, r.seq || 0);
      }
      if (r.exception === "Retour à vide obligatoire") t.standalone++;
    });
    return Object.values(map);
  }, [records]);

  const goFiltered = (preset) => { setFilters(preset); setView("cycles"); setExpanded(null); };

  /* ---------- UI ---------- */

  const NAV = [
    { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { key: "cycles", label: "Cycles", icon: Repeat },
    { key: "matching", label: "Matching", icon: ArrowLeftRight },
    { key: "chains", label: "Chaînes", icon: Link2 },
    { key: "transporters", label: "Transporteurs", icon: Users },
  ];

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex" style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>

      {/* ===== Rail de navigation ===== */}
      <aside className="w-52 shrink-0 bg-slate-900 text-slate-300 flex flex-col">
        <div className="px-4 py-5 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-teal-600 flex items-center justify-center">
              <Repeat size={16} className="text-white" />
            </div>
            <div>
              <div className="text-white font-bold text-sm leading-none">Fleetin Ops</div>
              <div className="text-[10px] uppercase tracking-widest text-teal-400 mt-1">Retours à vide</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 py-3">
          {NAV.map(n => (
            <button key={n.key} onClick={() => setView(n.key)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${view === n.key ? "bg-slate-800 text-white border-l-2 border-teal-500" : "hover:bg-slate-800/60 border-l-2 border-transparent"}`}>
              <n.icon size={16} /> {n.label}
              {n.key === "matching" && kpis.empty_ready > 0 && (
                <span className="ml-auto bg-sky-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5">{kpis.empty_ready}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="px-4 py-3 text-[10px] text-slate-500 border-t border-slate-800 leading-relaxed">
          Démo — données simulées.<br />Hub de restitution : configurable.
        </div>
      </aside>

      {/* ===== Contenu ===== */}
      <main className="flex-1 min-w-0">
        <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between sticky top-0 z-10">
          <div>
            <h1 className="font-bold text-base">{NAV.find(n => n.key === view)?.label}</h1>
            <p className="text-xs text-slate-500">Module retours à vide & cycles répétitifs — vue interne Operations</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Clock size={13} />
            <Mono>{new Date(now).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</Mono>
          </div>
        </header>

        <div className="p-6 space-y-5">
          {view === "dashboard" && <Dashboard />}
          {view === "cycles" && <Cycles />}
          {view === "matching" && <Matching />}
          {view === "chains" && <Chains />}
          {view === "transporters" && <Transporters />}
        </div>
      </main>

      {toast && (
        <div className="fixed bottom-5 right-5 max-w-sm bg-slate-900 text-white text-sm rounded-lg shadow-xl px-4 py-3 flex items-start gap-2 z-50">
          <CheckCircle2 size={16} className="text-teal-400 mt-0.5 shrink-0" />
          <span>{toast}</span>
          <button onClick={() => setToast(null)} className="ml-1 text-slate-400 hover:text-white"><X size={14} /></button>
        </div>
      )}
    </div>
  );

  /* ================= Vues ================= */

  function Dashboard() {
    const cards = [
      { k: "empty_ready", label: "Vides prêts", val: kpis.empty_ready, icon: Package, cls: "border-sky-300", preset: { q: "", status: "empty_ready", risk: "all" } },
      { k: "assigned", label: "Cycles assignés", val: kpis.assigned, icon: Repeat, cls: "border-teal-300", preset: { q: "", status: "all", risk: "all" } },
      { k: "standalone", label: "Retours standalone requis", val: kpis.standalone, icon: RotateCcw, cls: "border-violet-300", preset: { q: "obligatoire", status: "all", risk: "all" } },
      { k: "critical", label: "Retours critiques", val: kpis.critical, icon: AlertTriangle, cls: "border-orange-300", preset: { q: "", status: "all", risk: "crit" } },
      { k: "overdue", label: "Retours overdue", val: kpis.overdue, icon: Zap, cls: "border-red-400", preset: { q: "", status: "all", risk: "overdue" } },
    ];
    const urgent = records.filter(r => r.status !== "completed" && r.deadline && !r.returnedAt)
      .sort((a, b) => slackOf(a, now) - slackOf(b, now)).slice(0, 5);

    return (
      <>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {cards.map(c => (
            <button key={c.k} onClick={() => goFiltered(c.preset)}
              className={`bg-white rounded-xl border-2 ${c.cls} p-4 text-left hover:shadow-md transition-shadow`}>
              <div className="flex items-center justify-between text-slate-500">
                <c.icon size={16} />
                <ChevronRight size={14} />
              </div>
              <div className="text-3xl font-bold mt-2"><Mono>{c.val}</Mono></div>
              <div className="text-xs text-slate-600 mt-1 leading-tight">{c.label}</div>
            </button>
          ))}
        </div>

        <div className="grid lg:grid-cols-2 gap-5">
          <section className="bg-white rounded-xl border border-slate-200">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
              <Timer size={15} className="text-orange-600" />
              <h2 className="font-semibold text-sm">Risque deadline — les plus urgents</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {urgent.map(r => {
                const risk = riskOf(r, now);
                return (
                  <button key={r.id} onClick={() => { setView("cycles"); setExpanded(r.id); setFilters({ q: r.container, status: "all", risk: "all" }); }}
                    className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 text-left">
                    <div>
                      <Mono className="text-sm font-semibold">{r.container}</Mono>
                      <div className="text-[11px] text-slate-500">{r.client} · {r.locationId} · {r.transporter}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="text-[10px] uppercase tracking-wide text-slate-400">Slack</div>
                        <Mono className={`text-sm font-bold ${slackOf(r, now) < 0 ? "text-red-600" : slackOf(r, now) < 6 * H ? "text-orange-600" : "text-slate-700"}`}>
                          {fmtDur(slackOf(r, now))}
                        </Mono>
                      </div>
                      <Badge risk={risk} />
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="bg-white rounded-xl border border-slate-200">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
              <ShieldCheck size={15} className="text-teal-700" />
              <h2 className="font-semibold text-sm">Protection deadline — règles actives</h2>
            </div>
            <div className="p-4 text-sm text-slate-600 space-y-3">
              <p>
                <span className="font-semibold text-slate-800">Slack deadline</span> = Deadline de restitution − Gate-in prévu
                (trajet vers le client + collecte + trajet hub + traitement hub + buffer de sécurité).
              </p>
              <p>
                Au <span className="font-semibold text-slate-800">cutoff sécurité</span>, le matching s'arrête : le système alerte
                Operations et bascule le retour en <span className="font-semibold">standalone</span>. La protection de la deadline
                prime toujours sur le matching.
              </p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {Object.entries(RISKS).map(([k, v]) => (
                  <span key={k} className={`px-2 py-0.5 rounded-full border text-[11px] font-semibold ${v.cls}`}>{v.label}</span>
                ))}
              </div>
              <p className="text-[11px] text-slate-400">Seuils configurables — valeurs initiales : Safe &gt; 12h · Watch 6–12h · Critical 0–6h.</p>
            </div>
          </section>
        </div>
      </>
    );
  }

  function Cycles() {
    return (
      <>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-48">
            <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
            <input value={filters.q} onChange={e => setFilters(f => ({ ...f, q: e.target.value }))}
              placeholder="Conteneur, cycle, chaîne, client, transporteur…"
              className="w-full bg-white border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
          </div>
          <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
            className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm">
            <option value="all">Tous les statuts</option>
            {Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={filters.risk} onChange={e => setFilters(f => ({ ...f, risk: e.target.value }))}
            className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm">
            <option value="all">Tous les risques</option>
            <option value="crit">Critical + At risk</option>
            <option value="overdue">Overdue</option>
            <option value="watch">Watch</option>
            <option value="safe">Safe</option>
            <option value="protected">Protected</option>
          </select>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
            <div className="col-span-2">Cycle / Chaîne</div>
            <div className="col-span-3">Paire du cycle</div>
            <div className="col-span-2">Client · Lieu</div>
            <div className="col-span-2">Deadline · Slack</div>
            <div className="col-span-1">Risque</div>
            <div className="col-span-2">Statut</div>
          </div>
          {filtered.length === 0 && (
            <div className="p-8 text-center text-sm text-slate-500">Aucun enregistrement ne correspond à ces filtres.</div>
          )}
          {filtered.map(r => {
            const risk = riskOf(r, now);
            const open = expanded === r.id;
            const done = r.checklist.filter(Boolean).length;
            return (
              <div key={r.id} className="border-b border-slate-100 last:border-0">
                <button onClick={() => setExpanded(open ? null : r.id)}
                  className={`w-full grid grid-cols-12 gap-2 px-4 py-3 items-center text-left hover:bg-slate-50 ${open ? "bg-slate-50" : ""}`}>
                  <div className="col-span-2 flex items-center gap-2">
                    {open ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
                    <div>
                      <Mono className="text-sm font-semibold">{r.cycleId || r.id}</Mono>
                      <div className="text-[10px] text-slate-500">
                        {r.chainId ? <>Chaîne <Mono>{r.chainId}</Mono> · Cycle {r.seq}</> : "Hors cycle"}
                      </div>
                    </div>
                  </div>
                  <div className="col-span-3"><CyclePair empty={r.container} full={r.nextFull?.container} small /></div>
                  <div className="col-span-2 text-xs">
                    <div className="font-medium">{r.client}</div>
                    <div className="text-slate-500 flex items-center gap-1"><MapPin size={10} /> {r.locationId} · {r.transporter}</div>
                  </div>
                  <div className="col-span-2 text-xs">
                    <Mono>{fmtDT(r.deadline)}</Mono>
                    <div className={`font-mono font-bold ${(slackOf(r, now) ?? 0) < 0 ? "text-red-600" : "text-slate-600"}`}>{fmtDur(slackOf(r, now))}</div>
                  </div>
                  <div className="col-span-1"><Badge risk={risk} /></div>
                  <div className="col-span-2 space-y-1">
                    <StatusChip status={r.status} />
                    {r.exception && (
                      <div className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-700 bg-red-50 border border-red-200 rounded px-1.5 py-0.5">
                        <AlertTriangle size={10} /> {r.exception}
                      </div>
                    )}
                  </div>
                </button>

                {open && <RowDetail r={r} risk={risk} done={done} />}
              </div>
            );
          })}
        </div>
      </>
    );
  }

  function RowDetail({ r, risk, done }) {
    const canPrepareChecklist = r.status === "preparing";
    const allDone = r.checklist.every(Boolean);
    return (
      <div className="px-6 pb-5 pt-1 bg-slate-50 grid lg:grid-cols-3 gap-5">
        {/* Timeline */}
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5"><Clock size={12} /> Timeline — 16 jalons</h3>
          <ol className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
            {MILESTONES.map((m, i) => {
              const ok = i < r.milestone;
              const current = i === r.milestone;
              return (
                <li key={i} className={`flex items-center gap-2 text-xs ${ok ? "text-slate-700" : current ? "text-teal-800 font-semibold" : "text-slate-400"}`}>
                  {ok ? <CheckCircle2 size={13} className="text-emerald-600 shrink-0" /> : <Circle size={13} className={current ? "text-teal-600 shrink-0" : "text-slate-300 shrink-0"} />}
                  <span className="w-5 text-[10px] font-mono text-slate-400">{i + 1}</span> {m}
                </li>
              );
            })}
          </ol>
          {r.status === "in_progress" && (
            <button onClick={() => advance(r.id)} className="mt-3 w-full bg-teal-700 hover:bg-teal-600 text-white text-xs font-semibold rounded-lg py-2 flex items-center justify-center gap-1.5">
              <ArrowRight size={13} /> Jalon suivant : {MILESTONES[r.milestone]}
            </button>
          )}
        </div>

        {/* Checklist */}
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5"><ListChecks size={12} /> Checklist de préparation</h3>
          <div className="flex items-center gap-2 mb-3">
            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-teal-600 transition-all" style={{ width: `${(done / 16) * 100}%` }} />
            </div>
            <Mono className="text-xs font-bold">{done}/16</Mono>
          </div>
          <ul className="space-y-1 max-h-56 overflow-y-auto pr-1">
            {CHECKLIST.map((c, i) => (
              <li key={i}>
                <button disabled={!canPrepareChecklist} onClick={() => toggleCheck(r.id, i)}
                  className={`w-full flex items-center gap-2 text-xs text-left rounded px-1 py-0.5 ${canPrepareChecklist ? "hover:bg-slate-50" : "cursor-default"} ${r.checklist[i] ? "text-slate-700" : "text-red-700"}`}>
                  {r.checklist[i] ? <CheckCircle2 size={13} className="text-emerald-600 shrink-0" /> : <Circle size={13} className="text-red-300 shrink-0" />}
                  {c}
                </button>
              </li>
            ))}
          </ul>
          {canPrepareChecklist && (
            allDone ? (
              <button onClick={() => confirmCycle(r.id)} className="mt-3 w-full bg-teal-700 hover:bg-teal-600 text-white text-xs font-semibold rounded-lg py-2">
                Confirmer le cycle → Prêt à dispatcher
              </button>
            ) : (
              <p className="mt-3 text-[11px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">
                Dispatch bloqué : {16 - done} exigence(s) manquante(s). Cochez les éléments préparés par Operations.
              </p>
            )
          )}
          {r.status === "ready" && (
            <button onClick={() => dispatch(r.id)} className="mt-3 w-full bg-blue-700 hover:bg-blue-600 text-white text-xs font-semibold rounded-lg py-2 flex items-center justify-center gap-1.5">
              <Truck size={13} /> Dispatcher le camion
            </button>
          )}
        </div>

        {/* Infos + actions */}
        <div className="bg-white rounded-lg border border-slate-200 p-4 text-xs space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1 flex items-center gap-1.5"><FileText size={12} /> Détails & documents</h3>
          {[
            ["Conteneur vide", <Mono key="a">{r.container} · {r.type} · {r.line}</Mono>],
            ["Prochain plein", r.nextFull ? <Mono key="b">{r.nextFull.container} · {r.nextFull.type}</Mono> : "à sélectionner"],
            ["Hub restitution / pickup", HUB],
            ["Transporteur · Camion", `${r.transporter} · ${r.truck || "non assigné"}`],
            ["Vide prêt le", fmtDT(r.emptyReadyAt)],
            ["Gate-in prévu", fmtDT(r.predictedGateIn)],
            ["Vide restitué le", fmtDT(r.returnedAt)],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-2 border-b border-slate-50 pb-1">
              <span className="text-slate-500">{k}</span><span className="font-medium text-right">{v}</span>
            </div>
          ))}
          <div className="flex justify-between gap-2 pb-1">
            <span className="text-slate-500">Statut deadline</span>
            <span className={`font-semibold ${DL_STATUS[r.deadlineStatus].cls}`}>{DL_STATUS[r.deadlineStatus].label}</span>
          </div>
          <p className="text-[10px] text-slate-400 pt-1">
            Restitution du vide et pickup du plein = deux événements opérationnels distincts (références et documents séparés), même adresse hub.
          </p>
          <div className="pt-2 flex flex-col gap-2">
            {r.status === "unloading" && (
              <button onClick={() => markEmptyReady(r.id)} className="bg-sky-600 hover:bg-sky-500 text-white font-semibold rounded-lg py-2">
                Confirmer « Vide prêt » (déchargement terminé)
              </button>
            )}
            {r.status === "empty_ready" && !r.exception && (
              <>
                <button onClick={() => { setMatchSel(r.id); setView("matching"); }} className="bg-teal-700 hover:bg-teal-600 text-white font-semibold rounded-lg py-2">
                  Ouvrir le matching manuel
                </button>
                <button onClick={() => markStandalone(r.id)} className="bg-white border border-red-300 text-red-700 hover:bg-red-50 font-semibold rounded-lg py-2">
                  Déclencher un retour standalone
                </button>
              </>
            )}
            {["critical", "at_risk", "overdue"].includes(risk?.key) && r.status !== "completed" && (
              <p className="text-[11px] text-orange-800 bg-orange-50 border border-orange-200 rounded px-2 py-1.5 flex items-start gap-1.5">
                <AlertTriangle size={12} className="mt-0.5 shrink-0" /> Cutoff sécurité proche ou dépassé : la protection deadline prime sur le matching.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  function Matching() {
    const eligible = records.filter(r => r.status === "empty_ready");
    const sel = records.find(r => r.id === matchSel && r.status === "empty_ready") || eligible[0];
    const candidates = sel ? missions.filter(m => !sameLocOnly || m.locationId === sel.locationId) : [];

    return (
      <div className="grid lg:grid-cols-12 gap-5">
        {/* Sélecteur de vide */}
        <div className="lg:col-span-3 space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Vides prêts ({eligible.length})</h2>
          {eligible.map(r => (
            <button key={r.id} onClick={() => setMatchSel(r.id)}
              className={`w-full text-left bg-white rounded-lg border p-3 hover:shadow-sm ${sel?.id === r.id ? "border-teal-600 ring-1 ring-teal-600" : "border-slate-200"}`}>
              <Mono className="text-sm font-semibold">{r.container}</Mono>
              <div className="text-[11px] text-slate-500">{r.type} · {r.locationId} · {r.transporter}</div>
              <div className="mt-1 flex items-center justify-between">
                <Badge risk={riskOf(r, now)} />
                {r.exception && <span className="text-[10px] text-red-700 font-semibold">⚠ {r.exception}</span>}
              </div>
            </button>
          ))}
          {eligible.length === 0 && <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-lg p-4">Aucun vide prêt. Confirmez un déchargement dans la vue Cycles.</p>}
        </div>

        {sel && (
          <>
            {/* Panneau gauche : conteneur vide */}
            <div className="lg:col-span-4 bg-slate-900 text-slate-200 rounded-xl p-5 self-start">
              <div className="flex items-center gap-2 text-teal-400 text-[10px] uppercase tracking-widest font-bold mb-3">
                <CornerDownLeft size={12} /> Conteneur vide à restituer
              </div>
              <Mono className="text-2xl font-bold text-white">{sel.container}</Mono>
              <div className="text-sm text-slate-400 mb-4">{sel.type} · {sel.line}</div>
              <dl className="space-y-2 text-xs">
                {[
                  ["Lieu actuel", `${sel.locationName} (${sel.locationId})`],
                  ["Vide prêt depuis", fmtDT(sel.emptyReadyAt)],
                  ["Deadline restitution", fmtDT(sel.deadline)],
                  ["Vérification deadline", DL_STATUS[sel.deadlineStatus].label],
                  ["Gate-in prévu", fmtDT(sel.predictedGateIn)],
                  ["Transporteur responsable", sel.transporter],
                  ["Hub de restitution", HUB],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3 border-b border-slate-800 pb-1.5">
                    <dt className="text-slate-500">{k}</dt><dd className="text-right font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-4 flex items-center justify-between bg-slate-800 rounded-lg px-3 py-2.5">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">Slack deadline</div>
                  <Mono className={`text-xl font-bold ${(slackOf(sel, now) ?? 0) < 6 * H ? "text-orange-400" : "text-emerald-400"}`}>{fmtDur(slackOf(sel, now))}</Mono>
                </div>
                <Badge risk={riskOf(sel, now)} />
              </div>
              <p className="text-[10px] text-slate-500 mt-3">
                Règle : même transporteur que la livraison d'origine. La sélection de la mission est manuelle — le système filtre et affiche, Operations décide.
              </p>
            </div>

            {/* Panneau droit : missions pleines */}
            <div className="lg:col-span-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <ArrowRight size={12} /> Missions pleines ouvertes ({candidates.length})
                </h2>
                <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                  <input type="checkbox" checked={sameLocOnly} onChange={e => setSameLocOnly(e.target.checked)} className="accent-teal-700" />
                  Même Location ID uniquement
                </label>
              </div>
              {candidates.length === 0 && (
                <div className="bg-white border border-slate-200 rounded-xl p-5 text-sm text-slate-500">
                  Aucune mission compatible. Continuez la recherche jusqu'au cutoff sécurité, puis déclenchez un retour standalone.
                </div>
              )}
              {candidates.map(m => {
                const sameLoc = m.locationId === sel.locationId;
                const typeOk = m.type === sel.type;
                const docsOk = m.doStatus === "verified" && m.booking === "confirmed" && m.release === "confirmed";
                const feasible = sel.deadline ? (sel.predictedGateIn ?? now) < sel.deadline : false;
                const eligibleM = sameLoc && !sel.exception;
                const chip = (ok, txt) => (
                  <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${ok ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"}`}>
                    {ok ? <CheckCircle2 size={10} /> : <X size={10} />} {txt}
                  </span>
                );
                return (
                  <div key={m.id} className="bg-white rounded-xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <Mono className="text-sm font-bold">{m.container}</Mono>
                        <span className="text-xs text-slate-500 ml-2">{m.type} · {m.line} · <Mono>{m.id}</Mono></span>
                        <div className="text-xs text-slate-600 mt-0.5">{m.client} → {m.locationName} ({m.locationId})</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">Pickup : {fmtDT(m.pickupAt)} · fenêtre {m.window} · {m.pickupHub}</div>
                      </div>
                      <button disabled={!eligibleM}
                        onClick={() => createCycle(sel.id, m)}
                        className={`shrink-0 text-xs font-semibold rounded-lg px-3 py-2 flex items-center gap-1.5 ${eligibleM ? "bg-teal-700 hover:bg-teal-600 text-white" : "bg-slate-100 text-slate-400 cursor-not-allowed"}`}>
                        <Repeat size={13} /> Créer le cycle
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {chip(sameLoc, sameLoc ? "Même Location ID" : `Lieu différent (${m.locationId})`)}
                      {chip(typeOk, typeOk ? "Type compatible" : "Type différent")}
                      {chip(m.doStatus === "verified", "Delivery Order")}
                      {chip(m.booking === "confirmed", "Booking")}
                      {chip(m.release === "confirmed", "Release")}
                      {chip(feasible, feasible ? "Deadline faisable" : "Deadline non faisable")}
                    </div>
                    {!docsOk && sameLoc && (
                      <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-2">
                        Sélection possible — les documents manquants bloqueront le passage à « Prêt à dispatcher » via la checklist.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    );
  }

  function Chains() {
    return (
      <div className="space-y-5">
        {chains.map(ch => {
          const first = ch.cycles[0];
          const done = ch.cycles.filter(c => c.status === "completed").length;
          const active = ch.cycles.find(c => c.status !== "completed");
          const onTime = ch.cycles.filter(c => c.returnedAt && c.deadline && c.returnedAt <= c.deadline).length;
          const chStatus = active ? STATUSES[active.status].label : "Terminée";
          return (
            <section key={ch.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center gap-x-6 gap-y-2">
                <div>
                  <div className="flex items-center gap-2">
                    <Link2 size={15} className="text-teal-700" />
                    <Mono className="font-bold">{ch.id}</Mono>
                    <span className="text-xs bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5">{chStatus}</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">{first.transporter} · {first.client} · {first.locationName}</div>
                </div>
                <div className="flex gap-5 text-center ml-auto">
                  {[["Cycles", ch.cycles.length], ["Terminés", done], ["À l'heure", `${onTime}/${done || 0}`], ["Séquence max", Math.max(...ch.cycles.map(c => c.seq))]].map(([k, v]) => (
                    <div key={k}>
                      <div className="text-lg font-bold"><Mono>{v}</Mono></div>
                      <div className="text-[10px] uppercase tracking-wide text-slate-400">{k}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="px-5 py-4 flex flex-wrap items-center gap-3">
                {ch.cycles.map((c, i) => (
                  <React.Fragment key={c.id}>
                    {i > 0 && <ArrowRight size={16} className="text-slate-300" />}
                    <button onClick={() => { setView("cycles"); setExpanded(c.id); setFilters({ q: c.cycleId, status: "all", risk: "all" }); }}
                      className="text-left hover:opacity-80">
                      <div className="text-[10px] font-semibold text-slate-500 mb-1">Cycle {c.seq} · <Mono>{c.cycleId}</Mono></div>
                      <CyclePair empty={c.container} full={c.nextFull?.container} />
                      <div className="mt-1"><StatusChip status={c.status} /></div>
                    </button>
                  </React.Fragment>
                ))}
                <div className="text-[11px] text-slate-400 basis-full pt-1">
                  Le plein livré d'un cycle devient le vide du cycle suivant après déchargement. La chaîne se ferme en cas de retour standalone, de changement de transporteur ou de lieu.
                </div>
              </div>
            </section>
          );
        })}
        {chains.length === 0 && <p className="text-sm text-slate-500">Aucune chaîne active. Créez un cycle depuis le Matching.</p>}
      </div>
    );
  }

  function Transporters() {
    return (
      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500">
              {["Transporteur", "Cycles totaux", "Terminés", "Actifs", "Chaîne max", "Conteneurs", "Retours à l'heure", "Standalone"].map(h => (
                <th key={h} className="text-left px-4 py-2.5 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {transporters.map(t => (
              <tr key={t.name} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="px-4 py-3 font-medium flex items-center gap-2"><Truck size={14} className="text-slate-400" /> {t.name}</td>
                <td className="px-4 py-3"><Mono>{t.total}</Mono></td>
                <td className="px-4 py-3"><Mono>{t.done}</Mono></td>
                <td className="px-4 py-3"><Mono>{t.active}</Mono></td>
                <td className="px-4 py-3"><Mono>{t.longest || "—"}</Mono></td>
                <td className="px-4 py-3"><Mono>{t.containers.size}</Mono></td>
                <td className="px-4 py-3"><Mono>{t.withDl ? `${Math.round((t.onTime / t.withDl) * 100)}%` : "—"}</Mono></td>
                <td className="px-4 py-3"><Mono>{t.standalone}</Mono></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="px-4 py-3 text-[11px] text-slate-400 border-t border-slate-100">
          Un cycle = un retour à vide + une mission pleine liée (comptés ensemble, jamais séparément). Le compte transporteur = nombre de Cycle ID distincts terminés.
        </p>
      </div>
    );
  }
}
