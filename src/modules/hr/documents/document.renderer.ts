import { BadRequestException, Injectable } from '@nestjs/common';
import { BRAND, LOGO_DATA_URI } from './brand';
import {
  civility,
  concernedWord,
  decimal,
  employedWord,
  esc,
  fillTemplate,
  frDate,
  money,
  money0,
  paragraphs,
} from './fr.format';

/**
 * Renders a payload to A4 HTML.
 *
 * The preview endpoint and the PDF writer both call `render()` with the same
 * payload, so what the user approves on screen is byte-for-byte what gets
 * filed. Rendering in the browser for the preview and on the server for the
 * PDF is the one thing guaranteed to make the two drift.
 */

type Payload = Record<string, any>;

@Injectable()
export class DocumentRenderer {
  /**
   * Print CSS shared by every document. A4 with a 15 mm margin.
   *
   * The vocabulary is the one in the proforma-invoice and operations-assessment
   * designs, so a payslip and a commercial invoice are recognisably the same
   * company's paper: teal for every structural line, amber used sparingly for
   * the one figure that matters, a condensed uppercase display face for titles
   * and a neutral ramp for everything else.
   *
   * No web font is loaded. The PDF writer settles on `domcontentloaded` and
   * the document issues no requests, so a linked font would simply be missing
   * from the filed file while the preview showed it — the exact drift this
   * module exists to prevent. The stacks below fall back to faces that are
   * present on every machine and carry the same skeleton.
   */
  private readonly styles = `
    *{box-sizing:border-box}
    html,body{margin:0;padding:0}
    body{font-family:'Barlow','Helvetica Neue',Helvetica,Arial,sans-serif;
         color:${BRAND.ink};font-size:11.5px;line-height:1.55;
         -webkit-font-smoothing:antialiased}
    /* One page, always.
       A4 minus the 15 mm print margins is 180 × 267 mm portrait and
       267 × 180 mm landscape. The sheet is fixed to exactly that — not a
       minimum — so the signature parks at the foot of the page and nothing can
       push a second sheet out of the printer. overflow:hidden is the
       backstop; the register below shrinks itself by row count so it never
       reaches it. */
    /* No CSS page size here, deliberately: a declared page size wins over
       Puppeteer's landscape flag, so setting it printed the bordereau portrait
       and guillotined its eighteen columns. Orientation and margins are the
       PDF writer's call; this file only sizes the content box to match. */
    .sheet{padding:0;display:flex;flex-direction:column;height:267mm;overflow:hidden}
    .sheet.landscape{height:180mm}
    /* A fixed-height column flexes its children by default, and the first
       thing to collapse was the meta strip — it rendered 2px tall with its
       text still inside it. Nothing on a document may shrink to fit; if the
       content is too tall the answer is a denser register, not a squashed
       header. */
    .sheet > *{flex:none}

    /* ── Letterhead ──────────────────────────────────────────────────────── */
    .lh{display:flex;justify-content:space-between;align-items:flex-end;gap:32px;
        border-bottom:2.5px solid ${BRAND.teal};padding-bottom:10px;margin-bottom:16px}
    .lh-mark{width:164px;height:auto;display:block}
    .landscape .lh-mark{width:148px}
    .lh-right{text-align:right}
    .lh-title{margin:0;font-family:'Barlow Condensed','Arial Narrow',Arial,sans-serif;
              font-size:29px;line-height:.95;font-weight:700;letter-spacing:.03em;
              color:${BRAND.teal};text-transform:uppercase}
    .lh-kicker{margin-top:4px;font-size:9px;letter-spacing:.16em;text-transform:uppercase;
               font-weight:700;color:${BRAND.amber}}

    /* ── The meta strip: who / when / under what reference ───────────────── */
    /* Nothing on a Fleetin document has a square corner. */
    .meta{display:grid;grid-template-columns:1.35fr 1fr;border:1px solid ${BRAND.line};
          border-radius:14px;overflow:hidden;margin-bottom:16px}
    .meta-cell{padding:11px 16px}
    .meta-cell + .meta-cell{background:${BRAND.pale};border-left:1px solid ${BRAND.line}}
    .eyebrow{font-size:8.5px;letter-spacing:.14em;text-transform:uppercase;font-weight:700;
             color:${BRAND.mutedSoft}}
    .meta-name{margin-top:5px;font-size:12.5px;font-weight:700;color:${BRAND.ink}}
    .meta-sub{margin-top:3px;font-size:10.5px;line-height:1.55;color:${BRAND.bodyStrong}}
    .meta-pairs{margin-top:6px;display:grid;grid-template-columns:auto 1fr;gap:3px 12px;
                font-size:10.5px}
    .meta-pairs .k{color:${BRAND.muted}}
    .meta-pairs .v{font-weight:600;text-align:right}

    /* ── Section headings ────────────────────────────────────────────────── */
    .h2{margin:18px 0 0;font-family:'Barlow Condensed','Arial Narrow',Arial,sans-serif;
        font-size:15px;letter-spacing:.12em;text-transform:uppercase;font-weight:700;
        color:${BRAND.teal};border-bottom:1px solid ${BRAND.line};padding-bottom:4px}
    /* The pill: the assessment's chapter marker. Reserved for the one block a
       reader must not skip — never more than one per document. */
    .pill{display:flex;align-items:center;gap:11px;background:${BRAND.teal};border-radius:999px;
          padding:8px 18px 8px 9px;margin:16px 0 12px}
    .pill-badge{display:flex;align-items:center;justify-content:center;width:21px;height:21px;
                border-radius:999px;background:${BRAND.amber};color:#fff;font-size:11px;
                font-weight:700;flex:none}
    .pill-label{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#fff}

    /* ── Body copy ───────────────────────────────────────────────────────── */
    .body-txt{font-size:12px;line-height:1.85;text-align:justify;color:${BRAND.body}}
    .body-txt strong{font-weight:700;color:${BRAND.ink}}
    .closing{font-size:12px;line-height:1.85;margin-top:12px;color:${BRAND.body}}
    .closing strong{color:${BRAND.ink}}
    /* An attestation is four lines on a whole page. At the table sizes the
       payslip needs it reads like fine print, so the certificates get their
       own scale — the text is the document. */
    .letter .body-txt{font-size:15px;line-height:2.1}
    .letter .closing{font-size:15px;line-height:2.1;margin-top:20px}
    /* The advisory. Amber rule rather than an amber box: it is a note on the
       document, not a warning about it. */
    .flag{font-size:10.5px;line-height:1.55;color:${BRAND.body};background:${BRAND.pale};
          border-left:3px solid ${BRAND.amber};border-radius:12px;padding:11px 15px;margin:14px 0}
    .flag b{display:block;font-size:9px;letter-spacing:.12em;text-transform:uppercase;
            font-weight:700;color:${BRAND.teal};margin-bottom:4px}

    /* ── The calculation table ───────────────────────────────────────────── */
    /* Rounded like everything else, which border-collapse:collapse forbids —
       hence separate spacing with the radius on the table and overflow hidden. */
    table.calc{width:100%;border-collapse:separate;border-spacing:0;margin:12px 0;font-size:11.5px;
               border:1px solid ${BRAND.line};border-radius:14px;overflow:hidden}
    table.calc td{padding:6px 12px;border-bottom:1px solid ${BRAND.line};color:${BRAND.bodyStrong}}
    table.calc tr:last-child td{border-bottom:none}
    table.calc td.val{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;
                      font-weight:600;color:${BRAND.ink}}
    table.calc tr.head td{background:${BRAND.pale};font-size:8.5px;letter-spacing:.14em;
                          text-transform:uppercase;font-weight:700;color:${BRAND.mutedSoft}}
    table.calc tr.rule td{border-top:1px solid ${BRAND.lineStrong}}
    table.calc tr.strong td{font-weight:700;color:${BRAND.ink};background:${BRAND.paleAlt}}
    /* The one amber row: the figure the whole document is about. */
    table.calc tr.total td{background:${BRAND.amber};color:#fff;border-bottom:none;
                           font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;
                           font-weight:700;padding:9px 12px}
    table.calc tr.total td.val{font-size:16px;letter-spacing:0;text-transform:none}
    table.calc.quiet td{font-size:10.5px;color:${BRAND.muted};padding:5px 12px}
    table.calc.quiet td.val{font-weight:600;color:${BRAND.bodyStrong}}

    /* ── The register: bordereau and transfer list ───────────────────────── */
    table.grid{width:100%;border-collapse:separate;border-spacing:0;font-size:9px;margin-top:12px;
               border:1px solid ${BRAND.line};border-radius:14px;overflow:hidden}
    table.grid th{background:${BRAND.teal};color:#fff;text-align:left;padding:6px 6px;
                  font-size:7.5px;letter-spacing:.1em;text-transform:uppercase;font-weight:700}
    table.grid td{padding:5px 6px;border-bottom:1px solid ${BRAND.line};color:${BRAND.bodyStrong}}
    table.grid tr:nth-child(even) td{background:${BRAND.paleAlt}}
    table.grid td.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
    table.grid th.num{text-align:right}
    table.grid tr.sum td{font-weight:700;background:${BRAND.pale};color:${BRAND.ink};
                         border-top:1.5px solid ${BRAND.teal};border-bottom:none}
    /*
     * Density by headcount, so the register always fits the one page it is
     * allowed. A 40-person bordereau at the 5–40 scale this module is built
     * for lands at d3; past that the numbers would stop being legible, and a
     * register nobody can read is not a filing.
     */
    table.grid.d2{font-size:8px}
    table.grid.d2 th,table.grid.d2 td{padding:3.5px 5px}
    table.grid.d3{font-size:7px}
    table.grid.d3 th,table.grid.d3 td{padding:2.5px 4px}
    .landscape table.grid{font-size:8.5px}
    .landscape table.grid.d2{font-size:7.5px}
    .landscape table.grid.d3{font-size:6.5px}

    /* ── Signature ───────────────────────────────────────────────────────── */
    /* One block, not three. Nobody countersigns an attestation de travail —
       the employer signs and stamps it, and a row of empty "vérifié par"
       boxes only invites the question of who forgot to sign. */
    .sign-zone{margin-top:auto;padding-top:20px}
    /* The signature shares its row with whatever the document has left to
       say — the bordereau's employer box, for one. Two stacked blocks is what
       pushed that filing onto a second page. */
    .sign-row{display:flex;align-items:flex-end;gap:22px}
    .sign-aside{flex:1;min-width:0}
    .sign-box{flex:none;width:236px;margin-left:auto;background:${BRAND.pale};
              border:1px solid ${BRAND.line};border-radius:16px;padding:13px 18px 46px;
              text-align:center}
    .sign-box .cap{font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;font-weight:700;
                   color:${BRAND.teal}}

    /* ── Footer ──────────────────────────────────────────────────────────── */
    .foot{margin-top:16px;padding-top:11px;border-top:2px solid ${BRAND.teal};
          display:flex;align-items:center;gap:16px}
    .foot-items{flex:1;display:flex;align-items:center;gap:18px}
    .foot-item{display:flex;align-items:center;gap:9px}
    .foot-item span.t{font-size:11.5px;font-weight:600;letter-spacing:.01em;color:${BRAND.body}}
    .disc{display:flex;align-items:center;justify-content:center;width:25px;height:25px;
          border-radius:999px;background:${BRAND.amber};flex:none}
    .disc svg{width:13px;height:13px;display:block}
    .foot-sep{width:1px;height:18px;background:${BRAND.line};flex:none}
    .foot-page{display:flex;align-items:center;justify-content:center;width:34px;height:34px;
               border-radius:999px;background:${BRAND.teal};font-size:11px;font-weight:700;
               color:#fff;line-height:1;flex:none}

    /* ── Landscape compaction ────────────────────────────────────────────── */
    /*
     * A landscape page is 180 mm tall against portrait's 267 — a third less
     * room for the same furniture, and the two register documents are exactly
     * the ones that carry the most. Every fixed block shrinks here so the
     * table keeps the space, measured against the two filings that overflowed
     * by 172 px and 102 px before this block existed.
     */
    .landscape .lh{padding-bottom:6px;margin-bottom:9px}
    .landscape .lh-mark{width:124px}
    .landscape .lh-title{font-size:21px}
    .landscape .lh-kicker{font-size:8px;margin-top:2px}
    .landscape .meta{margin-bottom:9px;border-radius:11px}
    .landscape .meta-cell{padding:7px 13px}
    .landscape .meta-name{font-size:11px;margin-top:3px}
    .landscape .meta-sub{font-size:9px;margin-top:2px}
    .landscape .meta-pairs{font-size:9px;margin-top:3px;gap:2px 10px}
    .landscape .eyebrow{font-size:7.5px}
    /* The bordereau's eighteen columns wrap a profession onto two lines, so
       its rows are the tallest thing on the page and the last 31 px come from
       here rather than from the type size. */
    .landscape table.grid{margin-top:6px}
    .landscape table.grid th{padding:4px 5px}
    .landscape table.grid td{padding:3px 5px}
    .landscape .body-txt{font-size:11px;line-height:1.6}
    .landscape .pill{padding:5px 14px 5px 6px;margin:0 0 7px}
    .landscape .pill-badge{width:17px;height:17px;font-size:9px}
    .landscape .pill-label{font-size:9px}
    .landscape table.calc{font-size:9.5px;border-radius:11px}
    .landscape table.calc td{padding:3.5px 11px}
    .landscape table.calc tr.total td{padding:6px 11px;font-size:8.5px}
    .landscape table.calc tr.total td.val{font-size:13px}
    .landscape .sign-zone{padding-top:10px}
    .landscape .sign-box{width:200px;padding:9px 14px 30px;border-radius:13px}
    .landscape .foot{margin-top:9px;padding-top:7px}
    .landscape .disc{width:20px;height:20px}
    .landscape .disc svg{width:11px;height:11px}
    .landscape .foot-item span.t{font-size:9.5px}
    .landscape .foot-items{gap:14px}
    .landscape .foot-page{width:26px;height:26px;font-size:9.5px}
  `;

