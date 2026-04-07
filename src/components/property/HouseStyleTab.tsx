import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X, Save, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

interface HouseStyleTabProps {
  companyLogo: string | null;
  setCompanyLogo: (v: string | null) => void;
  isLogoUploading: boolean;
  handleLogoUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleLogoDrop: (e: React.DragEvent) => void;
  roomsOnlineBookingsLink: string;
  setRoomsOnlineBookingsLink: (v: string) => void;
  titleBehaviour: string;
  setTitleBehaviour: (v: any) => void;
  merchantDetails: any;
  setMerchantDetails: (v: any) => void;
  adpayDetails: any;
  setAdpayDetails: (v: any) => void;
  motarApi: any;
  setMotarApi: (v: any) => void;
  websiteColors: any;
  setWebsiteColors: (v: any) => void;
  isDirty: boolean;
  loading: boolean;
  handleSubmit: (e: React.FormEvent) => void;
  handleNavigate: (path: string) => void;
}

export function HouseStyleTab(props: HouseStyleTabProps) {
  const {
    companyLogo, setCompanyLogo, isLogoUploading, handleLogoUpload, handleLogoDrop,
    roomsOnlineBookingsLink, setRoomsOnlineBookingsLink, titleBehaviour, setTitleBehaviour,
    merchantDetails, setMerchantDetails, adpayDetails, setAdpayDetails,
    motarApi, setMotarApi, websiteColors, setWebsiteColors,
    isDirty, loading, handleSubmit, handleNavigate,
  } = props;

  return (
    <form className="space-y-6">
      <Card>
        <CardHeader><CardTitle>COMPANY LOGO</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className={cn("border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors", isLogoUploading ? "border-primary bg-primary/5" : "border-blue-300 bg-blue-50")}
            onDragOver={(e) => e.preventDefault()} onDrop={handleLogoDrop} onClick={() => document.getElementById("logo-upload")?.click()}>
            {companyLogo ? (
              <div className="relative">
                <img src={companyLogo} alt="Company Logo" className="max-h-48 mx-auto" />
                <Button size="sm" variant="destructive" className="absolute top-2 right-2" onClick={(e) => { e.stopPropagation(); setCompanyLogo(null); }}><X className="h-4 w-4" /></Button>
              </div>
            ) : (<><Upload className="h-12 w-12 mx-auto mb-4 text-blue-500" /><p className="text-sm text-blue-700">Click or Drag and drop image to upload</p></>)}
            <input id="logo-upload" type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>BOOK PAGE HEADER SETTINGS</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Label className="whitespace-nowrap">RoomsOnline Bookings Link</Label>
            <Input value={roomsOnlineBookingsLink} onChange={(e) => setRoomsOnlineBookingsLink(e.target.value)} className="flex-1" />
            <Button size="sm" variant="ghost" className="text-destructive"><X className="h-4 w-4" /></Button>
          </div>
          <div className="flex items-center gap-4">
            <Label className="whitespace-nowrap">Title Behaviour</Label>
            <div className="flex gap-2">
              {(["property-name", "property-logo", "no-title"] as const).map(opt => (
                <Button key={opt} type="button" variant={titleBehaviour === opt ? "destructive" : "outline"} onClick={() => setTitleBehaviour(opt)}>
                  {opt.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>MERCHANT DETAILS</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {[
              { id: "organizationName", label: "Organization Name" },
              { id: "merchantId", label: "Merchant Id" },
              { id: "merchantKey", label: "Merchant Key" },
              { id: "splitAmount", label: "Split Amount %" },
            ].map(f => (
              <div key={f.id}><Label htmlFor={`merchant-${f.id}`}>{f.label}</Label><Input id={`merchant-${f.id}`} value={merchantDetails[f.id]} onChange={(e) => setMerchantDetails({ ...merchantDetails, [f.id]: e.target.value })} /></div>
            ))}
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded p-3 space-y-1">
            <p className="text-sm text-blue-700">• Split % will be of the total booking. The amount will be credited to RoomsOnline</p>
            <p className="text-sm text-blue-700">• Decimal split amount percentage will be round off to whole number</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>ADPAY DETAILS</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            {[
              { id: "merchant", label: "AdPay Merchant" },
              { id: "appId", label: "AdPay AppId" },
              { id: "storeNo", label: "AdPay StoreNo" },
              { id: "apiKey", label: "AdPay ApiKey" },
            ].map(f => (
              <div key={f.id}><Label htmlFor={`adpay-${f.id}`}>{f.label}</Label><Input id={`adpay-${f.id}`} value={adpayDetails[f.id]} onChange={(e) => setAdpayDetails({ ...adpayDetails, [f.id]: e.target.value })} /></div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>MOTAR API</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div><Label htmlFor="motar-venueid">Motar VenueId</Label><Input id="motar-venueid" value={motarApi.venueId} onChange={(e) => setMotarApi({ ...motarApi, venueId: e.target.value })} /></div>
            <div><Label htmlFor="motar-xapi">Motar XAPI</Label><Input id="motar-xapi" value={motarApi.xapi} onChange={(e) => setMotarApi({ ...motarApi, xapi: e.target.value })} /></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>WEBSITE COLOR</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-8">
            {[
              { key: "primary", label: "Primary" },
              { key: "secondary", label: "Secondary" },
              { key: "fontColor", label: "FontColor" },
            ].map(({ key, label }) => (
              <div key={key} className="space-y-2">
                <Label>{label}</Label>
                <div className="flex items-center gap-2">
                  <div className="w-12 h-12 rounded border-2 cursor-pointer" style={{ backgroundColor: websiteColors[key] }} onClick={() => document.getElementById(`${key}-color`)?.click()} />
                  <input id={`${key}-color`} type="color" value={websiteColors[key]} onChange={(e) => setWebsiteColors({ ...websiteColors, [key]: e.target.value })} className="sr-only" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-4">
        <Button type="button" variant="outline" onClick={() => handleNavigate("/admin/property-overview")}>Cancel</Button>
        {isDirty && <Button type="submit" className="bg-primary"><Save className="mr-2 h-4 w-4" />Save</Button>}
      </div>
    </form>
  );
}
