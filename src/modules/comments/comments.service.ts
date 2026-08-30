import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { ownCompanyScope } from '../../common/helpers/row-scope.util';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

/**
 * The shipment thread — what people say to each other about a job while it
 * runs, kept beside the job instead of in somebody's WhatsApp.
 *
 * One thread per shipment. A comment may name one of the shipment's bookings,
 * which scopes it to that container without splitting the conversation: the
 * Shipment Overview page reads every row and marks the scoped ones, and the
 * booking sheet reads the same rows filtered down. See `Comment` in the
 * schema for why `shipmentId` is populated either way.
 */

/**
 * What a comment carries to the client.
 *
 * The author is joined live rather than snapshotted (`PayoutHold` does the
 * opposite, and for a good reason there — a hold is a record of an act at a
 * moment). A conversation is read as people, so it shows who they are *now*:
 * the current name, the current avatar, the current desk.
 */
const COMMENT_INCLUDE = {
  author: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      avatarUrl: true,
      role: { select: { name: true } },
    },
  },
  /* The container this is about, for the label the thread prints beside a
     scoped comment. The reference alone is not enough — the whole point of
     the label is that a reader recognises the box, and they know it by its
     container number. */
  booking: { select: { id: true, reference: true, containerNumber: true } },
} as const;

type CommentRow = {
  body: string;
  deletedAt: Date | null;
  [key: string]: unknown;
};

/**
 * A deleted comment keeps its row and its place in the thread — the replies
 * around it still refer to it — but its body is never served again. The
 * client draws the tombstone from `deletedAt`; it is not given the text and
 * told to be discreet about it.
 */
function redactDeleted<T extends CommentRow>(comment: T): T {
  return comment.deletedAt ? { ...comment, body: '' } : comment;
}

@Injectable()
export class CommentsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The shipment, by id *or* reference, and only if this caller may see it.
   *
   * Both halves matter. The frontend routes on the reference (`/shipments/241719`)
   * and so holds that, not the UUID — the same asymmetry the booking cache
   * fights. And the scope is what stops a shipper portal account reading the
   * thread on another company's shipment: comments have no `shipperId` of
   * their own, so the shipment they hang off is the only place that check can
   * happen. It is applied on every read and every write, not just the list.
   */
  private async resolveShipment(shipmentId: string, user: AuthenticatedUser) {
    const scope = ownCompanyScope(user, { shipperField: 'shipperId', partnerField: 'partnerId' });
    const shipment = await this.prisma.shipment.findFirst({
      where: { OR: [{ id: shipmentId }, { reference: shipmentId }], deletedAt: null, ...(scope ?? {}) },
      select: { id: true },
    });
    if (!shipment) throw new NotFoundException(`Shipment with ID "${shipmentId}" not found`);
    return shipment;
  }

  /**
   * The whole thread, oldest first.
   *
   * Ascending, unlike `holds` and every other list in the app, because this
   * one is read as a conversation rather than scanned as a log: you start at
   * the top and arrive at the newest line at the bottom, where the box to add
   * the next one is.
   *
   * `bookingId` filters to one container. It deliberately does *not* also
   * return the shipment-wide comments: the booking sheet asks "what was said
   * about this box", and folding in the general thread would answer a
   * different question in the same list.
   */
  async findForShipment(shipmentId: string, user: AuthenticatedUser, bookingId?: string) {
    const shipment = await this.resolveShipment(shipmentId, user);

    const booking = bookingId ? await this.resolveBooking(bookingId, shipment.id) : null;

    const comments = await this.prisma.comment.findMany({
      where: { shipmentId: shipment.id, ...(booking ? { bookingId: booking.id } : {}) },
      include: COMMENT_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
    return comments.map(redactDeleted);
  }

  /** One booking under this shipment, by id or reference — the same both-forms lookup `resolveShipment` does. */
  private async resolveBooking(bookingId: string, shipmentId: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { OR: [{ id: bookingId }, { reference: bookingId }], shipmentId, deletedAt: null },
      select: { id: true },
    });
    if (!booking) throw new NotFoundException(`Booking with ID "${bookingId}" not found on this shipment`);
    return booking;
  }

  async create(shipmentId: string, dto: CreateCommentDto, user: AuthenticatedUser) {
    const shipment = await this.resolveShipment(shipmentId, user);
    const booking = dto.bookingId ? await this.resolveBooking(dto.bookingId, shipment.id) : null;

    return this.prisma.comment.create({
      data: {
        shipmentId: shipment.id,
        bookingId: booking?.id ?? null,
        /* Already trimmed by the DTO, which does it before `@IsNotEmpty`
           runs — see `create-comment.dto.ts` for why that ordering matters. */
        body: dto.body,
        authorId: user.id,
      },
      include: COMMENT_INCLUDE,
    });
  }

  /**
   * Edit — author only.
   *
   * Not "author, or anyone who can update the shipment". Editing someone
   * else's words under their name and face is not a permission any role
   * should carry, however senior; the escalation is to reply, not to rewrite.
   */
  async update(id: string, dto: UpdateCommentDto, user: AuthenticatedUser) {
    const existing = await this.load(id, user);
    if (existing.deletedAt) throw new NotFoundException(`Comment with ID "${id}" not found`);
    if (existing.authorId !== user.id) throw new ForbiddenException('Only the author can edit a comment');

    return this.prisma.comment.update({
      where: { id },
      data: { body: dto.body, editedAt: new Date() },
      include: COMMENT_INCLUDE,
    });
  }

  /**
   * Delete — author only, and soft.
   *
   * Soft because a thread is a sequence: hard-deleting the line two colleagues
   * then answered turns their replies into non-sequiturs. The row keeps its
   * place and the client draws a tombstone.
   */
  async remove(id: string, user: AuthenticatedUser) {
    const existing = await this.load(id, user);
    if (existing.deletedAt) return redactDeleted(await this.loadWithAuthor(id));
    if (existing.authorId !== user.id) throw new ForbiddenException('Only the author can delete a comment');

    const deleted = await this.prisma.comment.update({
      where: { id },
      data: { deletedAt: new Date() },
      include: COMMENT_INCLUDE,
    });
    return redactDeleted(deleted);
  }

  /**
   * A comment the caller is allowed to touch at all.
   *
   * The scope check runs against the shipment above it for the same reason it
   * does on the list: a comment id is a bare UUID with no company on it, so
   * without this a portal account could edit-probe its way across the book.
   */
  private async load(id: string, user: AuthenticatedUser) {
    const comment = await this.prisma.comment.findUnique({
      where: { id },
      select: { id: true, authorId: true, deletedAt: true, shipmentId: true },
    });
    if (!comment) throw new NotFoundException(`Comment with ID "${id}" not found`);
    await this.resolveShipment(comment.shipmentId, user);
    return comment;
  }

  private async loadWithAuthor(id: string) {
    return this.prisma.comment.findUniqueOrThrow({ where: { id }, include: COMMENT_INCLUDE });
  }
}