  /**
   * The footer's round marks.
   *
   * Drawn as inline SVG rather than an icon font: the PDF writer settles on
   * `domcontentloaded` and fetches nothing, so a webfont glyph would come out
   * as a blank square on the filed document while the preview looked right.
   */
  private readonly glyphs = {
    mail: '<path d="M2 5.5h20v13H2z" fill="none" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/><path d="m3 6.5 9 6 9-6" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
    globe:
      '<circle cx="12" cy="12" r="9.5" fill="none" stroke="#fff" stroke-width="2.2"/><path d="M2.5 12h19M12 2.5a15 15 0 0 1 0 19 15 15 0 0 1 0-19Z" fill="none" stroke="#fff" stroke-width="2.2"/>',
    phone:
      '<path d="M21.5 16.9v2a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 1.6 3.2 2 2 0 0 1 3.6 1h2a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L6.6 8.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z" fill="#fff"/>',
    whatsapp:
      '<path d="M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2Zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .1-1.7-.1a13 13 0 0 1-5.6-4.9c-.4-.6-.9-1.5-.9-2.4 0-.9.5-1.4.7-1.6.2-.2.4-.3.6-.3h.5c.2 0 .4 0 .6.4l.8 1.9c.1.2 0 .4-.1.5l-.4.5c-.1.2-.3.3-.1.6.2.3.7 1.1 1.4 1.8.9.8 1.6 1 1.9 1.2.2.1.4.1.5-.1l.7-.8c.2-.2.3-.2.6-.1l1.8.9c.3.1.4.2.5.3v1Z" fill="#fff"/>',
  } as const;

