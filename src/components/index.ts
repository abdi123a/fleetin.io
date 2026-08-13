/**
 * Shared application components.
 *
 * The line against `design-system/`: primitives there are generic and
 * business-agnostic; components here are application-aware compositions
 * (they may read app config, routing or stores) but are still feature-agnostic.
 * Anything tied to a single module belongs in that feature's folder.
 */

export * from './common';
export * from './feedback';
export * from './shipments';

