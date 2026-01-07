// PMS Tracker Status Types and Configuration

export interface PMSTrackerStatus {
  system_type: string;
  status: string;
  contact_person?: string;
  contact_name?: string;
  contact_tel?: string;
  contact_email?: string;
  // Setup phase
  has_account: boolean;
  has_docs: boolean;
  has_edge: boolean;
  // Integration phase
  has_health: boolean;
  has_get: boolean;
  has_post: boolean;
  has_soft_test: boolean;
  is_production: boolean;
  // Legacy field (mapped to has_account)
  has_access?: boolean;
  notes?: string;
  additional_info?: {
    url?: string;
    meeting?: string;
    email?: string;
    agent_code?: string;
    user?: string;
    test_account?: string;
    notes?: string;
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
    return { bg: 'bg-status-healthy/20', text: 'text-status-healthy' };
  }
  if (normalizedStatus.includes('wait') || normalizedStatus.includes('access')) {
    return { bg: 'bg-status-warning/20', text: 'text-status-warning' };
  }
  if (normalizedStatus === 'register' || normalizedStatus === 'review') {
    return { bg: 'bg-status-syncing/20', text: 'text-status-syncing' };
  }
  if (normalizedStatus === 'in progress') {
    return { bg: 'bg-primary/20', text: 'text-primary' };
  }
  // No Action or unknown
  return { bg: 'bg-muted', text: 'text-muted-foreground' };
};

// Updated to use all 8 progress indicators
export const getProgressCount = (tracker: PMSTrackerStatus): { current: number; total: number } => {
  const flags = [
    // Setup phase
    tracker.has_account,
    tracker.has_docs,
    tracker.has_edge,
    // Integration phase
    tracker.has_health,
    tracker.has_get,
    tracker.has_post,
    tracker.has_soft_test,
    tracker.is_production,
  ];
  return {
    current: flags.filter(Boolean).length,
    total: flags.length,
  };
};
