import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { CompanySettingsService } from './company-settings.service';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PERMISSIONS } from '../../../common/constants/permissions';
import type { AuthenticatedUser } from '../../auth/jwt.strategy';

@ApiTags('HR — Settings')
@ApiBearerAuth()
@Controller('hr/settings')
export class CompanySettingsController {
  constructor(private readonly settings: CompanySettingsService) {}

  @Get('company')
  @RequirePermissions(PERMISSIONS.hrDocuments.view)
  @ApiOperation({ summary: 'Letterhead, bank details and signatories' })
  get() {
    return this.settings.get();
  }

  @Patch('company')
  @RequirePermissions(PERMISSIONS.settings.update)
  @ApiOperation({ summary: 'Update company settings' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: Prisma.CompanySettingsUpdateInput,
  ) {
    return this.settings.update(user, body);
  }
}
