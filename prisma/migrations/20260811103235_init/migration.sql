-- CreateTable
CREATE TABLE `roles` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `permissions` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `roles_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `firstName` VARCHAR(191) NOT NULL,
    `lastName` VARCHAR(191) NOT NULL,
    `phoneNumber` VARCHAR(191) NULL,
    `avatarUrl` VARCHAR(191) NULL,
    `status` ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION') NOT NULL DEFAULT 'ACTIVE',
    `roleId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    INDEX `users_roleId_idx`(`roleId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `refresh_tokens` (
    `id` VARCHAR(191) NOT NULL,
    `token` VARCHAR(500) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `isRevoked` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `refresh_tokens_token_key`(`token`),
    INDEX `refresh_tokens_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ledger_entries` (
    `id` VARCHAR(191) NOT NULL,
    `entryDate` DATETIME(3) NOT NULL,
    `postedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `type` VARCHAR(32) NOT NULL,
    `direction` VARCHAR(4) NOT NULL,
    `amountMinorUnits` BIGINT NOT NULL,
    `scale` INTEGER NOT NULL DEFAULT 0,
    `currency` VARCHAR(8) NOT NULL,
    `fxRate` DOUBLE NOT NULL DEFAULT 1.0,
    `baseAmountMinorUnits` BIGINT NOT NULL,
    `counterpartyType` VARCHAR(16) NOT NULL,
    `counterpartyId` VARCHAR(191) NOT NULL,
    `counterpartyName` VARCHAR(255) NOT NULL,
    `bankAccountId` VARCHAR(191) NULL,
    `sourceType` VARCHAR(32) NOT NULL,
    `sourceId` VARCHAR(191) NOT NULL,
    `missionId` VARCHAR(191) NULL,
    `description` TEXT NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdByName` VARCHAR(255) NOT NULL,
    `reversedByEntryId` VARCHAR(191) NULL,

    INDEX `ledger_entries_missionId_idx`(`missionId`),
    INDEX `ledger_entries_counterpartyId_counterpartyType_idx`(`counterpartyId`, `counterpartyType`),
    INDEX `ledger_entries_entryDate_idx`(`entryDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bank_accounts` (
    `id` VARCHAR(191) NOT NULL,
    `bankName` VARCHAR(255) NOT NULL,
    `accountHolder` VARCHAR(255) NOT NULL,
    `accountNumber` VARCHAR(64) NOT NULL,
    `iban` VARCHAR(64) NULL,
    `swiftCode` VARCHAR(32) NULL,
    `currency` VARCHAR(8) NOT NULL,
    `openingBalance` BIGINT NOT NULL DEFAULT 0,
    `currentBalance` BIGINT NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `isPrimary` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bank_statement_lines` (
    `id` VARCHAR(191) NOT NULL,
    `bankAccountId` VARCHAR(191) NOT NULL,
    `statementDate` DATETIME(3) NOT NULL,
    `description` TEXT NOT NULL,
    `amountMinorUnits` BIGINT NOT NULL,
    `direction` VARCHAR(4) NOT NULL,
    `reference` VARCHAR(128) NULL,
    `matchedPaymentId` VARCHAR(191) NULL,
    `matchStatus` VARCHAR(16) NOT NULL DEFAULT 'UNMATCHED',
    `importedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `bank_statement_lines_bankAccountId_idx`(`bankAccountId`),
    INDEX `bank_statement_lines_reference_idx`(`reference`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `invoice_counters` (
    `series` VARCHAR(8) NOT NULL,
    `year` INTEGER NOT NULL,
    `last` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`series`, `year`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `invoices` (
    `id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(32) NOT NULL,
    `shipperId` VARCHAR(191) NOT NULL,
    `shipperName` VARCHAR(255) NOT NULL,
    `shipperCompany` VARCHAR(255) NOT NULL,
    `missionIds` JSON NOT NULL,
    `description` TEXT NOT NULL,
    `subtotalMinorUnits` BIGINT NOT NULL,
    `taxMinorUnits` BIGINT NOT NULL DEFAULT 0,
    `totalMinorUnits` BIGINT NOT NULL,
    `currency` VARCHAR(8) NOT NULL,
    `fxRate` DOUBLE NOT NULL DEFAULT 1.0,
    `baseAmountMinorUnits` BIGINT NOT NULL,
    `contractDeadline` DATETIME(3) NOT NULL,
    `issueDate` DATETIME(3) NOT NULL,
    `sentAt` DATETIME(3) NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'Draft',
    `allocatedMinorUnits` BIGINT NOT NULL DEFAULT 0,
    `remainingMinorUnits` BIGINT NOT NULL,
    `notes` TEXT NULL,
    `disputeReason` TEXT NULL,
    `writeOffReason` TEXT NULL,
    `writtenOffAt` DATETIME(3) NULL,
    `writtenOffById` VARCHAR(191) NULL,
    `issuedById` VARCHAR(191) NOT NULL,
    `issuedByName` VARCHAR(255) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `invoices_number_key`(`number`),
    INDEX `invoices_shipperId_idx`(`shipperId`),
    INDEX `invoices_status_idx`(`status`),
    INDEX `invoices_contractDeadline_idx`(`contractDeadline`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `credit_notes` (
    `id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(32) NOT NULL,
    `originalInvoiceId` VARCHAR(191) NOT NULL,
    `reason` TEXT NOT NULL,
    `amountMinorUnits` BIGINT NOT NULL,
    `currency` VARCHAR(8) NOT NULL,
    `issueDate` DATETIME(3) NOT NULL,
    `issuedById` VARCHAR(191) NOT NULL,
    `issuedByName` VARCHAR(255) NOT NULL,
    `approvedById` VARCHAR(191) NULL,
    `approvedByName` VARCHAR(255) NULL,
    `approvedAt` DATETIME(3) NULL,

    UNIQUE INDEX `credit_notes_number_key`(`number`),
    INDEX `credit_notes_originalInvoiceId_idx`(`originalInvoiceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payment_orders` (
    `id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(32) NOT NULL,
    `transporterId` VARCHAR(191) NOT NULL,
    `transporterName` VARCHAR(255) NOT NULL,
    `transporterCompany` VARCHAR(255) NOT NULL,
    `missionId` VARCHAR(191) NOT NULL,
    `driverName` VARCHAR(255) NULL,
    `assignedTruckPlate` VARCHAR(64) NULL,
    `route` VARCHAR(255) NOT NULL,
    `amountMinorUnits` BIGINT NOT NULL,
    `currency` VARCHAR(8) NOT NULL,
    `fxRate` DOUBLE NOT NULL DEFAULT 1.0,
    `baseAmountMinorUnits` BIGINT NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'Pending',
    `createdById` VARCHAR(191) NOT NULL,
    `createdByName` VARCHAR(255) NOT NULL,
    `approvedById` VARCHAR(191) NULL,
    `approvedByName` VARCHAR(255) NULL,
    `approvedAt` DATETIME(3) NULL,
    `paidAt` DATETIME(3) NULL,
    `drawdownId` VARCHAR(191) NULL,
    `paymentMethod` VARCHAR(32) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `payment_orders_number_key`(`number`),
    INDEX `payment_orders_transporterId_idx`(`transporterId`),
    INDEX `payment_orders_missionId_idx`(`missionId`),
    INDEX `payment_orders_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payments` (
    `id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(32) NOT NULL,
    `direction` VARCHAR(4) NOT NULL,
    `counterpartyType` VARCHAR(16) NOT NULL,
    `counterpartyId` VARCHAR(191) NOT NULL,
    `counterpartyName` VARCHAR(255) NOT NULL,
    `amountMinorUnits` BIGINT NOT NULL,
    `currency` VARCHAR(8) NOT NULL,
    `fxRate` DOUBLE NOT NULL DEFAULT 1.0,
    `baseAmountMinorUnits` BIGINT NOT NULL,
    `unallocatedMinorUnits` BIGINT NOT NULL DEFAULT 0,
    `paidAt` DATETIME(3) NOT NULL,
    `method` VARCHAR(32) NOT NULL,
    `bankAccountId` VARCHAR(191) NULL,
    `reference` VARCHAR(128) NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdByName` VARCHAR(255) NOT NULL,
    `approvedById` VARCHAR(191) NULL,
    `approvedByName` VARCHAR(255) NULL,
    `approvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `payments_number_key`(`number`),
    INDEX `payments_bankAccountId_idx`(`bankAccountId`),
    INDEX `payments_counterpartyId_idx`(`counterpartyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payment_allocations` (
    `id` VARCHAR(191) NOT NULL,
    `paymentId` VARCHAR(191) NOT NULL,
    `targetType` VARCHAR(16) NOT NULL,
    `targetId` VARCHAR(191) NOT NULL,
    `amountMinorUnits` BIGINT NOT NULL,
    `allocatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `invoiceId` VARCHAR(191) NULL,
    `paymentOrderId` VARCHAR(191) NULL,
    `drawdownId` VARCHAR(191) NULL,

    INDEX `payment_allocations_paymentId_idx`(`paymentId`),
    INDEX `payment_allocations_invoiceId_idx`(`invoiceId`),
    INDEX `payment_allocations_paymentOrderId_idx`(`paymentOrderId`),
    INDEX `payment_allocations_drawdownId_idx`(`drawdownId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `credit_facilities` (
    `id` VARCHAR(191) NOT NULL,
    `bankName` VARCHAR(255) NOT NULL,
    `facilityNumber` VARCHAR(64) NOT NULL,
    `limitMinorUnits` BIGINT NOT NULL,
    `currency` VARCHAR(8) NOT NULL,
    `startDate` DATETIME(3) NOT NULL,
    `endDate` DATETIME(3) NULL,
    `isRevolving` BOOLEAN NOT NULL DEFAULT true,
    `feeDescription` TEXT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    `bankAccountId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `credit_facilities_facilityNumber_key`(`facilityNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `drawdowns` (
    `id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(32) NOT NULL,
    `facilityId` VARCHAR(191) NOT NULL,
    `amountMinorUnits` BIGINT NOT NULL,
    `currency` VARCHAR(8) NOT NULL,
    `feesMinorUnits` BIGINT NOT NULL DEFAULT 0,
    `disbursedAt` DATETIME(3) NOT NULL,
    `dueAt` DATETIME(3) NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'Active',
    `exposureStatus` VARCHAR(16) NOT NULL DEFAULT 'COVERED',
    `exposureReason` TEXT NULL,
    `repaidMinorUnits` BIGINT NOT NULL DEFAULT 0,
    `bankAccountId` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdByName` VARCHAR(255) NOT NULL,
    `approvedById` VARCHAR(191) NULL,
    `approvedByName` VARCHAR(255) NULL,
    `approvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `drawdowns_number_key`(`number`),
    INDEX `drawdowns_facilityId_idx`(`facilityId`),
    INDEX `drawdowns_status_idx`(`status`),
    INDEX `drawdowns_exposureStatus_idx`(`exposureStatus`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `expense_entries` (
    `id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(32) NOT NULL,
    `category` VARCHAR(32) NOT NULL,
    `description` TEXT NOT NULL,
    `amountMinorUnits` BIGINT NOT NULL,
    `currency` VARCHAR(8) NOT NULL,
    `fxRate` DOUBLE NOT NULL DEFAULT 1.0,
    `baseAmountMinorUnits` BIGINT NOT NULL,
    `incurredAt` DATETIME(3) NOT NULL,
    `paidById` VARCHAR(191) NOT NULL,
    `paidByName` VARCHAR(255) NOT NULL,
    `method` VARCHAR(32) NOT NULL,
    `receiptUrl` TEXT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'Pending',
    `isRecurring` BOOLEAN NOT NULL DEFAULT false,
    `recurringTemplateId` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdByName` VARCHAR(255) NOT NULL,
    `approvedById` VARCHAR(191) NULL,
    `approvedByName` VARCHAR(255) NULL,
    `approvedAt` DATETIME(3) NULL,
    `paidAt` DATETIME(3) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `expense_entries_number_key`(`number`),
    INDEX `expense_entries_category_idx`(`category`),
    INDEX `expense_entries_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `recurring_expense_templates` (
    `id` VARCHAR(191) NOT NULL,
    `category` VARCHAR(32) NOT NULL,
    `description` TEXT NOT NULL,
    `amountMinorUnits` BIGINT NOT NULL,
    `currency` VARCHAR(8) NOT NULL,
    `frequency` VARCHAR(16) NOT NULL,
    `nextDueAt` DATETIME(3) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `vendorOrPayee` VARCHAR(255) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `roles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `refresh_tokens` ADD CONSTRAINT `refresh_tokens_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bank_statement_lines` ADD CONSTRAINT `bank_statement_lines_bankAccountId_fkey` FOREIGN KEY (`bankAccountId`) REFERENCES `bank_accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `credit_notes` ADD CONSTRAINT `credit_notes_originalInvoiceId_fkey` FOREIGN KEY (`originalInvoiceId`) REFERENCES `invoices`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payment_orders` ADD CONSTRAINT `payment_orders_drawdownId_fkey` FOREIGN KEY (`drawdownId`) REFERENCES `drawdowns`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_bankAccountId_fkey` FOREIGN KEY (`bankAccountId`) REFERENCES `bank_accounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payment_allocations` ADD CONSTRAINT `payment_allocations_paymentId_fkey` FOREIGN KEY (`paymentId`) REFERENCES `payments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payment_allocations` ADD CONSTRAINT `payment_allocations_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `invoices`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payment_allocations` ADD CONSTRAINT `payment_allocations_paymentOrderId_fkey` FOREIGN KEY (`paymentOrderId`) REFERENCES `payment_orders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payment_allocations` ADD CONSTRAINT `payment_allocations_drawdownId_fkey` FOREIGN KEY (`drawdownId`) REFERENCES `drawdowns`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `credit_facilities` ADD CONSTRAINT `credit_facilities_bankAccountId_fkey` FOREIGN KEY (`bankAccountId`) REFERENCES `bank_accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `drawdowns` ADD CONSTRAINT `drawdowns_facilityId_fkey` FOREIGN KEY (`facilityId`) REFERENCES `credit_facilities`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `drawdowns` ADD CONSTRAINT `drawdowns_bankAccountId_fkey` FOREIGN KEY (`bankAccountId`) REFERENCES `bank_accounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `expense_entries` ADD CONSTRAINT `expense_entries_recurringTemplateId_fkey` FOREIGN KEY (`recurringTemplateId`) REFERENCES `recurring_expense_templates`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
