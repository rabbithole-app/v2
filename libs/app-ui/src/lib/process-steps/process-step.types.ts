export interface ProcessStep {
  completedDescription?: string;
  description?: string;
  error?: string;
  id: string;
  meta?: string;
  metaLabel?: string;
  progress?: { current: number; label?: string; total: number };
  status: ProcessStepStatus;
  title: string;
}

export type ProcessStepStatus =
  | 'completed'
  | 'error'
  | 'in-progress'
  | 'pending'
  | 'skipped';

export interface ProcessStepTemplateContext {
  $implicit: ProcessStep;
  percent: number;
  progress: ProcessStep['progress'] | null;
  step: ProcessStep;
}
