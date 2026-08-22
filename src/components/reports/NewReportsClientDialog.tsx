import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DEFAULT_REPORT_SOURCE,
  isReportSourceKey,
  listAdapters,
  type ReportSourceKey,
} from "@/lib/report-adapters";
import { useReportsClients } from "@/hooks/useReportsClients";
import { reportsPath } from "@/lib/config";

/**
 * Creates a standalone reporting client — a lodge or hotel Rooms Online only
 * produces revenue reports for, with no presence anywhere else in ROL.
 */
export function NewReportsClientDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("South Africa");
  const [roomCount, setRoomCount] = useState("1");
  const [sourceType, setSourceType] = useState<ReportSourceKey>(DEFAULT_REPORT_SOURCE);
  const [specialSet, setSpecialSet] = useState("none");

  const navigate = useNavigate();
  const { createClient } = useReportsClients();

  const reset = () => {
    setName("");
    setCity("");
    setCountry("South Africa");
    setRoomCount("1");
    setSourceType(DEFAULT_REPORT_SOURCE);
    setSpecialSet("none");
  };

  const handleSubmit = async () => {
    const rooms = Number(roomCount);
    if (!name.trim()) {
      toast.error("Client name is required");
      return;
    }
    if (!Number.isFinite(rooms) || rooms < 1) {
      toast.error("Sellable rooms must be 1 or more");
      return;
    }
    try {
      const id = await createClient.mutateAsync({
        name,
        city,
        country,
        roomCount: rooms,
        defaultSourceType: sourceType,
        specialReportSet: specialSet === "none" ? null : specialSet,
      });
      toast.success(`${name.trim()} added as a reporting client`);
      setOpen(false);
      reset();
      navigate(reportsPath(`/settings/${id}`));
    } catch (error) {
      toast.error("Could not create reporting client", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <Building className="h-4 w-4 mr-2" />
          New reporting client
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New reporting client</DialogTitle>
          <DialogDescription>
            For standalone clients Rooms Online only reports on. These never appear in the
            property list, the website, or the channel manager.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="client-name">Client name</Label>
            <Input
              id="client-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Kalahari Sands Lodge"
              autoFocus
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="client-city">City / area</Label>
              <Input
                id="client-city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Cape Town"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client-country">Country</Label>
              <Input
                id="client-country"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="client-rooms">Sellable rooms</Label>
              <Input
                id="client-rooms"
                type="number"
                min={1}
                value={roomCount}
                onChange={(e) => setRoomCount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client-source">Default report source</Label>
              <Select
                value={sourceType}
                onValueChange={(next) => {
                  if (isReportSourceKey(next)) setSourceType(next);
                }}
              >
                <SelectTrigger id="client-source">
                  <SelectValue placeholder="Choose a source" />
                </SelectTrigger>
                <SelectContent>
                  {listAdapters().map((option) => (
                    <SelectItem
                      key={option.key}
                      value={option.key}
                      disabled={option.status !== "ready"}
                    >
                      {option.label}
                      {option.status !== "ready" && " — coming soon"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="client-special">Specialised report set</Label>
            <Select value={specialSet} onValueChange={setSpecialSet}>
              <SelectTrigger id="client-special">
                <SelectValue placeholder="Standard pack only" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Standard pack only</SelectItem>
                <SelectItem value="cheetaplains">CheetaPlains owner pack</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={createClient.isPending}>
            {createClient.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create client
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
