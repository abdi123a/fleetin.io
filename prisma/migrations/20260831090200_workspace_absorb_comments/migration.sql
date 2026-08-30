-- Move the `comments` rows into `workspace_messages`.
--
-- The comments module was built and its frontend withdrawn the same day
-- (2026-08-30). Its rows are real and the standing rule is not to destroy
-- them, so they are copied rather than dropped, and the `comments` table is
-- left in place afterwards — an idle table costs nothing and a DROP cannot be
-- undone.
--
-- Anchoring: a comment naming a booking becomes a BOOKING-anchored message,
-- everything else a SHIPMENT-anchored one. Never a task anchor — these
-- predate tasks, and inventing a task to hang them on would fabricate work
-- nobody raised.
--
-- Idempotent: `id` is carried across, so the INSERT IGNORE is a no-op on a
-- second run.

INSERT IGNORE INTO `workspace_messages`
  (`id`, `taskId`, `recordType`, `recordId`, `recordRef`, `body`, `authorId`,
   `parentMessageId`, `createdAt`, `updatedAt`, `editedAt`, `deletedAt`)
SELECT
  c.`id`,
  NULL,
  IF(c.`bookingId` IS NULL, 'SHIPMENT', 'BOOKING'),
  IF(c.`bookingId` IS NULL, c.`shipmentId`, c.`bookingId`),
  IF(c.`bookingId` IS NULL, s.`reference`, b.`reference`),
  c.`body`,
  c.`authorId`,
  NULL,
  c.`createdAt`,
  c.`updatedAt`,
  c.`editedAt`,
  c.`deletedAt`
FROM `comments` c
JOIN `shipments` s ON s.`id` = c.`shipmentId`
LEFT JOIN `bookings` b ON b.`id` = c.`bookingId`;
