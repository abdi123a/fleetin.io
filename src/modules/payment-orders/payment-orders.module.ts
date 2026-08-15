import { Module } from '@nestjs/common';
import { PaymentOrdersController } from './payment-orders.controller';
import { PaymentOrdersService } from './payment-orders.service';
import { LedgerModule } from '../ledger/ledger.module';
import { HoldsModule } from '../holds/holds.module';
import { FundingModule } from '../funding/funding.module';

@Module({
  imports: [LedgerModule, HoldsModule, FundingModule],
  controllers: [PaymentOrdersController],
  providers: [PaymentOrdersService],
  exports: [PaymentOrdersService],
})
export class PaymentOrdersModule {}
