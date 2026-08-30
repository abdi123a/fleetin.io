import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { hashPassword } from '../../common/security/password.util';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(page = 1, limit = 10, roleId?: string) {
    const skip = (page - 1) * limit;
    const where = roleId ? { roleId } : {};

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phoneNumber: true,
          avatarUrl: true,
          status: true,
          createdAt: true,
          role: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * The Fleetin team — the people who can be put on a shipment.
   *
   * Not the same list as `findAll`. Two of the four accounts in a fresh
   * install are *portal* logins: a shipper's own staff and a transporter's
   * own staff, scoped by `shipperId`/`partnerId` to their own company's rows.
   * Offering those in an internal assignment picker would let an operator put
   * a customer on the crew of a job, and put that customer's face on the
   * shipment for everyone else to see.
   *
   * So the filter is by what the account *is*, not by what it is called: an
   * account tied to a company is that company's, and every other active
   * account is ours. Role names are checked too, since a portal role can
   * exist before its company link is set.
   *
   * Suspended and inactive accounts are excluded — you cannot hand work to
   * someone who cannot log in — but an account already on a crew keeps
   * showing there, because the shipment's own `assignees` are read from the
   * join table, not filtered through this list.
   */
  async team() {
    const items = await this.prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        shipperId: null,
        partnerId: null,
        role: { name: { notIn: ['SHIPPER', 'TRANSPORTER'] } },
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        role: { select: { id: true, name: true, description: true } },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });

    return items.map((user) => ({
      ...user,
      fullName: `${user.firstName} ${user.lastName}`.trim(),
      roleName: user.role?.name ?? null,
    }));
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        avatarUrl: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        role: true,
      },
    });

    if (!user) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }

    return user;
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      include: { role: true },
    });
  }

  async create(dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException(`User with email "${dto.email}" already exists`);
    }

    // `roleId` accepts either a role id or a role name, so resolve it to a
    // real id before writing. The initial value was overwritten in every
    // reachable path, so the lookup result is now assigned directly.
    const role = await this.prisma.role.findFirst({
      where: { OR: [{ id: dto.roleId }, { name: dto.roleId }] },
    });

    if (!role) {
      throw new NotFoundException(`Role "${dto.roleId}" not found`);
    }

    const roleId = role.id;

    const passwordHash = await hashPassword(dto.password);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phoneNumber: dto.phoneNumber,
        status: dto.status,
        roleId,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        status: true,
        role: true,
        createdAt: true,
      },
    });

    return user;
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findOne(id);

    /* `roleId` accepts an id or a role name on create, and `UpdateUserDto`
     * inherits that field — so it has to resolve the same way here. Passing a
     * name straight through failed at the foreign key with an opaque Prisma
     * error, which is what "change this user's access profile" hit whenever
     * the caller sent `ADMIN` rather than a uuid. */
    const { roleId: requestedRole, ...rest } = dto;
    let roleId: string | undefined;

    if (requestedRole) {
      const role = await this.prisma.role.findFirst({
        where: { OR: [{ id: requestedRole }, { name: requestedRole }] },
      });
      if (!role) {
        throw new NotFoundException(`Role "${requestedRole}" not found`);
      }
      roleId = role.id;
    }

    return this.prisma.user.update({
      where: { id },
      data: { ...rest, ...(roleId ? { roleId } : {}) },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        avatarUrl: true,
        status: true,
        role: true,
        updatedAt: true,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.user.delete({ where: { id } });
  }
}
