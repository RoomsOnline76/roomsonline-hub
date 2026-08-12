import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Plus, 
  Trash2, 
  Edit2, 
  GripVertical, 
  Sparkles,
  MapPin,
  Clock,
  DollarSign,
  Loader2,
  TreePine,
  Palette,
  Utensils,
  Mountain,
  Leaf,
  Heart
} from 'lucide-react';
import { queueChannelContentSync } from '@/lib/channelContentSync';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface LocalExperience {
  id: string;
  property_id: string;
  title: string;
  description: string | null;
  category: 'nature' | 'culture' | 'food' | 'adventure' | 'relaxation' | 'wellness' | 'dining' | null;
  distance_km: number | null;
  duration_hours: number | null;
  price_indicator: 'free' | 'budget' | 'moderate' | 'luxury' | null;
  image_url: string | null;
  booking_link: string | null;
  why_locals_love_it: string | null;
  best_time: string | null;
  display_order: number;
  source: 'manual' | 'ai_generated' | 'pms_sync';
  is_active: boolean;
  // Dining-specific fields
  venue_type: string | null;
  cuisine_type: string | null;
  reservation_required: boolean;
  dress_code: string | null;
}

interface LocalExperiencesManagerProps {
  propertyId: string;
  propertyName: string;
  propertyCity?: string;
  propertyCountry?: string;
}

import { Wine } from 'lucide-react';

const categoryConfig = {
  nature: { icon: TreePine, color: 'bg-green-100 text-green-700' },
  culture: { icon: Palette, color: 'bg-purple-100 text-purple-700' },
  food: { icon: Utensils, color: 'bg-orange-100 text-orange-700' },
  adventure: { icon: Mountain, color: 'bg-blue-100 text-blue-700' },
  relaxation: { icon: Leaf, color: 'bg-teal-100 text-teal-700' },
  wellness: { icon: Heart, color: 'bg-pink-100 text-pink-700' },
  dining: { icon: Wine, color: 'bg-rose-100 text-rose-700' },
};

const priceLabels = {
  free: 'Free',
  budget: '$',
  moderate: '$$',
  luxury: '$$$'
};

