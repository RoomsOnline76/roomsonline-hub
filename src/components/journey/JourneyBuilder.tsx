import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Map, X, ChevronUp, ChevronDown, Check, Loader2, AlertCircle, CalendarDays, List } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useItinerary } from '@/contexts/ItineraryContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { JourneyCalendarView } from './JourneyCalendarView';

type ViewMode = 'list' | 'calendar';

export function JourneyBuilder() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { stays, totalPrice, totalNights, hasStays, stayCount, removeStay } = useItinerary();
  const [isExpanded, setIsExpanded] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [showFullMap, setShowFullMap] = useState(false);

  if (!hasStays) return null;

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'available': return <Check className="h-3 w-3 text-green-600" />;
      case 'checking': return <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />;
      case 'unavailable': return <AlertCircle className="h-3 w-3 text-destructive" />;
      default: return null;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'available': return 'Available';
      case 'checking': return 'Checking...';
      case 'unavailable': return 'Unavailable';
      default: return '';
    }
  };

  const showMinimalPill = isMobile && !isExpanded;

  return (
    <>
      <AnimatePresence>
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          className={cn(
            "fixed z-50 w-80 max-w-[calc(100vw-2rem)]",
            isMobile ? "bottom-28 right-4" : "bottom-4 right-4"
          )}
        >
          {showMinimalPill ? (
            <button
              onClick={() => setIsExpanded(true)}
              className="flex items-center gap-3 px-4 py-3 bg-card border border-border rounded-full shadow-xl hover:bg-muted/50 transition-colors"
            >
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center relative">
                <Map className="h-4 w-4 text-primary" />
                <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                  {stayCount}
                </span>
              </div>
              <span className="text-sm font-medium">{stayCount} stay{stayCount !== 1 ? 's' : ''}</span>
              <span className="text-sm font-semibold text-primary">{formatCurrency(totalPrice)}</span>
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            </button>
          ) : (
            <div className="bg-card border border-border rounded-xl shadow-xl overflow-hidden">
              {/* Header */}
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Map className="h-5 w-5 text-primary" />
                  </div>
                  <div className="text-left">
                    <p className="font-medium text-sm">Your Journey</p>
                    <p className="text-xs text-muted-foreground">
                      {stayCount} {stayCount === 1 ? 'stay' : 'stays'} · {totalNights} nights
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{formatCurrency(totalPrice)}</span>
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </button>

              {/* Expanded content */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="border-t border-border">
                      {/* View toggle */}
                      <div className="flex items-center justify-between px-3 py-2 bg-muted/20">
                        <div className="flex items-center gap-1 bg-muted rounded-md p-0.5">
                          <button
                            onClick={() => setViewMode('list')}
                            className={cn(
                              "flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors",
                              viewMode === 'list'
                                ? "bg-background text-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground"
                            )}
                          >
                            <List className="h-3 w-3" />
                            List
                          </button>
                          <button
                            onClick={() => setViewMode('calendar')}
                            className={cn(
                              "flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors",
                              viewMode === 'calendar'
                                ? "bg-background text-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground"
                            )}
                          >
                            <CalendarDays className="h-3 w-3" />
                            Timeline
                          </button>
                        </div>
                        <button
                          onClick={() => setShowFullMap(true)}
                          className="text-xs text-primary hover:underline font-medium"
                        >
                          View full map
                        </button>
                      </div>

                      {/* Content based on view mode */}
                      {viewMode === 'list' ? (
                        <div className="max-h-64 overflow-y-auto">
                          {stays.map((stay, index) => (
                            <div
                              key={stay.id}
                              className={cn(
                                "flex items-start gap-3 p-3",
                                index !== stays.length - 1 && "border-b border-border"
                              )}
                            >
                              <div className="h-12 w-12 rounded-lg overflow-hidden flex-shrink-0 bg-muted">
                                {stay.property_image ? (
                                  <img src={stay.property_image} alt={stay.property_name} className="h-full w-full object-cover" />
                                ) : (
                                  <div className="h-full w-full flex items-center justify-center">
                                    <Map className="h-5 w-5 text-muted-foreground" />
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate">{stay.property_name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {format(new Date(stay.dates.check_in), 'MMM d')} –{' '}
                                  {format(new Date(stay.dates.check_out), 'MMM d')} · {stay.nights} nights
                                </p>
                                <div className="flex items-center gap-1 mt-1">
                                  {getStatusIcon(stay.availability_status)}
                                  <span className={cn(
                                    "text-xs",
                                    stay.availability_status === 'available' && "text-green-600",
                                    stay.availability_status === 'unavailable' && "text-destructive",
                                    stay.availability_status === 'checking' && "text-muted-foreground"
                                  )}>
                                    {getStatusText(stay.availability_status)}
                                  </span>
                                </div>
                              </div>
                              <button
                                onClick={(e) => { e.stopPropagation(); removeStay(stay.id); }}
                                className="p-1 hover:bg-muted rounded transition-colors"
                              >
                                <X className="h-4 w-4 text-muted-foreground" />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-3">
                          <JourneyCalendarView compact />
                        </div>
                      )}

                      {/* Actions */}
                      <div className="p-3 bg-muted/30 space-y-2">
                        <Button onClick={() => navigate('/journey/review')} className="w-full" size="sm">
                          Continue to Review
                        </Button>
                        <Button onClick={() => navigate('/')} variant="ghost" className="w-full" size="sm">
                          Add Another Stay
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Full Journey Map Sheet */}
      <Sheet open={showFullMap} onOpenChange={setShowFullMap}>
        <SheetContent side={isMobile ? "bottom" : "right"} className={cn(isMobile ? "h-[85vh]" : "w-[480px] sm:max-w-lg")}>
          <SheetHeader>
            <SheetTitle>Your Journey Timeline</SheetTitle>
            <SheetDescription>
              {stayCount} {stayCount === 1 ? 'stay' : 'stays'} · {totalNights} nights · {formatCurrency(totalPrice)}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            <JourneyCalendarView />
          </div>
          <div className="mt-6 space-y-2">
            <Button onClick={() => { setShowFullMap(false); navigate('/journey/review'); }} className="w-full">
              Continue to Review
            </Button>
            <Button onClick={() => { setShowFullMap(false); navigate('/'); }} variant="outline" className="w-full">
              Add Another Stay
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
