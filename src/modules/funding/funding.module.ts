import { Module } from '@nestjs/common';
import { BankAccountsController } from './bank-accounts.controller';
import { BankAccountsService } from './bank-accounts.service';
import { CreditFacilitiesController } from './credit-facilities.controller';
import { CreditFacilitiesService } from './credit-facilities.service';
import { DrawdownsController } from './drawdowns.controller';
import { DrawdownsService } from './drawdowns.service';
import { LedgerModule } from '../ledger/ledger.module';

@Module({
  imports: [LedgerModule],
  controllers: [BankAccountsController, CreditFacilitiesController, DrawdownsController],
  providers: [BankAccountsService, CreditFacilitiesService, DrawdownsService],
  exports: [BankAccountsService, CreditFacilitiesService, DrawdownsService],
})
export class FundingModule {}
