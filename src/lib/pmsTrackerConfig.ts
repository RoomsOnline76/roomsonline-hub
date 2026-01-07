// PMS Tracker Status Types and Configuration

export interface PMSTrackerStatus {
  system_type: string;
  status: string;
  contact_person?: string;
  has_access: boolean;
  has_docs: boolean;
  has_edge: boolean;
  has_get: boolean;
  has_post: boolean;
  is_production: boolean;
  notes?: string;
  additional_info?: {
    url?: string;
    meeting?: string;
    [key: string]: string | undefined;
  };
}

export type TrackerStatusType = 
  | 'COMPLETE' 
  | 'Wait Debbie Access' 
  | 'Register' 
  | 'Review' 
  | 'No Action' 
  | 'In Progress';

export const getStatusColor = (status: string): { bg: string; text: string } => {
  const normalizedStatus = status?.toLowerCase() || '';
  
  if (normalizedStatus === 'complete') {
    return { bg: 'bg-green-500/20', text: 'text-green-700 dark:text-green-400' };
  }
  if (normalizedStatus.includes('wait') || normalizedStatus.includes('access')) {
    return { bg: 'bg-amber-500/20', text: 'text-amber-700 dark:text-amber-400' };
  }
  if (normalizedStatus === 'register' || normalizedStatus === 'review') {
    return { bg: 'bg-blue-500/20', text: 'text-blue-700 dark:text-blue-400' };
  }
  if (normalizedStatus === 'in progress') {
    return { bg: 'bg-purple-500/20', text: 'text-purple-700 dark:text-purple-400' };
  }
  // No Action or unknown
  return { bg: 'bg-muted', text: 'text-muted-foreground' };
};

export const getProgressCount = (tracker: PMSTrackerStatus): { current: number; total: number } => {
  const flags = [
    tracker.has_access,
    tracker.has_docs,
    tracker.has_edge,
    tracker.has_get,
    tracker.has_post,
    tracker.is_production,
  ];
  return {
    current: flags.filter(Boolean).length,
    total: flags.length,
  };
};
