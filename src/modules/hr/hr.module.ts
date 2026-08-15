import { Module } from '@nestjs/common';
import { HrAuditService } from './hr-audit.service';
import { EmployeesController } from './employees/employees.controller';
import { EmployeesService } from './employees/employees.service';
import { PayrollController } from './payroll/payroll.controller';
import { PayrollService } from './payroll/payroll.service';
import { PayrollConfigService } from './payroll/payroll-config.service';
import { LeaveController } from './leave/leave.controller';
import { LeaveService } from './leave/leave.service';
import { GenerationController } from './documents/generation.controller';
import { GenerationService } from './documents/generation.service';
import { PayloadBuilder } from './documents/payload.builder';
import { DocumentRenderer } from './documents/document.renderer';
import { PdfService } from './documents/pdf.service';
import { XlsxService } from './documents/xlsx.service';
import { CompanySettingsController } from './settings/company-settings.controller';
import { CompanySettingsService } from './settings/company-settings.service';
import { HrDashboardController } from './hr-dashboard.controller';
import { HrDashboardService } from './hr-dashboard.service';

/**
 * HR & Payroll.
 *
 * Replaces the Excel workbook that ran payroll for the Djibouti entity. The
 * calculation engine (`payroll/payroll.engine.ts`) is a pure function with no
 * dependency on anything in this module — that is what lets §2.6 of the spec
 * be asserted to the franc without a database.
 */
@Module({
  controllers: [
    EmployeesController,
    PayrollController,
    LeaveController,
    GenerationController,
    CompanySettingsController,
    HrDashboardController,
  ],
  providers: [
    HrAuditService,
    EmployeesService,
    PayrollService,
    PayrollConfigService,
    LeaveService,
    GenerationService,
    PayloadBuilder,
    DocumentRenderer,
    PdfService,
    XlsxService,
    CompanySettingsService,
    HrDashboardService,
  ],
  exports: [PayrollService, PayrollConfigService, EmployeesService],
})
export class HrModule {}
