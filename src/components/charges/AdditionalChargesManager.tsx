import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { 
  Plus, 
  MoreHorizontal, 
  Pencil, 
  Trash2, 
  Copy, 
  Eye, 
  EyeOff,
  RefreshCw,
  GripVertical
} from "lucide-react";
import { usePropertyCharges } from "@/hooks/usePropertyCharges";
import { usePropertyRoomTypes } from "@/hooks/usePropertyRoomTypes";
import { ChargeEditor } from "./ChargeEditor";
import { ChargePreview } from "./ChargePreview";
import { CopyChargesModal } from "./CopyChargesModal";
import { 
  getCategoryLabel, 
  getCalculationMethodLabel,
  getRevenueStreamLabel,
  normalizeRevenueStream,
  type PropertyCharge,
  type ChargeCategory 
} from "./ChargeCalculator";
import { FormattedPrice } from "@/components/FormattedPrice";

interface AdditionalChargesManagerProps {
  propertyId: string;
  pmsSystem?: string | null;
  ownerEmail?: string | null;
}

const CATEGORY_COLORS: Record<ChargeCategory, string> = {
  tax: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  fee: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  deposit: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  surcharge: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  custom: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
};

export function AdditionalChargesManager({
  propertyId,
  pmsSystem,
  ownerEmail,
}: AdditionalChargesManagerProps) {
  const {
    charges,
    presets,
    isLoading,
    createCharge,
    updateCharge,
    deleteCharge,
    toggleChargeActive,
  } = usePropertyCharges(propertyId);

  const { data: roomTypes = [] } = usePropertyRoomTypes(propertyId);

  // Build a map of room IDs to names for display
  const roomNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    roomTypes.forEach(rt => { map[rt.id] = rt.name; });
    return map;
  }, [roomTypes]);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingCharge, setEditingCharge] = useState<PropertyCharge | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [chargeToDelete, setChargeToDelete] = useState<PropertyCharge | null>(null);
  const [showPreview, setShowPreview] = useState(true);
  const [copyModalOpen, setCopyModalOpen] = useState(false);

  const handleAddCharge = () => {
    setEditingCharge(null);
    setEditorOpen(true);
  };

  const handleEditCharge = (charge: PropertyCharge) => {
    setEditingCharge(charge);
    setEditorOpen(true);
  };

  const handleDeleteClick = (charge: PropertyCharge) => {
    setChargeToDelete(charge);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = () => {
    if (chargeToDelete) {
      deleteCharge.mutate(chargeToDelete.id);
    }
    setDeleteConfirmOpen(false);
    setChargeToDelete(null);
  };

  const handleSaveCharge = (chargeData: Omit<PropertyCharge, 'id' | 'created_at' | 'updated_at'>) => {
    if (editingCharge) {
      updateCharge.mutate({ id: editingCharge.id, ...chargeData });
    } else {
      createCharge.mutate(chargeData);
    }
    setEditorOpen(false);
    setEditingCharge(null);
  };

  const handleToggleActive = (charge: PropertyCharge) => {
    toggleChargeActive.mutate({ id: charge.id, is_active: !charge.is_active });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button onClick={handleAddCharge} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Charge
          </Button>
          {ownerEmail && charges.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => setCopyModalOpen(true)}>
              <Copy className="h-4 w-4 mr-2" />
              Copy to Other Properties
            </Button>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowPreview(!showPreview)}
        >
          {showPreview ? (
            <>
              <EyeOff className="h-4 w-4 mr-2" />
              Hide Preview
            </>
          ) : (
            <>
              <Eye className="h-4 w-4 mr-2" />
              Show Preview
            </>
          )}
        </Button>
      </div>

      <div className={`grid gap-6 ${showPreview ? 'lg:grid-cols-[1fr_320px]' : ''}`}>
        {/* Charges Table */}
        <div className="border rounded-lg overflow-hidden">
          {charges.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-muted-foreground mb-4">
                No charges configured yet. Add taxes, fees, or deposits that apply to bookings.
              </p>
              <Button onClick={handleAddCharge} variant="outline">
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Charge
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Calculation</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-16 text-center">Active</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {charges.map((charge) => (
                  <TableRow key={charge.id} className={!charge.is_active ? 'opacity-50' : ''}>
                    <TableCell>
                      <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{charge.name}</div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {charge.is_refundable && (
                          <Badge variant="outline" className="text-[10px] bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30">
                            Refundable
                          </Badge>
                        )}
                        {charge.applies_to_all_rooms ? (
                          <Badge variant="outline" className="text-[10px]">
                            All Rooms
                          </Badge>
                        ) : (() => {
                          const roomIds = charge.room_type_ids || [];
                          const names = roomIds.map(id => roomNameMap[id]).filter(Boolean);
                          const maxShow = 2;
                          const shown = names.slice(0, maxShow);
                          const remaining = names.length - maxShow;
                          return (
                            <>
                              {shown.map((name, i) => (
                                <Badge key={i} variant="outline" className="text-[10px]">
                                  {name}
                                </Badge>
                              ))}
                              {remaining > 0 && (
                                <Badge variant="outline" className="text-[10px] text-muted-foreground" title={names.slice(maxShow).join(', ')}>
                                  +{remaining} more
                                </Badge>
                              )}
                              {names.length === 0 && roomIds.length > 0 && (
                                <Badge variant="outline" className="text-[10px] text-destructive border-destructive/30">
                                  {roomIds.length} unresolved
                                </Badge>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        <Badge className={CATEGORY_COLORS[charge.category]}>
                          {getCategoryLabel(charge.category)}
                        </Badge>
                        {normalizeRevenueStream(charge.revenue_stream) !== 'accommodation' && (
                          <Badge variant="outline" className="text-[10px]">
                            {getRevenueStreamLabel(charge.revenue_stream)}
                          </Badge>
                        )}
                        {charge.is_included_in_rate && (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground" title="Already inside the rate — not added on top of the guest total">
                            In rate
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {getCalculationMethodLabel(charge.calculation_method)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {charge.calculation_method === 'percentage_of_accommodation' ? (
                        `${charge.amount}%`
                      ) : (
                        <FormattedPrice amount={charge.amount} />
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={charge.is_active}
                        onCheckedChange={() => handleToggleActive(charge)}
                      />
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEditCharge(charge)}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            className="text-destructive"
                            onClick={() => handleDeleteClick(charge)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Preview Panel */}
        {showPreview && (
          <ChargePreview charges={charges} roomTypes={roomTypes ?? []} />
        )}
      </div>

      {/* Charge Editor Sheet */}
      <ChargeEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        charge={editingCharge}
        presets={presets}
        propertyId={propertyId}
        onSave={handleSaveCharge}
        isSaving={createCharge.isPending || updateCharge.isPending}
      />

      {/* Copy Modal */}
      {ownerEmail && (
        <CopyChargesModal
          open={copyModalOpen}
          onOpenChange={setCopyModalOpen}
          sourcePropertyId={propertyId}
          sourceCharges={charges}
          ownerEmail={ownerEmail}
        />
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Charge</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{chargeToDelete?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