  /** Bordereau and transfer letter need the width. */
  isLandscape(templateKey: string): boolean {
    return templateKey === 'bordereau_cnss' || templateKey === 'ordre_virement';
  }

  /** Picks the register density that keeps `rowCount` rows on one page. */
  private density(rowCount: number): string {
    if (rowCount > 26) return ' d3';
    if (rowCount > 16) return ' d2';
    return '';
  }

  /** The three that are letters rather than statements, and read at letter size. */
  private isLetter(templateKey: string): boolean {
    return (
      templateKey === 'attestation_travail' ||
      templateKey === 'attestation_conge' ||
      templateKey === 'ordre_virement'
    );
  }

  render(payload: Payload, bodyFrTemplate: string): string {
    const body = this.renderBody(payload, bodyFrTemplate);
    const classes = [
      'sheet',
      this.isLandscape(payload.templateKey) ? 'landscape' : '',
      this.isLetter(payload.templateKey) ? 'letter' : '',
    ]
      .filter(Boolean)
      .join(' ');

    return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>${esc(payload.templateLabel)} — ${esc(payload.referenceNo)}</title>
<style>${this.styles}</style></head>
<body><div class="${classes}">${body}</div></body></html>`;
  }

  private renderBody(payload: Payload, bodyFrTemplate: string): string {
    switch (payload.templateKey) {
      case 'attestation_travail':
      case 'attestation_conge':
        return this.attestation(payload, bodyFrTemplate);
      case 'indemnite_fin':
        return this.indemnite(payload, bodyFrTemplate);
      case 'bulletin_paie':
        return this.bulletin(payload);
      case 'bordereau_cnss':
        return this.bordereau(payload);
      case 'ordre_virement':
        return this.virement(payload, bodyFrTemplate);
      default:
        throw new BadRequestException(`No renderer for "${payload.templateKey}"`);
    }
  }

  // ── Shared blocks ────────────────────────────────────────────────────────

  /**
   * Wordmark left, document title right — the header from the invoice design.
   *
   * The title lives here rather than floating over the body, which is what
   * frees the page to open on content instead of on a centred, underlined
   * heading with nothing under it.
   */
  private letterhead(payload: Payload, kicker: string, title?: string): string {
    return `<div class="lh">
      <img class="lh-mark" src="${LOGO_DATA_URI}" alt="${esc(payload.company.name)}">
      <div class="lh-right">
        <h1 class="lh-title">${esc(title ?? payload.templateLabel)}</h1>
        <div class="lh-kicker">${esc(kicker)}</div>
      </div>
    </div>`;
  }

  /**
   * The two-cell strip under the letterhead: who the document concerns on the
   * left, its filing identity on the right.
   *
   * Every document answers the same three questions in the same place —
   * number, date, subject — so a clerk pulling a file from a drawer finds them
   * without reading the page.
   */
  private metaStrip(
    left: { eyebrow: string; name: string; lines?: string[] },
    right: { eyebrow: string; pairs: Array<[string, string]> },
  ): string {
    const lines = (left.lines ?? []).filter(Boolean).join('<br>');
    const pairs = right.pairs
      .map(([key, value]) => `<span class="k">${esc(key)}</span><span class="v">${value}</span>`)
      .join('');

    return `<div class="meta">
      <div class="meta-cell">
        <div class="eyebrow">${esc(left.eyebrow)}</div>
        <div class="meta-name">${esc(left.name)}</div>
        ${lines ? `<div class="meta-sub">${lines}</div>` : ''}
      </div>
      <div class="meta-cell">
        <div class="eyebrow">${esc(right.eyebrow)}</div>
        <div class="meta-pairs">${pairs}</div>
      </div>
    </div>`;
  }

  /** The company's own identity, for the left cell of a period-scope document. */
  private employerCell(payload: Payload) {
    const company = payload.company;
    return {
      eyebrow: 'Employeur',
      name: company.legalName,
      lines: [
        `CNSS N° ${esc(company.cnssId)} &nbsp;·&nbsp; NIF ${esc(company.nif)}`,
        esc(company.address),
      ],
    };
  }

  /**
   * One signature block and the footer.
   *
   * The signatory is whoever the settings name as approver — the person who
   * actually signs. `prepared` and `checked` are still carried in settings and
   * still recorded against the issue in `IssuedDocument`; they are just not
   * printed, because an internal approval chain is not something a bank or a
   * labour inspector is being shown.
   */
  /**
   * The signature block: a labelled empty space, and nothing else.
   *
   * No printed name. Whoever signs writes their own, and pre-printing a name
   * from settings would put someone's name on a document they may not have
   * signed. The approver is still recorded against the issue in
   * `IssuedDocument`, where it belongs.
   */
  private signatures(payload: Payload, aside = ''): string {
    return `<div class="sign-zone">
      <div class="sign-row">
        <div class="sign-aside">${aside}</div>
        <div class="sign-box"><div class="cap">Signature</div></div>
      </div>
      ${this.footer(payload)}
    </div>`;
  }

  private footer(payload: Payload): string {
    const company = payload.company;
    const disc = (glyph: keyof typeof this.glyphs) =>
      `<span class="disc"><svg viewBox="0 0 24 24">${this.glyphs[glyph]}</svg></span>`;
    const separator = '<span class="foot-sep"></span>';

    return `<div class="foot">
      <div class="foot-items">
        <div class="foot-item">${disc('mail')}<span class="t">${esc(company.email)}</span></div>
        ${separator}
        <div class="foot-item">${disc('globe')}<span class="t">${esc(company.address)}</span></div>
        ${separator}
        <div class="foot-item">${disc('phone')}${disc('whatsapp')}<span class="t">${esc(
          company.phone,
        )}</span></div>
      </div>
      <span class="foot-page">1</span>
    </div>`;
  }

  /**
   * Flattens the payload into the token namespace the stored `bodyFr`
   * templates use, with dates and numbers already formatted for French.
   */
  private tokens(payload: Payload): Record<string, unknown> {
    const employee = payload.employee;
    return {
      company: payload.company,
      period: payload.period,
      employee: employee
        ? {
            ...employee,
            civility: civility(employee.gender),
            employedWord: employedWord(employee.gender),
            concernedWord: concernedWord(employee.gender),
            joiningDate: frDate(employee.joiningDate),
          }
        : undefined,
      leave: payload.leave
        ? {
            ...payload.leave,
            startDate: frDate(payload.leave.startDate),
            endDate: frDate(payload.leave.endDate),
          }
        : undefined,
    };
  }

  // ── Documents ────────────────────────────────────────────────────────────

  /** The employee cell every employee-scope document opens with. */
  private employeeCell(payload: Payload) {
    const employee = payload.employee;
    return {
      eyebrow: 'Concerne',
      name: employee.fullName,
      lines: [
        `${esc(employee.profession)}${
          employee.department ? ` &nbsp;·&nbsp; ${esc(employee.department)}` : ''
        }`,
        `Matricule ${esc(employee.matricule)}${
          employee.cnssNumber && employee.cnssNumber !== '—'
            ? ` &nbsp;·&nbsp; CNSS N° ${esc(employee.cnssNumber)}`
            : ''
        }`,
      ],
    };
  }

  private attestation(payload: Payload, bodyFrTemplate: string): string {
    const filled = fillTemplate(bodyFrTemplate, this.tokens(payload));
    const blocks = filled.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
    const [main, ...closing] = blocks;

    const kicker =
      payload.templateKey === 'attestation_conge' ? 'Congé annuel' : "Certificat d'emploi";

    return (
      this.letterhead(payload, kicker) +
      this.metaStrip(this.employeeCell(payload), {
        eyebrow: 'Références',
        pairs: [
          ['Réf.', `<span>${esc(payload.referenceNo)}</span>`],
          ["Date d'émission", frDate(payload.issueDate)],
          ['Lieu', 'Djibouti'],
        ],
      }) +
      `<div class="body-txt">${main ?? ''}</div>` +
      closing.map((block) => `<div class="closing">${block}</div>`).join('') +
      this.signatures(payload)
    );
  }

  private indemnite(payload: Payload, bodyFrTemplate: string): string {
    const severance = payload.severance;
    const row = (label: string, value: string, className = '') =>
      `<tr class="${className}"><td>${label}</td><td class="val">${value}</td></tr>`;

    return (
      this.letterhead(payload, 'Rupture du contrat de travail') +
      this.metaStrip(this.employeeCell(payload), {
        eyebrow: 'Références',
        pairs: [
          ['Réf.', `<span>${esc(payload.referenceNo)}</span>`],
          ["Date d'embauche", frDate(payload.employee.joiningDate)],
          ['Fin de contrat', frDate(severance.terminationDate)],
          [
            'Ancienneté',
            `${money0(severance.serviceDays)} j (${decimal(severance.serviceYears)} ans)`,
          ],
        ],
      }) +
      paragraphs(fillTemplate(bodyFrTemplate, this.tokens(payload))) +
      `<div class="h2">Décompte</div>
      <table class="calc">
        <tr class="head"><td>Élément</td><td class="val">Montant (DJF)</td></tr>
        ${row('Salaire brut mensuel', money(severance.salaireBrut))}
        ${row(
          'Indemnité de fin de service (20 % par an)',
          money(severance.indemniteFinDeService),
        )}
        ${row('Indemnité de préavis (1 mois)', money(severance.indemnitePreavis))}
        ${
          severance.payUnusedLeave
            ? row(
                `Indemnité compensatrice de congé (${decimal(severance.unusedLeaveDays)} j)`,
                money(severance.indemniteConge),
              )
            : ''
        }
        ${row('Total brut', money(severance.totalBrut), 'strong rule')}
        ${row('CNSS 6 % (retraite 4 % + AMU 2 %)', `− ${money(severance.cnss6)}`)}
        ${row('Total général net', `${money(severance.totalGeneral)} DJF`, 'total')}
      </table>` +
      (severance.payUnusedLeave
        ? ''
        : `<div class="flag"><b>Élément non inclus</b>L'indemnité compensatrice de congé (${decimal(
            severance.unusedLeaveDays,
          )} jours restants) n'est pas comprise dans ce décompte. Elle est exigée à la rupture par le Code du travail.</div>`) +
      `<div class="closing">Le présent certificat est établi à la demande de ${esc(
        concernedWord(payload.employee.gender),
      )} pour servir et valoir ce que de droit.</div>` +
      this.signatures(payload)
    );
  }

  private bulletin(payload: Payload): string {
    const payslip = payload.payslip;
    const employee = payload.employee;
    const row = (label: string, value: string, className = '') =>
      `<tr class="${className}"><td>${label}</td><td class="val">${value}</td></tr>`;

    return (
      this.letterhead(payload, esc(payslip.period.labelFr)) +
      this.metaStrip(this.employeeCell(payload), {
        eyebrow: 'Période de paie',
        pairs: [
          ['Réf.', `<span>${esc(payload.referenceNo)}</span>`],
          ['Mois', esc(payslip.period.labelFr)],
          ["Date d'embauche", frDate(employee.joiningDate)],
          ['Ancienneté', `${decimal(payslip.seniorityRate * 100, 0)} %`],
        ],
      }) +
      (payslip.provisional
        ? `<div class="flag"><b>Bulletin provisoire</b>La période ${esc(
            payslip.period.labelFr,
          )} n'a pas encore été calculée et validée. Les montants ci-dessous sont une projection.</div>`
        : '') +
      `<table class="calc">
        <tr class="head"><td>Rubrique</td><td class="val">Montant (DJF)</td></tr>
        ${row('Salaire de base', money(payslip.baseSalary))}
        ${
          payslip.overtimeAmount > 0
            ? row(
                `Heures supplémentaires (${decimal(payslip.overtimeHours, 0)} h)`,
                money(payslip.overtimeAmount),
              )
            : ''
        }
        ${
          payslip.absenceDeduction > 0
            ? row('Retenue pour absence', `− ${money(payslip.absenceDeduction)}`)
            : ''
        }
        ${row('Salaire brut', money(payslip.currentGross), 'strong rule')}
        ${row('(Moins : 4 % CNSS retraite)', `− ${money(payslip.retirementEmployee)}`)}
        ${/* The source template labelled this line "Gross Salary After 2%
            Deduction" while printing the AMU *amount*. Labelled for what it
            is. */ ''}
        ${row('(Moins : 2 % AMU)', `− ${money(payslip.amuEmployee)}`)}
        ${row('Salaire imposable', money(payslip.taxableWages), 'strong rule')}
        ${row('(Moins : ITS)', `− ${money(payslip.its)}`)}
        ${row('Net à payer', `${money(payslip.netSalary)} DJF`, 'total')}
      </table>
      <div class="h2">Pour information</div>
      <table class="calc quiet">
        ${row('Prime d’ancienneté (non versée)', money(payslip.seniorityAmount))}
        ${row('Part patronale CNSS 15,7 % (non déduite du net)', money(payslip.employerContribution))}
        ${row('Solde de congé', `${decimal(employee.leaveBalance.balance)} jours`)}
        ${row('Virement au compte', `${esc(employee.bankAccount)} — ${esc(payload.company.bankName)}`)}
      </table>` +
      this.signatures(payload)
    );
  }

  private bordereau(payload: Payload): string {
    const rows = payload.rows
      .map(
        (row: Payload) => `<tr>
          <td class="num">${row.index}</td><td>${esc(row.employeeName)}</td>
          <td>${esc(row.nationality)}</td><td>${esc(row.cnssNumber)}</td>
          <td>${esc(row.profession)}</td><td>${frDate(row.joiningDate)}</td>
          <td class="num">${money0(row.absenceDeduction)}</td>
          <td class="num">${money0(row.overtimeAmount)}</td>
          <td class="num">${money0(row.currentGross)}</td>
          <td class="num">${decimal(row.seniorityRate * 100, 0)} %</td>
          <td class="num">${money0(row.cappedSalary)}</td>
          <td class="num">${money0(row.retirementEmployee)}</td>
          <td class="num">${money0(row.amuEmployee)}</td>
          <td class="num">${money0(row.employerContribution)}</td>
          <td class="num">${money0(row.totalCnss)}</td>
          <td class="num">${money0(row.taxableWages)}</td>
          <td class="num">${money0(row.its)}</td>
          <td class="num">${money0(row.netSalary)}</td>
        </tr>`,
      )
      .join('');

    const totals = payload.totals;

    const plural = totals.headcount > 1 ? 's' : '';

    return (
      this.letterhead(payload, 'Liste du personnel', 'Bordereau CNSS') +
      this.metaStrip(this.employerCell(payload), {
        eyebrow: 'Déclaration',
        pairs: [
          ['Réf.', `<span>${esc(payload.referenceNo)}</span>`],
          ['Mois déclaré', esc(payload.period.labelFr)],
          ["Date d'émission", frDate(payload.issueDate)],
          ['Effectif', `${totals.headcount} salarié${plural}`],
        ],
      }) +
      `<table class="grid${this.density(payload.rows.length)}">
        <thead><tr>
          <th>N°</th><th>Nom et prénom</th><th>Nationalité</th><th>N° CNSS</th><th>Profession</th>
          <th>Embauche</th><th class="num">Absence</th><th class="num">H. supp.</th>
          <th class="num">Brut</th><th class="num">Anc.</th><th class="num">Plafonné</th>
          <th class="num">Retraite 4 %</th><th class="num">AMU 2 %</th>
          <th class="num">Patronale 15,7 %</th><th class="num">CNSS 21,7 %</th>
          <th class="num">Imposable</th><th class="num">ITS</th><th class="num">Net</th>
        </tr></thead>
        <tbody>${rows}
          <tr class="sum">
            <td colspan="6">Total — ${totals.headcount} salarié${plural}</td>
            <td class="num">${money0(totals.absenceDeduction)}</td>
            <td class="num">${money0(totals.overtimeAmount)}</td>
            <td class="num">${money0(totals.currentGross)}</td>
            <td></td>
            <td class="num">${money0(totals.cappedSalary)}</td>
            <td class="num">${money0(totals.retirementEmployee)}</td>
            <td class="num">${money0(totals.amuEmployee)}</td>
            <td class="num">${money0(totals.employerContribution)}</td>
            <td class="num">${money0(totals.totalCnss)}</td>
            <td class="num">${money0(totals.taxableWages)}</td>
            <td class="num">${money0(totals.its)}</td>
            <td class="num">${money0(totals.netSalary)}</td>
          </tr>
        </tbody>
      </table>
      ` +
      /*
       * The employer's box rides beside the signature rather than under the
       * register. Stacked, the three blocks ran 359 px past the bottom of a
       * landscape A4 and the page silently lost its footer.
       */
      this.signatures(
        payload,
        `<div class="pill">
          <span class="pill-badge">€</span>
          <span class="pill-label">Cadre à remplir par l'employeur</span>
        </div>
        <table class="calc quiet" style="max-width:430px;margin:0">
          <tr><td>Salaires bruts déclarés</td><td class="val">${money0(totals.currentGross)}</td></tr>
          <tr><td>Cotisations à verser</td><td class="val">${money0(totals.totalCnss)}</td></tr>
          <tr><td>Majoration 10 % · 3 % · astreinte</td><td class="val">—</td></tr>
          ${/* Computed, never typed: the source workbook printed "Total 19
              SALARIES" over a ten-person list. */ ''}
          <tr><td>Total ${totals.headcount} salarié${plural}</td><td class="val">${money0(
            totals.currentGross,
          )}</td></tr>
          <tr><td>ITS</td><td class="val">${money0(totals.its)}</td></tr>
          <tr class="total"><td>Total à verser</td><td class="val">${money0(
            totals.totalCnss + totals.its,
          )} DJF</td></tr>
        </table>`,
      )
    );
  }

  private virement(payload: Payload, bodyFrTemplate: string): string {
    const rows = payload.rows
      .map(
        (row: Payload) => `<tr>
          <td class="num">${row.index}</td><td>${esc(row.employeeName)}</td>
          <td>${esc(row.bankAccount)}</td><td class="num">${money(row.netSalary)}</td>
        </tr>`,
      )
      .join('');

    const company = payload.company;
    const plural = payload.totals.headcount > 1 ? 's' : '';

    return (
      this.letterhead(payload, `Salaires — ${esc(payload.period.labelFr)}`) +
      this.metaStrip(
        {
          eyebrow: 'Destinataire',
          name: company.bankName,
          lines: [
            `Compte à débiter : ${esc(company.bankAccountName)}`,
            `N° ${esc(company.bankAccountNo)}`,
          ],
        },
        {
          eyebrow: 'Ordre',
          pairs: [
            ['Réf.', `<span>${esc(payload.referenceNo)}</span>`],
            ['Objet', `Salaires ${esc(payload.period.labelFr)}`],
            ["Date d'émission", frDate(payload.issueDate)],
            ['Bénéficiaires', String(payload.totals.headcount)],
          ],
        },
      ) +
      paragraphs(fillTemplate(bodyFrTemplate, this.tokens(payload))) +
      `<table class="grid${this.density(payload.rows.length)}">
        <thead><tr><th style="width:44px">N°</th><th>Bénéficiaire</th><th>N° de compte</th>
          <th class="num">Net à payer (DJF)</th></tr></thead>
        <tbody>${rows}
          <tr class="sum"><td colspan="3">Total — ${payload.totals.headcount} bénéficiaire${plural}</td>
          <td class="num">${money(payload.totals.netSalary)}</td></tr>
        </tbody>
      </table>
      <table class="calc" style="max-width:340px;margin-left:auto">
        <tr class="total"><td>Total à virer</td><td class="val">${money(
          payload.totals.netSalary,
        )} DJF</td></tr>
      </table>` +
      this.signatures(payload)
    );
  }
}
