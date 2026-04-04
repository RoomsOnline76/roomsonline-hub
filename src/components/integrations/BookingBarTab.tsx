import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CodeSnippetBlock } from "./CodeSnippetBlock";
import { IntegrationToggle } from "./IntegrationToggle";
import { WidgetPreviewFrame } from "./WidgetPreviewFrame";
import { LayoutTemplate, AlertCircle, Eye, EyeOff } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PUBLIC_DOMAIN } from "@/lib/config";
import { EntryPointSelector, buildEntryUrl, type EntryPointOptions } from "./EntryPointSelector";

interface BookingBarTabProps {
  property: { id: string; name: string; slug: string; brand_primary_color: string | null };
}

export function BookingBarTab({ property }: BookingBarTabProps) {
  const [brandColor, setBrandColor] = useState(property.brand_primary_color || "#e91e8c");
  const [position, setPosition] = useState<"bottom" | "top">("bottom");
  const [showPreview, setShowPreview] = useState(false);
  const [entryOpts, setEntryOpts] = useState<EntryPointOptions>({ entryPoint: "rooms" });

  const bookingUrl = buildEntryUrl(property, entryOpts, {
    source: "website",
    integration: "booking_bar",
    property_id: property.id,
    brand_color: brandColor,
  });

  const posStyle = position === "top" ? "position:fixed;top:0;left:0;right:0;" : "position:fixed;bottom:0;left:0;right:0;";
  const shadowDir = position === "top" ? "box-shadow:0 4px 20px rgba(0,0,0,0.18);" : "box-shadow:0 -4px 20px rgba(0,0,0,0.18);";
  const calPos = position === "top" ? "top:100%;margin-top:8px;" : "bottom:100%;margin-bottom:8px;";

  const snippet = `<!-- RoomsOnline Floating Booking Bar with Calendar -->
<div id="rolos-booking-bar" style="${posStyle}z-index:9999;font-family:system-ui,-apple-system,sans-serif;">
  <div style="background:${brandColor};${shadowDir}padding:10px 20px;display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;">
    <button id="rolos-date-btn" style="display:flex;align-items:center;gap:8px;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.3);color:#fff;padding:8px 16px;border-radius:999px;font-size:14px;font-weight:500;cursor:pointer;backdrop-filter:blur(4px);transition:all 0.2s;">
      <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
      <span id="rolos-date-label">Select dates</span>
    </button>
    <button id="rolos-book-btn" style="background:#fff;color:${brandColor};border:none;padding:10px 28px;border-radius:999px;font-weight:700;font-size:14px;cursor:pointer;transition:all 0.2s;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
      Book Now
    </button>
  </div>

  <!-- Calendar Popup -->
  <div id="rolos-cal" style="display:none;position:absolute;${calPos}left:50%;transform:translateX(-50%);width:340px;background:#fff;border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,0.2);overflow:hidden;animation:rolosFadeIn 0.25s ease-out;">
    <div style="padding:16px 16px 8px;display:flex;align-items:center;justify-content:space-between;">
      <button id="rolos-prev-month" style="border:none;background:none;cursor:pointer;padding:6px;border-radius:50%;color:#666;font-size:18px;">&#8249;</button>
      <span id="rolos-month-label" style="font-weight:600;font-size:15px;color:#111;"></span>
      <button id="rolos-next-month" style="border:none;background:none;cursor:pointer;padding:6px;border-radius:50%;color:#666;font-size:18px;">&#8250;</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(7,1fr);padding:0 12px;margin-bottom:4px;">
      <span style="text-align:center;font-size:11px;color:#999;padding:4px 0;font-weight:500;">Su</span>
      <span style="text-align:center;font-size:11px;color:#999;padding:4px 0;font-weight:500;">Mo</span>
      <span style="text-align:center;font-size:11px;color:#999;padding:4px 0;font-weight:500;">Tu</span>
      <span style="text-align:center;font-size:11px;color:#999;padding:4px 0;font-weight:500;">We</span>
      <span style="text-align:center;font-size:11px;color:#999;padding:4px 0;font-weight:500;">Th</span>
      <span style="text-align:center;font-size:11px;color:#999;padding:4px 0;font-weight:500;">Fr</span>
      <span style="text-align:center;font-size:11px;color:#999;padding:4px 0;font-weight:500;">Sa</span>
    </div>
    <div id="rolos-days" style="display:grid;grid-template-columns:repeat(7,1fr);padding:0 12px 12px;gap:2px;"></div>
    <div id="rolos-summary" style="display:none;padding:10px 16px;border-top:1px solid #f0f0f0;background:#fafafa;font-size:13px;color:#666;text-align:center;"></div>
    <div style="padding:4px 12px 12px;">
      <button id="rolos-confirm-btn" style="width:100%;padding:10px;border:none;border-radius:10px;background:${brandColor};color:#fff;font-weight:600;font-size:14px;cursor:pointer;opacity:0.4;pointer-events:none;transition:all 0.2s;">Confirm Dates</button>
    </div>
  </div>
</div>

<style>
@keyframes rolosFadeIn{from{opacity:0;transform:translateX(-50%) translateY(8px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
#rolos-cal .rolos-day{border:none;background:none;width:100%;aspect-ratio:1;border-radius:50%;font-size:13px;font-weight:500;cursor:pointer;transition:all 0.15s;color:#333;position:relative;}
#rolos-cal .rolos-day:hover:not(:disabled){background:#f3f4f6;}
#rolos-cal .rolos-day:disabled{color:#ccc;cursor:default;}
#rolos-cal .rolos-day.rolos-ci{background:${brandColor};color:#fff;border-radius:50% 0 0 50%;}
#rolos-cal .rolos-day.rolos-co{background:${brandColor};color:#fff;border-radius:0 50% 50% 0;}
#rolos-cal .rolos-day.rolos-ci.rolos-co{border-radius:50%;}
#rolos-cal .rolos-day.rolos-range{background:${brandColor}22;color:${brandColor};border-radius:0;}
#rolos-cal .rolos-day.rolos-today:not(.rolos-ci):not(.rolos-co):not(.rolos-range){box-shadow:inset 0 0 0 1.5px ${brandColor};color:${brandColor};}
</style>

<script>
(function(){
  var bc='${brandColor}',ci=null,co=null,sel=0,
      cm=new Date(),
      mn=['January','February','March','April','May','June','July','August','September','October','November','December'];
  var td=new Date();td.setHours(0,0,0,0);
  if(td.getDate()>25){cm=new Date(td.getFullYear(),td.getMonth()+1,1);}

  function fmt(d){return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());}
  function p(n){return n<10?'0'+n:n;}
  function sameDay(a,b){return a&&b&&a.getTime()===b.getTime();}
  function inRange(d){return ci&&co&&d>ci&&d<co;}
  function fmtShort(d){return mn[d.getMonth()].slice(0,3)+' '+d.getDate();}

  function pick(d){
    if(sel===0||!ci){ci=d;co=null;sel=1;}
    else{if(d<ci){ci=d;co=null;}else if(sameDay(d,ci)){var nx=new Date(d);nx.setDate(nx.getDate()+1);co=nx;sel=0;}else{co=d;sel=0;}}
    render();updateLabel();
  }

  function updateLabel(){
    var lb=document.getElementById('rolos-date-label');
    var btn=document.getElementById('rolos-confirm-btn');
    var sum=document.getElementById('rolos-summary');
    if(ci&&co){
      var n=Math.round((co-ci)/864e5);
      lb.textContent=fmtShort(ci)+' – '+fmtShort(co)+' ('+n+' night'+(n!==1?'s':'')+')';
      btn.style.opacity='1';btn.style.pointerEvents='auto';
      sum.style.display='block';sum.textContent=fmtShort(ci)+' → '+fmtShort(co)+' · '+n+' night'+(n!==1?'s':'');
    }else if(ci){
      lb.textContent=fmtShort(ci)+' – Check-out';
      btn.style.opacity='0.4';btn.style.pointerEvents='none';
      sum.style.display='block';sum.textContent='Select check-out date';
    }else{
      lb.textContent='Select dates';
      btn.style.opacity='0.4';btn.style.pointerEvents='none';
      sum.style.display='none';
    }
  }

  function render(){
    document.getElementById('rolos-month-label').textContent=mn[cm.getMonth()]+' '+cm.getFullYear();
    var g=document.getElementById('rolos-days');g.innerHTML='';
    var f=new Date(cm.getFullYear(),cm.getMonth(),1);
    var l=new Date(cm.getFullYear(),cm.getMonth()+1,0);
    for(var i=0;i<f.getDay();i++){var e=document.createElement('span');g.appendChild(e);}
    for(var d=1;d<=l.getDate();d++){
      var dt=new Date(cm.getFullYear(),cm.getMonth(),d);
      var b=document.createElement('button');b.className='rolos-day';b.textContent=d;b.disabled=dt<td;
      if(sameDay(dt,ci)&&sameDay(dt,co)){b.className+=' rolos-ci rolos-co';}
      else if(sameDay(dt,ci)){b.className+=' rolos-ci';}
      else if(sameDay(dt,co)){b.className+=' rolos-co';}
      else if(inRange(dt)){b.className+=' rolos-range';}
      if(sameDay(dt,td)&&!sameDay(dt,ci)&&!sameDay(dt,co)){b.className+=' rolos-today';}
      (function(dd){b.addEventListener('click',function(){if(!b.disabled)pick(dd);});})(dt);
      g.appendChild(b);
    }
  }

  document.getElementById('rolos-date-btn').addEventListener('click',function(){
    var c=document.getElementById('rolos-cal');
    c.style.display=c.style.display==='none'?'block':'none';
    if(c.style.display==='block')render();
  });

  document.getElementById('rolos-book-btn').addEventListener('click',function(){
    var u='${bookingUrl}';
    if(ci)u+='&checkin='+fmt(ci);
    if(co)u+='&checkout='+fmt(co);
    window.open(u,'_blank');
  });

  document.getElementById('rolos-prev-month').addEventListener('click',function(){
    cm=new Date(cm.getFullYear(),cm.getMonth()-1,1);render();
  });

  document.getElementById('rolos-next-month').addEventListener('click',function(){
    cm=new Date(cm.getFullYear(),cm.getMonth()+1,1);render();
  });

  document.getElementById('rolos-confirm-btn').addEventListener('click',function(){
    document.getElementById('rolos-cal').style.display='none';
  });

  ['rolos-prev-month','rolos-next-month'].forEach(function(id){
    var el=document.getElementById(id);
    el.addEventListener('mouseover',function(){el.style.background='#f3f4f6';});
    el.addEventListener('mouseout',function(){el.style.background='none';});
  });

  render();updateLabel();
})();
</script>`;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LayoutTemplate className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Floating Booking Bar</CardTitle>
          </div>
          <IntegrationToggle propertyId={property.id} integrationType="booking_bar" />
        </div>
        <CardDescription>
          A persistent bar fixed to the {position} of your website with a <strong>custom calendar date picker</strong>{" "}
          featuring the expanding range selection in your brand colour{" "}
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-full border" style={{ backgroundColor: brandColor }} />
            <code className="bg-muted px-1 rounded text-xs">{brandColor}</code>
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Platform fee notice */}
        <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/30 p-3 text-sm">
          <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <span className="text-muted-foreground">
            <strong>Platform fee:</strong> A platform fee of 2% (or as per your property agreement)
            applies to bookings made through the booking bar.
          </span>
        </div>

        {/* Controls */}
        <div className="grid grid-cols-2 gap-4 p-4 rounded-lg border border-border bg-muted/20">
          <div className="space-y-2">
            <Label className="text-xs">Brand Colour</Label>
            <div className="flex items-center gap-2">
              <input type="color" value={brandColor} onChange={(e) => setBrandColor(e.target.value)} className="w-8 h-8 rounded border-none cursor-pointer" />
              <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{brandColor}</code>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Position</Label>
            <Select value={position} onValueChange={(v) => setPosition(v as "bottom" | "top")}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bottom">Bottom</SelectItem>
                <SelectItem value="top">Top</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Preview toggle */}
        <Button variant="outline" size="sm" onClick={() => setShowPreview(!showPreview)} className="gap-1.5">
          {showPreview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {showPreview ? "Hide Preview" : "Show Preview"}
        </Button>

        {showPreview && (
          <WidgetPreviewFrame title="Booking Bar Preview" url="yoursite.com" height={160}>
            <div className="relative h-full bg-muted/30">
              {/* Page content mockup */}
              <div className="p-4 space-y-2">
                <div className="h-3 w-3/4 bg-muted rounded" />
                <div className="h-3 w-1/2 bg-muted rounded" />
                <div className="h-3 w-2/3 bg-muted rounded" />
              </div>
              {/* Bar */}
              <div
                className="absolute left-0 right-0"
                style={{
                  [position]: 0,
                  background: brandColor,
                  padding: "8px 16px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "10px",
                  boxShadow: position === "top" ? "0 4px 12px rgba(0,0,0,0.15)" : "0 -4px 12px rgba(0,0,0,0.15)",
                }}
              >
                <span className="text-white/80 text-xs border border-white/30 rounded-full px-3 py-1 bg-white/10">
                  📅 Select dates
                </span>
                <span className="text-xs font-bold rounded-full px-4 py-1.5 bg-white" style={{ color: brandColor }}>
                  Book Now
                </span>
              </div>
            </div>
          </WidgetPreviewFrame>
        )}

        <CodeSnippetBlock code={snippet} language="html" title="Floating Bar with Expanding Calendar" />

        <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground">
          <h5 className="font-medium text-foreground mb-1">How to install</h5>
          <ol className="list-decimal list-inside space-y-1">
            <li>Copy the snippet above</li>
            <li>Paste it just before <code className="bg-muted px-1 rounded">&lt;/body&gt;</code> in your website</li>
            <li>The bar appears fixed at the {position} with a date pill in your brand colour</li>
            <li>Guests tap the pill → calendar expands with the "snake" range selector → select check-in and check-out</li>
            <li>Click <strong>Book Now</strong> to redirect to the booking portal with dates pre-filled</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}
