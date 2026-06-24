import React from 'react';
import { cn } from '../../lib/utils';

export function Card({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('saas-card', !className?.includes('overflow-') && 'overflow-hidden', className)} {...props}>
      {children}
    </div>
  );
}
