import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Sparkles, Save } from 'lucide-react';
import type { Json } from '@/integrations/supabase/types';

const TONE_OPTIONS = [
  { value: 'friendly and informative', label: 'Friendly & Informative' },
  { value: 'professional', label: 'Professional' },
  { value: 'casual', label: 'Casual' },
  { value: 'luxury', label: 'Luxury' },
  { value: 'warm and welcoming', label: 'Warm & Welcoming' },
  { value: 'adventurous', label: 'Adventurous' },
];

interface BrandVoiceCardProps {
  propertyId: string;
}

export function BrandVoiceCard({ propertyId }: BrandVoiceCardProps) {
  const [brandVoice, setBrandVoice] = useState('');
  const [aiTone, setAiTone] = useState('friendly and informative');
  const [configId, setConfigId] = useState<string | null>(null);
  const [existingConfig, setExistingConfig] = useState<Record<string, unknown> | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!propertyId) return;
    setLoading(true);
    supabase
      .from('rolos_experience_configs')
      .select('id, config')
      .eq('property_id', propertyId)
      .eq('experience_type', 'brand_kit')
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setConfigId(data.id);
          const cfg = data.config as Record<string, unknown> | null;
          setExistingConfig(cfg);
          setBrandVoice((cfg?.brand_voice as string) || '');
          setAiTone((cfg?.ai_email_tone as string) || 'friendly and informative');
        }
        setLoading(false);
      });
  }, [propertyId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const configPayload: Json = {
        ...(existingConfig as Record<string, Json> || {}),
        brand_voice: brandVoice,
        ai_email_tone: aiTone,
      };

      if (configId) {
        const { error } = await supabase
          .from('rolos_experience_configs')
          .update({ config: configPayload })
          .eq('id', configId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('rolos_experience_configs')
          .insert({
            property_id: propertyId,
            experience_type: 'brand_kit',
            config: configPayload,
          })
          .select('id')
          .single();
        if (error) throw error;
        setConfigId(data.id);
      }
      toast.success('Voice & tone saved');
    } catch (e: unknown) {
      toast.error('Failed to save: ' + (e instanceof Error ? e.message : 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;

  return (
    <Card className="mt-4">
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          AI Voice & Tone
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 px-4 pb-4">
        <div className="space-y-2">
          <Label className="text-xs">Brand Voice</Label>
          <Textarea
            value={brandVoice}
            onChange={(e) => setBrandVoice(e.target.value)}
            placeholder="Describe this property's personality for AI-generated content, e.g. 'Warm, coastal, family-friendly. A relaxed beach getaway.'"
            rows={3}
            className="text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Used by the AI to generate emails, descriptions, and guest communications in this property's style.
          </p>
        </div>
        <div className="space-y-2">
          <Label className="text-xs">AI Email Tone</Label>
          <Select value={aiTone} onValueChange={setAiTone}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TONE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          <Save className="h-3.5 w-3.5 mr-1.5" />
          {saving ? 'Saving…' : 'Save Voice & Tone'}
        </Button>
      </CardContent>
    </Card>
  );
}
