import { HitType } from '@/types';
import { Database, HardDrive, Disc } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HitTypeBadgeProps {
  hitType: HitType;
  size?: 'sm' | 'md';
}

const config = {
  [HitType.DB_HIT]: {
    label: 'DB HIT',
    icon: Database,
    className: 'border-teal-500/40 bg-teal-950/50 text-teal-400',
  },
  [HitType.OS_HIT]: {
    label: 'OS HIT',
    icon: HardDrive,
    className: 'border-amber-500/40 bg-amber-950/50 text-amber-400',
  },
  [HitType.DISK_READ]: {
    label: 'DISK READ',
    icon: Disc,
    className: 'border-slate-500/40 bg-slate-800/50 text-slate-400',
  },
};

export function HitTypeBadge({ hitType, size = 'md' }: HitTypeBadgeProps) {
  const { label, icon: Icon, className } = config[hitType];
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border font-mono font-semibold uppercase tracking-wider transition-all',
        className,
        size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'
      )}
    >
      <Icon className={size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
      {label}
    </div>
  );
}
