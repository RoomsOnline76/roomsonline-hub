import { Check, X, AlertCircle } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface ComparisonRow {
  feature: string;
  roomsOnline: 'yes' | 'no' | 'partial';
  otas: 'yes' | 'no' | 'partial';
  pmsWidgets: 'yes' | 'no' | 'partial';
  roomsOnlineNote?: string;
  otasNote?: string;
  widgetsNote?: string;
}

const comparisonData: ComparisonRow[] = [
  {
    feature: 'PMS-agnostic',
    roomsOnline: 'yes',
    otas: 'no',
    pmsWidgets: 'no',
    roomsOnlineNote: 'Works with any supported PMS'
  },
  {
    feature: 'Live availability verification',
    roomsOnline: 'yes',
    otas: 'partial',
    pmsWidgets: 'partial',
    roomsOnlineNote: 'Always verified before booking',
    otasNote: 'Often cached',
    widgetsNote: 'PMS-dependent'
  },
  {
    feature: 'Multi-room bookings',
    roomsOnline: 'yes',
    otas: 'partial',
    pmsWidgets: 'no',
    otasNote: 'Limited support'
  },
  {
    feature: 'Multi-property itineraries',
    roomsOnline: 'yes',
    otas: 'no',
    pmsWidgets: 'no'
  },
  {
    feature: 'PMS remains source of truth',
    roomsOnline: 'yes',
    otas: 'no',
    pmsWidgets: 'partial',
    roomsOnlineNote: 'Enforced by architecture',
    otasNote: 'OTA-controlled inventory'
  },
  {
    feature: 'No vendor lock-in',
    roomsOnline: 'yes',
    otas: 'no',
    pmsWidgets: 'partial',
    otasNote: 'High switching costs'
  },
  {
    feature: 'Full editorial control',
    roomsOnline: 'yes',
    otas: 'no',
    pmsWidgets: 'no',
    otasNote: 'Restricted templates'
  },
  {
    feature: 'Direct guest relationships',
    roomsOnline: 'yes',
    otas: 'no',
    pmsWidgets: 'yes',
    otasNote: 'Guest data owned by OTA'
  },
  {
    feature: 'Commission-free bookings',
    roomsOnline: 'yes',
    otas: 'no',
    pmsWidgets: 'yes',
    otasNote: '15-25% commission typical'
  },
  {
    feature: 'Unified booking experience',
    roomsOnline: 'yes',
    otas: 'partial',
    pmsWidgets: 'no',
    widgetsNote: 'Each property different'
  }
];

export function PlatformComparisonMatrix() {
  const StatusCell = ({ 
    status, 
    note 
  }: { 
    status: 'yes' | 'no' | 'partial'; 
    note?: string;
  }) => {
    const content = (
      <div className="flex items-center justify-center gap-1">
        {status === 'yes' && <Check className="h-5 w-5 text-green-600" />}
        {status === 'no' && <X className="h-5 w-5 text-muted-foreground/40" />}
        {status === 'partial' && <AlertCircle className="h-5 w-5 text-amber-500" />}
      </div>
    );

    if (note) {
      return (
        <div className="text-center">
          {content}
          <p className="text-xs text-muted-foreground mt-1">{note}</p>
        </div>
      );
    }

    return content;
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="min-w-[200px]">Feature</TableHead>
            <TableHead className="text-center min-w-[140px] bg-primary/5">
              <div className="font-semibold text-primary">RoomsOnline</div>
            </TableHead>
            <TableHead className="text-center min-w-[140px]">Traditional OTAs</TableHead>
            <TableHead className="text-center min-w-[140px]">PMS Widgets</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {comparisonData.map((row, index) => (
            <TableRow key={index}>
              <TableCell className="font-medium">{row.feature}</TableCell>
              <TableCell className="bg-primary/5">
                <StatusCell status={row.roomsOnline} note={row.roomsOnlineNote} />
              </TableCell>
              <TableCell>
                <StatusCell status={row.otas} note={row.otasNote} />
              </TableCell>
              <TableCell>
                <StatusCell status={row.pmsWidgets} note={row.widgetsNote} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
