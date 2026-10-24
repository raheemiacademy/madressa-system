'use client';

import { useTransition } from 'react';
import { HoldButton } from '@/components/HoldButton';
import { startDrillAction } from './actions';

export function DrillStart({ big = true, describedBy = 'drill-hint' }: { big?: boolean; describedBy?: string }) {
  const [, start] = useTransition();
  return <HoldButton big={big} describedBy={describedBy} onConfirm={() => start(() => startDrillAction())} />;
}
