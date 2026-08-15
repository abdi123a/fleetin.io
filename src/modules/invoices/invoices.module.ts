import { Module } from '@nestjs/common';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { LedgerModule } from '../ledger/ledger.module';
import { FundingModule } from '../funding/funding.module';

@Module({
  imports: [LedgerModule, FundingModule],
  controllers: [InvoicesController],
  providers: [InvoicesService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
