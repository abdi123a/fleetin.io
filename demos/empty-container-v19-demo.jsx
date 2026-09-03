import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  LayoutDashboard, Repeat, ArrowLeftRight, Link2, Clock, CalendarDays,
  CheckCircle2, Circle, ChevronRight, ChevronLeft, Search, ArrowRight, RotateCcw,
  ShieldCheck, MapPin, Timer, X, Zap, Truck, DollarSign, AlertTriangle, Plus,
  Package, PackageOpen, Download
} from "lucide-react";

/* =====================================================================
   FLEETIN — EMPTY CONTAINER MANAGEMENT
   Scope: starts when a container becomes EMPTY (unloading completed in the
   separate Shipment Management system). From that moment this product:
   MONITOR → REUSE IF POSSIBLE → OTHERWISE RETURN BEFORE DEADLINE → CLOSE.
   ===================================================================== */

const H = 3600e3, D = 86400e3;
const NOW0 = Date.now();
const DET_RATE = 90;

/* ---- Container operational status (simple) ---- */
const cStatus = (c) => {
  if (c.closedAt) {
    const o = c.outcome === "paired" ? "Paired ✓" : c.outcome === "returned_late" ? "Returned Late" : "Returned ✓";
    return { label: o, chip: c.outcome === "paired" ? "bg-violet-50 text-violet-800 border-violet-200" : "bg-slate-100 text-slate-600 border-slate-200" };
  }
  switch (c.stage) {
    case "empty": return { label: "Empty Ready", chip: "bg-sky-50 text-sky-800 border-sky-200" };
    case "paired": return { label: "Paired ✓", chip: "bg-violet-100 text-violet-900 border-violet-300" };
    case "return_planned": return { label: "Return Planned", chip: "bg-amber-50 text-amber-800 border-amber-200" };
    default: return { label: c.stage, chip: "bg-slate-100" };
  }
};

