import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Cloud, ChevronDown, ChevronRight, MapPin, Wifi, DollarSign, FileText, Clock, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface HostfullyRoomDetailsProps {
  room: any;
  onFieldChange: (field: string, value: any) => void;
  isFieldPmsSynced: (fieldName: string) => boolean;
  getPmsFieldClass: (fieldName: string) => string;
}

export function HostfullyRoomDetails({ 
  room, 
  onFieldChange, 
  isFieldPmsSynced, 
  getPmsFieldClass 
}: HostfullyRoomDetailsProps) {
  const [showWifiPassword, setShowWifiPassword] = useState(false);
  const [openSections, setOpenSections] = useState(() => ({
    timing: true,
    wifi: !!(room?.wifiNetwork || room?.wifiPassword),
    pricing: !!(room?.dailyRate || room?.cleaningFee),
    policies: !!(room?.houseRules || room?.cancellationPolicy),
    location: !!(room?.addressCity || room?.latitude),
  }));

  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const PmsLabel = ({ children, field }: { children: React.ReactNode; field: string }) => (
    <Label className="text-xs whitespace-nowrap flex items-center gap-0.5">
      {children}
      {isFieldPmsSynced(field) && <Cloud className="h-2.5 w-2.5 text-primary" />}
    </Label>
  );

  // Check if this room has any Hostfully synced data
  const hasHostfullyData = room?.pms_synced_fields?.length > 0 || 
    room?.checkInTime || room?.checkOutTime || 
    room?.wifiNetwork || room?.dailyRate ||
    room?.houseRules || room?.addressCity;

  if (!hasHostfullyData) {
    return null;
  }

  return (
    <div className="space-y-2 mt-4">
      {/* Sync metadata banner */}
      {room?.lastSyncedAt && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1">
          <Cloud className="h-3 w-3 text-primary" />
          <span>Last synced: {new Date(room.lastSyncedAt).toLocaleString()}</span>
          <Badge variant="outline" className="text-[10px] h-4">
            {room?.pms_synced_fields?.length || 0} fields
          </Badge>
        </div>
      )}

      {/* Check-In/Out Times - Compact Row */}
      <Collapsible open={openSections.timing} onOpenChange={() => toggleSection('timing')}>
        <CollapsibleTrigger className="flex items-center gap-2 w-full py-1 hover:bg-muted/50 rounded px-1 transition-colors">
          {openSections.timing ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <Clock className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs font-medium">Check-In/Out Times</span>
          {(room?.checkInTime || room?.checkOutTime) && (
            <Badge variant="secondary" className="text-[10px] h-4 ml-auto">
              {room?.checkInTime || '—'} / {room?.checkOutTime || '—'}
            </Badge>
          )}
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <div className="grid grid-cols-3 gap-2 pl-5">
            <div className="flex items-center gap-1">
              <PmsLabel field="checkInTime">Check-In</PmsLabel>
              <Input
                type="text"
                placeholder="14:00"
                className={cn("h-7 text-xs w-20", getPmsFieldClass("checkInTime"))}
                value={room?.checkInTime || ""}
                onChange={(e) => onFieldChange("checkInTime", e.target.value)}
                disabled={isFieldPmsSynced("checkInTime")}
              />
            </div>
            <div className="flex items-center gap-1">
              <PmsLabel field="checkOutTime">Check-Out</PmsLabel>
              <Input
                type="text"
                placeholder="10:00"
                className={cn("h-7 text-xs w-20", getPmsFieldClass("checkOutTime"))}
                value={room?.checkOutTime || ""}
                onChange={(e) => onFieldChange("checkOutTime", e.target.value)}
                disabled={isFieldPmsSynced("checkOutTime")}
              />
            </div>
            <div className="flex items-center gap-1">
              <PmsLabel field="propertyType">Type</PmsLabel>
              <Input
                type="text"
                placeholder="Apartment"
                className={cn("h-7 text-xs", getPmsFieldClass("propertyType"))}
                value={room?.propertyType || ""}
                onChange={(e) => onFieldChange("propertyType", e.target.value)}
                disabled={isFieldPmsSynced("propertyType")}
              />
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* WiFi Details */}
      <Collapsible open={openSections.wifi} onOpenChange={() => toggleSection('wifi')}>
        <CollapsibleTrigger className="flex items-center gap-2 w-full py-1 hover:bg-muted/50 rounded px-1 transition-colors">
          {openSections.wifi ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <Wifi className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs font-medium">WiFi & Connectivity</span>
          {room?.wifiNetwork && (
            <Badge variant="secondary" className="text-[10px] h-4 ml-auto">
              {room.wifiNetwork}
            </Badge>
          )}
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <div className="grid grid-cols-2 gap-2 pl-5">
            <div className="space-y-1">
              <PmsLabel field="wifiNetwork">Network Name</PmsLabel>
              <Input
                type="text"
                className={cn("h-7 text-xs", getPmsFieldClass("wifiNetwork"))}
                value={room?.wifiNetwork || ""}
                onChange={(e) => onFieldChange("wifiNetwork", e.target.value)}
                disabled={isFieldPmsSynced("wifiNetwork")}
              />
            </div>
            <div className="space-y-1">
              <PmsLabel field="wifiPassword">Password</PmsLabel>
              <div className="relative">
                <Input
                  type={showWifiPassword ? "text" : "password"}
                  className={cn("h-7 text-xs pr-8", getPmsFieldClass("wifiPassword"))}
                  value={room?.wifiPassword || ""}
                  onChange={(e) => onFieldChange("wifiPassword", e.target.value)}
                  disabled={isFieldPmsSynced("wifiPassword")}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-7 w-7 p-0"
                  onClick={() => setShowWifiPassword(!showWifiPassword)}
                >
                  {showWifiPassword ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                </Button>
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Pricing (from PMS) */}
      <Collapsible open={openSections.pricing} onOpenChange={() => toggleSection('pricing')}>
        <CollapsibleTrigger className="flex items-center gap-2 w-full py-1 hover:bg-muted/50 rounded px-1 transition-colors">
          {openSections.pricing ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <DollarSign className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs font-medium">Pricing (from PMS)</span>
          {room?.dailyRate && (
            <Badge variant="secondary" className="text-[10px] h-4 ml-auto">
              {room.currency || 'ZAR'} {room.dailyRate}/night
            </Badge>
          )}
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <div className="grid grid-cols-3 gap-2 pl-5">
            <div className="space-y-1">
              <PmsLabel field="dailyRate">Daily Rate</PmsLabel>
              <Input
                type="number"
                className={cn("h-7 text-xs", getPmsFieldClass("dailyRate"))}
                value={room?.dailyRate || ""}
                onChange={(e) => onFieldChange("dailyRate", parseFloat(e.target.value) || 0)}
                disabled={isFieldPmsSynced("dailyRate")}
              />
            </div>
            <div className="space-y-1">
              <PmsLabel field="currency">Currency</PmsLabel>
              <Input
                type="text"
                className={cn("h-7 text-xs", getPmsFieldClass("currency"))}
                value={room?.currency || "ZAR"}
                onChange={(e) => onFieldChange("currency", e.target.value)}
                disabled={isFieldPmsSynced("currency")}
              />
            </div>
            <div className="space-y-1">
              <PmsLabel field="cleaningFee">Cleaning Fee</PmsLabel>
              <Input
                type="number"
                className={cn("h-7 text-xs", getPmsFieldClass("cleaningFee"))}
                value={room?.cleaningFee || ""}
                onChange={(e) => onFieldChange("cleaningFee", parseFloat(e.target.value) || 0)}
                disabled={isFieldPmsSynced("cleaningFee")}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 pl-5 mt-2">
            <div className="space-y-1">
              <PmsLabel field="securityDeposit">Security Deposit</PmsLabel>
              <Input
                type="number"
                className={cn("h-7 text-xs", getPmsFieldClass("securityDeposit"))}
                value={room?.securityDeposit || ""}
                onChange={(e) => onFieldChange("securityDeposit", parseFloat(e.target.value) || 0)}
                disabled={isFieldPmsSynced("securityDeposit")}
              />
            </div>
            <div className="space-y-1">
              <PmsLabel field="extraGuestFee">Extra Guest Fee</PmsLabel>
              <Input
                type="number"
                className={cn("h-7 text-xs", getPmsFieldClass("extraGuestFee"))}
                value={room?.extraGuestFee || ""}
                onChange={(e) => onFieldChange("extraGuestFee", parseFloat(e.target.value) || 0)}
                disabled={isFieldPmsSynced("extraGuestFee")}
              />
            </div>
            <div className="space-y-1">
              <PmsLabel field="taxRate">Tax Rate (%)</PmsLabel>
              <Input
                type="number"
                className={cn("h-7 text-xs", getPmsFieldClass("taxRate"))}
                value={room?.taxRate || ""}
                onChange={(e) => onFieldChange("taxRate", parseFloat(e.target.value) || 0)}
                disabled={isFieldPmsSynced("taxRate")}
              />
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Policies & Instructions */}
      <Collapsible open={openSections.policies} onOpenChange={() => toggleSection('policies')}>
        <CollapsibleTrigger className="flex items-center gap-2 w-full py-1 hover:bg-muted/50 rounded px-1 transition-colors">
          {openSections.policies ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <FileText className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs font-medium">Policies & Instructions</span>
          {(room?.houseRules || room?.checkInInstructions || room?.cancellationPolicy) && (
            <Badge variant="secondary" className="text-[10px] h-4 ml-auto">
              {[room?.houseRules, room?.checkInInstructions, room?.cancellationPolicy].filter(Boolean).length} set
            </Badge>
          )}
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2 space-y-2 pl-5">
          <div className="space-y-1">
            <PmsLabel field="houseRules">House Rules</PmsLabel>
            <Textarea
              rows={2}
              className={cn("text-xs", getPmsFieldClass("houseRules"))}
              value={room?.houseRules || ""}
              onChange={(e) => onFieldChange("houseRules", e.target.value)}
              disabled={isFieldPmsSynced("houseRules")}
              placeholder="House rules from PMS..."
            />
          </div>
          <div className="space-y-1">
            <PmsLabel field="checkInInstructions">Check-In Instructions</PmsLabel>
            <Textarea
              rows={2}
              className={cn("text-xs", getPmsFieldClass("checkInInstructions"))}
              value={room?.checkInInstructions || ""}
              onChange={(e) => onFieldChange("checkInInstructions", e.target.value)}
              disabled={isFieldPmsSynced("checkInInstructions")}
              placeholder="Check-in instructions from PMS..."
            />
          </div>
          <div className="space-y-1">
            <PmsLabel field="cancellationPolicy">Cancellation Policy</PmsLabel>
            <Input
              type="text"
              className={cn("h-7 text-xs", getPmsFieldClass("cancellationPolicy"))}
              value={room?.cancellationPolicy || ""}
              onChange={(e) => onFieldChange("cancellationPolicy", e.target.value)}
              disabled={isFieldPmsSynced("cancellationPolicy")}
              placeholder="e.g., Flexible, Moderate, Strict"
            />
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Location (from PMS) */}
      <Collapsible open={openSections.location} onOpenChange={() => toggleSection('location')}>
        <CollapsibleTrigger className="flex items-center gap-2 w-full py-1 hover:bg-muted/50 rounded px-1 transition-colors">
          {openSections.location ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <MapPin className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs font-medium">Location (from PMS)</span>
          {room?.addressCity && (
            <Badge variant="secondary" className="text-[10px] h-4 ml-auto">
              {room.addressCity}{room.addressCountry ? `, ${room.addressCountry}` : ''}
            </Badge>
          )}
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2 space-y-2 pl-5">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <PmsLabel field="addressStreet">Street</PmsLabel>
              <Input
                type="text"
                className={cn("h-7 text-xs", getPmsFieldClass("addressStreet"))}
                value={room?.addressStreet || ""}
                onChange={(e) => onFieldChange("addressStreet", e.target.value)}
                disabled={isFieldPmsSynced("addressStreet")}
              />
            </div>
            <div className="space-y-1">
              <PmsLabel field="addressCity">City</PmsLabel>
              <Input
                type="text"
                className={cn("h-7 text-xs", getPmsFieldClass("addressCity"))}
                value={room?.addressCity || ""}
                onChange={(e) => onFieldChange("addressCity", e.target.value)}
                disabled={isFieldPmsSynced("addressCity")}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <PmsLabel field="addressState">State/Province</PmsLabel>
              <Input
                type="text"
                className={cn("h-7 text-xs", getPmsFieldClass("addressState"))}
                value={room?.addressState || ""}
                onChange={(e) => onFieldChange("addressState", e.target.value)}
                disabled={isFieldPmsSynced("addressState")}
              />
            </div>
            <div className="space-y-1">
              <PmsLabel field="addressPostalCode">Postal Code</PmsLabel>
              <Input
                type="text"
                className={cn("h-7 text-xs", getPmsFieldClass("addressPostalCode"))}
                value={room?.addressPostalCode || ""}
                onChange={(e) => onFieldChange("addressPostalCode", e.target.value)}
                disabled={isFieldPmsSynced("addressPostalCode")}
              />
            </div>
            <div className="space-y-1">
              <PmsLabel field="addressCountry">Country</PmsLabel>
              <Input
                type="text"
                className={cn("h-7 text-xs", getPmsFieldClass("addressCountry"))}
                value={room?.addressCountry || ""}
                onChange={(e) => onFieldChange("addressCountry", e.target.value)}
                disabled={isFieldPmsSynced("addressCountry")}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <PmsLabel field="latitude">Latitude</PmsLabel>
              <Input
                type="number"
                step="0.000001"
                className={cn("h-7 text-xs", getPmsFieldClass("latitude"))}
                value={room?.latitude || ""}
                onChange={(e) => onFieldChange("latitude", parseFloat(e.target.value) || null)}
                disabled={isFieldPmsSynced("latitude")}
              />
            </div>
            <div className="space-y-1">
              <PmsLabel field="longitude">Longitude</PmsLabel>
              <Input
                type="number"
                step="0.000001"
                className={cn("h-7 text-xs", getPmsFieldClass("longitude"))}
                value={room?.longitude || ""}
                onChange={(e) => onFieldChange("longitude", parseFloat(e.target.value) || null)}
                disabled={isFieldPmsSynced("longitude")}
              />
            </div>
          </div>
          {room?.latitude && room?.longitude && (
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              Coordinates: {room.latitude?.toFixed(6)}, {room.longitude?.toFixed(6)}
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
