import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { BankAccountsService } from './bank-accounts.service';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';
import { UpdateBankAccountDto } from './dto/update-bank-account.dto';
import { RecordMovementDto, TransferFundsDto } from './dto/bank-movement.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

@ApiTags('Bank Accounts')
@ApiBearerAuth()
@Controller('bank-accounts')
export class BankAccountsController {
  constructor(private readonly bankAccountsService: BankAccountsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.finance.view)
  @ApiOperation({ summary: 'List active bank accounts' })
  findAll() {
    return this.bankAccountsService.findAll();
  }

  @Get('movements')
  @RequirePermissions(PERMISSIONS.finance.view)
  @ApiOperation({ summary: 'Deposits, withdrawals and transfer legs across every account' })
  @ApiQuery({ name: 'bankAccountId', required: false })
  @ApiQuery({ name: 'limit', required: false })
  movements(@Query('bankAccountId') bankAccountId?: string, @Query('limit') limit?: string) {
    return this.bankAccountsService.movements({
      bankAccountId,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.finance.view)
  findOne(@Param('id') id: string) {
    return this.bankAccountsService.findOne(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.finance.create)
  @ApiOperation({ summary: 'Register a bank account — exists so a CreditFacility has something real to reference' })
  create(@Body() dto: CreateBankAccountDto) {
    return this.bankAccountsService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.finance.update)
  @ApiOperation({ summary: 'Edit registration details. Cannot touch a balance — that needs a real movement' })
  update(@Param('id') id: string, @Body() dto: UpdateBankAccountDto) {
    return this.bankAccountsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.finance.update)
  @ApiOperation({ summary: 'Close an account. Refused while it still holds money' })
  remove(@Param('id') id: string) {
    return this.bankAccountsService.remove(id);
  }

  @Post(':id/logo')
  @RequirePermissions(PERMISSIONS.finance.update)
  @ApiOperation({ summary: "Upload the bank's logo" })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  uploadLogo(@Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    return this.bankAccountsService.uploadLogo(id, file);
  }

  @Delete(':id/logo')
  @RequirePermissions(PERMISSIONS.finance.update)
  @ApiOperation({ summary: 'Drop the logo, falling back to the generic bank glyph' })
  removeLogo(@Param('id') id: string) {
    return this.bankAccountsService.removeLogo(id);
  }

  @Post(':id/deposit')
  @RequirePermissions(PERMISSIONS.finance.approve)
  @ApiOperation({ summary: 'Money in — writes a movement and raises the balance in one transaction' })
  deposit(@Param('id') id: string, @Body() dto: RecordMovementDto, @CurrentUser() user: AuthenticatedUser) {
    return this.bankAccountsService.deposit(id, dto, user.id, `${user.firstName} ${user.lastName}`.trim());
  }

  @Post(':id/withdraw')
  @RequirePermissions(PERMISSIONS.finance.approve)
  @ApiOperation({ summary: 'Money out — refused if it would take the account negative' })
  withdraw(@Param('id') id: string, @Body() dto: RecordMovementDto, @CurrentUser() user: AuthenticatedUser) {
    return this.bankAccountsService.withdraw(id, dto, user.id, `${user.firstName} ${user.lastName}`.trim());
  }

  @Post(':id/transfer')
  @RequirePermissions(PERMISSIONS.finance.approve)
  @ApiOperation({ summary: 'Move money to another Fleetin account — both legs post or neither does' })
  transfer(@Param('id') id: string, @Body() dto: TransferFundsDto, @CurrentUser() user: AuthenticatedUser) {
    return this.bankAccountsService.transfer(id, dto, user.id, `${user.firstName} ${user.lastName}`.trim());
  }
}