/* ---- ONE simple deadline model: 3+d SAFE · 1–3d WATCH · <24h CRITICAL · past OVERDUE ---- */
function riskOf(c, now) {
  if (c.closedAt) return null;
  const rem = c.deadline - now;
  if (rem < 0) return { key: "overdue", label: "RETURN OVERDUE", cls: "bg-red-700 text-white border-red-800 animate-pulse", txt: "text-red-700" };
  if (rem < 24 * H) return { key: "critical", label: "CRITICAL", cls: "bg-red-600 text-white border-red-700", txt: "text-red-600" };
  if (rem < 72 * H) return { key: "watch", label: "WATCH", cls: "bg-amber-100 text-amber-900 border-amber-300", txt: "text-amber-700" };
  return { key: "safe", label: "SAFE", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", txt: "text-emerald-700" };
}

const LINES = ["Maersk", "CMA CGM", "MSC", "Hapag-Lloyd", "ONE", "OOCL", "Evergreen"];
const SIZES = ["20'", "40'", "40HC"];

/* ---- Calendar events: EVENT TYPE is the primary identity (icon + label + accent).
       Risk appears separately as a small badge — never as the card's main color. ---- */
const EVT = {
  empty_ready: { label: "EMPTY AVAILABLE", icon: PackageOpen, border: "border-l-sky-500", txt: "text-sky-700" },
  full_pickup: { label: "FULL LOAD PICKUP", icon: Package, border: "border-l-teal-600", txt: "text-teal-700" },
  paired: { label: "PAIRING", icon: ArrowLeftRight, border: "border-l-violet-500", txt: "text-violet-700" },
  return_planned: { label: "EMPTY RETURN", icon: RotateCcw, border: "border-l-amber-500", txt: "text-amber-700" },
  deadline: { label: "RETURN DEADLINE", icon: Timer, border: "border-l-red-500", txt: "text-red-700" },
  returned: { label: "RETURNED", icon: CheckCircle2, border: "border-l-emerald-500", txt: "text-emerald-700" },
};

/* =====================================================================
   MOCK DATA
   Empty containers arrive here automatically from Shipment Management,
   with all inherited fields — nothing re-entered manually.
   ===================================================================== */

/* Upcoming FULL LOADS (demand) — read from the Shipment system */
/* Transporter network — vehicles & drivers (assignment happens in Shipment creation) */
const TRANSPORTERS = {
  "RedSea Freight": {
    vehicles: [{ id: "TRK-025", type: "Tractor Head", avail: true }, { id: "TRK-031", type: "Tractor Head", avail: true }, { id: "TRK-044", type: "Tractor Head", avail: false }],
    drivers: ["Ahmed Hassan", "Mohamed Ali", "Abdi Omar"],
  },
  "Horizon Transit": {
    vehicles: [{ id: "TRK-112", type: "Tractor Head", avail: true }, { id: "TRK-118", type: "Tractor Head", avail: true }],
    drivers: ["Yusuf Ibrahim", "Samatar Warsame"],
  },
  "TransAfrica Logistics": {
    vehicles: [{ id: "TRK-207", type: "Tractor Head", avail: true }],
    drivers: ["Ali Nour"],
  },
  "Addis Line Logistics": {
    vehicles: [{ id: "TRK-301", type: "Tractor Head", avail: true }, { id: "TRK-302", type: "Tractor Head", avail: true }],
    drivers: ["Bekele Tadesse", "Daniel Mekonnen"],
  },
};

/* A full load is a DIFFERENT physical container with its own number.
   Pairing links the empty container's movement with this next full operation. */
const INITIAL_LOADS = [
  { id:"MSN-00172", fullContainer:"MSKU2222222", shipper:"Beta Trading", line:"CMA CGM", size:"40HC", qty:1, assigned:[], transporter:null,
    appointment:NOW0+20*H, pickup:"Terminal Hub Principal", dest:"Platform Beta (LOC-B)" },
  { id:"MSN-00173", fullContainer:"HLXU7788221", shipper:"Beta Trading", line:"Hapag-Lloyd", size:"40'", qty:1, assigned:[], transporter:null,
    appointment:NOW0+26*H, pickup:"Terminal Hub Principal", dest:"Platform Beta (LOC-B)" },
  { id:"MSN-00174", fullContainer:"MAEU1204955", shipper:"Epsilon SARL", line:"Maersk", size:"20'", qty:1, assigned:[], transporter:"Horizon Transit",
    appointment:NOW0+40*H, pickup:"Terminal Hub Principal", dest:"Epsilon Zone (LOC-E)" },
  { id:"MSN-00177", fullContainer:"CMAU7031180", shipper:"Alpha Import Co.", line:"CMA CGM", size:"40HC", qty:2, assigned:[], transporter:null,
    appointment:NOW0+3.4*D, pickup:"Terminal Hub Principal", dest:"Alpha Warehouse (LOC-A)" },
];

/* Empty-container cycles. prevLoad/mission = labeled references to the Shipment system. */
const INITIAL_CYCLES = [
  /* --- CLOSED CHAIN: TCLU1111111 → (paired) CMAU8110034 → (paired) MSKU2222222 → returned.
         Each cycle's FULL is the container paired at the end of the previous cycle. --- */
  { id:"CYC-00026", container:"TCLU1111111", size:"40HC", line:"CMA CGM", shipper:"Beta Trading",
    transporter:"RedSea Freight", prevLoad:"MSN-00160", mission:"M01", location:"Platform Beta (LOC-B)", distKm:6.4,
    deliveredAt:NOW0-10*D, emptyReadyAt:NOW0-10*D+19*H, matchedAt:NOW0-9*D, dispatchedAt:NOW0-8.8*D, closedAt:NOW0-8.5*D,
    deadline:NOW0-7*D, stage:"closed", outcome:"paired", detentionFee:0,
    nextFull:{ ref:"MSN-00161", fullContainer:"CMAU8110034", pickupAt:NOW0-8.7*D }, matchInfo:{ by:"Operations", at:NOW0-9*D, source:"Suggestion — Recommended" } },
  { id:"CYC-00029", container:"CMAU8110034", size:"40HC", line:"CMA CGM", shipper:"Beta Trading",
    transporter:"RedSea Freight", prevLoad:"MSN-00161", mission:"M01", location:"Platform Beta (LOC-B)", distKm:6.4,
    deliveredAt:NOW0-8*D, emptyReadyAt:NOW0-7.4*D, matchedAt:NOW0-7.2*D, dispatchedAt:NOW0-7*D, closedAt:NOW0-6.9*D,
    deadline:NOW0-6*D, stage:"closed", outcome:"paired", detentionFee:0,
    nextFull:{ ref:"MSN-00165", fullContainer:"MSKU2222222", pickupAt:NOW0-5.9*D }, matchInfo:{ by:"Operations", at:NOW0-7.2*D, source:"Manual — Matching" } },
  { id:"CYC-00030", container:"MSKU2222222", size:"40HC", line:"CMA CGM", shipper:"Beta Trading",
    transporter:"RedSea Freight", prevLoad:"MSN-00165", mission:"M01", location:"Platform Beta (LOC-B)", distKm:6.4,
    deliveredAt:NOW0-5.5*D, emptyReadyAt:NOW0-5.2*D, matchedAt:null, dispatchedAt:NOW0-5*D, closedAt:NOW0-4.9*D,
    deadline:NOW0-4*D, stage:"closed", outcome:"returned", detentionFee:0, nextFull:null, matchInfo:null },
  /* --- Active: full risk spread --- */
  { id:"CYC-00028", container:"CMAU4256169", size:"40HC", line:"CMA CGM", shipper:"Beta Trading",
    transporter:"RedSea Freight", prevLoad:"MSN-00160", mission:"M03", location:"Platform Beta (LOC-B)", distKm:6.4,
    deliveredAt:NOW0-1.9*D, emptyReadyAt:NOW0-3*H, matchedAt:null, dispatchedAt:null, closedAt:null,
    deadline:NOW0+60*H, stage:"empty", outcome:null, detentionFee:0, nextFull:null, matchInfo:null },
  { id:"CYC-00031", container:"MSKU7070707", size:"20'", line:"Maersk", shipper:"Delta Négoce",
    transporter:"Horizon Transit", prevLoad:"MSN-00162", mission:"M01", location:"Delta Logistics Hub (LOC-D)", distKm:0,
    deliveredAt:NOW0-2*D, emptyReadyAt:NOW0-26*H, matchedAt:NOW0-20*H, dispatchedAt:null, closedAt:null,
    deadline:NOW0+30*H, stage:"paired", outcome:null, detentionFee:0,
    nextFull:{ ref:"MSN-00170", fullContainer:"MAEU3301287", pickupAt:NOW0+13*H }, matchInfo:{ by:"Operations", at:NOW0-20*H, source:"Suggestion — Recommended" } },
  { id:"CYC-00032", container:"HLXU1212121", size:"40'", line:"Hapag-Lloyd", shipper:"Beta Trading",
    transporter:"RedSea Freight", prevLoad:"MSN-00163", mission:"M01", location:"Platform Beta (LOC-B)", distKm:6.4,
    deliveredAt:NOW0-1.7*D, emptyReadyAt:NOW0-10*H, matchedAt:null, dispatchedAt:null, closedAt:null,
    deadline:NOW0+11*H, stage:"empty", outcome:null, detentionFee:0, nextFull:null, matchInfo:null },
  { id:"CYC-00033", container:"ONEU3434343", size:"40'", line:"ONE", shipper:"Alpha Import Co.",
    transporter:"Horizon Transit", prevLoad:"MSN-00157", mission:"M01", location:"Alpha Warehouse (LOC-A)", distKm:11.2,
    deliveredAt:NOW0-5*D, emptyReadyAt:NOW0-3.5*D, matchedAt:null, dispatchedAt:null, closedAt:null,
    deadline:NOW0-(2*D+7*H), stage:"empty", outcome:null, detentionFee:0, nextFull:null, matchInfo:null },
  { id:"CYC-00034", container:"CMAU9988776", size:"40HC", line:"CMA CGM", shipper:"Gamma Distribution",
    transporter:"TransAfrica Logistics", prevLoad:"MSN-00164", mission:"M01", location:"Gamma Depot (LOC-C)", distKm:14.8,
    deliveredAt:NOW0-(2*D+7*H), emptyReadyAt:NOW0-2*H, matchedAt:null, dispatchedAt:null, closedAt:null,
    deadline:NOW0+4.2*D, stage:"empty", outcome:null, detentionFee:0, nextFull:null, matchInfo:null },
  { id:"CYC-00036", container:"OOLU5579046", size:"40'", line:"OOCL", shipper:"Delta Négoce",
    transporter:"Horizon Transit", prevLoad:"MSN-00158", mission:"M01", location:"Delta Logistics Hub (LOC-D)", distKm:0,
    deliveredAt:NOW0-2*D, emptyReadyAt:NOW0-8*H, matchedAt:null, dispatchedAt:NOW0-1*H, closedAt:null,
    deadline:NOW0+9.5*H, stage:"return_planned", plannedReturnAt:NOW0+7*H, outcome:null, detentionFee:0, nextFull:null, matchInfo:null },
];

/* ================= Helpers ================= */

function fmtRel(ms) {
  if (ms == null) return "—";
  const a = Math.abs(ms);
  const d = Math.floor(a / D), h = Math.floor((a % D) / H), m = Math.floor((a % H) / 60000);
  return d > 0 ? `${d}d ${h}h` : `${h}h ${String(m).padStart(2, "0")}m`;
}
function fmtDT(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleDateString("en-GB") + " · " +
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}
const fmtTime = (ts) => new Date(ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const startOfDay = (ts) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
const sameDay = (a, b) => startOfDay(a) === startOfDay(b);
const dayLabel = (ts) => new Date(ts).toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" });
const fmtDay = (ts) => new Date(ts).toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
const isClosed = (c) => !!c.closedAt;

/* ---- Matching engine — one engine, two directions ---- */
function loadsFor(c, loads, now, rejectedIds = []) {
  if (!c || isClosed(c) || c.stage !== "empty") return [];
  const out = [];
  loads.forEach(dm => {
    const slots = dm.qty - dm.assigned.length;
    if (slots <= 0) return;
    if (dm.line !== c.line || dm.size !== c.size) return;
    if (dm.appointment < now || dm.appointment > c.deadline) return;
    const windowMs = c.deadline - dm.appointment;
    const risky = windowMs < 6 * H;
    let score = 100 - Math.min(30, c.distKm * 1.5) - Math.min(25, (dm.appointment - now) / H * 0.3);
    if (risky) score -= 20;
    const reasons = [];
    reasons.push(dm.appointment - now < 24 * H ? "Pickup within 24h — quick pairing" : `Pickup in ${fmtRel(dm.appointment - now)}`);
    if (risky) reasons.push(`Tight window · only ${fmtRel(windowMs)} margin before the deadline`);
    out.push({ dm, c, windowMs, risky, score, reasons, rejected: rejectedIds.includes(dm.id) });
  });
  const act = out.filter(s => !s.rejected).sort((a, b) => (a.risky - b.risky) || (b.score - a.score));
  act.forEach((s, i) => { s.label = s.risky ? "LAST OPTION" : i === 0 ? "RECOMMENDED" : "ALTERNATIVE"; });
  return [...act, ...out.filter(s => s.rejected)];
}
function emptiesFor(dm, cycles, now, rejectedIds = []) {
  if (!dm || dm.qty - dm.assigned.length <= 0) return [];
  const out = [];
  cycles.forEach(c => {
    if (isClosed(c) || c.stage !== "empty") return;
    if (c.line !== dm.line || c.size !== dm.size) return;
    if (now > c.deadline || dm.appointment > c.deadline) return;
    const windowMs = c.deadline - dm.appointment;
    const urgency = c.deadline - now;
    const risky = windowMs < 6 * H;
    let score = 100 - Math.min(30, c.distKm * 1.5);
    if (urgency < 48 * H) score += 15; else if (urgency < 72 * H) score += 8;
    if (risky) score -= 20;
    const reasons = [];
    if (urgency < 48 * H) reasons.push("Urgent deadline — pairing avoids a separate empty movement");
    reasons.push(c.distKm === 0 ? "Same hub as pickup" : `${c.distKm} km from pickup`);
    if (risky) reasons.push(`Tight window · only ${fmtRel(windowMs)} margin`);
    out.push({ c, dm, windowMs, risky, score, reasons, rejected: rejectedIds.includes(c.id) });
  });
  const act = out.filter(s => !s.rejected).sort((a, b) => (a.risky - b.risky) || (b.score - a.score));
  act.forEach((s, i) => { s.label = s.risky ? "LAST OPTION" : i === 0 ? "RECOMMENDED" : "ALTERNATIVE"; });
  return [...act, ...out.filter(s => s.rejected)];
}
const SUG_LABEL = {
  RECOMMENDED: "bg-teal-700 text-white border-teal-800",
  ALTERNATIVE: "bg-white text-slate-600 border-slate-300",
  "LAST OPTION": "bg-amber-100 text-amber-900 border-amber-400",
};

/* ---- Small building blocks ---- */
const Mono = ({ children, className = "" }) => <span className={`font-mono tracking-tight ${className}`}>{children}</span>;
const RiskBadge = ({ risk }) => risk ? (
  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold ${risk.cls}`}>
    <Timer size={10} /> {risk.label}
  </span>
) : <span className="text-xs text-slate-300">—</span>;
const FullTag = ({ small }) => (
  <span className={`inline-flex items-center gap-1 rounded bg-teal-700 text-white font-extrabold tracking-wider ${small ? "text-[8px] px-1 py-px" : "text-[9px] px-1.5 py-0.5"}`}>
    <Package size={small ? 8 : 10} /> FULL
  </span>
);
const EmptyTag = ({ small }) => (
  <span className={`inline-flex items-center gap-1 rounded border-2 border-dashed border-slate-400 bg-white text-slate-500 font-extrabold tracking-wider ${small ? "text-[8px] px-1 py-px" : "text-[9px] px-1.5 py-0.5"}`}>
    <PackageOpen size={small ? 8 : 10} /> EMPTY
  </span>
);
const StatusChip = ({ c }) => {
  const s = cStatus(c);
  return <span className={`inline-flex px-2 py-0.5 rounded border text-xs font-medium ${s.chip}`}>{s.label}</span>;
};
const DeadlineCell = ({ c, now }) => {
  if (isClosed(c)) {
    const late = c.closedAt > c.deadline;
    return (
      <div>
        <div className={`font-mono font-bold text-sm ${late ? "text-orange-700" : "text-teal-700"}`}>{late ? `${fmtRel(c.closedAt - c.deadline)} late` : "On time"}</div>
        <div className="text-[10px] text-slate-400"><Mono>{fmtDT(c.deadline)}</Mono></div>
      </div>
    );
  }
  const r = riskOf(c, now);
  const rem = c.deadline - now;
  const detEst = rem < 0 ? Math.ceil(-rem / D) * DET_RATE : 0;
  return (
    <div>
      <div className="text-[8px] font-extrabold uppercase tracking-widest text-slate-400">Return deadline</div>
      <div className={`font-mono font-bold text-sm ${r.txt}`}>{rem < 0 ? `${fmtRel(rem)} overdue` : `${fmtRel(rem)} remaining`}</div>
      <div className="text-[10px] text-slate-400"><Mono>{fmtDT(c.deadline)}</Mono></div>
      {detEst > 0 && <div className="text-[10px] font-semibold text-red-700">Estimated detention: ${detEst}</div>}
    </div>
  );
};

/* ================= App ================= */

let simCount = 0;
const SIM_POOL = [
  { container: "MAEU7712930", line: "Maersk", size: "40'", shipper: "Delta Négoce", transporter: "Horizon Transit", location: "Delta Logistics Hub (LOC-D)", distKm: 0, prevLoad: "MSN-00181", mission: "M01" },
  { container: "CMAU5230081", line: "CMA CGM", size: "40HC", shipper: "Beta Trading", transporter: "RedSea Freight", location: "Platform Beta (LOC-B)", distKm: 6.4, prevLoad: "MSN-00182", mission: "M02" },
  { container: "HLXU8845112", line: "Hapag-Lloyd", size: "40'", shipper: "Beta Trading", transporter: "RedSea Freight", location: "Platform Beta (LOC-B)", distKm: 6.4, prevLoad: "MSN-00183", mission: "M01" },
];

export default function App() {
  const [cycles, setCycles] = useState(INITIAL_CYCLES);
  const [loads, setLoads] = useState(INITIAL_LOADS);
  const [view, setView] = useState("tower");
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState(null);
  const [selEmpty, setSelEmpty] = useState("CYC-00032");
  const [rejected, setRejected] = useState({});            // { loadId: [cycleId,…] }
  const [loadModal, setLoadModal] = useState(null);         // full-load context panel (calendar)
  const [detailIntent, setDetailIntent] = useState(null);   // 'find' → open container modal in selection mode
  const [lastPairing, setLastPairing] = useState(null);     // matching-page confirmation banner (state stays consistent)
  const [calEvent, setCalEvent] = useState(null);            // read-only calendar event detail — exact event only (no state inference)
  const [dayList, setDayList] = useState(null);              // month view: "+N more" day drill-down
  const [shipWizard, setShipWizard] = useState(false);       // Shipment creation — the single source of demand
  const [msnSeq, setMsnSeq] = useState(182);
  const [calView, setCalView] = useState("week");
  const [calAnchor, setCalAnchor] = useState(startOfDay(NOW0));
  const [typeF, setTypeF] = useState("all");
  const [riskF, setRiskF] = useState("all");
  const [lineF, setLineF] = useState("all");
  const [sizeF, setSizeF] = useState("all");
  const [perf, setPerf] = useState({ period: "all", line: "all", transporter: "all", size: "all" });
  const [now, setNow] = useState(NOW0);
  const [toast, setToast] = useState(null);
  const counters = useRef({ cyc: 40 });

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
  const notify = (m) => { setToast(m); setTimeout(() => setToast(null), 5600); };
  const upd = (id, patch) => setCycles(cs => cs.map(c => c.id === id ? { ...c, ...(typeof patch === "function" ? patch(c) : patch) } : c));

  /* ---------- Derived ---------- */
  const active = cycles.filter(c => !isClosed(c));
  const closed = cycles.filter(isClosed);
  const availableEmpties = active.filter(c => c.stage === "empty");
  const overdueCycles = active.filter(c => now > c.deadline);
  const openLoads = loads.filter(l => l.qty - l.assigned.length > 0 && l.appointment > now - D);

  /* ---------- Actions (contextual — connect pages) ---------- */

  const goFindLoad = (cycleId) => { setDetailIntent("find"); setDetail(cycleId); };   // stay in context — modal handles selection

  const rejectPair = (loadId, cycleId) => setRejected(r => ({ ...r, [loadId]: [...(r[loadId] || []), cycleId] }));
  const restorePair = (loadId, cycleId) => setRejected(r => ({ ...r, [loadId]: (r[loadId] || []).filter(x => x !== cycleId) }));

  /* Two operational paths, literal actions:
     PATH A: Find Full Load → Confirm Pairing → PAIRED ✓ — stop here (execution belongs to the Shipment system)
     PATH B: Plan Empty Return → RETURN PLANNED → Confirm Empty Return → CLOSED (Returned) */
  /* Pairing is confirmed explicitly by Operations — before that, options are only "pairing available". */
  const pairDirect = (cycleId, dm, source = "Contextual") => {
    const c = cycles.find(x => x.id === cycleId);
    upd(cycleId, { stage: "paired", matchedAt: Date.now(), nextFull: { ref: dm.id, fullContainer: dm.fullContainer, pickupAt: dm.appointment }, matchInfo: { by: "Operations", at: Date.now(), source } });
    setLoads(ls => ls.map(l => l.id === dm.id ? { ...l, assigned: [...l.assigned, c.container] } : l));
    setLastPairing({ cycleId, empty: c.container, load: dm.id, fullContainer: dm.fullContainer, at: Date.now() });
    notify(`Pairing confirmed ✓ — ${c.container} paired with ${dm.id}.`);
  };

  /* Pairing is the completed decision — execution lives in the Shipment system. */
  const cancelPairing = (id) => {
    const c = cycles.find(x => x.id === id);
    if (c?.nextFull) setLoads(ls => ls.map(l => l.id === c.nextFull.ref ? { ...l, assigned: l.assigned.filter(n => n !== c.container) } : l));
    upd(id, { stage: "empty", nextFull: null, matchedAt: null, matchInfo: null });
    notify("Pairing cancelled — container back to Empty Ready.");
  };
  const planReturn = (id) => {
    upd(id, c => ({ stage: "return_planned", plannedReturnAt: Math.min(Date.now() + 4 * H, c.deadline - 1 * H) }));
    notify("Empty return planned.");
  };
  const confirmReturn = (id) => {
    const t = Date.now();
    const c = cycles.find(x => x.id === id);
    const late = t > c.deadline;
    upd(id, { stage: "closed", closedAt: t, outcome: late ? "returned_late" : "returned", detentionFee: late ? Math.ceil((t - c.deadline) / D) * DET_RATE : 0 });
    notify(late ? "Empty return confirmed — after the deadline." : "Empty return confirmed ✓");
  };

  /* Simulated automatic intake from the Shipment Management system */
  const simulateIntake = () => {
    const tpl = SIM_POOL[simCount++ % SIM_POOL.length];
    const id = `CYC-${String(counters.current.cyc++).padStart(5, "0")}`;
    const t = Date.now();
    setCycles(cs => [...cs, {
      id, ...tpl, deliveredAt: t - 16 * H, emptyReadyAt: t,
      matchedAt: null, dispatchedAt: null, closedAt: null,
      deadline: t + 30 * H, stage: "empty", outcome: null, detentionFee: 0, nextFull: null, matchInfo: null,
    }]);
    notify(`Unloading completed in Shipment Management — ${tpl.container} entered Empty Container Management automatically (line, deadline, location and previous load ${tpl.prevLoad} inherited). Nothing re-entered manually.`);
  };

  /* ---------- Calendar events ---------- */
  const events = useMemo(() => {
    const ev = [];
    active.forEach(c => {
      const r = riskOf(c, now);
      if (c.stage === "empty") ev.push({ key: `e-${c.id}`, type: "empty_ready", ts: c.emptyReadyAt, cycleId: c.id, title: c.container, size: c.size, line: c.line, risk: r, action: true });
      if (c.nextFull?.pickupAt) ev.push({ key: `m-${c.id}`, type: "paired", ts: c.nextFull.pickupAt, cycleId: c.id, title: `${c.container} ↔ ${c.nextFull.ref}`, size: c.size, line: c.line, gap: c.deadline - c.nextFull.pickupAt, risk: r, action: false });
      if (c.stage === "return_planned" && c.plannedReturnAt) ev.push({ key: `r-${c.id}`, type: "return_planned", ts: c.plannedReturnAt, cycleId: c.id, title: c.container, size: c.size, line: c.line, risk: r, action: false });
      ev.push({ key: `d-${c.id}`, type: "deadline", ts: c.deadline, cycleId: c.id, title: c.container, size: c.size, line: c.line, risk: r, overdue: r.key === "overdue", action: r.key === "critical" });
    });
    closed.filter(c => c.outcome !== "paired").forEach(c => {
      ev.push({ key: `ret-${c.id}`, type: "returned", ts: c.closedAt, cycleId: c.id, title: c.container, size: c.size, line: c.line, risk: null, action: false, late: c.outcome === "returned_late" });
    });
    loads.filter(l => l.appointment > now - D).forEach(dm => {
      const slots = dm.qty - dm.assigned.length;
      ev.push({ key: `f-${dm.id}`, type: "full_pickup", ts: dm.appointment, loadId: dm.id, title: `${dm.id}${slots > 1 ? ` ×${slots}` : ""}`,
        size: dm.size, line: dm.line, risk: null, action: slots > 0,
        fullContainer: dm.fullContainer, pickup: dm.pickup, pairedWith: dm.assigned, transporter: dm.transporter });
    });
    return ev.filter(e => {
      if (typeF !== "all" && e.type !== typeF) return false;
      if (riskF !== "all" && e.risk?.key !== riskF) return false;
      if (lineF !== "all" && e.line !== lineF) return false;
      if (sizeF !== "all" && e.size !== sizeF) return false;
      return true;
    }).sort((a, b) => a.ts - b.ts);
  }, [cycles, loads, now, typeF, riskF, lineF, sizeF]);

  const kpis = useMemo(() => {
    const rk = (k) => active.filter(c => riskOf(c, now).key === k).length;
    return {
      overdue: rk("overdue"), critical: rk("critical"), watch: rk("watch"),
      detExposure: overdueCycles.reduce((s, c) => s + Math.ceil((now - c.deadline) / D) * DET_RATE, 0),
      supply72: availableEmpties.length,
      demand72: openLoads.filter(d => d.appointment < now + 72 * H).reduce((s, d) => s + d.qty - d.assigned.length, 0),
    };
  }, [cycles, loads, now]);

  const detailCycle = cycles.find(c => c.id === detail);
  const allLines = [...new Set([...cycles.map(c => c.line), ...loads.map(d => d.line)])];
  const allTransporters = [...new Set(cycles.map(c => c.transporter))];

  const NAV_OPS = [
    { key: "tower", label: "Control Tower", icon: Repeat },
    { key: "calendar", label: "Calendar", icon: CalendarDays },
    { key: "matching", label: "Matching", icon: ArrowLeftRight },
    { key: "cycles", label: "Cycles", icon: Link2 },
  ];
  const NAV_PERF = [{ key: "dashboard", label: "Dashboard", icon: LayoutDashboard }];
  const PAGE_Q = {
    tower: "What needs my attention now?", calendar: "What happens next?",
    matching: "Which empty containers are available — and where can they be used?",
    cycles: "What happened operationally?", dashboard: "How are we performing?",
  };

  /* ================= Render ================= */

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex" style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      <aside className="w-56 shrink-0 bg-slate-900 text-slate-300 flex flex-col">
        <div className="px-4 py-5 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-teal-600 flex items-center justify-center"><PackageOpen size={16} className="text-white" /></div>
            <div>
              <div className="text-white font-bold text-sm leading-none">Fleetin</div>
              <div className="text-[10px] uppercase tracking-widest text-teal-400 mt-1">Empty Container Mgmt</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 py-3">
          <div className="px-4 pt-1 pb-1.5 text-[9px] font-extrabold uppercase tracking-widest text-slate-500">Operations</div>
          {NAV_OPS.map(n => (
            <button key={n.key} onClick={() => setView(n.key)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${view === n.key ? "bg-slate-800 text-white border-l-2 border-teal-500" : "hover:bg-slate-800/60 border-l-2 border-transparent"}`}>
              <n.icon size={16} /> {n.label}
              {n.key === "tower" && (kpis.overdue + kpis.critical) > 0 && <span className="ml-auto bg-red-600 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5">{kpis.overdue + kpis.critical}</span>}
              {n.key === "matching" && availableEmpties.length > 0 && <span className="ml-auto bg-sky-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5">{availableEmpties.length}</span>}
            </button>
          ))}
          <div className="px-4 pt-4 pb-1.5 text-[9px] font-extrabold uppercase tracking-widest text-slate-500">Performance</div>
          {NAV_PERF.map(n => (
            <button key={n.key} onClick={() => setView(n.key)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${view === n.key ? "bg-slate-800 text-white border-l-2 border-teal-500" : "hover:bg-slate-800/60 border-l-2 border-transparent"}`}>
              <n.icon size={16} /> {n.label}
            </button>
          ))}
        </nav>
        <div className="px-4 py-3 text-[10px] text-slate-500 border-t border-slate-800 leading-relaxed">
          Container becomes empty →<br />pair it with a next full load →<br />otherwise return before deadline.
        </div>
      </aside>

      <main className="flex-1 min-w-0">
        <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between sticky top-0 z-10">
          <div>
            <h1 className="font-bold text-base">{[...NAV_OPS, ...NAV_PERF].find(n => n.key === view)?.label}</h1>
            <p className="text-xs text-slate-500">{PAGE_Q[view]}</p>
          </div>
          <div className="flex items-center gap-3">
            {view === "tower" && <button onClick={simulateIntake} className="text-[11px] font-semibold text-slate-500 hover:text-teal-700 border border-slate-200 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
              <Download size={12} /> Simulate: container unloaded
            </button>}
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Clock size={13} /><Mono>{new Date(now).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</Mono>
            </div>
          </div>
        </header>

        <div className="p-6 space-y-5">
          {view === "tower" && <Tower />}
          {view === "calendar" && <Calendar />}
          {view === "matching" && <Matching />}
          {view === "cycles" && <Cycles />}
          {view === "dashboard" && <Dashboard />}
        </div>
      </main>

      {detailCycle && <DetailModal key={detailCycle.id + (detailIntent || "")} c={detailCycle} initialMode={detailIntent === "find" ? "select" : "detail"} />}
      {shipWizard && <ShipmentWizard />}
      {calEvent && <CalEventModal e={calEvent} />}
      {dayList && <DayListModal ts={dayList} />}
      {loadModal && <LoadModal loadId={loadModal} />}

      {toast && (
        <div className="fixed bottom-5 right-5 max-w-md bg-slate-900 text-white text-sm rounded-lg shadow-xl px-4 py-3 flex items-start gap-2 z-50">
          <CheckCircle2 size={16} className="text-teal-400 mt-0.5 shrink-0" /><span>{toast}</span>
          <button onClick={() => setToast(null)} className="ml-1 text-slate-400 hover:text-white"><X size={14} /></button>
        </div>
      )}
    </div>
  );

  /* ---------- CONTROL TOWER — operational home ---------- */

  /* NEXT ACTION — one primary action per row.
     Status = what is happening · Risk = how urgent · Action = what to do. */
  function ActionCell({ c }) {
    if (isClosed(c)) return <span className="text-xs text-slate-400">{cStatus(c).label}</span>;
    const r = riskOf(c, now);
    const btn = (label, cls, fn) => (
      <button onClick={e => { e.stopPropagation(); fn(); }} className={`text-[11px] font-bold rounded-lg px-3 py-1.5 whitespace-nowrap ${cls}`}>{label}</button>
    );
    switch (c.stage) {
      case "empty":
        return r.key === "overdue"
          ? btn("PLAN EMPTY RETURN", "bg-amber-600 hover:bg-amber-500 text-white", () => planReturn(c.id))
          : btn("FIND FULL LOAD", "bg-teal-700 hover:bg-teal-600 text-white", () => goFindLoad(c.id));
      case "paired":
        return <span className="text-xs font-bold text-violet-700">PAIRED ✓ <span className="block text-[9px] font-semibold text-slate-400">No action required</span></span>;
      case "return_planned":
        return btn("CONFIRM EMPTY RETURN", "bg-amber-600 hover:bg-amber-500 text-white", () => confirmReturn(c.id));
      default: return null;
    }
  }

  function Tower() {
    const [showOnTrack, setShowOnTrack] = useState(false);
    const [showClosed, setShowClosed] = useState(false);
    const match = (c) => !q || [c.id, c.container, c.shipper, c.transporter, c.line, c.nextFull?.ref, c.prevLoad].filter(Boolean).join(" ").toLowerCase().includes(q.toLowerCase());
    const act = active.filter(match).sort((a, b) => (a.deadline - now) - (b.deadline - now));
    const groups = {
      action: act.filter(c => ["overdue", "critical"].includes(riskOf(c, now).key)),
      monitor: act.filter(c => riskOf(c, now).key === "watch"),
      onTrack: act.filter(c => riskOf(c, now).key === "safe"),
      closed: closed.filter(match).sort((a, b) => b.closedAt - a.closedAt),
    };
    const overdueN = act.filter(c => riskOf(c, now).key === "overdue").length;
    const criticalN = act.filter(c => riskOf(c, now).key === "critical").length;

    const Table = ({ rows }) => (
      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm min-w-[1050px]">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500">
              {["Container", "Shipping Line", "Status", "Current Location", "Paired Shipment", "Transporter", "Decision Window", "Risk", "Next Action"].map(h => (
                <th key={h} className="text-left px-3 py-2.5 font-semibold whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(c => (
              <tr key={c.id} onClick={() => setDetail(c.id)} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 cursor-pointer">
                <td className="px-3 py-3">
                  <div className="flex items-center gap-1.5">
                    <Mono className="font-semibold text-xs">{c.container}</Mono>
                    <EmptyTag small />
                  </div>
                  <div className="text-[10px] text-slate-400">{c.size} · Previous load <Mono>{c.prevLoad}</Mono></div>
                </td>
                <td className="px-3 py-3 text-xs font-semibold">{c.line}</td>
                <td className="px-3 py-3"><StatusChip c={c} /></td>
                <td className="px-3 py-3 text-xs text-slate-600"><MapPin size={10} className="inline text-slate-400 mr-1" />{c.location}</td>
                <td className="px-3 py-3 text-xs">
                  {c.nextFull ? (() => {
                    const dm = loads.find(l => l.id === c.nextFull.ref);
                    return (
                      <div>
                        <Mono className="text-violet-800 font-semibold">{c.nextFull.ref}</Mono>
                        <div className="text-[9px] text-slate-400">Full container <Mono className="font-semibold text-slate-600">{c.nextFull.fullContainer}</Mono></div>
                        <div className="text-[9px] text-slate-400">Pickup <Mono className="font-semibold">{fmtDT(c.nextFull.pickupAt)}</Mono>{dm?.transporter ? <> · {dm.transporter}</> : null}</div>
                      </div>
                    );
                  })() : <span className="text-slate-300">Not paired</span>}
                </td>
                <td className="px-3 py-3 text-xs">{c.transporter}</td>
                <td className="px-3 py-3"><DeadlineCell c={c} now={now} /></td>
                <td className="px-3 py-3"><RiskBadge risk={riskOf(c, now)} /></td>
                <td className="px-3 py-3"><ActionCell c={c} /></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={9} className="p-6 text-center text-sm text-slate-400">Nothing here.</td></tr>}
          </tbody>
        </table>
      </div>
    );

    const Sec = ({ title, tone, count, children, collapsible, open, setOpen }) => (
      <section>
        <button disabled={!collapsible} onClick={() => setOpen && setOpen(v => !v)}
          className={`flex items-center gap-2 mb-2 ${collapsible ? "cursor-pointer" : "cursor-default"}`}>
          <h2 className={`text-[10px] font-extrabold uppercase tracking-widest ${tone}`}>{title}</h2>
          <Mono className="text-[10px] text-slate-400">{count}</Mono>
          {collapsible && <span className="text-[10px] text-slate-400">{open ? "▾ hide" : "› show"}</span>}
        </button>
        {(!collapsible || open) && children}
      </section>
    );

    return (
      <>
        {/* operational entry point — Shipment creation lives HERE only */}
        <div className="flex items-center gap-2">
          <button onClick={() => setShipWizard(true)} className="text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-lg px-4 py-2 flex items-center gap-1.5">
            <Plus size={13} /> NEW SHIPMENT
          </button>
          <span className="text-[10px] text-slate-400">Creating an operation starts here — Calendar monitors, Matching optimizes, Cycles explains.</span>
        </div>
        {/* summary strip */}
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-2.5 flex flex-wrap items-center gap-x-6 gap-y-1.5 text-xs">
          <span className={`font-bold ${groups.action.length ? "text-red-700" : "text-slate-400"}`}>ACTION REQUIRED <Mono className="text-sm">{groups.action.length}</Mono></span>
          <span className="text-red-600">Critical <Mono className="font-bold">{criticalN}</Mono></span>
          <span className="text-red-700">Return Overdue <Mono className="font-bold">{overdueN}</Mono></span>
          <span className="text-amber-700">Watch <Mono className="font-bold">{groups.monitor.length}</Mono></span>
          <span className="text-emerald-700">On Track <Mono className="font-bold">{groups.onTrack.length}</Mono></span>
          <div className="relative flex-1 min-w-48 ml-auto">
            <Search size={13} className="absolute left-3 top-2 text-slate-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Container, line, transporter, load…"
              className="w-full bg-white border border-slate-300 rounded-lg pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500" />
          </div>
        </div>

        <Sec title="Action required — immediate intervention" tone="text-red-700" count={groups.action.length}>
          <Table rows={groups.action} />
        </Sec>
        <Sec title="Monitor — approaching a decision" tone="text-amber-700" count={groups.monitor.length}>
          <Table rows={groups.monitor} />
        </Sec>
        <Sec title="On track — progressing normally" tone="text-emerald-700" count={groups.onTrack.length}
          collapsible open={showOnTrack} setOpen={setShowOnTrack}>
          <Table rows={groups.onTrack} />
        </Sec>
        <Sec title="Closed cycles" tone="text-slate-400" count={groups.closed.length}
          collapsible open={showClosed} setOpen={setShowClosed}>
          <Table rows={groups.closed} />
        </Sec>
        <p className="text-[11px] text-slate-400">
          Status = what is happening · Risk = how urgent (Safe 3d+ · Watch 1–3d · Critical under 24h · Return Overdue) · Next Action = what to do. Decision window = time left to pair or plan the return.
        </p>
      </>
    );
  }

  /* ---------- CALENDAR — time & planning ---------- */

  function EventCard({ e }) {
    const cfg = EVT[e.type];
    /* §21: read-only — every click opens ONLY this exact event's detail */
    const open = () => setCalEvent(e);
    const isOverdue = e.type === "deadline" && e.overdue;
    const Icon = cfg.icon;
    return (
      <button onClick={open}
        className={`w-full text-left rounded-md border border-l-4 px-2 py-1.5 hover:shadow-sm transition-shadow ${cfg.border}
          ${isOverdue ? "bg-red-700 border-red-800 text-white animate-pulse" : "bg-white border-slate-200"}`}>
        <div className="flex items-center justify-between">
          <Mono className="text-[11px] font-bold">{fmtTime(e.ts)}</Mono>
          <span className="flex items-center gap-1">
            {e.risk && !isOverdue && e.risk.key !== "safe" && (
              <span className={`text-[7px] font-extrabold rounded-full border px-1 ${e.risk.cls.replace(" animate-pulse", "")}`}>{e.risk.label}</span>
            )}

          </span>
        </div>
        <div className={`flex items-center gap-1 text-[8px] font-extrabold uppercase tracking-widest ${isOverdue ? "text-red-100" : cfg.txt}`}>
          <Icon size={9} /> {cfg.label}
          {e.type === "full_pickup" && <FullTag small />}
          {e.type === "empty_ready" && <EmptyTag small />}
        </div>
        <Mono className="block text-[11px] font-semibold truncate">{e.title}</Mono>
        <div className={`text-[9px] ${isOverdue ? "text-red-100" : "text-slate-500"}`}>
          {e.type === "deadline" && (isOverdue ? `${fmtRel(now - e.ts)} past return deadline — act now` : `${fmtRel(e.ts - now)} left to return the empty`)}
          {e.type === "empty_ready" && `${e.line} · ${e.size}`}
          {e.type === "full_pickup" && (
            <>
              <span className="block">Full container <Mono className="font-semibold text-slate-700">{e.fullContainer}</Mono></span>
              <span className="block">{e.line} · {e.size} · {e.pickup}{e.transporter ? ` · ${e.transporter}` : ""}</span>
              {e.pairedWith?.length > 0
                ? <span className="block text-violet-700 font-semibold">PAIRED WITH EMPTY <Mono>{e.pairedWith.join(", ")}</Mono></span>
                : <span className="block text-teal-700 font-semibold">Needs compatible empty container</span>}
            </>
          )}
          {e.type === "return_planned" && "Empty goes back to the depot"}
          {e.type === "paired" && (e.gap < 6 * H ? `⚠ Tight window · ${fmtRel(e.gap)}` : "Empty ↔ next full · deadline protected ✓")}
          {e.type === "returned" && (e.late ? "Returned late" : "Returned on time ✓")}
        </div>
      </button>
    );
  }

  function Calendar() {
    const days = calView === "week" ? Array.from({ length: 7 }, (_, i) => calAnchor + i * D) : [calAnchor];
    const nav = (dir) => setCalAnchor(a => {
      if (calView !== "month") return a + dir * (calView === "week" ? 7 * D : D);
      const dt = new Date(a); dt.setDate(1); dt.setMonth(dt.getMonth() + dir); return dt.getTime();
    });
    /* month matrix: Monday-start weeks covering the anchor's month */
    const monthCells = (() => {
      if (calView !== "month") return [];
      const dt = new Date(calAnchor); dt.setDate(1); dt.setHours(0, 0, 0, 0);
      const firstDow = (dt.getDay() + 6) % 7;                    // Mon=0
      const start = dt.getTime() - firstDow * D;
      const month = dt.getMonth();
      const cells = Array.from({ length: 42 }, (_, i) => start + i * D);
      while (cells.length > 35 && new Date(cells[35]).getMonth() !== month) cells.splice(35);
      return cells.map(ts => ({ ts, inMonth: new Date(ts).getMonth() === month }));
    })();
    const monthTitle = new Date(calAnchor).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
    return (
      <>
        {overdueCycles.length > 0 && (
          <div className="bg-red-700 text-white rounded-lg px-3 py-2 flex flex-wrap items-center gap-2 text-xs">
            <AlertTriangle size={14} className="shrink-0" />
            <span className="font-bold">⚠ {overdueCycles.length} RETURN{overdueCycles.length > 1 ? "S" : ""} OVERDUE — empty return deadline missed</span>
            {overdueCycles.map(c => (
              <button key={c.id} onClick={() => setCalEvent({ key: `d-${c.id}`, type: "deadline", ts: c.deadline, cycleId: c.id, title: c.container, size: c.size, line: c.line, overdue: true })} className="bg-red-800/70 hover:bg-red-900 rounded px-2 py-0.5">
                <Mono className="font-semibold">{c.container}</Mono> <span className="text-red-200">{fmtRel(now - c.deadline)} past deadline</span>
              </button>
            ))}
          </div>
        )}

        {(() => {
          const in24 = events.filter(e => e.ts >= now && e.ts <= now + 24 * H);
          const ea = active.filter(c => c.stage === "empty").length;
          const fp24 = in24.filter(e => e.type === "full_pickup").length;
          const dl24 = in24.filter(e => e.type === "deadline").length;
          const pr = active.filter(c => c.stage === "return_planned").length;
          return (
            <div className="bg-white rounded-xl border border-slate-200 px-4 py-2 text-xs flex flex-wrap gap-x-6 gap-y-1 items-center">
              <span className="text-[9px] font-extrabold uppercase tracking-widest text-slate-400">Next 24 hours</span>
              <span><Mono className="font-bold text-sky-700">{ea}</Mono> Empty Available</span>
              <span><Mono className="font-bold text-teal-700">{fp24}</Mono> Full Load Pickup{fp24 !== 1 ? "s" : ""}</span>
              <span><Mono className="font-bold text-red-600">{dl24}</Mono> Return Deadline{dl24 !== 1 ? "s" : ""}</span>
              <span><Mono className="font-bold text-amber-600">{pr}</Mono> Planned Return{pr !== 1 ? "s" : ""}</span>
            </div>
          );
        })()}

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-white border border-slate-200 rounded-lg overflow-hidden">
            {["day", "week", "month"].map(v => (
              <button key={v} onClick={() => setCalView(v)}
                className={`px-3 py-2 text-xs font-semibold border-r border-slate-100 last:border-0 capitalize ${calView === v ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
                {v}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => nav(-1)} className="bg-white border border-slate-200 rounded-lg p-2 hover:bg-slate-50"><ChevronLeft size={14} /></button>
            <button onClick={() => setCalAnchor(startOfDay(now))} className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold hover:bg-slate-50">Today</button>
            <button onClick={() => nav(1)} className="bg-white border border-slate-200 rounded-lg p-2 hover:bg-slate-50"><ChevronRight size={14} /></button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 ml-auto text-xs">
            <select value={typeF} onChange={e => setTypeF(e.target.value)} className="bg-white border border-slate-300 rounded-lg px-2 py-1.5">
              <option value="all">Event: All</option>
              {Object.entries(EVT).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select value={riskF} onChange={e => setRiskF(e.target.value)} className="bg-white border border-slate-300 rounded-lg px-2 py-1.5">
              <option value="all">Risk: All</option>
              <option value="watch">Watch</option><option value="critical">Critical</option><option value="overdue">Overdue</option>
            </select>
            <select value={lineF} onChange={e => setLineF(e.target.value)} className="bg-white border border-slate-300 rounded-lg px-2 py-1.5">
              <option value="all">Line: All</option>
              {allLines.map(l => <option key={l}>{l}</option>)}
            </select>
            <select value={sizeF} onChange={e => setSizeF(e.target.value)} className="bg-white border border-slate-300 rounded-lg px-2 py-1.5">
              <option value="all">Size: All</option>
              {SIZES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {calView === "month" && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-100 text-sm font-bold">{monthTitle}</div>
            <div className="grid grid-cols-7 border-b border-slate-100">
              {["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map(dw => (
                <div key={dw} className="px-2 py-1.5 text-[9px] font-extrabold tracking-widest text-slate-400 text-center">{dw}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {monthCells.map(({ ts, inMonth }) => {
                const evs = events.filter(e => sameDay(e.ts, ts)).sort((a, b) => a.ts - b.ts);
                const isToday = sameDay(ts, now);
                const shown = evs.slice(0, 3);
                return (
                  <div key={ts} className={`min-h-24 border-b border-r border-slate-100 p-1.5 ${inMonth ? "bg-white" : "bg-slate-50/70"}`}>
                    <div className={`text-[10px] font-bold mb-1 ${isToday ? "text-white bg-teal-600 rounded-full w-5 h-5 flex items-center justify-center" : inMonth ? "text-slate-700" : "text-slate-300"}`}>
                      {new Date(ts).getDate()}
                    </div>
                    {shown.map(e => {
                      const cfg = EVT[e.type];
                      const od = e.type === "deadline" && e.overdue;
                      return (
                        <button key={e.key} onClick={() => setCalEvent(e)}
                          className={`w-full text-left rounded px-1 py-0.5 mb-0.5 text-[8px] leading-tight hover:bg-slate-50 ${od ? "bg-red-700 text-white hover:bg-red-600" : ""}`}>
                          <span className={`font-bold font-mono ${od ? "text-red-100" : "text-slate-500"}`}>{fmtTime(e.ts)}</span>{" "}
                          <span className={`font-bold ${od ? "text-white" : cfg.txt}`}>{cfg.label}</span>
                          <span className={`block truncate font-mono ${od ? "text-red-100" : "text-slate-600"}`}>{e.title}</span>
                        </button>
                      );
                    })}
                    {evs.length > 3 && (
                      <button onClick={() => setDayList(ts)} className="text-[8px] font-bold text-teal-700 hover:underline">+{evs.length - 3} more</button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {calView !== "month" && <div className={`grid gap-3 ${calView === "week" ? "grid-cols-2 lg:grid-cols-7" : "grid-cols-1"}`}>
          {days.map(d => {
            const dayEv = events.filter(e => sameDay(e.ts, d));
            const isToday = sameDay(d, now);
            return (
              <div key={d} className={`bg-white rounded-xl border ${isToday ? "border-teal-500 ring-1 ring-teal-500" : "border-slate-200"} flex flex-col`}>
                <div className={`px-2.5 py-2 border-b border-slate-100 ${isToday ? "bg-teal-50 rounded-t-xl" : ""}`}>
                  <div className="text-xs font-bold">{dayLabel(d)}{isToday && <span className="text-teal-700"> · today</span>}</div>
                </div>
                <div className="p-1.5 space-y-1.5 flex-1">
                  {dayEv.map(e => <EventCard key={e.key} e={e} />)}
                  {dayEv.length === 0 && <div className="text-[10px] text-slate-300 text-center py-2">—</div>}
                </div>
              </div>
            );
          })}
        </div>}
      </>
    );
  }

  /* ---------- MATCHING — one engine, two entry modes ---------- */

  function SuggCardActions({ cta, onMatch, onReject }) {
    return (
      <div className="shrink-0 flex flex-col gap-1.5">
        <button onClick={onMatch} className="bg-teal-700 hover:bg-teal-600 text-white text-xs font-bold rounded-lg px-4 py-2.5 whitespace-nowrap">{cta}</button>
        <button onClick={onReject} className="bg-white border border-slate-300 text-slate-500 hover:bg-slate-50 text-[10px] font-bold rounded-lg px-4 py-1.5">REJECT</button>
      </div>
    );
  }

  /* Why is it compatible — spelled out, not implied */
  function CompatChecklist({ windowMs }) {
    return (
      <div className="text-[10px] text-emerald-700 mt-1 flex flex-wrap gap-x-3">
        <span>✓ Same shipping line</span>
        <span>✓ Correct container type</span>
        <span className={windowMs < 6 * H ? "text-amber-700" : ""}>✓ Pickup before return deadline{windowMs < 6 * H ? " (tight)" : ""}</span>
      </div>
    );
  }

  function Matching() {
    return (
      <>
        {lastPairing && (() => {
          return (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-xs text-emerald-800">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={15} className="shrink-0" />
                <b>PAIRING CONFIRMED ✓</b>
                <button onClick={() => setLastPairing(null)} className="ml-auto text-emerald-600 hover:text-emerald-900"><X size={13} /></button>
              </div>
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 bg-white border-2 border-dashed border-sky-400 rounded-lg px-2.5 py-1"><EmptyTag small /><Mono className="font-bold text-slate-800">{lastPairing.empty}</Mono></span>
                <span className="text-violet-700 font-bold inline-flex items-center gap-1"><ArrowLeftRight size={13} /></span>
                <span className="inline-flex items-center gap-1.5 bg-teal-800 text-white rounded-lg px-2.5 py-1"><Mono className="font-bold">{lastPairing.fullContainer}</Mono><span className="text-teal-200 text-[10px]">{lastPairing.load}</span></span>

              </div>
            </div>
          );
        })()}
        <p className="text-[11px] text-slate-500 -mt-1">
          Demand comes directly from created Shipments — there is no separate Full Loads inventory here.
        </p>
        <MatchModeA />
      </>
    );
  }

  /* MODE A — I have an empty container: which next loads can it take? */
  function MatchModeA() {
    const [showIncompatA, setShowIncompatA] = useState(false);
    const c = availableEmpties.find(x => x.id === selEmpty) || availableEmpties[0];
    const sugg = c ? loadsFor(c, loads, now, Object.entries(rejected).filter(([, ids]) => ids.includes(c.id)).map(([lid]) => lid)) : [];
    const suggIds = new Set(sugg.map(s => s.dm.id));
    const incompatible = c ? openLoads.filter(l => !suggIds.has(l.id)).map(dm => {
      const issues = [];
      if (dm.line !== c.line) issues.push("Shipping Line mismatch");
      if (dm.size !== c.size) issues.push("Container size mismatch");
      if (dm.appointment > c.deadline) issues.push("Pickup after the return deadline");
      return { dm, issues };
    }) : [];

    return (
      <div className="grid lg:grid-cols-5 gap-5 items-start">
        <div className="lg:col-span-2 space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">Select an Empty Container</h3>
          {availableEmpties.map(x => {
            const r = riskOf(x, now);
            return (
              <button key={x.id} onClick={() => setSelEmpty(x.id)}
                className={`w-full text-left rounded-xl border p-3 transition-all cursor-pointer ${(c?.id === x.id) ? "border-2 border-teal-600 bg-teal-50/60 shadow-sm" : "bg-white border-slate-200 hover:shadow-md hover:border-slate-300"}`}>
                {c?.id === x.id && <div className="text-[9px] font-extrabold tracking-widest text-teal-700 mb-1">✓ SELECTED</div>}
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5"><EmptyTag small /><Mono className="text-sm font-bold">{x.container}</Mono></span>
                  <RiskBadge risk={r} />
                </div>
                <div className="text-[11px] text-slate-500 mt-1">{x.line} · {x.size} · {x.location}</div>
                <div className={`text-[11px] font-bold font-mono ${r.txt}`}>{x.deadline - now < 0 ? `${fmtRel(now - x.deadline)} past return deadline` : `${fmtRel(x.deadline - now)} remaining`}</div>
              </button>
            );
          })}
          {availableEmpties.length === 0 && <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-xl p-4">No empty containers waiting.</p>}
        </div>

        <div className="lg:col-span-3 space-y-2">
          {c && (
            <div className="text-center pb-1">
              <div className="text-[9px] font-extrabold uppercase tracking-widest text-slate-400">Matching for</div>
              <div className="flex items-center justify-center gap-2 mt-0.5">
                <EmptyTag small /><Mono className="font-bold">{c.container}</Mono>
                <Mono className={`text-xs font-bold ${riskOf(c, now)?.txt}`}>
                  {c.deadline - now < 0 ? `${fmtRel(now - c.deadline)} past return deadline` : `${fmtRel(c.deadline - now)} before return deadline`}
                </Mono>
              </div>
              <div className="flex flex-col items-center mt-1">
                <span className="h-2.5 w-px bg-slate-300" />
                <span className="text-[8px] font-bold uppercase tracking-widest text-slate-400">shipment opportunities</span>
                <span className="h-2.5 w-px bg-slate-300" />
              </div>
            </div>
          )}
          {!c && <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">Shipment Opportunities</h3>}
          {c && sugg.filter(s => !s.rejected).map((s, idx) => {
            const score = Math.min(98, Math.max(45, Math.round(s.score)));
            const first = idx === 0;
            return (
              <React.Fragment key={s.dm.id}>
                {first && <h4 className="text-[9px] font-extrabold uppercase tracking-widest text-teal-700">System recommendation</h4>}
                {idx === 1 && <h4 className="text-[9px] font-extrabold uppercase tracking-widest text-slate-400 pt-1.5">Other shipment opportunities</h4>}
                <div className={`bg-white rounded-xl border p-4 ${first ? "border-teal-400 ring-1 ring-teal-200" : "border-slate-200"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[9px] font-extrabold tracking-wider rounded px-1.5 py-0.5 border ${SUG_LABEL[s.label]}`}>{s.label}</span>
                        <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Shipment</span>
                        <Mono className="text-sm font-bold">{s.dm.id}</Mono>
                        <span className="text-xs text-slate-500">{s.dm.line} · {s.dm.size}</span>
                        <span className="ml-auto text-[10px] font-bold text-teal-700 bg-teal-50 border border-teal-200 rounded-full px-2 py-0.5">Match {score}%</span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] text-slate-600 mt-2">
                        <span>Full container: <Mono className="font-bold">{s.dm.fullContainer}</Mono></span>
                        <span>Pickup: <Mono className="font-semibold">{fmtDT(s.dm.appointment)}</Mono></span>
                        <span>Pickup location: <b>{s.dm.pickup}</b></span>
                        <span>Deadline margin: <Mono className={`font-semibold ${s.windowMs < 6 * H ? "text-amber-700" : "text-emerald-700"}`}>+{fmtRel(s.windowMs)}</Mono></span>
                        <span>Transporter: <b>{s.dm.transporter || "Not assigned yet"}</b></span>
                        <span className="text-slate-400">{s.dm.transporter ? "Assigned in Shipment module" : "Assignment happens in Shipment creation"}</span>
                      </div>
                      <CompatChecklist windowMs={s.windowMs} />
                    </div>
                    <SuggCardActions cta="CONFIRM PAIRING"
                      onMatch={() => pairDirect(c.id, s.dm, `Matching — ${s.label.charAt(0) + s.label.slice(1).toLowerCase()}`)}
                      onReject={() => rejectPair(s.dm.id, c.id)} />
                  </div>
                </div>
              </React.Fragment>
            );
          })}
          {c && sugg.filter(s => !s.rejected).length === 0 && (
            <div className="bg-white border-2 border-slate-200 rounded-xl p-6 text-center">
              <p className="text-sm font-bold text-slate-800">NO SHIPMENT OPPORTUNITY</p>
              <p className="text-xs text-slate-500 mt-1">No created Shipment can use this container before its return deadline.</p>
              <div className="mt-3 inline-block text-left text-xs bg-slate-50 rounded-lg px-4 py-2">
                <Mono className="font-bold">{c.container}</Mono>
                <div className="text-[10px] text-slate-500">Return deadline: <Mono className="font-semibold">{fmtDT(c.deadline)}</Mono></div>
              </div>
              <div className="mt-3">
                <div className="text-[9px] font-extrabold uppercase tracking-widest text-slate-400 mb-1.5">Recommended action</div>
                <button onClick={() => planReturn(c.id)} className="bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-lg px-5 py-2.5 inline-flex items-center gap-1.5">
                  <RotateCcw size={12} /> PLAN EMPTY RETURN
                </button>
              </div>
            </div>
          )}
          {c && incompatible.length > 0 && (
            <div className="pt-1.5">
              <button onClick={() => setShowIncompatA(v => !v)} className="text-[11px] font-semibold text-slate-500 hover:text-slate-800">
                Why? · View incompatible Shipments · {incompatible.length} {showIncompatA ? "▾" : "›"}
              </button>
              {showIncompatA && incompatible.map(({ dm, issues }) => (
                <div key={dm.id} className="bg-white rounded-xl border border-slate-100 p-3 opacity-70 mt-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <FullTag small /><Mono className="text-xs font-bold">{dm.id}</Mono>
                    <span className="text-[11px] text-slate-500">{dm.line} · {dm.size}</span>
                  </div>
                  <div className="mt-1 text-[10px] text-red-600">{issues.map(i => <span key={i} className="mr-3">· {i}</span>)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* MODE B — I have a future full load: which empty containers can serve it? */
  /* ---------- CHAINS — horizontal, flow-based, card per chain ----------
     CHAIN = connected cycles. CYCLE = Full → Delivered → Empty, then pairing (link to a
     DIFFERENT full container) or final return (closes the chain). See it, don't read it. */

  function Cycles() {
    /* Build chains by following pairings: cycle N's nextFull load = cycle N+1's prevLoad */
    const chains = useMemo(() => {
      const byPrev = {};
      cycles.forEach(c => { byPrev[c.prevLoad] = c; });
      const isContinuation = new Set(cycles.filter(c => c.nextFull && byPrev[c.nextFull.ref]).map(c => byPrev[c.nextFull.ref].id));
      const starts = cycles.filter(c => !isContinuation.has(c.id)).sort((a, b) => a.deliveredAt - b.deliveredAt);
      return starts.map((start, idx) => {
        const seq = [start];
        let cur = start;
        while (cur.nextFull && byPrev[cur.nextFull.ref]) { cur = byPrev[cur.nextFull.ref]; seq.push(cur); }
        const last = seq[seq.length - 1];
        const closedChain = isClosed(last) && ["returned", "returned_late"].includes(last.outcome);
        return { id: `CHN-${String(11 + idx).padStart(5, "0")}`, seq, last, closedChain };
      }).sort((a, b) => b.seq.length - a.seq.length);
    }, [cycles]);

    const dRange = (c) => {
      const a = new Date(c.deliveredAt), b = new Date(isClosed(c) ? c.closedAt : now);
      const f = (d) => d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }).toUpperCase();
      return `${f(a)} – ${f(b)}`;
    };

    const scrollRef = useRef(null);
    const scrollBy = (dx) => scrollRef.current?.scrollBy({ left: dx, behavior: "smooth" });

    /* → thin neutral arrow = SAME container changing state (unloaded)
       ⇄ violet connector = pairing between TWO DIFFERENT containers */
    const Unload = () => (
      <div className="flex flex-col items-center justify-center shrink-0 px-1.5 self-center">
        <ArrowRight size={14} className="text-slate-300" />
        <span className="text-[7px] font-bold uppercase tracking-wider text-slate-400">Unloaded</span>
      </div>
    );
    const Pair = () => (
      <div className="flex flex-col items-center justify-center shrink-0 px-2 self-center">
        <div className="flex items-center gap-0.5 text-violet-600">
          <span className="h-0.5 w-3 rounded bg-violet-300" /><ArrowLeftRight size={14} /><span className="h-0.5 w-3 rounded bg-violet-300" />
        </div>
        <span className="text-[8px] font-extrabold uppercase tracking-wider text-violet-700">Paired</span>
        <span className="text-[7px] text-slate-400 whitespace-nowrap">different container</span>
      </div>
    );
    const Ret = () => (
      <div className="flex flex-col items-center justify-center shrink-0 px-1.5 self-center">
        <ArrowRight size={14} className="text-amber-500" />
        <span className="text-[7px] font-bold uppercase tracking-wider text-amber-600">Return</span>
      </div>
    );
    const FullCard = ({ container, load, line, size, ts, tsLabel, dashed, onClick }) => (
      <button onClick={onClick} className={`rounded-xl px-3.5 py-2.5 min-w-40 shrink-0 text-left transition-shadow hover:shadow-md ${dashed ? "border-2 border-dashed border-teal-400 bg-teal-50/40 text-teal-900" : "bg-teal-800 text-white shadow-sm"}`}>
        <div className={`flex items-center gap-1.5 text-[9px] font-extrabold tracking-widest ${dashed ? "text-teal-700" : "text-teal-200"}`}><Package size={11} /> FULL</div>
        <Mono className="block text-sm font-bold mt-0.5">{container}</Mono>
        <div className={`text-[9px] mt-0.5 ${dashed ? "text-teal-700" : "text-teal-100"}`}><Mono>{load}</Mono> · {line} · {size}</div>
        <div className={`text-[9px] ${dashed ? "text-teal-600" : "text-teal-300"}`}>{tsLabel} <Mono>{fmtDT(ts)}</Mono></div>
      </button>
    );
    const EmptyCard = ({ c: cc, onClick }) => {
      const end = cc.matchedAt ?? cc.dispatchedAt ?? cc.closedAt ?? now;
      return (
        <button onClick={onClick} className="rounded-xl px-3.5 py-2.5 min-w-40 shrink-0 text-left border-2 border-dashed border-sky-400 bg-white hover:bg-sky-50/60 transition-colors">
          <div className="flex items-center gap-1.5 text-[9px] font-extrabold tracking-widest text-sky-700"><PackageOpen size={11} /> EMPTY</div>
          <Mono className="block text-sm font-bold mt-0.5 text-slate-800">{cc.container}</Mono>
          <div className="text-[9px] text-slate-500 mt-0.5">Empty since <Mono>{fmtDT(cc.emptyReadyAt)}</Mono></div>
          <div className="text-[9px] text-slate-500">Empty time <Mono className="font-semibold">{fmtRel(Math.max(0, end - cc.emptyReadyAt))}</Mono></div>
        </button>
      );
    };

    return (
      <div className="space-y-5">
        <div className="flex items-center gap-4 text-[10px] text-slate-500">
          <span className="inline-flex items-center gap-1.5"><span className="w-4 h-3 rounded bg-teal-800 inline-block" /> Full container</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-4 h-3 rounded border-2 border-dashed border-sky-400 bg-white inline-block" /> Empty container</span>
          <span className="inline-flex items-center gap-1.5"><ArrowRight size={11} /> same container, unloaded</span>
          <span className="inline-flex items-center gap-1.5 text-violet-700 font-semibold"><ArrowLeftRight size={11} /> pairing — two different containers</span>
        </div>

        {chains.map(ch => {
          const pairings = ch.seq.filter(c => c.outcome === "paired" || (!isClosed(c) && c.nextFull)).length;
          const finalReturn = ch.closedChain ? 1 : 0;
          const emptyEnd = (c) => c.matchedAt ?? c.dispatchedAt ?? c.closedAt ?? now;
          const avgEmpty = ch.seq.reduce((s2, c) => s2 + Math.max(0, emptyEnd(c) - c.emptyReadyAt), 0) / ch.seq.length;
          return (
            <section key={ch.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              {/* KPI header — fixed above the flow */}
              <div className="px-5 py-3.5 border-b border-slate-100 flex flex-wrap items-center gap-x-6 gap-y-2">
                <div className="flex items-center gap-2">
                  <Link2 size={15} className="text-teal-700" />
                  <Mono className="font-bold">CHAIN {ch.id}</Mono>
                  <span className="text-xs text-slate-500">{ch.seq[0].line}</span>
                  {ch.closedChain
                    ? <span className="text-[10px] font-bold bg-slate-100 border border-slate-200 text-slate-600 rounded-full px-2 py-0.5">CLOSED ✓</span>
                    : <span className="text-[10px] font-bold bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-full px-2 py-0.5">ACTIVE</span>}
                </div>
                <div className="flex items-center gap-5 text-center ml-auto">
                  {[[ch.seq.length, "Cycles"], [pairings, "Pairings"], [pairings, "Returns Avoided"],
                    [`${ch.seq.length ? Math.round(pairings / ch.seq.length * 100) : 0}%`, "Return Avoidance"],
                    [`$${pairings * DET_RATE * 2}`, "Detention Avoided"],
                    [fmtRel(avgEmpty), "Avg. Empty Time"], [finalReturn, "Final Return"]].map(([v, k]) => (
                    <div key={k}>
                      <div className={`text-sm font-bold font-mono ${k === "Pairings" && v > 0 ? "text-violet-700" : ""}`}>{v}</div>
                      <div className="text-[8px] uppercase tracking-wide text-slate-400 max-w-20 leading-tight">{k}</div>
                    </div>
                  ))}
                  <div className="flex gap-1 pl-2">
                    <button onClick={() => scrollBy(-320)} className="w-6 h-6 rounded border border-slate-200 text-slate-400 hover:text-slate-700 flex items-center justify-center"><ChevronLeft size={13} /></button>
                    <button onClick={() => scrollBy(320)} className="w-6 h-6 rounded border border-slate-200 text-slate-400 hover:text-slate-700 flex items-center justify-center"><ChevronRight size={13} /></button>
                  </div>
                </div>
              </div>

              {/* ONE CONTINUOUS FLOW — cycles are labelled segments, never separate cards */}
              <div ref={ch === chains[0] ? scrollRef : undefined} className="overflow-x-auto">
                <div className="flex items-stretch px-5 py-4 min-w-max gap-0">
                  {ch.seq.map((c, i) => {
                    const paired = !!c.nextFull;
                    const returnedEnd = isClosed(c) && ["returned", "returned_late"].includes(c.outcome);
                    const isLast = i === ch.seq.length - 1;
                    const protectedDl = isClosed(c) ? c.closedAt <= c.deadline : null;
                    return (
                      <React.Fragment key={c.id}>
                        {/* SEGMENT = cycle label on top, flow below — no card wrapper */}
                        <div className="flex flex-col">
                          <div className="border-t-2 border-slate-200 mx-1 pt-1 mb-2 flex items-baseline gap-2 whitespace-nowrap">
                            <span className="text-[9px] font-extrabold uppercase tracking-widest text-slate-400">Cycle {i + 1}</span>
                            <span className="text-[8px] text-slate-400">{dRange(c)}</span>
                            <span className="text-[8px] text-slate-400">· {fmtRel(Math.max(0, (c.matchedAt ?? c.dispatchedAt ?? c.closedAt ?? now) - c.emptyReadyAt))} empty</span>
                            {protectedDl != null && <span className={`text-[8px] font-semibold ${protectedDl ? "text-emerald-600" : "text-red-600"}`}>· {protectedDl ? "Deadline protected ✓" : "Deadline missed ✗"}</span>}
                            {!isClosed(c) && <span className="text-[8px] font-semibold text-teal-700">· CURRENT</span>}
                          </div>
                          <div className="flex items-stretch">
                            <FullCard container={c.container} load={c.prevLoad} line={c.line} size={c.size}
                              ts={c.deliveredAt} tsLabel="Delivered" onClick={() => setDetail(c.id)} />
                            <Unload />
                            <EmptyCard c={c} onClick={() => setDetail(c.id)} />
                            {/* undecided current position */}
                            {!isClosed(c) && !paired && c.stage !== "return_planned" && (
                              <>
                                <div className="flex items-center px-1.5"><ArrowRight size={14} className="text-slate-200" /></div>
                                <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-3 py-2 min-w-36 shrink-0 self-center">
                                  <div className="text-[8px] font-extrabold uppercase tracking-widest text-slate-400">Next decision</div>
                                  <div className="text-[10px] font-bold text-slate-600">{cStatus(c).label}</div>
                                  <div className="text-[9px] text-slate-400">Find Full Load or Return Empty</div>
                                </div>
                              </>
                            )}
                            {/* return end */}
                            {(returnedEnd || c.stage === "return_planned") && (
                              <>
                                <Ret />
                                <div className={`rounded-xl px-3.5 py-2.5 min-w-40 shrink-0 self-center border-2 ${returnedEnd ? "border-slate-300 bg-slate-100 text-slate-700" : "border-amber-300 bg-amber-50 text-amber-900"}`}>
                                  <div className="flex items-center gap-1.5 text-[9px] font-extrabold tracking-widest">
                                    {returnedEnd ? <CheckCircle2 size={11} className="text-emerald-600" /> : <RotateCcw size={11} />}
                                    {returnedEnd ? "DEPOT" : "RETURN PLANNED"}
                                  </div>
                                  <div className="text-[10px] font-semibold mt-0.5">{returnedEnd ? "Return completed" : "Awaiting confirmation"}</div>
                                  <div className="text-[9px] text-slate-500">
                                    {returnedEnd ? <><Mono>{fmtDT(c.closedAt)}</Mono> · {c.closedAt <= c.deadline ? "on time ✓" : "late"}</> : <>Deadline <Mono className="font-semibold">{fmtDT(c.deadline)}</Mono></>}
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        </div>

                        {/* PAIRING connector — the ⇄ between EMPTY(i) and FULL(i+1) */}
                        {paired && !isLast && <div className="flex flex-col"><div className="pt-1 mb-2 h-5" /><div className="flex items-stretch"><Pair /></div></div>}
                        {paired && isLast && (
                          <div className="flex flex-col">
                            <div className="pt-1 mb-2 h-5" />
                            <div className="flex items-stretch">
                              <Pair />
                              <FullCard dashed container={c.nextFull.fullContainer} load={c.nextFull.ref} line={c.line} size={c.size}
                                ts={c.nextFull.pickupAt} tsLabel="Pickup"
                                onClick={() => loads.find(l => l.id === c.nextFull.ref) ? setLoadModal(c.nextFull.ref) : setDetail(c.id)} />
                            </div>
                          </div>
                        )}
                        {returnedEnd && isLast && (
                          <div className="flex flex-col"><div className="pt-1 mb-2 h-5" />
                            <div className="flex items-center pl-2 h-full">
                              <div className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 border-l-2 border-slate-200 pl-3 py-2">Chain<br />closed</div>
                            </div>
                          </div>
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
            </section>
          );
        })}
      </div>
    );
  }

  /* ---------- DASHBOARD — performance only ---------- */

  function Dashboard() {
    const periodMs = perf.period === "1" ? D : perf.period === "7" ? 7 * D : perf.period === "30" ? 30 * D : Infinity;
    const inScope = cycles.filter(c => {
      if ((now - c.deliveredAt) > periodMs) return false;
      if (perf.line !== "all" && c.line !== perf.line) return false;
      if (perf.transporter !== "all" && c.transporter !== perf.transporter) return false;
      if (perf.size !== "all" && c.size !== perf.size) return false;
      return true;
    });
    const closedScope = inScope.filter(isClosed);
    const paired = closedScope.filter(c => c.outcome === "paired").length + inScope.filter(c => !isClosed(c) && c.nextFull).length;
    const returnedDirect = closedScope.filter(c => ["returned", "returned_late"].includes(c.outcome)).length;
    const onTimeRet = closedScope.filter(c => ["returned", "returned_late"].includes(c.outcome) && c.closedAt <= c.deadline).length;
    const overdueNow = inScope.filter(c => !isClosed(c) && now > c.deadline).length;
    const containers = [...new Set(inScope.map(c => c.container))];
    const exposure = inScope.filter(c => !isClosed(c) && now > c.deadline)
      .reduce((s2, c) => s2 + Math.ceil((now - c.deadline) / D) * DET_RATE, 0);
    const dwellEnd = (c) => c.matchedAt ?? c.dispatchedAt ?? c.closedAt ?? now;
    const dwellAvg = inScope.length ? inScope.reduce((s2, c) => s2 + Math.max(0, dwellEnd(c) - c.emptyReadyAt), 0) / inScope.length : 0;

    const pairingRate = closedScope.length ? Math.round(closedScope.filter(c => c.outcome === "paired").length / closedScope.length * 100) : 0;
    const hero = [
      { label: "Pairing Rate", val: closedScope.length ? `${pairingRate}%` : "—", sub: "Closed cycles ending in a pairing", cls: "text-violet-700" },
      { label: "Avg Empty Time", val: fmtRel(dwellAvg), sub: "From Empty Available to decision", cls: "" },
      { label: "Empty Returns Avoided", val: paired, sub: "One avoided empty trip per pairing", cls: "text-teal-700" },
      { label: "Est. Detention Avoided", val: `$${paired * DET_RATE * 2}`, sub: "Deadline exposure removed by pairings", cls: "text-teal-700" },
    ];
    const second = [
      { label: "Empty Containers Managed", val: containers.length },
      { label: "Returned Directly", val: returnedDirect },
      { label: "On-Time Empty Return Rate", val: returnedDirect ? `${Math.round(onTimeRet / returnedDirect * 100)}%` : "—" },
      { label: "Return Overdue Now", val: overdueNow, cls: overdueNow ? "text-red-700" : "" },
      { label: "Detention Exposure", val: `$${exposure}`, cls: exposure ? "text-red-700" : "" },
    ];
    /* demo trend: weekly return-avoidance rate */
    const trend = [42, 55, 61, pairingRate || 66];
    const failReasons = [
      ["No compatible full load in window", 46],
      ["Shipping line mismatch", 24],
      ["Container type mismatch", 18],
      ["Deadline too close (window < 6h)", 12],
    ];

    return (
      <>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <select value={perf.period} onChange={e => setPerf(p => ({ ...p, period: e.target.value }))} className="bg-white border border-slate-300 rounded-lg px-2 py-1.5">
            <option value="1">Today</option><option value="7">7 days</option><option value="30">30 days</option><option value="all">All time</option>
          </select>
          <select value={perf.line} onChange={e => setPerf(p => ({ ...p, line: e.target.value }))} className="bg-white border border-slate-300 rounded-lg px-2 py-1.5">
            <option value="all">Shipping Line: All</option>
            {allLines.map(l => <option key={l}>{l}</option>)}
          </select>
          <select value={perf.transporter} onChange={e => setPerf(p => ({ ...p, transporter: e.target.value }))} className="bg-white border border-slate-300 rounded-lg px-2 py-1.5">
            <option value="all">Transporter: All</option>
            {allTransporters.map(t => <option key={t}>{t}</option>)}
          </select>
          <select value={perf.size} onChange={e => setPerf(p => ({ ...p, size: e.target.value }))} className="bg-white border border-slate-300 rounded-lg px-2 py-1.5">
            <option value="all">Size: All</option>
            {SIZES.map(sz => <option key={sz}>{sz}</option>)}
          </select>
        </div>

        {/* HERO — is pairing working? */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {hero.map(cd => (
            <div key={cd.label} className="bg-white rounded-xl border border-slate-200 p-5">
              <div className={`text-3xl font-bold font-mono ${cd.cls}`}>{cd.val}</div>
              <div className="text-sm font-semibold mt-1">{cd.label}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">{cd.sub}</div>
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-2 gap-4">
          {/* TREND */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Empty-return avoidance — last 4 weeks</h3>
            <div className="flex items-end gap-4 h-28 mt-4">
              {trend.map((v, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[10px] font-bold font-mono text-violet-700">{v}%</span>
                  <div className="w-full bg-violet-600/90 rounded-t" style={{ height: `${v}%` }} />
                  <span className="text-[9px] text-slate-400">W{i + 1}</span>
                </div>
              ))}
            </div>
          </div>

          {/* WHY PAIRINGS FAILED */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Why pairings failed</h3>
            <div className="space-y-2.5 mt-4">
              {failReasons.map(([label, pct]) => (
                <div key={label}>
                  <div className="flex justify-between text-[11px] text-slate-600"><span>{label}</span><Mono className="font-bold">{pct}%</Mono></div>
                  <div className="h-1.5 bg-slate-100 rounded-full mt-1"><div className="h-full bg-slate-400 rounded-full" style={{ width: `${pct}%` }} /></div>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-slate-400 mt-3">Improvement lever: widen the compatible-load window by anticipating full loads earlier.</p>
          </div>
        </div>

        {/* SECONDARY */}
        <div className="bg-white rounded-xl border border-slate-200 px-5 py-4 flex flex-wrap gap-x-10 gap-y-3">
          {second.map(cd => (
            <div key={cd.label}>
              <div className={`text-xl font-bold font-mono ${cd.cls || ""}`}>{cd.val}</div>
              <div className="text-[11px] text-slate-500">{cd.label}</div>
            </div>
          ))}
        </div>

        <p className="text-[11px] text-slate-400">
          Daily operations live in the Control Tower — this page answers "are we avoiding unnecessary empty movements?".
        </p>
      </>
    );
  }

  /* ---------- Container Journey + Detail ---------- */

  /* ---------- OPERATION FLOW — PAST → NOW → NEXT, three cards, no caption noise ---------- */

  function OperationFlow({ c }) {
    const nf = c.nextFull;
    const returnBranch = c.stage === "return_planned" || ["returned", "returned_late"].includes(c.outcome);
    const dwellEnd = c.matchedAt ?? c.dispatchedAt ?? c.closedAt ?? now;
    const dwell = Math.max(0, dwellEnd - c.emptyReadyAt);
    const Card = ({ label, accent, children }) => (
      <div className={`flex-1 min-w-40 rounded-xl px-3.5 py-3 ${accent}`}>
        <div className="text-[9px] font-extrabold uppercase tracking-widest opacity-70">{label}</div>
        <div className="mt-1">{children}</div>
      </div>
    );
    return (
      <div className="flex items-stretch gap-2 mt-4">
        {/* PAST */}
        <Card label="Previous Full" accent="bg-teal-700 text-white">
          <div className="flex items-center gap-1.5"><Package size={12} /><Mono className="text-sm font-bold">{c.container}</Mono></div>
          <div className="text-[10px] text-teal-100 mt-0.5"><Mono>{c.prevLoad}</Mono></div>
          <div className="text-[10px] text-teal-200">Delivered {fmtDT(c.deliveredAt)}</div>
        </Card>
        <div className="self-center shrink-0"><ArrowRight size={16} className="text-slate-300" /></div>
        {/* NOW */}
        <Card label={isClosed(c) ? "Empty" : "Current"} accent="border-2 border-dashed border-sky-400 bg-sky-50/40 text-slate-800">
          <div className="flex items-center gap-1.5 text-sky-700"><PackageOpen size={12} /><Mono className="text-sm font-bold text-slate-800">{c.container}</Mono></div>
          <div className="text-[10px] text-slate-500 mt-0.5">{c.location}</div>
          <div className="text-[10px] text-slate-500">{isClosed(c) ? `Empty ${fmtRel(dwell)}` : `Empty for ${fmtRel(now - c.emptyReadyAt)}`}</div>
        </Card>
        <div className="self-center shrink-0"><ArrowRight size={16} className="text-slate-300" /></div>
        {/* NEXT */}
        {nf ? (
          <Card label="Paired Full" accent="bg-violet-50 border-2 border-violet-300 text-violet-900">
            <div className="flex items-center gap-1.5">
              <Package size={12} className="text-violet-700" /><Mono className="text-sm font-bold">{nf.fullContainer}</Mono>
              <span title="Pairing links this empty container to a different full container operation." className="text-violet-400 cursor-help text-[10px]">ⓘ</span>
            </div>
            <div className="text-[10px] text-violet-700 mt-0.5"><Mono>{nf.ref}</Mono></div>
            <div className="text-[10px] text-slate-500">Pickup {fmtDT(nf.pickupAt)}</div>
          </Card>
        ) : returnBranch ? (
          <Card label={isClosed(c) ? "Returned" : cStatus(c).label}
            accent={isClosed(c) ? "bg-emerald-50 border-2 border-emerald-200 text-emerald-900" : "bg-amber-50 border-2 border-amber-300 text-amber-900"}>
            <div className="flex items-center gap-1.5">
              {isClosed(c) ? <CheckCircle2 size={12} className="text-emerald-600" /> : <RotateCcw size={12} className="text-amber-700" />}
              <Mono className="text-sm font-bold">{c.container}</Mono>
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">{c.returnLoc || "Terminal Hub Principal"}</div>
            <div className="text-[10px] text-slate-500">{isClosed(c) ? `Returned ${fmtDT(c.closedAt)}` : `Deadline ${fmtDT(c.deadline)}`}</div>
          </Card>
        ) : (
          <Card label="Next Decision" accent="bg-slate-50 border-2 border-dashed border-slate-300 text-slate-500">
            <div className="text-xs font-semibold text-slate-600">No next operation selected</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Find Full Load or Return Empty</div>
          </Card>
        )}
      </div>
    );
  }

  /* ---------- Full Load context panel (from Calendar) — context first, then explicit action ---------- */

  /* ---------- SHIPMENT CREATION — the single source of demand (§8) ----------
     Step 3 recommends TRANSPORTER + EMPTY as one option; assignment creates the pairing. */
  function ShipmentWizard() {
    const [step, setStep] = useState(1);
    const [manual, setManual] = useState(false);
    const [d, setD] = useState({
      shipper: "Alpha Import Co.", project: "", shipType: "Container", cargo: "General Cargo",
      line: "CMA CGM", size: "40HC", qty: 1, fullContainer: "MSKU5558213",
      pickup: "Terminal Hub Principal", dest: "Alpha Warehouse (LOC-A)", hours: 20, distance: 12, price: 480,
    });
    const [choice, setChoice] = useState(null);       // { transporter, empties[] } | { split, alloc }
    const [slots, setSlots] = useState([]);           // per container: { transporter, empty, vehicle, driver }
    const pickupAt = now + d.hours * H;
    const close = () => setShipWizard(false);
    const set = (k, v) => setD(x => ({ ...x, [k]: v }));

    /* Fleetin checks which transporters currently hold a compatible empty (§6) */
    const compatible = active.filter(c =>
      c.stage === "empty" && c.line === d.line && c.size === d.size &&
      c.emptyReadyAt <= pickupAt && pickupAt <= c.deadline
    ).sort((a, b) => (a.deadline - pickupAt) - (b.deadline - pickupAt));
    const byTrans = {};
    compatible.forEach(c => { (byTrans[c.transporter] = byTrans[c.transporter] || []).push(c); });
    const allTrans = Object.keys(TRANSPORTERS);
    const options = allTrans.map(t => ({
      transporter: t,
      empties: (byTrans[t] || []).slice(0, d.qty),
      pool: (byTrans[t] || []).length,
      vehicles: TRANSPORTERS[t].vehicles.filter(v => v.avail).length,
    })).sort((a, b) => b.empties.length - a.empties.length || (a.empties[0]?.distKm ?? 99) - (b.empties[0]?.distKm ?? 99));
    const split = (() => {
      if (d.qty <= 1 || (options[0]?.empties.length ?? 0) >= d.qty) return null;
      const alloc = []; let left = d.qty;
      for (const o of options) { if (!o.pool || left <= 0) break; const take = Math.min(o.pool, left); alloc.push({ transporter: o.transporter, empties: (byTrans[o.transporter] || []).slice(0, take) }); left -= take; }
      return alloc.length > 1 ? { alloc, uncovered: left } : null;
    })();

    /* choosing a transporter builds the vehicle/driver slots — one per container (§11-14) */
    const buildSlots = (ch) => {
      const arr = [];
      if (ch?.split) ch.alloc.forEach(a => a.empties.forEach(c => arr.push({ transporter: a.transporter, empty: c, vehicle: "", driver: "" })));
      else if (ch) for (let i = 0; i < d.qty; i++) arr.push({ transporter: ch.transporter, empty: ch.empties[i] || null, vehicle: "", driver: "" });
      while (arr.length < d.qty) arr.push({ transporter: ch?.split ? options.find(o => o.vehicles > 0)?.transporter || allTrans[0] : ch?.transporter || allTrans[0], empty: null, vehicle: "", driver: "" });
      return arr.slice(0, d.qty);
    };
    const pick = (ch) => { setChoice(ch); setSlots(buildSlots(ch)); };
    const slotSet = (i, k, v) => setSlots(ss => ss.map((sl, j) => j === i ? { ...sl, [k]: v } : sl));
    const assignedCount = slots.filter(sl => sl.vehicle && sl.driver).length;
    const slotsOk = d.shipType !== "Container" || (slots.length === d.qty && assignedCount === d.qty);

    const createShipment = () => {
      const id = `MSN-${String(msnSeq).padStart(5, "0")}`;
      setMsnSeq(n => n + 1);
      const trs = [...new Set(slots.map(sl => sl.transporter))];
      const trName = trs.length > 1 ? trs.map(t => `${t} (${slots.filter(x => x.transporter === t).length})`).join(" + ") : trs[0] || "Unassigned";
      const dm = { id, fullContainer: d.fullContainer, shipper: d.shipper, line: d.line, size: d.size, qty: d.qty, assigned: [], transporter: trName, appointment: pickupAt, pickup: d.pickup, dest: d.dest, vehicles: slots.map(sl => ({ transporter: sl.transporter, vehicle: sl.vehicle, driver: sl.driver, empty: sl.empty?.container || null })) };
      setLoads(ls => [...ls, dm]);
      const empties = slots.filter(sl => sl.empty).map(sl => sl.empty);
      empties.forEach(c => pairDirect(c.id, dm, "Shipment assignment"));
      notify(`Shipment ${id} created — ${trName}${empties.length ? ` · ${empties.length} pairing${empties.length > 1 ? "s" : ""} created` : ""}. All modules synchronized.`);
      close();
    };

    const Field = ({ label, children, span }) => (
      <label className={`block text-xs ${span ? "col-span-2" : ""}`}>
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
        <div className="mt-1">{children}</div>
      </label>
    );
    const inputCls = "w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500";
    const STEPS = ["Details", "Route", "Transporter", "Vehicle & Driver", "Pricing & Review"];
    const StepDots = () => (
      <div className="flex items-center gap-1.5 flex-wrap">
        {STEPS.map((t, i) => (
          <div key={t} className="flex items-center gap-1.5">
            <span className={`w-5 h-5 rounded-full text-[9px] font-bold flex items-center justify-center ${step === i + 1 ? "bg-slate-900 text-white" : step > i + 1 ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-400"}`}>{i + 1}</span>
            <span className={`text-[9px] font-semibold ${step === i + 1 ? "text-slate-800" : "text-slate-400"} hidden md:inline`}>{t}</span>
            {i < STEPS.length - 1 && <span className="w-3 h-px bg-slate-200" />}
          </div>
        ))}
      </div>
    );
    const emptyChip = (c) => c ? (
      <span className="inline-flex items-center gap-1 rounded border-2 border-dashed border-sky-400 bg-white px-1.5 py-0.5 text-[10px]"><Mono className="font-bold">{c.container}</Mono></span>
    ) : <span className="text-[10px] text-slate-400">None — repositioning / standard operation</span>;

    return (
      <div className="fixed inset-0 bg-slate-900/50 z-40 flex items-start justify-center overflow-y-auto p-4 lg:p-8" onClick={close}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl" onClick={e => e.stopPropagation()}>
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-bold">New Shipment</h2>
              <div className="mt-1.5"><StepDots /></div>
            </div>
            <button onClick={close} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
          </div>

          <div className="p-6 space-y-4">
            {/* STEP 1 — DETAILS (§4): no Empty Container information here */}
            {step === 1 && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Shipper / Exporting Entity"><input className={inputCls} value={d.shipper} onChange={e => set("shipper", e.target.value)} /></Field>
                <Field label="Project (Optional)"><input className={inputCls} value={d.project} onChange={e => set("project", e.target.value)} placeholder="—" /></Field>
                <Field label="Shipment Type">
                  <select className={inputCls} value={d.shipType} onChange={e => set("shipType", e.target.value)}>
                    {["Container", "Bulk", "Machinery"].map(t => <option key={t}>{t}</option>)}
                  </select>
                </Field>
                <Field label="Cargo Category"><input className={inputCls} value={d.cargo} onChange={e => set("cargo", e.target.value)} /></Field>
                {d.shipType === "Container" && (
                  <>
                    <Field label="Container Size">
                      <select className={inputCls} value={d.size} onChange={e => set("size", e.target.value)}>
                        {["20'", "40'", "40HC"].map(z => <option key={z}>{z}</option>)}
                      </select>
                    </Field>
                    <Field label="Number Of Containers">
                      <select className={inputCls} value={d.qty} onChange={e => { set("qty", +e.target.value); setChoice(null); setSlots([]); }}>
                        {[1, 2, 3].map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </Field>
                    <Field label="Container Number(s)"><input className={inputCls + " font-mono"} value={d.fullContainer} onChange={e => set("fullContainer", e.target.value)} /></Field>
                    <Field label="Shipping Line">
                      <select className={inputCls} value={d.line} onChange={e => { set("line", e.target.value); setChoice(null); setSlots([]); }}>
                        {["CMA CGM", "Maersk", "Hapag-Lloyd", "MSC", "ONE"].map(l => <option key={l}>{l}</option>)}
                      </select>
                    </Field>
                  </>
                )}
              </div>
            )}

            {/* STEP 2 — ROUTE (§5) */}
            {step === 2 && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Pickup Location">
                  <select className={inputCls} value={d.pickup} onChange={e => set("pickup", e.target.value)}>
                    {["Terminal Hub Principal", "DCT Doraleh", "SGTD Terminal"].map(l => <option key={l}>{l}</option>)}
                  </select>
                </Field>
                <Field label="Pickup Date & Time">
                  <select className={inputCls} value={d.hours} onChange={e => { set("hours", +e.target.value); setChoice(null); setSlots([]); }}>
                    {[8, 14, 20, 30, 48, 72].map(h2 => <option key={h2} value={h2}>{fmtDT(now + h2 * H)}</option>)}
                  </select>
                </Field>
                <Field label="Drop-Off Location"><input className={inputCls} value={d.dest} onChange={e => set("dest", e.target.value)} /></Field>
                <Field label="Estimated Distance (Km)"><input type="number" className={inputCls + " font-mono"} value={d.distance} onChange={e => set("distance", +e.target.value)} /></Field>
                <div className="col-span-2 text-[10px] text-slate-400">Fleetin now has enough information to search transporters and compatible Empty Containers.</div>
              </div>
            )}

            {/* STEP 3 — TRANSPORTER RECOMMENDATION (§6-10) */}
            {step === 3 && !manual && (
              <div className="space-y-2.5">
                <div>
                  <h3 className="text-[10px] font-extrabold uppercase tracking-widest text-teal-700">Recommended Transporters</h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">Fleetin checks which transporters currently have compatible empty containers available for this shipment, and prioritizes them.</p>
                </div>
                {split && (
                  <div className={`rounded-xl border p-4 ${choice?.split ? "border-2 border-teal-600 bg-teal-50/60" : "border-violet-300 bg-violet-50/40"}`}>
                    {choice?.split && <div className="text-[9px] font-extrabold tracking-widest text-teal-700 mb-1">✓ SELECTED</div>}
                    <div className="text-xs font-bold text-violet-800">SUGGESTED ALLOCATION — {d.qty} containers across {split.alloc.length} transporters</div>
                    <div className="mt-1.5 space-y-1">
                      {split.alloc.map(a => (
                        <div key={a.transporter} className="text-[11px] text-slate-600">
                          <b>{a.transporter}</b> — {a.empties.length} vehicle{a.empties.length > 1 ? "s" : ""} / {a.empties.length} empt{a.empties.length > 1 ? "ies" : "y"}:
                          {a.empties.map(c => <Mono key={c.id} className="font-semibold"> {c.container}</Mono>)}
                        </div>
                      ))}
                      {split.uncovered > 0 && <div className="text-[10px] text-amber-700">{split.uncovered} container(s) without a compatible empty — repositioning required.</div>}
                    </div>
                    <button onClick={() => pick({ split: true, alloc: split.alloc })} className="mt-2 bg-teal-700 hover:bg-teal-600 text-white text-[11px] font-bold rounded-lg px-4 py-2">SELECT SUGGESTED ALLOCATION</button>
                  </div>
                )}
                {options.map((o, idx) => {
                  const sel = choice && !choice.split && choice.transporter === o.transporter;
                  const best = o.empties[0];
                  const rec = idx === 0 && o.empties.length > 0;
                  return (
                    <div key={o.transporter} className={`rounded-xl border p-4 ${sel ? "border-2 border-teal-600 bg-teal-50/60 shadow-sm" : rec ? "border-teal-400 ring-1 ring-teal-200 bg-white" : "border-slate-200 bg-white"}`}>
                      {sel && <div className="text-[9px] font-extrabold tracking-widest text-teal-700 mb-1">✓ SELECTED</div>}
                      <div className="flex items-center gap-2 flex-wrap">
                        {rec && <span className="text-[9px] font-extrabold tracking-wider rounded px-1.5 py-0.5 border bg-teal-50 text-teal-800 border-teal-300">RECOMMENDED</span>}
                        <span className="text-sm font-bold">{o.transporter}</span>
                        {o.empties.length > 0
                          ? <span className="text-[10px] font-bold text-sky-700 bg-sky-50 border border-sky-200 rounded-full px-2 py-0.5">{o.pool} COMPATIBLE EMPT{o.pool > 1 ? "IES" : "Y"} AVAILABLE</span>
                          : <span className="text-[10px] font-semibold text-slate-400 bg-slate-50 border border-slate-200 rounded-full px-2 py-0.5">No compatible empty</span>}
                        <span className="text-[10px] text-slate-400 ml-auto">{o.vehicles} vehicle{o.vehicles !== 1 ? "s" : ""} available</span>
                      </div>
                      {rec && <div className="text-[10px] text-slate-500 mt-1"><b className="text-teal-700">Why recommended?</b> This transporter already has a compatible Empty Container available near the shipment pickup location.</div>}
                      {best && (
                        <div className="mt-2 flex items-start gap-3 flex-wrap">
                          <div className="rounded-lg border-2 border-dashed border-sky-400 bg-white px-2.5 py-1.5">
                            <div className="text-[8px] font-extrabold tracking-widest text-sky-700">○ EMPTY CONTAINER</div>
                            <Mono className="text-xs font-bold">{best.container}</Mono>
                            <div className="text-[9px] text-slate-500">{best.line} · {best.size} · {best.location}</div>
                          </div>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px] text-slate-600 pt-0.5">
                            <span>Distance to shipment pickup: <b>{best.distKm === 0 ? "Same hub" : `${best.distKm} km`}</b></span>
                            <span>Shipment pickup: <Mono className="font-semibold">{fmtDT(pickupAt)}</Mono></span>
                            <span>Empty return deadline: <Mono className="font-semibold">{fmtDT(best.deadline)}</Mono></span>
                            <span>Deadline margin: <Mono className="font-bold text-emerald-700">+{fmtRel(best.deadline - pickupAt)}</Mono></span>
                            <span className="col-span-2 text-emerald-700">✓ Shipping Line ✓ Container Type ✓ Size ✓ Available before pickup ✓ Pickup before return deadline</span>
                          </div>
                        </div>
                      )}
                      <button onClick={() => pick(o)} className={`mt-2.5 text-[11px] font-bold rounded-lg px-4 py-2 ${rec || o.empties.length ? "bg-teal-700 hover:bg-teal-600 text-white" : "bg-white border border-slate-300 text-slate-600 hover:bg-slate-50"}`}>
                        SELECT {o.transporter.toUpperCase()}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* STEP 3 — MANUAL TRANSPORTER SELECTION (§10) */}
            {step === 3 && manual && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500">Select Transporter — Manual Assignment</h3>
                  <button onClick={() => setManual(false)} className="text-[11px] font-semibold text-teal-700 hover:underline">← Back to recommendations</button>
                </div>
                {allTrans.map(t => {
                  const cs = (byTrans[t] || []);
                  const sel = choice && !choice.split && choice.transporter === t;
                  return (
                    <div key={t} className={`rounded-xl border p-3.5 flex items-center justify-between gap-3 ${sel ? "border-2 border-teal-600 bg-teal-50/60" : "border-slate-200 bg-white"}`}>
                      <div>
                        <div className="text-sm font-bold">{t} {sel && <span className="text-[9px] font-extrabold tracking-widest text-teal-700 ml-1">✓ SELECTED</span>}</div>
                        <div className="text-[10px] text-slate-500">
                          {TRANSPORTERS[t].vehicles.filter(v => v.avail).length} vehicles available · {cs.length > 0
                            ? <span className="text-sky-700 font-semibold">{cs.length} compatible empt{cs.length > 1 ? "ies" : "y"}</span>
                            : <span className="text-amber-800 font-semibold">NO COMPATIBLE EMPTY AVAILABLE — repositioning / standard operation</span>}
                        </div>
                      </div>
                      <button onClick={() => pick({ transporter: t, empties: cs.slice(0, d.qty), pool: cs.length })}
                        className="shrink-0 text-[11px] font-bold rounded-lg px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white">SELECT</button>
                    </div>
                  );
                })}
                <p className="text-[10px] text-slate-400">Manual assignment does not require a compatible Empty Container — the assignment is never blocked.</p>
              </div>
            )}

            {/* STEP 4 — VEHICLE & DRIVER (§11-12) */}
            {step === 4 && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500">Select Vehicle & Driver</h3>
                  <span className={`text-[11px] font-bold ${assignedCount === d.qty ? "text-teal-700" : "text-slate-400"}`}>{assignedCount} / {d.qty} VEHICLES ASSIGNED</span>
                </div>
                {slots.length === 0 && <p className="text-xs text-slate-500">Select a transporter first.</p>}
                {slots.map((sl, i) => {
                  const reg2 = TRANSPORTERS[sl.transporter] || { vehicles: [], drivers: [] };
                  const takenV = slots.filter((x, j) => j !== i && x.transporter === sl.transporter).map(x => x.vehicle);
                  const takenD = slots.filter((x, j) => j !== i && x.transporter === sl.transporter).map(x => x.driver);
                  return (
                    <div key={i} className="rounded-xl border border-slate-200 p-3.5">
                      <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        Vehicle {i + 1} · <span className="text-slate-800 normal-case">{sl.transporter}</span>
                        <span className="ml-auto normal-case font-normal">Paired empty: {emptyChip(sl.empty)}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 mt-2">
                        <label className="block text-xs">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Vehicle</span>
                          <select className={inputCls + " mt-1"} value={sl.vehicle} onChange={e => slotSet(i, "vehicle", e.target.value)}>
                            <option value="">Select vehicle…</option>
                            {reg2.vehicles.map(v => (
                              <option key={v.id} value={v.id} disabled={!v.avail || takenV.includes(v.id)}>
                                {v.id} · {v.type}{!v.avail ? " — Unavailable" : takenV.includes(v.id) ? " — Assigned" : ""}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block text-xs">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Driver</span>
                          <select className={inputCls + " mt-1"} value={sl.driver} onChange={e => slotSet(i, "driver", e.target.value)}>
                            <option value="">Select driver…</option>
                            {reg2.drivers.map(dr => (
                              <option key={dr} value={dr} disabled={takenD.includes(dr)}>{dr}{takenD.includes(dr) ? " — Assigned" : ""}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </div>
                  );
                })}
                <p className="text-[10px] text-slate-400">1 vehicle = 1 driver. Vehicles belong only to the selected transporter{[...new Set(slots.map(x => x.transporter))].length > 1 ? "s (split allocation)" : ""}.</p>
              </div>
            )}

            {/* STEP 5 — PRICING & REVIEW (§15) */}
            {step === 5 && (
              <div className="space-y-3">
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-xs space-y-1.5">
                  <div className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Shipment Review</div>
                  <div><span className="text-slate-500">Shipment:</span> <Mono className="font-bold">MSN-{String(msnSeq).padStart(5, "0")}</Mono> · <b>{d.line} · {d.size} × {d.qty}</b> · <Mono className="font-semibold">{d.fullContainer}</Mono></div>
                  <div><span className="text-slate-500">Shipper:</span> <b>{d.shipper}</b>{d.project && <> · Project {d.project}</>}</div>
                  <div><span className="text-slate-500">Route:</span> {d.pickup} → {d.dest} · {d.distance} km</div>
                  <div><span className="text-slate-500">Pickup:</span> <Mono className="font-semibold">{fmtDT(pickupAt)}</Mono></div>
                  {slots.map((sl, i) => (
                    <div key={i}><span className="text-slate-500">Vehicle {i + 1}:</span> <b>{sl.transporter}</b> · <Mono className="font-semibold">{sl.vehicle || "—"}</Mono> · {sl.driver || "—"}</div>
                  ))}
                  <div className="pt-1 border-t border-slate-200">
                    <span className="text-slate-500">Empty Container Optimization:</span>{" "}
                    {slots.some(sl => sl.empty)
                      ? slots.filter(sl => sl.empty).map(sl => <span key={sl.empty.id} className="text-violet-800 font-bold"><Mono>{sl.empty.container}</Mono> Compatible ✓ </span>)
                      : <span className="text-slate-400">None assigned — standard / repositioning operation</span>}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Price Per Container (USD)"><input type="number" className={inputCls + " font-mono"} value={d.price} onChange={e => set("price", +e.target.value)} /></Field>
                  <div className="self-end text-[10px] text-slate-400 pb-1.5">Transporter paid J+1 on completion · shipper on 30-day terms.</div>
                </div>
              </div>
            )}
          </div>

          <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-2">
            <button onClick={() => step > 1 ? setStep(s2 => s2 - 1) : close()} className="text-xs font-semibold text-slate-500 hover:text-slate-800">
              {step > 1 ? "← Back" : "Cancel"}
            </button>
            <div className="flex items-center gap-2">
              {step === 3 && !manual && (
                <button onClick={() => setManual(true)} className="text-xs font-bold rounded-lg px-4 py-2.5 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50">
                  ASSIGN TRANSPORTER MANUALLY
                </button>
              )}
              {step < 5 ? (
                <button onClick={() => setStep(s2 => s2 + 1)} disabled={(step === 3 && !choice) || (step === 4 && !slotsOk)}
                  className={`text-xs font-bold rounded-lg px-5 py-2.5 text-white ${(step === 3 && !choice) || (step === 4 && !slotsOk) ? "bg-slate-300 cursor-not-allowed" : "bg-slate-900 hover:bg-slate-800"}`}>
                  Continue →
                </button>
              ) : (
                <button onClick={createShipment} className="text-xs font-bold rounded-lg px-5 py-2.5 bg-teal-700 hover:bg-teal-600 text-white">CONFIRM & CREATE SHIPMENT</button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ---------- CALENDAR EVENT DETAIL — strictly read-only (§20-22) ----------
     Built from the exact clicked event. Never inferred from previous state. */
  function CalEventModal({ e }) {
    const cfg = EVT[e.type];
    const c = e.cycleId ? cycles.find(x => x.id === e.cycleId) : null;
    const dm = e.loadId ? loads.find(l => l.id === e.loadId) : null;
    const r = c && !isClosed(c) ? riskOf(c, now) : null;
    const close = () => setCalEvent(null);
    const Row = ({ k, v }) => (
      <div className="flex justify-between gap-4 border-b border-slate-50 py-1.5 text-xs">
        <span className="text-slate-500">{k}</span><span className="font-medium text-right">{v}</span>
      </div>
    );
    const heading = e.type === "deadline" && e.overdue ? "RETURN OVERDUE" : cfg.label;
    return (
      <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-start justify-center overflow-y-auto p-4 lg:p-16" onClick={close}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={ev => ev.stopPropagation()}>
          <div className={`px-5 py-3.5 border-b border-slate-100 flex items-center justify-between`}>
            <div className={`flex items-center gap-1.5 text-xs font-extrabold tracking-widest ${e.type === "deadline" && e.overdue ? "text-red-700" : cfg.txt}`}>
              <cfg.icon size={13} /> {heading}
            </div>
            <button onClick={close} className="text-slate-400 hover:text-slate-700"><X size={16} /></button>
          </div>
          <div className="px-5 py-3">
            {e.type === "empty_ready" && c && (
              <>
                <Row k="Container" v={<span><EmptyTag small /> <Mono className="font-bold">{c.container}</Mono></span>} />
                <Row k="Shipping Line" v={c.line} /><Row k="Type" v={c.size} />
                <Row k="Current Location" v={c.location} />
                <Row k="Empty Since" v={<Mono>{fmtDT(c.emptyReadyAt)}</Mono>} />
                <Row k="Return Deadline" v={<Mono>{fmtDT(c.deadline)}</Mono>} />
                {r && <Row k="Risk" v={<RiskBadge risk={r} />} />}
              </>
            )}
            {e.type === "full_pickup" && dm && (
              <>
                <Row k="Shipment" v={<Mono className="font-bold">{dm.id}</Mono>} />
                <Row k="Full Container" v={<Mono className="font-bold">{dm.fullContainer}</Mono>} />
                <Row k="Shipping Line" v={dm.line} /><Row k="Type" v={`${dm.size} × ${dm.qty}`} />
                <Row k="Pickup" v={<Mono>{fmtDT(dm.appointment)}</Mono>} />
                <Row k="Pickup Location" v={dm.pickup} />
                <Row k="Transporter" v={dm.transporter || "Not assigned yet"} />
                <Row k="Pairing" v={dm.assigned.length ? <span className="text-violet-700 font-bold">PAIRED — {dm.assigned.join(", ")}</span> : <span className="text-amber-800 font-bold">NEEDS EMPTY</span>} />
              </>
            )}
            {e.type === "paired" && c && (
              <>
                <Row k="Empty Container" v={<span><EmptyTag small /> <Mono className="font-bold">{c.container}</Mono></span>} />
                <Row k="Paired With Shipment" v={<Mono className="font-bold">{c.nextFull?.ref}</Mono>} />
                <Row k="Full Container" v={<Mono className="font-bold">{c.nextFull?.fullContainer}</Mono>} />
                <Row k="Pairing Date" v={<Mono>{fmtDT(c.matchedAt)}</Mono>} />
                <Row k="Full Pickup" v={<Mono>{fmtDT(c.nextFull?.pickupAt)}</Mono>} />
              </>
            )}
            {e.type === "return_planned" && c && (
              <>
                <Row k="Empty Container" v={<span><EmptyTag small /> <Mono className="font-bold">{c.container}</Mono></span>} />
                <Row k="Return Location" v={c.returnLoc || "Terminal Hub Principal"} />
                <Row k="Planned Return" v={<Mono>{fmtDT(c.plannedReturnAt)}</Mono>} />
                <Row k="Return Deadline" v={<Mono>{fmtDT(c.deadline)}</Mono>} />
                {r && <Row k="Risk" v={<RiskBadge risk={r} />} />}
              </>
            )}
            {e.type === "deadline" && c && (
              <>
                <Row k="Empty Container" v={<span><EmptyTag small /> <Mono className="font-bold">{c.container}</Mono></span>} />
                <Row k="Return Deadline" v={<Mono>{fmtDT(c.deadline)}</Mono>} />
                <Row k={now > c.deadline ? "Overdue By" : "Time Remaining"} v={<Mono className={`font-bold ${now > c.deadline ? "text-red-700" : ""}`}>{fmtRel(Math.abs(c.deadline - now))}</Mono>} />
                {r && <Row k="Risk" v={<RiskBadge risk={r} />} />}
                {now > c.deadline && !isClosed(c) && <Row k="Estimated Detention" v={<Mono className="font-bold text-red-700">${Math.ceil((now - c.deadline) / D) * DET_RATE}</Mono>} />}
              </>
            )}
            {e.type === "returned" && c && (
              <>
                <Row k="Empty Container" v={<Mono className="font-bold">{c.container}</Mono>} />
                <Row k="Returned" v={<Mono>{fmtDT(c.closedAt)}</Mono>} />
                <Row k="Deadline" v={<Mono>{fmtDT(c.deadline)}</Mono>} />
                <Row k="Result" v={c.closedAt <= c.deadline ? "On time ✓" : "Late"} />
              </>
            )}
          </div>
          <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between">
            <button onClick={() => { close(); setView("tower"); }} className="text-[11px] font-semibold text-slate-400 hover:text-slate-700">View in Control Tower →</button>
            <button onClick={close} className="text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-lg px-4 py-1.5">CLOSE</button>
          </div>
        </div>
      </div>
    );
  }

  /* Month view "+N more" — the full day's events, still read-only */
  function DayListModal({ ts }) {
    const list = events.filter(e => sameDay(e.ts, ts)).sort((a, b) => a.ts - b.ts);
    const close = () => setDayList(null);
    return (
      <div className="fixed inset-0 bg-slate-900/50 z-40 flex items-start justify-center overflow-y-auto p-4 lg:p-16" onClick={close}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold">{fmtDay(ts)}</h3>
            <button onClick={close} className="text-slate-400 hover:text-slate-700"><X size={16} /></button>
          </div>
          <div className="p-4 space-y-1.5">
            {list.map(e => <EventCard key={e.key} e={e} />)}
            {list.length === 0 && <p className="text-xs text-slate-400">No events.</p>}
          </div>
        </div>
      </div>
    );
  }

  function LoadModal({ loadId }) {
    const dm = loads.find(l => l.id === loadId);
    if (!dm) return null;
    const slots = dm.qty - dm.assigned.length;
    return (
      <div className="fixed inset-0 bg-slate-900/50 z-40 flex items-start justify-center overflow-y-auto p-4 lg:p-16" onClick={() => setLoadModal(null)}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
          <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between">
            <div className="flex items-center gap-2">
              <FullTag />
              <div>
                <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Full Load</div>
                <Mono className="text-lg font-bold">{dm.id}</Mono>
              </div>
            </div>
            <button onClick={() => setLoadModal(null)} className="text-slate-400 hover:text-slate-700"><X size={17} /></button>
          </div>
          <div className="p-5 space-y-3">
            <dl className="text-xs space-y-1.5">
              {[["Full Container", dm.fullContainer], ["Pickup", fmtDT(dm.appointment)], ["Shipping Line", dm.line], ["Type", `${dm.size} × ${dm.qty}`],
                ["Pickup Location", dm.pickup], ["Destination", dm.dest], ["Shipper", dm.shipper], ["Transporter", dm.transporter || "Not assigned yet"],
                ...(dm.vehicles || []).map((vd, i) => [`Vehicle ${i + 1}`, `${vd.vehicle || "—"} · ${vd.driver || "—"}`])].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 border-b border-slate-50 pb-1"><dt className="text-slate-500">{k}</dt><dd className="font-medium text-right">{v}</dd></div>
              ))}
            </dl>
            <div className={`rounded-lg border px-3 py-2 text-xs ${slots > 0 ? "border-amber-300 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
              <span className="font-bold uppercase text-[10px] tracking-wider">Pairing:</span>{" "}
              {slots > 0
                ? <span className="font-bold text-amber-800">NEEDS EMPTY{slots > 1 ? ` (×${slots})` : ""}</span>
                : <span className="font-bold text-violet-700">PAIRED ✓ — Paired Empty{dm.assigned.length > 1 ? "s" : ""}: {dm.assigned.map(n => <Mono key={n} className="font-bold"> {n}</Mono>)}</span>}
            </div>
            <button onClick={() => { setLoadModal(null); setView("matching"); }} className="text-[11px] font-semibold text-teal-700 hover:text-teal-900">
              Open Matching →
            </button>
          </div>
        </div>
      </div>
    );
  }

  function DetailModal({ c, initialMode = "detail" }) {
    const risk = riskOf(c, now);
    const overdueActive = !isClosed(c) && now > c.deadline;
    const detDays = overdueActive ? Math.ceil((now - c.deadline) / D) : 0;
    const [mode, setMode] = useState(initialMode);          // detail | select | confirm | success | return
    const [candidate, setCandidate] = useState(null);
    const [showIncompat, setShowIncompat] = useState(false);
    const [showAudit, setShowAudit] = useState(false);
    const close = () => { setDetail(null); setDetailIntent(null); };
    const rejIds = Object.entries(rejected).filter(([, ids]) => ids.includes(c.id)).map(([lid]) => lid);
    const sugg = loadsFor(c, loads, now, rejIds).filter(x => !x.rejected);
    const suggIds = new Set(sugg.map(x => x.dm.id));
    const incompat = openLoads.filter(l => !suggIds.has(l.id)).map(dm => {
      const issues = [];
      if (dm.line !== c.line) issues.push("Shipping Line mismatch");
      if (dm.size !== c.size) issues.push("Container size mismatch");
      if (dm.appointment > c.deadline) issues.push("Pickup after the empty's return deadline");
      return { dm, issues };
    });

    /* One operational outcome line for the header — never mixed lifecycle labels */
    const outcome = isClosed(c)
      ? c.outcome === "paired"
        ? { txt: "PAIRED ✓", cls: "text-violet-700" }
        : c.outcome === "returned_late"
          ? { txt: `RETURNED LATE · ${fmtRel(c.closedAt - c.deadline)} after deadline`, cls: "text-red-700" }
          : { txt: "RETURNED ✓", cls: "text-emerald-700" }
      : overdueActive
        ? { txt: `RETURN OVERDUE · ${fmtRel(now - c.deadline)}`, cls: "text-red-700" }
        : c.stage === "empty"
          ? { txt: `EMPTY — ACTION REQUIRED · ${risk.label} · Decision window ${fmtRel(c.deadline - now)}`, cls: risk.txt }
          : c.stage === "paired"
            ? { txt: "PAIRED ✓", cls: "text-violet-700" }
            : { txt: `RETURN PLANNED · deadline in ${fmtRel(c.deadline - now)}`, cls: "text-amber-700" };

    const Shell = ({ children, max = "max-w-3xl" }) => (
      <div className="fixed inset-0 bg-slate-900/50 z-40 flex items-start justify-center overflow-y-auto p-4 lg:p-10" onClick={close}>
        <div className={`bg-white rounded-2xl shadow-2xl w-full ${max}`} onClick={e => e.stopPropagation()}>{children}</div>
      </div>
    );
    const Head = ({ title, sub }) => (
      <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between">
        <div>{title}{sub}</div>
        <button onClick={close} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
      </div>
    );

    /* ---------- STEP: choose a full load (inside the modal) ---------- */
    if (mode === "select" && !isClosed(c)) return (
      <Shell max="max-w-2xl">
        <Head
          title={<h2 className="font-bold">Find Full Load</h2>}
          sub={
            <div className="flex items-center gap-2 mt-1.5 flex-wrap text-xs text-slate-500">
              <EmptyTag small /><Mono className="font-bold text-slate-800">{c.container}</Mono>
              <span>{c.line} · {c.size} · {c.location}</span>
              <span className={`font-bold font-mono ${risk?.txt}`}>{overdueActive ? `${fmtRel(now - c.deadline)} overdue` : `${fmtRel(c.deadline - now)} to deadline`}</span>
            </div>
          } />
        <div className="p-5 space-y-2.5">
          {sugg.length === 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-600">
              <p className="font-semibold">NO VIABLE FULL LOAD FOUND — no compatible full load before this container's return deadline.</p>
              <p className="text-xs mt-1">
                {risk.key === "safe" && "Recommendation: search again later — the decision window is still comfortable."}
                {risk.key === "watch" && "Recommendation: prioritize pairing today, or plan the return."}
                {risk.key === "critical" && "Recommendation: pair now if possible — otherwise plan the empty return immediately."}
                {risk.key === "overdue" && "Recommendation: resolve immediately — plan and confirm the empty return."}
              </p>
              <button onClick={() => setMode("return")} className="mt-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-lg px-4 py-2">PLAN EMPTY RETURN</button>
            </div>
          )}
          {sugg.map((x, idx) => {
            const score = Math.min(98, Math.max(45, Math.round(x.score)));
            const first = idx === 0;
            return (
              <React.Fragment key={x.dm.id}>
                <h3 className={`text-[10px] font-extrabold uppercase tracking-widest ${first ? "text-teal-700" : "text-slate-400"} ${!first && idx === 1 ? "pt-2" : ""}`}>
                  {first ? "Recommended Shipment" : idx === 1 ? "Other compatible Shipments" : ""}
                </h3>
                <div className={`rounded-xl border p-4 flex items-start justify-between gap-3 ${first ? "border-teal-400 ring-1 ring-teal-200" : "border-slate-200"}`}>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[9px] font-extrabold tracking-wider rounded px-1.5 py-0.5 border ${SUG_LABEL[x.label]}`}>{x.label}</span>
                      <Mono className="text-sm font-bold">{x.dm.id}</Mono>
                      <span className="text-xs text-slate-500">{x.dm.line} · {x.dm.size}</span>
                      <span className="ml-auto text-[10px] font-bold text-teal-700 bg-teal-50 border border-teal-200 rounded-full px-2 py-0.5">Match score {score}%</span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] text-slate-600 mt-1.5">
                      <span>Full container <Mono className="font-bold">{x.dm.fullContainer}</Mono></span>
                      <span>Pickup <Mono className="font-semibold">{fmtDT(x.dm.appointment)}</Mono></span>
                      <span>{x.dm.pickup}</span>
                      <span>Deadline margin <Mono className={`font-semibold ${x.windowMs < 6 * H ? "text-amber-700" : "text-emerald-700"}`}>+{fmtRel(x.windowMs)}</Mono></span>
                    </div>
                    <div className="text-[10px] text-emerald-700 mt-1.5 flex flex-wrap gap-x-3">
                      <span>✓ Same shipping line</span><span>✓ Correct container type</span>
                      <span className={x.windowMs < 6 * H ? "text-amber-700" : ""}>✓ Pickup before return deadline</span>
                      <span>✓ {c.distKm === 0 ? "Same hub" : `${c.distKm} km — short distance`}</span>
                    </div>
                  </div>
                  <button onClick={() => { setCandidate(x.dm); setMode("confirm"); }}
                    className={`shrink-0 text-xs font-bold rounded-lg px-5 py-2.5 ${first ? "bg-teal-700 hover:bg-teal-600 text-white" : "bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"}`}>
                    {first ? "CONFIRM PAIRING" : "VIEW"}
                  </button>
                </div>
              </React.Fragment>
            );
          })}
          {incompat.length > 0 && (
            <button onClick={() => setShowIncompat(v => !v)} className="text-[11px] font-semibold text-slate-500 hover:text-slate-800">
              {showIncompat ? "Hide" : "Show"} incompatible options ({incompat.length})
            </button>
          )}
          {showIncompat && incompat.map(({ dm, issues }) => (
            <div key={dm.id} className="rounded-xl border border-slate-100 p-3 opacity-70 text-xs">
              <Mono className="font-bold">{dm.id}</Mono> · {dm.line} · {dm.size}
              <span className="text-red-600 ml-2">{issues.join(" · ")}</span>
            </div>
          ))}
          <div className="flex justify-between pt-1">
            <button onClick={() => setMode("detail")} className="text-xs font-semibold text-slate-500 hover:text-slate-800">Cancel</button>
          </div>
        </div>
      </Shell>
    );

    /* ---------- STEP: confirm pairing ---------- */
    if (mode === "confirm" && candidate) return (
      <Shell max="max-w-md">
        <Head title={<h2 className="font-bold">Confirm Pairing</h2>} />
        <div className="p-6 space-y-3">
          <div className="rounded-xl border-2 border-dashed border-sky-400 bg-sky-50/40 px-4 py-3">
            <div className="text-[9px] font-extrabold uppercase tracking-widest text-sky-700">Empty container</div>
            <Mono className="font-bold">{c.container}</Mono>
            <div className="text-[11px] text-slate-500">{c.line} · {c.size} · {c.location}</div>
          </div>
          <div className="flex items-center justify-center gap-2 text-violet-700 text-xs font-bold"><ArrowLeftRight size={14} /> PAIRED WITH</div>
          <div className="rounded-xl border-2 border-violet-300 bg-violet-50/60 px-4 py-3">
            <div className="text-[9px] font-extrabold uppercase tracking-widest text-violet-700">Next full load
              <span title="Pairing links this empty container to a different full container operation." className="ml-1 cursor-help">ⓘ</span>
            </div>
            <Mono className="font-bold">{candidate.fullContainer}</Mono>
            <div className="text-[11px] text-slate-500">Load <Mono className="font-semibold">{candidate.id}</Mono> · {candidate.line} · {candidate.size}</div>
            <div className="text-[11px] text-slate-500">{candidate.pickup} · <Mono>{fmtDT(candidate.appointment)}</Mono></div>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={() => { setCandidate(null); setMode("select"); }} className="flex-1 bg-white border border-slate-300 text-slate-600 hover:bg-slate-50 text-xs font-semibold rounded-lg py-2.5">Cancel</button>
            <button onClick={() => { pairDirect(c.id, candidate, "Contextual — container detail"); setMode("success"); }}
              className="flex-1 bg-teal-700 hover:bg-teal-600 text-white text-sm font-bold rounded-lg py-2.5">Confirm Pairing</button>
          </div>
        </div>
      </Shell>
    );

    /* ---------- STEP: success — the pairing IS the completed decision ---------- */
    if (mode === "success" && (c.nextFull || candidate)) {
      const nf = c.nextFull || { fullContainer: candidate.fullContainer, ref: candidate.id, pickupAt: candidate.appointment };
      const nfLoad = loads.find(l => l.id === nf.ref);
      const margin = c.deadline - nf.pickupAt;
      return (
        <Shell max="max-w-md">
          <div className="p-6 space-y-3">
            <div className="text-center">
              <CheckCircle2 size={36} className="text-emerald-500 mx-auto" />
              <h2 className="font-bold text-lg mt-1">Pairing Confirmed ✓</h2>
            </div>
            <div className="rounded-xl border-2 border-dashed border-sky-400 bg-sky-50/40 px-4 py-3">
              <div className="text-[9px] font-extrabold uppercase tracking-widest text-sky-700">Empty container</div>
              <Mono className="font-bold">{c.container}</Mono>
              <div className="text-[11px] text-slate-500">{c.line} · {c.size} · {c.location}</div>
            </div>
            <div className="flex items-center justify-center gap-2 text-violet-700 text-xs font-bold"><ArrowLeftRight size={14} /> PAIRED WITH</div>
            <div className="rounded-xl border-2 border-violet-300 bg-violet-50/60 px-4 py-3">
              <div className="text-[9px] font-extrabold uppercase tracking-widest text-violet-700">Full load</div>
              <Mono className="font-bold">{nf.ref}</Mono>
              <div className="text-[11px] text-slate-600">Full container: <Mono className="font-semibold">{nf.fullContainer}</Mono></div>
              <div className="text-[11px] text-slate-500">Pickup <Mono className="font-semibold">{fmtDT(nf.pickupAt)}</Mono>{nfLoad && <> · {nfLoad.pickup}</>}</div>
            </div>
            <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-2.5 flex flex-wrap gap-x-6 gap-y-1 text-xs">
              <div><div className="text-[9px] uppercase text-slate-400">Return deadline</div><Mono className="font-semibold">{fmtDT(c.deadline)}</Mono></div>
              <div><div className="text-[9px] uppercase text-slate-400">Margin before deadline</div><Mono className={`font-bold ${margin < 6 * H ? "text-amber-700" : "text-emerald-700"}`}>+{fmtRel(margin)}</Mono></div>
              <div><div className="text-[9px] uppercase text-slate-400">Risk</div><RiskBadge risk={riskOf(c, now)} /></div>
            </div>
            <button onClick={() => { setCandidate(null); close(); }} className="w-full bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold rounded-lg py-2.5">CLOSE</button>
          </div>
        </Shell>
      );
    }

    /* ---------- STEP: plan empty return ---------- */
    if (mode === "return" && !isClosed(c)) return (
      <Shell max="max-w-md">
        <Head title={<h2 className="font-bold">Plan Empty Return</h2>} />
        <div className="p-6 space-y-3">
          <dl className="text-xs space-y-1.5">
            {[["Container", <span className="inline-flex items-center gap-1.5"><EmptyTag small /><Mono className="font-bold">{c.container}</Mono></span>],
              ["Current location", c.location],
              ["Return location", c.returnLoc || "Terminal Hub Principal"],
              ["Return deadline", fmtDT(c.deadline)],
              overdueActive ? ["Current delay", <span className="font-bold text-red-700">{fmtRel(now - c.deadline)} past deadline</span>]
                            : ["Time remaining", <Mono className={`font-bold ${risk?.txt}`}>{fmtRel(c.deadline - now)}</Mono>]
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 border-b border-slate-50 pb-1.5"><dt className="text-slate-500">{k}</dt><dd className="font-medium text-right">{v}</dd></div>
            ))}
          </dl>
          <div className="flex gap-2 pt-1">
            <button onClick={() => setMode("detail")} className="flex-1 bg-white border border-slate-300 text-slate-600 hover:bg-slate-50 text-xs font-semibold rounded-lg py-2.5">Cancel</button>
            <button onClick={() => { planReturn(c.id); setMode("detail"); }}
              className="flex-1 bg-amber-600 hover:bg-amber-500 text-white text-sm font-bold rounded-lg py-2.5">Confirm Empty Return Plan</button>
          </div>
        </div>
      </Shell>
    );

    /* ---------- DEFAULT: container detail ---------- */
    return (
      <Shell>
        <Head
          title={
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <Mono className="text-xl font-bold">{c.container}</Mono>
                <EmptyTag />
                <span className="text-sm text-slate-500">{c.size} · {c.line}</span>
              </div>
              <div className={`text-sm font-bold mt-1 ${outcome.cls}`}>{outcome.txt}</div>
            </div>
          } />

        <div className="px-6 pb-6 space-y-4">
          {/* OPERATION FLOW */}
          <div>
            <h3 className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mt-4">Operation Flow</h3>
            <OperationFlow c={c} />
            <div className="mt-2 text-[10px] text-slate-400">Shipper: {c.shipper} · Transporter: {c.transporter}</div>
          </div>

          {/* DEADLINE — strong when it matters, one light strip when protected */}
          {isClosed(c) ? (
            c.closedAt <= c.deadline ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-800 flex items-center gap-2">
                <CheckCircle2 size={14} className="shrink-0" />
                <span>
                  <b>{c.outcome === "paired" ? "DEADLINE PROTECTED" : "RETURNED ON TIME"}</b> — {c.outcome === "paired" ? "Paired" : "Returned"} {fmtRel(c.deadline - c.closedAt)} before the return deadline · No detention
                </span>
              </div>
            ) : (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-800 flex items-center gap-2">
                <AlertTriangle size={14} className="shrink-0" />
                <span><b>RETURNED LATE</b> — {fmtRel(c.closedAt - c.deadline)} after the deadline · Detention <Mono className="font-bold">${c.detentionFee}</Mono></span>
              </div>
            )
          ) : (
            <div className={`rounded-xl border-2 px-4 py-3 ${overdueActive ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"}`}>
              <h3 className={`text-[10px] font-extrabold uppercase tracking-widest ${overdueActive ? "text-red-700" : "text-slate-400"}`}>{overdueActive ? "Return Deadline" : "Decision Window"}</h3>
              <div className="flex flex-wrap gap-x-8 gap-y-2 mt-2 text-sm">
                {overdueActive ? (
                  <div><div className="text-[10px] uppercase text-slate-400">Return deadline</div><Mono className="font-bold text-lg text-red-700">{fmtRel(now - c.deadline)} overdue</Mono></div>
                ) : (
                  <div><div className="text-[10px] uppercase text-slate-400">Decision window</div><Mono className={`font-bold text-lg ${risk.txt}`}>{fmtRel(c.deadline - now)} remaining</Mono></div>
                )}
                <div><div className="text-[10px] uppercase text-slate-400">Return deadline</div><Mono className="font-semibold">{fmtDT(c.deadline)}</Mono></div>
                {c.nextFull && (
                  <div><div className="text-[10px] uppercase text-slate-400">Margin after planned pickup</div>
                    <Mono className={`font-bold ${c.deadline - c.nextFull.pickupAt < 6 * H ? "text-amber-700" : "text-emerald-700"}`}>+{fmtRel(c.deadline - c.nextFull.pickupAt)}</Mono></div>
                )}
                <div><div className="text-[10px] uppercase text-slate-400">Risk</div><RiskBadge risk={risk} /></div>
                <div><div className="text-[10px] uppercase text-slate-400">Estimated detention</div>
                  {overdueActive
                    ? <span className="font-bold text-red-700"><Mono>{detDays}d</Mono> · <Mono>${detDays * DET_RATE}</Mono></span>
                    : <span className="text-slate-500 text-xs">$0 currently — starts after deadline</span>}
                </div>
              </div>
            </div>
          )}

          {/* AUDIT — secondary, collapsible */}
          {(() => {
            const trail = [
              { ts: c.emptyReadyAt, txt: "Container became EMPTY" },
              c.matchInfo && { ts: c.matchInfo.at, txt: `Pairing confirmed by ${c.matchInfo.by} (${c.matchInfo.source})` },
              c.plannedReturnAt && !c.nextFull && { ts: Math.min(c.plannedReturnAt, now), txt: "Empty return planned" },
              c.dispatchedAt && !c.nextFull && { ts: c.dispatchedAt, txt: "Return in execution" },
              c.closedAt && { ts: c.closedAt, txt: c.outcome === "paired" ? "Cycle closed (Paired ✓) — reported by Shipment system" : c.outcome === "returned_late" ? "Empty return confirmed — late" : "Empty return confirmed — on time" },
            ].filter(Boolean).sort((a, b) => a.ts - b.ts);
            return (
              <div className="text-[11px]">
                <button onClick={() => setShowAudit(v => !v)} className="font-semibold text-slate-500 hover:text-slate-800">
                  ⓘ Activity {showAudit ? "▾" : "›"}
                </button>
                {showAudit && (
                  <div className="mt-1 text-slate-500 border-l-2 border-slate-100 pl-3 space-y-0.5">
                    {trail.map((t, i) => <div key={i}><Mono className="text-slate-400">{fmtDT(t.ts)}</Mono> — {t.txt}</div>)}
                  </div>
                )}
              </div>
            );
          })()}

          {/* ACTION AREA */}
          {!isClosed(c) && (
            c.stage === "empty" ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                <h3 className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500 mb-3">What should happen next?</h3>
                <div className="grid sm:grid-cols-2 gap-3">
                  <button onClick={() => setMode("select")} className="bg-teal-700 hover:bg-teal-600 text-white rounded-lg py-3 px-4 text-left">
                    <div className="text-sm font-bold flex items-center gap-1.5"><ArrowLeftRight size={14} /> Find Full Load</div>
                    <div className="text-[10px] text-teal-100 mt-0.5">Pair this empty container with an upcoming full operation.</div>
                  </button>
                  <button onClick={() => setMode("return")} className="bg-white border-2 border-amber-400 text-amber-900 hover:bg-amber-50 rounded-lg py-3 px-4 text-left">
                    <div className="text-sm font-bold flex items-center gap-1.5"><RotateCcw size={14} /> Plan Empty Return</div>
                    <div className="text-[10px] text-amber-700 mt-0.5">Return the empty container before the shipping line deadline.</div>
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {c.stage === "paired" && (
                  <>
                    <div className="rounded-lg bg-violet-50 border border-violet-200 px-4 py-2.5 text-center text-sm font-bold text-violet-800">
                      PAIRED ✓ — no action required
                      <div className="text-[10px] font-semibold text-violet-600">Execution is handled by the Shipment system.</div>
                    </div>
                    <button onClick={() => cancelPairing(c.id)} className="text-xs font-semibold text-slate-400 hover:text-red-600 py-1">
                      Cancel pairing
                    </button>
                  </>
                )}
                {c.stage === "return_planned" && (
                  <button onClick={() => confirmReturn(c.id)} className="bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold rounded-lg py-2.5">
                    Confirm Empty Return
                  </button>
                )}
              </div>
            )
          )}
        </div>
      </Shell>
    );
  }
}
