import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

@ApiTags('Settings')
@ApiBearerAuth()
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.settings.view)
  @ApiOperation({ summary: 'Read platform settings' })
  get() {
    return this.settingsService.get();
  }

  @Patch()
  @RequirePermissions(PERMISSIONS.settings.update)
  @ApiOperation({
    summary: "Update platform settings. Changing the commission re-prices future shipments only — money already booked is not restated.",
  })
  update(@Body() dto: UpdateSettingsDto, @CurrentUser() user: AuthenticatedUser) {
    return this.settingsService.update(dto, user.id, `${user.firstName} ${user.lastName}`.trim());
  }
}
