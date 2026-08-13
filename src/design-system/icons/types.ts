import type { FC, SVGProps } from 'react';
import type { LucideIcon, LucideProps } from 'lucide-react';

export type { LucideIcon, LucideProps };

export type IconComponent = LucideIcon | FC<SVGProps<SVGSVGElement>>;

export type IconSize = 16 | 18 | 20 | 24 | 32;

export interface IconCategory {
  id: string;
  title: string;
  description: string;
  icons: Array<{
    name: string;
    icon: LucideIcon;
  }>;
}
