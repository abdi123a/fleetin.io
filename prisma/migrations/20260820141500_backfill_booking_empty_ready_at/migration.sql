-- The empty-return pool now starts at the new "Empty Ready" rung, which reads
-- `bookings.emptyReadyAt`. Every container delivered before that rung existed
-- has a NULL there and would silently drop out of matching, so give each one
-- the instant it already implies.

-- 1. A matched box already carries the moment on its cycle. One fact, one value.
UPDATE `bookings` b
JOIN `empty_return_cycles` c ON c.`bookingId` = b.`id`
SET b.`emptyReadyAt` = c.`emptyReadyAt`
WHERE b.`emptyReadyAt` IS NULL AND c.`emptyReadyAt` IS NOT NULL;

-- 2. Otherwise, only a *closed* booking gets a stand-in: it is closed because
--    its box is already back, so the empty was ready at some point and the
--    delivery is the closest honest instant. A booking still running is left
--    NULL on purpose — it reads "not emptied yet" and waits for somebody to
--    say when, which is the whole point of the rung.
UPDATE `bookings` b
JOIN (
  SELECT `bookingId`, MAX(`timestamp`) AS ts
  FROM `booking_timeline_steps`
  WHERE `key` IN ('pod_upload', 'completion')
  GROUP BY `bookingId`
) t ON t.`bookingId` = b.`id`
SET b.`emptyReadyAt` = t.ts
WHERE b.`emptyReadyAt` IS NULL
  AND b.`containerNumber` IS NOT NULL
  AND b.`status` = 'Completed';

-- 3. Last resort for a delivered box with no usable timeline row.
UPDATE `bookings` b
SET b.`emptyReadyAt` = COALESCE(b.`completedAt`, b.`updatedAt`)
WHERE b.`emptyReadyAt` IS NULL
  AND b.`containerNumber` IS NOT NULL
  AND b.`status` = 'Completed';
