import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateTaskDto } from './create-task.dto';

/**
 * Every field optional. `links` is deliberately dropped: replacing the whole
 * set is its own endpoint (`PUT .../links`), the same shape
 * `PUT /shipments/:id/assignees` already uses, so a partial task edit can
 * never silently clear a task's links by omitting them.
 */
export class UpdateTaskDto extends PartialType(OmitType(CreateTaskDto, ['links'] as const)) {}
