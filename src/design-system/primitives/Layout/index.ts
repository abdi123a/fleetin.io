/**
 * Phase 2.4 — Layout Primitives
 *
 * Structural building blocks for every FLEETIN module page.
 * All future modules should import from here — never create their own card,
 * page header, empty state, or grid system.
 */

export {
  Card,
  CardActions,
  CardContent,
  CardDescription,
  CardField,
  CardFooter,
  CardHeader,
  CardRow,
  CardTitle,
  type CardActionsProps,
  type CardFieldProps,
  type CardFooterProps,
  type CardHeaderProps,
  type CardProps,
  type CardRowProps,
} from './Card';

export {
  CardDataField,
  type CardDataFieldProps,
  type CardDataFieldTheme,
} from './CardDataField';



export {
  StatisticCard,
  StatisticCardSkeleton,
  type StatisticCardProps,
  type StatisticCardSkeletonProps,
  type StatisticStatus,
  type StatisticTrend,
} from './StatisticCard';

export {
  Section,
  SectionBody,
  SectionHeader,
  SectionSkeleton,
  type SectionHeaderProps,
  type SectionProps,
  type SectionSkeletonProps,
} from './Section';

export {
  PageHeaderBlock,
  type BreadcrumbItem,
  type PageHeaderBlockProps,
} from './PageHeaderBlock';

export { Stack, type StackProps } from './Stack';

export { Container, type ContainerProps } from './Container';

export { Grid, GridItem, type GridItemProps, type GridProps } from './Grid';

export { Divider, type DividerProps } from './Divider';

export {
  EmptyState,
  type EmptyStateProps,
  type EmptyStateSize,
} from './EmptyState';

export {
  CardSkeleton,
  ListSkeleton,
  PageSkeleton,
  type CardSkeletonProps,
  type ListSkeletonProps,
  type PageSkeletonProps,
} from './Skeletons';

export {
  CornerBadge,
  type CornerBadgeProps,
} from './CornerBadge';

export {
  ShipmentCard,
  type ShipmentCardProps,
} from './ShipmentCard';

export {
  BookingCard,
  type BookingCardProps,
  type DriverBookingCardProps,
} from './BookingCard';

export {
  ShipmentStatusDonut,
  type ShipmentStatusDonutProps,
} from './ShipmentStatusDonut';

export {
  LocationCard,
  type LocationCardProps,
} from './LocationCard';
