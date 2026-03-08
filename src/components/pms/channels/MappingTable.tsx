import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X, Pencil } from "lucide-react";
import { getChannelLabel } from "./ChannelLogo";

interface MappingRow {
  id: string;
  connection_id: string;
  channel_name: string;
  internal_name: string;
  external_id: string;
  external_name: string | null;
  is_active: boolean;
}

interface MappingTableProps {
  title: string;
  mappings: MappingRow[];
  onUpdate: (id: string, externalId: string, externalName: string) => void;
  readOnly?: boolean;
}

export function MappingTable({ title, mappings, onUpdate, readOnly }: MappingTableProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState({ externalId: "", externalName: "" });

  const startEdit = (row: MappingRow) => {
    setEditingId(row.id);
    setEditValues({ externalId: row.external_id, externalName: row.external_name ?? "" });
  };

  const saveEdit = (id: string) => {
    onUpdate(id, editValues.externalId, editValues.externalName);
    setEditingId(null);
  };

  if (mappings.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p className="text-sm">No {title.toLowerCase()} configured yet.</p>
        <p className="text-xs mt-1">Connect a channel and set up mappings to sync inventory.</p>
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground mb-3">{title}</h3>
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Channel</TableHead>
              <TableHead>Internal Name</TableHead>
              <TableHead>External ID</TableHead>
              <TableHead>External Name</TableHead>
              <TableHead className="w-12">Status</TableHead>
              {!readOnly && <TableHead className="w-12" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {mappings.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="text-xs">{getChannelLabel(row.channel_name)}</TableCell>
                <TableCell className="font-medium text-sm">{row.internal_name}</TableCell>
                <TableCell>
                  {editingId === row.id ? (
                    <Input
                      value={editValues.externalId}
                      onChange={(e) => setEditValues((v) => ({ ...v, externalId: e.target.value }))}
                      className="h-7 text-xs"
                    />
                  ) : (
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{row.external_id}</code>
                  )}
                </TableCell>
                <TableCell>
                  {editingId === row.id ? (
                    <Input
                      value={editValues.externalName}
                      onChange={(e) => setEditValues((v) => ({ ...v, externalName: e.target.value }))}
                      className="h-7 text-xs"
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground">{row.external_name || "—"}</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={row.is_active ? "default" : "secondary"} className="text-[10px]">
                    {row.is_active ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                {!readOnly && (
                  <TableCell>
                    {editingId === row.id ? (
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => saveEdit(row.id)}>
                          <Check className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditingId(null)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => startEdit(row)}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
