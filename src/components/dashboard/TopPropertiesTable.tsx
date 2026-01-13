import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface PropertyData {
  id: string;
  name: string;
  gbv: number;
  commission: number;
  count: number;
}

interface TopPropertiesTableProps {
  data: PropertyData[];
  isLoading?: boolean;
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

export function TopPropertiesTable({ data, isLoading }: TopPropertiesTableProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Top Properties</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Top Properties</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
            No property data available
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Top Properties by Commission</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8 text-xs">#</TableHead>
              <TableHead className="text-xs">Property</TableHead>
              <TableHead className="text-right text-xs">Commission</TableHead>
              <TableHead className="text-right text-xs hidden sm:table-cell">Bookings</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.slice(0, 5).map((property, index) => (
              <TableRow key={property.id}>
                <TableCell className="text-xs text-muted-foreground font-medium">
                  {index + 1}
                </TableCell>
                <TableCell className="text-xs font-medium truncate max-w-[120px]">
                  {property.name}
                </TableCell>
                <TableCell className="text-right text-xs font-semibold text-primary">
                  {formatCurrency(property.commission)}
                </TableCell>
                <TableCell className="text-right text-xs text-muted-foreground hidden sm:table-cell">
                  {property.count}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
