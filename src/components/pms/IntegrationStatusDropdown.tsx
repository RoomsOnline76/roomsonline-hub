import React, { useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export type PmsIntegrationStatus = 
  | 'coming_soon'
  | 'in_development'
  | 'parked'
  | 'in_testing'
  | 'deployed';

export const INTEGRATION_STATUS_CONFIG: Record<PmsIntegrationStatus, {
  label: string;
  textColor: string;
  bgColor: string;
}> = {
  deployed: { 
    label: 'Deployed', 
    textColor: 'text-status-healthy', 
    bgColor: 'bg-status-healthy/10' 
  },
  in_testing: { 
    label: 'In Testing', 
    textColor: 'text-status-warning', 
    bgColor: 'bg-status-warning/10' 
  },
  in_development: { 
    label: 'In Development', 
    textColor: 'text-status-syncing', 
    bgColor: 'bg-status-syncing/10' 
  },
  parked: { 
    label: 'Parked', 
    textColor: 'text-muted-foreground', 
    bgColor: 'bg-muted' 
  },
  coming_soon: { 
    label: 'Coming Soon', 
    textColor: 'text-primary', 
    bgColor: 'bg-primary/10' 
  },
};

interface IntegrationStatusDropdownProps {
  systemType: string;
  currentStatus: PmsIntegrationStatus | null;
  onStatusChange?: (status: PmsIntegrationStatus) => void;
  disabled?: boolean;
  compact?: boolean;
}

export function IntegrationStatusDropdown({
  systemType,
  currentStatus,
  onStatusChange,
  disabled = false,
  compact = false,
}: IntegrationStatusDropdownProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [localStatus, setLocalStatus] = useState<PmsIntegrationStatus>(currentStatus || 'coming_soon');
  
  // Sync localStatus when prop changes
  React.useEffect(() => {
    if (currentStatus) {
      setLocalStatus(currentStatus);
    }
  }, [currentStatus]);
  
  const config = INTEGRATION_STATUS_CONFIG[localStatus];

  const handleStatusChange = async (newStatus: PmsIntegrationStatus) => {
    if (newStatus === localStatus) return;
    
    setIsUpdating(true);
    try {
      // Update is_production based on status
      const isProduction = newStatus === 'deployed';
      
      const { error } = await supabase
        .from('pms_tracker_status')
        .upsert({ 
          system_type: systemType,
          integration_status: newStatus,
          is_production: isProduction,
          updated_at: new Date().toISOString()
        }, { onConflict: 'system_type' });

      if (error) throw error;

      // Update local state immediately for better UX
      setLocalStatus(newStatus);
      toast.success(`${systemType} status updated to ${INTEGRATION_STATUS_CONFIG[newStatus].label}`);
      onStatusChange?.(newStatus);
    } catch (error) {
      console.error('Failed to update integration status:', error);
      toast.error('Failed to update status');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <Select
      value={localStatus}
      onValueChange={(value) => handleStatusChange(value as PmsIntegrationStatus)}
      disabled={disabled || isUpdating}
    >
      <SelectTrigger 
        className={cn(
          "h-7 border-0 shadow-none focus:ring-0",
          compact ? "w-[120px] text-xs px-2" : "w-[140px] text-sm px-3",
          config.bgColor,
          config.textColor,
          "font-medium"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent onClick={(e) => e.stopPropagation()}>
        {Object.entries(INTEGRATION_STATUS_CONFIG).map(([key, cfg]) => (
          <SelectItem 
            key={key} 
            value={key}
            className={cn("text-sm", cfg.textColor)}
          >
            {cfg.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
