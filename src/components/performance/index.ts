/**
 * Performance & rating UI — the stars and figures a driver or a transporter
 * profile carries. The arithmetic behind every one of them lives in
 * `@/lib/rating`; nothing here computes a score, and neither does that —
 * every star in this app is one a person gave in the delivery debrief.
 */

export { StarRating, type StarRatingProps } from './StarRating';
export { RatingAxes, type RatingAxesProps } from './RatingAxes';
export { PerformancePanel, type PerformancePanelProps } from './PerformancePanel';
export { DriverRatingRow, type DriverRatingRowProps } from './DriverRatingRow';
export { RatingTrendChart, type RatingTrendChartProps } from './RatingTrendChart';
