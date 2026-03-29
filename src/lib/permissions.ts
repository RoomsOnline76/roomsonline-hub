// Centralized permission utility for role-based access control

export type UserRole = 'owner' | 'sales_rep' | 'admin' | 'dev';

export type PermissionAction =
  // Owner actions
  | 'view_own_properties'
  | 'view_own_bookings'
  | 'view_own_calendar'
  | 'view_own_financials'
  // Admin actions
  | 'view_all_properties'
  | 'view_all_bookings'
  | 'manage_users'
  | 'manage_contracts'
  | 'manage_onboarding'
  | 'view_access_requests'
  | 'manage_payments'
  | 'view_admin_system'
  | 'edit_journals'
  | 'edit_help_articles'
  | 'edit_contracts'
  | 'edit_wizards'
  | 'view_audit_log'
  // Dev actions
  | 'access_integrations'
  | 'access_supporting_systems'
  | 'access_system_health'
  | 'access_pms_control'
  | 'access_logs'
  | 'access_feature_flags'
  | 'access_danger_zone'
  | 'view_revenue_pulse'
  | 'view_intelligence';

// Role hierarchy: dev > admin > sales_rep > owner
const roleHierarchy: Record<UserRole, number> = {
  owner: 1,
  sales_rep: 1.5,
  admin: 2,
  dev: 3,
};

// Permission definitions - minimum role required for each action
const permissionRoles: Record<PermissionAction, UserRole> = {
  // Owner permissions
  view_own_properties: 'owner',
  view_own_bookings: 'owner',
  view_own_calendar: 'owner',
  view_own_financials: 'owner',
  
  // Admin permissions
  view_all_properties: 'admin',
  view_all_bookings: 'admin',
  manage_users: 'admin',
  manage_contracts: 'admin',
  manage_onboarding: 'admin',
  view_access_requests: 'admin',
  manage_payments: 'admin',
  view_admin_system: 'admin',
  edit_journals: 'admin',
  edit_help_articles: 'admin',
  edit_contracts: 'admin',
  edit_wizards: 'admin',
  view_audit_log: 'admin',
  
  // Dev permissions (includes fearless_leader)
  access_integrations: 'dev',
  access_supporting_systems: 'dev',
  access_system_health: 'dev',
  access_pms_control: 'dev',
  access_logs: 'dev',
  access_feature_flags: 'dev',
  access_danger_zone: 'dev',
  view_revenue_pulse: 'dev',
  view_intelligence: 'dev',
};

/**
 * Check if a user with a given role can perform an action
 */
export function canAccess(userRole: UserRole, action: PermissionAction): boolean {
  const requiredRole = permissionRoles[action];
  return roleHierarchy[userRole] >= roleHierarchy[requiredRole];
}

/**
 * Check if a user role meets or exceeds a minimum role requirement
 */
export function hasMinRole(userRole: UserRole, minRole: UserRole): boolean {
  return roleHierarchy[userRole] >= roleHierarchy[minRole];
}

/**
 * Get the computed user role from auth flags
 */
export function computeUserRole(isDev: boolean, isFearlessLeader: boolean, isAdmin: boolean, isSalesRep: boolean = false): UserRole {
  if (isDev || isFearlessLeader) return 'dev';
  if (isAdmin) return 'admin';
  if (isSalesRep) return 'sales_rep';
  return 'owner';
}

/**
 * Get display name for a role
 */
export function getRoleDisplayName(role: UserRole): string {
  switch (role) {
    case 'dev': return 'Developer';
    case 'admin': return 'Admin';
    case 'sales_rep': return 'Sales Rep';
    case 'owner': return 'Owner';
  }
}

/**
 * Get role badge styling
 */
export function getRoleBadgeStyle(role: UserRole): { bg: string; text: string; border: string } {
  switch (role) {
    case 'dev':
      return {
        bg: 'bg-destructive/10',
        text: 'text-destructive',
        border: 'border-destructive/20',
      };
    case 'admin':
      return {
        bg: 'bg-accent/10',
        text: 'text-accent-foreground',
        border: 'border-accent/20',
      };
    case 'sales_rep':
      return {
        bg: 'bg-primary/10',
        text: 'text-primary',
        border: 'border-primary/20',
      };
    case 'owner':
      return {
        bg: 'bg-muted',
        text: 'text-muted-foreground',
        border: 'border-border',
      };
  }
}