export function LocalExperiencesManager({ 
  propertyId, 
  propertyName,
  propertyCity,
  propertyCountry
}: LocalExperiencesManagerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingExperience, setEditingExperience] = useState<LocalExperience | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Fetch experiences
  const { data: experiences, isLoading } = useQuery({
    queryKey: ['local-experiences', propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('local_experiences')
        .select('*')
        .eq('property_id', propertyId)
        .order('display_order');
      
      if (error) throw error;
      return data as LocalExperience[];
    }
  });

  // Create/Update mutation
  const saveMutation = useMutation({
    mutationFn: async (experience: Partial<LocalExperience>) => {
      if (experience.id) {
        const { id, ...updateData } = experience;
        const { error } = await supabase
          .from('local_experiences')
          .update(updateData)
          .eq('id', id);
        if (error) throw error;
      } else {
        // Ensure title is present for insert
        if (!experience.title) {
          throw new Error('Title is required');
        }
        const insertData = {
          title: experience.title,
          description: experience.description || null,
          category: experience.category || null,
          distance_km: experience.distance_km || null,
          duration_hours: experience.duration_hours || null,
          price_indicator: experience.price_indicator || null,
          image_url: experience.image_url || null,
          booking_link: experience.booking_link || null,
          why_locals_love_it: experience.why_locals_love_it || null,
          best_time: experience.best_time || null,
          is_active: experience.is_active ?? true,
          property_id: propertyId
        };
        const { error } = await supabase
          .from('local_experiences')
          .insert([insertData]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['local-experiences', propertyId] });
      setIsDialogOpen(false);
      setEditingExperience(null);
      // Attraction distances are part of the channel content payload — push the change itself.
      void queueChannelContentSync(propertyId, 'local_experience_save');
      toast({ title: 'Experience saved!' });
    },
    onError: (error) => {
      toast({ 
        title: 'Error saving experience', 
        description: error.message,
        variant: 'destructive' 
      });
    }
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('local_experiences')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['local-experiences', propertyId] });
      void queueChannelContentSync(propertyId, 'local_experience_delete');
      toast({ title: 'Experience deleted' });
    }
  });

  // AI Generation
  const handleGenerateWithAI = async () => {
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('enrich-property-experiences', {
        body: { 
          property_id: propertyId,
          property_name: propertyName,
          city: propertyCity,
          country: propertyCountry
        }
      });

      if (error) throw error;
      
      queryClient.invalidateQueries({ queryKey: ['local-experiences', propertyId] });
      toast({ 
        title: 'Experiences generated!', 
        description: `Added ${data.count || 5} TOBI-curated experiences.`
      });
    } catch (error: any) {
      toast({ 
        title: 'Generation failed', 
        description: error.message,
        variant: 'destructive' 
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleEdit = (experience: LocalExperience) => {
    setEditingExperience(experience);
    setIsDialogOpen(true);
  };

  const handleToggleActive = async (id: string, isActive: boolean) => {
    await saveMutation.mutateAsync({ id, is_active: isActive });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Local Experiences</h3>
          <p className="text-sm text-muted-foreground">
            Curate local activities and attractions for guests
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={handleGenerateWithAI}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            Generate with TOBI
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => setEditingExperience(null)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Experience
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingExperience ? 'Edit Experience' : 'Add Experience'}
                </DialogTitle>
              </DialogHeader>
              <ExperienceForm
                experience={editingExperience}
                onSave={(data) => saveMutation.mutate(data)}
                isLoading={saveMutation.isPending}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Experiences List */}
      {isLoading ? (
        <div className="text-center py-8">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
        </div>
      ) : experiences?.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <MapPin className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
            <h4 className="font-medium mb-2">No experiences yet</h4>
            <p className="text-sm text-muted-foreground mb-4">
              Add local attractions, restaurants, and activities to enhance guest stays
            </p>
            <Button variant="outline" onClick={handleGenerateWithAI} disabled={isGenerating}>
              {isGenerating ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              Auto-generate with TOBI
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {experiences?.map((experience, index) => {
            const CategoryIcon = experience.category 
              ? categoryConfig[experience.category]?.icon 
              : MapPin;
            const categoryStyle = experience.category 
              ? categoryConfig[experience.category]?.color 
              : 'bg-gray-100 text-gray-700';

            return (
              <Card 
                key={experience.id}
                className={`${!experience.is_active ? 'opacity-60' : ''}`}
              >
                <CardContent className="py-4">
                  <div className="flex items-start gap-4">
                    <div className="cursor-move text-muted-foreground">
                      <GripVertical className="h-5 w-5" />
                    </div>
                    
                    <div className={`p-2 rounded-lg ${categoryStyle}`}>
                      <CategoryIcon className="h-5 w-5" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium truncate">{experience.title}</h4>
                        {experience.source === 'ai_generated' && (
                          <Badge variant="secondary" className="text-xs">
                            <Sparkles className="h-3 w-3 mr-1" />
                            TOBI
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                        {experience.description}
                      </p>
                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        {experience.distance_km && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {experience.distance_km} km
                          </span>
                        )}
                        {experience.duration_hours && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {experience.duration_hours}h
                          </span>
                        )}
                        {experience.price_indicator && (
                          <span className="flex items-center gap-1">
                            <DollarSign className="h-3 w-3" />
                            {priceLabels[experience.price_indicator]}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Switch
                        checked={experience.is_active}
                        onCheckedChange={(checked) => handleToggleActive(experience.id, checked)}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(experience)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteMutation.mutate(experience.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Experience Form Component
interface ExperienceFormProps {
  experience: LocalExperience | null;
  onSave: (data: Partial<LocalExperience>) => void;
  isLoading: boolean;
}

function ExperienceForm({ experience, onSave, isLoading }: ExperienceFormProps) {
  const [formData, setFormData] = useState<Partial<LocalExperience>>({
    title: experience?.title || '',
    description: experience?.description || '',
    category: experience?.category || null,
    distance_km: experience?.distance_km || null,
    duration_hours: experience?.duration_hours || null,
    price_indicator: experience?.price_indicator || null,
    image_url: experience?.image_url || '',
    booking_link: experience?.booking_link || '',
    why_locals_love_it: experience?.why_locals_love_it || '',
    best_time: experience?.best_time || '',
    is_active: experience?.is_active ?? true,
    id: experience?.id,
    // Dining-specific fields
    venue_type: experience?.venue_type || null,
    cuisine_type: experience?.cuisine_type || '',
    reservation_required: experience?.reservation_required ?? false,
    dress_code: experience?.dress_code || ''
  });

  const isDiningCategory = formData.category === 'dining';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="title">Title *</Label>
        <Input
          id="title"
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          placeholder="e.g., Cape Point Nature Reserve"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={formData.description || ''}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="A brief description of the experience..."
          rows={3}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="category">Category</Label>
          <Select
            value={formData.category || ''}
            onValueChange={(value) => setFormData({ ...formData, category: value as any })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="nature">Nature</SelectItem>
              <SelectItem value="culture">Culture</SelectItem>
              <SelectItem value="food">Food & Dining</SelectItem>
              <SelectItem value="adventure">Adventure</SelectItem>
              <SelectItem value="relaxation">Relaxation</SelectItem>
              <SelectItem value="wellness">Wellness</SelectItem>
              <SelectItem value="dining">Restaurant/Eatery</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="price">Price Level</Label>
          <Select
            value={formData.price_indicator || ''}
            onValueChange={(value) => setFormData({ ...formData, price_indicator: value as any })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select price" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="free">Free</SelectItem>
              <SelectItem value="budget">Budget ($)</SelectItem>
              <SelectItem value="moderate">Moderate ($$)</SelectItem>
              <SelectItem value="luxury">Luxury ($$$)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Dining-specific fields */}
      {isDiningCategory && (
        <>
          <div className="grid grid-cols-2 gap-4 p-4 bg-rose-50 rounded-lg border border-rose-200">
            <div className="space-y-2">
              <Label htmlFor="venue_type">Venue Type</Label>
              <Select
                value={formData.venue_type || ''}
                onValueChange={(value) => setFormData({ ...formData, venue_type: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select venue type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="restaurant">Restaurant</SelectItem>
                  <SelectItem value="cafe">Café</SelectItem>
                  <SelectItem value="pub">Pub</SelectItem>
                  <SelectItem value="wine_bar">Wine Bar</SelectItem>
                  <SelectItem value="farm_table">Farm Table</SelectItem>
                  <SelectItem value="takeaway">Takeaway</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cuisine_type">Cuisine Type</Label>
              <Input
                id="cuisine_type"
                value={formData.cuisine_type || ''}
                onChange={(e) => setFormData({ ...formData, cuisine_type: e.target.value })}
                placeholder="e.g., French, Cape Malay"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dress_code">Dress Code</Label>
              <Input
                id="dress_code"
                value={formData.dress_code || ''}
                onChange={(e) => setFormData({ ...formData, dress_code: e.target.value })}
                placeholder="e.g., Smart casual"
              />
            </div>

            <div className="flex items-center gap-2 pt-6">
              <Switch
                id="reservation_required"
                checked={formData.reservation_required}
                onCheckedChange={(checked) => setFormData({ ...formData, reservation_required: checked })}
              />
              <Label htmlFor="reservation_required">Reservation Required</Label>
            </div>
          </div>
        </>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="distance">Distance (km)</Label>
          <Input
            id="distance"
            type="number"
            step="0.1"
            value={formData.distance_km || ''}
            onChange={(e) => setFormData({ ...formData, distance_km: parseFloat(e.target.value) || null })}
            placeholder="e.g., 5.5"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="duration">Duration (hours)</Label>
          <Input
            id="duration"
            type="number"
            step="0.5"
            value={formData.duration_hours || ''}
            onChange={(e) => setFormData({ ...formData, duration_hours: parseFloat(e.target.value) || null })}
            placeholder="e.g., 2.5"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="why_locals">Why Locals Love It</Label>
        <Textarea
          id="why_locals"
          value={formData.why_locals_love_it || ''}
          onChange={(e) => setFormData({ ...formData, why_locals_love_it: e.target.value })}
          placeholder="What makes this special..."
          rows={2}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="best_time">Best Time to Visit</Label>
        <Input
          id="best_time"
          value={formData.best_time || ''}
          onChange={(e) => setFormData({ ...formData, best_time: e.target.value })}
          placeholder="e.g., Early morning, Sunset"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="image_url">Image URL</Label>
        <Input
          id="image_url"
          value={formData.image_url || ''}
          onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
          placeholder="https://..."
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="booking_link">Booking Link</Label>
        <Input
          id="booking_link"
          value={formData.booking_link || ''}
          onChange={(e) => setFormData({ ...formData, booking_link: e.target.value })}
          placeholder="https://..."
        />
      </div>

      <div className="flex items-center gap-2">
        <Switch
          id="is_active"
          checked={formData.is_active}
          onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
        />
        <Label htmlFor="is_active">Active</Label>
      </div>

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
        ) : null}
        {experience ? 'Update Experience' : 'Add Experience'}
      </Button>
    </form>
  );
}
