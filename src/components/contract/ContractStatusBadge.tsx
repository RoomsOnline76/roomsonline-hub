import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Check, Clock, AlertTriangle, XCircle, Shield } from "lucide-react";
import { format } from "date-fns";

export type ContractStatus = 'draft' | 'sent' | 'viewed' | 'signed' | 'declined' | 'overridden' | 'revoked' | null;

interface ContractStatusBadgeProps {
  status: ContractStatus;
  signedAt?: string | null;
  sentAt?: string | null;
  overrideReason?: string | null;
  overrideAt?: string | null;
  compact?: boolean;
}

export function ContractStatusBadge({
  status,
  signedAt,
  sentAt,
  overrideReason,
  overrideAt,
  compact = false,
}: ContractStatusBadgeProps) {
  if (!status) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="gap-1 text-destructive border-destructive">
            <XCircle className="h-3 w-3" />
            {!compact && "No Contract"}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>No contract has been sent yet</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  switch (status) {
    case "signed":
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge className="gap-1 bg-green-100 text-green-800 hover:bg-green-100 border-green-200">
              <Check className="h-3 w-3" />
              {!compact && "Signed"}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>Contract signed {signedAt ? format(new Date(signedAt), "dd MMM yyyy") : ""}</p>
          </TooltipContent>
        </Tooltip>
      );

    case "sent":
    case "viewed":
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge className="gap-1 bg-blue-100 text-blue-800 hover:bg-blue-100 border-blue-200">
              <Clock className="h-3 w-3" />
              {!compact && (status === "viewed" ? "Viewed" : "Sent")}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>
              {status === "viewed" ? "Contract viewed, awaiting signature" : ""}
              {status === "sent" && sentAt ? `Sent ${format(new Date(sentAt), "dd MMM yyyy")}` : ""}
            </p>
          </TooltipContent>
        </Tooltip>
      );

    case "overridden":
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge className="gap-1 bg-orange-100 text-orange-800 hover:bg-orange-100 border-orange-200">
              <Shield className="h-3 w-3" />
              {!compact && "Override"}
            </Badge>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p className="font-semibold">Admin Override</p>
            {overrideAt && <p className="text-xs">{format(new Date(overrideAt), "dd MMM yyyy")}</p>}
            {overrideReason && <p className="text-xs mt-1">{overrideReason}</p>}
          </TooltipContent>
        </Tooltip>
      );

    case "declined":
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="destructive" className="gap-1">
              <XCircle className="h-3 w-3" />
              {!compact && "Declined"}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>Contract was declined</p>
          </TooltipContent>
        </Tooltip>
      );

    case "revoked":
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="destructive" className="gap-1">
              <XCircle className="h-3 w-3" />
              {!compact && "Revoked"}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>Contract was revoked — a new contract can be sent</p>
          </TooltipContent>
        </Tooltip>
      );

    case "draft":
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className="gap-1 text-muted-foreground">
              <AlertTriangle className="h-3 w-3" />
              {!compact && "Draft"}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>Contract not yet sent</p>
          </TooltipContent>
        </Tooltip>
      );

    default:
      return null;
  }
}
