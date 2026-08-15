"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const reference_util_1 = require("../src/common/helpers/reference.util");
const prisma = new client_1.PrismaClient();
const TARGETS = [
    { model: 'shipment', field: 'reference', prefix: 'MSN' },
    { model: 'booking', field: 'reference', prefix: 'BKG' },
    { model: 'project', field: 'reference', prefix: 'PRJ' },
    { model: 'emptyReturnCycle', field: 'reference', prefix: 'CYC' },
    { model: 'emptyReturnChain', field: 'reference', prefix: 'CHN' },
    { model: 'vehicle', field: 'reference', prefix: 'VEH' },
    { model: 'driver', field: 'reference', prefix: 'DRV' },
    { model: 'invoice', field: 'number', prefix: 'INV' },
    { model: 'payment', field: 'number', prefix: 'PAY' },
    { model: 'paymentOrder', field: 'number', prefix: 'PO' },
    { model: 'drawdown', field: 'number', prefix: 'DD' },
    { model: 'creditFacility', field: 'facilityNumber', prefix: 'CF' },
];
const alreadyShort = (value, prefix) => new RegExp(`^${prefix}-\\d{${reference_util_1.ID_DIGITS}}$`).test(value);
function sequenceOf(value) {
    const digits = /(\d+)(?!.*\d)/.exec(value)?.[1];
    if (!digits)
        return null;
    const n = parseInt(digits.slice(-reference_util_1.ID_DIGITS), 10);
    return n >= 1 ? n : null;
}
async function renumber(target, write) {
    const { model, field, prefix } = target;
    const delegate = prisma[model];
    const rows = await delegate.findMany({ select: { id: true, [field]: true } });
    const taken = new Set(rows.map((r) => String(r[field])));
    const changes = [];
    for (const row of rows) {
        const from = String(row[field]);
        if (alreadyShort(from, prefix))
            continue;
        if (!from.startsWith(`${prefix}-`))
            continue;
        let sequence = sequenceOf(from);
        if (sequence == null) {
            console.warn(`  ! ${model}.${field} "${from}" has no digits — left alone`);
            continue;
        }
        let to = (0, reference_util_1.formatReference)(prefix, sequence);
        while (taken.has(to) && sequence < reference_util_1.ID_MAX) {
            sequence += 1;
            to = (0, reference_util_1.formatReference)(prefix, sequence);
        }
        taken.delete(from);
        taken.add(to);
        changes.push({ id: String(row.id), from, to });
    }
    if (!changes.length) {
        console.log(`${model}.${field}: nothing to do (${rows.length} rows)`);
        return 0;
    }
    console.log(`${model}.${field}: ${changes.length} of ${rows.length} rows`);
    for (const c of changes)
        console.log(`  ${c.from.padEnd(16)} -> ${c.to}`);
    if (write) {
        await prisma.$transaction([
            ...changes.map((c) => delegate.update({ where: { id: c.id }, data: { [field]: `~${c.id.slice(0, 24)}` } })),
            ...changes.map((c) => delegate.update({ where: { id: c.id }, data: { [field]: c.to } })),
        ]);
    }
    return changes.length;
}
async function renumberShipmentBookingIds(write) {
    const rows = await prisma.shipment.findMany({ select: { id: true, bookingId: true } });
    const changes = rows
        .map((row) => ({ id: row.id, from: row.bookingId, to: shortBookingId(row.bookingId) }))
        .filter((c) => c.to !== c.from);
    if (!changes.length) {
        console.log(`shipment.bookingId: nothing to do (${rows.length} rows)`);
        return 0;
    }
    console.log(`shipment.bookingId: ${changes.length} of ${rows.length} rows`);
    for (const c of changes)
        console.log(`  ${c.from.padEnd(16)} -> ${c.to}`);
    if (write) {
        await prisma.$transaction(changes.map((c) => prisma.shipment.update({ where: { id: c.id }, data: { bookingId: c.to } })));
    }
    return changes.length;
}
function shortBookingId(value) {
    return value
        .split(',')
        .map((part) => {
        const one = part.trim();
        if (!one.startsWith('BKG-') || alreadyShort(one, 'BKG'))
            return one;
        const sequence = sequenceOf(one);
        return sequence == null ? one : (0, reference_util_1.formatReference)('BKG', sequence);
    })
        .join(', ');
}
async function main() {
    const write = process.argv.includes('--write');
    console.log(write ? 'Renumbering references…\n' : 'Dry run — pass --write to apply.\n');
    let total = 0;
    for (const target of TARGETS)
        total += await renumber(target, write);
    total += await renumberShipmentBookingIds(write);
    console.log(`\n${total} reference${total === 1 ? '' : 's'} ${write ? 'renumbered' : 'would change'}.`);
}
main()
    .catch((error) => {
    console.error(error);
    process.exitCode = 1;
})
    .finally(() => prisma.$disconnect());
//# sourceMappingURL=renumber-references.js.map