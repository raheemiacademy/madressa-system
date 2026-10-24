import { statusColour } from '@/lib/status';

export function Chip({ children, colour }: { children: string; colour?: string }) {
  return <span className="ra-chip" title={children} style={{ ['--c' as string]: colour ?? statusColour(children) }}><span>{children}</span></span>;
}
