import { Module } from '@nestjs/common';
import { BankAccountsController } from './bank-accounts.controller';
import { BankAccountsService } from './bank-accounts.service';

/**
 * What survived the working-capital cull.
 *
 * The credit facilities, drawdowns and the ledger they fed were removed with
 * the rest of that module; bank accounts stayed because they answer a question
 * the simple billing model still asks every time it prints a document: where
 * does the client send the money. See `documentChrome.useRemittanceAccount`.
 */
@Module({
  controllers: [BankAccountsController],
  providers: [BankAccountsService],
  exports: [BankAccountsService],
})
export class BankAccountsModule {}
