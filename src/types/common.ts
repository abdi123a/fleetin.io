import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';

/**
 * Cross-cutting utility types. Domain models belong to their own feature.
 */

/** Props for any component that renders children and accepts a className. */
export interface BaseComponentProps {
  className?: string;
  children?: ReactNode;
}

/** Makes the listed keys required while leaving the rest untouched. */
export type RequireKeys<T, K extends keyof T> = T & Required<Pick<T, K>>;

/** Makes the listed keys optional. */
export type PartialKeys<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/** Every property, recursively, made optional. */
export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

/** Widens a literal union while preserving autocomplete for the known members. */
export type LooseUnion<T extends string> = T | (string & {});

/**
 * Props for a polymorphic component rendered via an `as` prop, with the
 * underlying element's own props merged in and conflicts removed.
 */
export type PolymorphicProps<E extends ElementType, P = object> = P & {
  as?: E;
} & Omit<ComponentPropsWithoutRef<E>, keyof P | 'as'>;

/** Standard async lifecycle state for anything not owned by TanStack Query. */
export type AsyncStatus = 'idle' | 'pending' | 'success' | 'error';

/** Shared size scale — every sized primitive uses this vocabulary. */
export type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

/** Shared intent scale — maps directly onto the semantic colour roles. */
export type Intent = 'default' | 'primary' | 'accent' | 'success' | 'warning' | 'destructive' | 'info';
