import { Icon, type IconName } from './Icon';

interface BrandProps {
  readonly title?: string;
  readonly tag?: string;
  readonly icon?: IconName;
}

// Brand header used across screens (matches design/mockups.html .brand).
export function Brand({ title = 'Curio', tag, icon = 'book' }: BrandProps): JSX.Element {
  return (
    <div className="flex items-center gap-2.5 mb-5">
      <div className="w-7 h-7 rounded-lg bg-sage text-sage-ink flex items-center justify-center">
        <Icon name={icon} size={16} />
      </div>
      <div className="text-[15px] font-medium text-ink tracking-tight">{title}</div>
      {tag && <div className="text-xs text-ink-3 ml-auto">{tag}</div>}
    </div>
  );
}
