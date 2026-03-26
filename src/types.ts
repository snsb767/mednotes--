export interface WeeklyStats {
  week_number: number;
  notes_written: number;
  typing_speed_wpm: number;
  error_rate: number;
  structure_score: number;
  clinical_reasoning_score: number;
  timestamp: any;
}

export interface MetricComparison {
  metric: string;
  thisWeek: number;
  lastWeek: number;
  change: number;
  trend: 'Improving' | 'Declining' | 'Stable';
}

export interface EvaluationReport {
  week_number: number;
  final_score: number;
  performance_trend: 'Improving' | 'Declining' | 'Stable';
  summary: string;
  comparisons: MetricComparison[];
  insights: string[];
  strengths: string[];
  areas_for_improvement: string[];
  action_plan: string[];
}
