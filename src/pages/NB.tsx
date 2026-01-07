import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { format, addDays, parse } from "date-fns";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

interface NBProperty {
  id: string;
  name: string;
  external_id: string | null;
}

const NB = () => {
  const [searchParams] = useSearchParams();
  const urlPropertyId = searchParams.get("propertyId");
  const urlCheckIn = searchParams.get("checkIn");
  const urlCheckOut = searchParams.get("checkOut");
  
  const [checkIn, setCheckIn] = useState<Date>(() => {
    if (urlCheckIn) {
      try {
        return parse(urlCheckIn, "yyyy-MM-dd", new Date());
      } catch {
        return new Date();
      }
    }
    return new Date();
  });
  
  const [checkOut, setCheckOut] = useState<Date>(() => {
    if (urlCheckOut) {
      try {
        return parse(urlCheckOut, "yyyy-MM-dd", new Date());
      } catch {
        return addDays(new Date(), 1);
      }
    }
    return addDays(new Date(), 1);
  });
  
  const [bbid, setBbid] = useState("36924");
  const [properties, setProperties] = useState<NBProperty[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");
  const [iframeKey, setIframeKey] = useState(0);

  const nights = Math.max(0, Math.floor((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)));

  // Fetch NightsBridge properties
  useEffect(() => {
    const fetchProperties = async () => {
      const { data } = await supabase
        .from("properties")
        .select("id, name, external_id")
        .eq("external_system", "nightsbridge")
        .eq("is_active", true)
        .order("name");
      
      if (data && data.length > 0) {
        setProperties(data);
        
        // Check if URL has a property ID and use that, otherwise use first property
        const initialPropertyId = urlPropertyId && data.some(p => p.id === urlPropertyId) 
          ? urlPropertyId 
          : data[0].id;
        
        setSelectedPropertyId(initialPropertyId);
        
        const selectedProp = data.find(p => p.id === initialPropertyId);
        if (selectedProp?.external_id) {
          setBbid(selectedProp.external_id);
        }
      }
    };
    fetchProperties();
  }, [urlPropertyId]);

  const handlePropertyChange = (propertyId: string) => {
    setSelectedPropertyId(propertyId);
    const property = properties.find(p => p.id === propertyId);
    if (property?.external_id) {
      setBbid(property.external_id);
      setIframeKey(prev => prev + 1);
    }
  };

  const handleCheckInChange = (date: Date | undefined) => {
    if (date) {
      setCheckIn(date);
      if (date >= checkOut) {
        setCheckOut(addDays(date, 1));
      }
    }
  };

  const handleCheckOutChange = (date: Date | undefined) => {
    if (date && date > checkIn) {
      setCheckOut(date);
    }
  };

  const handleCheckAvailability = () => {
    const url = `https://book.nightsbridge.com/${bbid}?startdate=${format(checkIn, "yyyy-MM-dd")}&enddate=${format(checkOut, "yyyy-MM-dd")}`;
    window.open(url, "_blank");
  };

  const handleBookNow = () => {
    window.open(`https://book.nightsbridge.com/${bbid}`, "_blank");
  };

  const refreshIframe = () => {
    setIframeKey(prev => prev + 1);
  };

  const getIframeUrl = () => {
    return `https://book.nightsbridge.com/${bbid}?startdate=${format(checkIn, "yyyy-MM-dd")}&enddate=${format(checkOut, "yyyy-MM-dd")}`;
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-foreground mb-2">NightsBridge Widget</h1>
        <p className="text-muted-foreground mb-6">Dev-only testing page for NightsBridge widget integration</p>

        <div className="grid gap-6">
          {/* Embedded NightsBridge Booking */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Embedded Booking (iframe test)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-4 mb-4">
                <div className="col-span-2">
                  <Label>Property</Label>
                  <Select value={selectedPropertyId} onValueChange={handlePropertyChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a property" />
                    </SelectTrigger>
                    <SelectContent>
                      {properties.map((property) => (
                        <SelectItem key={property.id} value={property.id}>
                          {property.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {properties.length === 0 && (
                    <p className="text-xs text-muted-foreground mt-1">No NightsBridge properties found</p>
                  )}
                </div>
                <div>
                  <Label>Check-In</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal h-auto py-2",
                          !checkIn && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                        <span className="uppercase text-sm">
                          {format(checkIn, "EEE")} <span className="font-bold text-lg">{format(checkIn, "d")}</span> {format(checkIn, "MMM yyyy")}
                        </span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={checkIn}
                        onSelect={handleCheckInChange}
                        disabled={(date) => date < new Date()}
                        initialFocus
                        className="pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <Label>Check-Out</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal h-auto py-2",
                          !checkOut && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                        <span className="uppercase text-sm">
                          {format(checkOut, "EEE")} <span className="font-bold text-lg">{format(checkOut, "d")}</span> {format(checkOut, "MMM yyyy")}
                        </span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={checkOut}
                        onSelect={handleCheckOutChange}
                        disabled={(date) => date <= checkIn}
                        initialFocus
                        className="pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              
              <div className="flex gap-2 mb-4">
                <Button onClick={refreshIframe} variant="outline" size="sm">
                  Reload Calendar
                </Button>
              </div>
              
              <div className="border rounded-lg overflow-hidden bg-background" style={{ height: "700px" }}>
                <iframe
                  key={iframeKey}
                  src={getIframeUrl()}
                  className="w-full h-full border-0"
                  title="NightsBridge Booking"
                  allow="payment"
                />
              </div>
              
              <p className="text-xs text-muted-foreground mt-2">
                Note: If the iframe shows blank or an error, NightsBridge may block embedding via X-Frame-Options headers.
              </p>
            </CardContent>
          </Card>

          {/* Fallback: Open in new tab */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Fallback: Open in New Tab</CardTitle>
            </CardHeader>
            <CardContent className="flex gap-4">
              <Button onClick={handleBookNow} variant="outline">
                Book Now
              </Button>
              <Button onClick={handleCheckAvailability}>
                Check Availability ({nights} nights)
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default NB;
