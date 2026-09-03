"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const p = new client_1.PrismaClient();
(async () => {
    const rows = await p.$queryRawUnsafe(`SELECT impactStatus, COUNT(*) c, ROUND(SUM(avoidedCo2Kg),1) kg, ROUND(SUM(avoidedDistanceKm),1) km
     FROM empty_return_cycles GROUP BY impactStatus`);
    console.log('BY STATUS:', rows);
    const notes = await p.$queryRawUnsafe(`SELECT impactNote, COUNT(*) c FROM empty_return_cycles
     WHERE impactStatus='not_realized' GROUP BY impactNote ORDER BY c DESC LIMIT 6`);
    console.log('WHY NOT REALIZED:', notes);
    const priced = await p.$queryRawUnsafe(`SELECT COUNT(*) total, SUM(avoidedCo2Kg IS NULL) unpriced
     FROM empty_return_cycles WHERE impactStatus='realized'`);
    console.log('REALIZED PRICING:', priced);
    await p.$disconnect();
})();
//# sourceMappingURL=impact-check.js.map