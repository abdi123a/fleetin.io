import { PartialType } from '@nestjs/swagger';
import { CreateBankAccountDto } from './create-bank-account.dto';

/**
 * Every registration field is editable — a bank renames itself, an IBAN was
 * mistyped, the primary account moves. Balances are NOT here on purpose:
 * `currentBalance` only ever moves through a real movement
 * (`deposit`/`withdraw`/`transfer`) or `adjustBalance()`, never by editing.
 */
export class UpdateBankAccountDto extends PartialType(CreateBankAccountDto) {}
