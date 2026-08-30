import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  PERMISSION_CATALOG,
  WILDCARD_ALL,
  expandGrants,
  type PermissionCatalogEntry,
} from '../../common/constants/permissions';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

/**
 * Roles the application itself depends on by name.
 *
 * `RolesGuard` short-circuits on `ADMIN`; login scopes SHIPPER and TRANSPORTER
 * sessions to one company; the HR module reads MANAGER and HR_ADMIN. Deleting
 * or de-fanging one of these does not remove a feature, it breaks the accounts
 * that hold it — so they are read-only in the admin UI and refused here.
 */
export const SYSTEM_ROLE_NAMES = [
  'ADMIN',
  'MANAGER',
  'HR_ADMIN',
  'FINANCE',
  'EMPLOYEE',
  'DISPATCHER',
  'DRIVER',
  'CLIENT',
  'SHIPPER',
  'TRANSPORTER',
] as const;

function isSystemRole(name: string): boolean {
  return (SYSTEM_ROLE_NAMES as readonly string[]).includes(name);
}

/** A stored `permissions` column is `Json`; normalise it to a grant list. */
function asGrants(permissions: unknown): string[] {
  return Array.isArray(permissions) ? permissions.filter((p): p is string => typeof p === 'string') : [];
}

export interface RoleSummary {
  id: string;
  name: string;
  description: string | null;
  /** As stored, wildcards included. */
  permissions: string[];
  /** What those grants actually confer, wildcards expanded. */
  effectivePermissions: string[];
  /** Length of `effectivePermissions` — the number the admin UI states. */
  grantCount: number;
  /** True for `*`. Counting is meaningless for it; say so instead. */
  isSuperuser: boolean;
  /** Depended on by name; not editable or deletable. */
  isSystem: boolean;
  userCount: number;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The permission vocabulary, for the access picker.
   *
   * Served rather than duplicated in the frontend: the backend is the source
   * of truth for what a permission *is*, and a checkbox for a grant no guard
   * honours is worse than a missing one.
   */
  catalog(): { resources: PermissionCatalogEntry[]; total: number; wildcardAll: string } {
    return {
      resources: PERMISSION_CATALOG,
      total: PERMISSION_CATALOG.reduce((sum, entry) => sum + entry.permissions.length, 0),
      wildcardAll: WILDCARD_ALL,
    };
  }

  async findAll(): Promise<RoleSummary[]> {
    const roles = await this.prisma.role.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { users: true } } },
    });

    return roles.map((role) => this.toSummary(role, role._count.users));
  }

  async findOne(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: {
        _count: { select: { users: true } },
        users: {
          select: { id: true, firstName: true, lastName: true, email: true, status: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!role) {
      throw new NotFoundException(`Role with ID "${id}" not found`);
    }
    return { ...this.toSummary(role, role._count.users), users: role.users };
  }

  async create(dto: CreateRoleDto): Promise<RoleSummary> {
    const name = dto.name.trim().toUpperCase();

    const existing = await this.prisma.role.findUnique({ where: { name } });
    if (existing) {
      throw new ConflictException(`Role "${name}" already exists`);
    }

    this.assertNotBlanketSuperuser(dto.permissions);

    const role = await this.prisma.role.create({
      data: { name, description: dto.description, permissions: dto.permissions },
    });
    return this.toSummary(role, 0);
  }

  async update(id: string, dto: UpdateRoleDto): Promise<RoleSummary> {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    });
    if (!role) {
      throw new NotFoundException(`Role with ID "${id}" not found`);
    }
    if (isSystemRole(role.name)) {
      throw new BadRequestException(
        `"${role.name}" is a built-in role and cannot be edited. Copy it into a custom role instead.`,
      );
    }
    if (dto.permissions) {
      this.assertNotBlanketSuperuser(dto.permissions);
    }

    const updated = await this.prisma.role.update({
      where: { id },
      data: {
        description: dto.description ?? role.description,
        ...(dto.permissions ? { permissions: dto.permissions } : {}),
      },
    });
    return this.toSummary(updated, role._count.users);
  }

  async remove(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    });
    if (!role) {
      throw new NotFoundException(`Role with ID "${id}" not found`);
    }
    if (isSystemRole(role.name)) {
      throw new BadRequestException(`"${role.name}" is a built-in role and cannot be deleted.`);
    }
    /* `users.roleId` is a required foreign key: deleting a role out from under
     * its holders fails at the database with an opaque constraint error, and
     * would leave them unable to log in if it did not. Say who is holding it. */
    if (role._count.users > 0) {
      throw new ConflictException(
        `"${role.name}" is assigned to ${role._count.users} user(s). Move them to another access profile first.`,
      );
    }

    await this.prisma.role.delete({ where: { id } });
    return { id, name: role.name, deleted: true };
  }

  /**
   * `*` is the ADMIN role's grant and nothing else's.
   *
   * Handing it out from the access picker would create a second, unlabelled
   * superuser that the roles list shows as an ordinary custom profile.
   */
  private assertNotBlanketSuperuser(permissions: string[]) {
    if (permissions.includes(WILDCARD_ALL)) {
      throw new BadRequestException(
        'The "*" grant is reserved for the built-in ADMIN role. Grant the resources this profile needs instead.',
      );
    }
  }

  private toSummary(
    role: { id: string; name: string; description: string | null; permissions: unknown; createdAt: Date; updatedAt: Date },
    userCount: number,
  ): RoleSummary {
    const permissions = asGrants(role.permissions);
    const isSuperuser = permissions.includes(WILDCARD_ALL);
    const effectivePermissions = expandGrants(permissions);

    return {
      id: role.id,
      name: role.name,
      description: role.description,
      permissions,
      effectivePermissions,
      grantCount: effectivePermissions.length,
      isSuperuser,
      isSystem: isSystemRole(role.name),
      userCount,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    };
  }
}
