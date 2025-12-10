import { useState, useEffect, useRef } from "react";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Calendar } from "lucide-react";
import flatpickr from "flatpickr";
import "flatpickr/dist/flatpickr.min.css";

const NB = () => {
  const [nights, setNights] = useState(0);
  const [bbid, setBbid] = useState("36924"); // Default NightsBridge property ID
  const [iframeKey, setIframeKey] = useState(0); // Force iframe refresh
  const checkInRef = useRef<HTMLInputElement>(null);
  const checkOutRef = useRef<HTMLInputElement>(null);
  const checkInPickerRef = useRef<flatpickr.Instance | null>(null);
  const checkOutPickerRef = useRef<flatpickr.Instance | null>(null);

  useEffect(() => {
    if (checkInRef.current && checkOutRef.current) {
      // Initialize check-in date picker
      checkInPickerRef.current = flatpickr(checkInRef.current, {
        dateFormat: "Y-m-d",
        allowInput: true,
        minDate: new Date(),
        defaultDate: new Date(),
        onChange: (selectedDates) => {
          if (selectedDates[0] && checkOutPickerRef.current) {
            const nextDay = new Date(selectedDates[0]);
            nextDay.setDate(nextDay.getDate() + 1);
            checkOutPickerRef.current.set("minDate", nextDay);
            calculateNights();
          }
        },
      });

      // Initialize check-out date picker
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      checkOutPickerRef.current = flatpickr(checkOutRef.current, {
        dateFormat: "Y-m-d",
        allowInput: true,
        minDate: tomorrow,
        defaultDate: tomorrow,
        onChange: (selectedDates) => {
          if (selectedDates[0] && checkInPickerRef.current) {
            checkInPickerRef.current.set("maxDate", selectedDates[0]);
            calculateNights();
          }
        },
      });

      // Initial calculation
      calculateNights();
    }

    return () => {
      checkInPickerRef.current?.destroy();
      checkOutPickerRef.current?.destroy();
    };
  }, []);

  const calculateNights = () => {
    if (checkInRef.current?.value && checkOutRef.current?.value) {
      const startDate = new Date(checkInRef.current.value);
      const endDate = new Date(checkOutRef.current.value);
      const difference = endDate.getTime() - startDate.getTime();
      const nightsCount = Math.floor(difference / (1000 * 60 * 60 * 24));
      setNights(nightsCount > 0 ? nightsCount : 0);
    }
  };

  const handleCheckAvailability = () => {
    const checkIn = checkInRef.current?.value;
    const checkOut = checkOutRef.current?.value;
    
    if (checkIn && checkOut) {
      const url = `https://book.nightsbridge.com/${bbid}?startdate=${checkIn}&enddate=${checkOut}`;
      window.open(url, "_blank");
    }
  };

  const handleBookNow = () => {
    window.open(`https://book.nightsbridge.com/${bbid}`, "_blank");
  };

  const refreshIframe = () => {
    setIframeKey(prev => prev + 1);
  };

  const getIframeUrl = () => {
    const checkIn = checkInRef.current?.value || new Date().toISOString().split('T')[0];
    const checkOut = checkOutRef.current?.value || new Date(Date.now() + 86400000).toISOString().split('T')[0];
    // Using nbid=371 parameter which enables iframe embedding
    return `https://book.nightsbridge.com/${bbid}?nbid=371&startdate=${checkIn}&enddate=${checkOut}`;
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
                  <Label htmlFor="bbid">BBID</Label>
                  <input
                    id="bbid"
                    type="text"
                    value={bbid}
                    onChange={(e) => setBbid(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    placeholder="e.g. 36924"
                  />
                </div>
                <div>
                  <Label>Check-In</Label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                      ref={checkInRef}
                      type="text"
                      className="flex h-10 w-full rounded-md border border-input bg-background pl-10 pr-3 py-2 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <Label>Check-Out</Label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                      ref={checkOutRef}
                      type="text"
                      onChange={calculateNights}
                      className="flex h-10 w-full rounded-md border border-input bg-background pl-10 pr-3 py-2 text-sm"
                    />
                  </div>
                </div>
              </div>
              
              <div className="flex gap-2 mb-4">
                <Button onClick={refreshIframe} variant="outline" size="sm">
                  Reload Calendar
                </Button>
              </div>
              
              <div className="border rounded-lg overflow-hidden bg-white" style={{ height: "700px" }}>
                <iframe
                  key={iframeKey}
                  src={getIframeUrl()}
                  className="w-full h-full border-0"
                  title="NightsBridge Booking"
                  allow="payment"
                />
              </div>
              
              <p className="text-xs text-muted-foreground mt-2">
                Using <code className="bg-muted px-1 rounded">nbid=371</code> parameter to enable embedding. Full calendar with rates should display.
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
