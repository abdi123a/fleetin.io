-- CreateTable
CREATE TABLE `hr_employees` (
    `id` VARCHAR(191) NOT NULL,
    `matricule` VARCHAR(32) NOT NULL,
    `fullName` VARCHAR(255) NOT NULL,
    `gender` ENUM('M', 'F') NOT NULL,
    `nationality` VARCHAR(120) NOT NULL,
    `cnssNumber` VARCHAR(64) NULL,
    `nifNumber` VARCHAR(64) NULL,
    `profession` VARCHAR(160) NOT NULL,
    `department` VARCHAR(120) NULL,
    `contractType` ENUM('CDI', 'CDD', 'APPRENTISSAGE', 'STAGE') NOT NULL,
    `joiningDate` DATETIME(3) NOT NULL,
    `contractEndDate` DATETIME(3) NULL,
    `trialPeriodEnd` DATETIME(3) NULL,
    `baseSalary` DECIMAL(14, 4) NOT NULL,
    `bankAccount` VARCHAR(512) NULL,
    `email` VARCHAR(255) NULL,
    `phone` VARCHAR(64) NULL,
    `status` ENUM('ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'TERMINATED') NOT NULL DEFAULT 'ACTIVE',
    `terminationDate` DATETIME(3) NULL,
    `userId` VARCHAR(191) NULL,
    `managerId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `hr_employees_matricule_key`(`matricule`),
    UNIQUE INDEX `hr_employees_userId_key`(`userId`),
    INDEX `hr_employees_status_idx`(`status`),
    INDEX `hr_employees_managerId_idx`(`managerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_employee_documents` (
    `id` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `category` ENUM('CV', 'ID_CARD', 'PASSPORT', 'CONTRACT', 'DIPLOMA', 'MEDICAL_CERT', 'DRIVING_LICENCE', 'CNSS_CARD', 'WARNING_LETTER', 'GENERATED_DOCUMENT', 'OTHER') NOT NULL,
    `fileKey` VARCHAR(512) NOT NULL,
    `originalName` VARCHAR(255) NOT NULL,
    `mimeType` VARCHAR(120) NOT NULL,
    `sizeBytes` INTEGER NOT NULL,
    `issueDate` DATETIME(3) NULL,
    `expiryDate` DATETIME(3) NULL,
    `notes` TEXT NULL,
    `uploadedById` VARCHAR(191) NOT NULL,
    `uploadedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deletedAt` DATETIME(3) NULL,

    INDEX `hr_employee_documents_employeeId_idx`(`employeeId`),
    INDEX `hr_employee_documents_expiryDate_idx`(`expiryDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_payroll_configs` (
    `id` VARCHAR(191) NOT NULL,
    `effectiveFrom` DATETIME(3) NOT NULL,
    `effectiveTo` DATETIME(3) NULL,
    `label` VARCHAR(160) NOT NULL,
    `contributionCeiling` DECIMAL(14, 4) NOT NULL,
    `retirementEmployeeRate` DECIMAL(9, 6) NOT NULL,
    `amuEmployeeRate` DECIMAL(9, 6) NOT NULL,
    `amuCeilingAmount` DECIMAL(14, 4) NOT NULL,
    `employerRate` DECIMAL(9, 6) NOT NULL,
    `employerCappedPortion` DECIMAL(9, 6) NOT NULL,
    `monthlyHours` DECIMAL(9, 4) NOT NULL,
    `overtimeTier1Rate` DECIMAL(9, 4) NOT NULL,
    `overtimeTier1MaxHours` DECIMAL(9, 4) NOT NULL,
    `overtimeTier2Rate` DECIMAL(9, 4) NOT NULL,
    `severanceRatePerYear` DECIMAL(9, 6) NOT NULL,
    `severanceCnssRate` DECIMAL(9, 6) NOT NULL,
    `annualLeaveDays` DECIMAL(9, 4) NOT NULL,
    `seniorityIncludedInGross` BOOLEAN NOT NULL DEFAULT false,
    `capRetirementEmployee` BOOLEAN NOT NULL DEFAULT false,
    `leaveCarryOverCapDays` DECIMAL(9, 4) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `hr_payroll_configs_effectiveFrom_idx`(`effectiveFrom`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_its_brackets` (
    `id` VARCHAR(191) NOT NULL,
    `configId` VARCHAR(191) NOT NULL,
    `lowerBound` DECIMAL(14, 4) NOT NULL,
    `upperBound` DECIMAL(14, 4) NOT NULL,
    `taxAmount` DECIMAL(14, 4) NOT NULL,

    INDEX `hr_its_brackets_configId_lowerBound_upperBound_idx`(`configId`, `lowerBound`, `upperBound`),
    UNIQUE INDEX `hr_its_brackets_configId_lowerBound_key`(`configId`, `lowerBound`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_seniority_bands` (
    `id` VARCHAR(191) NOT NULL,
    `configId` VARCHAR(191) NOT NULL,
    `minDays` INTEGER NOT NULL,
    `rate` DECIMAL(9, 6) NOT NULL,

    UNIQUE INDEX `hr_seniority_bands_configId_minDays_key`(`configId`, `minDays`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_payroll_periods` (
    `id` VARCHAR(191) NOT NULL,
    `month` INTEGER NOT NULL,
    `year` INTEGER NOT NULL,
    `status` ENUM('DRAFT', 'CALCULATED', 'APPROVED', 'PAID') NOT NULL DEFAULT 'DRAFT',
    `configId` VARCHAR(191) NOT NULL,
    `calculatedAt` DATETIME(3) NULL,
    `approvedById` VARCHAR(191) NULL,
    `approvedAt` DATETIME(3) NULL,
    `paidAt` DATETIME(3) NULL,
    `note` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `hr_payroll_periods_status_idx`(`status`),
    UNIQUE INDEX `hr_payroll_periods_month_year_key`(`month`, `year`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_payroll_lines` (
    `id` VARCHAR(191) NOT NULL,
    `periodId` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `employeeName` VARCHAR(255) NOT NULL,
    `matricule` VARCHAR(32) NOT NULL,
    `profession` VARCHAR(160) NOT NULL,
    `nationality` VARCHAR(120) NOT NULL,
    `cnssNumber` VARCHAR(64) NULL,
    `bankAccount` VARCHAR(512) NULL,
    `joiningDate` DATETIME(3) NOT NULL,
    `baseSalary` DECIMAL(14, 4) NOT NULL,
    `absenceDeduction` DECIMAL(14, 4) NOT NULL DEFAULT 0,
    `overtimeHours` DECIMAL(9, 4) NOT NULL DEFAULT 0,
    `overtimeAmount` DECIMAL(14, 4) NOT NULL DEFAULT 0,
    `currentGross` DECIMAL(14, 4) NOT NULL,
    `seniorityRate` DECIMAL(9, 6) NOT NULL,
    `seniorityAmount` DECIMAL(14, 4) NOT NULL,
    `cappedSalary` DECIMAL(14, 4) NOT NULL,
    `retirementEmployee` DECIMAL(14, 4) NOT NULL,
    `amuEmployee` DECIMAL(14, 4) NOT NULL,
    `employerContribution` DECIMAL(14, 4) NOT NULL,
    `totalCnss` DECIMAL(14, 4) NOT NULL,
    `taxableWages` DECIMAL(14, 4) NOT NULL,
    `its` DECIMAL(14, 4) NOT NULL,
    `netSalary` DECIMAL(14, 4) NOT NULL,
    `configId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `hr_payroll_lines_employeeId_idx`(`employeeId`),
    UNIQUE INDEX `hr_payroll_lines_periodId_employeeId_key`(`periodId`, `employeeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_overtime_entries` (
    `id` VARCHAR(191) NOT NULL,
    `periodId` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `hours125` DECIMAL(9, 4) NOT NULL DEFAULT 0,
    `hours150` DECIMAL(9, 4) NOT NULL DEFAULT 0,
    `hourlyRate` DECIMAL(14, 4) NOT NULL,
    `amount125` DECIMAL(14, 4) NOT NULL DEFAULT 0,
    `amount150` DECIMAL(14, 4) NOT NULL DEFAULT 0,
    `totalAmount` DECIMAL(14, 4) NOT NULL DEFAULT 0,
    `absenceDeduction` DECIMAL(14, 4) NOT NULL DEFAULT 0,
    `note` TEXT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `hr_overtime_entries_periodId_employeeId_key`(`periodId`, `employeeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_leave_records` (
    `id` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `type` ENUM('ANNUAL', 'SICK', 'UNPAID', 'MATERNITY', 'OTHER') NOT NULL DEFAULT 'ANNUAL',
    `status` ENUM('REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'REQUESTED',
    `startDate` DATETIME(3) NOT NULL,
    `endDate` DATETIME(3) NOT NULL,
    `days` DECIMAL(9, 4) NOT NULL,
    `reason` TEXT NULL,
    `requestedById` VARCHAR(191) NULL,
    `decidedById` VARCHAR(191) NULL,
    `decidedAt` DATETIME(3) NULL,
    `decisionNote` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `hr_leave_records_employeeId_startDate_idx`(`employeeId`, `startDate`),
    INDEX `hr_leave_records_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_document_templates` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(64) NOT NULL,
    `label` VARCHAR(160) NOT NULL,
    `scope` ENUM('EMPLOYEE', 'PERIOD') NOT NULL,
    `refPrefix` VARCHAR(16) NOT NULL,
    `bodyFr` TEXT NOT NULL,
    `requiresFields` JSON NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `hr_document_templates_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_document_sequences` (
    `templateKey` VARCHAR(64) NOT NULL,
    `year` INTEGER NOT NULL,
    `lastSeq` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`templateKey`, `year`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_issued_documents` (
    `id` VARCHAR(191) NOT NULL,
    `templateKey` VARCHAR(64) NOT NULL,
    `employeeId` VARCHAR(191) NULL,
    `periodId` VARCHAR(191) NULL,
    `referenceNo` VARCHAR(64) NOT NULL,
    `issueDate` DATETIME(3) NOT NULL,
    `payloadJson` JSON NOT NULL,
    `fileKey` VARCHAR(512) NOT NULL,
    `employeeDocumentId` VARCHAR(191) NULL,
    `issuedById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `hr_issued_documents_referenceNo_key`(`referenceNo`),
    INDEX `hr_issued_documents_employeeId_idx`(`employeeId`),
    INDEX `hr_issued_documents_periodId_idx`(`periodId`),
    INDEX `hr_issued_documents_templateKey_idx`(`templateKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_company_settings` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `legalName` VARCHAR(200) NOT NULL,
    `department` VARCHAR(200) NOT NULL DEFAULT 'Département des Ressources Humaines',
    `address` VARCHAR(255) NOT NULL,
    `phone` VARCHAR(64) NOT NULL,
    `email` VARCHAR(160) NOT NULL,
    `cnssId` VARCHAR(64) NOT NULL,
    `nif` VARCHAR(64) NOT NULL,
    `bankName` VARCHAR(160) NOT NULL,
    `bankAccountName` VARCHAR(200) NOT NULL,
    `bankAccountNo` VARCHAR(64) NOT NULL,
    `signatoryPrepared` JSON NOT NULL,
    `signatoryChecked` JSON NOT NULL,
    `signatoryApproved` JSON NOT NULL,
    `referencePattern` VARCHAR(64) NOT NULL DEFAULT 'Fl/{prefix}-{seq}/{yy}',
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_audit_logs` (
    `id` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(64) NOT NULL,
    `actorName` VARCHAR(255) NULL,
    `entity` VARCHAR(64) NOT NULL,
    `entityId` VARCHAR(64) NOT NULL,
    `action` VARCHAR(32) NOT NULL,
    `detail` JSON NULL,
    `ipAddress` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `hr_audit_logs_entity_entityId_idx`(`entity`, `entityId`),
    INDEX `hr_audit_logs_actorId_idx`(`actorId`),
    INDEX `hr_audit_logs_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `hr_employees` ADD CONSTRAINT `hr_employees_managerId_fkey` FOREIGN KEY (`managerId`) REFERENCES `hr_employees`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hr_employee_documents` ADD CONSTRAINT `hr_employee_documents_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `hr_employees`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hr_its_brackets` ADD CONSTRAINT `hr_its_brackets_configId_fkey` FOREIGN KEY (`configId`) REFERENCES `hr_payroll_configs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hr_seniority_bands` ADD CONSTRAINT `hr_seniority_bands_configId_fkey` FOREIGN KEY (`configId`) REFERENCES `hr_payroll_configs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hr_payroll_periods` ADD CONSTRAINT `hr_payroll_periods_configId_fkey` FOREIGN KEY (`configId`) REFERENCES `hr_payroll_configs`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hr_payroll_lines` ADD CONSTRAINT `hr_payroll_lines_periodId_fkey` FOREIGN KEY (`periodId`) REFERENCES `hr_payroll_periods`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hr_payroll_lines` ADD CONSTRAINT `hr_payroll_lines_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `hr_employees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hr_overtime_entries` ADD CONSTRAINT `hr_overtime_entries_periodId_fkey` FOREIGN KEY (`periodId`) REFERENCES `hr_payroll_periods`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hr_overtime_entries` ADD CONSTRAINT `hr_overtime_entries_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `hr_employees`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hr_leave_records` ADD CONSTRAINT `hr_leave_records_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `hr_employees`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hr_issued_documents` ADD CONSTRAINT `hr_issued_documents_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `hr_employees`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hr_issued_documents` ADD CONSTRAINT `hr_issued_documents_periodId_fkey` FOREIGN KEY (`periodId`) REFERENCES `hr_payroll_periods`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
