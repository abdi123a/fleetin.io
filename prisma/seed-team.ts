/**
 * The Fleetin operations team.
 *
 * A fresh install has four accounts and two of them are portal logins for a
 * customer and a carrier, so "assign this shipment to someone" had nobody to
 * offer. These are the internal desks the work actually crosses: dispatch
 * puts a shipment on the road, empties chases the boxes back, documents
 * handles the paperwork, finance releases the money.
 *
 * Idempotent — `upsert` by email, so re-running adds nothing and changes no
 * password. It never touches shipments, so running it on a working database
 * is safe.
 */
import { PrismaClient, UserStatus } from '@prisma/client';
import { hashPassword } from '../src/common/security/password.util';
import { PERMISSIONS } from '../src/common/constants/permissions';
import { assertSeedTargetIsSafe } from './seed-target-guard';

const prisma = new PrismaClient();

/** Every seeded teammate shares this. Demo accounts, on a local database only. */
const TEAM_PASSWORD = process.env.SEED_TEAM_PASSWORD ?? 'Fleetin@2026!';

/**
 * The operations desk.
 *
 * A role of its own rather than reusing MANAGER: these accounts run shipments
 * and empties all day and never touch payroll, users or the ledger, which is
 * three quarters of what MANAGER grants. Same shape as the roles in `seed.ts`
 * — permission strings from the shared catalogue, wildcards where the desk
 * genuinely owns the resource.
 */
const OPERATIONS_ROLE = {
  name: 'OPERATIONS',
  description: 'Operations desk — runs shipments, bookings and empty returns end to end',
  permissions: [
    'shipments.*',
    'bookings.*',
    'empty-returns.*',
    'documents.*',
    PERMISSIONS.shippers.view,
    PERMISSIONS.partners.view,
    PERMISSIONS.vehicles.view,
    PERMISSIONS.drivers.view,
    PERMISSIONS.analytics.view,
  ],
};

const TEAM = [
  { firstName: 'Nasra', lastName: 'Ismail', email: 'nasra.ismail@fleetin.io', role: 'OPERATIONS' },
  { firstName: 'Idriss', lastName: 'Waberi', email: 'idriss.waberi@fleetin.io', role: 'OPERATIONS' },
  { firstName: 'Fatouma', lastName: 'Abdillahi', email: 'fatouma.abdillahi@fleetin.io', role: 'OPERATIONS' },
  { firstName: 'Souad', lastName: 'Mohamed', email: 'souad.mohamed@fleetin.io', role: 'OPERATIONS' },
  { firstName: 'Kamil', lastName: 'Osman', email: 'kamil.osman@fleetin.io', role: 'MANAGER' },
  { firstName: 'Hodan', lastName: 'Farah', email: 'hodan.farah@fleetin.io', role: 'FINANCE' },
];

async function main() {
  assertSeedTargetIsSafe('seed-team.ts');

  const operations = await prisma.role.upsert({
    where: { name: OPERATIONS_ROLE.name },
    update: { description: OPERATIONS_ROLE.description, permissions: [...OPERATIONS_ROLE.permissions] },
    create: {
      name: OPERATIONS_ROLE.name,
      description: OPERATIONS_ROLE.description,
      permissions: [...OPERATIONS_ROLE.permissions],
    },
  });
  console.log(`✅ Role ${operations.name} (${OPERATIONS_ROLE.permissions.length} grants)`);

  const roles = await prisma.role.findMany({ select: { id: true, name: true } });
  const roleIdByName = new Map(roles.map((role) => [role.name, role.id]));

  const passwordHash = await hashPassword(TEAM_PASSWORD);

  for (const member of TEAM) {
    const roleId = roleIdByName.get(member.role);
    if (!roleId) {
      console.warn(`⚠️  Skipping ${member.email} — role ${member.role} does not exist`);
      continue;
    }
    await prisma.user.upsert({
      where: { email: member.email },
      // Role only. A password already changed by a real person stays changed.
      update: { roleId, status: UserStatus.ACTIVE },
      create: {
        email: member.email,
        passwordHash,
        firstName: member.firstName,
        lastName: member.lastName,
        status: UserStatus.ACTIVE,
        roleId,
      },
    });
    console.log(`👤 ${member.firstName} ${member.lastName} — ${member.role}`);
  }

  const assignable = await prisma.user.count({
    where: {
      status: 'ACTIVE',
      shipperId: null,
      partnerId: null,
      role: { name: { notIn: ['SHIPPER', 'TRANSPORTER'] } },
    },
  });
  console.log(`\n✅ ${assignable} team members assignable to a shipment.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
