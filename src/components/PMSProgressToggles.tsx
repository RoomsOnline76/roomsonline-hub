import React from 'react';
import { Key, FileText, Code, HeartPulse, Download, Upload, FlaskConical, Rocket } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { PMSTrackerStatus } from '@/lib/pmsTrackerConfig';

interface ProgressField {
  key: string;
  dbColumn: string;
  icon: React.ElementType;
  label: string;
  description: string;
}

const setupFields: ProgressField[] = [
  { key: 'has_account', dbColumn: 'has_account', icon: Key, label: 'Account', description: 'Have active account/registration with PMS' },
  { key: 'has_docs', dbColumn: 'has_docs', icon: FileText, label: 'Docs', description: 'Have API documentation access' },
  { key: 'has_edge', dbColumn: 'has_edge', icon: Code, label: 'Edge', description: 'Edge function/adaptor code built' },
];

const integrationFields: ProgressField[] = [
  { key: 'has_health', dbColumn: 'has_health', icon: HeartPulse, label: 'Health', description: 'Can connect and verify credentials' },
  { key: 'has_get', dbColumn: 'has_get', icon: Download, label: 'GET', description: 'Can pull availability/rates data' },
  { key: 'has_post', dbColumn: 'has_post', icon: Upload, label: 'POST', description: 'Can push bookings to PMS' },
  { key: 'has_soft_test', dbColumn: 'has_soft_test', icon: FlaskConical, label: 'Test', description: 'Tested with sandbox/test property' },
  { key: 'is_production', dbColumn: 'is_production', icon: Rocket, label: 'Live', description: 'Live with real properties' },
];

const allFields = [...setupFields, ...integrationFields];

interface PMSProgressTogglesProps {
  systemType: string;
  trackerData: PMSTrackerStatus | null | undefined;
  onUpdated?: () => void;
  compact?: boolean;
}

export const PMSProgressToggles: React.FC<PMSProgressTogglesProps> = ({
  systemType,
  trackerData,
  onUpdated,
  compact = false,
}) => {
  const [saving, setSaving] = React.useState<string | null>(null);

  const getValue = (field: ProgressField): boolean => {
    if (!trackerData) return false;
    const value = trackerData[field.dbColumn as keyof PMSTrackerStatus];
    return Boolean(value);
  };

  const getCompletedCount = (): number => {
    return allFields.filter(f => getValue(f)).length;
  };

  const handleToggle = async (field: ProgressField) => {
    const currentValue = getValue(field);
    const newValue = !currentValue;

    setSaving(field.key);
    try {
      const { error } = await supabase
        .from('pms_tracker_status')
        .update({ [field.dbColumn]: newValue })
        .eq('system_type', systemType);

      if (error) throw error;

      toast.success(`${field.label} ${newValue ? 'completed' : 'uncompleted'}`);
      onUpdated?.();
    } catch (error) {
      console.error('Error updating progress:', error);
      toast.error('Failed to update progress');
    } finally {
      setSaving(null);
    }
  };

  const renderToggle = (field: ProgressField) => {
    const isComplete = getValue(field);
    const isSaving = saving === field.key;
    const Icon = field.icon;

    return (
      <Tooltip key={field.key}>
        <TooltipTrigger asChild>
          <button
            onClick={() => handleToggle(field)}
            disabled={isSaving}
            className={cn(
              'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-all',
              'border hover:scale-105 active:scale-95',
              isComplete
                ? 'bg-status-healthy/20 border-status-healthy/40 text-status-healthy'
                : 'bg-muted/50 border-muted-foreground/20 text-muted-foreground hover:bg-muted',
              isSaving && 'opacity-50 cursor-wait'
            )}
          >
            <Icon className="h-3 w-3" />
            {!compact && <span>{field.label}</span>}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[200px]">
          <p className="font-medium">{field.label}</p>
          <p className="text-xs text-muted-foreground">{field.description}</p>
          <p className="text-xs mt-1">Click to {isComplete ? 'mark incomplete' : 'mark complete'}</p>
        </TooltipContent>
      </Tooltip>
    );
  };

  if (compact) {
    return (
      <TooltipProvider>
        <div className="flex items-center gap-1">
          {allFields.map(renderToggle)}
          <span className="ml-2 text-xs text-muted-foreground">
            {getCompletedCount()}/{allFields.length}
          </span>
        </div>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Implementation Progress</span>
          <span className="text-xs text-muted-foreground">
            {getCompletedCount()}/{allFields.length} complete
          </span>
        </div>

        {/* Setup Phase */}
        <div className="space-y-1.5">
          <span className="text-xs text-muted-foreground uppercase tracking-wide">Setup</span>
          <div className="flex flex-wrap gap-1.5">
            {setupFields.map(renderToggle)}
          </div>
        </div>

        {/* Integration Phase */}
        <div className="space-y-1.5">
          <span className="text-xs text-muted-foreground uppercase tracking-wide">Integration</span>
          <div className="flex flex-wrap gap-1.5">
            {integrationFields.map(renderToggle)}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
};

// Export field definitions for use in email template
export const progressFieldDefinitions = {
  setup: setupFields,
  integration: integrationFields,
  all: allFields,
};
