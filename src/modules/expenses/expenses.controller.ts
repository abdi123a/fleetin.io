import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { PayExpenseDto, RejectExpenseDto } from './dto/decide-expense.dto';
import {
  CreateRecurringExpenseDto,
  UpdateRecurringExpenseDto,
} from './dto/recurring-expense.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { contentDisposition } from '../../common/helpers/content-disposition.util';

/**
 * What it costs to run Fleetin.
 *
 * Note the permission on `GET /expenses` and `GET /expenses/:id`: **create**,
 * not view. Anyone who may file a claim may read the book — scoped by
 * `ExpensesService` to their own rows unless they also hold `expenses.view`.
 * Requiring `view` here would have hidden a person's own submitted claim from
 * them, which is the one row they have an unarguable right to see.
 *
 * Routes are ordered with `/recurring` before `/:id` — Nest matches in
 * declaration order, and the reverse would send every template request to the
 * claim lookup.
 */
@ApiTags('Expenses')
@ApiBearerAuth()
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  /* ─── Recurring templates ───────────────────────────────────────────── */

  @Get('recurring')
  @RequirePermissions(PERMISSIONS.expenses.view)
  @ApiOperation({ summary: 'The standing obligations, each with what it costs per month' })
  findTemplates() {
    return this.expenses.findTemplates();
  }

  @Post('recurring')
  @RequirePermissions(PERMISSIONS.expenses.manage)
  @ApiOperation({ summary: 'Add a standing obligation — rent, a salary, a premium' })
  createTemplate(@Body() dto: CreateRecurringExpenseDto, @CurrentUser() user: AuthenticatedUser) {
    return this.expenses.createTemplate(dto, user);
  }

  @Patch('recurring/:id')
  @RequirePermissions(PERMISSIONS.expenses.manage)
  updateTemplate(@Param('id') id: string, @Body() dto: UpdateRecurringExpenseDto) {
    return this.expenses.updateTemplate(id, dto);
  }

  @Post('recurring/:id/post')
  @RequirePermissions(PERMISSIONS.expenses.manage)
  @ApiOperation({
    summary:
      'Book the due period as a real expense and move the due date on. Idempotent per period — pressing it twice cannot book September twice.',
  })
  postTemplate(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.expenses.postTemplate(id, user);
  }

  @Delete('recurring/:id')
  @RequirePermissions(PERMISSIONS.expenses.manage)
  @ApiOperation({ summary: 'Delete an obligation that has never booked anything. Otherwise pause it.' })
  removeTemplate(@Param('id') id: string) {
    return this.expenses.removeTemplate(id);
  }

  /* ─── Claims ────────────────────────────────────────────────────────── */

  @Get()
  @RequirePermissions(PERMISSIONS.expenses.create)
  @ApiOperation({ summary: "The expense book — everyone's, or your own without `expenses.view`" })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'from', required: false, example: '2026-09-01' })
  @ApiQuery({ name: 'to', required: false, example: '2026-09-30' })
  @ApiQuery({ name: 'mine', required: false, description: 'Your own claims only, whatever you may see' })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('category') category?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('mine') mine?: string,
  ) {
    return this.expenses.findAll({ status, category, from, to, mine: mine === 'true' }, user);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.expenses.create)
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.expenses.findOne(id, user);
  }

  @Get(':id/receipt')
  @RequirePermissions(PERMISSIONS.expenses.create)
  @ApiOperation({ summary: "The receipt's bytes — the same file that was uploaded" })
  async receipt(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const { buffer, name, mimeType } = await this.expenses.receipt(id, user);
    res.set({
      'Content-Type': mimeType,
      /* Never interpolate the raw name — see `contentDisposition`. A receipt
         photographed on a phone is named in neither ASCII nor latin1. */
      'Content-Disposition': contentDisposition(name),
    });
    return new StreamableFile(buffer);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.expenses.create)
  @ApiOperation({ summary: 'File an expense. The receipt is required.' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('receipt'))
  create(
    @Body() dto: CreateExpenseDto,
    @UploadedFile() receipt: Express.Multer.File,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.expenses.create(dto, receipt, user);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.expenses.create)
  @ApiOperation({ summary: 'Correct your own claim, while it is still Submitted' })
  update(@Param('id') id: string, @Body() dto: UpdateExpenseDto, @CurrentUser() user: AuthenticatedUser) {
    return this.expenses.update(id, dto, user);
  }

  @Patch(':id/approve')
  @RequirePermissions(PERMISSIONS.expenses.approve)
  approve(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.expenses.approve(id, user);
  }

  @Patch(':id/reject')
  @RequirePermissions(PERMISSIONS.expenses.approve)
  @ApiOperation({ summary: 'Refuse the claim. The reason is required and reaches the claimant.' })
  reject(@Param('id') id: string, @Body() dto: RejectExpenseDto, @CurrentUser() user: AuthenticatedUser) {
    return this.expenses.reject(id, dto, user);
  }

  @Patch(':id/pay')
  @RequirePermissions(PERMISSIONS.expenses.pay)
  @ApiOperation({ summary: 'Record that the money moved — settled, or reimbursed' })
  markPaid(@Param('id') id: string, @Body() dto: PayExpenseDto, @CurrentUser() user: AuthenticatedUser) {
    return this.expenses.markPaid(id, dto, user);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.expenses.create)
  @ApiOperation({ summary: 'Withdraw your own claim, while it is still Submitted' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.expenses.remove(id, user);
  }
}
